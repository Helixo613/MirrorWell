import { thresholds } from '@/config/thresholds';

let lastSpokeAt = Number.NEGATIVE_INFINITY;
let enabled = false;
let voiceName: string | undefined;
let voice: SpeechSynthesisVoice | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function localVoices(): SpeechSynthesisVoice[] {
  return globalThis.speechSynthesis?.getVoices().filter((candidate) => candidate.localService) ?? [];
}

function refreshVoice(): void {
  const voices = localVoices();
  voice =
    voices.find((candidate) => candidate.name === voiceName) ??
    voices.find(
      (candidate) => candidate.lang.startsWith('en') && !candidate.default,
    ) ??
    voices.find((candidate) => candidate.lang.startsWith('en')) ??
    voices[0] ??
    null;
}

function clearPending(): void {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
}

function speakNow(text: string, now: number): void {
  const synth = globalThis.speechSynthesis;
  if (!enabled || !synth || !voice) return;
  clearPending();
  lastSpokeAt = now;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.voice = voice;
  synth.speak(utterance);
}

export const VoiceCoach = {
  setEnabled(value: boolean): void {
    enabled = value;
    const synth = globalThis.speechSynthesis;
    if (!value) {
      clearPending();
      lastSpokeAt = Number.NEGATIVE_INFINITY;
      synth?.cancel();
      return;
    }
    if (!synth) return;
    refreshVoice();
    synth.onvoiceschanged = refreshVoice;
  },
  setVoiceName(value: string | undefined): void {
    voiceName = value;
    refreshVoice();
  },
  onVoicesChanged(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    const synth = globalThis.speechSynthesis;
    if (!synth) {
      listener([]);
      return () => {};
    }
    const notify = () => listener(localVoices());
    notify();
    synth.addEventListener?.('voiceschanged', notify);
    return () => synth.removeEventListener?.('voiceschanged', notify);
  },
  speak(text: string, now: number = performance.now(), urgent = false): void {
    const synth = globalThis.speechSynthesis;
    if (!enabled || !synth) return;
    if (urgent || now - lastSpokeAt >= thresholds.feedback.voiceMinGapMs) {
      speakNow(text, now);
      return;
    }
    clearPending();
    const scheduledAt = lastSpokeAt + thresholds.feedback.voiceMinGapMs;
    pendingTimer = setTimeout(
      () => speakNow(text, scheduledAt),
      scheduledAt - now,
    );
  },
};
