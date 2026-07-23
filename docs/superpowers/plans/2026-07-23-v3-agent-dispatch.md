# V3 Multi-Agent Dispatch — assignments, parallelism, and paste-ready prompts

Integrator: Cursor session (review + merge only, minimal tokens). Every worker agent: own branch, own worktree, PR to `main`, never push to `main` directly.

**Prerequisite (met):** V2 flash layer is on `main`, tagged `v2.0`. Plan: `docs/superpowers/plans/2026-07-23-v3-full-product.md`.

**Critical sequencing:** Track A (responsive layout) must **merge first**. Tracks B–E rebase on that merge and must not start coding until A is on `main`. Track F (demo runbook) may run anytime, even before A.

## Assignment table

| Track | Tasks (V3 plan) | Agent | Why this agent | Starts when |
| --- | --- | --- | --- | --- |
| A | Task 1 (responsive layout) | **Claude Code** | Touches shell + many screens; strongest reasoning; must land alone | **Now** (alone) |
| B | Task 2 (voice coaching) | **ChatGPT sol** | New setting + `VoiceCoach` module + session wiring; careful contracts | After A merges |
| C | Task 3 (garden) then Task 5 (milestones) | **ChatGPT terra** | Pure data mappers + HomeScreen; medium weight | After A merges |
| D | Task 4 (caregiver encouragement note) | **Claude Code** or **ChatGPT sol** | SAFETY carve-out first, then schema; highest compliance risk | After A merges |
| E | Task 6 (weekly progress card) | **Grok 4.5** | Canvas composer + export download; self-contained | After A merges |
| F | Task 7 (demo runbook) | **ChatGPT luna** | Docs-only; cheapest; no app code | **Anytime** (parallel with A) |

Within a track, tasks are SEQUENTIAL. After A merges, B / C / D / E / F can all run in parallel.

## One-time setup (you, in the repo root)

Use **new** worktrees so they do not collide with leftover V2 `MW-track*` dirs:

```bash
git fetch origin

# Phase 0 — start A (and optionally F) now:
git worktree add ../MW-v3-trackA -b v3/responsive-layout origin/main
git worktree add ../MW-v3-trackF -b v3/demo-runbook origin/main

# Phase 1 — only AFTER origin/main includes the Track A merge:
git worktree add ../MW-v3-trackB -b v3/voice-coach origin/main
git worktree add ../MW-v3-trackC -b v3/garden-milestones origin/main
git worktree add ../MW-v3-trackD -b v3/encouragement-note origin/main
git worktree add ../MW-v3-trackE -b v3/progress-card origin/main
```

Point each CLI agent at its own `../MW-v3-*` directory. Web-based agents: paste the prompt; they return diffs; apply in the matching worktree.

After a PR merges: `git worktree remove ../MW-v3-<track>` and delete the branch.

Each worktree needs `node_modules` + wasm (gitignored):

```bash
# from a worktree, once:
ln -s /home/arnavbansal/MirrorWell/node_modules node_modules   # or npm ci
node --experimental-strip-types scripts/copy-wasm.ts
```

## Shared rules block (include in EVERY prompt below)

```
REPO RULES (binding, from CLAUDE.md/AGENTS.md — violating any is a defect):
- docs/ are the source of truth; docs/ARCHITECTURE.md §12 is the identifier glossary. Never invent identifiers; amend the glossary in the same commit if the plan says so.
- No new dependencies. No network calls anywhere in app code. Browser built-ins only (speechSynthesis, canvas, SVG, CSS).
- All user-facing strings in src/config/strings.ts (add keys ONLY inside your feature's own nested block); all tunables in src/config/thresholds.ts.
- Storage only via StorageService; never touch Dexie/IndexedDB directly.
- Copy must pass docs/SAFETY_AND_COMPLIANCE.md §8: no guilt, no "push harder", celebrate restraint. Garden never wilts.
- Verify with `npm run typecheck` (tsc -b; NEVER `npx tsc --noEmit` — it checks nothing) and `npx vitest run`. Done = both green.
- Doc amendments listed in your task go in the SAME commit, with a `DOCS-CHANGE: <doc> §<n> — <what>` line in the commit body.
- Commit to your branch only. Open a PR to main. Never push to main.
- Do not re-implement V2 features (nickname, arrival, coach line, seed, gentlenessStat) — they are already on main at tag v2.0.
```

## Paste-ready prompts

### Track A — Claude Code (worktree `/home/arnavbansal/MW-v3-trackA`, branch `v3/responsive-layout`) — START NOW

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackA
BRANCH (mandatory): v3/responsive-layout
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch.

You are implementing Task 1 ONLY from docs/superpowers/plans/2026-07-23-v3-full-product.md. Read that plan file first. Locked design: one dynamic responsive app (no separate mobile build); desktop-first; calm-clinical; session gauge as centerpiece; one breakpoint lg (1024px); session active phase is chrome-free. Inventory src/components/layout/ and navigation first. No new dependencies. Amend FRONTEND §1 in the same commit. Manual matrix: 1920×1080, 1280×800, 768×1024, 390×844. Follow checkbox order; typecheck + vitest green before PR.
[+ shared rules block]
```

### Track F — ChatGPT luna (worktree `/home/arnavbansal/MW-v3-trackF`, branch `v3/demo-runbook`) — MAY START WITH A

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackF
BRANCH (mandatory): v3/demo-runbook
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch. (If you cannot access a filesystem, output the full markdown file contents plus the commit message.)

You are implementing Task 7 from docs/superpowers/plans/2026-07-23-v3-full-product.md. Docs-only — no app code. If docs/superpowers/plans/2026-07-23-demo-runbook.md already exists (from V2), EXTEND it to the full V3 checklist rather than duplicating a second file: live Zoom flow, presenter's Zoom camera OFF, Share sound ON, Optimize for video clip OFF, recorded fallback tab, 12-min script, rehearsal gate (two dry runs + Slow 4G). Obey SAFETY §8 in any demo narration copy.
[+ shared rules block]
```

### Track B — ChatGPT sol (worktree `/home/arnavbansal/MW-v3-trackB`, branch `v3/voice-coach`) — AFTER A MERGES

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackB
BRANCH (mandatory): v3/voice-coach
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm `origin/main` already contains the responsive-layout merge (Task 1); if not, STOP and wait. Commit only to this branch.

You are implementing Task 2 from docs/superpowers/plans/2026-07-23-v3-full-product.md. Create VoiceCoach in src/session/voice.ts (glossary BEFORE code). voiceCoachEnabled default false. voiceMinGapMs in thresholds.feedback. Speak only on coachPhase CHANGES and repComplete; cancel previous utterance. Local speechSynthesis only — never network TTS. TDD with mocked speechSynthesis. Amend ARCHITECTURE §12, DATABASE, FRONTEND §2.4, SAFETY (local voice note) in the same commits.
[+ shared rules block]
```

### Track C — ChatGPT terra (worktree `/home/arnavbansal/MW-v3-trackC`, branch `v3/garden-milestones`) — AFTER A MERGES

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackC
BRANCH (mandatory): v3/garden-milestones
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm Task 1 is on origin/main; if not, STOP. Commit only to this branch.

You are implementing Task 3 (AdherenceGarden), then Task 5 (milestones), from docs/superpowers/plans/2026-07-23-v3-full-product.md. Task 3 fully done before Task 5. Garden ONLY GROWS — never wilt/shrink/broken-streak (SAFETY §8). Pure gardenWeeks mapper TDD'd first. Milestones are derived (zero storage). Copy celebrates practice, never performance. Amend glossary + FRONTEND + SAFETY garden note in-commit.
[+ shared rules block]
```

### Track D — Claude Code or ChatGPT sol (worktree `/home/arnavbansal/MW-v3-trackD`, branch `v3/encouragement-note`) — AFTER A MERGES

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackD
BRANCH (mandatory): v3/encouragement-note
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm Task 1 is on origin/main; if not, STOP. Commit only to this branch.

You are implementing Task 4 from docs/superpowers/plans/2026-07-23-v3-full-product.md. STEP 1 IS A DOC COMMIT ONLY: amend SAFETY with the narrow encouragement-note carve-out (one free-text note, max 200 chars, local, user-dismissible, never gates exercise). Do not write feature code until that doc commit exists. Then schema + StorageService + CaregiverScreen compose + arrival/pre-session display + export exclusion test. Glossary: encouragement_note, noteId.
[+ shared rules block]
```

### Track E — Grok 4.5 (worktree `/home/arnavbansal/MW-v3-trackE`, branch `v3/progress-card`) — AFTER A MERGES

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackE
BRANCH (mandatory): v3/progress-card
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm Task 1 is on origin/main; if not, STOP. Commit only to this branch.

You are implementing Task 6 from docs/superpowers/plans/2026-07-23-v3-full-product.md. Offline canvas PNG weekly card (1080×1350), local download only — reuse ExportScreen download helper, do not invent a new download path. Reuse gentlenessStat from V2. No raw metrics tables. No new dependencies. Glossary progressCard. Unit-test week aggregation, not pixels.
[+ shared rules block]
```

## Merge protocol (integrator)

1. Worker opens PR; typecheck + vitest green on the branch.
2. Integrator checks: `git diff main...<branch> --stat` scope sanity, strings/glossary blocks don't collide, `DOCS-CHANGE` lines present.
3. **Hard order:** A first → then F anytime; after A: prefer F → E → C → B → D (D last among features — SAFETY-sensitive) or merge green PRs as they land if rebase is clean.
4. Tag `v3.0` when Tasks 1–7 are all on `main`.

## Token-economy rules

- Plan file + listed paths only — no repo-wide exploration.
- Integrator reviews diff stats; deep-read only on SAFETY/schema tracks (D) or failed tests.
- Cross-model second opinion on Track D before merge.
