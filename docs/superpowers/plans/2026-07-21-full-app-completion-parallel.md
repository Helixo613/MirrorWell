# MirrorWell: Full-App Completion Plan, PARALLEL (3 subagent-driven streams → wired, shippable app)

> **Supersedes** `2026-07-21-full-app-completion.md` (same scope, sequential). **Re-bases**
> `2026-07-20-frontend-integration.md`, still the detailed UI salvage procedure; read it before
> executing. **Extends** `2026-07-20-parallel-completion.md` (backend, complete and merged).
>
> **For agentic workers:** each stream runs the `superpowers:subagent-driven-development` loop
> internally (implementer subagent → independent reviewer subagent → fix rounds → commit, per screen).

## Context: where the project actually is

**Backend: done and merged.** Gate 0 plus Streams A/B/C/D landed on `main` (integration handoff
`docs/superpowers/handoffs/2026-07-21-integration-state.md`). 254 tests, order-randomised
(`sequence: { shuffle: true }`), 100% branch on `metrics.ts`/`reps.ts`, with `build`, `check-docs`,
and the no-network e2e green. Session engine, calibration, storage, trends, export, settings, safety
gate, and the dev live-demo view all exist and work.

**Frontend: exists, but on a branch that forked before any of it.** `origin/sai-shanmukh-progress`
carries a complete UI (9 screens, ~40 components, hooks, context, router) written against
pre-remediation contracts. `frontend-integration` began the salvage and wired camera screens to a
**dev stub**. Neither has been reconciled with the real backend. `src/App.tsx` is still a
placeholder; no screen is reachable in the product; only dev harnesses mount. That is the gap
between "backend complete + demo works" and "an app".

**Release posture (do not drift):** V1 is `PROTOCOL_LIMITED`, V2 is **deferred** (MEEI acquisition
pending; palsynet is exploratory-only and can never produce a PASS). Every backend task stays
**PROVISIONAL**. A working, shippable-quality app is the goal; **clinical validation is not**, and
nothing in this plan may claim otherwise.

## Why three parallel streams (reversing the sequential plan's "one coherent surface" stance)

The sequential plan rejected frontend parallelism because the screens share a foundation, router,
`App.tsx`, `AppStateContext`, shared UI primitives, the config files. That objection is real but pays
**once**. A short blocking **Gate 0 bootstrap** imports the salvage, normalizes it into a canonical
per-screen tree, **pre-registers all nine routes** to placeholder bodies, and freezes that shell.
After Gate 0 the nine screens partition cleanly into three service-affine streams that fill screen
bodies behind already-registered routes and **never touch the frozen shell concurrently**. The
coupling the old plan feared is spent up front; the fan-out that follows is genuinely independent.

**Honest scope of the win.** Gate 0 is an unavoidable serial bootstrap and is the critical path into
the fan-out; it cannot be parallelized. The speed-up comes from running the three screen streams
concurrently after Gate 0, each internally pipelining implement→review with subagents. It is not
"everything at once."

## The salvage rule (unchanged, and the reason this is tractable)

**UI survives; its backend copy dies.** `sai-shanmukh-progress` contains a full parallel
implementation of config/data/metrics/session written against contracts that remediation replaced.
Take screens, components, hooks, context, router, presentation utils, CSS. Discard every duplicated
backend module and re-point imports at `main`. Screens touch the backend **only** through the
documented surface, `SessionController` events, `StorageService`, `TrendsService`, `ExportService`,
`SettingsService`, `SafetyGate`; which barely changed. This is rewiring, not rewrite.

## Contract deltas the old frontend plan predates (binding, carried verbatim)

| Surface | Current truth on `main` | Screen impact |
|---|---|---|
| `SessionController` events | **7**, incl. `qualityOfferStop {visible}`, API §10, ARCH §12 | Wire the offer-stop UI; never "correct" back to 6 |
| Assignable exercises | `assignableExercises` = exercises **with** a `blendshapePair`; `EX_PUCKER` kept in config but **not assignable** | Session/onboarding pick from the derived set, never `Object.keys(exercises)` |
| Demo Mode reads | `getProfile` / `getActiveBaseline` / `getSessions` **throw** in demo; `getSettings` is the documented non-sensitive carve-out | Demo screens must not fetch history; accessibility settings still load |
| Profiles | `saveProfile` **rejects** a second, different `profileId` (`VALIDATION_FAILED`) | Onboarding must not create a second profile; surface the error honestly |
| Trend periods | **Local-time** Monday-start ISO weeks / local calendar months (ARCH §13) | Never label or compute them as UTC |
| `completionRate` | completed ÷ **all** sessions in range (every record is user-started) | No invented schedule, no "missed sessions" copy |
| Dev mounts | `VITE_ENABLE_LIVE_DEMO` swaps `LiveV1Harness` → `LiveDemoView`; harnesses are mutually exclusive (one `<video>`) | Product screens must own the camera alone |
| Test order | Suite is shuffled by default | New UI tests must be order-independent (`vi.resetModules()` + dynamic import for singleton state) |

## Verified platform facts: do NOT "correct" these back

The seven facts in `CLAUDE.md` ("Verified platform facts") are binding here. Most load-bearing for
this plan: **fact 1** (MediaPipe `FaceLandmarkerResult` has NO per-frame confidence field), **fact 2**
(WASM bundled from `public/wasm/`, never CDN), **fact 3** (Chromium fake-camera accepts ONLY `.y4m`
and `.mjpeg`; never `.webm`/`.mp4`), **fact 7** (`npm run typecheck` = `tsc -b`; **never**
`npx tsc --noEmit`, which type-checks the empty solution file and always passes). Plus the hard
**camera rule**: the stream may be open only while `CalibrationScreen` or `SessionScreen` is mounted
never on `HomeScreen` or anywhere else in production.

---

## Gate 0: Foundation bootstrap (BLOCKING, brief; NOT a standing stream)

Owned by **Stream S1's agent** as its first work, before S2 & S3 fork. S2 & S3 fork the moment Gate 0
merges to `main` (forking earlier means rebasing onto a moving, broken base; the exact failure the
backend plan's Gate 0 avoided). Deliberately minimal: it lands a **compiling, route-wired shell**, not
finished screens.

- **G0.1 Reconcile.** Re-run `2026-07-20-frontend-integration.md`'s "Contract delta" + "Source branch
  inventory" against `main` at HEAD; fold in the deltas table above; correct anything stale there
  (keep that plan accurate rather than forking a second copy).
- **G0.2 Delete the SessionApi stub** (`2026-07-20-frontend-integration.md` Task 4). The real
  `SessionController` exists; anything named `sessionApiStub` must not survive; the release check
  greps `dist/` for it. (It is a thing to remove, not a glossary identifier to keep.)
- **G0.3 Dependencies, docs-first.** Amend `ARCHITECTURE.md` §2 with the exact pins the salvaged UI
  needs (`react-router-dom`, `tailwindcss` + `postcss`/`autoprefixer`,
  `@radix-ui/react-{checkbox,label,slot}`, `lucide-react`, `clsx`, `class-variance-authority`,
  `tailwind-merge`, `tailwindcss-animate`); **exact versions, no `^`**, carry a `DOCS-CHANGE` line.
  Reject anything not actually used and any state library (Redux/Zustand forbidden, context + hooks
  only). Tailwind is build-time only: **no web fonts, no CDN, no `@import url(...)`**. `npm ci` +
  postinstall (`copy-wasm` → `verify-model` hash check) must stay green.
- **G0.4 Import salvage, discard backend copies.** Bring over `src/components/`, `src/screens/`,
  `src/hooks/`, `src/context/`, `src/router/`, `src/lib/`, UI-only `src/types/`, `src/index.css`,
  `tailwind.config.js`. Any imported file that imports Dexie, computes a metric, or defines a schema
  dies, `main` owns those. Merge branch strings into `src/config/strings.ts` (append-only, SAFETY §8
  audited).
- **G0.5 Normalize + FREEZE the canonical tree (the enabler for parallelism).** The salvage branch's
  exact tree must be reconciled into the layout the ownership globs below bind to, then **committed
  and frozen**: one directory per screen holding that screen + its colocated components + its tests
  (`src/screens/<screen>/…` for each of the nine canonical screen names), a **shared** primitives dir
  `src/components/ui/**`, shared `src/context/**`, `src/router/**`, `src/lib/**`. **The ownership
  globs bind to this Gate 0 commit**; if a stream's assumed path doesn't exist after Gate 0, Gate 0's
  committed tree wins and the ownership table is amended to match, never the reverse.
- **G0.6 Wire the shell, pre-register ALL nine routes (the concurrency guarantee).** Replace
  `App.tsx`'s placeholder with the `AppStateContext` provider → `BrowserRouter` → route-guards →
  screens, registering **all nine routes** + guard rules (UNATTESTED → `OnboardingScreen`; DEMO → only
  `SessionScreen`/`SummaryScreen`; `CaregiverScreen` requires `caregiverViewEnabled`) pointing at the
  imported (still-rough) screen bodies. Preserve the dev-only mounts and their mutual exclusion
  (product screens own the camera; harnesses stay `DEV`-gated and tree-shaken). Freeze the
  `AppStateContext` provider to the FRONTEND §3 shape; if the provider component needs a name not in
  ARCH §12, amend §12 in the same commit (`DOCS-CHANGE`). **After Gate 0, no screen stream edits
  `App.tsx`, `src/router/**`, `src/context/**`, or `src/components/ui/**`.**
- **G0.7 Compile green + land.** Let `npm run typecheck` (`tsc -b`) drive rewiring: every error is a
  screen reaching for a moved contract; fix by re-pointing at `main`'s modules, never by loosening a
  type (no `as any`, no widened types). Land Gate 0 on `main` with the full gate set green. Screens
  need only **compile and route**; finishing each is its stream's job.

## Per-task workflow INSIDE every stream (what makes each stream "subagent-driven")

Each of the three streams is one owner agent driving the `superpowers:subagent-driven-development`
loop; it does not hand-write screens directly. Per screen (or coherent screen-slice):

1. **Spawn a fresh implementer subagent** with the screen's FRONTEND §2 spec, its `docs/TESTS.md`
   §2–§4 rows, the contract-deltas table above, and the frozen contracts it may import. It works TDD:
   write the failing test(s) → implement the screen body + its in-JSX accessibility (ARIA labels,
   focus management, `aria-live` regions per FRONTEND §4) + its `axe`/component tests → gate set green.
2. **Spawn an independent reviewer subagent** (fresh context) to diff for type escapes, colour-only
   state, inline strings, camera-rule violations, and SAFETY §8 copy; not just a green build.
3. **Fix rounds**, then the owner **commits** (one commit per screen/slice) so a usage cap is a pause,
   not lost work. Reserve the strongest model for the reviewer pass on S1's camera screens.

Each screen owns its own accessibility and its own screen-level e2e/a11y tests (tests follow their
source owner). Only the *built-app, cross-screen* gates are shared (see Reconvergence).

## Ownership: exactly three parallel streams (fork from `main` AFTER Gate 0 merges)

Split by **service affinity**, three screens each, minimizing cross-stream coupling.

| Stream | Screens | Owner / model | Branch | Exclusive write globs (bound to Gate 0's frozen tree) |
|---|---|---|---|---|
| **S1: session & camera** (+ Gate 0) | `CalibrationScreen`, `SessionScreen`, `SummaryScreen` | Claude Code (Opus 4.8) | `frontend-s1-session` | `src/screens/{calibration,session,summary}/**` (incl. `FeedbackRenderer`, rep counter, rest timer, demo quick-setup overlay) + their tests + `strings.{calibration,session,summary}` namespaces |
| **S2: gate, hub & settings** | `OnboardingScreen`, `HomeScreen`, `SettingsScreen` | capable tier | `frontend-s2-shell` | `src/screens/{onboarding,home,settings}/**` + their tests + `strings.{onboarding,home,settings}` |
| **S3: longitudinal & export** | `TrendsScreen`, `CaregiverScreen`, `ExportScreen` | capable tier | `frontend-s3-data` | `src/screens/{trends,caregiver,export}/**` + their tests + `strings.{trends,caregiver,export}` + trends/export presentation utils landing in `src/lib/` |

### Gate 0 frozen-tree binding (committed 2026-07-22: this is the authoritative ownership map)

Gate 0 kept the salvage's component feature-dirs in place (spawn-prompt G0.5: "one dir per
screen (`src/screens/<screen>/…`), shared `src/components/ui/**`") rather than mass-relocating
~40 components. Ownership is therefore by glob on the committed tree. Cross-import measurement
(which screens import each `src/components/<feature>/` dir) gave a clean partition; no feature
component dir is write-shared between two screen streams:

- **S1** writes: `src/screens/{calibration,session,summary}/**`, `src/components/{calibration,camera,session,summary}/**`, `strings.{calibration,session,summary}`.
- **S2** writes: `src/screens/{onboarding,home,settings}/**`, `src/components/{onboarding,forms,controls,settings}/**`, `strings.{onboarding,home,settings}`. (`src/screens/onboarding/` already holds salvage hooks/steps.)
- **S3** writes: `src/screens/{trends,caregiver,export}/**`, `src/components/{trends,export}/**`, `strings.{trends,caregiver,export}`, plus trends/export presentation utils in `src/lib/`.

**Frozen shared (NO stream edits after Gate 0: file a request):** `src/App.tsx`, `src/main.tsx`,
`src/router/**`, `src/context/**`, `src/screens/PlaceholderScreen.tsx`, and the cross-screen
component dirs `src/components/{ui,layout,motion,navigation,feedback,content,home,progress}/**`.
(`components/home/` is frozen despite its name, its members, e.g. `PrimaryActionButton`,
`HomeHeader`, are imported by five screens across all three streams; the *screen* `HomeScreen` is
still S2's.) `src/types/**` and non-owned `src/lib/**` are shared reads.

**Stubbed at Gate 0 (rich salvage at `origin/sai-shanmukh-progress`, rebuild against main):**
`CalibrationScreen`, `SessionScreen` (S1) and `ExportScreen` (S3) are routed `PlaceholderScreen`
bodies; their orchestration hooks (`useSessionScreen`, `useCameraPipeline`, `useExportScreen`,
`useCalibrationFlow`) were deleted because they target a pre-remediation SessionController/
CalibrationFlow/ExportService surface. Their presentational components (`components/{session,
calibration,camera,export}/**`) survived intact and are ready to wire. The other six screens
(Onboarding, Home, Settings, Trends, Caregiver, Summary) carry their full salvage bodies, rewired
to main's contracts and compiling; they need finishing, not rebuilding. Per-stream request logs
live at `docs/superpowers/coordination/frontend-{s1,s2,s3}-requests.md`.

**Affinity rationale.** S1 owns everything on the camera + `SessionController`/`CalibrationFlow` path
(`CalibrationScreen` + `SessionScreen` share the single `CaptureService`/`<video>` element;
`SummaryScreen` renders the `sessionEnded` record and shares the DEMO watermark); the one seam that
must not be split across writers, so it gets Opus and the Gate 0 bootstrap. S2 owns the
`SafetyGate`/attestation + `StorageService` hub + `SettingsService`/deletion path
(`OnboardingScreen` gate → `HomeScreen` hub → `SettingsScreen`/recalibrate). S3 owns the
`TrendsService` + `ExportService` path (charts, adherence, consent gate, download-only export).
Cross-stream navigation (`OnboardingScreen` → demo `SessionScreen`, `SettingsScreen` →
`CalibrationScreen` recalibrate) happens through the **frozen** router; no shared file edit.

**Rules that prevent a merge disaster (same as the backend plan):**
1. **Never edit another stream's file, `App.tsx`, `src/router/**`, `src/context/**`, or
   `src/components/ui/**`.** Append the request to
   `docs/superpowers/coordination/frontend-<stream>-requests.md` (one file per stream = never
   conflicts); the owner (or the integration owner, for the frozen-shared files) applies it.
2. **`src/config/strings.ts` is append-only within your own screen namespace.** All three streams add
   keys; add under your namespace, never reorder another's. `strings.ts` has **no** automated gate
   SAFETY §8 language adherence is a manual review obligation.
3. **Each screen owns its own accessibility and screen-level tests.** ARIA lives in screen JSX, so a
   separate "a11y owner" would break one-writer-per-file. There is no fourth a11y/verification stream.
4. **Docs win over code.** Any contract change carries `DOCS-CHANGE: <doc> §<n>, <what and why>`. The
   nine screen names are already in ARCH §12; a genuinely new identifier amends §12 first (via request
   if not yours).
5. **Every task ends green** on the full gate set; a red merge blocks the streams behind it.

## Execution shape

```
Gate 0 (S1, blocking) ── import + normalize/freeze tree + pre-register all 9 routes + compile green ── land on main
                                                       │
        ┌──────────── S1 continues; S2 / S3 fork from main AFTER Gate 0 merges ────────────┐
        ▼                              ▼                              ▼
   S1 session & camera            S2 gate, hub & settings        S3 longitudinal & export
   Calibration, Session,          Onboarding, Home,              Trends, Caregiver, Export
   Summary  (Opus, crit path)     Settings                       (charts, adherence, export)
        │                              │                              │
   each stream internal loop:  implementer subagent (TDD) → reviewer subagent → fix → commit per screen
        │                              │                              │
        └── merge S1 ──▶ rebase ──▶ merge S2 ──▶ rebase ──▶ merge S3 ──────────────────────┐
                                                                                            ▼
   Reconvergence (single owner, sequential): built-app no-network gate · dist harness grep ·
   full cross-screen keyboard journey (Playwright, fake camera .y4m/.mjpeg only) · SAFETY §8 strings
   sweep · cross-doc reconciliation · then real-hardware matrix + demo hardening (Tasks 17–18 partial)
```

Merge order **S1 → S2 → S3** (later streams rebase and re-run the full gate set). Cross-screen,
built-app verification cannot pass until all screens exist, so it belongs to Reconvergence, not a
standing fourth stream.

## Per-stream acceptance (maps to `docs/IMPLEMENTATION.md` Tasks 9–15)

**S1: session & camera.** `CalibrationScreen`: real `CalibrationFlow`; `qualityScore < 0.7` coaching
retry (never a dead end); camera **released on unmount**. `SessionScreen` + `FeedbackRenderer`: all 7
events incl. `qualityOfferStop`; ease-off = amber tint + tone + Android haptic (**never colour-only**);
rep discard is **silent** (no event exists; do not invent one); frozen-and-labelled bar during any
non-OK state (a moving bar is a critical defect, TESTS.md has a dedicated test). **Demo quick-setup is
not optional polish:** demo `start()` skips baseline load, so the inline overlay MUST call
`NormalizationLayer.setBaseline` **and** `MetricEngine.setBaseline` with a baseline carrying
`comfortableMax` for the demo exercise, or `compute()` throws `NO_BASELINE` → the frame loop reports
`FACE_LOST` (a demo that appears to run while detecting nothing). Demo persists nothing.
`SummaryScreen`: reads the `sessionEnded` record only (no new queries); DB rows match on-screen
numbers exactly; DEMO variant watermarked → `OnboardingScreen`; no cross-session comparisons. Tasks
10–11 and 12 (summary half).

**S2: gate, hub & settings.** `OnboardingScreen`: attestation gate real (continue disabled until all
four checkboxes; `recordAttestation` uncallable otherwise); **`saveProfile` then `recordAttestation`
in that mandatory order** (API §2); second-different-`profileId` rejection surfaced honestly; demo
entry works. `HomeScreen`: **zero camera** (grep the screen tree for `CaptureService`/`getUserMedia`
and fail loudly); date-only `staleDays` recalibration card; no streaks / no "you missed X days"
(SAFETY §8.8). `SettingsScreen`: `textScale` 100–200% survives to 2.0 without clipping;
typed-"DELETE"-confirmation `deleteAllData`; consent toggles; Recalibrate → `CalibrationScreen`;
`noiseFloorSymmetry` lives on `calibration_baseline`, **not** `app_settings`. Tasks 9, 13, and 15
(settings half).

**S3: longitudinal & export.** `TrendsScreen` + `CaregiverScreen`: one series = one baseline;
sub-noise-floor renders "steady" (`aboveNoiseFloor:false`); chart has a text-table toggle for screen
readers; `caregiverViewEnabled` consent gate + redirect; **zero mutating controls** on Caregiver (any
interactive element that changes state is a review-blocking defect). `ExportScreen`: **download-only**
(no share/clipboard); mandatory non-diagnostic notice; enrich the printable HTML trend rows (latest
value per exercise + steady/up/down from `aboveNoiseFloor`, keeping the one-A4-page constraint); the
known under-informative-export follow-up. Tasks 12 (remaining exercises), 14, and 15 (export half).

## Reconvergence (single owner, sequential, after S1/S2/S3 merge)

- **Built-app compliance (Task 16):** no-network Playwright gate green on `dist/`;
  `grep -r "LiveDemoView\|LiveV1Harness\|sessionApiStub" dist/` returns nothing; camera-lifecycle
  proof (no `getUserMedia` on Home/Onboarding/Settings/Trends/Export/Summary routes); full
  cross-screen keyboard journey + axe-core scan per FRONTEND §4 / TESTS.md §4; SAFETY §8 strings sweep
  for guilt/pressure/colour-only framing.
- **Cross-doc reconciliation:** `check-docs` green; every `DOCS-CHANGE` line matches shipped code; no
  doc says "UTC" for trend periods; `thresholds.ts` keys all appear in API §15 (check-docs can't
  validate that).
- **Real hardware + demo hardening (Tasks 17–18 partial):** device matrix per V3: mid-range Windows
  Chromium **and Firefox** (Firefox stays a hard gate), mid-range Android Chrome; glasses on/off, lamp
  vs daylight, 0.5 m vs 1 m; fail-safe rule (a persistently failing cell yields the correct
  `QualityState`, never metrics); five consecutive clean demo runs; one fresh user unaided.
  **Release posture stays PROVISIONAL**; V2 deferred; no efficacy or clinical claim ships.

## Gate set (every task)

`npm run typecheck` (**never** `npx tsc --noEmit`) · `npx vitest run` (shuffled; do not remove
`sequence: { shuffle: true }`) · `npm run test:coverage` if `src/metrics/**` is touched (these streams
should not) · `npm run build` · `node scripts/check-docs.mjs` · `npm run build` →
`npx playwright test`. Any contract change carries `DOCS-CHANGE: <doc> §<n>, <what and why>`.

## Definition of done

Every screen in FRONTEND §2 reachable and wired to the real backend; a full session runs end to end
on real hardware and persists records whose DB rows match the UI; accessibility gates pass; the
no-network gate is green and `dist/` contains no dev harness; the ledger states plainly what is and is
not validated.

## Explicitly out of scope

V2/V3/V4 validation execution (deferred; `2026-07-20-v2-palsy-dataset-gate.md` owns it, bars frozen);
clinical or regulatory review; efficacy claims; model training; further operator fixture recording.

## Known risks

1. **Silent contract loosening** in G0.7 or any stream; an `as any` or widened type to make `tsc`
   pass. The reviewer subagent must diff for type escapes, not just green builds.
2. **The frozen-shell assumption breaks** if a stream needs a route/guard/context change mid-flight
   a coordination point: file it to the integration owner via the request file; do not edit
   `App.tsx`/router/context in a screen stream.
3. **`strings.ts` copy drift**, append-only per namespace prevents structural conflicts; SAFETY §8
   language (guilt/pressure/colour-only framing) still needs a human read.
4. **Camera lifecycle leaks** (S1); every harness re-parents one `<video>`; unmount must release.
5. **Cross-screen gates run too early**; the no-network / journey gates cannot pass before all
   screens exist. They are Reconvergence work; do not block S1/S2/S3 on them or declare them green on
   stubs.
