# V2 Gate — Real-Palsy Dataset Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, task-by-task. This plan is evidence-generating research, not feature work: **bars are predeclared before any data is scored; nothing is tuned against results** (same discipline as the V1 kill-gate). Canonical spec: `docs/MODEL_AND_DATA.md` §2–§7 (V2 row) — this plan operationalizes it, it does not replace it.

**Goal:** Answer the project's #1 open scientific question — does the blendshape model's canonical-face prior suppress genuine palsy asymmetry? — using the MEEI Facial Palsy Standard Set (target: flaccid + synkinetic patients with standardized movement video), producing a PASS / FAIL-with-fallback verdict for gate **B7** plus ordering agreement.

**Architecture:** Reuse the entire V1 measurement stack unchanged (`tests/analysis/v1-runner.html` sampling core → per-frame blendshapes + quality states). New pieces are only: a clip manifest, a manifest-driven runner (`v2-runner.mjs`), a blinded human-ordering protocol, and an analysis script. Dataset clips are **evaluation-only, never committed, never redistributed, never shipped** (MODEL_AND_DATA §3 rule) — they live in a gitignored directory exactly like the S01 webcam masters.

**Verdict semantics (from MODEL_AND_DATA §7):** PASS = B7 met + ordering agreement → blendshape-si-v1 validated on real palsy anatomy. FAIL → §2 fallback ladder (re-derived raw geometry → hybrid landmarks+optical-flow → narrowed product claims, longitudinal-trend claims dropped) — a documented pivot, not a project death.

---

## Stream D disposition (2026-07-20) — FROZEN BARS UNCHANGED

| Decision | **RUN AS WRITTEN** (MEEI remains primary material) |
|---|---|
| Bars (Task 2) | **Frozen.** Do not restate, soften, or retune after seeing scores. |
| Source substitution | **None** for the formal gate. YFP / Toronto NeuroFace / HF dumps are contingency or exploratory only (see D1 notes). |
| Deferral | **Not deferred.** Acquisition is on the critical path and can start immediately (human). Tooling tasks may proceed without clips. |
| Access correction | MEEI is **not** a public anonymous download as of 2026-07-20. Paper URL `https://www.sircharlesbell.com/standardset` returns **404**. SCBS markets the photo/video standard set under membership **Useful Downloads**. Stream C must reword MODEL_AND_DATA §3/§7 "open via SCBS" — request in `docs/superpowers/coordination/stream-d-requests.md`. Full evidence: `docs/superpowers/reports/external-evidence/2026-07-20-d1-dataset-survey.md`. |
| Contingency | If MEEI remains unreachable after a documented good-faith attempt (membership and/or author contact), **do not invent a weaker PASS path**. Report `UNDERPOWERED` / blocked acquisition; optional YFP exploratory analysis is **not** a V2 PASS substitute under the frozen bars (no flaccid+synkinetic labels; speech not standardized smile). |

---

## Global Constraints

- No network calls in any app/runner code. Dataset download is a human research activity outside the app.
- **License first:** confirm the Sir Charles Bell Society / MEEI license terms (or author DUA) **before** the first clip lands on disk; evaluation-only use, no redistribution, no clips in git ever (`tests/fixtures/v2/` is gitignored in Task 1). If the license forbids even local derived metrics, stop and report.
- No frame, video, or landmark persistence — per-clip **aggregates only** in reports (means, stds, orderings). Patient clips are more sensitive than S01's own face: report files contain clip IDs and numbers, never images.
- Bars and analysis choices are frozen in Task 2 (docs amendment) **before** Task 4 ever runs on real clips. Changing a bar after seeing scores is a defect.
- Human ordering (Task 3) is collected **before** any app scores exist for those clips (blinding). Log the collection date in the report.
- All shell via `rtk`. Work on `main` (this is analysis tooling, not app features).

### Task 0: Acquisition (human; can start immediately, weeks of lead time)

- [ ] **Primary — MEEI Facial Palsy Photo & Video Standard Set** via the Sir Charles Bell Society and/or paper authors (Greene et al. 2020). **Do not assume anonymous open download.** Practical paths as of 2026-07-20:
  1. SCBS membership → restricted **Useful Downloads** (site copy describes 65 photo sets incl. 10 normals; flaccid and synkinetic equally represented): `https://www.sircharlesbell.com/` / membership application `https://scbs.memberclicks.net/sir-charles-bell-society-membership-application`.
  2. Contact corresponding authors / MEEI Facial Nerve Center if membership path fails.
  3. Record: exact license text, access date, access method (membership vs author), any usage constraints, in `tests/fixtures/v2/LICENSE_NOTES.md` (this file IS committed — it holds terms, not data).
- [ ] **Inventory requirement:** which patients have **video** (not just photos), which expressions are performed. The gate needs a **smile / voluntary-movement video** per scoreable patient; photos alone cannot drive the video pipeline. Deliver clips to `tests/fixtures/v2/meei/` (gitignored).
- [ ] **Immediate exploratory (optional, parallel; not formal gate):** download Hugging Face [`jasir/palsynet-data`](https://huggingface.co/datasets/jasir/palsynet-data) (CC-BY-4.0; ~27 affected + ~20 control mp4). Store gitignored under `tests/fixtures/v2/palsynet/`. Manifest may use `presentation: "unknown_palsy" | "control"`; **do not invent** `affectedSide` or flaccid/synkinetic labels. Reports must stamp `"isGateEvidence": false`.
- [ ] **Optional strengtheners** (not formal substitutes):
  - **YFP** (Hsu et al.): university-email request → password in 3–7 workdays; research-only, no redistribution. GitHub: `AvLab-CV/YouTube-Facial-Palsy-Database`.
  - **Toronto NeuroFace** (Bandini et al.): ALS/stroke; UofT request URL was **404** on 2026-07-20 — email lab authors.
  - **Do not** use Kaggle YFP forks as a license workaround for YFP's no-redistribute rule.

### Task 1: Manifest + ignore rules

**Files:** Create `tests/fixtures/v2/manifest.json`, modify `.gitignore`

- [ ] `.gitignore`: add `tests/fixtures/v2/**` with exceptions `!tests/fixtures/v2/manifest.json`, `!tests/fixtures/v2/LICENSE_NOTES.md`.
- [ ] Manifest schema (one entry per usable clip):

```json
{
  "clipId": "meei_f03_smile",
  "file": "meei/f03_smile.mp4",
  "presentation": "flaccid | synkinetic | control",
  "affectedSide": "left | right | none | unknown",
  "expression": "smile | brow_raise | eye_closure | rest",
  "sourceGrade": "<verbatim severity label from the dataset, if provided, e.g. HB grade or eFACE>",
  "notes": ""
}
```

`affectedSide`/`sourceGrade` come from dataset labels only — never from watching the clip and judging (that would contaminate the blinded ordering).
- [ ] Commit manifest scaffold + gitignore: `feat: V2 fixture manifest + ignore rules (clips never committed)`.

### Task 2: Predeclared bars + docs amendment (BEFORE any scoring run)

**Files:** Modify `docs/MODEL_AND_DATA.md` §7 (V2 row detail)

- [ ] Freeze and record in §7, with a `DOCS-CHANGE:` line:
  - **Primary (B7 direction):** among clips with a labeled `affectedSide` and expression `smile`: the affected side's blendshape activation (`mouthSmileLeft/Right`) is the lower side in ≥ **80%** of clips (per-clip: mean per-side activation over `QUALITY_OK` frames during the expression). Rationale: direction correctness is the clinical floor; 80% allows for label noise and synkinesis reversals, predeclared here.
  - **Primary (ordering):** Spearman ρ ≥ **0.7** between app ordering (per-clip mean smoothed SI, ascending) and blinded human severity ordering (Task 3), computed separately for flaccid and synkinetic subsets and on the pooled set; the **pooled** ρ is the bar, subset values are reported.
  - **Secondary (prior-suppression probe):** app SI of the median palsy clip must be separated from S01's symmetric-smile SI (0.98–0.99) by more than S01's own held-SI noise band — i.e. the model must not read visibly asymmetric faces as ≈1. Report the full SI distribution.
  - **Fairness guard (quality gates):** `QUALITY_OK` frame fraction on palsy clips within recording-quality expectations — a systematically rejected patient face is itself a FAIL signal (report per-clip OK%; investigate any clip < 50% before scoring it INVALID; INVALID cells excluded from ordering but counted in the report).
  - Missing-data rule: gate requires ≥ **20** scoreable smile clips spanning both presentations; below that, verdict is `UNDERPOWERED` (reported honestly, no PASS claim).
- [ ] `rtk node scripts/check-docs.mjs` green. Commit.

### Task 3: Blinded human ordering (human, before Task 4)

- [ ] Rater(s) (you; a second rater strengthens it) watch each smile clip and rank all clips from least to most asymmetric, using only the videos — no app, no scores, no manifest grades visible during rating. Ties allowed (dense ranks).
- [ ] If the dataset ships clinician grades (`sourceGrade`), those form a second reference ordering "for free" — record both; the predeclared bar uses the blinded human ordering, clinician-grade agreement is reported alongside.
- [ ] Save as `tests/fixtures/v2/human_ordering.json`: `{ raterId, collectedAt, ranks: { clipId: rank } }` (committed — it's judgment data, not patient data... containing only clip IDs and integers).

### Task 4: v2-runner (manifest-driven scoring)

**Files:** Create `tests/analysis/v2-runner.mjs`; Test: dry-run mode

- [ ] Clone the serving/sampling pattern from `tests/analysis/blendshape-probe.mjs` (static server mapping `/v2fixtures/` → `tests/fixtures/v2/`, Playwright + `v1-runner.html` `sampleVideo`). Per manifest clip: sample ≥ 100 frames, keep `QUALITY_OK` rows, compute per-frame `act = max(L,R)`, per-frame SI (activation floor 0.05, trailing 5-frame median — identical constants to `scripts/run-v1.mjs`'s blendshape mode; copy them, cite the source lines).
- [ ] Emit `tests/analysis/v2_meei_report.json`: per clip `{clipId, frames, okPct, meanActLeft, meanActRight, dominantLowerSide, meanSI, siStd}`, plus the Task 2 bar evaluations it can compute without the human ordering. No frame-level data in the report.
- [ ] Dry-run gate: run against the existing S01 masters via a tiny test manifest (smile + smirk clips, `presentation: "control"`) — smirk must score `dominantLowerSide` correctly and SI ≈ 0.43/0.72, smile ≈ 0.98 (regression against known values). Commit: `feat: v2-runner (manifest-driven palsy-clip scoring, aggregates only)`.

### Task 5: Analysis + verdict

**Files:** Create `tests/analysis/v2-analysis.mjs`

- [ ] Compute: B7 direction rate; Spearman ρ (pooled + per presentation) vs `human_ordering.json` (implement rank correlation in ~15 lines, no new deps); SI distribution vs S01 symmetric reference; OK% table. Print verdict per the frozen Task 2 bars: `PASS | FAIL | UNDERPOWERED`, exit codes 0/2/3.
- [ ] Append verdict + date + git SHA into `v2_meei_report.json`. Commit report + scripts.
- [ ] **PASS:** MODEL_AND_DATA §2 risk note updated ("validated at V2 on MEEI n=…"); IMPLEMENTATION ledger notes V2 met early (Task 18 battery still owes V3/V4). **FAIL:** preserve report to `tests/analysis/rejected/`, activate the §2 fallback ladder as a new plan, drop longitudinal-trend claims from docs until a fallback passes (that doc edit is part of the FAIL path, not optional). **UNDERPOWERED:** report; seek more clips or the live volunteer path.

## Out of scope

Live-volunteer testing (separate consent + protocol; validates capture path, not just metric); V3/V4 battery (Task 18); Casual Conversations fairness sweep (needs its own license verification); any model retraining/fine-tuning (project trains no models — MODEL_AND_DATA §1); committing any clip anywhere.
