import { AlphaTabApi, PlayerMode, Settings, StaveProfile } from '@coderline/alphatab';
import { model, synth } from '@coderline/alphatab';
import { playCountIn } from './countIn';

export interface EngineState {
  ready: boolean;
  isPlaying: boolean;
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
}

const CROSSFADE_MS = 80;

let api: AlphaTabApi | null = null;
let mainAudio: HTMLAudioElement | null = null;
let noGuitarAudio: HTMLAudioElement | null = null;
let mainObjectUrl: string | null = null;
let noGuitarObjectUrl: string | null = null;
let positionLoopId = 0;
let score: model.Score | null = null;

const state: EngineState = {
  ready: false,
  isPlaying: false,
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
      void el.play();
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

function updateFromPlayback(): void {
  if (!api || !mainAudio) return;
  state.currentTimeSec = mainAudio.currentTime;
  if (Number.isFinite(mainAudio.duration)) state.durationSec = mainAudio.duration;
  state.currentBar = findBarAtTick(api.player?.tickPosition ?? 0);
  notify();
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

function populateTrackSelect(loadedScore: model.Score): void {
  state.trackNames = loadedScore.tracks.map((track, index) => track.name || `Track ${index + 1}`);
  state.trackIndex = 0;
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

  Object.assign(state, {
    ready: false,
    isPlaying: false,
    currentTimeSec: 0,
    durationSec: 0,
    currentBar: 1,
    totalBars: 1,
    loopEnabled: false,
    loopStartBar: 1,
    loopEndBar: 1,
    guitarOn: true,
    hasNoGuitarTrack: false,
  });
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

      positionLoopId = window.setInterval(() => {
        output.updatePosition(mainAudio!.currentTime * 1000);
        updateFromPlayback();
      }, 50);

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

export async function togglePlay(): Promise<void> {
  if (!api) return;
  if (state.isPlaying) {
    api.playPause();
    return;
  }
  const bar = findBarAtTick(api.player?.tickPosition ?? 0);
  const masterBar = score?.masterBars[bar - 1];
  if (masterBar) {
    await playCountIn(masterBar.timeSignatureNumerator, tempoAtBar(bar));
  }
  api.playPause();
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
