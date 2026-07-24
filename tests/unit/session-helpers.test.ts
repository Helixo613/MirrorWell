import { describe, expect, it } from 'vitest';
import { MirrorWellError } from '../../src/data/errors.ts';
import type { AppSettings } from '../../src/data/schema.ts';
import {
  REST_EXTEND_SECONDS,
  advanceArcPhase,
  advanceBar,
  audioCueEnabled,
  coachPhaseFor,
  demoComfortableMax,
  hapticCueEnabled,
  restRemainingSeconds,
} from '../../src/screens/session/sessionHelpers.ts';
import { resolveSessionStatus } from '../../src/lib/sessionStatus.ts';
import { strings } from '../../src/config/strings.ts';
import { thresholds } from '../../src/config/thresholds.ts';

function settings(overrides: Partial<AppSettings>): AppSettings {
  return {
    settingsId: 'singleton',
    highContrast: false,
    textScale: 1,
    hapticsEnabled: true,
    audioCuesEnabled: true,
    voiceCoachEnabled: false,
    reducedFacePreview: false,
    trendGranularity: 'monthly',
    showAffectedSideMarker: true,
    caregiverViewEnabled: false,
    remindersEnabled: false,
    reminderTime: '09:00',
    ...overrides,
  };
}

describe('demoComfortableMax — the demo baseline invariant', () => {
  it('returns the positive peak activation of the gentle rep', () => {
    expect(demoComfortableMax([0.1, 0.42, 0.3])).toBe(0.42);
  });

  it('throws NO_BASELINE when the gentle rep captured no frames (faceless device)', () => {
    // Math.max(...[]) === -Infinity — a demo that measured nothing must fail loudly, not sail
    // through MetricEngine.setBaseline as comfortableMax <= 0.
    try {
      demoComfortableMax([]);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MirrorWellError);
      expect((err as MirrorWellError).code).toBe('NO_BASELINE');
    }
  });

  it('throws NO_BASELINE when the peak is zero or negative (no measurable movement)', () => {
    expect(() => demoComfortableMax([0])).toThrow(MirrorWellError);
    expect(() => demoComfortableMax([-0.2, -0.1])).toThrow(MirrorWellError);
  });

  it('applies the floor RELATIVE to the resting activation (neutral rebase)', () => {
    // A pair with a nonzero neutral read (eyeBlink-like): a peak barely above rest is a
    // held-still capture even though it clears the absolute floor.
    expect(() => demoComfortableMax([0.32, 0.34], 0.3)).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
    expect(demoComfortableMax([0.4], 0.3)).toBe(0.4);
  });

  it('throws NO_BASELINE when the peak is below activationFloor (a held-still face → noise peak)', () => {
    // A noise-level comfortableMax makes effortIndex = activation / comfortableMax read pure
    // sensor noise as full-effort movement — phantom reps at a timer-like cadence.
    expect(() => demoComfortableMax([0.01, 0.02, 0.04])).toThrow(
      expect.objectContaining({ code: 'NO_BASELINE' }),
    );
    // At the floor exactly is accepted (>= activationFloor, mirroring the SI activation rule).
    expect(demoComfortableMax([0.05])).toBe(0.05);
  });

  it('throws NO_BASELINE on non-finite input', () => {
    expect(() => demoComfortableMax([Number.NEGATIVE_INFINITY])).toThrow(MirrorWellError);
    expect(() => demoComfortableMax([Number.NaN])).toThrow(MirrorWellError);
  });
});

describe('coachPhaseFor — live coaching phase from the smoothed effortIndex', () => {
  it('maps below-zone to raise, in-zone (edges inclusive) to hold, above-zone to easeBack', () => {
    const [low, high] = thresholds.metrics.effortTargetZone;
    expect(coachPhaseFor(0)).toBe('raise');
    expect(coachPhaseFor(low - 0.01)).toBe('raise');
    expect(coachPhaseFor(low)).toBe('hold');
    expect(coachPhaseFor(high)).toBe('hold');
    expect(coachPhaseFor(high + 0.01)).toBe('easeBack');
    // Over-effort clamps only the DISPLAY (renderer); the coaching phase must still say ease back.
    expect(coachPhaseFor(1.5)).toBe('easeBack');
  });
});

describe('advanceBar — THE frozen-bar guard (a moving bar on a bad frame is a critical defect)', () => {
  it('holds the displayed value EXACTLY on a frozen (non-OK) frame, whatever the target', () => {
    expect(advanceBar(true, 0.7, 0.2, 0.2)).toBe(0.7);
    expect(advanceBar(true, 0, 0.9, 0.2)).toBe(0);
    expect(advanceBar(true, 0.42, 0.42, 0.2)).toBe(0.42);
    // Repeated frozen frames never drift — the pixel-diff invariant, proven arithmetically.
    let v = 0.55;
    for (let i = 0; i < 100; i += 1) v = advanceBar(true, v, 0.1, 0.2);
    expect(v).toBe(0.55);
  });

  it('eases toward the target only on an OK frame', () => {
    expect(advanceBar(false, 0, 1, 0.2)).toBeCloseTo(0.2);
    const moved = advanceBar(false, 0.7, 0.2, 0.2);
    expect(moved).toBeLessThan(0.7);
    expect(moved).toBeGreaterThan(0.2);
  });
});

describe('advanceArcPhase — the guide arc is held on a frozen frame too', () => {
  it('holds phase on a frozen frame', () => {
    expect(advanceArcPhase(true, 0.5, 0.012)).toBe(0.5);
  });

  it('advances and wraps within [0, 1) on an OK frame', () => {
    expect(advanceArcPhase(false, 0.99, 0.02)).toBeCloseTo(0.01);
  });
});

describe('restRemainingSeconds', () => {
  it('rounds up whole seconds remaining until the deadline', () => {
    expect(restRemainingSeconds(10_000, 7_400)).toBe(3); // 2.6s -> 3
    expect(restRemainingSeconds(10_000, 10_000)).toBe(0);
  });

  it('never goes negative once the deadline has passed', () => {
    expect(restRemainingSeconds(10_000, 12_000)).toBe(0);
  });

  it('a +30 s extension adds thirty seconds of countdown', () => {
    const now = 1_000;
    const before = restRemainingSeconds(now + 5_000, now);
    const after = restRemainingSeconds(now + 5_000 + REST_EXTEND_SECONDS * 1000, now);
    expect(after - before).toBe(REST_EXTEND_SECONDS);
  });
});

describe('cue-channel gating (ease-off is never colour-only, but neither cue is guaranteed)', () => {
  it('audio cue opens only when audioCuesEnabled', () => {
    expect(audioCueEnabled(settings({ audioCuesEnabled: true }))).toBe(true);
    expect(audioCueEnabled(settings({ audioCuesEnabled: false }))).toBe(false);
    expect(audioCueEnabled(null)).toBe(false);
  });

  it('haptic cue opens only when hapticsEnabled AND the device supports vibration', () => {
    expect(hapticCueEnabled(settings({ hapticsEnabled: true }), true)).toBe(true);
    expect(hapticCueEnabled(settings({ hapticsEnabled: true }), false)).toBe(false);
    expect(hapticCueEnabled(settings({ hapticsEnabled: false }), true)).toBe(false);
    expect(hapticCueEnabled(null, true)).toBe(false);
  });
});

describe('resolveSessionStatus — one visible status at a time (quality > ease-off)', () => {
  it('shows the quality banner on any non-OK state, even during ease-off', () => {
    expect(resolveSessionStatus('FACE_LOST', true, null)).toEqual({
      message: strings.quality.FACE_LOST,
      variant: 'safety',
    });
  });

  it('shows the ease-off message (amber safety variant) when quality is OK and easing off', () => {
    expect(resolveSessionStatus('QUALITY_OK', true, null)).toEqual({
      message: strings.session.easeOff,
      variant: 'safety',
    });
  });

  it('shows nothing on a clean OK frame', () => {
    expect(resolveSessionStatus('QUALITY_OK', false, null)).toBeNull();
  });
});
