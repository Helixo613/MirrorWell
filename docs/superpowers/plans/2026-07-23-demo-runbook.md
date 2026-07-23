# MirrorWell V2 Demo Runbook

> **For:** Zoom live demo (presenter's Zoom camera OFF; app owns webcam; "Share sound" ON).
> **Date locked:** 2026-07-23
> **Created by:** Task 9 (Vercel deploy) — Task 9 creates this file if no V3-plan rehearsal task has run first.

---

## Deployed URL

> **Fill in after Task 9 phone-install test:**
>
> Production URL: `https://_____________________________.vercel.app`
>
> Deployment date: `____-__-__`

---

## Phone install acceptance test record

| Field | Value |
|---|---|
| Test date | _(fill in)_ |
| Device | _(e.g., Pixel 8 / Android 15 / Chrome 128)_ |
| Airplane mode relaunch | ☐ Pass / ☐ Fail |
| PWA installed from home screen | ☐ Pass / ☐ Fail |
| Demo mode visible | ☐ Pass / ☐ Fail |
| 15 s clip filename | `proof/phone-install-____-__-__.mp4` |
| Clip committed | ☐ Yes / ☐ No |

---

## Pre-demo checklist (run day-of)

### 60 minutes before

- [ ] Open the deployed URL in Chrome (desktop); confirm it loads, service worker is registered.
- [ ] DevTools → Network → check offline: app reloads from cache.
- [ ] Verify "Try a demo" is present on OnboardingScreen.
- [ ] Open the recorded phone clip in the **next browser tab** (instant fallback if live camera misbehaves).
- [ ] Confirm Zoom is set to: presenter camera OFF, Share Sound ON.

### 15 minutes before

- [ ] Share the browser window (not full desktop) in Zoom — confirm preview is full-width on the Zoom preview.
- [ ] Navigate to OnboardingScreen. Do not start a demo session yet (avoids camera warm-up lag during intro).
- [ ] Verify the coach-line overlay is readable after Zoom downscaling (thick font, high contrast gauges — Task 1 requirement).

### During the demo

- [ ] Start with the onboarding / attestation flow (or skip straight to demo mode if audience is evaluators).
- [ ] Walk through calibration (neutral baseline → comfortable max rep).
- [ ] Show a live session: symmetry bar, effort gauge, coach-line cue ("ease off" or "hold").
- [ ] If camera drops or quality degrades: switch to the phone clip in the next tab immediately.
- [ ] After session: show SummaryScreen celebration copy (Task 4/5).

### Fallback script

> "Let me show you a recording of what just happened — same app, same device, real camera."
> Switch to the phone clip tab. Describe what's on screen as it plays.

---

## Env vars in production

| Variable | Value | Purpose |
|---|---|---|
| `VITE_CONSENT_VERSION` | `1` | Forces re-onboarding for any user who consented under a prior version |
| `VITE_DEMO_MODE_ENABLED` | `true` | Shows "Try a demo" entry for evaluators without attesting |
| `VITE_ENABLE_DEBUG_HUD` | `false` | Debug HUD tree-shaken; do not enable in production |

---

## No-injection verification (re-run after any redeployment)

```bash
curl -s https://<your-deployment>.vercel.app/ -o served-index.html
npm run build
diff served-index.html dist/index.html
# Must be empty — any output means Vercel injected analytics/scripts (hard defect)
```

See [`README.md`](../../README.md) for the full step-by-step deploy + verification guide.

---

## Tasks contributing to the demo

| Task | Slug | Status |
|---|---|---|
| 1 | Session centerpiece — coach line + Zoom-legible gauges | ☐ |
| 2 | Nickname + "why" — user profile onboarding | ☐ |
| 3 | Copy audit — SAFETY §8 language + onboarding rewrite | ☐ |
| 4 | Summary celebration screen | ☐ |
| 5 | Trend teaser on SummaryScreen | ☐ |
| 6 | Seeded demo history | ☐ |
| 7 | Calibration persistence fix | ☐ |
| 8 | PWA icon + splash | ☐ |
| 9 | Vercel deploy + phone install | ☑ config committed; ☐ human deploy + phone clip |
