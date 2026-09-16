# Handoff: Play-Along visual redesign (chrome + stage)

> **Read `REVISIONS.md` alongside this file.** Two rounds of review against the built
> stage have since corrected parts of it — the slide notation, the legato join
> (the "bridge" described below is withdrawn), hammer-on arc anchoring, chord names
> and palm-mute placement. Where the two disagree, `REVISIONS.md` and the theme JSONs
> win.

## Overview

A visual pass over the existing Play-Along app — a browser play-along tool for guitar
lessons. No feature changes. Two surfaces are redesigned:

1. **Chrome** — drop zone, transport, cards, modals, recent songs, shortcuts panel.
   Plain DOM and CSS. Stays warm and editorial, per the existing design system.
2. **Stage** — the note highway, drawn on `<canvas>`. Gets a new four-hue finger
   palette, new geometry, new technique glyphs, and rules that make it survive a
   transparent OBS overlay.

The single most important functional requirement: **fret numbers must be readable
from across a room on a 1080p Zoom share.** Most of the stage decisions below exist
to serve that.

---

## About the design files

The files in this bundle are **design references created in HTML** — prototypes that
show intended look and values. They are not production code to copy.

`Play-Along Redesign.dc.html` is a set of artboards on one canvas. It uses absolute
positioning to *depict* a canvas-rendered stage; none of that markup should be
implemented literally. **The stage is `<canvas>` in the real app** — for that surface,
take the numbers from this README and `highway-theme.default.json`, not the HTML.

The chrome artboards (`1a`, `1b`) *can* be built more or less literally, in the app's
existing vanilla-TS + CSS environment.

Open the artboard file by keeping `support.js` next to it.

## Fidelity

**High-fidelity.** Final colours, type, spacing and geometry. Every value in the
artboards is real: the stage artboards are drawn at true 1920×1080, so a measurement
taken off them is the measurement to implement. Chrome artboards are 1440×900.

---

## Target codebase

Vite + TypeScript, no framework. The design maps onto these files:

| Design | File |
| --- | --- |
| Stage renderer (all geometry + glyphs) | `src/views/highway-view.ts` |
| Stage wiring, look-ahead, px-per-tick | `src/ui/highway.ts` |
| Theme type + CSS var application | `src/theme/theme.ts` |
| Theme values | `src/theme/themes/default.json` |
| Chrome markup | `index.html` |
| Chrome styles | `src/style.css`, `design/matthewannable.css` |
| Transport / controls behaviour | `src/ui/controls.ts` |
| Shortcuts panel | `src/ui/shortcuts-panel.ts` |
| Presentation / OBS modes | `src/ui/modes.ts` |

Replace `src/theme/themes/default.json` with the `highway-theme.default.json` in this
bundle. `highway-theme.daylight.json` is a second theme for bright rooms — add it as
`src/theme/themes/daylight.json`.

Both JSONs carry a `geometry` block. It is **documentation of the ratios**, not
necessarily runtime config — wire it up or hard-code the constants, but keep the
ratios.

---

## Part 1 — Chrome

### Artboard map

| Artboard | Screen | Replaces screenshot |
| --- | --- | --- |
| `A1` | Empty state, first load | 01 |
| `A2` | Score view, song open, loop set | 02 |
| `A3` | Highway view, stage inset in chrome | 03 |
| `A4` | Shortcuts & pedals panel | 07 |
| `A5` | Second audio file dropped | 08 |
| `A6` | Student opens a practice link | 09 |
| `1b` | Alternative arrangement — stage bled, docked transport | — |

`1a` (artboards `A1`–`A6`) is the recommended direction. `1b` is an alternative; its
trade-off is written on the artboard. **Build `1a`.** One piece of `1b` is adopted:
the dark floating transport strip, used in presentation mode only (`E1`).

### The structural change

The current app shows everything at once — drop zone, Recent, transport controls and
score all stacked in one column. That is what makes it read as a prototype. Three moves:

1. **The drop zone belongs to the empty state only.** Once `#player` is visible, hide
   `#drop-zone` and `#recent-songs` entirely. Drag-and-drop still works on the whole
   window; "Open another" in the header is the visible affordance.
2. **Setup moves to a top rail** — 80px, `border-bottom: 1px solid #E3DCD1`: eyebrow,
   song title + artist, Score/Highway segmented toggle, track select, then the four
   text actions (Presentation, Practice link, Shortcuts, Open another).
3. **Time moves to a bottom transport dock** — 96px, `background: #FFFFFF`,
   `border-top: 1px solid #C9BFB0`, pinned to the bottom of the viewport: Play,
   elapsed, scrubber, total, bar counter, speed stepper, loop chip.

The middle band is then only the score or the stage.

### Chrome tokens

| Token | Value | Use |
| --- | --- | --- |
| paper | `#FBF8F3` | page ground, transport dock text |
| paper-2 | `#F4EFE7` | insets, segmented track, stat strips, key caps |
| white | `#FFFFFF` | transport dock, modal cards |
| rule | `#E3DCD1` | hairlines, list dividers |
| rule-strong | `#C9BFB0` | section rules, card borders, dashed drop zone |
| ink | `#2E2A28` | primary text |
| ink-muted | `#6A625C` | secondary text |
| ink-faint | `#A8A29A` | tertiary, disabled, reassurance line |
| green | `#4C6D47` | secondary actions, eyebrows, loop marks |
| green-light | `#A8C2A3` | link underlines, outline buttons, loop fill |
| amber | `#F7A630` | the one primary button per screen |

### Typography

- Display: **Newsreader** 400. Song titles 44px/1.05 at −0.02em; screen headings
  38–50px/1.06; card titles 30–32px/1.14; list items 21px; stat values 22px.
- UI: **Manrope**. Body 15–16px/1.65–1.7; labels 14px/500; buttons 700 at 14–17px;
  eyebrows 600 12px at 0.16em uppercase; micro-labels 600 11px at 0.14em uppercase.
- Numeric / filenames: `ui-monospace, SFMono-Regular, Menlo, monospace` — times,
  tab digits, file names, key caps.

### Components

**Amber primary button** — height 56, radius 999, `#F7A630`, ink label 700 17px,
`box-shadow: 0 6px 22px rgba(247,166,48,0.34)`. This glow is the **only** shadow
permitted in the chrome. One per screen.

**Green secondary** — text label 700 14px `#4C6D47` with a 1px `#A8C2A3` underline,
44px tall hit area. Outline variant: height 52, radius 999, 1px `#A8C2A3` border.

**Segmented toggle** — 4px padding, radius 999, `#F4EFE7` track. Active pill:
`#FFFFFF`, 1px `#C9BFB0`, 700 14px ink. Inactive: 600 14px `#6A625C`. Rows 40px
inside a 48px control.

**Stepper** (speed) — 44px tall, radius 999, `#F4EFE7`. `−`/`+` are 44×36 green
glyphs at 700 19px; the value is 700 15px ink, min-width 56.

**Scrubber** — 8px track radius 999 on `#F4EFE7`; played `#4C6D47`; loop region
`#A8C2A3` behind the played fill; 22px round `#4C6D47` thumb with a 3px white ring.
Row is 44px for touch.

**Loop chip** — 44px, radius 999, 1px `#A8C2A3`, label 700 14px `#4C6D47`
("Loop 9–16"), then a 28px round `#F4EFE7` × button to clear.

**Drop zone** (empty state only) — 352px tall, radius 24, `#F4EFE7`,
`2px dashed #C9BFB0`. Newsreader 38px heading, extension chips as monospace 14px on
`#FBF8F3` radius 6 pads 3/7, amber button below.

**Recent list** — 72px rows, `border-bottom: 1px solid #E3DCD1` (none on the last).
Newsreader 21px title, Manrope 13px `#6A625C` artist, then bar count / bpm / tuning
separated by 1×14 `#E3DCD1` dividers, then a green "Open".

**Modals** — backdrop `rgba(28,33,26,0.74)`. Card `#FFFFFF`, radius 16, 1px
`#C9BFB0`, **no shadow**. Header block 34–36px padding with a 1px `#E3DCD1` rule
under it; footer bar `#FBF8F3` with a 1px `#C9BFB0` top rule, text/outline actions
left, amber right.

**Shortcuts rows** — 68px, 1px `#E3DCD1` dividers. Label 500 15px ink; key cap
`#F4EFE7`, 1px `#C9BFB0`, radius 10, monospace 15px, min-width 86, height 44; then
"Set". Capture state: the row gets a `#F4EFE7` full-bleed background, the cap becomes
`#FBF8F3` with a `2px solid #4C6D47` border and reads "Press a key…" in 600 14px
green, and the right cell shows "Esc".

### Copy

The copy in the artboards is intentional and should ship as written — it carries the
system's voice ("Nothing is uploaded. Files stay on this device.", "Is this a new
recording, or the same one with the guitar taken out?", "Whatever your pedals already
send will work — there's no need to reprogram them."). Full strings are in the
artboards.

### Interactions

- Segmented toggle → `setHighwayView(true|false)` (already wired to
  `#view-toggle-button`).
- Transport dock is fixed; the middle band scrolls.
- 44px minimum hit target everywhere — it runs on an iPad.
- Focus: 2px `#4C6D47` outline at 2px offset. Hover: green text goes
  `#6F4B52`; amber does not change colour, its glow goes to `0 8px 26px`.
- Modals: Esc cancels, backdrop click cancels, focus trapped, focus returns to the
  invoking control.
- No gradients, no card shadows, no icon fonts, no emoji.

---

## Part 2 — Stage (canvas)

Artboards: `1c` cinematic ink (**recommended**), `1d` instrument panel (alternative,
rejected — reasoning on the artboard), `C2` sixteenth-note stress test, `1f` glyph
sheet + values table + swatch card, `E1`/`E2` presentation, `E3` OBS.

All values below are **px at a 1080px-tall stage**. Scale linearly with stage height
via the ratios given; they are also in the JSON's `geometry` block.

### Colours

| Role | Hex | oklch |
| --- | --- | --- |
| Stage ground | `#171B14` | — |
| Lane + bar line | `#83807A` | — |
| Play line | `#F7A630` | — |
| Keyline | `#0D110B` | — |
| Finger 1 (index) | `#FFDE56` | `oklch(0.905 0.155 95)` |
| Finger 2 (middle) | `#87E9A3` | `oklch(0.855 0.135 152)` |
| Finger 3 (ring) | `#7DC7FF` | `oklch(0.805 0.115 245)` |
| Finger 4 (little) | `#F790BF` | `oklch(0.775 0.135 352)` |
| Open string | `#F4EFE7` | — |
| Dead / muted | `#B0A9A0` | — |
| Pill ink (all pills) | `#2E2A28` | — |
| Hit ring | `#FFF2CA` | — |
| Header text | `#FBF8F3` | — |
| Header muted | `#A8A29A` | — |
| Section eyebrow | `#A8C2A3` | — |

**Why these four hues.** Four hues ~90° apart is the widest spread available at this
lightness. Hue is only the first cue: the greyscale luminances descend **74 → 66 → 52
→ 43**, so the four stay distinguishable under deuteranopia, heavy Zoom compression,
and in greyscale. Every pill clears **6.5:1** against `#2E2A28` (F1 10.7, F2 9.6,
F3 7.8, F4 6.6, open 12.4, dead 6.6) — which is why **one ink colour serves every
pill type** and the renderer needs no luminance branching.

> Replace `inkColorFor()` in `src/theme/theme.ts` with `theme.pillText`, plus
> `theme.pillTextOverrides[key]` where present (the daylight theme uses it for open
> strings). The current luminance-threshold function is no longer needed and, at a
> 0.55 cut, would flip some of these pills to cream.

### Geometry

| Property | Value | Derivation |
| --- | --- | --- |
| Header strip | 96 | fixed |
| Lane height | 164 | `(stageHeight − 96) / laneCount` |
| Pill height | 96 | `0.585 × lane` |
| Pill radius | 20 | `0.21 × pill` |
| Min width, isolated note | 88 | `0.92 × pill` |
| Min width, note in a run | none | musical |
| Fret number | 56px / 700 / −0.02em | `0.585 × pill` |
| Spacing | 300px per beat | `0.278 × stageHeight` |
| Play line | x = 22%, 5px wide | fixed |
| Play line end caps | 16px triangles | fixed |
| Lane line | 1px at 42% | fixed |
| Bar line | 1px at 85% | fixed |
| Keyline, opaque / OBS | 1.5px / 2.5px | fixed |
| Run merge gap | 8 | fixed |
| Run divider | 3px | fixed |
| Run cell number cutoff | 56 | fixed |
| Hit | scale 1.06 over 90ms | fixed |
| Hit ring | 4px, grows +10, fades 140ms | fixed |
| Played note | 40% over 200ms, then exits | fixed |

**The lane and pill caps must go.** `highway-view.ts` currently caps
`MAX_LANE_HEIGHT = 96` and `MAX_PILL_HEIGHT = 44`, which is why the stage looks small
and the numbers land ~24px. Derive from stage height instead: lane
`(height − 96) / 6`, pill `0.585 × lane`, fret `0.585 × pill`. At 1080 that is a
**56px fret number** — the whole point of the exercise.

### Spacing, and why it changes

`highway.ts` currently computes `pxPerTick` from `LOOKAHEAD_BARS = 2` with a
readability floor. At two bars a sixteenth is ~47px — narrower than a two-digit
number at a readable size — so the floor kicks in and notes overlap. That is the
failure the brief describes.

Replace it with **fixed px-per-beat**:

```
pxPerBeat = 0.278 * stageHeightPx        // 300px at 1080
pxPerTick = pxPerBeat / ticksPerQuarter
```

That yields 1.25 bars of look-ahead at 4/4 and a **75px sixteenth**. Musical spacing
stays constant, as the build plan requires — only the constant moves. Delete
`LOOKAHEAD_BARS`, `ASSUMED_QUARTERS_PER_BAR` and the `readabilityFloor` branch.

### Run capsules — the thing that makes sixteenths survive

New logic in `drawNotes`. Per lane, walk the visible notes in time order; where the
gap between one note's right edge and the next note's left edge is **< 8px**, they
join a run:

- Draw the run as **one rounded rect** spanning the group. Outer corners radius 20;
  interior corners square.
- Separate cells with **3px dividers** in the stage ground colour (`theme.keyline` in
  OBS, so the divider reads over video).
- **One keyline around the capsule**, not per note. This is the fix: outlines stop
  multiplying at speed.
- Each cell keeps its own finger colour and its own 56px number at full size.
- If a cell is narrower than **56px** (thirty-seconds and faster), drop its number
  and leave a plain coloured cell. Unreadable at that rate anyway, and Score view is
  one keypress away.
- Isolated notes are padded to the 88px minimum; notes inside a run keep their exact
  musical width.

See `C2` for the stress test — continuous sixteenths across two strings — and the
note beneath it.

### Note types

| Type | Treatment |
| --- | --- |
| Plain | Filled pill in the finger colour, width = duration, ink number centred. |
| Open string | `#F4EFE7` fill + **6px inset ink ring**, number `0`. |
| Dead / muted | `#B0A9A0` fill, `×` glyph, width × 0.75. |
| Chord | Pills share an x; a **10px** `#FBF8F3` bar at 50% joins the stack down its leading edge. |
| Tie / sustain | No second number — the pill continues as a **36px** bar (`0.375 × pill`) for the tied duration. |

> Open strings currently fill with `theme.stage.background`, which is **invisible in
> OBS** where there is no ground. The paper fill + inset ring gives the same "open"
> read over anything. Dead notes get a real fill too, rather than the outlined
> treatment — the `×` is the cue, not the emptiness.

### Technique glyphs

Shape and outline only — never icons, never letters.

- **Hammer-on / pull-off** — 4px `#FBF8F3` arc, 28px rise, springing from the two
  pill *centres*. (Currently drawn as a stub arc at one pill's end; it needs the
  source/target pair.)
- **Slide** — 9px tail in the note's own colour at −34° toward the target pill, with
  its own keyline.
- **Bend** — 9px stem + arrowhead rising 62px from the pill's top edge. Half-bend:
  stem only, 34px.
- **Palm mute** — fill stays **solid**; a 5px dotted `#EBE6DC` ring at 7px offset.
  A hollow pill would fail over video.
- **Harmonic** — square rotated 45°, radius 14, **number stays upright** at 46px.
  The only non-rectangular note shape. (Currently a diamond with no number.)
- **Guessed fingering** — 3px dashed ink ring inset 14px at 55% opacity. Marks
  `fingerSource === 'guess'` without shouting.

### Play line and hit

Play line: 5px `#F7A630` at x = 22%, with a `1.5px rgba(13,17,11,0.92)` keyline and
16px triangular caps top and bottom. It is the only bright vertical on the stage.

Hit: pill scales to **1.06 over 90ms**, and a **4px `#FFF2CA` ring** grows +10px and
fades over 140ms. Nothing else — **no shadow blur**. Remove the
`ctx.shadowColor`/`shadowBlur` bloom in `drawPill`; canvas shadow blur is expensive
per frame and reads as haze on a compressed stream. Played notes drop to 40% over
200ms and then travel off-screen.

### Structure lines

Lane lines 1px `#83807A` at **0.42** (currently 0.25 — too faint). Bar lines 1px
`#83807A` at **0.85** (currently 0.4), with the bar number in 600 17px `#A8A29A` and
any section label in 600 13px `#A8C2A3` uppercase at 0.16em — **not** the play-line
amber it currently uses.

---

## Part 3 — Presentation and OBS

### Presentation, highway (`E1`)

Same stage. The transport becomes a **floating strip**: 1200×104, radius 999,
`rgba(13,17,11,0.9)`, centred, 40px off the bottom. Contents: 72px amber Play, times
in monospace 19px, a 10px scrubber, bar counter, and the speed in 700 19px amber.
It fades out after 2s and returns on pointer move or any transport key.

### Presentation, score (`E2`)

The current mode recolours the score but keeps alphaTab's default scale, so tab
digits land ~13px on the share — unreadable across a room. **Raise alphaTab's
`scale`** so tab digits hit **26px** and staff spacing 36px. That costs about half the
bars per line; it is the right trade — two readable bars beat eight unreadable ones.

The cursor becomes a **64px `rgba(168,194,163,0.16)` band with a 4px `#A8C2A3`
leading edge** instead of a hairline, and the current beat's digits go `#A8C2A3`
rather than bold white.

### OBS (`E3`)

The stage background is **fully transparent** — only lanes, notes and header pixels
are drawn over the camera feed. Nothing may rely on a solid ground. Three renderer
changes, no palette changes:

1. **Every drawn shape carries a keyline** — 2.5px `#0D110B` around pills in OBS
   (1.5px in opaque modes). A light pill on a light shirt still gets an edge.
2. **Structure lines double up** — a 2px near-white line (`#EBE6DC` at 0.75) with a
   2px dark line (`#0D110B` at 0.55) directly beneath. A single mid-tone reads on
   dark and on light but vanishes against mid-grey, which is what a lot of footage
   is.
3. **Header text gets a text shadow**, `0 0 3px #0D110B, 0 1px 2px #0D110B` — not a
   background plate, which would box off part of the camera.

The `obs` block in the theme JSON carries these values. `applyTransparentStage()` in
`modes.ts` currently only swaps the background; it also needs to put the renderer in
an OBS mode that switches keyline width and line doubling.

Check your work against all three backdrops — the artboard has an **OBS artboard**
tweak (checkerboard / mid grey / bright stage light) for exactly this.

---

## State

No new state. The redesign consumes what the engine already emits:
`state.noteEvents`, `state.barMarkers`, `state.currentBar`, `state.totalBars`,
`state.trackNames`, `state.trackIndex`, `state.ready`, plus `getScoreMeta()`,
`getCurrentTempo()`, `getTicksPerQuarter()`, `getExtrapolatedTick()`.

Two flags are new and both belong to the renderer, not the app:
`obs: boolean` (keyline width + line doubling) and the run-capsule grouping, which is
derived per frame and cached nowhere.

`noteAt()` must keep working for the click-to-correct-fingering interaction — update
`lastLayout` to record run-capsule cell rects rather than per-note pill rects.

---

## Assets

None. No images, no icons, no SVG. Fonts are Newsreader and Manrope, already loaded
from Google Fonts in `index.html`. Bravura (in `public/font/`) stays alphaTab's.

## Files in this bundle

| File | What it is |
| --- | --- |
| `Play-Along Redesign.dc.html` | All artboards. Open with `support.js` beside it. |
| `support.js` | Runtime for the artboard file. Not app code. |
| `highway-theme.default.json` | **The live contract.** Drop in as `src/theme/themes/default.json`. |
| `highway-theme.daylight.json` | Light stage for bright rooms / sunlit iPad. Add as `src/theme/themes/daylight.json`. Same hue-to-finger mapping, inverted lightness, so a colour learned in a lesson still means the same finger. Not for OBS. |

The `Theme` interface in `src/theme/theme.ts` must be widened to match the new JSON
(`laneOpacity`, `barLineOpacity`, `playLineWidth`, `playLinePosition`,
`playLineCapSize`, `keyline`, `keylineWidth`, `keylineWidthObs`, `pillText`,
`pillTextOverrides`, `dead`, `chordJoin`, `chordJoinOpacity`, `techniqueStroke`,
`palmMuteRing`, `guessRing`, `textMuted`, `textEyebrow`, `obs`, `geometry`).

## Departures from the design system

Deliberate, with reasons — the full note is on artboard `1f`.

1. **Four accent hues on the stage.** Already granted by the build plan. Two of the
   four (lemon, sky) are new, not palette-derived: the existing sage and plum are too
   close in lightness to separate at speed.
2. **Amber appears twice in presentation mode** — play line and Play button. They
   never share a screen in normal mode. Recommended to keep; if the rule must hold
   literally, make the presentation Play button sage.
3. **Open strings are filled, not ground-coloured** — the build plan's hollow fill is
   invisible in OBS.
4. **Look-ahead is px-per-beat, not bars** — see above.
5. **The amber Play glow stays the only chrome shadow.** Stage keylines and hit rings
   are canvas strokes, not CSS shadows; different medium, different rule.

## Suggested order

1. Theme JSON + widen the `Theme` interface + drop `inkColorFor`.
2. Renderer geometry: remove the caps, derive from stage height, fix px-per-beat.
   This alone delivers the readability requirement.
3. Run capsules. Verify against `C2` at 78bpm and again at 100%.
4. Note types and technique glyphs.
5. OBS keylines, doubled lines, text shadow. Verify on all three backdrops.
6. Chrome restructure (rail + dock, drop zone scoping), then component styling.
7. Presentation mode: alphaTab scale, cursor band, floating transport.
