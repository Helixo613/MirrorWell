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

const { movementFloorPct, easeOffThreshold, easeOffSustainMs, smoothingWindow } = thresholds.metrics;

let activeBaseline: CalibrationBaseline | null = null;
let symmetryWindow: (number | null)[] = [];
let effortWindow: number[] = [];
let easeOffSustainStartMs: number | null = null;
let easeOffActive = false;
let lastRaw: RawMetricSample | null = null;

function setBaseline(b: CalibrationBaseline): void {
  if (!b || !b.comfortableMax) {
    throw new MirrorWellError('NO_BASELINE', 'setBaseline called with an invalid or incomplete baseline');
  }
  activeBaseline = b;
}

function reset(): void {
  symmetryWindow = [];
  effortWindow = [];
  easeOffSustainStartMs = null;
  easeOffActive = false;
  lastRaw = null;
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

function compute(nf: NormalizedFrame, exerciseId: ExerciseId): MetricSample {
  if (!activeBaseline) {
    throw new MirrorWellError('NO_BASELINE', 'compute called without setBaseline');
  }

  const config = exercises[exerciseId]!;
  const disp = nf.regionDisplacements[config.regionId as RegionId];
  const dL = Math.abs(disp.left);
  const dR = Math.abs(disp.right);
  const maxD = Math.max(dL, dR);
  const minD = Math.min(dL, dR);

  const rawSymmetryIndex = maxD < movementFloorPct ? null : minD / maxD;

  const comfortableMax = activeBaseline.comfortableMax[exerciseId];
  const rawEffortIndex = comfortableMax === undefined ? 0 : maxD / comfortableMax;

  lastRaw = { symmetryIndex: rawSymmetryIndex, effortIndex: rawEffortIndex };

  symmetryWindow = pushWindowed(symmetryWindow, rawSymmetryIndex);
  effortWindow = pushWindowed(effortWindow, rawEffortIndex);

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
