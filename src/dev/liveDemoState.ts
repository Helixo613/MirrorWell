// src/dev/liveDemoState.ts — pure display logic for the dev-only live demo view.
// Dev-only, React-free, tested directly (same pattern as liveV1HarnessState.ts).
//
// The symmetric/asymmetric boundary is NOT a new tunable: it is the ephemeral baseline's own
// measured `noiseFloorSymmetry` (standard deviation of raw SI over the gentle-hold window, the
// same quantity CalibrationFlow.runNoiseFloorSelfTest computes). A symmetry index within one
// noise floor of a perfect 1.0 is inside what this camera/user/light measurably resolves, so it
// reads as symmetric; anything further out is a difference the pipeline can actually see.
import { strings } from '../config/strings.ts';

const copy = strings.liveDemo;

export type DemoReadout = 'no_reading' | 'symmetric' | 'asymmetric';

export interface DemoDisplay {
  readout: DemoReadout;
  /** Channel 1: words. */
  label: string;
  /** Channel 2: glyph. */
  glyph: string;
  /** Channel 3: border treatment (no colour involved). */
  borderStyle: 'solid' | 'dashed' | 'dotted';
  /** Channel 4: bar fill position, 0..100. 0 when there is no reading. */
  barPct: number;
  /** SI as text, or the explicit "no reading" copy — never "0" for a null SI. */
  siText: string;
}

/** Population standard deviation; 0 for fewer than two samples (matches LiveV1Harness). */
export function stdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

/**
 * A noise floor of exactly 0 means the hold window was too short (or SI never became
 * measurable) — the boundary would then be an unreachable SI of exactly 1.0. That is a
 * "redo the quick setup" condition, never something to paper over with a constant.
 */
export function isNoiseFloorUsable(noiseFloorSymmetry: number): boolean {
  return Number.isFinite(noiseFloorSymmetry) && noiseFloorSymmetry > 0;
}

export function classifySymmetry(
  symmetryIndex: number | null,
  noiseFloorSymmetry: number,
): DemoReadout {
  if (symmetryIndex === null || !Number.isFinite(symmetryIndex)) return 'no_reading';
  const tolerance = Number.isFinite(noiseFloorSymmetry) && noiseFloorSymmetry > 0
    ? noiseFloorSymmetry
    : 0;
  return 1 - symmetryIndex <= tolerance ? 'symmetric' : 'asymmetric';
}

export function describeSymmetry(
  symmetryIndex: number | null,
  noiseFloorSymmetry: number,
): DemoDisplay {
  const readout = classifySymmetry(symmetryIndex, noiseFloorSymmetry);
  if (readout === 'no_reading') {
    return {
      readout,
      label: copy.stateNoReading,
      glyph: copy.glyphNoReading,
      borderStyle: 'dotted',
      barPct: 0,
      siText: copy.noReading,
    };
  }
  const si = symmetryIndex as number;
  return {
    readout,
    label: readout === 'symmetric' ? copy.stateSymmetric : copy.stateAsymmetric,
    glyph: readout === 'symmetric' ? copy.glyphSymmetric : copy.glyphAsymmetric,
    borderStyle: readout === 'symmetric' ? 'solid' : 'dashed',
    barPct: Math.max(0, Math.min(100, si * 100)),
    siText: si.toFixed(2),
  };
}

/** Per-side activation readout; null (no measurable frame) is explicit, never 0. */
export function formatActivation(value: number | null): string {
  return value === null || !Number.isFinite(value) ? copy.noReading : value.toFixed(2);
}
