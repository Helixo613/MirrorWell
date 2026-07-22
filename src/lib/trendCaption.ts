import { strings } from '@/config/strings';
import type { TrendGranularity, TrendPoint } from '@/types/trends';

function sentenceCaseExercise(name: string): string {
  if (name.length === 0) {
    return name;
  }
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Plain-language caption for the active trend series (FRONTEND §2.6). */
export function buildTrendCaption(
  exerciseName: string,
  points: TrendPoint[],
  granularity: TrendGranularity,
): string {
  const label = sentenceCaseExercise(exerciseName);
  const validPoints = points.filter(
    (point) => point.meanSymmetryIndex !== null,
  );

  if (validPoints.length < 2) {
    return strings.trends.caption.stillCollecting(label);
  }

  const last = validPoints[validPoints.length - 1];
  const first = validPoints[0];
  const delta =
    (last.meanSymmetryIndex ?? 0) - (first.meanSymmetryIndex ?? 0);
  const hasMeaningfulChange = points.some(
    (point, index) => index > 0 && point.aboveNoiseFloor,
  );

  if (delta > 0 && last.aboveNoiseFloor && hasMeaningfulChange) {
    const rangeLabel =
      granularity === 'monthly'
        ? strings.trends.rangeLabel.twoMonths
        : strings.trends.rangeLabel.fewWeeks;
    return strings.trends.caption.gettingMoreEven(label, rangeLabel);
  }

  return strings.trends.caption.holdingSteady(label);
}

export function steadyPeriodLabels(
  points: TrendPoint[],
  formatPeriod: (periodStart: string) => string,
): string[] {
  return points
    .filter((point, index) => index > 0 && !point.aboveNoiseFloor)
    .map((point) => formatPeriod(point.periodStart));
}
