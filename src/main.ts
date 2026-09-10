import './style.css';
import { isGuitarProFile, readFileAsArrayBuffer } from './engine/loader';
import {
  getScoreMeta,
  getSongSlug,
  hasMainAudio,
  onStateChange,
  openScore,
  replaceMainAudio,
  setGuitarOn,
  setLoop,
  setNoGuitarTrack,
  setSpeed,
  setTrackIndex,
  togglePlay,
  type EngineState,
} from './engine/alphatab';
import { slugify } from './engine/slug';
import { initControls } from './ui/controls';
import { initHighway, isHighwayVisible, setHighwayView } from './ui/highway';
import { listRecentSongs, saveRecentSong, type RecentSong } from './ui/library';
import { buildPracticeLink, readLinkParams, type LinkParams } from './ui/links';
import { initShortcuts, registerAction } from './ui/shortcuts';
import { initShortcutsPanel } from './ui/shortcuts-panel';
import { initMode } from './ui/modes';
import { fetchManifest, fetchSongBuffer, resolveManifestUrl, resolveSongUrl, type ManifestSong } from './ui/manifest';

const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const playerEl = document.querySelector<HTMLDivElement>('#player')!;
const songTitleEl = document.querySelector<HTMLHeadingElement>('#song-title')!;
const songArtistEl = document.querySelector<HTMLParagraphElement>('#song-artist')!;
const recentSongsEl = document.querySelector<HTMLElement>('#recent-songs')!;
const recentSongsList = document.querySelector<HTMLUListElement>('#recent-songs-list')!;
const libraryEl = document.querySelector<HTMLElement>('#library')!;
const libraryList = document.querySelector<HTMLUListElement>('#library-list')!;

const modal = document.querySelector<HTMLDivElement>('#second-file-modal')!;
const modalText = document.querySelector<HTMLParagraphElement>('#second-file-modal-text')!;
const modalReplace = document.querySelector<HTMLButtonElement>('#second-file-replace')!;
const modalNoGuitar = document.querySelector<HTMLButtonElement>('#second-file-no-guitar')!;
const modalCancel = document.querySelector<HTMLButtonElement>('#second-file-cancel')!;

const pendingSongNote = document.querySelector<HTMLParagraphElement>('#pending-song-note')!;
const copyLinkButton = document.querySelector<HTMLButtonElement>('#copy-link-button')!;
const tapOverlay = document.querySelector<HTMLDivElement>('#tap-to-start')!;
const tapButton = document.querySelector<HTMLButtonElement>('#tap-to-start-button')!;

let hasSongLoaded = false;
let pendingAudioFile: File | null = null;
let linkParams: LinkParams = {};
let pendingLinkParams: LinkParams | null = null;
let latestState: Readonly<EngineState> | null = null;

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
    if (pendingLinkParams && matchesPendingSong(file.name)) {
      const params = pendingLinkParams;
      clearPendingSongPrompt();
      applyLinkParams(params);
      setStatus(`Loaded "${file.name}" — practice link applied.`);
    } else {
      setStatus(`Loaded "${file.name}".`);
    }
    window.dispatchEvent(
      new CustomEvent('playalong:song-loaded', { detail: { buffer: buffer.slice(0), filename: file.name } }),
    );
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

/**
 * Applies the settings carried by a practice link once the song is open.
 * Bars are clamped, so a link pointing past the end of a shorter song
 * degrades gracefully instead of breaking the loop.
 */
function applyLinkParams(params: LinkParams): void {
  const totalBars = latestState?.totalBars ?? 1;
  if (params.track !== undefined) setTrackIndex(params.track);
  if (params.speed !== undefined) setSpeed(Math.round(params.speed * 100));
  if (params.from !== undefined || params.to !== undefined) {
    const from = Math.min(Math.max(params.from ?? 1, 1), totalBars);
    const to = Math.min(Math.max(params.to ?? totalBars, 1), totalBars);
    setLoop(from, to, true);
  }
  if (params.view === 'highway') setHighwayView(true);
  if (params.guitar === 'off') setGuitarOn(false);
  if (params.autoplay) void togglePlay();
}

function showPendingSongPrompt(params: LinkParams): void {
  pendingLinkParams = params;
  const name = params.song ? params.song.replace(/-/g, ' ') : 'the song';
  pendingSongNote.textContent = `Drop “${name}” here to continue`;
  pendingSongNote.hidden = false;
}

function clearPendingSongPrompt(): void {
  pendingLinkParams = null;
  pendingSongNote.hidden = true;
}

/** A dropped file satisfies a pending link if its title or filename matches. */
function matchesPendingSong(filename: string): boolean {
  const wanted = pendingLinkParams?.song;
  if (!wanted) return false;
  const titleSlug = slugify(getScoreMeta().title || '');
  const fileSlug = slugify(filename.replace(/\.[^.]+$/, ''));
  return titleSlug === wanted || fileSlug === wanted;
}

function copyPracticeLink(): void {
  if (!latestState || !hasSongLoaded) {
    setStatus('Open a song first, then copy a practice link.', true);
    return;
  }
  const link = buildPracticeLink({
    songSlug: getSongSlug(),
    trackIndex: latestState.trackIndex,
    loopEnabled: latestState.loopEnabled,
    loopStartBar: latestState.loopStartBar,
    loopEndBar: latestState.loopEndBar,
    speed: latestState.speed,
    view: isHighwayVisible() ? 'highway' : 'score',
    guitarOn: latestState.guitarOn,
    hasNoGuitarTrack: latestState.hasNoGuitarTrack,
  });
  navigator.clipboard.writeText(link).then(
    () => setStatus('Practice link copied — paste it into a lesson email.'),
    () => setStatus(link),
  );
}

onStateChange((state) => {
  latestState = state;
  tapOverlay.hidden = !state.audioBlocked;
});

copyLinkButton.addEventListener('click', copyPracticeLink);
tapButton.addEventListener('click', () => {
  tapOverlay.hidden = true;
  void togglePlay();
});

initShortcuts();
initShortcutsPanel();
registerAction('copyLink', copyPracticeLink);
initControls();
initHighway();

linkParams = readLinkParams();
const mode = initMode(linkParams.mode);

async function loadFromManifest(manifestUrl: string, params: LinkParams): Promise<void> {
  const manifest = await fetchManifest(manifestUrl);
  if (!manifest) return;
  renderLibrary(manifest.songs, manifestUrl);
  if (!params.song) return;
  const song = manifest.songs.find((entry) => entry.slug === params.song);
  if (!song) return;
  try {
    const buffer = await fetchSongBuffer(resolveSongUrl(manifestUrl, song));
    await openScore(buffer);
    hasSongLoaded = true;
    playerEl.hidden = false;
    songTitleEl.textContent = song.title;
    songArtistEl.textContent = song.artist;
    clearPendingSongPrompt();
    applyLinkParams(params);
    setStatus(`Loaded "${song.title}" from the library.`);
  } catch (err) {
    setStatus((err as Error).message, true);
  }
}

function renderLibrary(songs: ManifestSong[], manifestUrl: string): void {
  if (songs.length === 0) return;
  libraryEl.hidden = false;
  libraryList.innerHTML = '';
  for (const song of songs) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `${song.title}<span class="recent-song-artist"> — ${song.artist}</span>`;
    button.addEventListener('click', async () => {
      setStatus(`Loading "${song.title}"…`);
      try {
        const buffer = await fetchSongBuffer(resolveSongUrl(manifestUrl, song));
        await openScore(buffer);
        hasSongLoaded = true;
        playerEl.hidden = false;
        songTitleEl.textContent = song.title;
        songArtistEl.textContent = song.artist;
        setStatus(`Loaded "${song.title}".`);
      } catch (err) {
        setStatus((err as Error).message, true);
      }
    });
    li.appendChild(button);
    libraryList.appendChild(li);
  }
}

const manifestUrl = resolveManifestUrl(linkParams.manifest);
if (manifestUrl) {
  void loadFromManifest(manifestUrl, linkParams);
  if (linkParams.song) showPendingSongPrompt(linkParams);
} else if (linkParams.song && mode !== 'obs') {
  showPendingSongPrompt(linkParams);
}
void renderRecentSongs();
