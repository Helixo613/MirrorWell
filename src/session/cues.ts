import { thresholds } from '@/config/thresholds';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioContext;
}

export function playRepTick(enabled: boolean): void {
  if (!enabled) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

export function playEaseOffTone(enabled: boolean): void {
  if (!enabled) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.2);
  gain.gain.value = 0.1;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

export function playQualityChime(enabled: boolean): void {
  if (!enabled) {
    return;
  }
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 523;
  gain.gain.value = 0.06;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

export function pulseRepHaptic(enabled: boolean): void {
  if (!enabled || typeof navigator === 'undefined' || !navigator.vibrate) {
    return;
  }
  navigator.vibrate(thresholds.session.repHapticMs);
}

export function pulseEaseOffHaptic(enabled: boolean): void {
  if (!enabled || typeof navigator === 'undefined' || !navigator.vibrate) {
    return;
  }
  navigator.vibrate([40, 30, 40]);
}
