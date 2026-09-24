import {
  nudgeBar,
  onStateChange,
  seekToSeconds,
  setLoop,
  setSpeed,
  setTabOnly,
  setTrackIndex,
  setGuitarOn,
  setPresentationMode,
  togglePlay,
  type EngineState,
} from '../engine/alphatab';
import { registerAction } from './shortcuts';

const playButton = document.querySelector<HTMLButtonElement>('#play-button')!;
const playButtonLabel = document.querySelector<HTMLSpanElement>('#play-button-label')!;
const scrubber = document.querySelector<HTMLInputElement>('#scrubber')!;
const timeCurrent = document.querySelector<HTMLSpanElement>('#time-current')!;
const timeTotal = document.querySelector<HTMLSpanElement>('#time-total')!;
const barCurrent = document.querySelector<HTMLSpanElement>('#bar-current')!;
const barTotal = document.querySelector<HTMLSpanElement>('#bar-total')!;
const speedSlider = document.querySelector<HTMLInputElement>('#speed-slider')!;
const speedValue = document.querySelector<HTMLSpanElement>('#speed-value')!;
const speedDownButton = document.querySelector<HTMLButtonElement>('#speed-down-button')!;
const speedUpButton = document.querySelector<HTMLButtonElement>('#speed-up-button')!;
const loopChip = document.querySelector<HTMLDivElement>('#loop-chip')!;
const loopClearButton = document.querySelector<HTMLButtonElement>('#loop-clear-button')!;
const loopToggle = document.querySelector<HTMLInputElement>('#loop-toggle')!;
const loopStart = document.querySelector<HTMLInputElement>('#loop-start')!;
const loopEnd = document.querySelector<HTMLInputElement>('#loop-end')!;
const tabOnlyToggle = document.querySelector<HTMLInputElement>('#tab-only-toggle')!;
const guitarToggleRow = document.querySelector<HTMLLabelElement>('#guitar-toggle-row')!;
const guitarToggle = document.querySelector<HTMLInputElement>('#guitar-toggle')!;
const trackSelect = document.querySelector<HTMLSelectElement>('#track-select')!;
const presentationButton = document.querySelector<HTMLButtonElement>('#presentation-button')!;
const appEl = document.querySelector<HTMLElement>('#app')!;

let currentState: Readonly<EngineState>;
let isScrubbing = false;
let durationSec = 0;
const SCRUBBER_RESOLUTION = 1000;

/**
 * Only touches the DOM when the text actually changed. The transport is
 * repainted 50 times a second from the position loop, and rewriting a label
 * that often replaces the text node under the pointer — which is the sort of
 * thing that makes a press land on nothing.
 */
function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

let dockTimer = 0;
let lastPointer: { x: number; y: number } | null = null;
/** Where the pointer was when the dock last hid — mouse moves are measured from here. */
let hiddenAt: { x: number; y: number } | null = null;

function isPresentation(): boolean {
  return appEl.classList.contains('presentation');
}

function isRunning(): boolean {
  return !!currentState && (currentState.isPlaying || currentState.countingIn);
}

function isHidden(): boolean {
  return appEl.classList.contains('chrome-hidden');
}

function hideDock(): void {
  window.clearTimeout(dockTimer);
  if (!isPresentation() || !isRunning()) return;
  hiddenAt = lastPointer;
  appEl.classList.add('chrome-hidden');
}

/** Shows the dock; while the song runs it hides again after DOCK_IDLE_HIDE_MS, and while paused it stays. */
function showDock(): void {
  appEl.classList.remove('chrome-hidden');
  scheduleDockHide();
}

function scheduleDockHide(): void {
  window.clearTimeout(dockTimer);
  if (isPresentation() && isRunning()) dockTimer = window.setTimeout(hideDock, DOCK_IDLE_HIDE_MS);
}

/** How long the presentation dock stays up after the last sign of life, while the song is running. */
const DOCK_IDLE_HIDE_MS = 1000;
/**
 * How far the pointer has to travel from where it was when the dock hid
 * before a mouse move brings it back. A hand resting on the mouse after
 * pressing Play jiggles it a few pixels, and that alone was enough to hold
 * the dock over the bottom strings while the song started.
 */
const DOCK_WAKE_DISTANCE_PX = 30;
/**
 * Between the count-in's last click and the audio starting there is a moment
 * where the song is neither counting in nor playing. Waiting this long before
 * treating that as "stopped" keeps the dock from flashing up at the downbeat.
 */
const DOCK_STOP_GRACE_MS = 250;

export function initControls(): void {
  let wasRunning = false;
  let stopTimer = 0;
  onStateChange((state) => {
    currentState = state;
    // The dock gets out of the way the moment a song starts (count-in
    // included), and comes back to stay when it stops.
    const running = state.isPlaying || state.countingIn;
    if (running && !wasRunning) {
      window.clearTimeout(stopTimer);
      hideDock();
    } else if (!running && wasRunning) {
      stopTimer = window.setTimeout(() => {
        if (!isRunning()) showDock();
      }, DOCK_STOP_GRACE_MS);
    }
    wasRunning = running;
    setText(playButtonLabel, state.countingIn ? 'Counting in…' : state.isPlaying ? 'Pause' : 'Play');
    if (playButton.disabled === state.ready) playButton.disabled = !state.ready;

    if (!isScrubbing) {
      scrubber.max = String(SCRUBBER_RESOLUTION);
      const ratio = state.durationSec > 0 ? state.currentTimeSec / state.durationSec : 0;
      scrubber.value = String(Math.round(ratio * SCRUBBER_RESOLUTION));
    }
    durationSec = state.durationSec;
    setText(timeCurrent, formatTime(state.currentTimeSec));
    setText(timeTotal, formatTime(state.durationSec));

    setText(barCurrent, String(state.currentBar));
    setText(barTotal, String(state.totalBars));

    speedSlider.value = String(state.speed);
    setText(speedValue, `${state.speed}%`);

    loopToggle.checked = state.loopEnabled;
    loopChip.classList.toggle('is-disabled', !state.loopEnabled);
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

  // The transport's primary control fires on press, not on a completed click.
  // A click needs the press and the release to agree on a target, and this
  // button sits under a label that the position loop keeps rewriting — pressing
  // on the word itself was being swallowed. A press is also what a footswitch
  // or a tap on glass feels like it should do.
  let lastPress = 0;
  playButton.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    lastPress = performance.now();
    void togglePlay();
  });
  playButton.addEventListener('click', () => {
    // Keyboard activation (Enter or Space) arrives as a click with no press
    // in front of it; a pointer's own click is swallowed as a duplicate.
    if (performance.now() - lastPress < 700) return;
    void togglePlay();
  });

  // Dragging the progress bar moves the score and the highway with the thumb,
  // so you can see where you are landing before letting go. The seek itself is
  // throttled to one a frame — the raw input stream fires far faster than the
  // audio element can be re-positioned.
  let scrubFrame = 0;
  function previewScrub(): void {
    if (scrubFrame) return;
    scrubFrame = requestAnimationFrame(() => {
      scrubFrame = 0;
      const ratio = Number(scrubber.value) / SCRUBBER_RESOLUTION;
      seekToSeconds(ratio * durationSec);
    });
  }
  function endScrub(): void {
    if (!isScrubbing) return;
    isScrubbing = false;
    if (scrubFrame) cancelAnimationFrame(scrubFrame);
    scrubFrame = 0;
    const ratio = Number(scrubber.value) / SCRUBBER_RESOLUTION;
    seekToSeconds(ratio * durationSec);
  }

  scrubber.addEventListener('pointerdown', () => {
    isScrubbing = true;
  });
  scrubber.addEventListener('input', () => {
    const ratio = Number(scrubber.value) / SCRUBBER_RESOLUTION;
    timeCurrent.textContent = formatTime(ratio * durationSec);
    if (isScrubbing) previewScrub();
  });
  // Keyboard use of the slider never sets isScrubbing, so 'change' still has to
  // seek; pointer use is finished by the pointer coming up anywhere on screen.
  scrubber.addEventListener('change', () => {
    if (isScrubbing) {
      endScrub();
      return;
    }
    const ratio = Number(scrubber.value) / SCRUBBER_RESOLUTION;
    seekToSeconds(ratio * durationSec);
  });
  window.addEventListener('pointerup', endScrub);
  window.addEventListener('pointercancel', endScrub);

  speedSlider.addEventListener('input', () => {
    setSpeed(Number(speedSlider.value));
  });

  speedDownButton.addEventListener('click', () => setSpeed(Math.max(Number(speedSlider.value) - 5, 50)));
  speedUpButton.addEventListener('click', () => setSpeed(Math.min(Number(speedSlider.value) + 5, 120)));

  function applyLoopFromInputs(): void {
    setLoop(Number(loopStart.value) || 1, Number(loopEnd.value) || 1, loopToggle.checked);
  }
  loopToggle.addEventListener('change', applyLoopFromInputs);
  loopStart.addEventListener('change', applyLoopFromInputs);
  loopEnd.addEventListener('change', applyLoopFromInputs);
  loopClearButton.addEventListener('click', () => setLoop(Number(loopStart.value) || 1, Number(loopEnd.value) || 1, false));
  loopChip.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
    loopToggle.checked = !loopToggle.checked;
    applyLoopFromInputs();
  });

  tabOnlyToggle.addEventListener('change', () => {
    setTabOnly(tabOnlyToggle.checked);
  });

  guitarToggle.addEventListener('change', () => {
    setGuitarOn(guitarToggle.checked);
  });

  trackSelect.addEventListener('change', () => {
    setTrackIndex(Number(trackSelect.value));
  });

  function togglePresentation(force?: boolean): void {
    const on = force ?? !appEl.classList.contains('presentation');
    appEl.classList.toggle('presentation', on);
    setPresentationMode(on);
    if (on) showDock();
    else appEl.classList.remove('chrome-hidden');
  }

  presentationButton.addEventListener('click', () => togglePresentation());
  // Any sign of life brings the dock back: pressing a faded control has to
  // count, or the press that wakes the dock is the press that gets swallowed.
  // A moved mouse only counts once it has really moved (DOCK_WAKE_DISTANCE_PX).
  appEl.addEventListener('pointerdown', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    // The play button starts the song on this same pointerdown, before it
    // bubbles up here — waking the dock now would undo the hide that playing
    // just did. Starting and stopping already hide and show it.
    if (playButton.contains(e.target as Node)) {
      if (isHidden()) hiddenAt = lastPointer;
      return;
    }
    showDock();
  });
  for (const event of ['keydown', 'wheel'] as const) {
    appEl.addEventListener(event, () => showDock());
  }
  appEl.addEventListener('mousemove', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    if (!isHidden()) {
      scheduleDockHide();
      return;
    }
    // Hidden before the pointer's position was ever known: this move is
    // where it rests, not a move away from it.
    if (!hiddenAt) {
      hiddenAt = lastPointer;
      return;
    }
    if (Math.hypot(e.clientX - hiddenAt.x, e.clientY - hiddenAt.y) > DOCK_WAKE_DISTANCE_PX) showDock();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appEl.classList.contains('presentation')) togglePresentation(false);
  });

  registerAction('playPause', () => void togglePlay());
  registerAction('barBack', () => nudgeBar(-1));
  registerAction('barForward', () => nudgeBar(1));
  registerAction('loopStart', () => setLoop(currentState.currentBar, currentState.loopEndBar, true));
  registerAction('loopEnd', () => setLoop(currentState.loopStartBar, currentState.currentBar, true));
  registerAction('loopToggle', () =>
    setLoop(currentState.loopStartBar, currentState.loopEndBar, !currentState.loopEnabled),
  );
  registerAction('speedDown', () => setSpeed(Math.max(currentState.speed - 5, 50)));
  registerAction('speedUp', () => setSpeed(Math.min(currentState.speed + 5, 120)));
  registerAction('speedReset', () => setSpeed(100));
  registerAction('guitarToggle', () => setGuitarOn(!currentState.guitarOn));
  registerAction('presentationToggle', () => togglePresentation());
  registerAction('nextTrack', () => {
    if (currentState.trackNames.length === 0) return;
    setTrackIndex((currentState.trackIndex + 1) % currentState.trackNames.length);
  });
}
