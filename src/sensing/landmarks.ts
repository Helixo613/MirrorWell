// src/sensing/landmarks.ts — frames in, LandmarkFrame out. The only ML call site in the
// codebase (docs/BACKEND.md §1.2). Contracts: docs/API.md §5.
//
// MediaPipe types NEVER escape this module — downstream sees only LandmarkFrame, and only
// raw landmark geometry, never blendshapes (docs/MODEL_AND_DATA.md §2).
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { MirrorWellError } from '../data/errors.ts';
import { log } from '../log.ts';
import { thresholds } from '../config/thresholds.ts';

export interface LandmarkFrame {
  landmarks: { x: number; y: number; z: number }[];
  headPose: number[]; // 16 floats, row-major 4x4
  facePresent: boolean;
  timestampMs: number;
}

let landmarker: FaceLandmarker | null = null;

async function createLandmarker(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
  const baseLandmarkerOptions = {
    numFaces: 1,
    runningMode: 'VIDEO' as const,
    outputFacialTransformationMatrixes: true,
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
    // Bundled runtime only — never a CDN (docs/AGENTS.md non-negotiable, verified fact #2).
    const fileset = await FilesetResolver.forVisionTasks('/wasm');
    landmarker = await createLandmarker(fileset);
  } catch (err) {
    landmarker = null;
    throw new MirrorWellError('MODEL_LOAD_FAILED', err instanceof Error ? err.message : String(err));
  }
}

function detect(video: HTMLVideoElement, timestampMs: number): LandmarkFrame {
  if (!landmarker) {
    throw new MirrorWellError('NOT_INITIALIZED', 'LandmarkEngine.detect called before init()');
  }

  let result: ReturnType<FaceLandmarker['detectForVideo']>;
  try {
    result = landmarker.detectForVideo(video, timestampMs);
  } catch (err) {
    // Never crashes a session — QualityMonitor absorbs this as FACE_LOST (docs/API.md §16).
    throw new MirrorWellError('INFERENCE_FAILED', err instanceof Error ? err.message : String(err));
  }

  // FaceLandmarkerResult has NO per-frame confidence field (docs/AGENTS.md verified fact #1).
  // facePresent is defined as faceLandmarks being non-empty — nothing else.
  const faceLandmarks = result.faceLandmarks[0] ?? [];
  const transformationMatrix = result.facialTransformationMatrixes[0]?.data ?? [];

  return {
    landmarks: faceLandmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    headPose: Array.from(transformationMatrix),
    facePresent: faceLandmarks.length > 0,
    timestampMs,
  };
}

function isReady(): boolean {
  return landmarker !== null;
}

export const LandmarkEngine = { init, detect, isReady };
