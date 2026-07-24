import { strings } from '@/config/strings';
import { SegmentProgress } from '@/components/progress/SegmentProgress';
import { cn } from '@/lib/utils';

export interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number;
  className?: string;
  getLabel?: (current: number, total: number) => string;
}

export function StepIndicator({
  totalSteps,
  currentStep,
  className,
  getLabel,
}: StepIndicatorProps) {
  const stepNumber = currentStep + 1;
  const label =
    getLabel?.(stepNumber, totalSteps) ??
    strings.onboarding.stepIndicator(stepNumber, totalSteps);

  return (
    <nav
      className={cn('mb-lg', className)}
      aria-label={strings.onboarding.progressLabel}
    >
      <div
        role="progressbar"
        aria-valuenow={stepNumber}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={label}
      >
        <SegmentProgress
          total={totalSteps}
          completed={currentStep}
          highlightActive
        />
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">{label}</p>
    </nav>
  );
}
