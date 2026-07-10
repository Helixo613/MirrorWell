import type { ExerciseId, RegionId } from '@/data/schema';

export interface ExerciseDefinition {
  exerciseId: ExerciseId;
  regionId: RegionId;
  landmarkIndices: { left: string[]; right: string[] };
  displayName: string;
  instruction: string;
  demoAssetPath: string;
  repsPerSet: number;
  sets: number;
  restSeconds: number;
}

export const EXERCISES: Record<ExerciseId, ExerciseDefinition> = {
  EX_BROW_RAISE: {
    exerciseId: 'EX_BROW_RAISE',
    regionId: 'REGION_BROW',
    landmarkIndices: { left: [], right: [] },
    displayName: 'Brow raise',
    instruction:
      'Lift your eyebrows gently — a small, slow movement. Stay relaxed.',
    demoAssetPath: '/demo-assets/EX_BROW_RAISE.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  },
  EX_EYE_CLOSURE: {
    exerciseId: 'EX_EYE_CLOSURE',
    regionId: 'REGION_EYELID',
    landmarkIndices: { left: [], right: [] },
    displayName: 'Gentle eye closure',
    instruction:
      'Close your eyes softly — do not squeeze. Open slowly and rest.',
    demoAssetPath: '/demo-assets/EX_EYE_CLOSURE.webm',
    repsPerSet: 5,
    sets: 1,
    restSeconds: 20,
  },
  EX_SMILE: {
    exerciseId: 'EX_SMILE',
    regionId: 'REGION_MOUTH_CORNER',
    landmarkIndices: { left: [], right: [] },
    displayName: 'Gentle smile',
    instruction:
      'Let a small, slow smile come — about half of what feels possible. Gentle is the goal.',
    demoAssetPath: '/demo-assets/EX_SMILE.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  },
  EX_PUCKER: {
    exerciseId: 'EX_PUCKER',
    regionId: 'REGION_LIP',
    landmarkIndices: { left: [], right: [] },
    displayName: 'Gentle lip pucker',
    instruction:
      'Pucker your lips gently, like saying a soft kiss. Small movement only.',
    demoAssetPath: '/demo-assets/EX_PUCKER.webm',
    repsPerSet: 10,
    sets: 1,
    restSeconds: 20,
  },
};

export const EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[];
