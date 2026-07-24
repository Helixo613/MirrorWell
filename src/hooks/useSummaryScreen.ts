import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '@/context/useAppState';
import type { SessionRecordFull } from '@/data/storage';
import { StorageService } from '@/data/storage';
import {
  SUMMARY_HEADING_ID,
  type SummaryLocationState,
} from '@/types/summary';

export type SummaryScreenStatus = 'redirecting' | 'ready';

export interface UseSummaryScreenResult {
  status: SummaryScreenStatus;
  record: SessionRecordFull | null;
  isDemo: boolean;
  textScale: number;
  highContrast: boolean;
  handleDone: () => void;
  headingId: string;
  history: SessionRecordFull[];
}

export function useSummaryScreen(): UseSummaryScreenResult {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, gate, profile } = useAppState();
  const [history, setHistory] = useState<SessionRecordFull[]>([]);

  const state = location.state as SummaryLocationState | null;
  const record = state?.record ?? null;
  const isDemo = state?.demo ?? gate === 'DEMO';

  useEffect(() => {
    if (!record) {
      navigate(isDemo ? '/onboarding' : '/home', { replace: true });
    }
  }, [record, navigate, isDemo]);

  useEffect(() => {
    if (record) {
      const heading = document.getElementById(SUMMARY_HEADING_ID);
      heading?.focus({ preventScroll: true });
    }
  }, [record]);

  useEffect(() => {
    if (!record || isDemo || !profile) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    void StorageService.getSessions({
      from: profile.createdAt,
      to: new Date().toISOString(),
    }).then(
      (sessions) => {
        if (!cancelled) setHistory(sessions);
      },
      () => {
        if (!cancelled) setHistory([]);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [record, isDemo, profile]);

  const handleDone = useCallback(() => {
    navigate(isDemo ? '/onboarding' : '/home', { replace: true });
  }, [navigate, isDemo]);

  return {
    status: record ? 'ready' : 'redirecting',
    record,
    isDemo,
    textScale: settings.textScale,
    highContrast: settings.highContrast,
    handleDone,
    headingId: SUMMARY_HEADING_ID,
    history,
  };
}
