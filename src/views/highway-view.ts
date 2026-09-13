import type { BarMarker, NoteEvent } from '../engine/notes';
import type { Theme } from '../theme/theme';
import { pillTextFor } from '../theme/theme';

export interface HighwayViewOptions {
  canvas: HTMLCanvasElement;
  laneCount: number;
  theme: Theme;
  pxPerTick: number;
  getTick: () => number;
}

const STAGE_BASELINE_HEIGHT = 1080;

interface LaidOutNote {
  note: NoteEvent;
  /** x/w of the note's own musical duration, unpadded. */
  x: number;
  w: number;
  centerY: number;
}

interface RunCell {
  note: NoteEvent;
  /** Rendered rect for this cell — padded to the minimum width when isolated. */
  x: number;
  w: number;
}

interface Run {
  cells: RunCell[];
  centerY: number;
  x: number;
  w: number;
  /** Free space before the next run in this lane — a trailing slide tail is clamped to it. */
  gapAfter: number;
}

function fingerKey(finger: 0 | 1 | 2 | 3 | 4): 'open' | '1' | '2' | '3' | '4' {
  return finger === 0 ? 'open' : (String(finger) as '1' | '2' | '3' | '4');
}

/**
 * Guitarists' own shorthand for bend depth, given in tones — one fret is half
 * a tone, so a one-fret bend is the "half bend" and a two-fret one is "full".
 */
function bendLabel(tones: number): string {
  const rounded = Math.round(tones * 2) / 2;
  if (rounded <= 0) return '';
  if (rounded === 0.5) return '\u00BD';
  if (rounded === 1) return 'full';
  if (rounded === 1.5) return '1\u00BD';
  return String(rounded);
}

function fingerColor(theme: Theme, finger: 0 | 1 | 2 | 3 | 4): string {
  const key = fingerKey(finger);
  return key === 'open' ? theme.fingers.open : theme.fingers[key];
}

/**
 * The custom "highway" — six string lanes, notes travelling right to left
 * into a play line. All geometry is derived from the theme's `geometry`
 * block as ratios of stage height, per the visual-redesign handoff —
 * nothing is capped, so a tall stage gets a genuinely readable fret number.
 */
export class HighwayView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private laneCount: number;
  private theme: Theme;
  private pxPerTick: number;
  private getTick: () => number;
  private notes: NoteEvent[] = [];
  private barMarkers: BarMarker[] = [];
  private rafId = 0;
  private obsMode = false;
  private hitNoteIds = new Map<number, number>();
  /** Last frame's laid-out run cells, so a click can be mapped back to a note. */
  private lastLayout: { note: NoteEvent; x: number; w: number; centerY: number; h: number }[] = [];

  constructor(options: HighwayViewOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    this.ctx = ctx;
    this.laneCount = options.laneCount;
    this.theme = options.theme;
    this.pxPerTick = options.pxPerTick;
    this.getTick = options.getTick;
    this.resize();
  }

  setNotes(notes: NoteEvent[]): void {
    this.notes = notes;
  }

  setBarMarkers(markers: BarMarker[]): void {
    this.barMarkers = markers;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  setObsMode(obs: boolean): void {
    this.obsMode = obs;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(): void {
    const loop = () => {
      this.renderFrame();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  setPxPerTick(pxPerTick: number): void {
    this.pxPerTick = pxPerTick;
  }

  // ---- geometry ----------------------------------------------------

  private stageHeight(): number {
    return this.canvas.getBoundingClientRect().height;
  }

  /** Every "fixed" px value in the handoff is fixed at a 1080px-tall stage; scale linearly. */
  private scale(): number {
    return this.stageHeight() / STAGE_BASELINE_HEIGHT;
  }

  private px(baselineValue: number): number {
    return baselineValue * this.scale();
  }

  private headerHeight(): number {
    return this.px(this.theme.geometry.headerHeight);
  }

  private laneHeight(): number {
    return (this.stageHeight() - this.headerHeight()) / this.laneCount;
  }

  private laneCenterY(laneIndex: number): number {
    return this.headerHeight() + laneIndex * this.laneHeight() + this.laneHeight() / 2;
  }

  private pillHeight(): number {
    return this.laneHeight() * this.theme.geometry.pillHeightRatio;
  }

  private pillRadius(): number {
    return this.pillHeight() * this.theme.geometry.pillRadiusRatio;
  }

  private minIsolatedWidth(): number {
    return this.pillHeight() * this.theme.geometry.pillMinWidthRatio;
  }

  private fretSize(): number {
    return this.pillHeight() * this.theme.geometry.fretSizeRatio;
  }

  private outlineWidth(): number {
    return this.px(this.obsMode ? this.theme.keylineWidthObs : this.theme.keylineWidth);
  }

  private playLineX(): number {
    return this.canvas.getBoundingClientRect().width * this.theme.playLinePosition;
  }

  private xForTick(tick: number, currentTick: number): number {
    return this.playLineX() + (tick - currentTick) * this.pxPerTick;
  }

  /** Binary search for the first note whose endTick is still ahead of the given tick. */
  private firstVisibleIndex(minTick: number): number {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].endTick < minTick) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ---- frame ----------------------------------------------------

  private renderFrame(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    const ctx = this.ctx;
    const currentTick = this.getTick();
    const theme = this.theme;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.stage.background;
    ctx.fillRect(0, 0, width, height);

    this.drawLanes(width);
    this.drawBarMarkers(currentTick, width, height);
    this.drawNotes(currentTick, width);
    this.drawPlayLine(height);
  }

  private strokeStructureLine(x0: number, y0: number, x1: number, y1: number, baseColor: string, baseOpacity: number): void {
    const ctx = this.ctx;
    if (this.obsMode) {
      const obs = this.theme.obs;
      const w = this.px(obs.lineWidth);
      ctx.lineWidth = w;
      ctx.strokeStyle = obs.laneLight;
      ctx.globalAlpha = obs.laneLightOpacity;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = obs.laneDark;
      ctx.globalAlpha = obs.laneDarkOpacity;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + w);
      ctx.lineTo(x1, y1 + w);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = baseColor;
      ctx.globalAlpha = baseOpacity;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawLanes(width: number): void {
    const laneH = this.laneHeight();
    const top = this.headerHeight();
    for (let i = 0; i <= this.laneCount; i++) {
      const y = Math.round(top + i * laneH) + 0.5;
      this.strokeStructureLine(0, y, width, y, this.theme.lane, this.theme.laneOpacity);
    }
  }

  private drawPlayLine(height: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const x = this.playLineX();
    const w = this.px(theme.playLineWidth);
    const cap = this.px(theme.playLineCapSize);
    const keylineW = this.px(theme.keylineWidth);

    ctx.save();
    ctx.strokeStyle = 'rgba(13,17,11,0.92)';
    ctx.lineWidth = w + keylineW * 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.strokeStyle = theme.playLine;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = theme.playLine;
    ctx.beginPath();
    ctx.moveTo(x - cap / 2, 0);
    ctx.lineTo(x + cap / 2, 0);
    ctx.lineTo(x, cap);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - cap / 2, height);
    ctx.lineTo(x + cap / 2, height);
    ctx.lineTo(x, height - cap);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBarMarkers(currentTick: number, width: number, height: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const rightEdgeTick = currentTick + (width - this.playLineX()) / this.pxPerTick;
    const leftEdgeTick = currentTick - this.playLineX() / this.pxPerTick;
    const barLineY0 = this.headerHeight();

    for (const marker of this.barMarkers) {
      if (marker.tick < leftEdgeTick || marker.tick > rightEdgeTick) continue;
      const x = this.xForTick(marker.tick, currentTick);
      const rx = Math.round(x) + 0.5;
      this.strokeStructureLine(rx, barLineY0, rx, height, theme.barLine, theme.barLineOpacity);

      ctx.font = `600 ${this.px(17)}px Manrope, sans-serif`;
      ctx.fillStyle = theme.textMuted;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(String(marker.barNumber), x + this.px(6), barLineY0 + this.px(6));

      if (marker.sectionText) {
        ctx.save();
        ctx.font = `600 ${this.px(13)}px Manrope, sans-serif`;
        ctx.fillStyle = theme.textEyebrow;
        ctx.fillText(marker.sectionText.toUpperCase(), x + this.px(6), barLineY0 + this.px(24));
        ctx.restore();
      }
    }
  }

  // ---- notes ----------------------------------------------------

  /** Pill width covers only the head of the note — a tie sustain renders as a separate bar. */
  private noteWidth(note: NoteEvent): number {
    const headEndTick = note.tieBarStartTick ?? note.endTick;
    const raw = Math.max((headEndTick - note.startTick) * this.pxPerTick, 1);
    const isDead = note.fret < 0 || note.techniques.dead === true;
    return isDead ? raw * this.theme.geometry.deadWidthRatio : raw;
  }

  private drawNotes(currentTick: number, width: number): void {
    const rightEdgeTick = currentTick + (width - this.playLineX()) / this.pxPerTick + 2000;
    const startIndex = this.firstVisibleIndex(currentTick - 2000);

    const byLane = new Map<number, LaidOutNote[]>();
    const chordGroups = new Map<number, LaidOutNote[]>();
    const tieNotes: LaidOutNote[] = [];

    for (let i = startIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.startTick > rightEdgeTick) break;

      const x = this.xForTick(note.startTick, currentTick);
      const w = this.noteWidth(note);
      if (x + w < 0 || x > width) continue;

      const laneIndex = note.string - 1;
      if (laneIndex < 0 || laneIndex >= this.laneCount) continue;

      const item: LaidOutNote = { note, x, w, centerY: this.laneCenterY(laneIndex) };
      if (!byLane.has(laneIndex)) byLane.set(laneIndex, []);
      byLane.get(laneIndex)!.push(item);

      if (note.isChord) {
        if (!chordGroups.has(note.startTick)) chordGroups.set(note.startTick, []);
        chordGroups.get(note.startTick)!.push(item);
      }
      if (note.tieBarStartTick !== undefined) tieNotes.push(item);
    }

    // Chord joins first, so they sit behind the pills rather than over them.
    this.drawChordJoins(chordGroups);

    const mergeGap = this.px(this.theme.geometry.runMergeGap);
    this.lastLayout = [];

    for (const [, laneNotes] of byLane) {
      laneNotes.sort((a, b) => a.x - b.x);
      const runs = this.buildRuns(laneNotes, mergeGap);
      this.padIsolatedRuns(runs);
      for (const run of runs) this.drawRun(run, currentTick);
    }

    this.drawTieBars(tieNotes, currentTick);
  }

  /** The tied portion of a sustained note — no number, just a thin continuing bar. */
  private drawTieBars(tieNotes: LaidOutNote[], currentTick: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const barH = this.pillHeight() * theme.geometry.tieBarHeightRatio;
    for (const item of tieNotes) {
      const note = item.note;
      const barStartX = item.x + item.w;
      const barEndX = this.xForTick(note.endTick, currentTick);
      if (barEndX <= barStartX) continue;
      ctx.fillStyle = fingerColor(theme, note.finger);
      this.roundRectPath(barStartX, item.centerY - barH / 2, barEndX - barStartX, barH, barH / 2);
      ctx.fill();
    }
  }

  private drawChordJoins(chordGroups: Map<number, LaidOutNote[]>): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const joinW = this.px(theme.geometry.chordJoinWidth);
    for (const group of chordGroups.values()) {
      if (group.length < 2) continue;
      const x = group[0].x + group[0].w / 2;
      const ys = group.map((n) => n.centerY);
      ctx.strokeStyle = theme.chordJoin;
      ctx.globalAlpha = theme.chordJoinOpacity;
      ctx.lineWidth = joinW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, Math.min(...ys));
      ctx.lineTo(x, Math.max(...ys));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Groups same-lane notes whose gap is below the merge threshold into run capsules. */
  private buildRuns(laneNotes: LaidOutNote[], mergeGap: number): Run[] {
    const runs: Run[] = [];
    let current: LaidOutNote[] = [];

    const flush = () => {
      if (current.length === 0) return;
      runs.push(this.layoutRun(current));
      current = [];
    };

    for (const item of laneNotes) {
      // Harmonics get their own diamond shape — never merge them into a run.
      if (item.note.techniques.harmonic) {
        flush();
        runs.push(this.layoutRun([item]));
        continue;
      }
      if (current.length === 0) {
        current.push(item);
        continue;
      }
      const prev = current[current.length - 1];
      const gap = item.x - (prev.x + prev.w);
      if (gap < mergeGap) {
        current.push(item);
      } else {
        flush();
        current.push(item);
      }
    }
    flush();

    return runs;
  }

  private layoutRun(items: LaidOutNote[]): Run {
    const cells: RunCell[] = items.map((item) => ({ note: item.note, x: item.x, w: item.w }));
    const x = cells[0].x;
    const last = cells[cells.length - 1];
    const w = last.x + last.w - x;
    return { cells, centerY: items[0].centerY, x, w, gapAfter: Number.POSITIVE_INFINITY };
  }

  /**
   * A short note is widened to stay readable, but only into the space that is
   * actually free. Widening blindly is what made a run of scratched (dead)
   * notes sit on top of each other: they are drawn narrower than their
   * duration, so every one of them wanted padding, and each one grew into its
   * neighbour. Runs arrive sorted, so the previous run here is already padded.
   */
  private padIsolatedRuns(runs: Run[]): void {
    const minW = this.minIsolatedWidth();
    const gutter = this.px(this.theme.geometry.runMergeGap) / 2;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (run.cells.length !== 1) continue;
      const cell = run.cells[0];
      if (cell.w >= minW) continue;
      const want = (minW - cell.w) / 2;
      const prev = runs[i - 1];
      const next = runs[i + 1];
      const roomLeft = prev ? Math.max(0, run.x - (prev.x + prev.w) - gutter) : want;
      const roomRight = next ? Math.max(0, next.x - (run.x + run.w) - gutter) : want;
      const left = Math.min(want, roomLeft);
      const right = Math.min(want, roomRight);
      if (left <= 0 && right <= 0) continue;
      cell.x -= left;
      cell.w += left + right;
      run.x = cell.x;
      run.w = cell.w;
    }
    for (let i = 0; i < runs.length; i++) {
      const next = runs[i + 1];
      runs[i].gapAfter = next ? Math.max(0, next.x - (runs[i].x + runs[i].w)) : Number.POSITIVE_INFINITY;
    }
  }

  /** Shrinks a label until it fits the width it has, so a number never spills onto its neighbour. */
  private fittedFontSize(text: string, preferred: number, maxWidth: number, weight: number): number {
    const ctx = this.ctx;
    ctx.font = `${weight} ${preferred}px Manrope, sans-serif`;
    const width = ctx.measureText(text).width;
    if (width <= maxWidth || width === 0) return preferred;
    return Math.max(preferred * 0.45, preferred * (maxWidth / width));
  }

  private drawRun(run: Run, currentTick: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const pillH = this.pillHeight();
    const radius = this.pillRadius();
    const top = run.centerY - pillH / 2;
    const singleHarmonic = run.cells.length === 1 && run.cells[0].note.techniques.harmonic;

    if (singleHarmonic) {
      this.drawHarmonicCell(run.cells[0], run.centerY);
    } else {
      ctx.save();
      this.roundRectPath(run.x, top, run.w, pillH, radius);
      ctx.clip();
      for (const cell of run.cells) this.fillCell(cell, top, pillH);
      ctx.restore();

      // Dividers between cells, then the single outer keyline.
      if (run.cells.length > 1) {
        const dividerW = this.px(theme.geometry.runDividerWidth);
        for (let i = 1; i < run.cells.length; i++) {
          const bx = run.cells[i].x;
          const slide = run.cells[i - 1].note.techniques.slideOut;
          if (slide) {
            // Inside a run there is no room for a tail, so the seam itself
            // leans the way the finger travels — up for an ascending slide,
            // down for a descending one.
            this.drawSlideSeam(bx, run.centerY, pillH, slide);
            continue;
          }
          ctx.strokeStyle = this.obsMode ? theme.keyline : theme.stage.background;
          ctx.lineWidth = dividerW;
          ctx.beginPath();
          ctx.moveTo(bx, top);
          ctx.lineTo(bx, top + pillH);
          ctx.stroke();
        }
      }

      ctx.save();
      this.roundRectPath(run.x, top, run.w, pillH, radius);
      ctx.strokeStyle = theme.keyline;
      ctx.lineWidth = this.outlineWidth();
      ctx.stroke();
      ctx.restore();
    }

    // Per-cell overlays: technique glyphs, numbers, hit flash, tie bars.
    run.cells.forEach((cell, index) => this.drawCellOverlays(cell, run, index, pillH, currentTick));

    // Record layout for click-to-correct-fingering, using cell rects.
    for (const cell of run.cells) {
      this.lastLayout.push({ note: cell.note, x: cell.x, w: cell.w, centerY: run.centerY, h: pillH });
    }
  }

  private fillCell(cell: RunCell, top: number, pillH: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const note = cell.note;
    const isDead = note.fret < 0 || note.techniques.dead === true;
    const isOpen = note.fret === 0 && !isDead;

    ctx.fillStyle = isOpen ? theme.fingers.open : isDead ? theme.dead : fingerColor(theme, note.finger);
    ctx.fillRect(cell.x, top, cell.w, pillH);

    if (isOpen) {
      const inset = this.px(6);
      ctx.strokeStyle = pillTextFor(theme, 'open');
      ctx.lineWidth = this.px(2);
      ctx.strokeRect(cell.x + inset, top + inset, cell.w - inset * 2, pillH - inset * 2);
    }
  }

  /**
   * A harmonic is a diamond rather than a pill. The diamond is sized from the
   * lane like every other note — it used to be a fixed 34px square carrying a
   * 46px number, so the fret simply did not fit inside it — and the number is
   * then shrunk to the width actually available across the diamond's waist.
   */
  private drawHarmonicCell(cell: RunCell, centerY: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const pillH = this.pillHeight();
    // Half-diagonal: the diamond's full height, so it reads as the same weight
    // as the pills on the lanes above and below it.
    const half = (pillH / 2) * theme.geometry.harmonicSizeRatio;
    const side = half * Math.SQRT1_2 * 2;
    const cx = cell.x + cell.w / 2;

    ctx.save();
    ctx.translate(cx, centerY);
    ctx.rotate((theme.geometry.harmonicRotation * Math.PI) / 180);
    ctx.fillStyle = fingerColor(theme, cell.note.finger);
    this.roundRectPath(-side / 2, -side / 2, side, side, this.px(4));
    ctx.fill();
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.outlineWidth();
    ctx.stroke();
    ctx.restore();

    // Number stays upright — drawn without the rotation transform. The widest
    // line that fits inside a diamond of half-diagonal h, at text height t, is
    // 2h - t, so fit to that rather than to the bounding box.
    const label = String(cell.note.fret);
    const preferred = this.fretSize() * 0.82;
    const size = this.fittedFontSize(label, preferred, Math.max(half * 2 - preferred, this.px(12)), 700);
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    ctx.fillStyle = pillTextFor(theme, fingerKey(cell.note.finger));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, centerY);
  }

  private drawCellOverlays(cell: RunCell, run: Run, index: number, pillH: number, currentTick: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const centerY = run.centerY;
    const note = cell.note;
    const isDead = note.fret < 0 || note.techniques.dead === true;
    const isOpen = note.fret === 0 && !isDead;

    if (!note.techniques.harmonic) {
      const key = isOpen ? 'open' : isDead ? 'dead' : fingerKey(note.finger);
      const ink = pillTextFor(theme, key);
      if (isDead) {
        // Drawn as strokes rather than a glyph: a scratch cell is narrower
        // than its duration, and a text × at pill size ran over its neighbours.
        const arm = Math.min(cell.w, pillH) * 0.26;
        const cx = cell.x + cell.w / 2;
        ctx.save();
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(this.px(3), arm * 0.32);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - arm, centerY - arm);
        ctx.lineTo(cx + arm, centerY + arm);
        ctx.moveTo(cx + arm, centerY - arm);
        ctx.lineTo(cx - arm, centerY + arm);
        ctx.stroke();
        ctx.restore();
      } else {
        const minNumberWidth = this.px(theme.geometry.runCellNumberMinWidth);
        if (cell.w >= minNumberWidth) {
          const label = String(note.fret);
          const size = this.fittedFontSize(label, this.fretSize(), cell.w * 0.78, theme.geometry.fretWeight);
          ctx.font = `${theme.geometry.fretWeight} ${size}px Manrope, sans-serif`;
          ctx.fillStyle = ink;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, cell.x + cell.w / 2, centerY);
        }
      }
    }

    if (note.techniques.palmMute) {
      ctx.save();
      const offset = this.px(theme.geometry.palmMuteRingOffset);
      ctx.setLineDash([this.px(1), this.px(5)]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = theme.palmMuteRing;
      ctx.lineWidth = this.px(theme.geometry.palmMuteRingWidth);
      this.roundRectPath(cell.x + offset, centerY - pillH / 2 + offset, cell.w - offset * 2, pillH - offset * 2, this.pillRadius() * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    // A slide inside a run is drawn as the slanted seam between the two cells
    // (see drawRun); only the run's outer edges get a trailing tail.
    if (note.techniques.slideIn && index === 0) {
      this.drawSlideTail(cell, centerY, note.techniques.slideIn, 'in', Number.POSITIVE_INFINITY);
    }
    if (note.techniques.slideOut && index === run.cells.length - 1) {
      this.drawSlideTail(cell, centerY, note.techniques.slideOut, 'out', run.gapAfter);
    }

    if (note.techniques.bend) {
      this.drawBend(cell, centerY, pillH, note.techniques.bendFrets);
    }

    if (note.techniques.hammer || note.techniques.pull) {
      ctx.save();
      const rise = this.px(theme.geometry.hammerArcRise);
      const x0 = cell.x + cell.w * 0.3;
      const x1 = cell.x + cell.w * 0.7;
      const y = centerY - pillH / 2;
      ctx.strokeStyle = theme.techniqueStroke;
      ctx.lineWidth = this.px(theme.geometry.hammerArcWidth);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.quadraticCurveTo((x0 + x1) / 2, y - rise, x1, y);
      ctx.stroke();
      ctx.restore();
    }

    this.drawHitEffect(cell, centerY, pillH, currentTick);
  }

  /**
   * The tail that says which way the finger travels. It follows the score:
   * a slide down draws a falling tail, never the rising one the first build
   * drew for everything. Cream, not the finger colour — on a lane of
   * four hues a technique mark has to read as a mark, not as another note.
   */
  /** The slanted seam between two notes of a run that are joined by a slide. */
  private drawSlideSeam(x: number, centerY: number, pillH: number, direction: 'up' | 'down'): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const dy = direction === 'up' ? -1 : 1;
    const half = pillH / 2;
    const lean = pillH * 0.34;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = theme.techniqueStroke;
    ctx.lineWidth = this.px(theme.geometry.slideTailWidth) * 0.7;
    ctx.beginPath();
    ctx.moveTo(x - lean, centerY - dy * half);
    ctx.lineTo(x + lean, centerY + dy * half);
    ctx.stroke();
    ctx.restore();
  }

  private drawSlideTail(
    cell: RunCell,
    centerY: number,
    direction: 'up' | 'down',
    side: 'in' | 'out',
    room: number,
  ): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const base = this.px(theme.geometry.slideTailWidth) * 6;
    // Never reach into the next note: a tail that overlapped its neighbour was
    // the other half of why these marks did not read.
    const len = Math.max(this.px(theme.geometry.slideTailWidth) * 2, Math.min(base, room * 0.85));
    const angle = (Math.abs(theme.geometry.slideTailAngle) * Math.PI) / 180;
    const dx = side === 'out' ? 1 : -1;
    // Canvas y grows downwards. A slide out ascends away from the pill; a
    // slide in ascends towards it, so its tail drops away to the left.
    const rising = side === 'out' ? direction === 'up' : direction === 'down';
    const dy = rising ? -1 : 1;

    const x0 = side === 'out' ? cell.x + cell.w : cell.x;
    const y0 = centerY;
    const x1 = x0 + dx * len * Math.cos(angle);
    const y1 = y0 + dy * len * Math.sin(angle);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.px(theme.geometry.slideTailWidth) + this.outlineWidth() * 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = theme.techniqueStroke;
    ctx.lineWidth = this.px(theme.geometry.slideTailWidth);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Bends are drawn to size: the arrow is as tall as the bend is wide, and
   * carries the player's own shorthand (½, full, 1½) so a half bend can never
   * be mistaken for a whole-tone one.
   */
  private drawBend(cell: RunCell, centerY: number, pillH: number, frets: number | undefined): void {
    const ctx = this.ctx;
    const theme = this.theme;
    // A one-fret push is half a tone. With no bend points in the file we can
    // only say "there is a bend" — draw the common full-tone arrow and leave
    // the label off rather than claim a depth we do not know.
    const tones = frets !== undefined && frets > 0 ? frets / 2 : 1;
    const rise = Math.min(this.px(theme.geometry.bendRise) * tones, pillH * 2.4);
    const x0 = cell.x + cell.w / 2;
    const y0 = centerY - pillH / 2;
    const stem = this.px(theme.geometry.bendStemWidth);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Dark halo first, so the arrow stays visible over a pale pill.
    for (const pass of ['halo', 'ink'] as const) {
      ctx.strokeStyle = pass === 'halo' ? theme.keyline : theme.techniqueStroke;
      ctx.lineWidth = pass === 'halo' ? stem + this.outlineWidth() * 2 : stem;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 - rise);
      ctx.stroke();
      const aw = stem * 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 - aw, y0 - rise + aw);
      ctx.lineTo(x0, y0 - rise);
      ctx.lineTo(x0 + aw, y0 - rise + aw);
      ctx.stroke();
    }

    const label = frets !== undefined && frets > 0 ? bendLabel(tones) : '';
    if (label) {
      const size = this.px(theme.geometry.bendLabelSize);
      ctx.font = `700 ${size}px Manrope, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = this.px(4);
      ctx.strokeStyle = theme.keyline;
      ctx.strokeText(label, x0 + stem * 2, y0 - rise + size * 0.15);
      ctx.fillStyle = theme.techniqueStroke;
      ctx.fillText(label, x0 + stem * 2, y0 - rise + size * 0.15);
    }
    ctx.restore();
  }

  private hitStartAt(note: NoteEvent): number | undefined {
    const id = note.startTick * 100 + note.string;
    return this.hitNoteIds.get(id);
  }

  private drawHitEffect(cell: RunCell, centerY: number, pillH: number, currentTick: number): void {
    const note = cell.note;
    const theme = this.theme;
    const ringMs = theme.geometry.hitRingMs;
    const isHitNow = note.startTick <= currentTick && currentTick - note.startTick < theme.geometry.hitScaleMs;
    if (isHitNow) this.registerHit(note);

    const hitAt = this.hitStartAt(note);
    if (hitAt === undefined) return;
    const elapsed = performance.now() - hitAt;
    if (elapsed > ringMs) {
      this.hitNoteIds.delete(note.startTick * 100 + note.string);
      return;
    }
    const progress = elapsed / ringMs;
    const ctx = this.ctx;
    const grow = this.px(theme.geometry.hitRingGrow) * progress;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = theme.hit;
    ctx.lineWidth = this.px(theme.geometry.hitRingWidth);
    this.roundRectPath(cell.x - grow / 2, centerY - pillH / 2 - grow / 2, cell.w + grow, pillH + grow, this.pillRadius());
    ctx.stroke();
    ctx.restore();
  }

  /** Maps a click in CSS pixels onto the note drawn there, if any. */
  noteAt(clientX: number, clientY: number): NoteEvent | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const item of this.lastLayout) {
      if (x >= item.x && x <= item.x + item.w && Math.abs(y - item.centerY) <= item.h / 2) {
        return item.note;
      }
    }
    return null;
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  private registerHit(note: NoteEvent): void {
    const id = note.startTick * 100 + note.string;
    if (!this.hitNoteIds.has(id)) this.hitNoteIds.set(id, performance.now());
  }

}
