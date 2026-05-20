/** Wax-seal stamp sound — fires once per mount of the WaxSealStamp component.
 *  Two-layer ~150ms burst:
 *    1. Low thump  — 80Hz sine, quick attack, exponential decay
 *    2. Paper rustle — bandpass-filtered white noise, brief envelope
 *  Together they read as a physical wax press onto parchment.
 *  Designed for an existing AudioContext (cheaper if reused across the app). */

export function playWaxStamp(ctx: AudioContext, when: number = ctx.currentTime): void {
  const t = Math.max(when, ctx.currentTime);

  // Layer 1: low 80Hz thump
  const thumpOsc = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thumpOsc.type = 'sine';
  thumpOsc.frequency.setValueAtTime(80, t);
  thumpOsc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  thumpGain.gain.setValueAtTime(0, t);
  thumpGain.gain.linearRampToValueAtTime(0.5, t + 0.008);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  thumpOsc.connect(thumpGain).connect(ctx.destination);
  thumpOsc.start(t);
  thumpOsc.stop(t + 0.15);

  // Layer 2: paper rustle — short white-noise burst through a bandpass filter
  const noiseDuration = 0.12;
  const sampleCount = Math.floor(ctx.sampleRate * noiseDuration);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(2400, t);
  bandpass.Q.value = 1.2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, t);
  noiseGain.gain.linearRampToValueAtTime(0.18, t + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

  noise.connect(bandpass).connect(noiseGain).connect(ctx.destination);
  noise.start(t);
  noise.stop(t + noiseDuration);
}

/** Lazily build (and cache) an AudioContext. Returns null in non-browser envs. */
let cached: AudioContext | null = null;
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cached && cached.state !== 'closed') return cached;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  cached = new Ctor();
  return cached;
}
