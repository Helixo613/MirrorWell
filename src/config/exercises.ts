/**
 * All four EX_* exercises, per docs/ARCHITECTURE.md §12 (glossary) and §15 shape (docs/API.md).
 * Landmark indices are placeholders until docs/IMPLEMENTATION.md Task 6 fixes them on real fixtures.
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
    landmarkIndices: Object.freeze({ left: ['<placeholder>'], right: ['<placeholder>'] }),
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
    landmarkIndices: Object.freeze({ left: ['<placeholder>'], right: ['<placeholder>'] }),
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
    landmarkIndices: Object.freeze({ left: ['<placeholder>'], right: ['<placeholder>'] }),
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
    landmarkIndices: Object.freeze({ left: ['<placeholder>'], right: ['<placeholder>'] }),
    displayName: 'Gentle lip pucker',
    instruction: 'Purse your lips slowly and gently — about half of what feels possible.',
    demoAssetPath: '/demo-assets/EX_PUCKER.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  }),
});
