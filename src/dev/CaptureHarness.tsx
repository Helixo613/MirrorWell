// src/dev/CaptureHarness.tsx — manual test harness for CaptureService + LandmarkEngine
// (docs/IMPLEMENTATION.md Task 3 Test line + Task 4 Test line: "Harness shows 478 stable dots
// at >= 24 fps end-to-end on the dev laptop"). Dev-only: src/dev/ is excluded from production
// bundles; only mounted from App.tsx behind an import.meta.env.DEV check.
//
// Video and canvas are created and positioned imperatively (not JSX children of containerRef)
// so this manual DOM ownership never fights React's reconciliation of the same nodes.
import { useEffect, useRef, useState } from 'react';
import { CaptureService } from '../sensing/capture.ts';
import { LandmarkEngine } from '../sensing/landmarks.ts';
import { MirrorWellError } from '../data/errors.ts';

function drawLandmarks(canvas: HTMLCanvasElement, video: HTMLVideoElement, landmarks: { x: number; y: number }[]) {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00ff00';
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function CaptureHarness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const landmarkerReadyRef = useRef(false);
  const [fps, setFps] = useState(0);
  const [dotCount, setDotCount] = useState(0);
  const [facePresent, setFacePresent] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<MirrorWellError | null>(null);

  useEffect(() => {
    const unsubscribe = CaptureService.onFrame((video, timestampMs) => {
      if (containerRef.current && mountedVideoRef.current !== video) {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        containerRef.current.replaceChildren(video, canvas);
        mountedVideoRef.current = video;
        canvasElRef.current = canvas;
      }

      const times = frameTimesRef.current;
      times.push(timestampMs);
      const cutoff = timestampMs - 1000;
      while (times.length > 0 && times[0]! < cutoff) times.shift();
      setFps(times.length);

      if (landmarkerReadyRef.current && canvasElRef.current) {
        try {
          const frame = LandmarkEngine.detect(video, timestampMs);
          setFacePresent(frame.facePresent);
          setDotCount(frame.landmarks.length);
          drawLandmarks(canvasElRef.current, video, frame.landmarks);
        } catch {
          // INFERENCE_FAILED: absorbed here same as QualityMonitor does downstream — skip
          // this tick's overlay, keep the loop alive (docs/API.md §16).
        }
      }
    });
    return () => {
      unsubscribe();
      CaptureService.stop();
    };
  }, []);

  async function handleStart() {
    setError(null);
    try {
      if (!LandmarkEngine.isReady()) {
        await LandmarkEngine.init();
        landmarkerReadyRef.current = true;
      }
      await CaptureService.start();
      setRunning(true);
    } catch (err) {
      setError(err instanceof MirrorWellError ? err : new MirrorWellError('CAMERA_UNAVAILABLE', String(err)));
      setRunning(false);
    }
  }

  function handleStop() {
    CaptureService.stop();
    setRunning(false);
    setFps(0);
    setDotCount(0);
    setFacePresent(false);
  }

  return (
    <div>
      <h2>CaptureService + LandmarkEngine dev harness</h2>
      <button onClick={handleStart} disabled={running}>
        Start
      </button>
      <button onClick={handleStop} disabled={!running}>
        Stop
      </button>
      <p>
        fps: {fps} | dots: {dotCount} | facePresent: {String(facePresent)}
      </p>
      {error && (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      )}
      <div ref={containerRef} style={{ position: 'relative', width: 640, height: 480 }} />
    </div>
  );
}
