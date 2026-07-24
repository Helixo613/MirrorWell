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

  // DOCS-CHANGE: API §2: the documented demo close-out is SummaryScreen -> OnboardingScreen
  // (§17: OnboardingScreen is "✅ (exits demo)" in DEMO), and ARCHITECTURE §11 makes leaving
  // demo a safety property. Before this the only exits were recordAttestation (which requires a
  // profile and WRITES, impossible in demo, where every write is refused) and a page reload,
  // so demo was a one-way door and OnboardingScreen had no way to clear a module-private flag.
  exitDemoMode(): void {
    demoMode = false;
  },

  isDemoMode(): boolean {
    return demoMode;
  },
};
