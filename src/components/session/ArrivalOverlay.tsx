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
  /** Caregiver encouragement note (SAFETY §5 narrow carve-out), display-only text, never parsed;
   *  null when none exists or it has been dismissed. */
  note?: string | null;
  noteHeading?: string;
  dismissNoteLabel?: string;
  dismissNoteAriaLabel?: string;
  onDismissNote?: () => void;
}

// Full-preview breathing moment before a real session (FRONTEND §2.4). Camera stays visible
// as warm-up; Begin advances to REPS; Stop is on the card so the live camera is never a trap.
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
  note,
  noteHeading,
  dismissNoteLabel,
  dismissNoteAriaLabel,
  onDismissNote,
}: ArrivalOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-30 flex flex-col items-center justify-end p-4 pb-5 sm:p-6 sm:pb-6',
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="arrival-message"
    >
      {/* Soft top-to-bottom veil, face stays readable for warm-up, not a flat grey slab. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/25 via-background/40 to-background/85"
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-5">
        {note ? (
          <div className="w-full rounded-2xl border border-border/60 bg-background/95 px-5 py-4 text-center shadow-lg backdrop-blur-sm">
            {noteHeading ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {noteHeading}
              </p>
            ) : null}
            <p className="mt-1 text-balance text-base leading-snug text-foreground">{note}</p>
            {onDismissNote ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-3 text-muted-foreground"
                aria-label={dismissNoteAriaLabel}
                onClick={onDismissNote}
              >
                {dismissNoteLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Ring (not a filled blob), clearer “breathe with this” cue. */}
        <div
          aria-hidden="true"
          className="relative flex h-20 w-20 items-center justify-center motion-safe:animate-breathe motion-reduce:scale-100"
        >
          <span className="absolute inset-0 rounded-full border-2 border-primary/50" />
          <span className="absolute inset-2 rounded-full border border-primary/25" />
          <span className="h-3 w-3 rounded-full bg-primary/70" />
        </div>

        <div className="w-full rounded-2xl border border-border/60 bg-background/95 px-5 py-5 text-center shadow-lg backdrop-blur-sm">
          <p
            id="arrival-message"
            className="text-balance text-lg font-medium leading-snug text-foreground sm:text-xl"
          >
            {message}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
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
              variant="ghost"
              className="w-full text-muted-foreground"
              aria-label={stopAriaLabel}
              onClick={onStop}
            >
              {stopLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
