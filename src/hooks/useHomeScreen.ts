import { useCallback, useEffect, useState } from 'react';
import { isBaselineStale } from '@/lib/baselineStale';
import { baselineCoversExercises } from '@/lib/baselineCoverage';
import { buildLastSessionSummary } from '@/lib/lastSessionSummary';
import {
  sessionLookbackRange,
  sessionRangeFromProfileCreated,
} from '@/lib/sessionRange';
import { strings } from '@/config/strings';
import { MirrorWellError } from '@/data/errors';
import { StorageService } from '@/data/storage';
import type { SessionRecordFull } from '@/data/storage';
import type { ExerciseId } from '@/data/schema';
import { SettingsService } from '@/data/settings';
import type { AppSettings } from '@/types/app';
import { DEFAULT_SETTINGS } from '@/types/app';

export type HomeScreenStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface HomeScreenData {
  status: HomeScreenStatus;
  settings: AppSettings;
  showRecalibration: boolean;
  /** True when there is no active baseline, or it lacks gentle-max for an assigned exercise. */
  needsCalibration: boolean;
  lastSessionSummary: string | null;
  isFirstRun: boolean;
  errorTitle: string | null;
  errorBody: string | null;
  sessions: SessionRecordFull[];
  reload: () => void;
}

export function useHomeScreen(
  profileCreatedAt: string,
  assignedExercises: readonly ExerciseId[],
): HomeScreenData {
  const [status, setStatus] = useState<HomeScreenStatus>('loading');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showRecalibration, setShowRecalibration] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(true);
  const [lastSessionSummary, setLastSessionSummary] = useState<string | null>(
    null,
  );
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecordFull[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const assignedExerciseCount = assignedExercises.length;
  const assignedKey = assignedExercises.join(',');

  useEffect(() => {
    if (!profileCreatedAt) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<void> {
      setStatus('loading');
      setErrorTitle(null);
      setErrorBody(null);

      try {
        const [loadedSettings, baseline, allSessions] = await Promise.all([
          SettingsService.get(),
          StorageService.getActiveBaseline(),
          StorageService.getSessions(
            sessionRangeFromProfileCreated(profileCreatedAt),
          ),
        ]);

        if (cancelled) {
          return;
        }

        setSettings(loadedSettings);
        setSessions(allSessions);
        const complete =
          baseline !== null &&
          baselineCoversExercises(baseline.comfortableMax, assignedExercises);
        setNeedsCalibration(!complete);
        setShowRecalibration(
          complete && baseline !== null && isBaselineStale(baseline.capturedAt),
        );

        const lookbackFrom = sessionLookbackRange().from;
        const recentSessions = allSessions.filter(
          (session) => session.startedAt >= lookbackFrom,
        );

        if (allSessions.length === 0) {
          setLastSessionSummary(null);
          setIsFirstRun(true);
          setStatus('empty');
          return;
        }

        setIsFirstRun(false);
        if (recentSessions.length > 0 && assignedExerciseCount > 0) {
          setLastSessionSummary(
            buildLastSessionSummary(recentSessions[0], assignedExerciseCount),
          );
        } else {
          setLastSessionSummary(null);
        }
        setStatus('ready');
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
  }, [profileCreatedAt, assignedExerciseCount, assignedKey, assignedExercises, reloadToken]);

  return {
    status,
    settings: settings ?? DEFAULT_SETTINGS,
    showRecalibration,
    needsCalibration,
    lastSessionSummary,
    isFirstRun,
    errorTitle,
    errorBody,
    sessions,
    reload,
  };
}
