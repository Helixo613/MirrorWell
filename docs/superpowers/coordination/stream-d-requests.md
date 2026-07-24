# Stream D → other streams (coordination)

> Append-only requests from Stream D. Owners apply on their files. D writes no source and does not touch `IMPLEMENTATION.md`.

---

## D1 focused verdict (2026-07-21): track-b-palsynet-v1 as V2 source?

**Dataset:** Hugging Face `jasir/palsynet-data` + protocol `track-b-palsynet-v1`  
**Full write-up:** `docs/superpowers/reports/external-evidence/2026-07-21-d1-track-b-v2-substitution.md`  
**Frozen bars:** `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` Task 2. **unchanged**.

### Per-criterion table

| # | Criterion | Result | Evidence / citation |
|---|---|---|---|
| **1** | Modality, video clips (required for live-pipeline SI)? | **PASS** | HF card: *"data is provided as videos, one per person"*. HF API tree: **27** `.mp4` under `data/affected/`, **22** under `data/unaffected/`. Tags include `modality:video`. |
| **2** | n / composition, ≥20 clips spanning **flaccid AND synkinetic**? | **FAIL** | Card + tree only label **`affected` / `unaffected`**. No flaccid/synkinetic fields, files, or card text. n_affected=27 is not enough without both presentations. Track B does not invent presentation labels. |
| **3** | Labels for blinded human ordering vs app SI? | **PARTIAL** | Dataset ships **no** severity ordinals / clinical grades / affected side. Track B can collect **project** blinded ranks (like Task 3 method) for a pooled ρ study, but **not** flaccid/synkinetic subset ρ required by frozen ordering text. |
| **4** | Licence / consent for evaluation? | **PASS (flagged)** | Card: **`license: cc-by-4.0`**, local evaluation + attribution OK. Flags: YouTube-sourced faces (consent scope thin on card); project still must **not** commit clips (eval aggregates only). |
| **5** | Frozen bars measurable as-is (B7 + ordering protocol)? | **FAIL** | **B7:** no dataset `affectedSide`; Task 1 forbids inventing from watching; Track B rater side ≠ B7. **Ordering:** cannot compute flaccid/synkinetic subset Spearman as required. **Missing-data:** cannot span both presentations. Secondary SI/OK% only → exploratory. |

### Final verdict

```
EXPLORATORY-ONLY
```

**Reason:** Track B refinement does **not** change Stream C’s raw-palsynet conclusion for formal V2. Frozen bars that fail measurement: (1) missing-data ≥20 smile clips **spanning flaccid + synkinetic**, (2) **B7** needs dataset-labeled `affectedSide`, (3) ordering protocol’s **presentation-subset** Spearman. Video + CC-BY-4.0 make the set usable for **exploratory** prior-suppression work only (`isGateEvidence: false`), not a V2 PASS path.

**D2:** Do **not** substitute V2 source to palsynet. Keep V2 **DEFERRED** (MEEI / qualifying clinical set still owed). Bars frozen verbatim.  
**One-line for Stream C ledger:**  
`track-b-palsynet-v1 EXPLORATORY-ONLY, cannot substitute V2 (no flaccid/synkinetic; B7 not measurable); formal V2 deferred; frozen bars unchanged.`

**Qualifying source still needs:** video smile/movement clips; flaccid **and** synkinetic labels with ≥20 scoreable smiles across both; dataset `affectedSide` for B7; licence OK for local eval; blinded human ordering under frozen protocol.

---

## Prior notes (retained)

### MEEI access (D1 historical)

- Paper URL `https://www.sircharlesbell.com/standardset` was **HTTP 404** (2026-07-20).  
- SCBS lists standard photo/video sets under membership Useful Downloads.  
- Request remains: reword MODEL_AND_DATA §3/§7 "open via SCBS" (Stream C owns that doc).

### Settled schedule (owner)

- **Now:** palsynet Track B exploratory if run.  
- **Future:** MEEI formal V2.  
- Product may proceed **PROVISIONAL**; do not block on MEEI.
