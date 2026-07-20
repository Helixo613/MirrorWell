export const ONBOARDING_STEP_COUNT = 5;

export type OnboardingStepIndex = 0 | 1 | 2 | 3 | 4;

export interface AttestationState {
  diagnosed: boolean;
  clinicianAssigned: boolean;
  age18Plus: boolean;
  understandsScope: boolean;
}

export const INITIAL_ATTESTATIONS: AttestationState = {
  diagnosed: false,
  clinicianAssigned: false,
  age18Plus: false,
  understandsScope: false,
};

export type AttestationKey = keyof AttestationState;

export const ATTESTATION_KEYS: readonly AttestationKey[] = [
  'diagnosed',
  'clinicianAssigned',
  'age18Plus',
  'understandsScope',
] as const;

export function isAttestationComplete(state: AttestationState): boolean {
  return ATTESTATION_KEYS.every((key) => state[key]);
}

export function isOnboardingStepIndex(value: number): value is OnboardingStepIndex {
  return value >= 0 && value <= 4 && Number.isInteger(value);
}
