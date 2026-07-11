import type { ExerciseId } from '@/data/schema';

export interface TrendPoint {
  periodStart: string;
  meanSymmetryIndex: number | null;
  sampleCount: number;
  aboveNoiseFloor: boolean;
}

export interface TrendSeries {
  exerciseId: ExerciseId;
  granularity: 'weekly' | 'monthly';
  baselineId: string;
  points: TrendPoint[];
}

export interface Adherence {
  sessionsPerWeek: number[];
  completionRate: number;
}

export type TrendGranularity = TrendSeries['granularity'];

export type TrendsViewMode = 'chart' | 'table';

export const TRENDS_HEADING_ID = 'trends-heading';
