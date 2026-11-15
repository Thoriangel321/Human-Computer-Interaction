import { getAudioContext } from './assets.js';

let initialized = false;

export function initAudio(): void {
  initialized = true;
}

export function playLaserSound(): void {
  if (!initialized) return;
  const ctx = getAudioContext();
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(780, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.11);
}