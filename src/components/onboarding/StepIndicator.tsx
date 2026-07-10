import { strings } from '@/config/strings';
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
      className={cn('mb-8', className)}
      aria-label={strings.onboarding.progressLabel}
    >
      <div
        role="progressbar"
        aria-valuenow={stepNumber}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={label}
        className="flex gap-1.5"
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const isReached = index <= currentStep;
          return (
            <div
              key={index}
              aria-hidden
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-200',
                isReached ? 'bg-primary' : 'bg-muted-foreground/25',
              )}
            />
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">{label}</p>
    </nav>
  );
}
