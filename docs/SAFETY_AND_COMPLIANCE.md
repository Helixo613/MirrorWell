# MirrorWell — SAFETY_AND_COMPLIANCE.md

> **For AI coding agents:** this document is binding on all three tracks. Section numbers are load-bearing (other docs cite §2, §3, §5, §6, §8 by number). §10 maps every rule to the component that enforces it — a safety rule that exists only on paper is a defect; if you implement a rule, add/verify its row in §10 and its test in TESTS.md §4.

## 1. Intended-use statement

MirrorWell is a **research prototype** and **educational exercise-support tool** for adults (18+) **already diagnosed with facial palsy** (e.g., Bell's palsy, post-surgical facial-nerve injury, facial trauma) who have been **assigned facial retraining exercises by a qualified clinician** (physician, facial therapist, SLP). It provides real-time visual feedback on movement symmetry and effort during those exercises, pacing, adherence history, and a patient-controlled export.

MirrorWell's **regulatory status is not determined**; it is **not cleared or approved by any regulator**. It is **NOT**: a diagnostic, screening, assessment, grading, or prognostic tool; a source of exercise prescription; a substitute for professional care. **If the app and the clinician ever disagree, the clinician wins** — this sentence appears verbatim in onboarding.

**Known limitations (plain language, shown in onboarding):** camera measurement is approximate (lighting, distance, glasses, camera quality); the app measures visible movement only — not muscle activity, nerve function, or recovery; scores are relative to the user's own calibration and not comparable between people; the face-tracking model may be less precise on some faces, and the app is designed to say "I can't measure this right now" rather than guess.

## 2. Pre-use screening & contraindications

Enforced by `SafetyGate` + `OnboardingScreen` (FRONTEND §2.1; IMPLEMENTATION Task 9). No use past onboarding without affirming all four:

1. **"A clinician has diagnosed my facial condition."** Undiagnosed facial weakness needs a doctor, not an app (§3).
2. **"A clinician has assigned me facial exercises and said home practice is appropriate."** The clinician-clearance step: whether retraining is indicated, and in which phase, is a clinical decision. The app is scoped to users already in supervised retraining (README non-goals: no acute-phase guidance).
3. **"I am 18 or older."** (§9.)
4. **"I understand MirrorWell does not diagnose, grade, or treat anything."**

**Do-not-use / stop-and-ask list (onboarding, plain language):** new or worsening facial weakness; new/worsening facial pain, twitching, or spasms; recent facial surgery or injections without explicit clinician clearance for exercise; any clinician instruction to pause. The app never attempts to *detect* these — it teaches the user to recognize them and routes to the clinician (the correct division of labor for a non-diagnostic tool).

**Movement-risk posture:** the exercises are gentle, seated, small-amplitude facial movements from the user's own clinician-assigned program — the app adds no movements. The documented risk in facial retraining is **over-effort** (synkinesis reinforcement); the `effortIndex` ease-off cue, conservative `effortTargetZone`, "gentle" calibration protocol, and short default sets are the mitigation — restraint by design.

**Demo-Mode exception (bounded):** evaluators may use Demo Mode without attesting (ARCHITECTURE §11): intended-use notice first; persistent "DEMO — not for exercise use" watermark; nothing persisted; trends/export/caregiver unreachable; reload exits. A demonstration of the interface, never a way to exercise.

## 3. Red-flag & emergency handling

- **Mandatory onboarding education:** "**New or sudden facial droop can be a sign of a stroke or other emergency. If it is new, call your local emergency number immediately — do not use this app to check it.**" A facial-palsy app *will* be opened by someone with new symptoms; this sentence routes them correctly.
- **In-session stop conditions (taught, not detected):** stop and contact your clinician on pain, new twitching/spasm, dizziness, unusual fatigue. A persistent one-tap **Stop** is always visible on `SessionScreen`. Stop flow (FRONTEND §2.4): "was anything wrong?" → "I just needed to stop" (`endReason: 'user_stopped'`) or "I felt pain / something felt wrong" (`endReason: 'red_flag_stopped'` — excluded from trend aggregates) → static guidance page: pause exercises, contact your clinician; urgent care for severe/sudden symptoms. **The app never triages.**
- **Deliberately absent:** symptom detection, automated emergency calls, "you seem worse" alerts — each would require diagnostic capability the app must not claim. Sensing problems (`QualityState`) are fully separated in language from anything about the user's face or health ("I can't see you clearly" — never "your face looks wrong").

## 4. Safety-by-design mechanisms (summary)

| Risk | Mechanism |
|---|---|
| Over-effort → synkinesis reinforcement | `effortTargetZone` + ease-off cue; "gentle" median-of-3 calibration; conservative defaults in `thresholds.ts` |
| Confident wrong feedback | Structural quality gate — metric code cannot run on non-`QUALITY_OK` frames; frozen-bar rule |
| Misleading progress | Noise-floor rule; baseline partitioning; excluded `quality_abandoned`/`red_flag_stopped` sessions; no cross-session comparisons on `SummaryScreen` |
| Emotional harm | Kind summary framing; `reducedFacePreview`; no streaks/guilt; §8 language audit |
| Wrong-population use | §2 attestations; minors excluded (§9); Demo Mode bounded |
| Data exposure | §6 |

## 5. Clinician / caregiver in the loop

No portal, no messaging, no alerts to clinicians — deliberately: an unmonitored channel a clinician is *assumed* to watch is a safety hazard dressed as a feature. The loop runs through the patient:

- **Program setting:** the clinician assigns exercises in person, as they already do; the user mirrors that in `assignedExercises`. Changes happen at appointments, not in-app (the app never progresses dosing or difficulty).
- **Review:** the patient generates the export (`ExportService`, FRONTEND §2.8) — adherence, noise-floor-filtered symmetry trends, `easeOffCount` trend, and `lowQualityFramePct` so the clinician can judge progress *and data quality*. The mandatory `nonDiagnosticNotice` header means a clinician seeing the file cold isn't misled.
- **Caregiver View (`CaregiverScreen`):** trusted people see progress on the patient's own device, strictly **read-only** — enabled only by the patient (`caregiverViewEnabled`, off by default), revocable any time, changes nothing about storage, banner "Read-only view, enabled by the device owner." It is deliberately not an "admin" surface: **the patient is the only administrator of their own health data.** Remote caregiver access is excluded (README non-goals) — it would require a server and accounts, breaking §6; if ever revisited it is a new project with its own consent design.
- **Problem escalation:** through the user per §3. The app never contacts anyone.

## 6. Medical-grade data protection

Design principle: **the best protection for health data is not collecting it.** No server, no accounts, no telemetry, no third parties — the team can never see, sell, or leak user data because it never receives any.

- **MediaPipe telemetry release blocker:** the MediaPipe repo privacy notice mentions Tasks API utilization metrics; runtime network inspection of the pinned `@mediapipe/tasks-vision` package must prove zero telemetry before release (ARCHITECTURE §6).
- **Local voice only:** optional coaching speech uses the operating system's local `speechSynthesis` voice. Network TTS is prohibited by the same no-network rule and CI gate as every other external request.
- **What exists:** derived numeric metrics only (DATABASE.md), on the user's device. Frames and landmark arrays live in memory per frame and are discarded — never persisted (schema-file rule; CI no-network; DB inspection in TESTS.md). Narrow exception mirroring the camera-lifecycle exception: **dev-only harnesses under `src/dev/`** (excluded from the prod bundle) may record camera video **solely** for consented fixture capture per MODEL_AND_DATA §4/§7 — download-only (user's local disk, git-ignored `tests/fixtures/masters/`), never IndexedDB, never any production path.
- **Consent flow:** onboarding obtains informed plain-language consent for local camera processing and local metric storage, versioned by `consentVersion` (bump → re-consent). Text states: what is processed (camera images, in memory only), what is stored (numbers about movement, on this device only), what never happens (uploads, sharing, sale — there is nowhere to upload to).
- **Encryption:** *in transit* — not applicable by design (no transmission; CI-enforced). *At rest* — IndexedDB under the OS's protections (user accounts, full-disk encryption where enabled). Stated honestly: the prototype adds no app-level at-rest encryption; compensating controls are radical minimization (numbers, not images), onboarding device-lock guidance, and one-tap deletion. A documented trade-off — app-level encryption is listed as future hardening, not silently assumed.
- **Minimization:** no legal names, emails, birthdates, diagnosis details, or free-text health notes. Narrow exceptions: `nickname` is an optional user-chosen display name used only for the on-device greeting (30 characters), and `motivation` is an optional 120-character statement of the user's own reason for practice shown back on Home and during rest. The motivation prompt does not solicit diagnosis or symptom details. Both fields stay on-device and are never exported. `affectedSide` is the only condition-adjacent field, used solely for display orientation.
- **Retention & right-to-delete:** data persists until the user deletes it; `deleteAllData` (typed confirmation) removes everything in one action; clearing site data does the same. No copy exists anywhere else.
- **Exports:** the only way data leaves the device, via explicit user action; `ExportScreen` advises sharing only with the care team. The weekly `progressCard` PNG is the same data class as the JSON export (derived aggregates the user already sees — week range, session count, gentleness stat, garden stage; no frames, landmarks, or raw metric tables) and uses the same local-download-only channel (no Web Share API, no clipboard, no network).
- **Development fixtures:** volunteer clips (MODEL_AND_DATA §4) require written consent naming the exact use; repo inclusion only if consent explicitly covers it; deletable on request; manifest stores consented demographic labels, never names.

## 7. Applicable frameworks (design-respect, not certification)

- **India — DPDP Act, 2023:** consent-based processing, purpose limitation, minimization, right to erasure — satisfied by construction (no collection); applicability to purely on-device processing **needs verification**, and the design clears the stricter reading anyway.
- **GDPR (reference principles):** health data as special category; explicit consent; privacy-by-design/default; right to erasure — same conclusion.
- **Medical-device / regulatory status:** MirrorWell is a research prototype; regulatory status is not determined; it is not cleared or approved by any regulator. Exact jurisdictional boundaries under India's Medical Device Rules as amended, US FDA general-wellness policy, and EU MDR concepts **need verification with the mentor**; the enforceable engineering rule is §8.
- **Accessibility:** WCAG 2.1 AA (FRONTEND §4).

## 8. Responsible-use limits & language audit

The app must **never**, in any screen, cue, summary, export, or listing:

1. Diagnose, suggest, or rule out any condition ("this looks like…" forbidden in all forms).
2. Grade severity or compute any clinical scale (no Sunnybrook, no House-Brackmann — vocabulary only, MODEL_AND_DATA §8).
3. Predict or estimate recovery ("on track", "ahead of schedule" forbidden).
4. Use *diagnosis, severity, recovery score, prognosis, normal/abnormal* about the user's face. Approved register: *symmetry, movement, gentle, practice, steady, this exercise, this session*.
5. Compare the user to other people or population norms (all metrics self-referenced to the user's `baselineId`).
6. Claim to detect synkinesis, nerve function, or emotional state.
7. Present a metric when quality gates failed (structurally prevented; plus the language rule: "that one didn't count — the light dipped", never a substituted guess).
8. Pressure the user: no streaks, no shame for missed sessions, no urgency mechanics.

**Audit process:** every user-facing string lives in `src/config/strings.ts`; before any demo/release a checklist pass verifies rules 1–8 against every string (first run: IMPLEMENTATION Task 9; automated forbidden-vocabulary scan + manual pass; TESTS.md §4). Violations are release blockers, equal to the fairness gate.

## 9. Minors

**Scoped out entirely.** Adults 18+ only; §2 attestation includes it; all copy states it. Rationale: pediatric facial palsy exists, but pediatric rehab involves consent, supervision, dosing, and developmental considerations this project cannot responsibly design for — scoping out is the honest choice. Revisiting would require verified parental/guardian consent, clinician co-design, and a child-appropriate redesign of all feedback and language: a new project, not a toggle.

## 10. Enforcement map — every rule, its enforcing component, its test

| Rule (section) | Enforced by (canonical name) | Verified by (TESTS.md) |
|---|---|---|
| Attestation before any use (§2) | `SafetyGate.isAttested` gating `SessionController.start` + `CalibrationFlow`; route guards (FRONTEND §1) | §4.1 |
| Four checkboxes before attestation (§2) | `OnboardingScreen` disabled-continue rule | §4.1 |
| 18+ scope (§9) | Attestation checkbox 3; copy audit | §4.1, §4.6 |
| Emergency education shown (§3) | `OnboardingScreen` step 2 (unskippable stepper) | §4.2 |
| Two-path stop + guidance page (§3) | `SessionScreen` stop dialog → `stop('user_stopped' \| 'red_flag_stopped')` | §4.2 |
| `red_flag_stopped`/`quality_abandoned` excluded from trends (§3, §4) | `TrendsService.getTrend` | §2 (TrendsService unit) |
| Ease-off / restraint mechanic (§2, §4) | `MetricEngine` ease-off condition + `FeedbackRenderer` cue; `effortTargetZone` in `thresholds.ts` | §2 (MetricEngine), §5 journey 1 |
| "Gentle" calibration, median-of-3 (§2) | `CalibrationFlow.captureComfortableMax`; strings audit | §2 (CalibrationFlow), §4.6 |
| No metrics on bad frames (§4) | Type barrier: `ApprovedFrame` constructible only in `quality.ts`; `normalize`/`measureAbsolute` accept only `ApprovedFrame` (bad-frame metrics are a compile error); frozen-bar rule in `FeedbackRenderer` | §3.3 fail-safe suite |
| Noise-floor honesty (§4) | `TrendsService` `aboveNoiseFloor`; `SummaryScreen` no-comparison rule | §2 (TrendsService), §4.5 |
| Demo Mode bounded (§2) | `SafetyGate.enterDemoMode` + `StorageService` write backstop + route guards + watermark | §4.3 |
| Caregiver view read-only, patient-toggled (§5) | `CaregiverScreen` guard on `caregiverViewEnabled`; zero mutating controls | §4.4 |
| No network / nothing leaves device (§6) | Absence of any network code + CI no-network gate | §1 (CI), §4.7 |
| Frames never persisted (§6) | `schema.ts` rule + `StorageService` validation (numeric fields only) | §2 (Storage), §4.7 DB inspection |
| Right-to-delete (§6) | `StorageService.deleteAllData` via `SettingsScreen` typed confirmation | §4.7 |
| Consent versioning (§6) | `SafetyGate` `consentVersion` check vs `VITE_CONSENT_VERSION` | §4.1 |
| Export non-diagnostic header + schema bound (§5, §8) | `ExportService` mandatory `nonDiagnosticNotice` + schema validation | §2 (ExportService) |
| Optional nickname remains local (§6) | `ExportService` explicit profile allow-list excludes `nickname` | §2 (ExportService exclusion test) |
| Optional motivation remains local (§6) | `ExportService` explicit profile allow-list excludes `motivation` | §2 (ExportService exclusion test) |
| Language rules 1–8 (§8) | `strings.ts` single source + audit checklist + forbidden-vocabulary scan | §4.6 |
| No time pressure (§8.8, FRONTEND §4) | `extendRest` extension-only API; user-paced reps | §2 (SessionController) |

## 11. Residual-risk register (acknowledged, accepted for a prototype)

| Residual risk | Why accepted | Watch-item |
|---|---|---|
| User reads symmetry trend as clinical judgment despite language rules | Copy cannot fully prevent it | Pilot interviews probe this explicitly; strengthen framing if observed |
| Device-sharing exposes local data | OS-level controls + minimization only | Device-lock guidance; future app-level encryption (§6) |
| User exercises against clinician advice using the app | App cannot know clinician instructions | §2 attestation + §3 education are the honest maximum for a non-connected tool |
| Landmark model underperforms on faces unlike its training data despite V4 passing (small-n fixtures) | Student-scale validation cannot match industrial coverage | Documented in writeup; fail-safe gates + §8.7 bound the harm to "no feedback", never "wrong feedback" |
