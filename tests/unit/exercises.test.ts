import { describe, expect, it } from 'vitest';
import { exercises, assignableExercises } from '../../src/config/exercises';
import { db } from '../../src/data/schema';
import { StorageService } from '../../src/data/storage';
import { seedDev } from '../../src/dev/seed';

describe('assignableExercises', () => {
  it('excludes EX_PUCKER and includes the other three', () => {
    expect(assignableExercises).not.toContain('EX_PUCKER');
    expect(assignableExercises).toEqual(
      expect.arrayContaining(['EX_BROW_RAISE', 'EX_EYE_CLOSURE', 'EX_SMILE']),
    );
    expect(assignableExercises).toHaveLength(3);
  });

  it('keeps EX_PUCKER as a valid exercises entry (reversibility)', () => {
    expect(exercises['EX_PUCKER']).toBeDefined();
    expect(exercises['EX_PUCKER']!.blendshapePair).toBeUndefined();
  });
});

describe('seedDev', () => {
  it('produces a profile/baseline that survives assertComfortableMax', async () => {
    await seedDev();

    const profile = await StorageService.getProfile();
    expect(profile).not.toBeNull();
    expect([...profile!.assignedExercises].sort()).toEqual([...assignableExercises].sort());

    const baseline = await StorageService.getActiveBaseline();
    expect(baseline).not.toBeNull();
    expect(Object.keys(baseline!.comfortableMax).sort()).toEqual([...assignableExercises].sort());

    await Promise.all(db.tables.map((t) => t.clear()));
  });
});
