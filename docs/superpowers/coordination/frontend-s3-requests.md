# Frontend Stream S3 — outgoing requests

Stream S3 (`src/screens/{trends,caregiver,export}/**` + their tests;
`strings.{trends,caregiver,export}`; trends/export presentation utils in `src/lib/`) files requests
here for changes it needs in files it does not own. Per
`docs/superpowers/plans/2026-07-21-full-app-completion-parallel.md` ownership rule 1, S3 never edits
another stream's file, nor the frozen shell (`App.tsx`, `src/router/**`, `src/context/**`,
`src/components/ui/**`). Each entry states the target owner, the exact change, and why it is needed.
One file per stream = never conflicts.

---

<!-- Append requests below. Template:

## S3-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`) — <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->
