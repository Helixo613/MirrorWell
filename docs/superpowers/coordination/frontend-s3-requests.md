# Frontend Stream S3 — outgoing requests

Stream S3 (`src/screens/{trends,caregiver,export}/**` + their tests;
`strings.{trends,caregiver,export}`; trends/export presentation utils in `src/lib/`) files requests
here for changes it needs in files it does not own. Per
`docs/superpowers/plans/2026-07-21-full-app-completion-parallel.md` ownership rule 1, S3 never edits
another stream's file, nor the frozen shell (`App.tsx`, `src/router/**`, `src/context/**`,
`src/components/ui/**`). Each entry states the target owner, the exact change, and why it is needed.
One file per stream = never conflicts.

---

## Gate 0 handoff to S3 (what you inherit)

- Routes `/trends`, `/caregiver`, `/export` are registered and compile.
- **`TrendsScreen`** carries its full salvage body rewired to main's contracts (`exercises`
  config, `TrendSeries`). Finish per FRONTEND §2.6.
- **`CaregiverScreen`** is a routed `PlaceholderScreen` stub behind the `caregiverViewEnabled`
  consent gate (`CaregiverRoute`). Build the read-only summary; **zero mutating controls**
  (any interactive state-changing element is a review-blocking defect).
- **`ExportScreen`** is a routed `PlaceholderScreen` stub. Rebuild against main's
  `ExportService.generateSummary(range)` (`@/data/export`) — the salvage hook assumed
  `defaultRange`/`.blobs`/`.preview` which do not exist. Reference:
  `origin/sai-shanmukh-progress:src/screens/ExportScreen.tsx`, `:src/hooks/useExportScreen.ts`.
  Presentational components under `src/components/export/**` survived intact.
- Export is **download-only** (no share/clipboard), mandatory non-diagnostic notice, one A4 page.
  Enrich the printable HTML trend rows (latest value per exercise + steady/up/down from
  `aboveNoiseFloor`) — the known under-informative-export follow-up.
- Trend periods are **local-time** Monday-start ISO weeks / local calendar months (ARCH §13) —
  never label or compute them as UTC. `completionRate` = completed ÷ all sessions in range.
- Your write globs (committed tree): `src/screens/{trends,caregiver,export}/**`,
  `src/components/{trends,export}/**`, `strings.{trends,caregiver,export}`, trends/export utils in
  `src/lib/`.

<!-- Append requests below. Template:

## S3-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`) — <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->

## S3-REQ-1 → integration owner (frozen shell) (`vitest.config.ts`) — add `@`→src alias

**Origin:** Task 1 (TrendsScreen unit tests), Stream S3.

**Requested change:** Added `resolve: { alias: { '@': <src> } }` to `vitest.config.ts`, mirroring
`vite.config.ts`. Applied in this branch (additive; carried in the S3 Trends commit).

**Why:** Vitest does not merge the app's vite config, so co-located `src/**/*.test.ts` — and any
source module they import that uses the `@` alias (e.g. `src/lib/trendCaption.ts` importing
`@/config/strings`) — fail with "Cannot find package '@/...'". The vitest `include` already lists
`src/**/*.test.ts`; this makes those runnable. No runtime/build effect; all existing suites stay green.

## S3-REQ-2 → integration owner (`src/data/export.ts`, `strings.exportSummary`) — enrich export HTML trend rows

**Origin:** Task 15 (export half) / handoff "under-informative-export follow-up", Stream S3.

**Requested change:** `data/export.ts` `renderHtml` now renders each trend row with the exercise
display name + latest plain-language value + recent direction (was: exerciseId / granularity / point
count only). Logic lives in the S3-owned `src/lib/exportTrendRow.ts` (unit-tested); `renderHtml`
calls it. Two header keys added to `strings.exportSummary` (`latestColumn`, `directionColumn`) and a
`direction` sub-object to `strings.trends`. Applied in this branch.

**Why:** The plan/handoff assign S3 the printable-HTML enrichment; `data/export.ts` and
`strings.exportSummary` are not in the S3 write glob but have no live owner (backend is merged),
were cleared for a transparent cross-glob edit, and no coordination convention routes backend edits
elsewhere. **No contract shape change:** the JSON payload/schema is untouched; API §13 explicitly
allows the HTML to "present that data more compactly", so no DOCS-CHANGE is required. The
`tests/unit/export.test.ts` "every exportSummary value appears in HTML" test auto-covers the new
header keys (always rendered); conditional direction words come from `strings.trends` so they need
not appear in every export. Note: the two orphaned salvage modules `src/lib/exportHtml.ts` +
`src/lib/validateExport.ts` remain unused dead code (the canonical renderer is `data/export.ts`);
left in place, flagged for the final whole-branch review to delete.
