import { exercises } from '../config/exercises.ts';
import { thresholds } from '../config/thresholds.ts';
import type { CalibrationBaseline, ExerciseId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { StorageService } from '../data/storage.ts';
import { aggregateNeutral, measureAbsolute, type NeutralStats } from '../metrics/geometry.ts';
import { MetricEngine } from '../metrics/metrics.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { CaptureService } from '../sensing/capture.ts';
import { LandmarkEngine, type LandmarkFrame } from '../sensing/landmarks.ts';
import { QualityMonitor, type ApprovedFrame } from '../sensing/quality.ts';
import { SafetyGate } from './safety.ts';

type FrameSource = (onFrame: (video: HTMLVideoElement, lf: LandmarkFrame | null) => void) => () => void;

type Capture = { total: number; approved: ApprovedFrame[] };

let neutralStats: NeutralStats | null = null;
let neutralQualityScore: number | null = null;
let noiseFloorDisplacement = 0;
let comfortableMax: Partial<Record<ExerciseId, number>> = {};
let comfortableExercise: ExerciseId | null = null;

const frameSource: FrameSource = (onFrame) => {
  const unsubscribe = CaptureService.onFrame((video, timestampMs) => {
    // Narrow: only LandmarkEngine.detect is caught (INFERENCE_FAILED -> null). onFrame is
    // called exactly once, outside the try, so a downstream exception isn't swallowed and
    // re-dispatched as a second, phantom null frame (mirrors src/session/controller.ts).
    let lf: LandmarkFrame | null;
    try {
      lf = LandmarkEngine.detect(video, timestampMs);
    } catch {
      lf = null;
    }
    onFrame(video, lf);
  });
  return () => {
    unsubscribe();
    CaptureService.stop();
  };
};

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

function captureFor(durationMs: number): Promise<Capture> {
  return new Promise((resolve) => {
    const capture: Capture = { total: 0, approved: [] };
    let windowStartMs: number | null = null;
    const stop = frameSource((video, lf) => {
      if (windowStartMs === null && lf) windowStartMs = lf.timestampMs;
      capture.total++;
      const result = QualityMonitor.evaluate(video, lf);
      if (result.state === 'QUALITY_OK') capture.approved.push(result.frame);
      if (windowStartMs !== null && lf && lf.timestampMs - windowStartMs >= durationMs) {
        stop();
        resolve(capture);
      }
    });
  });
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
      .filter((exerciseId) => exercises[exerciseId]!.blendshapePair)
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
    qualityScore: neutralQualityScore!,
    noiseFloorSymmetry,
    noiseFloorDisplacement,
    isActive: 1,
  };
}

async function captureNeutral(): Promise<{ neutralStats: NeutralStats; qualityScore: number }> {
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
  noiseFloorDisplacement = standardDeviation(neutralActivations(capture.approved, profile?.assignedExercises ?? []));
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
  const capture = await captureFor(thresholds.calibration.captureSeconds * 1000);
  const symmetry = capture.approved
    .map((frame) => MetricEngine.compute(NormalizationLayer.normalize(frame), exerciseId).symmetryIndex)
    .filter((value): value is number => value !== null);
  const noiseFloorSymmetry = standardDeviation(symmetry);
  await StorageService.saveBaseline({ ...baseline, noiseFloorSymmetry });
  return noiseFloorSymmetry;
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
