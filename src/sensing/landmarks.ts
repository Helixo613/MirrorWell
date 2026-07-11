import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { thresholds } from '@/config/thresholds';
import { MirrorWellError } from '@/data/errors';
import type { LandmarkFrame, Point3D } from '@/types/sensing';

let landmarker: FaceLandmarker | null = null;
let ready = false;
let lastTimestampMs = 0;

function toPoint3D(
  landmark: { x: number; y: number; z: number },
): Point3D {
  return { x: landmark.x, y: landmark.y, z: landmark.z };
}

function mapResult(
  result: FaceLandmarkerResult,
  timestampMs: number,
): LandmarkFrame | null {
  const faceLandmarks = result.faceLandmarks[0];
  if (!faceLandmarks || faceLandmarks.length === 0) {
    return {
      landmarks: [],
      headPose: new Float32Array(16),
      facePresent: false,
      timestampMs,
    };
  }

  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  const headPose = matrix ? Float32Array.from(matrix) : new Float32Array(16);

  return {
    landmarks: faceLandmarks.map(toPoint3D),
    headPose,
    facePresent: true,
    timestampMs,
  };
}

export const LandmarkEngine = {
  async init(): Promise<void> {
    if (ready && landmarker) {
      return;
    }

    try {
      const vision = await FilesetResolver.forVisionTasks('/wasm');
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence:
          thresholds.landmarker.minFaceDetectionConfidence,
        minFacePresenceConfidence:
          thresholds.landmarker.minFacePresenceConfidence,
        minTrackingConfidence: thresholds.landmarker.minTrackingConfidence,
      });
      ready = true;
    } catch {
      landmarker = null;
      ready = false;
      throw new MirrorWellError(
        'MODEL_LOAD_FAILED',
        'Face landmarker model failed to load',
        false,
      );
    }
  },

  detect(video: HTMLVideoElement, timestampMs: number): LandmarkFrame {
    if (!ready || !landmarker) {
      throw new MirrorWellError(
        'NOT_INITIALIZED',
        'LandmarkEngine.init() must be called first',
        true,
      );
    }

    const monotonicTs = Math.max(timestampMs, lastTimestampMs + 1);
    lastTimestampMs = monotonicTs;

    try {
      const result = landmarker.detectForVideo(video, monotonicTs);
      const frame = mapResult(result, monotonicTs);
      if (!frame) {
        throw new MirrorWellError(
          'INFERENCE_FAILED',
          'Landmark inference returned no frame',
          true,
        );
      }
      return frame;
    } catch (error) {
      if (error instanceof MirrorWellError) {
        throw error;
      }
      throw new MirrorWellError(
        'INFERENCE_FAILED',
        'Landmark inference failed',
        true,
      );
    }
  },

  isReady(): boolean {
    return ready;
  },
};
