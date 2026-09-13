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
