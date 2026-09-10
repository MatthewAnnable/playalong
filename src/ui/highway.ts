import { getCurrentTempo, getExtrapolatedTick, getScoreMeta, getTicksPerQuarter, onStateChange } from '../engine/alphatab';
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
      theme: defaultTheme as Theme,
      pxPerTick: computePxPerTick(),
      getTick: getExtrapolatedTick,
    });
    applyTheme(defaultTheme as Theme);
  }
  return view;
}

function setHighwayVisible(visible: boolean): void {
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
    barInfoEl.textContent = `Bar ${state.currentBar} / ${state.totalBars}`;
    trackNameEl.textContent = state.trackNames[state.trackIndex] ?? '';
    if (state.ready) {
      const meta = getScoreMeta();
      titleEl.textContent = meta.title;
      artistEl.textContent = meta.artist ? `— ${meta.artist}` : '';
      tempoEl.textContent = `${Math.round(getCurrentTempo())} bpm`;
    }
  });

  viewToggleButton.addEventListener('click', () => setHighwayVisible(!showingHighway));

  window.addEventListener('resize', () => {
    if (!showingHighway || !view) return;
    view.resize();
    view.setPxPerTick(computePxPerTick());
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'h' || e.key === 'H') setHighwayVisible(true);
    if (e.key === 's' || e.key === 'S') setHighwayVisible(false);
  });
}
