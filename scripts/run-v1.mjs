#!/usr/bin/env node
/**
 * Task B7 — V1 kill-gate runner (docs/MODEL_AND_DATA.md §7 B1a/B1b/B2/B3).
 *
 * Default mode (dry-run / discovery):
 *   node scripts/run-v1.mjs --subject S01 --candidate face-local-vector-v1
 *
 * Scans tests/fixtures/masters for protocol-named masters:
 *   fixture_<subject>_<condition>_<trial>.{mp4,webm}
 * with conditions: neutral | smile | yaw_left | yaw_right | low_light | distance_2m
 * and trials 1..2.
 *
 * Missing cells → "INVALID" in the candidate report; overall FAIL (exit 2).
 * Never overwrites another candidate's report or tests/analysis/rejected/*.
 * Historical v1_S01_report.json is left untouched.
 *
 * Optional sampling (--sample): when every required master is present, serves a
 * same-origin local server and samples via Playwright + tests/analysis/v1-runner.html
 * (bundled wasm only — no CDN). Sampling is skipped automatically when the grid
 * is incomplete so dry-run against old fixtures still proves rejection rules.
 *
 * Exit codes:
 *   0 — protocol PASS
 *   2 — protocol FAIL or PROTOCOL_LIMITED (runner executed successfully)
 *   1 — infrastructure error
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  PHASES,
  TRIALS,
  DEFAULT_CANDIDATE_ID,
  discoverFixtures,
  buildV1Report,
  reportFileName,
  INVALID,
} from './v1-protocol.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ANALYSIS = path.join(ROOT, 'tests', 'analysis');
const MASTERS = path.join(ROOT, 'tests', 'fixtures', 'masters');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mjpeg': 'video/x-motion-jpeg',
  '.json': 'application/json',
};

function parseArgs(argv) {
  const out = {
    subject: 'S01',
    candidate: DEFAULT_CANDIDATE_ID,
    sample: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--subject' && argv[i + 1]) {
      out.subject = argv[++i];
    } else if (a === '--candidate' && argv[i + 1]) {
      out.candidate = argv[++i];
    } else if (a === '--sample') {
      out.sample = true;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return INVALID;
  }
}

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function resolveUrlPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '/v1') {
    return path.join(ROOT, 'tests', 'analysis', 'v1-runner.html');
  }
  if (clean.startsWith('/wasm/')) {
    return path.join(ROOT, 'public', 'wasm', clean.slice('/wasm/'.length));
  }
  if (clean.startsWith('/models/')) {
    return path.join(ROOT, 'public', 'models', clean.slice('/models/'.length));
  }
  if (clean.startsWith('/fixtures/')) {
    return path.join(ROOT, 'tests', 'fixtures', clean.slice('/fixtures/'.length));
  }
  if (clean.startsWith('/node_modules/')) {
    return path.join(ROOT, clean.slice(1));
  }
  return null;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = resolveUrlPath(req.url ?? '/');
      if (
        !filePath ||
        !filePath.startsWith(ROOT) ||
        !fs.existsSync(filePath) ||
        fs.statSync(filePath).isDirectory()
      ) {
        res.writeHead(404);
        res.end('not found: ' + req.url);
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType(filePath),
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseURL: `http://127.0.0.1:${port}` });
    });
  });
}

/**
 * Derive protocol frames from raw sampler rows for one trial (MODEL_AND_DATA §7).
 * The sampler (v1-runner.html) emits absolute face-local features per QUALITY_OK frame;
 * displacement/SI are computed here against the trial's own neutral-phase median baseline,
 * mirroring src/metrics/geometry.ts aggregation + src/metrics/metrics.ts SI/smoothing.
 * Values mirror src/config/thresholds.ts (metrics.*).
 */
const MOVEMENT_FLOOR_PCT = 0.008;
const SMOOTHING_WINDOW = 5;
const GAP_RESET_MS = 250;
const MOUTH = 'REGION_MOUTH_CORNER';

function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function neutralMouthStats(rows) {
  const ok = (rows ?? []).filter((r) => r.qualityState === 'QUALITY_OK' && r.features?.[MOUTH]);
  if (ok.length === 0) return null;
  const comp = (side, c) => median(ok.map((r) => r.features[MOUTH][side][c]));
  return {
    left: { u: comp('left', 'u'), v: comp('left', 'v') },
    right: { u: comp('right', 'u'), v: comp('right', 'v') },
  };
}

// Blendshape candidate (blendshape-si-v1): SI/act from per-side smile scores — absolute,
// no neutral baseline needed. Mirrors src/metrics/metrics.ts rawSymmetryAndEffort +
// thresholds.blendshapes.activationFloor.
const ACTIVATION_FLOOR = 0.05;
const BS_PAIR = { left: 'mouthSmileLeft', right: 'mouthSmileRight' };

function deriveBlendshapeTrialFrames(rowsByPhase) {
  const out = {};
  for (const [phase, rows] of Object.entries(rowsByPhase)) {
    if (!rows) {
      out[phase] = null;
      continue;
    }
    let window = [];
    let lastOkMs = null;
    out[phase] = rows.map((r) => {
      let maxDisp = null;
      let symmetryIndex = null;
      if (r.qualityState === 'QUALITY_OK' && r.blendshapes) {
        const L = r.blendshapes[BS_PAIR.left] ?? 0;
        const R = r.blendshapes[BS_PAIR.right] ?? 0;
        const act = Math.max(L, R);
        maxDisp = act;
        const raw = act < ACTIVATION_FLOOR ? null : Math.min(L, R) / act;
        if (lastOkMs !== null && r.timestampMs - lastOkMs > GAP_RESET_MS) window = [];
        lastOkMs = r.timestampMs;
        window.push(raw);
        if (window.length > SMOOTHING_WINDOW) window.shift();
        const present = window.filter((v) => v !== null);
        symmetryIndex = present.length === 0 ? null : median(present);
      }
      return {
        qualityState: r.qualityState,
        maxDisp,
        symmetryIndex,
        yawDeg: typeof r.yawDeg === 'number' ? r.yawDeg : null,
      };
    });
  }
  return out;
}

function deriveTrialFrames(rowsByPhase) {
  const neutral = neutralMouthStats(rowsByPhase.neutral);
  const out = {};
  for (const [phase, rows] of Object.entries(rowsByPhase)) {
    if (!rows) {
      out[phase] = null;
      continue;
    }
    let window = [];
    let lastOkMs = null;
    out[phase] = rows.map((r) => {
      let maxDisp = null;
      let symmetryIndex = null;
      if (r.qualityState === 'QUALITY_OK' && r.features?.[MOUTH] && neutral) {
        const f = r.features[MOUTH];
        const dL = { u: f.left.u - neutral.left.u, v: f.left.v - neutral.left.v };
        // Mirrored right vector: ΔR̃ = (−ΔR.u, ΔR.v)
        const dRt = { u: -(f.right.u - neutral.right.u), v: f.right.v - neutral.right.v };
        const mL = Math.hypot(dL.u, dL.v);
        const mR = Math.hypot(dRt.u, dRt.v);
        const maxM = Math.max(mL, mR);
        const minM = Math.min(mL, mR);
        maxDisp = maxM;
        let raw = null;
        if (maxM >= MOVEMENT_FLOOR_PCT) {
          const cosTheta = mL * mR === 0 ? 0 : (dL.u * dRt.u + dL.v * dRt.v) / (mL * mR);
          raw = (minM / maxM) * Math.max(0, cosTheta);
        }
        if (lastOkMs !== null && r.timestampMs - lastOkMs > GAP_RESET_MS) window = [];
        lastOkMs = r.timestampMs;
        window.push(raw);
        if (window.length > SMOOTHING_WINDOW) window.shift();
        const present = window.filter((v) => v !== null);
        symmetryIndex = present.length === 0 ? null : median(present);
      }
      return {
        qualityState: r.qualityState,
        maxDisp,
        symmetryIndex,
        yawDeg: typeof r.yawDeg === 'number' ? r.yawDeg : null,
      };
    });
  }
  return out;
}

/**
 * When fixtures are incomplete: every missing cell → null samples → INVALID bars.
 * When fixtures are present but --sample not requested: still null samples
 * (metrics require MediaPipe sampling); fixture discovery alone is not enough to PASS.
 *
 * Dry-run / default incomplete path intentionally feeds null samples for missing cells.
 */
function samplesFromDiscovery(discovery, { sampled = null } = {}) {
  const samplesByTrialPhase = {};
  for (let t = 1; t <= TRIALS; t++) {
    samplesByTrialPhase[t] = {};
    for (const phase of PHASES) {
      const cell = discovery.cells[phase][t];
      if (cell.status !== 'found') {
        samplesByTrialPhase[t][phase] = null;
        continue;
      }
      if (sampled?.[t]?.[phase]) {
        samplesByTrialPhase[t][phase] = sampled[t][phase];
      } else {
        // Master exists but not sampled → still cannot evaluate metrics.
        // Mark as present-but-unsampled by leaving frames null with a note
        // via phase validity missing_fixture semantics: use empty? No —
        // use null so reason is missing_fixture OR we could use a sentinel.
        // Spec: dry-run without sampling → INVALID. null is correct.
        samplesByTrialPhase[t][phase] = null;
      }
    }
  }
  return samplesByTrialPhase;
}

async function sampleAll(discovery, subjectId, candidate) {
  const { chromium } = await import('@playwright/test');
  const { server, baseURL } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const sampled = {};

  try {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[page]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));

    await page.goto(`${baseURL}/v1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__v1?.init, null, { timeout: 30_000 });
    await page.evaluate(() => window.__v1.init());
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', null, {
      timeout: 120_000,
    });

    for (let t = 1; t <= TRIALS; t++) {
      sampled[t] = {};
      for (const phase of PHASES) {
        const cell = discovery.cells[phase][t];
        if (cell.status !== 'found' || !cell.path) {
          sampled[t][phase] = null;
          continue;
        }
        const rel = path.relative(path.join(ROOT, 'tests', 'fixtures'), cell.path).replace(/\\/g, '/');
        const url = `/fixtures/${rel}`;
        console.log(`Sampling trial ${t} ${phase}: ${url}`);
        const sample = await page.evaluate(async (u) => window.__v1.sampleVideo(u, 100), url);
        sampled[t][phase] = sample?.rows ?? [];
        const ok = sampled[t][phase].filter((f) => f.qualityState === 'QUALITY_OK').length;
        console.log(`  → ${sampled[t][phase].length} frames, ${ok} QUALITY_OK`);
      }
      // Per-trial derivation. Geometry candidates: displacement/SI vs this trial's
      // neutral baseline. Blendshape candidate: absolute per-side scores.
      sampled[t] =
        candidate === 'blendshape-si-v1'
          ? deriveBlendshapeTrialFrames(sampled[t])
          : deriveTrialFrames(sampled[t]);
    }
    return sampled;
  } finally {
    await browser.close();
    server.close();
  }
}

function printSummary(report, reportPath) {
  console.log('\n======== V1 REPORT ========');
  console.log(`subject:    ${report.subjectId}`);
  console.log(`candidate:  ${report.candidateId}`);
  console.log(`gitSha:     ${report.gitSha}`);
  console.log(`verdict:    ${report.verdict}`);
  console.log(`overallPass:${report.overallPass}`);

  if (report.legacyFixtures?.length) {
    console.log('\nLegacy fixtures (insufficient for new protocol):');
    for (const leg of report.legacyFixtures) {
      console.log(`  - ${leg.path}: ${leg.note}`);
    }
  }

  console.log('\nFixture grid:');
  for (const phase of PHASES) {
    for (let t = 1; t <= TRIALS; t++) {
      const f = report.fixtures[phase]?.[t];
      console.log(`  ${phase} trial ${t}: ${f?.status ?? 'missing'} (${f?.basename ?? '?'})`);
    }
  }

  console.log('\nPer-trial bars:');
  for (let t = 1; t <= TRIALS; t++) {
    const tr = report.trials[t];
    console.log(`  trial ${t}: pass=${tr.pass}`);
    console.log(`    B1a: value=${tr.B1a.value} pass=${tr.B1a.pass} reason=${tr.B1a.reason}`);
    console.log(`    B1b: value=${tr.B1b.value} pass=${tr.B1b.pass} reason=${tr.B1b.reason}`);
    for (const c of ['low_light', 'distance_2m']) {
      const cell = tr.B2.cells[c];
      console.log(`    B2.${c}: value=${cell.value} pass=${cell.pass} reason=${cell.reason}`);
    }
    for (const y of ['yaw_left', 'yaw_right']) {
      const cell = tr.B3.cells[y];
      console.log(`    B3.${y}: value=${cell.value} pass=${cell.pass} reason=${cell.reason}`);
    }
  }

  console.log('\nAggregate:');
  console.log(JSON.stringify(report.aggregate, null, 2));
  console.log(`\nReport written: ${reportPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/run-v1.mjs [--subject S01] [--candidate ${DEFAULT_CANDIDATE_ID}] [--dry-run] [--sample]
  --dry-run   Force discovery-only evaluation (no MediaPipe sampling)
  --sample    Sample all present masters via Playwright (requires complete grid)
Exit: 0 PASS, 2 FAIL/PROTOCOL_LIMITED, 1 infrastructure error`);
    process.exit(0);
  }

  fs.mkdirSync(ANALYSIS, { recursive: true });

  const discovery = discoverFixtures(MASTERS, args.subject);
  console.log(
    `Discovered protocol fixtures for ${args.subject}: allPresent=${discovery.allPresent}, legacy=${discovery.legacy.length}`,
  );

  let sampled = null;
  const wantSample = args.sample && !args.dryRun;

  if (wantSample && discovery.allPresent) {
    console.log('Complete fixture grid found — sampling via Playwright…');
    sampled = await sampleAll(discovery, args.subject, args.candidate);
  } else if (wantSample && !discovery.allPresent) {
    console.warn(
      'WARNING: --sample requested but fixture grid incomplete; falling back to dry-run INVALID cells.',
    );
  } else {
    console.log(
      'Dry-run / discovery mode: missing or unsampled cells → INVALID (no fallback statistics).',
    );
  }

  const samplesByTrialPhase = samplesFromDiscovery(discovery, { sampled });

  // When we did sample, use those frames; samplesFromDiscovery already merges.
  if (sampled) {
    for (let t = 1; t <= TRIALS; t++) {
      for (const phase of PHASES) {
        if (sampled[t]?.[phase]) {
          samplesByTrialPhase[t][phase] = sampled[t][phase];
        }
      }
    }
  }

  const report = buildV1Report({
    subjectId: args.subject,
    candidateId: args.candidate,
    gitSha: gitSha(),
    fixtureDiscovery: discovery,
    samplesByTrialPhase,
  });

  const outName = reportFileName(args.subject, args.candidate);
  // Refuse to write into rejected/ or the historical non-candidate report name.
  if (outName === 'v1_S01_report.json' || outName.includes('rejected')) {
    console.error('Refusing to overwrite historical/rejected report path:', outName);
    process.exit(1);
  }
  const reportPath = path.join(ANALYSIS, outName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  printSummary(report, reportPath);

  if (report.overallPass) {
    process.exitCode = 0;
  } else {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
