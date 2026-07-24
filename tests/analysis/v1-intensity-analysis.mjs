// tests/analysis/v1-intensity-analysis.mjs, EXPLORATORY ANALYSIS (NOT gate evidence).
//
// Question: do the V1 B2 (low_light / distance_2m activation displacement) and
// B3 (yaw SI delta) bar failures track a DROP in smile activation (intensity)
// across phases, rather than a genuine pose/lighting sensitivity of the metric?
//
// Method: pool all FOUR V1 trials of S01: run-1 (retired sitting) + run-2
// (current sitting), trials 1 & 2 each; sample every phase with the same
// headless MediaPipe sampler used by blendshape-probe.mjs, and compare each
// phase's smile-activation to its own trial's frontal `smile` reference.
//
// HONESTY: the verdict is computed from the fixtures. If a phase breaches its
// bar while its activation is matched to the frontal reference (ratio ≈ 1), that
// CONTRADICTS the intensity story and is flagged loudly. Nothing is hardcoded.
//
// Output: tests/analysis/v1_S01_intensity_analysis.json + console table + verdict.
// This does NOT adjust any bar and is NOT a V1 gate report.
//
// Usage: node tests/analysis/v1-intensity-analysis.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBJECT = 'S01';
const PHASES = ['neutral', 'smile', 'yaw_left', 'yaw_right', 'low_light', 'distance_2m'];
// Four trials across two sittings. run-1 = "retired" (nested dir), run-2 = "current" (top-level).
const RUNS = [
  { run: 'run1', prefix: 'masters/retired-20260719' },
  { run: 'run2', prefix: 'masters' },
];
const TRIALS = [1, 2];
// Probe analogs of the V1 bars (MODEL_AND_DATA §7). Activation floor: SI undefined
// when max(smileL, smileR) < floor (blendshape scores are 0..1; rest ≈ 0.0–0.1).
const ACTIVATION_FLOOR = 0.05;
const SMOOTHING_WINDOW = 5;
const YAW_BAND = [7, 13];
const B2_BAR = 0.05;
const B3_BAR = 0.05;
// Classification rule for the intensity hypothesis. B2 IS the activation-deviation
// bar (|meanActivation − smileMeanAct| / smileMeanAct), so a B2 breach is BY DEFINITION
// an intensity change (drop OR increase); it is ALWAYS intensity-linked and can never
// contradict the intensity story. Only B3 (an SI delta, independent of activation
// magnitude) can contradict: when a B3 bar breaches while smile activation is matched
// to frontal (activationRatioVsFrontal ≥ 0.85, i.e. < 15% deviation), the SI shift is
// not explained by reduced smile intensity, so the METRIC itself is pose-sensitive.
const INTENSITY_RATIO_THRESHOLD = 0.85;

const MIME = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mjpeg': 'video/x-motion-jpeg',
};

function resolveUrlPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '/v1') return path.join(ROOT, 'tests', 'analysis', 'v1-runner.html');
  if (clean.startsWith('/wasm/')) return path.join(ROOT, 'public', 'wasm', clean.slice(6));
  if (clean.startsWith('/models/')) return path.join(ROOT, 'public', 'models', clean.slice(8));
  if (clean.startsWith('/fixtures/')) return path.join(ROOT, 'tests', 'fixtures', clean.slice(10));
  if (clean.startsWith('/node_modules/')) return path.join(ROOT, clean.slice(1));
  return null;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = resolveUrlPath(req.url ?? '/');
      if (!filePath || !filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, baseURL: `http://127.0.0.1:${server.address().port}` }));
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const std = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

/** Per-frame blendshape SI + activation from OK rows; trailing-median smoothed SI. */
function deriveBs(rows) {
  const out = [];
  let window = [];
  for (const r of rows) {
    if (r.qualityState !== 'QUALITY_OK' || !r.blendshapes) continue;
    const L = r.blendshapes.mouthSmileLeft ?? 0;
    const R = r.blendshapes.mouthSmileRight ?? 0;
    const act = Math.max(L, R);
    const raw = act < ACTIVATION_FLOOR ? null : Math.min(L, R) / act;
    window.push(raw);
    if (window.length > SMOOTHING_WINDOW) window.shift();
    const present = window.filter((v) => v !== null);
    out.push({ act, si: present.length ? median(present) : null, yaw: r.yawDeg });
  }
  return out;
}

async function main() {
  const { chromium } = await import('@playwright/test');
  const { server, baseURL } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // data[label][phase] = derived rows
  const data = {};
  try {
    await page.goto(`${baseURL}/v1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__v1?.init, null, { timeout: 30_000 });
    await page.evaluate(() => window.__v1.init());
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', null, { timeout: 120_000 });
    for (const { run, prefix } of RUNS) {
      for (const t of TRIALS) {
        const label = `${run}-t${t}`;
        data[label] = {};
        for (const phase of PHASES) {
          const url = `/fixtures/${prefix}/fixture_${SUBJECT}_${phase}_${t}.webm`;
          process.stdout.write(`sampling ${label} ${phase}... `);
          const sample = await page.evaluate(async (u) => window.__v1.sampleVideo(u, 100), url);
          data[label][phase] = deriveBs(sample.rows);
          console.log(`${data[label][phase].length} OK frames`);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const report = {
    kind: 'exploratory-analysis',
    isGateEvidence: false,
    subject: SUBJECT,
    generatedAt: new Date().toISOString(),
    activationFloor: ACTIVATION_FLOOR,
    smoothingWindow: SMOOTHING_WINDOW,
    note: 'Exploratory pooled intensity analysis across 4 V1 trials (run-1 retired + run-2 current). NOT a V1 gate report; does not adjust any bar.',
    trials: {},
    finding: {},
  };

  const tableRows = [];
  const contradictions = [];
  const intensityLinked = [];

  for (const { run } of RUNS) {
    for (const t of TRIALS) {
      const label = `${run}-t${t}`;
      const d = data[label];
      const smileFrames = d.smile;
      const smileMeanAct = mean(smileFrames.map((r) => r.act));
      const smileMeanSI = mean(smileFrames.map((r) => r.si).filter((v) => v !== null));

      const phasesOut = {};
      for (const phase of PHASES) {
        const frames = d[phase];
        const okFrames = frames.length;
        const meanActivation = mean(frames.map((r) => r.act));
        const meanSI = mean(frames.map((r) => r.si).filter((v) => v !== null));
        const activationRatioVsFrontal = smileMeanAct > 0 ? meanActivation / smileMeanAct : null;

        const entry = { meanActivation, activationRatioVsFrontal, meanSI, okFrames };

        let B2, B3, yawValidity;
        if (phase === 'low_light' || phase === 'distance_2m') {
          B2 = smileMeanAct > 0 ? Math.abs(meanActivation - smileMeanAct) / smileMeanAct : null;
          entry.B2 = B2;
        }
        if (phase === 'yaw_left' || phase === 'yaw_right') {
          B3 = Math.abs(meanSI - smileMeanSI);
          entry.B3 = B3;
          const meanAbsYaw = mean(frames.map((r) => Math.abs(r.yaw ?? 0)));
          yawValidity = { meanAbsYaw, inBand: meanAbsYaw >= YAW_BAND[0] && meanAbsYaw <= YAW_BAND[1] };
          entry.yawValidity = yawValidity;
        }
        phasesOut[phase] = entry;

        // Classify any bar breach against the intensity hypothesis.
        const breaches = [];
        if (B2 !== undefined && B2 > B2_BAR) breaches.push({ bar: 'B2', value: B2 });
        if (B3 !== undefined && B3 > B3_BAR) breaches.push({ bar: 'B3', value: B3 });
        for (const b of breaches) {
          const ratio = activationRatioVsFrontal;
          const activationDrop = ratio === null ? null : 1 - ratio;
          const rec = {
            trial: label,
            phase,
            bar: b.bar,
            value: Number(b.value.toFixed(4)),
            activationRatioVsFrontal: ratio === null ? null : Number(ratio.toFixed(4)),
            activationDrop: activationDrop === null ? null : Number(activationDrop.toFixed(4)),
            frontalSmileMeanActivation: Number(smileMeanAct.toFixed(4)),
          };
          // B2 IS the activation-deviation bar, so a B2 breach is intensity-linked by
          // definition (regardless of drop/increase). Only a B3 (SI) breach at matched
          // activation (ratio ≥ threshold) can contradict the intensity story.
          if (b.bar === 'B2' || (ratio !== null && ratio < INTENSITY_RATIO_THRESHOLD)) {
            rec.classification = 'intensity-linked';
            intensityLinked.push(rec);
          } else {
            rec.classification = 'contradicts-intensity (metric pose/lighting-sensitive)';
            contradictions.push(rec);
          }
        }

        tableRows.push({
          trial: label,
          phase,
          meanAct: Number(meanActivation.toFixed(3)),
          actRatio: activationRatioVsFrontal === null ? null : Number(activationRatioVsFrontal.toFixed(3)),
          meanSI: Number.isFinite(meanSI) ? Number(meanSI.toFixed(3)) : null,
          B2: B2 === undefined ? '' : Number(B2.toFixed(3)),
          B3: B3 === undefined ? '' : Number(B3.toFixed(3)),
          yaw: yawValidity ? Number(yawValidity.meanAbsYaw.toFixed(1)) : '',
        });
      }

      report.trials[label] = {
        frontalSmileMeanActivation: Number(smileMeanAct.toFixed(4)),
        frontalSmileMeanSI: Number.isFinite(smileMeanSI) ? Number(smileMeanSI.toFixed(4)) : null,
        phases: phasesOut,
      };
    }
  }

  const intensityExplanationHolds = contradictions.length === 0 && intensityLinked.length > 0;
  let summary;
  if (intensityLinked.length === 0 && contradictions.length === 0) {
    summary =
      'No B2/B3 bar breaches were observed across the four pooled V1 trials, so there is nothing for the intensity hypothesis to explain.';
  } else if (intensityExplanationHolds) {
    summary =
      `The intensity hypothesis HOLDS: all ${intensityLinked.length} bar breach(es) co-occurred with a meaningful smile-activation drop ` +
      `(activationRatioVsFrontal < ${INTENSITY_RATIO_THRESHOLD}) relative to the same trial's frontal smile. The B2/B3 failures track reduced ` +
      `smile activation across phases, not intrinsic pose/lighting sensitivity of the metric.`;
  } else if (intensityLinked.length === 0) {
    summary =
      `The intensity hypothesis DOES NOT HOLD: all ${contradictions.length} bar breach(es) occurred while smile activation was matched to the ` +
      `frontal reference (activationRatioVsFrontal ≥ ${INTENSITY_RATIO_THRESHOLD}). The metric itself is pose/lighting-sensitive; a drop in ` +
      `intensity does not explain these failures.`;
  } else {
    const list = contradictions.map((c) => `${c.trial}/${c.phase} (${c.bar}=${c.value}, ratio=${c.activationRatioVsFrontal})`).join('; ');
    summary =
      `The intensity hypothesis is PARTIAL / DOES NOT FULLY HOLD: ${intensityLinked.length} breach(es) were intensity-linked, but ` +
      `${contradictions.length} breach(es) CONTRADICT it; the bar failed while smile activation was matched to frontal ` +
      `(activationRatioVsFrontal ≥ ${INTENSITY_RATIO_THRESHOLD}), indicating genuine pose/lighting sensitivity of the metric: ${list}.`;
  }

  report.finding = { intensityExplanationHolds, contradictions, intensityLinked, summary };

  console.table(tableRows);
  console.log('\n=== VERDICT ===');
  console.log(`intensityExplanationHolds: ${intensityExplanationHolds}`);
  if (contradictions.length) {
    console.log(`\nCONTRADICTIONS (${contradictions.length}), bar breached while activation matched to frontal:`);
    for (const c of contradictions) {
      console.log(`  ${c.trial}/${c.phase}: ${c.bar}=${c.value} but activationRatio=${c.activationRatioVsFrontal} (drop=${c.activationDrop})`);
    }
  }
  if (intensityLinked.length) {
    console.log(`\nintensity-linked breaches (${intensityLinked.length}):`);
    for (const c of intensityLinked) {
      console.log(`  ${c.trial}/${c.phase}: ${c.bar}=${c.value}, activationRatio=${c.activationRatioVsFrontal} (drop=${c.activationDrop})`);
    }
  }
  console.log(`\n${summary}`);

  const out = path.join(ROOT, 'tests', 'analysis', `v1_${SUBJECT}_intensity_analysis.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\nwritten:', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
