import { Button } from '@/components/ui/button';
import { SoftPanel } from '@/components/layout/SoftPanel';
import { cn } from '@/lib/utils';

export interface DownloadCardProps {
  title: string;
  description: string;
  actionLabel: string;
  actionAriaLabel: string;
  onDownload: () => void;
  disabled?: boolean;
  className?: string;
}

export function DownloadCard({
  title,
  description,
  actionLabel,
  actionAriaLabel,
  onDownload,
  disabled = false,
  className,
}: DownloadCardProps) {
  return (
    <SoftPanel as="article" className={cn('space-y-3', className)}>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {title}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        aria-label={actionAriaLabel}
        disabled={disabled}
        onClick={onDownload}
      >
        {actionLabel}
      </Button>
    </SoftPanel>
  );
}
