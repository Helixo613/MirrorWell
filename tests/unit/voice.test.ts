import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '../../src/config/strings.ts';

let VoiceCoach: typeof import('../../src/session/voice.ts').VoiceCoach;

const cancel = vi.fn();
const speak = vi.fn();
const getVoices = vi.fn<() => SpeechSynthesisVoice[]>();
const defaultVoice = {
  name: 'Default local',
  lang: 'en-US',
  localService: true,
  default: true,
} as SpeechSynthesisVoice;

class MockSpeechSynthesisUtterance {
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(readonly text: string) {}
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  cancel.mockClear();
  speak.mockClear();
  getVoices.mockReset().mockReturnValue([defaultVoice]);
  vi.stubGlobal('speechSynthesis', { cancel, speak, getVoices, onvoiceschanged: null });
  vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
  VoiceCoach = (await import('../../src/session/voice.ts')).VoiceCoach;
  VoiceCoach.setEnabled(false);
});

afterEach(() => {
  VoiceCoach.setEnabled(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('VoiceCoach', () => {
  it('does not speak while disabled', () => {
    VoiceCoach.speak('cue', 10_000);

    expect(speak).not.toHaveBeenCalled();
  });

  it('coalesces a cue inside the gap to the latest cue instead of dropping it', () => {
    VoiceCoach.setEnabled(true);

    VoiceCoach.speak('first', 10_000);
    VoiceCoach.speak('second', 11_000);

    expect(speak).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1]?.[0]).toMatchObject({ text: 'second' });
  });

  it('speaks an urgent ease-back cue immediately inside the pacing gap', () => {
    VoiceCoach.setEnabled(true);

    VoiceCoach.speak('hold', 10_000);
    VoiceCoach.speak('ease back', 11_000, true);

    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1]?.[0]).toMatchObject({ text: 'ease back' });
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

  it('cancels a pending coalesced cue when disabled', () => {
    VoiceCoach.setEnabled(true);
    VoiceCoach.speak('first', 10_000);
    VoiceCoach.speak('pending', 11_000);

    VoiceCoach.setEnabled(false);
    vi.runAllTimers();

    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('silently ignores a missing speech synthesis API', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    VoiceCoach.setEnabled(true);

    expect(() => VoiceCoach.speak('cue', 30_000)).not.toThrow();
    expect(speak).not.toHaveBeenCalled();
  });

  it('never speaks with a non-local voice', () => {
    getVoices.mockReturnValue([
      { name: 'Cloud', lang: 'en-US', localService: false, default: true },
    ] as SpeechSynthesisVoice[]);
    VoiceCoach.setEnabled(true);

    VoiceCoach.speak('cue', 30_000);

    expect(speak).not.toHaveBeenCalled();
  });

  it('picks a local English voice when the async voice list arrives', () => {
    const fallback = { name: 'Default', lang: 'en-US', localService: true, default: true };
    const preferred = { name: 'Natural', lang: 'en-GB', localService: true, default: false };
    getVoices.mockReturnValue([]);
    VoiceCoach.setEnabled(true);

    getVoices.mockReturnValue([fallback, preferred] as SpeechSynthesisVoice[]);
    (
      globalThis.speechSynthesis as SpeechSynthesis & {
        onvoiceschanged: (() => void) | null;
      }
    ).onvoiceschanged?.();
    VoiceCoach.speak('cue', 30_000);

    expect(speak.mock.calls[0]?.[0]).toMatchObject({ voice: preferred });
  });

  it('uses the selected voice name and falls back when it is unavailable', () => {
    const first = { name: 'First', lang: 'en-US', localService: true, default: false };
    const selected = { name: 'Selected', lang: 'en-GB', localService: true, default: true };
    getVoices.mockReturnValue([first, selected] as SpeechSynthesisVoice[]);
    VoiceCoach.setVoiceName('Selected');
    VoiceCoach.setEnabled(true);
    (
      globalThis.speechSynthesis as SpeechSynthesis & {
        onvoiceschanged: (() => void) | null;
      }
    ).onvoiceschanged?.();

    VoiceCoach.speak('chosen', 30_000);
    VoiceCoach.setVoiceName('Missing');
    VoiceCoach.speak('fallback', 40_000);

    expect(speak.mock.calls[0]?.[0]).toMatchObject({ voice: selected });
    expect(speak.mock.calls[1]?.[0]).toMatchObject({ voice: first });
  });
});

describe('voice phrase variants', () => {
  it('is deterministic within a session and varies across session seeds', () => {
    const first = strings.session.voice.pick(strings.session.voice.raise, 'session-a', 0);

    expect(strings.session.voice.pick(strings.session.voice.raise, 'session-a', 0)).toBe(first);
    expect(strings.session.voice.pick(strings.session.voice.raise, 'session-b', 0)).not.toBe(first);
  });
});
