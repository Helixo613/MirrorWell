import { describe, expect, it } from 'vitest';
import type { MetricSample } from '../../src/metrics/metrics.ts';

/**
 * docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
 * requirement); every branch below is deliberate, not incidental.
 * RepDetector is a stateful singleton (docs/BACKEND.md §1.5); every test calls reset()
 * first so state never leaks between unrelated test cases.
 *
 * Timestamps between consecutive feed() calls must stay ≤ gapResetMs (250) unless the
 * test is deliberately exercising the gap-abort rule. Real QUALITY_OK frames arrive
 * at ~30 Hz; sparse phase timestamps still need intermediate samples.
 */

function sample(
  effortIndex: number,
  timestampMs: number,
  symmetryIndex: number | null = 0.5,
  strainIndex = 0,
): MetricSample {
  return { symmetryIndex, effortIndex, strainIndex, timestampMs };
}

/** Hold effort across [startMs, endMs] with steps ≤ 200ms so gap abort does not fire. */
function hold(
  effort: number,
  startMs: number,
  endMs: number,
  si: number | null = 0.5,
  strain = 0,
): MetricSample[] {
  const out: MetricSample[] = [];
  for (let t = startMs; t <= endMs; t += 200) {
    out.push(sample(effort, t, si, strain));
  }
  if (out[out.length - 1]!.timestampMs !== endMs) {
    out.push(sample(effort, endMs, si, strain));
  }
  return out;
}

describe('RepDetector, idle / start threshold', () => {
  it('never emits while effortIndex stays at or below startThreshold', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    // Boundary read from config, not hardcoded, so the "exactly at threshold" case stays the
    // case actually being tested when startThreshold is retuned (it moved 0.15 to 0.18).
    const { thresholds } = await import('../../src/config/thresholds.ts');
    const { startThreshold } = thresholds.reps;
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.05, 0))).toBeNull();
    expect(RepDetector.feed(sample(startThreshold / 2, 100))).toBeNull();
    expect(RepDetector.feed(sample(startThreshold, 200))).toBeNull(); // exactly at it: strict >
  });
});

describe('RepDetector, clean rep', () => {
  it('a clean rep (rise, hold, fall) is counted exactly once', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    for (const s of hold(0.2, 0, 200)) expect(RepDetector.feed(s)).toBeNull();
    for (const s of hold(0.5, 400, 800)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0);
    expect(event!.durationMs).toBe(900);
    expect(event!.easeOffTriggered).toBe(false);
  });

  it('durationMs exactly minDurationMs (800ms) is accepted, not rejected', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    for (const s of hold(0.3, 0, 600)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 800));
    expect(event).not.toBeNull();
    expect(event!.durationMs).toBe(800);
  });
});

describe('RepDetector, twitch rejection (< 800ms)', () => {
  it('a twitch shorter than minDurationMs is rejected and does not consume a repIndex', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    const twitch = RepDetector.feed(sample(0.05, 200)); // 200ms < 800ms (gap 200 ≤ 250)
    expect(twitch).toBeNull();

    for (const s of hold(0.3, 400, 1000)) expect(RepDetector.feed(s)).toBeNull();
    const validRep = RepDetector.feed(sample(0.05, 1200)); // duration 1200-400=800
    expect(validRep).not.toBeNull();
    expect(validRep!.repIndex).toBe(0); // proves the twitch never incremented the counter
  });
});

describe('RepDetector, double-peak without full drop', () => {
  it('a dip that stays >= endThreshold does not end the rep, counted as one rep', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.3, 0))).toBeNull(); // rise
    expect(RepDetector.feed(sample(0.5, 200))).toBeNull(); // peak 1
    expect(RepDetector.feed(sample(0.12, 400))).toBeNull(); // dip, but >= endThreshold(0.10); stays active
    expect(RepDetector.feed(sample(0.4, 600))).toBeNull(); // peak 2
    expect(RepDetector.feed(sample(0.4, 800))).toBeNull(); // hold past min duration
    const event = RepDetector.feed(sample(0.05, 900)); // full drop, ends
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0);
    expect(event!.durationMs).toBe(900);
  });

  it('effortIndex exactly at endThreshold does not end the rep; boundary is strict <', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    // Read the boundary from config rather than hardcoding it: this test asserts the strict-<
    // comparison, not one particular tuning, and a literal here silently inverts the case it is
    // testing whenever endThreshold moves (it did, at 0.1 to 0.12).
    const { thresholds } = await import('../../src/config/thresholds.ts');
    const { endThreshold } = thresholds.reps;
    RepDetector.reset();
    for (const s of hold(0.3, 0, 200)) expect(RepDetector.feed(s)).toBeNull();
    expect(RepDetector.feed(sample(endThreshold, 400))).toBeNull(); // exactly at it: stays active
    expect(RepDetector.feed(sample(endThreshold, 600))).toBeNull();
    expect(RepDetector.feed(sample(endThreshold, 800))).toBeNull();
    const event = RepDetector.feed(sample(endThreshold - 0.001, 900));
    expect(event).not.toBeNull();
    expect(event!.durationMs).toBe(900);
  });
});

describe('RepDetector, ease-off within a rep (sustained > 0.60 for >= 300ms)', () => {
  it('flags easeOffTriggered when effort is sustained above threshold long enough inside the rep', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.65, 0)); // crosses easeOff threshold, starts rep
    RepDetector.feed(sample(0.65, 200));
    RepDetector.feed(sample(0.65, 300)); // sustained 300ms -> fires
    for (const s of hold(0.65, 500, 800)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900)); // valid rep (900ms >= 800ms)
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(true);
  });

  it('flags easeOffTriggered when the crossing happens mid-rep (not on the starting frame)', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0)); // starts rep, below easeOff threshold
    RepDetector.feed(sample(0.65, 100)); // crosses threshold mid-rep, first crossing here
    RepDetector.feed(sample(0.65, 300));
    RepDetector.feed(sample(0.65, 400)); // sustained 300ms since the mid-rep crossing
    for (const s of hold(0.65, 600, 800)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(true);
  });

  it('does not flag easeOffTriggered when the over-effort excursion is brief', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.65, 0)); // crosses, starts rep
    RepDetector.feed(sample(0.3, 100)); // drops back below easeOff threshold before 300ms
    for (const s of hold(0.3, 300, 800)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(false);
  });
});

describe('RepDetector, peak tracking', () => {
  it('peakSymmetryIndex ignores null samples; peakEffortIndex tracks the true max', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0, 0.3));
    RepDetector.feed(sample(0.5, 200, null)); // null SI must not overwrite the peak
    RepDetector.feed(sample(0.2, 400, 0.8)); // new SI peak, lower effort
    for (const s of hold(0.2, 600, 800, 0.8)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.peakSymmetryIndex).toBe(0.8);
    expect(event!.peakEffortIndex).toBe(0.5);
  });
});

describe('RepDetector, getState() (DebugHud, Task 8)', () => {
  it('is idle after reset(), active once a rep starts, idle again once it ends', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.getState()).toBe('idle');
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.getState()).toBe('active');
    for (const s of hold(0.3, 200, 800)) RepDetector.feed(s);
    RepDetector.feed(sample(0.05, 900)); // ends (accepted rep)
    expect(RepDetector.getState()).toBe('idle');
  });

  it('returns to idle even when the rep is rejected as a twitch', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.getState()).toBe('active');
    RepDetector.feed(sample(0.05, 200)); // twitch, rejected
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

describe('RepDetector, reset() prevents cross-exercise leakage', () => {
  it('reset() mid-rep discards all in-progress state; the next exercise starts clean', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.5, 0)); // start a rep, never completed; exercise switches here
    RepDetector.reset();

    // Idle frame post-reset must not resume the aborted rep.
    expect(RepDetector.feed(sample(0.05, 100))).toBeNull();

    for (const s of hold(0.3, 200, 1000)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 1100));
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0); // counter restarted, not leaked from before reset()
    expect(event!.durationMs).toBe(900); // 1100 - 200, not contaminated by the t=0 aborted start
  });
});

describe('RepDetector, gap > gapResetMs aborts active rep without event', () => {
  it('active rep aborts on gap > 250ms with no RepEvent; repIndex not consumed', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.3, 0))).toBeNull(); // start rep
    expect(RepDetector.getState()).toBe('active');
    // Gap 251ms while active → abort, no event; high effort restarts a fresh rep on same sample
    expect(RepDetector.feed(sample(0.3, 251))).toBeNull();
    expect(RepDetector.getState()).toBe('active'); // re-started
    // End the re-started rep as a short twitch
    expect(RepDetector.feed(sample(0.05, 300))).toBeNull();
    expect(RepDetector.getState()).toBe('idle');

    for (const s of hold(0.3, 400, 1200)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 1300));
    expect(event).not.toBeNull();
    expect(event!.repIndex).toBe(0);
    expect(event!.durationMs).toBe(900);
  });

  it('gap of exactly 250ms does NOT abort (boundary is strict >)', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.3, 0));
    expect(RepDetector.feed(sample(0.3, 250))).toBeNull(); // still active, no abort
    expect(RepDetector.getState()).toBe('active');
    for (const s of hold(0.3, 450, 800)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 900));
    expect(event).not.toBeNull();
    expect(event!.durationMs).toBe(900);
  });

  it('gap while idle does not emit and leaves detector idle', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    expect(RepDetector.feed(sample(0.05, 0))).toBeNull();
    expect(RepDetector.feed(sample(0.05, 500))).toBeNull(); // gap > 250 while idle
    expect(RepDetector.getState()).toBe('idle');
  });

  it('gap abort clears ease-off tracking for the aborted rep', async () => {
    const { RepDetector } = await import('../../src/metrics/reps.ts');
    RepDetector.reset();
    RepDetector.feed(sample(0.65, 0)); // start + ease-off sustain begins
    RepDetector.feed(sample(0.65, 200)); // still under 300ms
    // Gap 300ms (>250) aborts; low effort keeps idle (no re-start)
    expect(RepDetector.feed(sample(0.05, 500))).toBeNull();
    expect(RepDetector.getState()).toBe('idle');
    // Fresh rep without sustained over-effort
    for (const s of hold(0.3, 600, 1400)) expect(RepDetector.feed(s)).toBeNull();
    const event = RepDetector.feed(sample(0.05, 1500));
    expect(event).not.toBeNull();
    expect(event!.easeOffTriggered).toBe(false);
  });
});
