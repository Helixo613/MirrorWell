import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../src/data/schema';

// SafetyGate holds module-level `demoMode` with no public exit (enterDemoMode is one-way by
// design; recordAttestation is the documented demo-exit path). A test that enters demo therefore
// leaked into every test after it, isAttested() short-circuits to false in demo and
// StorageService reads are demo-blocked, so the attestation tests failed whenever they happened
// to run after the demo test. Each test now gets a fresh module graph via vi.resetModules() +
// dynamic import, mirroring tests/unit/controller.test.ts; no test-only reset is added to the
// production contract.
let db: typeof import('../../src/data/schema').db;
let StorageService: typeof import('../../src/data/storage').StorageService;
let SafetyGate: typeof import('../../src/session/safety').SafetyGate;

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
  vi.resetModules();
  ({ db } = await import('../../src/data/schema'));
  ({ StorageService } = await import('../../src/data/storage'));
  ({ SafetyGate } = await import('../../src/session/safety'));
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

  it('exits demo mode without touching storage (the OnboardingScreen close-out)', async () => {
    SafetyGate.enterDemoMode();
    expect(SafetyGate.isDemoMode()).toBe(true);
    // Demo refuses every write, so recordAttestation; the only other exit; cannot run here.
    await expect(StorageService.saveProfile(makeProfile())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    SafetyGate.exitDemoMode();

    expect(SafetyGate.isDemoMode()).toBe(false);
    // The exit is real, not cosmetic: writes work again, so the stepper can attest.
    await StorageService.saveProfile(makeProfile());
    await SafetyGate.recordAttestation('1');
    expect(await SafetyGate.isAttested()).toBe(true);
  });

  it('keeps demo mode in module memory only', async () => {
    SafetyGate.enterDemoMode();
    expect(SafetyGate.isDemoMode()).toBe(true);

    vi.resetModules();
    const { SafetyGate: reloadedSafetyGate } = await import('../../src/session/safety');
    expect(reloadedSafetyGate.isDemoMode()).toBe(false);
  });
});
