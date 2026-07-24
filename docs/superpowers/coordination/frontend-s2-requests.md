# Frontend Stream S2: outgoing requests

Stream S2 (`src/screens/{onboarding,home,settings}/**` + their tests;
`strings.{onboarding,home,settings}`) files requests here for changes it needs in files it does not
own. Per `docs/superpowers/plans/2026-07-21-full-app-completion-parallel.md` ownership rule 1, S2
never edits another stream's file, nor the frozen shell (`App.tsx`, `src/router/**`,
`src/context/**`, `src/components/ui/**`). Each entry states the target owner, the exact change, and
why it is needed. One file per stream = never conflicts.

---

## Gate 0 handoff to S2 (what you inherit)

- Routes `/onboarding`, `/home`, `/settings` are registered and compile with their **full salvage
  bodies** rewired to main's contracts, finish per FRONTEND §2 + TESTS.md, do not rebuild.
- Your write globs (committed tree): `src/screens/{onboarding,home,settings}/**`,
  `src/components/{onboarding,forms,controls,settings}/**`, `strings.{onboarding,home,settings}`.
- Key rewirings already applied at Gate 0 (verify, then build on them):
  - `AppSettings` no longer has `noiseFloorSymmetry`; it lives on `calibration_baseline`
    (ARCH §12). `SettingsScreen` must not read/write it from `app_settings`.
  - Onboarding uses `assignableExercises` (EX_PUCKER excluded), not `Object.keys(exercises)`.
  - Attestation flow: `StorageService.saveProfile(...)` then
    `SafetyGate.recordAttestation(import.meta.env.VITE_CONSENT_VERSION)` in that order (API §2).
    The salvage's `SafetyGate.getConsentVersion()` did not exist and was replaced with the env read.
  - A second, different `profileId` is rejected by `saveProfile` (`VALIDATION_FAILED`); surface
    it honestly.
- `HomeScreen` must import **zero** camera code (grep the screen tree for `CaptureService`/
  `getUserMedia`). No streaks / no "you missed X days" (SAFETY §8.8).
- SAFETY §8 language is a manual review obligation on every string you add. Gate 0 already fixed the
  stale onboarding "not a medical device" line to the canonical "regulatory status not determined …"
  framing; keep that register.

<!-- Append requests below. Template:

## S2-REQ-N → <owner or "integration owner (frozen shell)"> (`<path>`): <one-line summary>

**Origin:** <plan task / screen>.

**Requested change:** <exact change>.

**Why:** <reason, citing the contract/doc §>.
-->
