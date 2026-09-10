let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function click(ctx: AudioContext, atTime: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1500 : 1000;
  gain.gain.setValueAtTime(0.2, atTime);
  gain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(atTime);
  osc.stop(atTime + 0.06);
}

/**
 * Plays one bar of metronome clicks at the given tempo, resolving when the
 * bar is done so playback can start exactly on the next beat. We generate
 * this ourselves rather than using alphaTab's metronome because alphaTab
 * never owns real audio output in external-media mode (see build plan 5.3).
 */
export async function playCountIn(beatsPerBar: number, bpm: number): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  const secondsPerBeat = 60 / bpm;
  const start = ctx.currentTime + 0.05;
  for (let i = 0; i < beatsPerBar; i++) {
    click(ctx, start + i * secondsPerBeat, i === 0);
  }
  const totalMs = (beatsPerBar * secondsPerBeat + 0.05) * 1000;
  await new Promise((resolve) => setTimeout(resolve, totalMs));
}
