// src/dev/LiveV1Harness.tsx — live V1 protocol capture UX (docs/MODEL_AND_DATA.md §7).
// Dev-only. Neutral uses measureAbsolute + aggregateNeutral (no zero/ephemeral baseline).
// Later phases use NormalizationLayer.normalize after a real in-memory baseline is set.
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { CaptureService } from '../sensing/capture.ts';
import { LandmarkEngine } from '../sensing/landmarks.ts';
import { QualityMonitor, type QualityState } from '../sensing/quality.ts';
import { NormalizationLayer } from '../metrics/normalize.ts';
import { MetricEngine } from '../metrics/metrics.ts';
import { measureAbsolute, aggregateNeutral, type AbsoluteFeatures } from '../metrics/geometry.ts';
import type { CalibrationBaseline } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { thresholds } from '../config/thresholds.ts';
import { strings } from '../config/strings.ts';
import {
  canStartProtocol,
  createInitialHarnessState,
  currentPhase,
  evaluatePhaseValidity,
  isYawPhase,
  phaseDurationMs,
  PROTOCOL_PHASES,
  reduceHarness,
  type PhaseValidity,
  type ProtocolPhase,
} from './liveV1HarnessState.ts';

const copy = strings.v1Harness;

interface PhaseSample {
  timestampMs: number;
  qualityState: QualityState;
  yawDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  symmetryIndex: number | null;
  mouthMagL: number | null;
  mouthMagR: number | null;
  mouthMaxMag: number | null;
  movementDetected: boolean | null;
}

interface StoredPhaseResult {
  trial: number;
  phase: ProtocolPhase;
  samples: PhaseSample[];
  okCount: number;
  totalCount: number;
  validity: PhaseValidity;
}

/** Local copy of quality.ts euler math — not a new service (dev harness only). */
function extractEulerAnglesDeg(headPose: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => headPose[row * 4 + col] ?? 0;
  const pitch = Math.atan2(r(2, 1), r(2, 2));
  const yaw = Math.atan2(-r(2, 0), Math.sqrt(r(2, 1) ** 2 + r(2, 2) ** 2));
  const roll = Math.atan2(r(1, 0), r(0, 0));
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  return { yaw: toDeg(yaw), pitch: toDeg(pitch), roll: toDeg(roll) };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function mouthMags(disp: { left: { u: number; v: number }; right: { u: number; v: number } }): {
  left: number;
  right: number;
  max: number;
} {
  const left = Math.hypot(disp.left.u, disp.left.v);
  const right = Math.hypot(disp.right.u, disp.right.v);
  return { left, right, max: Math.max(left, right) };
}

function phaseTitle(phase: ProtocolPhase): string {
  switch (phase) {
    case 'neutral':
      return copy.phaseNeutralTitle;
    case 'frontal_smile':
      return copy.phaseFrontalSmileTitle;
    case 'left_yaw':
      return copy.phaseLeftYawTitle;
    case 'right_yaw':
      return copy.phaseRightYawTitle;
    case 'dim_light':
      return copy.phaseDimLightTitle;
    case 'distance_2m':
      return copy.phaseDistance2mTitle;
  }
}

function phaseInstruction(phase: ProtocolPhase): string {
  switch (phase) {
    case 'neutral':
      return copy.phaseNeutralInstruction;
    case 'frontal_smile':
      return copy.phaseFrontalSmileInstruction;
    case 'left_yaw':
      return copy.phaseLeftYawInstruction;
    case 'right_yaw':
      return copy.phaseRightYawInstruction;
    case 'dim_light':
      return copy.phaseDimLightInstruction;
    case 'distance_2m':
      return copy.phaseDistance2mInstruction;
  }
}

function uiStatusText(ui: ReturnType<typeof createInitialHarnessState>['ui']): string {
  switch (ui) {
    case 'setup':
      return copy.phaseStatusSetup;
    case 'prepare':
      return copy.phaseStatusPrepare;
    case 'recording':
      return copy.phaseStatusRecording;
    case 'review':
      return copy.phaseStatusReview;
    case 'report':
      return copy.phaseStatusReport;
  }
}

function qualityFix(state: QualityState): string {
  switch (state) {
    case 'LOW_LIGHT':
      return copy.qualityFixLowLight;
    case 'TOO_FAR':
      return copy.qualityFixTooFar;
    case 'POSE_OUT_OF_RANGE':
      return copy.qualityFixPose;
    case 'FACE_LOST':
      return copy.qualityFixFaceLost;
    case 'LOW_CONFIDENCE':
      return copy.qualityFixLowConfidence;
    case 'QUALITY_OK':
      return copy.qualityOk;
  }
}

function buildInMemoryBaseline(
  absSamples: AbsoluteFeatures[],
  okCount: number,
  totalCount: number,
  comfortableMaxSmile: number,
  noiseFloorSymmetry: number,
): CalibrationBaseline {
  const neutralStats = aggregateNeutral(absSamples);
  const preFloor: number[] = [];
  for (const s of absSamples) {
    const dL = {
      u: s.REGION_MOUTH_CORNER.left.u - neutralStats.REGION_MOUTH_CORNER.left.u,
      v: s.REGION_MOUTH_CORNER.left.v - neutralStats.REGION_MOUTH_CORNER.left.v,
    };
    const dR = {
      u: s.REGION_MOUTH_CORNER.right.u - neutralStats.REGION_MOUTH_CORNER.right.u,
      v: s.REGION_MOUTH_CORNER.right.v - neutralStats.REGION_MOUTH_CORNER.right.v,
    };
    preFloor.push(mouthMags({ left: dL, right: dR }).max);
  }
  const noiseFloorDisplacement = std(preFloor);
  const floor = thresholds.metrics.movementFloorPct;
  return {
    baselineId: 'live-v1-harness-memory',
    profileId: 'live-v1-harness',
    capturedAt: new Date().toISOString(),
    neutralStats,
    comfortableMax: {
      EX_SMILE: Math.max(comfortableMaxSmile, floor * 4, 1e-6),
    },
    qualityScore: totalCount === 0 ? 0 : okCount / totalCount,
    noiseFloorSymmetry: Math.max(0, noiseFloorSymmetry),
    noiseFloorDisplacement: Math.max(0, noiseFloorDisplacement),
    isActive: 1,
  };
}

function meanAbsYaw(samples: PhaseSample[]): number | null {
  const ys = samples
    .filter((s) => s.qualityState === 'QUALITY_OK' && s.yawDeg != null)
    .map((s) => Math.abs(s.yawDeg!));
  if (ys.length === 0) return null;
  const m = mean(ys);
  return Number.isFinite(m) ? m : null;
}

function downloadBlob(filename: string, body: string, mime: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function resultsToCsv(results: StoredPhaseResult[]): string {
  const header = [
    'trial',
    'phase',
    'timestampMs',
    'qualityState',
    'yawDeg',
    'pitchDeg',
    'rollDeg',
    'symmetryIndex',
    'mouthMagL',
    'mouthMagR',
    'mouthMaxMag',
    'movementDetected',
  ].join(',');
  const rows: string[] = [header];
  for (const r of results) {
    for (const s of r.samples) {
      rows.push(
        [
          r.trial,
          r.phase,
          s.timestampMs,
          s.qualityState,
          s.yawDeg ?? '',
          s.pitchDeg ?? '',
          s.rollDeg ?? '',
          s.symmetryIndex ?? '',
          s.mouthMagL ?? '',
          s.mouthMagR ?? '',
          s.mouthMaxMag ?? '',
          s.movementDetected === null ? '' : s.movementDetected ? '1' : '0',
        ].join(','),
      );
    }
  }
  return rows.join('\n');
}

const focusRing: CSSProperties = {
  outline: '2px solid #1d4ed8',
  outlineOffset: 2,
};

const btnBase: CSSProperties = {
  marginRight: 8,
  marginBottom: 8,
  padding: '8px 12px',
  fontSize: 16,
  cursor: 'pointer',
};

export function LiveV1Harness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedVideoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerReadyRef = useRef(false);
  const recordingRef = useRef(false);
  const phaseRef = useRef<ProtocolPhase | null>(null);
  const baselineReadyRef = useRef(false);
  const phaseSamplesRef = useRef<PhaseSample[]>([]);
  const neutralAbsRef = useRef<AbsoluteFeatures[]>([]);
  const lastQualityOkMsRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const resultsRef = useRef<StoredPhaseResult[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, dispatch] = useReducer(reduceHarness, undefined, createInitialHarnessState);
  const [error, setError] = useState<MirrorWellError | null>(null);
  const [fps, setFps] = useState(0);
  const [qualityState, setQualityState] = useState<QualityState | null>(null);
  const [liveYaw, setLiveYaw] = useState<number | null>(null);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [liveRoll, setLiveRoll] = useState<number | null>(null);
  const [liveSi, setLiveSi] = useState<number | null>(null);
  const [liveDisp, setLiveDisp] = useState<number | null>(null);
  const [liveMovement, setLiveMovement] = useState<boolean | null>(null);
  const [okInPhase, setOkInPhase] = useState(0);
  const [totalInPhase, setTotalInPhase] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [reviewValidity, setReviewValidity] = useState<PhaseValidity | null>(null);
  const [results, setResults] = useState<StoredPhaseResult[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [focusedBtn, setFocusedBtn] = useState<string | null>(null);

  const phase = currentPhase(state);
  phaseRef.current = phase;

  const statusAria = useMemo(() => {
    const base = uiStatusText(state.ui);
    if (phase) return `${base}. ${phaseTitle(phase)}. Trial ${state.trial}.`;
    return `${base}. Trial ${state.trial}.`;
  }, [state.ui, state.trial, phase]);

  useEffect(() => {
    recordingRef.current = state.ui === 'recording';
  }, [state.ui]);

  useEffect(() => {
    NormalizationLayer.clearBaseline();
    MetricEngine.reset();
    baselineReadyRef.current = false;

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

      if (!landmarkerReadyRef.current) return;

      let lf = null;
      try {
        lf = LandmarkEngine.detect(video, timestampMs);
      } catch {
        lf = null;
      }

      const qr = QualityMonitor.evaluate(video, lf);
      setQualityState(qr.state);

      if (qr.state === 'QUALITY_OK') {
        lastQualityOkMsRef.current = timestampMs;
      }
      const recent =
        lastQualityOkMsRef.current !== null &&
        timestampMs - lastQualityOkMsRef.current <= thresholds.v1Protocol.qualityOkRecentMs;
      dispatch({ type: 'SET_QUALITY_OK_RECENTLY', ok: recent });

      let yaw: number | null = null;
      let pitch: number | null = null;
      let roll: number | null = null;
      if (lf?.facePresent && lf.headPose.length >= 16) {
        const e = extractEulerAnglesDeg(lf.headPose);
        yaw = e.yaw;
        pitch = e.pitch;
        roll = e.roll;
      }
      setLiveYaw(yaw);
      setLivePitch(pitch);
      setLiveRoll(roll);

      let si: number | null = null;
      let disp: number | null = null;
      let magL: number | null = null;
      let magR: number | null = null;
      let movement: boolean | null = null;

      const activePhase = phaseRef.current;

      if (qr.state === 'QUALITY_OK') {
        try {
          if (activePhase === 'neutral' || !baselineReadyRef.current) {
            const abs = measureAbsolute(qr.frame);
            if (recordingRef.current && activePhase === 'neutral') {
              neutralAbsRef.current.push(abs);
            }
            // Live diagnostics on absolute mouth feature magnitude (not SI — baseline-free).
            const m = mouthMags(abs.REGION_MOUTH_CORNER);
            magL = m.left;
            magR = m.right;
            disp = m.max;
            movement = null;
          } else {
            const nf = NormalizationLayer.normalize(qr.frame);
            const m = mouthMags(nf.regionDisplacements.REGION_MOUTH_CORNER);
            magL = m.left;
            magR = m.right;
            disp = m.max;
            movement = m.max >= thresholds.metrics.movementFloorPct;
            const sample = MetricEngine.compute(nf, 'EX_SMILE');
            si = sample.symmetryIndex;
          }
        } catch {
          // NO_BASELINE / transient — skip metrics for this frame
        }
      }

      setLiveSi(si);
      setLiveDisp(disp);
      setLiveMovement(movement);

      if (recordingRef.current) {
        phaseSamplesRef.current.push({
          timestampMs,
          qualityState: qr.state,
          yawDeg: yaw,
          pitchDeg: pitch,
          rollDeg: roll,
          symmetryIndex: si,
          mouthMagL: magL,
          mouthMagR: magR,
          mouthMaxMag: disp,
          movementDetected: movement,
        });
        const ok = phaseSamplesRef.current.filter((s) => s.qualityState === 'QUALITY_OK').length;
        setOkInPhase(ok);
        setTotalInPhase(phaseSamplesRef.current.length);
      }
    });

    return () => {
      unsubscribe();
      CaptureService.stop();
      NormalizationLayer.clearBaseline();
      MetricEngine.reset();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  async function ensureCamera(): Promise<void> {
    if (!LandmarkEngine.isReady()) {
      await LandmarkEngine.init();
      landmarkerReadyRef.current = true;
    }
    if (!CaptureService.isRunning()) {
      await CaptureService.start();
    }
    dispatch({ type: 'SET_CAMERA_READY', ready: true });
  }

  function clearRecordingTimer(): void {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function applyNeutralBaseline(okCount: number, totalCount: number): void {
    const abs = neutralAbsRef.current;
    if (abs.length === 0) {
      throw new MirrorWellError(
        'QUALITY_TOO_LOW',
        'No QUALITY_OK frames in neutral — improve light/framing and retry.',
      );
    }
    const baseline = buildInMemoryBaseline(
      abs,
      okCount,
      totalCount,
      thresholds.metrics.movementFloorPct * 8,
      0,
    );
    NormalizationLayer.setBaseline(baseline);
    MetricEngine.setBaseline(baseline);
    MetricEngine.reset();
    baselineReadyRef.current = true;
  }

  function updateBaselineAfterSmile(okSamples: PhaseSample[]): void {
    if (neutralAbsRef.current.length === 0) return;
    const peaks = okSamples
      .map((s) => s.mouthMaxMag)
      .filter((x): x is number => x != null && Number.isFinite(x));
    const peak = peaks.length ? Math.max(...peaks) : thresholds.metrics.movementFloorPct * 8;
    const siVals = okSamples
      .map((s) => s.symmetryIndex)
      .filter((x): x is number => x != null && Number.isFinite(x));
    const noiseSi = std(siVals);
    const okCount = okSamples.length;
    const totalCount = Math.max(okCount, 1);
    const baseline = buildInMemoryBaseline(
      neutralAbsRef.current,
      okCount,
      totalCount,
      peak,
      noiseSi,
    );
    NormalizationLayer.setBaseline(baseline);
    MetricEngine.setBaseline(baseline);
  }

  const finishRecording = useCallback(() => {
    clearRecordingTimer();
    recordingRef.current = false;
    setSecondsLeft(0);

    const active = phaseRef.current;
    if (!active) return;

    const samples = [...phaseSamplesRef.current];
    const okCount = samples.filter((s) => s.qualityState === 'QUALITY_OK').length;
    const totalCount = samples.length;
    const validity = evaluatePhaseValidity({
      okCount,
      totalCount,
      meanAbsYawDeg: meanAbsYaw(samples),
      phase: active,
    });

    if (active === 'neutral' && validity.ok) {
      try {
        applyNeutralBaseline(okCount, totalCount);
      } catch (err) {
        setError(
          err instanceof MirrorWellError
            ? err
            : new MirrorWellError('VALIDATION_FAILED', String(err)),
        );
        setReviewValidity({
          ...validity,
          ok: false,
          reasons: [...validity.reasons, 'baseline_failed'],
        });
        dispatch({ type: 'FINISH_RECORDING' });
        return;
      }
    }

    if (active === 'frontal_smile' && validity.ok) {
      updateBaselineAfterSmile(samples.filter((s) => s.qualityState === 'QUALITY_OK'));
    }

    setReviewValidity(validity);
    dispatch({ type: 'FINISH_RECORDING' });
  }, []);

  function beginRecording(): void {
    const active = currentPhase(state);
    if (!active || state.ui !== 'prepare') return;
    setError(null);
    setReviewValidity(null);
    phaseSamplesRef.current = [];
    if (active === 'neutral') {
      neutralAbsRef.current = [];
      baselineReadyRef.current = false;
      NormalizationLayer.clearBaseline();
      MetricEngine.reset();
    }
    setOkInPhase(0);
    setTotalInPhase(0);
    MetricEngine.reset();

    const durationMs = phaseDurationMs(active);
    const durationSec = Math.ceil(durationMs / 1000);
    setSecondsLeft(durationSec);
    recordingRef.current = true;
    dispatch({ type: 'BEGIN_RECORDING' });

    clearRecordingTimer();
    const started = performance.now();
    recordingTimerRef.current = setInterval(() => {
      const elapsed = performance.now() - started;
      const left = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setSecondsLeft(left);
      if (elapsed >= durationMs) {
        finishRecording();
      }
    }, 200);
  }

  function handleAccept(): void {
    if (!reviewValidity || !phase) return;
    if (!reviewValidity.ok) return;

    const stored: StoredPhaseResult = {
      trial: state.trial,
      phase,
      samples: [...phaseSamplesRef.current],
      okCount: reviewValidity.okCount,
      totalCount: reviewValidity.totalCount,
      validity: reviewValidity,
    };
    resultsRef.current = [
      ...resultsRef.current.filter((r) => !(r.trial === stored.trial && r.phase === stored.phase)),
      stored,
    ];
    setResults([...resultsRef.current]);
    dispatch({ type: 'ACCEPT_PHASE', validity: reviewValidity });
    setReviewValidity(null);
  }

  function handleRetry(): void {
    if (phase === 'neutral') {
      baselineReadyRef.current = false;
      NormalizationLayer.clearBaseline();
      MetricEngine.reset();
      neutralAbsRef.current = [];
    }
    setReviewValidity(null);
    phaseSamplesRef.current = [];
    dispatch({ type: 'RETRY_PHASE' });
  }

  function handleReset(): void {
    clearRecordingTimer();
    recordingRef.current = false;
    phaseSamplesRef.current = [];
    neutralAbsRef.current = [];
    resultsRef.current = [];
    baselineReadyRef.current = false;
    NormalizationLayer.clearBaseline();
    MetricEngine.reset();
    setResults([]);
    setReviewValidity(null);
    setError(null);
    setSecondsLeft(0);
    dispatch({ type: 'RESET' });
  }

  function handleStopCamera(): void {
    clearRecordingTimer();
    recordingRef.current = false;
    CaptureService.stop();
    dispatch({ type: 'SET_CAMERA_READY', ready: false });
    dispatch({ type: 'SET_QUALITY_OK_RECENTLY', ok: false });
  }

  function exportJson(): void {
    downloadBlob(
      `mirrorwell-live-v1-${Date.now()}.json`,
      JSON.stringify(
        {
          kind: 'live-v1-protocol',
          generatedAt: new Date().toISOString(),
          protocol: { ...thresholds.v1Protocol, phases: PROTOCOL_PHASES },
          results: resultsRef.current,
        },
        null,
        2,
      ),
      'application/json',
    );
  }

  function exportCsv(): void {
    downloadBlob(
      `mirrorwell-live-v1-${Date.now()}.csv`,
      resultsToCsv(resultsRef.current),
      'text/csv',
    );
  }

  const startEnabled = canStartProtocol(state);
  const okPct = totalInPhase === 0 ? 0 : okInPhase / totalInPhase;
  const yawMin = thresholds.v1Protocol.yawTargetMinDeg;
  const yawMax = thresholds.v1Protocol.yawTargetMaxDeg;
  const inYawBand =
    liveYaw != null && Math.abs(liveYaw) >= yawMin && Math.abs(liveYaw) <= yawMax;

  const shell: CSSProperties = {
    border: '2px solid #333',
    padding: 12,
    marginTop: 16,
    maxWidth: 720,
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'auto',
    fontFamily: 'system-ui, sans-serif',
  };

  const btnStyle = (id: string, disabled?: boolean): CSSProperties => ({
    ...btnBase,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...(focusedBtn === id ? focusRing : {}),
  });

  return (
    <div style={shell}>
      <h2 style={{ marginTop: 0 }}>{copy.title}</h2>
      <p style={{ fontSize: 14, lineHeight: 1.4 }}>{copy.intro}</p>

      <p
        aria-live="polite"
        role="status"
        style={{
          background: '#f4f4f5',
          padding: 10,
          marginBottom: 8,
          borderLeft: '4px solid #1d4ed8',
        }}
      >
        <strong>{copy.statusLabel}:</strong> {statusAria}
      </p>

      <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button
          type="button"
          style={btnStyle('cam')}
          onFocus={() => setFocusedBtn('cam')}
          onBlur={() => setFocusedBtn(null)}
          onClick={() =>
            void ensureCamera().catch((e) =>
              setError(
                e instanceof MirrorWellError
                  ? e
                  : new MirrorWellError('CAMERA_UNAVAILABLE', String(e)),
              ),
            )
          }
          disabled={state.cameraReady && CaptureService.isRunning()}
        >
          {copy.startCamera}
        </button>
        <button
          type="button"
          style={btnStyle('stop')}
          onFocus={() => setFocusedBtn('stop')}
          onBlur={() => setFocusedBtn(null)}
          onClick={handleStopCamera}
          disabled={!state.cameraReady}
        >
          {copy.stopCamera}
        </button>
        <button
          type="button"
          style={btnStyle('start', !startEnabled)}
          onFocus={() => setFocusedBtn('start')}
          onBlur={() => setFocusedBtn(null)}
          onClick={() => dispatch({ type: 'START_PROTOCOL' })}
          disabled={!startEnabled}
          aria-disabled={!startEnabled}
          title={!startEnabled ? copy.startDisabledHint : undefined}
        >
          {copy.startProtocol}
        </button>
        <button
          type="button"
          style={btnStyle('reset')}
          onFocus={() => setFocusedBtn('reset')}
          onBlur={() => setFocusedBtn(null)}
          onClick={handleReset}
          disabled={state.ui === 'recording'}
        >
          {copy.resetProtocol}
        </button>
      </div>

      {!startEnabled && state.ui === 'setup' && (
        <p style={{ fontSize: 14, marginTop: 0 }}>{copy.startDisabledHint}</p>
      )}

      <p style={{ fontSize: 14 }}>
        {copy.fpsLabel}: {fps} | {copy.qualityLabel}:{' '}
        <strong>
          {qualityState ?? '—'}
          {qualityState ? ` (${qualityFix(qualityState)})` : ''}
        </strong>{' '}
        | {copy.trialLabel}: {state.trial}/{thresholds.v1Protocol.trials}
      </p>

      {qualityState && qualityState !== 'QUALITY_OK' && (
        <p role="status" style={{ borderLeft: '4px solid #b45309', paddingLeft: 8 }}>
          {qualityFix(qualityState)}
        </p>
      )}

      <p style={{ fontSize: 14 }}>
        {copy.livePoseLabel}: {copy.yawLabel} {liveYaw?.toFixed(1) ?? '—'}° · {copy.pitchLabel}{' '}
        {livePitch?.toFixed(1) ?? '—'}° · {copy.rollLabel} {liveRoll?.toFixed(1) ?? '—'}°
        {phase && isYawPhase(phase) && (
          <>
            {' '}
            | {copy.yawBandLabel} [{yawMin}°, {yawMax}°]:{' '}
            <strong>{inYawBand ? copy.yawInBand : copy.yawOutOfBand}</strong>
          </>
        )}
      </p>

      <p style={{ fontSize: 14 }}>
        {copy.movementLabel}:{' '}
        <strong>
          {liveMovement === null
            ? '—'
            : liveMovement
              ? copy.movementDetected
              : copy.movementNotDetected}
        </strong>
        {state.ui === 'recording' && (
          <>
            {' '}
            | {copy.validFramesLabel}: {okInPhase}/{totalInPhase} (
            {(okPct * 100).toFixed(0)}% {copy.okPercentLabel}) | {copy.secondsLeftLabel}:{' '}
            {secondsLeft}
          </>
        )}
      </p>

      <details
        open={diagOpen}
        onToggle={(e) => setDiagOpen((e.target as HTMLDetailsElement).open)}
        style={{ marginBottom: 8, fontSize: 13 }}
      >
        <summary style={{ cursor: 'pointer' }}>{copy.diagnosticsToggle}</summary>
        <p style={{ margin: '6px 0' }}>
          {copy.siLabel}: {liveSi ?? '—'} | {copy.displacementLabel}:{' '}
          {liveDisp != null ? liveDisp.toFixed(6) : '—'} | {copy.floorLabel}:{' '}
          {thresholds.metrics.movementFloorPct}
        </p>
      </details>

      {state.ui === 'prepare' && phase && (
        <div
          style={{
            background: '#f4f4f5',
            padding: 10,
            marginBottom: 8,
            borderLeft: '4px solid #15803d',
          }}
        >
          <strong>
            {copy.phaseLabel}: {phaseTitle(phase)}
          </strong>
          <p style={{ margin: '6px 0' }}>{phaseInstruction(phase)}</p>
          <p style={{ margin: '6px 0', fontSize: 14 }}>
            {copy.durationLabel}: {(phaseDurationMs(phase) / 1000).toFixed(0)}
            {copy.secondsUnit} · {copy.prepWindowLabel}:{' '}
            {(thresholds.v1Protocol.prepMs / 1000).toFixed(0)}
            {copy.secondsUnit}
          </p>
          <button
            type="button"
            style={btnStyle('begin', !state.cameraReady)}
            onFocus={() => setFocusedBtn('begin')}
            onBlur={() => setFocusedBtn(null)}
            onClick={beginRecording}
            disabled={!state.cameraReady}
          >
            {copy.beginRecording}
          </button>
        </div>
      )}

      {state.ui === 'recording' && phase && (
        <div
          style={{
            background: '#eff6ff',
            padding: 10,
            marginBottom: 8,
            borderLeft: '4px solid #1d4ed8',
          }}
        >
          <strong>
            {copy.phaseStatusRecording}: {phaseTitle(phase)}
          </strong>
        </div>
      )}

      {state.ui === 'review' && phase && reviewValidity && (
        <div
          style={{
            padding: 10,
            marginBottom: 8,
            borderLeft: reviewValidity.ok ? '4px solid #15803d' : '4px solid #b91c1c',
            background: reviewValidity.ok ? '#f0fdf4' : '#fef2f2',
          }}
        >
          <strong>
            {reviewValidity.ok ? copy.captureValid : copy.captureInvalid}
          </strong>
          <p style={{ margin: '6px 0' }}>
            {phaseTitle(phase)} — {reviewValidity.okCount}/{reviewValidity.totalCount} QUALITY_OK (
            {(reviewValidity.okPct * 100).toFixed(0)}%)
            {reviewValidity.meanAbsYawDeg != null &&
              ` · mean |yaw| ${reviewValidity.meanAbsYawDeg.toFixed(1)}°`}
          </p>
          {!reviewValidity.ok && (
            <ul style={{ margin: '6px 0' }}>
              {reviewValidity.reasons.includes('low_ok_pct') && (
                <li>{copy.invalidLowOkPct}</li>
              )}
              {reviewValidity.reasons.includes('yaw_band') && <li>{copy.invalidYawBand}</li>}
              {reviewValidity.reasons.includes('baseline_failed') && (
                <li>{copy.captureInvalid}</li>
              )}
            </ul>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={btnStyle('accept', !reviewValidity.ok)}
              onFocus={() => setFocusedBtn('accept')}
              onBlur={() => setFocusedBtn(null)}
              onClick={handleAccept}
              disabled={!reviewValidity.ok}
            >
              {copy.acceptPhase}
            </button>
            <button
              type="button"
              style={btnStyle('retry')}
              onFocus={() => setFocusedBtn('retry')}
              onBlur={() => setFocusedBtn(null)}
              onClick={handleRetry}
            >
              {copy.retryPhase}
            </button>
          </div>
        </div>
      )}

      <p style={{ fontSize: 14 }}>
        {copy.acceptedPhasesLabel}:{' '}
        {state.acceptedPhases.length === 0
          ? copy.noneAccepted
          : state.acceptedPhases.map((p) => phaseTitle(p)).join('; ')}
      </p>

      {results.length > 0 && (
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {results.map((r) => (
            <li key={`${r.trial}-${r.phase}`}>
              T{r.trial} {r.phase}: {r.okCount}/{r.totalCount} OK
              {r.validity.meanAbsYawDeg != null
                ? ` · |yaw| ${r.validity.meanAbsYawDeg.toFixed(1)}°`
                : ''}
              {r.validity.ok ? '' : ` — ${copy.captureInvalid}`}
            </li>
          ))}
        </ul>
      )}

      {state.ui === 'report' && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            background: '#f8fafc',
            borderLeft: '4px solid #0f172a',
          }}
        >
          <h3 style={{ marginTop: 0 }}>{copy.reportTitle}</h3>
          <p>{copy.reportTrialHeading}</p>
          <ul>
            {PROTOCOL_PHASES.map((p) => {
              const t1 = results.find((r) => r.trial === 1 && r.phase === p);
              const t2 = results.find((r) => r.trial === 2 && r.phase === p);
              return (
                <li key={p}>
                  {phaseTitle(p)}: {copy.trial1Short}{' '}
                  {t1 ? `${t1.okCount}/${t1.totalCount}` : '—'} · {copy.trial2Short}{' '}
                  {t2 ? `${t2.okCount}/${t2.totalCount}` : '—'}
                </li>
              );
            })}
          </ul>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={btnStyle('json')}
              onFocus={() => setFocusedBtn('json')}
              onBlur={() => setFocusedBtn(null)}
              onClick={exportJson}
            >
              {copy.downloadJson}
            </button>
            <button
              type="button"
              style={btnStyle('csv')}
              onFocus={() => setFocusedBtn('csv')}
              onBlur={() => setFocusedBtn(null)}
              onClick={exportCsv}
            >
              {copy.downloadCsv}
            </button>
          </div>
          <p style={{ fontSize: 13 }}>{copy.exportStarted}</p>
        </div>
      )}

      {error && (
        <p role="alert">
          {copy.errorPrefix}: {error.code}: {error.message}
        </p>
      )}

      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 640,
          aspectRatio: '4 / 3',
          background: '#111',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
