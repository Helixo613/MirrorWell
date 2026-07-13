/**
 * All four EX_* exercises, per docs/ARCHITECTURE.md §12 (glossary) and §15 shape (docs/API.md).
 *
 * Landmark indices verified against the canonical MediaPipe 468-point face-mesh topology
 * (FaceLandmarker 478-point output shares this base; 468–477 iris-only, unused). Full
 * region→mover/anchor map for the face-local vector kernel lives in src/metrics/geometry.ts
 * (Task B2). This file keeps exercise→region mapping and documents movers for each EX_*.
 *
 * Geometry kernel (measureAbsolute) region contracts:
 *   REGION_BROW:         movers left brow 105 / right brow 334;
 *                        anchors same-side eye centers mid(263,362) / mid(33,133)
 *   REGION_EYELID:       gap upper−lower: L 159/145, R 386/374
 *   REGION_MOUTH_CORNER: movers L 291 / R 61; anchor nose tip 1 both
 *   REGION_LIP:          movers L 308 / R 78 (inner lip corners); anchor nose tip 1 both
 *
 * landmarkIndices below remain [mover, scalar-ref] pairs so pre-B3 scalar normalize.ts still
 * works. Geometry does NOT read these arrays — it owns its own mesh map. After B3 rewrite,
 * scalar-ref slots may be dropped or aligned.
 *
 * V1 statistical validation (MODEL_AND_DATA.md §4 fixtures) is still pending — indices are
 * mesh-correct, not yet fixture-validated.
 *
 * Dosing fixed in v1, needs verification with mentor (docs/ARCHITECTURE.md §12).
 */
export interface ExerciseConfig {
  exerciseId: string;
  regionId: string;
  landmarkIndices: { left: string[]; right: string[] };
  displayName: string;
  instruction: string;
  demoAssetPath: string;
  repsPerSet: number;
  sets: number;
  restSeconds: number;
}

export const exercises: Readonly<Record<string, ExerciseConfig>> = Object.freeze({
  EX_BROW_RAISE: Object.freeze({
    exerciseId: 'EX_BROW_RAISE',
    regionId: 'REGION_BROW',
    // Geometry: mover 105/334, anchor = same-side eye center (mid outer+inner). Scalar
    // normalize still uses upper-lid 159/386 as a same-side vertical reference until B3.
    landmarkIndices: Object.freeze({ left: ['105', '159'], right: ['334', '386'] }),
    displayName: 'Gentle brow raise',
    instruction: 'Lift your eyebrows slowly — about half of what feels possible. Gentle is the goal.',
    demoAssetPath: '/demo-assets/EX_BROW_RAISE.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  }),
  EX_EYE_CLOSURE: Object.freeze({
    exerciseId: 'EX_EYE_CLOSURE',
    regionId: 'REGION_EYELID',
    // Geometry: gap vector upper−lower (159−145 L, 386−374 R). Scalar pairs match.
    landmarkIndices: Object.freeze({ left: ['159', '145'], right: ['386', '374'] }),
    displayName: 'Gentle eye closure',
    instruction: 'Close your eyes slowly and comfortably — about half of what feels possible.',
    demoAssetPath: '/demo-assets/EX_EYE_CLOSURE.webm',
    repsPerSet: 5,
    sets: 1,
    restSeconds: 20,
  }),
  EX_SMILE: Object.freeze({
    exerciseId: 'EX_SMILE',
    regionId: 'REGION_MOUTH_CORNER',
    // Geometry + scalar: outer corners 291 (L) / 61 (R); anchor nose tip 1.
    landmarkIndices: Object.freeze({ left: ['291', '1'], right: ['61', '1'] }),
    displayName: 'Gentle smile',
    instruction: 'Let a small, slow smile come — about half of what feels possible. Gentle is the goal.',
    demoAssetPath: '/demo-assets/EX_SMILE.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  }),
  EX_PUCKER: Object.freeze({
    exerciseId: 'EX_PUCKER',
    regionId: 'REGION_LIP',
    // Geometry: inner lip corners 308 (L) / 78 (R); anchor nose tip 1 (was upper-lip center 13).
    landmarkIndices: Object.freeze({ left: ['308', '1'], right: ['78', '1'] }),
    displayName: 'Gentle lip pucker',
    instruction: 'Purse your lips slowly and gently — about half of what feels possible.',
    demoAssetPath: '/demo-assets/EX_PUCKER.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  }),
});
