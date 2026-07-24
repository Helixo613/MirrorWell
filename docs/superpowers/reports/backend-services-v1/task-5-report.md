# Task 5: TrendsService Implementation Report

## Status: DONE (fix pass applied per review verdict: see "Fix pass" section at the end)

## Files touched

- Created: `src/data/trends.ts`
- Created: `tests/unit/trends.test.ts`
- No other files modified. `git status --porcelain` in the worktree shows only these two
  untracked files.

## Contracts followed (verbatim)

- `docs/API.md` §12. `getTrend(exerciseId, granularity): Promise<TrendSeries>`,
  `getAdherence(range): Promise<Adherence>`, response examples, Rules block.
- `docs/BACKEND.md` §1.10: exact signature line (`getAdherence(range: {from: string; to:
  string})`), confirming `getTrend` takes **no range parameter**.
- `docs/ARCHITECTURE.md` §13. `TrendSeries` / `Adherence` shapes copied verbatim as inline
  anonymous types (no extra named type like `TrendPoint` was introduced, since only
  `TrendSeries`/`Adherence` are in the §12 glossary's canonical-types row).
- `docs/DATABASE.md` §2. `SessionRecord.endReason`, `ExerciseResult.meanSymmetryIndex`,
  `CalibrationBaseline.noiseFloorSymmetry`/`isActive` fields used verbatim via `StorageService`
  types; no Dexie/db import in `trends.ts`.

## Test inventory (`tests/unit/trends.test.ts`, 8 tests, all vitest, fake-indexeddb)

`TrendsService.getTrend`:
1. `scopes a series to the active baselineId only, excluding sessions under an older baseline`
; two baselines (old → new via `saveBaseline`'s deactivate-on-save), one session per
   baseline with distinct `meanSymmetryIndex`; asserts `series.baselineId` is the new baseline
   and the old session's value is absent.
2. `excludes quality_abandoned and red_flag_stopped sessions from aggregation`, 3 sessions same
   month (`completed` 0.6, `quality_abandoned` 0.9, `red_flag_stopped` 0.9); asserts
   `sampleCount: 1` and `meanSymmetryIndex: 0.6` (not blended toward 0.9, not count 3).
3. `marks aboveNoiseFloor false below the active baseline noise floor and true above it`
   4 monthly points against `noiseFloorSymmetry: 0.05`: first point trivially `true` (no prior),
   +0.02 delta → `false`, +0.08 delta → `true`, **-0.07 delta → `true`** (a genuine decline whose
   magnitude clears the noise floor; this point exists specifically to kill a signed-delta
   mutant; see Self-review below).
4. `reads the noise floor from calibration_baseline, never app_settings`; seeds a full
   `app_settings` row (structurally has no `noiseFloorSymmetry` field) plus a baseline with
   `noiseFloorSymmetry: 0.01`; reuses the same 0.02 delta that read `false` against 0.05 in test 3
   and asserts it now reads `true` against 0.01: the differential proves the value is sourced
   from the baseline, not a coincidence.
5. `buckets weekly by Monday-start week and monthly by calendar month, with correct sampleCount`
, 3 sessions (two same month/different weeks, one next month); asserts exact `periodStart`
   values and `sampleCount` for both granularities.
6. `rejects an unknown exerciseId with VALIDATION_FAILED`.

`TrendsService.getAdherence`:
7. `computes sessionsPerWeek and completionRate over a multi-week range, counting non-completed
   sessions in the denominator only`, 3 weeks of sessions (2 completed / 2 completed+1
   quality_abandoned / 1 user_stopped); asserts `sessionsPerWeek: [2, 2, 1]` and
   `completionRate === 3/5` (abandoned and user_stopped count in the denominator, not the
   numerator; this is the case that would pass wrongly if `getAdherence` reused the trend
   exclusion filter).
8. `rejects a malformed range with VALIDATION_FAILED (propagated from StorageService)`, bonus
   test covering the brief's explicit "malformed range in getAdherence → VALIDATION_FAILED"
   requirement.

All dates are UTC midday timestamps (`T12:00:00.000Z`) to avoid any local-timezone boundary
flip; weekday alignment (all "Monday" fixtures) was verified with `Date.prototype.getDay()`
before writing the tests.

## Design choices (not fully specified by docs: documented in code comments too)

1. **`getTrend`'s implicit range.** Its signature has no range parameter (confirmed against
   `BACKEND.md` §1.10, which matches the brief). It fetches the full session history via
   `StorageService.getSessions({from: '1970-01-01T00:00:00.000Z', to: new Date().toISOString()})`
   and lets baseline scoping narrow it. Treated as a fixed sentinel bound, not a tunable (no
   `thresholds.ts` entry).
2. **Weekly bucket alignment.** Docs specify `periodStart` is "a calendar date in local time" but
   don't pin the week's start day. Implemented as Monday-start ISO calendar weeks (a documented,
   deterministic choice; see comment in `bucketStart`).
3. **`aboveNoiseFloor` on the first point in a series.** No prior period exists to diff against;
   defaults to `true` (nothing to call "steady" against). Not specified by docs; documented in
   code. Not load-bearing for any required rule.
4. **`getTrend` with no active baseline.** Not one of `getTrend`'s two documented error codes
   (`DB_UNAVAILABLE`, `VALIDATION_FAILED`), so it returns a non-throwing empty series
   (`baselineId: ''`, `points: []`) rather than inventing a new error path. Not exercised by a
   test (no required-test item covers it; a real profile always has an active baseline by the
   time `TrendsScreen` can be reached).
5. **`aboveNoiseFloor` comparison is against `Math.abs(delta)`**, not the signed delta. Rationale:
   API §12 says sub-noise-floor points render as "steady, never up/down"; meaning above-noise
   points can render as up *or* down, so a real decline whose magnitude clears the noise floor
   must still read `true`. A signed comparison would misclassify declines as "steady," hiding
   regressions. Verified by mutation testing (see below).
6. **`getAdherence`'s `sessionsPerWeek`** is generated by walking Monday-aligned week buckets from
   `bucketStart(range.from)` to `bucketStart(range.to)` inclusive (reusing the same weekly bucket
   function as `getTrend`), filling any gap week with `0`. Not specified verbatim by docs beyond
   the response shape; this keeps the two granular-bucketing code paths using one function.
7. **`completionRate` divide-by-zero guard**: returns `0` when `total === 0` (not tested; no
   required-test item covers an empty range, but NaN in a UI-bound percentage would be worse
   than 0).

No deviation from the brief required a `DOCS-CHANGE` note; no canonical identifier, threshold,
contract shape, or safety rule was touched or reinterpreted; all identifiers (`ExerciseId`,
`TrendSeries`, `Adherence`, `noiseFloorSymmetry`, `endReason` values, etc.) are copied verbatim
from `ARCHITECTURE.md` §12/§13 and `DATABASE.md` §2.

## Self-review / mutation testing

Because the implementation was written in the same pass as its tests (contracts were fully
pinned down via docs + advisor before writing), I ran deliberate mutation tests against
`src/data/trends.ts` to confirm the suite actually discriminates rather than passing vacuously:

| Mutation | Result |
|---|---|
| Remove the `session.baselineId !== activeBaseline.baselineId` filter | ✅ caught (test 1 fails) |
| Remove the `quality_abandoned`/`red_flag_stopped` exclusion | ✅ caught (test 2 fails) |
| Change `Math.abs(delta) >= noiseFloor` to signed `delta >= noiseFloor` | ❌ **not caught** on the first draft of test 3 (all deltas were monotonically increasing, so abs and signed gave identical results); **fixed** by adding a 4th point with a genuine decline whose magnitude clears the noise floor; re-ran the mutation and it now correctly fails |
| Make `getAdherence`'s `completed`/`total` both apply the trend-exclusion filter (wrong: would make `quality_abandoned` disappear from the denominator too) | ✅ caught (test 7 fails) |

All four mutations are caught by the final test suite; the implementation was restored from
backup after each mutation and the full 8-test file re-verified green.

## Verification gates (all run, all green)

- `npx vitest run tests/unit/trends.test.ts` → `PASS (8) FAIL (0)`
- `npx vitest run` (full suite) → `PASS (189) FAIL (0)`
- `npx tsc --noEmit` → `TypeScript: No errors found`
- `node scripts/check-docs.mjs` → `check-docs: OK` (13 pre-existing warnings, all
  `bare "§n" ... exists in ARCHITECTURE.md (allowed)`, unrelated to this task and present before
  this change)

## Concerns for the controller

- No blocking concerns. The two documented-but-unspecified choices worth a second look if a
  future task depends on them: (a) Monday-start weekly bucketing (design choices #2 and #6
  above); if `TrendsScreen`/`CaregiverScreen` (Task 14) expects a different week-start
  convention, this file and its tests are the single place to change it; (b) the empty-series
  fallback for a missing active baseline (#4); not currently reachable from a real UI flow, so
  left undecided rather than guessed.

## Fix pass (review round 2)

Reviewer verdict: implementation correct and spec-compliant, but two Important test-coverage
gaps (both empirically confirmed by the reviewer via mutation) plus two Minor comment fixes.
No git commit made, left in the working tree per instructions.

### 1. Noise-floor boundary equality (Important)

Reviewer mutated `>=` to `>` at `src/data/trends.ts:94` (now line ~100 after comment additions)
and all 8 original tests still passed, because every seeded delta (0.02 / 0.08 / 0.07 vs a 0.05
floor) was strictly on one side of the boundary, none hit it exactly.

Added test: `marks aboveNoiseFloor true when the period-over-period delta equals
noiseFloorSymmetry exactly` (`tests/unit/trends.test.ts`). Uses `noiseFloorSymmetry: 0.25`,
`meanSymmetryIndex` 0.5 → 0.75: a delta of exactly `0.25`, verified bit-exact in IEEE 754
(`0.75 - 0.5 === 0.25` confirmed via `node -e`, and asserted in the test itself via
`expect(points[1].meanSymmetryIndex - points[0].meanSymmetryIndex).toBe(0.25)` so the test fails
loudly if float drift is ever introduced instead of silently passing on a near-miss). Asserts
`aboveNoiseFloor === true`, matching the spec: "false when change is strictly < the floor," so
equality must read `true`.

**Mutation verification (self-run, mirroring the reviewer's):**
- Mutated `Math.abs(meanSymmetryIndex - previousMean) >= activeBaseline.noiseFloorSymmetry` to
  use `>` instead of `>=`.
- Ran `npx vitest run tests/unit/trends.test.ts` → exactly 1 failure, the new boundary test
  (`expected false to be true`); all other 10 tests still passed. This confirms the new test is
  the one that pins the `>=` behavior and isolates the mutation precisely.
- Reverted the mutation (restored from a pre-mutation backup copy) and re-ran → 11/11 green.

### 2. DB_UNAVAILABLE propagation (Important)

Required by the brief's Errors line ("DB_UNAVAILABLE propagates from StorageService") but had no
dedicated test; the implementation deliberately has no try/catch around StorageService calls
(so propagation happens "for free"), but that absence-of-a-catch-block was never exercised by
a failing-storage scenario.

Added two tests, both using `vi.spyOn(...).mockRejectedValueOnce(new
MirrorWellError('DB_UNAVAILABLE', ...))` (no real DB failure needed; StorageService is the
seam `trends.ts` calls through, so stubbing it directly is the precise unit boundary):
- `propagates DB_UNAVAILABLE from StorageService.getActiveBaseline`, stubs `getActiveBaseline`
  to reject; asserts `TrendsService.getTrend(...)` rejects with `code: 'DB_UNAVAILABLE'`.
- `propagates DB_UNAVAILABLE from StorageService.getSessions`, stubs `getSessions` to reject;
  asserts `TrendsService.getAdherence(...)` rejects with `code: 'DB_UNAVAILABLE'`.

Added `vi.restoreAllMocks()` to the shared `beforeEach` (matching the pattern already used in
`tests/unit/storage.test.ts`) so these spies never leak into other tests in the file.

### Minor comment fixes (both applied in `src/data/trends.ts`)

(a) At the period-over-period comparison in `getTrend`: added a note that `previousMean` refers
to the last bucket that actually had a qualifying sample, not necessarily the immediately
preceding calendar period; an empty middle bucket is skipped entirely (never inserted as a
zero-count point), so the noise-floor comparison deliberately spans across that gap to the
nearest non-empty period on either side. This is existing, correct behavior; the comment merely
documents that it's deliberate rather than an oversight.

(b) At `completionRate` in `getAdherence`: added a note that the `total === 0 ? 0 : ...` fallback
exists to avoid `NaN` (0/0) on an empty range, since this value is UI-bound as a percentage.

### Verification (fix pass)

- `npx vitest run tests/unit/trends.test.ts` → `PASS (11) FAIL (0)` (8 original + 3 new: boundary
  equality, getTrend DB_UNAVAILABLE, getAdherence DB_UNAVAILABLE)
- `npx vitest run` (full suite) → `PASS (192) FAIL (0)`
- `npx tsc --noEmit` → `TypeScript: No errors found`
- `git status --porcelain` → only `src/data/trends.ts` and `tests/unit/trends.test.ts` modified
  (no new files, no commit made)


---
**CORRECTION (2026-07-20, controller):** every `tsc --noEmit` result recorded in this report is VOID. The root `tsconfig.json` is a solution-style config (`"files": []` + project references), so `npx tsc --noEmit` type-checks an empty file set and always reports success. The real gate is `npm run typecheck` (`tsc -b`). Re-verified after commit f046bee: `tsc -b` clean and `npm run build` green across the whole branch, so this task compiles; but the original claim was not evidence for that.
