import type { BarMarker, NoteEvent } from '../engine/notes';
import type { Theme } from '../theme/theme';
import { pillTextFor } from '../theme/theme';

export interface HighwayViewOptions {
  canvas: HTMLCanvasElement;
  laneCount: number;
  theme: Theme;
  pxPerTick: number;
  getTick: () => number;
  /** Called after the stage changes size, so the owner can recompute px-per-tick. */
  onResize?: () => void;
}

const STAGE_BASELINE_HEIGHT = 1080;

/**
 * How one note joins the next on the same string.
 *
 * - `none` — they are separate in time.
 * - `nick`  — consecutive, but picked one at a time: a sliver of stage ground
 *   between them, so a run can be counted.
 * - `touch` — one pick for both notes (hammer-on, pull-off, legato slide).
 *   The pair is one solid rectangle, rounded only at its outer ends like any
 *   pill: square corners at the seam, full height, no notch, no bridge. The
 *   seam carries a thin straight divider instead (`legatoSeamDivider`) —
 *   both notes often share a colour, and 1 into 2 must never read as "12".
 */
type Join = 'none' | 'nick' | 'touch';

interface Placed {
  note: NoteEvent;
  /** Rendered rect. x is the note's true start; w is its musical value, less the nick. */
  x: number;
  w: number;
  /** The full width the note's duration occupies, nick included. */
  pitchW: number;
  centerY: number;
  laneIndex: number;
  joinNext: Join;
  joinPrev: Join;
}

/** A lane's place on the tilted board: flat x/y in, screen x/y out — `screen = s * flat + d`. */
interface LaneTransform {
  s: number;
  dx: number;
  dy: number;
}

/** Where the ball lands: the first beat of each onset, on its highest string. */
interface Onset {
  tick: number;
  laneIndex: number;
}

interface Span {
  startX: number;
  endX: number;
  laneIndex: number;
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
  if (rounded === 0.5) return '½';
  if (rounded === 1) return 'full';
  if (rounded === 1.5) return '1½';
  return String(rounded);
}

function fingerColor(theme: Theme, finger: 0 | 1 | 2 | 3 | 4): string {
  const key = fingerKey(finger);
  return key === 'open' ? theme.fingers.open : theme.fingers[key];
}

/** A note played with one pick together with the note after it. */
function isOnePick(note: NoteEvent): boolean {
  return (
    note.techniques.hammer === true ||
    note.techniques.pull === true ||
    (note.techniques.slideOut !== undefined && note.techniques.slideLegato === true)
  );
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
  private onResize?: () => void;
  private notes: NoteEvent[] = [];
  private barMarkers: BarMarker[] = [];
  private rafId = 0;
  private obsMode = false;
  private chordPills = true;
  private hitNoteIds = new Map<number, number>();
  private onsets: Onset[] = [];
  /** Perspective constants, refreshed once a frame (see `refreshBoard`). */
  private board = { top: 0, height: 1, k: 0, norm: 0, vx: 0 };
  /** Cached winding texture per gauge, so a wound string isn't re-ticked every frame. */
  private windingCache = new Map<string, CanvasPattern | null>();
  /** Last frame's laid-out pills, so a click can be mapped back to a note. */
  private lastLayout: { note: NoteEvent; x: number; w: number; centerY: number; h: number; laneIndex: number }[] = [];

  constructor(options: HighwayViewOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    this.ctx = ctx;
    this.laneCount = options.laneCount;
    this.theme = options.theme;
    this.pxPerTick = options.pxPerTick;
    this.getTick = options.getTick;
    this.onResize = options.onResize;
    this.resize();
  }

  setNotes(notes: NoteEvent[]): void {
    this.notes = notes;
    this.onsets = [];
    for (const note of notes) {
      const laneIndex = note.string - 1;
      const last = this.onsets[this.onsets.length - 1];
      if (last && last.tick === note.startTick) last.laneIndex = Math.min(last.laneIndex, laneIndex);
      else this.onsets.push({ tick: note.startTick, laneIndex });
    }
  }

  setBarMarkers(markers: BarMarker[]): void {
    this.barMarkers = markers;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.windingCache.clear();
  }

  setObsMode(obs: boolean): void {
    this.obsMode = obs;
  }

  /** Collapse a named chord into one pill across the strings, instead of a fret number per string. */
  setChordPills(on: boolean): void {
    this.chordPills = on;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.windingCache.clear();
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

  /** Ground left under the nearest string, so its notes clear the board's bottom edge. */
  private footHeight(): number {
    return this.px(this.theme.board?.nearMargin ?? 0);
  }

  private laneHeight(): number {
    return (this.stageHeight() - this.headerHeight() - this.footHeight()) / this.laneCount;
  }

  private laneCenterY(laneIndex: number): number {
    return this.headerHeight() + laneIndex * this.laneHeight() + this.laneHeight() / 2;
  }

  // ---- the tilted board ----------------------------------------------
  //
  // Everything is laid out flat, exactly as before — six even lanes, notes at
  // their tick — and then stood on a board that leans away from the viewer,
  // the way you look down at your own neck: the low E nearest and largest,
  // the high e furthest and smallest. Each lane is drawn under its own
  // uniform scale, so a pill on the far string is a smaller copy of a near
  // one, never squashed. Lanes are also spaced by that scale, which keeps
  // every pill sitting in the same share of its lane on every string.

  private refreshBoard(width: number): void {
    const far = Math.min(Math.max(this.theme.board?.farScale ?? 1, 0.3), 1);
    const k = 1 / far - 1;
    this.board = {
      top: this.headerHeight(),
      height: Math.max(this.stageHeight() - this.headerHeight() - this.footHeight(), 1),
      k,
      norm: k > 1e-6 ? Math.log(1 + k) : 0,
      vx: width * (this.theme.board?.vanishX ?? 0.5),
    };
  }

  /** Local scale at a point `u` down the board (0 = far edge, 1 = near edge). Averages 1 across the board. */
  private sigma(u: number): number {
    const { k, norm } = this.board;
    if (norm === 0) return 1;
    const uc = Math.min(Math.max(u, 0), 1);
    return k / (1 + k * (1 - uc)) / norm;
  }

  /** Screen y for a point `u` down the board, extended straight beyond its edges. */
  private boardY(u: number): number {
    const { top, height, k, norm } = this.board;
    if (norm === 0) return top + u * height;
    const uc = Math.min(Math.max(u, 0), 1);
    const g = (norm - Math.log(1 + k * (1 - uc))) / norm;
    return top + height * (g + (u - uc) * this.sigma(uc));
  }

  private uFor(flatY: number): number {
    return (flatY - this.board.top) / this.board.height;
  }

  /** Flat → screen for an arbitrary point (bar lines, beat lines, the play line). */
  private project(x: number, flatY: number): { x: number; y: number; s: number } {
    const u = this.uFor(flatY);
    const s = this.sigma(u);
    return { x: this.board.vx + (x - this.board.vx) * s, y: this.boardY(u), s };
  }

  private laneTransform(laneIndex: number): LaneTransform {
    const c = this.laneCenterY(laneIndex);
    const u = this.uFor(c);
    const s = this.sigma(u);
    return { s, dx: this.board.vx * (1 - s), dy: this.boardY(u) - c * s };
  }

  private applyLane(t: LaneTransform, x: number, y: number): { x: number; y: number } {
    return { x: t.s * x + t.dx, y: t.s * y + t.dy };
  }

  /** Runs `draw` in a lane's own flat coordinates, scaled and placed on the board. */
  private withLane(laneIndex: number, draw: () => void): void {
    const t = this.laneTransform(laneIndex);
    this.ctx.save();
    this.ctx.transform(t.s, 0, 0, t.s, t.dx, t.dy);
    draw();
    this.ctx.restore();
  }

  /** The flat x-range that lands on screen anywhere on the board — wider than the canvas when the far edge is shrunk. */
  private flatXRange(width: number): [number, number] {
    const s = Math.min(this.sigma(0), 1);
    const vx = this.board.vx;
    return [vx - vx / s, vx + (width - vx) / s];
  }

  private pillHeight(): number {
    return this.laneHeight() * this.theme.geometry.pillHeightRatio;
  }

  private pillRadius(): number {
    return this.pillHeight() * this.theme.geometry.pillRadiusRatio;
  }

  /** Narrowest a pill may be and still carry a readable (shrunken) fret number. */
  private minNumberWidth(): number {
    return this.px(this.theme.geometry.runCellNumberMinWidth) * 0.7;
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

  /**
   * The stage changes size without the window doing so — entering presentation
   * mode is the obvious case. Watching for it with an observer proved
   * unreliable, and the cost of being wrong is the whole highway drawn at the
   * wrong scale, so the size is simply checked on every frame instead.
   */
  private syncSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const wantWidth = Math.round(rect.width * dpr);
    const wantHeight = Math.round(rect.height * dpr);
    if (this.canvas.width === wantWidth && this.canvas.height === wantHeight) return;
    if (wantWidth === 0 || wantHeight === 0) return;
    this.resize();
    this.onResize?.();
  }

  private renderFrame(): void {
    this.syncSize();
    const { width, height } = this.canvas.getBoundingClientRect();
    const ctx = this.ctx;
    const currentTick = this.getTick();

    ctx.clearRect(0, 0, width, height);
    this.refreshBoard(width);
    this.drawBoard(width, height);
    this.drawGrid(currentTick, width);
    this.drawStrings(width);
    this.drawNotes(currentTick, width);
    this.drawPlayLine();
    this.drawBall(currentTick);
    this.drawHandLegend(width);
  }

  // ---- the board ----------------------------------------------------

  /**
   * A solid ground for the whole stage, OBS included: cream notes over a
   * live camera feed weren't readable, so the highway brings its own dark
   * board and the camera shows above it instead of through it.
   */
  private drawBoard(width: number, height: number): void {
    const ctx = this.ctx;
    const board = this.theme.board;
    const far = board?.background ?? this.theme.stage.background;
    const near = board?.backgroundNear ?? far;
    const ground = ctx.createLinearGradient(0, 0, 0, height);
    ground.addColorStop(0, far);
    ground.addColorStop(1, near);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, width, height);

    if (board?.edge) {
      ctx.save();
      ctx.strokeStyle = board.edge;
      ctx.globalAlpha = board.edgeOpacity ?? 0.5;
      ctx.lineWidth = this.px(2);
      const y = Math.round(this.board.top) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A line across the board at one tick — leaning with the perspective, like a fret seen from above. */
  private strokeBoardLine(flatX: number, color: string, alpha: number, lineWidth: number): void {
    const ctx = this.ctx;
    const steps = 8;
    // Down through the margin under the low E to the board's very edge.
    const span = this.board.height + this.footHeight();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const point = this.project(flatX, this.board.top + (span * i) / steps);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Bar lines, plus faint beat lines between them and fainter still on the
   * off-beats, so a note's place in the bar — on the beat, on the "and" —
   * can be seen as well as heard.
   */
  private drawGrid(currentTick: number, width: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const board = theme.board;
    const [minX, maxX] = this.flatXRange(width);
    const leftEdgeTick = currentTick + (minX - this.playLineX()) / this.pxPerTick;
    const rightEdgeTick = currentTick + (maxX - this.playLineX()) / this.pxPerTick;
    const beatColor = board?.beatLine ?? theme.barLine;
    const beatAlpha = board?.beatLineOpacity ?? 0.22;
    const offbeatAlpha = board?.offbeatLineOpacity ?? 0;

    for (let m = 0; m < this.barMarkers.length; m++) {
      const marker = this.barMarkers[m];
      const barEnd = this.barMarkers[m + 1]?.tick ?? marker.tick + marker.beats * marker.beatTicks;
      if (barEnd < leftEdgeTick || marker.tick > rightEdgeTick) continue;

      for (let half = 1; half < marker.beats * 2; half++) {
        const tick = marker.tick + (half * marker.beatTicks) / 2;
        if (tick >= barEnd) break;
        const onBeat = half % 2 === 0;
        if (!onBeat && offbeatAlpha <= 0) continue;
        this.strokeBoardLine(
          this.xForTick(tick, currentTick),
          beatColor,
          onBeat ? beatAlpha : offbeatAlpha,
          this.px(onBeat ? 2 : 1.5),
        );
      }

      const x = this.xForTick(marker.tick, currentTick);
      this.strokeBoardLine(x, theme.barLine, theme.barLineOpacity, this.px(2.5));

      // The bar number stands on the board's far edge at the top of its
      // bar line, with the section name (if one starts here) beside it.
      const top = this.project(x, this.board.top);
      const labelY = top.y - this.px(10);
      ctx.save();
      ctx.font = `700 ${this.px(30)}px Manrope, sans-serif`;
      ctx.fillStyle = theme.textMuted;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const number = String(marker.barNumber);
      ctx.fillText(number, top.x + this.px(4), labelY);
      if (marker.sectionText) {
        const after = top.x + this.px(4) + ctx.measureText(number).width + this.px(12);
        ctx.font = `700 ${this.px(24)}px Manrope, sans-serif`;
        ctx.fillStyle = theme.textEyebrow;
        ctx.fillText(marker.sectionText.toUpperCase(), after, labelY);
      }
      ctx.restore();
    }
  }

  /**
   * Six real strings rather than six lanes: thin plain steel for the top
   * three, thicker bronze-wound for the bottom three, so which string a note
   * is on can be seen from the string itself. Each one is drawn across the
   * whole board at its own gauge, shrunk with the perspective.
   */
  private drawStrings(width: number): void {
    const ctx = this.ctx;
    const spec = this.theme.strings;
    for (let lane = 0; lane < this.laneCount; lane++) {
      const t = this.laneTransform(lane);
      const y = t.s * this.laneCenterY(lane) + t.dy;
      const gauge = this.px(spec?.gauges[lane] ?? 2) * t.s;
      const wound = spec?.wound[lane] ?? false;
      const colors = wound ? spec?.woundColors : spec?.plainColors;
      if (!colors) {
        ctx.save();
        ctx.strokeStyle = this.theme.lane;
        ctx.globalAlpha = this.theme.laneOpacity;
        ctx.lineWidth = gauge;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      // A soft shadow on the board under the string lifts it off the wood.
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, y - gauge / 2 + gauge * 0.6, width, gauge);
      ctx.restore();

      const metal = ctx.createLinearGradient(0, y - gauge / 2, 0, y + gauge / 2);
      metal.addColorStop(0, colors.dark);
      metal.addColorStop(0.35, colors.light);
      metal.addColorStop(0.6, colors.mid);
      metal.addColorStop(1, colors.dark);
      ctx.fillStyle = metal;
      ctx.fillRect(0, y - gauge / 2, width, gauge);

      if (wound) {
        const pattern = this.windingPattern(gauge, colors.dark);
        if (pattern) {
          ctx.save();
          ctx.fillStyle = pattern;
          ctx.globalAlpha = 0.6;
          ctx.translate(0, y - gauge / 2);
          ctx.fillRect(0, 0, width, gauge);
          ctx.restore();
        }
      }
    }
  }

  /** The slanted ticks of a wound string's outer wrap, drawn once per gauge and tiled. */
  private windingPattern(gauge: number, ink: string): CanvasPattern | null {
    const dpr = window.devicePixelRatio || 1;
    const key = `${Math.round(gauge * 10)}:${ink}`;
    const cached = this.windingCache.get(key);
    if (cached !== undefined) return cached;
    const pitch = Math.max(gauge * 0.55, 2);
    const tile = document.createElement('canvas');
    tile.width = Math.max(Math.round(pitch * dpr), 2);
    tile.height = Math.max(Math.round(gauge * dpr), 2);
    const tctx = tile.getContext('2d');
    let pattern: CanvasPattern | null = null;
    if (tctx) {
      tctx.strokeStyle = ink;
      tctx.lineWidth = Math.max(tile.width * 0.32, 1);
      const lean = tile.height * 0.45;
      tctx.beginPath();
      for (let x = -tile.width; x <= tile.width * 2; x += tile.width) {
        tctx.moveTo(x - lean / 2, tile.height);
        tctx.lineTo(x + lean / 2, 0);
      }
      tctx.stroke();
      pattern = this.ctx.createPattern(tile, 'repeat-x');
      pattern?.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr));
    }
    this.windingCache.set(key, pattern);
    return pattern;
  }

  private drawPlayLine(): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const top = this.project(this.playLineX(), this.board.top);
    const bottom = this.project(this.playLineX(), this.board.top + this.board.height);
    const mid = this.project(this.playLineX(), this.board.top + this.board.height / 2);
    const w = this.px(theme.playLineWidth);
    const cap = this.px(theme.playLineCapSize);
    const keylineW = this.px(theme.keylineWidth);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.quadraticCurveTo(2 * mid.x - (top.x + bottom.x) / 2, 2 * mid.y - (top.y + bottom.y) / 2, bottom.x, bottom.y);
    };

    ctx.save();
    ctx.globalAlpha = theme.board?.playLineOpacity ?? 1;
    ctx.strokeStyle = 'rgba(13,17,11,0.92)';
    ctx.lineWidth = w + keylineW * 2;
    path();
    ctx.stroke();
    ctx.strokeStyle = theme.playLine;
    ctx.lineWidth = w;
    path();
    ctx.stroke();

    ctx.fillStyle = theme.playLine;
    ctx.beginPath();
    ctx.moveTo(top.x - (cap * top.s) / 2, top.y);
    ctx.lineTo(top.x + (cap * top.s) / 2, top.y);
    ctx.lineTo(top.x, top.y + cap * top.s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bottom.x - (cap * bottom.s) / 2, bottom.y);
    ctx.lineTo(bottom.x + (cap * bottom.s) / 2, bottom.y);
    ctx.lineTo(bottom.x, bottom.y - cap * bottom.s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- the ball ----------------------------------------------------

  /**
   * A ball that hops from each note onto the next, landing as it is played.
   * The hop's height grows with the gap, and the dotted arcs ahead show the
   * hops still to come — so how long until the next note can be read off the
   * board before it arrives, not only heard.
   */
  private drawBall(currentTick: number): void {
    const spec = this.theme.ball;
    if (!spec || this.onsets.length === 0) return;
    const ctx = this.ctx;

    // The last onset at or before now — the ball is in flight from it.
    let lo = 0;
    let hi = this.onsets.length - 1;
    let from = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.onsets[mid].tick <= currentTick) {
        from = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const radius = this.px(spec.radius);
    const leadIn = spec.leadInTicks ?? 1920;
    // Before the first note the ball drops in from the far edge of the board.
    const first = this.onsets[0];
    const hopStart = (index: number): Onset =>
      index >= 0 ? this.onsets[index] : { tick: first.tick - leadIn, laneIndex: -1 };
    if (from < 0 && currentTick < first.tick - leadIn) return;
    if (from === this.onsets.length - 1 && currentTick - this.onsets[from].tick > leadIn) return;

    const landing = (onset: Onset): { x: number; y: number; s: number } => {
      const x = this.xForTick(onset.tick, currentTick);
      if (onset.laneIndex < 0) {
        const edge = this.project(x, this.board.top);
        return { x: edge.x, y: edge.y - radius * edge.s, s: edge.s };
      }
      const t = this.laneTransform(onset.laneIndex);
      const p = this.applyLane(t, x, this.laneCenterY(onset.laneIndex) - this.pillHeight() / 2 - radius);
      return { ...p, s: t.s };
    };

    const hopPoint = (a: { x: number; y: number; s: number }, b: { x: number; y: number; s: number }, p: number) => {
      const s = a.s + (b.s - a.s) * p;
      const span = Math.abs(b.x - a.x);
      const rise = Math.min(Math.max(span * (spec.risePerPx ?? 0.3), this.px(spec.minRise ?? 18)), this.px(spec.maxRise));
      let y = a.y + (b.y - a.y) * p - 4 * rise * s * p * (1 - p);
      y = Math.max(y, radius * s);
      return { x: a.x + (b.x - a.x) * p, y, s };
    };

    // Dotted trail: the rest of the current hop, then the next few in full.
    ctx.save();
    ctx.fillStyle = spec.trail;
    ctx.globalAlpha = spec.trailOpacity;
    const spacing = this.px(spec.dotSpacing ?? 16);
    for (let hop = 0; hop < (spec.hopsAhead ?? 5); hop++) {
      const aIndex = from + hop;
      if (aIndex + 1 >= this.onsets.length) break;
      const a = landing(hopStart(aIndex));
      const b = landing(this.onsets[aIndex + 1]);
      if (a.x > this.canvas.getBoundingClientRect().width) break;
      const p0 = hop === 0 ? this.hopProgress(hopStart(aIndex).tick, this.onsets[aIndex + 1].tick, currentTick) : 0;
      const steps = Math.max(Math.ceil((Math.abs(b.x - a.x) * 1.3) / spacing), 2);
      for (let i = Math.ceil(p0 * steps) + 1; i < steps; i++) {
        const point = hopPoint(a, b, i / steps);
        ctx.beginPath();
        ctx.arc(point.x, point.y, this.px(spec.dotRadius ?? 3) * point.s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // The ball itself.
    let ball: { x: number; y: number; s: number };
    if (from === this.onsets.length - 1) {
      ball = landing(this.onsets[from]);
    } else {
      const startOnset = hopStart(from);
      const endOnset = this.onsets[from + 1];
      ball = hopPoint(landing(startOnset), landing(endOnset), this.hopProgress(startOnset.tick, endOnset.tick, currentTick));
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius * ball.s, 0, Math.PI * 2);
    ctx.fillStyle = spec.color;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = this.px(8);
    ctx.shadowOffsetY = this.px(3);
    ctx.fill();
    ctx.restore();
  }

  private hopProgress(fromTick: number, toTick: number, currentTick: number): number {
    if (toTick <= fromTick) return 1;
    return Math.min(Math.max((currentTick - fromTick) / (toTick - fromTick), 0), 1);
  }

  // ---- the hand ----------------------------------------------------

  /**
   * Which colour is which finger, as a hand: a fretting hand seen palm-on,
   * thumb to the left, so the fingertips read 1 2 3 4 left to right.
   */
  private drawHandLegend(width: number): void {
    const spec = this.theme.handLegend;
    if (!spec?.show) return;
    const ctx = this.ctx;
    const theme = this.theme;
    // It stands in the strip above the board and may dip into the board's
    // far margin, but never down to the high e string.
    const floor = this.board.top + (this.boardY(this.uFor(this.laneCenterY(0))) - this.board.top) * 0.45;
    const h = Math.min(floor - this.px(6), this.px(spec.height ?? 80));
    if (h < 18) return;
    const fingerW = h * 0.2;
    const gap = h * 0.04;
    const palmW = fingerW * 4 + gap * 3;
    const right = width - this.px(spec.inset ?? 24);
    const left = right - palmW;
    const bottom = floor;
    const palmTop = bottom - h * 0.36;
    const lengths = [0.86, 1, 0.92, 0.72];

    ctx.save();
    ctx.globalAlpha = spec.opacity ?? 1;
    ctx.fillStyle = spec.skin;
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.px(1.5);

    // Thumb, angled out to the left.
    ctx.save();
    ctx.translate(left + fingerW * 0.2, palmTop + h * 0.2);
    ctx.rotate(-0.7);
    this.roundRectPath(-fingerW, -h * 0.42, fingerW, h * 0.5, fingerW / 2, fingerW / 2, fingerW / 2, fingerW / 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    this.roundRectPath(left, palmTop, palmW, bottom - palmTop, fingerW * 0.4, fingerW * 0.4, fingerW * 0.7, fingerW * 0.7);
    ctx.fill();
    ctx.stroke();

    for (let f = 0; f < 4; f++) {
      const fx = left + f * (fingerW + gap);
      const len = h * 0.62 * lengths[f];
      const top = palmTop + fingerW * 0.4 - len;
      const r = fingerW / 2;
      this.roundRectPath(fx, top, fingerW, palmTop - top + fingerW * 0.4, r, r, 0, 0);
      ctx.fillStyle = spec.skin;
      ctx.fill();
      ctx.stroke();

      // The fingertip in its finger's colour, with its number.
      const key = String(f + 1) as '1' | '2' | '3' | '4';
      ctx.beginPath();
      ctx.arc(fx + r, top + r, r, 0, Math.PI * 2);
      ctx.fillStyle = theme.fingers[key];
      ctx.fill();
      ctx.stroke();
      ctx.font = `700 ${fingerW * 0.78}px Manrope, sans-serif`;
      ctx.fillStyle = pillTextFor(theme, key);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key, fx + r, top + r + fingerW * 0.04);
    }
    ctx.restore();
  }

  // ---- notes ----------------------------------------------------

  /**
   * The width a note's duration occupies. Nothing else is allowed to change
   * it: two notes of the same musical value are always drawn the same length,
   * or the highway starts telling you one of them is held longer than it is.
   * A tie sustain continues past it as a separate bar.
   */
  private pitchWidth(note: NoteEvent): number {
    const headEndTick = note.tieBarStartTick ?? note.endTick;
    return Math.max((headEndTick - note.startTick) * this.pxPerTick, 1);
  }

  private drawNotes(currentTick: number, width: number): void {
    const [minX, maxX] = this.flatXRange(width);
    const rightEdgeTick = currentTick + (maxX - this.playLineX()) / this.pxPerTick + 2000;
    const startIndex = this.firstVisibleIndex(currentTick + (minX - this.playLineX()) / this.pxPerTick - 2000);

    const byLane = new Map<number, Placed[]>();
    const chordGroups = new Map<number, Placed[]>();
    const namedChords = new Map<number, Placed[]>();
    const tieNotes: Placed[] = [];
    const muted: Span[] = [];

    for (let i = startIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.startTick > rightEdgeTick) break;

      const x = this.xForTick(note.startTick, currentTick);
      const pitchW = this.pitchWidth(note);
      // Every pill gives up the same nick from its tail, so notes never fuse
      // and every note of a given value still comes out the same length.
      const w = Math.max(pitchW - this.px(this.theme.geometry.nickGap), this.px(6));
      if (x + pitchW < minX || x > maxX) continue;

      const laneIndex = note.string - 1;
      if (laneIndex < 0 || laneIndex >= this.laneCount) continue;

      const item: Placed = {
        note,
        x,
        w,
        pitchW,
        centerY: this.laneCenterY(laneIndex),
        laneIndex,
        joinNext: 'none',
        joinPrev: 'none',
      };

      if (note.techniques.palmMute) {
        muted.push({ startX: x, endX: this.xForTick(note.endTick, currentTick), laneIndex });
      }

      // A named chord is drawn once, across the strings — its notes never
      // reach the per-lane layout at all.
      if (this.chordPills && note.chordName) {
        if (!namedChords.has(note.startTick)) namedChords.set(note.startTick, []);
        namedChords.get(note.startTick)!.push(item);
        continue;
      }

      if (!byLane.has(laneIndex)) byLane.set(laneIndex, []);
      byLane.get(laneIndex)!.push(item);

      if (note.isChord) {
        if (!chordGroups.has(note.startTick)) chordGroups.set(note.startTick, []);
        chordGroups.get(note.startTick)!.push(item);
      }
      if (note.tieBarStartTick !== undefined) tieNotes.push(item);
    }

    this.drawPalmMuteRail(muted);

    // Chord joins first, so they sit behind the pills rather than over them.
    this.drawChordJoins(chordGroups);

    this.lastLayout = [];

    for (const [laneIndex, laneNotes] of byLane) {
      laneNotes.sort((a, b) => a.x - b.x);
      this.layoutLane(laneNotes);
      this.withLane(laneIndex, () => {
        this.drawLegatoChains(laneNotes);
        this.drawSlideRails(laneNotes);
        for (let i = 0; i < laneNotes.length; i++) this.drawMarks(laneNotes[i], laneNotes[i + 1], currentTick);
      });
    }

    this.drawChordPills([...namedChords.values()]);
    this.drawTieBars(tieNotes, currentTick);
  }

  /**
   * Decides how each note joins the next. It changes no widths: a pill is as
   * long as its note and nothing else, so every sixteenth on the stage is the
   * same length as every other sixteenth.
   */
  private layoutLane(laneNotes: Placed[]): void {
    const mergeGap = this.px(this.theme.geometry.runMergeGap);
    for (let i = 0; i < laneNotes.length - 1; i++) {
      const a = laneNotes[i];
      const b = laneNotes[i + 1];
      if (b.x - (a.x + a.pitchW) >= mergeGap) continue;
      const join: Join = isOnePick(a.note) ? 'touch' : 'nick';
      a.joinNext = join;
      b.joinPrev = join;
    }
  }

  /**
   * Walks a lane's notes and draws each maximal run of `touch`-joined notes
   * (hammer-on, pull-off, legato slide) as one union shape: every cell fills
   * in its own finger colour and butts flush against its neighbour, then the
   * merged silhouette is stroked exactly once. A chain of one is just an
   * ordinary pill. Harmonics never join a chain — they keep their diamond.
   */
  private drawLegatoChains(laneNotes: Placed[]): void {
    let i = 0;
    while (i < laneNotes.length) {
      let j = i;
      while (
        j + 1 < laneNotes.length &&
        laneNotes[j].joinNext === 'touch' &&
        !laneNotes[j].note.techniques.harmonic &&
        !laneNotes[j + 1].note.techniques.harmonic
      ) {
        j++;
      }
      const chain = laneNotes.slice(i, j + 1);
      if (chain.length === 1) this.drawPill(chain[0]);
      else this.drawChain(chain);
      i = j + 1;
    }
  }

  /** Walks a lane's notes and draws one contour rail per maximal chain of slide-linked notes. */
  private drawSlideRails(laneNotes: Placed[]): void {
    let i = 0;
    while (i < laneNotes.length) {
      const note = laneNotes[i].note;
      if (note.techniques.slideOut === undefined && note.techniques.slideIn === undefined) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < laneNotes.length && laneNotes[j].note.techniques.slideOut !== undefined) j++;
      this.drawSlideRail(laneNotes.slice(i, j + 1));
      i = j + 1;
    }
  }

  /**
   * A legato chain of two or more notes. Each cell's *rendered* rect is
   * widened only where it touches the next cell (flush, no gap, plus
   * `legatoSeamOverlap` to kill the antialiasing hairline) — the note's own
   * width, used for its fret number and for hit-testing, never changes.
   */
  private drawChain(chain: Placed[]): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const pillH = this.pillHeight();
    const top = chain[0].centerY - pillH / 2;
    const r = this.pillRadius();
    const overlap = this.px(theme.geometry.legatoSeamOverlap);

    const cells = chain.map((item, idx) => ({
      x: item.x,
      w: idx < chain.length - 1 ? chain[idx + 1].x - item.x : item.w,
    }));

    // Clipped to the chain's outline: an unclipped fill is a plain rectangle,
    // which pokes past the rounded outer corners.
    ctx.save();
    this.unionRoundRectPath(cells, top, pillH, r);
    ctx.clip();
    for (let idx = 0; idx < chain.length; idx++) {
      const note = chain[idx].note;
      const isDead = note.fret < 0 || note.techniques.dead === true;
      const isOpen = note.fret === 0 && !isDead;
      const cell = cells[idx];
      const fx = idx > 0 ? cell.x - overlap : cell.x;
      const fw = cell.w + (idx > 0 ? overlap : 0) + (idx < chain.length - 1 ? overlap : 0);
      ctx.fillStyle = isOpen ? theme.fingers.open : isDead ? theme.dead : fingerColor(theme, note.finger);
      ctx.fillRect(fx, top, fw, pillH);
    }
    ctx.restore();

    // A straight divider at each seam, so two notes sharing a colour still
    // read as two numbers. Lighter than the outline, and drawn before it so
    // the outline's own edge stays clean where they meet.
    const dividerWidth = this.px(theme.geometry.legatoSeamDivider ?? 0);
    if (dividerWidth > 0) {
      ctx.save();
      ctx.strokeStyle = theme.keyline;
      ctx.globalAlpha = theme.geometry.legatoSeamDividerOpacity ?? 0.55;
      ctx.lineWidth = dividerWidth;
      ctx.beginPath();
      for (let idx = 1; idx < cells.length; idx++) {
        ctx.moveTo(cells[idx].x, top);
        ctx.lineTo(cells[idx].x, top + pillH);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    this.unionRoundRectPath(cells, top, pillH, r);
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.outlineWidth();
    ctx.stroke();
    ctx.restore();

    for (let idx = 0; idx < chain.length; idx++) {
      const item = chain[idx];
      // The hit-test rect is split at the seam (flush, so the cell's own
      // touching edge is the split point) — the same rect just filled.
      this.lastLayout.push({ note: item.note, x: cells[idx].x, w: cells[idx].w, centerY: item.centerY, h: pillH, laneIndex: item.laneIndex });
      this.drawPillLabel(item);
    }
  }

  /**
   * Traces N flush, same-height cells as one rectangle: rounded at the two
   * outer ends only, straight top and bottom edges across every seam.
   */
  private unionRoundRectPath(cells: { x: number; w: number }[], top: number, height: number, radius: number): void {
    const rad = (w: number) => Math.max(0, Math.min(radius, w / 2, height / 2));
    const first = cells[0];
    const last = cells[cells.length - 1];
    const left = rad(first.w);
    const right = rad(last.w);
    this.roundRectPath(first.x, top, last.x + last.w - first.x, height, left, right, right, left);
  }

  private drawPill(item: Placed): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const note = item.note;
    const pillH = this.pillHeight();
    const top = item.centerY - pillH / 2;
    const isDead = note.fret < 0 || note.techniques.dead === true;
    const isOpen = note.fret === 0 && !isDead;

    if (note.techniques.harmonic) {
      this.drawHarmonic(item);
      this.lastLayout.push({ note, x: item.x, w: item.w, centerY: item.centerY, h: pillH, laneIndex: item.laneIndex });
      return;
    }

    const r = this.pillRadius();

    ctx.save();
    this.roundRectPath(item.x, top, item.w, pillH, r, r, r, r);
    ctx.fillStyle = isOpen ? theme.fingers.open : isDead ? theme.dead : fingerColor(theme, note.finger);
    ctx.fill();
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.outlineWidth();
    ctx.stroke();
    ctx.restore();

    this.drawPillLabel(item);
    this.lastLayout.push({ note, x: item.x, w: item.w, centerY: item.centerY, h: pillH, laneIndex: item.laneIndex });
  }

  /** The fret number (or the dead-note ×), centred on the note's own rect — never the seam-widened chain cell. */
  private drawPillLabel(item: Placed): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const note = item.note;
    const pillH = this.pillHeight();
    const isDead = note.fret < 0 || note.techniques.dead === true;
    const isOpen = note.fret === 0 && !isDead;
    const key = isOpen ? 'open' : isDead ? 'dead' : fingerKey(note.finger);
    const ink = pillTextFor(theme, key);

    if (isDead) {
      // Strokes rather than a glyph: a scratch cell is narrower than its
      // duration, and a text × at pill size ran over its neighbours.
      const arm = Math.min(item.w, pillH) * 0.26;
      const cx = item.x + item.w / 2;
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(this.px(3), arm * 0.32);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - arm, item.centerY - arm);
      ctx.lineTo(cx + arm, item.centerY + arm);
      ctx.moveTo(cx + arm, item.centerY - arm);
      ctx.lineTo(cx - arm, item.centerY + arm);
      ctx.stroke();
      ctx.restore();
    } else if (item.w >= this.minNumberWidth()) {
      const label = String(note.fret);
      const size = this.fittedFontSize(label, this.fretSize(), item.w * 0.78, theme.geometry.fretWeight);
      ctx.font = `${theme.geometry.fretWeight} ${size}px Manrope, sans-serif`;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, item.x + item.w / 2, item.centerY);
    }
  }

  /**
   * A harmonic is a diamond rather than a pill, sized from the lane like every
   * other note, with the number fitted to the width across its waist.
   */
  private drawHarmonic(item: Placed): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const pillH = this.pillHeight();
    const half = (pillH / 2) * theme.geometry.harmonicSizeRatio;
    const side = half * Math.SQRT1_2 * 2;
    const cx = item.x + item.w / 2;

    ctx.save();
    ctx.translate(cx, item.centerY);
    ctx.rotate((theme.geometry.harmonicRotation * Math.PI) / 180);
    ctx.fillStyle = fingerColor(theme, item.note.finger);
    const r = this.px(4);
    this.roundRectPath(-side / 2, -side / 2, side, side, r, r, r, r);
    ctx.fill();
    ctx.strokeStyle = theme.keyline;
    ctx.lineWidth = this.outlineWidth();
    ctx.stroke();
    ctx.restore();

    const label = String(item.note.fret);
    const preferred = this.fretSize() * 0.82;
    const size = this.fittedFontSize(label, preferred, Math.max(half * 2 - preferred, this.px(12)), 700);
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    ctx.fillStyle = pillTextFor(theme, fingerKey(item.note.finger));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, item.centerY);
  }

  // ---- marks above the lane ----------------------------------------

  /**
   * Every technique mark is drawn in the clear space above the pill rather
   * than in the note's own width — a mark that eats width makes the note that
   * begins the gesture the least readable thing on the lane.
   */
  private drawMarks(item: Placed, next: Placed | undefined, currentTick: number): void {
    const note = item.note;
    const pillH = this.pillHeight();

    if (note.techniques.hammer || note.techniques.pull) {
      this.drawHammerMark(item, next, note.techniques.pull === true);
    }
    if (note.techniques.bend) this.drawBend(item, pillH, note.techniques.bendFrets);

    this.drawHitEffect(item, pillH, currentTick);
  }

  /** Clear space between the top of a pill and the lane line above it. */
  private markBaseY(item: Placed): number {
    return item.centerY - this.pillHeight() / 2 - this.px(this.theme.geometry.markGap);
  }

  private strokeWithHalo(path: () => void, width: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.theme.keyline;
    ctx.lineWidth = width + this.outlineWidth() * 2.5;
    path();
    ctx.stroke();
    ctx.strokeStyle = this.theme.techniqueStroke;
    ctx.lineWidth = width;
    path();
    ctx.stroke();
    ctx.restore();
  }

  private label(text: string, x: number, y: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 ${size}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.px(5);
    ctx.strokeStyle = this.theme.keyline;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = this.theme.techniqueStroke;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * The slide is a contour rail, not a diagonal symbol: each note in a slide
   * chain gets a short flat plateau at its own level in the clear lane above
   * the string, and the diagonal only travels between plateaus. A chain of
   * `5 4 5 5` then reads high–down–low–up–high, which is what the hand does.
   * A note too short to carry a plateau drops it and lets the riser run
   * corner to corner instead of taking width from the note.
   */
  private drawSlideRail(chain: Placed[]): void {
    if (chain.length < 2) {
      this.drawSlideStub(chain[0]);
      return;
    }
    const ctx = this.ctx;
    const theme = this.theme;
    const g = theme.geometry;
    const laneTop = chain[0].centerY - this.laneHeight() / 2;
    const stepPx = this.px(g.slideRailStep ?? 20);
    const topPx = this.px(g.slideRailTop ?? 5);
    const maxLevels = g.slideRailMaxLevels ?? 3;
    const insetPx = this.px(g.slideRailPlateauInset ?? 5);
    const minPlateauPx = this.px(g.slideRailMinPlateau ?? 16);

    const levels: number[] = [0];
    for (let idx = 1; idx < chain.length; idx++) {
      const dir = chain[idx - 1].note.techniques.slideOut;
      levels.push(levels[idx - 1] + (dir === 'up' ? -1 : 1));
    }
    const minLevel = Math.min(...levels);
    const clamped = levels.map((l) => Math.max(0, Math.min(maxLevels - 1, l - minLevel)));
    const yFor = (level: number) => laneTop + topPx + level * stepPx;

    const points: { x: number; y: number }[] = [];
    chain.forEach((item, idx) => {
      const y = yFor(clamped[idx]);
      if (item.w - insetPx * 2 >= minPlateauPx) {
        points.push({ x: item.x + insetPx, y });
        points.push({ x: item.x + item.w - insetPx, y });
      } else {
        points.push({ x: item.x + item.w / 2, y });
      }
    });

    const colour = theme.slideRailUseFingerColour
      ? fingerColor(theme, chain[0].note.finger)
      : theme.slideRail ?? theme.techniqueStroke;
    const width = this.px(g.slideRailWidth ?? 7);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.markHalo ?? theme.keyline;
    ctx.lineWidth = width + this.outlineWidth() * 2.5;
    this.pathThroughPoints(points);
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    this.pathThroughPoints(points);
    ctx.stroke();
    ctx.restore();
  }

  /** A lone slide with no visible partner (target off-screen, or a slide out into silence) — a short trailing diagonal. */
  private drawSlideStub(item: Placed): void {
    const dir = item.note.techniques.slideOut ?? item.note.techniques.slideIn;
    if (!dir) return;
    const ctx = this.ctx;
    const theme = this.theme;
    const g = theme.geometry;
    const laneTop = item.centerY - this.laneHeight() / 2;
    const y = laneTop + this.px(g.slideRailTop ?? 5);
    const tail = this.px(g.slideRailWidth ?? 7) * 3;
    const isOut = item.note.techniques.slideOut !== undefined;
    const x0 = isOut ? item.x + item.w * 0.5 : item.x - tail;
    const x1 = isOut ? item.x + item.w + tail : item.x + item.w * 0.5;
    const dy = dir === 'up' ? -1 : 1;
    const rise = this.px(g.slideRailStep ?? 20) * dy;
    const width = this.px(g.slideRailWidth ?? 7);
    const colour = theme.slideRailUseFingerColour ? fingerColor(theme, item.note.finger) : theme.slideRail ?? theme.techniqueStroke;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.markHalo ?? theme.keyline;
    ctx.lineWidth = width + this.outlineWidth() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, isOut ? y : y - rise);
    ctx.lineTo(x1, isOut ? y + rise : y);
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, isOut ? y : y - rise);
    ctx.lineTo(x1, isOut ? y + rise : y);
    ctx.stroke();
    ctx.restore();
  }

  private pathThroughPoints(points: { x: number; y: number }[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  }

  /**
   * The arc over a hammer-on or pull-off pair, plus the H or P a tab would
   * print. Springs from and lands on the two pills' own centres — anchoring
   * to an edge instead shoves the whole mark toward the second note, so the
   * apex lands past the seam rather than between the two notes it joins.
   */
  private drawHammerMark(item: Placed, next: Placed | undefined, pull: boolean): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const rise = this.px(theme.geometry.hammerArcRise);
    const pillTop = item.centerY - this.pillHeight() / 2;
    const cx0 = item.x + item.w / 2;
    const cx1 = next ? next.x + next.w / 2 : item.x + item.w * 1.5;
    const midX = (cx0 + cx1) / 2;

    this.strokeWithHalo(() => {
      ctx.beginPath();
      ctx.moveTo(cx0, pillTop);
      ctx.quadraticCurveTo(midX, pillTop - rise * 2, cx1, pillTop);
    }, this.px(theme.geometry.hammerArcWidth));

    const size = this.px(theme.geometry.hammerLabelSize);
    const gap = this.px(theme.geometry.markGap);
    this.label(pull ? 'P' : 'H', midX, pillTop - rise - gap - size * 0.7, size);
  }

  /**
   * Bends are drawn to size: the arrow is as tall as the bend is wide, and
   * carries the player's own shorthand (½, full, 1½) so a half bend can never
   * be mistaken for a whole-tone one.
   */
  private drawBend(item: Placed, pillH: number, frets: number | undefined): void {
    const ctx = this.ctx;
    const theme = this.theme;
    // A one-fret push is half a tone. With no bend points in the file we can
    // only say "there is a bend" — draw the common full-tone arrow and leave
    // the label off rather than claim a depth we do not know.
    const tones = frets !== undefined && frets > 0 ? frets / 2 : 1;
    const rise = Math.min(this.px(theme.geometry.bendRise) * tones, pillH * 2.4);
    const x0 = item.x + item.w / 2;
    const y0 = this.markBaseY(item);
    const stem = this.px(theme.geometry.bendStemWidth);
    const aw = stem * 1.6;

    this.strokeWithHalo(() => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 - rise);
      ctx.moveTo(x0 - aw, y0 - rise + aw);
      ctx.lineTo(x0, y0 - rise);
      ctx.lineTo(x0 + aw, y0 - rise + aw);
    }, stem);

    if (frets !== undefined && frets > 0) {
      const label = bendLabel(tones);
      if (label) {
        const size = this.px(theme.geometry.bendLabelSize);
        this.label(label, x0 + aw * 2.4, y0 - rise + size * 0.2, size);
      }
    }
  }

  /**
   * Palm muting is marked the way tab marks it — P.M. with a dashed rule
   * showing how far it lasts — drawn once across the top of the stage rather
   * than as a dotted outline inside every pill, which was invisible at any
   * distance and fought the fret number.
   */
  private drawPalmMuteRail(spans: Span[]): void {
    if (spans.length === 0) return;
    const ctx = this.ctx;
    const theme = this.theme;
    const merged: Span[] = [];
    for (const span of [...spans].sort((a, b) => a.startX - b.startX)) {
      const last = merged[merged.length - 1];
      if (last && span.startX - last.endX < this.px(theme.geometry.pmJoinGap)) {
        last.endX = Math.max(last.endX, span.endX);
        last.laneIndex = Math.min(last.laneIndex, span.laneIndex);
      } else {
        merged.push({ ...span });
      }
    }

    const size = this.px(theme.geometry.pmLabelSize);
    const headerY = this.headerHeight() - size;
    const nearestLane = theme.geometry.pmRailPlacement !== 'header';
    const offsetPx = this.px(theme.geometry.pmRailOffset ?? 10);
    ctx.save();
    for (const span of merged) {
      ctx.save();
      const t = this.laneTransform(nearestLane ? span.laneIndex : 0);
      ctx.transform(t.s, 0, 0, t.s, t.dx, t.dy);
      const y = nearestLane
        ? span.laneIndex * this.laneHeight() + this.headerHeight() - offsetPx
        : headerY;
      ctx.font = `700 ${size}px Manrope, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = this.px(5);
      ctx.strokeStyle = theme.keyline;
      ctx.strokeText('P.M.', span.startX, y);
      ctx.fillStyle = theme.palmMuteRing;
      ctx.fillText('P.M.', span.startX, y);

      const ruleStart = span.startX + ctx.measureText('P.M.').width + this.px(10);
      if (span.endX <= ruleStart) {
        ctx.restore();
        continue;
      }
      ctx.setLineDash([this.px(theme.geometry.pmDashOn), this.px(theme.geometry.pmDashOff)]);
      ctx.lineCap = 'round';
      for (const pass of ['halo', 'ink'] as const) {
        ctx.strokeStyle = pass === 'halo' ? theme.keyline : theme.palmMuteRing;
        ctx.lineWidth =
          this.px(theme.geometry.pmRuleWidth) + (pass === 'halo' ? this.outlineWidth() * 2.5 : 0);
        ctx.beginPath();
        ctx.moveTo(ruleStart, y);
        ctx.lineTo(span.endX, y);
        ctx.moveTo(span.endX, y);
        ctx.lineTo(span.endX, y + size * 0.5);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- chords, ties, joins ----------------------------------------

  private drawChordPills(groups: Placed[][]): void {
    const gutter = this.px(this.theme.geometry.runMergeGap);
    const laid = groups
      .map((group) => ({
        group,
        left: Math.min(...group.map((item) => item.x)),
        right: Math.max(...group.map((item) => item.x + item.pitchW)),
      }))
      .sort((a, b) => a.left - b.left);

    for (let i = 0; i < laid.length; i++) {
      const limitRight = i < laid.length - 1 ? laid[i + 1].left - gutter : Number.POSITIVE_INFINITY;
      this.drawChordPill(laid[i].group, laid[i].left, laid[i].right, limitRight);
    }
  }

  /**
   * One block spanning the strings the chord is played on, carrying its name.
   * Six fret numbers tell a student which frets to hold; "G" tells them what
   * they are playing, which on a chord song is the thing worth reading. Its
   * own colour, because a chord is every finger at once and none of the four
   * finger hues can stand for it.
   */
  private drawChordPill(group: Placed[], left: number, right: number, limitRight: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const name = group[0].note.chordName ?? '';
    const pillH = this.pillHeight();
    const musicalW = Math.max(right - left - this.px(this.theme.geometry.nickGap), this.px(6));

    // The block is exactly as wide as the chord is long — it never grows to
    // fit its name. Growing it ran the block over the notes that follow, and
    // gave neighbouring chords different type sizes depending on the room
    // each happened to have. A long name on a short chord shrinks instead.
    const nameSize = this.fretSize() * 0.9;
    const w = Math.min(musicalW, Math.max(limitRight - left, this.px(6)));

    const top = Math.min(...group.map((item) => item.centerY)) - pillH / 2;
    const bottom = Math.max(...group.map((item) => item.centerY)) + pillH / 2;
    const r = this.pillRadius();

    // On the tilted board the block spans strings drawn at different scales,
    // so its corners are placed on their own strings and it is traced as a
    // four-cornered shape that leans with the bar lines.
    const lanes = group.map((item) => item.laneIndex);
    const tTop = this.laneTransform(Math.min(...lanes));
    const tBottom = this.laneTransform(Math.max(...lanes));
    const corners = [
      this.applyLane(tTop, left, top),
      this.applyLane(tTop, left + w, top),
      this.applyLane(tBottom, left + w, bottom),
      this.applyLane(tBottom, left, bottom),
    ];
    const sMid = (tTop.s + tBottom.s) / 2;

    ctx.save();
    this.roundQuadPath(corners, r * sMid);
    ctx.fillStyle = (this.obsMode && theme.chordPillObs) || theme.chordPill;
    ctx.fill();
    ctx.strokeStyle = theme.chordPillKeyline ?? theme.keyline;
    ctx.globalAlpha = theme.chordPillKeylineOpacity ?? 1;
    ctx.lineWidth = this.outlineWidth() * sMid;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // The name is drawn flat, under the block's middle scale, about its centre.
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const flatCx = left + w / 2;
    const flatCy = (top + bottom) / 2;

    // The block never grows to fit its name — a long name on a short chord
    // shrinks only down to the readability floor, then continues past the
    // block's right edge as stage text rather than vanishing into it.
    const floorSize = this.px((theme.geometry.chordNameMinSizeRatio ?? 0.0259) * STAGE_BASELINE_HEIGHT);
    const maxTextWidth = w * 0.86;
    ctx.font = `${theme.geometry.fretWeight} ${nameSize}px Manrope, sans-serif`;
    const naturalWidth = ctx.measureText(name).width;
    const size =
      naturalWidth > maxTextWidth && naturalWidth > 0
        ? Math.max(floorSize, nameSize * (maxTextWidth / naturalWidth))
        : nameSize;
    ctx.font = `${theme.geometry.fretWeight} ${size}px Manrope, sans-serif`;
    const fittedWidth = ctx.measureText(name).width;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sMid, sMid);
    ctx.translate(-flatCx, -flatCy);
    if (fittedWidth > maxTextWidth && theme.geometry.chordNameOverflow === 'right') {
      const gap = this.px(theme.geometry.chordNameOverflowGap ?? 10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = theme.markHalo ?? theme.keyline;
      ctx.lineWidth = this.px(theme.geometry.markHaloWidth ?? 5);
      ctx.strokeText(name, left + gap, (top + bottom) / 2);
      ctx.fillStyle = theme.text;
      ctx.fillText(name, left + gap, (top + bottom) / 2);
    } else {
      ctx.fillStyle = pillTextFor(theme, 'chord');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, left + w / 2, (top + bottom) / 2);
    }
    ctx.restore();

    for (const item of group) {
      this.lastLayout.push({ note: item.note, x: left, w, centerY: item.centerY, h: pillH, laneIndex: item.laneIndex });
    }
  }

  /** The tied portion of a sustained note — no number, just a thin continuing bar. */
  private drawTieBars(tieNotes: Placed[], currentTick: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const barH = this.pillHeight() * theme.geometry.tieBarHeightRatio;
    for (const item of tieNotes) {
      const note = item.note;
      const barStartX = item.x + item.w;
      const barEndX = this.xForTick(note.endTick, currentTick);
      if (barEndX <= barStartX) continue;
      this.withLane(item.laneIndex, () => {
        ctx.fillStyle = fingerColor(theme, note.finger);
        this.roundRectPath(barStartX, item.centerY - barH / 2, barEndX - barStartX, barH, barH / 2, barH / 2, barH / 2, barH / 2);
        ctx.fill();
      });
    }
  }

  private drawChordJoins(chordGroups: Map<number, Placed[]>): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const joinW = this.px(theme.geometry.chordJoinWidth);
    for (const group of chordGroups.values()) {
      if (group.length < 2) continue;
      const x = group[0].x + group[0].w / 2;
      const ends = [...group].sort((a, b) => a.laneIndex - b.laneIndex);
      const tTop = this.laneTransform(ends[0].laneIndex);
      const tBottom = this.laneTransform(ends[ends.length - 1].laneIndex);
      const top = this.applyLane(tTop, x, ends[0].centerY);
      const bottom = this.applyLane(tBottom, x, ends[ends.length - 1].centerY);
      ctx.strokeStyle = theme.chordJoin;
      ctx.globalAlpha = theme.chordJoinOpacity;
      ctx.lineWidth = joinW * (tTop.s + tBottom.s) / 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ---- hit flash, hit testing, primitives ---------------------------

  private hitStartAt(note: NoteEvent): number | undefined {
    const id = note.startTick * 100 + note.string;
    return this.hitNoteIds.get(id);
  }

  private drawHitEffect(item: Placed, pillH: number, currentTick: number): void {
    const note = item.note;
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
    const r = this.pillRadius();
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = theme.hit;
    ctx.lineWidth = this.px(theme.geometry.hitRingWidth);
    this.roundRectPath(item.x - grow / 2, item.centerY - pillH / 2 - grow / 2, item.w + grow, pillH + grow, r, r, r, r);
    ctx.stroke();
    ctx.restore();
  }

  /** Maps a click in CSS pixels onto the note drawn there, if any. */
  noteAt(clientX: number, clientY: number): NoteEvent | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const item of this.lastLayout) {
      // Back from screen into the lane's own flat coordinates.
      const t = this.laneTransform(item.laneIndex);
      const fx = (x - t.dx) / t.s;
      const fy = (y - t.dy) / t.s;
      if (fx >= item.x && fx <= item.x + item.w && Math.abs(fy - item.centerY) <= item.h / 2) {
        return item.note;
      }
    }
    return null;
  }

  /** Shrinks a label until it fits the width it has, so a number never spills onto its neighbour. */
  private fittedFontSize(text: string, preferred: number, maxWidth: number, weight: number): number {
    const ctx = this.ctx;
    ctx.font = `${weight} ${preferred}px Manrope, sans-serif`;
    const width = ctx.measureText(text).width;
    if (width <= maxWidth || width === 0) return preferred;
    return Math.max(preferred * 0.3, preferred * (maxWidth / width));
  }

  /** A convex four-cornered shape with every corner rounded — the chord block on the tilted board. */
  private roundQuadPath(corners: { x: number; y: number }[], radius: number): void {
    const ctx = this.ctx;
    const n = corners.length;
    const shortest = Math.min(
      ...corners.map((c, i) => Math.hypot(corners[(i + 1) % n].x - c.x, corners[(i + 1) % n].y - c.y)),
    );
    const r = Math.max(0, Math.min(radius, shortest / 2));
    const start = { x: (corners[n - 1].x + corners[0].x) / 2, y: (corners[n - 1].y + corners[0].y) / 2 };
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const corner = corners[i];
      const next = corners[(i + 1) % n];
      ctx.arcTo(corner.x, corner.y, next.x, next.y, r);
    }
    ctx.closePath();
  }

  private roundRectPath(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): void {
    const ctx = this.ctx;
    const cap = Math.min(w, h) / 2;
    const rtl = Math.max(0, Math.min(tl, cap));
    const rtr = Math.max(0, Math.min(tr, cap));
    const rbr = Math.max(0, Math.min(br, cap));
    const rbl = Math.max(0, Math.min(bl, cap));
    ctx.beginPath();
    ctx.moveTo(x + rtl, y);
    ctx.lineTo(x + w - rtr, y);
    ctx.arcTo(x + w, y, x + w, y + rtr, rtr);
    ctx.lineTo(x + w, y + h - rbr);
    ctx.arcTo(x + w, y + h, x + w - rbr, y + h, rbr);
    ctx.lineTo(x + rbl, y + h);
    ctx.arcTo(x, y + h, x, y + h - rbl, rbl);
    ctx.lineTo(x, y + rtl);
    ctx.arcTo(x, y, x + rtl, y, rtl);
    ctx.closePath();
  }

  private registerHit(note: NoteEvent): void {
    const id = note.startTick * 100 + note.string;
    if (!this.hitNoteIds.has(id)) this.hitNoteIds.set(id, performance.now());
  }
}
