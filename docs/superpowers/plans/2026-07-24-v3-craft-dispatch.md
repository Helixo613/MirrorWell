# V3 Craft Completion — Multi-Agent Dispatch

Integrator: Cursor (review + merge only). Workers: own worktree, own branch, **PR → `v3/integration` only — never `main`.** Owner smoke on `v3/integration` before any promote/tag.

**Plan:** `docs/superpowers/plans/2026-07-24-v3-craft-completion.md`  
**Operating rules:** `docs/superpowers/plans/2026-07-24-operating-rules-from-consult-qs.md`  
**Base tip:** up-to-date `origin/v3/integration` (contains unaccepted V3 features). `origin/main` is **pre-V3** — do not merge craft there.

## Assignment table

| Track | Tasks | Agent | Starts when |
| --- | --- | --- | --- |
| 0 | Task 0 hygiene | **Integrator / you** | **Now** (before any forks) |
| A | Task 1 design system + responsive (incl. onboarding) | **Claude Code** | After Task 0 | **Alone** |
| B | Task 2 teach + hold→release + GentleTarget session UI | **ChatGPT sol** (or Claude) | After A merges **+ owner visual sign-off** | **Alone** |
| C | Task 3 voice redesign | **ChatGPT sol** or **Grok** | After B merges |
| D | Task 4 garden craft | **ChatGPT terra** | After A **+ owner sign-off** (prefer after B) |
| E | Task 5 hub polish | **Grok** or **ChatGPT luna** | After A **+ owner sign-off**; rebase after B if needed |

**FORK GATE (BLOCKS B1):** B/D/E fork only after the owner **visually accepts** Task 1 (from screenshots), not on CI-green merge. Don't paste the Track B prompt until that visual accept happens. (B3 hold→release is already **DECIDED: coaching-only** — no pending decision there.)

## Task 0 — run once (you)

```bash
git fetch origin --prune
# main must stay pre-V3 (no AppShell):
git cat-file -e origin/main:src/components/layout/AppShell.tsx && echo 'STOP: main has V3 again' || echo 'main OK pre-V3'
# integration is craft base:
test -n "$(git ls-tree -r --name-only origin/v3/integration | grep AppShell)" && echo 'integration OK' || echo 'STOP: integration missing AppShell — wrong base'

git -C /home/arnavbansal/MirrorWell pull --ff-only origin main
git -C /home/arnavbansal/MW-v3-integration pull --ff-only origin v3/integration

# Then create Track A only:
git -C /home/arnavbansal/MirrorWell worktree add ../MW-v3-craftA -b v3/craft-design-system origin/v3/integration
# After A merges, create B from updated integration:
# git worktree add ../MW-v3-craftB -b v3/craft-session-teach origin/v3/integration
# After B (for C) / after A (for D/E):
# git worktree add ../MW-v3-craftC -b v3/craft-voice origin/v3/integration
# git worktree add ../MW-v3-craftD -b v3/craft-garden origin/v3/integration
# git worktree add ../MW-v3-craftE -b v3/craft-hub-polish origin/v3/integration
```

Each new worktree:

```bash
ln -sfn /home/arnavbansal/MirrorWell/node_modules node_modules
node --experimental-strip-types scripts/copy-wasm.ts
```

## Shared rules block (every prompt)

```
REPO RULES (binding):
- Plan: docs/superpowers/plans/2026-07-24-v3-craft-completion.md — follow locked decisions; do not invent scope.
- docs/ are source of truth; ARCHITECTURE.md §12 glossary — amend before new identifiers.
- No new dependencies. No network calls. No cloud TTS.
- strings.ts (your nested block only) + thresholds.ts for tunables.
- StorageService only. SAFETY §8: no guilt / no push harder; garden never wilts.
- Do NOT change MetricEngine / RepDetector / LandmarkEngine / QualityMonitor formulas unless the plan task explicitly requires a thresholds DOCS-CHANGE.
- Verify: npm run typecheck && npx vitest run. UI tasks also need the plan's craft/manual matrix before claiming done.
- CRAFT GATE (BLOCKS B2): CI cannot see pixels (Vitest is node-env, no React render; e2e has no visual assert). Every UI PR MUST attach screenshots at 390/768/1280/1920 for the screens it touched. "Manual matrix passed" without screenshots is not acceptance.
- PR target: v3/integration ONLY. Never main. Never tag.
- Base: origin/v3/integration (AppShell present). Commit DOCS-CHANGE lines when docs change.
- LAYOUT CONTRACT (Task 1 locked — do not regress): ScreenShell reading|wide|standalone per FRONTEND §1.1; tile collections use .fluid-grid only — never md:/lg: grid-cols swaps for content; never re-cap wide shells with max-w-shell; Trends controls+chart stays stacked; only AppShell may use discrete lg for nav chrome.
```

## Paste-ready prompts

> **Launch convention:** all agents are started from `~/MirrorWell`, so each prompt's first instruction is `cd` into its own `MW-v3-craft*` worktree. Claude Code's `EnterWorktree` does NOT enter a sibling git worktree — the `cd` (absolute path) is how the agent lands on the right tree; it must stay there for every command.

### Track A — Claude Code (`/home/arnavbansal/MW-v3-craftA`, `v3/craft-design-system`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-craftA
BRANCH (mandatory): v3/craft-design-system
FIRST run: cd /home/arnavbansal/MW-v3-craftA  (you are launched from ~/MirrorWell — cd into your own worktree before anything else, and stay there).
Run pwd and git rev-parse --abbrev-ref HEAD; STOP if wrong. Confirm AppShell exists and branch contains origin/v3/integration. PR → v3/integration only.

You implement Task 1 ONLY from docs/superpowers/plans/2026-07-24-v3-craft-completion.md. Design tokens + AppShell/ScreenShell consistency + onboarding truly responsive + hub screens share one visual language. FLUID scale (clamp type/spacing), not a single lg swap — continuous across resolutions; add md(768) if needed. Keep calm sage/slate/green palette. Session active phase stays chrome-free. Optional Refero for shell/onboarding craft only — plan locks win. Manual matrix 1920/1280/768/390. ATTACH SCREENSHOTS at all four widths to the PR (craft gate — CI cannot see pixels). typecheck + vitest green before PR. NOTE: this is the owner-sign-off gate — B/D/E do not start until the owner accepts your screenshots.
[+ shared rules block]
```

### Track B — ChatGPT sol (`/home/arnavbansal/MW-v3-craftB`, `v3/craft-session-teach`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-craftB
BRANCH (mandatory): v3/craft-session-teach
FIRST run: cd /home/arnavbansal/MW-v3-craftB  (you are launched from ~/MirrorWell — cd into your own worktree before anything else, and stay there).
Run pwd and branch check; STOP if wrong. Confirm Task 1 design-system is on origin/v3/integration (ScreenShell reading|wide|standalone + .fluid-grid present); if not, STOP. PR → v3/integration only.

You implement Task 2 ONLY from docs/superpowers/plans/2026-07-24-v3-craft-completion.md. LAYOUT: Session stays chrome-free / stage-owned; use existing ScreenShell wide + standalone fluid cap — do not invent md:/lg: layout swaps or re-cap the shell. B3 IS DECIDED: COACHING-ONLY — do NOT change reps.ts/RepDetector; the hold/countdown is teaching UI over the unchanged FSM. Reconcile (binding): countdown off the same smoothed effortIndex, hold length = thresholds.reps.minDurationMs, and SUPPRESS the "hold complete → release" success narrative whenever effort is above-zone (ease-off/ease-back owns the screen) so overshoot never gets a contradicting cue. ExerciseTeachOverlay (auto-show first time each exercise is used in a session, IN-MEMORY no DB persistence, + "Show me how" always); holdGuide TDD mapped to existing rep thresholds; GentleTarget patient-primary FeedbackRenderer; demote lab HUD. B4: PRESERVE the frozen-bar invariant — advanceBar/advanceArcPhase freeze on non-QUALITY_OK frames, every canvas value mirrored in DOM aria-live (TESTS §3.3 critical defect). Keep Demo flow working (QuickSetupOverlay/ArrivalOverlay/DemoWatermark). holdGuide caller resets elapsed-in-zone on zone-exit and on gapResetMs (250ms). Do not change sensing math. Manual: new user completes a rep via teach + hold→release with no coaching; ATTACH screenshots/short capture (teach + in-zone hold + release). typecheck + vitest green before PR.
[+ shared rules block]
```

### Track C — ChatGPT sol or Grok (`/home/arnavbansal/MW-v3-craftC`, `v3/craft-voice`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-craftC
BRANCH (mandatory): v3/craft-voice
FIRST run: cd /home/arnavbansal/MW-v3-craftC  (you are launched from ~/MirrorWell — cd into your own worktree before anything else, and stay there).
Run pwd and branch check; STOP if wrong. Confirm Task 2 is on origin/v3/integration; if not, STOP. PR → v3/integration only.

You implement Task 3 ONLY from docs/superpowers/plans/2026-07-24-v3-craft-completion.md. Mostly logic — no layout rewrite. If you add a Settings voice-picker, place it inside the existing Settings ScreenShell wide + .fluid-grid / inner max-w-shell patterns (FRONTEND §1.1); do not add md:grid-cols swaps. ROOT CAUSE FIRST (not just phrases): today VoiceCoach.speak DROPS a cue when it lands within voiceMinGapMs(2500) — so the overshoot "ease back" cue is silently swallowed (the "delayed/invalid" complaint). FIX: coalesce-to-latest (cancel+speak) never drop; shorter/zero gap for overshoot cues; async voice pick via onvoiceschanged (getVoices() is [] until then — else it falls back to the robotic default); add a Settings voice-picker (voiceName on app_settings; DATABASE+glossary DOCS-CHANGE) or at least auto-pick best local voice; vary variants across sessions (deterministic within a session for tests). Phrase variants for raise/hold/release/easeBack/rep, still opt-in, speechSynthesis only (no cloud TTS). Tell the owner the offline voice ceiling honestly. TDD with mocks (incl. gap-coalesce + async voice list). Align cues with Task 2 phases incl. release. typecheck + vitest green before PR.
[+ shared rules block]
```

### Track D — ChatGPT terra (`/home/arnavbansal/MW-v3-craftD`, `v3/craft-garden`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-craftD
BRANCH (mandatory): v3/craft-garden
FIRST run: cd /home/arnavbansal/MW-v3-craftD  (you are launched from ~/MirrorWell — cd into your own worktree before anything else, and stay there).
Run pwd and branch check; STOP if wrong. Prefer rebase on origin/v3/integration after Task 1 (and Task 2 if already merged). PR → v3/integration only.

You implement Task 4 ONLY from docs/superpowers/plans/2026-07-24-v3-craft-completion.md. LAYOUT: Home is ScreenShell wide + .fluid-grid — garden SVG must feel intentional inside that system; do not wrap Home in a new max-width shell or md: grid. Use Refero for 1–2 references first (the original garden looked bolted-on partly from no reference). Redesign AdherenceGarden SVG craft so it feels intentional; only-grows SAFETY intact. If a genuine redesign still doesn't earn Home, the demote fallback is accepted (owner picks) — do not force a bad garden onto Home. Seed via Debug HUD; ATTACH Home screenshots at 1280 and 390. typecheck + vitest green before PR.
[+ shared rules block]
```

### Track E — Grok or ChatGPT luna (`/home/arnavbansal/MW-v3-craftE`, `v3/craft-hub-polish`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-craftE
BRANCH (mandatory): v3/craft-hub-polish
FIRST run: cd /home/arnavbansal/MW-v3-craftE  (you are launched from ~/MirrorWell — cd into your own worktree before anything else, and stay there).
Run pwd and branch check; STOP if wrong. Confirm Task 1 on origin/v3/integration. PR → v3/integration only.

You implement Task 5 ONLY from docs/superpowers/plans/2026-07-24-v3-craft-completion.md. This track is MOST layout-sensitive: polish Summary/Trends/Caregiver/Export/Settings **inside** Task 1's system (wide shells, .fluid-grid for tile collections, inner max-w-shell only for linear forms). Do NOT reintroduce md:/lg: content grid swaps or re-cap wide ScreenShells. Leave Trends controls+chart stacked. Do not weaken encouragement-note SAFETY or export exclusions. typecheck + vitest green before PR. ATTACH screenshots at 390/768/1280/1920 for touched hub screens.
[+ shared rules block]
```

## Merge protocol

1. Worker PR → `v3/integration`; CI green **+ viewport screenshots attached** (UI tasks — BLOCKS B2, else not reviewable).
2. Integrator: diffstat, strings/glossary collisions, DOCS-CHANGE, **screenshots present** (not just claimed).
3. Merge A. **STOP: owner visually accepts A from screenshots (BLOCKS B1) BEFORE B/D/E fork.** (B3 is already decided: coaching-only — no pending decision.)
4. Then order: **B → C/D/E** (C after B).
5. Owner smoke on integration; **no main merge / no tag** without explicit owner accept.

## Token economy

- Workers read the plan task + listed files only.
- Integrator reviews stats; deep-read Session/SAFETY diffs.
- Cross-model review encouraged on Track B (session teaching).
