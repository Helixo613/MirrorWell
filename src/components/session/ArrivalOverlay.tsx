import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ArrivalOverlayProps {
  visible: boolean;
  message: string;
  beginLabel: string;
  beginAriaLabel: string;
  stopLabel: string;
  stopAriaLabel: string;
  onBegin: () => void;
  onStop: () => void;
  className?: string;
}

// Full-preview breathing moment before a real session starts (FRONTEND §2.4). Camera stays
// visible behind the semi-transparent scrim — it doubles as warm-up. Never auto-dismisses
// (FRONTEND §4 no time pressure): Begin advances into REPS; Stop is on the overlay itself so
// the live camera is never a trap (header Stop alone was easy to miss under the scrim).
export function ArrivalOverlay({
  visible,
  message,
  beginLabel,
  beginAriaLabel,
  stopLabel,
  stopAriaLabel,
  onBegin,
  onStop,
  className,
}: ArrivalOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-background/70 p-6 text-center',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="arrival-message"
    >
      <div
        aria-hidden="true"
        className="h-24 w-24 rounded-full bg-primary/40 motion-safe:animate-breathe motion-reduce:scale-100"
      />
      <p id="arrival-message" className="max-w-xs text-lg font-medium text-foreground">
        {message}
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full"
          aria-label={beginAriaLabel}
          onClick={onBegin}
        >
          {beginLabel}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-full"
          aria-label={stopAriaLabel}
          onClick={onStop}
        >
          {stopLabel}
        </Button>
      </div>
    </div>
  );
}
