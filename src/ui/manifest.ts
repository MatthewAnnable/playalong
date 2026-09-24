export interface ManifestSong {
  slug: string;
  title: string;
  artist: string;
  file: string;
  noGuitarFile?: string;
  defaultTrack?: number;
  /** Shifts the highway and score against this song's audio, for a file whose own sync is off. */
  audioOffsetSeconds?: number;
  /** How many seconds the no-guitar recording runs behind the main one (measure it; R U Mine's is 0.06). */
  noGuitarOffsetSeconds?: number;
  theme?: string;
  tags?: string[];
}

export interface Manifest {
  songs: ManifestSong[];
}

/**
 * The hosted library is a switch, not a rewrite (build plan 5.7). Point this
 * at a manifest — or pass ?manifest= — and the library page appears. Left
 * empty, the app stays drag-and-drop only and the library stays hidden.
 */
export const MANIFEST_URL = 'songs/index.json';

export function resolveManifestUrl(override?: string): string {
  return override || MANIFEST_URL;
}

export async function fetchManifest(url: string): Promise<Manifest | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as Manifest;
    return Array.isArray(data.songs) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Manifest `file` paths are relative to the site root that serves the
 * manifest (the plan's example manifest lives at songs/index.json and still
 * writes "songs/freedom/song.gp"). A fully-qualified URL is used as-is, so a
 * manifest can point anywhere.
 *
 * A manifest given as an absolute path or a full URL (an external library,
 * or one hosted at its own domain root) treats "site root" as that host's
 * actual root. A manifest given as a plain relative path — the default,
 * `songs/index.json` — is served by this same app, which may itself be
 * deployed under a subpath (GitHub Pages project sites: `/<repo>/`); its
 * "site root" is that subpath, not the domain root, or a song link 404s the
 * moment the app isn't hosted at the domain root.
 */
export function resolveSongUrl(manifestUrl: string, song: ManifestSong, pageUrl = window.location.href): string {
  if (/^https?:\/\//i.test(song.file)) return song.file;
  const filePath = song.file.replace(/^\//, '');
  const isManifestRelative = !/^https?:\/\//i.test(manifestUrl) && !manifestUrl.startsWith('/');
  const siteRoot = isManifestRelative
    ? new URL('.', new URL(pageUrl))
    : new URL('/', new URL(manifestUrl, pageUrl));
  return new URL(filePath, siteRoot).toString();
}

export async function fetchSongBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the song (${response.status}).`);
  return response.arrayBuffer();
}
