# MirrorWell

Private, on-device facial-exercise tracking. No network, no accounts.

> **Medical disclaimer:** MirrorWell is an educational exercise-support tool. It does **not** diagnose, assess, grade, treat, or predict any medical condition and is not a certified medical device. New or sudden facial droop is a medical emergency, seek immediate care.

---

## Deploying to Vercel (human checklist)

MirrorWell is a fully-static PWA. The Vercel config in [`vercel.json`](./vercel.json) handles everything automatically when you connect the repo. Follow the steps below exactly, order matters for the no-network guarantee.

### Prerequisites

- Vercel account with access to this repository.
- Node.js ≥ 20 (only needed for local `npm run build` verification; Vercel installs its own).
- Android Chrome device for the phone-install acceptance test (step 8).

### Step 1: Import the repo in Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import this repository.
2. **Framework Preset:** select **Other** (not Vite, `vercel.json` already sets `"framework": null` and `"buildCommand"/"outputDirectory"` explicitly).
3. Leave Build & Output Settings at defaults; `vercel.json` overrides them.

### Step 2: Set environment variables

In **Project → Settings → Environment Variables**, add the following for the **Production** environment (and optionally Preview):

| Name | Value | Notes |
|---|---|---|
| `VITE_CONSENT_VERSION` | `1` | Bump to force re-onboarding across all existing users. |
| `VITE_DEMO_MODE_ENABLED` | `true` | Shows "Try a demo" on OnboardingScreen for evaluators. |
| `VITE_ENABLE_DEBUG_HUD` | `false` | HUD is tree-shaken in prod; leave false to keep the bundle clean. |

> **CRITICAL; no other env vars:** This project has a hard no-network rule. No analytics keys, no telemetry tokens, no third-party service IDs may ever be added. If a feature seems to need one, the feature violates the architecture; stop and redesign.

### Step 3: Deploy

Click **Deploy**. The build runs `npm ci && npm run build` and serves `dist/`.

### Step 4: CRITICAL: Verify Vercel injects nothing into the HTML

Vercel's Speed Insights and Web Analytics products inject a `<script>` tag into served HTML. This app's no-network rule makes any injected script a hard defect (CI fails on non-same-origin requests and the WASM runtime is bundled, not CDN-loaded).

**Verification procedure (run after every deploy):**

```bash
# 1. Pull the served index.html (replace URL with your actual deployment URL):
curl -s https://<your-deployment>.vercel.app/ -o served-index.html

# 2. Pull the build artifact:
npm run build
cp dist/index.html built-index.html

# 3. Diff them: they must be byte-for-byte identical:
diff served-index.html built-index.html
# Expected: no output (empty diff). Any line from Vercel is a defect.
```

If the diff is non-empty, **disable Speed Insights and Web Analytics** in
Project → Settings → Speed Insights / Web Analytics, then redeploy and re-check.

`vercel.json` sets `"framework": null` to prevent Vercel from auto-injecting framework-specific wrappers. This is necessary and must not be changed back to `"vite"`.

### Step 5: Check the SPA fallback

Navigate directly to a deep route (e.g., `https://<your-deployment>.vercel.app/session`). It must load the app (not a 404). `vercel.json` rewrites unknown paths to `/index.html`; existing static files under `dist/` (including `/wasm/*` and `/models/*`) still win over the rewrite.

### Step 6: Check caching headers

```bash
# /wasm and /models must return Cache-Control: public, max-age=31536000, immutable
curl -sI https://<your-deployment>.vercel.app/models/face_landmarker.task | grep -i cache-control
# Expected: cache-control: public, max-age=31536000, immutable

# / must return no-cache
curl -sI https://<your-deployment>.vercel.app/ | grep -i cache-control
# Expected: cache-control: no-cache, no-store, must-revalidate
```

### Step 7: Verify PWA offline capability (desktop)

1. Open Chrome DevTools → Application → Service Workers. Confirm a service worker is registered.
2. In DevTools → Network, tick **Offline**.
3. Reload the page. The app must load without a network error.

### Step 8: Phone install + airplane-mode acceptance test

> **This step must be performed by a human. Record a 15-second clip for the demo runbook.**

1. On Android Chrome, open `https://<your-deployment>.vercel.app/`.
2. Tap the browser menu → **Add to Home Screen** → Install.
3. Put the phone in **airplane mode** (Wi-Fi + mobile data off).
4. Launch MirrorWell from the home screen icon.
5. **Acceptance criteria:**
   - App loads to HomeScreen / OnboardingScreen without a network error.
   - Camera permission prompt appears normally (not blocked).
   - "Try a demo" is visible (VITE_DEMO_MODE_ENABLED=true).
6. Record a 15-second clip:
   - Start on the home screen icon.
   - Open the app in airplane mode.
   - Navigate to the demo flow and show the camera preview loading.
7. Save the clip to `proof/phone-install-<date>.mp4` and commit it (the `proof/` directory is tracked).
8. Add the clip filename and the deployed URL to the demo runbook:
   `docs/superpowers/plans/2026-07-23-demo-runbook.md`.

---

## Local development

```bash
# Install deps + copy WASM runtime + verify model hash
npm install

# Start dev server (hot-reload)
npm run dev

# Type-check
npm run typecheck

# Unit tests
npm run test:unit

# E2E tests (requires Chromium + fixture videos: see docs/TESTS.md)
npm run test:e2e
```

Copy `.env.example` to `.env` for local env var defaults. Values are non-secret build flags only; see `.env.example` comments.

---

## Architecture notes

- **No network calls, ever.** The MediaPipe WASM runtime and face model are bundled in `public/wasm/` and `public/models/` respectively (copied from the npm package at postinstall). No CDN, no telemetry, no analytics.
- **No server.** All sensing, metrics, and storage run on-device. IndexedDB holds only derived numeric metrics, never images or raw landmarks.
- **PWA offline-first.** Vite-plugin-pwa precaches all assets including `.wasm` and `.task` files. After first load, the app works in full airplane mode.

Full architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Safety and compliance: [`docs/SAFETY_AND_COMPLIANCE.md`](./docs/SAFETY_AND_COMPLIANCE.md).
