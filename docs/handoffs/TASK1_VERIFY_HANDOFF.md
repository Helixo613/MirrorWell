# Task 1 — verification handoff to Codex/Grok

Implementation is done, **not yet committed**. Build + unit tests already confirmed
green in this environment. Sandbox here can't install Playwright's Chromium
(`npx playwright install --with-deps chromium` fails — needs root/apt + network the
sandbox doesn't grant). Need you to run the e2e/CI leg.

## Run this
```bash
npm ci
npm run build
npm run test                                      # expect: 8/8 passed
npx playwright install --with-deps chromium
npx playwright test tests/e2e/no-network.spec.ts   # THE gate — must be zero off-origin requests
```
Then push/open the CI workflow (`.github/workflows/ci.yml`) run on GitHub Actions and
confirm both jobs (`build-and-unit`, `no-network-gate`) are green.

## Task 1 acceptance line (must all hold)
`npm run build && npm run test` green; CI no-network job passes on the empty shell;
`thresholds.ts` exports every named tunable (key-list test — already passing locally).

## Report back
- Pass/fail for each command above, full output on any failure (don't summarize away stack traces).
- If `no-network.spec.ts` fails: paste the exact list of flagged off-origin requests/websockets —
  that's a real defect, not a flaky test, given the non-negotiable ("no network calls, ever").
- Confirm CI Actions run URL/status once pushed.
