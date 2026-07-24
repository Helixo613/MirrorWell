# Stream A: outgoing requests

Stream A (`src/session/**`, `src/config/exercises.ts`, `src/dev/**`, API §10/§11/§16,
ARCHITECTURE §12/§13, `FRONTEND.md`, `TESTS.md`, `SAFETY_AND_COMPLIANCE.md`) files requests here for
changes it needs in files it does not own. Per
`docs/superpowers/plans/2026-07-20-parallel-completion.md` P1 rule 1, Stream A never edits another
stream's file. Each entry states the target owner, the exact change, and why it is needed.

---

## A-REQ-1 → Stream C (`src/metrics/metrics.ts`): annotate the EX_PUCKER guard as an intentional invariant

**Origin:** plan task A1 ("File a request to Stream C to … annotate the `metrics.ts` guard as an
intentional invariant").

`MetricEngine.compute()` throws `VALIDATION_FAILED` when the requested exercise has no
`blendshapePair` (`src/metrics/metrics.ts:129-131`). Stream A has **not** touched this code and asks
that it stay exactly as it is. The v1 decision is that `EX_PUCKER` is *not assignable*, enforced as a
derived filter in `src/config/exercises.ts`, but `EX_PUCKER` deliberately remains a valid
`ExerciseId`. The guard is therefore the last line of defence for a caller that bypasses the filter,
and CLAUDE.md's "loud stop, never a silent fallback" applies.

**Requested change:** a comment on the guard recording that it is an intentional invariant, not dead
code, and that removing it (or replacing it with a fallback) is a defect. No behaviour change.
`tests/unit/metrics.test.ts:135` already covers it.

## A-REQ-2 → Stream C (`docs/MODEL_AND_DATA.md` §7): record the EX_PUCKER decision and its reversal path

**Origin:** plan task A1 ("update the existing EX_PUCKER note in `MODEL_AND_DATA.md` §7 with the
decision + reversal path"). §7 already carries an EX_PUCKER open-decision note, please **extend** it
rather than adding a second one.

**Decision to record:** `EX_PUCKER` is not assignable in v1 because no per-side blendshape pair for
lip pucker has been validated. It is **not deleted**: the `exercises['EX_PUCKER']` config entry and
the `ExerciseId` / `EXERCISE_IDS` unions all remain.

**Reversal path to record:** assignability is a *derived filter*; the set of exercises carrying a
`blendshapePair` in `src/config/exercises.ts`. Adding a validated `blendshapePair` to the `EX_PUCKER`
entry re-enables it everywhere at once (profile assignment, calibration, `SessionController.start()`,
the dev seed) with no other code change.

## A-REQ-3 → owner of `src/App.tsx`: mount the A3 live-demo view, and correct a plan claim

**Origin:** plan task A3 and Verification step 4. `src/App.tsx` is in **no** stream's exclusive write
scope, so Stream A is not editing it.

**Plan correction (factual):** A3 states the live demo "stays behind `VITE_ENABLE_CAPTURE_HARNESS` and
out of prod (`App.tsx:29` gates it on `import.meta.env.DEV && VITE_ENABLE_CAPTURE_HARNESS`)". In the
code on `main`, `App.tsx:29` gates **`CaptureHarness`**; `LiveV1Harness` is mounted at `App.tsx:20-26`
under a bare `import.meta.env.DEV` with no env flag. Prod safety is unaffected (the `DEV` branch is
eliminated and the `grep dist/` check passes either way), but Verification step 4 as written
`npm run dev` with `VITE_ENABLE_CAPTURE_HARNESS=true`, would mount the fixture **recorder** and
`CaptureHarness` together, and they collide on `CaptureService`'s single `<video>` element.

**Requested change:** mount Stream A's new `src/dev/LiveDemoView.tsx` alongside the existing dev
mounts, behind its own flag, using the same `DevOnly` dynamic-import pattern so it stays out of the
production bundle:

```tsx
{import.meta.env.DEV && import.meta.env.VITE_ENABLE_LIVE_DEMO === 'true' && (
  <DevOnly
    loader={() => import('./dev/LiveDemoView').then((m) => ({ default: m.LiveDemoView }))}
  />
)}
```

Because all three dev views re-parent the same `<video>` element, only one may be enabled at a time.
`LiveDemoView` and `LiveV1Harness` both re-parent it, so mounting both blacks one out.
Please also make the `LiveV1Harness` mount conditional (e.g. on `VITE_ENABLE_V1_HARNESS`, or at
minimum skip it when `VITE_ENABLE_LIVE_DEMO === 'true'`) so the live demo is usable. Stream A has
documented `VITE_ENABLE_LIVE_DEMO` and the previously-undocumented `VITE_ENABLE_CAPTURE_HARNESS` in
the `ARCHITECTURE.md` §12 env-flag list.

## A-REQ-4 → owner of `docs/API.md` §15: document the new `thresholds.liveDemo` group

**Origin:** plan task A3, after owner adjudication of the symmetric/asymmetric boundary.

Per the plan's doc-ownership table, `API.md` §15 (config module shapes; the canonical `thresholds`
key list) is **Gate 0's** ("thresholds reconciled once"), not Stream A's, so Stream A has not edited
it. Note that `node scripts/check-docs.mjs` does **not** validate thresholds↔API §15 drift (plan P2),
so nothing automated will catch this omission; it needs a human.

**What landed in code:** `src/config/thresholds.ts` gains a new top-level group

```ts
liveDemo: Object.freeze({
  symmetryBoundary: 0.85,
}),
```

`tests/unit/thresholds.keys.test.ts` has been updated accordingly (top-level exact-match list plus a
per-group exact-match test); that file's assertions are exact-match per group, so **this is the
cross-stream coordination point flagged by plan P1 rule 2**: a new top-level group, announced here.

**Why the tunable exists:** `src/dev/LiveDemoView.tsx` (dev-only, A3) classifies its live readout as
symmetric iff `symmetryIndex >= thresholds.liveDemo.symmetryBoundary`. The previous implementation
derived the boundary from the ephemeral baseline's measured `noiseFloorSymmetry`, anchored at a
perfect SI of 1.0; because a genuinely symmetric smile centres at SI ≈ 0.96–0.98, a tight measured
floor made a symmetric smile read "Uneven" and broke the demo's opening beat. 0.85 sits inside the gap
the plan's demo arc names (symmetric ≈ 0.98; one side restrained ≈ 0.4–0.7) and is meant to be tuned
on real hardware.

**Requested change:** add the `liveDemo` group and its `symmetryBoundary` key to the API §15 key list,
noting that it is dev-only (it affects no production screen and ships in no production bundle).
