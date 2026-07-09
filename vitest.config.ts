import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only Vitest-native suites. tests/e2e/**/*.spec.ts use @playwright/test's own
    // `test` global and must never be picked up by the Vitest runner.
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
