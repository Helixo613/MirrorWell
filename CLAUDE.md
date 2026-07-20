# MirrorWell — Rules for AI Coding Agents

These rules are binding on every change in this repository. The ten documents in `docs/` are the sole source of truth. If code and docs disagree, the docs win. If a decision is not in the docs, do not invent it — stop and ask.

## Read order (before writing any code)

1. `docs/README.md` — scope, non-goals, stack
2. `docs/ARCHITECTURE.md` — structure; §12 is the canonical glossary
3. The doc for your track: `docs/API.md` + `docs/BACKEND.md` (backend), `docs/FRONTEND.md` (frontend), `docs/MODEL_AND_DATA.md` (ML)
4. `docs/IMPLEMENTATION.md` — execute tasks strictly in order; do not start a task whose dependencies aren't accepted
5. `docs/SAFETY_AND_COMPLIANCE.md` — binding on all tracks; §10 maps every rule to its enforcing component
6. `docs/TESTS.md` — a feature without its tests from this document is not done

## Non-negotiables (violating any of these is a defect, never a judgment call)

- **No network calls, ever.** No fetch, no CDN, no telemetry, no crash reporting, no analytics. CI fails the build on any non-same-origin request. If a feature seems to need a network call, the feature is wrong — stop.
- **No camera frame, video, or raw landmark array is ever persisted or logged.** Only derived numeric metrics reach IndexedDB. Narrow exception: dev-only harnesses under `src/dev/` may record camera video solely for consented fixture-master capture (download-only, git-ignored masters dir; SAFETY §6).
- **The camera stream may be open only while `CalibrationScreen` or `SessionScreen` is mounted** in production. Narrow exception: dev-only harnesses under `src/dev/` (excluded from the prod bundle) may open the camera. Never on `HomeScreen` or any other production screen.
- **Metric code must be structurally unable to run on a non-`QUALITY_OK` frame.** `ApprovedFrame` is constructible only inside `quality.ts`; `normalize` / geometry accept only `ApprovedFrame` — bad-frame metrics are a compile error.
- **Every tunable lives in `src/config/thresholds.ts`; every user-facing string lives in `src/config/strings.ts`.** A numeric literal or inline string anywhere else is a review-blocking defect.
- **No identifier may be invented.** Every component, screen, table, field, event, error code, and type must exist in `docs/ARCHITECTURE.md` §12. If you need a new one, the glossary is amended first.
- **No new dependencies** beyond the pinned table in `docs/ARCHITECTURE.md` §2. No Redux/Zustand/state libraries.
- **Never weaken a safety rule** in `docs/SAFETY_AND_COMPLIANCE.md`. The language rules (§8), attestation gate (§2), and fairness thresholds (`docs/MODEL_AND_DATA.md` §5) are release blockers.
- **Storage goes through `StorageService` only.** No component touches Dexie or IndexedDB directly.

## Verified platform facts — do NOT "correct" these back

These were verified against primary sources during doc review. Standard tutorials and training-data examples contradict them; the docs are right and the tutorials are wrong for this project.

1. **MediaPipe `FaceLandmarkerResult` has NO per-frame confidence field.** It contains only `faceLandmarks`, `faceBlendshapes`, `facialTransformationMatrixes`. Face presence = `faceLandmarks` non-empty (`LandmarkFrame.facePresent`). Sensitivity is set only via the `minFaceDetectionConfidence` / `minFacePresenceConfidence` / `minTrackingConfidence` options. Do not add a `confidence` field to any contract.
2. **The MediaPipe WASM runtime must be bundled, never CDN-loaded.** `FilesetResolver.forVisionTasks('/wasm')` points at `public/wasm/` (copied from `node_modules/@mediapipe/tasks-vision/wasm/` by `scripts/copy-wasm.ts` at postinstall). Every standard example uses a CDN URL — copying that pattern breaks the CI no-network gate and the offline PWA.
3. **Chromium's `--use-file-for-fake-video-capture` accepts ONLY `.y4m` and `.mjpeg`.** Never point it at `.webm`/`.mp4`. Masters live in `tests/fixtures/masters/` (webm/mp4); Playwright replays use `tests/fixtures/replay/*.mjpeg` produced by `scripts/convert-fixtures.sh` (ffmpeg).
4. **`detectForVideo` takes the `HTMLVideoElement` directly.** Do not construct WebCodecs `VideoFrame` objects (Firefox compatibility risk; also unnecessary).
5. **Firefox 143+ on Windows supports web-app install; older Firefox runs as offline-capable tab; Firefox remains a hard test gate either way.** Do not drop Firefox testing. Do not "correct" this back to "Firefox cannot install PWAs" — that was the pre-143 fact and is stale.
6. **IndexedDB cannot index booleans.** Indexed flags are `0 | 1` in the schema (`isActive`, `easeOffTriggered`); `RepEvent.easeOffTriggered` is `boolean` on the event surface and `SessionController` converts during session assembly.
7. **`npx tsc --noEmit` type-checks NOTHING in this repo — never use it.** The root `tsconfig.json` is a solution-style file (`"files": []` + project references), so `--noEmit` runs against an empty file set and always reports success. The real check is **`npm run typecheck`** (`tsc -b`), which is also what `npm run build` runs. A task is not verified until `tsc -b` is green; three real type errors survived a session's worth of "tsc clean" claims because of this.

## Workflow per task

1. Open the task in `docs/IMPLEMENTATION.md`. Confirm all prior tasks are accepted.
2. Implement exactly what the task states, using the contracts in `docs/API.md` and the schema in `docs/DATABASE.md` verbatim — copy identifiers, don't retype from memory.
3. Write/run the task's **Test** line plus the matching rows in `docs/TESTS.md` §2–§4. A task is done only when its tests pass and CI (including the no-network gate) is green.
4. If a task cannot be completed as specified — missing decision, contradiction, impossible API — do not improvise a workaround. Report the conflict, cite the doc and section, and stop.

## Deviation protocol

Any change that touches a canonical identifier, a threshold value, a contract shape, or a safety rule requires updating the owning doc in the same change, plus a one-line note in the PR/commit body: `DOCS-CHANGE: <doc> §<n> — <what and why>`. Undocumented drift between code and docs is a defect regardless of whether the code works.
