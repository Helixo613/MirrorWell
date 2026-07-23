import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface QuickSetupOverlayProps {
  visible: boolean;
  title: string;
  body: string;
  actionLabel: string;
  runningLabel: string;
  isRunning: boolean;
  /** Live prompt for the current capture phase (relax / gentle smile). Shown while running. */
  phaseText?: string | null;
  onStart: () => void;
  className?: string;
}

export function QuickSetupOverlay({
  visible,
  title,
  body,
  actionLabel,
  runningLabel,
  isRunning,
  phaseText,
  onStart,
  className,
}: QuickSetupOverlayProps) {
  if (!visible) {
    return null;
  }

  // While capturing, the full-screen card gives way to a slim live prompt so the user can SEE
  // themselves in the preview and time the gentle rep to the phase text (FRONTEND §2.4). The
  // prompt is aria-live: the phase change is announced without stealing focus.
  if (isRunning) {
    return (
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-30 flex justify-center p-4',
          className,
        )}
      >
        <p
          role="status"
          aria-live="polite"
          className="rounded-md bg-background/90 px-4 py-3 text-center text-base font-medium shadow-sm"
        >
          {phaseText ?? runningLabel}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-30 flex items-center justify-center bg-background/95 p-6',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-setup-title"
    >
      <div className="max-w-sm space-y-4 text-center">
        <h2 id="quick-setup-title" className="text-xl font-semibold">
          {title}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isRunning}
          onClick={onStart}
        >
          {isRunning ? runningLabel : actionLabel}
        </Button>
      </div>
    </div>
  );
}
