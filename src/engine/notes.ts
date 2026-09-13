import { model } from '@coderline/alphatab';
import { nameChord } from './chords';

export interface NoteEvent {
  startTick: number;
  endTick: number;
  /** Where the plain pill ends and the tie sustain bar begins, if this note carries ties. */
  tieBarStartTick?: number;
  bar: number;
  beatIndex: number;
  /** 1 = high E … 6 = low E — alphaTab numbers strings from the bottom, this flips it. */
  string: number;
  /** -1 for rests/dead notes. */
  fret: number;
  /** Sounding MIDI pitch, tuning and capo included — used to name chords. */
  pitch: number;
  finger: 0 | 1 | 2 | 3 | 4;
  fingerSource: 'gp' | 'guess' | 'override';
  techniques: {
    hammer?: boolean;
    pull?: boolean;
    slide?: boolean;
    /** Which way the slide leaves this note — tab draws a rising or falling tail, never both the same. */
    slideOut?: SlideDirection;
    /** Which way the slide arrives at this note, for a lead-in tail before the pill. */
    slideIn?: SlideDirection;
    bend?: boolean;
    /** How far the bend goes, in frets (0.5 = half a tone). Drives the arrow height and its label. */
    bendFrets?: number;
    palmMute?: boolean;
    harmonic?: boolean;
    vibrato?: boolean;
    dead?: boolean;
    tie?: boolean;
  };
  isChord: boolean;
  /**
   * The chord this beat spells, from the file if it names one and otherwise
   * recognised from the shape. Present on every note of the beat.
   */
  chordName?: string;
}

export type SlideDirection = 'up' | 'down';

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

/**
 * Which way a slide leaves the note. A shift/legato slide is only known by
 * looking at where it lands; the "slide out" types say so directly.
 */
function slideOutDirection(note: model.Note): SlideDirection | undefined {
  switch (note.slideOutType) {
    case model.SlideOutType.Shift:
    case model.SlideOutType.Legato: {
      const target = note.slideTarget;
      if (!target) return undefined;
      return target.fret > note.fret ? 'up' : 'down';
    }
    case model.SlideOutType.OutUp:
    case model.SlideOutType.PickSlideUp:
      return 'up';
    case model.SlideOutType.OutDown:
    case model.SlideOutType.PickSlideDown:
      return 'down';
    default:
      return undefined;
  }
}

function slideInDirection(note: model.Note): SlideDirection | undefined {
  switch (note.slideInType) {
    case model.SlideInType.IntoFromBelow:
      return 'up';
    case model.SlideInType.IntoFromAbove:
      return 'down';
    default:
      return undefined;
  }
}

/**
 * How far the string is pushed, in frets. alphaTab stores bend points in
 * quarter tones, so 2 units = one semitone = one fret — which is what the
 * highway needs to draw a half bend differently from a full one.
 */
function bendFrets(note: model.Note): number | undefined {
  if (!note.hasBend) return undefined;
  const points = note.bendPoints;
  if (!points || points.length === 0) return undefined;
  let max = 0;
  let min = 0;
  for (const point of points) {
    if (point.value > max) max = point.value;
    if (point.value < min) min = point.value;
  }
  const quarterTones = Math.max(max, Math.abs(min));
  if (quarterTones === 0) return undefined;
  return quarterTones / 2;
}

/**
 * What counts as a chord worth collapsing into one named pill. Three sounding
 * strings spelling three *different* notes: that rules out the fifths and
 * octaves a riff is built from — a dropped-D power chord across three strings
 * is still two notes, and turning it into "D5" would hide the very thing a
 * riff lesson is about.
 */
const MIN_CHORD_NOTES = 3;
const MIN_CHORD_PITCH_CLASSES = 3;

function chordNameFor(beat: model.Beat): string | undefined {
  const sounding = beat.notes.filter((note) => !note.isDead && !note.isTieDestination);
  if (sounding.length < MIN_CHORD_NOTES) return undefined;
  const pitches = sounding.map((note) => note.realValue);
  if (new Set(pitches.map((p) => ((p % 12) + 12) % 12)).size < MIN_CHORD_PITCH_CLASSES) return undefined;
  const named = beat.chord?.name?.trim();
  if (named) return named;
  return nameChord(pitches) ?? undefined;
}

/**
 * Whether the file itself names chords on this track. That is the signal that
 * a song is a chord song: on one, the chord pills are what you want to read,
 * and on a riff song they would bury the frets under jazz names.
 */
export function trackNamesChords(track: model.Track): boolean {
  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          if (beat.chord?.name?.trim()) return true;
        }
      }
    }
  }
  return false;
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
      const chordName = chordNameFor(beat);

      for (const note of beat.notes) {
        // A tied note doesn't get its own pill — it just extends the
        // originating note's duration (build plan 5.6: "no new number,
        // extended bar").
        if (note.isTieDestination && note.tieOrigin) {
          const originEvent = eventByNote.get(note.tieOrigin);
          if (originEvent) {
            if (originEvent.tieBarStartTick === undefined) originEvent.tieBarStartTick = originEvent.endTick;
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
          pitch: note.realValue,
          finger: gpFinger ?? 0,
          fingerSource: gpFinger !== null ? 'gp' : 'guess',
          techniques: {
            hammer: (isHammerPull && destinationFret > note.fret) || undefined,
            pull: (isHammerPull && destinationFret <= note.fret) || undefined,
            slide:
              note.slideInType !== model.SlideInType.None || note.slideOutType !== model.SlideOutType.None || undefined,
            slideOut: slideOutDirection(note),
            slideIn: slideInDirection(note),
            bend: note.hasBend || undefined,
            bendFrets: bendFrets(note),
            palmMute: note.isPalmMute || beat.isPalmMute || undefined,
            harmonic: note.isHarmonic || undefined,
            vibrato: note.vibrato !== model.VibratoType.None || undefined,
            dead: note.isDead || undefined,
            tie: note.isTieDestination || undefined,
          },
          isChord,
          chordName,
        };
        events.push(event);
        eventByNote.set(note, event);
      }
    });
  }

  return events.sort((a, b) => a.startTick - b.startTick);
}
