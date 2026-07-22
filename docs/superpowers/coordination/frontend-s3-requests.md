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
