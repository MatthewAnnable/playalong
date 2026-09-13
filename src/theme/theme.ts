export interface ThemeGeometry {
  headerHeight: number;
  laneHeightFormula: string;
  pillHeightRatio: number;
  pillRadiusRatio: number;
  pillMinWidthRatio: number;
  fretSizeRatio: number;
  fretWeight: number;
  fretTracking: string;
  pxPerBeatRatio: number;
  runMergeGap: number;
  runDividerWidth: number;
  runCellNumberMinWidth: number;
  deadWidthRatio: number;
  tieBarHeightRatio: number;
  hammerArcWidth: number;
  hammerArcRise: number;
  slideTailWidth: number;
  slideTailAngle: number;
  bendStemWidth: number;
  bendRise: number;
  /** Type size of the ½ / full / 1½ bend label. */
  bendLabelSize: number;
  harmonicRotation: number;
  /** Diamond height as a multiple of pill height. */
  harmonicSizeRatio: number;
  palmMuteRingWidth: number;
  palmMuteRingOffset: number;
  chordJoinWidth: number;
  hitScale: number;
  hitScaleMs: number;
  hitRingWidth: number;
  hitRingGrow: number;
  hitRingMs: number;
  playedOpacity: number;
  playedFadeMs: number;
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
  dead: string;
  hit: string;
  chordJoin: string;
  chordJoinOpacity: number;
  techniqueStroke: string;
  palmMuteRing: string;
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
