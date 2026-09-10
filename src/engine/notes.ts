import { model } from '@coderline/alphatab';

export interface NoteEvent {
  startTick: number;
  endTick: number;
  bar: number;
  beatIndex: number;
  /** 1 = high E … 6 = low E — alphaTab numbers strings from the bottom, this flips it. */
  string: number;
  /** -1 for rests/dead notes. */
  fret: number;
  finger: 0 | 1 | 2 | 3 | 4;
  fingerSource: 'gp' | 'guess';
  techniques: {
    hammer?: boolean;
    pull?: boolean;
    slide?: boolean;
    bend?: boolean;
    palmMute?: boolean;
    harmonic?: boolean;
    vibrato?: boolean;
    dead?: boolean;
    tie?: boolean;
  };
  isChord: boolean;
}

export interface BarMarker {
  tick: number;
  barNumber: number;
  sectionText?: string;
}

export function extractBarMarkers(score: model.Score): BarMarker[] {
  return score.masterBars.map((bar) => ({
    tick: bar.start,
    barNumber: bar.index + 1,
    sectionText: bar.section?.text || undefined,
  }));
}

function fingerFromGp(note: model.Note): 0 | 1 | 2 | 3 | 4 | null {
  if (!note.isFingering) return null;
  switch (note.leftHandFinger) {
    case model.Fingers.IndexFinger:
      return 1;
    case model.Fingers.MiddleFinger:
      return 2;
    case model.Fingers.AnnularFinger:
      return 3;
    case model.Fingers.LittleFinger:
      return 4;
    case model.Fingers.Thumb:
      return 0;
    default:
      return null;
  }
}

/** Flattens one track's notation into a flat, time-sorted array of NoteEvents. */
export function extractNotes(track: model.Track): NoteEvent[] {
  const events: NoteEvent[] = [];
  const eventByNote = new Map<model.Note, NoteEvent>();
  const staff = track.staves[0];
  if (!staff) return events;
  const stringCount = staff.tuning.length;

  for (const bar of staff.bars) {
    const voice = bar.voices[0];
    if (!voice) continue;

    voice.beats.forEach((beat, beatIndex) => {
      if (beat.isRest || beat.notes.length === 0) return;
      const startTick = beat.absolutePlaybackStart;
      const endTick = startTick + beat.playbackDuration;
      const isChord = beat.notes.length > 1;

      for (const note of beat.notes) {
        // A tied note doesn't get its own pill — it just extends the
        // originating note's duration (build plan 5.6: "no new number,
        // extended bar").
        if (note.isTieDestination && note.tieOrigin) {
          const originEvent = eventByNote.get(note.tieOrigin);
          if (originEvent) {
            originEvent.endTick = endTick;
            // Register this note too, so a longer tie chain (A -> B -> C)
            // keeps resolving back to A's event when C is processed.
            eventByNote.set(note, originEvent);
            continue;
          }
        }

        const isHammerPull = note.isHammerPullOrigin;
        const destinationFret = note.hammerPullDestination?.fret ?? note.fret;
        const gpFinger = fingerFromGp(note);

        const event: NoteEvent = {
          startTick,
          endTick,
          bar: bar.index + 1,
          beatIndex,
          string: stringCount - note.string + 1,
          fret: note.isDead ? -1 : note.fret,
          finger: gpFinger ?? 0,
          fingerSource: gpFinger !== null ? 'gp' : 'guess',
          techniques: {
            hammer: (isHammerPull && destinationFret > note.fret) || undefined,
            pull: (isHammerPull && destinationFret <= note.fret) || undefined,
            slide:
              note.slideInType !== model.SlideInType.None || note.slideOutType !== model.SlideOutType.None || undefined,
            bend: note.hasBend || undefined,
            palmMute: note.isPalmMute || beat.isPalmMute || undefined,
            harmonic: note.isHarmonic || undefined,
            vibrato: note.vibrato !== model.VibratoType.None || undefined,
            dead: note.isDead || undefined,
            tie: note.isTieDestination || undefined,
          },
          isChord,
        };
        events.push(event);
        eventByNote.set(note, event);
      }
    });
  }

  return events.sort((a, b) => a.startTick - b.startTick);
}
