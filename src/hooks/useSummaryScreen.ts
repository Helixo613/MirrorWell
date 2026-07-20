import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '@/context/useAppState';
import type { SessionRecordFull } from '@/data/schema';
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
}

export function useSummaryScreen(): UseSummaryScreenResult {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, gate } = useAppState();

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
  };
}
