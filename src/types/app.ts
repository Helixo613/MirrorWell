import type { UserProfile } from '@/data/schema';

export type GateState = 'UNATTESTED' | 'ATTESTED' | 'DEMO';

export interface AppSettings {
  settingsId: 'singleton';
  highContrast: boolean;
  textScale: number;
  hapticsEnabled: boolean;
  audioCuesEnabled: boolean;
  reducedFacePreview: boolean;
  trendGranularity: 'weekly' | 'monthly';
  noiseFloorSymmetry: number;
  showAffectedSideMarker: boolean;
  caregiverViewEnabled: boolean;
}

export interface AppStateContextValue {
  profile: UserProfile | null;
  activeBaseline: null;
  settings: AppSettings;
  gate: GateState;
  setProfile: (profile: UserProfile) => void;
  setGate: (gate: GateState) => void;
}

export const DEFAULT_SETTINGS: AppSettings = {
  settingsId: 'singleton',
  highContrast: false,
  textScale: 1.0,
  hapticsEnabled: true,
  audioCuesEnabled: true,
  reducedFacePreview: false,
  trendGranularity: 'monthly',
  noiseFloorSymmetry: 0.05,
  showAffectedSideMarker: true,
  caregiverViewEnabled: false,
};
