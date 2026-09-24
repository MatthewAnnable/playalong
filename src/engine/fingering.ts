import type { NoteEvent } from './notes';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Notes struck at the same moment. Bar and beat alone would lump every pass through a repeat together. */
function chordKey(e: NoteEvent): string {
  return `${e.pass}:${e.beatIndex}`;
}

/**
 * Fills in `.finger` for every NoteEvent whose fingering wasn't already read
 * from the GP file. Mutates events in place. See build plan 5.4 — this is a
 * position-based heuristic, not real fingering, and is expected to be wrong
 * sometimes; that's what the 'guess' hollow-ring marker is for.
 */
export function applyFingeringHeuristic(events: NoteEvent[]): void {
  const guessed = events.filter((e) => e.fingerSource === 'guess');

  // One group per bar *as played*: pooling every pass through a repeated bar
  // widened its fret span and turned the same beat across passes into a
  // fake chord, which scrambled the guesses.
  const byBar = new Map<number, NoteEvent[]>();
  for (const e of guessed) {
    if (!byBar.has(e.pass)) byBar.set(e.pass, []);
    byBar.get(e.pass)!.push(e);
  }

  for (const barEvents of byBar.values()) {
    barEvents.sort((a, b) => a.startTick - b.startTick || a.string - b.string);
    const frets = barEvents.filter((e) => e.fret > 0).map((e) => e.fret);
    if (frets.length === 0) {
      for (const e of barEvents) e.finger = 0;
      continue;
    }
    const span = Math.max(...frets) - Math.min(...frets);
    if (span > 5) {
      const mid = Math.ceil(barEvents.length / 2);
      assignWindowFingers(barEvents.slice(0, mid));
      assignWindowFingers(barEvents.slice(mid));
    } else {
      assignWindowFingers(barEvents);
    }
  }
}

function assignWindowFingers(windowEvents: NoteEvent[]): void {
  const fretted = windowEvents.filter((e) => e.fret > 0).map((e) => e.fret);
  if (fretted.length === 0) {
    for (const e of windowEvents) e.finger = 0;
    return;
  }
  const pos = Math.min(...fretted);
  const lastByString = new Map<number, { fret: number; finger: number }>();

  const chordGroups = new Map<string, NoteEvent[]>();
  for (const e of windowEvents) {
    const key = chordKey(e);
    if (!chordGroups.has(key)) chordGroups.set(key, []);
    chordGroups.get(key)!.push(e);
  }

  for (const group of chordGroups.values()) {
    if (group.length > 1) {
      // Chord: lowest fret in the chord anchors the hand position, so each
      // finger lands on exactly one fret across the chord.
      const chordFretted = group.filter((e) => e.fret > 0).map((e) => e.fret);
      const chordPos = chordFretted.length ? Math.min(...chordFretted) : pos;
      for (const e of [...group].sort((a, b) => a.fret - b.fret)) {
        e.finger = (e.fret <= 0 ? 0 : clamp(e.fret - chordPos + 1, 1, 4)) as NoteEvent['finger'];
        lastByString.set(e.string, { fret: e.fret, finger: e.finger });
      }
    } else {
      const e = group[0];
      if (e.fret <= 0) {
        e.finger = 0;
        continue;
      }
      const prev = lastByString.get(e.string);
      if (prev && Math.abs(e.fret - prev.fret) === 1) {
        const direction = e.fret > prev.fret ? 1 : -1;
        e.finger = clamp(prev.finger + direction, 1, 4) as NoteEvent['finger'];
      } else {
        e.finger = clamp(e.fret - pos + 1, 1, 4) as NoteEvent['finger'];
      }
      lastByString.set(e.string, { fret: e.fret, finger: e.finger });
    }
  }
}
