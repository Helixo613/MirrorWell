import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readCounts, seedDatabase } from './helpers/seed';

/**
 * CaregiverScreen (FRONTEND §2.7): a READ-ONLY trusted-person view, gated by caregiverViewEnabled.
 * Non-negotiable: mutation is confined to the ONE narrow SAFETY §5 carve-out; the encouragement
 * note compose box. Every other interactive element must stay non-mutating (TESTS.md §4 audits
 * every control).
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
      page.getByText('Read-only view, your practice stays on this device'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your steady practice' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your practice over time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your latest session' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clear practice moments' })).toBeVisible();
    // A link to Export exists (navigation is not mutation).
    await expect(
      page.getByRole('link', { name: 'Open the full summary to share with your care team' }),
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

  test('exposes exactly one mutating surface: the encouragement-note compose box', async ({
    page,
  }) => {
    await seedCaregiverEnabled(page);

    // Checkboxes, switches, sliders, and comboboxes still may not exist anywhere on this screen.
    for (const role of ['checkbox', 'switch', 'slider', 'combobox'] as const) {
      expect(await page.getByRole(role).count(), `caregiver must expose no ${role}`).toBe(0);
    }
    // Exactly one textbox (the note) and exactly one button (its Save); no other hidden
    // mutating control exists alongside the carve-out.
    expect(await page.getByRole('textbox').count(), 'exactly the note textbox').toBe(1);
    expect(await page.getByRole('button').count(), 'exactly the note Save button').toBe(1);

    // Belt-and-suspenders: every non-note, non-navigation control still leaves storage untouched.
    // (Links are excluded here; a real click would navigate away; their href targets are
    // asserted in the "renders the read-only summary" test above instead.)
    const before = await readCounts(page);
    const nonNoteMutators = page.locator('input, select, [role="switch"]').filter({
      hasNot: page.locator('#caregiver-note-input'),
    });
    const n = await nonNoteMutators.count();
    for (let i = 0; i < n; i += 1) {
      await nonNoteMutators.nth(i).click({ trial: false }).catch(() => {});
    }
    expect(await readCounts(page)).toEqual(before);
  });

  test('saving an encouragement note mutates only encouragement_note, nothing else', async ({
    page,
  }) => {
    await seedCaregiverEnabled(page);
    const before = await readCounts(page);

    await page.locator('#caregiver-note-input').fill('You are doing wonderfully; keep it up.');
    await page.getByRole('button', { name: 'Save encouragement note' }).click();
    await expect(page.getByText('Note saved')).toBeVisible();

    const after = await readCounts(page);
    expect(after).toEqual({ ...before, encouragementNotes: before.encouragementNotes + 1 });

    // Singleton semantics: saving again replaces, never accumulates.
    await page.locator('#caregiver-note-input').fill('A different note entirely.');
    await page.getByRole('button', { name: 'Save encouragement note' }).click();
    await expect(page.getByText('Note saved')).toBeVisible();
    expect((await readCounts(page)).encouragementNotes).toBe(1);
  });

  test('has zero critical accessibility violations', async ({ page }) => {
    await seedCaregiverEnabled(page);
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
