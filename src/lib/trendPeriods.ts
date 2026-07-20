/** Calendar period keys for trend aggregation (local time). */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Returns YYYY-MM-DD for the period containing `date`. */
export function periodStartForDate(
  date: Date,
  granularity: 'weekly' | 'monthly',
): string {
  if (granularity === 'monthly') {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`;
  }

  const monday = new Date(date);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  return formatYmd(monday);
}

export function formatPeriodLabel(
  periodStart: string,
  granularity: 'weekly' | 'monthly',
): string {
  const date = new Date(`${periodStart}T12:00:00`);
  if (granularity === 'monthly') {
    return date.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function parsePeriodStart(periodStart: string): Date {
  return new Date(`${periodStart}T12:00:00`);
}
