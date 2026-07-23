// src/dev/DebugHud.tsx — live pipeline introspection + CSV capture (docs/IMPLEMENTATION.md
// Task 8). Dev-only: src/dev/ is excluded from production bundles (import.meta.env.DEV
// dead-branch elimination, same mechanism as CaptureHarness); additionally gated at runtime by
// VITE_ENABLE_DEBUG_HUD (docs/ARCHITECTURE.md §9).
//
// There is no SessionController yet (Task 11) to own the hot-path wiring, so this harness plays
// that role temporarily — same precedent as CaptureHarness wiring CaptureService+LandmarkEngine
// directly in Tasks 3/4. The QualityMonitor-gates-NormalizationLayer rule (API.md §6, this
// codebase's non-negotiable) is honored the same way it will be in SessionController:
// NormalizationLayer.normalize() is called only inside the `qualityState === 'QUALITY_OK'`
// branch below.
import { useEffect, useRef, useState } from 'react';
import { CaptureService } from '../sensing/capture.ts';
import { LandmarkEngine } from '../sensing/landmarks.ts';
import { QualityMonitor, type QualityState } from '../sensing/quality.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { MetricEngine, type MetricSample } from '../metrics/metrics.ts';
import { RepDetector, type RepState } from '../metrics/reps.ts';
import { StorageService } from '../data/storage.ts';
import type { CalibrationBaseline, ExerciseId } from '../data/schema.ts';
import { exercises } from '../config/exercises.ts';
import { MirrorWellError } from '../data/errors.ts';
import { seedDev } from './seed.ts';
import { toCsv, type DebugHudRow } from './csv.ts';

const EXERCISE_IDS = Object.keys(exercises) as ExerciseId[];
const RECORD_DURATION_MS = 30_000;

function downloadCsv(rows: DebugHudRow[]): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mirrorwell-debughud-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DebugHud({ cameraControls = true }: { cameraControls?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedVideoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerReadyRef = useRef(false);
  const frameTimesRef = useRef<number[]>([]);
  const recordingRef = useRef(false);
  const recordedRowsRef = useRef<DebugHudRow[]>([]);
  const exerciseIdRef = useRef<ExerciseId>('EX_SMILE');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<MirrorWellError | null>(null);
  const [baseline, setBaseline] = useState<CalibrationBaseline | null>(null);
  const [exerciseId, setExerciseId] = useState<ExerciseId>('EX_SMILE');
  const [fps, setFps] = useState(0);
  const [qualityState, setQualityState] = useState<QualityState | null>(null);
  const [sample, setSample] = useState<MetricSample | null>(null);
  const [repState, setRepState] = useState<RepState>('idle');
  const [recording, setRecording] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    exerciseIdRef.current = exerciseId;
    MetricEngine.reset();
    RepDetector.reset();
  }, [exerciseId]);

  useEffect(() => {
    StorageService.getActiveBaseline().then((b) => {
      if (b) {
        setBaseline(b);
        NormalizationLayer.setBaseline(b);
        MetricEngine.setBaseline(b);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribe = CaptureService.onFrame((video, timestampMs) => {
      if (cameraControls && containerRef.current && mountedVideoRef.current !== video) {
        containerRef.current.replaceChildren(video);
        mountedVideoRef.current = video;
      }

      const times = frameTimesRef.current;
      times.push(timestampMs);
      const cutoff = timestampMs - 1000;
      while (times.length > 0 && times[0]! < cutoff) times.shift();
      const currentFps = times.length;
      setFps(currentFps);

      if (!landmarkerReadyRef.current) return;

      let lf = null;
      try {
        lf = LandmarkEngine.detect(video, timestampMs);
      } catch {
        lf = null; // INFERENCE_FAILED absorbed as FACE_LOST, same as QualityMonitor's own rule
      }

      const qr = QualityMonitor.evaluate(video, lf);
      setQualityState(qr.state);

      let raw: MetricSample | null = null;
      let smoothed: MetricSample | null = null;
      let currentRepState: RepState = RepDetector.getState();

      if (qr.state === 'QUALITY_OK' && baseline) {
        const nf = NormalizationLayer.normalize(qr.frame);
        smoothed = MetricEngine.compute(nf, exerciseIdRef.current);
        const lastRaw = MetricEngine.getLastRaw();
        raw = lastRaw ? { ...lastRaw, timestampMs: nf.timestampMs } : null;
        RepDetector.feed(smoothed);
        currentRepState = RepDetector.getState();
        setSample(smoothed);
        setRepState(currentRepState);
      }

      if (recordingRef.current) {
        recordedRowsRef.current.push({
          timestampMs,
          exerciseId: exerciseIdRef.current,
          qualityState: qr.state,
          symmetryIndexRaw: raw?.symmetryIndex ?? null,
          symmetryIndexSmoothed: smoothed?.symmetryIndex ?? null,
          effortIndexRaw: raw?.effortIndex ?? null,
          effortIndexSmoothed: smoothed?.effortIndex ?? null,
          repState: currentRepState,
          fps: currentFps,
        });
      }
    });
    return () => {
      unsubscribe();
      if (cameraControls) CaptureService.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, cameraControls]);

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
    setQualityState(null);
    setSample(null);
    setRepState('idle');
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDev();
      const b = await StorageService.getActiveBaseline();
      if (b) {
        setBaseline(b);
        NormalizationLayer.setBaseline(b);
        MetricEngine.setBaseline(b);
      }
    } finally {
      setSeeding(false);
    }
  }

  function handleRecord() {
    recordedRowsRef.current = [];
    recordingRef.current = true;
    setRecording(true);
    setTimeout(() => {
      recordingRef.current = false;
      setRecording(false);
      downloadCsv(recordedRowsRef.current);
    }, RECORD_DURATION_MS);
  }

  return (
    <div>
      <h2>DebugHud</h2>
      <label>
        Exercise:{' '}
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value as ExerciseId)}>
          {EXERCISE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>{' '}
      {cameraControls && (
        <>
          <button onClick={handleStart} disabled={running}>
            Start
          </button>
          <button onClick={handleStop} disabled={!running}>
            Stop
          </button>
        </>
      )}
      <button onClick={handleSeed} disabled={seeding}>
        Seed
      </button>
      <button onClick={handleRecord} disabled={!running || recording}>
        {recording ? 'Recording…' : 'Record 30s CSV'}
      </button>
      {!baseline && <p role="status">No active baseline — click Seed.</p>}
      {error && (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      )}
      <p>
        fps: {fps} | quality: {qualityState ?? '—'} | repState: {repState}
      </p>
      <p>
        symmetryIndex (smoothed): {sample?.symmetryIndex ?? '—'} | effortIndex (smoothed): {sample?.effortIndex ?? '—'}
      </p>
      {cameraControls && (
        <div ref={containerRef} style={{ position: 'relative', width: 640, height: 480 }} />
      )}
    </div>
  );
}
