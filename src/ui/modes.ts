import {
  getPositionSnapshot,
  onStateChange,
  openScore,
  setFollowerPlayback,
  setMuted,
  setTrackIndex,
  stopLocalPositionLoop,
} from '../engine/alphatab';
import { RemoteClock, send, subscribe } from '../engine/sync';
import { setHighwayTheme, setHighwayView, setTickSource } from './highway';
import { type Theme } from '../theme/theme';
import defaultTheme from '../theme/themes/default.json';

export type AppMode = 'normal' | 'remote' | 'obs';

const appEl = document.querySelector<HTMLElement>('#app')!;
const playerEl = document.querySelector<HTMLDivElement>('#player')!;
const barInfoEl = document.querySelector<HTMLSpanElement>('#highway-bar-info')!;
const audioSourceRow = document.querySelector<HTMLLabelElement>('#audio-source-row')!;
const audioSourceToggle = document.querySelector<HTMLInputElement>('#audio-source-toggle')!;

let mode: AppMode = 'normal';

export function getMode(): AppMode {
  return mode;
}

/**
 * OBS draws the page over the camera, so the stage has to be genuinely
 * transparent rather than dark — otherwise the browser source shows as a
 * black box (build plan 5.9).
 */
function applyTransparentStage(): void {
  const theme: Theme = { ...(defaultTheme as Theme) };
  theme.stage = { ...theme.stage, background: 'rgba(0,0,0,0)' };
  setHighwayTheme(theme);
  document.documentElement.style.setProperty('--stage-bg', 'transparent');
}

function initObsMode(): void {
  appEl.classList.add('obs', 'presentation');
  setMuted(true);
  applyTransparentStage();

  const clock = new RemoteClock();
  setTickSource(() => clock.currentTick());
  setHighwayView(true);

  let audioMaster: 'remote' | 'obs' = 'remote';

  subscribe((message) => {
    switch (message.type) {
      case 'position':
        clock.update(message);
        // When OBS is the audio source it plays the song itself, following
        // the remote's transport and correcting any drift.
        if (audioMaster === 'obs') setFollowerPlayback(message.isPlaying, message.audioSeconds);
        break;
      case 'audioMaster':
        audioMaster = message.master;
        setMuted(message.master !== 'obs');
        if (message.master !== 'obs') setFollowerPlayback(false, 0);
        break;
      case 'song':
        void openScore(message.buffer.slice(0)).then(() => {
          setMuted(true);
          // The highway lives inside #player, which normally only appears
          // once a file is dropped here — in OBS mode the song arrives over
          // the channel instead, so reveal it before measuring the canvas.
          playerEl.hidden = false;
          setHighwayView(true);
          stopLocalPositionLoop();
        });
        break;
      case 'track':
        setTrackIndex(message.index);
        break;
    }
  });

  // The local engine never plays in OBS mode, so the header's bar counter
  // has to come from the remote position rather than local state.
  let markers: { tick: number; barNumber: number }[] = [];
  let totalBars = 1;
  onStateChange((state) => {
    markers = state.barMarkers;
    totalBars = state.totalBars;
  });
  window.setInterval(() => {
    if (markers.length === 0) return;
    const tick = clock.currentTick();
    let bar = 1;
    for (let i = markers.length - 1; i >= 0; i--) {
      if (tick >= markers[i].tick) {
        bar = markers[i].barNumber;
        break;
      }
    }
    barInfoEl.textContent = `Bar ${bar} / ${totalBars}`;
  }, 100);

  // Ask whichever remote tab is open to re-send the current song.
  send({ type: 'hello' });
}

function initRemoteMode(): void {
  appEl.classList.add('remote');
  audioSourceRow.hidden = false;

  let lastBuffer: ArrayBuffer | null = null;
  let lastFilename = '';

  window.addEventListener('playalong:song-loaded', ((e: CustomEvent<{ buffer: ArrayBuffer; filename: string }>) => {
    lastBuffer = e.detail.buffer;
    lastFilename = e.detail.filename;
    send({ type: 'song', buffer: lastBuffer.slice(0), filename: lastFilename });
  }) as EventListener);

  subscribe((message) => {
    if (message.type === 'hello' && lastBuffer) {
      send({ type: 'song', buffer: lastBuffer.slice(0), filename: lastFilename });
    }
  });

  onStateChange((state) => {
    setMuted(audioSourceToggle.checked);
    audioSourceRow.title = audioSourceToggle.checked ? 'Audio plays in the OBS source' : 'Audio plays here';
    void state;
  });

  audioSourceToggle.addEventListener('change', () => {
    setMuted(audioSourceToggle.checked);
    send({ type: 'audioMaster', master: audioSourceToggle.checked ? 'obs' : 'remote' });
  });

  window.setInterval(() => {
    const snapshot = getPositionSnapshot();
    send({ type: 'position', ...snapshot, at: Date.now() });
  }, 50);
}

export function initMode(rawMode: string | undefined): AppMode {
  if (rawMode === 'obs') {
    mode = 'obs';
    initObsMode();
  } else if (rawMode === 'remote') {
    mode = 'remote';
    initRemoteMode();
  }
  return mode;
}
