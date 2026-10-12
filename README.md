# Play-Along

A browser play-along for guitar lessons. Open a Guitar Pro file, and it plays
the real recording in sync with the tab, on screen or on an iPad.

Drag a `.gp` file onto the page and it plays, in sync, with a score view and
a Yousician-style highway view. A song opens on the highway; a practice link
can ask for the score instead (`view=score`).

## Full screen and presentation mode

The big amber **Full screen** button on the stage, just above the board, is
the one a student will find without being told. It goes into presentation
mode and takes the browser full screen too, so the address bar and tabs go.
**Exit full screen** in the transport (or `Escape`) comes back.

**Presentation** in the top rail (or `P`) is the same mode without taking the
browser full screen, which suits sharing a window on Zoom. Either way the
chrome goes away, leaving the stage with a slim transport that fades out until
you move or press something.

In the score view, presentation mode lays the music out the way Guitar Pro's
"Screen — horizontal" does: one long line that scrolls itself past a fixed
reading point, drawn large enough to read across a room. Nothing to scroll by
hand mid-lesson. In the highway view the board takes the bottom half.

Press `Escape` to come back.

## Moving around a song

Drag the progress bar and the score and the highway follow your thumb, so you
can see where you are about to land before you let go.

The progress bar is also a map of the song. Each section is named along the
top, and every note sits on its string in its finger's colour, so you can see
where the busy riff or the solo is and drag straight to it. What you've
already played is dimmed, and a loop shows as an amber band.

## The board

The highway is drawn as six real strings on a dark board, tilted away from
you the way you look down at your own neck: the low E nearest and largest,
the high e furthest and smallest. The top three strings are thin plain steel
and the bottom three thicker bronze-wound, so you can tell a note's string
from the string it sits on.

Bar lines lean with the tilt. Between them, faint lines mark each beat and
fainter ones the off-beats, so you can see whether a note lands on the beat
or on the "and".

A ball hops from note to note and lands on each one as it's played. The
height of each hop grows with the gap, and dotted arcs show the next few hops,
so you can see how long until the next note before it arrives. A hand in the
top corner shows which colour is which finger.

In presentation and OBS mode the board fills only the bottom half of the
screen, on its own solid ground. In OBS the camera above it still shows you
playing; in presentation the top half is kept free for a video of the song
being played, and the transport dock sits there too so it never covers the
low strings. Add `&board=0.4` (anything from 0.25 to 1) to the URL to change
how much of the screen the board takes.

## A video of the song being played

A library song can carry a silent video of you playing it. In the normal view
it sits above the board; in presentation it fills the top half, above the
board or above the scrolling score, which then takes the bottom half. (OBS
mode leaves it out: the live camera is there.) It follows the recording exactly:
play, pause, scrubbing, loops and slower speeds all carry the video along,
so at 70% the student sees your hands at 70% too.

To add one, record a camera-only take in OBS while playing along to the
Play-Along from the start of the song. Then trim it so its first frame is the
recording's first moment, shrink it to 720p and drop the sound:

    ffmpeg -i take.mp4 -ss <seconds before the song starts> -an -vf scale=1280:720 \
      -c:v libx264 -preset slow -crf 25 -g 30 -movflags +faststart songs/<slug>/video.mp4

and add it to the song in `songs/index.json`:

    "videoFile": "songs/<slug>/video.mp4",
    "videoOffsetSeconds": 0,
    "videoFocusY": 45

`videoOffsetSeconds` nudges it if your hands look early or late (+ shows the
video later). `videoFocusY` picks which band of the frame is kept when it's
cropped to fit the screen, from 0 (top) to 100 (bottom). Keep the file under
50MB so GitHub takes it; a full song at these settings is about 40MB.

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
