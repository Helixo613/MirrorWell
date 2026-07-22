import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers/onboarding';

/**
 * SettingsScreen (Task 15, settings half). Covers TESTS.md §4 row 7 (typed-DELETE
 * confirmation), the textScale-to-200%-without-clipping non-negotiable, and the
 * per-screen axe scan (§2 "Screens"). Reached via the real onboarding flow.
 */
test.describe('settings screen', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('delete confirmation stays disabled until "DELETE" is typed', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Delete all data stored on this device' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', {
      name: 'Permanently delete all data on this device',
    });
    await expect(confirm).toBeDisabled();

    const input = dialog.getByLabel('Type DELETE to confirm');
    await input.fill('delete'); // wrong case → still blocked
    await expect(confirm).toBeDisabled();
    await input.fill('DELETE');
    await expect(confirm).toBeEnabled();
  });

  test('text scale reaches 200% without horizontal clipping', async ({ page }) => {
    const slider = page.getByRole('slider');
    await slider.fill('2');
    await expect(slider).toHaveAttribute('aria-valuenow', '200');

    // The layout must absorb the larger type without pushing content off-screen.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole('button', { name: 'Delete all data stored on this device' }),
    ).toBeVisible();
  });

  test('has zero critical accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
