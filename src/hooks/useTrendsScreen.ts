import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EXERCISES } from '@/config/exercises';
import { thresholds } from '@/config/thresholds';
import { strings } from '@/config/strings';
import { isMirrorWellError } from '@/data/errors';
import { SettingsService } from '@/data/settings';
import { TrendsService } from '@/data/trends';
import type { ExerciseId } from '@/data/schema';
import { buildTrendCaption, steadyPeriodLabels } from '@/lib/trendCaption';
import { formatPeriodLabel } from '@/lib/trendPeriods';
import type { AppSettings } from '@/types/app';
import { DEFAULT_SETTINGS } from '@/types/app';
import type {
  TrendGranularity,
  TrendSeries,
  TrendsViewMode,
} from '@/types/trends';
import { TRENDS_HEADING_ID } from '@/types/trends';

export type TrendsScreenStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface UseTrendsScreenResult {
  status: TrendsScreenStatus;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  /** Chart/table should skeleton until loaded series matches the current filters. */
  isDisplayPending: boolean;
  assignedExercises: ExerciseId[];
  selectedExerciseId: ExerciseId | null;
  granularity: TrendGranularity;
  viewMode: TrendsViewMode;
  series: TrendSeries | null;
  caption: string;
  steadyLabels: string[];
  liveAnnouncement: string;
  viewAnnouncement: string;
  settings: AppSettings;
  errorTitle: string | null;
  errorBody: string | null;
  selectExercise: (exerciseId: ExerciseId) => void;
  setGranularity: (granularity: TrendGranularity) => void;
  toggleViewMode: () => void;
}

export function useTrendsScreen(
  assignedExercises: ExerciseId[],
): UseTrendsScreenResult {
  const [status, setStatus] = useState<TrendsScreenStatus>('loading');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] =
    useState<ExerciseId | null>(assignedExercises[0] ?? null);
  const [granularity, setGranularityState] = useState<TrendGranularity>(
    DEFAULT_SETTINGS.trendGranularity,
  );
  const [viewMode, setViewMode] = useState<TrendsViewMode>('chart');
  const [series, setSeries] = useState<TrendSeries | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<string | null>(null);
  const [viewAnnouncement, setViewAnnouncement] = useState('');
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    if (assignedExercises.length === 0) {
      setSelectedExerciseId(null);
      return;
    }
    if (
      !selectedExerciseId ||
      !assignedExercises.includes(selectedExerciseId)
    ) {
      setSelectedExerciseId(assignedExercises[0]);
    }
  }, [assignedExercises, selectedExerciseId]);

  useEffect(() => {
    let cancelled = false;

    async function bootSettings(): Promise<void> {
      try {
        const loadedSettings = await SettingsService.get();
        if (cancelled) {
          return;
        }
        setSettings(loadedSettings);
        setGranularityState(loadedSettings.trendGranularity);
        setSettingsReady(true);
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
        setIsInitialLoading(false);
      }
    }

    void bootSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady || !selectedExerciseId) {
      if (settingsReady && !selectedExerciseId) {
        setStatus('empty');
        setIsInitialLoading(false);
      }
      return;
    }

    let cancelled = false;

    async function loadTrend(): Promise<void> {
      if (hasLoadedOnceRef.current) {
        setIsRefreshing(true);
      } else {
        setStatus('loading');
      }
      setErrorTitle(null);
      setErrorBody(null);

      try {
        const trend = await TrendsService.getTrend(
          selectedExerciseId!,
          granularity,
        );
        if (cancelled) {
          return;
        }

        setSeries(trend);
        setStatus(
          trend.points.length >= thresholds.trends.minPeriodsForChart
            ? 'ready'
            : 'empty',
        );
        hasLoadedOnceRef.current = true;
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
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadTrend();

    return () => {
      cancelled = true;
    };
  }, [settingsReady, selectedExerciseId, granularity]);

  const selectExercise = useCallback((exerciseId: ExerciseId) => {
    setSelectedExerciseId(exerciseId);
  }, []);

  const setGranularity = useCallback(
    async (nextGranularity: TrendGranularity) => {
      if (nextGranularity === granularity) {
        return;
      }

      setIsRefreshing(true);
      try {
        const updated = await SettingsService.update({
          trendGranularity: nextGranularity,
        });
        setSettings(updated);
        setGranularityState(nextGranularity);
      } catch (error) {
        setIsRefreshing(false);
        if (isMirrorWellError(error) && error.code === 'DB_UNAVAILABLE') {
          setErrorTitle(strings.errors.DB_UNAVAILABLE.title);
          setErrorBody(strings.errors.DB_UNAVAILABLE.body);
        } else {
          setErrorTitle(strings.errors.VALIDATION_FAILED.title);
          setErrorBody(strings.errors.VALIDATION_FAILED.body);
        }
        setStatus('error');
      }
    },
    [granularity],
  );

  const toggleViewMode = useCallback(() => {
    setViewMode((mode) => {
      const next = mode === 'chart' ? 'table' : 'chart';
      setViewAnnouncement(
        next === 'chart'
          ? strings.trends.a11y.viewModeChart
          : strings.trends.a11y.viewModeTable,
      );
      return next;
    });
  }, []);

  const exerciseName = selectedExerciseId
    ? EXERCISES[selectedExerciseId].displayName
    : '';

  const seriesMatchesSelection =
    series !== null &&
    selectedExerciseId !== null &&
    series.exerciseId === selectedExerciseId &&
    series.granularity === granularity;

  const isDisplayPending =
    isRefreshing || (status === 'ready' && !seriesMatchesSelection);

  const caption = useMemo(() => {
    if (!series || status !== 'ready' || !seriesMatchesSelection) {
      return '';
    }
    return buildTrendCaption(exerciseName, series.points, series.granularity);
  }, [series, status, exerciseName, seriesMatchesSelection]);

  const steadyLabels = useMemo(() => {
    if (!series || status !== 'ready' || !seriesMatchesSelection) {
      return [];
    }
    return steadyPeriodLabels(series.points, (periodStart) =>
      strings.trends.steadyPillForPeriod(
        formatPeriodLabel(periodStart, series.granularity),
      ),
    );
  }, [series, status, seriesMatchesSelection]);

  const liveAnnouncement = useMemo(() => {
    if (
      status !== 'ready' ||
      !exerciseName ||
      !caption ||
      !seriesMatchesSelection
    ) {
      return '';
    }
    return strings.trends.a11y.announcement(exerciseName, caption);
  }, [status, exerciseName, caption, seriesMatchesSelection]);

  useEffect(() => {
    if (!viewAnnouncement) {
      return;
    }
    const timer = window.setTimeout(() => setViewAnnouncement(''), 1000);
    return () => window.clearTimeout(timer);
  }, [viewAnnouncement]);

  useEffect(() => {
    if (status === 'ready' || status === 'empty') {
      const heading = document.getElementById(TRENDS_HEADING_ID);
      heading?.focus({ preventScroll: true });
    }
  }, [status, selectedExerciseId]);

  return {
    status,
    isInitialLoading,
    isRefreshing,
    isDisplayPending,
    assignedExercises,
    selectedExerciseId,
    granularity,
    viewMode,
    series,
    caption,
    steadyLabels,
    liveAnnouncement,
    viewAnnouncement,
    settings,
    errorTitle,
    errorBody,
    selectExercise,
    setGranularity,
    toggleViewMode,
  };
}
