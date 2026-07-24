# V3 Craft Completion — Model-Agnostic Handoff (2026-07-24)

**Audience:** any executor — Claude Code / ChatGPT / Grok / Cursor. Pick up a track cold from this file.
**Mode:** execute an accepted plan task-by-task. Consult only on a missing decision, contradiction, or impossible API (repo deviation protocol). Do NOT re-litigate scope — the plan is accepted.

**The two source docs (read your task there — this file does not duplicate task steps):**
- Plan: `docs/superpowers/plans/2026-07-24-v3-craft-completion.md`
- Dispatch (paste prompts): `docs/superpowers/plans/2026-07-24-v3-craft-dispatch.md`
- Operating rules: `docs/superpowers/plans/2026-07-24-operating-rules-from-consult-qs.md`

---

## 1. What MirrorWell is (one paragraph)
Offline-first PWA: camera-based facial-exercise *support* for adults in a clinician-assigned facial-palsy retraining program. Not diagnostic. Signature mechanic = **"ease off"** (over-effort reinforces synkinesis, so the rare cue is *reduce* effort). Stack: React 18 + Vite 5 + MediaPipe FaceLandmarker (WASM **bundled**, never CDN) + Dexie/IndexedDB via `StorageService` only. Users are often older, sometimes low-vision → calm, large, unhurried UI is a **correctness requirement**.

## 2. Hard walls (breaking any = defect)
No network ever (CI no-network gate) · no camera frame/landmark persisted (only derived numbers) · camera only on Calibration/Session · tunables→`src/config/thresholds.ts`, strings→`src/config/strings.ts` (own nested block only) · no invented identifiers (amend `docs/ARCHITECTURE.md` §12 glossary first) · no new deps (no cloud TTS, no Redux/Zustand) · never weaken SAFETY §8 (no guilt/streaks/"push harder"; garden never wilts) · storage only via `StorageService` · typecheck = `npm run typecheck` (`tsc -b`), never `npx tsc --noEmit`.

## 3. Git reality (VERIFY with `git fetch` — this flipped twice)
- `origin/main` = **V2 backup** (`b692967`, tags `v1.0`/`v2.0`; NO AppShell). Do NOT merge craft here.
- `origin/v3/integration` = **the craft base** (`b43f215`, all V3 features, unaccepted craft). ~20 commits ahead of main.
- Worktrees: `MirrorWell` = main (V2 backup); `MW-v3-integration` = v3/integration (work here). Craft branches fork as `MW-v3-craft*`.
- **Task 0 (integrator, before any fork):** `git fetch --prune`; confirm `origin/main` has no `AppShell.tsx` and `origin/v3/integration` has it; ff both locals to their remotes. If main ever has V3 again → STOP, ask owner.

## 4. Program shape (foundation-first — the fix for the V3 half-UI failure)
V3 failed owner smoke on **craft**, not correctness (395 unit tests green). Root cause = parallel feature-verticals with no shared design system + "done = tests green." So:
- **Task 1 (Track A, ALONE):** design system + true responsive shell + onboarding. **Owner visually signs off (screenshots) BEFORE B/D/E fork.**
- **Task 2 (Track B, ALONE after A accepted):** teachable session + hold→release + patient-facing capture UI (GentleTarget).
- **Task 3/4/5 (C/D/E):** voice / garden / hub polish, rebuilt on the system. C after B.

## 5. Locked owner decisions (do NOT re-ask)
1. **B3 hold→release = COACHING-ONLY.** `reps.ts`/RepDetector unchanged (no DOCS-CHANGE). Countdown is teaching UI off the smoothed `effortIndex`; hold length = `thresholds.reps.minDurationMs`. **Suppress the "hold-complete → release" success cue while effort is above-zone** (ease-off owns the screen) so overshoot never gets a contradicting cue.
2. **Design-system needs OWNER visual sign-off (screenshots) before Track B/D/E fork** — not CI-green merge.
3. **Garden: decide at smoke.** Redesign → owner smoke → keep only if it supports the Start CTA without clutter, else demote off Home hero. Default bias if unsure = demote.
4. **Voice: default OFF stays.** Still do the root-cause fix; accept the offline `speechSynthesis` ceiling; win first-time clarity on Task 2 visual teach, not voice.

## 6. Craft gate (the enforcement that was missing in V3)
The test harness **cannot see craft**: Vitest runs `environment: 'node'` (React never renders); e2e has **zero visual assertions**. So `typecheck + vitest green` proves nothing about how a screen looks — that is exactly how V3 passed CI and failed smoke.
- **Agent merge gate:** `npm run typecheck && npx vitest run` green.
- **Every UI-task PR MUST attach screenshots at 390 / 768 / 1280 / 1920** for the screens it touched. A PR without them is not reviewable. "Manual matrix passed" is a claim, not evidence.
- **Version accept = OWNER smoke** on `v3/integration`. No merge to `main`, no tag, without explicit owner accept.

## 7. Footguns & discrepancies (verified against current code — read before coding)
1. **Tokens live in `src/index.css`** (`:root` HSL vars, light+dark; consumed by `tailwind.config.js`). **EXTEND `index.css` — do NOT create a parallel `src/styles/tokens.css`** (two token sources = drift). The `safety` amber token, `--radius`, `breathe`/`fade-in` keyframes, and `min-h-touch`/`touch-primary` (48/64px) already exist — reuse, don't reinvent.
2. **New identifiers** `GentleTarget`, `ExerciseTeachOverlay`, `holdGuide` do **not** exist yet → **amend `docs/ARCHITECTURE.md` §12 glossary in the same commit** before the code (repo rule). Verified: they currently appear only in the plan docs.
3. **Adding `voiceName` to settings:** `AppSettings` (schema.ts) + `DEFAULT_SETTINGS` + the **`SETTINGS_KEYS` allow-list** in `src/data/settings.ts` (`update()` throws on any key not in it) + `assertSettings` + `SettingsScreen`/`settingLabels` + DATABASE §2/§3 + glossary. **No Dexie migration needed** — `SettingsService.get()` merges `{...DEFAULT_SETTINGS, ...stored}`, so an optional field defaults cleanly.
4. **Teaching "first time" persistence — prefer NONE.** Simplest robust behavior: show the teach overlay automatically the first time each assigned exercise is hit **in a session** (in-memory), plus "Show me how" always available. This **dodges all schema churn**. Only if the owner insists on cross-session "seen once ever" do you add a `teachSeenExerciseIds` — that is a **new table = schema `version(3)` additive migration** (encouragement_note was v2) + StorageService methods + glossary. Don't add a DB migration for a teaching tip unless required.
5. **Do NOT delete/weaken these tests** — they are the invariants: `tests/unit/session-helpers.test.ts` (advanceBar/advanceArcPhase = the frozen-bar SAFETY guard, B4, TESTS §3.3; and `coachPhaseFor`), `tests/unit/voice.test.ts` (VoiceCoach). If you add a `thresholds` key, update `tests/unit/thresholds.keys.test.ts` (it asserts the thresholds shape).
6. **Frozen-bar invariant (B4):** the GentleTarget/`FeedbackRenderer` redesign must keep the freeze semantics — on any non-`QUALITY_OK` frame the primary affordance is **held, not advanced** (via `advanceBar`/`advanceArcPhase` or equivalent), and every value shown on the canvas (which is `aria-hidden`) must be mirrored in DOM `aria-live` text. A moving affordance on a bad frame is a **critical defect**.
7. **Hold-length UX nuance:** `repMinDurationMs` = 800 ms — short for a visible "hold and count" counter. If you display a longer hold (e.g. 2–3 s), the rep still completes on **release after 800 ms** (coaching-only), possibly before the counter ends. Make the displayed counter a **"hold at least this long" floor**, never a hard gate; keep it advisory.
8. **Voice trigger is the root cause, not the phrases:** `VoiceCoach.speak` **silently drops** a cue that lands within `voiceMinGapMs` (2500 ms) — so the overshoot "ease back" cue you need most often never speaks. Fix = **coalesce-to-latest (cancel+speak), never drop**; shorter/zero gap for overshoot cues; **`getVoices()` is `[]` until `onvoiceschanged`** (pick voice async or it falls back to the robotic default — the exact complaint). This is separate from the *safety* ease-off (>0.6 sustained 300 ms) which drives tone/haptic and never speaks.
9. **SessionScreen also drives Demo Mode** — the redesign must keep `QuickSetupOverlay` / `ArrivalOverlay` / `DemoWatermark` working (ARCHITECTURE §11).
10. **`holdGuide` caller state:** elapsed-in-zone is cross-frame state in `useSessionScreen`; reset it on zone-exit AND on `thresholds.metrics.gapResetMs` (250 ms) so the countdown can't run through a tracking dropout while the rep FSM has gap-aborted.
11. **Only 3 exercises are assignable** (`assignableExercises` excludes `EX_PUCKER` — no validated blendshape pair). Teach overlay + calibration iterate assignable exercises only.
12. **Screenshot enabler (recommended for Task 1):** add one reusable Playwright script that navigates the 7 **non-camera** screens (onboarding + hub) at the 4 viewports and saves PNGs — B/C/D/E reuse it. **Session/Calibration can't be auto-screenshotted** (need the fake-camera project + a live session) → those are **manual screen-capture** by the worker during smoke.
13. **Parallel-file collisions:** `strings.ts`, `thresholds.ts`, `useSessionScreen.ts` are touched by multiple tracks. Add strings only inside your feature's nested block. C runs **after** B (serial) on the shared session files — rebase on merged integration before coding.
14. **Shell `git` may block** merge/rebase/commit/push on `/dev/tty` — use `command git`. Each new worktree needs `ln -sfn /home/arnavbansal/MirrorWell/node_modules node_modules` + `node --experimental-strip-types scripts/copy-wasm.ts`.

## 8. Sensing core is sacred (do not touch)
`CaptureService`, `LandmarkEngine`, `QualityMonitor`, `NormalizationLayer`, `MetricEngine`, `RepDetector`, `SessionController`, `StorageService`, `TrendsService` — invariant-dense, high-craft, tested. The craft program changes **presentation the spine drives**, never the spine. SI/effort come from **blendshape pairs**, not geometry (geometry rejected at V1 B3); rep = effort >0.15 / hold ≥800 ms / fall <0.10.

## 9. What each executor produces
- Read your track's paste-prompt in the dispatch file + your task in the plan file. Nothing else repo-wide.
- Own branch, own worktree, **PR → `v3/integration` only. Never `main`. Never tag.**
- Green `typecheck + vitest` + **attached viewport screenshots** (UI) + DOCS-CHANGE lines for any doc/identifier change.
- Cross-model second opinion encouraged on Track B (session teaching).

## 10. Suggested skills (if your harness has them)
`brainstorming` (only if the plan under-specifies) → `test-driven-development` (holdGuide, voice, mappers) → `executing-plans` / `subagent-driven-development` → `verification-before-completion`. `frontend-design` or Refero for craft references only (Task 1 + garden) — locked plan decisions win.

## 11. One-line intent
> Keep the offline sensing core; make MirrorWell feel like one calm, responsive, teachable product on phone and desktop — foundation (design system + teaching) accepted first, then voice/garden/hub earn their place. Screenshots are the craft gate; owner smoke is the tag gate.
