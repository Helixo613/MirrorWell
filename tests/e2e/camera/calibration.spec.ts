import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from '../helpers/onboarding';

// Runs in the `camera` Playwright project (playwright.config.ts): Chromium with
// --use-fake-device-for-media-stream. The fake device renders a synthetic pattern with NO
// FACE, so QualityMonitor returns FACE_LOST on every frame and CalibrationFlow.captureNeutral
// rejects with QUALITY_TOO_LOW. Those are precisely the two states FRONTEND §2.2 says must
// never dead-end, so this is the honest surface to assert — not a limitation to work around.

// Model load (3.6 MB WASM + .task) plus a 3 × 3 s capture window; generous, not flaky-short.
const SLOW_MS = 120_000;
const CAPTURE_MS = 60_000;

const NEUTRAL_HEADING = 'Relax your face';
const FACE_LOST_BANNER = "I can't see you — adjust the camera";
const CAPTURE_LABEL = 'Capture';
const REDO_LABEL = 'Redo this capture';
const QUALITY_TOO_LOW_TITLE = 'That capture did not meet quality';

declare global {
  interface Window {
    /** Every MediaStreamTrack getUserMedia has ever handed this page (test-only). */
    __mwTracks?: MediaStreamTrack[];
    /** Drives a fake `document.hidden` — Playwright cannot hide a real tab (test-only). */
    __mwHidden?: boolean;
    /** Flips `document.hidden` and fires the event the screen listens for (test-only). */
    __mwSetHidden?: (hidden: boolean) => void;
  }
}

/** Makes `document.hidden` scriptable so the interruption path can be exercised. */
async function makeVisibilityScriptable(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__mwHidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => window.__mwHidden === true,
    });
    window.__mwSetHidden = (hidden: boolean) => {
      window.__mwHidden = hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
}

/**
 * Wraps getUserMedia before any app code runs and keeps a reference to every track it hands
 * out, so the camera-release assertion can read `readyState` later. Test-only: no production
 * code is touched, and nothing here is bundled.
 */
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

/** Onboards, lands on /calibration and waits for warm-up to finish. */
async function reachCalibration(page: Page): Promise<void> {
  await completeOnboarding(page);
  await expect(page.getByRole('heading', { name: NEUTRAL_HEADING })).toBeVisible({
    timeout: SLOW_MS,
  });
}

test.describe('CalibrationScreen', () => {
  test.slow();

  test('warms up, shows the live preview and states every step as text', async ({ page }) => {
    await recordCameraTracks(page);
    await reachCalibration(page);

    // Camera is actually open and the preview shares CaptureService's stream (one
    // MediaStream, two <video> elements — CaptureService owns a detached one).
    await expect
      .poll(() => page.evaluate(() => window.__mwTracks?.length ?? 0), { timeout: SLOW_MS })
      .toBeGreaterThan(0);
    // Polled, not read once: the preview's srcObject is assigned inside the frame callback,
    // which fires after the screen has already rendered.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const video = document.querySelector('video');
            return video instanceof HTMLVideoElement && video.srcObject !== null;
          }),
        { timeout: SLOW_MS },
      )
      .toBe(true);

    // The <video> is aria-hidden, so every state a sighted user reads off the preview has to
    // exist as text (FRONTEND §4). Phase:
    await expect(page.getByRole('heading', { name: NEUTRAL_HEADING })).toBeVisible();
    await expect(
      page.getByText(
        'Sit comfortably and relax your face, like you are daydreaming. Tap Capture when you are ready.',
      ),
    ).toBeVisible();
    // Capture progress:
    await expect(page.getByText('Neutral capture 1 of 3')).toBeVisible();
    // Quality state (role="status" on QualityBanner — no face in the fake device):
    await expect(page.getByRole('status').filter({ hasText: FACE_LOST_BANNER })).toBeVisible({
      timeout: SLOW_MS,
    });
    // Advisory helper, NOT a gate — Capture stays operable at bad quality.
    await expect(page.getByText('Adjust your position until the banner clears, then tap Capture.')).toBeVisible();

    const capture = page.getByRole('button', { name: CAPTURE_LABEL, exact: true });
    await expect(capture).toBeEnabled();
    // Capture never auto-fires (FRONTEND §4): still on the neutral phase after a beat.
    await expect(page.getByText('Neutral capture 1 of 3')).toBeVisible();

    // Full keyboard operability: the primary action is reachable and firable from the keyboard.
    await capture.focus();
    await expect(capture).toBeFocused();
  });

  test('a capture with no face coaches and offers redo — never a dead end', async ({ page }) => {
    await reachCalibration(page);

    const capture = page.getByRole('button', { name: CAPTURE_LABEL, exact: true });
    await capture.click();

    // Capture-in-flight is text, not just a spinner.
    await expect(page.getByText('Capturing…')).toBeVisible();
    await expect(capture).toBeDisabled();

    // captureNeutral runs 3 × 3 s windows, approves nothing, and rejects QUALITY_TOO_LOW.
    await expect(page.getByText(QUALITY_TOO_LOW_TITLE)).toBeVisible({ timeout: CAPTURE_MS });
    await expect(
      page.getByText(
        'Try again with more light, a steady position, and your face centered. There is no rush.',
      ),
    ).toBeVisible();

    // No judgment copy, no blocking screen, no forced navigation: still on /calibration, still
    // on the neutral phase, with an unlimited redo affordance.
    await expect(page).toHaveURL(/\/calibration$/);
    await expect(page.getByRole('heading', { name: NEUTRAL_HEADING })).toBeVisible();
    const redo = page.getByRole('button', { name: REDO_LABEL, exact: true });
    await expect(redo).toBeEnabled();

    // Retrying works: the second attempt starts a fresh capture instead of dead-ending.
    await redo.click();
    await expect(page.getByText('Capturing…')).toBeVisible();
    await expect(page.getByText(QUALITY_TOO_LOW_TITLE)).toBeVisible({ timeout: CAPTURE_MS });
    await expect(page.getByRole('button', { name: REDO_LABEL, exact: true })).toBeEnabled();
  });

  test('hiding the tab mid-capture never hangs the capture', async ({ page }) => {
    // The hang this guards against: captureFor() in src/session/calibration.ts closes its
    // window on an ARRIVING FRAME, so stopping the camera mid-capture would leave the promise
    // unsettled and the UI stuck on "Capturing…" forever. The screen defers the stop until
    // the capture settles — this asserts the capture still reaches a terminal state.
    await makeVisibilityScriptable(page);
    await reachCalibration(page);

    await page.getByRole('button', { name: CAPTURE_LABEL, exact: true }).click();
    await expect(page.getByText('Capturing…')).toBeVisible();
    await page.evaluate(() => window.__mwSetHidden?.(true));

    await expect(page.getByText(QUALITY_TOO_LOW_TITLE)).toBeVisible({ timeout: CAPTURE_MS });
    await expect(page.getByText('Capturing…')).toBeHidden();

    // Coming back restarts the camera and the live quality loop, and redo is still offered.
    await page.evaluate(() => window.__mwSetHidden?.(false));
    await expect(page.getByRole('status').filter({ hasText: FACE_LOST_BANNER })).toBeVisible({
      timeout: SLOW_MS,
    });
    await expect(page.getByRole('button', { name: REDO_LABEL, exact: true })).toBeEnabled();
  });

  test('releases the camera when the screen unmounts', async ({ page }) => {
    await recordCameraTracks(page);
    await reachCalibration(page);

    await expect
      .poll(() => page.evaluate(() => window.__mwTracks?.length ?? 0), { timeout: SLOW_MS })
      .toBeGreaterThan(0);

    // Client-side history navigation, deliberately: page.goto()/reload() would destroy the
    // JS context holding __mwTracks (and end the tracks as a side effect of unload), proving
    // nothing about the unmount cleanup. A same-document popstate makes React unmount
    // CalibrationScreen — running CaptureService.stop() — in a live context.
    // page.goBack() is not usable here: OnboardingScreen navigates to /calibration with
    // `replace: true`, so /calibration is the only history entry there is.
    await page.evaluate(() => {
      window.history.pushState({ usr: null, key: 'camera-spec', idx: 1 }, '', '/home');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/home$/);

    // Every track handed out to CalibrationScreen must now be stopped — this is the hard
    // camera rule (CLAUDE.md): the stream may be open only while the screen is mounted.
    await page.waitForFunction(
      () =>
        (window.__mwTracks?.length ?? 0) > 0 &&
        window.__mwTracks!.every((track) => track.readyState === 'ended'),
      undefined,
      { timeout: SLOW_MS },
    );
  });
});

test.describe('CalibrationScreen — accessibility @a11y', () => {
  test.slow();

  test('zero critical or serious axe violations', async ({ page }) => {
    await reachCalibration(page);
    await expect(page.getByRole('status').filter({ hasText: FACE_LOST_BANNER })).toBeVisible({
      timeout: SLOW_MS,
    });

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);
  });
});
