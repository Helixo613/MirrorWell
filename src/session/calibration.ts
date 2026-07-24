import { exercises, assignableExercises } from '../config/exercises.ts';
import { thresholds } from '../config/thresholds.ts';
import type { CalibrationBaseline, ExerciseId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { StorageService } from '../data/storage.ts';
import { aggregateNeutral, measureAbsolute, type NeutralStats } from '../metrics/geometry.ts';
import { MetricEngine } from '../metrics/metrics.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { QualityMonitor, type ApprovedFrame } from '../sensing/quality.ts';
import { log } from '../log.ts';
import { openFrameSource, type FrameHandler } from './frames.ts';
import { SafetyGate } from './safety.ts';

type Capture = { total: number; approved: ApprovedFrame[] };

let neutralStats: NeutralStats | null = null;
let neutralQualityScore: number | null = null;
let noiseFloorDisplacement = 0;
let comfortableMax: Partial<Record<ExerciseId, number>> = {};
// Median NEUTRAL max(mL,mR) per assigned exercise (ARCHITECTURE §7). MediaPipe reports nonzero
// resting activation for some pairs (browOuterUp, eyeBlink), so raw act/comfortableMax keeps a
// resting face permanently above the rep start/end thresholds: a "rep" opens on its own and can
// only close when the user forces the signal to zero with the OPPOSITE movement (furrowing for
// brow raise, eyes wide open for eye closure). effortIndex rebases on this value.
let neutralActivation: Partial<Record<ExerciseId, number>> = {};
let comfortableExercise: ExerciseId | null = null;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

async function assertGated(): Promise<void> {
  if (!(await SafetyGate.isAttested()) && !SafetyGate.isDemoMode()) {
    throw new MirrorWellError('NOT_ATTESTED', 'calibration requires attestation');
  }
}

async function captureFor(durationMs: number): Promise<Capture> {
  const capture: Capture = { total: 0, approved: [] };
  let windowStartMs: number | null = null;
  let closed = false;
  let teardown: (() => void) | null = null;
  let abortError: MirrorWellError | null = null;
  let closeWindow!: () => void;
  const windowClosed = new Promise<void>((resolve) => {
    closeWindow = resolve;
  });

  // Aborting THROWS rather than resolving a partial capture: captureWindows() would otherwise
  // loop straight into the next window and re-open the camera on a screen that is already gone
  // (the hard camera rule, CLAUDE.md). `abortError` is carried out instead of rejecting
  // `windowClosed` so nothing can reject before the `await` below is attached.
  const abort = () => {
    if (closed) return;
    closed = true;
    abortError = new MirrorWellError('CAMERA_UNAVAILABLE', 'camera stopped mid-capture');
    closeWindow();
  };

  // The window opens and closes on the raw CaptureService timestamp, never on lf.timestampMs:
  // under persistent INFERENCE_FAILED (lf === null on every frame) a window guarded by `lf`
  // would never open and never close, hanging the capture. A capture that ends with zero
  // approved frames is already handled downstream (QUALITY_TOO_LOW / minQualityScore).
  const handler: FrameHandler = (video, timestampMs, lf) => {
    if (closed) return;
    if (windowStartMs === null) windowStartMs = timestampMs;
    capture.total++;
    const result = QualityMonitor.evaluate(video, lf);
    if (result.state === 'QUALITY_OK') capture.approved.push(result.frame);
    // Dev-only visibility into the one window that decides QUALITY_TOO_LOW. The screen's own
    // preview loop stands down while capturing, so without this a failing capture is silent.
    // Stripped from production builds (src/log.ts).
    log.debug('Capture', 'frame', {
      state: result.state,
      approved: capture.approved.length,
      total: capture.total,
    });
    if (timestampMs - windowStartMs >= durationMs) {
      // Tear down synchronously, inside the closing frame, so no later frame is counted.
      closed = true;
      teardown?.();
      closeWindow();
    }
  };

  teardown = await openFrameSource(handler, abort);
  if (closed) teardown(); // window closed (or aborted) while the camera was still starting up
  await windowClosed;
  if (abortError) throw abortError;
  return capture;
}

async function captureWindows(count: number): Promise<Capture[]> {
  const captures: Capture[] = [];
  for (let index = 0; index < count; index++) {
    captures.push(await captureFor(thresholds.calibration.captureSeconds * 1000));
  }
  return captures;
}

function activation(frame: ApprovedFrame, exerciseId: ExerciseId): number {
  const pair = exercises[exerciseId]!.blendshapePair;
  if (!pair) throw new MirrorWellError('VALIDATION_FAILED', `no blendshapePair for ${exerciseId}`);
  return Math.max(frame.lf.blendshapes[pair.left] ?? 0, frame.lf.blendshapes[pair.right] ?? 0);
}

function neutralActivations(frames: ApprovedFrame[], assigned: ExerciseId[]): number[] {
  return frames.map((frame) => {
    const values = assigned
      .filter((exerciseId) => assignableExercises.includes(exerciseId))
      .map((exerciseId) => activation(frame, exerciseId));
    return values.length === 0 ? 0 : Math.max(...values);
  });
}

async function makeBaseline(noiseFloorSymmetry: number): Promise<CalibrationBaseline> {
  if (!neutralStats || !comfortableExercise || comfortableMax[comfortableExercise] === undefined) {
    throw new MirrorWellError('NO_BASELINE', 'neutral and comfortable-max calibration are required');
  }
  const profile = await StorageService.getProfile();
  if (!profile) throw new MirrorWellError('VALIDATION_FAILED', 'profile required for calibration');
  return {
    baselineId: crypto.randomUUID(),
    profileId: profile.profileId,
    capturedAt: new Date().toISOString(),
    neutralStats,
    comfortableMax,
    neutralActivation,
    qualityScore: neutralQualityScore!,
    noiseFloorSymmetry,
    noiseFloorDisplacement,
    isActive: 1,
  };
}

async function captureNeutral(): Promise<{ neutralStats: NeutralStats; qualityScore: number }> {
  comfortableMax = {};
  neutralActivation = {};
  comfortableExercise = null;
  await assertGated();
  const profile = await StorageService.getProfile();
  const captures = await captureWindows(thresholds.calibration.neutralCaptures);
  const capture = { total: captures.reduce((sum, item) => sum + item.total, 0), approved: captures.flatMap((item) => item.approved) };
  const qualityScore = capture.total === 0 ? 0 : capture.approved.length / capture.total;
  if (qualityScore < thresholds.calibration.minQualityScore) {
    throw new MirrorWellError('QUALITY_TOO_LOW', 'neutral capture quality too low');
  }
  neutralStats = aggregateNeutral(capture.approved.map(measureAbsolute));
  neutralQualityScore = qualityScore;
  const assigned = profile?.assignedExercises ?? [];
  noiseFloorDisplacement = standardDeviation(neutralActivations(capture.approved, assigned));
  for (const exerciseId of assigned) {
    if (!assignableExercises.includes(exerciseId)) continue;
    // Median (not mean) of per-frame resting activation, robust to blink/expression spikes
    // inside the neutral windows, mirroring the median discipline of comfortableMax.
    neutralActivation[exerciseId] = median(
      capture.approved.map((frame) => activation(frame, exerciseId)),
    );
  }
  return { neutralStats, qualityScore };
}

async function captureComfortableMax(exerciseId: ExerciseId): Promise<number> {
  await assertGated();
  if (!exercises[exerciseId]!.blendshapePair) {
    throw new MirrorWellError('VALIDATION_FAILED', `no blendshapePair for ${exerciseId}`);
  }
  const captures = await captureWindows(thresholds.calibration.neutralCaptures);
  if (captures.some((capture) => capture.approved.length === 0)) {
    throw new MirrorWellError('QUALITY_TOO_LOW', 'comfortable-max capture quality too low');
  }
  const peaks = captures.map((capture) => Math.max(...capture.approved.map((frame) => activation(frame, exerciseId))));
  if (peaks.length < thresholds.calibration.neutralCaptures) {
    throw new MirrorWellError('QUALITY_TOO_LOW', 'comfortable-max capture quality too low');
  }
  const result = median(peaks);
  // Same invariant the demo quick setup enforces (demoComfortableMax): a user who held still
  // through the "gentle movements" windows yields a noise-level median peak, and effortIndex
  // then reads ANY facial motion, including cross-activation from an unrelated movement (e.g.
  // an eye squeeze bleeding into the brow blendshapes), as a full-effort rep. The peak must
  // clear the exercise's RESTING activation (captured in the neutral windows) by at least
  // calibration.comfortableMaxMinRise: an absolute check misses pairs whose resting read is
  // already nonzero (eyeBlink, browOuterUp). This is its own tunable rather than
  // blendshapes.activationFloor (which it used to share) because the value guarded here becomes
  // the denominator of every later effortIndex, so it must stay strict even when the SI
  // activation floor is loosened for sensitivity. See the thresholds.ts comment.
  // QUALITY_TOO_LOW (not NO_BASELINE): CalibrationScreen coaches and retries on this code.
  if (result - (neutralActivation[exerciseId] ?? 0) < thresholds.calibration.comfortableMaxMinRise) {
    throw new MirrorWellError('QUALITY_TOO_LOW', 'comfortable-max capture measured no movement');
  }
  comfortableMax = { ...comfortableMax, [exerciseId]: result };
  comfortableExercise = exerciseId;
  return result;
}

async function runNoiseFloorSelfTest(): Promise<number> {
  await assertGated();
  const baseline = await makeBaseline(0);
  const exerciseId = comfortableExercise!;
  NormalizationLayer.setBaseline(baseline);
  MetricEngine.setBaseline(baseline);
  MetricEngine.reset();
  try {
    const capture = await captureFor(thresholds.calibration.captureSeconds * 1000);
    const symmetry = capture.approved
      .map((frame) => MetricEngine.compute(NormalizationLayer.normalize(frame), exerciseId).symmetryIndex)
      .filter((value): value is number => value !== null);
    const noiseFloorSymmetry = standardDeviation(symmetry);
    await StorageService.saveBaseline({ ...baseline, noiseFloorSymmetry });
    return noiseFloorSymmetry;
  } finally {
    // Tidy-up (M5, Gate 0 T7): don't leave the engines pinned to the throwaway makeBaseline(0)
    // used only to measure the noise floor. Only existing API, NormalizationLayer has
    // clearBaseline(); MetricEngine does not (adding one would be new API §8 surface for a
    // tidy-up), so its own activeBaseline stays pinned to the throwaway, which is harmless:
    // SessionController.start() re-setBaseline()s both engines before any real use
    // (controller.ts), and MetricEngine only reads comfortableMax, identical on both baselines.
    // reset() still clears MetricEngine's smoothing/ease-off state so a later caller (e.g. a
    // stray compute() before the next setBaseline()) doesn't see leftover self-test samples.
    // In `finally` rather than only after the save: a capture/compute/save failure mid-self-test
    // would otherwise leave the engines pinned to the throwaway with no baseline saved at all
    // worse than the success-path leak this task was filed for.
    NormalizationLayer.clearBaseline();
    MetricEngine.reset();
  }
}

async function checkBaselineDrift(): Promise<'ok' | 'recalibrate'> {
  await assertGated();
  const baseline = await StorageService.getActiveBaseline();
  if (!baseline) throw new MirrorWellError('NO_BASELINE', 'no active baseline');
  const capture = await captureFor(thresholds.calibration.captureSeconds * 1000);
  if (capture.approved.length === 0) throw new MirrorWellError('QUALITY_TOO_LOW', 'drift capture quality too low');
  const current = aggregateNeutral(capture.approved.map(measureAbsolute));
  const differences = Object.keys(current).flatMap((region) => {
    const key = region as keyof NeutralStats;
    return ['left', 'right'].map((side) => {
      const direction = side as 'left' | 'right';
      const a = current[key][direction];
      const b = baseline.neutralStats[key][direction];
      return Math.hypot(a.u - b.u, a.v - b.v);
    });
  });
  return median(differences) > thresholds.calibration.driftMaxPct ? 'recalibrate' : 'ok';
}

export const CalibrationFlow = {
  captureNeutral,
  captureComfortableMax,
  runNoiseFloorSelfTest,
  checkBaselineDrift,
};
