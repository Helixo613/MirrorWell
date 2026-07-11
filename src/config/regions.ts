import type { RegionId } from '@/data/schema';

/** MediaPipe face-mesh indices — placeholders until Task 6 fixture validation. */
export interface RegionLandmarkConfig {
  left: readonly number[];
  right: readonly number[];
}

export const REGION_LANDMARKS: Record<RegionId, RegionLandmarkConfig> = {
  REGION_BROW: {
    left: [70, 105],
    right: [300, 334],
  },
  REGION_EYELID: {
    left: [159, 145],
    right: [386, 374],
  },
  REGION_MOUTH_CORNER: {
    left: [61, 199],
    right: [291, 199],
  },
  REGION_LIP: {
    left: [13, 14],
    right: [13, 14],
  },
};

/** Inter-ocular distance anchors (outer eye corners). */
export const INTER_OCULAR_LEFT = 33;
export const INTER_OCULAR_RIGHT = 263;

export const ALL_REGION_IDS: readonly RegionId[] = [
  'REGION_BROW',
  'REGION_EYELID',
  'REGION_MOUTH_CORNER',
  'REGION_LIP',
] as const;
