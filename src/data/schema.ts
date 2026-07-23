// src/data/schema.ts — canonical schema for mirrorwell_db, version 1.
// RULE (non-negotiable): only derived numeric data. Never images, video,
// raw landmark arrays, audio, emails, or free-text health notes. The narrow
// nickname/motivation exceptions are optional, user-authored, local-only, and
// never exported.
// RULE: the type exports below (ExerciseId, RegionId, EndReason, row types)
// are the single canonical definitions. src/config/exercises.ts and all
// services IMPORT them from here — never redeclare them anywhere.
import Dexie, { type Table } from 'dexie';

export type ExerciseId = 'EX_BROW_RAISE' | 'EX_EYE_CLOSURE' | 'EX_SMILE' | 'EX_PUCKER';
export type RegionId = 'REGION_BROW' | 'REGION_EYELID' | 'REGION_MOUTH_CORNER' | 'REGION_LIP';
export type EndReason = 'completed' | 'user_stopped' | 'red_flag_stopped' | 'quality_abandoned';

export interface UserProfile {
  profileId: string;              // PK, uuid v4
  createdAt: string;              // UTC ISO 8601
  nickname?: string;              // optional user-chosen display name, local-only
  motivation?: string;            // optional user-authored "why", local-only
  affectedSide: 'left' | 'right' | 'unknown';  // display orientation ONLY, never scoring
  assignedExercises: ExerciseId[];// therapist-assigned subset, length 1..4
  attestedAt: string | null;      // UTC ISO 8601; null until onboarding attestation
  consentVersion: string | null;  // must equal VITE_CONSENT_VERSION or onboarding re-runs
}

export interface CalibrationBaseline {
  baselineId: string;             // PK, uuid v4
  profileId: string;              // FK -> user_profile.profileId (enforced by StorageService)
  capturedAt: string;             // UTC ISO 8601
  // Face-local vector medians in IOD units (ARCHITECTURE §7 / §13). Components are signed
  // projections — legitimately negative; do NOT require > 0.
  neutralStats: Record<RegionId, { left: { u: number; v: number }; right: { u: number; v: number } }>;
  comfortableMax: Partial<Record<ExerciseId, number>>; // median gentle-max peak max(mL,mR), keys = assignedExercises
  // Median NEUTRAL max(mL,mR) per assigned exercise, captured during the neutral windows.
  // MediaPipe reports nonzero resting activation for some blendshapes (browOuterUp, eyeBlink),
  // so effortIndex rebases: (act − neutralActivation) / (comfortableMax − neutralActivation)
  // (ARCHITECTURE §7). Optional so pre-field rows stay readable; SessionController.start
  // refuses a baseline without it (RECALIBRATION_REQUIRED) — a session must never silently
  // run the pre-rebase formula.
  neutralActivation?: Partial<Record<ExerciseId, number>>;
  qualityScore: number;           // [0..1] = fraction of QUALITY_OK capture frames; >= 0.7 enforced
  noiseFloorSymmetry: number;     // std of smoothed SI over held comfortable-max captures (B1b)
  noiseFloorDisplacement: number; // std of pre-floor max(mL,mR) over neutral OK frames (B1a)
  isActive: 0 | 1;                // exactly one row with 1 (StorageService invariant)
}

export interface SessionRecord {
  sessionId: string;              // PK, uuid v4
  profileId: string;              // FK -> user_profile
  baselineId: string;             // FK -> calibration_baseline; trends never mix baselineIds
  startedAt: string;              // UTC ISO 8601
  endedAt: string;                // UTC ISO 8601; >= startedAt enforced
  endReason: EndReason;
}

export interface ExerciseResult {
  resultId: string;               // PK, uuid v4
  sessionId: string;              // FK -> session_record
  exerciseId: ExerciseId;
  repsCompleted: number;          // integer >= 0
  meanSymmetryIndex: number | null; // [0..1]; null if no valid (non-null) samples
  meanEffortIndex: number | null;   // >= 0; null if no valid samples
  easeOffCount: number;           // integer >= 0, times the ease-off cue fired
  lowQualityFramePct: number;     // [0..1], fraction of frames rejected by QualityMonitor
}

export interface RepMetric {
  repId: string;                  // PK, uuid v4
  resultId: string;               // FK -> exercise_result
  repIndex: number;               // integer >= 0, order within the exercise
  peakSymmetryIndex: number | null; // [0..1]; null if movement stayed under movementFloor
  peakEffortIndex: number;        // >= 0
  durationMs: number;             // integer > 0
  easeOffTriggered: 0 | 1;
}

export interface AppSettings {
  settingsId: 'singleton';        // PK, always the literal 'singleton'
  highContrast: boolean;          // default false
  textScale: number;              // default 1.0, range [1.0..2.0]
  hapticsEnabled: boolean;        // default true (effective on Android only)
  audioCuesEnabled: boolean;      // default true
  reducedFacePreview: boolean;    // default false ("show me less of my face")
  trendGranularity: 'weekly' | 'monthly'; // default 'monthly'
  // noiseFloorSymmetry lives on calibration_baseline (baseline-paired; DG-4), not here
  showAffectedSideMarker: boolean;// default true; no effect when affectedSide === 'unknown'
  caregiverViewEnabled: boolean;  // default false; the patient's consent act for CaregiverScreen
}

export class MirrorWellDB extends Dexie {
  user_profile!: Table<UserProfile, string>;
  calibration_baseline!: Table<CalibrationBaseline, string>;
  session_record!: Table<SessionRecord, string>;
  exercise_result!: Table<ExerciseResult, string>;
  rep_metric!: Table<RepMetric, string>;
  app_settings!: Table<AppSettings, string>;

  constructor() {
    super('mirrorwell_db');
    // Dexie index syntax: first entry = primary key; the rest = indexes.
    this.version(1).stores({
      user_profile:         'profileId',
      calibration_baseline: 'baselineId, profileId, isActive, capturedAt',
      session_record:       'sessionId, profileId, baselineId, startedAt',
      exercise_result:      'resultId, sessionId, exerciseId',
      rep_metric:           'repId, resultId',
      app_settings:         'settingsId',
    });
  }
}

export const db = new MirrorWellDB();
