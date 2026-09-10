import { AlphaTabApi, PlayerMode, Settings, StaveProfile } from '@coderline/alphatab';
import { model, synth } from '@coderline/alphatab';
import { playCountIn } from './countIn';
import { extractBarMarkers, extractNotes, type BarMarker, type NoteEvent } from './notes';
import { applyFingeringHeuristic } from './fingering';
import { applyOverrides, loadOverrides, overrideKey, setOverride } from './overrides';
import { slugify } from './slug';
import * as clock from './clock';

export interface EngineState {
  ready: boolean;
  isPlaying: boolean;
  countingIn: boolean;
  audioBlocked: boolean;
  currentTimeSec: number;
  durationSec: number;
  currentBar: number;
  totalBars: number;
  speed: number;
  tabOnly: boolean;
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  guitarOn: boolean;
  hasNoGuitarTrack: boolean;
  trackNames: string[];
  trackIndex: number;
  noteEvents: NoteEvent[];
  barMarkers: BarMarker[];
}

const CROSSFADE_MS = 80;

let api: AlphaTabApi | null = null;
let mainAudio: HTMLAudioElement | null = null;
let noGuitarAudio: HTMLAudioElement | null = null;
let mainObjectUrl: string | null = null;
let noGuitarObjectUrl: string | null = null;
let positionLoopId = 0;
let score: model.Score | null = null;
let ticksPerQuarter = 960;

let countInToken = 0;

const state: EngineState = {
  ready: false,
  isPlaying: false,
  countingIn: false,
  audioBlocked: false,
  currentTimeSec: 0,
  durationSec: 0,
  currentBar: 1,
  totalBars: 1,
  speed: 100,
  tabOnly: false,
  loopEnabled: false,
  loopStartBar: 1,
  loopEndBar: 1,
  guitarOn: true,
  hasNoGuitarTrack: false,
  trackNames: [],
  trackIndex: 0,
  noteEvents: [],
  barMarkers: [],
};

const listeners = new Set<(state: Readonly<EngineState>) => void>();

function notify(): void {
  for (const listener of listeners) listener(state);
}

export function onStateChange(listener: (state: Readonly<EngineState>) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

const container = document.querySelector<HTMLDivElement>('#alphatab')!;

function makeExternalMediaHandler(el: HTMLAudioElement): synth.IExternalMediaHandler {
  return {
    get backingTrackDuration(): number {
      return Number.isFinite(el.duration) ? el.duration * 1000 : 0;
    },
    get playbackRate(): number {
      return el.playbackRate;
    },
    set playbackRate(value: number) {
      el.playbackRate = value;
      if (noGuitarAudio) noGuitarAudio.playbackRate = value;
    },
    get masterVolume(): number {
      return el.volume;
    },
    set masterVolume(_value: number) {
      // Volume is owned by the guitar on/off crossfade, not alphaTab.
    },
    seekTo(time: number): void {
      el.currentTime = time / 1000;
      if (noGuitarAudio) noGuitarAudio.currentTime = time / 1000;
    },
    play(): void {
      // Safari (and iOS especially) refuses playback that didn't come from a
      // user gesture. Surface that so an autoplay link can show a "tap to
      // start" overlay instead of silently doing nothing (build plan §9).
      el.play().then(
        () => {
          if (state.audioBlocked) {
            state.audioBlocked = false;
            notify();
          }
        },
        () => {
          state.audioBlocked = true;
          notify();
        },
      );
      if (noGuitarAudio) void noGuitarAudio.play();
    },
    pause(): void {
      el.pause();
      if (noGuitarAudio) noGuitarAudio.pause();
    },
  };
}

function stopPositionLoop(): void {
  if (positionLoopId) {
    clearInterval(positionLoopId);
    positionLoopId = 0;
  }
}

function findBarAtTick(tick: number): number {
  if (!score) return 1;
  const bars = score.masterBars;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (tick >= bars[i].start) return i + 1;
  }
  return 1;
}

function barToTick(barNumber: number): number {
  if (!score) return 0;
  const index = Math.min(Math.max(barNumber - 1, 0), score.masterBars.length - 1);
  return score.masterBars[index].start;
}

function tempoAtBar(barNumber: number): number {
  if (!score) return 120;
  let tempo = score.tempo;
  const lastIndex = Math.min(Math.max(barNumber - 1, 0), score.masterBars.length - 1);
  for (let i = 0; i <= lastIndex; i++) {
    for (const automation of score.masterBars[i].tempoAutomations) {
      if (automation.type === model.AutomationType.Tempo) tempo = automation.value;
    }
  }
  return tempo;
}

function computeTicksPerQuarter(loadedScore: model.Score): number {
  const bars = loadedScore.masterBars;
  if (bars.length < 2) return 960;
  const durationTicks = bars[1].start - bars[0].start;
  const quarters = bars[0].timeSignatureNumerator * (4 / bars[0].timeSignatureDenominator);
  return quarters > 0 ? durationTicks / quarters : 960;
}

function updateFromPlayback(): void {
  if (!api || !mainAudio) return;
  const tick = api.player?.tickPosition ?? 0;
  state.currentTimeSec = mainAudio.currentTime;
  if (Number.isFinite(mainAudio.duration)) state.durationSec = mainAudio.duration;
  state.currentBar = findBarAtTick(tick);
  const ticksPerSecond = (tempoAtBar(state.currentBar) / 60) * ticksPerQuarter;
  clock.recordSample(mainAudio.currentTime, tick, ticksPerSecond);
  notify();
}

export function getExtrapolatedTick(): number {
  return clock.getExtrapolatedTick(mainAudio?.currentTime ?? 0);
}

export function getTicksPerQuarter(): number {
  return ticksPerQuarter;
}

function applyGuitarVolumes(guitarOn: boolean, immediate: boolean): void {
  if (!mainAudio || !noGuitarAudio) return;
  const mainTarget = guitarOn ? 1 : 0;
  const noGuitarTarget = guitarOn ? 0 : 1;
  if (immediate) {
    mainAudio.volume = mainTarget;
    noGuitarAudio.volume = noGuitarTarget;
    return;
  }
  const steps = 8;
  const stepMs = CROSSFADE_MS / steps;
  const mainStart = mainAudio.volume;
  const noGuitarStart = noGuitarAudio.volume;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const t = step / steps;
    if (mainAudio) mainAudio.volume = mainStart + (mainTarget - mainStart) * t;
    if (noGuitarAudio) noGuitarAudio.volume = noGuitarStart + (noGuitarTarget - noGuitarStart) * t;
    if (step >= steps) clearInterval(timer);
  }, stepMs);
}

function loadNotesForTrack(loadedScore: model.Score, index: number): void {
  const track = loadedScore.tracks[index];
  const events = extractNotes(track);
  applyFingeringHeuristic(events);
  applyOverrides(events, loadOverrides(getSongSlug()));
  state.noteEvents = events;
}

export function getSongSlug(): string {
  return score?.title ? slugify(score.title) : '';
}

/**
 * Cycles one note's finger and remembers the correction for this song, so
 * Matthew can fix a wrong guess without opening Guitar Pro (build plan 5.4).
 */
export function cycleFingerOverride(event: NoteEvent): void {
  const next = ((event.finger + 1) % 5) as 0 | 1 | 2 | 3 | 4;
  const slug = getSongSlug();
  if (!slug) return;
  setOverride(slug, overrideKey(event), next);
  event.finger = next;
  event.fingerSource = 'override';
  notify();
}

function populateTrackSelect(loadedScore: model.Score): void {
  state.trackNames = loadedScore.tracks.map((track, index) => track.name || `Track ${index + 1}`);
  state.trackIndex = 0;
  ticksPerQuarter = computeTicksPerQuarter(loadedScore);
  state.barMarkers = extractBarMarkers(loadedScore);
  loadNotesForTrack(loadedScore, 0);
  notify();
}

export async function openScore(buffer: ArrayBuffer): Promise<void> {
  stopPositionLoop();
  api?.destroy();
  mainAudio?.pause();
  noGuitarAudio?.pause();
  noGuitarAudio = null;
  if (mainObjectUrl) URL.revokeObjectURL(mainObjectUrl);
  if (noGuitarObjectUrl) URL.revokeObjectURL(noGuitarObjectUrl);
  mainObjectUrl = null;
  noGuitarObjectUrl = null;

  countInToken++;
  Object.assign(state, {
    ready: false,
    isPlaying: false,
    countingIn: false,
    audioBlocked: false,
    currentTimeSec: 0,
    durationSec: 0,
    currentBar: 1,
    totalBars: 1,
    loopEnabled: false,
    loopStartBar: 1,
    loopEndBar: 1,
    guitarOn: true,
    hasNoGuitarTrack: false,
    noteEvents: [],
    barMarkers: [],
  });
  clock.reset();
  notify();

  const settings = new Settings();
  settings.player.playerMode = PlayerMode.EnabledExternalMedia;
  settings.player.scrollElement = container;
  settings.display.staveProfile = state.tabOnly ? StaveProfile.Tab : StaveProfile.ScoreTab;

  api = new AlphaTabApi(container, settings);
  mainAudio = new Audio();
  mainAudio.preload = 'auto';
  setPreservesPitch(mainAudio, true);
  const handler = makeExternalMediaHandler(mainAudio);

  api.playerStateChanged.on((e) => {
    state.isPlaying = e.state === synth.PlayerState.Playing;
    notify();
  });

  await new Promise<void>((resolve, reject) => {
    api!.scoreLoaded.on((loadedScore) => {
      score = loadedScore;
      const backingTrack = loadedScore.backingTrack;
      if (!backingTrack?.rawAudioFile) {
        reject(new Error('This file has no audio — drop an MP3 to add one.'));
        return;
      }
      const blob = new Blob([backingTrack.rawAudioFile as BlobPart], { type: 'audio/mpeg' });
      mainObjectUrl = URL.createObjectURL(blob);
      mainAudio!.src = mainObjectUrl;
      populateTrackSelect(loadedScore);
      state.totalBars = loadedScore.masterBars.length;
      state.loopEndBar = state.totalBars;
      notify();
    });

    api!.playerReady.on(() => {
      const output = api!.player!.output as unknown as synth.IExternalMediaSynthOutput;
      output.handler = handler;
      api!.playbackSpeed = state.speed / 100;

      // Build plan 5.3 suggests ~50ms; tightened to 20ms so alphaTab notices
      // a loop boundary sooner. The seek itself still has to re-decode the
      // compressed audio from the new position, which is the main source of
      // the small gap on loop-back — this only trims the detection delay on
      // top of that, not the decode itself.
      positionLoopId = window.setInterval(() => {
        output.updatePosition(mainAudio!.currentTime * 1000);
        updateFromPlayback();
      }, 20);

      state.ready = true;
      state.durationSec = mainAudio!.duration || 0;
      notify();
      resolve();
    });

    const accepted = api!.load(buffer);
    if (!accepted) {
      reject(new Error('alphaTab could not read this file.'));
    }
  });
}

function setPreservesPitch(el: HTMLAudioElement, value: boolean): void {
  const anyEl = el as unknown as Record<string, boolean>;
  anyEl.preservesPitch = value;
  anyEl.mozPreservesPitch = value;
  anyEl.webkitPreservesPitch = value;
}

export function getScoreMeta(): { title: string; artist: string } {
  return { title: score?.title ?? '', artist: score?.artist ?? '' };
}

export function getCurrentTempo(): number {
  return tempoAtBar(state.currentBar);
}

const INK = new model.Color(46, 42, 40);
const INK_SOFT = new model.Color(106, 98, 92);
const INK_ON_DARK = new model.Color(251, 248, 243);
const LINE_ON_DARK = new model.Color(140, 134, 126);

/**
 * The score view goes onto the dark stage in presentation mode (build plan
 * 5.5), but alphaTab draws its notation in near-black ink — so without
 * recolouring it, presentation mode rendered black-on-black.
 */
export function setPresentationMode(on: boolean): void {
  if (!api) return;
  const resources = api.settings.display.resources;
  resources.mainGlyphColor = on ? INK_ON_DARK : INK;
  resources.secondaryGlyphColor = on ? LINE_ON_DARK : INK_SOFT;
  resources.staffLineColor = on ? LINE_ON_DARK : INK_SOFT;
  resources.barSeparatorColor = on ? LINE_ON_DARK : INK_SOFT;
  resources.barNumberColor = on ? INK_ON_DARK : INK_SOFT;
  resources.scoreInfoColor = on ? INK_ON_DARK : INK;
  api.updateSettings();
  api.render();
}

export async function togglePlay(): Promise<void> {
  if (!api) return;

  // A second click during the count-in used to start another one, and the
  // two would toggle playback against each other — which read as the
  // button simply not working. Clicking during a count-in now cancels it.
  if (state.countingIn) {
    countInToken++;
    state.countingIn = false;
    notify();
    return;
  }

  if (state.isPlaying) {
    api.playPause();
    return;
  }

  const bar = findBarAtTick(api.player?.tickPosition ?? 0);
  const masterBar = score?.masterBars[bar - 1];
  if (masterBar) {
    const token = ++countInToken;
    state.countingIn = true;
    notify();
    await playCountIn(masterBar.timeSignatureNumerator, tempoAtBar(bar));
    if (token !== countInToken) return;
    state.countingIn = false;
    notify();
  }
  api.playPause();
}

export function seekToBar(bar: number): void {
  if (!api || !score) return;
  const clamped = Math.min(Math.max(bar, 1), score.masterBars.length);
  api.tickPosition = barToTick(clamped);
  updateFromPlayback();
}

export function nudgeBar(delta: number): void {
  seekToBar(state.currentBar + delta);
}

export function seekToSeconds(seconds: number): void {
  if (!api) return;
  api.timePosition = seconds * 1000;
  updateFromPlayback();
}

export function setSpeed(percent: number): void {
  state.speed = percent;
  if (api) api.playbackSpeed = percent / 100;
  notify();
}

export function setLoop(startBar: number, endBar: number, enabled: boolean): void {
  if (!api || !score) return;
  const start = Math.min(startBar, endBar);
  const end = Math.max(startBar, endBar);
  state.loopStartBar = start;
  state.loopEndBar = end;
  state.loopEnabled = enabled;
  if (enabled) {
    const startTick = barToTick(start);
    const endTick = end >= score.masterBars.length ? Number.MAX_SAFE_INTEGER : barToTick(end + 1);
    api.playbackRange = { startTick, endTick };
    api.isLooping = true;
  } else {
    api.playbackRange = null;
    api.isLooping = false;
  }
  notify();
}

export function setTabOnly(tabOnly: boolean): void {
  if (!api) return;
  state.tabOnly = tabOnly;
  api.settings.display.staveProfile = tabOnly ? StaveProfile.Tab : StaveProfile.ScoreTab;
  api.updateSettings();
  api.render();
  notify();
}

export function setTrackIndex(index: number): void {
  if (!api?.score) return;
  state.trackIndex = index;
  api.renderTracks([api.score.tracks[index]]);
  loadNotesForTrack(api.score, index);
  notify();
}

export function setGuitarOn(on: boolean): void {
  if (!state.hasNoGuitarTrack) return;
  state.guitarOn = on;
  applyGuitarVolumes(on, false);
  notify();
}

export function hasMainAudio(): boolean {
  return !!mainAudio?.src;
}

export async function setNoGuitarTrack(file: File): Promise<void> {
  if (!mainAudio) return;
  if (noGuitarObjectUrl) URL.revokeObjectURL(noGuitarObjectUrl);
  noGuitarObjectUrl = URL.createObjectURL(file);
  if (!noGuitarAudio) {
    noGuitarAudio = new Audio();
    noGuitarAudio.preload = 'auto';
    setPreservesPitch(noGuitarAudio, true);
    noGuitarAudio.playbackRate = mainAudio.playbackRate;
  }
  noGuitarAudio.src = noGuitarObjectUrl;
  noGuitarAudio.currentTime = mainAudio.currentTime;
  if (!mainAudio.paused) void noGuitarAudio.play();
  state.hasNoGuitarTrack = true;
  state.guitarOn = true;
  applyGuitarVolumes(true, true);
  notify();
}

export async function replaceMainAudio(file: File): Promise<void> {
  if (!mainAudio || !api) return;
  if (mainObjectUrl) URL.revokeObjectURL(mainObjectUrl);
  mainObjectUrl = URL.createObjectURL(file);
  const wasPlaying = !mainAudio.paused;
  mainAudio.pause();
  mainAudio.src = mainObjectUrl;
  await new Promise((resolve) => {
    mainAudio!.addEventListener('loadedmetadata', resolve, { once: true });
  });
  state.durationSec = mainAudio.duration || 0;
  if (wasPlaying) void mainAudio.play();
  notify();
}
