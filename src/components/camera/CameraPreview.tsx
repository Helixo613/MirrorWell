import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CameraPreviewProps {
  className?: string;
  dimmed?: boolean;
  mirrored?: boolean;
  showFaceGuide?: boolean;
  isCapturing?: boolean;
  /** `default` = compact 4:3 (capped at 40vh on phone). `stage` = camera-primary: portrait-ish
   *  and large on phone, wide on desktop. Both never shrink when sibling text appears (shrink-0). */
  variant?: 'default' | 'stage';
}

export const CameraPreview = forwardRef<HTMLVideoElement, CameraPreviewProps>(
  function CameraPreview(
    {
      className,
      dimmed = false,
      mirrored = true,
      showFaceGuide = true,
      isCapturing = false,
      variant = 'default',
    },
    ref,
  ) {
    return (
      <div
        className={cn(
          // shrink-0: the preview must never give up height to sibling text — that was the
          // "camera shrinks when a message appears" bug. Text areas scroll instead.
          'relative w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-opacity duration-200',
          variant === 'stage'
            ? 'aspect-[3/4] max-h-[58vh] sm:aspect-[16/10] sm:max-h-[70vh]'
            : 'aspect-[4/3] max-h-[40vh] sm:max-h-none',
          isCapturing && 'motion-safe:border-primary/50',
          className,
        )}
      >
        <video
          ref={ref}
          playsInline
          muted
          autoPlay
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            mirrored && 'scale-x-[-1]',
            dimmed ? 'opacity-30' : 'opacity-100',
          )}
          aria-hidden
        />
        {showFaceGuide ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div
              className={cn(
                'h-[68%] w-[42%] rounded-[50%] border-2 border-dashed border-primary/40 transition-opacity duration-200',
                dimmed && 'opacity-60',
              )}
            />
          </div>
        ) : null}
      </div>
    );
  },
);
