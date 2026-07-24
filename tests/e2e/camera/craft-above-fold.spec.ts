import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding } from '../helpers/onboarding';

const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1920', width: 1920, height: 1080 },
] as const;

async function expectViewportStage(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('craft above-fold proof', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  for (const { name, width, height } of WIDTHS) {
    test(`session stage @ ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Try a demo' }).click();
      await expect(page.getByRole('heading', { name: 'Quick setup' })).toBeVisible({
        timeout: 120_000,
      });
      await expectViewportStage(page);
      await page.screenshot({
        path: `proof/craft-above-fold/session-${name}.png`,
      });
    });

    test(`calibration stage @ ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await completeOnboarding(page);
      await expect(page.getByRole('heading', { name: 'Relax your face' })).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText('Neutral capture 1 of 3')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Capture' })).toBeVisible();
      await expectViewportStage(page);
      await page.screenshot({
        path: `proof/craft-above-fold/calibration-${name}.png`,
      });
    });
  }
});
