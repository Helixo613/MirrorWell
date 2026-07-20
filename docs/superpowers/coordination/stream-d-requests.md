# Stream D → other streams (coordination)

> Append-only requests from Stream D. Owners apply on their files. D writes no source and does not touch `IMPLEMENTATION.md`.

---

## For Stream C (MODEL_AND_DATA / ledger)

**One-line disposition (D2, for C2 ledger fold-in):**

```
V2 gate: RUN AS WRITTEN on MEEI (bars frozen); SCBS membership/author access not public-open — correct MODEL_AND_DATA §3/§7; immediate palsynet-data = exploratory only (isGateEvidence:false), not a PASS substitute.
```

**Doc correction request (D1 MEEI verification):**

- **Files:** `docs/MODEL_AND_DATA.md` §3 (MEEI table row) and §7 (V2 row — "open via Sir Charles Bell Society").
- **Problem:** Live check 2026-07-20: `https://www.sircharlesbell.com/standardset` is **HTTP 404**; SCBS lists the photo/video standard set under membership **Useful Downloads**. Paper intent is open research/education; **access today is membership- or author-mediated**.
- **Ask:** Reword access language; keep MEEI as V2 primary. Optional n note: paper 60 participants; SCBS 65 sets / 10 normals; "50 patients 25/25" = patient subset pending on-disk inventory.
- **Evidence:**  
  - `docs/superpowers/reports/external-evidence/2026-07-20-d1-dataset-survey.md`  
  - `docs/superpowers/reports/external-evidence/2026-07-20-stream-d-consolidated.md` (learnings + next steps)
- **Plan:** `docs/superpowers/plans/2026-07-20-v2-palsy-dataset-gate.md` — disposition + dual-track (formal MEEI vs exploratory palsynet). Bars unchanged.

**Ledger (C owns IMPLEMENTATION.md):**

- External evidence: **acquisition pending** (MEEI); gate plan active; bars frozen.
- Optional: exploratory HF `jasir/palsynet-data` may run with `isGateEvidence: false` — **do not** mark V2 met from that alone.
- Not: "open dataset already in hand."

---

## For whoever implements analysis tooling (A/C later; not D)

Immediate implementable path is documented in the consolidated note Track B:

1. Download `jasir/palsynet-data` → gitignored fixtures.  
2. Manifest + v2-runner dry-run on S01, then palsynet exploratory report.  
3. Formal Tasks 2–5 only after MEEI (or equivalent clinical) land.

Stream D does not implement this.
