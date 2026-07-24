// src/dev/liveDemoState.ts, pure display logic for the dev-only live demo view.
// Dev-only, React-free, tested directly (same pattern as liveV1HarnessState.ts).
//
// The symmetric/asymmetric boundary is an explicit tunable, `thresholds.liveDemo.symmetryBoundary`.
// It is NOT derived from the measured noise floor: a real symmetric smile centres at SI ≈ 0.96–0.98,
// never a perfect 1.0, so a boundary anchored at 1.0 minus a noise floor of a few hundredths reads a
// genuinely symmetric smile as "Uneven". The tunable sits in the gap the demo arc names (symmetric
// ≈ 0.98; one side restrained ≈ 0.4–0.7) and is tuned on real hardware.
//
// The measured noise floor is still computed (`stdDev`); it is a field of the ephemeral baseline
// and is shown in the readout, but it no longer moves the boundary. `isNoiseFloorUsable` survives
// as the quick-setup validity gate only (see its doc comment).
import { strings } from '../config/strings.ts';
import { thresholds } from '../config/thresholds.ts';

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
  /** SI as text, or the explicit "no reading" copy; never "0" for a null SI. */
  siText: string;
}

/** Population standard deviation; 0 for fewer than two samples (matches LiveV1Harness). */
export function stdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

/**
 * Quick-setup validity gate (no longer a boundary input). A noise floor of exactly 0 over a
 * hold window that produced samples means the raw SI never varied by a single ulp; a frozen
 * or degenerate capture, not a steady human hold. That is a "redo the quick setup" condition,
 * never something to paper over with a constant.
 */
export function isNoiseFloorUsable(noiseFloorSymmetry: number): boolean {
  return Number.isFinite(noiseFloorSymmetry) && noiseFloorSymmetry > 0;
}

export function classifySymmetry(symmetryIndex: number | null): DemoReadout {
  if (symmetryIndex === null || !Number.isFinite(symmetryIndex)) return 'no_reading';
  return symmetryIndex >= thresholds.liveDemo.symmetryBoundary ? 'symmetric' : 'asymmetric';
}

export function describeSymmetry(symmetryIndex: number | null): DemoDisplay {
  const readout = classifySymmetry(symmetryIndex);
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

/** One usable neutral frame is the minimum an aggregate can be built from. */
export const MIN_NEUTRAL_SAMPLES = 1;
/** stdDev needs a pair, so a hold window under two SI samples has no measurable floor. */
export const MIN_HOLD_SI_SAMPLES = 2;

export type CaptureDecision = 'keep_waiting' | 'finalize' | 'error';

/**
 * Deadline decision for one quick-setup capture window.
 *
 * Deliberately independent of the current frame's quality state: making `finalize` conditional
 * on a QUALITY_OK frame is precisely the bug this replaces; a window that collected enough
 * samples and then degraded at the deadline would hang in "Capturing…" forever waiting for an
 * OK frame that may never return. The "evaluated on every frame regardless of quality or
 * inference success" requirement is met by the caller invoking this unconditionally, outside
 * any quality branch and outside the inference `try`.
 *
 * `elapsedMs` is a delta between two carried frame timestamps (frames.ts), so it keeps ticking
 * through non-OK and inference-failed frames.
 */
export function decideCaptureWindow(
  elapsedMs: number,
  windowMs: number,
  samples: number,
  minSamples: number,
): CaptureDecision {
  if (elapsedMs < windowMs) return 'keep_waiting';
  return samples >= minSamples ? 'finalize' : 'error';
}

/** Per-side activation readout; null (no measurable frame) is explicit, never 0. */
export function formatActivation(value: number | null): string {
  return value === null || !Number.isFinite(value) ? copy.noReading : value.toFixed(2);
}
