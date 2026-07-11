import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SessionStopButtonProps {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}

export function SessionStopButton({
  label,
  ariaLabel,
  onClick,
  className,
}: SessionStopButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      className={cn('min-h-touch shrink-0', className)}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
