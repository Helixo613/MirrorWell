# V3 Multi-Agent Dispatch: assignments, parallelism, and paste-ready prompts

Integrator: Cursor session (review + merge only, minimal tokens). Every worker agent: own branch, own worktree, **PR to `v3/integration` (never to `main`)**. When all V3 tasks are green on `v3/integration`, the integrator merges that branch to `main` once and tags `v3.0`.

**Prerequisite (met):** V2 flash layer is on `main`, tagged `v2.0`. Plan: `docs/superpowers/plans/2026-07-23-v3-full-product.md`.

**Integration base (current):** `origin/v3/integration` already includes Task 1 (AppShell) + e2e assertion fixes. **All feature tracks rebase onto `origin/v3/integration` before coding.** Do not wait for Task 1 on `main`, `main` stays clean until the full V3 integration lands.

**Refero MCP (Track A only, optional):** For Task 1 UI craft, agents may consult Refero MCP for real-app layout patterns. Locked plan decisions win. Tracks B–F do not need Refero. Track A is already merged into `v3/integration`; do not re-run it.

## Assignment table

| Track | Tasks (V3 plan) | Agent | Why this agent | Starts when |
| --- | --- | --- | --- | --- |
| A | Task 1 (responsive layout) | **Claude Code** | Done, already on `v3/integration` | **Done** |
| B | Task 2 (voice coaching) | **ChatGPT sol** | New setting + `VoiceCoach` + session wiring | **Now** (after rebase) |
| C | Task 3 (garden) then Task 5 (milestones) | **ChatGPT terra** | Pure mappers + HomeScreen | **Now** (after rebase) |
| D | Task 4 (caregiver encouragement note) | **Claude Code** or **ChatGPT sol** | SAFETY carve-out first | **Now** (after rebase) |
| E | Task 6 (weekly progress card) | **Grok 4.5** | Canvas composer + export | **Now** (after rebase) |
| F | Task 7 (demo runbook) | **ChatGPT luna** | Docs-only | **Now** (after rebase) |

Within a track, tasks are SEQUENTIAL. Across B–F, work in parallel after rebase.

## Rebase existing worktrees onto integration (run once, you)

```bash
git fetch origin
for d in B C D E F; do
  command git -C /home/arnavbansal/MW-v3-track$d fetch origin
  command git -C /home/arnavbansal/MW-v3-track$d rebase origin/v3/integration
done
# Track A can be removed later: its commits are already in v3/integration
```

If a worktree was never created, cut it from integration instead of `main`:

```bash
git worktree add ../MW-v3-trackB -b v3/voice-coach origin/v3/integration
# same for C/D/E/F with their branch names
```

Each worktree needs `node_modules` + wasm if missing:

```bash
ln -sfn /home/arnavbansal/MirrorWell/node_modules node_modules
node --experimental-strip-types scripts/copy-wasm.ts
```

## Shared rules block (include in EVERY prompt below)

```
REPO RULES (binding, from CLAUDE.md/AGENTS.md; violating any is a defect):
- docs/ are the source of truth; docs/ARCHITECTURE.md §12 is the identifier glossary. Never invent identifiers; amend the glossary in the same commit if the plan says so.
- No new dependencies. No network calls anywhere in app code. Browser built-ins only (speechSynthesis, canvas, SVG, CSS).
- All user-facing strings in src/config/strings.ts (add keys ONLY inside your feature's own nested block); all tunables in src/config/thresholds.ts.
- Storage only via StorageService; never touch Dexie/IndexedDB directly.
- Copy must pass docs/SAFETY_AND_COMPLIANCE.md §8: no guilt, no "push harder", celebrate restraint. Garden never wilts.
- Verify with `npm run typecheck` (tsc -b; NEVER `npx tsc --noEmit`; it checks nothing) and `npx vitest run`. Done = both green.
- Doc amendments listed in your task go in the SAME commit, with a `DOCS-CHANGE: <doc> §<n>, <what>` line in the commit body.
- Commit to your branch only. Open a PR targeting v3/integration; NEVER main.
- Base branch is origin/v3/integration (includes AppShell + green e2e). Do not re-implement Task 1 or V2 features.
```

## Paste-ready prompts

### Track B: ChatGPT sol (worktree `/home/arnavbansal/MW-v3-trackB`, branch `v3/voice-coach`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackB
BRANCH (mandatory): v3/voice-coach
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm this branch is based on origin/v3/integration (AppShell present: src/components/layout/AppShell.tsx); if not, STOP and ask for a rebase. Commit only to this branch. PR target: v3/integration (not main).

You are implementing Task 2 from docs/superpowers/plans/2026-07-23-v3-full-product.md. Create VoiceCoach in src/session/voice.ts (glossary BEFORE code). voiceCoachEnabled default false. voiceMinGapMs in thresholds.feedback. Speak only on coachPhase CHANGES and repComplete; cancel previous utterance. Local speechSynthesis only; never network TTS. TDD with mocked speechSynthesis. Amend ARCHITECTURE §12, DATABASE, FRONTEND §2.4, SAFETY (local voice note) in the same commits.
[+ shared rules block]
```

### Track C: ChatGPT terra (worktree `/home/arnavbansal/MW-v3-trackC`, branch `v3/garden-milestones`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackC
BRANCH (mandatory): v3/garden-milestones
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm based on origin/v3/integration (AppShell present); if not, STOP. Commit only to this branch. PR target: v3/integration (not main).

You are implementing Task 3 (AdherenceGarden), then Task 5 (milestones), from docs/superpowers/plans/2026-07-23-v3-full-product.md. Task 3 fully done before Task 5. Garden ONLY GROWS; never wilt/shrink/broken-streak (SAFETY §8). Pure gardenWeeks mapper TDD'd first. Milestones are derived (zero storage). Copy celebrates practice, never performance. Amend glossary + FRONTEND + SAFETY garden note in-commit. Home uses AppShell nav; do not re-add QuietNavList.
[+ shared rules block]
```

### Track D: Claude Code or ChatGPT sol (worktree `/home/arnavbansal/MW-v3-trackD`, branch `v3/encouragement-note`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackD
BRANCH (mandatory): v3/encouragement-note
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm based on origin/v3/integration; if not, STOP. Commit only to this branch. PR target: v3/integration (not main).

You are implementing Task 4 from docs/superpowers/plans/2026-07-23-v3-full-product.md. STEP 1 IS A DOC COMMIT ONLY: amend SAFETY with the narrow encouragement-note carve-out (one free-text note, max 200 chars, local, user-dismissible, never gates exercise). Do not write feature code until that doc commit exists. Then schema + StorageService + CaregiverScreen compose + arrival/pre-session display + export exclusion test. Glossary: encouragement_note, noteId.
[+ shared rules block]
```

### Track E: Grok 4.5 (worktree `/home/arnavbansal/MW-v3-trackE`, branch `v3/progress-card`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackE
BRANCH (mandatory): v3/progress-card
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Confirm based on origin/v3/integration; if not, STOP. Commit only to this branch. PR target: v3/integration (not main).

You are implementing Task 6 from docs/superpowers/plans/2026-07-23-v3-full-product.md. Offline canvas PNG weekly card (1080×1350), local download only; reuse ExportScreen download helper, do not invent a new download path. Reuse gentlenessStat from V2. No raw metrics tables. No new dependencies. Glossary progressCard. Unit-test week aggregation, not pixels.
[+ shared rules block]
```

### Track F: ChatGPT luna (worktree `/home/arnavbansal/MW-v3-trackF`, branch `v3/demo-runbook`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-v3-trackF
BRANCH (mandatory): v3/demo-runbook
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Prefer rebase onto origin/v3/integration first. Commit only to this branch. PR target: v3/integration (not main). (If you cannot access a filesystem, output the full markdown file contents plus the commit message.)

You are implementing Task 7 from docs/superpowers/plans/2026-07-23-v3-full-product.md. Docs-only; no app code. If docs/superpowers/plans/2026-07-23-demo-runbook.md already exists (from V2), EXTEND it to the full V3 checklist rather than duplicating a second file: live Zoom flow, presenter's Zoom camera OFF, Share sound ON, Optimize for video clip OFF, recorded fallback tab, 12-min script, rehearsal gate (two dry runs + Slow 4G). Obey SAFETY §8 in any demo narration copy.
[+ shared rules block]
```

## Merge protocol (integrator)

1. Worker opens PR **into `v3/integration`**; typecheck + vitest green.
2. Integrator checks: `git diff v3/integration...<branch> --stat`, strings/glossary collisions, `DOCS-CHANGE` lines.
3. Preferred merge order into integration: F → E → C → B → D (D last, SAFETY-sensitive).
4. When Tasks 2–7 are all on `v3/integration` and manual smoke is good: merge `v3/integration` → `main`, tag `v3.0`.

## Token-economy rules

- Plan file + listed paths only; no repo-wide exploration.
- Integrator reviews diff stats; deep-read only on SAFETY/schema tracks (D) or failed tests.
- Cross-model second opinion on Track D before merge into integration.
