import { midi, model, Settings } from '@coderline/alphatab';

/**
 * One bar as it is actually *played*. A written bar inside a repeat is played
 * several times, each at a different tick — and ticks are what the player,
 * the audio sync points and the score cursor all run on. Anything laid out
 * against the written bars instead drifts further behind with every repeat.
 */
export interface PlayedBar {
  /** 1-based bar number as written in the score, shown to the player. */
  barNumber: number;
  /** Tick this pass through the bar starts at, repeats unrolled. */
  start: number;
  end: number;
  /** Tempo changes inside this pass, as absolute playback ticks. */
  tempoChanges: { tick: number; tempo: number }[];
  masterBar: model.MasterBar;
}

/**
 * The bars in playback order, straight from alphaTab's own MIDI generator —
 * the same pass that produces the ticks the player reports — so repeats,
 * alternate endings and D.S./coda jumps land exactly where playback does.
 */
export function buildTimeline(score: model.Score): PlayedBar[] {
  const generator = new midi.MidiFileGenerator(score, new Settings(), new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()));
  generator.generate();
  return generator.tickLookup.masterBars.map((lookup) => ({
    barNumber: lookup.masterBar.index + 1,
    start: lookup.start,
    end: lookup.end,
    tempoChanges: lookup.tempoChanges.map((change) => ({ tick: change.tick, tempo: change.tempo })),
    masterBar: lookup.masterBar,
  }));
}

/** The written bars once through, for callers (tests) with no timeline to hand. */
export function linearTimeline(score: model.Score): PlayedBar[] {
  return score.masterBars.map((bar) => ({
    barNumber: bar.index + 1,
    start: bar.start,
    end: bar.start + bar.calculateDuration(),
    tempoChanges: [],
    masterBar: bar,
  }));
}

/** Index into the timeline of the pass that is playing at `tick`. */
export function playedIndexAtTick(timeline: PlayedBar[], tick: number): number {
  let lo = 0;
  let hi = timeline.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].start <= tick) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
