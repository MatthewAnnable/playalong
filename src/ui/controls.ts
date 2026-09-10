import {
  onStateChange,
  seekToSeconds,
  setLoop,
  setSpeed,
  setTabOnly,
  setTrackIndex,
  setGuitarOn,
  setPresentationMode,
  togglePlay,
} from '../engine/alphatab';

const playButton = document.querySelector<HTMLButtonElement>('#play-button')!;
const scrubber = document.querySelector<HTMLInputElement>('#scrubber')!;
const timeCurrent = document.querySelector<HTMLSpanElement>('#time-current')!;
const timeTotal = document.querySelector<HTMLSpanElement>('#time-total')!;
const barCurrent = document.querySelector<HTMLSpanElement>('#bar-current')!;
const barTotal = document.querySelector<HTMLSpanElement>('#bar-total')!;
const speedSlider = document.querySelector<HTMLInputElement>('#speed-slider')!;
const speedValue = document.querySelector<HTMLSpanElement>('#speed-value')!;
const loopToggle = document.querySelector<HTMLInputElement>('#loop-toggle')!;
const loopStart = document.querySelector<HTMLInputElement>('#loop-start')!;
const loopEnd = document.querySelector<HTMLInputElement>('#loop-end')!;
const tabOnlyToggle = document.querySelector<HTMLInputElement>('#tab-only-toggle')!;
const guitarToggleRow = document.querySelector<HTMLLabelElement>('#guitar-toggle-row')!;
const guitarToggle = document.querySelector<HTMLInputElement>('#guitar-toggle')!;
const trackSelect = document.querySelector<HTMLSelectElement>('#track-select')!;
const presentationButton = document.querySelector<HTMLButtonElement>('#presentation-button')!;
const appEl = document.querySelector<HTMLElement>('#app')!;

let isScrubbing = false;
let durationSec = 0;
const SCRUBBER_RESOLUTION = 1000;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function initControls(): void {
  onStateChange((state) => {
    if (state.countingIn) playButton.textContent = 'Counting in…';
    else playButton.textContent = state.isPlaying ? 'Pause' : 'Play';
    playButton.disabled = !state.ready;

    if (!isScrubbing) {
      scrubber.max = String(SCRUBBER_RESOLUTION);
      const ratio = state.durationSec > 0 ? state.currentTimeSec / state.durationSec : 0;
      scrubber.value = String(Math.round(ratio * SCRUBBER_RESOLUTION));
    }
    durationSec = state.durationSec;
    timeCurrent.textContent = formatTime(state.currentTimeSec);
    timeTotal.textContent = formatTime(state.durationSec);

    barCurrent.textContent = String(state.currentBar);
    barTotal.textContent = String(state.totalBars);

    speedSlider.value = String(state.speed);
    speedValue.textContent = `${state.speed}%`;

    loopToggle.checked = state.loopEnabled;
    if (document.activeElement !== loopStart) loopStart.value = String(state.loopStartBar);
    if (document.activeElement !== loopEnd) loopEnd.value = String(state.loopEndBar);
    loopStart.max = String(state.totalBars);
    loopEnd.max = String(state.totalBars);

    tabOnlyToggle.checked = state.tabOnly;

    guitarToggleRow.hidden = !state.hasNoGuitarTrack;
    guitarToggle.checked = state.guitarOn;

    if (trackSelect.childElementCount !== state.trackNames.length) {
      trackSelect.innerHTML = '';
      state.trackNames.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = name;
        trackSelect.appendChild(option);
      });
    }
    trackSelect.value = String(state.trackIndex);
  });

  playButton.addEventListener('click', () => void togglePlay());

  scrubber.addEventListener('pointerdown', () => {
    isScrubbing = true;
  });
  scrubber.addEventListener('input', () => {
    const ratio = Number(scrubber.value) / SCRUBBER_RESOLUTION;
    timeCurrent.textContent = formatTime(ratio * durationSec);
  });
  scrubber.addEventListener('change', () => {
    const ratio = Number(scrubber.value) / SCRUBBER_RESOLUTION;
    seekToSeconds(ratio * durationSec);
    isScrubbing = false;
  });

  speedSlider.addEventListener('input', () => {
    setSpeed(Number(speedSlider.value));
  });

  function applyLoopFromInputs(): void {
    setLoop(Number(loopStart.value) || 1, Number(loopEnd.value) || 1, loopToggle.checked);
  }
  loopToggle.addEventListener('change', applyLoopFromInputs);
  loopStart.addEventListener('change', applyLoopFromInputs);
  loopEnd.addEventListener('change', applyLoopFromInputs);

  tabOnlyToggle.addEventListener('change', () => {
    setTabOnly(tabOnlyToggle.checked);
  });

  guitarToggle.addEventListener('change', () => {
    setGuitarOn(guitarToggle.checked);
  });

  trackSelect.addEventListener('change', () => {
    setTrackIndex(Number(trackSelect.value));
  });

  let idleTimer = 0;
  function resetIdleTimer(): void {
    appEl.classList.remove('chrome-hidden');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (appEl.classList.contains('presentation')) appEl.classList.add('chrome-hidden');
    }, 2000);
  }

  presentationButton.addEventListener('click', () => {
    appEl.classList.toggle('presentation');
    const on = appEl.classList.contains('presentation');
    setPresentationMode(on);
    if (on) resetIdleTimer();
    else appEl.classList.remove('chrome-hidden');
  });
  appEl.addEventListener('mousemove', () => {
    if (appEl.classList.contains('presentation')) resetIdleTimer();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appEl.classList.contains('presentation')) {
      appEl.classList.remove('presentation', 'chrome-hidden');
      setPresentationMode(false);
    }
  });
}
