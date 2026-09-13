/**
 * Names the chord a group of simultaneous notes spells, so the highway can
 * show one "G" pill across the strings instead of six fret numbers. Guitar
 * Pro files often carry the chord name already; this is the fallback for the
 * many that don't.
 *
 * It only ever names a shape it recognises exactly. A wrong chord name on
 * screen during a lesson is worse than no chord name, so anything that isn't
 * a clean match comes back null and the notes stay as fret numbers.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface Quality {
  /** Semitones above the root, sorted. */
  intervals: number[];
  suffix: string;
}

// Ordered by how readily a guitarist would call a shape by this name.
const QUALITIES: Quality[] = [
  { intervals: [0, 7], suffix: '5' },
  { intervals: [0, 4, 7], suffix: '' },
  { intervals: [0, 3, 7], suffix: 'm' },
  { intervals: [0, 5, 7], suffix: 'sus4' },
  { intervals: [0, 2, 7], suffix: 'sus2' },
  { intervals: [0, 3, 6], suffix: 'dim' },
  { intervals: [0, 4, 8], suffix: 'aug' },
  { intervals: [0, 4, 7, 10], suffix: '7' },
  { intervals: [0, 3, 7, 10], suffix: 'm7' },
  { intervals: [0, 4, 7, 11], suffix: 'maj7' },
  { intervals: [0, 3, 7, 11], suffix: 'm(maj7)' },
  { intervals: [0, 5, 7, 10], suffix: '7sus4' },
  { intervals: [0, 4, 7, 9], suffix: '6' },
  { intervals: [0, 3, 7, 9], suffix: 'm6' },
  { intervals: [0, 2, 4, 7], suffix: 'add9' },
  { intervals: [0, 3, 6, 10], suffix: 'm7b5' },
  { intervals: [0, 3, 6, 9], suffix: 'dim7' },
];

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * @param pitches MIDI note numbers sounding together. Order doesn't matter;
 *   the lowest is taken as the likely root.
 */
export function nameChord(pitches: number[]): string | null {
  if (pitches.length < 2) return null;

  const classes = [...new Set(pitches.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);
  if (classes.length < 2) return null;

  const bass = ((Math.min(...pitches) % 12) + 12) % 12;
  // The bass note is tried as the root first: on a guitar it usually is one,
  // and it settles shapes that would otherwise be ambiguous (a diminished
  // triad spells the same set from two different roots).
  const roots = [bass, ...classes.filter((c) => c !== bass)];

  for (const root of roots) {
    const relative = classes.map((c) => (c - root + 12) % 12).sort((a, b) => a - b);
    for (const quality of QUALITIES) {
      if (sameSet(relative, quality.intervals)) {
        const name = NOTE_NAMES[root] + quality.suffix;
        // A chord played over a different bass note is written that way.
        return root === bass ? name : `${name}/${NOTE_NAMES[bass]}`;
      }
    }
  }

  return null;
}
