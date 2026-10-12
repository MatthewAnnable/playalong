import { onStateChange, tickToAudioSeconds, type EngineState } from '../engine/alphatab';
import type { BarMarker } from '../engine/notes';
import type { Theme } from '../theme/theme';
import defaultTheme from '../theme/themes/default.json';
import { layoutOverview, type OverviewLayout } from './overview-layout';

const wrap = document.querySelector<HTMLDivElement>('#scrubber-wrap')!;
const canvas = document.querySelector<HTMLCanvasElement>('#overview-canvas')!;
const ctx = canvas.getContext('2d')!;
const theme = defaultTheme as Theme;

/** Strip along the top for the section names; the six strings share the rest. */
const LABEL_BAND = 15;

let layout: OverviewLayout = { sections: [], notes: [] };
let loop: { start: number; end: number } | null = null;

let lastNotes: EngineState['noteEvents'] | null = null;
let lastMarkers: BarMarker[] | null = null;
let lastDuration = -1;
let lastLoopKey = '';

function fingerColour(finger: 0 | 1 | 2 | 3 | 4): string {
  return finger === 0 ? theme.fingers.open : theme.fingers[String(finger) as '1' | '2' | '3' | '4'];
}

/** The loop as a share of the recording: from its first bar's start to wherever the bar after its last one begins. */
function loopShare(state: Readonly<EngineState>): { start: number; end: number } | null {
  if (!state.loopEnabled || state.durationSec <= 0) return null;
  const markers = state.barMarkers;
  const first = markers.findIndex((m) => m.barNumber === state.loopStartBar);
  if (first < 0) return null;
  let endTick: number | null = null;
  for (let i = first + 1; i < markers.length; i++) {
    if (markers[i].barNumber > state.loopEndBar || markers[i].barNumber < state.loopStartBar) {
      endTick = markers[i].tick;
      break;
    }
  }
  const share = (tick: number) => Math.min(Math.max(tickToAudioSeconds(tick) / state.durationSec, 0), 1);
  return { start: share(markers[first].tick), end: endTick === null ? 1 : share(endTick) };
}

function draw(): void {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const xAt = (share: number) => share * width;
  const laneH = (height - LABEL_BAND - 3) / 6;

  if (loop) {
    ctx.fillStyle = 'rgba(255, 181, 71, 0.16)';
    ctx.fillRect(xAt(loop.start), 0, xAt(loop.end) - xAt(loop.start), height);
  }

  // Faint strings, so an empty stretch still reads as "nothing to play here".
  ctx.fillStyle = 'rgba(168, 162, 154, 0.14)';
  for (let lane = 0; lane < 6; lane++) {
    ctx.fillRect(0, LABEL_BAND + lane * laneH + laneH / 2 - 0.5, width, 1);
  }

  for (const note of layout.notes) {
    const x = xAt(note.start);
    const nw = Math.max(xAt(note.end) - x - 0.5, 1.5);
    ctx.fillStyle = fingerColour(note.finger);
    ctx.fillRect(x, LABEL_BAND + note.lane * laneH + laneH * 0.15, nw, Math.max(laneH * 0.7, 1.5));
  }

  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  layout.sections.forEach((section, i) => {
    const x0 = xAt(section.start);
    const x1 = xAt(section.end);
    if (i > 0 || section.start > 0.002) {
      ctx.fillStyle = 'rgba(251, 248, 243, 0.45)';
      ctx.fillRect(Math.round(x0), 0, 1, height);
    }
    const room = x1 - x0 - 8;
    if (room < 14) return;
    let label = section.label.toUpperCase();
    while (label.length > 1 && ctx.measureText(label).width > room) label = label.slice(0, -1);
    if (label !== section.label.toUpperCase()) label = label.length > 2 ? `${label.slice(0, -1)}…` : label;
    ctx.fillStyle = 'rgba(251, 248, 243, 0.85)';
    ctx.fillText(label, x0 + 4, LABEL_BAND / 2 + 1);
  });
}

/**
 * The progress bar doubles as a map of the song: each section named along
 * the top, and every note on its string in its finger's colour, so you can
 * see where the busy riff or the quiet verse is and drag straight to it.
 */
export function initOverview(): void {
  onStateChange((state) => {
    const loopKey = `${state.loopEnabled}:${state.loopStartBar}:${state.loopEndBar}`;
    const changed =
      state.noteEvents !== lastNotes ||
      state.barMarkers !== lastMarkers ||
      state.durationSec !== lastDuration ||
      loopKey !== lastLoopKey;
    if (!changed) return;
    lastNotes = state.noteEvents;
    lastMarkers = state.barMarkers;
    lastDuration = state.durationSec;
    lastLoopKey = loopKey;
    layout = layoutOverview(state.noteEvents, state.barMarkers, tickToAudioSeconds, state.durationSec);
    loop = loopShare(state);
    draw();
  });
  new ResizeObserver(() => draw()).observe(wrap);
}
