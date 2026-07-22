import { useEffect, useMemo, useRef, useState } from 'react';
import { strings } from '@/config/strings';
import { MirrorWellError } from '@/data/errors';
import { StorageService } from '@/data/storage';
import type { SessionRecordFull } from '@/data/storage';
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
// them); trend BUCKETS remain local-time inside getTrend (ARCHITECTURE §13).
const RANGE_DAYS = 56;

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
        const [loadedAdherence, loadedSessions, loadedTrends] = await Promise.all([
          TrendsService.getAdherence(range),
          StorageService.getSessions(range),
          Promise.all(
            assignedExercises.map((exerciseId) =>
              TrendsService.getTrend(exerciseId, 'monthly'),
            ),
          ),
        ]);
        if (cancelled) {
          return;
        }
        setAdherence(loadedAdherence);
        setSessions(loadedSessions);
        setTrends(loadedTrends);
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
  };
}
