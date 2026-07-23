import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readCounts, seedDatabase } from './helpers/seed';
import type { SessionRecordFull } from '@/data/storage';

// SummaryScreen specs (FRONTEND §2.5, TESTS.md §2 "Screens", §4.3, §4.5, Journey 1 step 5).
//
// No camera: SummaryScreen never mounts CaptureService, so these live in the default
// project (playwright.config.ts) and run against an unmodified browser.
//
// Copy is asserted VERBATIM on purpose. SAFETY §8 language is a release blocker, so a spec
// that pins the exact user-facing wording is a feature, not brittleness.

// ---------------------------------------------------------------------------
// Reaching the screen
//
// SummaryScreen reads its record from react-router `location.state` (useSummaryScreen) and
// runs NO queries (§2.5 "Reads the sessionEnded record only"). A plain goto('/summary') has
// no state, so it takes the redirect branch. react-router v6's BrowserRouter reads
// `location.state` from `window.history.state.usr`, so writing that key with
// history.replaceState and then reloading boots the app straight into /summary WITH a record.
// Verified working against the production build (see the render test below).
//
// The seed exists only to satisfy the ATTESTED route guard on /summary (App.tsx); it does not
// feed the screen. Assertions are therefore made against the INJECTED record.
// ---------------------------------------------------------------------------
/**
 * helpers/seed.ts requires mirrorwell_db to be OPEN (with its stores) before the raw-IDB
 * write. `goto('/')` only resolves on load — hydrateAppState is still in flight, so seeding
 * immediately races Dexie's open and intermittently lands rows in a store-less database
 * (observed: 3 of 7 specs failing at random on the first run). Waiting for the UNATTESTED
 * redirect to settle proves hydrateAppState resolved, which proves the DB is open.
 */
async function openDbThenSeed(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding$/);
  await seedDatabase(page);
}

async function bootSummaryWith(
  page: Page,
  record: SessionRecordFull,
  demo = false,
): Promise<void> {
  await openDbThenSeed(page);
  await page.evaluate(
    (state) => {
      window.history.replaceState({ usr: state, key: 'summary-spec', idx: 0 }, '', '/summary');
    },
    { record, demo },
  );
  await page.reload();
}

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

/**
 * Numbers chosen to pin behaviour, not to be pretty:
 *  - smile: meanSymmetryIndex 0.86 >= thresholds.summary.symmetryMostlyEvenMin (0.85) -> "Mostly even";
 *    8 of 10 reps with easeOffTriggered 0 -> session-wide gentleness celebration.
 *  - brow: meanSymmetryIndex null -> "Minimal movement recorded"; no reps.
 * repsCompleted (7) is deliberately NOT reps.length (10) so a screen that re-derived the rep
 * count from the rep array instead of reading the stored field would fail.
 */
const RECORD: SessionRecordFull = {
  sessionId: SESSION_ID,
  profileId: '11111111-1111-4111-8111-111111111111',
  baselineId: '22222222-2222-4222-8222-222222222222',
  startedAt: '2026-01-02T10:00:00.000Z',
  endedAt: '2026-01-02T10:06:00.000Z',
  endReason: 'completed',
  results: [
    {
      resultId: '44444444-4444-4444-8444-444444444444',
      sessionId: SESSION_ID,
      exerciseId: 'EX_SMILE',
      repsCompleted: 7,
      meanSymmetryIndex: 0.86,
      meanEffortIndex: 0.4,
      easeOffCount: 2,
      lowQualityFramePct: 0.08,
      reps: Array.from({ length: 10 }, (_, i) => ({
        repId: `55555555-5555-4555-8555-5555555555${String(i).padStart(2, '0')}`,
        resultId: '44444444-4444-4444-8444-444444444444',
        repIndex: i,
        peakSymmetryIndex: 0.86,
        peakEffortIndex: 0.4,
        durationMs: 1800,
        easeOffTriggered: i >= 8 ? 1 : 0,
      })),
    },
    {
      resultId: '66666666-6666-4666-8666-666666666666',
      sessionId: SESSION_ID,
      exerciseId: 'EX_BROW_RAISE',
      repsCompleted: 0,
      meanSymmetryIndex: null,
      meanEffortIndex: null,
      easeOffCount: 0,
      lowQualityFramePct: 0.5,
      reps: [],
    },
  ],
};

const EMPTY_RECORD: SessionRecordFull = { ...RECORD, endReason: 'user_stopped', results: [] };

test.describe('SummaryScreen', () => {
  test('no record in location.state redirects out of /summary', async ({ page }) => {
    await openDbThenSeed(page);
    await page.goto('/summary');
    // useSummaryScreen: !record -> navigate('/home') for the non-demo gate.
    await expect(page).toHaveURL(/\/home$/);
  });

  test('renders exactly the numbers in the record it was handed', async ({ page }) => {
    await bootSummaryWith(page, RECORD);
    await expect(page).toHaveURL(/\/summary$/);

    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await expect(page.getByText('This is a single-session snapshot of movement.')).toBeVisible();
    await expect(page.getByLabel('Gentle practice')).toHaveText(
      "You kept it gentle 8 of 10 times — that's exactly the skill.",
    );

    const smile = page.getByRole('article').filter({ hasText: 'Gentle smile' });
    // repsCompleted verbatim — not reps.length (10), not rounded, not recomputed.
    await expect(smile.getByText('7 reps completed')).toBeVisible();
    await expect(smile.getByText('Mostly even')).toBeVisible();

    const brow = page.getByRole('article').filter({ hasText: 'Gentle brow raise' });
    await expect(brow.getByText('0 reps completed')).toBeVisible();
    await expect(brow.getByText('Minimal movement recorded')).toBeVisible();

    // Non-demo close-out.
    await expect(page.getByRole('button', { name: 'Return to home' })).toBeVisible();
    await expect(page.getByText('DEMO — not for exercise use')).toHaveCount(0);
  });

  test('an early-ended session renders the empty-results copy, not a zeroed card', async ({
    page,
  }) => {
    await bootSummaryWith(page, EMPTY_RECORD);
    await expect(
      page.getByText('This session ended early, so there is nothing to show.'),
    ).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('Done returns to home', async ({ page }) => {
    await bootSummaryWith(page, RECORD);
    await page.getByRole('button', { name: 'Return to home' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  // SAFETY §8 / TESTS.md §4.5: single-session numbers sit inside the noise floor, so the
  // screen must never compare this session to another one.
  test('contains no cross-session comparison language', async ({ page }) => {
    await bootSummaryWith(page, RECORD);
    await expect(page.getByRole('article').first()).toBeVisible();
    const text = await page.evaluate(() => document.body.innerText.toLowerCase());
    for (const forbidden of [
      'better',
      'worse',
      'than last',
      'last session',
      'previous',
      'improved',
      'improvement',
      'streak',
      'days in a row',
      'compared',
      'trend',
    ]) {
      expect(text, `forbidden comparative copy: "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

test.describe('SummaryScreen — DEMO variant', () => {
  test('watermarked, offers the onboarding exit, and writes nothing to the DB', async ({
    page,
  }) => {
    await openDbThenSeed(page);
    const before = await readCounts(page);

    await page.evaluate(
      (state) => {
        window.history.replaceState({ usr: state, key: 'summary-spec', idx: 0 }, '', '/summary');
      },
      { record: RECORD, demo: true },
    );
    await page.reload();

    await expect(page).toHaveURL(/\/summary$/);
    await expect(page.getByText('DEMO — not for exercise use')).toBeVisible();
    // The demo close-out the screen owns: different label AND different accessible name.
    await expect(page.getByRole('button', { name: 'Return to onboarding' })).toBeVisible();
    await expect(page.getByText('Back to onboarding')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to home' })).toHaveCount(0);

    // TESTS.md §4.3: a demo pass must not change DB row counts.
    await page.getByRole('button', { name: 'Return to onboarding' }).click();
    // The destination is deliberately NOT pinned here. This spec reaches /summary by writing
    // history state and RELOADING, which wipes SafetyGate's in-memory demoMode — the gate is
    // ATTESTED (seeded profile), only `state.demo` makes the screen render its demo variant.
    // So handleDone's navigate('/onboarding') is correctly bounced for an attested user and
    // lands on /home. The real DEMO exit (S1-REQ-2, now fixed: /onboarding admits DEMO and
    // clears the flag on mount) needs a gate that survives, so it is covered without a reload
    // in tests/e2e/onboarding.spec.ts "leaving demo through the onboarding exit clears DEMO".
    await expect(page).not.toHaveURL(/\/summary$/);
    expect(await readCounts(page)).toEqual(before);
  });
});

test.describe('SummaryScreen — accessibility @a11y', () => {
  test('zero critical axe violations and the symmetry value is available as text', async ({
    page,
  }) => {
    await bootSummaryWith(page, RECORD);
    await expect(page.getByRole('article').first()).toBeVisible();

    // Wait for StaggerFadeIn to settle before scanning. The cards mount at opacity 0 and fade
    // over 200 ms with a 60 ms per-card delay; axe samples *computed* colour, so mid-fade it
    // reads the blend toward the background (observed: #808380 for text-foreground, 3.61:1)
    // and reports a colour-contrast violation that does not exist in the settled state — the
    // tokens are 14.13:1 (--foreground) and 5.17:1 (--muted-foreground) against --background,
    // and a prefers-reduced-motion user never sees the transitional value at all.
    // Under the full parallel suite CPU contention delayed the scan past the animation, so this
    // passed there and failed in isolation: a real flake that would have masked a real
    // regression later. getAnimations() is the deterministic wait; a timeout would not be.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState === 'finished'),
    );

    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);

    // Axe green is not enough: the visible symmetry label and value are aria-hidden
    // (SummaryExerciseCard), so the bar's accessible name is the ONLY screen-reader path to
    // the value. A purely visual bar passes axe while saying nothing (FRONTEND §4).
    await expect(
      page.getByRole('img', { name: 'Movement symmetry: Mostly even' }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Movement symmetry: Minimal movement recorded' }),
    ).toBeVisible();

    // The polite announcement carries the per-exercise lines.
    const status = page.getByRole('status');
    await expect(status).toHaveText(
      'Session complete. Gentle smile: 7 reps, Mostly even. Gentle brow raise: 0 reps, Minimal movement recorded.',
    );
  });
});
