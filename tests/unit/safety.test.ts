import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/schema';
import type { UserProfile } from '../../src/data/schema';
import { StorageService } from '../../src/data/storage';
import { SafetyGate } from '../../src/session/safety';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const ORIGINAL_CONSENT_VERSION = import.meta.env.VITE_CONSENT_VERSION;

function makeProfile(): UserProfile {
  return {
    profileId: PROFILE_ID,
    createdAt: '2026-07-01T09:00:00.000Z',
    affectedSide: 'left',
    assignedExercises: ['EX_SMILE'],
    attestedAt: null,
    consentVersion: null,
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  import.meta.env.VITE_CONSENT_VERSION = '1';
});

afterEach(() => {
  import.meta.env.VITE_CONSENT_VERSION = ORIGINAL_CONSENT_VERSION;
});

describe('SafetyGate', () => {
  it('returns false without a profile when the consent version is unset', async () => {
    Reflect.deleteProperty(import.meta.env, 'VITE_CONSENT_VERSION');

    expect(await SafetyGate.isAttested()).toBe(false);
  });

  it('re-gates attestation when the consent version changes', async () => {
    expect(await SafetyGate.isAttested()).toBe(false);

    await StorageService.saveProfile(makeProfile());
    await SafetyGate.recordAttestation('1');
    expect(await SafetyGate.isAttested()).toBe(true);

    import.meta.env.VITE_CONSENT_VERSION = '2';
    expect(await SafetyGate.isAttested()).toBe(false);
  });

  it('persists attestation through StorageService', async () => {
    await StorageService.saveProfile(makeProfile());
    await SafetyGate.recordAttestation('1');

    expect(await StorageService.getProfile()).toMatchObject({
      attestedAt: expect.any(String),
      consentVersion: '1',
    });
  });

  it('rejects attestation without a profile', async () => {
    await expect(SafetyGate.recordAttestation('1')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects an attestation version that differs from the current version', async () => {
    await StorageService.saveProfile(makeProfile());

    await expect(SafetyGate.recordAttestation('2')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('keeps demo mode in module memory only', async () => {
    SafetyGate.enterDemoMode();
    expect(SafetyGate.isDemoMode()).toBe(true);

    vi.resetModules();
    const { SafetyGate: reloadedSafetyGate } = await import('../../src/session/safety');
    expect(reloadedSafetyGate.isDemoMode()).toBe(false);
  });
});
