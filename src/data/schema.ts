// src/data/schema.ts — canonical schema for mirrorwell_db, version 1.
// RULE (non-negotiable): only derived numeric data. Never images, video,
// raw landmark arrays, audio, names, emails, or free-text health notes.
import Dexie, { type Table } from 'dexie';

export type ExerciseId =
  | 'EX_BROW_RAISE'
  | 'EX_EYE_CLOSURE'
  | 'EX_SMILE'
  | 'EX_PUCKER';
export type RegionId =
  | 'REGION_BROW'
  | 'REGION_EYELID'
  | 'REGION_MOUTH_CORNER'
  | 'REGION_LIP';
export type EndReason =
  | 'completed'
  | 'user_stopped'
  | 'red_flag_stopped'
  | 'quality_abandoned';

export interface UserProfile {
  profileId: string;
  createdAt: string;
  affectedSide: 'left' | 'right' | 'unknown';
  assignedExercises: ExerciseId[];
  attestedAt: string | null;
  consentVersion: string | null;
}

export interface CalibrationBaseline {
  baselineId: string;
  profileId: string;
  capturedAt: string;
  neutralStats: Record<RegionId, { left: number; right: number }>;
  comfortableMax: Partial<Record<ExerciseId, number>>;
  qualityScore: number;
  isActive: 0 | 1;
}

export interface SessionRecord {
  sessionId: string;
  profileId: string;
  baselineId: string;
  startedAt: string;
  endedAt: string;
  endReason: EndReason;
}

export interface ExerciseResult {
  resultId: string;
  sessionId: string;
  exerciseId: ExerciseId;
  repsCompleted: number;
  meanSymmetryIndex: number | null;
  meanEffortIndex: number | null;
  easeOffCount: number;
  lowQualityFramePct: number;
}

export interface RepMetric {
  repId: string;
  resultId: string;
  repIndex: number;
  peakSymmetryIndex: number | null;
  peakEffortIndex: number;
  durationMs: number;
  easeOffTriggered: 0 | 1;
}

export interface AppSettingsRow {
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

export class MirrorWellDB extends Dexie {
  user_profile!: Table<UserProfile, string>;
  calibration_baseline!: Table<CalibrationBaseline, string>;
  session_record!: Table<SessionRecord, string>;
  exercise_result!: Table<ExerciseResult, string>;
  rep_metric!: Table<RepMetric, string>;
  app_settings!: Table<AppSettingsRow, string>;

  constructor() {
    super('mirrorwell_db');
    this.version(1).stores({
      user_profile: 'profileId',
      calibration_baseline: 'baselineId, profileId, isActive, capturedAt',
      session_record: 'sessionId, profileId, baselineId, startedAt',
      exercise_result: 'resultId, sessionId, exerciseId',
      rep_metric: 'repId, resultId',
      app_settings: 'settingsId',
    });
  }
}

export const db = new MirrorWellDB();
