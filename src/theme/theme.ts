export interface Theme {
  name: string;
  stage: { background: string; backgroundImage: string | null; backgroundOpacity: number };
  lane: string;
  playLine: string;
  barLine: string;
  text: string;
  fingers: { open: string; '1': string; '2': string; '3': string; '4': string };
  hit: string;
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
}

/** Picks readable ink for a fret number drawn on a pill of this colour. */
export function inkColorFor(pillColor: string): string {
  const rgb = pillColor.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!rgb) return '#2E2A28';
  const [r, g, b] = rgb.slice(1).map((h) => parseInt(h, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#2E2A28' : '#FBF8F3';
}
