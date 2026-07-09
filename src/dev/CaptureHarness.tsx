// src/dev/CaptureHarness.tsx — manual test harness for CaptureService (docs/IMPLEMENTATION.md
// Task 3 Test line: "Manual on the dev laptop: preview >= 24 fps; deny permission ->
// CAMERA_DENIED surfaces with retry (no crash); stop() extinguishes the camera light.").
// Dev-only: src/dev/ is excluded from production bundles (README repository structure);
// only mounted from App.tsx behind an import.meta.env.DEV check.
import { useEffect, useRef, useState } from 'react';
import { CaptureService } from '../sensing/capture.ts';
import { MirrorWellError } from '../data/errors.ts';

export function CaptureHarness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const [fps, setFps] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<MirrorWellError | null>(null);

  useEffect(() => {
    const unsubscribe = CaptureService.onFrame((video, timestampMs) => {
      if (containerRef.current && mountedVideoRef.current !== video) {
        containerRef.current.replaceChildren(video);
        mountedVideoRef.current = video;
      }
      const times = frameTimesRef.current;
      times.push(timestampMs);
      const cutoff = timestampMs - 1000;
      while (times.length > 0 && times[0]! < cutoff) times.shift();
      setFps(times.length);
    });
    return () => {
      unsubscribe();
      CaptureService.stop();
    };
  }, []);

  async function handleStart() {
    setError(null);
    try {
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
  }

  return (
    <div>
      <h2>CaptureService dev harness</h2>
      <button onClick={handleStart} disabled={running}>
        Start
      </button>
      <button onClick={handleStop} disabled={!running}>
        Stop
      </button>
      <p>fps: {fps}</p>
      {error && (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      )}
      <div ref={containerRef} />
    </div>
  );
}
