# Stream B coordination requests

## B3 — SafetyGate internal profile-read boundary (blocking)

Stream A: please update `src/session/safety.ts` to use a non-public, data-owned internal profile read for `SafetyGate.isAttested()` / `recordAttestation`, while ordinary `StorageService` reads remain demo-blocked. Stream B cannot safely enforce API §17's Demo read denial or remove the current `StorageService ↔ SafetyGate` lazy-reference cycle without this owner-side seam: gating `StorageService.getProfile()` directly makes `SafetyGate.isAttested()` throw in Demo Mode (and breaks existing controller/calibration gate ordering), while exempting it leaves sensitive profile data publicly readable. Keep `SafetyGate` as the canonical demo-state owner and preserve both caller-side and storage write guards.
