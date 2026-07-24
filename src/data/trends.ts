// src/data/trends.ts, TrendsService (docs/API.md §12, ARCHITECTURE.md §13, BACKEND.md §1.10).
// Aggregates session_record/exercise_result rows into per-exercise trend series and adherence
// stats. Data access is via StorageService only; no Dexie/db imports here. TrendSeries and
// Adherence are not row types (those are owned by DATABASE.md §2 / schema.ts); as non-row
// canonical types they are defined here, their owning service file.
import type { ExerciseId } from './schema.ts';
import { StorageService } from './storage.ts';
import { MirrorWellError } from './errors.ts';
import { exercises } from '../config/exercises.ts';

export type TrendSeries = {
  exerciseId: ExerciseId;
  granularity: 'weekly' | 'monthly';
  baselineId: string;
  points: Array<{
    periodStart: string; // calendar date in local time, ISO date
    meanSymmetryIndex: number;
    sampleCount: number;
    aboveNoiseFloor: boolean;
  }>;
};

export type Adherence = {
  sessionsPerWeek: number[];
  completionRate: number; // completed sessions / started sessions in range
};

const EXERCISE_IDS = Object.keys(exercises) as ExerciseId[];

// Sessions excluded from all trend aggregation (BACKEND §1.10 / API §12 Rules). Adherence has
// no such exclusion, completionRate counts every session in range, completed or not.
const TREND_EXCLUDED_END_REASONS = new Set(['quality_abandoned', 'red_flag_stopped']);

// getTrend takes no range param (BACKEND §1.10), pull full history and let baseline scoping
// narrow it. Epoch-to-now is a fixed sentinel bound, not a tunable (thresholds.ts owns tunables).
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// periodStart buckets are local-time calendar dates (ARCHITECTURE §13). Weekly buckets are
// Monday-start calendar weeks; a documented choice, not specified verbatim by the docs.
//
// Returns a Date, not a string: getAdherence's bucket loop needs to walk period boundaries
// with .getTime()/.setDate(), and re-parsing a formatted "YYYY-MM-DD" key with `new Date(key)`
// reads as UTC midnight (ES2015+ date-only parsing), not local midnight; silently shifting
// every bucket by the local UTC offset in any negative-offset timezone. Callers that need the
// string key call formatDateKey() on the Date this returns instead of reparsing.
function periodStartDate(iso: string, granularity: 'weekly' | 'monthly'): Date {
  const d = new Date(iso);
  if (granularity === 'monthly') {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function bucketStart(iso: string, granularity: 'weekly' | 'monthly'): string {
  return formatDateKey(periodStartDate(iso, granularity));
}

async function getTrend(exerciseId: ExerciseId, granularity: 'weekly' | 'monthly'): Promise<TrendSeries> {
  if (!EXERCISE_IDS.includes(exerciseId)) {
    throw new MirrorWellError('VALIDATION_FAILED', `unknown exerciseId: ${exerciseId}`);
  }

  const activeBaseline = await StorageService.getActiveBaseline();
  if (!activeBaseline) {
    // No baseline yet: nothing to scope a series to. Not one of getTrend's documented errors
    // (API §12 lists only DB_UNAVAILABLE / VALIDATION_FAILED), so return an empty series.
    return { exerciseId, granularity, baselineId: '', points: [] };
  }

  const sessions = await StorageService.getSessions({ from: EPOCH_ISO, to: new Date().toISOString() });

  const buckets = new Map<string, { sum: number; count: number }>();
  for (const session of sessions) {
    if (session.baselineId !== activeBaseline.baselineId) continue; // one series = one baselineId
    if (TREND_EXCLUDED_END_REASONS.has(session.endReason)) continue;

    const result = session.results.find((r) => r.exerciseId === exerciseId);
    if (!result || result.meanSymmetryIndex === null) continue;

    const key = bucketStart(session.startedAt, granularity);
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += result.meanSymmetryIndex;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const points: TrendSeries['points'] = [];
  let previousMean: number | null = null;
  for (const key of [...buckets.keys()].sort()) {
    const { sum, count } = buckets.get(key)!;
    const meanSymmetryIndex = sum / count;
    // Sub-noise-floor period-over-period change reads as "steady" (never up/down), so the
    // comparison is against the magnitude of the change, not its sign (API §12). Equality
    // (delta === noiseFloorSymmetry) is NOT sub-noise-floor: spec says false only when change
    // is strictly < the floor, so >= reads as above. Note: `previousMean` is the last bucket
    // that had a sample, not necessarily the immediately preceding calendar period; an empty
    // middle bucket (no qualifying session that period) is skipped entirely rather than
    // inserted as a zero, so the comparison deliberately spans across the gap to the nearest
    // non-empty period on either side.
    const aboveNoiseFloor =
      previousMean === null
        ? true // no prior period to compare against
        : Math.abs(meanSymmetryIndex - previousMean) >= activeBaseline.noiseFloorSymmetry;
    points.push({ periodStart: key, meanSymmetryIndex, sampleCount: count, aboveNoiseFloor });
    previousMean = meanSymmetryIndex;
  }

  return { exerciseId, granularity, baselineId: activeBaseline.baselineId, points };
}

async function getAdherence(range: { from: string; to: string }): Promise<Adherence> {
  // getSessions validates the range (malformed dates, from > to) and throws VALIDATION_FAILED /
  // DB_UNAVAILABLE; let it propagate untouched, before any date math runs on a bad range.
  const sessions = await StorageService.getSessions(range);

  const total = sessions.length;
  const completed = sessions.filter((s) => s.endReason === 'completed').length;
  // No sessions in range: report 0 rather than NaN (0/0); an empty range has no adherence to
  // measure, and a UI-bound percentage should never render NaN.
  const completionRate = total === 0 ? 0 : completed / total;

  const sessionsPerWeek: number[] = [];
  const cursor = periodStartDate(range.from, 'weekly');
  const end = periodStartDate(range.to, 'weekly');
  while (cursor.getTime() <= end.getTime()) {
    const key = formatDateKey(cursor);
    sessionsPerWeek.push(sessions.filter((s) => bucketStart(s.startedAt, 'weekly') === key).length);
    cursor.setDate(cursor.getDate() + 7);
  }

  return { sessionsPerWeek, completionRate };
}

export const TrendsService = { getTrend, getAdherence };
