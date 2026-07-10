import { StorageService } from '@/data/storage';
import { MirrorWellError } from '@/data/errors';

let demoMode = false;

const CONSENT_VERSION = import.meta.env.VITE_CONSENT_VERSION ?? '1';

export const SafetyGate = {
  async isAttested(): Promise<boolean> {
    const profile = await StorageService.getProfile();
    if (!profile?.attestedAt || !profile.consentVersion) {
      return false;
    }
    return profile.consentVersion === CONSENT_VERSION;
  },

  async recordAttestation(consentVersion: string): Promise<void> {
    if (consentVersion !== CONSENT_VERSION) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        `consentVersion mismatch: expected ${CONSENT_VERSION}`,
        true,
      );
    }
    const profile = await StorageService.getProfile();
    if (!profile) {
      throw new MirrorWellError(
        'VALIDATION_FAILED',
        'no profile exists — saveProfile must be called first',
        true,
      );
    }
    const attested: typeof profile = {
      ...profile,
      attestedAt: new Date().toISOString(),
      consentVersion,
    };
    await StorageService.saveProfile(attested);
  },

  enterDemoMode(): void {
    demoMode = true;
  },

  isDemoMode(): boolean {
    return demoMode;
  },

  getConsentVersion(): string {
    return CONSENT_VERSION;
  },
};
