import { StorageService } from '@/data/storage';
import { SafetyGate } from '@/session/safety';
import type { UserProfile } from '@/data/schema';
import type { GateState } from '@/types/app';

export async function hydrateAppState(): Promise<{
  profile: UserProfile | null;
  gate: GateState;
}> {
  const profile = await StorageService.getProfile();
  const attested = await SafetyGate.isAttested();
  return {
    profile,
    gate: attested ? 'ATTESTED' : 'UNATTESTED',
  };
}
