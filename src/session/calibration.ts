import { thresholds } from '@/config/thresholds';
import type { ExerciseId } from '@/data/schema';
import { MirrorWellError } from '@/data/errors';
import { MetricEngine } from '@/metrics/metrics';
import {
  medianNeutralStats,
  NormalizationLayer,
} from '@/metrics/normalize';
import { CaptureService } from '@/sensing/capture';
import { LandmarkEngine } from '@/sensing/landmarks';
import { QualityMonitor, resetJitterBuffer } from '@/sensing/quality';
import { SettingsService } from '@/data/settings';
import { SafetyGate } from '@/session/safety';
import type { NeutralStats } from '@/types/sensing';

export interface CalibrationProgress {
  phase: 'neutral' | 'comfortableMax' | 'noiseFloor';
  step: number;
  totalSteps: number;
  secondsRemaining?: number;
  exerciseId?: ExerciseId;
}

export type CalibrationProgressCallback = (
  progress: CalibrationProgress,
) => void;

interface NeutralSession {
  captureStats: NeutralStats[];
  okFrames: number;
  totalFrames: number;
}

let sessionNeutralStats: NeutralStats | null = null;
let neutralSession: NeutralSession | null = null;

function assertAttested(): void {
  if (SafetyGate.isDemoMode()) {
    return;
  }
}

async function assertAttestedAsync(): Promise<void> {
  if (SafetyGate.isDemoMode()) {
    return;
  }
  const attested = await SafetyGate.isAttested();
  if (!attested) {
    throw new MirrorWellError('NOT_ATTESTED', 'Not attested', true);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTimedCapture(
  durationMs: number,
  onProgress?: CalibrationProgressCallback,
  progress?: Omit<CalibrationProgress, 'secondsRemaining'>,
  exerciseId?: ExerciseId,
): Promise<{
  okFrames: number;
  totalFrames: number;
  neutralSamples: NeutralStats[];
  repPeak: number;
}> {
  const video = CaptureService.getVideoElement();
  if (!video) {
    throw new MirrorWellError('CAMERA_UNAVAILABLE', 'No video element', true);
  }

  let okFrames = 0;
  let totalFrames = 0;
  const neutralSamples: NeutralStats[] = [];
  let repPeak = 0;

  const started = performance.now();
  const endAt = started + durationMs;

  while (performance.now() < endAt) {
    const remaining = Math.ceil((endAt - performance.now()) / 1000);
    if (progress && onProgress) {
      onProgress({ ...progress, secondsRemaining: Math.max(0, remaining) });
    }

    const timestampMs = performance.now();
    let lf;
    try {
      lf = LandmarkEngine.detect(video, timestampMs);
    } catch (error) {
      if (
        error instanceof MirrorWellError &&
        error.code === 'INFERENCE_FAILED'
      ) {
        lf = null;
      } else {
        throw error;
      }
    }

    const quality = QualityMonitor.evaluate(video, lf);
    totalFrames += 1;

    if (quality === 'QUALITY_OK' && lf) {
      okFrames += 1;
      const stats = NormalizationLayer.computeNeutralStats(lf, video);
      neutralSamples.push(stats);

      if (sessionNeutralStats && exerciseId) {
        const nf = NormalizationLayer.normalize(lf, video);
        repPeak = Math.max(
          repPeak,
          NormalizationLayer.peakDisplacementForExercise(nf, exerciseId),
        );
      }
    }

    await sleep(33);
  }

  return { okFrames, totalFrames, neutralSamples, repPeak };
}

function qualityScore(ok: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return ok / total;
}

function assertQuality(score: number): void {
  if (score < thresholds.calibration.minQualityScore) {
    throw new MirrorWellError(
      'QUALITY_TOO_LOW',
      `qualityScore ${score.toFixed(2)} < ${thresholds.calibration.minQualityScore}`,
      true,
    );
  }
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export const CalibrationFlow = {
  getSessionNeutralStats(): NeutralStats | null {
    return sessionNeutralStats;
  },

  setSessionNeutralStats(stats: NeutralStats): void {
    sessionNeutralStats = stats;
    NormalizationLayer.setBaseline({
      baselineId: 'in-memory',
      profileId: 'in-memory',
      capturedAt: new Date().toISOString(),
      neutralStats: stats,
      comfortableMax: {},
      qualityScore: 1,
      isActive: 1,
    });
  },

  clearSession(): void {
    sessionNeutralStats = null;
    neutralSession = null;
    NormalizationLayer.clearBaseline();
    resetJitterBuffer();
  },

  beginNeutralSession(): void {
    neutralSession = { captureStats: [], okFrames: 0, totalFrames: 0 };
  },

  async captureNeutralOnce(
    captureIndex: number,
    onProgress?: CalibrationProgressCallback,
  ): Promise<void> {
    await assertAttestedAsync();
    assertAttested();

    if (!neutralSession) {
      CalibrationFlow.beginNeutralSession();
    }

    const durationMs = thresholds.calibration.captureSeconds * 1000;
    const result = await runTimedCapture(
      durationMs,
      onProgress,
      {
        phase: 'neutral',
        step: captureIndex + 1,
        totalSteps: thresholds.calibration.neutralCaptures,
      },
    );

    neutralSession!.okFrames += result.okFrames;
    neutralSession!.totalFrames += result.totalFrames;

    const captureScore = qualityScore(result.okFrames, result.totalFrames);
    assertQuality(captureScore);

    if (result.neutralSamples.length === 0) {
      throw new MirrorWellError('QUALITY_TOO_LOW', 'No valid neutral frames', true);
    }

    neutralSession!.captureStats.push(
      medianNeutralStats(result.neutralSamples),
    );
  },

  finishNeutralSession(): { neutralStats: NeutralStats; qualityScore: number } {
    if (!neutralSession || neutralSession.captureStats.length === 0) {
      throw new MirrorWellError('QUALITY_TOO_LOW', 'No neutral captures', true);
    }

    const score = qualityScore(
      neutralSession.okFrames,
      neutralSession.totalFrames,
    );
    assertQuality(score);

    const neutralStats = medianNeutralStats(neutralSession.captureStats);
    sessionNeutralStats = neutralStats;
    CalibrationFlow.setSessionNeutralStats(neutralStats);
    neutralSession = null;

    return { neutralStats, qualityScore: score };
  },

  async captureNeutral(
    onProgress?: CalibrationProgressCallback,
  ): Promise<{ neutralStats: NeutralStats; qualityScore: number }> {
    CalibrationFlow.beginNeutralSession();
    const captures = thresholds.calibration.neutralCaptures;
    for (let i = 0; i < captures; i += 1) {
      await CalibrationFlow.captureNeutralOnce(i, onProgress);
    }
    return CalibrationFlow.finishNeutralSession();
  },

  async captureComfortableMax(
    exerciseId: ExerciseId,
    onProgress?: CalibrationProgressCallback,
  ): Promise<number> {
    await assertAttestedAsync();
    if (!sessionNeutralStats) {
      throw new MirrorWellError('NO_BASELINE', 'Neutral baseline required', true);
    }

    const reps = thresholds.calibration.comfortableMaxReps;
    const durationMs = thresholds.calibration.captureSeconds * 1000;
    const peaks: number[] = [];

    for (let i = 0; i < reps; i += 1) {
      const result = await runTimedCapture(
        durationMs,
        onProgress,
        {
          phase: 'comfortableMax',
          step: i + 1,
          totalSteps: reps,
          exerciseId,
        },
        exerciseId,
      );

      const score = qualityScore(result.okFrames, result.totalFrames);
      assertQuality(score);
      peaks.push(result.repPeak);
    }

    const comfortableMax = median(peaks);
    if (comfortableMax <= 0) {
      throw new MirrorWellError(
        'QUALITY_TOO_LOW',
        'No comfortable max detected',
        true,
      );
    }

    return comfortableMax;
  },

  async captureComfortableMaxOnce(
    exerciseId: ExerciseId,
    repIndex: number,
    onProgress?: CalibrationProgressCallback,
  ): Promise<number> {
    await assertAttestedAsync();
    if (!sessionNeutralStats) {
      throw new MirrorWellError('NO_BASELINE', 'Neutral baseline required', true);
    }

    const durationMs = thresholds.calibration.captureSeconds * 1000;
    const result = await runTimedCapture(
      durationMs,
      onProgress,
      {
        phase: 'comfortableMax',
        step: repIndex + 1,
        totalSteps: thresholds.calibration.comfortableMaxReps,
        exerciseId,
      },
      exerciseId,
    );

    const score = qualityScore(result.okFrames, result.totalFrames);
    assertQuality(score);
    return result.repPeak;
  },

  async runNoiseFloorSelfTest(
    onProgress?: CalibrationProgressCallback,
  ): Promise<number> {
    await assertAttestedAsync();
    if (!sessionNeutralStats) {
      throw new MirrorWellError('NO_BASELINE', 'Neutral baseline required', true);
    }

    const durationMs = thresholds.calibration.captureSeconds * 1000;
    const symmetrySamples: number[] = [];

    await runTimedCapture(durationMs, onProgress, {
      phase: 'noiseFloor',
      step: 1,
      totalSteps: 1,
    });

    const video = CaptureService.getVideoElement();
    if (video) {
      const started = performance.now();
      while (performance.now() - started < durationMs) {
        let lf;
        try {
          lf = LandmarkEngine.detect(video, performance.now());
        } catch {
          lf = null;
        }
        if (lf && QualityMonitor.evaluate(video, lf) === 'QUALITY_OK') {
          const nf = NormalizationLayer.normalize(lf, video);
          const sample = MetricEngine.compute(nf, 'EX_SMILE');
          if (sample.symmetryIndex !== null) {
            symmetrySamples.push(sample.symmetryIndex);
          }
        }
        await sleep(33);
      }
    }

    let spread = thresholds.metrics.movementFloorPct;
    if (symmetrySamples.length >= 2) {
      const mean =
        symmetrySamples.reduce((a, b) => a + b, 0) / symmetrySamples.length;
      const variance =
        symmetrySamples.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
        symmetrySamples.length;
      spread = Math.sqrt(variance);
    }

    await SettingsService.update({ noiseFloorSymmetry: spread });
    return spread;
  },

  async checkBaselineDrift(): Promise<'ok' | 'recalibrate'> {
    await assertAttestedAsync();
    const baseline = NormalizationLayer.getBaseline();
    if (!baseline) {
      throw new MirrorWellError('NO_BASELINE', 'No active baseline', true);
    }

    const durationMs = thresholds.calibration.captureSeconds * 1000;
    const result = await runTimedCapture(durationMs);
    if (result.neutralSamples.length === 0) {
      return 'recalibrate';
    }

    const observed = medianNeutralStats(result.neutralSamples);
    let maxDrift = 0;
    for (const regionId of Object.keys(observed) as (keyof typeof observed)[]) {
      const ref = baseline.neutralStats[regionId];
      const obs = observed[regionId];
      const leftDrift = Math.abs(obs.left - ref.left) / ref.left;
      const rightDrift = Math.abs(obs.right - ref.right) / ref.right;
      maxDrift = Math.max(maxDrift, leftDrift, rightDrift);
    }

    return maxDrift > thresholds.calibration.driftMaxPct
      ? 'recalibrate'
      : 'ok';
  },
};
