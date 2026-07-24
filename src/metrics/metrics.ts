// src/metrics/metrics.ts; the clinical-core math (docs/BACKEND.md §1.5). Contracts:
// docs/API.md §8. Canonical math: docs/ARCHITECTURE.md §7.
//
// DOCS-CHANGE (Task 7, 2026-07-10): API.md §8 / BACKEND.md §1.5 amended to add setBaseline,
// isEaseOffActive, and reset. compute()'s effortIndex denominator (comfortableMax[exerciseId])
// requires held baseline state that this module cannot fetch itself (BACKEND §1.5 forbids
// storage access), and ARCHITECTURE §7 assigns 5-frame smoothing and the sustained ease-off
// condition to MetricEngine, cross-frame state a single compute(nf, exerciseId) call cannot
// hold on its own. Mirrors NormalizationLayer's existing setBaseline/module-singleton pattern
// (src/metrics/normalize.ts); no new identifiers invented.
//
// DOCS-CHANGE (Task B4): API.md §15: metrics.gapResetMs added; trailing median; gap >
// gapResetMs resets smoothing + ease-off.
//
// DOCS-CHANGE (blendshape-si-v1, 2026-07-19): BACKEND §1.5 / MODEL_AND_DATA §7. SI/effort
// source is the exercise's per-side blendshape pair (geometry family rejected at V1 B3;
// evidence tests/analysis/rejected/). Smoothing/gap/ease-off semantics unchanged.
import type { NormalizedFrame } from './normalize.ts';
import type { CalibrationBaseline, ExerciseId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { exercises } from '../config/exercises.ts';
import { thresholds } from '../config/thresholds.ts';

export interface MetricSample {
  symmetryIndex: number | null;
  effortIndex: number;
  /**
   * Share of the current facial drive coming from muscles OTHER than the target, in [0..1].
   * 0 = all the movement is the exercise; toward 1 = the face is compensating (jaw, brow, nose
   * recruited to help). This is what separates a strained face from a full rep: effortIndex
   * alone only measures magnitude, so a hard clean rep and a hard strained one look identical
   * to it. Exercise-form signal only; it makes no claim about synkinesis or nerve function
   * (SAFETY §8 rule 6).
   */
  strainIndex: number;
  timestampMs: number;
}

// DOCS-CHANGE (Task 8, 2026-07-10): API.md §8 amended to add getLastRaw(). ARCHITECTURE §12's
// canonical DebugHud CSV columns include symmetryIndexRaw/effortIndexRaw alongside the smoothed
// pair, and API.md §8 itself already stated "DebugHud shows both"; but MetricSample (consumed
// by RepDetector/SessionController/storage) is deliberately smoothed-only, so raw values need a
// separate dev-only accessor rather than widening the per-frame contract everything else relies
// on. Captured as a side-value inside compute() itself (never a second compute() call, which
// would double-push the smoothing window).
export interface RawMetricSample {
  symmetryIndex: number | null;
  effortIndex: number;
  strainIndex: number;
}

const {
  easeOffThreshold,
  easeOffSustainMs,
  smoothingWindow,
  gapResetMs,
} = thresholds.metrics;
const { activationFloor, strainAccessoryFloor } = thresholds.blendshapes;

let activeBaseline: CalibrationBaseline | null = null;
let symmetryWindow: (number | null)[] = [];
let effortWindow: number[] = [];
let strainWindow: number[] = [];
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
  strainWindow = [];
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
 * Blendshape SI (candidate blendshape-si-v1. BACKEND §1.5 / MODEL_AND_DATA §7):
 *   L/R = per-side blendshape scores; act = max(L,R)
 *   if act < blendshapes.activationFloor → null
 *   else SI = min(L,R)/max(L,R). Unilateral → 0; symmetric → 1.
 * effortIndex = max(0, act − neutralActivation) / (comfortableMax − neutralActivation).
 *
 * The neutral rebase (ARCHITECTURE §7): MediaPipe reports nonzero RESTING activation for some
 * pairs (browOuterUp, eyeBlink commonly read 0.1–0.3 on a neutral face). Raw act/comfortableMax
 * therefore held resting effort above repStartThreshold/repEndThreshold for those exercises
 * a "rep" opened by itself at rest and could only close when the user drove the signal to zero
 * with the OPPOSITE movement (furrowing for brow raise, eyes wide open for eye closure), while
 * the actual movement pinned effort over the ease-off ceiling. SI stays on the raw per-side
 * scores: it is a ratio of the two sides, not a magnitude against the calibrated span.
 */
function rawSymmetryAndEffort(
  left: number,
  right: number,
  comfortableMax: number,
  neutral: number,
): { symmetryIndex: number | null; effortIndex: number } {
  const act = Math.max(left, right);
  const symmetryIndex = act < activationFloor ? null : Math.min(left, right) / act;
  const effortIndex = Math.max(0, act - neutral) / (comfortableMax - neutral);
  return { symmetryIndex, effortIndex };
}

/**
 * strainIndex = accessoryDrive / (targetDrive + accessoryDrive).
 *
 * Both terms are "activation above the level that counts as resting", so the ratio is
 * scale-free: it asks what FRACTION of what the face is currently doing is not the exercise.
 * That deliberately avoids needing a calibrated per-accessory baseline, which would otherwise
 * mean extending calibration for every category.
 *
 * Consequences worth knowing:
 *   * a big clean movement and a small clean movement both score ~0, since the ratio scales out
 *     magnitude. Magnitude is effortIndex's job, and the two are meant to be read together.
 *   * when nothing is happening at all (both drives 0) it returns 0 rather than dividing by
 *     zero, i.e. a resting face is not "strained", it is simply idle.
 */
function computeStrain(
  blendshapes: Record<string, number>,
  accessory: readonly string[],
  targetDrive: number,
): number {
  if (accessory.length === 0) return 0;

  let accessoryDrive = 0;
  for (const category of accessory) {
    accessoryDrive += Math.max(0, (blendshapes[category] ?? 0) - strainAccessoryFloor);
  }
  accessoryDrive /= accessory.length;

  const total = targetDrive + accessoryDrive;
  return total <= 0 ? 0 : accessoryDrive / total;
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
  // No validated per-side blendshape pair (EX_PUCKER open decision, MODEL_AND_DATA §7):
  // loud stop, never a silent fallback to another measurement source. This guard is an
  // intentional invariant, NOT dead code (A-REQ-1): EX_PUCKER stays a valid ExerciseId but is
  // not assignable in v1, so this is the last line of defence for a caller that bypasses the
  // assignable filter. Removing it, or replacing it with a fallback, is a defect
  // (CLAUDE.md "loud stop, never a silent fallback"); covered by metrics.test.ts.
  const pair = config.blendshapePair;
  if (!pair) {
    throw new MirrorWellError('VALIDATION_FAILED', `no blendshapePair for ${exerciseId}`);
  }
  const comfortableMax = activeBaseline.comfortableMax[exerciseId];
  // A missing comfortableMax must never silently produce effortIndex 0: that would disable
  // the ease-off safety cue for the whole exercise. Uncalibrated exercise → NO_BASELINE.
  if (comfortableMax === undefined || !Number.isFinite(comfortableMax) || comfortableMax <= 0) {
    throw new MirrorWellError('NO_BASELINE', `comfortableMax missing or invalid for ${exerciseId}`);
  }
  // Pre-field baselines (no neutralActivation) behave as neutral = 0: the exact old formula.
  // StorageService enforces neutral < comfortableMax at write time; re-check here so a corrupt
  // span can never flip effort's sign or divide by zero (this drives the ease-off SAFETY cue).
  const neutral = activeBaseline.neutralActivation?.[exerciseId] ?? 0;
  if (!Number.isFinite(neutral) || neutral < 0 || neutral >= comfortableMax) {
    throw new MirrorWellError('NO_BASELINE', `neutralActivation invalid for ${exerciseId}`);
  }
  const raw = rawSymmetryAndEffort(
    nf.blendshapes[pair.left] ?? 0,
    nf.blendshapes[pair.right] ?? 0,
    comfortableMax,
    neutral,
  );

  // targetDrive is the same numerator effortIndex uses, BEFORE dividing by the calibrated span,
  // so strain compares like with like: raw activation above rest on the target vs raw activation
  // above rest elsewhere. Using the normalised effortIndex here would make strain depend on how
  // wide the user's calibrated span happens to be.
  const targetDrive = Math.max(
    0,
    Math.max(nf.blendshapes[pair.left] ?? 0, nf.blendshapes[pair.right] ?? 0) - neutral,
  );
  const rawStrain = computeStrain(nf.blendshapes, config.accessoryBlendshapes, targetDrive);

  lastRaw = {
    symmetryIndex: raw.symmetryIndex,
    effortIndex: raw.effortIndex,
    strainIndex: rawStrain,
  };

  symmetryWindow = pushWindowed(symmetryWindow, raw.symmetryIndex);
  effortWindow = pushWindowed(effortWindow, raw.effortIndex);
  strainWindow = pushWindowed(strainWindow, rawStrain);

  const symmetryIndex = smoothedSymmetry(symmetryWindow);
  const effortIndex = median(effortWindow);
  // Same trailing median as effort: strain drives a coaching cue, and a single noisy frame
  // should not flip the cue back and forth mid-rep.
  const strainIndex = median(strainWindow);

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

  return { symmetryIndex, effortIndex, strainIndex, timestampMs: nf.timestampMs };
}

function isEaseOffActive(): boolean {
  return easeOffActive;
}

function getLastRaw(): RawMetricSample | null {
  return lastRaw;
}

export const MetricEngine = { setBaseline, compute, isEaseOffActive, getLastRaw, reset };
