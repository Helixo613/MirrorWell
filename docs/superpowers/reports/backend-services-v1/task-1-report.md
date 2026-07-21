# Task 1 — SafetyGate fix report

## Changes

- `SafetyGate.isAttested()` now explicitly requires an existing profile before comparing attestation fields.
- Removed the out-of-scope Demo Mode reset from `recordAttestation()`.
- Documented the deliberate lazy-reference import cycle between `SafetyGate` and `StorageService`.
- Added validation and no-profile regression coverage.

## Tests

- `returns false without a profile when the consent version is unset`
- `re-gates attestation when the consent version changes`
- `persists attestation through StorageService`
- `rejects attestation without a profile`
- `rejects an attestation version that differs from the current version`
- `keeps demo mode in module memory only`

## Verification

- `npx vitest run tests/unit/safety.test.ts` — 6 passed.
- `npx tsc --noEmit` — passed.


---
**CORRECTION (2026-07-20, controller):** every `tsc --noEmit` result recorded in this report is VOID. The root `tsconfig.json` is a solution-style config (`"files": []` + project references), so `npx tsc --noEmit` type-checks an empty file set and always reports success. The real gate is `npm run typecheck` (`tsc -b`). Re-verified after commit f046bee: `tsc -b` clean and `npm run build` green across the whole branch, so this task compiles — but the original claim was not evidence for that.
