import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only Vitest-native suites. tests/e2e/**/*.spec.ts use @playwright/test's own
    // `test` global and must never be picked up by the Vitest runner.
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['./tests/unit/setup.ts'],
    // docs/TESTS.md §2: MetricEngine + RepDetector require 100% branch coverage (hard
    // requirement) — scoped to just those two files, not the whole codebase.
    coverage: {
      provider: 'v8',
      include: ['src/metrics/metrics.ts', 'src/metrics/reps.ts'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
