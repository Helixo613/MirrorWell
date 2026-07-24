import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { completeOnboarding, walkOnboardingStepper } from './helpers/onboarding';

/**
 * OnboardingScreen (Task 9). Covers the S2 slices of TESTS.md §4 row 1 (the
 * attestation gate) and §2 "Screens" (unattested deep-link redirect + axe scan).
 * The full seeded journeys (§5) are Reconvergence work and need a fake camera
 * out of scope here.
 */
test.describe('onboarding gate', () => {
  for (const route of ['/home', '/settings', '/calibration', '/session']) {
    test(`unattested deep link ${route} redirects to the onboarding gate`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/onboarding$/);
    });
  }

  test('continue stays disabled until all four attestations are checked', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'I understand' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('checkbox').first()).toBeVisible();
    const primary = page.getByRole('button', { name: 'Continue' });
    await expect(primary).toBeDisabled();

    const boxes = page.getByRole('checkbox');
    const n = await boxes.count();
    for (let i = 0; i < n - 1; i += 1) {
      await boxes.nth(i).check();
    }
    // Partial attestation is still blocked; the gate is all-or-nothing.
    await expect(primary).toBeDisabled();
    await boxes.nth(n - 1).check();
    await expect(primary).toBeEnabled();
  });

  // SAFETY §10 / TESTS.md §4 row 2: the emergency step cannot be skipped; there
  // is no route or DOM path around it. Assert it sits on the linear path with only
  // a forward acknowledgement and no attestation shortcut.
  test('the emergency step cannot be skipped', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      page.getByRole('heading', { name: 'Know when to seek care' }),
    ).toBeVisible();
    await expect(page.getByText(/stroke/i)).toBeVisible();
    // No attestation checkboxes are reachable here; the only way forward is to
    // acknowledge, so the emergency copy is always seen before attestation.
    expect(await page.getByRole('checkbox').count()).toBe(0);
    await expect(
      page.getByRole('button', { name: 'I understand' }),
    ).toBeVisible();
  });

  test('the demo entry point routes to the session as DEMO', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a demo' }).click();
    await expect(page).toHaveURL(/\/session$/);
  });

  /**
   * REGRESSION, S1-REQ-2 (`docs/superpowers/coordination/frontend-s1-requests.md`).
   *
   * FRONTEND §1/§2.5 and API §17 all put demo's exit at `OnboardingScreen`, but `/onboarding`
   * admitted only UNATTESTED, so a DEMO visitor was bounced to "/" and RootRedirect sent them
   * straight back to `/session`, demo was a one-way door until a page reload, and nothing
   * cleared SafetyGate's in-memory `demoMode` on the way out (ARCHITECTURE §11 makes that exit
   * a safety property).
   *
   * Client-side history navigation throughout, deliberately: `goto`/`reload` destroys the
   * in-memory demo flag, so a spec that navigated that way would pass against the bug. No
   * camera is needed; the demo SessionScreen opens nothing until its quick-setup is started.
   */
  test('leaving demo through the onboarding exit clears DEMO', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a demo' }).click();
    await expect(page).toHaveURL(/\/session$/);

    // Back is the same client-side pop the demo SummaryScreen's "Return to onboarding"
    // performs; the guard it hits is identical, and it needs no camera to reach.
    await page.goBack();
    await expect(page).toHaveURL(/\/onboarding$/);

    // Proves the FLAG is cleared, not merely that the route rendered: every StorageService
    // write throws VALIDATION_FAILED while demoMode is set (API §2), so the stepper's
    // saveProfile would land on a blocking notice instead of reaching /calibration.
    await walkOnboardingStepper(page);
  });

  test('completes the stepper through to calibration (attested)', async ({
    page,
  }) => {
    await completeOnboarding(page);
  });

  test('has zero critical accessibility violations', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});
