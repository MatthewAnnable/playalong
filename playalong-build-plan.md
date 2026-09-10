# Play-Along — Build Plan

A browser-based tab play-along for Matthew Annable's guitar teaching. Load a Guitar Pro 8 file (with its embedded recording and sync points) and get a clear, branded, Yousician-style play-along in seconds. Runs on a Mac, in a Zoom screen share, on an iPad, and as an OBS browser source.

This document is written for the Claude model doing the build. The owner, Matthew, is a guitar teacher, not a developer. Everything you ask him to do must be a copy-and-paste command or a plain-English instruction, and every phase ends with a check he can do by looking at the screen.

---

## 1. Working with Matthew

- He does not read or write code. Never ask him to "add a line to X" — make the change yourself, or give him an exact command to paste.
- Explain decisions in plain English, one or two sentences. Recommend, don't list options, unless the choice is truly his.
- Use British English in the UI, in commits and when talking to him.
- Mark anything he must do with **ACTION (Matthew):** and anything you need decided with **DECISION (Matthew):**.
- Commit early and often with clear messages. He uses GitHub for his other tools.
- macOS only. Node is installed with Homebrew (`brew install node`). The default browser for testing is Safari and Chrome; both must work.
- He is practical and evaluates suggestions against real workflow cost. If a feature is not in this plan, ask before building it.

## 2. What we are building (one paragraph)

A static web app (no server). It opens a `.gp` file, uses the alphaTab library to parse the score, extract the embedded MP3 and the sync points, draw the notation/tab and keep a cursor locked to the real recording. On top of alphaTab we build a custom "highway" view: six horizontal string lanes, notes travelling right-to-left into a play line, coloured by fretting finger. Around both views sits a branded player (play, loop, speed, track picker, full-mix/no-guitar audio switch) built to Matthew's design system. The app is published on GitHub Pages from a public repo that contains **no songs**; songs are opened by drag-and-drop (v1), with a hosted library that can be switched on later. Share links can open a specific song, track, section and speed.

## 3. Inputs Matthew has supplied (put these in the repo)

| File | Where it goes | Notes |
|---|---|---|
| `Rage Against the Machine  Freedom.gp` | `test-songs/freedom/song.gp` (git-ignored — never committed to the public repo) | GP8 (`VERSION` 7.0, `meta.json` hasAudio true). Embedded MP3 (~11.7 MB) at `Content/Assets/*.mp3`, 79 sync points across 106 bars, 6 tempo automations, 4 tracks: `tom1` (dist. guitar), `tom2` (dist. guitar), `tim` (bass), `brad` (drums). **No fingering marked** — the fallback heuristic must work on this file. |
| `matthewannable.css` | `design/matthewannable.css` | Design tokens and components. Prefix `--ma-`. |
| `README.md` (design system) | `design/DESIGN-SYSTEM.md` | Read it fully before writing any UI. |

**ACTION (Matthew):** create the repo and drop these three files in the folders above (or hand them to the model in the first session).

## 4. Key facts verified during feasibility

- alphaTab (https://alphatab.net, MPL-2.0, free for commercial use) parses `.gp3/.gp4/.gp5/.gpx/.gp` and MusicXML in the browser, renders notation and tab, and exposes beat/note timing.
- Since alphaTab 1.6.0: GP8 embedded backing tracks and sync points are read from the file; an "external media" player mode lets an ordinary `<audio>` element drive the cursor. Docs: https://alphatab.net/docs/guides/audio-video-sync and https://alphatab.net/docs/alphatex/sync-points/.
- Limitation: alphaTab cannot mix its synthesised sound with a real recording — it's one or the other. It also cannot pitch-shift or time-stretch real audio; the browser's `<audio>` element does that for us (`playbackRate` with `preservesPitch = true`).
- **Verify the exact API names against the live docs at build time** (`PlayerMode`, `score.backingTrack`, `masterBar.syncPoints`, the external media handler interface). Pin the alphaTab version in `package.json` and note it in the README.

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  index.html  (app shell, design-system chrome)                   │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │ Song loader  │──▶│ Engine (alphaTab)│──▶│ Views            │  │
│  │ drag-drop /  │   │ parse .gp        │   │  • Score view    │  │
│  │ library URL  │   │ extract MP3      │   │    (alphaTab,    │  │
│  │ ?song= param │   │ sync points      │   │     restyled)    │  │
│  └──────────────┘   │ tick ⇄ time      │   │  • Highway view  │  │
│                     │ note list        │   │    (canvas)      │  │
│  ┌──────────────┐   └────────┬─────────┘   └──────────────────┘  │
│  │ Transport    │            │                                   │
│  │ <audio> el.  │◀───────────┘  external-media handler           │
│  │ rate/pitch   │                                                │
│  └──────────────┘   ┌──────────────────┐   ┌──────────────────┐  │
│                     │ Controls & state │   │ Theme            │  │
│                     │ play/loop/speed/ │   │ CSS vars, JSON,  │  │
│                     │ track/view/URL   │   │ bg image         │  │
│                     └──────────────────┘   └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
        static files only → GitHub Pages (public repo, app only, no songs) → later: iframe/copy into student portal
```

### 5.1 Tech stack (keep it small)

- **Vite** + **vanilla TypeScript**. No React/Vue. alphaTab ships a Vite plugin that handles its font, worker and soundfont assets — use it (see alphaTab "Vite" installation guide).
- **alphaTab** from npm (`@coderline/alphatab`), pinned.
- **HTML5 `<canvas>`** (2D) for the highway. No WebGL, no game engine.
- **CSS custom properties** for theming, layered on `design/matthewannable.css`.
- **No backend.** Everything is files. Build output goes to `dist/` and is deployed by a GitHub Actions workflow to GitHub Pages.

### 5.2 Folder layout

```
playalong/
  index.html
  src/
    main.ts              app boot, URL params, wiring
    engine/
      loader.ts          open .gp from File/ArrayBuffer/URL; extract embedded MP3 → Blob URL
      alphatab.ts        create AlphaTabApi, settings, external-media handler
      notes.ts           flatten score → NoteEvent[] per track (ticks, string, fret, finger, techniques)
      fingering.ts       GP fingering if present, else heuristic
      clock.ts           single source of truth for "now": tick + seconds, interpolated for animation
    views/
      score-view.ts      alphaTab rendering + restyle + cursor
      highway-view.ts    canvas renderer
    ui/
      controls.ts        transport, speed, loop, track picker, view toggle
      library.ts         song list from songs/index.json
      shortcuts.ts       keyboard map
    theme/
      theme.ts           load theme JSON → set CSS vars + background
      themes/default.json
  design/
    matthewannable.css
    DESIGN-SYSTEM.md
  remote.html            OBS remote-control page (Phase 3)
  test-songs/            git-ignored; local test files only, never committed
    freedom/song.gp
  songs/index.example.json   manifest format for when the hosted library is switched on (see 5.7)
  .github/workflows/deploy.yml
  README.md              plain-English: how to add a song, how to share a link, how to change the theme
```

### 5.3 Engine

**Loading.** Accept a `.gp` from (a) drag-and-drop or file picker, (b) `?song=<slug>` resolving to `songs/<slug>/song.gp`, (c) optionally a separate audio file via a second drop when the `.gp` has no embedded audio. Read with `api.load(arrayBuffer)`.

**Audio.** Always play real audio through `<audio>` elements we own (never alphaTab's internal backing-track player). Reasons: full control of `playbackRate` with `preservesPitch = true`; identical code path for embedded and separate audio; works in OBS browser sources and on iPad. Get the embedded audio from alphaTab's score model (backing track raw audio) → `Blob` → object URL. Register an external-media handler with alphaTab so its cursor follows our element; call its position update on a timer (~50 ms) and on seek.

**Two audio versions (full mix / no guitar).** A song may have a second audio file — the same recording with the guitar part removed, which Matthew obtains separately. Both files must be the same length and alignment (same start, same tempo) so the one set of sync points serves both. Implementation: two `<audio>` elements loaded with both files, kept at the same `currentTime` and `playbackRate`; the "Guitar: on/off" toggle (key `G`) simply crossfades volume between them over ~80 ms, so switching mid-phrase is seamless and never re-seeks. Sources for the second file: drag-and-drop a second audio file onto the loaded song (v1); a `noGuitarFile` field in the manifest (when the hosted library is switched on). If the lengths differ by more than 250 ms, show a plain warning and still allow it. Explicitly out of scope: generating the stripped track in the app.

**Sync points.** Trust the file. alphaTab converts audio seconds ⇄ score ticks using the sync points it read. For a `.gp` without sync points, expose a manual "audio starts at X seconds" offset in the UI and store it in the manifest.

**Note list.** Once per load, per track, walk `score → tracks → staves → bars → voices → beats → notes` and produce a flat, sorted array:

```ts
type NoteEvent = {
  startTick: number; endTick: number;      // absolute playback ticks
  bar: number; beatIndex: number;
  string: number;                          // 1 = high E … 6 = low E (alphaTab numbers from the bottom; normalise once)
  fret: number;                            // -1 for rests/dead
  finger: 0|1|2|3|4;                       // 0 open/none, 1 index … 4 little
  fingerSource: 'gp' | 'guess';
  techniques: { hammer?: boolean; pull?: boolean; slide?: boolean; bend?: boolean; palmMute?: boolean; harmonic?: boolean; vibrato?: boolean; dead?: boolean; tie?: boolean };
  isChord: boolean;                        // >1 note in the beat
};
```

**Clock.** One module owns "now". On each alphaTab position event, store `(audioSeconds, tick, tempo)`; between events, in `requestAnimationFrame`, extrapolate `tick` from `audio.currentTime` so the highway is silky at 60 fps and never disagrees with the score cursor. Everything (both views, loop logic, bar counter) reads from this module.

### 5.4 Fingering

1. If the note carries left-hand fingering in the GP file, use it.
2. Otherwise guess: for each bar (or half-bar if the bar spans >5 frets), let `pos = lowest fretted fret in the window`; `finger = clamp(fret − pos + 1, 1, 4)`; open strings → 0. Consecutive notes on the same string one fret apart get consecutive fingers. Chords: assign lowest-fret note first, keep each finger on one fret per chord. Notes with `fingerSource: 'guess'` render with a subtle hollow ring so Matthew can see which ones are guesses.
3. Phase 3: a per-song `overrides.json` (bar/beat/string → finger) so Matthew can correct without touching Guitar Pro, edited via a tiny "fix finger" click in the app.

### 5.5 Score view

alphaTab's own rendering (tab + notation, or tab only), horizontally scrolling layout, restyled: warm paper ground in normal mode, `--ma-ink-ground` in presentation mode; Newsreader for the title, Manrope for everything else; cursor and beat highlight in green (`--ma-green`) with the current beat's notes tinted (alphaTab supports element colouring). Hide alphaTab's default toolbar; we build our own.

### 5.6 Highway view (the custom part — the heart of the app)

- Canvas fills the stage. Six lanes, high E at top. Lane lines are hairline warm-grey on the dark ground (`--ma-ink-ground` at 100%, lanes at ~25% opacity of `--ma-line`).
- A vertical **play line** at ~22% from the left. Notes move right-to-left; a note is "played" when its left edge crosses the line.
- Each note is a pill with the fret number (Manrope 700, ≥18 px at 1080p). Width = duration in px (minimum width = the pill's height so short notes stay readable). Colour = finger (see theme). Open strings: outlined pill, ground-coloured fill. Chords: pills stacked vertically in the same x, joined by a thin vertical bar.
- Techniques as glyphs/shape changes, not icons: hammer/pull → small arc joining the two pills; slide → angled tail; bend → up-arrow tail; palm mute → dotted outline; dead → "×" instead of number; harmonic → diamond pill; tie → no new number, extended bar.
- Bar lines as faint vertical lines with the bar number above; section/marker names from the score as eyebrow text (`--ma-eyebrow` style) at the top.
- Look-ahead ≈ 2 bars at 100% speed; speed slider does not change px-per-tick (musical spacing stays constant; slower speed simply moves the belt slower).
- When a note crosses the line: brief scale-up and a glow ring for ~120 ms. No particle effects. Restrained, editorial, matches the brand character.
- Header strip above the canvas: song title (Newsreader), artist, current bar / total, tempo, track name. Nothing else.
- Performance target: 60 fps at 1920×1080 with 4-track songs. Only draw notes within the visible tick window (binary search into the sorted note array). Use `devicePixelRatio` for crisp text on Retina.
- Design for two tracks later: `HighwayView` takes a `NoteEvent[]` and a lane count/height; a split view is two instances stacked. Do not hard-code "one track" anywhere outside `controls.ts`.

### 5.7 Song loading, the (later) hosted library, and share links

**v1 = drag-and-drop only.** The public repo contains the app and no songs. Matthew keeps his `.gp` files in his own Google Drive library; students receive songs in their shared Drive folders (his existing workflow) and open them by dragging onto the page. The page remembers the last few songs locally (browser storage, per device — IndexedDB, keyed by filename) so a re-open is one click.

**Hosted library = a switch.** The loader already accepts URLs. Turning the library on later is: set `MANIFEST_URL` (one constant in `main.ts`, overridable by `?manifest=`) to a manifest hosted somewhere private (the student portal later, or a private repo/Pages with GitHub Pro). Nothing else changes. Until then the library page is hidden.

Manifest format (`index.json`), used when the switch is on:
```json
{
  "songs": [
    { "slug": "freedom", "title": "Freedom", "artist": "Rage Against the Machine",
      "file": "songs/freedom/song.gp", "noGuitarFile": "songs/freedom/no-guitar.mp3",
      "defaultTrack": 0, "audioOffsetSeconds": 0,
      "theme": "default", "tags": ["intermediate", "riffs"] }
  ]
}
```

URL parameters (all optional): `?song=freedom&track=1&from=17&to=24&speed=0.7&view=highway&guitar=off&theme=default&mode=obs&autoplay=1`. `from/to` are bar numbers (1-based, inclusive) and set the loop. A "Copy practice link" button builds this URL from the current state. Matthew will paste these into lesson-summary emails sent by his dashboard.

**Share links in drag-and-drop mode.** Without a hosted library the link cannot carry the song file itself, so the page must handle `?song=` for a file that isn't loaded: show a friendly prompt "Drop *Freedom* here to continue" and, once a file with a matching name (or matching title/artist read from the file) is dropped, apply the rest of the link (track, bars, speed, view). This is important — it's what lets practice links work for students today. The `song` value is a slug derived from the `.gp` title/artist, so the same link works unchanged once the hosted library is switched on.

When the library is on, adding a song = drop a `.gp` into `songs/<slug>/` and add one entry to `index.json`. Phase 3 adds a `npm run add-song path/to/file.gp` script that does both and reads title/artist from the file.

### 5.8 Theming

`theme/themes/*.json` → applied as CSS variables on `:root` plus an optional background image on the stage:

```json
{
  "name": "default",
  "stage": { "background": "#1C211A", "backgroundImage": null, "backgroundOpacity": 1 },
  "lane": "#E3DCD1", "playLine": "#F7A630", "barLine": "#6A625C", "text": "#FBF8F3",
  "fingers": { "open": "#FBF8F3", "1": "#A8C2A3", "2": "#F7A630", "3": "#C99AA6", "4": "#8FB8D8" },
  "hit": "#FFB544"
}
```

Notes for the model: the design system's "one amber per screen" rule is deliberately relaxed **inside the stage only** — the highway is a performance surface, and finger colours must be four clearly distinct hues on a dark ground. Outside the stage the rule holds: the single amber element is the Play button. The four finger colours above are a starting proposal derived from the palette (sage, amber, dusty plum, and one new cool blue for the little finger); **DECISION (Matthew):** approve or adjust after seeing the prototype. Every colour must pass 4.5:1 against the stage ground for the fret numbers (numbers are drawn in `--ma-ink` on light pills, `--ma-ink-on-dark` on dark pills — pick per pill by luminance).

Artist/album themes (future): same JSON with a `backgroundImage` (kept in `theme/backgrounds/`, ≤ 400 KB, dimmed by `backgroundOpacity`) and a matching accent set. Selected per song via the manifest `theme` field or the `?theme=` param.

### 5.9 Presentation and OBS modes

- **Presentation mode** (`P` key or button): hides all chrome except a slim transport strip that auto-hides after 2 s; stage goes full-window; cursor hidden. This is what Matthew shares in Zoom.
- **OBS mode** (`?mode=obs`, confirmed for v1): presentation mode plus a fully transparent page background (only the lanes, notes and header are drawn) so the highway can be overlaid in an OBS scene using a Browser Source with a transparent background. Because a Browser Source cannot receive keystrokes from the desktop, control in OBS mode comes from a **remote page** (`/remote`) opened in a normal browser tab on the same Mac: it shows the transport and listens for the shortcuts; the two pages talk over `BroadcastChannel` (same origin, no server). Drag-and-drop in OBS mode also happens on the remote page, which forwards the file. The audio should be played from the remote page, not the OBS source, so Matthew hears it through his normal routing (and OBS/Zoom pick it up via his existing Audio Hijack/BlackHole setup) — make this a toggle, "Audio from: this page / OBS". Phase 3.

### 5.10 Keyboard shortcuts and the foot pedals (Phase 3, but reserve them from the start)

Default keys: Space play/pause · `←`/`→` back/forward one bar · `[` / `]` set loop start/end at the current bar · `L` toggle loop · `-` / `=` speed −5 % / +5 % · `0` speed 100 % · `G` guitar on/off · `H` highway · `S` score · `P` presentation · `T` next track · `C` copy practice link.

**The shortcut map must be remappable in the app**, stored in browser storage, with a "Learn" mode: click an action, press the key (or the pedal), done. Matthew's USB foot pedals are a cheap make programmed through the "elfkey" utility, and reprogramming them per app is awkward. So the app adapts to the pedals, not the other way round: whatever keys the pedals already send (they are currently set for push-to-mute in Zoom and similar) can be assigned to play/pause, loop and speed here. The map is exported/imported as a small JSON file so it survives a browser reset. Do not require him to touch elfkey.

Note for later, not for the build: if he ever wants the pedals to mean different things in Zoom and in the app, a short Hammerspoon rule can translate the pedal keys depending on which app is in front — that lives in his existing Hammerspoon config, not in this project.

### 5.11 Moving to the student portal later

The app is a self-contained `dist/` folder. Moving it means either copying that folder into the portal's site and pointing the manifest URL (one constant in `main.ts`, also overridable by `?manifest=`) at the portal's song storage, or embedding the Pages URL in an `<iframe>`. Do not use absolute paths; Vite `base` must be configurable (`/` vs `/playalong/`).

## 6. Phases, with checks Matthew can do himself

Each phase is one or a few Claude Code sessions. Do not start the next phase until the check passes and Matthew has said so.

### Phase 0 — Skeleton and proof of sync (½ day)
1. **ACTION (Matthew):** install Homebrew (if not present) and Node: `brew install node git`. Create an empty **public** GitHub repo called `playalong`. Add the input files (section 3) — the model will add `test-songs/` to `.gitignore` before the first commit so the song never goes online.
2. Scaffold Vite + TypeScript, install alphaTab with its Vite plugin, pin versions, add `.github/workflows/deploy.yml` for Pages, add a plain-English README.
3. Drag-and-drop area; drop `test-songs/freedom/song.gp`, render tab, extract the embedded MP3 to an `<audio>` element, wire the external-media handler, show a Play button and a track dropdown.
4. **CHECK (Matthew):** drop the file, press Play. The cursor follows the real recording all the way through the song without drifting; changing track re-renders. Deploy runs green and the Pages URL opens and accepts the same drop. Confirm on GitHub that no `.gp` or audio file is in the repo.

### Phase 1 — Branded player and score view (1 day)
1. App shell to the design system: paper ground, Newsreader title, Manrope UI, amber Play (the one amber), green secondary actions, 44 px tap targets, 16 px card radius.
2. Transport: play/pause, position scrubber, bar counter, speed slider 50–120 % with pitch preserved, A–B loop by clicking bar numbers, count-in (one bar of clicks from the score's tempo, using alphaTab's metronome or a short click sample), track picker, tab-only vs tab+notation toggle.
3. Restyled score view with green cursor; presentation mode.
4. Drag-and-drop of any `.gp`; a second drop adds either the audio for a file with none (with an offset field) or the no-guitar version for a file that already has audio (ask which, with a two-button prompt). Guitar on/off toggle with crossfade. Recent-songs list from browser storage.
5. **CHECK (Matthew):** loop bars 17–24 at 70 %: pitch unchanged, loop tight, count-in correct. Drag in a different `.gp` from his library and it plays. Drop a guitar-stripped MP3 and flick between the two mid-phrase without a jump. Looks like his website, not like alphaTab's demo.

### Phase 2 — Highway view (2–3 days)
1. `notes.ts` and `fingering.ts` with unit tests (Vitest) on the Freedom file: note counts per track match alphaTab's model; heuristic assigns fingers 1–4 only; open strings are 0.
2. `clock.ts` and `highway-view.ts` per section 5.6, view toggle `H`/`S`, theme JSON applied.
3. **CHECK (Matthew):** in highway view the notes reach the play line exactly when he hears them, at 100 % and at 60 %; fret numbers readable from across the room on a Zoom share; finger colours distinct; guessed fingers visibly marked; 60 fps with no stutter on his MacBook and acceptable on the iPad.

### Phase 3 — Links, shortcuts, OBS, overrides, library switch (1–2 days)
1. All URL params and "Copy practice link", including the "Drop *Song* here to continue" flow for links opened without a hosted library.
2. Keyboard shortcuts with the remappable "Learn" mode and JSON export/import; test with the foot pedals.
3. OBS mode with transparent background plus the `/remote` control page (BroadcastChannel).
4. Fingering `overrides.json` with an in-app "fix finger" click.
5. Hosted-library switch: `MANIFEST_URL` constant, `?manifest=`, library page (cards to the design system), `npm run add-song`, `songs/index.example.json`. Built and tested against a local manifest, left switched off.
6. **CHECK (Matthew):** a practice link pasted into an email opens on a student's iPad, asks for the file, and lands on the right track, section and speed after the drop. The pedals drive play/pause and loop without touching elfkey. OBS Browser Source shows the highway over his camera with no black box, controlled from the remote tab.

### Phase 4 — Polish and hand-over (½ day)
Safari + Chrome + iPad Safari pass; touch targets; loading states; error messages in plain English ("This file has no audio — drop an MP3 to add one"); README covering add-a-song, share-a-link, change-the-theme, move-to-portal. Tag `v1.0`.

## 7. Non-goals for v1 (say no politely if asked)
Removing the guitar from a real recording inside the app (Matthew supplies a stripped track separately; the app only switches between the two). Pitch detection / scoring the student's playing. Accounts or logins. Editing the tab in the app. Mobile-phone layout (iPad and desktop only). Synthesised playback (alphaTab's soundfont) — can be a v1.1 toggle for songs without audio.

## 8. Decisions and costs Matthew has already made / must confirm
- Views: both score and highway, toggleable. Highway is horizontal, Yousician-style.
- Audience: himself (Zoom share, OBS), students (links), public (videos/streams) — public use only with audio he has the rights to.
- Fingering: from the GP file when present, otherwise guessed; overrides later.
- Multi-track: one track at a time now, code structured for a split view later.
- Hosting: **public GitHub repo containing only the app**, on GitHub Pages (free). No song or audio files are ever committed. Songs are drag-and-drop; students get files through their Drive folders. The hosted library is built as a switch and left off.
- Confirmed for v1: OBS mode (with the remote-control page), remappable keyboard shortcuts that adapt to the existing foot pedals, practice/share links, practice tempo (slow-down with pitch preserved + A–B loop), and the full-mix / no-guitar audio switch.
- Branding: build to `design/matthewannable.css` and `DESIGN-SYSTEM.md`. Finger colours per 5.8 pending his approval.
- Guitar Pro 8 is the authoring tool: audio and sync points are always set there, never in the app.

## 9. Risks and how to handle them
- **API drift in alphaTab.** Pin the version; check the audio/video sync guide before writing `alphatab.ts`. If the external-media handler behaves differently than described, fall back to alphaTab's managed backing-track player for Phase 0 and revisit.
- **Safari audio autoplay.** Audio must start from a user gesture; `autoplay=1` should arm play and show a "tap to start" overlay if the browser blocks it.
- **Large `.gp` files in git.** 10–20 MB per song is fine for a handful; if the library grows past ~1 GB, move songs to Git LFS or a Drive-hosted manifest (design the loader around URLs so this is a config change).
- **Tempo changes.** The clock must use alphaTab's tick⇄time mapping, never a single BPM. Freedom has six tempo automations and is the regression test.
- **Heuristic fingering looks wrong on a phrase.** Expected; that is what the hollow-ring marker and the overrides file are for. Do not over-engineer the heuristic.
