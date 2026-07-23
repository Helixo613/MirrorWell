// src/screens/session/demoQuickSetup.ts — the inline "quick setup" for Demo Mode (ARCHITECTURE
// §11, FRONTEND §2.4). Demo's SessionController.start() sets placeholder profile/baseline ids and
// does NOT setBaseline (controller.ts isDemoMode branch); so before the first REPS frame this
// must build an in-memory baseline and call BOTH NormalizationLayer.setBaseline AND
// MetricEngine.setBaseline (TESTS.md §2). Nothing is persisted.
//
// Capture mirrors CalibrationFlow's private captureFor (src/session/calibration.ts): it reuses
// the idempotent `openFrameSource` seam, which runs LandmarkEngine.detect per frame and owns the
// camera for the window's duration, then releases it — so the camera has exactly one owner at a
// time and is free again before SessionController.start() re-opens it.
import { exercises } from '@/config/exercises';
import { thresholds } from '@/config/thresholds';
import type { CalibrationBaseline, ExerciseId } from '@/data/schema';
import { MirrorWellError } from '@/data/errors';
import { aggregateNeutral, measureAbsolute } from '@/metrics/geometry';
import { MetricEngine } from '@/metrics/metrics';
import { NormalizationLayer } from '@/metrics/normalize';
import { QualityMonitor, type ApprovedFrame } from '@/sensing/quality';
import { openFrameSource, type FrameHandler } from '@/session/frames';
import { demoComfortableMax } from '@/screens/session/sessionHelpers';

// The demo exercise: any assignable exercise (has a validated blendshapePair) — never EX_PUCKER.
export const DEMO_EXERCISE_ID: ExerciseId = 'EX_SMILE';

/** The two capture phases, surfaced so the overlay can tell the user WHEN to smile. Without a
 *  live prompt the neutral and gentle windows run back-to-back invisibly, the user holds still
 *  through both, and the "gentle rep" peak is pure sensor noise (see demoComfortableMax). */
export type QuickSetupPhase = 'neutral' | 'gentle';

interface Capture {
  total: number;
  approved: ApprovedFrame[];
}

// Same window discipline as calibration.captureFor: open/close on the raw CaptureService
// timestamp (never lf.timestampMs) so a persistent no-face run still closes the window and never
// hangs; a window that ends with zero approved frames is handled by the caller.
async function captureWindow(durationMs: number): Promise<Capture> {
  const capture: Capture = { total: 0, approved: [] };
  let windowStartMs: number | null = null;
  let closed = false;
  let teardown: (() => void) | null = null;
  let abortError: MirrorWellError | null = null;
  let closeWindow!: () => void;
  const windowClosed = new Promise<void>((resolve) => {
    closeWindow = resolve;
  });

  // Same abort discipline as calibration.captureFor: the camera stopping mid-window (a
  // SessionScreen unmount during quick setup) is the one thing no arriving frame can close, so
  // openFrameSource releases the subscription and hands the window back here to throw.
  const abort = () => {
    if (closed) return;
    closed = true;
    abortError = new MirrorWellError('CAMERA_UNAVAILABLE', 'camera stopped mid-capture');
    closeWindow();
  };

  const handler: FrameHandler = (video, timestampMs, lf) => {
    if (closed) return;
    if (windowStartMs === null) windowStartMs = timestampMs;
    capture.total += 1;
    const result = QualityMonitor.evaluate(video, lf);
    if (result.state === 'QUALITY_OK') capture.approved.push(result.frame);
    if (timestampMs - windowStartMs >= durationMs) {
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

function gentleActivation(frame: ApprovedFrame, pair: { left: string; right: string }): number {
  return Math.max(frame.lf.blendshapes[pair.left] ?? 0, frame.lf.blendshapes[pair.right] ?? 0);
}

/**
 * Captures ~3 s neutral + a gentle rep, builds an in-memory `CalibrationBaseline`, and sets it on
 * both engines. Throws `NO_BASELINE` (honestly, at build time) if the capture measured nothing —
 * e.g. a faceless device yields zero approved frames, so `comfortableMax` cannot be positive and
 * `aggregateNeutral([])` would produce NaN stats. That loud failure is the designed behaviour
 * (ARCHITECTURE §11): a demo that appears to run while detecting nothing would be worse.
 */
export async function runDemoQuickSetup(
  exerciseId: ExerciseId,
  onPhase?: (phase: QuickSetupPhase) => void,
): Promise<void> {
  const pair = exercises[exerciseId]!.blendshapePair;
  if (!pair) {
    throw new MirrorWellError('VALIDATION_FAILED', `no blendshapePair for demo exercise ${exerciseId}`);
  }

  const windowMs = thresholds.calibration.captureSeconds * 1000;
  onPhase?.('neutral');
  const neutral = await captureWindow(windowMs);
  onPhase?.('gentle');
  const gentle = await captureWindow(windowMs);

  if (neutral.approved.length === 0) {
    throw new MirrorWellError('NO_BASELINE', 'demo quick-setup captured no neutral frames');
  }
  // Median resting activation for the demo pair, from the neutral window — effortIndex rebases
  // on it (ARCHITECTURE §7), same as the real calibration's neutralActivation capture.
  const neutralValues = neutral.approved
    .map((frame) => gentleActivation(frame, pair))
    .sort((a, b) => a - b);
  const mid = Math.floor(neutralValues.length / 2);
  const restingActivation =
    neutralValues.length % 2 === 0
      ? (neutralValues[mid - 1]! + neutralValues[mid]!) / 2
      : neutralValues[mid]!;

  // Throws NO_BASELINE when the gentle rep never rose measurably above the resting read.
  const peak = demoComfortableMax(
    gentle.approved.map((frame) => gentleActivation(frame, pair)),
    restingActivation,
  );

  const neutralStats = aggregateNeutral(neutral.approved.map(measureAbsolute));
  const neutralTotal = neutral.total + gentle.total;
  const approvedTotal = neutral.approved.length + gentle.approved.length;

  const baseline: CalibrationBaseline = {
    baselineId: crypto.randomUUID(),
    profileId: crypto.randomUUID(), // session-local placeholder; demo persists nothing
    capturedAt: new Date().toISOString(),
    neutralStats,
    comfortableMax: { [exerciseId]: peak },
    neutralActivation: { [exerciseId]: restingActivation },
    qualityScore: neutralTotal === 0 ? 1 : approvedTotal / neutralTotal,
    // In-memory only; no noise floor is measured for a demo and nothing reads these (demo does
    // not persist and TrendsService never runs). Must be finite & >= 0 for NormalizationLayer.
    noiseFloorSymmetry: 0,
    noiseFloorDisplacement: 0,
    isActive: 1,
  };

  NormalizationLayer.setBaseline(baseline);
  MetricEngine.setBaseline(baseline);
}
