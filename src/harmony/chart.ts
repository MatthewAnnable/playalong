/**
 * Reads a plain-text chord chart into timed chords. The format is meant to be
 * typed by hand:
 *
 *   title: Test progression
 *   artist: Matthew Annable
 *   key: G major
 *   tempo: 96
 *   time: 4/4
 *   count-in: 1
 *
 *   [Verse]
 *   | G | Em | C | Cm |
 *   | G C | D . . . | % |
 *
 * - One chord in a bar fills it. Several share it evenly; dots make it
 *   exact, one token per beat (`| G . C . |` is two beats each).
 * - `%` repeats the previous bar. `N.C.` is no chord.
 * - `{bVII}` after a chord overrides its numeral, `{bVII:S}` its family too
 *   (T, S or D). `{:D}` changes the family alone.
 * - `key:` may appear again further down for a key change.
 * - `#` at the start of a line, or after a space, starts a comment.
 */

import { analyse, parseKey, type Analysis, type Fn, type Key } from './analysis';

export interface ChartChord {
  symbol: string; // as written, without any override
  startBeat: number; // from the first beat of the song, after the count-in
  beats: number;
  bar: number; // 1-based bar where it starts
  section: string | null;
  key: Key;
  analysis: Analysis;
}

export interface Chart {
  title: string;
  artist: string;
  key: Key;
  tempo: number;
  beatsPerBar: number;
  countInBars: number;
  chords: ChartChord[];
  totalBeats: number;
  warnings: string[];
}

interface Token {
  symbol: string;
  override: string | null;
}

const FALLBACK_KEY: Key = { tonic: 0, tonicName: 'C', mode: 'major' };

function readToken(raw: string): Token {
  const m = /^(.*?)(?:\{([^}]*)\})?$/.exec(raw)!;
  return { symbol: m[1], override: m[2] ?? null };
}

function applyOverride(base: Analysis, override: string | null): Analysis {
  if (override === null) return base;
  const [numeral, fnRaw] = override.split(':');
  const fnText = (fnRaw ?? '').trim().toUpperCase();
  const fn: Fn | null = fnText === 'T' || fnText === 'S' || fnText === 'D' ? fnText : base.fn;
  const n = numeral.trim().replace(/b(?=[IViv])/g, '♭').replace(/#(?=[IViv])/g, '♯');
  return { ...base, numeral: n || base.numeral, fn };
}

export function parseChart(text: string): Chart {
  const warnings: string[] = [];
  let title = 'Untitled';
  let artist = '';
  let key: Key | null = null;
  let firstKey: Key | null = null;
  let tempo = 90;
  let beatsPerBar = 4;
  let countInBars = 1;
  let section: string | null = null;

  const chords: ChartChord[] = [];
  let beat = 0;
  let bar = 0;
  let previousBar: Token[][] | null = null;

  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    // A comment is a # at the start or after a space; F# never has a space before it.
    const line = lines[lineIndex].replace(/(^|\s)#(\s.*)?$/, '').trim();
    if (!line) continue;

    const header = /^([a-z][a-z -]*)\s*:\s*(.+)$/i.exec(line);
    if (header && !line.includes('|')) {
      const name = header[1].trim().toLowerCase().replace(/\s+/g, '-');
      const value = header[2].trim();
      if (name === 'title') title = value;
      else if (name === 'artist') artist = value;
      else if (name === 'key') {
        const k = parseKey(value);
        if (k) {
          key = k;
          firstKey ??= k;
        } else warnings.push(`Line ${lineIndex + 1}: couldn't read the key "${value}"`);
      } else if (name === 'tempo' || name === 'bpm') tempo = Number(value) || tempo;
      else if (name === 'time') {
        const t = /^(\d+)\s*\/\s*\d+$/.exec(value);
        if (t) beatsPerBar = Number(t[1]);
      } else if (name === 'count-in') countInBars = Math.max(0, Number(value) || 0);
      continue;
    }

    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    if (!line.includes('|')) {
      warnings.push(`Line ${lineIndex + 1}: no bar lines, so it was skipped`);
      continue;
    }

    const bars = line.split('|').map((b) => b.trim()).filter((b) => b.length > 0);
    for (const barText of bars) {
      let tokens: Token[][];
      if (barText === '%') {
        if (!previousBar) {
          warnings.push(`Line ${lineIndex + 1}: % with no bar before it`);
          continue;
        }
        tokens = previousBar;
      } else {
        tokens = [barText.split(/\s+/).map(readToken)];
      }
      previousBar = tokens;
      bar += 1;
      const items = tokens[0];
      const usesDots = items.some((t) => t.symbol === '.');
      // Each chord's length in beats within this bar.
      const spans: { token: Token; beats: number }[] = [];
      if (usesDots) {
        const per = beatsPerBar / items.length;
        for (const t of items) {
          if (t.symbol === '.' && spans.length) spans[spans.length - 1].beats += per;
          else if (t.symbol !== '.') spans.push({ token: t, beats: per });
        }
      } else {
        const n = items.length;
        const base = Math.floor(beatsPerBar / n);
        let extra = beatsPerBar - base * n;
        for (const t of items) {
          const b = base + (extra > 0 ? 1 : 0);
          extra -= 1;
          spans.push({ token: t, beats: b > 0 ? b : beatsPerBar / n });
        }
      }

      const currentKey = key ?? FALLBACK_KEY;
      for (const { token, beats } of spans) {
        const isNoChord = /^n\.?c\.?$/i.test(token.symbol);
        const last = chords[chords.length - 1];
        // The same chord carried on (G | G) is one block on screen.
        if (
          last &&
          last.symbol === token.symbol &&
          token.override === null &&
          last.key === currentKey &&
          last.section === section &&
          last.startBeat + last.beats === beat
        ) {
          last.beats += beats;
        } else {
          const base: Analysis = isNoChord
            ? { degree: null, numeral: '', fn: null, outside: false, note: null }
            : analyse(token.symbol, currentKey);
          if (!isNoChord && base.numeral === '') {
            warnings.push(`Bar ${bar}: couldn't read the chord "${token.symbol}"`);
          }
          chords.push({
            symbol: isNoChord ? 'N.C.' : token.symbol,
            startBeat: beat,
            beats,
            bar,
            section,
            key: currentKey,
            analysis: applyOverride(base, token.override),
          });
        }
        beat += beats;
      }
    }
  }

  if (!firstKey) warnings.push('No key: given, so C major was assumed');

  return {
    title,
    artist,
    key: firstKey ?? FALLBACK_KEY,
    tempo,
    beatsPerBar,
    countInBars,
    chords,
    totalBeats: beat,
    warnings,
  };
}
