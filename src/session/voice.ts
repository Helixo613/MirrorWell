import { thresholds } from '@/config/thresholds';

let lastSpokeAt = 0;
let enabled = false;

export const VoiceCoach = {
  setEnabled(value: boolean): void {
    enabled = value;
    if (!value) globalThis.speechSynthesis?.cancel();
  },
  speak(text: string, now: number = performance.now()): void {
    const synth = globalThis.speechSynthesis;
    if (!enabled || !synth) return;
    if (now - lastSpokeAt < thresholds.feedback.voiceMinGapMs) return;
    lastSpokeAt = now;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    synth.speak(utterance);
  },
};
