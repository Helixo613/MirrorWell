import type { RegionId } from '@/data/schema';

export type QualityState =
  | 'QUALITY_OK'
  | 'LOW_LIGHT'
  | 'FACE_LOST'
  | 'TOO_FAR'
  | 'POSE_OUT_OF_RANGE'
  | 'LOW_CONFIDENCE';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface LandmarkFrame {
  landmarks: Point3D[];
  headPose: Float32Array | number[];
  facePresent: boolean;
  timestampMs: number;
}

export interface NormalizedFrame {
  regionDisplacements: Record<RegionId, { left: number; right: number }>;
  timestampMs: number;
}

export type NeutralStats = Record<RegionId, { left: number; right: number }>;

export interface MetricSample {
  symmetryIndex: number | null;
  effortIndex: number;
  timestampMs: number;
}
