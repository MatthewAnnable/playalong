import './style.css';
import { isGuitarProFile, readFileAsArrayBuffer } from './engine/loader';
import { getScoreMeta, hasMainAudio, openScore, replaceMainAudio, setNoGuitarTrack } from './engine/alphatab';
import { initControls } from './ui/controls';
import { listRecentSongs, saveRecentSong, type RecentSong } from './ui/library';

const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const playerEl = document.querySelector<HTMLDivElement>('#player')!;
const songTitleEl = document.querySelector<HTMLHeadingElement>('#song-title')!;
const songArtistEl = document.querySelector<HTMLParagraphElement>('#song-artist')!;
const recentSongsEl = document.querySelector<HTMLElement>('#recent-songs')!;
const recentSongsList = document.querySelector<HTMLUListElement>('#recent-songs-list')!;

const modal = document.querySelector<HTMLDivElement>('#second-file-modal')!;
const modalText = document.querySelector<HTMLParagraphElement>('#second-file-modal-text')!;
const modalReplace = document.querySelector<HTMLButtonElement>('#second-file-replace')!;
const modalNoGuitar = document.querySelector<HTMLButtonElement>('#second-file-no-guitar')!;
const modalCancel = document.querySelector<HTMLButtonElement>('#second-file-cancel')!;

let hasSongLoaded = false;
let pendingAudioFile: File | null = null;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name);
}

async function loadSong(file: File): Promise<void> {
  setStatus(`Loading "${file.name}"…`);
  try {
    const buffer = await readFileAsArrayBuffer(file);
    await openScore(buffer);
    hasSongLoaded = true;
    playerEl.hidden = false;
    const meta = getScoreMeta();
    songTitleEl.textContent = meta.title || file.name.replace(/\.[^.]+$/, '');
    songArtistEl.textContent = meta.artist;
    setStatus(`Loaded "${file.name}".`);
    await saveRecentSong({
      id: file.name,
      filename: file.name,
      title: meta.title || file.name,
      artist: meta.artist,
      buffer,
    });
    void renderRecentSongs();
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't open "${file.name}" — ${(err as Error).message}`, true);
  }
}

async function loadRecentSong(song: RecentSong): Promise<void> {
  setStatus(`Loading "${song.title}"…`);
  try {
    await openScore(song.buffer.slice(0));
    hasSongLoaded = true;
    playerEl.hidden = false;
    songTitleEl.textContent = song.title;
    songArtistEl.textContent = song.artist;
    setStatus(`Loaded "${song.title}".`);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't open "${song.title}" — ${(err as Error).message}`, true);
  }
}

function showSecondFileModal(file: File): void {
  pendingAudioFile = file;
  modalText.textContent = `"${file.name}" — is this a replacement recording, or the same song with the guitar removed?`;
  modal.hidden = false;
}

function hideSecondFileModal(): void {
  modal.hidden = true;
  pendingAudioFile = null;
}

modalReplace.addEventListener('click', () => {
  if (pendingAudioFile) void replaceMainAudio(pendingAudioFile);
  hideSecondFileModal();
});

modalNoGuitar.addEventListener('click', () => {
  if (pendingAudioFile) void setNoGuitarTrack(pendingAudioFile);
  hideSecondFileModal();
});

modalCancel.addEventListener('click', hideSecondFileModal);

async function handleFile(file: File): Promise<void> {
  if (isGuitarProFile(file)) {
    await loadSong(file);
    return;
  }

  if (isAudioFile(file)) {
    if (!hasSongLoaded) {
      setStatus('Drop a Guitar Pro file first, then drop the audio.', true);
      return;
    }
    if (hasMainAudio()) {
      showSecondFileModal(file);
    } else {
      setStatus("This file has no audio, and adding one isn't supported yet — use a Guitar Pro file with audio embedded.", true);
    }
    return;
  }

  setStatus(`"${file.name}" isn't a Guitar Pro or audio file.`, true);
}

async function renderRecentSongs(): Promise<void> {
  const songs = await listRecentSongs();
  recentSongsEl.hidden = songs.length === 0;
  recentSongsList.innerHTML = '';
  for (const song of songs) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `${song.title}${song.artist ? ` <span class="recent-song-artist">— ${song.artist}</span>` : ''}`;
    button.addEventListener('click', () => void loadRecentSong(song));
    li.appendChild(button);
    recentSongsList.appendChild(li);
  }
}

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('is-dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('is-dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('is-dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});

// A second file can also be dropped onto the player itself (score view or
// transport), not just the drop zone above it — that's the whole point of
// adding a no-guitar track to a song already playing.
playerEl.addEventListener('dragover', (e) => e.preventDefault());
playerEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});

initControls();
void renderRecentSongs();
