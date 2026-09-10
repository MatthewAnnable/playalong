export interface RecentSong {
  id: string;
  filename: string;
  title: string;
  artist: string;
  buffer: ArrayBuffer;
  savedAt: number;
}

const DB_NAME = 'playalong';
const STORE = 'recent-songs';
const MAX_RECENT = 5;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecentSong(entry: Omit<RecentSong, 'savedAt'>): Promise<void> {
  const db = await openDb();
  const all = await listRecentSongs();
  const withoutDuplicate = all.filter((song) => song.id !== entry.id);
  const trimmed = [{ ...entry, savedAt: Date.now() }, ...withoutDuplicate].slice(0, MAX_RECENT);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    for (const song of trimmed) tx.objectStore(STORE).put(song);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRecentSongs(): Promise<RecentSong[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => {
      const songs = (request.result as RecentSong[]).sort((a, b) => b.savedAt - a.savedAt);
      resolve(songs);
    };
    request.onerror = () => reject(request.error);
  });
}
