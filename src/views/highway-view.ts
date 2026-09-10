import type { BarMarker, NoteEvent } from '../engine/notes';
import type { Theme } from '../theme/theme';
import { inkColorFor } from '../theme/theme';

export interface HighwayViewOptions {
  canvas: HTMLCanvasElement;
  laneCount: number;
  theme: Theme;
  pxPerTick: number;
  getTick: () => number;
}

const PLAY_LINE_RATIO = 0.22;
const HIT_FLASH_MS = 120;

function fingerColor(theme: Theme, finger: 0 | 1 | 2 | 3 | 4): string {
  if (finger === 0) return theme.fingers.open;
  return theme.fingers[String(finger) as '1' | '2' | '3' | '4'];
}

/**
 * The custom "highway" — six string lanes, notes travelling right to left
 * into a play line. Reusable for a second track later (build plan 5.6):
 * takes its notes and lane count as data, never assumes "the" track.
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
  private hitNoteIds = new Map<number, number>();

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

  private laneHeight(): number {
    return this.canvas.getBoundingClientRect().height / this.laneCount;
  }

  private playLineX(): number {
    return this.canvas.getBoundingClientRect().width * PLAY_LINE_RATIO;
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

  private drawLanes(width: number): void {
    const ctx = this.ctx;
    const laneH = this.laneHeight();
    ctx.strokeStyle = this.theme.lane;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    for (let i = 0; i <= this.laneCount; i++) {
      const y = Math.round(i * laneH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayLine(height: number): void {
    const ctx = this.ctx;
    const x = Math.round(this.playLineX()) + 0.5;
    ctx.strokeStyle = this.theme.playLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  private drawBarMarkers(currentTick: number, width: number, height: number): void {
    const ctx = this.ctx;
    const rightEdgeTick = currentTick + (width - this.playLineX()) / this.pxPerTick;
    const leftEdgeTick = currentTick - this.playLineX() / this.pxPerTick;

    ctx.font = `600 12px ${'Manrope, sans-serif'}`;
    ctx.fillStyle = this.theme.text;
    ctx.textBaseline = 'top';

    for (const marker of this.barMarkers) {
      if (marker.tick < leftEdgeTick || marker.tick > rightEdgeTick) continue;
      const x = this.xForTick(marker.tick, currentTick);
      ctx.strokeStyle = this.theme.barLine;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.fillText(String(marker.barNumber), x + 4, 4);
      if (marker.sectionText) {
        ctx.save();
        ctx.font = `600 11px Manrope, sans-serif`;
        ctx.fillStyle = this.theme.playLine;
        ctx.fillText(marker.sectionText.toUpperCase(), x + 4, 20);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawNotes(currentTick: number, width: number): void {
    const ctx = this.ctx;
    const laneH = this.laneHeight();
    const minWidth = laneH * 0.7;
    const rightEdgeTick = currentTick + (width - this.playLineX()) / this.pxPerTick + 2000;
    const startIndex = this.firstVisibleIndex(currentTick - 2000);

    const chordGroups = new Map<number, NoteEvent[]>();

    for (let i = startIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.startTick > rightEdgeTick) break;

      const x = this.xForTick(note.startTick, currentTick);
      const w = Math.max((note.endTick - note.startTick) * this.pxPerTick, minWidth);
      if (x + w < 0 || x > width) continue;

      const laneIndex = note.string - 1;
      if (laneIndex < 0 || laneIndex >= this.laneCount) continue;
      const centerY = laneIndex * laneH + laneH / 2;

      this.drawPill(note, x, w, centerY, laneH, currentTick);

      if (note.isChord) {
        if (!chordGroups.has(note.startTick)) chordGroups.set(note.startTick, []);
        chordGroups.get(note.startTick)!.push(note);
      }
    }

    for (const group of chordGroups.values()) {
      if (group.length < 2) continue;
      const x = this.xForTick(group[0].startTick, currentTick);
      const ys = group.map((n) => (n.string - 1) * laneH + laneH / 2);
      ctx.strokeStyle = this.theme.text;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, Math.min(...ys));
      ctx.lineTo(x + 2, Math.max(...ys));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawPill(note: NoteEvent, x: number, w: number, centerY: number, laneH: number, currentTick: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const h = laneH * 0.62;
    const radius = Math.min(h / 2, 10);
    const color = fingerColor(theme, note.finger);
    const isOpen = note.fret === 0;
    const isHit = note.startTick <= currentTick && currentTick - note.startTick < 200;

    if (isHit) this.registerHit(note);
    const flash = this.hitFlash(note);

    ctx.save();
    if (flash > 0) {
      ctx.shadowColor = theme.hit;
      ctx.shadowBlur = 16 * flash;
      const scale = 1 + 0.08 * flash;
      ctx.translate(x + w / 2, centerY);
      ctx.scale(scale, scale);
      ctx.translate(-(x + w / 2), -centerY);
    }

    this.roundRectPath(x, centerY - h / 2, w, h, radius);

    if (note.techniques.harmonic) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, centerY - h / 2);
      ctx.lineTo(x + w, centerY);
      ctx.lineTo(x + w / 2, centerY + h / 2);
      ctx.lineTo(x, centerY);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    } else if (isOpen) {
      ctx.fillStyle = theme.stage.background;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }

    if (note.techniques.palmMute) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = theme.text;
      ctx.globalAlpha = 0.6;
      this.roundRectPath(x, centerY - h / 2, w, h, radius);
      ctx.stroke();
      ctx.restore();
    }

    if (note.fret >= 0 && !note.techniques.harmonic) {
      const label = note.techniques.dead ? '×' : String(note.fret);
      ctx.fillStyle = isOpen ? color : inkColorFor(color);
      ctx.font = `700 ${Math.max(h * 0.55, 14)}px Manrope, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + Math.min(w, laneH) / 2, centerY);
    }

    if (note.fingerSource === 'guess' && note.finger > 0) {
      ctx.beginPath();
      ctx.arc(x + Math.min(w, laneH) / 2, centerY, h * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = theme.stage.background;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (note.techniques.slide) {
      ctx.beginPath();
      ctx.moveTo(x + w, centerY - h * 0.3);
      ctx.lineTo(x + w + h * 0.5, centerY + h * 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (note.techniques.bend) {
      ctx.beginPath();
      ctx.moveTo(x + w, centerY);
      ctx.lineTo(x + w + h * 0.4, centerY - h * 0.5);
      ctx.moveTo(x + w + h * 0.25, centerY - h * 0.5);
      ctx.lineTo(x + w + h * 0.4, centerY - h * 0.5);
      ctx.lineTo(x + w + h * 0.3, centerY - h * 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    if (note.techniques.hammer || note.techniques.pull) {
      ctx.beginPath();
      ctx.strokeStyle = theme.text;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.arc(x + w, centerY, h * 0.4, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private registerHit(note: NoteEvent): void {
    const id = note.startTick * 100 + note.string;
    if (!this.hitNoteIds.has(id)) this.hitNoteIds.set(id, performance.now());
  }

  private hitFlash(note: NoteEvent): number {
    const id = note.startTick * 100 + note.string;
    const hitAt = this.hitNoteIds.get(id);
    if (hitAt === undefined) return 0;
    const elapsed = performance.now() - hitAt;
    if (elapsed > HIT_FLASH_MS) {
      this.hitNoteIds.delete(id);
      return 0;
    }
    return 1 - elapsed / HIT_FLASH_MS;
  }
}
