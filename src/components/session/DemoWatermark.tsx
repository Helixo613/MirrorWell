import { cn } from '@/lib/utils';

export interface DemoWatermarkProps {
  label: string;
  visible: boolean;
  className?: string;
}

export function DemoWatermark({
  label,
  visible,
  className,
}: DemoWatermarkProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-20 bg-safety/90 px-4 py-2 text-center text-sm font-medium text-safety-foreground',
        className,
      )}
      aria-hidden
    >
      {label}
    </div>
  );
}
