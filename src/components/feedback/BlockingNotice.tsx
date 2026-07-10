import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BlockingNoticeProps {
  title: string;
  body: string;
  className?: string;
  onTryDemo?: () => void;
  demoLabel?: string;
  showDemo?: boolean;
  children?: ReactNode;
}

export function BlockingNotice({
  title,
  body,
  className,
  onTryDemo,
  demoLabel,
  showDemo = false,
  children,
}: BlockingNoticeProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-destructive/30 bg-destructive/5 p-5 motion-safe:animate-fade-in',
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            {body}
          </p>
          {children}
          {showDemo && onTryDemo && demoLabel ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-2 w-full sm:w-auto"
              onClick={onTryDemo}
            >
              {demoLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
