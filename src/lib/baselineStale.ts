import { thresholds } from '@/config/thresholds';

/** UTC date-only difference in whole days (FRONTEND §2.3 — no time-of-day). */
export function daysBetweenDateOnly(fromIso: string, toIso: string): number {
  const fromDay = fromIso.slice(0, 10);
  const toDay = toIso.slice(0, 10);
  const fromMs = Date.parse(`${fromDay}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDay}T00:00:00.000Z`);
  return Math.floor((toMs - fromMs) / 86_400_000);
}

/** True when active baseline capturedAt is stale per thresholds.calibration.staleDays. */
export function isBaselineStale(
  capturedAt: string,
  now: Date = new Date(),
): boolean {
  const todayIso = now.toISOString();
  return (
    daysBetweenDateOnly(capturedAt, todayIso) >=
    thresholds.calibration.staleDays
  );
}
