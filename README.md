# Play-Along

A browser play-along for guitar lessons. Open a Guitar Pro file, and it plays
the real recording in sync with the tab, on screen or on an iPad.

Drag a `.gp` file onto the page and it plays, in sync, with a score view and
a Yousician-style highway view.

## Presentation mode (for teaching)

Press **Presentation** (or `P`) and the chrome goes away, leaving the stage
full screen with a slim transport that fades out until you move or press
something.

In the score view, presentation mode lays the music out the way Guitar Pro's
"Screen — horizontal" does: one long line that scrolls itself past a fixed
reading point, drawn large enough to read across a room. Nothing to scroll by
hand mid-lesson. In the highway view it simply fills the screen.

Press `Escape` to come back.

## Moving around a song

Drag the progress bar and the score and the highway follow your thumb, so you
can see where you are about to land before you let go.

## How the highway shows joins

Notes on the same string sit apart when they are apart in time. Two notes
played one after another have a thin nick of stage between them, so a run can
be counted. Two notes played with **one pick** — a hammer-on, a pull-off or a
legato slide — are joined through the middle: the straight part of each pill's
edge is bridged, while the corners keep exactly the curve every other pill has.
The mark above the lane says which gesture it is: a curve with an H
or a P for hammer-ons and pull-offs, a straight diagonal leaning the way the
finger travels for a slide.

The joined pair still shows two clearly separate pills. That matters because
a slide is played with one finger, so both notes carry the same colour — a 1
sliding to a 2 must never read as "12".

A pill is exactly as long as its note and nothing is allowed to change that:
every sixteenth on the stage is the same length as every other sixteenth, so
the highway never suggests one note is held longer than it is.

Palm muting is marked the way tab marks it: **P.M.** with a dashed rule across
the top of the stage showing how far it lasts.

## Chord names

When a song's chords are written into the Guitar Pro file, the highway shows
each one as a single pill across the strings — "G", "Am7", "Dsus4" — instead
of a fret number per string. Where the file doesn't name a chord, the app
works it out from the shape. Chords are drawn in their own colour — a plum that belongs to no finger,
because a chord is every finger at once. **Chord names** in the top rail turns
it off and on; it starts on for a song with chords written in, and off for a
riff song.

Two-note shapes are never collapsed. A power chord spread over three strings
is still two notes, and "D5" in place of the frets would hide the riff.

## Sharing a practice link

Set up the loop, speed, track and view you want, then press **Copy practice
link** and paste it into a lesson email. The link carries everything except
the song itself — when a student opens it, the page asks them to drop their
copy of the file, then jumps straight to the right bars and speed.

## Keyboard and foot pedals

Press **Shortcuts** to see the key for every action, and **Set** to change
one. Whatever your pedals already send is fine — including combinations like
Ctrl+Shift+M — so there's no need to reprogram them in elfkey. The map is
saved in the browser, and **Export** writes it to a file you can import again
after a browser reset.

## Fixing a wrong fingering

Where the Guitar Pro file doesn't say which finger to use, the app guesses.
Guesses aren't marked on screen — on a file with no fingering at all that was
every note, which just added noise. If a guess is wrong, click the note in the
highway view to cycle it. Corrections are remembered per song on that device.

## Using it in OBS

1. Open `/remote` in a normal browser tab — this is where you drop the song
   and control playback, and where the sound comes from.
2. In OBS, add a **Browser Source** pointing at the app with `?mode=obs` and
   tick "Shutdown source when not visible" off.

The OBS source shows only the lanes and notes on a transparent background,
so it sits over your camera with no black box. It follows the remote tab, so
you never need to click inside OBS. "Audio from OBS" swaps which side makes
the sound.

## The hosted library (off by default)

The app is drag-and-drop only, and this repo contains no songs. To switch on
a hosted library later, set `MANIFEST_URL` in `src/ui/manifest.ts` (or pass
`?manifest=`) to a manifest like `songs/index.example.json`. Then
`npm run add-song path/to/file.gp` copies a song in and adds its entry.

## Running it locally

```bash
npm install
npm run dev
```

Then open the address it prints (usually `http://localhost:5173`).

## Building for GitHub Pages

Pushing to `main` builds and deploys automatically via
`.github/workflows/deploy.yml`. To build locally:

```bash
npm run build
npm run preview
```

## What's in here

- No song files are ever committed to this repo. `test-songs/` is
  git-ignored and is only for testing on this machine.
- `design/` holds the design system this app is built to.

## alphaTab version

This app is pinned to a specific version of the
[alphaTab](https://alphatab.net) library (see `package.json`). If you need to
upgrade it, check alphaTab's audio/video sync guide first — some of the APIs
this app relies on (`PlayerMode.EnabledExternalMedia`, the external media
handler, GP8 backing tracks and sync points) are recent additions and can
change between versions.
