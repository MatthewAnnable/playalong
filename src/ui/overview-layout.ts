import type { BarMarker, NoteEvent } from '../engine/notes';

export interface OverviewSection {
  label: string;
  /** Share of the whole recording, 0–1. */
  start: number;
  end: number;
}

export interface OverviewNote {
  start: number;
  end: number;
  /** 0 = high e … 5 = low E. */
  lane: number;
  finger: 0 | 1 | 2 | 3 | 4;
}

export interface OverviewLayout {
  sections: OverviewSection[];
  notes: OverviewNote[];
}

/**
 * The whole song laid out along the progress bar: each named section from
 * where it starts to where the next one does, and every note on its string.
 * Positions are shares of the recording's length, so they line up with the
 * scrubber's thumb (which runs on the recording, not on ticks).
 */
export function layoutOverview(
  notes: NoteEvent[],
  markers: BarMarker[],
  tickToSeconds: (tick: number) => number,
  durationSec: number,
): OverviewLayout {
  if (durationSec <= 0) return { sections: [], notes: [] };
  const share = (tick: number) => Math.min(Math.max(tickToSeconds(tick) / durationSec, 0), 1);

  // A section bar inside a repeat is marked on every pass — R U Mine's intro
  // riff four times over — but it's one section, so a pass that starts the
  // same section on the same bar again doesn't start a new one.
  const starts: BarMarker[] = [];
  for (const marker of markers) {
    if (!marker.sectionText) continue;
    const last = starts[starts.length - 1];
    if (last && last.barNumber === marker.barNumber && last.sectionText === marker.sectionText) continue;
    starts.push(marker);
  }
  const sections = starts.map((marker, i) => ({
    label: marker.sectionText!,
    start: share(marker.tick),
    end: i + 1 < starts.length ? share(starts[i + 1].tick) : notes.length > 0 ? share(notes[notes.length - 1].endTick) : 1,
  }));

  const placed = notes
    .filter((n) => n.fret >= 0)
    .map((n) => ({ start: share(n.startTick), end: share(n.endTick), lane: n.string - 1, finger: n.finger }));

  return { sections, notes: placed };
}
