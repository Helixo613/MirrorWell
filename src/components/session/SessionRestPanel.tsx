import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SessionRestPanelProps {
  title: string;
  remainingLabel: string;
  motivation?: string;
  extendLabel?: string;
  extendAriaLabel?: string;
  skipLabel?: string;
  skipAriaLabel?: string;
  onExtend?: () => void;
  onSkip?: () => void;
  /** When true, only title and countdown render — actions live in a sticky footer. */
  contentOnly?: boolean;
  className?: string;
}

export function SessionRestPanel({
  title,
  remainingLabel,
  motivation,
  extendLabel,
  extendAriaLabel,
  skipLabel,
  skipAriaLabel,
  onExtend,
  onSkip,
  contentOnly = false,
  className,
}: SessionRestPanelProps) {
  return (
    <section
      aria-labelledby="session-rest-title"
      className={cn(
        'space-y-3 rounded-lg bg-secondary/40 p-5 text-center sm:p-6',
        className,
      )}
    >
      <h2
        id="session-rest-title"
        tabIndex={-1}
        className="text-lg font-medium outline-none"
      >
        {title}
      </h2>
      <p
        className="text-2xl font-medium tabular-nums text-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-valuetext={remainingLabel}
      >
        {remainingLabel}
      </p>
      {motivation ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{motivation}</p>
      ) : null}
      {contentOnly ? null : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            aria-label={extendAriaLabel}
            onClick={onExtend}
          >
            {extendLabel}
          </Button>
          <Button
            type="button"
            size="lg"
            className="w-full"
            aria-label={skipAriaLabel}
            onClick={onSkip}
          >
            {skipLabel}
          </Button>
        </div>
      )}
    </section>
  );
}
