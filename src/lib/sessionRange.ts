import { thresholds } from '@/config/thresholds';

export interface SessionDateRange {
  from: string;
  to: string;
}

export function sessionLookbackRange(now: Date = new Date()): SessionDateRange {
  const to = now.toISOString();
  const fromDate = new Date(now.getTime());
  fromDate.setUTCDate(
    fromDate.getUTCDate() - thresholds.home.sessionLookbackDays,
  );
  return { from: fromDate.toISOString(), to };
}

export function sessionRangeFromProfileCreated(
  createdAt: string,
  now: Date = new Date(),
): SessionDateRange {
  return { from: createdAt, to: now.toISOString() };
}
