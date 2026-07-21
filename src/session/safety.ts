import { MirrorWellError } from '../data/errors.ts';
// Deliberate lazy-reference cycle: StorageService imports SafetyGate; do not hoist either call to module scope.
import { StorageService } from '../data/storage.ts';

let demoMode = false;

export const SafetyGate = {
  async isAttested(): Promise<boolean> {
    if (SafetyGate.isDemoMode()) return false;
    const profile = await StorageService.getProfile();
    return profile != null && profile.attestedAt !== null && profile.consentVersion === import.meta.env.VITE_CONSENT_VERSION;
  },

  async recordAttestation(consentVersion: string): Promise<void> {
    if (consentVersion !== import.meta.env.VITE_CONSENT_VERSION) {
      throw new MirrorWellError('VALIDATION_FAILED', 'consent version must match VITE_CONSENT_VERSION');
    }
    demoMode = false;
    const profile = await StorageService.getProfile();
    if (!profile) {
      throw new MirrorWellError('VALIDATION_FAILED', 'profile must exist before attestation');
    }
    await StorageService.saveProfile({ ...profile, attestedAt: new Date().toISOString(), consentVersion });
  },

  enterDemoMode(): void {
    demoMode = true;
  },

  isDemoMode(): boolean {
    return demoMode;
  },
};
