import { describe, expect, it } from 'vitest';
import Dexie, { type Table } from 'dexie';

// First migration since the v1.0/v2.0 tags (V3 Task 4: encouragement_note, DATABASE.md §7).
// version(2).stores() in src/data/schema.ts lists ONLY the new table; this test proves the
// assumption that relies on: Dexie carries every store left unlisted forward unchanged, so an
// existing user's rows survive the upgrade untouched and gain nothing but the new, empty table.
// "silently dropping health history is forbidden" (§7); this is the guard for that.
//
// version(1) is frozen forever (§7: "never edit version(1) after first release"), so the literal
// store list below is safe to duplicate here; it will never drift from schema.ts.
const DB_NAME = 'mirrorwell_db_migration_v1_to_v2_test';

const V1_STORES = {
  user_profile: 'profileId',
  calibration_baseline: 'baselineId, profileId, isActive, capturedAt',
  session_record: 'sessionId, profileId, baselineId, startedAt',
  exercise_result: 'resultId, sessionId, exerciseId',
  rep_metric: 'repId, resultId',
  app_settings: 'settingsId',
};

interface V1Profile {
  profileId: string;
  createdAt: string;
  affectedSide: string;
  assignedExercises: string[];
  attestedAt: string | null;
  consentVersion: string | null;
}

interface V1Session {
  sessionId: string;
  profileId: string;
  baselineId: string;
  startedAt: string;
  endedAt: string;
  endReason: string;
}

class V1Db extends Dexie {
  user_profile!: Table<V1Profile, string>;
  session_record!: Table<V1Session, string>;
  constructor() {
    super(DB_NAME);
    this.version(1).stores(V1_STORES);
  }
}

class V2Db extends Dexie {
  user_profile!: Table<V1Profile, string>;
  session_record!: Table<V1Session, string>;
  encouragement_note!: Table<{ noteId: string; text: string; createdAt: string }, string>;
  constructor() {
    super(DB_NAME);
    this.version(1).stores(V1_STORES);
    this.version(2).stores({ encouragement_note: 'noteId' });
  }
}

const PROFILE: V1Profile = {
  profileId: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-01-01T00:00:00.000Z',
  affectedSide: 'left',
  assignedExercises: ['EX_SMILE'],
  attestedAt: '2026-01-01T00:00:00.000Z',
  consentVersion: null,
};

const SESSION: V1Session = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  profileId: PROFILE.profileId,
  baselineId: '33333333-3333-4333-8333-333333333333',
  startedAt: '2026-06-01T08:00:00.000Z',
  endedAt: '2026-06-01T08:06:00.000Z',
  endReason: 'completed',
};

describe('schema migration v1 -> v2 (encouragement_note)', () => {
  it('preserves existing rows across the upgrade and adds an empty encouragement_note table', async () => {
    const v1 = new V1Db();
    await v1.open();
    await v1.user_profile.add(PROFILE);
    await v1.session_record.add(SESSION);
    v1.close();

    const v2 = new V2Db();
    try {
      await v2.open();
      expect(await v2.user_profile.get(PROFILE.profileId)).toEqual(PROFILE);
      expect(await v2.session_record.get(SESSION.sessionId)).toEqual(SESSION);
      expect(await v2.encouragement_note.count()).toBe(0);
    } finally {
      v2.close();
      await v2.delete();
    }
  });
});
