# V3 Craft Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Prerequisite:** Owner rejected V3 UX craft. `main` is **pre-V3** (`b692967` / tagged `v2.0` era). All V3 feature code lives on **`v3/integration` only**. Do **not** merge to `main` or tag until the owner accepts craft after smoke.

**Goal:** Make the unfinished V3 sandbox feel like one calm, responsive, teachable product — same visual language on phone and desktop, clear first-time exercise teaching, human (not lab) session feedback, hold→release reps, and motivation/voice that earn their place — without touching the sensing/rep math core unless a documented threshold is required.

**Architecture:** Foundation-first. Task 0 syncs git. Task 1 ships a shared design system + true responsive shells (including onboarding). Task 2 rebuilds the session teaching + hold→release + patient-facing capture UI alone. Tasks 3–5 then rebuild voice, garden, and remaining hub screens on that system. Zero new dependencies. PRs target **`v3/integration` only**.

**Tech Stack:** Existing pinned stack only (ARCHITECTURE §2). Browser built-ins: CSS/SVG/canvas, `speechSynthesis`. Optional Refero MCP **only** where a task says so — locked decisions win.

**Repo rules (binding every task):**
- Docs win; glossary `docs/ARCHITECTURE.md` §12 — amend before inventing identifiers.
- Strings → `src/config/strings.ts` (own nested block only); tunables → `src/config/thresholds.ts`.
- SAFETY §8: no guilt, no “push harder,” celebrate restraint; garden never wilts.
- `npm run typecheck` (`tsc -b`) + `npx vitest run`. Never `npx tsc --noEmit`.
- UI tasks also carry **craft acceptance** (viewport matrix / smoke bullets). Agent merge gate = CI green; **version accept = owner smoke** on `v3/integration`.
- Commit body includes `DOCS-CHANGE: <doc> §<n> — <what>` when docs change.
- **Do not change** LandmarkEngine / QualityMonitor / MetricEngine / RepDetector formulas unless a task explicitly requires a threshold DOCS-CHANGE.

**CRAFT GATE — added 2026-07-24 (closes the V3 hole; BLOCKS B1+B2).** The test harness **cannot verify craft**: Vitest runs `environment: 'node'` (React never renders) and the e2e suite has zero visual assertions — so `typecheck + vitest green` proves nothing about how a screen looks, and "manual matrix" is a claim, not evidence. That is exactly what shipped V3 past CI and failed owner smoke. Therefore:
1. **Every UI-task PR MUST attach screenshots** of the screens it touched at **390 / 768 / 1280 / 1920** (Playwright can screenshot the 7 non-camera screens cheaply — artifact to eyeball, no pixel-diff needed). A PR without them is not reviewable. "Craft bullets claimed" is not acceptance.
2. **Design system (Task 1) requires explicit OWNER visual sign-off BEFORE Track B/D/E fork** — not just CI-green merge. Building voice/garden/hub on an unaccepted visual language re-creates the V3 failure one level up. Foundation-first means the *foundation is accepted first*.

**Branching:** Worktrees `MW-v3-craft-*` cut from up-to-date `origin/v3/integration`. PR → `v3/integration`. Never → `main`.

**Parallelism map:**

| Track | Tasks | Starts when |
| --- | --- | --- |
| 0 (hygiene) | Task 0 | **Now — integrator/human only, before any forks** |
| A (foundation) | Task 1 | After Task 0 | **Alone** |
| B (session craft) | Task 2 | After Task 1 merges **AND owner visual sign-off** (craft gate) | **Alone** |
| C (voice) | Task 3 | After Task 2 merges |
| D (garden) | Task 4 | After Task 1 merges **AND owner sign-off** (may run parallel with B if no session-file overlap; prefer after B if unsure) |
| E (hub polish) | Task 5 | After Task 1 merges **AND owner sign-off**; rebase again after Task 2 if Session-adjacent strings collide |

**Fork gate (BLOCKS B1):** Track B/D/E do **not** fork on Task 1's CI-green merge alone — they fork only after the owner visually accepts the Task 1 design system + onboarding (screenshots at 390/768/1280/1920). This is the load-bearing change vs the original plan, which forked on merge and left owner smoke to the very end.

---

## Locked design decisions (2026-07-24)

1. **One app, one language.** Same components/tokens on phone and desktop; chrome adapts (sidebar ≥1024 / bottom tabs &lt;1024). No separate mobile build.
1a. **LAYOUT CONTRACT (Task 1 shipped — binding on B/C/D/E; do not regress):** See `docs/FRONTEND.md` §1.1. `ScreenShell` variants: `reading` (onboarding only, centered prose cap), `wide` (hub screens — **no** outer max-width; fills AppShell `flex-1`), plus `standalone` fluid cap for Session/Summary when not AppShell-wrapped. Tile collections use **`.fluid-grid`** (`auto-fit` / continuous columns) — **never** reintroduce `md:grid-cols-*` / `lg:grid-cols-*` content swaps. Do **not** re-cap `variant="wide"` with `max-w-shell` on the shell itself; inner `max-w-shell` only for linear form columns (Export/Settings pattern). Asymmetric toolbar+content (Trends controls+chart) stays stacked — not `.fluid-grid`. Only discrete breakpoint left: AppShell sidebar↔bottom-tabs. Tracks polish content **inside** this system; they do not invent a second width model.
2. **Keep the calm clinical palette** (muted sage/slate, gauge/target green accent). Redesign components/spacing/type/motion — not a new brand color system.
3. **Session is chrome-free** during active capture (existing AppShell rule). Stage owns the viewport.
4. **Patient-facing session metaphor (replaces lab-primary UI):**
   - **Primary:** large coach copy + **GentleTarget** — a single clear “gentle zone” affordance (preferred: circular/ring or soft fill driven by smoothed `effortIndex` vs `effortTargetZone`).
   - **Hold→release:** when effort is in-zone, show **hold guidance + countdown**; when hold requirement met, prompt **release to neutral** to complete the rep. Map to existing rep FSM (`repStartThreshold` / `repMinDurationMs` / `repEndThreshold`) — do **not** invent a second rep detector. New presentation tunables only (e.g. countdown display), in `thresholds.ts`.
   - **Secondary:** left/right symmetry may remain as a **subtle** indicator (smaller, lower contrast) or behind a “Show details” control — default patient view must not look like a developer HUD.
5. **Teaching:** `ExerciseTeachOverlay` — short, replayable, per-exercise motion explanation (CSS/SVG animation + copy). Shown automatically the **first time each assigned exercise is used in a session (in-memory — see Task 2 for why not persisted)**; always reachable via “Show me how” on Session. No network video; no new media deps.
6. **Voice:** remain **opt-in** (`voiceCoachEnabled` default false). Rewrite phrase bank for raise → hold → release → rep-complete with **variants**; pick a less robotic local voice when available; tighten latency of the **voice ease-back cue** (the `coachPhaseFor`→'easeBack' spoken line — NOT the MetricEngine ease-off condition, which is sensing-sacred and stays untouched). Still **local `speechSynthesis` only** — no cloud TTS.
7. **Garden:** keep the feature; **craft redesign** (SVG/stages) so it feels intentional. Still only grows (SAFETY).
8. **Sensing core is sacred.** Capture/landmarks/quality/metrics/reps stay.

**Owner smoke issues this plan closes:** (1)(2) responsive/dynamic UI including onboarding; (3) garden craft; (4) voice; (5) teaching + hold→release; (6) capture UI; (7) full redesign under same system; (8) “half-assed” bar via craft gates.

---

### Task 0: Branch hygiene (integrator / human — no feature code)

**Why:** `origin/main` is pre-V3; `origin/v3/integration` holds V3. Locals must not drift. No craft branch forks until this is done.

**Steps:**
- [ ] `git fetch origin --prune`
- [ ] Confirm `origin/main` has **no** `src/components/layout/AppShell.tsx` and tip is pre-V3 (`b692967` or successor docs-only).
- [ ] Confirm `origin/v3/integration` **has** AppShell and is the craft base.
- [ ] Fast-forward local `MirrorWell` → `origin/main`.
- [ ] Fast-forward local `MW-v3-integration` → `origin/v3/integration`.
- [ ] If `main` ever incorrectly contains V3 again: **stop** and ask owner — do not “fix forward” by merging craft to main.
- [ ] Only then create Track A worktree from `origin/v3/integration`.

---

### Task 1: Design system + true responsive shell (incl. onboarding) — [Track A, alone]

**Owner issues:** 1, 2, 7 (foundation), part of 8.

**Files:**
- **EXTEND `src/index.css`** (the existing token home — `:root` HSL vars, light+dark, consumed by `tailwind.config.js`). Add spacing scale, type steps, radius; reuse existing `--radius`, `safety` amber token, `breathe`/`fade-in` keyframes, `min-h-touch`/`touch-primary`. **Do NOT create a parallel `src/styles/tokens.css`** — two token sources drift.
- Create: `src/components/ui/` primitives as needed for consistency — prefer thin wrappers over existing radix/button patterns already in repo; **do not** add component libraries.
- Modify: `src/components/layout/AppShell.tsx`, `ScreenShell.tsx`, `SoftPanel.tsx`, `StickyScreenFooter.tsx`
- Modify: **all hub screens** under `src/screens/{home,trends,summary,caregiver,export,settings}/` for consistent padding, max-width, typography.
- Modify: `src/screens/onboarding/**` — onboarding must reflow: same steps/content language; stack/spacing/CTA placement adapt at `lg`; no “desktop form dumped on phone.”
- Test: existing unit/e2e keep green; add/adjust onboarding e2e if selectors change.
- Docs: `docs/FRONTEND.md` §1 / §1.1 — design tokens, shell rules, onboarding responsive behavior. Glossary: only if a new **named** shell primitive is introduced as an identifier (prefer not); screen-local pieces stay implementation detail.

**Refero (optional):** 2–3 calm clinical onboarding + responsive shell references. Must not add features or breakpoints beyond this plan.

**Steps:**
- [ ] Inventory current layout/tokens in `src/components/layout/` + global CSS/Tailwind theme.
- [ ] Add token variables; wire Tailwind/theme to consume them (no new deps).
- [ ] Refactor AppShell/ScreenShell for consistent hub chrome; verify session active phase still chrome-free.
- [ ] Rebuild onboarding layout for `lg` vs below: readable type, ≥44px targets, no horizontal scroll.
- [ ] Pass hub screens through SoftPanel/spacing so they share one language.
- [ ] **Fluid, not one-breakpoint (issues 1/2):** type + spacing use `clamp()` / fluid scale so layout is continuous across resolutions — `lg` swaps the nav *chrome* (sidebar↔tabs), but content must not "static-desktop-on-phone" between breakpoints. Add a `md` (768) soft breakpoint if steppers/hub need it (document in FRONTEND §1.1 same commit).
- [ ] **DESKTOP LAYOUT IS THE ACTUAL FIX (2026-07-24 owner feedback — refining tokens alone FAILED this):** the root cause of "looks like a phone app on desktop" is `ScreenShell` re-capping every screen to one centered `max-w-shell` column. Fix:
  1. **Give `ScreenShell` a width variant** — `reading` (keep a comfortable prose cap, for onboarding text/steps) vs **`wide`** (fills the AppShell fluid main; no phone-width cap). Hub/data/session screens use `wide`; content **fills the space beside the sidebar**, it does not sit as a narrow column in whitespace.
  2. **Use the intrinsic auto-fit grid** for any multi-item screen (Home cards + garden, Trends, Summary per-exercise cards, Settings groups): `grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]`. This fills desktop rows and collapses to 1-col on phone **with no breakpoint** — resolution-independent. (Reference: kairos `.fluid-tile-pair`, `~/kairos/kairos/frontend/src/app/globals.css`.)
  3. **ONE FLUID LAYOUT — not a phone version + a desktop version (owner: "variable, not 2 entirely different screens").** No hard `md:`/`lg:` layout swaps that produce two discrete compositions. The same markup morphs continuously: fluid container width + `clamp()` type/space + auto-fit grids so content spreads as the window grows and stacks as it shrinks, smoothly at every size in between. The ONLY discrete change allowed is nav chrome (sidebar↔bottom-tabs — chrome, not content).
  4. **Onboarding:** one container, not a 400px stripe and not a separate 2-col desktop page. Its content reflows via auto-fit + fluid width — narrow = stacked, wide = naturally spreads. No breakpoint-swapped desktop variant.
  5. **Session "before you begin" / stage:** the arrival overlay + breathing circle are fixed phone-aspect → crooked when wide. Make the stage width **fluid** (fills up to a sane max, preview + coach/gauge reflow within it), overlay centered inside it at any size. (Full session-metaphor redesign is Task 2; fluid stage proportions are Task 1.)
  6. **Refero (do it):** pull 2–3 calm-clinical references for fluid composition/hierarchy before building. Locked palette/decisions win.
  - Acceptance: dragging the window from 390 → 1920 the layout must change **continuously** (no snap between a "mobile screen" and a "desktop screen"); it fills space as it grows and never sits as a narrow column in whitespace. Capture screenshots at 390/768/1280/1920 to show one continuous system, not two designs.
- [ ] Manual matrix: **1920×1080, 1280×800, 768×1024, 390×844** — onboarding + Home + Settings usable.
- [ ] **Add a reusable Playwright screenshot script** (`tests/e2e/screenshots.spec.ts`, non-camera project) that navigates the 7 non-camera screens at 390/768/1280/1920 and saves PNGs — B/C/D/E reuse it. (Session/Calibration need the fake-camera project + a live session → those stay **manual** screen-capture during smoke.) Attach the PNGs to the PR (craft gate — CI cannot see pixels).
- [ ] `npm run typecheck && npx vitest run` green.
- [ ] Commit + PR → `v3/integration`.

**Craft acceptance (OWNER SIGN-OFF GATE — BLOCKS B1):** Onboarding no longer feels “static desktop on phone”; hub screens share one system. **Track B/D/E do not fork until the owner visually accepts this task from the attached screenshots.** CI-green merge alone is not the gate.

---

### Task 2: Teachable session + hold→release + patient capture UI — [Track B, alone after Task 1]

**Owner issues:** 5, 6, core of 8.

**Files:**
- Create: `src/components/session/ExerciseTeachOverlay.tsx` (+ small CSS/SVG motion under `src/components/session/` or `src/assets/` SVG-only — no video files required).
- Create: `src/screens/session/holdGuide.ts` — pure helpers: given `effortIndex`, zone, elapsed-in-zone ms, existing rep thresholds → `{ phase: 'raise'|'hold'|'release'|…, holdRemainingMs }` (TDD first).
- Modify: `src/session/renderer.ts` (`FeedbackRenderer`) — presentation only: demote engineer HUD; draw **GentleTarget** primary; optional subtle symmetry.
- Modify: `src/screens/session/SessionScreen.tsx`, `useSessionScreen.ts`, `sessionHelpers.ts` as needed for teach entry + hold UI + coach copy.
- Modify: `src/config/strings.ts` (`session.teach.*`, `session.hold.*`, coach copy refresh).
- Modify: `src/config/thresholds.ts` — presentation tunables only, e.g. `session.holdCountdownTickMs` or display helpers derived from `reps.minDurationMs` (prefer reuse `repMinDurationMs` as the hold target length).
- **Teach "first time" — PREFER in-memory (no schema churn):** show the overlay automatically the first time each assigned exercise is hit **in a session** + "Show me how" always available. Only if the owner insists on cross-session "seen once ever" do you persist — and that is a **new table = schema `version(3)` additive migration** (encouragement_note was v2) + `StorageService` methods + glossary + DATABASE. A settings field can't cleanly hold a per-exercise set and still needs the `SETTINGS_KEYS` allow-list edit; don't add DB weight for a teaching tip unless required.
- Test: `tests/unit/hold-guide.test.ts`, teach visibility unit/hook tests; existing session/renderer tests updated (not deleted).
- Docs: FRONTEND §2.4 / §5 feedback UX; ARCHITECTURE §12 (`ExerciseTeachOverlay`, `GentleTarget`, `holdGuide` as needed); SAFETY if copy touches effort language.

**Locked behavior:**
- Auto-show teach the **first time each exercise is used in a session** (in-memory, no persistence — see Files note); “Show me how” always available.
- In-zone: coach says hold; countdown visible; then release-to-neutral to complete rep.
- Default patient view is **not** dual thick lab bars as the hero.

**B3 — hold→release semantics — DECIDED 2026-07-24: (a) COACHING-ONLY. Do not implement (b).** The existing rep FSM (`reps.ts`) completes a rep on effort rise>0.15 → ≥800 ms → fall<0.10 and does **NOT** require dwell in the green zone [0.3,0.5]; it stays **unchanged** (protects "sensing sacred", no DOCS-CHANGE, no metric-meaning change). The hold/countdown is teaching UI layered over that FSM. **Required reconciliation (binding, not optional):**
- Drive the countdown off the **same smoothed `effortIndex`** the FSM uses; the hold target length = `thresholds.reps.minDurationMs` (or a presentation tunable ≥ it) — a teaching display, **never a second detector**.
- While effort is **above-zone** (overshoot / ease-off owns the screen), **suppress the "hold complete → release" success narrative** entirely — ease-off / ease-back copy wins. So a rep that completes by overshoot never gets a contradicting "nice hold, now release" cue.
- Revisit option (b) — in-zone dwell as a real rep requirement (RepDetector + DOCS-CHANGE ARCH §7/API §9) — **only later**, and only if real users keep completing reps by overshooting and it still feels wrong *after* the teaching UI is good.

**BLOCKS B4 — preserve the frozen-bar SAFETY invariant in the `FeedbackRenderer`/GentleTarget rewrite:** the redraw must keep `advanceBar`/`advanceArcPhase` freeze semantics (on any non-`QUALITY_OK` frame the primary affordance is **held**, not advanced) and every value shown on the canvas must still be mirrored in DOM `aria-live` text (canvas stays `aria-hidden`). A moving affordance on a bad frame is a **critical defect (TESTS §3.3)**. "Presentation only" is not a licence to drop this.

- **Demo flow must keep working:** SessionScreen also drives Demo Mode — the redesign must preserve `QuickSetupOverlay`, `ArrivalOverlay`, and `DemoWatermark` paths (ARCHITECTURE §11).
- **holdGuide caller resets elapsed-in-zone** on zone-exit **and** on the gap rule (`thresholds.metrics.gapResetMs` = 250 ms), so the countdown can never run through a tracking dropout while the rep FSM has already gap-aborted.

**Steps:**
- [ ] Glossary amend commit (identifiers) **before** large UI code if new names are introduced.
- [ ] TDD `holdGuide` pure helpers against `thresholds.metrics.effortTargetZone` + `thresholds.reps.*`.
- [ ] Implement `ExerciseTeachOverlay` + wire show/hide (**in-memory per-session; no DB persistence unless owner requires** — see Files note).
- [ ] Redesign `FeedbackRenderer` patient presentation (GentleTarget primary).
- [ ] Wire SessionScreen coach/hold/release copy; ensure ease-off / quality banners still win.
- [ ] Manual: after calibration, new user understands motion; can complete a rep via hold→release without prior knowledge of “green band.”
- [ ] Viewport matrix on Session at 1280 and 390; **attach screenshots/short screen-capture** of teach overlay + in-zone hold + release-to-complete (craft gate).
- [ ] `npm run typecheck && npx vitest run` green; PR → `v3/integration`.

**Craft acceptance:** Owner can complete a brow/smile rep guided only by on-screen teach + hold/release — no integrator coaching.

---

### Task 3: Voice coach redesign (local only) — [Track C, after Task 2]

**Owner issues:** 4.

**DECIDED 2026-07-24 (owner) — layered, both:** voice stays **default OFF** (not the primary win); the first-time-clarity win is **visual teaching (Task 2)**. Still do the full root-cause fix below so the opt-in path isn't broken, and **accept the offline ceiling** — voice is optional polish, never a cloud assistant. Do not gate the release on voice quality.

**ROOT CAUSE (why the original Task 3 under-fixes it):** the owner's "delayed / invalid / inaccurate" voice is **not** mainly a phrase-bank problem. In code: the overshoot cue is `coachPhaseFor`→`'easeBack'` (effort > zone-high 0.5) spoken via `VoiceCoach.speak`, which **returns early and silently DROPS the cue** when it lands within `voiceMinGapMs` (2500 ms) of the previous cue — so the "ease back" you need most often never gets said. (This is separate from the *safety* ease-off at >0.6 sustained 300 ms, which drives tone/haptic and never speaks.) Required fixes, not optional:
1. **Coalesce, never drop:** within the gap, the latest pending cue must replace + speak (cancel+speak), not be discarded. Safety-relevant transitions (overshoot/ease-back) use a **shorter/zero gap** than pacing cues.
2. **`getVoices()` is async** — it returns `[]` until `onvoiceschanged` fires; pick the voice on that event or it silently falls back to the robotic default (the exact complaint). 
3. **Expose a Settings voice-picker** (choose among `speechSynthesis.getVoices()`) — the only honest lever for "a good voice" per device, since voice quality is OS-provided.
4. **Vary across sessions:** deterministic-by-event-count variant selection repeats the identical sequence every session → still feels canned. Seed variant choice by session, keep it deterministic *within* a session for tests.
5. **Honesty (state to owner):** offline `speechSynthesis` has a hard quality ceiling — timing, procedure coverage (raise→hold→release→rep), variety, and per-device voice choice are fixable; a truly natural assistant voice is **not** achievable offline, and cloud TTS is a hard no-network wall. If the ceiling is unacceptable, the honest fallback is voice **off by default** won on visual teaching (Task 2).

**Files:**
- Modify: `src/session/voice.ts` — voice selection (prefer non-default local English voice when available), rate/pitch within sane bounds, cancel+speak, optional slightly lower gap for ease-off only if documented.
- Modify: `src/config/strings.ts` — `session.voice.*` expanded: variants for raise/hold/release/easeBack/repComplete (arrays + picker with stable hash/index by event count — deterministic for tests).
- Modify: `src/screens/session/useSessionScreen.ts` — speak on meaningful transitions including **release** and hold-enter; never stack stale cues.
- Modify: `src/config/thresholds.ts` — `feedback.voiceMinGapMs` retune if needed; document.
- Test: expand `tests/unit/voice.test.ts` (mock speechSynthesis + voice list).
- Docs: FRONTEND §2.4 audio; SAFETY note remains local-only TTS.

**Non-goals:** cloud TTS, always-on voice, conversational LLM.

**Steps:**
- [ ] Spec phrase bank in strings (SAFETY §8 pass) — variants for raise/hold/release/easeBack/repComplete.
- [ ] **Fix the trigger/latency model (root cause):** coalesce-latest not drop-within-gap; shorter/zero gap for overshoot cues; `onvoiceschanged` async voice pick with fallback.
- [ ] TDD VoiceCoach: variant rotation, **gap coalescing (cue within gap replaces, not dropped)**, cancel, missing API, **async voice-list load**, voice pick fallback.
- [ ] Wire session transitions to richer cues aligned with Task 2 phases (incl. **release**).
- [ ] **Settings voice-picker:** optional `voiceName?: string` on `app_settings` (schema + `settings.ts` + `SettingsScreen` + `settingLabels`; DATABASE + glossary DOCS-CHANGE same commit) so the user selects the best OS voice per device. If persisting is judged too heavy, at minimum let VoiceCoach auto-pick the best available non-default local English voice.
- [ ] Manual: enable in Settings; cues feel timely during raise/hold/release/ease-off (still opt-in); **capture a short audio-optional screen recording** of a rep for owner review (craft gate).
- [ ] typecheck + vitest; PR → `v3/integration`.

**Craft acceptance:** Owner no longer describes voice as “creepy one-liners with delay” — timely cues through raise→hold→release→ease-off — **or** owner accepts voice off-by-default with a clear Settings description, given the stated offline ceiling.

---

### Task 4: Garden craft redesign — [Track D, after Task 1; prefer after Task 2]

**Owner issues:** 3.

**Files:**
- Modify: `src/components/progress/AdherenceGarden.tsx` — intentional illustration (SVG), readable labels, calm motion (`prefers-reduced-motion` respected).
- Modify: `src/screens/home/gardenData.ts` only if mapper needs aria/stage labels (keep only-grows semantics).
- Modify: `src/config/strings.ts` `home.garden.*`
- Test: `tests/unit/garden-data.test.ts` still pass; add render smoke if useful.
- Docs: FRONTEND garden section; SAFETY garden note unchanged (never wilt).

**Reference craft (recommended):** the original garden looked bolted-on partly because it was hand-authored SVG with no reference. Use Refero (calm/health "streak/progress" surfaces) for 1–2 references before drawing — same allowance Task 1 has. Locked decisions still win.

**Demote fallback — DECIDED path (owner, 2026-07-24):** do NOT decide keep-vs-demote up front. Run the redesign → owner smoke → **keep only if it supports the Start CTA without clutter; else demote off the Home hero** (behind a "progress" view). **Default bias if unsure after smoke = demote**, never ship a weak garden to satisfy "keep the feature."

**Steps:**
- [ ] Redesign SVG stages (seed→bloom) to look deliberate, not placeholder (reference first).
- [ ] Home layout under design system: garden supports Start CTA, doesn’t dominate confusingly.
- [ ] Manual at 1280 and 390 with seeded data (`VITE_ENABLE_DEBUG_HUD=true` → Seed); **attach Home screenshots at both widths** (craft gate).
- [ ] typecheck + vitest; PR → `v3/integration`.

**Craft acceptance:** Garden feels like a motivation feature, not clutter — **or** owner chooses the demote fallback.

---

### Task 5: Hub polish (Summary, Trends, Caregiver, Export, Settings) — [Track E, after Task 1]

**Owner issues:** 2, 7 remainder, 8 remainder.

**Files:**
- Modify: screens under `src/screens/{summary,trends,caregiver,export,settings}/` + related components for spacing, hierarchy, empty states, CTAs using Task 1 tokens/primitives.
- Modify: strings only within each screen’s block if copy clarity needs it (SAFETY §8).
- Do **not** redesign Export privacy rules or encouragement-note SAFETY carve-out behavior.
- Test: existing unit/e2e green; update selectors if needed.
- Docs: FRONTEND touch-ups per screen section.

**Steps:**
- [ ] Pass each hub screen against design system checklist (type scale, panel, footer, tap targets).
- [ ] Manual matrix sample: Trends + Export + Caregiver at 1280 and 390; **attach screenshots** (craft gate).
- [ ] typecheck + vitest; PR → `v3/integration`.

---

## Merge protocol (integrator)

1. Task 0 done before Track A forks.
2. Merge Task 1 (A). **STOP: owner visually accepts A from attached screenshots (BLOCKS B1) BEFORE B/D/E fork.** CI-green is not the fork gate.
3. Then merge order into `v3/integration`: **B → (C ∥ D ∥ E)** with C after B.
4. Every UI PR must carry viewport screenshots (BLOCKS B2) or it is not reviewable.
5. Prefer D after B if Home/session strings collide.
6. B3 hold→release is **DECIDED: coaching-only** (Task 2 keeps `reps.ts` unchanged; no dwell FSM change) — no owner decision pending here.
7. After all green: **owner smoke** full checklist (onboarding, teach, hold→release, garden, voice opt-in, hub).  
8. **Only if owner accepts:** merge `v3/integration` → `main` and tag (name TBD by owner — not automatic).

## Out of scope

- Changing MediaPipe model, quality gate math, or effortIndex formula.
- Cloud services, new npm dependencies, Redux/Zustand.
- Remote caregiver, accounts, iOS.
- Merging to `main` without owner accept.

## Self-review

- [ ] Every owner issue 1–8 maps to at least one task.
- [ ] Foundation-first respected (A alone, B alone).
- [ ] Sensing protected.
- [ ] Craft gates present on UI tasks.
- [ ] Dispatch file exists with paste-ready prompts.
