/**
 * All four EX_* exercises, per docs/ARCHITECTURE.md §12 (glossary) and §15 shape (docs/API.md).
 *
 * Landmark indices fixed per docs/IMPLEMENTATION.md Task 6, against the standard canonical
 * MediaPipe 468-point face-mesh topology (the 478-point FaceLandmarker output shares this base
 * indexing; points 468-477 are iris-only and unused here). Each pair is [movingPoint,
 * referencePoint] — NormalizationLayer measures the distance between them per frame, then
 * subtracts the neutral-baseline distance to get regional displacement:
 *   REGION_BROW:         brow point <-> upper-eyelid point (vertical brow-to-eye distance)
 *   REGION_EYELID:       upper-eyelid point <-> lower-eyelid point (lid aperture)
 *   REGION_MOUTH_CORNER: outer mouth-corner point <-> nose tip (smile excursion)
 *   REGION_LIP:          inner lip-corner point <-> upper-lip-center point (pucker convergence)
 *
 * CAVEAT (Task 6 kill-gate note): these are well-documented, standard mesh point choices, but
 * their correctness is UNVERIFIED — V1 (the statistical validation that would confirm or refute
 * them against real recorded faces) could not run in this environment; it needs consented
 * human-volunteer fixture recordings (docs/MODEL_AND_DATA.md §4) that don't exist yet. Do not
 * treat these indices as validated until V1 actually runs and passes.
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
    // left brow (105) <-> left upper eyelid (159); right brow (334) <-> right upper eyelid (386)
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
    // left upper eyelid (159) <-> left lower eyelid (145); right upper (386) <-> right lower (374)
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
    // left outer mouth corner (291) <-> nose tip (1); right outer mouth corner (61) <-> nose tip (1)
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
    // left inner lip corner (308) <-> upper lip center (13); right inner lip corner (78) <-> upper lip center (13)
    landmarkIndices: Object.freeze({ left: ['308', '13'], right: ['78', '13'] }),
    displayName: 'Gentle lip pucker',
    instruction: 'Purse your lips slowly and gently — about half of what feels possible.',
    demoAssetPath: '/demo-assets/EX_PUCKER.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  }),
});
