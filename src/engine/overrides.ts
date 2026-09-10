import type { NoteEvent } from './notes';

export type FingerValue = 0 | 1 | 2 | 3 | 4;
export type OverrideMap = Record<string, FingerValue>;

const STORAGE_PREFIX = 'playalong.overrides.';

/** bar/beat/string identifies a note independently of how it was extracted. */
export function overrideKey(event: Pick<NoteEvent, 'bar' | 'beatIndex' | 'string'>): string {
  return `${event.bar}:${event.beatIndex}:${event.string}`;
}

export function loadOverrides(songSlug: string): OverrideMap {
  if (!songSlug) return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + songSlug);
    return raw ? (JSON.parse(raw) as OverrideMap) : {};
  } catch {
    return {};
  }
}

function persist(songSlug: string, map: OverrideMap): void {
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(STORAGE_PREFIX + songSlug);
    else localStorage.setItem(STORAGE_PREFIX + songSlug, JSON.stringify(map));
  } catch {
    // Blocked storage — overrides just won't survive the session.
  }
}

export function setOverride(songSlug: string, key: string, finger: FingerValue): OverrideMap {
  const map = loadOverrides(songSlug);
  map[key] = finger;
  persist(songSlug, map);
  return map;
}

export function clearOverrides(songSlug: string): void {
  persist(songSlug, {});
}

export function exportOverrides(songSlug: string): string {
  return JSON.stringify(loadOverrides(songSlug), null, 2);
}

export function importOverrides(songSlug: string, json: string): boolean {
  try {
    const parsed = JSON.parse(json) as OverrideMap;
    persist(songSlug, parsed);
    return true;
  } catch {
    return false;
  }
}

/** Applies saved corrections over the guessed fingering, in place. */
export function applyOverrides(events: NoteEvent[], map: OverrideMap): void {
  if (Object.keys(map).length === 0) return;
  for (const event of events) {
    const finger = map[overrideKey(event)];
    if (finger !== undefined) {
      event.finger = finger;
      event.fingerSource = 'override';
    }
  }
}
