import { thresholds } from '@/config/thresholds';

export type PlantStage = 0 | 1 | 2 | 3;

function localDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mondayOf(date: Date): Date {
  const monday = new Date(date);
  const day = monday.getDay() || thresholds.home.daysPerWeek;
  monday.setDate(monday.getDate() - day + 1);
  return monday;
}

export function gardenWeeks(sessionDates: string[], today: string): PlantStage[] {
  const todayDate = localDate(today);
  const weeks = Array<PlantStage>(thresholds.home.gardenWeeks).fill(0);
  if (!todayDate) return weeks;

  const newestMonday = mondayOf(todayDate);
  const oldestMonday = new Date(newestMonday);
  oldestMonday.setDate(
    oldestMonday.getDate() -
      thresholds.home.daysPerWeek * (thresholds.home.gardenWeeks - 1),
  );

  for (const value of sessionDates) {
    const date = localDate(value);
    if (!date || date > todayDate) continue;

    const monday = mondayOf(date);
    if (monday < oldestMonday || monday > newestMonday) continue;

    const index = Math.round(
      (monday.getTime() - oldestMonday.getTime()) /
        (thresholds.home.daysPerWeek * 24 * 60 * 60 * 1000),
    );
    weeks[index] = Math.min(
      thresholds.home.gardenBloomSessions,
      weeks[index] + 1,
    ) as PlantStage;
  }

  return weeks;
}
