import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface QuickSetupOverlayProps {
  visible: boolean;
  title: string;
  body: string;
  actionLabel: string;
  runningLabel: string;
  isRunning: boolean;
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
  onStart,
  className,
}: QuickSetupOverlayProps) {
  if (!visible) {
    return null;
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
