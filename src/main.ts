import './style.css';
// The Evening look (night and day). After style.css, so it wins.
import './evening.css';
import { isGuitarProFile, readFileAsArrayBuffer } from './engine/loader';
import {
  getScoreMeta,
  getSongSlug,
  hasMainAudio,
  onStateChange,
  openScore,
  setSongOffsets,
  setSpeedFiles,
  replaceMainAudio,
  seekToBar,
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
import { initOverview } from './ui/overview';
import { clearSongVideo, setSongVideos } from './ui/video';
import { initHighway, isHighwayVisible, setHighwayView } from './ui/highway';
import { listRecentSongs, saveRecentSong, type RecentSong } from './ui/library';
import { buildPracticeLink, readLinkParams, type LinkParams } from './ui/links';
import { initShortcuts, registerAction } from './ui/shortcuts';
import { initShortcutsPanel } from './ui/shortcuts-panel';
import { initMode, stripBand } from './ui/modes';
import {
  fetchManifest,
  fetchSongBuffer,
  resolveManifestUrl,
  resolveSongUrl,
  songFeatures,
  type ManifestSong,
} from './ui/manifest';
import { statusHoldMs } from './ui/status-timing';
import { initMenu } from './ui/menu';

const appEl = document.querySelector<HTMLElement>('#app')!;
const openFileButton = document.querySelector<HTMLButtonElement>('#open-file-button')!;
const songListButton = document.querySelector<HTMLButtonElement>('#song-list-button')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const playerEl = document.querySelector<HTMLDivElement>('#player')!;
const openAnotherButton = document.querySelector<HTMLButtonElement>('#open-another-button')!;
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

let statusTimer = 0;

/**
 * A brief message that floats over the page rather than taking a row of its
 * own: ordinary messages fade after a few seconds, errors stay until the
 * next message replaces them.
 */
function setStatus(message: string, isError = false): void {
  window.clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
  statusEl.classList.toggle('is-shown', message !== '');
  const hold = statusHoldMs(message, isError);
  if (hold !== null) statusTimer = window.setTimeout(() => statusEl.classList.remove('is-shown'), hold);
}

statusEl.addEventListener('click', () => statusEl.classList.remove('is-shown'));

/** The drop zone and recent/library lists belong to the empty state only. */
function revealPlayer(): void {
  playerEl.hidden = false;
  appEl.classList.add('has-song');
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name);
}

async function loadSong(file: File): Promise<void> {
  setStatus(`Loading "${file.name}"…`);
  try {
    const buffer = await readFileAsArrayBuffer(file);
    await openScore(buffer);
    clearSongVideo();
    hasSongLoaded = true;
    revealPlayer();
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
    clearSongVideo();
    hasSongLoaded = true;
    revealPlayer();
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
    button.textContent = song.title;
    if (song.artist) {
      const artist = document.createElement('span');
      artist.className = 'recent-song-artist';
      artist.textContent = `— ${song.artist}`;
      button.append(' ', artist);
    }
    button.addEventListener('click', () => void loadRecentSong(song));
    li.appendChild(button);
    recentSongsList.appendChild(li);
  }
}

openFileButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void handleFile(file);
});

// A file can be dropped anywhere on the page: a Guitar Pro file on the song
// list, or a second recording (a no-guitar version) onto a song already open.
// Only drags that carry files light the page up.
let dragDepth = 0;
function isFileDrag(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}
window.addEventListener('dragenter', (e) => {
  if (!isFileDrag(e)) return;
  dragDepth++;
  appEl.classList.add('is-dragover');
});
window.addEventListener('dragleave', (e) => {
  if (!isFileDrag(e)) return;
  dragDepth = Math.max(dragDepth - 1, 0);
  if (dragDepth === 0) appEl.classList.remove('is-dragover');
});
window.addEventListener('dragover', (e) => {
  if (isFileDrag(e)) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  appEl.classList.remove('is-dragover');
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
    // Start on the loop, not at bar 1: otherwise the student has to play
    // through everything before it to reach the bars they were sent.
    seekToBar(Math.min(from, to));
  }
  if (params.view) setHighwayView(params.view === 'highway');
  if (params.guitar === 'off') setGuitarOn(false);
  if (params.autoplay) void togglePlay();
}

function showPendingSongPrompt(params: LinkParams, notInLibrary = false): void {
  pendingLinkParams = params;
  const name = params.song ? params.song.replace(/-/g, ' ') : 'the song';
  pendingSongNote.textContent = notInLibrary
    ? `“${name}” isn't in the song list. If you have the file, drop it on this page or use Open your own file below — or pick a song from the list.`
    : `Drop “${name}” on this page to continue, or choose it with Open your own file.`;
  pendingSongNote.hidden = false;
}

/**
 * While a link's song is being fetched from the library the same line says
 * so. It used to say "Drop the song here" from the start, which on a slow
 * connection told a student they needed a file they don't have.
 */
function showSongLoadingNote(params: LinkParams): void {
  const name = params.song ? params.song.replace(/-/g, ' ') : 'the song';
  pendingSongNote.textContent = `Loading “${name}”… this can take a moment`;
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

openAnotherButton.addEventListener('click', () => fileInput.click());
// Back to the song list: the page as a student first sees it, with no song
// or practice link in the address.
songListButton.addEventListener('click', () => {
  window.location.href = window.location.pathname;
});
copyLinkButton.addEventListener('click', copyPracticeLink);
tapButton.addEventListener('click', () => {
  tapOverlay.hidden = true;
  void togglePlay();
});

initShortcuts();
initShortcutsPanel();
initMenu();
registerAction('copyLink', copyPracticeLink);
initControls();
initOverview();
initHighway();

linkParams = readLinkParams();
const mode = initMode(linkParams.mode);

/**
 * Opens a library song's score and, where the manifest names one, its
 * no-guitar backing track too — a hosted song is otherwise missing the
 * Guitar on/off track that a dropped-in second file gets for free.
 */
async function openManifestSong(manifestUrl: string, song: ManifestSong): Promise<void> {
  const buffer = await fetchSongBuffer(resolveSongUrl(manifestUrl, song));
  await openScore(buffer);
  setSongOffsets(song.audioOffsetSeconds, song.noGuitarOffsetSeconds);
  setSpeedFiles(
    song.speedFiles &&
      Object.fromEntries(
        Object.entries(song.speedFiles).map(([percent, file]) => [percent, resolveSongUrl(manifestUrl, { ...song, file })]),
      ),
  );
  const videos = (song.videos ?? []).map((v) => ({
    url: resolveSongUrl(manifestUrl, { ...song, file: v.file }),
    track: v.track,
    offsetSeconds: v.offsetSeconds,
    focusY: v.focusY,
  }));
  if (song.videoFile) {
    videos.push({ url: resolveSongUrl(manifestUrl, { ...song, file: song.videoFile }), track: undefined, offsetSeconds: song.videoOffsetSeconds, focusY: song.videoFocusY });
  }
  // `?video=off` leaves the video out, to compare the board without it.
  // `?strip=1` leaves it out too: the strip is for the music alone.
  const videoOff = new URLSearchParams(location.search).get('video') === 'off' || stripBand() !== null;
  if (videos.length && !videoOff) setSongVideos(videos);
  else clearSongVideo();
  if (song.noGuitarFile) {
    const noGuitarBuffer = await fetchSongBuffer(resolveSongUrl(manifestUrl, { ...song, file: song.noGuitarFile }));
    const noGuitarFile = new File([noGuitarBuffer], 'no-guitar.mp3', { type: 'audio/mpeg' });
    await setNoGuitarTrack(noGuitarFile);
  }
  hasSongLoaded = true;
  revealPlayer();
  songTitleEl.textContent = song.title;
  songArtistEl.textContent = song.artist;
}

async function loadFromManifest(manifestUrl: string, params: LinkParams): Promise<void> {
  const wantsSong = !!params.song && mode !== 'obs';
  if (wantsSong) showSongLoadingNote(params);
  const manifest = await fetchManifest(manifestUrl);
  if (manifest) renderLibrary(manifest.songs, manifestUrl);
  if (!params.song) return;
  const song = manifest?.songs.find((entry) => entry.slug === params.song);
  if (!song) {
    // Not a library song (or the library couldn't be reached): it's one the
    // student has as a file, so now is the time to ask for it.
    if (wantsSong) {
      // The note at the top of the song list says what to do; a floating
      // error saying it again only covered the list.
      showPendingSongPrompt(params, true);
    }
    return;
  }
  try {
    await openManifestSong(manifestUrl, song);
    clearPendingSongPrompt();
    applyLinkParams(params);
    setStatus(`Loaded "${song.title}" from the library.`);
  } catch (err) {
    clearPendingSongPrompt();
    setStatus(`Couldn't load "${song.title}". Check your internet connection and reload the page. (${(err as Error).message})`, true);
  }
}

const FEATURE_LABELS: { key: keyof ReturnType<typeof songFeatures>; label: string }[] = [
  { key: 'video', label: 'Video' },
  { key: 'slowed', label: 'Slowed recordings' },
  { key: 'noGuitar', label: 'No-guitar track' },
];

/** The song list: one card per library song, with badges for what it comes with. */
function renderLibrary(songs: ManifestSong[], manifestUrl: string): void {
  if (songs.length === 0) return;
  libraryEl.hidden = false;
  libraryList.innerHTML = '';
  for (const song of songs) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'song-tile';

    const title = document.createElement('span');
    title.className = 'song-tile-title';
    title.textContent = song.title;
    const artist = document.createElement('span');
    artist.className = 'song-tile-artist';
    artist.textContent = song.artist;
    button.append(title, artist);

    const features = songFeatures(song);
    const badges = FEATURE_LABELS.filter((f) => features[f.key]);
    if (badges.length) {
      const row = document.createElement('span');
      row.className = 'song-tile-badges';
      for (const badge of badges) {
        const el = document.createElement('span');
        el.className = 'badge';
        el.textContent = badge.label;
        row.appendChild(el);
      }
      button.appendChild(row);
    }

    button.addEventListener('click', async () => {
      setStatus(`Loading "${song.title}"…`);
      try {
        await openManifestSong(manifestUrl, song);
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
} else if (linkParams.song && mode !== 'obs') {
  showPendingSongPrompt(linkParams);
}
void renderRecentSongs();
