/**
 * Works out what a chord is doing in a key: its Roman numeral and which of
 * the three function families it belongs to (tonic, subdominant, dominant).
 *
 * The harmony skins colour by family, not by chord, so viewers only have to
 * learn three colours. A chord from outside the key keeps its family's colour
 * and is flagged `outside`, which the skins draw with a dashed edge.
 *
 * The family each degree belongs to is a teaching choice, not a fact — the
 * tables below are the place to change it. Anything this can't place
 * confidently comes back with `fn: null` rather than a guess, and a chart can
 * always override the numeral and family by hand.
 */

export type Fn = 'T' | 'S' | 'D';
export type Mode = 'major' | 'minor';

export interface Key {
  tonic: number; // pitch class, C = 0
  tonicName: string; // as written, e.g. "F#"
  mode: Mode;
}

export type Triad = 'maj' | 'min' | 'dim' | 'aug' | 'sus' | 'pow';
export type Seventh = 'none' | 'dom' | 'maj' | 'min' | 'dim' | 'hdim';

export interface ParsedChord {
  root: number;
  rootName: string;
  triad: Triad;
  seventh: Seventh;
  bass: number | null;
}

export interface Analysis {
  /** Semitones from the tonic to the chord's root; null for no chord. */
  degree: number | null;
  numeral: string;
  fn: Fn | null;
  outside: boolean;
  /** Why a chord outside the key is there, e.g. "borrowed from G minor". */
  note: string | null;
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function pcOf(name: string): number | null {
  const m = /^([A-G])([#b♯♭]*)$/.exec(name);
  if (!m) return null;
  let pc = LETTER_PC[m[1]];
  for (const ch of m[2]) pc += ch === '#' || ch === '♯' ? 1 : -1;
  return ((pc % 12) + 12) % 12;
}

/** "G", "G major", "Em", "E minor", "F# min", "Bb" */
export function parseKey(text: string): Key | null {
  const m = /^\s*([A-G][#b♯♭]?)\s*(m|min|minor|maj|major)?\s*$/i.exec(text);
  if (!m) return null;
  const tonicName = m[1][0].toUpperCase() + m[1].slice(1);
  const tonic = pcOf(tonicName);
  if (tonic === null) return null;
  const q = (m[2] ?? '').toLowerCase();
  const mode: Mode = q === 'm' || q.startsWith('min') ? 'minor' : 'major';
  return { tonic, tonicName, mode };
}

/**
 * Reads a chord symbol into root, triad and seventh. Extensions past the
 * seventh (9, 11, 13, add9, 6) don't change the function, so they're
 * accepted and ignored. Returns null for anything it can't read.
 */
export function parseChord(symbol: string): ParsedChord | null {
  const m = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/.exec(symbol.trim());
  if (!m) return null;
  const root = pcOf(m[1]);
  if (root === null) return null;
  const bass = m[3] ? pcOf(m[3]) : null;
  const q = m[2];

  let triad: Triad = 'maj';
  let seventh: Seventh = 'none';

  if (/^(dim7|°7|o7)/.test(q)) {
    triad = 'dim';
    seventh = 'dim';
  } else if (/^(m7b5|m7♭5|ø|min7b5|-7b5)/.test(q)) {
    triad = 'dim';
    seventh = 'hdim';
  } else if (/^(dim|°|o(?!\w))/.test(q)) {
    triad = 'dim';
  } else if (/^(aug|\+)/.test(q)) {
    triad = 'aug';
  } else if (/^5$/.test(q)) {
    triad = 'pow';
  } else if (/^(m|min|-)(?!aj)/.test(q)) {
    triad = 'min';
    if (/^(m|min|-)(maj7|M7|Δ)/.test(q)) seventh = 'maj';
    else if (/^(m|min|-)(7|9|11|13)/.test(q)) seventh = 'min';
  } else {
    if (/sus/.test(q)) triad = 'sus';
    if (/^(maj7|maj9|maj13|M7|Δ)/.test(q)) seventh = 'maj';
    else if (/^(7|9|11|13)/.test(q) || /^sus\d?7/.test(q) || /^7sus/.test(q)) seventh = 'dom';
  }
  return { root, rootName: m[1], triad, seventh, bass };
}

interface DegreeSpec {
  roman: string; // upper-case numeral as named in this mode
  triads: Triad[]; // qualities that count as diatonic here
  sevenths: Seventh[];
  fn: Fn;
}

// The teaching choices. Major: T = I iii vi, S = ii IV, D = V vii°.
const MAJOR: Record<number, DegreeSpec> = {
  0: { roman: 'I', triads: ['maj'], sevenths: ['none', 'maj'], fn: 'T' },
  2: { roman: 'II', triads: ['min'], sevenths: ['none', 'min'], fn: 'S' },
  4: { roman: 'III', triads: ['min'], sevenths: ['none', 'min'], fn: 'T' },
  5: { roman: 'IV', triads: ['maj'], sevenths: ['none', 'maj'], fn: 'S' },
  7: { roman: 'V', triads: ['maj'], sevenths: ['none', 'dom'], fn: 'D' },
  9: { roman: 'VI', triads: ['min'], sevenths: ['none', 'min'], fn: 'T' },
  11: { roman: 'VII', triads: ['dim'], sevenths: ['none', 'hdim'], fn: 'D' },
};

// Minor: natural minor plus the harmonic-minor V and vii°, which is how songs
// in minor keys actually use them. T = i III, S = ii° iv VI, D = v V VII vii°.
const MINOR: Record<number, DegreeSpec> = {
  0: { roman: 'I', triads: ['min'], sevenths: ['none', 'min', 'maj'], fn: 'T' },
  2: { roman: 'II', triads: ['dim'], sevenths: ['none', 'hdim'], fn: 'S' },
  3: { roman: 'III', triads: ['maj'], sevenths: ['none', 'maj'], fn: 'T' },
  5: { roman: 'IV', triads: ['min'], sevenths: ['none', 'min'], fn: 'S' },
  7: { roman: 'V', triads: ['min', 'maj'], sevenths: ['none', 'min', 'dom'], fn: 'D' },
  8: { roman: 'VI', triads: ['maj'], sevenths: ['none', 'maj'], fn: 'S' },
  10: { roman: 'VII', triads: ['maj'], sevenths: ['none', 'dom'], fn: 'D' },
  11: { roman: 'VII', triads: ['dim'], sevenths: ['none', 'dim', 'hdim'], fn: 'D' },
};

// Chords borrowed from the parallel key keep the family they have there,
// except where songs use them differently — ♭VII in a major key is the
// rock IV-of-IV more often than a dominant, so it's a subdominant here.
const BORROWED_FROM_MINOR_FN: Record<number, Fn> = { 0: 'T', 2: 'S', 3: 'T', 5: 'S', 7: 'D', 8: 'S', 10: 'S' };
const BORROWED_FROM_MAJOR_FN: Record<number, Fn> = { 0: 'T', 2: 'S', 4: 'T', 5: 'S', 9: 'T', 11: 'D' };

const CHROMATIC_ROMAN_MAJOR: Record<number, string> = {
  0: 'I', 1: '♭II', 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 6: '♯IV', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII',
};
const CHROMATIC_ROMAN_MINOR: Record<number, string> = {
  0: 'I', 1: '♭II', 2: 'II', 3: 'III', 4: '♯III', 5: 'IV', 6: '♯IV', 7: 'V', 8: 'VI', 9: '♯VI', 10: 'VII', 11: '♯VII',
};

function isMinorish(c: ParsedChord): boolean {
  return c.triad === 'min' || c.triad === 'dim';
}

/** Case and suffix for a numeral from the chord's own quality. */
function dress(roman: string, c: ParsedChord, caseHint?: 'upper' | 'lower'): string {
  const lower = c.triad === 'sus' || c.triad === 'pow' ? caseHint === 'lower' : isMinorish(c);
  // keep accidentals as they are, change only the letters' case
  let out = lower ? roman.replace(/[IV]+/, (s) => s.toLowerCase()) : roman;
  if (c.seventh === 'hdim') out += 'ø7';
  else if (c.triad === 'dim') out += c.seventh === 'dim' ? '°7' : '°';
  else if (c.triad === 'aug') out += '+';
  if (c.seventh === 'dom' || c.seventh === 'min') out += '7';
  else if (c.seventh === 'maj') out += 'maj7';
  return out;
}

function fits(spec: DegreeSpec, c: ParsedChord): boolean {
  // A sus or power chord has no third, so it fits whatever the degree expects.
  const triadOk = c.triad === 'sus' || c.triad === 'pow' || spec.triads.includes(c.triad);
  return triadOk && spec.sevenths.includes(c.seventh);
}

function specFor(table: Record<number, DegreeSpec>, degree: number, c: ParsedChord): DegreeSpec | null {
  const spec = table[degree];
  if (spec && fits(spec, c)) return spec;
  // minor has two specs on the leading note (♭VII and vii°)
  if (table === MINOR && degree === 11) return fits(MINOR[11], c) ? MINOR[11] : null;
  return null;
}

function caseFor(spec: DegreeSpec): 'upper' | 'lower' {
  return spec.triads[0] === 'min' || spec.triads[0] === 'dim' ? 'lower' : 'upper';
}

export function keyName(key: Key): string {
  return `${pretty(key.tonicName)} ${key.mode}`;
}

export function analyse(symbol: string, key: Key): Analysis {
  const c = parseChord(symbol);
  if (!c) return { degree: null, numeral: '', fn: null, outside: false, note: null };
  const degree = (c.root - key.tonic + 12) % 12;
  const home = key.mode === 'major' ? MAJOR : MINOR;
  const romans = key.mode === 'major' ? CHROMATIC_ROMAN_MAJOR : CHROMATIC_ROMAN_MINOR;

  // 1. In the key.
  const spec = specFor(home, degree, c);
  if (spec) {
    const roman = key.mode === 'minor' && degree === 11 ? 'VII' : spec.roman;
    return { degree, numeral: dress(roman, c, caseFor(spec)), fn: spec.fn, outside: false, note: null };
  }

  // 2. A secondary dominant: a major or dominant-seventh chord a fifth above
  //    another chord of the key (not the tonic — that's just V).
  if ((c.triad === 'maj' && (c.seventh === 'none' || c.seventh === 'dom')) || c.seventh === 'dom') {
    const target = (degree + 5) % 12;
    const targetSpec = home[target];
    // Not a fifth above a diminished chord, and in minor not V/VII: a major
    // IV there is the Dorian borrowing, far more often than a pull to ♭VII.
    const skip = key.mode === 'major' ? [0, 11] : [0, 2, 10];
    if (targetSpec && !skip.includes(target)) {
      const targetRoman = targetSpec.triads[0] === 'min' || targetSpec.triads[0] === 'dim'
        ? targetSpec.roman.toLowerCase()
        : targetSpec.roman;
      return {
        degree,
        numeral: `V${c.seventh === 'dom' ? '7' : ''}/${targetRoman}`,
        fn: 'D',
        outside: true,
        note: 'secondary dominant',
      };
    }
  }

  // 3. Borrowed from the parallel key.
  const parallel = key.mode === 'major' ? MINOR : MAJOR;
  const pSpec = specFor(parallel, degree, c);
  if (pSpec) {
    const fnTable = key.mode === 'major' ? BORROWED_FROM_MINOR_FN : BORROWED_FROM_MAJOR_FN;
    const fn = fnTable[degree] ?? pSpec.fn;
    const otherMode = key.mode === 'major' ? 'minor' : 'major';
    return {
      degree,
      numeral: dress(romans[degree], c, caseFor(pSpec)),
      fn,
      outside: true,
      note: `borrowed from ${pretty(key.tonicName)} ${otherMode}`,
    };
  }

  // 4. The Neapolitan.
  if (degree === 1 && c.triad === 'maj') {
    return { degree, numeral: dress('♭II', c), fn: 'S', outside: true, note: 'Neapolitan' };
  }

  // 5. Something else: name it, but don't claim a family.
  return { degree, numeral: dress(romans[degree], c), fn: null, outside: true, note: 'outside the key' };
}

/** "Bb" → "B♭", "F#m7b5" → "F♯m7♭5", for display only. */
export function pretty(symbol: string): string {
  return symbol
    .replace(/#/g, '♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/b(\d)/g, '♭$1');
}

export interface WheelChord {
  degree: number;
  numeral: string;
  name: string;
  fn: Fn;
}

/**
 * The seven chords of the key, spelled with the right letters, for the key
 * wheel. A minor key shows the major V and the ♭VII-style VII, the two that
 * songs in minor keys actually use.
 */
export function diatonicChords(key: Key): WheelChord[] {
  const table = key.mode === 'major' ? MAJOR : MINOR;
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const letterIndex = LETTERS.indexOf(key.tonicName[0]);
  return steps.map((step, i) => {
    const letter = LETTERS[(letterIndex + i) % 7];
    const pc = (key.tonic + step) % 12;
    let diff = (pc - LETTER_PC[letter] + 12) % 12;
    if (diff > 6) diff -= 12;
    const acc = diff > 0 ? '♯'.repeat(diff) : '♭'.repeat(-diff);
    const spec = table[step];
    const triad = spec.triads[0];
    // minor keys show V major, the one songs use
    const shown: Triad = key.mode === 'minor' && step === 7 ? 'maj' : triad;
    const suffix = shown === 'min' ? 'm' : shown === 'dim' ? '°' : '';
    const fake: ParsedChord = { root: pc, rootName: letter, triad: shown, seventh: 'none', bass: null };
    return { degree: step, numeral: dress(spec.roman, fake), name: `${letter}${acc}${suffix}`, fn: spec.fn };
  });
}
