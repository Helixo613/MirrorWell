import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedDatabase } from './helpers/seed';

/**
 * ExportScreen (FRONTEND §2.8). Download-only (no Web Share API, no clipboard), mandatory
 * non-diagnostic notice, generate -> two download cards (JSON / printable HTML). Reached with a
 * seeded ATTESTED profile + baseline + recent sessions via helpers/seed.ts.
 */

const NON_DIAGNOSTIC_NOTICE =
  "MirrorWell is an exercise-support tool. This summary describes exercise activity and movement symmetry relative to the user's own calibration. It is not a clinical assessment, score, or measure of recovery.";

async function openExport(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await seedDatabase(page); // attested + active baseline + 4 recent sessions
  await page.goto('/export');
  await expect(page).toHaveURL(/\/export$/);
}

test.describe('export screen', () => {
  test('shows the setup form and the mandatory non-diagnostic notice', async ({ page }) => {
    await openExport(page);
    await expect(page.getByText(NON_DIAGNOSTIC_NOTICE)).toBeVisible();
    await expect(page.getByRole('heading', { name: "What's in this file" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate clinician summary for the selected date range' })).toBeVisible();
  });

  test('generating a summary reveals JSON + printable-HTML download cards', async ({ page }) => {
    await openExport(page);
    await page.getByRole('button', { name: 'Generate clinician summary for the selected date range' }).click();
    await expect(page.getByRole('heading', { name: 'Your summary is ready' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Download detailed data file for your care team' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Download printable summary for your care team' }),
    ).toBeVisible();
  });

  test('downloads are file downloads only (no share / clipboard path)', async ({ page }) => {
    await openExport(page);
    await page.getByRole('button', { name: 'Generate clinician summary for the selected date range' }).click();
    await expect(page.getByRole('heading', { name: 'Your summary is ready' })).toBeVisible();

    // Each button triggers an actual file download, not a share sheet or clipboard write.
    const [htmlDownload] = await Promise.all([
      page.waitForEvent('download'),
      page
        .getByRole('button', { name: 'Download printable summary for your care team' })
        .click(),
    ]);
    expect(htmlDownload.suggestedFilename()).toMatch(/^mirrorwell-summary-.*\.html$/);

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download detailed data file for your care team' }).click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toMatch(/^mirrorwell-summary-.*\.json$/);

    // No share / copy control exists anywhere in the success view.
    for (const forbidden of [/share/i, /copy/i, /clipboard/i]) {
      await expect(page.getByRole('button', { name: forbidden })).toHaveCount(0);
    }
  });

  test('shows the empty state for a date range with no sessions', async ({ page }) => {
    await openExport(page);
    // A past window with no seeded sessions -> nothing to export.
    await page.locator('#export-from').fill('2020-01-01');
    await page.locator('#export-to').fill('2020-03-01');
    await page.getByRole('button', { name: 'Generate clinician summary for the selected date range' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nothing to export for these dates' }),
    ).toBeVisible();
  });

  test('has zero critical accessibility violations', async ({ page }) => {
    await openExport(page);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
