# Play-Along

A browser play-along for guitar lessons. Open a Guitar Pro file, and it plays
the real recording in sync with the tab, on screen or on an iPad.

This is v1, Phase 0: the basic skeleton. Drag a `.gp` file onto the page and
it plays, in sync, with a track picker.

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
