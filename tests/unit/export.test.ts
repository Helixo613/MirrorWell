import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/schema';
import { StorageService } from '../../src/data/storage';
import { ExportService } from '../../src/data/export';
import { MirrorWellError } from '../../src/data/errors';
import { SafetyGate } from '../../src/session/safety';
import { strings } from '../../src/config/strings';
import type { CalibrationBaseline, EndReason, ExerciseId, UserProfile } from '../../src/data/schema';
import type { SessionRecordInput } from '../../src/data/storage';
import exportSchema from '../schemas/export.schema.json';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID_OLD = '22222222-2222-4222-8222-222222222222';
const BASELINE_ID_NEW = '33333333-3333-4333-8333-333333333333';

const NEUTRAL_STATS: CalibrationBaseline['neutralStats'] = {
  REGION_BROW: { left: { u: 0.0, v: 0.418 }, right: { u: 0.0, v: 0.421 } },
  REGION_EYELID: { left: { u: 0.0, v: 0.112 }, right: { u: 0.0, v: 0.108 } },
  REGION_MOUTH_CORNER: { left: { u: 0.507, v: 0.05 }, right: { u: -0.503, v: 0.05 } },
  REGION_LIP: { left: { u: 0.231, v: 0.08 }, right: { u: -0.229, v: 0.08 } },
};

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    profileId: PROFILE_ID,
    createdAt: '2025-12-01T09:00:00.000Z',
    affectedSide: 'left',
    assignedExercises: ['EX_SMILE', 'EX_BROW_RAISE'],
    attestedAt: '2025-12-01T09:00:00.000Z',
    consentVersion: '1',
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<CalibrationBaseline> = {}): CalibrationBaseline {
  return {
    baselineId: BASELINE_ID_NEW,
    profileId: PROFILE_ID,
    capturedAt: '2026-01-01T09:00:00.000Z',
    neutralStats: NEUTRAL_STATS,
    comfortableMax: { EX_SMILE: 0.092, EX_BROW_RAISE: 0.064 },
    qualityScore: 0.91,
    noiseFloorSymmetry: 0.05,
    noiseFloorDisplacement: 0.008,
    isActive: 1,
    ...overrides,
  };
}

let sessionCounter = 0;
function makeSession(opts: {
  baselineId: string;
  startedAt: string;
  endReason?: EndReason;
  exerciseId?: ExerciseId;
  meanSymmetryIndex: number | null;
}): SessionRecordInput {
  sessionCounter += 1;
  const suffix = String(sessionCounter).padStart(12, '0');
  return {
    sessionId: `a1a1a1a1-0000-4000-8000-${suffix}`,
    profileId: PROFILE_ID,
    baselineId: opts.baselineId,
    startedAt: opts.startedAt,
    endedAt: new Date(new Date(opts.startedAt).getTime() + 6 * 60_000).toISOString(),
    endReason: opts.endReason ?? 'completed',
    results: [
      {
        resultId: `b1b1b1b1-0000-4000-8000-${suffix}`,
        exerciseId: opts.exerciseId ?? 'EX_SMILE',
        repsCompleted: 10,
        meanSymmetryIndex: opts.meanSymmetryIndex,
        meanEffortIndex: 0.4,
        easeOffCount: 0,
        lowQualityFramePct: 0.05,
        reps: [
          {
            repId: `c1c1c1c1-0000-4000-8000-${suffix}`,
            repIndex: 0,
            peakSymmetryIndex: opts.meanSymmetryIndex,
            peakEffortIndex: 0.4,
            durationMs: 1500,
            easeOffTriggered: 0,
          },
        ],
      },
    ],
  };
}

// Minimal recursive draft-07 validator (brief: "plain recursive checker in the test, no new
// deps"). Scoped to what the brief names: type / required / additionalProperties / items —
// enough to catch the additionalProperties:false drift this task cares about.
function validateAgainstSchema(schema: any, data: unknown, path = '$'): string[] {
  const errors: string[] = [];

  function typeMatches(t: string, value: unknown): boolean {
    switch (t) {
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      default:
        return true;
    }
  }

  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, data))) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${JSON.stringify(data)}`);
      return errors; // wrong-typed node: no point recursing further
    }
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) errors.push(`${path}: missing required property "${req}"`);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errors.push(`${path}: additional property "${key}" not allowed`);
      }
    }
    for (const [key, subschema] of Object.entries(schema.properties ?? {})) {
      if (key in obj) {
        errors.push(...validateAgainstSchema(subschema, obj[key], `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(data) && schema.items) {
    data.forEach((item, i) => {
      errors.push(...validateAgainstSchema(schema.items, item, `${path}[${i}]`));
    });
  }

  return errors;
}

/** Seeds a real (fake-indexeddb) profile + two baselines and stubs the gate to ATTESTED,
 * matching the convention in tests/unit/controller.test.ts's seedAttested(). */
async function seedAttestedExportFixture(): Promise<void> {
  await StorageService.saveProfile(makeProfile());
  await StorageService.saveBaseline(makeBaseline({ baselineId: BASELINE_ID_OLD, noiseFloorSymmetry: 0.09 }));
  await StorageService.saveBaseline(makeBaseline({ baselineId: BASELINE_ID_NEW, noiseFloorSymmetry: 0.05 }));
  vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);
  await StorageService.saveSession(
    makeSession({ baselineId: BASELINE_ID_NEW, startedAt: '2026-06-06T12:00:00.000Z', meanSymmetryIndex: 0.6 }),
  );
  await StorageService.saveSession(
    makeSession({
      baselineId: BASELINE_ID_NEW,
      startedAt: '2026-06-10T12:00:00.000Z',
      exerciseId: 'EX_BROW_RAISE',
      meanSymmetryIndex: 0.7,
      endReason: 'user_stopped',
    }),
  );
}

const RANGE = { from: '2026-05-01', to: '2026-07-05' };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  sessionCounter = 0;
  vi.restoreAllMocks();
});

describe('ExportService.generateSummary — schema validation', () => {
  it('produces a JSON payload that validates against tests/schemas/export.schema.json', async () => {
    await seedAttestedExportFixture();

    const { json } = await ExportService.generateSummary(RANGE);
    const parsed = JSON.parse(await json.text());

    expect(validateAgainstSchema(exportSchema, parsed)).toEqual([]);
  });

  it('sanity check: the validator itself rejects a payload with an extra nested field', async () => {
    await seedAttestedExportFixture();

    const { json } = await ExportService.generateSummary(RANGE);
    const parsed = JSON.parse(await json.text());

    // Inject an extra field nested inside sessions[].results[] (not just top-level) — proves
    // the additionalProperties:false check recurses into array items, not just the root.
    const tampered = {
      ...parsed,
      sessions: parsed.sessions.map((s: any, i: number) =>
        i === 0 ? { ...s, results: s.results.map((r: any) => ({ ...r, reps: [] })) } : s,
      ),
    };

    const errors = validateAgainstSchema(exportSchema, tampered);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('reps'))).toBe(true);
  });
});

describe('ExportService.generateSummary — nonDiagnosticNotice', () => {
  it('includes the notice text, equal to strings.exportSummary.nonDiagnosticNotice', async () => {
    await seedAttestedExportFixture();

    const { json } = await ExportService.generateSummary(RANGE);
    const parsed = JSON.parse(await json.text());

    expect(parsed.nonDiagnosticNotice).toBe(strings.exportSummary.nonDiagnosticNotice);
  });

  it('HTML blob contains the same notice text', async () => {
    await seedAttestedExportFixture();

    const { html } = await ExportService.generateSummary(RANGE);
    const htmlText = await html.text();

    expect(htmlText).toContain(strings.exportSummary.nonDiagnosticNotice);
  });
});

describe('ExportService.generateSummary — noiseFloorSymmetry sourcing', () => {
  it("uses the active baseline's noiseFloorSymmetry, not the inactive baseline's value", async () => {
    await seedAttestedExportFixture(); // OLD 0.09 (inactive), NEW 0.05 (active)

    const { json } = await ExportService.generateSummary(RANGE);
    const parsed = JSON.parse(await json.text());

    expect(parsed.noiseFloorSymmetry).toBe(0.05);
    expect(parsed.noiseFloorSymmetry).not.toBe(0.09);
  });
});

describe('ExportService.generateSummary — gating and validation errors', () => {
  it('rejects an unattested profile with NOT_ATTESTED', async () => {
    // No profile saved at all -> SafetyGate.isAttested() is false.
    await expect(ExportService.generateSummary(RANGE)).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
  });

  it('rejects demo mode with NOT_ATTESTED even for an otherwise-attested profile (API.md §17: ExportService is ❌ in DEMO)', async () => {
    await seedAttestedExportFixture(); // isAttested() mocked true
    vi.spyOn(SafetyGate, 'isDemoMode').mockReturnValue(true);

    await expect(ExportService.generateSummary(RANGE)).rejects.toMatchObject({ code: 'NOT_ATTESTED' });
  });

  it('rejects an attested-but-uncalibrated profile with NO_BASELINE, not VALIDATION_FAILED', async () => {
    // Reachable in a real flow: API.md §17 gates ExportScreen on attestation alone, so a user
    // who attested but has not calibrated yet can reach export. NO_BASELINE is the canonical
    // code for this state (SessionController.start, NormalizationLayer.setBaseline).
    await StorageService.saveProfile(makeProfile());
    vi.spyOn(SafetyGate, 'isAttested').mockResolvedValue(true);

    await expect(ExportService.generateSummary(RANGE)).rejects.toMatchObject({ code: 'NO_BASELINE' });
  });

  it('rejects a bad range (from > to) with VALIDATION_FAILED', async () => {
    await seedAttestedExportFixture();

    await expect(
      ExportService.generateSummary({ from: '2026-07-05', to: '2026-05-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a malformed range date with VALIDATION_FAILED', async () => {
    await seedAttestedExportFixture();

    await expect(
      ExportService.generateSummary({ from: 'not-a-date', to: '2026-05-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('ExportService.generateSummary — DB_UNAVAILABLE propagation', () => {
  it('propagates DB_UNAVAILABLE from StorageService.getSessions', async () => {
    await seedAttestedExportFixture();
    vi.spyOn(StorageService, 'getSessions').mockRejectedValueOnce(
      new MirrorWellError('DB_UNAVAILABLE', 'simulated outage'),
    );

    await expect(ExportService.generateSummary(RANGE)).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });
});
