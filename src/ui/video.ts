import { getPositionSnapshot, setScoreStripShare } from '../engine/alphatab';

/**
 * A silent video of the song being played: above the board in the normal
 * highway view, and filling the top half in presentation, over the board or
 * the scrolling score. It has no clock of its own:
 * every frame it is put where the recording is, at the recording's speed,
 * so play, pause, scrubbing, loops and slow practice all carry it along.
 */

const video = document.querySelector<HTMLVideoElement>('#song-video')!;
const appEl = document.querySelector<HTMLElement>('#app')!;
const highwaySurface = document.querySelector<HTMLDivElement>('#highway')!;

/** Past this the video is moved outright; under it, it's eased back by speed alone (a seek costs a visible stall). */
const SEEK_DRIFT_SEC = 0.3;
/** Close enough: under this, the video is left alone. */
const SETTLED_DRIFT_SEC = 0.03;
/** Most the speed is bent while easing back, so the correction never looks like slow motion. */
const MAX_NUDGE = 0.08;

let offsetSec = 0;
let frameId = 0;

/** OBS has the live camera up there instead, and the normal score view is a page with no room for it. */
function isShowing(): boolean {
  return (
    !!video.getAttribute('src') &&
    !appEl.classList.contains('obs') &&
    (appEl.classList.contains('presentation') || !highwaySurface.hidden)
  );
}

/** The score strip shares the screen with the video in presentation, at the board's share. */
function boardFraction(): number {
  const value = Number(getComputedStyle(document.documentElement).getPropertyValue('--board-fraction'));
  return value > 0 ? value : 0.5;
}

function setHasVideo(has: boolean): void {
  appEl.classList.toggle('has-video', has);
  setScoreStripShare(has ? boardFraction() : 1);
}

function follow(): void {
  frameId = requestAnimationFrame(follow);
  const showing = isShowing();
  video.hidden = !showing;
  if (!showing) {
    if (!video.paused) video.pause();
    return;
  }

  const { audioSeconds, playbackRate, isPlaying } = getPositionSnapshot();
  const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
  const target = Math.min(Math.max(audioSeconds - offsetSec, 0), duration);
  const drift = video.currentTime - target;

  if (!isPlaying || target >= duration) {
    if (!video.paused) video.pause();
    if (Math.abs(drift) > SETTLED_DRIFT_SEC && !video.seeking) video.currentTime = target;
    return;
  }

  if (Math.abs(drift) > SEEK_DRIFT_SEC) {
    if (!video.seeking) video.currentTime = target;
    video.playbackRate = playbackRate;
  } else if (Math.abs(drift) > SETTLED_DRIFT_SEC) {
    const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -drift));
    video.playbackRate = playbackRate * (1 + nudge);
  } else {
    video.playbackRate = playbackRate;
  }
  if (video.paused) void video.play().catch(() => {});
}

/** Shows this video for the song now open. `focusY` is how far down the frame to keep when cropping, in %. */
export function setSongVideo(url: string, offsetSeconds = 0, focusY = 50): void {
  offsetSec = offsetSeconds;
  video.style.objectPosition = `50% ${focusY}%`;
  if (video.getAttribute('src') !== url) video.src = url;
  setHasVideo(true);
  if (!frameId) frameId = requestAnimationFrame(follow);
}

/** A song with no video: the top half goes back to plain stage. */
export function clearSongVideo(): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  setHasVideo(false);
}
