import { describe, expect, it } from 'vitest';
import type { MetricSample } from '../../src/metrics/metrics.ts';

/**
 * docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
 * requirement) — every branch below is deliberate, not incidental.
 * RepDetector is a stateful singleton (docs/BACKEND.md §1.5); every test calls reset()
 * first so state never leaks between unrelated test cases.
 */

function sample(effortIndex: number, timestampMs: number, symmetryIndex: number | null = 0.5): MetricSample {
  return { symmetryIndex, effortIndex, timestampMs };
}

describe('RepDetector — idle / start threshold', () => {
  it('never emits while effortIndex stays at or below startThreshold (0.15)', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.05, 0))).toBeNull();
    expect(RepDetector.feed(sample(0.1, 100))).toBeNull();
    expect(RepDetector.feed(sample(0.15, 200))).toBeNull(); // exactly at threshold — strict >
  });
});

describe('RepDetector — clean rep', () => {
  it('a clean rep (rise, hold, fall) is counted exactly once', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.2, 0))).toBeNull();
    expect(RepDetector.feed(sample(0.5, 400))).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0);
    expect(event!.durationMs).toBe(900);
    expect(event!.easeOffTriggered).toBe(false);
  });

  it('durationMs exactly minDurationMs (800ms) is accepted, not rejected', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    const event = RepDetector.feed(sample(0.05, 800));
    expect(event).not.toBeNull();
    expect(event!.durationMs).toBe(800);
  });
});

describe('RepDetector — twitch rejection (< 800ms)', () => {
  it('a twitch shorter than minDurationMs is rejected and does not consume a repIndex', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    const twitch = RepDetector.feed(sample(0.05, 500)); // 500ms < 800ms
    expect(twitch).toBeNull();

    RepDetector.feed(sample(0.3, 1000));
    const validRep = RepDetector.feed(sample(0.05, 1900));
    expect(validRep).not.toBeNull();
    expect(validRep!.repIndex).toBe(0); // proves the twitch never incremented the counter
  });
});

describe('RepDetector — double-peak without full drop', () => {
  it('a dip that stays >= endThreshold does not end the rep — counted as one rep', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.3, 0))).toBeNull(); // rise
    expect(RepDetector.feed(sample(0.5, 200))).toBeNull(); // peak 1
    expect(RepDetector.feed(sample(0.12, 400))).toBeNull(); // dip, but >= endThreshold(0.10) — stays active
    expect(RepDetector.feed(sample(0.4, 600))).toBeNull(); // peak 2
    const event = RepDetector.feed(sample(0.05, 900)); // full drop — ends
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0);
    expect(event!.durationMs).toBe(900);
  });

  it('effortIndex exactly at endThreshold (0.10) does not end the rep — boundary is strict <', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.feed(sample(0.1, 400))).toBeNull(); // exactly threshold — stays active
    const event = RepDetector.feed(sample(0.099, 900));
    expect(event).not.toBeNull();
    expect(event!.durationMs).toBe(900);
  });
});

describe('RepDetector — ease-off within a rep (sustained > 0.60 for >= 300ms)', () => {
  it('flags easeOffTriggered when effort is sustained above threshold long enough inside the rep', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.65, 0)); // crosses easeOff threshold, starts rep
    RepDetector.feed(sample(0.65, 300)); // sustained 300ms -> fires
    const event = RepDetector.feed(sample(0.05, 900)); // valid rep (900ms >= 800ms)
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(true);
  });

  it('flags easeOffTriggered when the crossing happens mid-rep (not on the starting frame)', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0)); // starts rep, below easeOff threshold
    RepDetector.feed(sample(0.65, 100)); // crosses threshold mid-rep — first crossing here
    RepDetector.feed(sample(0.65, 400)); // sustained 300ms since the mid-rep crossing
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(true);
  });

  it('does not flag easeOffTriggered when the over-effort excursion is brief', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.65, 0)); // crosses, starts rep
    RepDetector.feed(sample(0.3, 100)); // drops back below easeOff threshold before 300ms
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(false);
  });
});

describe('RepDetector — peak tracking', () => {
  it('peakSymmetryIndex ignores null samples; peakEffortIndex tracks the true max', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0, 0.3));
    RepDetector.feed(sample(0.5, 300, null)); // null SI must not overwrite the peak
    RepDetector.feed(sample(0.2, 600, 0.8)); // new SI peak, lower effort
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.peakSymmetryIndex).toBe(0.8);
    expect(event!.peakEffortIndex).toBe(0.5);
  });
});

describe('RepDetector — getState() (DebugHud, Task 8)', () => {
  it('is idle after reset(), active once a rep starts, idle again once it ends', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.getState()).toBe('idle');
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.getState()).toBe('active');
    RepDetector.feed(sample(0.05, 900)); // ends (accepted rep)
    expect(RepDetector.getState()).toBe('idle');
  });

  it('returns to idle even when the rep is rejected as a twitch', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.getState()).toBe('active');
    RepDetector.feed(sample(0.05, 300)); // twitch, rejected
    expect(RepDetector.getState()).toBe('idle');
  });

  it('reset() mid-rep forces idle', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.getState()).toBe('active');
    RepDetector.reset();
    expect(RepDetector.getState()).toBe('idle');
  });
});

describe('RepDetector — reset() prevents cross-exercise leakage', () => {
  it('reset() mid-rep discards all in-progress state; the next exercise starts clean', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.5, 0)); // start a rep, never completed — exercise switches here
    RepDetector.reset();

    // Idle frame post-reset must not resume the aborted rep.
    expect(RepDetector.feed(sample(0.05, 100))).toBeNull();

    RepDetector.feed(sample(0.3, 200));
    const event = RepDetector.feed(sample(0.05, 1100));
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0); // counter restarted, not leaked from before reset()
    expect(event!.durationMs).toBe(900); // 1100 - 200, not contaminated by the t=0 aborted start
  });
});
