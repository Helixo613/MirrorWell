/**
 * V1 statistical protocol (docs/MODEL_AND_DATA.md §7) — pure evaluation.
 *
 * Exact predeclared formulas for B1a / B1b / B2 / B3.
 * No fallback statistics: missing or invalid cells are the string "INVALID".
 *
 * Consumed by scripts/run-v1.mjs. Tested via `node --test scripts/v1-protocol.test.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Protocol phase / fixture condition names (MODEL_AND_DATA §7). */
export const PHASES = Object.freeze([
  'neutral',
  'smile',
  'yaw_left',
  'yaw_right',
  'low_light',
  'distance_2m',
]);

export const YAW_PHASES = Object.freeze(['yaw_left', 'yaw_right']);
export const B2_CONDITIONS = Object.freeze(['low_light', 'distance_2m']);

export const TRIALS = 2;
export const MIN_OK_FRAME_PCT = 0.7;
export const YAW_BAND_MIN_DEG = 7;
export const YAW_BAND_MAX_DEG = 13;

export const B1A_MAX_STD = 0.01;
export const B1B_MAX_STD = 0.05;
export const B2_MAX_REL = 0.05;
export const B3_MAX_DELTA_SI = 0.05;

export const INVALID = 'INVALID';
export const DEFAULT_CANDIDATE_ID = 'face-local-vector-v1';

export function isYawPhase(phase) {
  return phase === 'yaw_left' || phase === 'yaw_right';
}

export function mean(xs) {
  if (!xs || xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population std (divides by n). n < 2 → NaN. */
export function std(xs) {
  if (!xs || xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

/**
 * Expected master basename for a protocol cell:
 *   fixture_<subjectId>_<condition>_<trial>
 */
export function expectedFixtureBasename(subjectId, condition, trial) {
  return `fixture_${subjectId}_${condition}_${trial}`;
}

/**
 * Discover masters for the protocol grid.
 * Prefers new naming `fixture_<subject>_<condition>_<trial>.{mp4,webm}`.
 * Old names (no trial, EX_SMILE, yaw_15) are recorded as legacyInsufficient only.
 *
 * @param {string} mastersDir
 * @param {string} subjectId
 * @param {{ existsSync?: Function, readdirSync?: Function, join?: Function }} [io]
 */
export function discoverFixtures(mastersDir, subjectId, io = {}) {
  const existsSync = io.existsSync ?? fs.existsSync.bind(fs);
  const readdirSync = io.readdirSync ?? fs.readdirSync.bind(fs);
  const join = io.join ?? path.join;

  const entries = existsSync(mastersDir) ? readdirSync(mastersDir) : [];
  const byName = new Set(entries);

  const cells = {};
  let allPresent = true;

  for (const condition of PHASES) {
    cells[condition] = {};
    for (let trial = 1; trial <= TRIALS; trial++) {
      const basename = expectedFixtureBasename(subjectId, condition, trial);
      const mp4 = `${basename}.mp4`;
      const webm = `${basename}.webm`;
      let filePath = null;
      let status = 'missing';
      if (byName.has(mp4)) {
        filePath = join(mastersDir, mp4);
        status = 'found';
      } else if (byName.has(webm)) {
        filePath = join(mastersDir, webm);
        status = 'found';
      } else {
        allPresent = false;
      }
      cells[condition][trial] = { status, path: filePath, basename };
    }
  }

  const legacy = [];
  const legacyNotes = {
    [`fixture_${subjectId}_neutral`]: 'missing trial suffix; insufficient for 2-trial protocol',
    [`fixture_${subjectId}_EX_SMILE`]:
      'legacy smile name; protocol condition is "smile" with trial suffix — insufficient',
    [`fixture_${subjectId}_smile`]: 'missing trial suffix; insufficient for 2-trial protocol',
    [`fixture_${subjectId}_low_light`]: 'missing trial suffix; insufficient for 2-trial protocol',
    [`fixture_${subjectId}_distance_2m`]: 'missing trial suffix; insufficient for 2-trial protocol',
    [`fixture_${subjectId}_yaw_15`]:
      'legacy single yaw master; protocol requires yaw_left and yaw_right with measured |yaw| ∈ [7°,13°] and trial suffix — insufficient',
    [`fixture_${subjectId}_yaw_left`]: 'missing trial suffix; insufficient for 2-trial protocol',
    [`fixture_${subjectId}_yaw_right`]: 'missing trial suffix; insufficient for 2-trial protocol',
  };

  for (const [base, note] of Object.entries(legacyNotes)) {
    for (const ext of ['.mp4', '.webm']) {
      const name = base + ext;
      if (byName.has(name)) {
        legacy.push({
          condition: base.replace(`fixture_${subjectId}_`, ''),
          path: join(mastersDir, name),
          note,
        });
      }
    }
  }

  return { cells, legacy, allPresent };
}

/**
 * Evaluate a single phase sample set for validity.
 *
 * Frame shape:
 *   { qualityState: string, maxDisp?: number|null, symmetryIndex?: number|null, yawDeg?: number|null }
 */
export function evaluatePhaseValidity(phase, frames) {
  if (frames == null) {
    return {
      valid: false,
      reason: 'missing_fixture',
      totalFrames: null,
      okFrames: null,
      rejectedFrames: null,
      okPct: INVALID,
      meanAbsYawDeg: isYawPhase(phase) ? INVALID : null,
      qualityCounts: INVALID,
    };
  }

  const total = frames.length;
  if (total === 0) {
    return {
      valid: false,
      reason: 'empty_sample',
      totalFrames: 0,
      okFrames: 0,
      rejectedFrames: 0,
      okPct: INVALID,
      meanAbsYawDeg: isYawPhase(phase) ? INVALID : null,
      qualityCounts: {},
    };
  }

  const qualityCounts = {};
  let okCount = 0;
  const yawAbs = [];
  for (const f of frames) {
    const q = f.qualityState ?? 'FACE_LOST';
    qualityCounts[q] = (qualityCounts[q] ?? 0) + 1;
    if (q === 'QUALITY_OK') {
      okCount += 1;
      if (typeof f.yawDeg === 'number' && Number.isFinite(f.yawDeg)) {
        yawAbs.push(Math.abs(f.yawDeg));
      }
    }
  }

  const rejectedFrames = total - okCount;
  const okPct = okCount / total;
  let meanAbsYawDeg = yawAbs.length > 0 ? mean(yawAbs) : null;

  const reasons = [];
  if (okPct < MIN_OK_FRAME_PCT) {
    reasons.push('low_ok_pct');
  }

  if (isYawPhase(phase)) {
    if (
      meanAbsYawDeg === null ||
      !Number.isFinite(meanAbsYawDeg) ||
      meanAbsYawDeg < YAW_BAND_MIN_DEG ||
      meanAbsYawDeg > YAW_BAND_MAX_DEG
    ) {
      reasons.push('yaw_band');
      if (meanAbsYawDeg === null) meanAbsYawDeg = INVALID;
    }
  }

  return {
    valid: reasons.length === 0,
    reason: reasons.length === 0 ? null : reasons.join('+'),
    totalFrames: total,
    okFrames: okCount,
    rejectedFrames,
    okPct,
    meanAbsYawDeg: isYawPhase(phase) ? (meanAbsYawDeg ?? INVALID) : meanAbsYawDeg,
    qualityCounts,
  };
}

function okFramesOf(frames) {
  return frames.filter((f) => f.qualityState === 'QUALITY_OK');
}

function finiteNumbers(xs) {
  return xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
}

/**
 * B1a: std of pre-floor max(mL,mR) over neutral OK frames ≤ 0.01.
 * Frame field: maxDisp (pre-floor).
 */
export function evaluateB1a(neutralFrames, phaseValid) {
  if (!phaseValid || neutralFrames == null) {
    return { value: INVALID, threshold: B1A_MAX_STD, pass: false, reason: 'neutral_invalid' };
  }
  const series = finiteNumbers(okFramesOf(neutralFrames).map((f) => f.maxDisp));
  if (series.length < 2) {
    return {
      value: INVALID,
      threshold: B1A_MAX_STD,
      pass: false,
      reason: 'insufficient_ok_frames',
      n: series.length,
    };
  }
  const value = std(series);
  if (!Number.isFinite(value)) {
    return {
      value: INVALID,
      threshold: B1A_MAX_STD,
      pass: false,
      reason: 'non_finite_std',
      n: series.length,
    };
  }
  return { value, threshold: B1A_MAX_STD, pass: value <= B1A_MAX_STD, reason: null, n: series.length };
}

/**
 * B1b: std of smoothed SI over frontal-smile hold ≤ 0.05.
 * Frame field: symmetryIndex (already smoothed by sampler / MetricEngine).
 * Null SI frames are dropped; need ≥2 finite SI values. No displacement-std fallback.
 */
export function evaluateB1b(smileFrames, phaseValid) {
  if (!phaseValid || smileFrames == null) {
    return { value: INVALID, threshold: B1B_MAX_STD, pass: false, reason: 'smile_invalid' };
  }
  const series = finiteNumbers(okFramesOf(smileFrames).map((f) => f.symmetryIndex));
  if (series.length < 2) {
    return {
      value: INVALID,
      threshold: B1B_MAX_STD,
      pass: false,
      reason: 'insufficient_si_frames',
      n: series.length,
    };
  }
  const value = std(series);
  if (!Number.isFinite(value)) {
    return {
      value: INVALID,
      threshold: B1B_MAX_STD,
      pass: false,
      reason: 'non_finite_std',
      n: series.length,
    };
  }
  return { value, threshold: B1B_MAX_STD, pass: value <= B1B_MAX_STD, reason: null, n: series.length };
}

/** mean_disp = mean of max(mL,mR) over phase OK frames. */
export function meanDisp(frames) {
  if (frames == null) return NaN;
  return mean(finiteNumbers(okFramesOf(frames).map((f) => f.maxDisp)));
}

/** mean SI over phase OK frames (null SI dropped). */
export function meanSi(frames) {
  if (frames == null) return NaN;
  return mean(finiteNumbers(okFramesOf(frames).map((f) => f.symmetryIndex)));
}

/**
 * B2: for c in {low_light, distance_2m}:
 *   |mean_disp(c) - mean_disp(smile)| / mean_disp(smile) < 0.05
 */
export function evaluateB2(smileFrames, conditionFrames, smileValid, conditionValid, condition) {
  if (!smileValid || smileFrames == null) {
    return {
      condition,
      value: INVALID,
      meanDispCondition: INVALID,
      meanDispSmile: INVALID,
      threshold: B2_MAX_REL,
      pass: false,
      reason: 'smile_invalid',
    };
  }
  if (!conditionValid || conditionFrames == null) {
    return {
      condition,
      value: INVALID,
      meanDispCondition: INVALID,
      meanDispSmile: INVALID,
      threshold: B2_MAX_REL,
      pass: false,
      reason: `${condition}_invalid`,
    };
  }
  const mdSmile = meanDisp(smileFrames);
  const mdCond = meanDisp(conditionFrames);
  if (!Number.isFinite(mdSmile) || mdSmile <= 0) {
    return {
      condition,
      value: INVALID,
      meanDispCondition: Number.isFinite(mdCond) ? mdCond : INVALID,
      meanDispSmile: INVALID,
      threshold: B2_MAX_REL,
      pass: false,
      reason: 'smile_mean_disp_invalid',
    };
  }
  if (!Number.isFinite(mdCond)) {
    return {
      condition,
      value: INVALID,
      meanDispCondition: INVALID,
      meanDispSmile: mdSmile,
      threshold: B2_MAX_REL,
      pass: false,
      reason: 'condition_mean_disp_invalid',
    };
  }
  const value = Math.abs(mdCond - mdSmile) / mdSmile;
  return {
    condition,
    value,
    meanDispCondition: mdCond,
    meanDispSmile: mdSmile,
    threshold: B2_MAX_REL,
    pass: value < B2_MAX_REL,
    reason: null,
  };
}

/**
 * B3: |mean SI(yaw) - mean SI(smile)| < 0.05 for yaw_left and yaw_right.
 */
export function evaluateB3(smileFrames, yawFrames, smileValid, yawValid, yawPhase) {
  if (!smileValid || smileFrames == null) {
    return {
      phase: yawPhase,
      value: INVALID,
      meanSiYaw: INVALID,
      meanSiSmile: INVALID,
      threshold: B3_MAX_DELTA_SI,
      pass: false,
      reason: 'smile_invalid',
    };
  }
  if (!yawValid || yawFrames == null) {
    return {
      phase: yawPhase,
      value: INVALID,
      meanSiYaw: INVALID,
      meanSiSmile: INVALID,
      threshold: B3_MAX_DELTA_SI,
      pass: false,
      reason: `${yawPhase}_invalid`,
    };
  }
  const siSmile = meanSi(smileFrames);
  const siYaw = meanSi(yawFrames);
  if (!Number.isFinite(siSmile)) {
    return {
      phase: yawPhase,
      value: INVALID,
      meanSiYaw: Number.isFinite(siYaw) ? siYaw : INVALID,
      meanSiSmile: INVALID,
      threshold: B3_MAX_DELTA_SI,
      pass: false,
      reason: 'smile_mean_si_invalid',
    };
  }
  if (!Number.isFinite(siYaw)) {
    return {
      phase: yawPhase,
      value: INVALID,
      meanSiYaw: INVALID,
      meanSiSmile: siSmile,
      threshold: B3_MAX_DELTA_SI,
      pass: false,
      reason: 'yaw_mean_si_invalid',
    };
  }
  const value = Math.abs(siYaw - siSmile);
  return {
    phase: yawPhase,
    value,
    meanSiYaw: siYaw,
    meanSiSmile: siSmile,
    threshold: B3_MAX_DELTA_SI,
    pass: value < B3_MAX_DELTA_SI,
    reason: null,
  };
}

/**
 * Evaluate one trial.
 * samplesByPhase: { neutral: Frame[]|null, smile: ..., ... }
 */
export function evaluateTrial(trial, samplesByPhase) {
  const phaseValidity = {};
  for (const phase of PHASES) {
    phaseValidity[phase] = evaluatePhaseValidity(phase, samplesByPhase[phase] ?? null);
  }

  const b1a = evaluateB1a(samplesByPhase.neutral ?? null, phaseValidity.neutral.valid);
  const b1b = evaluateB1b(samplesByPhase.smile ?? null, phaseValidity.smile.valid);

  const b2Cells = {};
  for (const c of B2_CONDITIONS) {
    b2Cells[c] = evaluateB2(
      samplesByPhase.smile ?? null,
      samplesByPhase[c] ?? null,
      phaseValidity.smile.valid,
      phaseValidity[c].valid,
      c,
    );
  }
  const b2Pass = B2_CONDITIONS.every((c) => b2Cells[c].pass);

  const b3Cells = {};
  for (const y of YAW_PHASES) {
    b3Cells[y] = evaluateB3(
      samplesByPhase.smile ?? null,
      samplesByPhase[y] ?? null,
      phaseValidity.smile.valid,
      phaseValidity[y].valid,
      y,
    );
  }
  const b3Pass = YAW_PHASES.every((y) => b3Cells[y].pass);

  return {
    trial,
    phaseValidity,
    B1a: b1a,
    B1b: b1b,
    B2: { cells: b2Cells, pass: b2Pass },
    B3: { cells: b3Cells, pass: b3Pass },
    pass: b1a.pass && b1b.pass && b2Pass && b3Pass,
  };
}

function aggregateNumeric(trialValues) {
  const nums = [];
  for (const v of trialValues) {
    if (v === INVALID || v == null || !Number.isFinite(v)) return INVALID;
    nums.push(v);
  }
  if (nums.length === 0) return INVALID;
  return mean(nums);
}

/**
 * Build the candidate-versioned report object.
 *
 * samplesByTrialPhase: trial → phase → frames|null
 */
export function buildV1Report({
  subjectId,
  candidateId = DEFAULT_CANDIDATE_ID,
  gitSha,
  generatedAt = new Date().toISOString(),
  fixtureDiscovery,
  samplesByTrialPhase,
}) {
  const trials = {};
  const trialResults = [];

  for (let t = 1; t <= TRIALS; t++) {
    const samples = samplesByTrialPhase[t] ?? {};
    const samplesByPhase = {};
    for (const phase of PHASES) {
      samplesByPhase[phase] = samples[phase] ?? null;
    }
    const result = evaluateTrial(t, samplesByPhase);
    trials[t] = result;
    trialResults.push(result);
  }

  const overallPass = trialResults.every((r) => r.pass);

  // Predeclared B2 confound (MODEL_AND_DATA §7): if only B2 fails and the two
  // trials' frontal-smile mean_disp differ by >5%, verdict is PROTOCOL_LIMITED.
  let verdict = overallPass ? 'PASS' : 'FAIL';
  let protocolLimited = false;
  if (!overallPass) {
    const onlyB2Failed = trialResults.every(
      (r) => r.B1a.pass && r.B1b.pass && r.B3.pass && !r.B2.pass,
    );
    if (onlyB2Failed) {
      const smileMeans = trialResults.map((r) => r.B2.cells.low_light?.meanDispSmile);
      const m1 = smileMeans[0];
      const m2 = smileMeans[1];
      if (
        typeof m1 === 'number' &&
        typeof m2 === 'number' &&
        Number.isFinite(m1) &&
        Number.isFinite(m2) &&
        m1 > 0
      ) {
        const reproVar = Math.abs(m1 - m2) / m1;
        if (reproVar > B2_MAX_REL) {
          protocolLimited = true;
          verdict = 'PROTOCOL_LIMITED';
        }
      }
    }
  }

  const aggregate = {
    B1a: aggregateNumeric(trialResults.map((r) => r.B1a.value)),
    B1b: aggregateNumeric(trialResults.map((r) => r.B1b.value)),
    B2: {
      low_light: aggregateNumeric(trialResults.map((r) => r.B2.cells.low_light.value)),
      distance_2m: aggregateNumeric(trialResults.map((r) => r.B2.cells.distance_2m.value)),
    },
    B3: {
      yaw_left: aggregateNumeric(trialResults.map((r) => r.B3.cells.yaw_left.value)),
      yaw_right: aggregateNumeric(trialResults.map((r) => r.B3.cells.yaw_right.value)),
    },
  };

  const rejectedFrameCounts = {};
  const measuredPoseSummary = {};
  for (let t = 1; t <= TRIALS; t++) {
    rejectedFrameCounts[t] = {};
    measuredPoseSummary[t] = {};
    for (const phase of PHASES) {
      const pv = trials[t].phaseValidity[phase];
      rejectedFrameCounts[t][phase] =
        pv.rejectedFrames === null || pv.rejectedFrames === undefined ? INVALID : pv.rejectedFrames;
      measuredPoseSummary[t][phase] = {
        okPct: pv.okPct,
        meanAbsYawDeg: pv.meanAbsYawDeg,
        valid: pv.valid,
        reason: pv.reason,
        qualityCounts: pv.qualityCounts,
      };
    }
  }

  const fixtures = {};
  if (fixtureDiscovery?.cells) {
    for (const phase of PHASES) {
      fixtures[phase] = {};
      for (let t = 1; t <= TRIALS; t++) {
        const cell = fixtureDiscovery.cells[phase]?.[t];
        fixtures[phase][t] = cell
          ? { status: cell.status, path: cell.path, basename: cell.basename }
          : {
              status: 'missing',
              path: null,
              basename: expectedFixtureBasename(subjectId, phase, t),
            };
      }
    }
  }

  return {
    subjectId,
    candidateId,
    generatedAt,
    gitSha: gitSha ?? INVALID,
    protocol: {
      doc: 'docs/MODEL_AND_DATA.md §7',
      phases: [...PHASES],
      trials: TRIALS,
      minOkFramePct: MIN_OK_FRAME_PCT,
      yawBandDeg: [YAW_BAND_MIN_DEG, YAW_BAND_MAX_DEG],
      thresholds: {
        B1a: B1A_MAX_STD,
        B1b: B1B_MAX_STD,
        B2: B2_MAX_REL,
        B3: B3_MAX_DELTA_SI,
      },
      rules: [
        'Per-trial evaluation; PASS only if every trial passes every bar',
        'Missing/invalid cells are the string INVALID — no fallback statistics',
        'Yaw validity requires measured mean |yaw| ∈ [7°, 13°] from headPose',
        'Phase valid only if ≥70% frames QUALITY_OK',
      ],
    },
    fixtures,
    legacyFixtures: fixtureDiscovery?.legacy ?? [],
    trials,
    aggregate,
    rejectedFrameCounts,
    measuredPoseSummary,
    overallPass,
    protocolLimited,
    verdict,
  };
}

/** Report filename: v1_<subject>_<candidate>_report.json */
export function reportFileName(subjectId, candidateId = DEFAULT_CANDIDATE_ID) {
  return `v1_${subjectId}_${candidateId}_report.json`;
}
