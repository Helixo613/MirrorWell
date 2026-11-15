// Dev helper: screenshots the live band card + summary for each fixture (needs the dev server:
//   VITE_ENABLE_BAND_HARNESS=true VITE_COMPANION_ENABLED=true npx vite --port 8002 --strictPort).
import { chromium } from '@playwright/test';

const base = process.env.UI_BASE ?? 'http://localhost:8002';
const live = ['usable', 'collecting', 'contact-required', 'vibration', 'poor-quality-moving', 'stale'];
const summaries = ['settled', 'insufficient', '404'];
const browser = await chromium.launch({ channel: process.env.UI_CHANNEL ?? 'msedge' });
const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
for (const name of live) {
  await page.goto(`${base}/?mock=live-${name}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `calm-band/sim/screens/ui-live-${name}.png` });
}
for (const name of summaries) {
  await page.goto(`${base}/?mock=summary-${name}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `calm-band/sim/screens/ui-summary-${name}.png` });
}
// waiting state: the first view, before the first fetch resolves
await page.goto(`${base}/?mock=summary-settled`);
await page.screenshot({ path: 'calm-band/sim/screens/ui-summary-waiting.png' });
await browser.close();
