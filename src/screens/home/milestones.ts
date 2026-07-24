import { thresholds } from '@/config/thresholds';
import type { SessionRecordFull } from '@/data/storage';

export type Milestone = {
  id: 'first_session' | 'sessions_10' | 'sessions_25' | 'weeks_4' | 'gentle_100';
  achieved: boolean;
};

function localDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

export function milestonesFrom(records: SessionRecordFull[]): Milestone[] {
  const dates = records.map((record) => localDate(record.startedAt)).sort((a, b) => a.getTime() - b.getTime());
  const gentleReps = records.flatMap((record) => record.results).flatMap((result) => result.reps).filter((rep) => rep.easeOffTriggered === 0).length;
  const weekSpanDays = dates.length > 0 ? (dates.at(-1)!.getTime() - dates[0].getTime()) / (24 * 60 * 60 * 1000) : 0;

  return [
    { id: 'first_session', achieved: records.length > 0 },
    { id: 'sessions_10', achieved: records.length >= thresholds.home.sessions10 },
    { id: 'sessions_25', achieved: records.length >= thresholds.home.sessions25 },
    { id: 'weeks_4', achieved: weekSpanDays >= thresholds.home.practiceWeeks4Days },
    { id: 'gentle_100', achieved: gentleReps >= thresholds.home.gentleReps100 },
  ];
}
