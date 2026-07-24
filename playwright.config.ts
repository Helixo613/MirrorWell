import { defineConfig } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// The preview server serves the PRODUCTION build (dist/), CI must run `npm run build`
// before this config is used. This is deliberate: the no-network gate must exercise the
// real bundle, not the dev server (which itself makes benign localhost/HMR requests).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // Two projects, deliberately split (S1-REQ-1): the default project must keep running
  // with a real (absent) camera so the no-network and shell gates exercise the same
  // browser the other streams' specs assume. Only tests/e2e/camera/** get the fake
  // device, CalibrationScreen and SessionScreen are unreachable without a stream.
  // No --use-file-for-fake-video-capture here: the synthetic pattern has no face, which
  // is exactly the FACE_LOST / frozen-bar surface these specs assert. Fixture replay
  // (tests/fixtures/replay/*.mjpeg, Chromium accepts only .y4m/.mjpeg, CLAUDE.md fact 3)
  // belongs to the Reconvergence journeys, not to per-screen specs.
  projects: [
    {
      name: 'default',
      testIgnore: '**/camera/**',
    },
    {
      name: 'camera',
      testMatch: '**/camera/**',
      // Serial: each camera spec runs MediaPipe WASM inference (10.6 MB runtime) over the fake
      // device, and captureFor() windows are real 3 s waits. Parallel workers starve each other
      // on CPU and manufacture timeouts that read as flakes; a slower serial pass is the honest
      // signal. The default project keeps fullyParallel.
      workers: 1,
      use: {
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: {
    // Bind explicitly to 127.0.0.1 so readiness checks match baseURL on CI runners
    // (default Vite preview may prefer localhost/IPv6 and miss the probe).
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
