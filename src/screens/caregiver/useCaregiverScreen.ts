import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { strings } from '@/config/strings';
import { thresholds } from '@/config/thresholds';
import { MirrorWellError } from '@/data/errors';
import { StorageService } from '@/data/storage';
import type { SessionRecordFull } from '@/data/storage';
import type { EncouragementNote } from '@/data/schema';
import { TrendsService } from '@/data/trends';
import type { Adherence, TrendSeries } from '@/data/trends';
import type { ExerciseId } from '@/data/schema';
import { buildLastSessionSummary } from '@/lib/lastSessionSummary';
import { clearlyCapturedFraction } from '@/screens/caregiver/measurementQuality';

export type CaregiverStatus = 'loading' | 'error' | 'empty' | 'ready';

export const CAREGIVER_HEADING_ID = 'caregiver-heading';

// The caregiver view summarises recent practice. Adherence + the last-session line + measurement
// quality are scoped to the last 8 weeks (matching ExportScreen's default window, FRONTEND §2.8);
// per-exercise trends use TrendsService.getTrend, which reads full history scoped to the active
// baseline (it takes no range). The range bounds are UTC ISO timestamps (StorageService requires
// them); trend BUCKETS remain local-time inside getTrend (ARCHITECTURE §13). The window reuses the
// documented export default (thresholds.export.defaultRangeWeeks) rather than a second literal.
const RANGE_DAYS = thresholds.export.defaultRangeWeeks * 7;

export interface UseCaregiverScreenResult {
  status: CaregiverStatus;
  adherence: Adherence | null;
  trends: TrendSeries[];
  lastSessionSummary: string | null;
  /** 0..100 integer, or null when no results have been recorded. */
  clearlyCapturedPct: number | null;
  errorTitle: string | null;
  errorBody: string | null;
  liveAnnouncement: string;
  /** Controlled value for the compose box, pre-filled with the current note (if any). */
  noteText: string;
  setNoteText: (value: string) => void;
  noteSaving: boolean;
  noteSaveFeedback: string | null;
  noteErrorMessage: string | null;
  /** Sole mutating action on this screen (SAFETY §5 narrow carve-out), saves/replaces the
   *  singleton encouragement note. Trims and no-ops on empty text rather than throwing. */
  saveNote: () => Promise<void>;
}

export function useCaregiverScreen(
  assignedExercises: ExerciseId[],
): UseCaregiverScreenResult {
  const [status, setStatus] = useState<CaregiverStatus>('loading');
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [trends, setTrends] = useState<TrendSeries[]>([]);
  const [sessions, setSessions] = useState<SessionRecordFull[]>([]);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaveFeedback, setNoteSaveFeedback] = useState<string | null>(null);
  const [noteErrorMessage, setNoteErrorMessage] = useState<string | null>(null);
  const noteFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignedCount = assignedExercises.length;
  // Freeze a single "now" for the load so the from/to bounds are internally consistent.
  const nowMsRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setStatus('loading');
      setErrorTitle(null);
      setErrorBody(null);
      try {
        const now = nowMsRef.current;
        const range = {
          from: new Date(now - RANGE_DAYS * 86_400_000).toISOString(),
          to: new Date(now).toISOString(),
        };
        const [loadedAdherence, loadedSessions, loadedTrends, loadedNote] = await Promise.all([
          TrendsService.getAdherence(range),
          StorageService.getSessions(range),
          Promise.all(
            assignedExercises.map((exerciseId) =>
              TrendsService.getTrend(exerciseId, 'monthly'),
            ),
          ),
          StorageService.getEncouragementNote(),
        ]);
        if (cancelled) {
          return;
        }
        setAdherence(loadedAdherence);
        setSessions(loadedSessions);
        setTrends(loadedTrends);
        setNoteText(loadedNote?.text ?? '');
        const hasData =
          loadedSessions.length > 0 ||
          loadedTrends.some((trend) => trend.points.length > 0);
        setStatus(hasData ? 'ready' : 'empty');
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof MirrorWellError && error.code === 'DB_UNAVAILABLE') {
          setErrorTitle(strings.errors.DB_UNAVAILABLE.title);
          setErrorBody(strings.errors.DB_UNAVAILABLE.body);
        } else {
          setErrorTitle(strings.errors.VALIDATION_FAILED.title);
          setErrorBody(strings.errors.VALIDATION_FAILED.body);
        }
        setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [assignedExercises]);

  useEffect(() => {
    return () => {
      if (noteFeedbackTimerRef.current !== null) {
        clearTimeout(noteFeedbackTimerRef.current);
      }
    };
  }, []);

  const saveNote = useCallback(async () => {
    const text = noteText.trim();
    if (text.length === 0) {
      return;
    }
    setNoteSaving(true);
    setNoteErrorMessage(null);
    try {
      const note: EncouragementNote = {
        noteId: crypto.randomUUID(),
        text,
        createdAt: new Date().toISOString(),
      };
      await StorageService.saveEncouragementNote(note);
      setNoteText(note.text);
      setNoteSaveFeedback(strings.caregiver.note.saved);
      if (noteFeedbackTimerRef.current !== null) {
        clearTimeout(noteFeedbackTimerRef.current);
      }
      noteFeedbackTimerRef.current = setTimeout(() => {
        setNoteSaveFeedback(null);
        noteFeedbackTimerRef.current = null;
      }, thresholds.settings.saveFeedbackDismissMs);
    } catch (error) {
      if (error instanceof MirrorWellError && error.code === 'DB_UNAVAILABLE') {
        setNoteErrorMessage(strings.errors.DB_UNAVAILABLE.body);
      } else {
        setNoteErrorMessage(strings.caregiver.note.saveFailed);
      }
    } finally {
      setNoteSaving(false);
    }
  }, [noteText]);

  // getSessions returns newest-first, so [0] is the most recent session in the window.
  const lastSessionSummary = useMemo(() => {
    if (sessions.length === 0) {
      return null;
    }
    return buildLastSessionSummary(sessions[0], assignedCount);
  }, [sessions, assignedCount]);

  const clearlyCapturedPct = useMemo(() => {
    const fraction = clearlyCapturedFraction(sessions);
    return fraction === null ? null : Math.round(fraction * 100);
  }, [sessions]);

  const liveAnnouncement =
    status === 'ready' ? strings.caregiver.a11y.announcement : '';

  useEffect(() => {
    if (status === 'ready' || status === 'empty') {
      document
        .getElementById(CAREGIVER_HEADING_ID)
        ?.focus({ preventScroll: true });
    }
  }, [status]);

  return {
    status,
    adherence,
    trends,
    lastSessionSummary,
    clearlyCapturedPct,
    errorTitle,
    errorBody,
    liveAnnouncement,
    noteText,
    setNoteText,
    noteSaving,
    noteSaveFeedback,
    noteErrorMessage,
    saveNote,
  };
}
