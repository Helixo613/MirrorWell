// tests/unit/live-demo-state.test.ts — pure display logic for the dev-only live demo view.
import { describe, it, expect } from 'vitest';
import {
  classifySymmetry,
  decideCaptureWindow,
  describeSymmetry,
  formatActivation,
  isNoiseFloorUsable,
  stdDev,
  MIN_HOLD_SI_SAMPLES,
  MIN_NEUTRAL_SAMPLES,
} from '../../src/dev/liveDemoState.ts';
import { strings } from '../../src/config/strings.ts';
import { thresholds } from '../../src/config/thresholds.ts';

// Never a literal: the boundary is a tunable, and these tests must keep meaning if it moves.
const BOUNDARY = thresholds.liveDemo.symmetryBoundary;

describe('classifySymmetry', () => {
  it('reads a real symmetric smile (SI ≈ 0.98, not a perfect 1.0) as symmetric', () => {
    expect(classifySymmetry(0.98)).toBe('symmetric');
    expect(classifySymmetry(0.96)).toBe('symmetric');
    expect(classifySymmetry(1)).toBe('symmetric');
  });

  it('reads the demo arc’s restrained side (SI 0.4–0.7) as asymmetric', () => {
    expect(classifySymmetry(0.7)).toBe('asymmetric');
    expect(classifySymmetry(0.55)).toBe('asymmetric');
    expect(classifySymmetry(0.4)).toBe('asymmetric');
  });

  it('is inclusive at the boundary and asymmetric just below it', () => {
    expect(classifySymmetry(BOUNDARY)).toBe('symmetric');
    expect(classifySymmetry(BOUNDARY + 1e-6)).toBe('symmetric');
    expect(classifySymmetry(BOUNDARY - 1e-6)).toBe('asymmetric');
  });

  it('places the boundary inside the gap the demo arc names', () => {
    expect(BOUNDARY).toBeGreaterThan(0.7); // above a restrained side
    expect(BOUNDARY).toBeLessThan(0.96); // below a real symmetric smile
  });

  it('treats a null or non-finite SI as no reading', () => {
    expect(classifySymmetry(null)).toBe('no_reading');
    expect(classifySymmetry(Number.NaN)).toBe('no_reading');
  });
});

describe('describeSymmetry', () => {
  it('renders null SI as an explicit no-reading state, never 0', () => {
    const d = describeSymmetry(null);
    expect(d.readout).toBe('no_reading');
    expect(d.siText).toBe(strings.liveDemo.noReading);
    expect(d.siText).not.toBe('0');
    expect(d.barPct).toBe(0);
  });

  it('carries the state in non-colour channels that differ per state', () => {
    const sym = describeSymmetry(0.98);
    const asym = describeSymmetry(0.5);
    const none = describeSymmetry(null);
    for (const key of ['label', 'glyph', 'borderStyle'] as const) {
      expect(new Set([sym[key], asym[key], none[key]]).size).toBe(3);
    }
    expect(sym.barPct).toBeGreaterThan(asym.barPct);
  });

  it('formats the demo arc values', () => {
    expect(describeSymmetry(0.98).siText).toBe('0.98');
    expect(describeSymmetry(0.55).readout).toBe('asymmetric');
    expect(describeSymmetry(0.98).barPct).toBeCloseTo(98, 5);
  });
});

describe('decideCaptureWindow', () => {
  const WINDOW = 3000;

  it('keeps waiting before the deadline, whatever the sample count', () => {
    expect(decideCaptureWindow(0, WINDOW, 0, MIN_NEUTRAL_SAMPLES)).toBe('keep_waiting');
    expect(decideCaptureWindow(WINDOW - 1, WINDOW, 99, MIN_NEUTRAL_SAMPLES)).toBe('keep_waiting');
  });

  it('finalizes at or after the deadline once enough samples exist', () => {
    expect(decideCaptureWindow(WINDOW, WINDOW, MIN_NEUTRAL_SAMPLES, MIN_NEUTRAL_SAMPLES)).toBe('finalize');
    expect(decideCaptureWindow(WINDOW + 500, WINDOW, MIN_HOLD_SI_SAMPLES, MIN_HOLD_SI_SAMPLES)).toBe('finalize');
  });

  it('errors at the deadline when the window collected too little', () => {
    expect(decideCaptureWindow(WINDOW, WINDOW, 0, MIN_NEUTRAL_SAMPLES)).toBe('error');
    expect(decideCaptureWindow(WINDOW, WINDOW, MIN_HOLD_SI_SAMPLES - 1, MIN_HOLD_SI_SAMPLES)).toBe('error');
  });

  // The residual hang: samples were collected, then quality degraded at/after the deadline and
  // stayed bad. The decision may never be keep_waiting — that is what left it stuck in
  // "Capturing…" forever. The function is quality-independent by design, so the caller can (and
  // does) run it on non-OK and inference-failed frames alike.
  it('never keeps waiting past the deadline, even though the frame that reached it was bad', () => {
    for (const samples of [0, 1, 2, 10]) {
      for (const min of [MIN_NEUTRAL_SAMPLES, MIN_HOLD_SI_SAMPLES]) {
        expect(decideCaptureWindow(WINDOW + 10_000, WINDOW, samples, min)).not.toBe('keep_waiting');
      }
    }
    // Specifically: data collected + deadline long past must finalize, not hang.
    expect(decideCaptureWindow(WINDOW + 10_000, WINDOW, 5, MIN_HOLD_SI_SAMPLES)).toBe('finalize');
  });
});

describe('noise floor helpers', () => {
  it('computes a population standard deviation and 0 for under two samples', () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([0.9])).toBe(0);
    expect(stdDev([1, 1, 1])).toBe(0);
    expect(stdDev([0.9, 1.1])).toBeCloseTo(0.1, 10);
  });

  it('rejects a zero or non-finite floor so quick setup is redone', () => {
    expect(isNoiseFloorUsable(0)).toBe(false);
    expect(isNoiseFloorUsable(Number.NaN)).toBe(false);
    expect(isNoiseFloorUsable(0.02)).toBe(true);
  });
});

describe('formatActivation', () => {
  it('shows two decimals, and no reading for null', () => {
    expect(formatActivation(0.4321)).toBe('0.43');
    expect(formatActivation(null)).toBe(strings.liveDemo.noReading);
  });
});
