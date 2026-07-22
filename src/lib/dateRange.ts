/** Calendar date helpers for export and session queries. */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Format a local calendar date as YYYY-MM-DD. */
export function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string): boolean {
  if (!YMD_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function compareYmd(left: string, right: string): number {
  return left.localeCompare(right);
}

/** Default export window ending today (local calendar). */
export function defaultDateRange(weeks: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - weeks * 7);
  return { from: formatYmd(from), to: formatYmd(to) };
}

function parseYmdParts(ymd: string): [number, number, number] {
  const [year, month, day] = ymd.split('-').map(Number);
  return [year, month, day];
}

/** Local start-of-day as UTC ISO for StorageService.getSessions. */
export function startOfLocalDayIso(ymd: string): string {
  const [year, month, day] = parseYmdParts(ymd);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

/** Local end-of-day as UTC ISO for StorageService.getSessions. */
export function endOfLocalDayIso(ymd: string): string {
  const [year, month, day] = parseYmdParts(ymd);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

export function toSessionQueryRange(range: {
  from: string;
  to: string;
}): { from: string; to: string } {
  return {
    from: startOfLocalDayIso(range.from),
    to: endOfLocalDayIso(range.to),
  };
}
