// src/sensing/landmarks.ts, frames in, LandmarkFrame out. The only ML call site in the
// codebase (docs/BACKEND.md §1.2). Contracts: docs/API.md §5.
//
// MediaPipe types NEVER escape this module, downstream sees only LandmarkFrame, and only
// raw landmark geometry + per-side blendshape scores (decision reversal, MODEL_AND_DATA §2/§7 2026-07-19).
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { MirrorWellError } from '../data/errors.ts';
import { log } from '../log.ts';
import { thresholds } from '../config/thresholds.ts';

export interface LandmarkFrame {
  landmarks: { x: number; y: number; z: number }[];
  headPose: number[]; // 16 floats, row-major 4x4
  facePresent: boolean;
  /** faceBlendshapes[0] categoryName → score; {} when the result carries none. */
  blendshapes: Record<string, number>;
  timestampMs: number;
}

let landmarker: FaceLandmarker | null = null;
// Last timestamp actually passed to detectForVideo. MediaPipe requires strictly increasing
// timestamps for the LIFETIME of the landmarker instance; a violation poisons the graph
// unrecoverably (google-ai-edge/mediapipe#5743). CaptureService already supplies a monotonic
// performance-clock timestamp, so this guard is belt-and-braces against any caller regression
// a non-increasing input is nudged forward by 1 ms rather than fed through (docs/BACKEND.md §1.2).
let lastDetectTimestampMs: number | null = null;

async function createLandmarker(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
  const baseLandmarkerOptions = {
    numFaces: 1,
    runningMode: 'VIDEO' as const,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: thresholds.landmarker.minFaceDetectionConfidence,
    minFacePresenceConfidence: thresholds.landmarker.minFacePresenceConfidence,
    minTrackingConfidence: thresholds.landmarker.minTrackingConfidence,
  };

  try {
    const gpu = await FaceLandmarker.createFromOptions(fileset, {
      ...baseLandmarkerOptions,
      baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
    });
    log.info('LandmarkEngine', 'delegate: GPU');
    return gpu;
  } catch (err) {
    log.warn('LandmarkEngine', 'GPU delegate unavailable, falling back to CPU/WASM', {
      reason: err instanceof Error ? err.message : String(err),
    });
    const cpu = await FaceLandmarker.createFromOptions(fileset, {
      ...baseLandmarkerOptions,
      baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
    });
    log.info('LandmarkEngine', 'delegate: CPU');
    return cpu;
  }
}

async function init(): Promise<void> {
  try {
    // Bundled runtime only; never a CDN (AGENTS.md non-negotiable, verified fact #2).
    const fileset = await FilesetResolver.forVisionTasks('/wasm');
    landmarker = await createLandmarker(fileset);
    lastDetectTimestampMs = null; // fresh graph, no timestamp history
  } catch (err) {
    landmarker = null;
    throw new MirrorWellError('MODEL_LOAD_FAILED', err instanceof Error ? err.message : String(err));
  }
}

function detect(video: HTMLVideoElement, timestampMs: number): LandmarkFrame {
  if (!landmarker) {
    throw new MirrorWellError('NOT_INITIALIZED', 'LandmarkEngine.detect called before init()');
  }

  // Strictly-increasing clamp: the graph must never see a timestamp <= the previous one. The
  // returned LandmarkFrame keeps the CALLER's timestamp; the clamped value exists only for
  // MediaPipe's ingest clock and drifts from real time by at most 1 ms per clamped frame.
  const detectTimestampMs =
    lastDetectTimestampMs !== null && timestampMs <= lastDetectTimestampMs
      ? lastDetectTimestampMs + 1
      : timestampMs;

  // Recorded BEFORE the call: even a throwing detect may have delivered its packet to the
  // graph, so the next call must still move the clock forward.
  lastDetectTimestampMs = detectTimestampMs;

  let result: ReturnType<FaceLandmarker['detectForVideo']>;
  try {
    result = landmarker.detectForVideo(video, detectTimestampMs);
  } catch (err) {
    // Never crashes a session, QualityMonitor absorbs this as FACE_LOST (docs/API.md §16).
    throw new MirrorWellError('INFERENCE_FAILED', err instanceof Error ? err.message : String(err));
  }

  // FaceLandmarkerResult has NO per-frame confidence field (AGENTS.md verified fact #1).
  // facePresent is defined as faceLandmarks being non-empty, nothing else.
  const faceLandmarks = result.faceLandmarks[0] ?? [];
  const transformationMatrix = result.facialTransformationMatrixes[0]?.data ?? [];
  const blendshapes: Record<string, number> = {};
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) {
    blendshapes[c.categoryName] = c.score;
  }

  return {
    landmarks: faceLandmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    headPose: Array.from(transformationMatrix),
    facePresent: faceLandmarks.length > 0,
    blendshapes,
    timestampMs,
  };
}

function isReady(): boolean {
  return landmarker !== null;
}

export const LandmarkEngine = { init, detect, isReady };
