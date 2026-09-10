/**
 * Single source of truth for "now", per build plan 5.3. alphaTab's own
 * position updates only arrive every 20ms (see alphatab.ts); the highway
 * view needs a smooth 60fps position, so between updates we extrapolate
 * from the real audio clock using the tempo in effect at the last sample.
 */
export interface ClockSample {
  audioSeconds: number;
  tick: number;
  ticksPerSecond: number;
}

let lastSample: ClockSample = { audioSeconds: 0, tick: 0, ticksPerSecond: 1 };

export function recordSample(audioSeconds: number, tick: number, ticksPerSecond: number): void {
  lastSample = { audioSeconds, tick, ticksPerSecond };
}

export function getExtrapolatedTick(currentAudioSeconds: number): number {
  const elapsed = currentAudioSeconds - lastSample.audioSeconds;
  return lastSample.tick + elapsed * lastSample.ticksPerSecond;
}

export function reset(): void {
  lastSample = { audioSeconds: 0, tick: 0, ticksPerSecond: 1 };
}
