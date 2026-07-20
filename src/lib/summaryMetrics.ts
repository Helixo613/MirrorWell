import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import type { RepMetric } from '@/data/schema';

/** Plain-language symmetry label for summary bars — no numeric grades. */
export function symmetryPlainLabel(value: number | null): string {
  if (value === null) {
    return strings.summary.symmetry.noMovement;
  }

  const { symmetryMostlyEvenMin, symmetryFairlyEvenMin, symmetrySomeDifferenceMin } =
    thresholds.summary;

  if (value >= symmetryMostlyEvenMin) {
    return strings.summary.symmetry.mostlyEven;
  }
  if (value >= symmetryFairlyEvenMin) {
    return strings.summary.symmetry.fairlyEven;
  }
  if (value >= symmetrySomeDifferenceMin) {
    return strings.summary.symmetry.someDifference;
  }
  return strings.summary.symmetry.moreOnOneSide;
}

/** Visual fill ratio for the center-anchored symmetry bar (0–1). */
export function symmetryBarFill(value: number | null): number {
  if (value === null) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

/** Reps completed without an ease-off cue — positive control-practice framing. */
export function gentleRepCounts(reps: RepMetric[]): {
  gentle: number;
  total: number;
} {
  const total = reps.length;
  const gentle = reps.filter((rep) => rep.easeOffTriggered === 0).length;
  return { gentle, total };
}
