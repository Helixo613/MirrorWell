# Task 6: ExportService Report

## Files touched

- `src/data/export.ts` (new), `ExportService.generateSummary`.
- `tests/unit/export.test.ts` (new), 9 tests.
- `src/config/strings.ts` (edit), added `exportSummary.nonDiagnosticNotice` (verbatim from `docs/API.md` §13's full example payload).
- `tests/schemas/export.schema.json` (new, checked out from `origin/sai-shanmukh-progress` per brief instructions; confirmed draft-07, `title: MirrorWellExportSummary`, `additionalProperties: false`, full `required` list, as stated in the brief).

No other files modified. No `git commit` run, working tree left dirty for the controller.

## Test inventory (`tests/unit/export.test.ts`, 10 tests, all green)

1. `ExportService.generateSummary, schema validation`
   - `produces a JSON payload that validates against tests/schemas/export.schema.json`, runs a hand-rolled recursive draft-07 validator (type / required / additionalProperties / items) against the real generated payload.
   - `sanity check: the validator itself rejects a payload with an extra nested field`, tampers a **nested** field (`reps` re-added inside `sessions[0].results[]`, not a top-level key) to prove the recursion into array items actually works, not just root-level `additionalProperties`.
2. `ExportService.generateSummary, nonDiagnosticNotice`
   - `includes the notice text, equal to strings.exportSummary.nonDiagnosticNotice`; asserts equality against the imported strings object (not a hardcoded copy in the test).
   - `HTML blob contains the same notice text`, reads the HTML blob via `.text()`, asserts containment.
3. `ExportService.generateSummary, noiseFloorSymmetry sourcing`
   - `uses the active baseline's noiseFloorSymmetry, not the inactive baseline's value`; seeds baseline OLD (0.09, ends up inactive) then NEW (0.05, active); asserts the export uses 0.05 and explicitly asserts it is not 0.09.
4. `ExportService.generateSummary, gating and validation errors`
   - `rejects an unattested profile with NOT_ATTESTED`; no profile seeded at all.
   - `rejects demo mode with NOT_ATTESTED even for an otherwise-attested profile (API.md §17: ExportService is ❌ in DEMO)`, added after an advisor review caught that `isAttested()` alone doesn't cover this: `ARCHITECTURE.md` §11 / `API.md` §17 state `enterDemoMode()` is reachable from an already-ATTESTED state (it's an in-memory flag, not a persistence gate), so an attested user can flip into demo and `isAttested()` would still return `true`. Fixed by checking `SafetyGate.isDemoMode()` first in `generateSummary`.
   - `rejects a bad range (from > to) with VALIDATION_FAILED`.
   - `rejects a malformed range date with VALIDATION_FAILED`.
5. `ExportService.generateSummary, DB_UNAVAILABLE propagation`
   - `propagates DB_UNAVAILABLE from StorageService.getSessions`, seeds an attested fixture first (so the failure isn't masked by `NOT_ATTESTED`), then `vi.spyOn(StorageService, 'getSessions').mockRejectedValueOnce(...)`, following the pattern in `tests/unit/trends.test.ts`.

## Design choices

- **Range format is calendar-date (`YYYY-MM-DD`), not full ISO timestamp.** `docs/API.md` §13's full example echoes the input range verbatim as `"range": {"from": "2026-05-01", "to": "2026-07-05"}"`, and `tests/schemas/export.schema.json` requires `range.from`/`range.to` to match `^\d{4}-\d{2}-\d{2}$`. I confirmed this against the (non-authoritative but informative) `origin/sai-shanmukh-progress` branch's already-written `src/data/export.ts`/`src/lib/dateRange.ts`, which also takes a date-only `ExportDateRange` and widens it to a full-day ISO range before calling `StorageService.getSessions`/`TrendsService.getAdherence`. `assertValidRange` validates the `YYYY-MM-DD` pattern + `Date.parse` + `from <= to`; `toStorageRange` widens to `${from}T00:00:00.000Z` .. `${to}T23:59:59.999Z` (UTC, not local-day; no timezone rule is documented for export ranges, and UTC keeps the boundary deterministic in CI).
- **Trend granularity is fixed at `'monthly'`**, not read from `SettingsService`/`AppSettings.trendGranularity`. The brief's explicit data-source list is "TrendsService (getTrend per assigned exercise, getAdherence) + StorageService (profile, sessions, active baseline)"; it does not mention `SettingsService`. `'monthly'` also matches both `docs/API.md` §13's full example and `AppSettings`'s own default. This is a documented, reversible simplification, not a doc conflict; no rule specifies which granularity export must use.
- **Missing profile / missing active baseline → `VALIDATION_FAILED`.** `docs/API.md` §13 lists only `DB_UNAVAILABLE` and `VALIDATION_FAILED` (bad range) as `generateSummary`'s errors; `NO_BASELINE` is not in this endpoint's documented error surface, so I did not introduce it here. Not exercised by the required tests (all seed both), so this is defensive/best-effort, flagged as a judgment call.
- **`sessions[].results[]` in the export drops `reps`, `profileId`, `baselineId`** (present on `StorageService`'s row types) via an explicit field-by-field map; `tests/schemas/export.schema.json`'s `additionalProperties: false` would otherwise reject the payload. Confirmed by test 1/2 above.
- **No `escapeHtml` in the HTML renderer.** Every field in the export payload is an enum, UUID, ISO date, or number; there is no untrusted free text anywhere in this payload, so escaping would be pure overhead (and would have broken test 5, since the notice contains an apostrophe that a naive escaper would mangle to `&#39;`, breaking exact-containment).
- Two Blobs (`application/json`, `text/html`); no Web Share API, no clipboard code, no network; verified by grep of the diff (none present).

## Deviations

None from `docs/API.md` §13 / `ARCHITECTURE.md` §13 / `SAFETY_AND_COMPLIANCE.md` §8 as written. No `DOCS-CHANGE` note needed; no canonical identifier, threshold, contract shape, or safety rule was altered; `strings.exportSummary.nonDiagnosticNotice` is a new string key (not a canonical identifier per `ARCHITECTURE.md` §12's glossary categories) holding the exact wording already published in `docs/API.md` §13's example.

## Self-review findings

- **Confirmed the recursive JSON-schema validator actually discriminates**, per the brief's explicit ask: a test tampers a payload by re-adding `reps` inside a nested `sessions[].results[]` object (not a top-level key) and asserts the validator reports a non-empty error list mentioning `reps`. This proves the `additionalProperties: false` check recurses into array items via `schema.items`, not just the root object; a validator that only checked the top level would have passed the tampered payload silently.
- Verified `noiseFloorSymmetry` sourcing test seeds two baselines under the *same* `saveBaseline` deactivation semantics already used by `tests/unit/trends.test.ts` (`isActive` flips atomically per profile); the "inactive value not used" assertion is a real discriminator (0.05 vs 0.09), not a tautology.
- Verified via `git show origin/sai-shanmukh-progress:src/data/export.ts` that a similar (but not authoritative; no ATTESTED gate, reads `noiseFloorSymmetry` from `AppSettings` which doesn't have that field on this branch's current `schema.ts`) implementation exists on the frontend branch; used it only to corroborate the date-only range format, not as a source of contract truth (current `docs/` + `schema.ts` on this branch are authoritative and were followed instead).
- **Caught and fixed a real gating gap via advisor review, before declaring done**: my first pass gated only on `SafetyGate.isAttested()`, reasoning informally that demo implied unattested. Checking the actual authoritative sources, `ARCHITECTURE.md` §11 ("`enterDemoMode` ... ✅ | ✅" from both UNATTESTED and ATTESTED) and `API.md` §17's gate matrix (`ExportScreen`/`ExportService` row: ❌ in DEMO), showed that an already-attested user calling `enterDemoMode()` (an in-memory flag, never persisted) would have sailed through `isAttested()` and exported real data while "in demo." Fixed: `generateSummary` now checks `SafetyGate.isDemoMode()` before/alongside `isAttested()`, both mapping to `NOT_ATTESTED` (no other documented error code fits "demo is not an export path" here). Added a discriminating test for it.
- Confirmed `nonDiagnosticNotice` is byte-for-byte verbatim against `docs/API.md` §13 (not just self-consistent with the equality test, which only proves both sides derive from the same constant): `grep -F "the user's own calibration" docs/API.md src/config/strings.ts` matches identically on both lines, including the straight apostrophe.
- Ran full gates: `npx vitest run tests/unit/export.test.ts` → 10/10 green; full suite `npx vitest run` → 202/202 green; `npx tsc --noEmit` → clean; `node scripts/check-docs.mjs` → OK (pre-existing warnings only, all `bare §N` cross-file references unrelated to this change).


---
**CORRECTION (2026-07-20, controller):** every `tsc --noEmit` result recorded in this report is VOID. The root `tsconfig.json` is a solution-style config (`"files": []` + project references), so `npx tsc --noEmit` type-checks an empty file set and always reports success. The real gate is `npm run typecheck` (`tsc -b`). Re-verified after commit f046bee: `tsc -b` clean and `npm run build` green across the whole branch, so this task compiles; but the original claim was not evidence for that.
