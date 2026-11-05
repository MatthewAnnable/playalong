import { describe, expect, it } from 'vitest';
import { mainTimeFromSpeedFile, speedFileFor, speedFileTime } from './speedFiles';

describe('pre-rendered speed files', () => {
  const files = { '50': 'songs/x/speed-50.mp3', '75': 'songs/x/speed-75.mp3' };

  it('picks the file for a speed step, and nothing at 100% or for a step without one', () => {
    expect(speedFileFor(files, 50)).toBe('songs/x/speed-50.mp3');
    expect(speedFileFor(files, 60)).toBeNull();
    expect(speedFileFor(files, 100)).toBeNull();
    expect(speedFileFor(undefined, 50)).toBeNull();
  });

  it('maps between the main recording and a slowed file both ways', () => {
    // At 50% the slowed file is twice as long: 30s into the song is 60s into it.
    expect(speedFileTime(30, 50)).toBe(60);
    expect(mainTimeFromSpeedFile(60, 50)).toBe(30);
    expect(mainTimeFromSpeedFile(speedFileTime(12.5, 75), 75)).toBeCloseTo(12.5, 9);
  });
});
