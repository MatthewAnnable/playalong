import {
  cycleFingerOverride,
  getCurrentTempo,
  getExtrapolatedTick,
  getScoreMeta,
  getTicksPerQuarter,
  onStateChange,
} from '../engine/alphatab';
import { registerAction } from './shortcuts';
import { HighwayView } from '../views/highway-view';
import { applyTheme, type Theme } from '../theme/theme';
import defaultTheme from '../theme/themes/default.json';

const alphatabSurface = document.querySelector<HTMLDivElement>('#alphatab')!;
const highwaySurface = document.querySelector<HTMLDivElement>('#highway')!;
const canvas = document.querySelector<HTMLCanvasElement>('#highway-canvas')!;
const viewToggleButton = document.querySelector<HTMLButtonElement>('#view-toggle-button')!;

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
 * Fixed px-per-beat, not bars of look-ahead — musical spacing stays constant
 * as the stage resizes, so a sixteenth note is always wide enough to read.
 * At a 1080px-tall stage this yields a 300px beat (a 75px sixteenth).
 */
function computePxPerTick(): number {
  const stageHeight = canvas.getBoundingClientRect().height;
  const pxPerBeat = activeTheme.geometry.pxPerBeatRatio * stageHeight;
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
    });
    applyTheme(activeTheme);
  }
  return view;
}

export function setHighwayView(visible: boolean): void {
  showingHighway = visible;
  alphatabSurface.hidden = visible;
  highwaySurface.hidden = !visible;
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

export function initHighway(): void {
  onStateChange((state) => {
    if (view) {
      view.setNotes(state.noteEvents);
      view.setBarMarkers(state.barMarkers);
    }
    // With a remote tick source the local engine is parked at bar 1, so
    // whoever owns that clock owns the bar counter too.
    if (!usingRemoteTick) barInfoEl.textContent = `Bar ${state.currentBar} / ${state.totalBars}`;
    trackNameEl.textContent = state.trackNames[state.trackIndex] ?? '';
    if (state.ready) {
      const meta = getScoreMeta();
      titleEl.textContent = meta.title;
      artistEl.textContent = meta.artist ? `— ${meta.artist}` : '';
      tempoEl.textContent = `${Math.round(getCurrentTempo())} bpm`;
    }
  });

  viewToggleButton.addEventListener('click', () => setHighwayView(!showingHighway));

  window.addEventListener('resize', () => {
    if (!showingHighway || !view) return;
    view.resize();
    view.setPxPerTick(computePxPerTick());
  });

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
