import { ALL_REGION_IDS } from '@/config/regions';
import { EXERCISES } from '@/config/exercises';
import type { CalibrationBaseline, ExerciseId, RegionId } from '@/data/schema';
import { MirrorWellError } from '@/data/errors';
import type {
  LandmarkFrame,
  NeutralStats,
  NormalizedFrame,
} from '@/types/sensing';
import { computeRawRegionStats, interOcularPx } from '@/sensing/quality';

let activeBaseline: CalibrationBaseline | null = null;

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

export function medianNeutralStats(
  samples: NeutralStats[],
): NeutralStats {
  const result = {} as NeutralStats;
  for (const regionId of ALL_REGION_IDS) {
    const leftValues = samples.map((s) => s[regionId].left);
    const rightValues = samples.map((s) => s[regionId].right);
    result[regionId] = {
      left: median(leftValues),
      right: median(rightValues),
    };
  }
  return result;
}

function validateBaseline(b: CalibrationBaseline): void {
  if (!b.neutralStats) {
    throw new MirrorWellError('NO_BASELINE', 'Missing neutralStats', true);
  }
  for (const regionId of ALL_REGION_IDS) {
    const entry = b.neutralStats[regionId];
    if (
      !entry ||
      !Number.isFinite(entry.left) ||
      !Number.isFinite(entry.right) ||
      entry.left <= 0 ||
      entry.right <= 0
    ) {
      throw new MirrorWellError('NO_BASELINE', 'Invalid neutralStats', true);
    }
  }
}

function scaleLandmarks(
  lf: LandmarkFrame,
  video: HTMLVideoElement,
): LandmarkFrame {
  const iodNorm = interOcularPx(lf, video) || 1;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const iod = interOcularPx(lf, video) || 1;
  const landmarks = lf.landmarks.map((p) => ({
    x: (p.x * w) / iod,
    y: (p.y * h) / iod,
    z: p.z / iodNorm,
  }));
  return { ...lf, landmarks };
}

export const NormalizationLayer = {
  setBaseline(b: CalibrationBaseline): void {
    validateBaseline(b);
    activeBaseline = b;
  },

  clearBaseline(): void {
    activeBaseline = null;
  },

  getBaseline(): CalibrationBaseline | null {
    return activeBaseline;
  },

  computeNeutralStats(
    lf: LandmarkFrame,
    video: HTMLVideoElement,
  ): NeutralStats {
    const scaled = scaleLandmarks(lf, video);
    return computeRawRegionStats(scaled);
  },

  normalize(lf: LandmarkFrame, video: HTMLVideoElement): NormalizedFrame {
    if (!activeBaseline) {
      throw new MirrorWellError('NO_BASELINE', 'Baseline not set', true);
    }

    const scaled = scaleLandmarks(lf, video);
    const raw = computeRawRegionStats(scaled);
    const regionDisplacements = {} as Record<
      RegionId,
      { left: number; right: number }
    >;

    for (const regionId of ALL_REGION_IDS) {
      const neutral = activeBaseline.neutralStats[regionId];
      regionDisplacements[regionId] = {
        left: Math.max(0, raw[regionId].left - neutral.left),
        right: Math.max(0, raw[regionId].right - neutral.right),
      };
    }

    return {
      regionDisplacements,
      timestampMs: lf.timestampMs,
    };
  },

  peakDisplacementForExercise(
    nf: NormalizedFrame,
    exerciseId: ExerciseId,
  ): number {
    const regionId = EXERCISES[exerciseId].regionId;
    const d = nf.regionDisplacements[regionId];
    return Math.max(d.left, d.right);
  },
};
