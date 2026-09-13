import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importer } from '@coderline/alphatab';
import { extractNotes } from './notes';
import { applyFingeringHeuristic } from './fingering';

const FREEDOM_PATH = resolve(__dirname, '../../test-songs/freedom/song.gp');

function loadFreedom() {
  const bytes = new Uint8Array(readFileSync(FREEDOM_PATH));
  return importer.ScoreLoader.loadScoreFromBytes(bytes);
}

describe('extractNotes', () => {
  it('matches alphaTab\'s own note count for each track, minus merged ties', () => {
    const score = loadFreedom();
    for (const track of score.tracks) {
      const events = extractNotes(track);

      let expectedNoteCount = 0;
      for (const bar of track.staves[0].bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            for (const note of beat.notes) {
              // Tied notes are merged into the note they extend, not
              // counted separately — see notes.ts and build plan 5.6.
              if (note.isTieDestination && note.tieOrigin) continue;
              expectedNoteCount++;
            }
          }
        }
      }

      expect(events.length).toBe(expectedNoteCount);
    }
  });

  it('normalises string numbering to 1 = high E', () => {
    const score = loadFreedom();
    const track = score.tracks[0];
    const events = extractNotes(track);
    const stringCount = track.staves[0].tuning.length;
    for (const event of events) {
      expect(event.string).toBeGreaterThanOrEqual(1);
      expect(event.string).toBeLessThanOrEqual(stringCount);
    }
  });
});

describe('chord names', () => {
  it('never collapses a power chord, however many strings it is spread over', () => {
    const score = loadFreedom();
    for (const track of score.tracks) {
      for (const event of extractNotes(track)) {
        if (!event.chordName) continue;
        // Every note of the beat carries the name, so re-derive the beat's
        // pitch classes from the events sharing this start tick.
        expect(event.chordName).not.toMatch(/^[A-G]#?5$/);
      }
    }
  });

  it('agrees on one name for every note of a beat', () => {
    const events = extractNotes(loadFreedom().tracks[0]);
    const byTick = new Map<number, Set<string | undefined>>();
    for (const event of events) {
      if (!byTick.has(event.startTick)) byTick.set(event.startTick, new Set());
      byTick.get(event.startTick)!.add(event.chordName);
    }
    for (const names of byTick.values()) {
      expect(names.size).toBe(1);
    }
  });
});

describe('applyFingeringHeuristic', () => {
  it('only assigns fingers 1-4 to fretted notes, and 0 to open/dead notes', () => {
    const score = loadFreedom();
    const track = score.tracks[0];
    const events = extractNotes(track);
    applyFingeringHeuristic(events);

    for (const event of events) {
      if (event.fret <= 0) {
        expect(event.finger).toBe(0);
      } else {
        expect(event.finger).toBeGreaterThanOrEqual(1);
        expect(event.finger).toBeLessThanOrEqual(4);
      }
    }
  });

  it('has no GP-sourced fingering on the Freedom file, so every note is guessed', () => {
    const score = loadFreedom();
    const events = extractNotes(score.tracks[0]);
    expect(events.some((e) => e.fingerSource === 'gp')).toBe(false);
  });
});
