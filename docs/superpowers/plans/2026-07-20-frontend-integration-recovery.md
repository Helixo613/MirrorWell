# Frontend Integration Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Keep every commit local; never push.

**Goal:** Complete the frontend import without reviving the obsolete source-branch backend, while making every screen safe against the documented contracts.

**Architecture:** Reuse the imported UI and canonical `main` types. Session and calibration use the env-gated `SessionApi` seam only in dev. Missing backend services remain explicit integration seams; do not copy `sai-shanmukh-progress` data/session modules.

**Tech Stack:** React, TypeScript, React Router, Vite, Vitest, the pinned Tailwind toolchain, and existing local services.

---

## Completed baseline

- [x] Pin UI dependencies and document them (`cdd63c5`).
- [x] Import UI-only trees and configure aliases (`101f25b`).
- [x] Merge strings and triage UI types (`2846675`).
- [x] Add the dev-only SessionApi stub (`03c58cc`).
- [x] Merge the route shell, Summary screen, and stub camera wiring (`eccc355`, `9c4c940`, `c771cbd`).
- [x] Remove the unsupported Tailwind animation plugin (`0d717a0`).

## Task 1: Make dev calibration honest

**Files:** `src/hooks/useCalibrationFlow.ts`, `src/screens/CalibrationScreen.tsx`, `src/dev/sessionApiStub.ts`, `tests/unit/session-api-stub.test.ts`.

- [ ] Write a failing fake-timer test proving stub calibration cannot route to Home until a baseline-shaped result is available through the documented flow.
- [ ] Change the dev seam so it never presents a completed calibration after neutral capture alone; retain the user on the calibration flow with canonical strings until the real `CalibrationFlow` is available.
- [ ] Verify no baseline is fabricated, no direct Dexie call occurs, and no camera is opened in stub mode.
- [ ] Run the focused test and the existing stub suite; commit `fix: keep dev calibration incomplete without a real baseline`.

## Task 2: Finish compile-driven UI rewiring

**Files:** imported UI trees, `src/lib/**`, canonical type imports only.

- [ ] Run `npx tsc --noEmit -p tsconfig.app.json` and classify errors as UI import errors or absent backend contract modules.
- [ ] Fix every UI-only/canonical import error without touching `src/sensing`, `src/metrics`, `src/data`, or `src/session`.
- [ ] Rehome only pure display aggregation into `src/lib`; all persisted reads must use `StorageService`.
- [ ] Commit `refactor: finish canonical UI import rewiring` when no remaining UI-owned errors exist.

## Task 3: Integrate stable backend services without copying obsolete code

**Files:** backend-provided canonical modules only after their local branch is merged into this worktree; UI hooks consuming those services.

- [ ] Confirm the exact local backend commit providing `StorageService.getSettings/saveSettings`, `SettingsService`, `TrendsService`, and `ExportService` matches API.md contracts.
- [ ] Integrate that local backend commit rather than recreating a frontend service or importing `sai-shanmukh-progress` backend code.
- [ ] Re-run app typecheck and verify UI hooks use only `StorageService`/documented services.
- [ ] Commit the integration with its existing backend commit history preserved; do not push.

## Task 4: Wire static screens

**Files:** Onboarding, Home, Settings, Export, Trends, related hooks/tests.

- [ ] For each screen, write a focused failing test for its documented storage/route behavior.
- [ ] Wire only documented service calls and strings; prohibit camera imports on Home, Settings, Trends, and Export.
- [ ] Run focused test, app typecheck, and a route render check after each coherent screen group.
- [ ] Commit one coherent screen group at a time.

## Task 5: Complete camera-screen integration

**Files:** SessionScreen, CalibrationScreen, dev seam tests.

- [ ] Replace the dev stub import with the real canonical SessionController/CalibrationFlow only after its local backend implementation is available.
- [ ] Keep the stub production-excluded; verify a production build contains neither `sessionApiStub` nor dev harness code.
- [ ] Verify `EX_PUCKER` remains unavailable until MODEL_AND_DATA §7 receives a mapping decision.

## Task 6: Compliance and acceptance

**Files:** tests only, plus `strings.ts` fixes if audits identify them.

- [ ] Run strings/tunables, no-network, camera-lifecycle, a11y, build, typecheck, Vitest, Playwright, and docs checks.
- [ ] Require all screen route tests and bundle checks to pass before marking the original plan complete.
- [ ] Update the original plan checkboxes and write a local handoff report listing remaining backend merge dependencies.
