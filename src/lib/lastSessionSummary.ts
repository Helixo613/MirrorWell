import { strings } from '@/config/strings';
import type { EndReason, SessionRecordFull } from '@/data/schema';

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
});

function formatWeekday(startedAt: string): string {
  return WEEKDAY_FORMATTER.format(new Date(startedAt));
}

function summarizeCompleted(
  weekday: string,
  session: SessionRecordFull,
  assignedExerciseCount: number,
): string {
  if (session.results.length >= assignedExerciseCount) {
    return strings.home.lastSession.allExercisesDone(weekday);
  }
  return strings.home.lastSession.sessionCompleted(weekday);
}

const END_REASON_COPY: Record<
  Exclude<EndReason, 'completed'>,
  (weekday: string) => string
> = {
  user_stopped: strings.home.lastSession.stoppedEarly,
  red_flag_stopped: strings.home.lastSession.stoppedForSafety,
  quality_abandoned: strings.home.lastSession.qualityEnded,
};

export function buildLastSessionSummary(
  session: SessionRecordFull,
  assignedExerciseCount: number,
): string {
  const weekday = formatWeekday(session.startedAt);
  if (session.endReason === 'completed') {
    return summarizeCompleted(weekday, session, assignedExerciseCount);
  }
  return END_REASON_COPY[session.endReason](weekday);
}
