export interface ThemeGeometry {
  headerHeight: number;
  laneHeightFormula: string;
  pillHeightRatio: number;
  pillRadiusRatio: number;
  fretSizeRatio: number;
  fretWeight: number;
  fretTracking: string;
  pxPerBeatRatio: number;
  runMergeGap: number;
  runCellNumberMinWidth: number;
  /** Stage ground left between two consecutive notes that are picked separately. */
  nickGap: number;
  /** Clearance between the top of a pill and the marks drawn above it. */
  markGap: number;
  /** Vertical travel of the slide diagonal. */
  markRise: number;
  /** The P.M. rail: label size, rule weight, dash pattern, and the gap that splits one span from the next. */
  pmLabelSize: number;
  pmRuleWidth: number;
  pmDashOn: number;
  pmDashOff: number;
  pmJoinGap: number;
  tieBarHeightRatio: number;
  hammerArcWidth: number;
  hammerArcRise: number;
  /** 'pill-centre' springs the arc from the two pill centres; 'pill-edge' restores the old leading-edge anchoring. */
  hammerArcAnchor?: 'pill-centre' | 'pill-edge';
  hammerLabelSize: number;
  bendStemWidth: number;
  bendRise: number;
  /** Type size of the ½ / full / 1½ bend label. */
  bendLabelSize: number;
  harmonicRotation: number;
  /** Diamond height as a multiple of pill height. */
  harmonicSizeRatio: number;
  chordJoinWidth: number;
  hitScale: number;
  hitScaleMs: number;
  hitRingWidth: number;
  hitRingGrow: number;
  hitRingMs: number;
  playedOpacity: number;
  playedFadeMs: number;
  /** Ground between two pills joined by a legato pair (hammer-on, pull-off, legato slide): 0 = flush butt. */
  legatoJoinGap: number;
  /** 'union' strokes the merged silhouette once; 'per-pill' restores two separate outlines. */
  legatoJoinOutline?: 'union' | 'per-pill';
  /** Px of overlap at a legato seam before the union path is built — drawing only, never width or timing. */
  legatoSeamOverlap: number;
  /** Dark halo behind every cream mark. */
  markHaloWidth?: number;
  /** The slide contour rail: stroke weight, level spacing, plateau rules. */
  slideRailWidth?: number;
  slideRailStep?: number;
  slideRailTop?: number;
  slideRailMaxLevels?: number;
  slideRailPlateauInset?: number;
  slideRailMinPlateau?: number;
  slideRailLandingTick?: number;
  slideRailJoinRadius?: number;
  /** One rail per shared start/end shape, drawn above the topmost string, instead of one per string. */
  slideRailPerShape?: boolean;
  /** Floor for chord-name type, as a ratio of stage height. */
  chordNameMinSizeRatio?: number;
  /** 'right' lets a name that won't fit at the floor run past the block; 'shrink' restores the old behaviour. */
  chordNameOverflow?: 'right' | 'shrink';
  chordNameOverflowGap?: number;
  /** 'nearest-lane' rails P.M. above the highest muted string; 'header' restores the top-of-stage rail. */
  pmRailPlacement?: 'nearest-lane' | 'header';
  pmRailOffset?: number;
}

export interface ThemeObs {
  laneLight: string;
  laneLightOpacity: number;
  laneDark: string;
  laneDarkOpacity: number;
  lineWidth: number;
  textShadow: string;
}

export interface Theme {
  name: string;
  stage: { background: string; backgroundImage: string | null; backgroundOpacity: number; transparentInObs?: boolean };
  lane: string;
  laneOpacity: number;
  barLine: string;
  barLineOpacity: number;
  playLine: string;
  playLineWidth: number;
  playLineCapSize: number;
  playLinePosition: number;
  keyline: string;
  keylineWidth: number;
  keylineWidthObs: number;
  text: string;
  textMuted: string;
  textEyebrow: string;
  pillText: string;
  fingers: { open: string; '1': string; '2': string; '3': string; '4': string };
  pillTextOverrides?: { [key: string]: string };
  /** Ground for the one-pill-across-the-strings chord marker. */
  chordPill: string;
  /** Chord block ground in OBS mode — one lightness step up so it doesn't sink into a dark feed. */
  chordPillObs?: string;
  chordPillKeyline?: string;
  chordPillKeylineOpacity?: number;
  dead: string;
  hit: string;
  chordJoin: string;
  chordJoinOpacity: number;
  techniqueStroke: string;
  /** Dark halo drawn behind every cream technique mark. */
  markHalo?: string;
  /** Ink of the slide contour rail. */
  slideRail?: string;
  /** Draw the slide rail in the chain's own finger colour instead of `slideRail`. */
  slideRailUseFingerColour?: boolean;
  palmMuteRing: string;
  guessRing?: string;
  obs: ThemeObs;
  geometry: ThemeGeometry;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  root.setProperty('--stage-bg', theme.stage.background);
  root.setProperty('--stage-bg-image', theme.stage.backgroundImage ? `url(${theme.stage.backgroundImage})` : 'none');
  root.setProperty('--stage-bg-opacity', String(theme.stage.backgroundOpacity));
  root.setProperty('--lane-color', theme.lane);
  root.setProperty('--play-line-color', theme.playLine);
  root.setProperty('--bar-line-color', theme.barLine);
  root.setProperty('--stage-text-color', theme.text);
  root.setProperty('--stage-text-muted', theme.textMuted);
}

/** Ink for a fret number drawn on a pill of the given finger key ('open' | '1' | '2' | '3' | '4' | 'dead'). */
export function pillTextFor(theme: Theme, key: string): string {
  return theme.pillTextOverrides?.[key] ?? theme.pillText;
}
