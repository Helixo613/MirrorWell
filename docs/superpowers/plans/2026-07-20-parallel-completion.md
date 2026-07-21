# MirrorWell — Parallel Completion Plan (Gate 0 → 4 streams → backend done + working demo)

> **Status:** the backend branch `backend-services-v1` (tip `c6e54f0`, 19 commits) was verified
> directly, file-by-file, against this plan (bundle-supplied). Every code claim below cites the
> real line it was checked against. This plan **supersedes**
> `docs/superpowers/plans/2026-07-20-backend-completion.md`.

## Context

MirrorWell is a local-only facial-palsy exercise PWA: it measures left/right facial symmetry
on-device via MediaPipe blendshapes and never transmits anything. The backend is functionally
built on `backend-services-v1` but **nothing is accepted**; the final whole-branch review returned
NOT READY and its fix run was lost. Three facts shape all remaining work:

1. **No further operator recordings.** Four V1 trials exist; exactly one passed all six checks.
   Re-analysing the rest with a rule invented after seeing results is tuning against the test set —
   forbidden by `MODEL_AND_DATA.md` §7. **V1 closes as PROTOCOL_LIMITED**, intensity confound documented.
2. **Acceptance moves to external evidence.** Until it lands, every backend task stays **PROVISIONAL**:
   if the evidence rejects the metric, provisional work built on it is invalidated.
3. **Finish line: a working live demo + a complete, honest backend** — not every screen in
   `IMPLEMENTATION.md`. Settled by the owner: **EX_PUCKER is dropped from v1** (no per-side
   blendshape pair; reversible later).

---

## P0 — Execution environment & verification status

Execution assumes `backend-services-v1` (tip `c6e54f0`) and a configured `origin` are present in
the execution environment. The branch and its evidence (`docs/superpowers/reports/backend-services-v1/`)
exist **only there** — landing and pushing it in Gate 0 is also the rescue. The branch was fetched
as a bundle and verified: **C1, C2, I1, I2, I3, M1, M6, and the 7-event surface are confirmed against
real code; M3 was re-scoped (docs mandate local time, code is correct); M5 was downgraded.** Two
earlier "findings" were retracted as false positives — the branch already has a `typecheck` script
and a 7-fact `CLAUDE.md` (fact 7 = the `tsc --noEmit` rule).

**First action on approval:** commit this plan to `docs/superpowers/plans/2026-07-20-parallel-completion.md`,
mark `2026-07-20-backend-completion.md` superseded in the same commit, and push. All streams work
from the committed copy — never a chat transcript.

---

## P1 — Ownership (exactly one writer per file and per doc)

| Stream | Owner / model | Branch | Source globs (exclusive write) + test files |
|---|---|---|---|
| **Gate 0** | Claude Code (Opus 4.8) | `backend-services-v1` | everything, briefly (blocking) |
| **A** | Claude Code (Opus 4.8) | `stream-a-session` | `src/session/**`, `src/config/exercises.ts`, `src/dev/**` + their tests (`controller.test.ts`, `calibration.test.ts`, `live-v1-harness.test.ts`) |
| **B** | GPT-5.6 sol | `stream-b-data` | `src/data/**` + `storage.test.ts` (`trends.ts` is here — API §12/BACKEND §1.10/DATABASE §4) |
| **C** | Opus 4.8 via Cursor CLI | `stream-c-evidence` | `tests/analysis/**`, `src/metrics/**` + `metrics.test.ts`/`reps.test.ts`/`geometry.test.ts` |
| **D** | Grok 4.5 | `stream-d-external` | `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` + notes under `docs/superpowers/reports/external-evidence/`; **no source, no ledger** |

| Doc | Owner |
|---|---|
| `API.md` §10, §11, §16 | A |
| `API.md` §3, §12, §13, §14, §17 | B |
| `API.md` §15 | Gate 0 (thresholds reconciled once) |
| `ARCHITECTURE.md` (§12 glossary, §13 types) | A; B & C file requests |
| `DATABASE.md`, `BACKEND.md` | B (BACKEND §1.6 rep-discard fix is Gate 0) |
| `MODEL_AND_DATA.md`, `IMPLEMENTATION.md` (ledger) | C |
| `2026-07-20-v2-palsy-dataset-gate.md` | D |
| `FRONTEND.md`, `TESTS.md`, `SAFETY_AND_COMPLIANCE.md` | A |

**Rules that prevent the merge disaster:**
1. **Never edit another stream's file.** Append the request to
   `docs/superpowers/coordination/<stream>-requests.md` (one file per stream = never conflicts); the
   owner applies it.
2. **Shared config is append-only within your own key block.** `thresholds.ts` / `strings.ts` are
   touched by all — add keys under your namespace, never reorder another stream's. In
   `thresholds.keys.test.ts` the assertions are **exact-match per group**: adding keys to *different*
   groups never conflicts; the *same* group, or a *new* top-level group, is a coordination point.
3. **Test files follow their source owner** (table above). `tests/analysis/**` → C.
4. **Docs win over code.** Any contract change carries `DOCS-CHANGE: <doc> §<n> — <what/why>` in the
   commit body. No invented identifiers — amend `ARCHITECTURE.md` §12 first (via request if not yours).
5. **Every task ends green** on the full gate set; a red merge blocks the streams behind it.

---

## P2 — Toolchain & testing preflight (Gate 0, before any stream forks)

These are real repo-config changes, not just prose — they must land in Gate 0 so every downstream
gate is meaningful.

- **Step 0 — install must be green.** `npm ci`, then postinstall (`copy-wasm.ts` → `verify-model.ts`,
  which SHA-256-checks `public/models/face_landmarker.task` + every `public/wasm/` file against
  `models.lock.json`). No gate runs until this passes; the exec env must allow *build-time* registry
  access despite the runtime no-network rule. Any WASM/model change ⇒ regenerate the lock
  (`verify-model --write`).
- **Tests aren't type-checked** — `tsconfig.app.json` includes `src` only, `tsconfig.node.json` the
  three config files; `tests/**` is in no project, so `tsc -b` never type-checks tests. **Add
  `tsconfig.test.json` to the build references** so every stream's TDD tests are type-checked.
- **Verification command set (every task):** `npm run typecheck` (= `tsc -b`; **never** `npx tsc
  --noEmit`, which type-checks the empty solution file and always passes — `CLAUDE.md` fact 7),
  `npx vitest run` (**order-randomised**: `vitest.config.ts` sets `sequence: { shuffle: true }` — do
  not remove it. Several units hold module-level state with no public reset, so a leak between tests
  is invisible under the default order and resurfaces later as "flakiness"; shuffle found a real
  order dependency on its first run after 21 clean sequential runs. Vitest prints the seed, so a
  shuffled failure stays reproducible), `npm run test:coverage` **for any task touching `src/metrics/**`** (the 100%-branch
  gate on `metrics.ts`/`reps.ts` only runs under `--coverage`, not `vitest run`), `npm run build`,
  `node scripts/check-docs.mjs`, then **`npm run build` → `npx playwright test tests/e2e/no-network.spec.ts`**
  (the e2e `webServer` serves `dist/` via `preview`, so it needs a fresh build first).
- **`noUnusedLocals`/`noUnusedParameters` are on** — deletions (C3 geometry, A1 EX_PUCKER) must remove
  all now-unused imports/locals or `tsc -b` fails.
- **`strings.ts` has no enforcement** (unlike `thresholds.keys.test.ts`). Nothing automated catches a
  hardcoded UI string, so I3/A3/B2 rely on manual SAFETY §8 review. Gate 0 should add a
  strings-completeness / no-inline-copy check if cheap; at minimum, call it out to reviewers.
- **`check-docs` blind spots** (do not over-trust): it validates §-refs among `docs/*.md` and the
  §12↔§13 glossary only. It does **not** catch thresholds↔API §15 drift (see C2), nor bad source-file
  paths — `thresholds.ts:7`, `landmarks.ts:55/77`, `storage.ts:3` cite **`docs/AGENTS.md`, which does
  not exist** (the file is root `AGENTS.md`; fact numbers are right, path is wrong). Fix those four
  comment paths in Gate 0 (cheap doc hygiene).

---

## Execution shape

```
Stream D (Grok) ── external-evidence research + v2-gate decision (docs-only, NO Gate 0 dep) ─────────┐
   starts at plan-commit, runs throughout ── publishes decision to stream-d-requests.md ──▶ C's C2    │
                                                                                                       │
Gate 0 (blocking) ── P2 toolchain + C1/C2/I1/I2/I3/M1/M3/M4/M5/M6 ── land backend-services-v1 ─┐       │
                                                                                                ▼       │
        ┌──────────── A / B / C branch from main AFTER Gate 0 merges ───────────────┐                  │
        ▼                          ▼                              ▼                                     │
   Stream A                   Stream B                       Stream C ◀── D's decision ─────────────────┘
   session/exercises/demo     data/privacy/Phase 8           evidence/consolidation/ledger
        │                          │                              │
        └── merge A ──▶ rebase ──▶ merge B ──▶ rebase ──▶ merge C ──▶ merge D ──▶ cross-doc reconcile + final review
```

Parallelism for A/B/C starts only after Gate 0 merges (else agents rebase onto a moving, broken base).
**D is the exception** — no source, no Gate 0 dependency — and runs from plan-commit. Merge order
**A → B → C** (later streams rebase); D merges last but publishes its *decision* early enough for C2.

---

## Gate 0 — Land `backend-services-v1` (Claude Code, blocking)

Do P2 first, then fix these (all verified against `c6e54f0`), re-review, all gates green, **push +
merge to `main`** (also rescues the branch's evidence dir).

- **C1 (Critical) — camera-ownership deadlock.** `controller.ts:331` awaits
  `CalibrationFlow.checkBaselineDrift()` **before** the only production `CaptureService.start()`
  (`controller.ts:342`). The drift check awaits `captureFor` (`calibration.ts:174`), which resolves
  only inside an `onFrame` callback; `frameSource`/`captureFor` (`calibration.ts:24,61`) merely
  *subscribe*, and `capture.ts:40` drops `onFrame` while not running. No camera → no frames →
  `start()` hangs forever on every attested session (demo skips it, `controller.ts:315`). **Fix at the
  shared seam:** `captureFor`/`frameSource` are used by **four** methods (`checkBaselineDrift`,
  `captureNeutral`, `captureComfortableMax`, `runNoiseFloorSelfTest`) — give the seam idempotent
  camera ownership (start-if-not-running, stop-only-if-I-started), so all four are safe once
  `CalibrationScreen` wires the other three. Regression test must exercise the **real** drift path —
  `controller.test.ts` currently stubs it, which is why 203 green tests missed this.
- **C2 (Critical) — threshold duplication + undocumented keys.** `thresholds.ts:61–64` has
  `session { qualityProblemOfferStopMs, metricEventMinIntervalMs, repMinOkFraction }`, but API §15
  (`API.md:508`) documents **only** `qualityProblemOfferStopMs`. `repMinOkFraction` (0.6) duplicates
  the documented `reps.minQualityFramePct` (0.6). Fix: `controller.ts` consumes
  `reps.minQualityFramePct`, delete `session.repMinOkFraction`, **document `metricEventMinIntervalMs`
  in API §15**, and update the `session` group in `thresholds.keys.test.ts`. (`check-docs` stays green
  despite this drift — it does not validate thresholds↔API §15.)
- **I1 — `CalibrationFlow` stale state.** `calibration.ts:18–22` has 5 module fields; `captureNeutral`
  sets `neutralStats`/`neutralQualityScore`/`noiseFloorDisplacement` but leaves **`comfortableMax` and
  `comfortableExercise`** stale, so a prior calibration's comfortable-max bleeds into a new baseline via
  `makeBaseline` (silent, persisted corruption). Fix: reset those **two** fields at the start of
  `captureNeutral`.
- **I2 — capture stall on inference loss.** `calibration.ts:61–76`: `windowStartMs` is set from
  `lf.timestampMs` and the window-close check is guarded by `lf &&`, so persistent `INFERENCE_FAILED`
  (lf = null) means the window never closes / never starts → the capture hangs (same class as C1).
  Extract the single shared 3-arg seam that carries `timestampMs` independently (the controller's seam,
  `controller.ts:36–56`, already does this) and drive both files from it.
- **I3 — hardcoded strings in export HTML.** `export.ts:98–122` has ~12 user-facing literals
  ("MirrorWell summary", "Range:", "Affected side:", "Noise floor (symmetry):", "Completion rate:",
  "Trends", "Sessions", "Started", "Ended", "End reason", table headers); only `nonDiagnosticNotice`
  is sourced from `strings.ts`. Move them all to `strings.ts` (SAFETY §8 audited).
- **M1 (low) — `stop()` before `start()`.** Rejects on the empty `sessionId` (`storage.ts:138`) and the
  rejected `stopPromise` is returned by every later `stop()` until the next `start()` clears it
  (`controller.ts:356,380`). Guard `stop()` to no-op (or resolve) when no session is active.
- **M3 — trend bucketing timezone (RE-SCOPED — do NOT convert to UTC).** `ARCHITECTURE.md:233` and
  `:364` mandate **local-time** trend periods; `trends.ts:44–53` correctly implements local time. There
  is **no UTC-vs-local bug in the buckets** — an agent must not "fix" them to UTC (that would violate
  ARCH §13). The real edge is the **export boundary**: `export.ts:63–64` widens the export range in
  **UTC** while `TrendsService` buckets in **local**, so a session near midnight UTC can sit in the
  range yet fall in a different local day/week. Gate 0's action here is to **document that boundary and
  confirm consistency**, not to change the buckets. (Stream B's B1 documents the local-time rule.)
- **M4 — test hygiene.** Controller/calibration module singletons aren't reset between unit tests,
  masking cross-test bleed. Add per-test resets so the C1 regression (and others) are isolated.
- **M5 (downgraded, low) — self-test leaves engines pinned.** `runNoiseFloorSelfTest`
  (`calibration.ts:158–159`) leaves `NormalizationLayer`/`MetricEngine` pinned to a throwaway baseline,
  but `controller.start()` re-`setBaseline`s (`:334–335`) and `MetricEngine` only reads `comfortableMax`
  (identical) — **no functional corruption**. Optional tidy (clear after the self-test); not a blocker.
- **M6 — BACKEND §1.6 phantom emit (doc fix).** A discarded rep emits **nothing** (`controller.ts:204–221`),
  but BACKEND §1.6 says "not counted, `strings.ts` explanation **emitted**." No event carries it under the
  closed 7-event surface. Fix the doc (rep-discard is silent; no event).

**7-event surface — confirmed, do not revert.** `controller.ts:28` defines `qualityOfferStop {visible}`;
API §10 (`API.md:31`) and the ARCH §12 glossary (`ARCHITECTURE.md:254`) both list it as the 7th event
with "no other events exist." The DOCS-CHANGE already landed on the branch — never "correct" the surface
back to 6.

---

## Stream A — Session, exercises, demo (Claude Code, Opus 4.8)

**A1 — Drop EX_PUCKER from v1 (Stream-A-only change).** `EX_PUCKER` is baked into `ExerciseId`
(`schema.ts:9`) and `EXERCISE_IDS` (`storage.ts:35`), and `ALL_EXERCISES = Object.keys(exercises)`
(`seed.ts:36`). So: **keep** the `exercises['EX_PUCKER']` entry and the `ExerciseId`/`EXERCISE_IDS`
union (reversibility + the negative test `storage.test.ts:149` and the guard test `metrics.test.ts:135`
both need `EX_PUCKER` to be a valid id) — "assignable" is a **derived filter** (exercises with a
`blendshapePair`), not a deletion. **Do NOT touch** the `VALIDATION_FAILED` guard at `metrics.ts:130`
(Stream C's file, and CLAUDE.md's "loud stop, never a silent fallback"). **Fix `seed.ts`** (`:54` and
`:67`) to build `assignedExercises` and `comfortableMax` from the assignable set, not `ALL_EXERCISES`,
or `assertComfortableMax` (`storage.ts:128,217`) rejects the seed and B3 can't seed history. File a
request to Stream C to (a) update the existing EX_PUCKER note in `MODEL_AND_DATA.md` §7 with the
decision + reversal path and (b) annotate the `metrics.ts` guard as an intentional invariant.
**Test:** assignable set === exercises with a `blendshapePair` (EX_PUCKER excluded; the other three in).

**A2 — Remaining exercises config-driven** (`IMPLEMENTATION.md` Task 12, backend half).
`EX_BROW_RAISE` and `EX_EYE_CLOSURE` each complete DEMO→REPS→REST through `SessionController` from
config alone, **no per-exercise branch in `src/`** (if one is needed, the schema is wrong — fix the
schema). **Test:** mid-session exercise switch resets both engines — `resetExerciseAccumulators`
(`controller.ts:100–117`) already calls `MetricEngine.reset()` + `RepDetector.reset()`; assert no
metric leakage across the switch.

**A3 — Live demo view (the finish-line "live demo" — a *dev* build).** `src/dev/LiveV1Harness.tsx` +
`strings.ts`: large live SI + activation readouts, symmetric/asymmetric state that is **not colour-only**,
legible across a room. Records nothing; reuses the live pipeline; stays behind
`VITE_ENABLE_CAPTURE_HARNESS` and out of prod (`App.tsx:29` gates it on `import.meta.env.DEV &&
VITE_ENABLE_CAPTURE_HARNESS` via a dynamic import → tree-shaken; verification step 2's `grep dist/` holds).
This harness imports `NormalizationLayer`/`MetricEngine`/geometry directly and is **distinct from
product Demo Mode** (A4). Demo arc: neutral (SI null) → symmetric smile (~0.98) → restrained side
(~0.4–0.7) → release.

**A4 — Frontend seam verification (product surface, integrated separately in the frontend plan).**
- `SessionApi` matches API §10 exactly — **7 events incl. `qualityOfferStop {visible}`** (confirmed on
  the branch; do not revert to 6).
- **Demo quick-setup contract** (product Demo Mode, `SafetyGate.isDemoMode()` — NOT the A3 harness).
  Demo `start()` skips baseline load by design (`controller.ts:315–323`), so quick-setup must call
  `NormalizationLayer.setBaseline` **and** `MetricEngine.setBaseline` before the first REPS frame, and
  the baseline **must carry a valid `comfortableMax` for the demo exercise** — `compute()` throws
  `NO_BASELINE` when `comfortableMax[exerciseId]` is missing/≤0 (`metrics.ts:133–138`), which the frame
  loop surfaces as `FACE_LOST`: a demo that appears to run while detecting nothing. Test the demo start
  path asserting the seeded baseline carries `comfortableMax` for the demo exercise.

---

## Stream B — Data, privacy, Phase 8 repairs (GPT-5.6 sol)

**Source (corrected):** `docs/superpowers/plans/2026-07-12-remediation-v1.md` — there is **no**
`REMEDIATION_PLAN_2026-07-12.md` and **no §13**; that plan *defers* Phase 8 to "a separate plan"
(lines 21/184/196). The 8.1–8.5 definitions here are therefore **authoritative** (self-contained), not
a pointer. `TrendsService` lives at `src/data/trends.ts` (Stream B's) — API §12/BACKEND §1.10/DATABASE §4.

**B1 — Document the aggregation rules `TrendsService` actually implements** in `BACKEND.md`, verified
against `trends.ts`:
- **Local-time period boundaries** — **Monday-start ISO weeks and local calendar months**
  (`trends.ts:44–53`, `getFullYear/getMonth/getDate/getDay`), per `ARCHITECTURE.md:233,364`. Timestamps
  are stored UTC but bucketed in local time. **Do not describe these as "UTC."**
- Null exclusion (`trends.ts:75`), one-series-one-`baselineId` scoping (`:71`), excluded end reasons
  `quality_abandoned`/`red_flag_stopped` (`:32`), first-point `aboveNoiseFloor: true` (`:98`), and the
  empty-middle-bucket rule (comparison spans the gap to the nearest non-empty period; `:93–100`).
- The **export boundary**: `ExportService` widens the range in UTC (`export.ts:63–64`) then trends bucket
  in local — document this so it isn't read as a bug.
Re-assert the test that a series uses only the **active baseline's** `noiseFloorSymmetry`
(`trends.ts:100`), never `app_settings`.

**B2 — Adherence honesty (8.3).** `completionRate` is `completed / all sessions in range`
(`trends.ts:113–117`); every `session_record` is user-started (the app prescribes no schedule), so this
matches "defined over user-started sessions." **Document that precisely in API §12** — prefer documenting
over renaming, since the field also appears in the export contract (`API.md:454`) and
`tests/schemas/export.schema.json`, where a rename cascades. Never invent a planned-session schedule.
Audit adherence copy in `strings.ts` for guilt/pressure language (SAFETY §8) and file a request to
Stream A for any wording change (SAFETY copy is A's).

**B3 — Demo read isolation (8.4).** Demo must not *read* sensitive data. Test against a DB seeded with
real history (`src/dev/seed.ts` — request Stream A if the seed needs changes): no sensitive value reaches
UI/events/exports; zero writes; reload exits. Writes are already blocked twice
(`assertDemoWritable`, `storage.ts:192/207/214` + caller-side) — **do not weaken either**. Resolve the
`StorageService ↔ SafetyGate` lazy-reference cycle with the smallest internal boundary that keeps both.

**B4 — Single-profile invariant (code + doc) + deletion (8.5).** **This is a code gap, not just docs.**
`saveProfile` (`storage.ts:194`) is `db.user_profile.put(p)` keyed by `profileId`, so a second profile
with a *different* `profileId` silently creates a **second row** (and `getProfile` with two rows is
ambiguous). Pick **replace or reject**, enforce it **in `saveProfile`** (e.g. clear-then-put for replace,
or reject a differing profile), **and** write the rule into `DATABASE.md` §3 (it belongs with the
StorageService-enforced validation matrix; §4 currently only *describes* "the single local profile").
Test `deleteAllData` (`storage.ts:344–349`, one-transaction clear-all) with open connections and a
simulated mid-transaction failure; keep the typed confirmation and blocking-state recovery path.

---

## Stream C — Evidence, consolidation, ledger (Opus 4.8, Cursor CLI)

**C1 — Pooled intensity analysis (exploratory, NOT gate evidence).** New
`tests/analysis/v1-intensity-analysis.mjs`, reusing the server+Playwright pattern from
`tests/analysis/blendshape-probe.mjs` and the sampler in `tests/analysis/v1-runner.html`. Across all four
trials (run-1 in `tests/fixtures/masters/retired-20260719/`, run-2 current), emit per phase: mean
activation, activation ratio vs that trial's frontal reference, mean SI, and existing B2/B3 values. Output
`tests/analysis/v1_S01_intensity_analysis.json` stamped `"kind":"exploratory-analysis","isGateEvidence":false`.
**If the data contradicts the intensity explanation, say so plainly** — that means the metric is suspect
and C2's wording must change. Do not shape the framing to fit the expected story.

**C2 — Record the V1 disposition (extend; don't recreate).** `MODEL_AND_DATA.md` §7 **already** contains
the candidate register incl. `blendshape-si-v1`, the EX_PUCKER open-decision note, and a predeclared
`PROTOCOL_LIMITED` clause (`MODEL_AND_DATA.md:124–125`) — **extend** it with the final 4-trial disposition
(four trials, one clean, failures track intensity mismatch citing C1, **bars never adjusted**, protocol
retired without a PASS, acceptance moved to external evidence). **Binding subtlety:** §7's predeclared
`PROTOCOL_LIMITED` (`:125`) is defined for **B2 displacement** variance (geometry family). Closing the
*blendshape* candidate on a *smile-intensity/activation* confound is analogous but not the literal clause,
and §7 (`:121–125`) forbids post-hoc rules — so ground the closure in the predeclared clause explicitly or
present it as a **protocol lesson**, never a rule invented after the fact. Update the EX_PUCKER note from
A1's request (don't duplicate). **Ledger (`IMPLEMENTATION.md`):** the branch already rewrote the
Current-State block (dated 2026-07-20) but it still says Task 6 "BLOCKED… remaining step: one fresh 2-trial
recording" — **reconcile that to PROTOCOL_LIMITED, no further recording.** Mark Task 6 → **PROTOCOL_LIMITED**;
Tasks 7–11, **12 (backend half, from A2)**, 14–15 remain **PROVISIONAL**. Fold Stream D's external-evidence
decision (from `stream-d-requests.md`); C owns the ledger line, D owns the finding.

**C3 — Scope geometry to calibration/drift only.** Inventory first: `geometry.ts` already exports **only**
`Vec2`/`AbsoluteFeatures`/`NeutralStats`/`measureAbsolute`/`aggregateNeutral` — no SI/mirroring/`cosθ` code
(that lived in rejected candidates, already gone). **Do not manufacture deletions.** Preserve not just the
two function signatures but the **type exports** — `LiveV1Harness.tsx` (Stream A's A3) imports
`measureAbsolute`, `aggregateNeutral`, and `AbsoluteFeatures`; `normalize.ts` imports `measureAbsolute`;
`CalibrationFlow` (`captureNeutral`/`checkBaselineDrift`) needs both functions at frontal neutral where
geometry's yaw weakness doesn't apply. **Keep** the guard test that unilateral motion must not read as
symmetric (the common-mode-subtraction trap). Docs state which path produces SI (blendshape) vs geometry
(calibration + drift). **Merge-order hazard:** A ships A3 first, importing three C-owned modules; C lands
last and edits them — C's rebase must preserve every symbol A3 shipped against (`measureAbsolute`,
`aggregateNeutral`, `AbsoluteFeatures`, `NormalizationLayer.{normalize,setBaseline,clearBaseline}`,
`MetricEngine.{setBaseline,compute,reset}`).

---

## Stream D — External evidence + v2-gate decision (Grok 4.5, code-free, parallel from day one)

Was Stream C's C4. Writes **no source**, has **no Gate 0 dependency** — starts at plan-commit.

**D1 — External evidence options (research).** Establish, with live links and access terms: MEEI Standard
Set (open via the Sir Charles Bell Society, or application-gated?), YouTube Facial Palsy, Toronto NeuroFace,
and anything on Kaggle/HuggingFace/Zenodo/figshare. Per source: modality, n, labels, licence, exact access
path, realistic time-to-access, and whether it supports a blinded ordering across ≥20 clips spanning flaccid
and synkinetic — or only weaker exploratory evidence. Flag redistribution/consent constraints. Record in a
notes file under `docs/superpowers/reports/external-evidence/`. **`MODEL_AND_DATA.md:133` already asserts
MEEI is "open via the Sir Charles Bell Society"** — verify that; if it proves gated, file a request to
Stream C to correct §7.

**D2 — Decide and publish.** Decide whether `2026-07-20-v2-palsy-dataset-gate.md` runs as written,
substitutes a source, or is deferred; edit that plan doc (D's exclusively). Its predeclared bars are
**frozen** — do not restate or adjust them. Publish the one-line disposition to
`docs/superpowers/coordination/stream-d-requests.md` early enough for C2's ledger entry. **Do not touch
`IMPLEMENTATION.md`.** If usable data lands and time allows, execute the v2-gate plan.

---

## Integration

Merge **A → B → C**; each later stream rebases and re-runs the full gate set. Then one **cross-doc
reconciliation** (Stream C, top-tier reviewer): `check-docs` green; no contradiction between the
`IMPLEMENTATION.md` ledger and any other doc; every `DOCS-CHANGE` line matches shipped code; and — because
`check-docs` can't — spot-check that `thresholds.ts` keys all appear in API §15 and that no doc says "UTC"
for trend periods. D merges last (docs-only). Final whole-branch review over integrated `main`.

**Known items to resolve during integration:** the branch's IMPLEMENTATION Current-State still expects a
fresh recording (C2 reconciles to PROTOCOL_LIMITED); `2026-07-20-backend-completion.md` is superseded; the
v2-gate plan assumes MEEI availability D1 must confirm.

**Fable 5 (Cursor CLI, limited use):** reserve for a genuine cross-stream contract disagreement or a
final-review tie-break — not routine implementation/review.

---

## Verification

**Per task:** its own tests + the P2 gate set (typecheck, vitest, `test:coverage` if metrics-touching,
build, check-docs, build→e2e). Metrics/reps hold 100% branch coverage.

**End-to-end, before declaring the backend done:**
1. `npm run build` then `npx playwright test tests/e2e/no-network.spec.ts` green on the built app.
2. `grep -r "LiveV1Harness\|sessionApiStub" dist/` returns nothing.
3. **C1 regression resolves:** a full real-camera session through `SessionController` reaches
   `sessionEnded` and persists a record whose DB rows match the returned `SessionRecordFull`.
4. **Live demo (dev harness)** on real hardware: `npm run dev` with `VITE_ENABLE_CAPTURE_HARNESS=true` →
   neutral → symmetric smile → one-sided smirk; SI ~0.98 → ~0.4–0.7 and recovers.
5. **Product Demo Mode** quick-setup seeds a baseline with `comfortableMax` for the demo exercise (else
   silent `FACE_LOST`).
6. `IMPLEMENTATION.md` reflects reality: Task 6 PROTOCOL_LIMITED; backend halves (7–12, 14–15) PROVISIONAL;
   **nothing ACCEPTED on evidence that doesn't exist.**

## Definition of done

Backend complete and verified; V1 recorded honestly as PROTOCOL_LIMITED; one measurement path produces SI
(blendshape) and one produces geometry (calibration + drift); Phase 8 repairs closed; the live demo runs on
real hardware; every open decision written into a doc rather than a comment; and the ledger states plainly
what is and isn't validated.

## Out of scope

Screens beyond what the demo needs (`2026-07-20-frontend-integration.md` owns those); V3/V4 battery;
clinical/regulatory review; efficacy claims; model training (this project trains none); further operator
fixture recording (explicitly retired).

---

## Appendix — verification log (against `backend-services-v1` @ `c6e54f0`)

| Finding | Verdict | Evidence |
|---|---|---|
| C1 deadlock | Confirmed | `controller.ts:331` before `:342`; `capture.ts:40`; `calibration.ts:24,61,174` |
| C2 dup + undocumented keys | Confirmed | `thresholds.ts:61–64` vs `API.md:508` |
| I1 stale calibration state | Confirmed (2 of 5 fields) | `calibration.ts:18–22,120–131` |
| I2 capture stall | Confirmed | `calibration.ts:61–76` |
| I3 hardcoded export strings | Confirmed (~12) | `export.ts:98–122` |
| M1 stop-before-start | Confirmed (low) | `controller.ts:356,380`, `storage.ts:138` |
| M3 "UTC vs local" | Re-scoped — docs mandate local, code correct | `ARCHITECTURE.md:233,364`, `trends.ts:44–53`; real edge = `export.ts:63–64` |
| M5 engines pinned | Confirmed but low-impact | `calibration.ts:158–159`, overwritten `controller.ts:334–335` |
| M6 rep-discard emit | Confirmed (doc bug) | `controller.ts:204–221` vs BACKEND §1.6 |
| 7-event surface | Confirmed on branch | `controller.ts:28`, `API.md:31`, `ARCHITECTURE.md:254` |
| B4 single-profile | Code gap (not doc-only) | `storage.ts:194` put-by-PK |
| "no typecheck script" | **Retracted** — false positive from `main` | branch `package.json` has `"typecheck":"tsc -b"` |
| "phantom CLAUDE.md fact 7" | **Retracted** — false positive from `main` | branch `CLAUDE.md` has 7 facts; fact 7 = `tsc` rule |
