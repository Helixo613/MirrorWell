/**
 * node --test scripts/v1-protocol.test.mjs
 * Proves INVALID cells for missing fixtures and exact B1a/B1b/B2/B3 formulas.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  PHASES,
  TRIALS,
  INVALID,
  B1A_MAX_STD,
  B1B_MAX_STD,
  B2_MAX_REL,
  B3_MAX_DELTA_SI,
  discoverFixtures,
  evaluatePhaseValidity,
  evaluateB1a,
  evaluateB1b,
  evaluateB2,
  evaluateB3,
  evaluateTrial,
  buildV1Report,
  reportFileName,
  std,
  mean,
} from './v1-protocol.mjs';

function okFrames(n, { maxDisp = 0.001, symmetryIndex = 0.9, yawDeg = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    qualityState: 'QUALITY_OK',
    maxDisp: typeof maxDisp === 'function' ? maxDisp(i) : maxDisp,
    symmetryIndex: typeof symmetryIndex === 'function' ? symmetryIndex(i) : symmetryIndex,
    yawDeg: typeof yawDeg === 'function' ? yawDeg(i) : yawDeg,
  }));
}

describe('discoverFixtures', () => {
  it('marks all protocol cells missing when masters empty', () => {
    const d = discoverFixtures('/no/such/dir', 'S01', {
      existsSync: () => false,
      readdirSync: () => [],
      join: path.join,
    });
    assert.equal(d.allPresent, false);
    for (const phase of PHASES) {
      for (let t = 1; t <= TRIALS; t++) {
        assert.equal(d.cells[phase][t].status, 'missing');
        assert.equal(d.cells[phase][t].basename, `fixture_S01_${phase}_${t}`);
      }
    }
  });

  it('records legacy yaw_15 / EX_SMILE as insufficient, not as protocol cells', () => {
    const names = [
      'fixture_S01_neutral.mp4',
      'fixture_S01_EX_SMILE.mp4',
      'fixture_S01_low_light.mp4',
      'fixture_S01_distance_2m.mp4',
      'fixture_S01_yaw_15.mp4',
    ];
    const d = discoverFixtures('/masters', 'S01', {
      existsSync: () => true,
      readdirSync: () => names,
      join: path.join,
    });
    assert.equal(d.allPresent, false);
    assert.equal(d.cells.smile[1].status, 'missing');
    assert.equal(d.cells.yaw_left[1].status, 'missing');
    assert.equal(d.cells.yaw_right[1].status, 'missing');
    assert.ok(d.legacy.some((l) => l.condition === 'yaw_15'));
    assert.ok(d.legacy.some((l) => l.condition === 'EX_SMILE'));
    assert.ok(d.legacy.find((l) => l.condition === 'yaw_15').note.includes('insufficient'));
  });

  it('finds new naming with trial suffix', () => {
    const names = [];
    for (const phase of PHASES) {
      for (let t = 1; t <= TRIALS; t++) {
        names.push(`fixture_S01_${phase}_${t}.mp4`);
      }
    }
    const d = discoverFixtures('/masters', 'S01', {
      existsSync: () => true,
      readdirSync: () => names,
      join: path.join,
    });
    assert.equal(d.allPresent, true);
    assert.equal(d.cells.yaw_left[2].status, 'found');
  });
});

describe('phase validity', () => {
  it('missing frames → INVALID okPct + invalid', () => {
    const v = evaluatePhaseValidity('neutral', null);
    assert.equal(v.valid, false);
    assert.equal(v.okPct, INVALID);
    assert.equal(v.reason, 'missing_fixture');
  });

  it('requires ≥70% QUALITY_OK', () => {
    const frames = [
      ...okFrames(6),
      ...Array.from({ length: 4 }, () => ({ qualityState: 'FACE_LOST' })),
    ];
    // 60% OK
    assert.equal(evaluatePhaseValidity('neutral', frames).valid, false);
    const ok = [
      ...okFrames(7),
      ...Array.from({ length: 3 }, () => ({ qualityState: 'FACE_LOST' })),
    ];
    assert.equal(evaluatePhaseValidity('neutral', ok).valid, true);
  });

  it('yaw phases require measured mean |yaw| ∈ [7,13]', () => {
    const low = okFrames(10, { yawDeg: 3 });
    assert.equal(evaluatePhaseValidity('yaw_left', low).valid, false);
    assert.ok(evaluatePhaseValidity('yaw_left', low).reason.includes('yaw_band'));

    const mid = okFrames(10, { yawDeg: 10 });
    assert.equal(evaluatePhaseValidity('yaw_left', mid).valid, true);

    const high = okFrames(10, { yawDeg: 15 });
    assert.equal(evaluatePhaseValidity('yaw_right', high).valid, false);
  });
});

describe('B1a/B1b/B2/B3 formulas', () => {
  it('B1a uses std of maxDisp; no SI fallback', () => {
    const frames = okFrames(20, { maxDisp: (i) => 0.005 + (i % 2) * 0.001 });
    const r = evaluateB1a(frames, true);
    assert.equal(r.pass, true);
    assert.ok(typeof r.value === 'number' && r.value <= B1A_MAX_STD);

    const noisy = okFrames(20, { maxDisp: (i) => (i % 2) * 0.05 });
    assert.equal(evaluateB1a(noisy, true).pass, false);

    assert.equal(evaluateB1a(null, false).value, INVALID);
  });

  it('B1b uses SI std only; never displacement std fallback', () => {
    const stable = okFrames(20, { symmetryIndex: 0.92 });
    assert.equal(evaluateB1b(stable, true).pass, true);

    // All null SI → INVALID (old runner would fall back to displacement std)
    const nullSi = okFrames(20, { symmetryIndex: null, maxDisp: 0.001 });
    const r = evaluateB1b(nullSi, true);
    assert.equal(r.value, INVALID);
    assert.equal(r.pass, false);
    assert.equal(r.reason, 'insufficient_si_frames');
  });

  it('B2 relative deviation vs frontal smile', () => {
    const smile = okFrames(10, { maxDisp: 0.1 });
    const good = okFrames(10, { maxDisp: 0.102 }); // 2%
    const bad = okFrames(10, { maxDisp: 0.12 }); // 20%
    assert.equal(evaluateB2(smile, good, true, true, 'low_light').pass, true);
    assert.equal(evaluateB2(smile, bad, true, true, 'distance_2m').pass, false);
    assert.equal(evaluateB2(smile, null, true, false, 'low_light').value, INVALID);
  });

  it('B3 SI delta for each yaw direction', () => {
    const smile = okFrames(10, { symmetryIndex: 0.9 });
    const yawOk = okFrames(10, { symmetryIndex: 0.92, yawDeg: 10 });
    const yawBad = okFrames(10, { symmetryIndex: 0.7, yawDeg: 10 });
    assert.equal(evaluateB3(smile, yawOk, true, true, 'yaw_left').pass, true);
    assert.equal(evaluateB3(smile, yawBad, true, true, 'yaw_right').pass, false);
    assert.ok(evaluateB3(smile, yawBad, true, true, 'yaw_right').value > B3_MAX_DELTA_SI);
  });
});

describe('buildV1Report dry-run missing cells', () => {
  it('all INVALID and overall FAIL when samples null', () => {
    const discovery = discoverFixtures('/masters', 'S01', {
      existsSync: () => true,
      readdirSync: () => [
        'fixture_S01_neutral.mp4',
        'fixture_S01_EX_SMILE.mp4',
        'fixture_S01_yaw_15.mp4',
      ],
      join: path.join,
    });
    const samplesByTrialPhase = {};
    for (let t = 1; t <= TRIALS; t++) {
      samplesByTrialPhase[t] = {};
      for (const phase of PHASES) samplesByTrialPhase[t][phase] = null;
    }
    const report = buildV1Report({
      subjectId: 'S01',
      candidateId: 'face-local-vector-v1',
      gitSha: 'deadbeef',
      fixtureDiscovery: discovery,
      samplesByTrialPhase,
    });
    assert.equal(report.overallPass, false);
    assert.equal(report.verdict, 'FAIL');
    assert.equal(report.aggregate.B1a, INVALID);
    assert.equal(report.aggregate.B1b, INVALID);
    assert.equal(report.aggregate.B2.low_light, INVALID);
    assert.equal(report.aggregate.B3.yaw_left, INVALID);
    assert.equal(report.trials[1].B1a.value, INVALID);
    assert.equal(report.trials[2].B3.cells.yaw_right.value, INVALID);
    assert.ok(report.legacyFixtures.some((l) => l.condition === 'yaw_15'));
    assert.equal(reportFileName('S01', 'face-local-vector-v1'), 'v1_S01_face-local-vector-v1_report.json');
    // Must not collide with historical name
    assert.notEqual(reportFileName('S01', 'face-local-vector-v1'), 'v1_S01_report.json');
  });

  it('PASS when every trial has valid phases and bars', () => {
    const samplesByTrialPhase = {};
    for (let t = 1; t <= TRIALS; t++) {
      samplesByTrialPhase[t] = {
        neutral: okFrames(20, { maxDisp: 0.002 }),
        smile: okFrames(20, { maxDisp: 0.1, symmetryIndex: 0.91 }),
        yaw_left: okFrames(20, { maxDisp: 0.1, symmetryIndex: 0.9, yawDeg: 10 }),
        yaw_right: okFrames(20, { maxDisp: 0.1, symmetryIndex: 0.905, yawDeg: -10 }),
        low_light: okFrames(20, { maxDisp: 0.102, symmetryIndex: 0.91 }),
        distance_2m: okFrames(20, { maxDisp: 0.099, symmetryIndex: 0.91 }),
      };
    }
    const report = buildV1Report({
      subjectId: 'S01',
      candidateId: 'face-local-vector-v1',
      gitSha: 'abc',
      fixtureDiscovery: { cells: {}, legacy: [], allPresent: true },
      samplesByTrialPhase,
    });
    assert.equal(report.overallPass, true);
    assert.equal(report.verdict, 'PASS');
    assert.ok(typeof report.aggregate.B1a === 'number');
  });
});

describe('helpers', () => {
  it('std/mean match population definition', () => {
    assert.equal(mean([1, 2, 3]), 2);
    assert.ok(Math.abs(std([1, 2, 3]) - Math.sqrt(2 / 3)) < 1e-12);
  });

  it('evaluateTrial fails closed on partial data', () => {
    const r = evaluateTrial(1, { neutral: okFrames(10, { maxDisp: 0.001 }) });
    assert.equal(r.pass, false);
    assert.equal(r.B1a.pass, true);
    assert.equal(r.B1b.value, INVALID);
    assert.equal(r.B2.pass, false);
    assert.equal(r.B3.pass, false);
  });
});
