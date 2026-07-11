import {
  ALL_REGION_IDS,
  INTER_OCULAR_LEFT,
  INTER_OCULAR_RIGHT,
  REGION_LANDMARKS,
} from '@/config/regions';
import { thresholds } from '@/config/thresholds';
import type { RegionId } from '@/data/schema';
import type { LandmarkFrame, QualityState } from '@/types/sensing';

const JITTER_WINDOW = 30;
const jitterSamples: number[] = [];

let lumaCanvas: HTMLCanvasElement | null = null;
let lumaCtx: CanvasRenderingContext2D | null = null;

function getLumaContext(): CanvasRenderingContext2D {
  if (!lumaCanvas) {
    lumaCanvas = document.createElement('canvas');
    lumaCanvas.width = 64;
    lumaCanvas.height = 64;
    lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!lumaCtx) {
    throw new Error('2d context unavailable');
  }
  return lumaCtx;
}

export function meanVideoLuma(video: HTMLVideoElement): number {
  const ctx = getLumaContext();
  ctx.drawImage(video, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / pixels;
}

export function interOcularPx(
  lf: LandmarkFrame,
  video: HTMLVideoElement,
): number {
  const left = lf.landmarks[INTER_OCULAR_LEFT];
  const right = lf.landmarks[INTER_OCULAR_RIGHT];
  if (!left || !right) {
    return 0;
  }
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const lx = left.x * w;
  const ly = left.y * h;
  const rx = right.x * w;
  const ry = right.y * h;
  return Math.hypot(rx - lx, ry - ly);
}

export function poseAnglesDeg(headPose: Float32Array | number[]): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  const m = headPose;
  const r00 = m[0] ?? 1;
  const r10 = m[4] ?? 0;
  const r20 = m[8] ?? 0;
  const r21 = m[9] ?? 0;
  const r22 = m[10] ?? 1;

  const pitch = (Math.asin(-r20) * 180) / Math.PI;
  const yaw = (Math.atan2(r10, r00) * 180) / Math.PI;
  const roll = (Math.atan2(r21, r22) * 180) / Math.PI;
  return { yaw, pitch, roll };
}

function landmarkDistance(
  lf: LandmarkFrame,
  indices: readonly number[],
): number {
  if (indices.length < 2) {
    return 0;
  }
  const a = lf.landmarks[indices[0]];
  const b = lf.landmarks[indices[1]];
  if (!a || !b) {
    return 0;
  }
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function computeRawRegionStats(
  lf: LandmarkFrame,
): Record<RegionId, { left: number; right: number }> {
  const stats = {} as Record<RegionId, { left: number; right: number }>;
  for (const regionId of ALL_REGION_IDS) {
    const config = REGION_LANDMARKS[regionId];
    stats[regionId] = {
      left: landmarkDistance(lf, config.left),
      right: landmarkDistance(lf, config.right),
    };
  }
  return stats;
}

function pushJitterSample(value: number): void {
  jitterSamples.push(value);
  if (jitterSamples.length > JITTER_WINDOW) {
    jitterSamples.shift();
  }
}

function restingJitterPct(lf: LandmarkFrame, video: HTMLVideoElement): number {
  const brow = computeRawRegionStats(lf).REGION_BROW;
  const spread = Math.abs(brow.left - brow.right);
  pushJitterSample(spread);
  if (jitterSamples.length < 5) {
    return 0;
  }
  const mean =
    jitterSamples.reduce((acc, v) => acc + v, 0) / jitterSamples.length;
  const variance =
    jitterSamples.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
    jitterSamples.length;
  const std = Math.sqrt(variance);
  const iod = interOcularPx(lf, video) || 1;
  return std / iod;
}

export function resetJitterBuffer(): void {
  jitterSamples.length = 0;
}

export const QualityMonitor = {
  evaluate(
    video: HTMLVideoElement,
    lf: LandmarkFrame | null,
  ): QualityState {
    if (!lf || !lf.facePresent) {
      return 'FACE_LOST';
    }

    const luma = meanVideoLuma(video);
    if (luma < thresholds.qualityGates.lumaMin) {
      return 'LOW_LIGHT';
    }

    const iod = interOcularPx(lf, video);
    if (iod < thresholds.qualityGates.interOcularMinPx) {
      return 'TOO_FAR';
    }

    const { yaw, pitch, roll } = poseAnglesDeg(lf.headPose);
    const maxPose = thresholds.qualityGates.poseMaxDeg;
    if (
      Math.abs(yaw) > maxPose ||
      Math.abs(pitch) > maxPose ||
      Math.abs(roll) > maxPose
    ) {
      return 'POSE_OUT_OF_RANGE';
    }

    const jitter = restingJitterPct(lf, video);
    if (jitter > thresholds.qualityGates.jitterMaxPct) {
      return 'LOW_CONFIDENCE';
    }

    return 'QUALITY_OK';
  },
};
