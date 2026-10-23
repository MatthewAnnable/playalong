import { describe, expect, it } from 'vitest';
import { msAtTick, tempoAnchors, ticksPerSecondAtTick } from './audioTime';
import type { PlayedBar } from './timeline';

describe('msAtTick', () => {
  it('follows sync points between them and their tempo beyond them', () => {
    const anchors = [
      { tick: 0, ms: -1000, bpm: 120 },
      { tick: 960, ms: 0, bpm: 60 },
    ];
    expect(msAtTick(anchors, 480, 960)).toBe(-500);
    // Past the last point: 60 bpm, a quarter a second.
    expect(msAtTick(anchors, 1920, 960)).toBe(1000);
  });

  it('gives the sync points\' speed, not the written tempo, for the highway between updates', () => {
    // A recording slowed so 1920 ticks (two quarters) take 2s: 60 bpm, though the
    // anchors say 130.
    const anchors = [
      { tick: 0, ms: 0, bpm: 130 },
      { tick: 1920, ms: 2000, bpm: 130 },
    ];
    expect(ticksPerSecondAtTick(anchors, 960, 960)).toBe(960);
    // Past the last point there's no next one to measure against: its tempo.
    expect(ticksPerSecondAtTick(anchors, 3000, 960)).toBe((130 / 60) * 960);
  });

  it('turns the written tempo into anchors when there are no sync points', () => {
    const timeline = [{ tempoChanges: [{ tick: 1920, tempo: 60 }] }] as unknown as PlayedBar[];
    const anchors = tempoAnchors(timeline, 120, 960);
    // Two quarters at 120 = 1s, then one quarter at 60 = 1s more.
    expect(msAtTick(anchors, 2880, 960)).toBe(2000);
  });
});
