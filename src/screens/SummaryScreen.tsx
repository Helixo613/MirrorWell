import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DemoWatermark } from '@/components/session/DemoWatermark';
import { ScreenShell } from '@/components/layout/ScreenShell';
import { EXERCISES } from '@/config/exercises';
import { strings } from '@/config/strings';
import { useAppState } from '@/context/useAppState';
import type { SessionRecordFull } from '@/data/schema';

interface SummaryLocationState {
  record: SessionRecordFull;
  demo?: boolean;
}

export function SummaryScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useAppState();
  const state = location.state as SummaryLocationState | null;
  const record = state?.record;
  const isDemo = state?.demo ?? false;

  const handleDone = useCallback(() => {
    navigate(isDemo ? '/onboarding' : '/home', { replace: true });
  }, [navigate, isDemo]);

  if (!record) {
    navigate('/home', { replace: true });
    return null;
  }

  const firstResult = record.results[0];
  const easeOffTotal = firstResult?.reps.length ?? 0;
  const easeOffCount = firstResult?.easeOffCount ?? 0;

  return (
    <ScreenShell textScale={settings.textScale} className="gap-6">
      <DemoWatermark
        label={strings.summary.demoWatermark}
        visible={isDemo}
      />

      <header className="space-y-2 pt-8">
        <h1 className="text-2xl font-semibold">{strings.summary.title}</h1>
        <p className="text-base text-muted-foreground">
          {strings.summary.encouraging}
        </p>
      </header>

      {firstResult ? (
        <section
          aria-labelledby="summary-result-title"
          className="space-y-3 rounded-lg bg-secondary/40 p-5 sm:p-6"
        >
          <h2 id="summary-result-title" className="text-lg font-medium">
            {EXERCISES[firstResult.exerciseId].displayName}
          </h2>
          <p className="text-base text-muted-foreground">
            {strings.summary.repsDone(firstResult.repsCompleted)}
          </p>
          {easeOffTotal > 0 ? (
            <p className="text-base text-muted-foreground">
              {strings.summary.easeOffLine(easeOffCount, easeOffTotal)}
            </p>
          ) : null}
        </section>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="mt-auto w-full"
        aria-label={
          isDemo
            ? strings.summary.demoDone
            : strings.summary.doneAriaLabel
        }
        onClick={handleDone}
      >
        {isDemo ? strings.summary.demoDone : strings.summary.done}
      </Button>
    </ScreenShell>
  );
}
