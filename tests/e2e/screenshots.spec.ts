import { test, type Page } from '@playwright/test';
import { seedDatabase } from './helpers/seed';
import type { SessionRecordFull } from '@/data/storage';

/**
 * Craft-gate screenshot tool (Task 1, plan §"CRAFT GATE"). Vitest is node-env (no React
 * render) and the rest of the e2e suite has no visual assertions, so CI cannot see pixels —
 * this spec exists to produce PNGs for a human to eyeball at each PR, not to assert content.
 * Not part of the regular gate: run manually (`npx playwright test screenshots.spec.ts`) and
 * attach the output under test-results/craft-screenshots/ to the PR. Runs in the `default`
 * (no-camera) project — SessionScreen/CalibrationScreen stay out of scope (manual screen
 * capture per the plan; they need a live camera stream this spec never opens).
 */

const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1920', width: 1920, height: 1080 },
] as const;

const SESSION_ID = '99999999-9999-4999-8999-999999999999';

const SUMMARY_RECORD: SessionRecordFull = {
  sessionId: SESSION_ID,
  profileId: '11111111-1111-4111-8111-111111111111',
  baselineId: '22222222-2222-4222-8222-222222222222',
  startedAt: '2026-01-02T10:00:00.000Z',
  endedAt: '2026-01-02T10:06:00.000Z',
  endReason: 'completed',
  results: [
    {
      resultId: '44444444-4444-4444-8444-444444444444',
      sessionId: SESSION_ID,
      exerciseId: 'EX_SMILE',
      repsCompleted: 7,
      meanSymmetryIndex: 0.86,
      meanEffortIndex: 0.4,
      easeOffCount: 2,
      lowQualityFramePct: 0.08,
      reps: Array.from({ length: 10 }, (_, i) => ({
        repId: `55555555-5555-4555-8555-5555555555${String(i).padStart(2, '0')}`,
        resultId: '44444444-4444-4444-8444-444444444444',
        repIndex: i,
        peakSymmetryIndex: 0.86,
        peakEffortIndex: 0.4,
        durationMs: 1800,
        easeOffTriggered: i >= 8 ? 1 : 0,
      })),
    },
  ],
};

async function shoot(page: Page, width: string, name: string): Promise<void> {
  // Let StaggerFadeIn / fade-in animations settle so screenshots aren't mid-transition.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `test-results/craft-screenshots/${width}/${name}.png`,
    fullPage: true,
  });
}

test.describe('craft screenshots', () => {
  for (const { name, width, height } of WIDTHS) {
    test(`capture hub + onboarding screens @ ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });

      // Onboarding: attestation step (4 checkboxes) shows the CheckboxGroup responsive grid.
      await page.goto('/');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'I understand' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await shoot(page, name, 'onboarding-attestation');

      // Seed once (also satisfies ATTESTED gate for the rest), caregiver view on so all 6
      // hub screens are reachable without walking the stepper to completion.
      await seedDatabase(page, { caregiverViewEnabled: true });

      await page.goto('/home');
      await shoot(page, name, 'home');

      await page.goto('/trends');
      await shoot(page, name, 'trends');

      await page.goto('/caregiver');
      await shoot(page, name, 'caregiver');

      await page.goto('/export');
      await shoot(page, name, 'export');

      await page.goto('/settings');
      await shoot(page, name, 'settings');

      // Summary reads from location.state (no query) — inject via history like summary.spec.ts.
      await page.evaluate(
        (state) => {
          window.history.replaceState({ usr: state, key: 'craft-shot', idx: 0 }, '', '/summary');
        },
        { record: SUMMARY_RECORD, demo: false },
      );
      await page.reload();
      await shoot(page, name, 'summary');
    });
  }
});
