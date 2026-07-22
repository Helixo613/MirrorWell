# Frontend Stream S1 — outgoing requests

Stream S1 (`src/screens/{calibration,session,summary}/**` incl. `FeedbackRenderer`, rep counter, rest
timer, demo quick-setup overlay; `strings.{calibration,session,summary}`; and the Gate 0 bootstrap)
files requests here for changes it needs in files it does not own. Per
`docs/superpowers/plans/2026-07-21-full-app-completion-parallel.md` ownership rule 1, S1 never edits
another stream's file, nor the frozen shell (`App.tsx`, `src/router/**`, `src/context/**`,
`src/components/ui/**`) after Gate 0. Each entry states the target owner, the exact change, and why it
is needed. One file per stream = never conflicts.

---

<!-- Append requests below. Template:

## S1-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`) — <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->
