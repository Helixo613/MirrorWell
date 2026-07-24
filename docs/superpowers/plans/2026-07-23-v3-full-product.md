# V3 "Full Product" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Prerequisite: the V2 plan (`2026-07-23-v2-flash-layer.md`) is fully merged and tagged `v2.0`.**

**Goal:** Turn the demo-ready V2 app into a product someone uses daily for months: responsive mobile experience, voice coaching, long-arc motivation (garden, milestones, weekly card), and a caregiver encouragement loop.

**Architecture:** Still zero new dependencies and zero network. Two tasks change stored data (`voiceCoachEnabled` setting; `encouragement_note`); each amends DATABASE/ARCHITECTURE/SAFETY in the same commit per the deviation protocol. Task 4 (encouragement note) touches the caregiver read-only rule and therefore starts with a SAFETY doc amendment, not code.

**Tech Stack:** Existing pinned stack + browser built-ins only: `speechSynthesis` (Web Speech API, fully local voices), `<canvas>`/SVG for the garden and card, CSS for motion. **No new dependencies.**

**Repo rules binding every task:** same block as the V2 plan header (strings/thresholds config files, glossary-first identifiers, SAFETY §8 language, `npm run typecheck` + `npx vitest run`, `DOCS-CHANGE:` commit notes). Re-read that block before starting.

**Branching:** `v3/<task-slug>` branches off `main`, merge when green, tag `v3.0` when Tasks 1–7 are done.

**Parallelism map (for offloading):**

| Track | Tasks | Notes |
| --- | --- | --- |
| A (layout) | 1 | Touches many screens; run ALONE first; everything else rebases on it |
| B (audio) | 2 | After 1; touches session screen + settings |
| C (home/motivation) | 3, 5 | After 1; 3 and 5 both touch HomeScreen, sequential within track |
| D (caregiver) | 4 | After 1; independent files |
| E (export) | 6 | After 1; independent files |
| F (demo ops) | 7 | Fully independent; can run anytime, even before Task 1 |

---

### Task 1: Responsive dynamic layout: desktop-first, calm-clinical, gauge centerpiece

**Decision (locked 2026-07-23):** one dynamic responsive app (no separate mobile build). Desktop is the primary design target (the Zoom demo surface); the same layout reflows to a first-class phone experience. Calm-clinical visual language: generous whitespace, muted sage/slate palette, one accent (the gauge green), no decorative gradients.

**Refero MCP (optional craft aid, does not change scope):** Before implementing the shell, the Track A agent may use Refero MCP (`refero_search_screens` / `refero_search_styles`, health or calm clinical apps) for 2–3 reference patterns on sidebar↔tab navigation and distraction-free stage layouts. Refero informs spacing, hierarchy, and chrome craft only. It must **not** add features, change breakpoints, invent identifiers, or override the locked decisions above or SAFETY §8. If Refero is unavailable, skip it and implement from this plan + existing `src/components/layout/` patterns.

**Files:**
- Modify: `src/components/layout/*` (app shell: sidebar nav ≥1024px, bottom tab bar <1024px)
- Modify: `src/screens/session/SessionScreen.tsx` (session stage: preview + gauges centered, max-w ~5xl on desktop; full-bleed column on mobile)
- Modify: `src/screens/home/HomeScreen.tsx`, `src/screens/trends/TrendsScreen.tsx`, `src/screens/summary/SummaryScreen.tsx` (grid: 2-col ≥1024px, 1-col below)
- Modify: `src/session/renderer.ts`, meter/bar constants are already fraction-of-canvas; verify at 360px-wide canvas the meter (24px) and bar remain legible; if the meter collides with the bar track below 480px CSS width, move `METER_X_FRAC` 0.05 → 0.07 (presentation constant, no doc change)
- Test: existing screen tests keep passing; add viewport smoke via Playwright if the e2e harness has one (`tests/e2e/`); otherwise manual matrix below
- Docs: `docs/FRONTEND.md` §1 (layout system: breakpoint, shell variants); DOCS-CHANGE required

**Steps:**
- [ ] Inventory current shell: read `src/components/layout/` and `src/components/navigation/`, list which nav pattern exists today.
- [ ] Implement shell variants with Tailwind responsive classes only (no JS media queries except where focus management needs them). One breakpoint: `lg` (1024px). Session screen is exempt from the shell chrome during `active` phase; the stage owns the viewport (distraction-free, and it's what Zoom viewers see).
- [ ] Manual matrix: 1920×1080, 1280×800, 768×1024, 390×844: every screen usable, no horizontal scroll, tap targets ≥44px on mobile.
- [ ] `npm run typecheck && npx vitest run` green; commit with FRONTEND DOCS-CHANGE.

---

### Task 2: Voice coaching (local `speechSynthesis`): [Track B, after Task 1]

**Files:**
- Create: `src/session/voice.ts` (`VoiceCoach`, glossary entry required BEFORE code)
- Modify: `src/data/schema.ts` + `src/data/settings.ts` (`voiceCoachEnabled: boolean`, default `false`; opt-in, sound during a Zoom share is the presenter's choice)
- Modify: `src/screens/settings/SettingsScreen.tsx` + `src/lib/settingLabels.ts` (toggle row)
- Modify: `src/screens/session/useSessionScreen.ts` (speak on coach-phase TRANSITIONS and on `repComplete`)
- Modify: `src/config/strings.ts` (`session.voice.*`, spoken lines are user-facing strings)
- Test: `tests/unit/voice.test.ts` (mock `speechSynthesis`), `tests/unit/settings.test.ts` (new field default/persist)
- Docs: `docs/ARCHITECTURE.md` §12 (`VoiceCoach`, `voiceCoachEnabled`), `docs/DATABASE.md` §2 (settings field), `docs/FRONTEND.md` §2.4 (audio behavior), `docs/SAFETY_AND_COMPLIANCE.md` (note: speech is generated locally via the OS voice; no network TTS, reinforces, does not weaken, the no-network rule)

**Core module (complete behavior spec):**

```ts
// src/session/voice.ts, speaks short cues via the LOCAL OS voice. Never queues more than
// one utterance: a stale "raise gently" arriving after the user is already holding is worse
// than silence, so every speak() cancels the previous one. Rate-limited to one utterance
// per thresholds.feedback.voiceMinGapMs (new tunable, thresholds.ts + docs).
import { thresholds } from '@/config/thresholds';

let lastSpokeAt = 0;
let enabled = false;

export const VoiceCoach = {
  setEnabled(value: boolean): void {
    enabled = value;
    if (!value) globalThis.speechSynthesis?.cancel();
  },
  speak(text: string, now: number = performance.now()): void {
    const synth = globalThis.speechSynthesis;
    if (!enabled || !synth) return; // absent API (older WebView) → feature silently off
    if (now - lastSpokeAt < thresholds.feedback.voiceMinGapMs) return;
    lastSpokeAt = now;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    synth.speak(u);
  },
};
```

`voiceMinGapMs: 2500` goes in `thresholds.feedback` (tunable → thresholds.ts, documented in ARCHITECTURE's threshold table). Hook wiring: speak `strings.session.voice[phase]` only when `coachPhase` CHANGES (track previous in a ref), and `strings.session.voice.rep(n)` on `repComplete`. Voice lines are shorter than screen copy: `raise: 'Gently up'`, `hold: 'Hold there'`, `easeBack: 'A little less'`, `rep: (n) => \`That's ${n}\``.

**TDD:** mock `speechSynthesis` with a `speak`/`cancel` spy; tests: disabled → never speaks; gap enforcement (two calls 1s apart → one utterance); cancel-before-speak ordering; missing API → no throw.

---

### Task 3: Adherence garden (HomeScreen): [Track C, after Task 1]

**Files:**
- Create: `src/screens/home/gardenData.ts` (pure mapper), `src/components/progress/AdherenceGarden.tsx` (SVG)
- Modify: `src/screens/home/HomeScreen.tsx`, `src/config/strings.ts` (`home.garden.*`)
- Test: `tests/unit/garden-data.test.ts`
- Docs: `docs/ARCHITECTURE.md` §12 (`AdherenceGarden`), `docs/FRONTEND.md` §2.2, and a `docs/SAFETY_AND_COMPLIANCE.md` note: the garden only GROWS (a missed week pauses growth; nothing ever wilts, shrinks, or shows a broken streak; decay imagery is guilt mechanics and violates §8).

**Data mapper (pure, TDD first):** input = last 8 weeks of session days from `TrendsService` (`src/data/trends.ts`; read its actual query surface before coding); output = per-week stage:

```ts
export type PlantStage = 0 | 1 | 2 | 3; // seed, sprout, leaf, bloom
export function gardenWeeks(sessionDates: string[], today: string): PlantStage[] {
  // 8 buckets, oldest→newest; stage = min(3, sessions-in-week); ISO week bucketing on local dates.
}
```

Tests: empty history → eight 0s; 3+ sessions in a week → bloom; weeks bucket on Monday boundaries; future dates ignored. Render: one `<svg>` per week, four hand-drawn-simple plant paths, `role="img"` with an `aria-label` from strings ("Your practice garden: 5 of 8 weeks growing"). CSS grow-in transition, gated by `prefers-reduced-motion`.

---

### Task 4: Caregiver encouragement note: [Track D, after Task 1]

**This task starts with a doc decision, not code.** The caregiver view is currently read-only by SAFETY design. Step 1 amends `docs/SAFETY_AND_COMPLIANCE.md` with the narrow carve-out: the caregiver may write ONE free-text encouragement note (max 200 chars, stored locally, shown to the user pre-session, deletable by the user); it is the sole mutating control on `CaregiverScreen` and it can never contain instructions that gate exercise behavior. If the doc owner (the user) rejects the carve-out, the task is cancelled; do not implement around it.

**Files after the amendment:**
- Modify: `src/data/schema.ts` + `src/data/storage.ts` (new `encouragement_note` table: `{ noteId, text, createdAt }`, singleton semantics; saving replaces; DATABASE §1/§2/§3 amendments)
- Modify: `src/screens/caregiver/CaregiverScreen.tsx` + `useCaregiverScreen.ts` (compose box)
- Modify: `src/screens/session/SessionScreen.tsx` (note shown on the pre-session/arrival surface with a dismiss control that deletes it)
- Modify: `src/config/strings.ts` (`caregiver.note.*`)
- Test: `tests/unit/storage.test.ts` (validation: length ≤ 200, replace semantics), screen tests for compose + dismiss
- Docs: DATABASE (§1 table, §3 validation), ARCHITECTURE §12 (`encouragement_note`, `noteId`), SAFETY (carve-out, step 1)

Export exclusion: the note is the caregiver's words about the user, exclude from `ExportService` and test that, same pattern as V2 nickname.

---

### Task 5: Milestones (derived, zero storage): [Track C, after Task 3]

**Files:** `src/screens/home/milestones.ts` (pure), `HomeScreen.tsx` + `SummaryScreen.tsx` (badge strip), `strings.ts` (`home.milestones.*`), tests `tests/unit/milestones.test.ts`, docs FRONTEND §2.2/§2.5 + glossary (`milestones` helper name only if it becomes a component; pure module names don't need glossary entries unless docs say otherwise; check ARCHITECTURE §12 conventions first).

Milestones are COMPUTED from session history every render, nothing stored, nothing to migrate:

```ts
export type Milestone = { id: 'first_session' | 'sessions_10' | 'sessions_25' | 'weeks_4' | 'gentle_100'; achieved: boolean };
export function milestonesFrom(records: SessionRecord[]): Milestone[] { /* counts + week-span; gentle_100 = cumulative reps with easeOffTriggered 0 */ }
```

Copy celebrates practice, never performance ("25 sessions of showing up"). TDD the thresholds (9 vs 10 sessions, week-span off-by-one).

---

### Task 6: Weekly progress card (shareable PNG, local download): [Track E, after Task 1]

**Files:** `src/data/progressCard.ts` (canvas composer), `src/screens/export/ExportScreen.tsx` (new "Download weekly card" action beside the existing JSON export), `strings.ts` (`exportScreen.card.*`), tests for the data selection (`tests/unit/progress-card.test.ts`; the week aggregation, not pixel output), docs: FRONTEND §2.7 + glossary (`progressCard`) + SAFETY note (card contains only derived aggregates the user already sees, same data class as the JSON export, same local-download-only channel).

Composer: offscreen `<canvas>` 1080×1350, calm-clinical styling, contents = week date range, sessions count, gentleness stat (reuse `gentlenessStat` from V2 Task 4), garden row for the week, NO raw metrics tables. `canvas.toBlob` → `URL.createObjectURL` → download anchor, identical download mechanics to the existing export path (read `src/data/export.ts` / `useExportScreen.ts` and reuse its download helper rather than duplicating it).

---

### Task 7: Demo runbook + rehearsal (D-series ops): [Track F, anytime]

**Files:** Create `docs/superpowers/plans/2026-07-23-demo-runbook.md`. No app code.

Contents to write (complete, not outlined):
- **Setup checklist:** wired network; laptop on power; good front lighting; Zoom → share the browser window (not full screen), "Share sound" + "Optimize for video clip" OFF (UI text must stay sharp); presenter's Zoom camera OFF during the live session segment (the app owns the webcam, most cameras cannot serve Zoom and the app at once, and this is the #1 live-demo failure).
- **Flow (12 min):** cold open on seeded HomeScreen (two months of history from V2 Task 8) → 60-second story → LIVE session: calibrated exercise, narrate the gauge ("green band is the target; up, hold, release, that's a rep"), trigger one ease-off on purpose to show the safety cue → SummaryScreen gentleness stat → TrendsScreen drift chart → phone clip (15 s recording from V2 Task 9's installed PWA) → offline toggle moment (DevTools offline → app keeps working) → close.
- **Fallback (locked decision: fully live, recorded fallback):** a screen recording of the exact same flow sits open in the ADJACENT browser tab, paused at 0:00. Failure rule: any live glitch that isn't recovered in 10 seconds → say "let me show you this morning's run", Ctrl+Tab, press play. Practice the switch until it takes under 5 seconds. Record the fallback AFTER Tasks 1–2 land so it shows the final UI.
- **Rehearsal gate:** two full dry runs over a real Zoom call to a second device, one on hotel-grade throttled network (Chrome DevTools "Slow 4G") to check gauge legibility after compression.

---

## Self-review notes

- Task 4 is the only one that touches a SAFETY rule; it is explicitly gated on the doc amendment being accepted first.
- `speechSynthesis`, canvas, and SVG are browser built-ins; the no-new-deps and no-network rules hold across all tasks.
- New identifiers introduced (glossary amendments required in-commit): `VoiceCoach`, `voiceCoachEnabled`, `voiceMinGapMs`, `AdherenceGarden`, `encouragement_note`, `noteId`, `progressCard`. Nothing else new.
- Cross-plan reuse: `gentlenessStat` (V2 Task 4) is consumed by V3 Task 6; V2 Task 8's seed feeds V3 Task 7's runbook.
