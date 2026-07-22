import type {
  AppSettings,
  CalibrationBaseline,
  UserProfile,
} from '@/data/schema';

// AppSettings is owned by src/data/schema.ts (DATABASE.md §2). Re-exported here so screens
// keep importing it from '@/types/app' alongside the UI-only shell types below. Note:
// noiseFloorSymmetry lives on calibration_baseline, NOT app_settings (ARCH §12, DG-4) —
// the salvage's stale copy carried it on settings; the canonical schema does not.
export type { AppSettings };

export type GateState = 'UNATTESTED' | 'ATTESTED' | 'DEMO';

// Root React context value (FRONTEND §3 / ARCH §13 `AppStateContext` read shape + setters).
export interface AppStateContextValue {
  profile: UserProfile | null;
  activeBaseline: CalibrationBaseline | null;
  settings: AppSettings;
  gate: GateState;
  setProfile: (profile: UserProfile | null) => void;
  setGate: (gate: GateState) => void;
  setActiveBaseline: (baseline: CalibrationBaseline | null) => void;
  setSettings: (settings: AppSettings) => void;
}

// UI default before hydration completes; mirrors DEFAULT_SETTINGS in src/data/settings.ts
// (backend-owned, not exported). No noiseFloorSymmetry — it is not an app_settings field.
export const DEFAULT_SETTINGS: AppSettings = {
  settingsId: 'singleton',
  highContrast: false,
  textScale: 1.0,
  hapticsEnabled: true,
  audioCuesEnabled: true,
  reducedFacePreview: false,
  trendGranularity: 'monthly',
  showAffectedSideMarker: true,
  caregiverViewEnabled: false,
};
