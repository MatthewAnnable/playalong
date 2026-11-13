/**
 * A steady "where is the recording now" for drawing, one reading per frame.
 *
 * An <audio> element's currentTime moves in uneven steps (Safari's coarser than
 * Chrome's), and the highway used to restart from alphaTab's 20ms position
 * samples. Measured on Dancefloor in Chromium at 120fps: steps of 24-36 ticks a
 * frame where 28 was right, and the odd frame frozen or stepping back. On a full
 * screen board at 207 bpm, in Safari at 60fps, that reads as blur.
 *
 * So the drawn time runs on the frame clock at the playback rate, and is only
 * nudged towards the audio's own time (a large gap, such as a seek, snaps).
 * It never moves backwards while playing.
 */
const SNAP_SECONDS = 0.15;
/**
 * Below this gap the audio time is just its own unevenness (its steps are 10-30 ms),
 * so it is pulled in only slowly; above it, quickly. "Slowly/quickly" = about 63%
 * of the gap closed within that many ms.
 */
const NOISE_SECONDS = 0.04;
const SETTLE_SLOW_MS = 2000;
const SETTLE_FAST_MS = 150;

export class SmoothClock {
  private out = 0;
  private lastNow = 0;
  private running = false;

  /** `audioSeconds` from the audio element, `rate` real seconds of recording per second. */
  read(audioSeconds: number, rate: number, playing: boolean, nowMs: number): number {
    if (!playing || !this.running) {
      this.running = playing;
      this.out = audioSeconds;
      this.lastNow = nowMs;
      return audioSeconds;
    }
    const dt = Math.max(0, Math.min(nowMs - this.lastNow, 100));
    this.lastNow = nowMs;
    const predicted = this.out + (dt / 1000) * rate;
    const error = audioSeconds - predicted;
    if (Math.abs(error) > SNAP_SECONDS) {
      this.out = audioSeconds;
    } else {
      const pull = 1 - Math.exp(-dt / (Math.abs(error) < NOISE_SECONDS ? SETTLE_SLOW_MS : SETTLE_FAST_MS));
      this.out = Math.max(this.out, predicted + error * pull);
    }
    return this.out;
  }

  reset(): void {
    this.running = false;
  }
}
