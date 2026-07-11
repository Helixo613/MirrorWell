import { useCallback, useEffect, useState } from 'react';
import { isBaselineStale } from '@/lib/baselineStale';
import { buildLastSessionSummary } from '@/lib/lastSessionSummary';
import {
  sessionLookbackRange,
  sessionRangeFromProfileCreated,
} from '@/lib/sessionRange';
import { strings } from '@/config/strings';
import { isMirrorWellError } from '@/data/errors';
import { StorageService } from '@/data/storage';
import { SettingsService } from '@/data/settings';
import type { AppSettings } from '@/types/app';
import { DEFAULT_SETTINGS } from '@/types/app';

export type HomeScreenStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface HomeScreenData {
  status: HomeScreenStatus;
  settings: AppSettings;
  showRecalibration: boolean;
  lastSessionSummary: string | null;
  isFirstRun: boolean;
  errorTitle: string | null;
  errorBody: string | null;
  reload: () => void;
}

export function useHomeScreen(
  profileCreatedAt: string,
  assignedExerciseCount: number,
): HomeScreenData {
  const [status, setStatus] = useState<HomeScreenStatus>('loading');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showRecalibration, setShowRecalibration] = useState(false);
  const [lastSessionSummary, setLastSessionSummary] = useState<string | null>(
    null,
  );
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

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
        setShowRecalibration(
          baseline !== null && isBaselineStale(baseline.capturedAt),
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
        if (isMirrorWellError(error) && error.code === 'DB_UNAVAILABLE') {
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
  }, [profileCreatedAt, assignedExerciseCount, reloadToken]);

  return {
    status,
    settings: settings ?? DEFAULT_SETTINGS,
    showRecalibration,
    lastSessionSummary,
    isFirstRun,
    errorTitle,
    errorBody,
    reload,
  };
}
