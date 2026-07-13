// src/metrics/normalize.ts — makes geometry comparable across pose, distance, lighting, and
// sessions (docs/BACKEND.md §1.4). Contracts: docs/API.md §7.
//
// Pipeline: measureAbsolute(af) → subtract stored vector neutralStats component-wise →
// vector regionDisplacements. Calibration bootstrap uses measureAbsolute directly — zero /
// default / ephemeral baselines are forbidden (DG-2).
import type { ApprovedFrame } from '../sensing/quality.ts';
import type { CalibrationBaseline, RegionId } from '../data/schema.ts';
import { MirrorWellError } from '../data/errors.ts';
import { measureAbsolute, type Vec2 } from './geometry.ts';

export interface NormalizedFrame {
  regionDisplacements: Record<RegionId, { left: Vec2; right: Vec2 }>;
  timestampMs: number;
}

const ALL_REGIONS: readonly RegionId[] = [
  'REGION_BROW',
  'REGION_EYELID',
  'REGION_MOUTH_CORNER',
  'REGION_LIP',
];

let activeBaseline: CalibrationBaseline | null = null;

function isFiniteVec(v: unknown): v is Vec2 {
  if (!v || typeof v !== 'object') return false;
  const o = v as { u?: unknown; v?: unknown };
  return Number.isFinite(o.u) && Number.isFinite(o.v);
}

function assertCompleteBaseline(b: CalibrationBaseline): void {
  if (!b || !b.neutralStats) {
    throw new MirrorWellError('NO_BASELINE', 'setBaseline called with an invalid or incomplete baseline');
  }
  for (const region of ALL_REGIONS) {
    const neutral = b.neutralStats[region];
    if (!neutral || !isFiniteVec(neutral.left) || !isFiniteVec(neutral.right)) {
      throw new MirrorWellError('NO_BASELINE', `missing region ${region}`);
    }
  }
  if (!Number.isFinite(b.noiseFloorSymmetry) || b.noiseFloorSymmetry < 0) {
    throw new MirrorWellError('NO_BASELINE', 'noiseFloorSymmetry missing or invalid');
  }
  if (!Number.isFinite(b.noiseFloorDisplacement) || b.noiseFloorDisplacement < 0) {
    throw new MirrorWellError('NO_BASELINE', 'noiseFloorDisplacement missing or invalid');
  }
}

function setBaseline(b: CalibrationBaseline): void {
  assertCompleteBaseline(b);
  activeBaseline = b;
}

function clearBaseline(): void {
  activeBaseline = null;
}

function normalize(af: ApprovedFrame): NormalizedFrame {
  if (!activeBaseline) {
    throw new MirrorWellError('NO_BASELINE', 'normalize called without setBaseline');
  }

  const abs = measureAbsolute(af);
  const regionDisplacements = {} as Record<RegionId, { left: Vec2; right: Vec2 }>;

  for (const region of ALL_REGIONS) {
    const neutral = activeBaseline.neutralStats[region];
    if (!neutral || !isFiniteVec(neutral.left) || !isFiniteVec(neutral.right)) {
      throw new MirrorWellError('NO_BASELINE', `missing region ${region}`);
    }
    regionDisplacements[region] = {
      left: {
        u: abs[region].left.u - neutral.left.u,
        v: abs[region].left.v - neutral.left.v,
      },
      right: {
        u: abs[region].right.u - neutral.right.u,
        v: abs[region].right.v - neutral.right.v,
      },
    };
  }

  return { regionDisplacements, timestampMs: af.lf.timestampMs };
}

export const NormalizationLayer = { setBaseline, normalize, clearBaseline };
