export interface ManifestSong {
  slug: string;
  title: string;
  artist: string;
  file: string;
  noGuitarFile?: string;
  defaultTrack?: number;
  audioOffsetSeconds?: number;
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
 */
export function resolveSongUrl(manifestUrl: string, song: ManifestSong, pageUrl = window.location.href): string {
  if (/^https?:\/\//i.test(song.file)) return song.file;
  const manifestAbsolute = new URL(manifestUrl, pageUrl);
  return new URL(song.file.replace(/^\//, ''), new URL('/', manifestAbsolute)).toString();
}

export async function fetchSongBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the song (${response.status}).`);
  return response.arrayBuffer();
}
