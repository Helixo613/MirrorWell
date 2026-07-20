import type { AppSettings, CalibrationBaseline, UserProfile } from '@/data/schema';

export type GateState = 'UNATTESTED' | 'ATTESTED' | 'DEMO';

export interface AppStateContextValue {
  profile: UserProfile | null;
  activeBaseline: CalibrationBaseline | null;
  settings: AppSettings;
  gate: GateState;
  setProfile: (profile: UserProfile | null) => void;
  setGate: (gate: GateState) => void;
  setActiveBaseline: (baseline: CalibrationBaseline | null) => void;
  setSettings: (settings: AppSettings) => void;
};
