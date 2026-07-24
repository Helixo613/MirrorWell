// Derived daily-practice encouragement. Presentation-only, computed from session history on
// every render; nothing here is ever stored (ARCHITECTURE §12, "Derived motivation").
//
// This is the narrow carve-out to SAFETY §8 rule 8 ("no streaks"), and the shape of the data is
// what keeps it inside that carve-out:
//   * `days` is only ever a count the user HAS practised. There is no "days remaining", no
//     previous value to compare against, and no representation of a day without practice.
//   * When the run ends, `days` returns to 0 and the UI renders nothing at all. That is why 0 is
//     modelled as a plain absence rather than a state with its own copy: there is no zero screen
//     to write, so no reset message can be written by accident later.
// Read the carve-out in SAFETY §8 before changing this file.
import { thresholds } from '@/config/thresholds';

export type PracticeRhythm = {
  /**
   * Consecutive local calendar days of practice in the run that is still open, counting back
   * from today. 0 when that run is empty, which the UI renders as nothing.
   */
  days: number;
  /** Whether today itself has a session yet. Drives encouragement wording, never a warning. */
  practicedToday: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function localDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * `sessionDates` are local YYYY-MM-DD strings; `today` is the same shape. Dates after `today` are
 * ignored so a clock skew cannot inflate the count.
 *
 * The run is allowed to end at either today or yesterday. Anchoring strictly to today would blank
 * the count for the whole of a day the user simply has not practised yet, and re-showing it after
 * their session would read as "you got it back", which is exactly the loss framing the carve-out
 * exists to avoid. Yesterday's anchor keeps it steady across the day instead.
 */
export function practiceRhythmFrom(sessionDates: string[], today: string): PracticeRhythm {
  const todayDate = localDate(today);
  if (!todayDate) return { days: 0, practicedToday: false };

  const practised = new Set<string>();
  for (const value of sessionDates) {
    const date = localDate(value.slice(0, 10));
    if (date && date <= todayDate) practised.add(dayKey(date));
  }

  const practicedToday = practised.has(dayKey(todayDate));

  // Anchor the walk at today when it has a session, otherwise at yesterday (see above).
  const cursor = new Date(todayDate);
  if (!practicedToday) cursor.setTime(cursor.getTime() - MS_PER_DAY);

  let days = 0;
  while (practised.has(dayKey(cursor))) {
    days += 1;
    cursor.setTime(cursor.getTime() - MS_PER_DAY);
  }

  return { days, practicedToday };
}

/**
 * Whether the count is worth drawing at all. A single day is real practice but reads as noise as a
 * badge, so the badge starts once there is a run to speak of; the "practised today" line below it
 * still acknowledges day one.
 */
export function showsRhythmCount(rhythm: PracticeRhythm): boolean {
  return rhythm.days >= thresholds.home.rhythmMinDays;
}
