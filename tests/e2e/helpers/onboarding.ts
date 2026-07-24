import { expect, type Page } from '@playwright/test';

/**
 * Walks the camera-free onboarding stepper to the attested state, landing on
 * /calibration. `StorageService.saveProfile` + `SafetyGate.recordAttestation`
 * run before that navigation (OnboardingScreen), so on any later full reload
 * `hydrateAppState` derives `gate === 'ATTESTED'` from the stored profile; the
 * only camera-free way an e2e test reaches the ATTESTED-gated /home and /settings.
 *
 * Button copy is asserted verbatim on purpose: SAFETY §8 language is a release
 * blocker, so a spec that pins the exact user-facing wording is a feature, not a
 * brittleness.
 */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await walkOnboardingStepper(page);
}

/**
 * The stepper itself, from step 0 to `/calibration`, with no navigation of its own; for
 * specs that must arrive at `/onboarding` by some other route (e.g. the DEMO exit, which a
 * `goto` would falsify by reloading the in-memory demo flag away).
 */
export async function walkOnboardingStepper(page: Page): Promise<void> {
  // Steps 0–2: intended use, red-flag, local processing.
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'I understand' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: attestation; the primary action is uncallable until all four boxes
  // are checked (the real attestation gate).
  await expect(page.getByRole('checkbox').first()).toBeVisible();
  const boxes = page.getByRole('checkbox');
  for (let i = 0, n = await boxes.count(); i < n; i += 1) {
    await boxes.nth(i).check();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4: optional "About you" (nickname + why), skip with Continue.
  await expect(page.getByRole('heading', { name: 'A little about you' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 5: pick one assigned exercise, then start calibration.
  const start = page.getByRole('button', { name: 'Start calibration' });
  await expect(start).toBeVisible();
  await page.getByRole('checkbox').first().check();
  await start.click();

  await expect(page).toHaveURL(/\/calibration$/);
}
