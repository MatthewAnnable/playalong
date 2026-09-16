# Revisions to the Play-Along visual redesign

Read this **after** `README.md`. It is a delta, not a replacement: everything in the
README still stands except where a section here overrides it. Both revision rounds
were made against the *built* stage, so the numbers here are corrections to shipped
behaviour, not new ideas.

Source artboards: `Play-Along Redesign.dc.html`, sections `3a`–`3c` (round 2) and
`2a`–`2f` (round 1). The live contract is still
`highway-theme.default.json` / `highway-theme.daylight.json` in this bundle — both
have been updated and both carry a `valueNotes` block that explains every new key in
prose. If a value here and a value in the JSON disagree, **the JSON wins**.

---

## Round 2 — the legato pair (artboards `3a`–`3c`)

### 1. The legato join is a flush butt. Delete the bridge.

Round 1 asked for a "bridge": a short straight-edged band at 62% of pill height
joining two legato notes. That is wrong and is withdrawn. A bridge is a third
object — the eye reads *pill, connector, pill* — which is precisely the two-stops
reading the join was meant to dissolve.

**What ships instead:** the two pills butt flush, full height, edge to edge. Their
existing 20px corner radii pinch the seam into two small notches. That is the whole
treatment. One continuous body; the notch is the only mark of where the second note
begins.

```
legatoJoinGap:      0        // second pill's left edge === first pill's right edge
legatoSeamOverlap:  1        // px of overlap before the union path is built
legatoJoinOutline:  "union"  // stroke the merged silhouette only
```

Removed from the theme and from the renderer:
`bridgeStraightRatio`, `bridgeInkBoost`, and the bridge draw call.

**The outline is the part that is easy to get wrong.** Two pills each stroked with
their own 1.5px keyline (2.5px in OBS) put a 3px dark bar down the seam and rebuild
the bridge in negative. So:

1. Lay out the cells with zero gap, then expand each by `legatoSeamOverlap` px at the
   seam (this affects drawing only — never note width, never timing).
2. Build the **union** of the rounded rects as one path.
3. Fill per cell in each note's own finger colour (clip to the cell rect).
4. Stroke the union path **once**, on the outside.

Radii are untouched: 20px on all four outer corners, and the inner corners stay
rounded too — they are what make the notch. Do not square them.

A chain of three or more legato notes (e.g. `5h7p5`) merges by the same rule: one
union path, one stroke, notches at every seam.

### 2. Legato is not a run capsule

The README's run-capsule logic (8px merge gap, 3px dividers) still applies, unchanged,
to **picked** notes. Legato is a different relationship:

| | Gap between pills | Divider | Outline |
| --- | --- | --- | --- |
| Separate picked notes | musical | — | per pill |
| Picked notes in a run | 0 | **3px** ground/keyline | one, round the capsule |
| Legato pair or chain | 0 | **none** — the notch | one, round the union |

If a legato pair falls inside a run capsule, **suppress the divider at that seam**;
the notch takes its place. Every other divider in the capsule stays.

Nicked (consecutive picked) notes are at `nickGap: 9` — ground the full height of the
pill. Against the notch there is now no ambiguity at a glance, which was the original
complaint.

### 3. Hammer-on / pull-off arcs anchor to pill centres

The README already specified "springing from the two pill *centres*"; the build
anchors the feet on the pills' **leading edges**, which shoves the whole mark half a
pill to the right — the apex lands past the seam, over the second note. Fix it
explicitly:

```
hammerArcAnchor: "pill-centre"   // "pill-edge" restores current behaviour
```

- Left foot: `(x1 + w1/2, pillTop)`. Right foot: `(x2 + w2/2, pillTop)`.
- Apex: midpoint of the two centre x's, `hammerArcRise` above `pillTop`
  (22px at 1080 in `default`, 28px in `daylight`).
- The H / P letter centres on the **apex x**, `markGap` (12px) clear of the stroke.
- Pull-off is the same code path — no mirrored or offset variant.

For a flush legato pair the centre-to-centre span is exactly one pill width, so the
arc comes out tight; for a wider interval in time it comes out wide. That is the
intent — arc width now carries information.

### 4. Hit-testing a merged pair

`noteAt()` still needs one rect per note. Record the **pre-union per-cell rects** in
`lastLayout`, split at the seam centre. Click-to-correct-fingering must keep working
on both halves of a merged pair.

---

## Round 1 of revisions — the stage as built (artboards `2a`–`2f`)

Included here because it post-dates the README.

### The slide is a contour rail, not a symbol

Two diagonals meeting at a point read as a bird, not a slide. Replace with a
**contour rail** in the clear lane above the string: each note in a slide chain gets a
short flat plateau at its own contour level, and the diagonal does nothing but travel
between plateaus. `5 4 5 5` then reads high–down–low–up–high, which is what the hand
does. See `2a` (recommended) and `2c` for the tab-literal alternative that was ruled
out.

Renderer: walk consecutive slide-linked notes into **one chain**, assign each note a
level (start level chosen so the chain never leaves the lane), clamp at
`slideRailMaxLevels: 3`. The last note of a chain carries no rail if nothing slides
into it — the mark's absence is information.

Keys: `slideRail`, `slideRailWidth` 7, `slideRailStep` 20, `slideRailTop` 5,
`slideRailMaxLevels` 3, `slideRailPlateauInset` 5, `slideRailMinPlateau` 16,
`slideRailLandingTick` 0, `slideRailJoinRadius` 5,
`slideRailUseFingerColour` (off; see `2b` before flipping it).

The rail never takes width from a note: if a note is too short to carry a plateau of
`slideRailMinPlateau`, drop the plateau and run the riser corner to corner.

### One rail per shape, not per string

`slideRailPerShape: true`. When the same slide happens on several strings at once
(a power-chord or shape shift), group the chains that share start and end times and
draw **one** rail, in the clear lane above the topmost string of the shape. This was
the single biggest legibility gain of that round — three near-identical rails stacked
down the lanes is noise.

### Chord names may leave the block

`chordNameMinSizeRatio: 0.0259` (28px at 1080) is a hard floor.
`chordNameOverflow: "right"` — the block stays exactly as long as the chord; a name
that will not fit at the floor continues past the block's right edge as cream stage
text with a halo, left-aligned to the block. Never shrink below the floor.

### Palm mute moves out of the header

`pmRailPlacement: "nearest-lane"`, `pmRailOffset: 10`. Draw "P.M." and its dashed
rule in the clear lane above the **highest muted string of the run**, so the mark sits
on the riff it belongs to rather than in a global header rail.
`pmJoinGap: 60` joins nearby muted runs under one rule. `"header"` restores the old
placement.

### Chord block in OBS

`chordPillObs` is one lightness step up from the opaque plum so it does not sink into
a dark camera feed; `chordPillKeyline` keeps its shape over video. Cream ink
(`pillTextOverrides.chord`) still clears 4.5:1 on both.

---

## Files changed in this bundle

| File | Change |
| --- | --- |
| `highway-theme.default.json` | Bridge keys removed; `legatoJoinGap`, `legatoJoinOutline`, `legatoSeamOverlap`, `hammerArcAnchor` added. Round-1 slide-rail / chord-name / P.M. keys present. `valueNotes` documents all of them. |
| `highway-theme.daylight.json` | Same keys, daylight values (arc rise 28, arc width 4). |
| `Play-Along Redesign.dc.html` | Artboards `3a`–`3c` added at the top; `2a`–`2f` unchanged below them. |

## Suggested order

1. `hammerArcAnchor` — a one-line change to the arc's two feet and the label x, and
   it fixes the most visible defect.
2. Delete the bridge; implement the union path + single stroke. Check the seam at
   both keyline widths (1.5px opaque, 2.5px OBS) and on a fractional device pixel.
3. Divider suppression where a legato seam falls inside a run capsule.
4. `lastLayout` per-cell rects, then re-test click-to-correct-fingering on a merged
   pair.
5. Round-1 items if not yet built: slide contour rail, per-shape grouping, chord-name
   overflow, P.M. rail placement.
