# MirrorWell operating rules — answers to the 20 consult questions (2026-07-24)

Derived from: `docs/README.md`, V2/V3 plan + dispatch files under `docs/superpowers/plans/`, and the 2026-07-24 full-session handoff / owner smoke feedback.  
**Audience:** any agent writing or executing V4. These are standing rules until the owner amends this file.

---

## Vision — what the project should be

### 1. True north
**Both, stacked:** the docs’ intended-use is the product truth — an **educational, on-device exercise-support tool** for adults on a **clinician-assigned** facial-retraining program (research/prototype posture, not a certified medical device).  

The *execution bar* is **shippable feel**: someone who is not a developer must understand what to do, trust the calm-clinical UI, and use it on phone or desktop.  

So: not “demo-only theater,” not “portfolio of features,” not “paper with a UI stub.” Destination = **research prototype that behaves like a real patient-facing companion** under SAFETY constraints. Zoom/demo is a *delivery surface*, not the end state.

### 2. Clinician/patient in the loop
**Intended product:** real patients + clinicians (export for appointments; caregiver on-device).  
**Current build reality:** mostly **solo owner build + multi-agent execution**, validated by owner smoke and demo/rehearsal gates.  

Agents must design for the **intended** user (confused first-time patient after calibration), not for the integrator who already knows the green band.

### 3. Hard walls (no network / no server / offline / on-device)
**Permanent product principles**, not phase simplifications — stated as “by design” in `docs/README.md` and binding in `CLAUDE.md`. Do not propose cloud TTS, accounts, sync, or analytics as V4 “improvements.” Browser built-ins only (`speechSynthesis`, canvas, SVG, CSS).

### 4. What “done” looks like for the whole project
Not a version tag. Whole-project done ≈:

- A new user can calibrate once, **learn the movement**, complete reps with clear hold→release guidance, and stop safely.
- The app feels like **one product** at phone and desktop (shared language; chrome adapts).
- Motivation surfaces (garden/voice/card) **earn** their place — craft ≥ concept.
- Offline, local-only, SAFETY §8 intact; sensing core remains trustworthy.
- Owner can demo live Zoom + fallback without apologizing for the UI.

Versions (`v2.0`, `v3.0`, …) are **checkpoints** toward that, not the destination.

---

## Plans — how they must be structured

### 5. Self-contained plan files
**Yes — standing rule.** Plans live under `docs/superpowers/plans/`, executable by a mid-tier agent (e.g. Sonnet) **without the owner in the loop**. Pair with a **dispatch** file of paste-ready prompts (see V2 `2026-07-23-agent-dispatch.md`, V3 `2026-07-23-v3-agent-dispatch.md`).

### 6. Granularity
**Task-by-task with runnable verification**, like `IMPLEMENTATION.md` and the V2 flash plan: checkbox steps, failing test → implement → green → commit where logic exists.  

UI craft tasks still need **explicit acceptance** (viewport matrix, manual smoke bullets) because tests alone under-specify craft — that gap is why V3 felt half-UI.

### 7. Prescriptive vs freedom
**Prescriptive on contracts; latitude only where the plan locks design first.**

- Identifiers, files, schema, SAFETY, strings/thresholds nesting, PR target: **spelled out** (no invented identifiers).
- Visual craft: plan must **lock** metaphor, breakpoint, shell rules, non-goals (as V3 Task 1 locked desktop-first / one breakpoint / session chrome-free). Agents may use Refero **only** when the plan says so, and locked decisions win.

Do not leave “make it look good” as an unscoped agent judgment call.

### 8. Acceptance criteria / tests in every plan task
**Yes.** Every task carries:

- Files to touch  
- Test / verify line (`typecheck` + vitest + any e2e/manual matrix)  
- Doc amendments + `DOCS-CHANGE`  
- **Craft/smoke acceptance** when UI is in scope (so “done” ≠ green CI alone)

Dispatch “Done = typecheck + vitest” remains the **agent merge gate**; **version accept / tag** additionally requires **owner manual smoke** on the integration branch (V3 dispatch already said this; owner enforced it).

---

## Agent handoff — what it means

### 9. What a handoff is for
**Both:** survive context-limit/session-end **and** cold-onboard a fresh model. Prefer one durable repo file over chat memory.

### 10. Standard handoff template
Use the **full-session** shape (see `2026-07-24-full-session-handoff.md`), not UX-only:

1. Product true north + constraints  
2. Process (worktrees, integration, PR target)  
3. Git/state tip SHAs  
4. What shipped this session  
5. Lessons / footguns  
6. Owner feedback / open decisions  
7. What the next agent must produce  
8. Suggested skills  

UX critique can be a section inside that, not a replacement.

### 11. Model-agnostic
**Yes.** Handoffs and dispatch prompts must work cold for Claude / GPT / Grok / Cursor. Absolute worktree paths + branch names + plan paths in every paste prompt.

### 12. When to write a handoff
**Proactively** at: version/milestone boundaries, before multi-agent fan-out, end of integrator sessions that changed process, and when context is near limit. Not optional fluff after every tiny commit.

---

## How agents should act

### 13. Roles
**Shifts by task weight** (as in V2/V3 assignment tables), not a forever caste system:

- **Integrator (Cursor):** review, merge, conflict union, process docs — minimal tokens.  
- **Claude Code:** high-reasoning / SAFETY-first / session-adjacent / layout spine.  
- **ChatGPT (sol/terra/luna):** medium contract, copy, mappers, docs-only.  
- **Grok:** self-contained modules (seed, canvas card, similar).  

Within a track: tasks **sequential**. Across tracks: parallel only after shared foundation merges.

### 14. Consult-first gate
**Standing for new programs and direction changes** (e.g. V4 redesign): brainstorm/plan → owner says implement → then execute.  

**Once a version plan + dispatch is accepted:** workers implement task-by-task **without** re-asking per checkbox. Stop and ask only on missing decisions, contradictions, or impossible APIs (repo deviation protocol).

### 15. Craft self-check before claiming done
**Necessary:** `npm run typecheck` + `npx vitest run` (and task e2e if listed).  
**Not sufficient for UI/version accept:**

- Manual viewport matrix when layout is in scope (V3 Task 1: 1920 / 1280 / 768 / 390)  
- Owner smoke on `vN/integration` before merge to `main` + tag  
- Screenshots / short clips encouraged for session/onboarding teaching surfaces  
- Agent must not claim “product ready” on CI green alone

### 16. Adversarial / independent review
**Required** for SAFETY/schema/caregiver carve-outs, sensing/rep FSM changes, export privacy.  
**Encouraged** for large UI spines.  
**Not required** for every strings-only or docs-only PR — still integrator scope check.

(V3 already required cross-model second opinion on Track D.)

### 17. Worktree + integration sandbox + tag-on-accept
**Permanent process going forward** (V3 pattern is the template; prefer it over V2’s PRs-to-`main`):

- Sibling worktrees `MW-vN-track*`  
- Shared base `vN/integration`  
- PRs **into integration**, never straight to `main`  
- Owner smoke → merge integration → `main` → tag `vN.0`  

Foundation tracks that other work must rebase on (e.g. design system) run **alone first**.

---

## Diagnosis — why V3 felt half-UI (owner-aligned)

### 18. Why multi-agent V3 produced half-UI
Primary causes (this session’s read, matching owner smoke):

1. **Parallel feature tracks without a shared design system** — Task 1 shipped AppShell/nav, not a full visual system or onboarding/session teaching language.  
2. **“Done = tests green” in worker prompts** — craft and first-run clarity were under-specified vs V2’s Zoom-legible session craft.  
3. **Feature packing** (voice, garden, note, card, milestones) before the **session teaching metaphor** was good enough for a real new user.  
4. Plans prescribed **thin** voice/garden implementations that pass TDD but fail owner feel.

Not mainly “wrong agents” — **wrong foundation order + weak craft gate**.

### 19. Fewer, deeply-owned surfaces next time?
**Yes.** Next program should:

1. Design system + true responsive shell (**alone**)  
2. Session teaching + hold→release + human feedback UI (**alone or tightly serial**)  
3. Then optional voice / garden craft / hub polish — parallel only when file ownership is clean  

Prefer **deep ownership of session + onboarding** over six shallow feature tracks.

### 20. What “half-finished” means concretely
A screen feels half-finished when a **new user** hits any of:

- After calibration, **unclear what motion to do** (no teach / replayable demo of the exercise procedure).  
- In-rep: green lab bars/circles make sense to a **dev**, not a patient; no clear **hold then release** to complete a rep.  
- Voice that is late, creepy, or not procedure-aware.  
- Garden (or other motivation) that looks **bolted on** and lowers trust.  
- Layout that “works” but doesn’t feel like **one** phone/desktop product (static onboarding, inconsistent chrome).  
- Copy/components that keep the calm palette but feel **unusable / non-product**.

Opposite of half-finished: teachable, responsive, calm, procedure-clear — sensing already trusted.

---

## How V2/V3 execution maps (for plan authors)

| Artifact | Role |
| --- | --- |
| `*-full-product.md` or `*-flash-layer.md` | Goal, architecture constraints, **parallelism map**, numbered tasks with files/steps/tests/docs |
| `*-agent-dispatch.md` | Track→agent→worktree→branch, shared rules block, **paste-ready prompts**, merge order, token economy |
| `*-session-handoff.md` / full-session handoff | Cold start for humans/agents mid-program |
| Integrator | Merge to `vN/integration`, conflict union on glossary/strings, smoke gate, promote + tag |

**V4 must follow this shape**, with one addition locked by owner feedback: **craft/smoke acceptance inside UI tasks**, and **foundation-first fan-out**.

---

## One-line operating summary

> Plans and dispatch like V2/V3; integration sandbox permanent; agents execute accepted plans without babysitting; version tags wait on owner smoke; V4 starts with design system + teachable session — not more parallel ornaments.
