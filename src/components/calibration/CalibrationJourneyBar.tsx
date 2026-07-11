import { strings } from '@/config/strings';
import { SegmentProgress } from '@/components/progress/SegmentProgress';
import { cn } from '@/lib/utils';
import type { CalibrationPhase } from '@/screens/calibration/types';

const JOURNEY_PHASES = ['neutral', 'comfortableMax', 'noiseFloor'] as const;

export type CalibrationJourneyPhase = (typeof JOURNEY_PHASES)[number];

function phaseToJourneyIndex(phase: CalibrationPhase): number {
  if (phase === 'neutral') {
    return 0;
  }
  if (phase === 'comfortableMax') {
    return 1;
  }
  if (phase === 'noiseFloor' || phase === 'saving' || phase === 'complete') {
    return 2;
  }
  return 0;
}

export interface CalibrationJourneyBarProps {
  phase: CalibrationPhase;
  className?: string;
}

export function CalibrationJourneyBar({
  phase,
  className,
}: CalibrationJourneyBarProps) {
  const currentIndex = phaseToJourneyIndex(phase);
  const labels = strings.calibration.journey.labels;
  const label = labels[currentIndex] ?? labels[0];

  return (
    <nav
      className={cn('mb-6', className)}
      aria-label={strings.calibration.journey.progressLabel}
    >
      <SegmentProgress
        total={JOURNEY_PHASES.length}
        completed={currentIndex}
        highlightActive={phase !== 'complete' && phase !== 'saving'}
      />
      <p className="mt-3 text-center text-sm text-muted-foreground">{label}</p>
    </nav>
  );
}
