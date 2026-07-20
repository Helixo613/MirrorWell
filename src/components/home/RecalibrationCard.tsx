import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RecalibrationCardProps {
  title: string;
  body: string;
  actionLabel: string;
  actionAriaLabel: string;
  onRecalibrate: () => void;
  className?: string;
}

export function RecalibrationCard({
  title,
  body,
  actionLabel,
  actionAriaLabel,
  onRecalibrate,
  className,
}: RecalibrationCardProps) {
  return (
    <section
      aria-labelledby="recalibration-card-title"
      className={cn(
        'space-y-4 rounded-lg bg-secondary/30 p-5 sm:p-6',
        className,
      )}
    >
      <header className="space-y-2">
        <h2
          id="recalibration-card-title"
          className="text-lg font-semibold leading-snug text-foreground"
        >
          {title}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
      </header>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        aria-label={actionAriaLabel}
        onClick={onRecalibrate}
      >
        {actionLabel}
      </Button>
    </section>
  );
}
