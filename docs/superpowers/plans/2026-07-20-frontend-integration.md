# Frontend Integration Implementation Plan

> **Gate 0 reconciliation (2026-07-22, `frontend-s1-session`).** This plan is the detailed salvage
> procedure; `2026-07-21-full-app-completion-parallel.md` is the plan of record and **supersedes
> Task 4** (the SessionApi stub). Reconciled deltas actually applied at Gate 0:
> - **Task 4 (stub) deleted, not built** — the real `SessionController` exists on `main`; nothing
>   named `sessionApiStub` is present anywhere (verified: docs-only references).
> - **Deps (Task 0) landed** with exact pins **plus** `tailwindcss-animate 1.0.7` (used by
>   `tailwind.config.js`, which the original Task 0 list omitted). Recorded in ARCH §2.
> - **`@/` alias** added to `tsconfig.app.json`, `tsconfig.test.json`, and `vite.config.ts`
>   (Task 1 Step 4) — note the root `tsconfig.json` is solution-style, so the alias must live in
>   `tsconfig.app.json`, not the root (verified fact 7).
> - **Verification command:** use `npm run typecheck` (`tsc -b`), **never** `npx tsc --noEmit`
>   (Task 0/3 said the latter; verified fact 7 says it type-checks nothing here).
> - Screens with a deep pre-remediation-API mismatch (`SessionScreen`, `CalibrationScreen`,
>   `ExportScreen`) ship as routed placeholders at Gate 0; their streams rebuild them.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the screens built on `origin/sai-shanmukh-progress` onto current `main` so they run against the real, validated backend contracts — without re-introducing the rejected pre-remediation contracts that branch was written against.

**Architecture:** `sai-shanmukh-progress` forked from the initial docs-only commit and carries a complete parallel implementation of config/data/metrics/session written against contracts that remediation has since replaced. The salvage rule is: **UI survives, its backend copy dies.** Screens, components, hooks, context, router, and presentation utils are imported onto a fresh branch from `main`; every duplicate of a backend module is discarded and imports are re-pointed at `main`'s modules. Screens talk to the backend only through the documented frontend surface (`MetricSample`, `RepEvent`, `QualityState`, `SessionController` events, `StorageService`) — that surface barely changed, which is why this is a rewiring job, not a rewrite.

**Tech Stack:** Existing main stack (React 18.3.1, TS 5.9.3, Dexie 4.4.4, @mediapipe/tasks-vision 0.10.35, Vite 5.4.21 + vite-plugin-pwa, Vitest, Playwright) + the UI dependencies the branch introduced (Task 0 pins them exactly and amends the docs).

## Global Constraints (binding on every task)

- Docs in `docs/` win over code. Read `docs/FRONTEND.md`, `docs/ARCHITECTURE.md` §12–§13, `docs/API.md` §10–§17, `docs/SAFETY_AND_COMPLIANCE.md` before starting.
- **No network calls, ever.** No CDN scripts, no web fonts, no telemetry. CI no-network gate must stay green. Tailwind is build-time only and is fine; any `@import url(...)` or `<link href="http...">` is a defect.
- **Camera only while `CalibrationScreen` or `SessionScreen` is mounted** (plus the pre-existing dev-only harness exception in `src/dev/`). `HomeScreen` must never touch `CaptureService`.
- **Every user-facing string in `src/config/strings.ts`; every tunable in `src/config/thresholds.ts`.** The branch's screen strings must be merged INTO main's `strings.ts`, never shipped as a second strings module.
- **No identifier not in `docs/ARCHITECTURE.md` §12.** New UI-only identifiers (component names, hook names) that the glossary already lists (screen names are all listed) are fine; anything genuinely new goes into the glossary in the same commit with a `DOCS-CHANGE:` line.
- **Storage through `StorageService` only.** No screen imports Dexie or touches IndexedDB.
- **Never import sensing/metrics internals into screens.** Screens may import types `MetricSample`, `RepEvent`, `QualityState`, `SessionRecordFull`, `TrendSeries`, `Adherence`, `AppStateContext` and the `strings`/`thresholds`/`exercises` config objects. Screens must NOT import `NormalizedFrame`, `ApprovedFrame`, `LandmarkFrame`, `measureAbsolute`, or anything from `src/sensing/` / `src/metrics/` — those are backend-internal and their shapes changed during remediation.
- Commit per task. Any commit that touches a doc contract carries a `DOCS-CHANGE: <doc> §<n> — <what and why>` line.
- Backend modules (`src/sensing/`, `src/metrics/`, `src/data/`, `src/config/thresholds.ts`, `src/config/exercises.ts`, `scripts/`, `tests/unit/` for those modules) are owned by the backend track. **Do not modify them.** If a screen seems to need a backend change, stop and report the conflict instead of patching backend code.

## Contract delta — old branch vs current main (memorize before rewiring)

| Surface | Branch (old) | Main (current, canonical) | Screen impact |
|---|---|---|---|
| `MetricSample` | `{symmetryIndex: number\|null; effortIndex: number; timestampMs}` | **unchanged** | none |
| `QualityState` | 6 states | **unchanged** | none |
| `SessionController` events | `stateChanged, metricUpdate, repCompleted, easeOff, qualityUpdate, qualityOfferStop, sessionEnded` | same names per `docs/API.md` §10 (backend will implement) | none — keep listeners |
| `NormalizedFrame` | scalar `{left,right}` per region | vector `{left:{u,v}, right:{u,v}}` + `blendshapes` | screens must not import it at all |
| `NeutralStats` | scalar per region | vector per region (ARCH §13) | screens must not import it |
| `comfortableMax` | IOD displacement units | **0..1 blendshape activation units** | any copy/formatting that displays it changes meaning; effort is `act/comfortableMax`, still 0..~1+ ratio for bars |
| `noiseFloorSymmetry` | on `app_settings` | on `calibration_baseline` (+ new `noiseFloorDisplacement`) | Settings screen must not read/write it from app_settings |
| `RepEvent.easeOffTriggered` | boolean | boolean on event surface; `0\|1` only inside stored records | none if screens read events, not raw DB rows |
| SI source | geometry displacement | blendshape pair per exercise (`exercises[id].blendshapePair`) | `EX_PUCKER` has **no** pair — session UI must not offer EX_PUCKER (filter `exercises` entries by `blendshapePair` presence). Open decision, do not invent a mapping. |
| `QualityMonitor.evaluate` | returns state string | discriminated `QualityResult` | backend-internal; screens only see `qualityUpdate` events |

## Source branch inventory (what to take, what to kill)

From `origin/sai-shanmukh-progress`:

**TAKE (UI salvage):** `src/components/`, `src/screens/`, `src/hooks/`, `src/context/`, `src/router/`, `src/lib/`, `src/types/` (UI-only types — see Task 2 triage), `src/index.css`, `tailwind.config.js`, `src/main.tsx` (as reference), `tests/schemas/export.schema.json`.

**KILL (parallel backend — never lands on the branch):** their `src/config/`, `src/data/`, `src/metrics/`, `src/session/`, `src/types/sensing.ts`, and their versions of `src/App.tsx`, `vite.config.ts`, `tsconfig*.json`, `package.json`, `index.html` (main's versions win; merge only the minimal additions per task below).

---

### Task 0: Branch + dependency pinning + docs amendment

**Files:**
- Create: branch `frontend-integration` from `main`
- Modify: `package.json`, `docs/ARCHITECTURE.md` §2 (dependency table)

**Interfaces:** Produces the installable toolchain every later task compiles against.

- [ ] **Step 1:** `git checkout -b frontend-integration main`
- [ ] **Step 2:** Add exactly these dependencies (exact pins, no `^`), taken from the branch but normalized to main's policy:

```json
"dependencies" additions:
  "@radix-ui/react-checkbox": "1.3.2",
  "@radix-ui/react-label": "2.1.7",
  "@radix-ui/react-slot": "1.2.3",
  "class-variance-authority": "0.7.1",
  "clsx": "2.1.1",
  "lucide-react": "0.525.0",
  "react-router-dom": "6.30.1",
  "tailwind-merge": "3.3.1"
"devDependencies" additions:
  "tailwindcss": "3.4.17",
  "autoprefixer": "10.4.21",
  "postcss": "8.5.6"
```

Keep main's pinned `@mediapipe/tasks-vision 0.10.35` and `dexie 4.4.4` (the branch's older `^0.10.21`/`^4.0.11` must NOT come across).
- [ ] **Step 3:** Amend `docs/ARCHITECTURE.md` §2 table with one row per new dependency, purpose column filled ("UI primitives (offline, no network at runtime)" / "routing per FRONTEND.md route guards" / "build-time styling"). All of these run fully offline; note that in the row.
- [ ] **Step 4:** `npm install` → lockfile updates. Run `npx tsc --noEmit` and `npx vitest run` — both must stay green (nothing imports the new deps yet).
- [ ] **Step 5:** Commit: `build: add pinned UI dependencies for frontend integration` with `DOCS-CHANGE: ARCHITECTURE.md §2 — UI dependency rows (router, radix, tailwind toolchain; all offline)`.

### Task 1: Import the UI salvage

**Files:**
- Create (from branch): `src/components/**`, `src/screens/**`, `src/hooks/**`, `src/context/**`, `src/router/**`, `src/lib/**`, `src/index.css`, `tailwind.config.js`, `postcss.config.js` (if present on branch), `tests/schemas/export.schema.json`
- Do NOT import: `src/config/**`, `src/data/**`, `src/metrics/**`, `src/session/**`, `src/App.tsx`, `src/main.tsx`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `package.json`

- [ ] **Step 1:** Import UI trees:

```bash
git checkout origin/sai-shanmukh-progress -- src/components src/screens src/hooks src/context src/router src/lib src/index.css tailwind.config.js tests/schemas
git checkout origin/sai-shanmukh-progress -- postcss.config.js 2>/dev/null || true
```

- [ ] **Step 2:** Import their `src/types/` then immediately delete `src/types/sensing.ts` (canonical types live in backend modules now). Keep the rest for Task 2 triage:

```bash
git checkout origin/sai-shanmukh-progress -- src/types
git rm -f src/types/sensing.ts
```

- [ ] **Step 3:** Verify no external URLs smuggled in:

```bash
grep -rnE "https?://" src/components src/screens src/hooks src/context src/router src/lib src/index.css tailwind.config.js | grep -vE "^\s*//|\* |spec|w3\.org" || echo CLEAN
```

Any runtime fetchable URL (fonts, images, scripts) is a defect — remove it, use local assets.
- [ ] **Step 4:** Add the `@/` path alias both places main lacks it: `vite.config.ts` (`resolve: { alias: { '@': '/src' } }` merged into the existing config — do not remove the PWA plugin) and `tsconfig.json`'s compilerOptions (`"baseUrl": ".", "paths": { "@/*": ["src/*"] }`). Copy the exact working values from the branch's configs, but merge them into main's files by hand — never overwrite main's configs wholesale.
- [ ] **Step 5:** Commit (will not compile yet — that's expected and fine, the branch is not main): `feat: import screen/UI layer from sai-shanmukh-progress (UI only, no parallel backend)`.

### Task 2: Types triage + strings merge

**Files:**
- Modify: `src/types/*` (triage), `src/config/strings.ts` (merge)
- Reference: branch's `src/config/strings.ts` via `git show origin/sai-shanmukh-progress:src/config/strings.ts`

**Interfaces:** Produces the single `strings` object all screens import from `@/config/strings` = `src/config/strings.ts` (main's file, now a superset).

- [ ] **Step 1:** For each remaining file in `src/types/` decide: UI-only (keep — e.g. `settingsScreen.ts`, `summary.ts`, `trends.ts` display types) vs backend-shape duplicate (delete and re-import from the canonical module: schema types from `src/data/schema.ts`, exercise config from `src/config/exercises.ts`). Rule of thumb: if `docs/ARCHITECTURE.md` §13 defines it, the §13-conformant version in backend code is canonical and the `src/types/` copy dies.
- [ ] **Step 2:** Merge the branch's screen strings into main's `src/config/strings.ts`: add their screen sections (`onboarding`, `home`, `session`, `summary`, `trends`, `export`, `settings`, `caregiver`, …) alongside main's existing harness/debug strings. Where both define a key, main wins. Delete nothing that main's harness uses.
- [ ] **Step 3:** Check safety-critical copy against `docs/SAFETY_AND_COMPLIANCE.md` §8 language rules and the "research prototype; regulatory status not determined; not cleared or approved by any regulator" wording — the branch predates that wording fix; update any stale "not a medical device" strings to the current canonical phrasing.
- [ ] **Step 4:** Commit: `feat: merge screen strings into canonical strings.ts; triage UI types`.

### Task 3: Compile-driven rewiring

**Files:**
- Modify: imports across `src/components/**`, `src/screens/**`, `src/hooks/**`, `src/context/**`, `src/lib/**`

- [ ] **Step 1:** `npx tsc --noEmit` and work the error list top-down. Expected error classes and their fixes:
  - `Cannot find module '@/types/sensing'` → import `MetricSample`, `RepEvent`, `QualityState` from their canonical homes (`src/metrics/metrics.ts` / `src/metrics/reps.ts` / `src/sensing/quality.ts` — types only, `import type`).
  - `Cannot find module '@/session/controller'` → replace with the Task 4 stub import (`@/dev/sessionApiStub`) — screens keep their event-listener code untouched.
  - `Cannot find module '@/data/…'` → point at main's `src/data/storage.ts` / `src/data/schema.ts`. Their `src/data/export.ts`, `src/data/trends.ts`, `src/data/settings.ts` logic: if pure presentation/aggregation over `SessionRecordFull[]` fetched via `StorageService`, move the file into `src/lib/` and keep it; if it opens Dexie directly, rewrite the data access to `StorageService` calls (read-only) and keep the aggregation math.
  - Type mismatches on `comfortableMax`/baseline fields → these screens are Calibration/Session; leave numeric semantics to the backend and only render what events/records give them.
- [ ] **Step 2:** Do NOT modify backend files to silence an error — report instead (Global Constraints).
- [ ] **Step 3:** `npx tsc --noEmit` green. Commit: `refactor: rewire screen imports to canonical backend modules`.

### Task 4: Session API stub (dev-only seam until backend Tasks 9+ land)

**Files:**
- Create: `src/dev/sessionApiStub.ts`
- Test: `tests/unit/session-api-stub.test.ts`

**Interfaces:**
- Produces: `createSessionApiStub(): SessionApi` where `SessionApi` is exactly the surface `docs/API.md` §10–§11 documents — `start(exerciseId)`, `stop(reason): Promise<SessionRecordFull>`, `on(event, cb)`/`off(event, cb)` for events `stateChanged | metricUpdate | repCompleted | easeOff | qualityUpdate | qualityOfferStop | sessionEnded`, and `captureNeutral(): Promise<NeutralCaptureResult>` on the calibration side.
- Consumed by: `SessionScreen`/`CalibrationScreen` wiring (Task 5) strictly behind `import.meta.env.VITE_USE_SESSION_STUB === 'true'`.

- [ ] **Step 1:** Write failing test: stub emits a deterministic scripted sequence when started (`stateChanged(DEMO)` → `metricUpdate` samples with `symmetryIndex` ramping 0.95→0.6→0.95, one `repCompleted`, `easeOff` toggling) driven by fake timers, and `stop()` resolves a `SessionRecordFull`-shaped record. Run: `npx vitest run tests/unit/session-api-stub.test.ts` → FAIL (module missing).
- [ ] **Step 2:** Implement the stub. Copy event/type names from `docs/API.md` §10 verbatim — do not invent names. No camera, no timers left running after `stop()`.
- [ ] **Step 3:** Test green. The real backend `SessionController` will replace the stub behind the same `SessionApi` surface; the env flag defaults OFF so prod builds exclude stub usage.
- [ ] **Step 4:** Commit: `feat: dev-only SessionApi stub matching API.md §10/§11 surface`.

### Task 5: Screen-by-screen acceptance (work in this order)

**Files:** `src/App.tsx` (merge), then each screen.

- [ ] **Step 1: App.tsx merge.** Take main's current `src/App.tsx` as the base (it carries the env-gated dev harness mounts — they must survive). Add the branch's router/provider structure around it: `AppStateProvider` → `BrowserRouter` → route guards → screens. Harness routes remain reachable only via their existing env flags. Ensure `src/main.tsx` imports `./index.css` (tailwind entry) — add the single import line to main's existing `main.tsx`, don't overwrite it.
- [ ] **Step 2: Static screens first (no backend dependency):** Onboarding (attestation via `StorageService` app_settings, gate per SAFETY §2), Home (reads via `StorageService` ONLY, zero camera imports — grep the screen tree for `CaptureService`/`getUserMedia` and fail loudly if found), Settings, Summary (last `SessionRecordFull` via `StorageService`), Export (their export/validation logic against `tests/schemas/export.schema.json`), Trends (aggregation from `SessionRecordFull[]`; if main lacks a trends module the branch's aggregation lives in `src/lib/` per Task 3).
- [ ] **Step 3: Camera screens behind the stub:** wire `SessionScreen` + `CalibrationScreen` to `SessionApi` (stub when `VITE_USE_SESSION_STUB=true`). Session flow must filter selectable exercises to those with `blendshapePair` (EX_PUCKER hidden — cite MODEL_AND_DATA §7 open decision in a comment).
- [ ] **Step 4:** For each screen, after wiring: `npx tsc --noEmit` green, `npx vitest run` green, screen renders in `npm run dev` without console errors. One commit per screen or coherent screen group: `feat: wire <Screen> to canonical contracts`.

### Task 6: Compliance gates (nothing ships without these)

- [ ] **Step 1:** Strings/thresholds sweep: `grep -rn` over `src/components src/screens src/hooks src/lib` for quoted user-facing literals and numeric tunables outside config — fix all hits.
- [ ] **Step 2:** `npm run build` green; built bundle contains no harness/stub code when env flags are off (`grep -r "sessionApiStub\|LiveV1Harness" dist/ || echo CLEAN`).
- [ ] **Step 3:** Playwright no-network gate green on the built app (existing e2e test). Axe a11y scan on each reachable screen per `docs/TESTS.md` §4.
- [ ] **Step 4:** Camera lifecycle proof: e2e or component test asserting no `getUserMedia` call occurs on Home/Onboarding/Settings/Trends/Export routes.
- [ ] **Step 5:** `node scripts/check-docs.mjs` green. Commit: `test: frontend compliance gates (no-network, a11y, camera lifecycle, strings)`.

### Task 7: Handoff report

- [ ] Write `docs/superpowers/plans/2026-07-20-frontend-integration.md` checkboxes as done; summarize in the PR/commit body: what was salvaged, what was killed, open items (stub swap when backend `SessionController` lands; EX_PUCKER pending decision; trends/backend aggregation ownership). Do not merge to `main` — leave the branch for review.

## Demo-mode quick-setup contract (binding on the Session/Calibration wiring)

The real `SessionController.start()` skips `getActiveBaseline`/`checkBaselineDrift`/`setBaseline` entirely in demo mode (demo has no persisted baseline by design — `StorageService` refuses demo writes). **The demo quick-setup flow MUST call `NormalizationLayer.setBaseline(inMemoryBaseline)` and `MetricEngine.setBaseline(inMemoryBaseline)` before the first REPS frame.** If it doesn't, `MetricEngine.compute` throws `NO_BASELINE` inside the frame loop, which the loop's try/catch reports as `FACE_LOST` — demo appears to run while detecting nothing. When wiring `SessionScreen` demo entry (stub or real), the quick-calibration step is not optional polish; it is the thing that makes demo work at all. Add a test asserting demo start without quick-setup surfaces an error state rather than a silent dead session.

## Known follow-up: printable export is under-informative

`ExportService.generateSummary` is implemented and approved, but its HTML blob's trend table currently renders only `exerciseId`, `granularity`, and the **number** of points — no `meanSymmetryIndex` values, no `aboveNoiseFloor` direction. A point count carries no clinical signal, and ARCHITECTURE §11's "a clinician seeing it cold isn't misled" presumes they can see something about the trend. When building `ExportScreen` / the printable layout, enrich those rows (e.g. latest value per exercise plus steady/up/down derived from `aboveNoiseFloor`) while keeping the one-A4-page constraint and the mandatory non-diagnostic header. The JSON blob is complete — this is a presentation gap only.

## Backend handshake (owned by the backend track, NOT this plan)

The backend track will deliver, behind the same `SessionApi` surface the stub implements: real `SessionController` (session state machine, event emitter, session assembly with `easeOffTriggered` `0|1` conversion), `CalibrationFlow` (`captureNeutral`, comfortable-max capture in activation units, noise-floor self-test), and `SafetyGate` enforcement. When those land, the only frontend change is deleting the stub import path. Anything in this plan that seems to require touching `src/sensing/`, `src/metrics/`, `src/data/`, or `scripts/` is out of scope — stop and report.
