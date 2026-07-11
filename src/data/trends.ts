import { MirrorWellError } from '@/data/errors';
import { SettingsService } from '@/data/settings';
import { StorageService } from '@/data/storage';
import type { EndReason, ExerciseId } from '@/data/schema';
import { periodStartForDate } from '@/lib/trendPeriods';
import type { Adherence, TrendPoint, TrendSeries } from '@/types/trends';

const VALID_EXERCISES: ReadonlySet<ExerciseId> = new Set([
  'EX_BROW_RAISE',
  'EX_EYE_CLOSURE',
  'EX_SMILE',
  'EX_PUCKER',
]);

const EXCLUDED_END_REASONS: ReadonlySet<EndReason> = new Set([
  'quality_abandoned',
  'red_flag_stopped',
]);

function assertExerciseId(exerciseId: ExerciseId): void {
  if (!VALID_EXERCISES.has(exerciseId)) {
    throw new MirrorWellError(
      'VALIDATION_FAILED',
      `unknown exerciseId: ${exerciseId}`,
      true,
    );
  }
}

function markNoiseFloor(points: TrendPoint[], noiseFloor: number): TrendPoint[] {
  return points.map((point, index) => {
    if (index === 0) {
      return { ...point, aboveNoiseFloor: true };
    }
    const previous = points[index - 1].meanSymmetryIndex ?? 0;
    const current = point.meanSymmetryIndex ?? 0;
    return {
      ...point,
      aboveNoiseFloor: Math.abs(current - previous) >= noiseFloor,
    };
  });
}

export const TrendsService = {
  async getTrend(
    exerciseId: ExerciseId,
    granularity: 'weekly' | 'monthly',
  ): Promise<TrendSeries> {
    assertExerciseId(exerciseId);

    const [baseline, settings] = await Promise.all([
      StorageService.getActiveBaseline(),
      SettingsService.get(),
    ]);

    if (!baseline) {
      return {
        exerciseId,
        granularity,
        baselineId: '',
        points: [],
      };
    }

    const sessions = await StorageService.getSessions({
      from: baseline.capturedAt,
      to: new Date().toISOString(),
    });

    const buckets = new Map<
      string,
      { symmetrySum: number; symmetryCount: number; sampleCount: number }
    >();

    for (const session of sessions) {
      if (session.baselineId !== baseline.baselineId) {
        continue;
      }
      if (EXCLUDED_END_REASONS.has(session.endReason)) {
        continue;
      }

      const result = session.results.find(
        (row) => row.exerciseId === exerciseId,
      );
      if (!result || result.meanSymmetryIndex === null) {
        continue;
      }

      const periodStart = periodStartForDate(
        new Date(session.startedAt),
        granularity,
      );
      const bucket = buckets.get(periodStart) ?? {
        symmetrySum: 0,
        symmetryCount: 0,
        sampleCount: 0,
      };
      bucket.symmetrySum += result.meanSymmetryIndex;
      bucket.symmetryCount += 1;
      bucket.sampleCount += 1;
      buckets.set(periodStart, bucket);
    }

    const points: TrendPoint[] = [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([periodStart, bucket]) => ({
        periodStart,
        meanSymmetryIndex: bucket.symmetrySum / bucket.symmetryCount,
        sampleCount: bucket.sampleCount,
        aboveNoiseFloor: true,
      }));

    return {
      exerciseId,
      granularity,
      baselineId: baseline.baselineId,
      points: markNoiseFloor(points, settings.noiseFloorSymmetry),
    };
  },

  async getAdherence(range: {
    from: string;
    to: string;
  }): Promise<Adherence> {
    const sessions = await StorageService.getSessions(range);
    const included = sessions.filter(
      (session) => !EXCLUDED_END_REASONS.has(session.endReason),
    );
    const completed = included.filter(
      (session) => session.endReason === 'completed',
    );

    const weekCounts = new Map<string, number>();
    for (const session of included) {
      const weekStart = periodStartForDate(
        new Date(session.startedAt),
        'weekly',
      );
      weekCounts.set(weekStart, (weekCounts.get(weekStart) ?? 0) + 1);
    }

    const sessionsPerWeek = [...weekCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, count]) => count);

    return {
      sessionsPerWeek,
      completionRate:
        included.length > 0 ? completed.length / included.length : 0,
    };
  },
};
