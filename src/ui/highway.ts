import {
  cycleFingerOverride,
  getCurrentTempo,
  getExtrapolatedTick,
  getScoreMeta,
  getSongBpm,
  getTicksPerQuarter,
  onStateChange,
  setScoreViewVisible,
} from '../engine/alphatab';
import { registerAction } from './shortcuts';
import { HighwayView } from '../views/highway-view';
import { applyTheme, type Theme } from '../theme/theme';
import defaultTheme from '../theme/themes/default.json';

const alphatabSurface = document.querySelector<HTMLDivElement>('#alphatab')!;
const highwaySurface = document.querySelector<HTMLDivElement>('#highway')!;
const canvas = document.querySelector<HTMLCanvasElement>('#highway-canvas')!;
const viewToggleButton = document.querySelector<HTMLButtonElement>('#view-toggle-button')!;
const chordNamesToggle = document.querySelector<HTMLInputElement>('#chord-names-toggle')!;

const barInfoEl = document.querySelector<HTMLSpanElement>('#highway-bar-info')!;
const tempoEl = document.querySelector<HTMLSpanElement>('#highway-tempo')!;
const trackNameEl = document.querySelector<HTMLSpanElement>('#highway-track-name')!;
const titleEl = document.querySelector<HTMLSpanElement>('#highway-song-title')!;
const artistEl = document.querySelector<HTMLSpanElement>('#highway-song-artist')!;

const LANE_COUNT = 6;

let view: HighwayView | null = null;
let showingHighway = false;
let tickSource: () => number = getExtrapolatedTick;
let activeTheme: Theme = defaultTheme as Theme;
let lastHasChordNames: boolean | null = null;
let lastSpacingKey = '';

/** OBS mode swaps in a transparent-stage theme so nothing paints a box. */
export function setHighwayTheme(theme: Theme): void {
  activeTheme = theme;
  applyTheme(theme);
  view?.setTheme(theme);
}

let usingRemoteTick = false;

/** OBS mode drives the highway from the remote tab instead of local audio. */
export function setTickSource(source: () => number): void {
  tickSource = source;
  usingRemoteTick = true;
}

/** Switches keyline width and structure-line doubling for OBS composite legibility. */
export function setHighwayObsMode(obs: boolean): void {
  ensureView().setObsMode(obs);
}

/**
 * The fastest the board may scroll at 100% speed, in CSS px a second. A beat's
 * width comes from the board's size, but never so wide that the board would
 * scroll faster than this; a big board shows more bars instead of racing.
 *
 * Why: on a full-screen board in Safari (60 fps) a fast song blurred. Dancefloor
 * (207 bpm) ran at ~420 px/s there; Matthew compared versions on 13/11/2026 and
 * the sharp one was ~330 px/s. Spacing by tempo alone (≤120 bpm, tried first)
 * wasn't enough, because a bigger board still meant a faster one.
 */
export const MAX_SCROLL_PX_PER_SECOND = 330;

/** Widest a beat may be at this tempo before the board scrolls too fast to read. */
export function maxPxPerBeat(bpm: number): number {
  return (MAX_SCROLL_PX_PER_SECOND * 60) / Math.max(bpm, 1);
}

/** `?space=0.8` (0.5 to 1.5) widens or narrows the beats by hand, to try a slower or roomier board. */
function spacingOverride(): number {
  const raw = new URLSearchParams(location.search).get('space');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 0.5), 1.5) : 1;
}

/**
 * Fixed px-per-beat, not bars of look-ahead — musical spacing stays constant
 * as the stage resizes, so a sixteenth note is always wide enough to read.
 * At a 1080px-tall stage this yields a 300px beat (a 75px sixteenth). A short,
 * wide stage — the lower half of an OBS scene — is spaced by its width instead.
 */
function computePxPerTick(): number {
  const { width, height } = canvas.getBoundingClientRect();
  const bySize = Math.max(
    activeTheme.geometry.pxPerBeatRatio * height,
    (activeTheme.geometry.pxPerBeatWidthRatio ?? 0) * width,
  );
  const pxPerBeat = Math.min(bySize, maxPxPerBeat(getSongBpm())) * spacingOverride();
  const ticksPerQuarter = getTicksPerQuarter();
  return ticksPerQuarter > 0 ? pxPerBeat / ticksPerQuarter : 0.1;
}

function ensureView(): HighwayView {
  if (!view) {
    view = new HighwayView({
      canvas,
      laneCount: LANE_COUNT,
      theme: activeTheme,
      pxPerTick: computePxPerTick(),
      getTick: () => tickSource(),
      onResize: () => view?.setPxPerTick(computePxPerTick()),
    });
    view.setChordPills(chordNamesToggle.checked);
    applyTheme(activeTheme);
  }
  return view;
}

export function setHighwayView(visible: boolean): void {
  showingHighway = visible;
  // Unhide the surface *before* telling the score it's visible again — the
  // horizontal layout measures the container's width to place its reading
  // point, and a still-hidden container measures zero, which is what was
  // pinning the scrolling line to the left edge after a Highway/Score
  // switch in presentation mode.
  alphatabSurface.hidden = visible;
  highwaySurface.hidden = !visible;
  setScoreViewVisible(!visible);
  viewToggleButton.textContent = visible ? 'Highway' : 'Score';
  if (visible) {
    const v = ensureView();
    v.resize();
    v.setPxPerTick(computePxPerTick());
    v.start();
  } else {
    view?.stop();
  }
}

function resizeStage(): void {
  if (!showingHighway || !view) return;
  view.resize();
  view.setPxPerTick(computePxPerTick());
}

export function initHighway(): void {
  onStateChange((state) => {
    if (view) {
      view.setNotes(state.noteEvents);
      view.setBarMarkers(state.barMarkers);
    }
    // With a remote tick source the local engine is parked at bar 1, so
    // whoever owns that clock owns the bar counter too.
    // Chord pills follow the file: on for a song whose chords are written in,
    // off for a riff song, until Matthew says otherwise for this song.
    if (state.hasChordNames !== lastHasChordNames) {
      lastHasChordNames = state.hasChordNames;
      chordNamesToggle.checked = state.hasChordNames;
      view?.setChordPills(state.hasChordNames);
    }
    if (!usingRemoteTick) barInfoEl.textContent = `Bar ${state.currentBar} / ${state.totalBars}`;
    trackNameEl.textContent = state.trackNames[state.trackIndex] ?? '';
    if (state.ready) {
      // A newly opened song may space its beats differently (fast songs are narrower).
      const spacingKey = `${getSongBpm()}/${getTicksPerQuarter()}`;
      if (view && spacingKey !== lastSpacingKey) {
        lastSpacingKey = spacingKey;
        view.setPxPerTick(computePxPerTick());
      }
      const meta = getScoreMeta();
      titleEl.textContent = meta.title;
      artistEl.textContent = meta.artist ? `— ${meta.artist}` : '';
      tempoEl.textContent = `${Math.round(getCurrentTempo())} bpm`;
    }
  });

  viewToggleButton.addEventListener('click', () => setHighwayView(!showingHighway));

  chordNamesToggle.addEventListener('change', () => {
    ensureView().setChordPills(chordNamesToggle.checked);
  });

  window.addEventListener('resize', resizeStage);

  // The highway is what a song opens on; a practice link can still ask for
  // the score (view=score).
  setHighwayView(true);

  registerAction('viewHighway', () => setHighwayView(true));
  registerAction('viewScore', () => setHighwayView(false));

  // Clicking a note corrects its fingering — the "fix finger" click from
  // build plan 5.4. The correction is remembered per song.
  canvas.addEventListener('click', (e) => {
    const note = view?.noteAt(e.clientX, e.clientY);
    if (note) cycleFingerOverride(note);
  });
}

export function isHighwayVisible(): boolean {
  return showingHighway;
}

// Dev builds only: lets a console script read the beat width the board is using.
if (import.meta.env.DEV) {
  (window as unknown as { __highwayPxPerTick: () => number }).__highwayPxPerTick = computePxPerTick;
}
