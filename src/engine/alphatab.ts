import { AlphaTabApi, PlayerMode, Settings } from '@coderline/alphatab';
import type { model, synth } from '@coderline/alphatab';

let api: AlphaTabApi | null = null;
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let positionLoopId = 0;

const container = document.querySelector<HTMLDivElement>('#alphatab')!;
const playerEl = document.querySelector<HTMLDivElement>('#player')!;
const trackSelect = document.querySelector<HTMLSelectElement>('#track-select')!;
const playButton = document.querySelector<HTMLButtonElement>('#play-button')!;

// alphaTab never plays the embedded audio itself — we own an <audio> element
// and drive alphaTab's cursor from it via the external-media handler, so we
// keep full control of playbackRate/pitch and can later crossfade a second
// (no-guitar) track without alphaTab knowing. See build plan section 5.3.
function makeExternalMediaHandler(el: HTMLAudioElement): synth.IExternalMediaHandler {
  return {
    get backingTrackDuration(): number {
      return Number.isFinite(el.duration) ? el.duration * 1000 : 0;
    },
    get playbackRate(): number {
      return el.playbackRate;
    },
    set playbackRate(value: number) {
      el.playbackRate = value;
    },
    get masterVolume(): number {
      return el.volume;
    },
    set masterVolume(value: number) {
      el.volume = value;
    },
    seekTo(time: number): void {
      el.currentTime = time / 1000;
    },
    play(): void {
      void el.play();
    },
    pause(): void {
      el.pause();
    },
  };
}

function stopPositionLoop(): void {
  if (positionLoopId) {
    clearInterval(positionLoopId);
    positionLoopId = 0;
  }
}

function populateTrackSelect(score: model.Score): void {
  trackSelect.innerHTML = '';
  score.tracks.forEach((track, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = track.name || `Track ${index + 1}`;
    trackSelect.appendChild(option);
  });
}

function initControlsOnce(): void {
  trackSelect.addEventListener('change', () => {
    if (!api?.score) return;
    const index = Number(trackSelect.value);
    api.renderTracks([api.score.tracks[index]]);
  });

  playButton.addEventListener('click', () => {
    api?.playPause();
  });
}
let controlsInitialised = false;

export async function openScore(buffer: ArrayBuffer): Promise<void> {
  if (!controlsInitialised) {
    initControlsOnce();
    controlsInitialised = true;
  }

  stopPositionLoop();
  api?.destroy();
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  const settings = new Settings();
  settings.player.playerMode = PlayerMode.EnabledExternalMedia;
  settings.player.scrollElement = container;

  api = new AlphaTabApi(container, settings);
  audio = new Audio();
  audio.preload = 'auto';
  const handler = makeExternalMediaHandler(audio);

  api.scoreLoaded.on((score) => {
    const backingTrack = score.backingTrack;
    if (!backingTrack?.rawAudioFile) {
      throw new Error('This file has no embedded audio.');
    }
    const blob = new Blob([backingTrack.rawAudioFile as BlobPart], { type: 'audio/mpeg' });
    objectUrl = URL.createObjectURL(blob);
    audio!.src = objectUrl;
    populateTrackSelect(score);
  });

  api.playerReady.on(() => {
    const output = api!.player!.output as unknown as synth.IExternalMediaSynthOutput;
    output.handler = handler;

    // Per build plan 5.3: update alphaTab's position on a ~50ms timer (and
    // on seek, handled by the handler's seekTo). Smoother per-frame
    // interpolation is the highway clock's job in Phase 2, not this.
    positionLoopId = window.setInterval(() => {
      output.updatePosition(audio!.currentTime * 1000);
    }, 50);
  });

  playerEl.hidden = false;

  const accepted = api.load(buffer);
  if (!accepted) {
    throw new Error('alphaTab could not read this file.');
  }
}
