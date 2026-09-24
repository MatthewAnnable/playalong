import { AlphaTabApi, LayoutMode, PlayerMode, ScrollMode, Settings, StaveProfile } from '@coderline/alphatab';
import { model, synth } from '@coderline/alphatab';
import { playCountIn } from './countIn';
import { extractBarMarkers, extractNotes, trackNamesChords, type BarMarker, type NoteEvent } from './notes';
import { applyFingeringHeuristic } from './fingering';
import { applyOverrides, loadOverrides, overrideKey, setOverride } from './overrides';
import { slugify } from './slug';
import { buildTimeline, playedIndexAtTick, type PlayedBar } from './timeline';
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
  /** True when the file names chords, which is what decides the chord-pill default. */
  hasChordNames: boolean;
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
/**
 * The bars in the order they are played, repeats unrolled. Player ticks count
 * along this, not along the written bars — see timeline.ts.
 */
let timeline: PlayedBar[] = [];
let ticksPerQuarter = 960;
let mediaOutput: synth.IExternalMediaSynthOutput | null = null;
let horizontalScore = false;
let presentationOn = false;
let scoreViewVisible = true;

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
  hasChordNames: false,
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

/**
 * alphaTab skips a render outright when its container has no width, and never
 * tries again on its own. A hosted-library song is laid out while the player
 * is still hidden (it waits for the no-guitar track before revealing it), so
 * the score view came up empty in both normal and presentation mode. Render
 * again the moment the container goes from no width to some.
 */
let containerWidth = 0;
new ResizeObserver(() => {
  const width = container.clientWidth;
  if (api && containerWidth === 0 && width > 0) api.render();
  containerWidth = width;
}).observe(container);

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
        (err: DOMException) => {
          // Only a real autoplay refusal deserves the overlay. A play() that
          // was interrupted by a pause or a seek rejects with AbortError,
          // and throwing "your browser blocked playback" over the whole
          // screen for that is worse than the hiccup it is reporting.
          if (err?.name === 'NotAllowedError') {
            state.audioBlocked = true;
            notify();
          }
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
  if (timeline.length === 0) return 1;
  return timeline[playedIndexAtTick(timeline, tick)].barNumber;
}

/**
 * Where to go for a written bar number. Inside a repeat a bar is played more
 * than once; `nearTick` asks for the latest pass at or before that tick (so a
 * loop restarts on the pass it just played), otherwise it is the first pass.
 */
function barToTick(barNumber: number, nearTick?: number): number {
  let first: PlayedBar | undefined;
  let latest: PlayedBar | undefined;
  for (const played of timeline) {
    if (played.barNumber !== barNumber) continue;
    first ??= played;
    if (nearTick !== undefined && played.start <= nearTick) latest = played;
  }
  return (latest ?? first)?.start ?? 0;
}

function tempoAtTick(tick: number): number {
  if (!score) return 120;
  let tempo = score.tempo;
  const lastIndex = playedIndexAtTick(timeline, tick);
  for (let i = 0; i <= lastIndex && i < timeline.length; i++) {
    for (const change of timeline[i].tempoChanges) {
      if (change.tick <= tick) tempo = change.tempo;
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
  const ticksPerSecond = (tempoAtTick(tick) / 60) * ticksPerQuarter;
  clock.recordSample(mainAudio.currentTime, tick, ticksPerSecond);
  // alphaTab's own looping (api.isLooping) just snaps the audio back with no
  // run-up — see restartLoopWithCountIn — so looping is driven from here
  // instead: the moment playback crosses past the loop's last bar, restart it
  // with a count-in. state.countingIn is the re-entrancy guard: it's set
  // synchronously as the first step of the restart, before anything async, so
  // the next 20ms tick of this same loop sees it and skips.
  if (state.loopEnabled && state.isPlaying && !state.countingIn && state.currentBar > state.loopEndBar) {
    void restartLoopWithCountIn();
  }
  notify();
}

export function getExtrapolatedTick(): number {
  return clock.getExtrapolatedTick(mainAudio?.currentTime ?? 0);
}

export function getTicksPerQuarter(): number {
  return ticksPerQuarter;
}

/** Snapshot the follower page needs to reconstruct our position. */
export function getPositionSnapshot(): {
  tick: number;
  ticksPerSecond: number;
  playbackRate: number;
  isPlaying: boolean;
  audioSeconds: number;
} {
  const tick = api?.player?.tickPosition ?? 0;
  return {
    audioSeconds: mainAudio?.currentTime ?? 0,
    tick,
    ticksPerSecond: (tempoAtTick(tick) / 60) * ticksPerQuarter,
    playbackRate: mainAudio?.playbackRate ?? 1,
    isPlaying: state.isPlaying,
  };
}

/**
 * The OBS browser source loads the same song but stays silent — audio comes
 * from the remote tab so it runs through Matthew's normal routing.
 */
/**
 * Follower-side playback for when the OBS source is the audio master: match
 * the remote's play state and nudge back into line if we drift.
 */
export function setFollowerPlayback(isPlaying: boolean, audioSeconds: number): void {
  if (!mainAudio) return;
  if (Math.abs(mainAudio.currentTime - audioSeconds) > 0.15) {
    mainAudio.currentTime = audioSeconds;
    if (noGuitarAudio) noGuitarAudio.currentTime = audioSeconds;
  }
  if (isPlaying && mainAudio.paused) {
    void mainAudio.play();
    if (noGuitarAudio) void noGuitarAudio.play();
  } else if (!isPlaying && !mainAudio.paused) {
    mainAudio.pause();
    if (noGuitarAudio) noGuitarAudio.pause();
  }
}

/**
 * In OBS mode the local engine never plays — position comes from the remote
 * tab — so its polling loop is pure overhead and would fight the remote for
 * ownership of the on-screen bar counter.
 */
export function stopLocalPositionLoop(): void {
  stopPositionLoop();
}

export function setMuted(muted: boolean): void {
  if (mainAudio) mainAudio.muted = muted;
  if (noGuitarAudio) noGuitarAudio.muted = muted;
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
  const events = extractNotes(track, timeline);
  applyFingeringHeuristic(events);
  applyOverrides(events, loadOverrides(getSongSlug()));
  state.hasChordNames = trackNamesChords(track);
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
  timeline = buildTimeline(loadedScore);
  state.barMarkers = extractBarMarkers(timeline);
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
    hasChordNames: false,
    noteEvents: [],
    barMarkers: [],
  });
  clock.reset();
  notify();

  const settings = new Settings();
  settings.player.playerMode = PlayerMode.EnabledExternalMedia;
  settings.player.scrollElement = container;
  // alphaTab looks for its music font next to its own script, which a build
  // puts under assets/ — but the font is served from public/font/. Under a
  // subpath (GitHub Pages at /playalong/) that 404'd and alphaTab refused to
  // draw the score at all, so point it at the font directly.
  settings.core.fontDirectory = `${import.meta.env.BASE_URL}font/`;
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
      mediaOutput = output;
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
  return tempoAtTick(api?.player?.tickPosition ?? 0);
}

/** Height the transport dock and the stage's own padding take out of the window. */
const HORIZONTAL_CHROME_HEIGHT = 210;
const HORIZONTAL_SYSTEM_HEIGHT = 400;
const HORIZONTAL_SCALE_MAX = 1.7;

function horizontalScale(): number {
  const available = window.innerHeight - HORIZONTAL_CHROME_HEIGHT;
  return Math.min(Math.max(available / HORIZONTAL_SYSTEM_HEIGHT, 1), HORIZONTAL_SCALE_MAX);
}
/** Where the played bar sits across the stage, left to right. */
const HORIZONTAL_READING_POINT = 0.25;

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
  presentationOn = on;
  applyScoreLayout(wantsHorizontal());
  api.updateSettings();
  api.render();
}

function wantsHorizontal(): boolean {
  return presentationOn && scoreViewVisible;
}

/**
 * The horizontal line is expensive to lay out (it renders the whole score at
 * once), so it is only built when the score is the view on screen — switching
 * to the highway drops back to the page layout.
 */
export function setScoreViewVisible(visible: boolean): void {
  if (scoreViewVisible === visible) return;
  scoreViewVisible = visible;
  if (!api || horizontalScore === wantsHorizontal()) return;
  applyScoreLayout(wantsHorizontal());
  api.updateSettings();
  api.render();
}

/**
 * Guitar Pro calls this "Screen — horizontal": the whole score on one endless
 * line that travels past a fixed reading point, instead of an A4 page you have
 * to scroll down by hand. It is what presentation mode is for — a strip along
 * the bottom of the screen in a lesson — so presentation mode turns it on and
 * leaving presentation mode puts the page layout back.
 */
function applyScoreLayout(horizontal: boolean): void {
  if (!api) return;
  horizontalScore = horizontal;
  const display = api.settings.display;
  const player = api.settings.player;
  display.layoutMode = horizontal ? LayoutMode.Horizontal : LayoutMode.Page;
  // One line of music has the whole screen to itself, so it can be drawn much
  // larger — big enough to read across a room on a Zoom share, but scaled back
  // on a short window so the tab staff doesn't fall off the bottom.
  display.scale = horizontal ? horizontalScale() : 1;
  // Smooth keeps the line moving with the music rather than jumping a bar at a
  // time. The reading point sits at HORIZONTAL_READING_POINT across the stage —
  // far enough in that the bars just played stay on screen to talk about, while
  // most of the width is still look-ahead.
  player.scrollMode = horizontal ? ScrollMode.Smooth : ScrollMode.OffScreen;
  player.scrollOffsetX = horizontal ? -Math.round(container.clientWidth * HORIZONTAL_READING_POINT) : 0;
  player.nativeBrowserSmoothScroll = !horizontal;
  // alphaTab only renders the partials it believes are on screen. The
  // horizontal strip is scrolled by script inside a clipped container, which
  // that check cannot see, so the line past the first screen came out blank.
  api.settings.core.enableLazyLoading = !horizontal;
  container.classList.toggle('is-horizontal', horizontal);
}

/**
 * The reading point and scale are computed from the container's own pixel
 * size at the moment layout is applied — they don't track a later resize on
 * their own. Without this, resizing the window (or an OBS/Zoom share source)
 * while the horizontal line is showing leaves it scrolling to the wrong
 * offset, which reads as the line drifting off toward the left edge.
 */
window.addEventListener('resize', () => {
  if (!api || !horizontalScore) return;
  api.settings.display.scale = horizontalScale();
  api.settings.player.scrollOffsetX = -Math.round(container.clientWidth * HORIZONTAL_READING_POINT);
  api.updateSettings();
  api.render();
});

export function isHorizontalScore(): boolean {
  return horizontalScore;
}

/**
 * Runs one bar of count-in clicks for the given bar's own time signature and
 * tempo. Shared by the initial play press and the loop restart below, so
 * both count in exactly the same way. Resolves false if a newer count-in (or
 * a cancel) started before this one finished, so the caller knows not to act
 * on a count-in that is no longer current.
 */
async function runCountIn(tick: number): Promise<boolean> {
  const masterBar = timeline[playedIndexAtTick(timeline, tick)]?.masterBar;
  if (!masterBar) return true;
  const token = ++countInToken;
  state.countingIn = true;
  notify();
  await playCountIn(masterBar.timeSignatureNumerator, tempoAtTick(tick));
  if (token !== countInToken) return false;
  state.countingIn = false;
  notify();
  return true;
}

export async function togglePlay(): Promise<void> {
  if (!api) return;

  // A second press during the count-in means "get on with it". It used to
  // cancel back to a standstill, which is indistinguishable from the button
  // not working — pressing play now always ends up playing.
  if (state.countingIn) {
    countInToken++;
    state.countingIn = false;
    notify();
    api.playPause();
    return;
  }

  if (state.isPlaying) {
    api.playPause();
    return;
  }

  if (!(await runCountIn(api.player?.tickPosition ?? 0))) return;
  api.playPause();
}

/**
 * The loop is a count-in away from being practisable at tempo: alphaTab's
 * native loop just snaps the audio back instantly (and the compressed-audio
 * re-decode on that seek leaves a small gap), which drops you back into the
 * riff with no run-up. Looping now restarts with the same "1 2 3 4" count-in
 * as the initial play, so a loop reads as a bar of count-in followed by the
 * riff, every time round — something you can actually play along with.
 */
async function restartLoopWithCountIn(): Promise<void> {
  if (!api) return;
  api.pause();
  // Back to the pass of the start bar that was just played — inside a
  // repeat, the first pass through it could be a long way back.
  const startTick = barToTick(state.loopStartBar, api.player?.tickPosition ?? 0);
  if (!(await runCountIn(startTick))) return;
  seekToTick(startTick);
  api.play();
}

export function seekToBar(bar: number): void {
  if (!api || !score) return;
  const clamped = Math.min(Math.max(bar, 1), score.masterBars.length);
  seekToTick(barToTick(clamped));
}

function seekToTick(tick: number): void {
  if (!api) return;
  api.tickPosition = tick;
  forceCursorToCurrentTick();
  updateFromPlayback();
}

/**
 * Steps through bars as they are played, so stepping forward from the end of
 * a repeated section goes round the repeat rather than skipping past it.
 */
export function nudgeBar(delta: number): void {
  if (!api || timeline.length === 0) return;
  const index = playedIndexAtTick(timeline, api.player?.tickPosition ?? 0);
  const target = Math.min(Math.max(index + delta, 0), timeline.length - 1);
  seekToTick(timeline[target].start);
}

/**
 * alphaTab only fires the internal `positionChanged` event — the thing that
 * moves the cursor and scrolls the horizontal score — while its sequencer
 * considers itself actively playing. Seeking or scrubbing while paused
 * updates its internal tick silently and leaves the cursor exactly where it
 * was, which is what made the score stop tracking the playhead outside of
 * playback. alphaTab's own code hits the same wall internally (see
 * `applyPlaybackRangeFromHighlight`) and works around it by calling the
 * cursor updater directly instead of only setting the position — there is no
 * public equivalent, so this does the same thing through the private method.
 */
function forceCursorToCurrentTick(): void {
  if (!api) return;
  const internals = api as unknown as {
    _cursorUpdateTick?: (tick: number, stop: boolean, cursorSpeed: number, shouldScroll?: boolean, forceUpdate?: boolean) => void;
  };
  internals._cursorUpdateTick?.(api.tickPosition, false, 1, true, true);
}

/**
 * Seeks the recording itself rather than asking alphaTab for a *tick*
 * position: ticks round to the nearest sync point, which can be seconds away
 * and made dragging the progress bar feel like it was ignoring you. Setting
 * the audio element directly keeps the audio and the highway (which reads
 * its own clock, not alphaTab's) exactly where the thumb is; `timePosition`
 * is only set afterwards so alphaTab's own tick bookkeeping (and the score
 * cursor, forced below) agrees with it.
 */
export function seekToSeconds(seconds: number): void {
  if (!mainAudio) return;
  const duration = Number.isFinite(mainAudio.duration) ? mainAudio.duration : seconds;
  const clamped = Math.min(Math.max(seconds, 0), duration);
  mainAudio.currentTime = clamped;
  if (noGuitarAudio) noGuitarAudio.currentTime = clamped;
  mediaOutput?.updatePosition(clamped * 1000);
  if (api) {
    api.timePosition = clamped * 1000;
    forceCursorToCurrentTick();
  }
  updateFromPlayback();
}

export function setSpeed(percent: number): void {
  state.speed = percent;
  if (api) api.playbackSpeed = percent / 100;
  notify();
}

/**
 * Looping is driven entirely from `updateFromPlayback` (see
 * `restartLoopWithCountIn`), not from alphaTab's native `isLooping` — that
 * just snapped the audio back instantly with no run-up. `playbackRange` is
 * left untouched here for the same reason: alphaTab would otherwise try to
 * enforce the range itself and race with our own restart.
 */
export function setLoop(startBar: number, endBar: number, enabled: boolean): void {
  if (!api || !score) return;
  state.loopStartBar = Math.min(startBar, endBar);
  state.loopEndBar = Math.max(startBar, endBar);
  state.loopEnabled = enabled;
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
