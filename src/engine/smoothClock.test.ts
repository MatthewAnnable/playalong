import { describe, expect, it } from 'vitest';
import { SmoothClock } from './smoothClock';
import { msAtTick, tickAtMs } from './audioTime';

describe('SmoothClock', () => {
  it('moves evenly with the frame clock when the audio time comes in steps', () => {
    const c = new SmoothClock();
    c.read(10, 1, true, 0);
    const out: number[] = [];
    // Audio time that only updates every third frame of 1/60 s.
    for (let f = 1; f <= 60; f++) {
      const audio = 10 + Math.floor(f / 3) * (3 / 60);
      out.push(c.read(audio, 1, true, (f * 1000) / 60));
    }
    const steps = out.slice(10).map((v, i, a) => (i ? v - a[i - 1] : null)).slice(1) as number[];
    for (const s of steps) expect(s).toBeGreaterThan(0.7 / 60);
    for (const s of steps) expect(s).toBeLessThan(1.3 / 60);
  });

  it('snaps to a seek and never runs backwards while playing', () => {
    const c = new SmoothClock();
    c.read(5, 1, true, 0);
    expect(c.read(40, 1, true, 16)).toBe(40);
    const a = c.read(40.01, 1, true, 32);
    expect(c.read(40.0, 1, true, 48)).toBeGreaterThanOrEqual(a);
  });

  it('follows the slowed rate', () => {
    const c = new SmoothClock();
    c.read(0, 0.5, true, 0);
    let v = 0;
    for (let f = 1; f <= 120; f++) v = c.read(Math.floor(f / 2) * (2 / 60) * 0.5, 0.5, true, (f * 1000) / 60);
    expect(v).toBeCloseTo(1, 1);
  });
});

describe('tickAtMs', () => {
  it('undoes msAtTick between and beyond the anchors', () => {
    const anchors = [
      { tick: 0, ms: 260, bpm: 206 },
      { tick: 3840 * 8, ms: 9580, bpm: 206 },
      { tick: 3840 * 9, ms: 10900, bpm: 150 },
    ];
    for (const t of [0, 1000, 3840 * 8 + 500, 3840 * 10]) {
      expect(tickAtMs(anchors, msAtTick(anchors, t, 960), 960)).toBeCloseTo(t, 6);
    }
  });
});
