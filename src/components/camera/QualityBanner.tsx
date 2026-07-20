import { strings } from '@/config/strings';
import { cn } from '@/lib/utils';
import type { QualityState } from '@/sensing/quality';

export interface QualityBannerProps {
  quality: QualityState;
  subdued?: boolean;
  className?: string;
}

export function QualityBanner({
  quality,
  subdued = false,
  className,
}: QualityBannerProps) {
  const message = strings.quality[quality];

  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-lg border border-safety-border bg-safety px-4 py-3 text-base font-medium text-safety-foreground motion-safe:animate-fade-in',
        subdued && 'opacity-90',
        className,
      )}
    >
      {message}
    </div>
  );
}
