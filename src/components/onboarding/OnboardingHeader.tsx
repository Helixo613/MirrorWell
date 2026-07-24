import { Button } from '@/components/ui/button';
import { strings } from '@/config/strings';
import { cn } from '@/lib/utils';

export interface OnboardingHeaderProps {
  showBack: boolean;
  backLabel: string;
  backAriaLabel: string;
  onBack?: () => void;
  showDemo?: boolean;
  demoLabel?: string;
  onDemo?: () => void;
  className?: string;
}

export function OnboardingHeader({
  showBack,
  backLabel,
  backAriaLabel,
  onBack,
  showDemo = false,
  demoLabel,
  onDemo,
  className,
}: OnboardingHeaderProps) {
  return (
    <header
      className={cn('mb-md flex min-h-touch items-center justify-between gap-4', className)}
    >
      <div className="flex min-w-0 flex-1 items-center">
        {showBack && onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onBack}
            aria-label={backAriaLabel}
            className="min-h-touch px-2 sm:px-4"
          >
            ← {backLabel}
          </Button>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            {strings.app.name}
          </p>
        )}
      </div>
      {showDemo && onDemo && demoLabel ? (
        <Button
          type="button"
          variant="link"
          size="lg"
          onClick={onDemo}
          className="min-h-touch shrink-0 text-muted-foreground"
        >
          {demoLabel}
        </Button>
      ) : null}
    </header>
  );
}
