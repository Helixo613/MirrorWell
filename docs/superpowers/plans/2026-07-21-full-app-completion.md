# MirrorWell: Full-App Completion Plan (backend ✅ → frontend → wired, shippable app)

> **SUPERSEDED (2026-07-21)** by `2026-07-21-full-app-completion-parallel.md`, which re-casts this
> same scope as **three parallel, subagent-driven streams** behind a blocking foundation bootstrap.
> This document is retained for its Context, contract-deltas, and constraint rationale, all carried
> forward verbatim into the successor. Execute from the successor; the sequential ownership section
> below (Phases 0–6, one owner at a time) is the part that has been replaced.

> Supersedes nothing. **Extends** `2026-07-20-parallel-completion.md` (backend, complete) and
> **re-bases** `2026-07-20-frontend-integration.md` (still the detailed UI salvage procedure; its
> Task 4 stub is now obsolete because the real backend exists). Read both before executing.

## Context: where the project actually is

**Backend: done and merged.** Gate 0 plus Streams A/B/C/D all landed on `main`. The suite is 255
tests, order-randomised (`sequence: { shuffle: true }`), 100% branch on `metrics.ts`/`reps.ts`,
with `build`, `check-docs`, and the no-network e2e green. The session engine, calibration, storage,
trends, export, settings, safety gate, and the dev live-demo view all exist and work.

**Frontend: exists, but on a branch that forked before any of it.** `origin/sai-shanmukh-progress`
(8 ahead / **123 behind**, merge-base `6e0007a` = the initial docs commit) carries a complete UI:
9 screens, ~40 components, hooks, context, router. `frontend-integration` (9 ahead / 81 behind)
began the salvage and wired camera screens to a **dev stub**. Neither has been reconciled with the
real backend.

**`src/App.tsx` is still a placeholder.** No screen is reachable in the product; only dev harnesses
mount. That is the gap between "backend complete + demo works" and "an app".

**Release posture (do not drift):** V1 is `PROTOCOL_LIMITED`, V2 is **deferred** (MEEI
acquisition pending; palsynet is exploratory-only and can never produce a PASS). Every backend task
stays **PROVISIONAL**. A working, shippable-quality app is the goal here; **clinical validation is
not**, and nothing in this plan may claim otherwise.

---

## The salvage rule (unchanged, and the reason this is tractable)

**UI survives; its backend copy dies.** `sai-shanmukh-progress` contains a full parallel
implementation of config/data/metrics/session written against contracts that remediation replaced.
Take screens, components, hooks, context, router, presentation utils, CSS. Discard every duplicated
backend module and re-point imports at `main`. Screens touch the backend **only** through the
documented surface, `SessionController` events, `StorageService`, `TrendsService`,
`ExportService`, `SettingsService`, `SafetyGate`; which barely changed. This is rewiring, not
rewrite.

---

## Contract deltas the old frontend plan predates

Its delta table is still accurate (it even anticipated `qualityOfferStop` and the EX_PUCKER
filter). These are **new** since it was written and are binding:

| Surface | Current truth on `main` | Screen impact |
|---|---|---|
| `SessionController` events | **7**, incl. `qualityOfferStop {visible}`, live in code, API §10 and ARCH §12 | Wire the offer-stop UI; never "correct" back to 6 |
| Assignable exercises | `assignableExercises` = exercises **with** a `blendshapePair`; `EX_PUCKER` kept in config but **not assignable** | Session/onboarding pick from the derived set, never `Object.keys(exercises)` |
| Demo Mode reads | `getProfile` / `getActiveBaseline` / `getSessions` **throw** in demo; `getSettings` is the documented non-sensitive carve-out | Demo screens must not fetch history; accessibility settings still load |
| Profiles | `saveProfile` **rejects** a second, different `profileId` (`VALIDATION_FAILED`) | Onboarding must not create a second profile; surface the error honestly |
| Trend periods | **Local-time** Monday-start ISO weeks / local calendar months (ARCH §13) | Never label or compute them as UTC |
| `completionRate` | completed ÷ **all** sessions in range (every record is user-started) | No invented schedule, no "missed sessions" copy |
| Dev mounts | `VITE_ENABLE_LIVE_DEMO` swaps `LiveV1Harness` → `LiveDemoView`; harnesses are mutually exclusive (one `<video>`) | Product screens must own the camera alone |
| Test order | Suite is shuffled by default | New UI tests must be order-independent (`vi.resetModules()` + dynamic import for singleton state) |

---

## Phases

Sequential. Each phase ends green on the full gate set and is merged before the next starts.

### Phase 0: Reconcile and re-derive (blocking, small)

Re-verify the salvage inventory against **current** `main`, not the old plan's snapshot.

- Re-run `2026-07-20-frontend-integration.md`'s "Contract delta" and "Source branch inventory"
  against `main` at HEAD; fold in the deltas table above; correct anything stale in that plan
  (it is the working procedure; keep it accurate rather than forking a second copy).
- **Delete its Task 4 (SessionApi stub) outright.** The stub existed only until the backend landed.
  Screens wire to the real `SessionController`. Anything named `sessionApiStub` must not survive
  the release check greps `dist/` for it.
- Confirm the demo quick-setup contract: demo `start()` skips baseline load, so quick-setup must
  call `NormalizationLayer.setBaseline` **and** `MetricEngine.setBaseline` with a baseline carrying
  `comfortableMax` for the demo exercise, or `compute()` throws `NO_BASELINE` and the frame loop
  reports `FACE_LOST`; a demo that appears to run while detecting nothing.

### Phase 1: Dependencies + docs amendment (blocking, docs-first)

Per the deviation protocol, docs change **before** code.

- Amend `ARCHITECTURE.md` §2 with the exact pins the UI needs (`react-router-dom`, `tailwindcss`
  + `postcss`/`autoprefixer`, `@radix-ui/react-{checkbox,label,slot}`, `lucide-react`, `clsx`,
  `class-variance-authority`, `tailwind-merge`, `tailwindcss-animate`). **Exact versions, no `^`.**
  Carry a `DOCS-CHANGE` line.
- **Reject anything not actually used** by the salvaged UI, and any state library (Redux/Zustand
  remain forbidden, context + hooks only).
- Tailwind is build-time only. **No web fonts, no CDN, no `@import url(...)`**; the no-network gate
  is not negotiable.
- `npm ci` + postinstall (`copy-wasm` → `verify-model` hash check) must stay green.

### Phase 2: Import the UI salvage (no wiring yet)

- Bring over `src/components/`, `src/screens/`, `src/hooks/`, `src/context/`, `src/router/`,
  `src/lib/`, UI-only `src/types/`, `src/index.css`, `tailwind.config.js`.
- **Discard every duplicated backend module** from the branch. If a file imports Dexie, computes a
  metric, or defines a schema, it dies; `main` owns those.
- Merge branch strings into `src/config/strings.ts` (append-only, audited per SAFETY §8). Every
  user-facing string lives there; **no inline copy**, and note nothing automated enforces this,
  so it is a review obligation.
- Expect this phase to be red on typecheck. That is fine; Phase 3 is compile-driven.

### Phase 3: Compile-driven rewiring to the real backend

Let `npm run typecheck` (`tsc -b`) drive it: every error is a screen reaching for a contract that
moved. Fix by re-pointing at `main`'s modules, never by loosening a type.

- Screens consume the 7-event surface, `StorageService`, `TrendsService`, `ExportService`,
  `SettingsService`, `SafetyGate`; nothing deeper. No screen imports `NormalizedFrame`,
  `NeutralStats`, or geometry.
- Replace `src/App.tsx`'s placeholder with the real router, **preserving the dev-only mounts and
  their mutual exclusion** (product screens own the camera; harnesses stay dev-gated and
  tree-shaken).
- **Camera rule (hard):** the stream may be open only while `CalibrationScreen` or `SessionScreen`
  is mounted. Never on `HomeScreen` or anywhere else.

### Phase 4: Screen-by-screen acceptance (maps to IMPLEMENTATION Tasks 9–15)

In dependency order; each screen green before the next.

| Order | Screen(s) | Task | Key acceptance |
|---|---|---|---|
| 1 | `OnboardingScreen` + attestation + Demo entry | 9 | Attestation gate real; second-profile rejection surfaced; demo entry works |
| 2 | `CalibrationScreen` | 10 | Real `CalibrationFlow`; `qualityScore < 0.7` coaching retry; camera released on unmount |
| 3 | `SessionScreen` + `FeedbackRenderer` | 11 | All 7 events incl. offer-stop; ease-off cue; rep discard silent (no event exists); demo persists nothing |
| 4 | `SummaryScreen` + remaining exercises | 12 | DB rows match on-screen numbers exactly; assignable set only |
| 5 | `HomeScreen` + route completion | 13 | **No camera**; date-only `staleDays` recalibration card; guards complete |
| 6 | `TrendsScreen` + `CaregiverScreen` | 14 | One series = one baseline; sub-noise-floor renders "steady"; `caregiverViewEnabled` consent gate |
| 7 | `ExportScreen` + `SettingsScreen` | 15 | Download-only (no share/clipboard); non-diagnostic notice mandatory; typed-confirmation delete |

Each screen carries its `docs/TESTS.md` §2–§4 rows. A feature without its tests is not done.

### Phase 5: Accessibility + full E2E (Task 16)

- WCAG 2.1 AA per FRONTEND §4: keyboard paths, focus management, contrast, `textScale` 1.0–2.0,
  reduced-motion. **Never colour-only** for state.
- Playwright journeys against a fake camera (`.y4m`/`.mjpeg` only; never `.webm`/`.mp4`), with
  DB-level assertions.
- No-network gate green on the built app; `grep -r "LiveDemoView\|LiveV1Harness\|sessionApiStub" dist/`
  returns nothing.

### Phase 6: Real-hardware gates + demo hardening (Tasks 17–18 partial)

- Device matrix per V3: mid-range Windows laptop (Chromium **and Firefox**, Firefox stays a hard
  gate), mid-range Android Chrome; glasses on/off, lamp vs daylight, 0.5 m vs 1 m.
- Performance and the fail-safe rule: a persistently failing cell must produce the correct
  `QualityState` (honest refusal), never metrics.
- Five consecutive clean demo runs; one fresh user unaided.
- **Release posture stays PROVISIONAL.** V2 is deferred; no efficacy or clinical claim ships.

---

## Ownership & agents

Frontend is one coherent surface, parallel file-partitioning buys little and costs coordination.
**Run phases sequentially, one owner at a time.** Reserve the strongest model for Phase 3
(compile-driven rewiring, where a wrong "fix" silently loosens a contract) and Phase 4 screens 1–3
(attestation, camera lifecycle, session events). Phases 1–2 and 5 are mechanical enough for a
cheaper tier.

Per task: fresh implementer subagent → independent reviewer → fix rounds → commit. Commit after
every approved task so a usage cap is a pause, not lost work.

## Gate set (every task)

`npm run typecheck` (**never** `npx tsc --noEmit`) · `npx vitest run` (shuffled; do not remove
`sequence: { shuffle: true }`) · `npm run test:coverage` if `src/metrics/**` is touched (100% branch)
· `npm run build` · `node scripts/check-docs.mjs` · `npm run build` → `npx playwright test`.
Any contract change carries `DOCS-CHANGE: <doc> §<n>, <what and why>`.

## Definition of done

Every screen in FRONTEND §2 reachable and wired to the real backend; a full session runs end to end
on real hardware and persists records whose DB rows match the UI; accessibility gates pass; the
no-network gate is green and `dist/` contains no dev harness; the ledger states plainly what is and
is not validated.

## Explicitly out of scope

V2/V3/V4 validation execution (deferred; `2026-07-20-v2-palsy-dataset-gate.md` owns it, bars frozen);
clinical or regulatory review; efficacy claims; model training; further operator fixture recording.

## Known risks

1. **Silent contract loosening in Phase 3**; a `as any` or widened type to make `tsc` pass. Reviewer
   must diff for type escapes, not just green builds.
2. **Dependency creep**; the branch carries more than the UI needs. Phase 1 admits only what is used.
3. **Camera lifecycle leaks**; every harness re-parents one `<video>`. Unmount must release.
4. **Copy drift**, SAFETY §8 language rules have no automated gate; adherence/summary copy needs a
   human read for guilt/pressure framing.
