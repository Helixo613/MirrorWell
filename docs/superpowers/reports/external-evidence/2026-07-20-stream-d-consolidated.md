# Stream D consolidated — learnings + next steps

**Date:** 2026-07-20 (Track B refined 2026-07-21; Track A deferred for schedule)  
**Branch:** `stream-d-external`  
**Plan ownership:** `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md`  
**Detail survey:** `docs/superpowers/reports/external-evidence/2026-07-20-d1-dataset-survey.md`  
**Coordination outbox:** `docs/superpowers/coordination/stream-d-requests.md`

Stream D is **docs-only** (no source, no `IMPLEMENTATION.md`). Merge **last**, after A → B → C.

---

## 1. What we set out to decide

From `docs/superpowers/plans/2026-07-20-parallel-completion.md` Stream D:

1. **D1** — Survey external palsy evidence (MEEI, YFP, Toronto NeuroFace, registries).
2. **D2** — Decide: run v2-gate plan as written, substitute a source, or defer. **Bars frozen.** Publish one-line disposition for Stream C.

Scientific question the V2 gate answers: does MediaPipe blendshape SI suppress real palsy asymmetry? (MODEL_AND_DATA §2 #1 risk / §7 V2 row.)

---

## 2. Learnings (locked)

### 2.1 Formal gate source

| Finding | Detail |
|---|---|
| **MEEI remains the only designed formal-gate source** | Standardized photos/videos; flaccid + synkinetic; eFACE / House–Brackmann / Sunnybrook. Alone among surveyed sources can support ≥20 scoreable smile clips spanning **both presentations**. |
| **MEEI is not public-open today** | Paper path `https://www.sircharlesbell.com/standardset` → **HTTP 404**. SCBS homepage lists the set under membership **Useful Downloads**. Paper (Greene 2020) still states open-research/education *intent*. |
| **MODEL_AND_DATA §3/§7 overstates access** | "Open via the Sir Charles Bell Society" is misleading for 2026-07-20 practice → Stream C reword request filed. |
| **Student time-to-access (estimate, no SLA)** | Author/MEEI email: often **1–3 weeks** (best case days). SCBS free **Trainee** membership needs Program Director letter (clinical training, not pure CS). Full membership may have fees. Budget **2–4 weeks**; plan for no reply. |
| **Bars stay frozen** | B7 ≥80% direction; Spearman ρ ≥ 0.7 vs blinded human ordering; ≥20 smile clips flaccid+synkinetic; secondary SI separation vs S01. **No substitute source for a formal PASS.** |

### 2.2 Alternatives surveyed

| Source | Access now? | Formal V2? | Role |
|---|---|---|---|
| **Repo S01 masters** | Yes (already present) | No | v2-runner dry-run / regression only |
| **HF `jasir/palsynet-data`** | **Yes — minutes** (CC-BY-4.0) | **No** | Best *immediate* real-palsy video set for **exploratory** work |
| **YFP** (GitHub + request) | 3–7 workdays, edu email | No (no flaccid/synkinetic) | Contingency exploratory |
| **Toronto NeuroFace** | Request page 404; email authors | No (ALS/stroke) | Optional strengthener |
| **Kaggle / other HF / Zenodo / figshare** | Mixed | No | No flaccid+synkinetic clinical video gate |
| **GitHub code-only** (zo456, AFLFP request, etc.) | N/A or gated stills | No | No drop-in clip packages |

### 2.3 Right-now implementable set (not a PASS)

**`jasir/palsynet-data`** ([Hugging Face](https://huggingface.co/datasets/jasir/palsynet-data)):

- ~**27** affected + ~**20** control **mp4** (one per person, YouTube-curated Bell’s palsy).
- License: **CC-BY-4.0**.
- **Can implement today:** manifest → v2-runner → SI / OK% distributions → optional blinded human ordering → report stamped `isGateEvidence: false`.
- **Cannot:** B7 with labeled affected side; flaccid vs synkinetic; clinician grades; formal V2 PASS under frozen bars.

No GitHub repo currently ships a free, labeled, flaccid+synkinetic clinical video package.

### 2.4 Product / integration posture

Parallel completion does **not** require V2 closed for backend + live demo. Honest ledger posture:

- V1 / Task 6 → `PROTOCOL_LIMITED` (Stream C).
- Backend halves → **PROVISIONAL** until external evidence can support claims.
- V2 → plan **active**, acquisition **pending**, bars **frozen** — not "dataset already in hand."

---

## 3. Disposition (D2) — one line for Stream C

```
V2 gate: RUN AS WRITTEN on MEEI (bars frozen); SCBS membership/author access not public-open — correct MODEL_AND_DATA §3/§7; immediate palsynet-data = exploratory only (isGateEvidence:false), not a PASS substitute.
```

| Axis | Choice |
|---|---|
| Run / substitute / defer | **Run as written** (MEEI primary) |
| Bars | **Unchanged** |
| Immediate data | **palsynet-data** exploratory track only |
| Formal PASS without MEEI | **Forbidden** |

---

## 4. Next steps (ordered)

### Track A — Human / formal gate (owner: human + later tooling owner)

| # | Action | When |
|---|---|---|
| A1 | Email Greene / MEEI Facial Nerve contacts (university email, eval-only, no redistribute, no training). Prefer over hoping for anonymous SCBS download. | **This week** |
| A2 | If clinical trainee affiliation exists: SCBS free Trainee form + Program Director letter; else skip. | Parallel |
| A3 | On receipt: `LICENSE_NOTES.md`, inventory smile **video** vs photo-only, copy to `tests/fixtures/v2/meei/` (gitignored). | When granted |
| A4 | Formal Tasks 2–5 of v2 plan (bars already frozen in plan; Stream C freezes into §7; blinded ordering **before** scores; v2-runner; PASS/FAIL/UNDERPOWERED). | After A3 |

**Expected wait:** ~1–4 weeks after A1. Do not block product merge on A.

### Track B — Near-term path (Track A deferred for schedule)

**Refined protocol (authoritative):** `docs/superpowers/reports/external-evidence/2026-07-21-track-b-refined.md`  
Protocol id: **`track-b-palsynet-v1`**. Always `isGateEvidence: false`. Formal V2 bars untouched.

| # | Action | Notes |
|---|---|---|
| B0 | Download palsynet + LICENSE_NOTES + gitignore | CC-BY-4.0; clips never committed |
| B1 | Human **inclusion screen** (predeclared exclude codes) | Need ≥15 affected + ≥10 control or INCONCLUSIVE |
| B2 | Blind human **severity ranks** (+ optional side/window) **before** any SI | Commit `human_labels_palsynet.json` first |
| B3 | S01 dry-run (smile/smirk) | Tooling gate |
| B4 | Score palsynet; evaluate predeclared **E1–E4** → SUPPORTIVE / CONCERNING / INCONCLUSIVE | Prior-suppression E1 is primary for our use case |
| B5 | Product language from templates in refined doc | Still PROVISIONAL; formal V2 open |

**Why refined:** raw “mean SI dump” does not answer prior-suppression well. Predeclared QC + human ranks + S01 anchors + E1 gap vs 0.98 make Track B decision-grade *exploratory* evidence.

### Track C — Docs / other streams (not D files)

| Who | Action |
|---|---|
| **Stream C** | Apply §3/§7 access wording fix; ledger: V2 acquisition pending + exploratory palsynet optional; fold D disposition into C2. |
| **Stream A/B** | No dependency on D for demo/backend; stay PROVISIONAL on metric claims. |
| **Integration** | Merge D **last** (docs-only). Cross-doc reconcile must not claim V2 PASS. |

---

## 5. Explicit non-goals (do not do)

- Soften or restate frozen bars after seeing palsynet scores.
- Call palsynet / YFP / S01 smirk a **V2 PASS**.
- Commit patient/YouTube clips to git.
- Further operator "palsy-like" recording as a silent substitute for clinical material (V1 recording retired; any new protocol must be predeclared).
- Use Kaggle YFP forks to dodge YFP's no-redistribute terms.

---

## 6. File map

| Artifact | Role |
|---|---|
| `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` | Operational plan + disposition; bars; Tasks 0–5 |
| `docs/superpowers/reports/external-evidence/2026-07-20-d1-dataset-survey.md` | Full per-source research table |
| `docs/superpowers/reports/external-evidence/2026-07-20-stream-d-consolidated.md` | **This file** — learnings + next steps |
| `docs/superpowers/coordination/stream-d-requests.md` | One-line for C + §3/§7 correction request |

---

## 7. Definition of “Stream D done” vs “V2 done”

| Milestone | Status |
|---|---|
| D1 research + D2 disposition published | **Done** (this stream) |
| Stream C docs/ledger fold-in | Pending C |
| Exploratory palsynet run | Optional next (tooling / human) |
| Formal V2 PASS/FAIL/UNDERPOWERED | **Blocked on MEEI (or equivalent clinical) acquisition** |
| D merge to main | Last, after A/B/C |

*End consolidated Stream D note.*


---

## 8. Settled schedule decision (2026-07-21)

**Owner decision:** Use the **available free set now** (HF `jasir/palsynet-data` + refined Track B protocol). Treat **MEEI / formal V2 as future work** — still required for a formal PASS, not on the critical path for current product completion.

| Horizon | What |
|---|---|
| **Now** | Track B: palsynet exploratory (`track-b-palsynet-v1`, `isGateEvidence: false`) |
| **Future** | Track A: MEEI author/SCBS acquisition → formal V2 bars (unchanged) |
| **Never** | Call Track B a V2 PASS; use unauthorized MEEI copies |

Formal V2 bars and MEEI-as-primary remain in the plan; they are **deferred**, not cancelled.

