// Reviewer page check. Run from the repo root:  node calm-band/sim/test_reviewer.mjs
// Serves the repo root on 127.0.0.1:8003, loads /calm-band/reviewer/?fixtures=... with Playwright,
// asserts no console errors + expected elements, saves screenshots to calm-band/sim/screens/test-run/ (git-ignored; never overwrites the tracked screenshots).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
let chromium;
for (const base of [root, process.env.PLAYWRIGHT_ROOT, path.resolve(root, '..', 'mw-reviewer'), path.resolve(root, '..', '..', '..', '..', 'mw-reviewer')].filter(Boolean)) {
  try { ({ chromium } = createRequire(path.join(base, 'package.json'))('playwright')); break; } catch (e) { /* try next */ }
}
if (!chromium) throw new Error('playwright not found: set PLAYWRIGHT_ROOT to a folder whose node_modules has it');
const shots = path.join(here, 'screens', 'test-run');
fs.mkdirSync(shots, { recursive: true });
const PORT = 8003;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, '127.0.0.1');

const base = `http://127.0.0.1:${PORT}/calm-band/reviewer/`;
let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.log('  FAIL', m); } else console.log('  ok  ', m); };

async function launch() {
  for (const opts of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { return await chromium.launch(opts); } catch (e) { /* try next */ }
  }
  throw new Error('no browser available for Playwright');
}

const browser = await launch();
async function run(name, query, viewport, scheme, check, shot) {
  console.log(name);
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${PORT}/`)) errors.push('non-same-origin request ' + r.url()); });
  await page.goto(base + query);
  await page.waitForTimeout(700);
  await check(page);
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  if (shot) await page.screenshot({ path: path.join(shots, shot), fullPage: true });
  await ctx.close();
}
const count = (p, s) => p.locator(s).count();

await run('fixtures=1 desktop light', '?fixtures=1', { width: 1280, height: 900 }, 'light', async (p) => {
  ok((await count(p, '[data-testid=session-row]')) === 2, 'two session rows');
  ok((await count(p, '[data-testid=chart] svg')) === 1, 'timeline chart drawn');
  ok((await count(p, '[data-testid=pulse-line]')) >= 1, 'pulse line present');
  const d = await p.locator('[data-testid=pulse-line]').getAttribute('d');
  ok((d.match(/M/g) || []).length >= 2, 'pulse line broken into segments (gaps not bridged)');
  ok((await count(p, '.b-moving')) > 0 && (await count(p, '.b-motor')) > 0, 'moving and motor bands');
  ok((await count(p, '.m-rep')) >= 10, 'rep markers');
  ok((await count(p, 'svg polygon.m-ok')) >= 11, 'cue markers');
  ok((await count(p, '.m-ease')) >= 1, 'ease-off marker');
  ok((await count(p, '[data-testid=legend]')) === 1, 'legend');
  ok((await p.locator('[data-testid=facts]').innerText()).includes('experimental: not a medical or stress measure'), 'calm index label');
  ok((await count(p, '[data-testid=trend-days]')) === 1 && (await count(p, '[data-testid=trend-pulse]')) === 1, 'trend charts');
  ok((await count(p, '[data-testid=sim-badge]')) === 2, 'SIMULATED badge on both replay-origin fixture sessions');
  const box = await p.locator('[data-testid=hit]').boundingBox();
  await p.mouse.move(box.x + box.width * 0.4, box.y + 40);
  ok(await p.locator('#tip').isVisible(), 'hover shows window values');
}, 'reviewer-fixtures-desktop-light.png');

await run('fixtures=1 desktop dark', '?fixtures=1', { width: 1280, height: 900 }, 'dark', async (p) => {
  ok((await count(p, '[data-testid=chart] svg')) === 1, 'chart drawn in dark');
}, 'reviewer-fixtures-desktop-dark.png');

await run('fixtures=1 phone', '?fixtures=1', { width: 390, height: 844 }, 'light', async (p) => {
  ok((await count(p, '[data-testid=chart] svg')) === 1, 'chart drawn on phone');
  const sw = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(sw, 'no horizontal overflow');
}, 'reviewer-fixtures-phone.png');

await run('fixtures=1 phone dark', '?fixtures=1', { width: 390, height: 844 }, 'dark', async () => {}, 'reviewer-fixtures-phone-dark.png');

await run('fixtures=1 simulated origin + session with no readings', '?fixtures=1&origin=sim', { width: 1280, height: 900 }, 'light', async (p) => {
  ok((await count(p, '[data-testid=sim-badge]')) === 2, 'SIMULATED badge on each non-live session');
  await p.locator('[data-testid=session-row]').nth(1).click();
  await p.waitForTimeout(400);
  ok((await count(p, '[data-testid=no-windows]')) === 1, 'no-readings message');
  ok((await p.locator('#detail').innerText()).includes('—'), 'missing values shown as dash');
  ok(!/\b0 bpm|NaN|undefined|null/.test(await p.locator('#detail').innerText()), 'no zeros/NaN/undefined');
}, 'reviewer-fixtures-sim-nodata.png');

await run('fixtures=1 mixed origin (per-window origin present, some live)', '?fixtures=1&origin=mixed', { width: 1280, height: 900 }, 'light', async (p) => {
  ok((await count(p, '[data-testid=sim-badge]')) === 2, 'SIMULATED (MIXED) badge on list rows');
  ok((await count(p, '[data-testid=detail-sim-badge]')) === 1, 'detail badge');
  const box = await p.locator('[data-testid=hit]').boundingBox();
  await p.mouse.move(box.x + box.width * 0.3, box.y + 40);
  ok((await p.locator('#tip').innerText()).includes('Origin'), 'tooltip shows per-window origin');
}, 'reviewer-fixtures-mixed.png');

await run('missing optional fields (origin stripped)', '?fixtures=1&origin=none&theme=dark', { width: 390, height: 844 }, 'dark', async (p) => {
  ok((await count(p, '[data-testid=sim-badge]')) === 0 && (await count(p, '[data-testid=detail-sim-badge]')) === 0, 'no badge and no crash when origin missing');
  ok((await count(p, '[data-testid=chart] svg')) === 1, 'chart still drawn');
}, 'reviewer-fixtures-phone-dark-forced.png');

await run('fixtures=empty', '?fixtures=empty', { width: 1280, height: 700 }, 'light', async (p) => {
  ok((await count(p, '[data-testid=empty-sessions]')) === 1, 'empty sessions message');
  ok((await count(p, '[data-testid=empty-trends]')) === 1, 'empty trends message');
}, 'reviewer-fixtures-empty.png');

await run('fixtures=error (API unreachable)', '?fixtures=error', { width: 1280, height: 700 }, 'light', async (p) => {
  ok((await count(p, '[data-testid=api-error]')) === 1, 'unreachable message');
  ok(!(await p.locator('body').innerText()).includes('HTTP'), 'no error dump');
}, 'reviewer-fixtures-error.png');

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
