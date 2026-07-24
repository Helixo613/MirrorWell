# MirrorWell — Full session handoff (2026-07-24)

**Purpose:** Give a fresh agent the **same understanding** this Cursor session built: what MirrorWell is, how the team works, what shipped (V1→V3), operational lessons, current git state, owner feedback after smoke, and what they want next.  
**Audience:** Claude / ChatGPT / Grok / Cursor / any consultant.  
**Mode:** Consult and plan first unless owner says “implement.”

Transcript (this Cursor chat): `a22ea451-bb4f-43fd-8fe0-c9ca0e536ffc` under the project’s agent-transcripts folder.

---

## 1. What MirrorWell is

Offline-first **facial exercise support PWA** (not a diagnostic/clinical grading tool). Stack: React + Vite + MediaPipe Face Landmarker (WASM bundled, never CDN) + Dexie/IndexedDB via `StorageService` only.

**Non-negotiables** (from `CLAUDE.md` / `AGENTS.md` — treating these as defects if broken):

- **No network calls ever** in app code (no fetch/CDN/telemetry/analytics/cloud TTS). CI no-network gate.
- No camera frames / video / raw landmarks persisted — only derived metrics.
- Camera only on `CalibrationScreen` / `SessionScreen` in production (`src/dev/` harnesses excepted).
- Metrics only on `QUALITY_OK` via `ApprovedFrame` typing.
- Tunables → `src/config/thresholds.ts`; user strings → `src/config/strings.ts`.
- No invented identifiers — glossary `docs/ARCHITECTURE.md` §12 first.
- No new deps beyond pinned table in ARCHITECTURE §2. No Redux/Zustand.
- Never weaken `docs/SAFETY_AND_COMPLIANCE.md` (esp. §8 language: no guilt, no “push harder”).
- Typecheck with **`npm run typecheck` (`tsc -b`)** — never `npx tsc --noEmit` (root tsconfig is empty solution-style; always “passes”).
- Docs in `docs/` win over code if they disagree; don’t invent product decisions — ask.

**Verified platform facts agents keep “correcting” wrongly:** MediaPipe result has no per-frame confidence; WASM from `public/wasm/`; Chromium fake video only `.y4m`/`.mjpeg`; `detectForVideo` takes `HTMLVideoElement`; IndexedDB flags as `0|1` not boolean.

---

## 2. Product arc so far

| Tag / branch | What it is |
| --- | --- |
| **`v1.0` on `main`** | Core: attestation, calibration, 4 exercises, quality gates, rep detection, ease-off, session persistence, Home/Session/Summary/Trends/Caregiver/Export/Settings, demo mode, safety copy. |
| **`v2.0` on `main`** | “Flash layer” for demo: coach line + effort meter, breathing arrival overlay, nickname + motivation (“why”), gentleness summary framing, warmer caregiver copy, deterministic demo seed, Vercel config. |
| **`v3/integration` @ `63c3e13`** | Sandbox **not yet merged to `main`**. Responsive `AppShell`, local `VoiceCoach`, AdherenceGarden, caregiver encouragement note (+ SAFETY carve-out), derived milestones, weekly progressCard PNG, extended demo runbook. Vitest **395** green after merges. |
| **`main` tip** | Still ~`b692967` (pre-V3 feature code). Intentionally clean until owner promotes V3/V4. |

**Demo format (locked earlier):** live Zoom first; presenter’s Zoom camera OFF (app owns webcam); recorded same-flow fallback in adjacent tab; desktop-first calm-clinical; gauge as session centerpiece — *but owner now says the session UI craft failed the bar* (see §7).

---

## 3. How this team executes (critical process knowledge)

### Worktrees (same pattern V2 and V3)

Agents do **not** work inside `MirrorWell/` on `main` for features. Sibling git worktrees:

**V2 (historical):** `../MW-trackA`, `MW-trackB`, …  
**V3 (current):**  

| Worktree | Branch | Role |
| --- | --- | --- |
| `/home/arnavbansal/MW-v3-integration` | `v3/integration` | Integrator merge target |
| `/home/arnavbansal/MW-v3-trackA` … `F` | `v3/responsive-layout`, `voice-coach`, `garden-milestones`, `encouragement-note`, `progress-card`, `demo-runbook` | Feature tracks |

Primary checkout: `/home/arnavbansal/MirrorWell` → `main` (docs paste path for humans; often **stale** vs integration until synced).

Windows path humans use:  
`\\wsl.localhost\Ubuntu\home\arnavbansal\MirrorWell\docs\superpowers\plans\...`

### Integration sandbox rule (locked like V2)

- Workers open PRs **into `v3/integration`**, never into `main`.
- Integrator merges `v3/integration` → `main` + tag **only when owner accepts** the release.
- Do **not** merge Task 1 / partial V3 to `main` just to unblock agents.

### Multi-agent dispatch docs

- Plan: `docs/superpowers/plans/2026-07-23-v3-full-product.md`
- Dispatch + paste prompts: `docs/superpowers/plans/2026-07-23-v3-agent-dispatch.md`
- Older V3 session handoff: `docs/superpowers/plans/2026-07-23-v3-session-handoff.md` (**track status inside it is stale**)

Preferred merge order into integration was **F → E → C → B → D** (D last — SAFETY-sensitive). Actual merge: F, E, B via GitHub; C and D merged locally after glossary conflicts.

---

## 4. What this conversation actually did (timeline)

### Earlier in the long arc (pre-summary / V2)

- Many V2 bugfixes and flash-layer features landed; coach-line briefly on main then managed via `v2/integration`; V2 tagged `v2.0`; feature worktrees cleaned after merge.

### V3 planning

- Wrote V3 full-product plan, agent dispatch, session handoff.
- Optional Refero MCP for Task 1 craft only; plan locks win.
- Workflow: sandbox on `v3/integration`, promote + tag `v3.0` only when complete.

### V3 execution

1. Created `v3/integration` from `main`.
2. **Track A** AppShell merged (sidebar ≥1024 / bottom tabs &lt;1024; session chrome-free; FRONTEND §1.1).
3. Pre-existing e2e assertion failures fixed on `v3/e2e-preexisting-fixes` → PR into integration.
4. Dispatch docs updated: **rebase onto `origin/v3/integration`**, PR target integration, Track A done — **do not wait for Task 1 on `main`**.
5. Tracks B–F rebased onto integration.
6. **Agent stall:** some workers still stopped because old prompts said “Confirm Task 1 on `origin/main`.”  
   - Fix: update dispatch; override for stuck agents; **humans must paste prompts from updated file**.  
   - `MirrorWell/main` copy of dispatch was stale until synced mid-session.
7. Claude Code on Track D: started in `MirrorWell`/`main`; `EnterWorktree` **cannot** enter sibling `MW-v3-trackD` (only `.claude/worktrees/`). Workaround: `cd` absolute path in every command, or **start session from the worktree**.
8. Tracks B–F completed locally → pushed → PRs **#4–#8** to `v3/integration`.
9. Integrator merged all into `v3/integration` (`63c3e13`):
   - Resolved conflicts in `docs/ARCHITECTURE.md` / `docs/API.md` (union: VoiceCoach + garden keys + progressCard + db v2 / encouragement_note / noteId / caregiver.noteMaxLength).
   - Local `git merge` needed `command git` because bash `git` wrapper prompts on `/dev/tty` and blocks AI.
10. Validation on integration: typecheck clean, **395/395** vitest (after relinking `node_modules` → MirrorWell).
11. Owner asked to **run before merge to main** — preview `4173` + preferred **dev+HUD `5173`** with Seed (prod build cannot `seedDev`).
12. Owner smoke → **strong UX dissatisfaction** (8 themes, §7). Integrator verdict: agree; do not treat V3 as product-complete.
13. Narrow UX handoff written; owner clarified they want **this full-session handoff** instead/in addition.

### Not done

- Merge `v3/integration` → `main`, tag `v3.0` — **blocked pending owner UX direction / possible V4 first**.
- Arrival dismiss e2e for encouragement note (no real-session arrival harness) — accepted as typecheck + review for V3.
- Follow-ups noted on note UI: 390px overflow; focus to Begin after dismiss.

---

## 5. V3 feature inventory (what exists on `v3/integration`)

1. **AppShell** — hub responsive nav; session active phase chrome-free.  
2. **VoiceCoach** — `src/session/voice.ts`, local `speechSynthesis`, default off, short phrases, `voiceMinGapMs` throttle.  
3. **AdherenceGarden** — Home; only grows (SAFETY).  
4. **Encouragement note** — SAFETY §5 carve-out; Caregiver compose; Session arrival display/dismiss; excluded from export; Dexie v2 table.  
5. **Milestones** — derived, zero storage.  
6. **Weekly progressCard** — canvas PNG via Export / `downloadBlob`.  
7. **Demo runbook** — docs extended for V3 Zoom flow.

PR refs: [#4](https://github.com/Helixo613/MirrorWell/pull/4) … [#8](https://github.com/Helixo613/MirrorWell/pull/8) (all merged into integration).

---

## 6. Lessons learned (so the next agent doesn’t re-learn the hard way)

1. **`main` is intentionally behind during a version sandbox.** Waiting for Task N on `main` is wrong if the policy is integration-first. Update paste prompts in the path the human actually opens.  
2. **Same filename ≠ same content across checkouts.** Always read dispatch from the worktree/integration tip, or keep `MirrorWell/docs/...` synced when humans paste from there.  
3. **V2 and V3 both used sibling worktrees**; V3 folders are named `MW-v3-*` so they don’t collide with `MW-track*`.  
4. **Claude Code `EnterWorktree` ≠ git worktree.** Start Claude in `/home/arnavbansal/MW-v3-trackX`.  
5. **Parallel tracks collide on** `strings.ts`, `thresholds.ts`, glossary docs, `useSessionScreen.ts`, seed helpers — expect merge conflict resolution that **unions** identifiers.  
6. **Shell `git` function may block** `merge`/`rebase`/`commit`/`push` without TTY — use `command git` / `/usr/bin/git`.  
7. **Integration worktrees often need** `ln -sfn ../MirrorWell/node_modules node_modules` + wasm copy.  
8. **`seedDev` throws in production builds** — use `VITE_ENABLE_DEBUG_HUD=true npm run dev` for garden/history smoke.  
9. **Voice as shipped is too thin** for assistant-like coaching: ~4 phrases + gap + cancel; browser voices often sound bad; delay feels “wrong” when overshooting. Cloud TTS is forbidden.  
10. **Owner quality bar is product/UX**, not “features landed + tests green.” Green CI ≠ ship.

---

## 7. What the owner needs (post-smoke — binding intent)

After running V3, owner said essentially:

1. **Onboarding** not dynamic / not up to mark — one product language on phone and desktop; chrome/tabs adapt by resolution.  
2. **All UI pages** must be that kind of responsive/dynamic.  
3. **Garden** looks bad / feels unnecessary — improve craft or it hurts the product.  
4. **Voice** creepy, delayed, inaccurate; wants richer procedure-aware coaching and a better voice — or a real fix path.  
5. **First-time teaching gap** after calibration: unclear what to do; needs animation/teaching; on green → **hold** → **release to normal** to complete a rep; optional hold counter.  
6. **Capture / green-bar UI** is engineer-centric; users won’t know what to follow — needs user-friendly redesign.  
7. **Full UI makeover** — keep **color scheme**, rebuild components; usable on any device.  
8. Aside from **camera/calibration/motion→reps**, most of the product feels half-finished.

**Integrator verdict (this session):** Agree. Priority order:

1. Design system + true responsive shell (incl. onboarding)  
2. Session teaching + hold→release procedure  
3. Capture/feedback visual redesign (human metaphor)  
4. Voice redesign **or** keep OFF until quality bar  
5. Garden craft pass **or** demote from Home  
6. Hub polish under same system  

**Hard constraint reminder for any redesign:** no network, no new deps beyond pin table, strings/thresholds/glossary/SAFETY, don’t casually rewrite sensing math.

**Merge stance from this session:** Do **not** rush `v3/integration` → `main` as “V3 product done.” Options for consult: (A) merge as engineering checkpoint + tag, then V4; (B) hold `main` at `v2.0` until V4 UX lands. Owner has not finalized A vs B.

---

## 8. Current operational state (as of handoff write)

| Item | State |
| --- | --- |
| Repo | `https://github.com/Helixo613/MirrorWell` |
| `main` | `v2.0` era tip; no V3 app code |
| `v3/integration` | `63c3e13` — all V3 tracks merged |
| Local servers (may still be up) | preview `:4173`, dev+HUD `:5173` from `MW-v3-integration` |
| Uncommitted on `MirrorWell` main | synced V3 dispatch/handoff docs; this full handoff; some `proof/` screenshots |
| Narrow UX-only handoff | `2026-07-24-v4-ux-redesign-handoff.md` — **subset**; prefer **this** file for full context |

---

## 9. Canonical docs to read (order)

1. `docs/README.md`  
2. `docs/ARCHITECTURE.md` (§12 glossary)  
3. Track docs: `FRONTEND.md` / `API.md`+`BACKEND.md` / `MODEL_AND_DATA.md` as needed  
4. `docs/SAFETY_AND_COMPLIANCE.md`  
5. `docs/IMPLEMENTATION.md` / `docs/TESTS.md` when implementing  
6. Plans: V2 flash, V3 full-product, V3 dispatch, **this handoff**

---

## 10. Open questions for consulting agents

1. Merge V3 to `main` as checkpoint now, or hold until V4 UX?  
2. What user-facing metaphor replaces the green-band lab UI without new deps?  
3. Hold→release: UI-only dwell vs rep FSM change (needs DOCS-CHANGE if FSM)?  
4. Teaching: one-shot after first calibration vs always-available “Show me how”?  
5. Voice: invest in rich local coach vs leave OFF and win on visual teaching first?  
6. Garden: redesign craft vs hide until ready?  
7. How to slice V4 into mergeable PRs without another half-UI ship?  
8. Confirm understanding of owner bar: **usable, teachable, responsive medical-calm product** — not feature count.

---

## 11. What a consulting agent should produce

- Restate understanding of product + process + current git state (short).  
- Agree/disagree with §7 priority order.  
- Recommend merge policy (checkpoint vs hold).  
- Outline a **V4 program** (phases, risks, doc amendments, non-goals — protect sensing).  
- Optional mermaid for teach → hold → release → rep.  
- **Do not** large-implement unless owner explicitly starts execution.

## Suggested skills

`brainstorming` → `writing-plans` → later `executing-plans` / `subagent-driven-development` / `verification-before-completion`; `frontend-design` or Refero for craft refs only; always `agents-skills-policy`.

---

## 12. One-line owner intent

> Keep the offline sensing core; stop shipping half-UI. Make MirrorWell feel like one responsive, teachable, calm product on phone and desktop — then voice/garden earn their place.
