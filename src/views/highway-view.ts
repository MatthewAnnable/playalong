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
}

function fingerKey(finger: 0 | 1 | 2 | 3 | 4): 'open' | '1' | '2' | '3' | '4' {
  return finger === 0 ? 'open' : (String(finger) as '1' | '2' | '3' | '4');
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
    if (cells.length === 1) {
      const minW = this.minIsolatedWidth();
      if (cells[0].w < minW) {
        const pad = (minW - cells[0].w) / 2;
        cells[0] = { ...cells[0], x: cells[0].x - pad, w: minW };
      }
    }
    const x = cells[0].x;
    const last = cells[cells.length - 1];
    const w = last.x + last.w - x;
    return { cells, centerY: items[0].centerY, x, w };
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
        ctx.strokeStyle = this.obsMode ? theme.keyline : theme.stage.background;
        ctx.lineWidth = dividerW;
        for (let i = 1; i < run.cells.length; i++) {
          const bx = run.cells[i].x;
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
    for (const cell of run.cells) this.drawCellOverlays(cell, run.centerY, pillH, currentTick);

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

  private drawHarmonicCell(cell: RunCell, centerY: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const size = this.px(theme.geometry.harmonicRadius) * 2;
    const cx = cell.x + cell.w / 2;

    ctx.save();
    ctx.translate(cx, centerY);
    ctx.rotate((theme.geometry.harmonicRotation * Math.PI) / 180);
    const half = size / (2 * Math.SQRT2) + this.px(theme.geometry.harmonicRadius) / 2;
    ctx.fillStyle = fingerColor(theme, cell.note.finger);
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.outlineWidth();
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    ctx.restore();

    // Number stays upright — drawn without the rotation transform.
    const fretSize = this.px(46);
    ctx.font = `700 ${fretSize}px Manrope, sans-serif`;
    ctx.fillStyle = pillTextFor(theme, fingerKey(cell.note.finger));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cell.note.fret), cx, centerY);
  }

  private drawCellOverlays(cell: RunCell, centerY: number, pillH: number, currentTick: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const note = cell.note;
    const isDead = note.fret < 0 || note.techniques.dead === true;
    const isOpen = note.fret === 0 && !isDead;

    if (!note.techniques.harmonic) {
      const minNumberWidth = this.px(theme.geometry.runCellNumberMinWidth);
      if (cell.w >= minNumberWidth) {
        const label = isDead ? '×' : String(note.fret);
        const key = isOpen ? 'open' : isDead ? 'dead' : fingerKey(note.finger);
        ctx.font = `${theme.geometry.fretWeight} ${this.fretSize()}px Manrope, sans-serif`;
        ctx.fillStyle = isOpen ? pillTextFor(theme, 'open') : pillTextFor(theme, key);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cell.x + cell.w / 2, centerY);
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

    if (note.fingerSource === 'guess' && note.finger > 0) {
      ctx.save();
      const inset = this.px(14);
      ctx.setLineDash([this.px(3), this.px(3)]);
      ctx.strokeStyle = theme.guessRing;
      ctx.lineWidth = this.px(3);
      this.roundRectPath(cell.x + inset, centerY - pillH / 2 + inset, cell.w - inset * 2, pillH - inset * 2, this.pillRadius() * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    if (note.techniques.slide) {
      ctx.save();
      const len = this.px(theme.geometry.slideTailWidth) * 6;
      const angle = (theme.geometry.slideTailAngle * Math.PI) / 180;
      const x0 = cell.x + cell.w;
      const y0 = centerY;
      const x1 = x0 + len * Math.cos(angle);
      const y1 = y0 + len * Math.sin(angle);
      ctx.strokeStyle = theme.keyline;
      ctx.lineWidth = this.px(theme.geometry.slideTailWidth) + this.outlineWidth();
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = fingerColor(theme, note.finger);
      ctx.lineWidth = this.px(theme.geometry.slideTailWidth);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    if (note.techniques.bend) {
      ctx.save();
      const rise = this.px(theme.geometry.bendRise);
      const x0 = cell.x + cell.w / 2;
      const y0 = centerY - pillH / 2;
      ctx.strokeStyle = theme.techniqueStroke;
      ctx.lineWidth = this.px(theme.geometry.bendStemWidth);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 - rise);
      ctx.stroke();
      ctx.beginPath();
      const aw = this.px(theme.geometry.bendStemWidth) * 1.6;
      ctx.moveTo(x0 - aw, y0 - rise + aw);
      ctx.lineTo(x0, y0 - rise);
      ctx.lineTo(x0 + aw, y0 - rise + aw);
      ctx.stroke();
      ctx.restore();
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
