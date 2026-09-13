# Project status

Companion to `playalong-build-plan.md`. That file is the plan; this one is
where things actually stand. Update it at the end of each phase.

**Last updated:** 2026-09-13, after the visual redesign landed.

## Done

| Phase | State |
|---|---|
| 0 — Skeleton and proof of sync | Done, checked by Matthew |
| 1 — Branded player and score view | Done, checked by Matthew |
| 2 — Highway view | Done, checked by Matthew |
| 3 — Links, shortcuts, OBS, overrides, library switch | Built and verified in-browser; **not yet checked by Matthew on real hardware** |
| Visual redesign (out of plan) | Done — Claude Design redesign, implemented and regression-tested |

The redesign moved the chrome to a top rail plus a fixed bottom transport
dock, and rewrote the highway renderer so consecutive notes merge into
grouped runs. `src/theme/themes/default.json` is now the full contract for
the stage — colours *and* geometry — so visual tuning belongs in that file
rather than in `highway-view.ts`.

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
