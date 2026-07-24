import { thresholds } from '@/config/thresholds';
import type { ExerciseId } from '@/data/schema';

export type HoldGuidePhase = 'raise' | 'hold' | 'release' | 'easeBack';

export interface HoldGuide {
  phase: HoldGuidePhase;
  holdRemainingMs: number;
}

export function holdGuide(effortIndex: number, elapsedInZoneMs: number): HoldGuide {
  const [zoneLow, zoneHigh] = thresholds.metrics.effortTargetZone;
  const holdRemainingMs = Math.max(thresholds.reps.minDurationMs - elapsedInZoneMs, 0);

  if (effortIndex < zoneLow) return { phase: 'raise', holdRemainingMs };
  if (effortIndex > zoneHigh) return { phase: 'easeBack', holdRemainingMs };
  return {
    phase: holdRemainingMs === 0 ? 'release' : 'hold',
    holdRemainingMs,
  };
}

export function updateZoneTimer(
  effortIndex: number,
  timestampMs: number,
  enteredAtMs: number | null,
  lastTimestampMs: number | null,
) {
  const [zoneLow, zoneHigh] = thresholds.metrics.effortTargetZone;
  const gapReset =
    lastTimestampMs !== null && timestampMs - lastTimestampMs > thresholds.metrics.gapResetMs;
  const nextEnteredAtMs =
    effortIndex >= zoneLow && effortIndex <= zoneHigh
      ? gapReset
        ? timestampMs
        : (enteredAtMs ?? timestampMs)
      : null;
  return {
    enteredAtMs: nextEnteredAtMs,
    elapsedInZoneMs: nextEnteredAtMs === null ? 0 : timestampMs - nextEnteredAtMs,
  };
}

export function shouldShowTeach(
  seenExercises: ReadonlySet<ExerciseId>,
  exerciseId: ExerciseId,
): boolean {
  return !seenExercises.has(exerciseId);
}
