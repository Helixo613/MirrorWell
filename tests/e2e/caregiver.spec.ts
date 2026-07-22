import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readCounts, seedDatabase } from './helpers/seed';

/**
 * CaregiverScreen (FRONTEND §2.7): a READ-ONLY trusted-person view, gated by caregiverViewEnabled.
 * Non-negotiable: ZERO mutating controls — any state-changing interactive element is a
 * review-blocking defect (TESTS.md §4 audits every control).
 */

async function seedCaregiverEnabled(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await seedDatabase(page, { caregiverViewEnabled: true });
  await page.goto('/caregiver');
  await expect(page).toHaveURL(/\/caregiver$/);
}

test.describe('caregiver screen', () => {
  test('redirects to home when caregiver view is not enabled (incl. deep link)', async ({
    page,
  }) => {
    await page.goto('/');
    // Default seed is ATTESTED but caregiverViewEnabled:false -> CaregiverRoute redirects.
    await seedDatabase(page, { caregiverViewEnabled: false });
    await page.goto('/caregiver');
    await expect(page).toHaveURL(/\/home$/);
  });

  test('renders the read-only summary when enabled', async ({ page }) => {
    await seedCaregiverEnabled(page);
    await expect(
      page.getByText('Read-only view, enabled by the device owner'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Practice adherence' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Symmetry trends' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Most recent session' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Measurement quality' })).toBeVisible();
    // A link to Export exists (navigation is not mutation).
    await expect(
      page.getByRole('link', { name: 'Go to export to share a summary with your care team' }),
    ).toBeVisible();

    // The mini-trend charts are SVGs (no data for a screen reader), so each series must also be
    // exposed as an sr-only data table (FRONTEND §4). Assert the trend data is AT-reachable:
    // a table exists under the trends section with the symmetry column and a period row.
    const dataTable = page
      .locator('section[aria-labelledby="caregiver-trends-heading"] table')
      .first();
    await expect(dataTable).toBeAttached();
    await expect(dataTable).toContainText('Average symmetry');
    await expect(dataTable).toContainText('Sessions');
  });

  test('has zero state-mutating controls', async ({ page }) => {
    await seedCaregiverEnabled(page);

    // No control that could write state may exist: no buttons, checkboxes, switches, textboxes,
    // sliders, or comboboxes. The only interactive elements permitted are navigation links.
    for (const role of ['button', 'checkbox', 'switch', 'textbox', 'slider', 'combobox'] as const) {
      expect(await page.getByRole(role).count(), `caregiver must expose no ${role}`).toBe(0);
    }

    // Belt-and-suspenders: interacting with everything visible leaves the DB + consent untouched.
    const before = await readCounts(page);
    const clickables = page.locator('button, [role="button"], input, select, [role="switch"]');
    const n = await clickables.count();
    for (let i = 0; i < n; i += 1) {
      await clickables.nth(i).click({ trial: false }).catch(() => {});
    }
    const after = await readCounts(page);
    expect(after).toEqual(before);
  });

  test('has zero critical accessibility violations', async ({ page }) => {
    await seedCaregiverEnabled(page);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
