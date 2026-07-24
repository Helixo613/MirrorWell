# D1 focused evaluation: track-b-palsynet-v1 as V2 source substitute?

**Date:** 2026-07-21  
**Branch:** `stream-d-external`  
**Dataset under evaluation:** Hugging Face [`jasir/palsynet-data`](https://huggingface.co/datasets/jasir/palsynet-data) + refined protocol **`track-b-palsynet-v1`**  
(`docs/superpowers/reports/external-evidence/2026-07-21-track-b-refined.md`)  
**Frozen bars:** `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` Task 2. **not modified**.  
**Prior Stream C stance (raw palsynet):** exploratory-only, cannot substitute for V2 PASS; re-tested only for whether **Track B refinement** changes that.

---

## Primary sources verified (2026-07-21)

| Source | What it establishes |
|---|---|
| HF dataset card / README (`license: cc-by-4.0`; body text) | Bell's palsy + non-affected faces from **public YouTube** videos; intended for image-classification training after frame extract; **CC-BY-4.0** |
| HF API tree `data/affected` | **27** files, all **`.mp4`** (`1.mp4`…`27.mp4`) |
| HF API tree `data/unaffected` | **22** files, all **`.mp4`** (`1.mp4`…`22.mp4`) |
| HF API dataset object | `license: cc-by-4.0`; tags include `modality:video`, `medical` |
| Card structure text | *"The data is provided as **videos, one per person**"*; only folder labels are `affected` / `unaffected` |
| Track B protocol doc | Explicitly: no flaccid/synkinetic in dataset; rater L/R is optional weak probe; **`isGateEvidence: false` always**; weaker E1–E4 bars; **not** formal V2 bars |

No linked scientific paper on the HF card (no DOI/citation block beyond the card itself). No clinician-grade metadata files appear in the repo tree (`data/` contains only the two video directories).

---

## Frozen V2 bars (verbatim reference: not restated as new values)

From v2-gate Task 2 (must remain measurable for a source to **QUALIFY**):

1. **B7 direction:** among clips with labeled `affectedSide` and expression `smile`, affected side lower activation in ≥ **80%** of clips.  
2. **Ordering:** Spearman ρ ≥ **0.7** vs blinded human severity ordering; **separately for flaccid and synkinetic subsets** and pooled; **pooled** is the bar.  
3. **Missing-data:** ≥ **20** scoreable smile clips **spanning both presentations** (flaccid + synkinetic); else `UNDERPOWERED`.  
4. Secondary prior-suppression + quality OK% reporting.

Task 1 binding rule: `affectedSide` / `sourceGrade` come from **dataset labels only**; never from watching the clip (that contaminates blinded ordering).

---

## Criteria 1–5

### 1. Modality: video clips vs stills?

| Result | **PASS (supports video SI pipeline)** |
|---|---|
| Evidence | Card: *"data is provided as videos, one per person"*; frame script is optional post-process. API: **27 + 22 `.mp4`** under `data/affected` and `data/unaffected`. |
| Gate impact | Live-pipeline / `detectForVideo`-style ordering is **technically feasible** on modality alone. |

### 2: n and composition: ≥20 clips spanning flaccid **and** synkinetic?

| Result | **FAIL** |
|---|---|
| Evidence | Card and tree expose only **`affected` vs `unaffected`**. **Zero** files, fields, or card text mention **flaccid** or **synkinetic**. n_affected = **27** (could exceed 20 after QC in absolute count), but the frozen missing-data rule requires clips **spanning both presentations**. Track B does **not** add dataset presentation labels; it only allows rater severity ranks / optional side guesses. |
| Gate impact | Frozen missing-data rule **cannot be satisfied as written**. Subset Spearman "separately for flaccid and synkinetic" **cannot be computed from dataset structure**. |

### 3. Labels usable for blinded human ordering vs app SI?

| Result | **PARTIAL, ordering yes; clinical/dataset grades no** |
|---|---|
| Evidence | **Shipped labels:** binary folder class only (`affected` / `unaffected`). No eFACE, House–Brackmann, Sunnybrook, severity ordinals, or affected side in the HF tree. **Track B** predeclares *project-collected* blinded human severity ranks (and optional side guesses) **before** scoring, which mirrors v2-gate Task 3 *method*, but those ranks are **not dataset-provided** and Track B itself forbids treating rater side as B7 ground truth. |
| Gate impact | A **pooled** human-vs-app Spearman can be *attempted* on included affected videos. It does **not** enable flaccid/synkinetic subset reporting required by the frozen ordering protocol text. B7 remains blocked (see §5). |

### 4. Licence / consent scope

| Result | **PASS for local evaluation (with flags)** |
|---|---|
| Evidence | Card frontmatter and body: **`license: cc-by-4.0`**. CC-BY-4.0 permits use, modification, and redistribution **with attribution**. Evaluation-only local use for SI aggregates is **in scope**. |
| Flags | (a) Content is **YouTube-curated** faces (card), original subject consent for *this* research use is not documented on the card; treat as higher privacy sensitivity; **do not commit clips** (project rule / MODEL_AND_DATA §3). (b) Card use text emphasizes **training image classifiers**; not a prohibition on eval, but not a clinical DUA. (c) Redistribution of the *videos* is legally allowed under CC-BY-4.0 but **project policy still forbids** committing patient-like media to git. Aggregate numeric reports only. |

### 5. Feasibility: can frozen bars be **measured** as-is?

| Frozen requirement | Measurable on palsynet / track-b as-is? |
|---|---|
| B7 (≥80% with **dataset-labeled** `affectedSide` + smile) | **No.** No dataset `affectedSide`. Task 1 forbids inventing it by watching. Track B rater side is explicitly **not** B7. |
| Ordering ρ ≥ 0.7, **flaccid + synkinetic subsets + pooled** | **No** for subset protocol. Pooled human rank ρ only if we redefine the protocol, which **would change frozen bars** (forbidden). |
| ≥20 scoreable smile clips **both presentations** | **No.** Presentations not labeled; smile/expression not labeled (card has no expression metadata). |
| Secondary SI vs S01 + OK% tables | **Yes**, measurable as exploratory diagnostics. |

| Result | **FAIL overall feasibility for formal V2** |
|---|---|
| Gate impact | Refinement Track B improves **exploratory discipline** (QC, predeclared E1–E4, blinding before scores). It does **not** supply the missing dataset structure required by frozen B7 + dual-presentation missing-data + subset ordering. Wanting a substitute is not evidence. |

---

## Interaction with Stream C’s raw-palsynet assessment

Stream C: raw palsynet = exploratory-only, cannot substitute for V2 PASS.

**Track B does not overturn that.** It:

- Adds predeclared weaker exploratory bars (E1–E4) and human ranks  
- Keeps `isGateEvidence: false` by its own protocol text  
- Still has no flaccid/synkinetic, no dataset `affectedSide`, no clinician grades  

Therefore: refined Track B remains **supporting exploratory evidence**, not a V2 source substitution.

---

## Final verdict

# **EXPLORATORY-ONLY**

**Reason (bars that fail):**

1. **Missing-data / composition:** no flaccid + synkinetic span → cannot meet ≥20 scoreable smile clips **spanning both presentations**.  
2. **B7:** no dataset-labeled `affectedSide` (and inventing labels from video is forbidden by Task 1) → B7 **not measurable**.  
3. **Ordering protocol:** cannot report flaccid/synkinetic subset ρ as required; only a weaker pooled human-rank study exists under Track B’s separate bars.

**What still works (why not CANNOT-USE):** video modality + CC-BY-4.0 + n≈27 affected allow **local exploratory** prior-suppression / OK% / optional human-rank studies under `track-b-palsynet-v1` with `isGateEvidence: false`.

**What a qualifying V2 source still needs:**

- Video clips with **standardized or scoreable smile/voluntary movement**  
- Labels (or verified inventory) for **flaccid and synkinetic**, with ≥20 scoreable smile clips spanning **both**  
- **Affected-side** labels for B7 (dataset-provided, not post-hoc viewing)  
- Licence allowing local evaluation without forcing clip redistrib into git  
- Ability to run blinded human ordering for Spearman ρ ≥ 0.7 under the **frozen** protocol  

Canonical clinical target remains **MEEI Facial Palsy Photo and Video Standard Set** (future acquisition).

---

## D2 action (this evaluation)

| Action | Done? |
|---|---|
| Substitute V2 source → palsynet | **No** (would be dishonest) |
| Change frozen bars | **No** |
| V2 status | **DEFERRED** (MEEI / qualifying clinical set still owed) |
| Palsynet role | Supporting **exploratory-only** evidence if run |
| Publish one-liner to `stream-d-requests.md` | Yes |

*End D1 focused evaluation.*
