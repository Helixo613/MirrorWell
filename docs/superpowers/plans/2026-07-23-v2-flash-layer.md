# V2 "Flash Layer" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the working V1 app feel alive, personal, and finished for a fully-live Zoom demo — copy, presentation, seeded data, and deploy; no new architecture.

**Architecture:** Every task rides on the existing screens/services; two tasks add optional `UserProfile` fields (nickname, "why") which require DATABASE/SAFETY doc amendments in the same commit (repo deviation protocol). The session centerpiece (Task 1) upgrades the canvas gauges + adds a DOM coach line; everything else is strings, components, seed data, and ops.

**Tech Stack:** Existing pinned stack only (React 18, Vite, Tailwind, Dexie, MediaPipe tasks-vision). **No new dependencies** (ARCHITECTURE §2 is closed).

**Demo constraints (locked 2026-07-23):** fully-live Zoom screen share (presenter's Zoom camera OFF; the app owns the webcam; "Share sound" ON), recorded clip open in the next tab as instant fallback; desktop-first layout on a genuinely responsive base; calm-clinical visual language. Everything on the session screen must be legible after Zoom downscaling: thick strokes, large type, high contrast.

**Repo rules that bind every task below:**
- All user-facing text in `src/config/strings.ts`; all tunables in `src/config/thresholds.ts`.
- No new identifiers outside `docs/ARCHITECTURE.md` §12 — amend the glossary in the same commit.
- SAFETY §8 language rules: no guilt, no "push harder", celebrate restraint. Copy tasks must re-read SAFETY §8 before writing.
- Verify with `npm run typecheck` (never `npx tsc --noEmit`) + `npx vitest run`. A task is done only when both are green.
- Commit message carries `DOCS-CHANGE: <doc> §<n> — <what and why>` whenever a doc is amended.

**Branching / version control:** work on short-lived branches `v2/<task-slug>` cut from `main`, merge (FF or squash) back to `main` when the task's tests are green. Tag `v1.0` on current main before the first V2 merge; tag `v2.0` when Tasks 1–9 are merged.

**Parallelism map (for offloading to multiple agents):**

| Track | Tasks | Shared-file hazard |
| --- | --- | --- |
| A (session UI) | 1, then 6 | Both touch `SessionScreen.tsx` / `useSessionScreen.ts` — MUST be sequential |
| B (profile + copy) | 2, then 3 | Both touch onboarding + profile — sequential within track |
| C (summary) | 4, 5 | Same files — sequential within track |
| D (data/ops) | 7, 8, 9 | Independent of everything — fully parallel |

`strings.ts` is touched by Tasks 1–6: each agent adds keys ONLY inside its own nested block (`session.coach`, `onboarding.nickname`, `summary.celebration`, …) to keep merges trivial. Tracks A–D can run in parallel with each other.

---

### Task 1: Session centerpiece — coach line + Zoom-legible gauges (V2.0 / absorbs most of old V3.1)

**Status note:** Steps 1–3 are ALREADY COMMITTED on main (commit "feat(session): live coach line over the preview…", 2026-07-23): `strings.session.coach.*`, `coachPhaseFor()` + its unit test, `coachText` in `useSessionScreen.ts`, and the SessionScreen overlay. Remaining work = Steps 4–7 (legend caption, renderer scale-up, docs).

**Files:**
- Modify: `src/session/renderer.ts` (presentation constants + meter geometry)
- Modify: `src/screens/session/SessionScreen.tsx` (coach overlay + legend caption)
- Modify: `src/screens/session/sessionHelpers.ts` (done — `coachPhaseFor`)
- Modify: `src/screens/session/useSessionScreen.ts` (done — `coachText`)
- Modify: `src/config/strings.ts` (done — `session.coach`)
- Test: `tests/unit/session-helpers.test.ts`
- Docs: `docs/FRONTEND.md` §2.4 (coach line + legend added to layout), `docs/API.md` §18 (no contract change — meter already documented)

- [ ] **Step 1: Write the failing test for `coachPhaseFor`**

```ts
// tests/unit/session-helpers.test.ts (new describe)
import { coachPhaseFor } from '../../src/screens/session/sessionHelpers.ts';
import { thresholds } from '../../src/config/thresholds.ts';

describe('coachPhaseFor — live coaching phase from smoothed effort', () => {
  it('maps below-zone to raise, in-zone to hold, above-zone to easeBack', () => {
    const [low, high] = thresholds.metrics.effortTargetZone;
    expect(coachPhaseFor(0)).toBe('raise');
    expect(coachPhaseFor(low - 0.01)).toBe('raise');
    expect(coachPhaseFor(low)).toBe('hold');       // entering the band counts as in-band
    expect(coachPhaseFor(high)).toBe('hold');      // top edge still in-band
    expect(coachPhaseFor(high + 0.01)).toBe('easeBack');
    expect(coachPhaseFor(1.5)).toBe('easeBack');   // over-effort clamps display, not the phase
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/unit/session-helpers.test.ts`. Expected: PASS already (implementation exists on the tree). If it fails, fix `coachPhaseFor` until green.

- [ ] **Step 3: Render the coach overlay in `SessionScreen.tsx`** — inside the `relative` preview container, after `<DemoWatermark …/>`:

```tsx
{s.phase === 'active' && s.coachText ? (
  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
    <p className="rounded-lg bg-background/90 px-5 py-2.5 text-center text-xl font-semibold shadow-md">
      {s.coachText}
    </p>
  </div>
) : null}
```

No `aria-live` here — SessionStatusStrip and SessionLiveAnnouncer own announcements; a 15 Hz live region would spam screen readers.

- [ ] **Step 4: Add the legend caption** in the `subState === 'REPS'` block, under `<SessionRepCounter …/>`:

```tsx
<p className="text-center text-sm text-muted-foreground">{strings.session.coach.legend}</p>
```

- [ ] **Step 5: Scale the canvas for Zoom** in `src/session/renderer.ts` — change ONLY these presentation constants (they are documented as presentation values, not thresholds):
  - `BAR_HEIGHT_PX` 14 → 22
  - `METER_WIDTH_PX` 10 → 24
  - `ZONE_COLOR` alpha 0.35 → 0.5
  - guide-arc `lineWidth` 4 → 6

- [ ] **Step 6: Verify** — `npm run typecheck && npx vitest run`. Expected: all green. Manually: `npm run dev`, run a session, confirm the coach line switches raise → hold → easeBack and yields to the amber ease-off chip.

- [ ] **Step 7: Docs + commit**

`docs/FRONTEND.md` §2.4 layout sentence gains: coach line ("live copy driven by the same smoothed `effortIndex` reps are detected on; yields to quality/ease-off messages") and the legend caption. Commit:

```bash
git add -A && git commit -m "feat(session): live coach line + Zoom-legible gauges

DOCS-CHANGE: FRONTEND §2.4 — coach line + band legend added to SessionScreen layout."
```

---

### Task 2: Nickname + greeting (V2.1) — [Track B]

**Files:**
- Modify: `src/data/schema.ts` (`UserProfile.nickname?: string`)
- Modify: `src/data/storage.ts` (validation: trimmed length ≤ 30; empty → undefined)
- Modify: `src/screens/onboarding/OnboardingScreen.tsx` + step components (optional nickname input on the existing exercise-selection step — do NOT add a new step count)
- Modify: `src/screens/home/HomeScreen.tsx` (greeting line)
- Modify: `src/config/strings.ts` (`home.greeting`, `onboarding.nickname.*`)
- Test: `tests/unit/storage.test.ts`, `tests/unit/home-greeting.test.ts` (new, pure helper)
- Docs: `docs/DATABASE.md` §2 (+field, validation row, privacy table row), `docs/ARCHITECTURE.md` §12 (Key fields += `nickname`), `docs/SAFETY_AND_COMPLIANCE.md` (data-minimization carve-out: optional, user-chosen display name, never exported — and ADD an ExportService exclusion so it stays out of the JSON export)

**Key decisions locked here:** `nickname` is optional, max 30 chars, stored on `user_profile`, **excluded from export** (check `src/data/export.ts` — profile fields are copied explicitly; do not add nickname there, and add a test asserting the export JSON has no `nickname` key).

- [ ] **Step 1: Failing test — storage validation**

```ts
// tests/unit/storage.test.ts (in StorageService.saveProfile describe)
it('accepts an optional nickname up to 30 chars and rejects longer', async () => {
  await StorageService.saveProfile(makeProfile({ nickname: 'Ravi' }));
  expect((await StorageService.getProfile())?.nickname).toBe('Ravi');
  await expect(
    StorageService.saveProfile(makeProfile({ nickname: 'x'.repeat(31) })),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});
```

- [ ] **Step 2: Run — expect FAIL** (`nickname` not in schema/validation).
- [ ] **Step 3: Implement schema + validation** (`assertProfile` in storage.ts: if `p.nickname !== undefined` → `typeof string`, `p.nickname.trim().length between 1 and 30`).
- [ ] **Step 4: Greeting helper (pure, testable)** — `src/screens/home/homeHelpers.ts`:

```ts
import { strings } from '@/config/strings';
export function greetingFor(hour: number, nickname: string | undefined): string {
  const part = hour < 12 ? strings.home.greeting.morning
    : hour < 18 ? strings.home.greeting.afternoon
    : strings.home.greeting.evening;
  return nickname ? `${part}, ${nickname}` : part;
}
```

Strings: `home.greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }`. Test all three buckets + no-nickname fallback in `tests/unit/home-greeting.test.ts`.

- [ ] **Step 5: Wire onboarding input + HomeScreen heading; export-exclusion test** (`tests/unit/export.test.ts`: seeded profile with nickname → `JSON.parse(exported)` has no `nickname` anywhere).
- [ ] **Step 6: typecheck + vitest green; commit** with `DOCS-CHANGE: DATABASE §2 + ARCHITECTURE §12 + SAFETY (minimization carve-out) — optional nickname, never exported.`

---

### Task 3: "Your why" (V2.2) — [Track B, after Task 2]

Same shape as Task 2. `UserProfile.motivation?: string` (max 120 chars; the identifier is `motivation` — add to glossary; "why" is copy, not an identifier). Captured on the LAST onboarding step ("What makes this worth it for you? (optional, stays on this device)"), shown in two places:
- HomeScreen under the greeting (small, muted).
- SessionScreen REST panel ("Remember your why: …") — modify `SessionRestPanel` props + strings.

Same export exclusion + test. Same doc set as Task 2. Copy MUST pass SAFETY §8 (no guilt framing; it is the user's own words shown back, never a demand).

---

### Task 4: Celebratory close-out + gentleness framing (V2.3 + V2.4) — [Track C]

**Files:**
- Modify: `src/screens/summary/SummaryScreen.tsx`, `src/lib/summaryMetrics.ts` (or the existing summary metrics module — check `tests/unit/summaryMetrics.test.ts` for its real path first)
- Modify: `src/config/strings.ts` (`summary.celebration.*`)
- Test: `tests/unit/summaryMetrics.test.ts`
- Docs: `docs/FRONTEND.md` §2.5 (summary layout gains celebration header)

**Gentleness stat (pure function, TDD):**

```ts
// summaryMetrics: gentleness = reps completed WITHOUT triggering ease-off
export function gentlenessStat(results: SessionRecordFull['results']): { gentle: number; total: number } {
  let gentle = 0; let total = 0;
  for (const r of results) for (const rep of r.reps) {
    total += 1;
    if (rep.easeOffTriggered === 0) gentle += 1;
  }
  return { gentle, total };
}
```

Copy (SAFETY §8-compliant, restraint-as-winning): `"You kept it gentle {gentle} of {total} times — that's exactly the skill."` For `gentle === total`: `"Every single rep gentle. Perfect restraint."` Never shame the remainder.

**Animation:** CSS-only (Tailwind keyframes in the component; no confetti dependency — deps are closed). A soft scale+fade-in of the stat card and a one-time check-mark draw. Respect `prefers-reduced-motion` (media query gates the animation) — FRONTEND §4 "no flashing".

Steps: failing test for `gentlenessStat` (0-rep, mixed, all-gentle cases) → implement → wire card into SummaryScreen above existing per-exercise table → typecheck+vitest → commit with FRONTEND DOCS-CHANGE.

---

### Task 5: Summary polish for demo (remaining V2.4 verbal framing) — [Track C, after Task 4]

Pure copy pass on `strings.summary.*` + SummaryScreen hierarchy: gentleness card first, rep counts second, quality note last. No logic. Re-read SAFETY §8 first; commit with `DOCS-CHANGE: FRONTEND §2.5` if layout order changes.

---

### Task 6: Breathing arrival moment (V2.6) — [Track A, after Task 1]

**Files:** `src/components/session/ArrivalOverlay.tsx` (new), `SessionScreen.tsx`, `useSessionScreen.ts`, `strings.ts` (`session.arrival.*`), docs `FRONTEND.md` §2.4.

Behavior: for NON-demo sessions, after `SessionController.start()` resolves, show a full-preview overlay: "Take a slow breath… we'll begin when you're ready" with a 4-second CSS breathing circle (scale 1→1.15→1, `prefers-reduced-motion` → static) and a single "Begin" button (the overlay never auto-dismisses — no time pressure, FRONTEND §101 rule). The camera is already live behind it, which doubles as warm-up. Implementation: new `phase === 'arrival'` in `useSessionScreen` between start-resolve and `active`; `handleBeginArrival()` sets `active`. Demo mode keeps its quick-setup flow unchanged.

Test: extend an existing screen test if present; otherwise unit-test the phase transition logic if it's extracted; minimum bar = typecheck + suite green + manual run. Commit with FRONTEND DOCS-CHANGE.

---

### Task 7: Caregiver copy warmth pass (V2.7) — [Track D, parallel-safe]

`strings.caregiver.*` rewrite only: warm, plain-language, celebrates consistency ("4 calm sessions this week"), zero clinical jargon, zero numbers that imply judgment. Re-read SAFETY §8 + the caregiver read-only rule (no mutating controls). No code, no docs change unless a string's *meaning* changes a documented behavior (it shouldn't). Commit: `copy(caregiver): warmth pass`.

---

### Task 8: Demo-ready seeded profile (V2.8) — [Track D, parallel-safe]

**Files:** `src/dev/seed.ts` (the actual generator — extend here), `scripts/seed-dev.ts` (thin CLI wrapper — verify it re-exports the new generator), `src/dev/DebugOverlay.tsx` (the "seed db" button — verify it picks up the new seed).

Generate ~60 days of history ending today: 4–6 sessions/week, `symmetryIndex` mean drifting 0.55 → 0.78 with noise, `easeOffCount` declining, occasional missed days (realism), all rows passing `StorageService.saveSession` validation (integer `durationMs`, `0|1` flags, ISO dates — reuse the storage layer, never raw Dexie writes; that rule is a non-negotiable). Deterministic PRNG (seeded mulberry32 inline — no dependency) so every demo shows identical charts.

Test: run `seed-dev`, open Trends — two months of plausible upward drift; `npx vitest run` stays green. Commit: `feat(dev): two-month demo seed profile`.

---

### Task 9: Vercel deploy + phone install (V2.9) — [Track D, parallel-safe]

**Files:** `vercel.json` (new — static build output, SPA fallback, `Cache-Control` for `wasm/` + `models/`), README deploy note.

- Build must be the stock `npm run build` output; **verify Vercel injects nothing** (no analytics/speed-insights — check the served HTML against `dist/index.html`; the no-network rule binds production, and CI can't see platform injection).
- Set env vars in Vercel: `VITE_CONSENT_VERSION=1`, `VITE_DEMO_MODE_ENABLED=true`, `VITE_ENABLE_DEBUG_HUD=false`.
- Acceptance: PWA installs on Android Chrome from the deployed URL; airplane-mode relaunch works (offline gate); record the 15-second phone clip for the demo here.
- Docs: none (deploy is ops, not architecture) — but add the URL + checklist to `docs/superpowers/plans/2026-07-23-demo-runbook.md` (created by the V3 plan's rehearsal task; create the file if executing this first).

---

## Self-review notes

- V2.5 (picture-in-picture demo clip) is **deliberately absent as an app feature**: it's presentation logistics (a recorded clip in the next tab / browser PiP during the Zoom call), covered by the demo runbook task in the V3 plan. No app code should be written for it.
- Order within tracks matters (1→6, 2→3, 4→5); tracks A/B/C/D are mutually parallel.
- Every task lists its doc amendments; none touches thresholds or metric code — V2 is presentation-layer by design.
