import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { CaptureService } from '@/sensing/capture';
import { LandmarkEngine } from '@/sensing/landmarks';
import { QualityMonitor } from '@/sensing/quality';
import { isMirrorWellError } from '@/data/errors';
import type { QualityState } from '@/types/sensing';

export type CameraPipelineStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'error';

export interface CameraPipelineError {
  code: string;
  recoverable: boolean;
}

export interface UseCameraPipelineResult {
  videoRef: RefObject<HTMLVideoElement>;
  quality: QualityState;
  status: CameraPipelineStatus;
  error: CameraPipelineError | null;
  retry: () => void;
}

export function useCameraPipeline(enabled: boolean): UseCameraPipelineResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [quality, setQuality] = useState<QualityState>('FACE_LOST');
  const [status, setStatus] = useState<CameraPipelineStatus>('idle');
  const [error, setError] = useState<CameraPipelineError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      CaptureService.stop();
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const boot = async () => {
      setStatus('initializing');
      setError(null);

      try {
        await LandmarkEngine.init();
        const video = videoRef.current;
        if (!video || cancelled) {
          return;
        }
        await CaptureService.start(undefined, video);
        if (cancelled) {
          return;
        }

        unsubscribe = CaptureService.onFrame((frameVideo, timestampMs) => {
          let lf;
          try {
            lf = LandmarkEngine.detect(frameVideo, timestampMs);
          } catch (err) {
            if (
              isMirrorWellError(err) &&
              err.code === 'INFERENCE_FAILED'
            ) {
              lf = null;
            } else {
              return;
            }
          }
          setQuality(QualityMonitor.evaluate(frameVideo, lf));
        });

        if (!cancelled) {
          setStatus('ready');
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (isMirrorWellError(err)) {
          setError({ code: err.code, recoverable: err.recoverable });
        } else {
          setError({ code: 'CAMERA_UNAVAILABLE', recoverable: true });
        }
        setStatus('error');
      }
    };

    void boot();

    return () => {
      cancelled = true;
      unsubscribe?.();
      CaptureService.stop();
    };
  }, [enabled, attempt]);

  return { videoRef, quality, status, error, retry };
}
