import { describe, expect, it } from 'vitest';
import { buildPracticeLink, readLinkParams, slugify } from './links';

const BASE = 'https://matthewannable.github.io/playalong/';

describe('slugify', () => {
  it('derives a stable slug from a song title', () => {
    expect(slugify('Freedom')).toBe('freedom');
    expect(slugify('Killing In The Name')).toBe('killing-in-the-name');
    expect(slugify("Bulls On Parade!")).toBe('bulls-on-parade');
  });
});

describe('readLinkParams', () => {
  it('reads every documented parameter', () => {
    const params = readLinkParams('?song=freedom&track=1&from=17&to=24&speed=0.7&view=highway&guitar=off&autoplay=1');
    expect(params).toMatchObject({
      song: 'freedom',
      track: 1,
      from: 17,
      to: 24,
      speed: 0.7,
      view: 'highway',
      guitar: 'off',
      autoplay: true,
    });
  });

  it('ignores values it does not recognise', () => {
    const params = readLinkParams('?view=sideways&guitar=maybe&track=abc');
    expect(params.view).toBeUndefined();
    expect(params.guitar).toBeUndefined();
    expect(params.track).toBeUndefined();
  });
});

describe('buildPracticeLink', () => {
  const base = {
    songSlug: 'freedom',
    trackIndex: 0,
    loopEnabled: false,
    loopStartBar: 1,
    loopEndBar: 106,
    speed: 100,
    view: 'score' as const,
    guitarOn: true,
    hasNoGuitarTrack: false,
  };

  it('keeps a default link short', () => {
    expect(buildPracticeLink(base, BASE)).toBe(`${BASE}?song=freedom`);
  });

  it('round-trips a loop, speed and view through readLinkParams', () => {
    const link = buildPracticeLink(
      { ...base, trackIndex: 1, loopEnabled: true, loopStartBar: 17, loopEndBar: 24, speed: 70, view: 'highway' },
      BASE,
    );
    const params = readLinkParams(new URL(link).search);
    expect(params).toMatchObject({ song: 'freedom', track: 1, from: 17, to: 24, speed: 0.7, view: 'highway' });
  });

  it('only records guitar=off when a no-guitar track exists', () => {
    expect(buildPracticeLink({ ...base, guitarOn: false }, BASE)).not.toContain('guitar=off');
    expect(buildPracticeLink({ ...base, guitarOn: false, hasNoGuitarTrack: true }, BASE)).toContain('guitar=off');
  });
});
