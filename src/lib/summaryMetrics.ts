import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import type { SessionRecordFull } from '@/data/storage';

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
export function gentlenessStat(results: SessionRecordFull['results']): {
  gentle: number;
  total: number;
} {
  let gentle = 0;
  let total = 0;
  for (const result of results) {
    for (const rep of result.reps) {
      total += 1;
      if (rep.easeOffTriggered === 0) {
        gentle += 1;
      }
    }
  }
  return { gentle, total };
}
