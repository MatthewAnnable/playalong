export { slugify } from '../engine/slug';

export interface LinkParams {
  song?: string;
  track?: number;
  from?: number;
  to?: number;
  speed?: number;
  view?: 'highway' | 'score';
  guitar?: 'on' | 'off';
  theme?: string;
  mode?: string;
  autoplay?: boolean;
  manifest?: string;
}

function numberParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readLinkParams(search: string = window.location.search): LinkParams {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const guitar = params.get('guitar');
  return {
    song: params.get('song') ?? undefined,
    track: numberParam(params.get('track')),
    from: numberParam(params.get('from')),
    to: numberParam(params.get('to')),
    speed: numberParam(params.get('speed')),
    view: view === 'highway' || view === 'score' ? view : undefined,
    guitar: guitar === 'on' || guitar === 'off' ? guitar : undefined,
    theme: params.get('theme') ?? undefined,
    mode: params.get('mode') ?? undefined,
    autoplay: params.get('autoplay') === '1',
    manifest: params.get('manifest') ?? undefined,
  };
}

export interface PracticeLinkState {
  songSlug: string;
  trackIndex: number;
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  speed: number;
  view: 'highway' | 'score';
  guitarOn: boolean;
  hasNoGuitarTrack: boolean;
}

export function buildPracticeLink(state: PracticeLinkState, base: string = window.location.href): string {
  const url = new URL(base);
  url.search = '';
  const params = url.searchParams;

  if (state.songSlug) params.set('song', state.songSlug);
  if (state.trackIndex > 0) params.set('track', String(state.trackIndex));
  if (state.loopEnabled) {
    params.set('from', String(state.loopStartBar));
    params.set('to', String(state.loopEndBar));
  }
  if (state.speed !== 100) params.set('speed', (state.speed / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  if (state.view === 'highway') params.set('view', 'highway');
  if (state.hasNoGuitarTrack && !state.guitarOn) params.set('guitar', 'off');

  return url.toString();
}
