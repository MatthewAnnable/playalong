import { describe, expect, it } from 'vitest';
import { resolveSongUrl, type ManifestSong } from './manifest';

const PAGE = 'https://portal.example/playalong/?song=freedom';

const song = (file: string): ManifestSong => ({
  slug: 'freedom',
  title: 'Freedom',
  artist: 'Rage Against the Machine',
  file,
});

describe('resolveSongUrl', () => {
  it('resolves manifest paths against the site root, not the manifest folder', () => {
    // The manifest sits in songs/ but its paths still start with songs/,
    // so resolving relative to the manifest would double the folder.
    expect(resolveSongUrl('/songs/index.json', song('songs/freedom/song.gp'), PAGE)).toBe(
      'https://portal.example/songs/freedom/song.gp',
    );
  });

  it('accepts leading slashes', () => {
    expect(resolveSongUrl('/songs/index.json', song('/songs/freedom/song.gp'), PAGE)).toBe(
      'https://portal.example/songs/freedom/song.gp',
    );
  });

  it('leaves fully-qualified URLs alone', () => {
    expect(resolveSongUrl('/songs/index.json', song('https://cdn.example/a.gp'), PAGE)).toBe(
      'https://cdn.example/a.gp',
    );
  });

  it('follows a manifest hosted on another origin', () => {
    expect(resolveSongUrl('https://library.example/lib/index.json', song('songs/freedom/song.gp'), PAGE)).toBe(
      'https://library.example/songs/freedom/song.gp',
    );
  });

  it('resolves a relative manifest against the app’s own subpath, not the domain root', () => {
    // GitHub Pages project sites (and MANIFEST_URL's default) give a plain
    // relative path like "songs/index.json" — that manifest is served by
    // this same app, which may itself live under /<repo>/, not at the
    // domain root, so the song file must follow it there.
    expect(resolveSongUrl('songs/index.json', song('songs/freedom/song.gp'), PAGE)).toBe(
      'https://portal.example/playalong/songs/freedom/song.gp',
    );
  });
});
