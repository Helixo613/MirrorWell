import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // '@/' → src/ alias, mirroring vite.config.ts. Vitest does not merge the app's vite config,
  // so co-located src/**/*.test.ts (and any source they import that uses the '@' alias) fail to
  // resolve without this. Additive shared-infra change (S3-REQ-1); no runtime/build effect.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // Only Vitest-native suites. tests/e2e/**/*.spec.ts use @playwright/test's own
    // `test` global and must never be picked up by the Vitest runner.
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['./tests/unit/setup.ts'],
    // Randomise order on EVERY run. Several units hold module-level state with no public reset
    // (MetricEngine's baseline, SafetyGate's one-way demoMode, SessionController's session
    // state), so a leak between tests is invisible under the stable default order and resurfaces
    // later as "flakiness" — that cost one wrong hypothesis and a reverted commit before
    // --sequence.shuffle found the real order dependency on its first run. Vitest prints the seed
    // for any failure, so a shuffled failure stays reproducible.
    sequence: { shuffle: true },
    // docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
    // requirement) — scoped to just those two files, not the whole codebase.
    coverage: {
      provider: 'v8',
      include: ['src/metrics/metrics.ts', 'src/metrics/reps.ts'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
