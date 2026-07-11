import { EXERCISES } from '@/config/exercises';
import { thresholds } from '@/config/thresholds';
import type { ExerciseId } from '@/data/schema';
import type { MetricSample, NormalizedFrame } from '@/types/sensing';

export const MetricEngine = {
  compute(nf: NormalizedFrame, exerciseId: ExerciseId): MetricSample {
    const regionId = EXERCISES[exerciseId].regionId;
    const d = nf.regionDisplacements[regionId];
    const maxD = Math.max(d.left, d.right);
    const minD = Math.min(d.left, d.right);

    const movementFloor = thresholds.metrics.movementFloorPct;
    const symmetryIndex =
      maxD < movementFloor ? null : minD / Math.max(maxD, movementFloor);

    const effortIndex = maxD;

    return {
      symmetryIndex,
      effortIndex,
      timestampMs: nf.timestampMs,
    };
  },
};
