import { getPositionSnapshot, onStateChange, setScoreStripShare } from '../engine/alphatab';

/**
 * A silent video of the song being played: above the board in the normal
 * highway view, and filling the top half in presentation, over the board or
 * the scrolling score. It has no clock of its own:
 * every frame it is put where the recording is, at the recording's speed,
 * so play, pause, scrubbing, loops and slow practice all carry it along.
 *
 * A song can have a video per track (the acoustic part, the solo), and a
 * video can cover just part of the song: it only shows while the recording is
 * inside the stretch it was filmed for, and the board has the stage the rest
 * of the time. So a solo needs filming only for the solo.
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

export interface SongVideo {
  url: string;
  /** Where in the recording the video's first frame belongs, in seconds (+ shows it later). */
  offsetSeconds?: number;
  /** How far down the frame to keep when cropping, in %. */
  focusY?: number;
  /** The track it shows with (0 is the first); without one it shows with every track. */
  track?: number;
}

let videos: SongVideo[] = [];
let trackIndex = 0;
let offsetSec = 0;
let frameId = 0;
let hasVideo = false;

onStateChange((state) => {
  if (state.trackIndex !== trackIndex) {
    trackIndex = state.trackIndex;
    chooseVideo();
  }
});

/** Loads the video for the track now showing, or none. */
function chooseVideo(): void {
  const chosen = videos.find((v) => v.track === trackIndex) ?? videos.find((v) => v.track === undefined);
  if (!chosen) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    return;
  }
  offsetSec = chosen.offsetSeconds ?? 0;
  video.style.objectPosition = `50% ${chosen.focusY ?? 50}%`;
  if (video.getAttribute('src') !== chosen.url) video.src = chosen.url;
}

/** Whether the recording is inside the stretch the video covers (always, until its length is known). */
function inVideoSpan(audioSeconds: number): boolean {
  const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
  return audioSeconds >= offsetSec - 0.05 && audioSeconds <= offsetSec + duration;
}

/** OBS has the live camera up there instead, and the normal score view is a page with no room for it. */
function isShowing(audioSeconds: number): boolean {
  return (
    !!video.getAttribute('src') &&
    inVideoSpan(audioSeconds) &&
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
  if (has === hasVideo && appEl.classList.contains('has-video') === has) return;
  hasVideo = has;
  appEl.classList.toggle('has-video', has);
  setScoreStripShare(has ? boardFraction() : 1);
}

function follow(): void {
  frameId = requestAnimationFrame(follow);
  const { audioSeconds, playbackRate, isPlaying } = getPositionSnapshot();
  // Outside the filmed stretch (or on a track without a video) the board
  // takes the stage back, as for a song with no video at all.
  setHasVideo(!!video.getAttribute('src') && inVideoSpan(audioSeconds));
  const showing = isShowing(audioSeconds);
  video.hidden = !showing;
  if (!showing) {
    if (!video.paused) video.pause();
    return;
  }

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

/** Shows these videos for the song now open, each with its own track (see SongVideo). */
export function setSongVideos(list: SongVideo[]): void {
  videos = list;
  if (videos.length === 0) {
    clearSongVideo();
    return;
  }
  chooseVideo();
  if (!frameId) frameId = requestAnimationFrame(follow);
}

/** One video for every track. `focusY` is how far down the frame to keep when cropping, in %. */
export function setSongVideo(url: string, offsetSeconds = 0, focusY = 50): void {
  setSongVideos([{ url, offsetSeconds, focusY }]);
}

/** A song with no video: the top half goes back to plain stage. */
export function clearSongVideo(): void {
  videos = [];
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  setHasVideo(false);
}
