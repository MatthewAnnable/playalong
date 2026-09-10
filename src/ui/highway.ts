import {
  cycleFingerOverride,
  getCurrentTempo,
  getExtrapolatedTick,
  getScoreMeta,
  getTicksPerQuarter,
  onStateChange,
} from '../engine/alphatab';
import { registerAction } from './shortcuts';
import { HighwayView, MIN_NOTE_WIDTH_PX } from '../views/highway-view';
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
const LOOKAHEAD_BARS = 2;
const ASSUMED_QUARTERS_PER_BAR = 4;

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

function computePxPerTick(): number {
  const lookAheadWidth = canvas.getBoundingClientRect().width * (1 - 0.22);
  const ticksForLookahead = getTicksPerQuarter() * ASSUMED_QUARTERS_PER_BAR * LOOKAHEAD_BARS;
  const lookaheadBased = ticksForLookahead > 0 ? lookAheadWidth / ticksForLookahead : 0.1;
  // Two bars of look-ahead on a narrow stage squeezes 16th notes closer
  // together than a readable pill, so they'd overlap. Readability wins:
  // show less of the bar ahead rather than a pile of unreadable pills.
  const sixteenthTicks = getTicksPerQuarter() / 4;
  const readabilityFloor = sixteenthTicks > 0 ? MIN_NOTE_WIDTH_PX / sixteenthTicks : lookaheadBased;
  return Math.max(lookaheadBased, readabilityFloor);
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
  viewToggleButton.textContent = visible ? 'Score view' : 'Highway view';
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
