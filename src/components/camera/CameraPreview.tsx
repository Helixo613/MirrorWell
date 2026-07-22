import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CameraPreviewProps {
  className?: string;
  dimmed?: boolean;
  mirrored?: boolean;
  showFaceGuide?: boolean;
  isCapturing?: boolean;
}

export const CameraPreview = forwardRef<HTMLVideoElement, CameraPreviewProps>(
  function CameraPreview(
    {
      className,
      dimmed = false,
      mirrored = true,
      showFaceGuide = true,
      isCapturing = false,
    },
    ref,
  ) {
    return (
      <div
        className={cn(
          'relative aspect-[4/3] w-full max-h-[40vh] overflow-hidden rounded-lg border border-border bg-muted transition-opacity duration-200 sm:max-h-none',
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
                'h-[55%] w-[45%] rounded-[50%] border-2 border-dashed border-primary/40 transition-opacity duration-200',
                dimmed && 'opacity-60',
              )}
            />
          </div>
        ) : null}
      </div>
    );
  },
);
