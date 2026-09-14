# Project status

Companion to `playalong-build-plan.md`. That file is the plan; this one is
where things actually stand. Update it at the end of each phase.

**Last updated:** 2026-09-13, after Matthew's second round of play-testing notes.

## Done

| Phase | State |
|---|---|
| 0 — Skeleton and proof of sync | Done, checked by Matthew |
| 1 — Branded player and score view | Done, checked by Matthew |
| 2 — Highway view | Done, checked by Matthew |
| 3 — Links, shortcuts, OBS, overrides, library switch | Built and verified in-browser; **not yet checked by Matthew on real hardware** |
| Visual redesign (out of plan) | Done — Claude Design redesign, implemented and regression-tested |
| Play-testing round 1 | Done — seven fixes from Matthew's notes; **not yet checked by him** |
| Play-testing round 2 | Done — chord pills, slide redraw, play button; **not yet checked by him** |

The redesign moved the chrome to a top rail plus a fixed bottom transport
dock, and rewrote the highway renderer so consecutive notes merge into
grouped runs. `src/theme/themes/default.json` is now the full contract for
the stage — colours *and* geometry — so visual tuning belongs in that file
rather than in `highway-view.ts`.

## Play-testing round 1 (2026-09-13)

Seven items from Matthew's notes, all landed:

1. **Scrubbing shows where you are.** Dragging the progress bar now seeks
   live, throttled to one seek per frame, so the score cursor and the highway
   move with the thumb. The seek also stopped going through
   `api.timePosition`, which rounds to the nearest sync point and could land
   seconds away from where the thumb was.
2. **Presentation mode is now "Screen — horizontal".** The score view in
   presentation lays out as one endless line at 1.7× scale, scrolled smoothly
   by alphaTab with the cursor parked a fifth in from the left. Two gotchas
   worth remembering: alphaTab's lazy partial rendering has to be turned off
   (it cannot tell what is visible inside a script-scrolled clipped
   container), and `.at-surface` must not be a flex item or the line collapses
   to the container width and renders blank past the first screen. The layout
   is only built when the score is the visible view.
3. **Guessed-fingering rings removed.** On a file with no fingering that was
   every note.
4. **Technique marks redrawn.** Slides use the real direction from the file
   (`slideTarget` for shift/legato, the out-type otherwise) instead of always
   drawing an ascending tail; inside a run the slide leans the seam between
   the two notes rather than laying a tail over the neighbour. Bends carry
   their depth — arrow height scaled by tones, labelled ½ / full / 1½ — and
   technique marks are cream, not the note's finger colour.
5. **Play button works in presentation.** The faded transport dock was
   `pointer-events: none`, so a press on the play button went straight through
   to the score behind it and did nothing. The dock stays pressable while
   faded, any press or keypress brings it back, and a second press during the
   count-in now skips into playback instead of cancelling back to a standstill.
6. **Scratched notes no longer overlap.** Short notes are widened to stay
   readable, but only into space that is actually free — dead notes are drawn
   narrower than their duration, so every one of them wanted padding and each
   grew into its neighbour. The × is stroked to fit the cell rather than set
   as pill-sized text.
7. **Harmonic fret numbers fit.** The diamond was a fixed 34px square holding
   a 46px number; it is now sized from the lane like every other note and the
   number is shrunk to the width across the diamond's waist.

## Play-testing round 2 (2026-09-13)

1. **Chord pills.** A beat sounding three or more strings that spell three or
   more different notes collapses into one named pill across those strings.
   `src/engine/chords.ts` names the shape when the file doesn't, matching
   pitch classes against the shapes a guitarist would name, returning a slash
   chord when the bass isn't the root and `null` rather than a guess. Two-note
   shapes are never collapsed — on Freedom that was the difference between 649
   notes swallowed and 360. The toggle defaults to whatever the file implies
   (`trackNamesChords`), so riff songs are unaffected unless asked.
2. **Slides redrawn again.** The leaning seam didn't say "slide". A slide now
   breaks the run capsule, carves a gap from both pills and draws the slash
   between them. Pills may shrink to `runCellNumberMinWidth * 0.7`, the same
   width at which a number is still drawn. Still the weakest mark on the
   stage at sixteenth-note spacing — it is the headline item in the design
   hand-off.
3. **The play button, third attempt.** It fires on `pointerdown` now, its
   label lives in a `<span>` with `pointer-events: none`, the button doesn't
   select as text, and the transport's labels are only rewritten when they
   change rather than 50 times a second under the pointer. Any one of those
   could have been the cause; together they cannot be.
4. **Horizontal reading point moved to 40%**, so bars just played stay on
   screen, and the score scales to the window instead of a fixed 1.7×.
5. **Open-string keylines removed** — the colour already said it.
6. Two things found while testing: the highway was capped at 640px tall in
   presentation by a `max-height` meant for the windowed stage, and the
   "your browser blocked playback" overlay was appearing for any rejected
   `play()`, including the AbortError a seek causes.

## Play-testing round 3 (2026-09-13)

Play button confirmed fixed by Matthew. Three more from the same message:

1. **A pill's left edge is now always the note's start time.** Gaps for a
   slide come out of the end of the note before it, never the start of the
   note after, and a short pill that needs widening grows rightwards only. It
   used to grow both ways, which moved a note's apparent start earlier — on a
   play-along that is the one thing that must never be wrong.
2. **Hammer-ons and pull-offs link the two notes.** The arc used to sit on top
   of the first note alone. It now spans from one pill to the next and carries
   the H or P a tab would print.
3. **The highway never resized when presentation mode did.** The canvas kept
   its old backing store, so the stage drew at the wrong scale until the
   window changed. A `ResizeObserver` on the canvas now handles it — found
   while photographing the stage for the design hand-off, and it would have
   been visible to Matthew as a soft, oddly-scaled highway in every lesson.

## Built from the design canvas (2026-09-13)

Matthew picked the directions and asked for one change to the join language,
which turned out to be the important one.

**The join language, with his camber.** The highway no longer merges a run of
notes into one subdivided capsule. Every note is its own pill, and how it
meets the next one carries meaning:

- apart in time → a real gap
- consecutive, picked one at a time → a 7px nick of stage ground
- **one pick for both notes** (hammer-on, pull-off, legato slide) → the
  straight middle of each pill's edge is bridged, joining them through the
  centre while every corner keeps exactly the curve every other pill has

That last point is Matthew's, and it is what makes the scheme work: a slide is
played with one finger, so both pills are the same colour, and the canvas's
single-outline join would have made 1 sliding to 2 read as "12". A first
attempt gave the meeting corners a deeper curve, which he rejected — the
corners have to match every other pill, and only the centre may touch.

**A pill's width is its note's value and nothing else.** Every modifier is
gone: the minimum-width padding for short notes, the narrower dead note, the
tail trimmed differently depending on the join. Each cost a note some width and
made two notes of the same value look like different lengths, which reads as
one being held longer. Now every note gives up the same nick from its tail and
nothing else touches it, so all sixteenths match, all quarters match.

**Everything else from the canvas**, as recommended there:

- The slide mark moved into the clear lane above the pills, spanning the two
  notes, leaning up or down. No note pays width for it any more.
- Hammer-ons and pull-offs keep the arc and the H / P, also above the lane.
- Palm mute is now tab's **P.M.** plus a dashed rule across the top of the
  stage, replacing the dotted outline inside each pill.

**Chords: Option A, not the canvas's recommendation.** Matthew chose the
filled block. It is no longer cream — that was always a placeholder — but the
brand plum lifted for a dark stage (`#845B66`, cream ink at 5.4:1), a fifth
hue belonging to no finger. The block is exactly as wide as the chord is long
and never grows to fit its name: growing it ran the block over the notes after
it and gave neighbouring chords different type sizes. A long name on a short
chord shrinks instead.

The canvas still shows the superseded chord recommendation (Option B) and the
single-outline join. It is the design record, not the spec — the code above is
what ships.

## Design hand-off 3 (ready to send)

`../playalong-design-handoff-3/` — a review pass on the built stage rather
than a fresh design. Five captures of the **live renderer** (not mock-ups),
the current theme JSON, and the previous brief for context.

It asks for four things to be looked at, in order: the **slide mark**, which
is the weakest and reads as a chevron where two slides meet; the **join** at
speed; the **chord block's plum** beside the four finger colours; and the
**P.M. rail**, which is tab-correct in the header band but a long way from a
bottom-string riff. It explicitly asks the designer not to redesign what is
working, and states both non-negotiable rules — left edge is the note's start,
and a pill's length is its note's value.

## Design hand-off 2 (sent)

Claude Design's answer is a canvas at
https://claude.ai/code/artifact/4f9a7f8d-4f97-47f4-a4d8-fb2992449269 —
five boards drawn at true size for a 1080px stage. Source for it lives in
`../playalong-design-handoff-2/canvas/` (`.dc.html` per board plus
`canvas.json`); re-seeding from those files is how it gets updated.

What it proposes, none of it built yet:

- **Flush means one pick.** Matthew's inversion, extended: a gap is separation
  in time, a 7px nick is a run picked note by note, and a flush single-outline
  pill is one hand gesture — hammer-on, pull-off *or* legato slide. The colour
  still changes where the finger does, so the join costs no information. The
  mark above the lane says which gesture.
- **The slide moves above the lane.** Today's carved gap makes the *first*
  note pay: at sixteenth spacing the 5 shrinks to its 39px floor and its
  number from 56px to 30px. A diagonal in the lane's 34px top margin costs no
  width at all.
- **The chord pill becomes a band with its name at the attack edge** rather
  than a filled block with the name floating in the middle — much less cream
  on a dark stage, and the name stays horizontal and legible at any length.
- **Palm mute becomes tab's P.M. plus a dashed rule** above the run; the
  dotted outline inside each pill is invisible at distance.

## Original hand-off brief (as sent)

`../playalong-design-handoff-2/` — same shape as the first one. Covers the
technique marks and the chord pills, with seven frames captured from the live
renderer at 1440×900 (the hammer-on one is synthetic and says so — Freedom
contains none).

Three things are put to the designer: the slide, which is still the weakest
mark at sixteenth-note spacing; Matthew's proposal to **invert what "joined"
means** — separate ordinary consecutive pills and reserve a direct join for
hammer-on and pull-off pairs, which is a change to how every note is drawn;
and the chord pill's styling, which is explicitly a placeholder.

## Asked for, not built (waiting on Matthew)

- **Microphone listening / Yousician-style scoring.** Explicitly a non-goal
  for v1 (build plan §7) and a genuinely large piece of work: polyphonic
  pitch detection on a distorted electric guitar is hard, and the honest
  version is monophonic — fine for scales and single-note riffs, unreliable
  for chords. If it is ever wanted, the sane first slice is "did the right
  note sound near the right time" on single-note lines only, as a practice
  aid rather than a score.
- **Chord-shape recognition → one named pill.** Very doable and a good fit
  for chord songs: Guitar Pro files often carry the chord name on the beat
  (`beat.chord`), so the first version needs no recognition at all — just
  draw one pill spanning the lanes when a beat has a chord and more than
  two notes, with a tap to expand back to fret numbers. Shape matching
  against a chord dictionary would only be needed for files without chord
  names.
- **Expanding one chord pill back to fret numbers on click.** The toggle is
  all-or-nothing today. Clicking a chord to see the shape behind it is the
  obvious next step if he wants it.

## Next: Phase 4 — Polish and hand-over

From the build plan:

- Safari + Chrome + iPad Safari pass
- Touch targets
- Loading states
- Error messages in plain English
- README covering add-a-song, share-a-link, change-the-theme, move-to-portal
- Tag `v1.0`

Note the README already covers add-a-song, share-a-link and OBS. The two
gaps are **change-the-theme** and **move-to-portal**.

## Open loose ends

Ordered roughly by how likely they are to matter.

1. **`?theme=` is read but never applied, and `daylight.json` can't be
   selected.** The redesign shipped a second theme, and the URL parameter is
   parsed into `LinkParams`, but nothing calls `setHighwayTheme` with it.
   This is a natural Phase 4 item since the README has to document
   changing the theme anyway.

2. **A `.gp` with no embedded audio still can't have audio added.** The plan
   (5.3) wants a "audio starts at X seconds" offset field. Deferred in Phase
   1 because generating synthetic sync points needs
   `MidiFileGenerator.generateSyncPoints`, which alphaTab does not export
   publicly. Currently shows a plain-English message instead. Rare in
   Matthew's workflow — he always authors audio in Guitar Pro 8.

3. **Small gap when a loop wraps.** The browser re-decodes the MP3 from the
   seek target. Detection was tightened to a 20ms poll, but the decode cost
   remains. A real fix means Web Audio buffer playback, which would lose
   `preservesPitch` for the speed slider unless a time-stretch library is
   added. Matthew has heard this and accepted it for now.

4. **Fingering overrides and the shortcut map live in browser storage**, not
   the per-song `overrides.json` the plan describes (5.4). A static site
   can't write files. Both have JSON export/import as the backup path.

5. **Loop is set with bar-number inputs**, not by clicking bar numbers on the
   score as the plan describes. Matthew was told and did not object.

6. **A hidden remote tab gets timer-throttled to ~1Hz**, slowing position
   broadcasts to the OBS source. The follower clock interpolates, so it
   degrades smoothly rather than stuttering. A Web Worker timer is the fix
   if it ever shows in practice.

7. **Percussion tracks** get fret/string-shaped notes like guitar, which
   doesn't mean much visually. No separate drum treatment.

8. **Presentation background is `#1C211A` while the stage is `#171B14`.**
   A possible faint seam introduced by the redesign — worth a look.

## Running and testing

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest, 14 tests
npm run build        # also builds remote.html
```

Test song lives at `test-songs/freedom/song.gp` (git-ignored). Drag it onto
the page.

Useful URLs:

- `?song=freedom&from=17&to=24&speed=0.7&view=highway` — a practice link
- `?mode=remote` (or `/remote.html`) — the OBS control page
- `?mode=obs` — the transparent browser source
- `?manifest=/songs/index.json` — switches the hosted library on locally
  (run `npm run add-song test-songs/freedom/song.gp` first)

## Things to know before changing code

- **The highway is canvas-drawn.** Visual changes to the stage are values in
  the theme JSON, not CSS.
- **alphaTab is pinned to 1.8.4.** The external-media APIs it relies on are
  recent; check the audio/video sync guide before upgrading.
- **Never commit songs or audio.** `test-songs/`, `songs/` (bar the example
  manifest), `public/` and the design source folders are all git-ignored.
- Git has no `user.email` configured on this machine, so commits are
  attributed to `matthewannable@MacBook-Pro.local`. Harmless, but it means
  commits aren't linked to the GitHub account.
