import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readCounts } from '../helpers/seed';

// Runs in the `camera` Playwright project: Chromium with --use-fake-device-for-media-stream. The
// fake device renders a synthetic pattern with NO FACE, so QualityMonitor returns FACE_LOST on
// every frame. On this device the SessionScreen's 'active' phase is UNREACHABLE by both paths:
//   - demo  → quick-setup captures zero approved frames → NO_BASELINE (built loudly, honestly)
//   - real  → SessionController.start()'s drift check captures zero approved frames → QUALITY_TOO_LOW
// So the honest faceless surface is: the quick-setup overlay, the frozen symmetry bar, the loud
// NO_BASELINE failure, and camera release. Rep counting, ease-off fire, the rest timer, the
// qualityOfferStop card, red-flag guidance and sessionEnded→summary are all 'active'-phase only
// and require fixture replay (Reconvergence Journey 1/2) — out of this stream's scope.

const SLOW_MS = 120_000; // model load (3.6 MB WASM + .task)
const CAPTURE_MS = 90_000; // two ~3 s quick-setup windows + warm-up

const QUICK_SETUP_TITLE = 'Quick setup';
const NO_BASELINE_TITLE = 'Calibration comes first';
const NO_BASELINE_BODY =
  'MirrorWell measures movement against your own calibration, so we need to capture that before this can work. It takes about a minute.';

declare global {
  interface Window {
    __mwTracks?: MediaStreamTrack[];
  }
}

/** Wraps getUserMedia before any app code runs and keeps every track it hands out, so the
 *  camera-release assertion can read `readyState` later. Test-only; no production code touched. */
async function recordCameraTracks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__mwTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__mwTracks?.push(...stream.getTracks());
      return stream;
    };
  });
}

/** Onboarding renders "Try a demo" in its always-present header; tapping it enters Demo Mode
 *  (SafetyGate.enterDemoMode + gate=DEMO) and navigates to /session. */
async function enterDemoSession(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('button', { name: 'Try a demo' }).click();
  await expect(page).toHaveURL(/\/session$/);
  // Warm-up (LandmarkEngine.init) resolves into the quick-setup overlay.
  await expect(page.getByRole('heading', { name: QUICK_SETUP_TITLE })).toBeVisible({
    timeout: SLOW_MS,
  });
}

/** Reads the canvas's bar band: a coarse signature (for frame-to-frame equality) and whether any
 *  pixel is actually drawn there (so the frozen-bar equality check can never pass on a blank
 *  canvas — a bar that never renders would be caught). */
async function barBand(page: Page): Promise<{ signature: string; nonBlank: boolean; sized: boolean }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return { signature: '', nonBlank: false, sized: false };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return { signature: '', nonBlank: false, sized: false };
    const bandY = Math.max(0, Math.floor(canvas.height * 0.62) - 20);
    const band = ctx.getImageData(0, bandY, canvas.width, 40);
    let nonBlank = false;
    for (let i = 3; i < band.data.length; i += 4) {
      if (band.data[i] !== 0) {
        nonBlank = true;
        break;
      }
    }
    let signature = '';
    for (let i = 0; i < band.data.length; i += 617) {
      signature += band.data[i]!.toString(16);
    }
    return { signature, nonBlank, sized: true };
  });
}

test.describe('SessionScreen — Demo Mode on a faceless device', () => {
  test.slow();

  test('lands on the quick-setup overlay and keeps the symmetry bar frozen (never moves on a bad frame)', async ({
    page,
  }) => {
    await enterDemoSession(page);

    // The FeedbackCanvas mounts as a persistent background layer behind the overlay; wait for the
    // renderer to have sized + drawn it.
    await expect.poll(() => page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c instanceof HTMLCanvasElement && c.width > 0;
    }), { timeout: SLOW_MS }).toBe(true);

    const first = await barBand(page);
    expect(first.sized).toBe(true);
    // Non-vacuous: the bar band actually has drawn pixels (track + centre anchor), so the equality
    // assertion below cannot green-pass on a blank canvas.
    expect(first.nonBlank).toBe(true);

    // THE load-bearing assertion (TESTS.md §3.3 / FRONTEND §5): every frame is FACE_LOST, so the
    // renderer never advances the bar or arc — successive frames are pixel-identical.
    await page.waitForTimeout(400); // several animation frames
    const second = await barBand(page);
    expect(second.signature).toBe(first.signature);
    await page.waitForTimeout(400);
    const third = await barBand(page);
    expect(third.signature).toBe(first.signature);
  });

  test('quick-setup on a faceless device fails loudly with NO_BASELINE — never a silent FACE_LOST session', async ({
    page,
  }) => {
    await recordCameraTracks(page);
    await enterDemoSession(page);
    const before = await readCounts(page);

    await page.getByRole('button', { name: 'Start quick setup' }).click();
    // Capturing state is text, not just a spinner.
    await expect(page.getByRole('button', { name: 'Setting up…' })).toBeVisible();

    // Zero approved neutral / gentle-rep frames → NO_BASELINE, surfaced at build time (not a
    // phantom FACE_LOST that pretends the demo is running while detecting nothing).
    await expect(page.getByText(NO_BASELINE_TITLE)).toBeVisible({ timeout: CAPTURE_MS });
    await expect(page.getByText(NO_BASELINE_BODY)).toBeVisible();

    // It did NOT slip into a running session: no rep counter is shown.
    await expect(page.getByText('0 of 10')).toHaveCount(0);

    // Demo persists nothing (TESTS.md §4.3).
    expect(await readCounts(page)).toEqual(before);

    // The camera the quick-setup opened for its capture windows was released.
    await expect
      .poll(() => page.evaluate(() => window.__mwTracks?.length ?? 0), { timeout: SLOW_MS })
      .toBeGreaterThan(0);
    await page.waitForFunction(
      () => window.__mwTracks!.every((track) => track.readyState === 'ended'),
      undefined,
      { timeout: SLOW_MS },
    );
  });

  test('releases the camera when the screen unmounts', async ({ page }) => {
    await recordCameraTracks(page);
    await enterDemoSession(page);

    // Open the camera via the quick-setup capture, then let it settle (NO_BASELINE error).
    await page.getByRole('button', { name: 'Start quick setup' }).click();
    await expect(page.getByText(NO_BASELINE_TITLE)).toBeVisible({ timeout: CAPTURE_MS });
    await expect
      .poll(() => page.evaluate(() => window.__mwTracks?.length ?? 0), { timeout: SLOW_MS })
      .toBeGreaterThan(0);

    // Client-side history navigation (not goto/reload, which would destroy the JS context holding
    // __mwTracks and end tracks as an unload side effect, proving nothing). A same-document
    // popstate unmounts SessionScreen in a live context, running its teardown.
    await page.evaluate(() => {
      window.history.pushState({ usr: null, key: 'session-spec', idx: 1 }, '', '/home');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Every track ever handed to SessionScreen must be stopped — the hard camera rule (CLAUDE.md).
    await page.waitForFunction(
      () =>
        (window.__mwTracks?.length ?? 0) > 0 &&
        window.__mwTracks!.every((track) => track.readyState === 'ended'),
      undefined,
      { timeout: SLOW_MS },
    );
  });
});

test.describe('SessionScreen — accessibility @a11y', () => {
  test.slow();

  test('zero critical or serious axe violations on the demo session', async ({ page }) => {
    await enterDemoSession(page);
    // Let the overlay fade-in settle so contrast is sampled on final, not mid-animation, colours.
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle'),
    );

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);
  });
});
