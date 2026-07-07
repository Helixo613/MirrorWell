# MirrorWell

**A therapeutic mirror for facial palsy retraining — the only exercise coach whose main cue is "ease off."**

> **For AI coding agents:** read this file first, then `ARCHITECTURE.md` (canonical identifiers live there, §12). Never invent a component, table, field, event, or error code — if it isn't in the ARCHITECTURE §12 glossary, it doesn't exist. Never add a network call anywhere in this codebase; CI fails the build if one appears.

## What it is

MirrorWell is a camera-based companion app for adults recovering from facial palsy (Bell's palsy, post-surgical facial-nerve injury, facial trauma) who are doing a **clinician-assigned** home program of facial retraining exercises. It shows facial symmetry in real time while the user performs their assigned exercises, paces each movement, and — its signature mechanic — cues the user to *reduce* effort when they push too hard, because over-effort can reinforce synkinesis (unwanted co-movements, e.g., the eye clamping shut during a smile). Trusted caregivers get a read-only progress view on the patient's device; therapists get a patient-controlled export file to review at appointments.

## How it works at a glance

1. **Calibrate once:** capture a *neutral baseline* (relaxed face) and a *comfortable max* per assigned exercise.
2. **Guided session:** a demo shows the movement; a guide arc paces it; a live two-sided **symmetry bar** compares left vs. right movement against the user's own baseline; an amber **"ease off"** cue fires when effort exceeds the calibrated cap.
3. **Honest trends:** only derived numbers are stored (never images), locally; trends display only above a per-device measured noise floor.

All sensing runs **on-device** via a pretrained face-landmark model. There is **no server, no account, and no network call** — by design. "Backend" in these docs means the local service layer.

## Disclaimer (short form)

MirrorWell is an educational exercise-support tool. It does **not** diagnose, assess, grade, treat, or predict any medical condition and is not a certified medical device. It supports exercises a clinician already assigned; it never prescribes. Full intended-use, screening, and red-flag rules: `SAFETY_AND_COMPLIANCE.md`. **New or sudden facial droop is a medical emergency — seek immediate care.**

## Established practice

Facial **neuromuscular retraining (NMR) / mime therapy** for peripheral facial paresis (mime therapy trials, Beurskens & Heymans; NMR principles, Diels; Cochrane review, Teixeira et al.), using **Sunnybrook Facial Grading System** terminology for regions/movements — vocabulary only, never auto-scored. The 30–50% effort-cap target is a design parameter — **needs verification** against published protocol descriptions.

## Canonical tech stack (summary — authoritative table in ARCHITECTURE.md §2)

| Layer | Choice | Why (one line) |
|---|---|---|
| Language / UI | TypeScript 5.x + React 18.x | Typed cross-module contracts; free; agent-friendly. |
| Build / PWA | Vite 5.x + `vite-plugin-pwa` (version **needs verification**) | Offline-first; installable on Chromium desktop + Android Chrome; Firefox desktop runs as an offline-capable tab (no PWA install) but remains a hard test gate. |
| Face sensing | `@mediapipe/tasks-vision` FaceLandmarker 0.10.x (**needs verification**) | Pretrained 478-landmark model + head pose, on-device WASM/WebGPU. |
| Storage | Dexie 4.x over IndexedDB | Typed local persistence for numeric metrics only. |
| Charts | Recharts 2.x (**needs verification**) | Declarative trends chart. |
| Tests | Vitest + Playwright 1.x + `fake-indexeddb` + `@axe-core/playwright` (versions **needs verification**) | Unit metric math; deterministic E2E via fake camera; a11y scans. |
| Server | **None — deliberately** | Health data never leaves the device; clinician review via export files. |

**Version pinning rule:** Task 1 of `IMPLEMENTATION.md` resolves every "needs verification" version to latest stable and records it in ARCHITECTURE §2; the pinned table is thereafter canonical.

## Non-goals (bounded scope is what makes this finishable)

- No diagnosis, grading, or prognosis — including no automated Sunnybrook or House-Brackmann scores.
- No exercise prescription — users enable only clinician-assigned exercises.
- No synkinesis *detection* claims.
- No accounts, cloud, sync, clinician portal, telemetry, or analytics.
- No custom ML training — pretrained landmarks + deterministic geometry only.
- No gamification (points/streaks); the trend line is the motivation.
- No users under 18 (see SAFETY_AND_COMPLIANCE.md §9).
- No acute-phase guidance — for users whose clinician has started retraining.
- English-only in this version (single strings module; localization is future work, not scaffolded).
- No Apple platforms — Windows (Chromium/Firefox) and Android (Chrome) only.
- No remote caregiver access — `CaregiverScreen` is on-device only; remote viewing would require a server and is deliberately excluded.
- Dosing (reps/sets/rest) is fixed config in v1 — not user-editable (designed so a future settings override needs no code-path change).

## Documentation index

| Doc | Covers | Primary audience |
|---|---|---|
| `ARCHITECTURE.md` | System structure, components, calibration, data flows, ML integration, config, non-functional targets, **canonical glossary (§12)** | Everyone — read second |
| `DATABASE.md` | Ready-to-run Dexie schema, per-table ownership/retention, storage split, seed data, migrations | Backend track |
| `API.md` | Every internal module contract at HTTP-API rigor: signatures, JSON examples, errors, gate matrix | Frontend + ML tracks (their build contract) |
| `BACKEND.md` | Service internals, call graph, non-negotiable rules, logging/error conventions, running alone | Backend track |
| `FRONTEND.md` | Every screen with states and navigation, global state shape, accessibility per screen, real-time feedback UX | Frontend track |
| `MODEL_AND_DATA.md` | Model contracts, approach tradeoffs, datasets + licenses, fairness release blocker, measurement bars, validation plan | ML track |
| `IMPLEMENTATION.md` | Current State + numbered dependency-ordered tasks, each with a runnable Test | All tracks — the build script |
| `SAFETY_AND_COMPLIANCE.md` | Intended use, screening, red-flags, caregiver rules, data protection, frameworks, **rule→component enforcement map** | Everyone — binding on all tracks |
| `TESTS.md` | Per-track test strategy, per-component tests, fairness/fail-safe tests, three E2E journeys, safety tests | All tracks |

## Setup & run

Prerequisites: **Node.js ≥ 20 LTS**, npm ≥ 10, a webcam, Chromium or Firefox on Windows (or Chrome on Android for device testing), and `ffmpeg` on PATH (dev-only, for fixture conversion). No API keys, no accounts, no paid services.

```bash
git clone <repo-url> mirrorwell && cd mirrorwell
npm install                # installs the pinned stack; postinstall verifies the model file hash
npm run dev                # http://localhost:5173 — allow camera when prompted
npm run test               # Vitest unit suites (metrics, rep detection, storage)
npm run test:e2e           # Playwright fake camera (replays tests/fixtures/replay/*.mjpeg)
npm run test:a11y          # axe-core scans of every screen
npm run build && npm run preview   # production PWA; verify offline via DevTools → Network → Offline
```

## Repository structure

```
mirrorwell/
├── public/
│   ├── models/face_landmarker.task   # bundled landmark model — served same-origin, never CDN
│   ├── wasm/                         # @mediapipe/tasks-vision WASM runtime — copied from node_modules
│   │                                 # at postinstall, hash-locked in models.lock.json, never CDN
│   └── demo-assets/                  # per-exercise looping WebM demos (EX_*.webm)
├── src/
│   ├── config/
│   │   ├── exercises.ts              # canonical EX_* definitions incl. dosing + landmark indices
│   │   ├── thresholds.ts             # every tunable in the system, one file, commented
│   │   └── strings.ts                # every user-facing string (English-only; audited per SAFETY §8)
│   ├── log.ts                        # console logger — debug/info stripped from prod; warn/error survive
│   ├── sensing/                      # CaptureService, LandmarkEngine, QualityMonitor
│   ├── metrics/                      # NormalizationLayer, MetricEngine, RepDetector (pure functions)
│   ├── session/                      # SessionController, FeedbackRenderer, CalibrationFlow, SafetyGate
│   ├── data/                         # StorageService (Dexie), TrendsService, ExportService, SettingsService
│   ├── screens/                      # One file per canonical screen (see FRONTEND.md)
│   └── dev/                          # DebugHud (dev builds only — excluded from production bundle)
├── tests/
│   ├── unit/                         # Vitest suites
│   ├── e2e/                          # Playwright journeys
│   ├── fixtures/                     # consented clips: masters/ (webm|mp4) + replay/ (.mjpeg for
│   │                                 # Chromium's fake camera) + fixtures_manifest.json
│   ├── schemas/export.schema.json    # canonical export JSON schema
│   └── analysis/                     # validation notebooks (MODEL_AND_DATA §7)
├── scripts/                          # seed-dev.ts, inspect-db.ts, verify-model.ts, copy-wasm.ts,
│                                     # convert-fixtures.sh (ffmpeg master→mjpeg)
├── .github/workflows/                # CI: build, unit, no-network gate, e2e, a11y
└── docs/                             # these ten documents
```
