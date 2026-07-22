import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedDatabase } from './helpers/seed';

/**
 * TrendsScreen (FRONTEND §2.6). Reached with seeded data via the raw-IDB helper (helpers/seed.ts):
 * goto('/') opens the DB, seed, then goto('/trends') hydrates ATTESTED + with-data. The default
 * seed lays 4 sessions across >=2 monthly buckets for EX_SMILE + EX_BROW_RAISE, so the screen
 * reaches the 'ready' state and the screen-reader chart<->table toggle is exercisable.
 */

async function seedReadyTrends(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/); // no data yet -> UNATTESTED
  await seedDatabase(page);
  await page.goto('/trends');
  await expect(page).toHaveURL(/\/trends$/);
}

test.describe('trends screen', () => {
  test('ready state exposes the chart<->table toggle for screen readers', async ({ page }) => {
    await seedReadyTrends(page);

    // Chart mode: the toggle offers "view as table".
    const toToggle = page.getByRole('button', {
      name: 'Show trend data as a table for screen readers',
    });
    await expect(toToggle).toBeVisible();

    // Toggling reveals the accessible data table (its caption), not a chart.
    await toToggle.click();
    await expect(page.getByText('Symmetry trend data')).toBeVisible();

    // Now in table mode the toggle offers the reverse, and clicking returns to the chart.
    const toChart = page.getByRole('button', { name: 'Show trend data as a chart' });
    await expect(toChart).toBeVisible();
    await toChart.click();
    await expect(
      page.getByRole('button', { name: 'Show trend data as a table for screen readers' }),
    ).toBeVisible();
  });

  test('exercise selector offers only the assigned exercises', async ({ page }) => {
    await seedReadyTrends(page);
    await expect(page.getByRole('tab', { name: 'Gentle smile' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Gentle brow raise' })).toBeVisible();
    // EX_EYE_CLOSURE / EX_PUCKER are not assigned and must not appear.
    await expect(page.getByRole('tab', { name: 'Gentle eye closure' })).toHaveCount(0);
  });

  test('granularity defaults to monthly and can switch to weekly', async ({ page }) => {
    await seedReadyTrends(page);
    await expect(page.getByRole('tab', { name: 'Show monthly trends' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Show weekly trends' }).click();
    await expect(page.getByRole('tab', { name: 'Show weekly trends' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('shows the empty-state copy when there is not enough practice for a trend', async ({
    page,
  }) => {
    await page.goto('/');
    // One assigned exercise, one session -> a single bucket, below minPeriodsForChart(2).
    await seedDatabase(page, {
      assignedExercises: ['EX_SMILE'],
      sessions: [{ daysAgo: 2, symmetry: { EX_SMILE: 0.6 } }],
    });
    await page.goto('/trends');
    await expect(
      page.getByText('Trends appear after a couple of weeks of practice.'),
    ).toBeVisible();
    // No chart toggle in the empty state.
    await expect(
      page.getByRole('button', { name: 'Show trend data as a table for screen readers' }),
    ).toHaveCount(0);
  });

  test('has zero critical accessibility violations in the ready state', async ({ page }) => {
    await seedReadyTrends(page);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
