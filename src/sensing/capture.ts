import { MirrorWellError } from '@/data/errors';

type FrameCallback = (video: HTMLVideoElement, timestampMs: number) => void;

let videoElement: HTMLVideoElement | null = null;
let mediaStream: MediaStream | null = null;
let running = false;
let frameCallback: FrameCallback | null = null;
let rafId: number | null = null;
let rvfcHandle: number | null = null;

function createHiddenVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  video.autoplay = true;
  return video;
}

function stopFrameLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (
    videoElement &&
    rvfcHandle !== null &&
    'cancelVideoFrameCallback' in videoElement
  ) {
    (
      videoElement as HTMLVideoElement & {
        cancelVideoFrameCallback: (handle: number) => void;
      }
    ).cancelVideoFrameCallback(rvfcHandle);
    rvfcHandle = null;
  }
}

function emitFrame(): void {
  if (!running || !videoElement || !frameCallback) {
    return;
  }
  if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    frameCallback(videoElement, performance.now());
  }
}

function startFrameLoop(): void {
  if (!videoElement) {
    return;
  }

  if ('requestVideoFrameCallback' in videoElement) {
    const schedule = () => {
      if (!running || !videoElement) {
        return;
      }
      rvfcHandle = (
        videoElement as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback(() => {
        emitFrame();
        schedule();
      });
    };
    schedule();
    return;
  }

  const loop = () => {
    if (!running) {
      return;
    }
    emitFrame();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function mapGetUserMediaError(error: unknown): never {
  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : 'UnknownError';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    throw new MirrorWellError('CAMERA_DENIED', 'Camera permission denied', true);
  }
  throw new MirrorWellError(
    'CAMERA_UNAVAILABLE',
    'Camera unavailable',
    true,
  );
}

export const CaptureService = {
  async start(
    constraints?: MediaTrackConstraints,
    displayVideo?: HTMLVideoElement,
  ): Promise<void> {
    if (running) {
      return;
    }

    const video = displayVideo ?? videoElement ?? createHiddenVideo();
    videoElement = video;

    const defaultConstraints: MediaTrackConstraints = {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
      ...constraints,
    };

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: defaultConstraints,
        audio: false,
      });
    } catch (error) {
      mapGetUserMediaError(error);
    }

    video.srcObject = mediaStream;
    await video.play();
    running = true;
    startFrameLoop();
  },

  stop(): void {
    running = false;
    stopFrameLoop();
    frameCallback = null;

    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = null;
    }

    if (videoElement) {
      videoElement.srcObject = null;
      videoElement = null;
    }
  },

  onFrame(callback: FrameCallback): () => void {
    frameCallback = callback;
    return () => {
      if (frameCallback === callback) {
        frameCallback = null;
      }
    };
  },

  isRunning(): boolean {
    return running;
  },

  getVideoElement(): HTMLVideoElement | null {
    return videoElement;
  },
};
