// tests/unit/live-demo-state.test.ts — pure display logic for the dev-only live demo view.
import { describe, it, expect } from 'vitest';
import {
  classifySymmetry,
  describeSymmetry,
  formatActivation,
  isNoiseFloorUsable,
  stdDev,
} from '../../src/dev/liveDemoState.ts';
import { strings } from '../../src/config/strings.ts';

const FLOOR = 0.05; // a plausible measured noiseFloorSymmetry

describe('classifySymmetry', () => {
  it('reads SI inside the measured noise floor as symmetric', () => {
    expect(classifySymmetry(0.98, FLOOR)).toBe('symmetric');
    expect(classifySymmetry(0.9501, FLOOR)).toBe('symmetric'); // just inside the boundary
    expect(classifySymmetry(1, FLOOR)).toBe('symmetric');
  });

  it('reads SI beyond the measured noise floor as asymmetric', () => {
    expect(classifySymmetry(0.9499, FLOOR)).toBe('asymmetric');
    expect(classifySymmetry(0.7, FLOOR)).toBe('asymmetric');
    expect(classifySymmetry(0.4, FLOOR)).toBe('asymmetric');
  });

  it('moves the boundary with the noise floor (self-calibrating, no fixed tunable)', () => {
    expect(classifySymmetry(0.9, 0.2)).toBe('symmetric');
    expect(classifySymmetry(0.9, 0.01)).toBe('asymmetric');
  });

  it('treats a null or non-finite SI as no reading', () => {
    expect(classifySymmetry(null, FLOOR)).toBe('no_reading');
    expect(classifySymmetry(Number.NaN, FLOOR)).toBe('no_reading');
  });
});

describe('describeSymmetry', () => {
  it('renders null SI as an explicit no-reading state, never 0', () => {
    const d = describeSymmetry(null, FLOOR);
    expect(d.readout).toBe('no_reading');
    expect(d.siText).toBe(strings.liveDemo.noReading);
    expect(d.siText).not.toBe('0');
    expect(d.barPct).toBe(0);
  });

  it('carries the state in non-colour channels that differ per state', () => {
    const sym = describeSymmetry(0.98, FLOOR);
    const asym = describeSymmetry(0.5, FLOOR);
    const none = describeSymmetry(null, FLOOR);
    for (const key of ['label', 'glyph', 'borderStyle'] as const) {
      expect(new Set([sym[key], asym[key], none[key]]).size).toBe(3);
    }
    expect(sym.barPct).toBeGreaterThan(asym.barPct);
  });

  it('formats the demo arc values', () => {
    expect(describeSymmetry(0.98, FLOOR).siText).toBe('0.98');
    expect(describeSymmetry(0.55, FLOOR).readout).toBe('asymmetric');
    expect(describeSymmetry(0.98, FLOOR).barPct).toBeCloseTo(98, 5);
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
