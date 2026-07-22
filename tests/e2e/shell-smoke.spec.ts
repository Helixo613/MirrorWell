import { expect, test } from '@playwright/test';

/**
 * Frozen-shell smoke gate (Gate 0). App.tsx, src/router/**, src/context/** are frozen after
 * Gate 0 — the S1/S2/S3 streams fork from them and cannot fix a runtime bug there. The
 * no-network gate proves the build makes no network calls, but a shell that throws during
 * render, or hangs forever in AppStateProvider's hydration loading state, ALSO makes no
 * network calls — a green no-network run is consistent with a blank page.
 *
 * This asserts the shell actually executes on a fresh context (empty IndexedDB → gate
 * UNATTESTED): the provider hydrates, the guards run, RootRedirect sends "/" to "/onboarding",
 * and OnboardingScreen paints its heading. One assertion on the default landing is enough to
 * prove provider + guards + hydration run; the full cross-screen journey is Reconvergence work,
 * not this test.
 */
test('frozen shell renders: "/" hydrates and routes to the onboarding gate', async ({ page }) => {
  await page.goto('/');
  // RootRedirect: UNATTESTED (fresh context) → /onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
  // Provider hydrated + OnboardingScreen mounted (not stuck on the loading fallback, not blank).
  await expect(page.getByRole('heading').first()).toBeVisible();
});
