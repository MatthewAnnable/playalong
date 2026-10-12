import { describe, expect, it } from 'vitest';
import type { BarMarker, NoteEvent } from '../engine/notes';
import { layoutOverview } from './overview-layout';

function marker(tick: number, barNumber: number, sectionText?: string): BarMarker {
  return { tick, barNumber, sectionText, beats: 4, beatTicks: 960 };
}

function note(startTick: number, endTick: number, string: number, fret = 5): NoteEvent {
  return {
    startTick,
    endTick,
    bar: 1,
    pass: 0,
    beatIndex: 0,
    string,
    fret,
    pitch: 60,
    finger: 1,
    fingerSource: 'gp',
    techniques: {},
    isChord: false,
  };
}

// One second per 1000 ticks, ten-second recording.
const seconds = (tick: number) => tick / 1000;

describe('layoutOverview', () => {
  it('places sections and notes as shares of the recording', () => {
    const layout = layoutOverview(
      [note(0, 1000, 6), note(5000, 6000, 1)],
      [marker(0, 1, 'Intro'), marker(4000, 3, 'Verse')],
      seconds,
      10,
    );
    expect(layout.sections).toEqual([
      { label: 'Intro', start: 0, end: 0.4 },
      { label: 'Verse', start: 0.4, end: 0.6 },
    ]);
    expect(layout.notes).toEqual([
      { start: 0, end: 0.1, lane: 5, finger: 1 },
      { start: 0.5, end: 0.6, lane: 0, finger: 1 },
    ]);
  });

  it('treats every pass through a repeated section bar as one section', () => {
    const layout = layoutOverview(
      [note(0, 9000, 6)],
      [marker(0, 3, 'Intro'), marker(1000, 3, 'Intro'), marker(2000, 3, 'Intro'), marker(3000, 5, 'Verse'), marker(6000, 11, 'Verse')],
      seconds,
      10,
    );
    expect(layout.sections.map((s) => [s.label, s.start])).toEqual([
      ['Intro', 0],
      ['Verse', 0.3],
      ['Verse', 0.6],
    ]);
  });

  it('leaves out dead notes and clamps to the recording', () => {
    const layout = layoutOverview([note(-500, 500, 3), note(2000, 3000, 2, -1)], [], seconds, 10);
    expect(layout.notes).toEqual([{ start: 0, end: 0.05, lane: 2, finger: 1 }]);
  });
});
