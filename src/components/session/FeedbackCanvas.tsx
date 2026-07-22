import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface FeedbackCanvasProps {
  className?: string;
  onMount?: (canvas: HTMLCanvasElement) => void;
  onUnmount?: () => void;
}

export function FeedbackCanvas({ className, onMount, onUnmount }: FeedbackCanvasProps) {
  const localRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = localRef.current;
      if (!canvas) {
        return;
      }
      onMount?.(canvas);
      return () => {
        onUnmount?.();
      };
    }, [onMount, onUnmount]);

    return (
      <canvas
        ref={localRef}
        className={cn(
          'pointer-events-none absolute inset-0 h-full w-full',
          className,
        )}
        aria-hidden
      />
    );
}
