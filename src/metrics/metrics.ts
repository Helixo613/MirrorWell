// src/metrics/metrics.ts — the clinical-core math (docs/BACKEND.md §1.5). Contracts:
// docs/API.md §8. Canonical math: docs/ARCHITECTURE.md §7.
//
// DOCS-CHANGE (Task 7, 2026-07-10): API.md §8 / BACKEND.md §1.5 amended to add setBaseline,
// isEaseOffActive, and reset. compute()'s effortIndex denominator (comfortableMax[exerciseId])
// requires held baseline state that this module cannot fetch itself (BACKEND §1.5 forbids
// storage access), and ARCHITECTURE §7 assigns 5-frame smoothing and the sustained ease-off
// condition to MetricEngine — cross-frame state a single compute(nf, exerciseId) call cannot
// hold on its own. Mirrors NormalizationLayer's existing setBaseline/module-singleton pattern
// (src/metrics/normalize.ts) — no new identifiers invented.
//
// DOCS-CHANGE (Task B4): API.md §15 — metrics.gapResetMs added. Direction-aware SI via
// mirrored right vector + cosθ; trailing median; gap > gapResetMs resets smoothing + ease-off.
import type { NormalizedFrame } from './normalize.ts';
import type { CalibrationBaseline, ExerciseId, RegionId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { exercises } from '../config/exercises.ts';
import { thresholds } from '../config/thresholds.ts';

export interface MetricSample {
  symmetryIndex: number | null;
  effortIndex: number;
  timestampMs: number;
}

// DOCS-CHANGE (Task 8, 2026-07-10): API.md §8 amended to add getLastRaw(). ARCHITECTURE §12's
// canonical DebugHud CSV columns include symmetryIndexRaw/effortIndexRaw alongside the smoothed
// pair, and API.md §8 itself already stated "DebugHud shows both" — but MetricSample (consumed
// by RepDetector/SessionController/storage) is deliberately smoothed-only, so raw values need a
// separate dev-only accessor rather than widening the per-frame contract everything else relies
// on. Captured as a side-value inside compute() itself (never a second compute() call, which
// would double-push the smoothing window).
export interface RawMetricSample {
  symmetryIndex: number | null;
  effortIndex: number;
}

const {
  movementFloorPct,
  easeOffThreshold,
  easeOffSustainMs,
  smoothingWindow,
  gapResetMs,
} = thresholds.metrics;

let activeBaseline: CalibrationBaseline | null = null;
let symmetryWindow: (number | null)[] = [];
let effortWindow: number[] = [];
let easeOffSustainStartMs: number | null = null;
let easeOffActive = false;
let lastRaw: RawMetricSample | null = null;
let lastTimestampMs: number | null = null;

function setBaseline(b: CalibrationBaseline): void {
  // MetricEngine only needs comfortableMax for effort; noise-floor fields live on the baseline
  // for TrendsService and are not validated here (BACKEND §1.5 forbids storage access).
  if (!b || !b.comfortableMax) {
    throw new MirrorWellError('NO_BASELINE', 'setBaseline called with an invalid or incomplete baseline');
  }
  activeBaseline = b;
}

function clearSmoothingAndEaseOff(): void {
  symmetryWindow = [];
  effortWindow = [];
  easeOffSustainStartMs = null;
  easeOffActive = false;
}

function reset(): void {
  clearSmoothingAndEaseOff();
  lastRaw = null;
  lastTimestampMs = null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function pushWindowed<T>(window: T[], value: T): T[] {
  const next = [...window, value];
  if (next.length > smoothingWindow) next.shift();
  return next;
}

function smoothedSymmetry(window: (number | null)[]): number | null {
  const present = window.filter((v): v is number => v !== null);
  return present.length === 0 ? null : median(present);
}

/**
 * Direction-aware SI (ARCHITECTURE §7):
 *   ΔR̃ = (−ΔR.u, ΔR.v); mL = |ΔL|; mR = |ΔR̃|
 *   if max(mL,mR) < movementFloorPct → null
 *   else SI = (min/max) · max(0, cosθ), cosθ = (ΔL·ΔR̃)/(mL·mR) (0 if either mag is 0)
 */
function rawSymmetryAndEffort(
  left: { u: number; v: number },
  right: { u: number; v: number },
  comfortableMax: number,
): { symmetryIndex: number | null; effortIndex: number } {
  const dLu = left.u;
  const dLv = left.v;
  const dRTu = -right.u; // mirrored right
  const dRTv = right.v;

  const mL = Math.hypot(dLu, dLv);
  const mR = Math.hypot(dRTu, dRTv);
  const maxM = Math.max(mL, mR);
  const minM = Math.min(mL, mR);

  let symmetryIndex: number | null;
  if (maxM < movementFloorPct) {
    symmetryIndex = null;
  } else {
    const cosTheta = mL * mR === 0 ? 0 : (dLu * dRTu + dLv * dRTv) / (mL * mR);
    symmetryIndex = (minM / maxM) * Math.max(0, cosTheta);
  }

  const effortIndex = maxM / comfortableMax;
  return { symmetryIndex, effortIndex };
}

function compute(nf: NormalizedFrame, exerciseId: ExerciseId): MetricSample {
  if (!activeBaseline) {
    throw new MirrorWellError('NO_BASELINE', 'compute called without setBaseline');
  }

  // Gap rule: sample gap > gapResetMs resets trailing windows + ease-off sustain (partial reset).
  if (lastTimestampMs !== null && nf.timestampMs - lastTimestampMs > gapResetMs) {
    clearSmoothingAndEaseOff();
  }
  lastTimestampMs = nf.timestampMs;

  const config = exercises[exerciseId]!;
  const disp = nf.regionDisplacements[config.regionId as RegionId];
  const comfortableMax = activeBaseline.comfortableMax[exerciseId];
  // A missing comfortableMax must never silently produce effortIndex 0 — that would disable
  // the ease-off safety cue for the whole exercise. Uncalibrated exercise → NO_BASELINE.
  if (comfortableMax === undefined || !Number.isFinite(comfortableMax) || comfortableMax <= 0) {
    throw new MirrorWellError('NO_BASELINE', `comfortableMax missing or invalid for ${exerciseId}`);
  }
  const raw = rawSymmetryAndEffort(disp.left, disp.right, comfortableMax);

  lastRaw = { symmetryIndex: raw.symmetryIndex, effortIndex: raw.effortIndex };

  symmetryWindow = pushWindowed(symmetryWindow, raw.symmetryIndex);
  effortWindow = pushWindowed(effortWindow, raw.effortIndex);

  const symmetryIndex = smoothedSymmetry(symmetryWindow);
  const effortIndex = median(effortWindow);

  if (effortIndex > easeOffThreshold) {
    if (easeOffSustainStartMs === null) {
      easeOffSustainStartMs = nf.timestampMs;
    } else if (nf.timestampMs - easeOffSustainStartMs >= easeOffSustainMs) {
      easeOffActive = true;
    }
  } else {
    easeOffSustainStartMs = null;
    easeOffActive = false;
  }

  return { symmetryIndex, effortIndex, timestampMs: nf.timestampMs };
}

function isEaseOffActive(): boolean {
  return easeOffActive;
}

function getLastRaw(): RawMetricSample | null {
  return lastRaw;
}

export const MetricEngine = { setBaseline, compute, isEaseOffActive, getLastRaw, reset };
