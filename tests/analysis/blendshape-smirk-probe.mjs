// tests/analysis/blendshape-smirk-probe.mjs, RESEARCH PROBE: unilateral sensitivity.
// A deliberate one-sided smirk must yield blendshape-SI well below the ~0.99 symmetric
// smile reading, else the blendshape model symmetrizes and the modality is disqualified.
// Usage: node tests/analysis/blendshape-smirk-probe.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIPS = ['fixture_S01_smirk_1.webm', 'fixture_S01_smirk_2.webm'];
const ACTIVATION_FLOOR = 0.05;

const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.webm': 'video/webm', '.mp4': 'video/mp4' };
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
      const p = resolveUrlPath(req.url ?? '/');
      if (!p || !p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, baseURL: `http://127.0.0.1:${server.address().port}` }));
  });
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

async function main() {
  const { chromium } = await import('@playwright/test');
  const { server, baseURL } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`${baseURL}/v1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__v1?.init, null, { timeout: 30_000 });
    await page.evaluate(() => window.__v1.init());
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', null, { timeout: 120_000 });
    for (const clip of CLIPS) {
      const sample = await page.evaluate(async (u) => window.__v1.sampleVideo(u, 100), `/fixtures/masters/${clip}`);
      const ok = sample.rows.filter((r) => r.qualityState === 'QUALITY_OK' && r.blendshapes);
      const active = ok
        .map((r) => ({ L: r.blendshapes.mouthSmileLeft ?? 0, R: r.blendshapes.mouthSmileRight ?? 0 }))
        .filter((p) => Math.max(p.L, p.R) >= ACTIVATION_FLOOR);
      const sis = active.map((p) => Math.min(p.L, p.R) / Math.max(p.L, p.R));
      console.log(`${clip}: ${sample.rows.length} frames, ${ok.length} OK, ${active.length} above floor`);
      if (active.length) {
        console.log(`  mean smileLeft ${mean(active.map((p) => p.L)).toFixed(3)} | mean smileRight ${mean(active.map((p) => p.R)).toFixed(3)}`);
        console.log(`  SI mean ${mean(sis).toFixed(3)} | min ${Math.min(...sis).toFixed(3)} | max ${Math.max(...sis).toFixed(3)}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
