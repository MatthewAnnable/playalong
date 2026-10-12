import type { PlayedBar } from './timeline';

/**
 * A known point on the way from playback ticks to the recording's own time:
 * at `tick` the recording is at `ms`, and from there it runs at `bpm`.
 */
export interface TimeAnchor {
  tick: number;
  ms: number;
  bpm: number;
}

/**
 * Anchors from the tempo alone, for a score with no sync points: the
 * recording is assumed to follow the written tempo exactly from tick 0.
 */
export function tempoAnchors(timeline: PlayedBar[], startBpm: number, ticksPerQuarter: number): TimeAnchor[] {
  const anchors: TimeAnchor[] = [{ tick: 0, ms: 0, bpm: startBpm }];
  for (const played of timeline) {
    for (const change of played.tempoChanges) {
      const last = anchors[anchors.length - 1];
      if (change.tick < last.tick || change.tempo === last.bpm) continue;
      const ms = last.ms + ((change.tick - last.tick) / ticksPerQuarter) * (60000 / last.bpm);
      anchors.push({ tick: change.tick, ms, bpm: change.tempo });
    }
  }
  return anchors;
}

/**
 * Where in the recording (ms) a tick lands. Between two anchors it's a
 * straight line from one to the next, so a sync point's stretch is honoured;
 * before the first or after the last it runs at that anchor's tempo.
 */
export function msAtTick(anchors: TimeAnchor[], tick: number, ticksPerQuarter: number): number {
  if (anchors.length === 0) return 0;
  let lo = 0;
  let hi = anchors.length - 1;
  if (tick <= anchors[0].tick) {
    const a = anchors[0];
    return a.ms + ((tick - a.tick) / ticksPerQuarter) * (60000 / a.bpm);
  }
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (anchors[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  const a = anchors[lo];
  const b = anchors[lo + 1];
  if (b && b.tick > a.tick) return a.ms + ((tick - a.tick) / (b.tick - a.tick)) * (b.ms - a.ms);
  return a.ms + ((tick - a.tick) / ticksPerQuarter) * (60000 / a.bpm);
}
