# D1: External palsy-dataset survey (Stream D)

**Date:** 2026-07-20  
**Branch:** `stream-d-external`  
**Scope:** Live-link research only. No clips downloaded. No source code. No `IMPLEMENTATION.md` edits.  
**Gate need (from v2 plan / MODEL_AND_DATA §7):** blinded ordering across **≥20 scoreable smile/voluntary-movement video clips** spanning **flaccid + synkinetic** presentations; evaluation-only, never redistributed, never committed.

---

## Executive finding

| Source | Gate-ready (≥20 clips, flaccid+synkinetic, video)? | Access today |
|---|---|---|
| **MEEI Standard Set** | **Yes, only designed fit** | **Not freely open.** Paper URL `/standardset` is **HTTP 404**. SCBS homepage lists the set under membership **Useful Downloads**. |
| YouTube Facial Palsy (YFP) | Borderline n; **no flaccid/synkinetic labels** | University-email request, 3–7 workdays; research-only, no redistribution |
| Toronto NeuroFace | ≥20 smile videos possible; **not facial palsy** (ALS/stroke) | Request page **404**; contact lab authors |
| Kaggle / HF / Zenodo / figshare | No open set meets the full V2 design | Mixed; see §5 |

**MODEL_AND_DATA §7 / §3 claim that MEEI is "open via the Sir Charles Bell Society" is overstated for 2026-07-20 access.** Paper *intent* is open research/education; **live access is membership- or author-mediated**, not an anonymous public download. **Request filed to Stream C** to correct §7 (and the §3 table row).

---

## 1. MEEI Facial Palsy Photo & Video Standard Set

| Field | Finding |
|---|---|
| **Full name** | MEEI [Massachusetts Eye and Ear Infirmary] Facial Palsy Photo and Video Standard Set |
| **Citation** | Greene JJ et al. *The spectrum of facial palsy: The MEEI facial palsy photo and video standard set.* Laryngoscope. 2020;130(1):32–37. PMID [31021433](https://pubmed.ncbi.nlm.nih.gov/31021433/). DOI [10.1002/lary.27986](https://doi.org/10.1002/lary.27986) |
| **Modality** | Standardized **photographs and videos** of facial movements (exercise/expression protocol, not free-form speech) |
| **n** | Paper: **60 participants** enrolled, categorized by eFACE across the function range. Project docs quote **50 patients: 25 flaccid + 25 synkinetic** (patient subset; excludes normals). SCBS marketing: **65 photo sets, including 10 normals**; flaccid and synkinetic equally represented. **Reconcile on acquisition.** |
| **Labels** | **eFACE**, **House–Brackmann**, **Sunnybrook** clinician scales; flaccid vs non-flaccid/synkinetic grouping. Excellent for `sourceGrade` + presentation fields in the v2 manifest. |
| **Licence / redistribution** | Paper language: **"open-source" / open database for research and education**. **Exact license text not retrievable without landing on a downloadable package**, Task 0 still must capture verbatim terms in `tests/fixtures/v2/LICENSE_NOTES.md` before any clip is scored. Safe default (already in v2 plan): evaluation-only, no redistribution, never commit clips. Patient media: higher sensitivity than S01 self-face. |
| **Exact access path (verified 2026-07-20)** | 1. Paper path: `https://www.sircharlesbell.com/standardset` → **HTTP 404** (probed). 2. Society home: `https://www.sircharlesbell.com/` (up; MemberClicks CMS). Homepage markets *"Comprehensive, Open source full sets of photos and videos of ALL LEVELS of facial function! 65 photo sets, including 10 normals. Flaccid and synkinetic faces equally represented"* under **"Would you like access to Useful Downloads?"** next to **Join Membership Now**. Membership copy: *restricted areas of the website* + useful downloads. 3. Membership application: `https://scbs.memberclicks.net/sir-charles-bell-society-membership-application`. 4. Fallback: contact corresponding authors / MEEI Facial Nerve Center via the Laryngoscope paper contacts (not automated). |
| **Time-to-access** | **Days to weeks.** Membership application + login, or author email. **Not same-day anonymous download.** |
| **≥20-clip blinded ordering (flaccid + synkinetic)?** | **Yes; the only surveyed source designed for this.** Standardized smile/movement video per patient (confirm video vs photo-only per subject on inventory), labeled presentation types, clinical severity grades as free second reference ordering. Meets predeclared missing-data rule (≥20 scoreable smile clips spanning both presentations) **if** videos exist for enough patients (Task 0 inventory). |
| **Consent / redistribution constraints** | Clinical patient media. Even if "open" for research, **no third-party redistribution, no git, no product shipping** (MODEL_AND_DATA §3). Aggregates only in reports. |

### MEEI openness verdict (for Stream C)

| Claim in MODEL_AND_DATA | Verified? |
|---|---|
| "Open-source via the Sir Charles Bell Society" | **Partially true historically (paper intent); false as a public access description today.** |
| Available without research DUA / university request | **Not confirmed.** Public path 404; asset is membership-download framed. |
| 50 patients 25/25 flaccid/synkinetic | **Plausible patient split**; paper n=60 total; SCBS 65 sets / 10 normals, **needs verification on disk.** |

**Stream C action:** reword §3 table + §7 V2 row from "open via SCBS" to something accurate, e.g. *hosted for the research community via the Sir Charles Bell Society (membership / Useful Downloads as of 2026-07-20; paper open-research intent; exact license on acquisition; public `/standardset` URL is dead)*.

---

## 2. YouTube Facial Palsy (YFP) Database

| Field | Finding |
|---|---|
| **Sources** | Site: [sites.google.com/view/yfp-database](https://sites.google.com/view/yfp-database) (loads; content thin in automated fetch). GitHub: [AvLab-CV/YouTube-Facial-Palsy-Database](https://github.com/AvLab-CV/YouTube-Facial-Palsy-Database). Paper: Hsu et al., IEEE Access 2018 (hierarchical network for facial palsy). |
| **Modality** | **32 video clips** of patients speaking to camera (unconstrained YouTube). Converted to image sequences at **6 FPS**. Not a standardized exercise protocol. |
| **n** | **32 clips / ~21–22 patients** (README: 22 patients; body text also says 21). Some multi-clip patients. |
| **Labels** | Clinician-labeled **local palsy regions** (Eyes / Mouth) when deformation intensity high enough; intensity **0.5 (low) / 1.0 (high)**; intersection of three clinicians. **No flaccid vs synkinetic presentation label. No eFACE/HB/Sunnybrook ordinal severity.** |
| **Licence** | Research-only. Explicit: **no redistribution**, no third-party share without written faculty permission, no commercial profit. Must cite Hsu et al. |
| **Exact access path** | 1. Email from a **valid university (.edu or similar)** account to `avlabdba@gmail.com`, **cc** `jison@mail.ntust.edu.tw`. 2. Subject + body must match the [RequestForms.txt](https://github.com/AvLab-CV/YouTube-Facial-Palsy-Database/blob/master/RequestForms.txt) template (name, affiliation, department, position, email, postal, phone, research-only attestation, signature). 3. Password issued in **3–7 workdays**. 4. Download via password-protected Google Drive folders linked from the GitHub README. |
| **Time-to-access** | **3–7 workdays** if form is correct; longer if spam-filtered or non-edu email. |
| **≥20-clip blinded ordering (flaccid + synkinetic)?** | **Partial / weaker only.** Clip count ≥20 is possible (~32 videos), but: (a) **no flaccid/synkinetic labels** → cannot meet the V2 "spanning both presentations" design as written; (b) speech, not standardized smile; (c) ~21 patients → patient-level independence is thin for Spearman ρ; (d) severity labels are regional intensity, not global ordering grades. Suitable for **exploratory prior-suppression probes**, not as a full substitute for the frozen V2 gate design. |
| **Related open forks** | Kaggle "YFP_Dataset_Updated" ([dohaeid/yfp-dataset-updated](https://www.kaggle.com/datasets/dohaeid/yfp-dataset-updated)), filtered YFP for eye/eyebrow/mouth regions; **redistribution status relative to YFP's no-redistribute rule is unclear; do not use as a license workaround.** |

---

## 3. Toronto NeuroFace

| Field | Finding |
|---|---|
| **Citation** | Bandini A et al. *A New Dataset for Facial Motion Analysis in Individuals with Neurological Disorders.* IEEE JBHI 2021;25(4):1111–1119. PMC [PMC8062040](https://pmc.ncbi.nlm.nih.gov/articles/PMC8062040/). |
| **Modality** | **261 RGB (+ depth) videos**, ~50 fps, 640×480, Intel RealSense SR300. Controlled frontal lighting. Tasks include **BIGSMILE**, BROW, SPREAD, BLOW, KISS, OPEN, speech (BBP, PA, PATAKA). |
| **n** | **36 participants:** 11 ALS, 14 post-stroke (PS), 11 healthy controls. |
| **Labels** | Two SLPs: **symmetry, ROM, speed, variability, fatigue** (5-point Likert) + total; average of raters. **>3300 frames** with manual **68-landmark** Multi-PIE annotation. Diagnosis group (ALS/PS/HC). **Not facial-palsy flaccid/synkinetic.** |
| **Licence** | Research shareable database under REB consent (paper). Exact DUA on request. Not a public CC dump. |
| **Exact access path** | Paper footnote: request at `slp.utoronto.ca/faculty/yana-yunusova/speech-production-lab/datasets/`. **Probed 2026-07-20: that URL is Page not found (404).** Lab faculty page for Yunusova also 404s under the same site restructure. **Practical path:** email corresponding authors (paper lists `yana.yunusova@utoronto.ca`; Babak Taati / KITE–Toronto Rehab). |
| **Time-to-access** | **Unknown; likely 1–4+ weeks** for research DUA after contact; broken public request page adds friction. |
| **≥20-clip blinded ordering (flaccid + synkinetic)?** | **No for the V2 palsy design.** Can supply **≥20 BIGSMILE videos** with clinician **symmetry** scores (good for a *related* asymmetry-ordering experiment), but population is **ALS / post-stroke orofacial impairment**, not peripheral facial palsy flaccid/synkinetic. Use only as **optional strengthener / exploratory**, as the v2 plan already notes. |
| **Scientific relevance** | Paper itself documents **face-alignment bias** on impaired faces, relevant background for the canonical-face prior risk, not a drop-in V2 fixture set. |

---

## 4. Other registries (Kaggle / Hugging Face / Zenodo / figshare)

| Source | What | Gate fit | Access |
|---|---|---|---|
| **Hugging Face `jasir/palsynet-data`** | Bell's palsy + control faces curated from public YouTube; videos → extract frames script; **CC-BY-4.0**; ~258 MB | **Weak.** Real-ish palsy faces, open license, same-day download; but **no clinical grades, no flaccid/synkinetic, unconstrained quality**, YouTube consent/attribution murky for clinical evaluation claims. Exploratory SI distribution probe only. | [huggingface.co/datasets/jasir/palsynet-data](https://huggingface.co/datasets/jasir/palsynet-data); open |
| **Kaggle YFP_Dataset_Updated** | Filtered YFP region labels | Same limits as YFP; license conflict risk | Kaggle account |
| **AFLFP** (Xia et al. 2023) | **Stills**, 88 subjects, 16-class asymmetric expressions, **68 landmarks** each; non-commercial research | **Stills only** → cannot drive the video `detectForVideo` / v2-runner pipeline as designed. Useful for landmark-bias side checks, not V2. | Academic email + signed EULA to `hui.yu@glasgow.ac.uk`, cc `xiayifan@sdu.edu.cn` ([github.com/Yifan313/AFLFP](https://github.com/Yifan313/AFLFP)) |
| **IEEE DataPort "Facial Paralysis Dataset"** (2019) | Multi-view video of paralyzed patients | Access often **subscription-gated** on DataPort; not verified free | [ieee-dataport.org](https://ieee-dataport.org/documents/facial-paralysis-dataset) |
| **figshare "Facing Asymmetry Dataset"** | **Simulated** asymmetric faces | Not real palsy | figshare |
| **Zenodo FELT** | Landmark/AU tracks of RAVDESS (acted emotion, healthy) | No palsy | Zenodo open |
| **FairFace / Casual Conversations** | Fairness stills/video, no palsy | V4 fairness only (MODEL_AND_DATA already); not V2 | License checks still owed at V4 |

**No Kaggle/HF/Zenodo/figshare hit provides a ready, labeled, flaccid+synkinetic, ≥20 standardized smile-video gate equivalent to MEEI.**

---

## 5. Gate-support summary

| Requirement | MEEI | YFP | NeuroFace | palsynet-data (HF) | AFLFP |
|---|---|---|---|---|---|
| Video (not stills) | Yes (photos+video) | Yes | Yes | Yes (source videos) | **No** |
| n clips ≥20 smile/movement | Likely (inventory) | ~32 total, not all smile | BIGSMILE subset yes | Unknown quality | N/A |
| Flaccid **and** synkinetic labels | **Yes** | **No** | **No** (ALS/PS) | **No** | Asymmetric expressions ≠ clinical types |
| Severity / ordering labels | eFACE / HB / SB | Regional intensity only | Symmetry Likert | None | Expression class |
| Blinded human ordering feasible | **Yes** | Yes (weaker) | Yes (wrong population) | Weak | Stills only |
| Access ≤1 week without membership | **No** (as of today) | **Yes** (edu email) | Unclear (404) | **Yes** (open) | Email DUA |
| Fits frozen V2 bars as written | **Yes** | No (design mismatch) | No | No | No |

---

## 6. Redistribution / consent flags (all sources)

- **Never commit patient clips** (`tests/fixtures/v2/**` gitignored except manifest + LICENSE_NOTES), already in v2 plan.
- YFP and AFLFP **explicitly forbid redistribution**; membership MEEI media should be treated the same unless license text says otherwise.
- YouTube-derived sets (YFP, palsynet-data): original subjects did not consent *to this project*; evaluation-only local use only; no marketing/demo of identifiable faces.
- Reports: **clip IDs + aggregates only**; no frames, no landmarks, no screenshots.

---

## 7. Recommended acquisition sequence (human, not code)

1. **Primary (gate):** Resolve MEEI access, SCBS membership *or* author/MEEI request; capture license text day-0; inventory smile videos flaccid vs synkinetic.  
2. **Parallel contingency (exploratory, not full substitute):** Submit YFP university-email request (3–7 days) for prior-suppression probes if MEEI slips.  
3. **Optional strengthener:** Re-locate Toronto NeuroFace contact after UofT SLP site restructure; request BIGSMILE subset.  
4. **Do not** treat HF/Kaggle dumps as the V2 PASS path.

---

## 8. Sources consulted (2026-07-20)

- PubMed abstract PMID 31021433; paper claims open SCBS hosting at `sircharlesbell.com/standardset`
- Live probe: `https://www.sircharlesbell.com/` (200) and `/standardset` (**404**); homepage membership/Useful Downloads copy
- GitHub AvLab-CV/YouTube-Facial-Palsy-Database (access form, restrictions, n)
- PMC8062040 Toronto NeuroFace full text (n, tasks, scores, access footnote)
- Live probe: UofT NeuroFace request URL **404**
- Hugging Face `jasir/palsynet-data`; GitHub Yifan313/AFLFP; web survey of Kaggle/Zenodo/figshare facial-palsy hits

*End of D1 notes.*
