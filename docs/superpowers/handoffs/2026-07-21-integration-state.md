# MirrorWell: integration handoff (2026-07-21)

Context-preserving notes for the multi-agent parallel-completion run. Written so a fresh session
can pick up without re-deriving anything. Plan of record:
`docs/superpowers/plans/2026-07-20-parallel-completion.md`.

---

## 1. Where the work stands

| Stream | Owner | Branch | State |
|---|---|---|---|
| **Gate 0** | Claude | `backend-services-v1` | **MERGED to main** (`16d2654`). All findings fixed. |
| **A**, session/exercises/demo | Claude | `stream-a-session` | **MERGED to main**. 11 commits. |
| **B**, data/privacy/Phase 8 | GPT‑5.6 | `stream-b-data` | **MERGED to main** (`89c593d`) + carve-out fix `97b0dfb`. |
| **C**, evidence/metrics/ledger | Cursor (Opus) | `stream-c-evidence` | C1 + C2 committed, **not merged**. **C3 still owed.** |
| **D**, external evidence | Grok | `stream-d-external` | Complete, **not merged**. 8 commits + reconciliation `e5a260b`. |

**Unmerged branches:** `stream-c-evidence`, `stream-d-external`, `fix/controller-start-race`
(`4e40bbb`), `fix/test-isolation` (`aa17b91`).

**Remaining sequence:** merge the two `fix/*` branches → C rebases on main → C3 → merge C → merge D
→ cross-doc reconciliation → final whole-branch review.

---

## 2. Decisions that are settled: do not relitigate

- **EX_PUCKER dropped from v1**, but the `exercises['EX_PUCKER']` entry and the
  `ExerciseId`/`EXERCISE_IDS` union **stay**. "Assignable" is a derived *filter* (exercises with a
  `blendshapePair`). `metrics.test.ts` and `storage.test.ts` both need `EX_PUCKER` to remain a
  valid id. The `VALIDATION_FAILED` guard in `metrics.ts` is an intentional invariant; keep it.
- **Trend periods are LOCAL time**, Monday-start ISO weeks, local calendar months
  (`ARCHITECTURE §13:233,364`; `trends.ts` uses `getFullYear/getMonth/getDate/getDay`).
  **Never "correct" these to UTC.** The export range *is* widened in UTC (`export.ts:63-64`) while
  trends bucket in local; that boundary is documented, not a bug.
- **Event surface is 7 events** including `qualityOfferStop {visible}` (`controller.ts:28`,
  `API.md:31`, `ARCHITECTURE.md:254`). Do not revert to 6.
- **V1 closes PROTOCOL_LIMITED**, no further operator recording. The intensity confound explains
  the displacement failures but **not** two B3 yaw breaches (0.051, 0.067) at matched activation
  those are recorded as genuine bar failures / a protocol lesson, never explained away.
- **V2 stays DEFERRED.** `jasir/palsynet-data` + `track-b-palsynet-v1` was formally evaluated and
  is **EXPLORATORY-ONLY**; no flaccid/synkinetic labels, `affectedSide` absent so B7 isn't
  measurable, presentation-subset Spearman impossible. Frozen bars unchanged; MEEI still owed
  (membership/author-mediated, `sircharlesbell.com/standardset` returns 404).
- **app_settings is the §17 "non-sensitive static config" read exception**, demo keeps
  accessibility settings (`textScale`). Demo-blocked reads are `getProfile`, `getActiveBaseline`,
  `getSessions` only. All writes stay blocked.

---

## 3. The flake investigation (resolved: full story)

**Symptom:** after merging B, `controller.test.ts > EX_BROW_RAISE completes …` failed once with
`ended` spy never called + Unhandled Rejection `endedAt must be >= startedAt`.

**Dead ends (do not repeat):**
- Would not reproduce in **21** consecutive full-suite runs (16 plain, 5 under coverage).
- A `start()`-ordering hypothesis (initialise session state before `openFrameSource`, since the
  `handleFrame` subscription is live across that await) was implemented **and reverted**, its
  regression test passed *without* the fix, proving the reorder changed no observable behaviour.
  Without the change, `openFrameSource` throws before state is set, so state stays `null` and
  `stop()` already rejected correctly.

**What actually found it:** `npx vitest run --sequence.shuffle`, **fails on the first shuffle**.
It was never a rare flake; it was a deterministic order dependency hidden by the default order.

**Root cause:** module-level singleton state leaking between tests *within a file*.
1. `MetricEngine.activeBaseline`, `metrics.test.ts` used `await import()` per test but **without
   `vi.resetModules()`, dynamic import returns the cached module**, so all tests shared one engine.
2. `SafetyGate.demoMode`, `safety.test.ts` entered demo with a static import; demo is one-way by
   design (`recordAttestation` is the documented exit), so it leaked into every later test.

**Fix** (`aa17b91`, branch `fix/test-isolation`): `vi.resetModules()` + dynamic import in
`beforeEach` for both files, matching the pattern already documented in `controller.test.ts`. No
test-only reset added to any production contract. **Verified 8/8 shuffled runs green.**

**Separately fixed** (`4e40bbb`, branch `fix/controller-start-race`): `endRestPeriod()` assigns
`stopPromise = stopSession('completed')` from synchronous `handleFrame` and never awaits it, so a
rejecting persist was an unhandled rejection with no operator signal. Now logged via `log.error`;
the rejection still reaches any explicit `stop()` caller. Real production defect, independent of
the flake.

**Lesson worth keeping:** `--sequence.shuffle` should be part of how this suite is validated.
Order-dependence is invisible in the default order and reads as flakiness.

---

## 4. Verification gates (run all; never `npx tsc --noEmit`)

```bash
npm run typecheck        # tsc -b. --noEmit type-checks NOTHING here (solution-style tsconfig)
npx vitest run
npx vitest run --sequence.shuffle   # catches order dependence
npm run test:coverage    # metrics.ts + reps.ts must be 100% branch
npm run build
node scripts/check-docs.mjs
npm run build && npx playwright test tests/e2e/no-network.spec.ts   # e2e needs a fresh build
```

Current main: **254 tests**, 100% branch on metrics/reps, all gates green.

`check-docs` blind spots: it does **not** validate thresholds↔API §15 drift, source-file paths, or
non-doc references. Four source comments still cite `docs/AGENTS.md`, which doesn't exist (the file
is root `AGENTS.md`).

---

## 5. Ownership rules (why they held)

One writer per file/doc; cross-stream needs go to
`docs/superpowers/coordination/stream-<x>-requests.md`. This worked, B correctly **stopped** at
the `safety.ts` boundary rather than improvising, and was granted a documented one-file exception
(A was already merged, so no conflict risk).

Test files follow their source owner. `thresholds.keys.test.ts` asserts exact key sets **per
group**, different groups never conflict, same group does.

---

## 6. What's left

1. Merge `fix/controller-start-race` and `fix/test-isolation` into main; run the gate set.
2. `git checkout stream-c-evidence && git rebase main`, then **C3**: scope geometry to
   calibration/drift. `geometry.ts` is already lean (only `Vec2`, `AbsoluteFeatures`,
   `NeutralStats`, `measureAbsolute`, `aggregateNeutral`); **inventory, don't manufacture
   deletions**. Must preserve every symbol the merged demo view and `normalize.ts` import:
   `measureAbsolute`, `aggregateNeutral`, `AbsoluteFeatures`,
   `NormalizationLayer.{normalize,setBaseline,clearBaseline}`,
   `MetricEngine.{setBaseline,compute,reset}`. Keep the guard test that unilateral motion must not
   read as symmetric. Fold Stream A's EX_PUCKER request into `MODEL_AND_DATA §7`.
3. Merge C, then D. Cross-doc reconciliation, then final whole-branch review.
4. Then the **frontend-integration plan** (separate) and, for acceptance, the V2 external-evidence
   gate. Backend stays **PROVISIONAL** until V2 passes.
