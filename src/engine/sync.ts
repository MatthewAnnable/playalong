/**
 * Same-origin link between the OBS browser source and the remote control
 * tab (build plan 5.9). An OBS Browser Source can't receive keystrokes, so
 * the remote page owns the transport and the OBS page just follows.
 */
export type SyncMessage =
  | { type: 'hello' }
  | { type: 'song'; buffer: ArrayBuffer; filename: string }
  | {
      type: 'position';
      tick: number;
      ticksPerSecond: number;
      playbackRate: number;
      isPlaying: boolean;
      audioSeconds: number;
      at: number;
    }
  | { type: 'track'; index: number }
  | { type: 'audioMaster'; master: 'remote' | 'obs' };

const CHANNEL_NAME = 'playalong';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function send(message: SyncMessage): void {
  getChannel().postMessage(message);
}

export function subscribe(listener: (message: SyncMessage) => void): () => void {
  const handler = (e: MessageEvent<SyncMessage>) => listener(e.data);
  getChannel().addEventListener('message', handler);
  return () => getChannel().removeEventListener('message', handler);
}

/**
 * Follower-side clock. Position messages arrive every ~50ms; between them
 * the tick is extrapolated from wall time so the highway still runs at
 * 60fps. Uses Date.now() rather than performance.now() because the two
 * pages don't share a time origin.
 */
export class RemoteClock {
  private tick = 0;
  private ticksPerSecond = 0;
  private playbackRate = 1;
  private isPlaying = false;
  private at = Date.now();

  update(message: Extract<SyncMessage, { type: 'position' }>): void {
    this.tick = message.tick;
    this.ticksPerSecond = message.ticksPerSecond;
    this.playbackRate = message.playbackRate;
    this.isPlaying = message.isPlaying;
    this.at = message.at;
  }

  currentTick(): number {
    if (!this.isPlaying) return this.tick;
    const elapsedSeconds = (Date.now() - this.at) / 1000;
    return this.tick + elapsedSeconds * this.ticksPerSecond * this.playbackRate;
  }
}
