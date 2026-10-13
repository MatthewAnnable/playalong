/**
 * The harmony page's clock and click. There is no recording to follow yet,
 * so the chart's tempo is the clock: position is counted in beats from the
 * first beat of the song, negative during the count-in.
 *
 * Time comes from the AudioContext so the click and the picture can't drift
 * apart. Where audio isn't allowed to start (a browser that wants a click
 * first), it falls back to the page clock and stays silent.
 */

export type ClickMode = 'all' | 'countin' | 'off';

const LOOKAHEAD_S = 0.12;

export class Transport {
  private ctx: AudioContext | null = null;
  private useAudio = false;
  private anchorPos = 0; // beat position at anchorTime
  private anchorTime = 0; // seconds on the active clock
  private playing = false;
  private lastScheduled = -Infinity;
  private timer: number | null = null;
  private spb: number;

  constructor(
    tempo: number,
    private beatsPerBar: number,
    private totalBeats: number,
    public click: ClickMode,
  ) {
    this.spb = 60 / tempo;
  }

  setSong(tempo: number, beatsPerBar: number, totalBeats: number): void {
    this.stop();
    this.spb = 60 / tempo;
    this.beatsPerBar = beatsPerBar;
    this.totalBeats = totalBeats;
    this.anchorPos = 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private now(): number {
    return this.useAudio && this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** Where the song is, in beats, as heard. */
  position(): number {
    if (!this.playing) return this.anchorPos;
    // The picture follows what's heard, which is outputLatency behind currentTime.
    const latency = this.useAudio && this.ctx ? this.ctx.outputLatency || 0 : 0;
    const pos = this.anchorPos + (this.now() - latency - this.anchorTime) / this.spb;
    if (pos >= this.totalBeats + this.beatsPerBar) this.stop(this.totalBeats);
    return Math.min(pos, this.totalBeats + this.beatsPerBar);
  }

  private async ensureAudio(): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') {
        await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
      }
      this.useAudio = this.ctx.state === 'running';
    } catch {
      this.useAudio = false;
    }
  }

  /**
   * Plays from the start of the bar `fromBeat` is in, after `countInBars` of
   * count-in.
   */
  async play(fromBeat: number, countInBars: number): Promise<void> {
    await this.ensureAudio();
    const barStart = Math.max(0, Math.floor(fromBeat / this.beatsPerBar) * this.beatsPerBar);
    this.anchorPos = barStart - countInBars * this.beatsPerBar;
    this.anchorTime = this.now() + 0.08;
    this.lastScheduled = this.anchorPos - 1;
    this.playing = true;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(at?: number): void {
    if (this.playing) this.anchorPos = at ?? this.position();
    this.playing = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Jump while keeping playback running (or not). */
  seek(beat: number): void {
    const b = Math.max(0, Math.min(beat, this.totalBeats));
    if (this.playing) {
      this.anchorTime = this.now();
      this.anchorPos = b;
      this.lastScheduled = Math.ceil(b) - 1;
    } else {
      this.anchorPos = b;
    }
  }

  private schedule(): void {
    if (!this.playing || !this.useAudio || !this.ctx || this.click === 'off') return;
    const horizon = this.anchorPos + (this.ctx.currentTime + LOOKAHEAD_S - this.anchorTime) / this.spb;
    for (let b = Math.floor(this.lastScheduled) + 1; b <= horizon; b++) {
      this.lastScheduled = b;
      if (b >= this.totalBeats) continue;
      if (this.click === 'countin' && b >= 0) continue;
      const when = this.anchorTime + (b - this.anchorPos) * this.spb;
      if (when < this.ctx.currentTime) continue;
      const downbeat = ((b % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar === 0;
      this.tick(when, downbeat);
    }
  }

  private tick(when: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }
}
