// src/dev/LiveDemoView.tsx — dev-only live symmetry demo (the finish-line "live demo").
// Records NOTHING: no MediaRecorder, no blob/download, no StorageService, no IndexedDB, no
// frame/landmark logging. Only derived numbers live in memory, and they die with the view.
// Distinct from the fixture-master recorder (LiveV1Harness.tsx) and from product Demo Mode.
// Mounted only behind `import.meta.env.DEV && VITE_ENABLE_LIVE_DEMO === 'true'` via App's
// DevOnly dynamic import (A-REQ-3) — never statically imported from a production module.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CaptureService } from '../sensing/capture.ts';
import { LandmarkEngine } from '../sensing/landmarks.ts';
import { QualityMonitor, type QualityState } from '../sensing/quality.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { MetricEngine } from '../metrics/metrics.ts';
import { measureAbsolute, aggregateNeutral, type AbsoluteFeatures } from '../metrics/geometry.ts';
import { openFrameSource, type FrameHandler } from '../session/frames.ts';
import type { CalibrationBaseline } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { exercises } from '../config/exercises.ts';
import { thresholds } from '../config/thresholds.ts';
import { strings } from '../config/strings.ts';
import {
  decideCaptureWindow,
  describeSymmetry,
  formatActivation,
  isNoiseFloorUsable,
  stdDev,
  MIN_HOLD_SI_SAMPLES,
  MIN_NEUTRAL_SAMPLES,
} from './liveDemoState.ts';

const copy = strings.liveDemo;

// EX_SMILE is the demo arc's exercise (assignable — it has a validated blendshapePair).
// Referencing an exercise id literally is allowed under src/dev/ (no-exercise-branch test).
const DEMO_EXERCISE = 'EX_SMILE' as const;
const PAIR = exercises[DEMO_EXERCISE]!.blendshapePair!;
const CAPTURE_MS = thresholds.calibration.captureSeconds * 1000;
// Provisional comfortableMax: one activation unit, so compute() can run during the hold before
// the real peak is known. Structural, not a tunable.
const PROVISIONAL_MAX = 1;

type Step = 'idle' | 'neutral' | 'holdPrompt' | 'hold' | 'live';

/** Ephemeral, in-memory only. Never persisted, never handed to StorageService. */
function buildEphemeralBaseline(
  neutral: AbsoluteFeatures[],
  comfortableMax: number,
  noiseFloorSymmetry: number,
): CalibrationBaseline {
  return {
    baselineId: 'live-demo-memory',
    profileId: 'live-demo',
    capturedAt: new Date().toISOString(),
    neutralStats: aggregateNeutral(neutral),
    comfortableMax: { [DEMO_EXERCISE]: comfortableMax },
    qualityScore: 1,
    noiseFloorSymmetry,
    noiseFloorDisplacement: 0,
    isActive: 1,
  };
}

export function LiveDemoView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedVideoRef = useRef<HTMLVideoElement | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const stepRef = useRef<Step>('idle');
  // Start of the current capture window, on the frame seam's carried clock (null until the
  // window's first frame arrives). Deltas only: rAF and requestVideoFrameCallback timestamps
  // have different epochs, so an absolute deadline mixed with performance.now() is not valid.
  const windowStartRef = useRef<number | null>(null);
  const neutralAbsRef = useRef<AbsoluteFeatures[]>([]);
  const holdActsRef = useRef<number[]>([]);
  const holdSiRef = useRef<number[]>([]);

  const [step, setStepState] = useState<Step>('idle');
  const [cameraOn, setCameraOn] = useState(false);
  const [quality, setQuality] = useState<QualityState | null>(null);
  const [symmetryIndex, setSymmetryIndex] = useState<number | null>(null);
  const [leftAct, setLeftAct] = useState<number | null>(null);
  const [rightAct, setRightAct] = useState<number | null>(null);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const setStep = useCallback((next: Step) => {
    stepRef.current = next;
    setStepState(next);
  }, []);

  const clearReadings = useCallback(() => {
    setSymmetryIndex(null);
    setLeftAct(null);
    setRightAct(null);
  }, []);

  const handleFrame = useCallback<FrameHandler>(
    (video, timestampMs, lf) => {
      if (containerRef.current && mountedVideoRef.current !== video) {
        containerRef.current.replaceChildren(video);
        mountedVideoRef.current = video;
      }

      const qr = QualityMonitor.evaluate(video, lf);
      setQuality(qr.state);
      const current = stepRef.current;
      const ok = qr.state === 'QUALITY_OK';
      if (!ok) clearReadings();

      if (current === 'idle' || current === 'holdPrompt') {
        clearReadings();
        return;
      }

      // Phase 1 — collect. Only a QUALITY_OK frame can contribute a sample, and an inference
      // failure costs this frame's sample, nothing more.
      if (ok) {
        if (current === 'neutral') {
          neutralAbsRef.current.push(measureAbsolute(qr.frame));
        } else {
          try {
            const nf = NormalizationLayer.normalize(qr.frame);
            const l = nf.blendshapes[PAIR.left] ?? 0;
            const r = nf.blendshapes[PAIR.right] ?? 0;
            setLeftAct(l);
            setRightAct(r);
            const sample = MetricEngine.compute(nf, DEMO_EXERCISE);
            setSymmetryIndex(sample.symmetryIndex);
            if (current === 'hold') {
              holdActsRef.current.push(Math.max(l, r));
              const raw = MetricEngine.getLastRaw();
              if (raw?.symmetryIndex != null) holdSiRef.current.push(raw.symmetryIndex);
            }
          } catch {
            // NO_BASELINE / transient — no reading for this frame, never a substituted guess.
            clearReadings();
          }
        }
      }

      if (current === 'live') return;

      // Phase 2 — deadline. Evaluated on EVERY frame: outside the quality branch and outside
      // the inference try, so a window that collected data and then went bad still finalizes
      // instead of hanging in "Capturing…".
      windowStartRef.current ??= timestampMs;
      const decision = decideCaptureWindow(
        timestampMs - windowStartRef.current,
        CAPTURE_MS,
        current === 'neutral' ? neutralAbsRef.current.length : holdSiRef.current.length,
        current === 'neutral' ? MIN_NEUTRAL_SAMPLES : MIN_HOLD_SI_SAMPLES,
      );
      if (decision === 'keep_waiting') return;

      if (current === 'neutral') {
        if (decision === 'error') {
          setError(copy.noNeutralFrames);
          setStep('idle');
          return;
        }
        // The provisional baseline is built by beginHold, so every hold attempt starts from
        // the same normalization state.
        setStep('holdPrompt');
        return;
      }

      const floor = stdDev(holdSiRef.current);
      if (decision === 'error' || !isNoiseFloorUsable(floor)) {
        setError(copy.setupTooShort);
        setStep('holdPrompt');
        return;
      }
      const peak = Math.max(...holdActsRef.current, thresholds.blendshapes.activationFloor);
      const baseline = buildEphemeralBaseline(neutralAbsRef.current, peak, floor);
      NormalizationLayer.setBaseline(baseline);
      MetricEngine.setBaseline(baseline);
      MetricEngine.reset();
      setNoiseFloor(floor);
      setStep('live');
    },
    [clearReadings, setStep],
  );

  // Camera may be open only while this view is mounted (CLAUDE.md non-negotiable).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardownRef.current?.();
      teardownRef.current = null;
      // ponytail: unconditional stop — the safety rule outranks openFrameSource's
      // stop-only-if-I-started ownership when this view goes away.
      CaptureService.stop();
      NormalizationLayer.clearBaseline();
      MetricEngine.reset();
    };
  }, []);

  async function startCamera(): Promise<void> {
    setError(null);
    try {
      if (!LandmarkEngine.isReady()) await LandmarkEngine.init();
      // Unmount can land inside either await. The stream may be open only while this view is
      // mounted, so bail after both — never pin a teardown (or state) on a dead component.
      if (!mountedRef.current) {
        CaptureService.stop();
        return;
      }
      if (!teardownRef.current) {
        const teardown = await openFrameSource(handleFrame);
        if (!mountedRef.current) {
          teardown();
          CaptureService.stop();
          return;
        }
        teardownRef.current = teardown;
      }
      setCameraOn(true);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof MirrorWellError ? `${e.code}: ${e.message}` : String(e));
    }
  }

  function stopCamera(): void {
    teardownRef.current?.();
    teardownRef.current = null;
    CaptureService.stop();
    setCameraOn(false);
    setQuality(null);
    clearReadings();
  }

  function beginNeutral(): void {
    setError(null);
    neutralAbsRef.current = [];
    holdActsRef.current = [];
    holdSiRef.current = [];
    setNoiseFloor(0);
    NormalizationLayer.clearBaseline();
    MetricEngine.reset();
    clearReadings();
    windowStartRef.current = null;
    setStep('neutral');
  }

  function beginHold(): void {
    setError(null);
    holdActsRef.current = [];
    holdSiRef.current = [];
    setNoiseFloor(0);
    // Provisional baseline, rebuilt per attempt: comfortableMax = 1 activation unit so
    // compute() runs during the hold. Rebuilding here also clears a previous attempt's
    // finished baseline instead of leaving it pinned.
    const provisional = buildEphemeralBaseline(neutralAbsRef.current, PROVISIONAL_MAX, 0);
    NormalizationLayer.setBaseline(provisional);
    MetricEngine.setBaseline(provisional);
    MetricEngine.reset();
    windowStartRef.current = null;
    setStep('hold');
  }

  const display = describeSymmetry(step === 'live' ? symmetryIndex : null);

  const shell: CSSProperties = {
    border: '2px solid #333',
    padding: 16,
    marginTop: 16,
    maxWidth: 720,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif',
  };
  const btn: CSSProperties = { marginRight: 8, marginBottom: 8, padding: '10px 14px', fontSize: 16 };
  const bigNumber: CSSProperties = { fontSize: 88, fontWeight: 700, lineHeight: 1, margin: 0 };
  const sideNumber: CSSProperties = { fontSize: 40, fontWeight: 600, margin: 0 };

  return (
    <div style={shell}>
      <h2 style={{ marginTop: 0 }}>{copy.title}</h2>
      <p style={{ fontSize: 15 }}>{copy.intro}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={() => void startCamera()} disabled={cameraOn}>
          {copy.startCamera}
        </button>
        <button type="button" style={btn} onClick={stopCamera} disabled={!cameraOn}>
          {copy.stopCamera}
        </button>
        <button
          type="button"
          style={btn}
          onClick={beginNeutral}
          disabled={!cameraOn || step === 'neutral' || step === 'hold'}
        >
          {step === 'live' ? copy.restartSetup : copy.captureNeutral}
        </button>
        <button
          type="button"
          style={btn}
          onClick={beginHold}
          disabled={step !== 'holdPrompt'}
        >
          {copy.captureHold}
        </button>
      </div>

      <p role="status" aria-live="polite" style={{ fontSize: 16 }}>
        <strong>{copy.setupReadyLabel}:</strong>{' '}
        {step === 'live' ? copy.setupReady : copy.setupPending}
        {step === 'neutral' && ` · ${copy.neutralInstruction} ${copy.capturing}`}
        {step === 'holdPrompt' && ` · ${copy.holdInstruction}`}
        {step === 'hold' && ` · ${copy.holdInstruction} ${copy.capturing}`}
        {step === 'live' && ` · ${copy.noiseFloorLabel}: ${noiseFloor.toFixed(3)}`}
      </p>

      {error && (
        <p role="alert" style={{ fontSize: 16 }}>
          {copy.errorPrefix}: {error}
        </p>
      )}

      {/* State is carried in four non-colour channels: words (label), glyph, border style,
          and bar fill position. Removing all colour leaves the state unambiguous. */}
      <div
        style={{
          border: `6px ${display.borderStyle} #111`,
          padding: 16,
          marginBottom: 12,
        }}
      >
        <p style={{ fontSize: 20, margin: 0 }}>{copy.symmetryLabel}</p>
        <p style={bigNumber} aria-live="polite">
          <span aria-hidden="true" style={{ marginRight: 16 }}>
            {display.glyph}
          </span>
          {display.siText}
        </p>
        <p style={{ fontSize: 32, fontWeight: 600, margin: '8px 0' }}>
          {copy.stateLabel}: {display.label}
        </p>
        <div
          aria-hidden="true"
          style={{ border: '2px solid #111', height: 28, width: '100%', marginTop: 8 }}
        >
          <div style={{ height: '100%', width: `${display.barPct}%`, background: '#111' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 18, margin: 0 }}>{copy.leftLabel}</p>
          <p style={sideNumber}>{formatActivation(step === 'live' ? leftAct : null)}</p>
        </div>
        <div>
          <p style={{ fontSize: 18, margin: 0 }}>{copy.rightLabel}</p>
          <p style={sideNumber}>{formatActivation(step === 'live' ? rightAct : null)}</p>
        </div>
        <div>
          <p style={{ fontSize: 18, margin: 0 }}>{copy.qualityLabel}</p>
          <p style={sideNumber}>{quality ?? copy.noReading}</p>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          aspectRatio: '4 / 3',
          background: '#111',
          overflow: 'hidden',
          marginTop: 12,
        }}
      />
    </div>
  );
}
