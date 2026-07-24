# Session handoff: MirrorWell V2 dispatch (2026-07-23)

For a fresh agent (Claude Code / Cursor / other). Prior chat was on Cursor Fable 5, then Grok 4.5; usage forced the switch. **Do not re-explore the whole repo; read the linked plans and execute your track.**

## What this chat decided

1. **V1 is done and on `main`.** Core capture, calibration, neutral-rebased `effortIndex`, effort meter, session stop/save fixes. Tagged `v1.0` at `176c97a`.
2. **Coach-line V2 work was reverted off main** so main stays calibration-only + plans. Reference commit for Task 1 plumbing: `2e1bbe1` (`git show 2e1bbe1`).
3. **Demo format (locked):** fully live Zoom screen share; presenter's Zoom camera OFF (app owns webcam); recorded clip in the next tab as fallback. Desktop-first responsive, calm-clinical UI, session gauge as centerpiece.
4. **Execution model (locked):** multi-agent, one track per worktree/branch, PRs into `main`, integrator merges. Cursor session = review/merge only (token-limited).

## Canonical docs (read these, not the chat)

| Doc | Path |
| --- | --- |
| V2 plan (tasks 1–9) | `docs/superpowers/plans/2026-07-23-v2-flash-layer.md` |
| V3 plan (after V2) | `docs/superpowers/plans/2026-07-23-v3-full-product.md` |
| Agent dispatch (assignments + paste prompts) | `docs/superpowers/plans/2026-07-23-agent-dispatch.md` |
| Repo rules | `CLAUDE.md` / `AGENTS.md` / `AGENTS_SKILLS.md` |

## Track → worktree → branch → agent

| Track | Worktree | Branch | Agent | Tasks |
| --- | --- | --- | --- | --- |
| A | `/home/arnavbansal/MW-trackA` | `v2/session-centerpiece` | Claude Code | V2 Task 1 then 6 |
| B | `/home/arnavbansal/MW-trackB` | `v2/profile-personal` | ChatGPT sol | V2 Task 2 then 3 |
| C | `/home/arnavbansal/MW-trackC` | `v2/summary-celebration` | ChatGPT terra | V2 Task 4 then 5 |
| D1 | `/home/arnavbansal/MW-trackD1` | `v2/caregiver-copy` | ChatGPT luna | V2 Task 7 |
| D2 | `/home/arnavbansal/MW-trackD2` | `v2/demo-seed` | Grok 4.5 | V2 Task 8 |
| D3 | `/home/arnavbansal/MW-trackD3` | `v2/vercel-deploy` | Antigravity + human | V2 Task 9 |

All six tracks run **in parallel**. Within a track, tasks are sequential. Merge order when PRs land: D1 → D2 → C → B → A → D3. Tag `v2.0` when all six are in. **Do not start V3 until V2 is merged.**

## If you are Claude Code on Track A

1. `cd /home/arnavbansal/MW-trackA`
2. Confirm: `pwd` and `git rev-parse --abbrev-ref HEAD` → must be `v2/session-centerpiece`
3. Open `docs/superpowers/plans/2026-07-23-agent-dispatch.md` → paste-ready **Track A** prompt (includes shared rules)
4. Open `docs/superpowers/plans/2026-07-23-v2-flash-layer.md` → Task 1 (status note: start fresh; `2e1bbe1` is reference only), then Task 6
5. Never push to `main`. Commit on your branch; open a PR.

## Suggested skills for next agent

- `executing-plans` or `subagent-driven-development` for the V2 task checkboxes
- `verification-before-completion` before claiming done (`npm run typecheck` + `npx vitest run`)
- `agents-skills-policy` / `AGENTS_SKILLS.md` for token routing (graph → Serena → rg; context-mode for large output)

## What NOT to redo

- Neutral-rebased effort, effort meter, durationMs rounding, demo quick-setup floors; already on `main`
- Inventing new identifiers, deps, or network calls
- Implementing V3 before V2 tracks merge
