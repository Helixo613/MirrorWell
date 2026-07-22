import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers/onboarding';

/**
 * HomeScreen (Task 13). Non-negotiables: zero camera in the screen tree, and no
 * streak / "you missed X days" language (SAFETY §8.8). Reached via the real
 * onboarding flow so the ATTESTED gate is genuine, not stubbed.
 */
test.describe('home screen', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'MirrorWell' })).toBeVisible();
  });

  test('mounts no camera element', async ({ page }) => {
    expect(await page.locator('video').count()).toBe(0);
  });

  test('shows no streak or missed-day language', async ({ page }) => {
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const forbidden of ['streak', 'missed', 'in a row', 'don’t break']) {
      expect(body, `home must not contain "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });

  test('has zero critical accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
