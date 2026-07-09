import { expect, test } from '@playwright/test';

/**
 * The no-network privacy gate (docs/AGENTS.md non-negotiable; docs/ARCHITECTURE.md §9;
 * docs/IMPLEMENTATION.md Task 1 acceptance). MirrorWell must never make a network call:
 * no fetch, no CDN, no telemetry, no crash reporting, no analytics.
 *
 * Scope note: this test proves the harness on the Task 1 empty shell. Task 4 (LandmarkEngine
 * + model bundling) must re-run this same gate once /models and /wasm requests exist, to
 * prove the FilesetResolver CDN default is fully bypassed.
 *
 * Deliberately stricter than "after page load": we listen from the moment the page/context
 * is created, not just post-load, because the non-negotiable is "no network calls, ever" —
 * catching a same-origin-violation during initial load is not a false positive, it's the point.
 */
test('production build makes zero non-same-origin requests', async ({ page, baseURL }) => {
  const pageOrigin = new URL(baseURL!).origin;
  const offOriginRequests: string[] = [];
  const offOriginWebSockets: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    // Ignore Playwright/Chromium internal schemes (about:, data:, blob:) — not network calls.
    if (!/^https?:\/\//.test(url)) return;
    if (new URL(url).origin !== pageOrigin) {
      offOriginRequests.push(`${request.method()} ${url}`);
    }
  });

  page.on('websocket', (ws) => {
    const url = ws.url();
    if (new URL(url).origin !== pageOrigin) {
      offOriginWebSockets.push(url);
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Give async post-load work (service worker registration, etc.) a window to fire.
  await page.waitForTimeout(1000);

  expect(offOriginRequests, 'non-same-origin HTTP request(s) detected').toEqual([]);
  expect(offOriginWebSockets, 'non-same-origin WebSocket connection(s) detected').toEqual([]);
});
