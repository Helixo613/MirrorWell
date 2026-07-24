import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let VoiceCoach: typeof import('../../src/session/voice.ts').VoiceCoach;

const cancel = vi.fn();
const speak = vi.fn();

class MockSpeechSynthesisUtterance {
  rate = 1;

  constructor(readonly text: string) {}
}

beforeEach(async () => {
  vi.resetModules();
  VoiceCoach = (await import('../../src/session/voice.ts')).VoiceCoach;
  cancel.mockClear();
  speak.mockClear();
  vi.stubGlobal('speechSynthesis', { cancel, speak });
  vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
  VoiceCoach.setEnabled(false);
});

afterEach(() => {
  VoiceCoach.setEnabled(false);
  vi.unstubAllGlobals();
});

describe('VoiceCoach', () => {
  it('does not speak while disabled', () => {
    VoiceCoach.speak('cue', 10_000);

    expect(speak).not.toHaveBeenCalled();
  });

  it('enforces the minimum gap between utterances', () => {
    VoiceCoach.setEnabled(true);

    VoiceCoach.speak('first', 10_000);
    VoiceCoach.speak('second', 11_000);

    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous utterance before speaking locally', () => {
    const order: string[] = [];
    cancel.mockImplementation(() => order.push('cancel'));
    speak.mockImplementation((utterance: MockSpeechSynthesisUtterance) => {
      order.push(`speak:${utterance.text}:${utterance.rate}`);
    });
    VoiceCoach.setEnabled(true);

    VoiceCoach.speak('Hold there', 20_000);

    expect(order).toEqual(['cancel', 'speak:Hold there:0.95']);
  });

  it('silently ignores a missing speech synthesis API', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    VoiceCoach.setEnabled(true);

    expect(() => VoiceCoach.speak('cue', 30_000)).not.toThrow();
    expect(speak).not.toHaveBeenCalled();
  });
});
