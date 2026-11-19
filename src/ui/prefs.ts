/**
 * Small per-device choices, kept in localStorage. Storage can be missing or
 * throw (private browsing, blocked site data), so every read falls back to
 * the default and every write is allowed to fail quietly.
 */

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const COUNT_IN_KEY = 'playalong.countIn';

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Count-in is on unless this device has switched it off. */
export function readCountIn(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(COUNT_IN_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeCountIn(on: boolean, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(COUNT_IN_KEY, on ? 'on' : 'off');
  } catch {
    // The switch still works for this visit.
  }
}
