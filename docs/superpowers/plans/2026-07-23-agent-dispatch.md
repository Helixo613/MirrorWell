# V2 Multi-Agent Dispatch — assignments, parallelism, and paste-ready prompts

Integrator: Cursor session (review + merge only, minimal tokens). Every worker agent: own branch, own worktree, PR to `main`, never push to `main` directly.

## Assignment table

| Track | Tasks (V2 plan) | Agent | Why this agent | Runs in parallel with |
| --- | --- | --- | --- | --- |
| A | Task 1 (session centerpiece) then Task 6 (arrival overlay) | **Claude Code** | Metric-adjacent session code; repo rules bite hardest here; strongest reasoning | B, C, D |
| B | Task 2 (nickname) then Task 3 (your why) | **ChatGPT sol** | Schema + validation + export exclusion; careful contract work | A, C, D |
| C | Task 4 (celebration + gentleness stat) then Task 5 (summary polish) | **ChatGPT terra** | One pure function + copy hierarchy; medium weight | A, B, D |
| D1 | Task 7 (caregiver copy pass) | **ChatGPT luna** | Pure copywriting, cheapest model | everything |
| D2 | Task 8 (demo seed data) | **Grok 4.5** | Deterministic data-gen code, self-contained files | everything |
| D3 | Task 9 (Vercel deploy) | **Antigravity CLI + you** | Needs your Vercel account; agent preps `vercel.json`, you click deploy | everything |

Within a track, tasks are SEQUENTIAL (same files). Across tracks, everything is parallel. Six agents can run at once.

**V3 note (done):** V2 is merged and tagged `v2.0`. For V3 use `docs/superpowers/plans/2026-07-23-v3-agent-dispatch.md` and `docs/superpowers/plans/2026-07-23-v3-session-handoff.md` — Task 1 (responsive layout) still runs ALONE before V3 Tasks 2–6 fan out.

## One-time setup (you, in the repo root)

Each locally-running agent gets its own worktree so they never fight over the working directory:

```bash
git fetch origin
git worktree add ../MW-trackA -b v2/session-centerpiece origin/main
git worktree add ../MW-trackB -b v2/profile-personal origin/main
git worktree add ../MW-trackC -b v2/summary-celebration origin/main
git worktree add ../MW-trackD1 -b v2/caregiver-copy origin/main
git worktree add ../MW-trackD2 -b v2/demo-seed origin/main
git worktree add ../MW-trackD3 -b v2/vercel-deploy origin/main
```

Point each CLI agent at its own `../MW-*` directory. Web-based agents (ChatGPT) that can't run locally: give them the prompt below; they return diffs/files, and you apply them in the matching worktree and run the verification commands yourself (or hand application to a cheap CLI agent).

After a PR merges: `git worktree remove ../MW-<track>` and delete the branch.

## Shared rules block (include in EVERY prompt below)

```
REPO RULES (binding, from CLAUDE.md/AGENTS.md — violating any is a defect):
- docs/ are the source of truth; docs/ARCHITECTURE.md §12 is the identifier glossary. Never invent identifiers; amend the glossary in the same commit if the plan says so.
- No new dependencies. No network calls anywhere in app code.
- All user-facing strings in src/config/strings.ts (add keys ONLY inside your feature's own nested block); all tunables in src/config/thresholds.ts.
- Storage only via StorageService; never touch Dexie/IndexedDB directly.
- Copy must pass docs/SAFETY_AND_COMPLIANCE.md §8: no guilt, no "push harder", celebrate restraint.
- Verify with `npm run typecheck` (tsc -b; NEVER `npx tsc --noEmit` — it checks nothing) and `npx vitest run`. Done = both green.
- Doc amendments listed in your task go in the SAME commit, with a `DOCS-CHANGE: <doc> §<n> — <what>` line in the commit body.
- Commit to your branch only. Open a PR to main. Never push to main.
```

## Paste-ready prompts

### Track A — Claude Code (worktree `/home/arnavbansal/MW-trackA`, branch `v2/session-centerpiece`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-trackA
BRANCH (mandatory): v2/session-centerpiece
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch.

You are implementing Task 1, then Task 6, from docs/superpowers/plans/2026-07-23-v2-flash-layer.md in this repo. Read that plan file first — it contains exact files, steps, test code, and doc amendments. Task 1's status note points to reverted reference commit 2e1bbe1 (`git show 2e1bbe1`); you may cherry-pick it as your starting point, then complete the remaining steps. Do Task 1 fully (tests green, committed) before starting Task 6. Follow every step's checkbox order: failing test → implement → green → commit.
[+ shared rules block]
```

### Track B — ChatGPT sol (worktree `/home/arnavbansal/MW-trackB`, branch `v2/profile-personal`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-trackB
BRANCH (mandatory): v2/profile-personal
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch. (If you cannot access a filesystem, output unified diffs against origin/main plus the exact commit messages instead.)

You are implementing Task 2 (nickname), then Task 3 (motivation/"your why"), from docs/superpowers/plans/2026-07-23-v2-flash-layer.md. Read the plan file first. Key invariants: both fields optional on UserProfile, validated in StorageService.saveProfile (nickname ≤30 chars, motivation ≤120 chars), EXCLUDED from src/data/export.ts with a test proving the export JSON never contains them, glossary + DATABASE + SAFETY doc amendments in the same commits. Task 2 fully done before Task 3.
[+ shared rules block]
```

### Track C — ChatGPT terra (worktree `/home/arnavbansal/MW-trackC`, branch `v2/summary-celebration`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-trackC
BRANCH (mandatory): v2/summary-celebration
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch. (If you cannot access a filesystem, output unified diffs against origin/main plus the exact commit messages instead.)

You are implementing Task 4 (celebratory close-out + gentlenessStat), then Task 5 (summary copy hierarchy), from docs/superpowers/plans/2026-07-23-v2-flash-layer.md. Read the plan file first. gentlenessStat is TDD'd (0-rep, mixed, all-gentle cases); animation is CSS-only and gated by prefers-reduced-motion; copy celebrates restraint and never shames the remainder. Task 4 fully done before Task 5.
[+ shared rules block]
```

### Track D1 — ChatGPT luna (worktree `/home/arnavbansal/MW-trackD1`, branch `v2/caregiver-copy`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-trackD1
BRANCH (mandatory): v2/caregiver-copy
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch. (If you cannot access a filesystem, output unified diffs against origin/main plus the exact commit messages instead.)

You are implementing Task 7 (caregiver copy warmth pass) from docs/superpowers/plans/2026-07-23-v2-flash-layer.md. Strings-only change in src/config/strings.ts (caregiver block). Read docs/SAFETY_AND_COMPLIANCE.md §8 first and obey it: warm, plain language, celebrates consistency, zero judgment-implying numbers. No code or doc changes.
[+ shared rules block]
```

### Track D2 — Grok 4.5 (worktree `/home/arnavbansal/MW-trackD2`, branch `v2/demo-seed`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-trackD2
BRANCH (mandatory): v2/demo-seed
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch.

You are implementing Task 8 (two-month demo seed) from docs/superpowers/plans/2026-07-23-v2-flash-layer.md. Extend src/dev/seed.ts (generator) — verify scripts/seed-dev.ts and the DebugOverlay seed button pick it up. ~60 days ending today, 4–6 sessions/week, symmetry mean drifting 0.55→0.78 with noise, declining easeOffCount, missed days for realism, deterministic inline mulberry32 PRNG (no dependency). All rows MUST go through StorageService.saveSession and pass its validation (integer durationMs, 0|1 flags).
[+ shared rules block]
```

### Track D3 — Antigravity CLI (worktree `/home/arnavbansal/MW-trackD3`, branch `v2/vercel-deploy`)

```
WORKING DIRECTORY (mandatory): /home/arnavbansal/MW-trackD3
BRANCH (mandatory): v2/vercel-deploy
Do all work only in that directory on that branch. Before anything else run `pwd` and `git rev-parse --abbrev-ref HEAD` and STOP if either is wrong. Never switch to main or another worktree. Commit only to this branch.

You are implementing Task 9 (Vercel deploy config) from docs/superpowers/plans/2026-07-23-v2-flash-layer.md. Create vercel.json (static npm run build output, SPA fallback, long Cache-Control for /wasm and /models) + a README deploy note. Env vars to document for the human deployer: VITE_CONSENT_VERSION=1, VITE_DEMO_MODE_ENABLED=true, VITE_ENABLE_DEBUG_HUD=false. CRITICAL acceptance: the served HTML must equal dist/index.html — Vercel must inject no analytics/scripts (this app has a hard no-network rule). The human does the actual deploy + phone-install test + records the 15 s phone clip.
[+ shared rules block]
```

## Merge protocol (integrator)

1. Worker opens PR; CI/tests must be green on the branch.
2. Integrator checks ONLY: `git diff main...<branch> --stat` scope sanity, strings/glossary blocks don't collide, `DOCS-CHANGE` lines present, then runs `npm run typecheck && npx vitest run` on the merged preview.
3. Merge order when several are ready: D1 → D2 → C → B → A → D3 (smallest/least-conflicting first; A touches the most shared session files so it rebases last).
4. Tag `v2.0` when all six are in.

## Token-economy rules for this setup

- The plan files ARE the context: workers read the plan + only the files their task lists. No repo-wide exploration.
- Cursor integrator reviews diffs and stats, never whole files; deep review only if tests fail or the diff touches files outside the task's list.
- Cross-model review is free leverage: if a PR looks risky, paste its diff to a DIFFERENT provider's cheap model for a second opinion instead of burning Cursor tokens.
