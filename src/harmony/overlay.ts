/**
 * The chord-song skin: the chord now, what's coming, and where it sits in
 * the key. Drawn on a fixed 1920×1080 stage that the page scales to fit, so
 * an OBS browser source at 1920×1080 shows it pixel for pixel.
 *
 * Colours are the House palette (see harmony.css). Colour only ever means
 * the function family; a chord from outside the key keeps its family's
 * colour and gets a dashed edge.
 */

import { diatonicChords, keyName, pretty, type Fn, type Key } from './analysis';
import type { Chart, ChartChord } from './chart';

const PX_PER_BEAT = 54;
const PILL_GAP = 12;
const PLAY_X = 230; // playhead, from the strip's left edge
const STRIP_W = 1114;
const WHEEL = 323;
const WHEEL_R = 119;

const FN_WORD: Record<Fn, string> = { T: 'Tonic', S: 'Subdominant', D: 'Dominant' };

function fnClass(fn: Fn | null): string {
  return fn ? `fn-${fn}` : 'fn-none';
}

function el(tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  parent?.appendChild(e);
  return e;
}

interface Pill {
  el: HTMLElement;
  chord: ChartChord;
  width: number;
}

export class Overlay {
  private keyEl: HTMLElement;
  private nowEl: HTMLElement;
  private nowChord: HTMLElement;
  private nowNumeral: HTMLElement;
  private nowFn: HTMLElement;
  private noteEl: HTMLElement;
  private track: HTMLElement;
  private wheelEl: HTMLElement;
  private centreEl: HTMLElement;
  private discs = new Map<number, HTMLElement>();
  private pills: Pill[] = [];
  private chart: Chart | null = null;
  private shownIndex = Number.NaN;
  private shownCount = Number.NaN;
  private wheelKey: Key | null = null;

  constructor(stage: HTMLElement) {
    const root = el('div', 'hx-overlay', stage);
    this.keyEl = el('div', 'hx-eyebrow', root);
    this.nowEl = el('div', 'hx-now', root);
    this.nowChord = el('div', 'hx-now-chord', this.nowEl);
    const meta = el('div', 'hx-now-meta', this.nowEl);
    this.nowNumeral = el('span', 'hx-now-numeral', meta);
    this.nowFn = el('span', 'hx-now-fn', meta);
    this.noteEl = el('div', 'hx-note', root);
    const strip = el('div', 'hx-strip', root);
    strip.style.width = `${STRIP_W}px`;
    this.track = el('div', 'hx-track', strip);
    const playhead = el('div', 'hx-playhead', strip);
    playhead.style.left = `${PLAY_X}px`;
    this.wheelEl = el('div', 'hx-wheel', root);
    this.wheelEl.style.width = this.wheelEl.style.height = `${WHEEL}px`;
    this.centreEl = el('div', 'hx-centre', this.wheelEl);
  }

  setChart(chart: Chart): void {
    this.chart = chart;
    this.track.replaceChildren();
    this.pills = chart.chords.map((chord, i) => {
      const width = Math.max(chord.beats * PX_PER_BEAT - PILL_GAP, 8);
      const pill = el('div', `hx-pill ${fnClass(chord.analysis.fn)}`, this.track);
      if (chord.analysis.outside) pill.classList.add('outside');
      if (chord.symbol === 'N.C.') pill.classList.add('no-chord');
      pill.style.width = `${width}px`;
      // Only as much label as the block can hold.
      pill.classList.add(width >= 180 ? 'size-full' : width >= 96 ? 'size-mid' : 'size-small');
      el('span', 'hx-pill-chord', pill).textContent = pretty(chord.symbol);
      el('span', 'hx-pill-numeral', pill).textContent = chord.analysis.numeral;
      const prev = chart.chords[i - 1];
      if (chord.section && chord.section !== prev?.section) {
        el('span', 'hx-pill-section', pill).textContent = chord.section;
      }
      return { el: pill, chord, width };
    });
    this.wheelKey = null;
    this.shownIndex = Number.NaN;
    this.shownCount = Number.NaN;
  }

  private buildWheel(key: Key): void {
    this.wheelKey = key;
    this.discs.forEach((d) => d.remove());
    this.discs.clear();
    // Grouped by family, clockwise from the top: tonic, subdominant, dominant
    // and back home, so the wheel itself reads as the journey away and back.
    const order: Fn[] = ['T', 'S', 'D'];
    const chords = diatonicChords(key).sort((a, b) => order.indexOf(a.fn) - order.indexOf(b.fn));
    chords.forEach((c, i) => {
      const angle = (i * 2 * Math.PI) / chords.length;
      const disc = el('div', `hx-disc ${fnClass(c.fn)}`, this.wheelEl);
      disc.style.left = `${WHEEL / 2 + WHEEL_R * Math.sin(angle)}px`;
      disc.style.top = `${WHEEL / 2 - WHEEL_R * Math.cos(angle)}px`;
      el('span', 'hx-disc-numeral', disc).textContent = c.numeral;
      el('span', 'hx-disc-name', disc).textContent = c.name;
      this.discs.set(c.degree, disc);
    });
  }

  private indexAt(pos: number): number {
    const chords = this.chart!.chords;
    if (pos < 0 || chords.length === 0) return -1;
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      if (pos < c.startBeat + c.beats) return i;
    }
    return chords.length - 1;
  }

  render(pos: number): void {
    const chart = this.chart;
    if (!chart) return;
    const index = this.indexAt(pos);

    if (index === -1) {
      // Count-in: a neutral card counting down to the first chord.
      const count = Math.ceil(-pos);
      if (index !== this.shownIndex || count !== this.shownCount) {
        this.shownCount = count;
        this.showCountIn(chart, pos < 0 ? count : 0);
      }
    } else if (index !== this.shownIndex) {
      this.showChord(chart.chords[index]);
    }
    this.shownIndex = index;

    for (const p of this.pills) {
      const x = PLAY_X + (p.chord.startBeat - pos) * PX_PER_BEAT;
      const visible = x + p.width > -40 && x < STRIP_W + 40;
      p.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      p.el.style.transform = `translateX(${x}px)`;
      p.el.classList.toggle('past', p.chord.startBeat + p.chord.beats <= pos);
    }
  }

  private setKeyLine(key: Key, section: string | null): void {
    this.keyEl.textContent = section ? `Key of ${keyName(key)}  ·  ${section}` : `Key of ${keyName(key)}`;
    if (this.wheelKey !== key) this.buildWheel(key);
  }

  private showCountIn(chart: Chart, count: number): void {
    const first = chart.chords[0];
    this.setKeyLine(first?.key ?? chart.key, first?.section ?? null);
    this.nowEl.className = 'hx-now count-in';
    this.nowChord.textContent = count > 0 ? String(count) : '';
    this.nowChord.dataset.len = '1';
    this.nowNumeral.textContent = '';
    this.nowFn.textContent = count > 0 ? 'Count-in' : '';
    this.noteEl.textContent = '';
    this.lightDisc(null, null);
  }

  private showChord(chord: ChartChord): void {
    const a = chord.analysis;
    this.setKeyLine(chord.key, chord.section);
    this.nowEl.className = `hx-now ${fnClass(a.fn)}${a.outside ? ' outside' : ''}`;
    const name = pretty(chord.symbol);
    this.nowChord.textContent = name;
    this.nowChord.dataset.len = String(Math.min([...name].length, 6));
    this.nowNumeral.textContent = a.numeral;
    this.nowFn.textContent = a.fn ? FN_WORD[a.fn] : '';
    this.noteEl.textContent = a.note ?? '';
    this.lightDisc(a.outside ? null : a.degree, a.outside ? chord : null);
  }

  /** Lights the chord's disc, or shows an outside chord in the centre. */
  private lightDisc(degree: number | null, outsideChord: ChartChord | null): void {
    this.discs.forEach((d, deg) => {
      // v and V share a disc in a minor key
      d.classList.toggle('on', deg === degree);
    });
    this.wheelEl.classList.toggle('dim', degree === null && outsideChord !== null);
    if (outsideChord && outsideChord.symbol !== 'N.C.') {
      this.centreEl.className = `hx-centre outside-chord ${fnClass(outsideChord.analysis.fn)}`;
      this.centreEl.innerHTML = '';
      el('span', 'hx-disc-numeral', this.centreEl).textContent = outsideChord.analysis.numeral;
      el('span', 'hx-disc-name', this.centreEl).textContent = pretty(outsideChord.symbol);
    } else {
      const key = this.wheelKey;
      this.centreEl.className = 'hx-centre';
      this.centreEl.innerHTML = '';
      if (key) {
        el('span', 'hx-centre-tonic', this.centreEl).textContent = pretty(key.tonicName);
        el('span', 'hx-centre-mode', this.centreEl).textContent = key.mode;
      }
    }
  }
}
