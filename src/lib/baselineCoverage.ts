import type { CalibrationBaseline, ExerciseId } from '@/data/schema';

/** Exercises in `exerciseIds` that lack a finite, positive `comfortableMax` entry. */
export function missingComfortableMaxExercises(
  comfortableMax: CalibrationBaseline['comfortableMax'] | undefined,
  exerciseIds: readonly ExerciseId[],
): ExerciseId[] {
  return exerciseIds.filter((id) => {
    const value = comfortableMax?.[id];
    return value === undefined || !Number.isFinite(value) || value <= 0;
  });
}

/** True iff every listed exercise has a usable gentle-max entry on the baseline. */
export function baselineCoversExercises(
  comfortableMax: CalibrationBaseline['comfortableMax'] | undefined,
  exerciseIds: readonly ExerciseId[],
): boolean {
  return missingComfortableMaxExercises(comfortableMax, exerciseIds).length === 0;
}
