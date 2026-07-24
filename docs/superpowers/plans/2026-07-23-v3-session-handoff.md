# Session handoff: MirrorWell V3 dispatch (2026-07-23)

For a fresh agent (Claude Code / Cursor / ChatGPT / Grok / other). **Do not re-explore the whole repo; read the linked plans and execute your track.**

## Current product state (do not redo)

1. **V1 + V2 are on `main`.** Tagged `v1.0` / `v2.0`.
2. **V3 sandbox is `v3/integration`** (not `main`). Already includes Task 1 AppShell + e2e home/caregiver assertion fixes.
3. **Execution model:** feature tracks rebase onto `origin/v3/integration`, PR **into `v3/integration`**, never into `main`. Integrator merges `v3/integration` → `main` only when V3 is complete.
4. **Demo format (locked):** live Zoom; presenter's Zoom camera OFF; recorded fallback tab; desktop-first; calm-clinical; gauge centerpiece.

## Canonical docs

| Doc | Path |
| --- | --- |
| V3 plan | `docs/superpowers/plans/2026-07-23-v3-full-product.md` |
| V3 agent dispatch | `docs/superpowers/plans/2026-07-23-v3-agent-dispatch.md` |
| Repo rules | `CLAUDE.md` / `AGENTS.md` / `AGENTS_SKILLS.md` |

## Track → worktree → branch → agent

| Track | Worktree | Branch | Agent | Tasks | Status |
| --- | --- | --- | --- | --- | --- |
| A | `/home/arnavbansal/MW-v3-trackA` | `v3/responsive-layout` | Claude Code | Task 1 | **Done** (in integration) |
| B | `/home/arnavbansal/MW-v3-trackB` | `v3/voice-coach` | ChatGPT sol | Task 2 | Rebase → start |
| C | `/home/arnavbansal/MW-v3-trackC` | `v3/garden-milestones` | ChatGPT terra | Task 3 then 5 | Rebase → start |
| D | `/home/arnavbansal/MW-v3-trackD` | `v3/encouragement-note` | Claude / sol | Task 4 | Rebase → start |
| E | `/home/arnavbansal/MW-v3-trackE` | `v3/progress-card` | Grok 4.5 | Task 6 | Rebase → start |
| F | `/home/arnavbansal/MW-v3-trackF` | `v3/demo-runbook` | ChatGPT luna | Task 7 | Rebase → start |

## Before coding (every feature track)

```bash
cd /home/arnavbansal/MW-v3-track<LETTER>
git fetch origin
git rebase origin/v3/integration
# confirm AppShell exists:
test -f src/components/layout/AppShell.tsx && echo ok
```

Then paste the track prompt from `2026-07-23-v3-agent-dispatch.md`.

## What NOT to redo

- Task 1 / AppShell / QuietNavList removal
- V2 flash-layer features
- PRs targeting `main`
- Starting work without rebasing onto `v3/integration`
