// tests/analysis/blendshape-probe.mjs, RESEARCH PROBE (not gate evidence).
// Question: does blendshape-based SI (min/max of mouthSmileLeft/Right) hold the V1
// B1/B2/B3 bars on the same 12 fixtures that rejected three geometry candidates?
// Output: tests/analysis/blendshape_probe_S01.json + console table. No contract changes.
//
// Usage: node tests/analysis/blendshape-probe.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUBJECT = 'S01';
const PHASES = ['neutral', 'smile', 'yaw_left', 'yaw_right', 'low_light', 'distance_2m'];
const TRIALS = [1, 2];
// Probe analogs of the V1 bars (MODEL_AND_DATA §7). Activation floor: SI undefined when
// max(smileL, smileR) < floor (blendshape scores are 0..1; rest ≈ 0.0–0.1).
const ACTIVATION_FLOOR = 0.05;
const SMOOTHING_WINDOW = 5;
const YAW_BAND = [7, 13];

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
  const data = {};
  try {
    await page.goto(`${baseURL}/v1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__v1?.init, null, { timeout: 30_000 });
    await page.evaluate(() => window.__v1.init());
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', null, { timeout: 120_000 });
    for (const t of TRIALS) {
      data[t] = {};
      for (const phase of PHASES) {
        const url = `/fixtures/masters/fixture_${SUBJECT}_${phase}_${t}.webm`;
        process.stdout.write(`sampling t${t} ${phase}... `);
        const sample = await page.evaluate(async (u) => window.__v1.sampleVideo(u, 100), url);
        data[t][phase] = deriveBs(sample.rows);
        console.log(`${data[t][phase].length} OK frames`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const report = { kind: 'blendshape-probe', subject: SUBJECT, generatedAt: new Date().toISOString(), activationFloor: ACTIVATION_FLOOR, trials: {} };
  const rowsOut = [];
  for (const t of TRIALS) {
    const d = data[t];
    const smileSi = d.smile.map((r) => r.si).filter((v) => v !== null);
    const smileAct = d.smile.map((r) => r.act);
    const trial = {
      B1a_neutralActStd: std(d.neutral.map((r) => r.act)),
      B1b_smileSiStd: std(smileSi),
      smileSiMean: mean(smileSi),
      smileActMean: mean(smileAct),
      B2: {},
      B3: {},
      yawValidity: {},
    };
    for (const c of ['low_light', 'distance_2m']) {
      trial.B2[c] = Math.abs(mean(d[c].map((r) => r.act)) - trial.smileActMean) / trial.smileActMean;
    }
    for (const c of ['yaw_left', 'yaw_right']) {
      const meanYaw = mean(d[c].map((r) => Math.abs(r.yaw ?? 0)));
      trial.yawValidity[c] = { meanAbsYaw: meanYaw, inBand: meanYaw >= YAW_BAND[0] && meanYaw <= YAW_BAND[1] };
      const si = d[c].map((r) => r.si).filter((v) => v !== null);
      trial.B3[c] = { yawSiMean: mean(si), delta: Math.abs(mean(si) - trial.smileSiMean) };
    }
    report.trials[t] = trial;
    rowsOut.push({
      trial: t,
      'B1a(≤.01*)': trial.B1a_neutralActStd.toFixed(4),
      'B1b(≤.05)': trial.B1b_smileSiStd.toFixed(4),
      smileSI: trial.smileSiMean.toFixed(3),
      'B2 dim(<.05)': trial.B2.low_light.toFixed(3),
      'B2 2m(<.05)': trial.B2.distance_2m.toFixed(3),
      'B3 L(<.05)': trial.B3.yaw_left.delta.toFixed(3),
      'B3 R(<.05)': trial.B3.yaw_right.delta.toFixed(3),
      yawL: trial.yawValidity.yaw_left.meanAbsYaw.toFixed(1),
      yawR: trial.yawValidity.yaw_right.meanAbsYaw.toFixed(1),
    });
  }
  console.table(rowsOut);
  console.log('* B1a analog is in blendshape score units (0..1), not IOD; compare shape, not the geometry bar.');
  const out = path.join(ROOT, 'tests', 'analysis', `blendshape_probe_${SUBJECT}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('written:', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
