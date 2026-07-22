import { StorageService } from '@/data/storage';
import { SettingsService } from '@/data/settings';
import { SafetyGate } from '@/session/safety';
import type { CalibrationBaseline, UserProfile } from '@/data/schema';
import type { AppSettings, GateState } from '@/types/app';

export async function hydrateAppState(): Promise<{
  profile: UserProfile | null;
  activeBaseline: CalibrationBaseline | null;
  settings: AppSettings;
  gate: GateState;
}> {
  const [profile, activeBaseline, settings] = await Promise.all([
    StorageService.getProfile(),
    StorageService.getActiveBaseline(),
    SettingsService.get(),
  ]);
  const attested = await SafetyGate.isAttested();
  return {
    profile,
    activeBaseline,
    settings,
    gate: attested ? 'ATTESTED' : 'UNATTESTED',
  };
}
