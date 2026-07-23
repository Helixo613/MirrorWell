# Session handoff — MirrorWell V3 dispatch (2026-07-23)

For a fresh agent (Claude Code / Cursor / ChatGPT / Grok / other). **Do not re-explore the whole repo — read the linked plans and execute your track.**

## Current product state (do not redo)

1. **V1 + V2 are on `main`.** Tagged `v1.0` (core) and `v2.0` (flash layer).
2. **V2 shipped:** coach line + effort meter, arrival breath (polished), About-you onboarding (nickname + why), Settings profile edit, gentleness summary, caregiver copy warmth, demo seed, Vercel config, calibration Not now, export privacy for nickname/motivation.
3. **Demo format (locked):** fully live Zoom; presenter's Zoom camera OFF (app owns webcam); recorded clip in next tab as fallback; desktop-first responsive; calm-clinical; gauge centerpiece.
4. **Execution model (locked):** multi-agent, one track per worktree/branch, PRs into `main`, integrator merges. Prefer integration/`v3/*` branches — never push straight to `main` from a worker.

## Canonical docs (read these, not the chat)

| Doc | Path |
| --- | --- |
| V3 plan (tasks 1–7) | `docs/superpowers/plans/2026-07-23-v3-full-product.md` |
| V3 agent dispatch (assignments + paste prompts) | `docs/superpowers/plans/2026-07-23-v3-agent-dispatch.md` |
| V2 plan (historical / done) | `docs/superpowers/plans/2026-07-23-v2-flash-layer.md` |
| Repo rules | `CLAUDE.md` / `AGENTS.md` / `AGENTS_SKILLS.md` |

## Track → worktree → branch → agent

| Track | Worktree | Branch | Agent | Tasks | When |
| --- | --- | --- | --- | --- | --- |
| A | `/home/arnavbansal/MW-v3-trackA` | `v3/responsive-layout` | Claude Code | V3 Task 1 | **Now (alone)** |
| F | `/home/arnavbansal/MW-v3-trackF` | `v3/demo-runbook` | ChatGPT luna | V3 Task 7 | Anytime |
| B | `/home/arnavbansal/MW-v3-trackB` | `v3/voice-coach` | ChatGPT sol | V3 Task 2 | After A merges |
| C | `/home/arnavbansal/MW-v3-trackC` | `v3/garden-milestones` | ChatGPT terra | V3 Task 3 then 5 | After A merges |
| D | `/home/arnavbansal/MW-v3-trackD` | `v3/encouragement-note` | Claude / sol | V3 Task 4 | After A merges (SAFETY first) |
| E | `/home/arnavbansal/MW-v3-trackE` | `v3/progress-card` | Grok 4.5 | V3 Task 6 | After A merges |

Merge order: **A first**, then F anytime; after A: E → C → B → D preferred. Tag `v3.0` when all seven tasks are in.

## If you are Claude Code on Track A

1. Create/enter worktree: `cd /home/arnavbansal/MW-v3-trackA` (see dispatch setup if missing)
2. Confirm: `pwd` and `git rev-parse --abbrev-ref HEAD` → `v3/responsive-layout`
3. Open `docs/superpowers/plans/2026-07-23-v3-agent-dispatch.md` → paste-ready **Track A** prompt
4. Open `docs/superpowers/plans/2026-07-23-v3-full-product.md` → Task 1 only
5. Never push to `main`. Commit on your branch; open a PR.

## Suggested skills for next agent

- `executing-plans` or `subagent-driven-development` for V3 task checkboxes
- `verification-before-completion` before claiming done (`npm run typecheck` + `npx vitest run`)
- `agents-skills-policy` / `AGENTS_SKILLS.md` for token routing
- Track A only: optional Refero MCP for shell/layout craft (plan locks still win — see V3 plan Task 1)
- Track D: re-read SAFETY before any code; doc carve-out commit first

## What NOT to redo

- V2 flash-layer features (coach, arrival, nickname/why, seed, gentleness, vercel.json)
- Neutral-rebased effortIndex / calibration math
- Inventing identifiers, deps, or network calls
- Starting Tracks B–E before Task 1 is merged to `main`
- Implementing caregiver note without the SAFETY carve-out commit
