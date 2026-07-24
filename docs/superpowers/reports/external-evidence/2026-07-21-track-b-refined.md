# Track B refined: palsynet exploratory protocol (time-boxed)

**Date:** 2026-07-21  
**Status:** Active near-term path while formal MEEI (Track A) is deferred for schedule.  
**Does not replace** formal V2 bars in `2026-07-20-v2-palsy-dataset-gate.md`.  
**Stamp every report:** `"kind":"exploratory-analysis","isGateEvidence":false,"protocol":"track-b-palsynet-v1"`.

Parent: `2026-07-20-stream-d-consolidated.md`. Dataset: Hugging Face [`jasir/palsynet-data`](https://huggingface.co/datasets/jasir/palsynet-data) (CC-BY-4.0).

---

## 1. Why refine Track B

Naive Track B (“download videos, dump mean SI, shrug”) wastes the only free real-palsy video we can get **today**. Refined Track B:

- Answers the **same scientific question** as V2, in weaker form: *does blendshape SI collapse real asymmetry toward 1.0?*
- Uses **predeclared** analysis choices **before any app scores** (same discipline as V1/V2; no post-hoc bar shopping).
- Produces **actionable** product language: *supportive / concerning / inconclusive* for shipping **PROVISIONAL** claims; never a formal PASS.

| Formal V2 (MEEI, frozen) | Refined Track B (palsynet) |
|---|---|
| Flaccid + synkinetic labels | Dataset has only **affected / control** |
| Clinician eFACE/HB/SB | **Human rater** severity ranks (predeclared) |
| Dataset `affectedSide` | **Optional rater** L/R with agreement gate |
| PASS / FAIL / UNDERPOWERED | **SUPPORTIVE / CONCERNING / INCONCLUSIVE** |
| `isGateEvidence: true` path | Always **`false`** |

---

## 2. What success looks like for *our* use case

MirrorWell’s near-term needs, in priority order:

1. **Prior-suppression (primary):** Real palsy faces must **not** look like S01 symmetric smile (SI ≈ 0.98–0.99). If median affected SI sits in the “almost symmetric” band, that is a **product-risk signal** (same #1 risk as MODEL_AND_DATA §2).
2. **Ordering (secondary):** App SI rank order should roughly match a blinded human “how asymmetric?” ranking on the same clips.
3. **Quality fairness (guard):** Pipeline must not silently reject most palsy faces (`QUALITY_OK` starvation).
4. **Direction (tertiary, weak):** Where two raters agree on affected side, lower blendshape side should match; **exploratory only**, not B7.

If (1) fails hard → treat like early fallback pressure (document; do not invent PASS).  
If (1)+(2)+(3) look good → ship demo/backend still **PROVISIONAL**, with language: *“exploratory real-palsy video set supports prior-sensitivity; formal V2 (MEEI) still owed.”*

---

## 3. Material + layout

| Item | Spec |
|---|---|
| Download | `huggingface-cli download jasir/palsynet-data --repo-type dataset --local-dir <scratch>` then copy videos only |
| Store | `tests/fixtures/v2/palsynet/{affected,unaffected}/*.mp4` (**gitignored**) |
| License notes | `tests/fixtures/v2/LICENSE_NOTES.md`, CC-BY-4.0, YouTube-sourced faces, eval-only, no redistrib of clips, cite HF card |
| Anchors | Always score **S01** `EX_SMILE` (+ smirk if present) in the same runner batch as reference |
| Never commit | Any mp4/webm/frame dump under `tests/fixtures/v2/**` |

---

## 4. Pre-score human pass (do this *before* any SI numbers)

Raters watch clips **without** app scores, manifest grades, or SI UI.

### 4.1 Inclusion screen (per clip): binary include/exclude

Exclude if **any** hold (record reason):

| Code | Reason |
|---|---|
| `E_FACE_SMALL` | Face &lt; ~20% of frame height most of the time |
| `E_PROFILE` | Mostly non-frontal (&gt;~30° yaw estimated by eye) |
| `E_OCCLUDED` | Mask, hands, heavy crop, extreme blur |
| `E_MULTI` | Multiple faces / cutaways dominate |
| `E_TOO_SHORT` | Usable continuous face segment &lt; 2 s |
| `E_NO_MOTION` | Static still / slideshow posing as video |

**Predeclared n floor:** need ≥ **15 included affected** and ≥ **10 included control** after screen, else verdict = **INCONCLUSIVE (under-enrolled)**; stop; do not loosen filters after seeing SI.

### 4.2 Per included clip (human fields)

Store in `tests/fixtures/v2/human_labels_palsynet.json` (committed: IDs + integers/enums only):

```json
{
  "protocol": "track-b-palsynet-v1",
  "collectedAt": "ISO-8601",
  "raterId": "r1",
  "clips": {
    "affected/12.mp4": {
      "include": true,
      "excludeReason": null,
      "severityRank": 1,
      "affectedSideGuess": "left | right | unclear",
      "expressionGuess": "smile | speech | rest | mixed | other",
      "usableWindowSec": [start, end]
    }
  }
}
```

| Field | Rule |
|---|---|
| `severityRank` | Dense ranks **within affected only**: 1 = least asymmetric … N = most. Controls ranked separately or omitted from ordering ρ. |
| `affectedSideGuess` | Best guess; use `unclear` freely. **Direction probe uses only clips where rater1 and rater2 agree and neither is unclear** (if single rater: mark direction as single-rater-weak). |
| `expressionGuess` | Prefer clips with `smile` or clear voluntary mouth motion for the SI primary analysis set. |
| `usableWindowSec` | Optional: if speech video is long, raters mark a 3–8 s frontal window; runner samples that window only. |

**Blinding:** complete and commit human_labels **before** generating any app report for those clip IDs.

---

## 5. Predeclared exploratory bars (frozen for this protocol)

Declared **here, before scoring**. Changing after results is a defect for Track B.

### E1: Prior-suppression (primary)

Let \(S_{\mathrm{aff}}\) = median of per-clip mean smoothed SI over `QUALITY_OK` frames (included affected only).  
Let \(S_{\mathrm{ctrl}}\) = same for included controls.  
Let \(S_{\mathrm{S01}}\) = S01 symmetric smile mean SI (known ~0.98–0.99).

| Outcome | Condition |
|---|---|
| **SUPPORTIVE** on E1 | \(S_{\mathrm{aff}} \le S_{\mathrm{S01}} - 0.15\) **and** \(S_{\mathrm{aff}} < S_{\mathrm{ctrl}}\) |
| **CONCERNING** on E1 | \(S_{\mathrm{aff}} > S_{\mathrm{S01}} - 0.08\) (affected look nearly symmetric) |
| **INCONCLUSIVE** on E1 | Otherwise, or n below floor |

Rationale: 0.15 gap is a **predeclared** practical separation from “almost 1”; not a clinical cut-score. S01 smirk (~0.43–0.72) is a lower reference only (acted asymmetry), not a pass bar.

### E2: Ordering (secondary)

Spearman ρ between app mean SI (ascending = more asymmetric) and human `severityRank` on **included affected** with ranks.

| Outcome | Condition |
|---|---|
| **SUPPORTIVE** on E2 | ρ ≥ **0.5** and n ≥ 15 |
| **CONCERNING** on E2 | ρ &lt; **0.2** and n ≥ 15 |
| **INCONCLUSIVE** on E2 | 0.2 ≤ ρ &lt; 0.5, or n &lt; 15 |

Weaker than formal V2’s 0.7 on purpose, noisy YouTube + non-clinician raters.

### E3: Quality guard

| Outcome | Condition |
|---|---|
| **SUPPORTIVE** on E3 | ≥ **70%** of included affected have OK% ≥ 50% |
| **CONCERNING** on E3 | &lt; **50%** of included affected have OK% ≥ 50% |
| **INCONCLUSIVE** on E3 | In between |

### E4: Direction (tertiary, optional)

Only on multi-rater-agreed side ≠ `unclear`. Rate = fraction where mean activation on guessed affected side is the **lower** of L/R (`mouthSmileLeft/Right` when expression is smile-like; else max of available per-side smile blendshapes, **same mapping as production smile SI**, document which pair).

| Outcome | Condition |
|---|---|
| **SUPPORTIVE** on E4 | rate ≥ **0.70** and n_agree ≥ **10** |
| **CONCERNING** on E4 | rate &lt; **0.50** and n_agree ≥ **10** |
| **INCONCLUSIVE** on E4 | else (including single-rater or n_agree &lt; 10) |

### Overall Track B verdict

| Overall | Rule |
|---|---|
| **EXPLORATORY_SUPPORTIVE** | E1 SUPPORTIVE **and** E3 not CONCERNING **and** E2 not CONCERNING |
| **EXPLORATORY_CONCERNING** | E1 CONCERNING **or** E3 CONCERNING |
| **EXPLORATORY_INCONCLUSIVE** | Everything else |

**Never** map these to formal V2 PASS/FAIL. Formal bars remain for MEEI only.

---

## 6. Runner / implementation constraints (match production)

Reuse V1/V2 measurement stack unchanged:

- Sample ≥ 100 frames in usable window (or full clip if short); keep `QUALITY_OK` only.
- SI: min/max per-side blendshapes, activation floor **0.05**, trailing **5-frame median**; copy constants from production / `run-v1.mjs`, cite lines.
- Aggregates only in `tests/analysis/v2_palsynet_exploratory_report.json`.
- Dry-run **first** on S01: smile ≈ 0.98, smirk SI in known band; if dry-run fails, stop (tooling bug, not dataset).

Manifest fields (palsynet):

```json
{
  "clipId": "palsynet_aff_12",
  "file": "palsynet/affected/12.mp4",
  "presentation": "unknown_palsy | control",
  "affectedSide": "unknown",
  "expression": "unknown",
  "sourceGrade": "",
  "notes": "track-b; human labels in human_labels_palsynet.json"
}
```

Human labels supply ranks/sides for analysis; **do not** copy rater guesses into `affectedSide` as if they were dataset ground truth.

---

## 7. Execution checklist (time-boxed ~1–2 days human + tooling)

| Step | Owner | Done when |
|---|---|---|
| B0 | Human | LICENSE_NOTES + download + gitignore paths |
| B1 | Human | Inclusion screen complete; n floors checked |
| B2 | Human | Severity ranks (+ optional 2nd rater) committed **before** scores |
| B3 | Eng | S01 dry-run green |
| B4 | Eng | palsynet scored; report written with E1–E4 + overall |
| B5 | Human | One-paragraph product interpretation (PROVISIONAL wording) |
| B6 | Stream C | Ledger: exploratory result cited; formal V2 still open |

---

## 8. Product language templates (use after B4)

**If EXPLORATORY_SUPPORTIVE:**  
> “On a free public Bell’s-palsy video set (YouTube-curated, not a clinical standard set), blendshape SI separated affected faces from controls and from our symmetric reference, and roughly tracked human asymmetry ranks. This is exploratory only; formal V2 on a flaccid/synkinetic clinical set is still required before longitudinal/diagnostic-adjacent claims.”

**If EXPLORATORY_CONCERNING:**  
> “Exploratory palsynet run suggests the blendshape prior may compress real asymmetry (and/or quality gates reject atypical faces). Treat metric claims as high-risk PROVISIONAL; prioritize fallback ladder review; do not expand trend claims.”

**If EXPLORATORY_INCONCLUSIVE:**  
> “Exploratory set under-powered or mixed after predeclared QC. No evidence for or against prior-suppression; formal V2 still open; ship demo only with clear non-diagnostic framing.”

---

## 9. What we deliberately do *not* refine into

- Treating rater L/R as clinical truth for a B7 PASS.
- Adding flaccid/synkinetic by guessing from video after seeing SI.
- Tuning the 0.15 / 0.5 / 0.70 thresholds after looking at results.
- Committing clips or frame exports.
- Dropping formal V2 from the roadmap because Track B “felt good.”

---

## 10. One-line for coordination

```
Track A deferred for schedule; Track B refined protocol track-b-palsynet-v1 is the near-term path (exploratory bars E1–E4 predeclared; isGateEvidence:false; formal V2 bars untouched).
```

*End refined Track B.*
