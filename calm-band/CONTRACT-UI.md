# Calm Band — UI/API contract for the demo build (live card, summary, reviewer)

Status: **frozen for the parallel build** (branch `demo/final`). Agents A (backend), B (MirrorWell UI) and C (reviewer page) build against this file without talking to each other. If something here is wrong or missing, **stop and report it**; don't work around it in one track only.

This file adds new endpoints. Everything in `CONTRACT.md` (MQTT, firmware, the existing HTTP endpoints and the status rules) stays exactly as it is. Example payloads for every endpoint are in `calm-band/sim/fixtures/` and match this file exactly.

## 0. Ownership and ground rules

| Track | Owns | Must not touch |
|---|---|---|
| A — backend | `calm-band/backend-sample/backend/**` (SQLite, new endpoints, serving `/reviewer/`) | `src/**`, `calm-band/reviewer/**`, firmware |
| B — MirrorWell UI | `src/**`, `tests/unit/**`, `vite.config.ts` | backend, reviewer, firmware |
| C — reviewer page | `calm-band/reviewer/**` (static `index.html` + JS/CSS, no build step required) | backend, `src/**`, firmware |

- **Same origin only.** Everything is served by the backend on one port (default `http://localhost:8000`). No CDN, no web fonts, no external scripts, no absolute URLs. The reviewer page is served at **`/reviewer/`** from `calm-band/reviewer/` (A mounts it **before** the SPA catch-all).
- **Missing stays missing.** A value that can't be computed is JSON `null`, never `0`, never a guess. UIs must render `null` as "no reading", never as calm or normal.
- **Not medical.** No endpoint or UI says stress, anxiety, relaxation, heart health, normal/abnormal or diagnosis. MirrorWell's language rules (`docs/SAFETY_AND_COMPLIANCE.md` §8) apply to every user-facing string here.
- **Pulse numbers are reviewer-only.** MirrorWell (B) never displays a BPM number. It shows the heart animation, signal bars, words and the summary sentences. The reviewer page (C) may show BPM.
- **Existing endpoints don't change.** `GET /api/companion/status`, the session POSTs, the `_test` hooks and the existing fields of `GET /api/companion/reviewer/sessions` keep their exact shape and meaning. A only **adds** fields and endpoints.
- All times are epoch milliseconds (integers). Window times come from the band's clock; `atMs` of MirrorWell events comes from the browser.

## 1. Shared definitions (used by every endpoint below)

| Name | Value | Meaning |
|---|---|---|
| `PRE_POST_WINDOW_MS` | 300000 | existing backend setting (5 min) |
| `SETTLE_DELTA_BPM` | 3 | change needed to call a pulse "settling"/"rising" |
| `CALM_SPAN_BPM` | 15 | calm-index scale |

**Usable window.** A feature window is *usable* exactly when the existing backend function `quality_problems(w)` returns `[]` (`is_clean(w)`). That already excludes `motorActive`, `moving`, `quality < 0.8`, no contact, no pulse, timing gaps, missing motion data, no clock and finger-off overlaps. Do not write a second definition.

**Active session.** The session set by the latest `POST /api/companion/sessions` that has not ended (`POST …/end`). None → "no active session". (A may persist this in SQLite; the rule is the same.)

**Session windows** for session `s` with start `S` and end `E` (`E` = null while open):

- `in` = every stored window (any boot) with `windowEndMs > S` and (`E` is null or `windowStartMs < E`). This is the existing `session_windows(s)`.
- `pre` = the **last** usable window with `S − 300000 ≤ windowEndMs ≤ S` (the existing `prePulseBpm` window), or none.
- `post` = the **first** usable window with `E ≤ windowStartMs ≤ E + 300000` (the existing `postPulseBpm` window), or none. Always none while the session is open.
- **`U`** (the session's usable readings) = `pre` (if any) + the usable windows of `in` + `post` (if any), ordered by `windowEndMs` ascending.

Why `pre` is included: rep cues buzz the band every few seconds, so almost every in-session 60 s window has `motorActive:true` and is not usable (CONTRACT.md §4, vibration policy). Without the pre-session reading the session would almost never have a first usable window. This changes the default "first usable window of the session" rule for that reason.

**Start and end readings.** `start = U[0]`, `end = U[last]`. A trend or calm index needs **at least 2** entries in `U`.

**Rounding.** "round" means round half up (`floor(x + 0.5)` for non-negative x). BPM means are rounded to 1 decimal. Percentages and the calm index are whole numbers 0–100. BPM values copied from one window stay as the band sent them (1 decimal).

**Calm index (experimental).**

```
calmIndex = round(100 × clamp((start.pulseRateBpm − end.pulseRateBpm) / 15 + 0.5, 0, 1))
```

`null` when `U` has fewer than 2 entries. 50 = same pulse as the start, higher = lower than at the start (100 at a drop of 7.5 BPM or more), lower = higher than at the start (0 at a rise of 7.5 BPM or more). It is always sent as `{"value": <int or null>, "label": "experimental"}`.

It is a **personal-baseline relaxation indicator** for this one session: it compares the user's pulse with their own pulse at the start. It is **not** a stress, anxiety, emotion or medical measure. It is not comparable between people or between sessions. UIs must show the word "experimental" next to it. MirrorWell (B) does not show it at all in this build. Only the reviewer page shows it.

**Pulse trend** (summary and reviewer): `d = end.pulseRateBpm − start.pulseRateBpm`; `d ≤ −3` → `"settled"`, `d ≥ +3` → `"rose"`, otherwise `"steady"`. Fewer than 2 entries in `U` → `"insufficient"`, and `startBpm`, `endBpm` and the calm index are `null`.

**Cue.** A command with `sessionId` = the session, `pattern` `rep_pulse` or `ease_off` (not `session_complete`), and at least one ack with `result:"accepted"` (the motor started). Its time is that `accepted` ack's `atMs`.

## 2. `GET /api/companion/live` (B: live band card)

Poll every 2 s while `SessionScreen` is mounted and companion mode is on. Never in demo mode.

Example (`fixtures/live-usable.json`: in a session, before the reps start):

```json
{
  "schema": 1,
  "device": "cb-01",
  "atMs": 1794813636000,
  "sessionId": "5b0e9f8e-6a51-4c8e-9d43-2f1f0c6a7b12",
  "state": "usable",
  "signal": 3,
  "reason": null,
  "heart": { "beatIntervalMs": 719 },
  "settling": "steady",
  "steadiness": "steady",
  "cue": { "lastAtMs": null, "countThisSession": 0 },
  "calmIndex": { "value": 68, "label": "experimental" }
}
```

| Field | Type | Rule |
|---|---|---|
| `schema` | `1` | constant |
| `device` | string | same as `/status` |
| `atMs` | int | backend time when the response was built |
| `sessionId` | string \| null | active session id, null if none |
| `state` | string | **exactly** `/api/companion/status` → `state` (same rules, computed the same moment): `offline`, `stale`, `sensor_missing`, `collecting`, `reading_stale`, `contact_required`, `settling`, `vibration_overlap`, `poor_quality`, `usable` |
| `signal` | 0–3 | `0` if `state` is `offline`, `stale`, `sensor_missing`, `collecting`, `reading_stale` or `contact_required`, **or** the newest current-boot window has `contact:false`. Otherwise from that window's `quality`: `< 0.5` → 1, `< 0.8` → 2, `≥ 0.8` → 3. (Signal is about the sensor signal only. `vibration_overlap` with quality 1.0 is signal 3 but has no pulse.) |
| `reason` | string \| null | the text from the table below for `state`; `null` only when `state` is `usable` |
| `heart.beatIntervalMs` | int \| null | `round(60000 / pulseRateBpm)` using `/status`'s `pulseRateBpm`, so **only when `state` is `usable`**; otherwise `null` (no beating heart). During rep cues this is usually `null` (`vibration_overlap`). That's expected; show "paused while the band buzzes" |
| `settling` | `"settling"` \| `"steady"` \| `"rising"` \| null | needs an active session with ≥ 2 entries in `U`: `d = mean(last 2 of U) − U[0]` (BPM); `d ≤ −3` → `settling`, `d ≥ +3` → `rising`, else `steady`. Otherwise `null` |
| `steadiness` | `"steady"` \| `"moving"` \| null | `null` if `state` is `offline`, `stale`, `collecting` or `reading_stale`. Otherwise the newest current-boot window's `moving`: `true` → `moving`, `false` → `steady`, `null` (motion sensor data missing) → `null` |
| `cue.lastAtMs` | int \| null | time of the latest cue of the active session; `null` if none or no active session |
| `cue.countThisSession` | int | number of cues of the active session; `0` without one |
| `calmIndex` | object | §1 formula with `start = U[0]`, `end = U[last]` of the active session; `{"value": null, "label": "experimental"}` without an active session or with < 2 entries in `U` |

`reason` texts (copy exactly; A owns them, B displays them as given):

| `state` | `reason` |
|---|---|
| `offline` | `The band is off or out of range.` |
| `stale` | `Lost touch with the band. Check it is switched on and nearby.` |
| `sensor_missing` | `A band sensor is not responding. Check its wires.` |
| `collecting` | `Getting a first reading. Rest your fingertip on the sensor and keep still for about a minute.` |
| `reading_stale` | `Waiting for a fresh reading from the band.` |
| `contact_required` | `Rest your fingertip lightly on the sensor.` |
| `settling` | `Finger found. Keep still; a clear reading takes about a minute.` |
| `vibration_overlap` | `Pulse paused while the band buzzes.` |
| `poor_quality` | if `/status` `problems` contains `moving`: `Keep your hand still for a clearer reading.` otherwise: `The reading is not clear yet. Keep your fingertip still and relaxed on the sensor.` |
| `usable` | `null` |

## 3. `GET /api/companion/sessions/{sid}/summary` (B: post-session summary)

Call after `POST …/end`. The post-session reading arrives 60–75 s after the end, so B should re-fetch (for example every 5 s for up to 90 s) until `pulse.trend` stops being `insufficient`, then stop. Showing the first result is also fine.

Example (`fixtures/summary-settled.json`):

```json
{
  "schema": 1,
  "companionSessionId": "5b0e9f8e-6a51-4c8e-9d43-2f1f0c6a7b12",
  "state": "ended",
  "startedAtMs": 1794813600000,
  "endedAtMs": 1794813840000,
  "endReason": "completed",
  "durationMs": 240000,
  "reps": 10,
  "easeOffs": 1,
  "cues": 11,
  "pulse": { "trend": "settled", "startBpm": 86.2, "endBpm": 78.5 },
  "steadyPct": 75,
  "signalPct": 38,
  "calmIndex": { "value": 100, "label": "experimental" },
  "plainWords": [
    "You completed 10 reps.",
    "You had 1 ease-off cue.",
    "Your pulse settled as the session went on.",
    "Your hand moved quite a bit, which makes pulse readings harder."
  ]
}
```

| Field | Type | Rule |
|---|---|---|
| `state` | `"open"` \| `"ended"` | session state |
| `startedAtMs` / `endedAtMs` | int / int \| null | from the session POSTs |
| `endReason` | string \| null | from the end body; `null` while open |
| `durationMs` | int | ended: `endedAtMs − startedAtMs`; open: `now − startedAtMs` |
| `reps` | int | ended: sum of the end body's `exercises[].repsCompleted`; open: number of distinct `rep` events |
| `easeOffs` | int | ended: sum of `exercises[].easeOffCount`; open: number of `ease_off` events with `active:true` |
| `cues` | int | number of cues (§1) for this session |
| `pulse.trend` | string | §1: `settled`, `steady`, `rose`, `insufficient` |
| `pulse.startBpm` / `pulse.endBpm` | number \| null | `U[0]` / `U[last]` `pulseRateBpm`; both `null` when `insufficient`. **Reviewer only**: B must not display them |
| `steadyPct` | int \| null | among `in` windows with `motionValid:true` and `moving` not null, the share with `moving:false`, × 100, rounded. `null` if there are none |
| `signalPct` | int \| null | share of `in` windows that are usable, × 100, rounded. **Denominator leaves out windows whose only problem is `vibration_overlap`** (a cue is not a signal fault). `null` if the denominator is 0. `0` is a real value here (windows existed, none usable) |
| `calmIndex` | object | §1, from this session's `U` |
| `plainWords` | string[] | rules below, in this order |

`plainWords`, generated by the backend (the wording lives only there). Add one sentence per rule, in order:

1. Reps: `reps = 0` → `No reps were counted in this session.`; `1` → `You completed 1 rep.`; otherwise `You completed {reps} reps.`
2. Ease-offs: `0` → `No ease-off cues were needed.`; `1` → `You had 1 ease-off cue.`; otherwise `You had {easeOffs} ease-off cues.`
3. Pulse: `settled` → `Your pulse settled as the session went on.`; `steady` → `Your pulse stayed about the same.`; `rose` → `Your pulse was a little higher at the end than at the start.`; `insufficient` → `The band could not get a clear enough pulse reading this time.`
4. Steadiness: `steadyPct` null → no sentence; `≥ 80` → `Your hand stayed steady for most of the session.`; `< 80` → `Your hand moved quite a bit, which makes pulse readings harder.`

There are no numbers other than reps/ease-offs, no calm index and no BPM in `plainWords`.

**Errors and empty cases.** Unknown `sid` → **404** `{"detail":"unknown session"}` (FastAPI's default `HTTPException` body). A session with no usable readings → `trend:"insufficient"`, `startBpm`/`endBpm`/`calmIndex.value` `null`. `steadyPct`/`signalPct` follow their own rules above: `null` when there is nothing to divide. Never `0` in place of a missing value.

## 4. `GET /api/companion/reviewer/sessions` (extended; C)

Unchanged existing fields (`companionSessionId`, `state`, `events`, `end`, `featureWindows`, `usableWindows`, `vibrationOverlapWindows`, `prePulseBpm`, `postPulseBpm`, `hapticCommands`, `hapticExecuted`) **plus** these new fields, with the same rules as §3: `startedAtMs`, `endedAtMs`, `durationMs`, `reps`, `easeOffs`, `cues`, `pulseTrend` (= `pulse.trend`), `startBpm`, `endBpm`, `signalPct`, `steadyPct`, `calmIndex`. The array is ordered by `startedAtMs` ascending (as today). An empty store returns `[]`.

`prePulseBpm`/`postPulseBpm` (existing) are the `pre`/`post` windows only. `startBpm`/`endBpm` (new) are `U[0]`/`U[last]`, which also use in-session usable windows. They can differ; that's expected.

Example: `fixtures/reviewer-sessions.json`.

## 5. `GET /api/companion/reviewer/sessions/{sid}/timeline` (C)

Example (abridged to one item per list; the full one is `fixtures/reviewer-timeline.json`):

```json
{
  "schema": 1,
  "companionSessionId": "5b0e9f8e-6a51-4c8e-9d43-2f1f0c6a7b12",
  "startedAtMs": 1794813600000,
  "endedAtMs": 1794813840000,
  "range": { "fromMs": 1794813300000, "toMs": 1794814140000 },
  "windows": [
    { "boot": "3bd2e0fa", "seq": 6, "windowStartMs": 1794813530000, "windowEndMs": 1794813590000,
      "contact": true, "quality": 0.96, "pulseRateBpm": 86.2, "moving": false, "motionValid": true,
      "motorActive": false, "timingGap": false, "usable": true, "problems": [], "role": "pre", "reading": "start" }
  ],
  "events": [
    { "source": "band", "type": "contact", "detail": "on", "atMs": 1794813452000, "boot": "3bd2e0fa" },
    { "source": "mirrorwell", "seq": 3, "type": "rep", "atMs": 1794813639960, "repIndex": 0, "peakEffortIndex": 0.55, "durationMs": 1800 }
  ],
  "commands": [
    { "commandId": "6e6aedec-5c69-5f16-a148-4a44200cb31d", "pattern": "rep_pulse", "issuedAtMs": 1794813640000,
      "expiresAtMs": 1794813643000, "maxDurationMs": 1500, "outcome": "executed",
      "acks": [ { "result": "accepted", "reason": null, "atMs": 1794813640020 },
                { "result": "executed", "reason": null, "atMs": 1794813640140 } ] }
  ]
}
```

- `range`: `fromMs = S − 300000`, `toMs = (E, or now while open) + 300000`.
- `windows`: every stored window (any boot) with `windowEndMs > fromMs` and `windowStartMs < toMs`, ordered by `windowEndMs`. `usable` = §1. `problems` = `quality_problems(w)`. `role`: `"in"` if in `in`; `"pre"` if `windowEndMs ≤ S`; otherwise `"post"`. `reading`: `"start"` for `U[0]`, `"end"` for `U[last]` (only when `U` has ≥ 2 entries), else `null`. `pulseRateBpm` is the raw window value even when not usable (the reviewer sees `usable:false` next to it).
- `events`: the session's MirrorWell events exactly as posted (every posted field kept) plus `"source":"mirrorwell"`, **and** band `events` messages (`contact` and `button`) with `fromMs ≤ atMs ≤ toMs`, as `{"source":"band","type","detail","atMs","boot"}`. All ordered by `atMs`. **A must start storing band `button` events and every `contact` event** (today only the latest contact state and finger-off periods are kept).
- `commands`: every command with this `sessionId` (including `session_complete`), ordered by `issuedAtMs`, with all acks (`result`, `reason`, `atMs`) in arrival order. `outcome`: `executed` if any ack is executed; else `stopped` if any is stopped; else `rejected` if any is rejected; else `accepted`; with no acks, `no_ack`.
- Unknown `sid` → 404 `{"detail":"unknown session"}`.

## 6. `GET /api/companion/reviewer/trends` (C)

Example (`fixtures/reviewer-trends.json`):

```json
{
  "schema": 1,
  "utcOffsetMinutes": 330,
  "days": [ { "date": "2026-11-15", "sessions": 1 }, { "date": "2026-11-16", "sessions": 1 } ],
  "sessions": [
    { "companionSessionId": "c7d2a1e4-0b6f-4f0e-8a51-6e2f9b3d4c10", "startedAtMs": 1794727800000, "date": "2026-11-15",
      "meanUsablePulseBpm": null, "readings": 0, "pulseTrend": "insufficient" },
    { "companionSessionId": "5b0e9f8e-6a51-4c8e-9d43-2f1f0c6a7b12", "startedAtMs": 1794813600000, "date": "2026-11-16",
      "meanUsablePulseBpm": 83.5, "readings": 5, "pulseTrend": "settled" }
  ]
}
```

- `date` = the session's `startedAtMs` as a `YYYY-MM-DD` date in the **backend machine's local time zone**; `utcOffsetMinutes` = that zone's current offset (IST = 330).
- `days`: one entry per date that has ≥ 1 session, ascending; `sessions` = count.
- `sessions`: every session, by `startedAtMs` ascending. `meanUsablePulseBpm` = mean `pulseRateBpm` of the session's `U`, 1 decimal; `null` if `U` is empty. `readings` = number of entries in `U`. `pulseTrend` as §1.
- Empty store → `{"schema":1,"utcOffsetMinutes":…,"days":[],"sessions":[]}`.

## 7. Persistence (A)

SQLite file at `$CALMBAND_DB`, default `calm-band/backend-sample/backend/data/calmband.db` (git-ignored). It stores sessions (start, end body, state), MirrorWell events, feature windows, band events, commands and acks, so a backend restart keeps history. Duplicate rules stay the same: window key `dev+boot+seq`, event key `session+seq`. Live status logic still reads the current boot only. The existing in-memory behaviour of `/status` must not change; `backend_checks.py` must still pass 33/33 (it uses its own device id and a fresh DB, so A should let `CALMBAND_DB` point at a temp file in tests).

## 8. Fixtures (`calm-band/sim/fixtures/`)

| File | Endpoint / case |
|---|---|
| `live-usable.json` | §2, in session, before the reps start (no cues yet) |
| `live-collecting.json` | §2, band just connected, no session |
| `live-contact-required.json` | §2, finger off during a session |
| `live-vibration.json` | §2, cue just played (`vibration_overlap`, heart null) |
| `live-poor-quality-moving.json` | §2, `poor_quality` because the hand moves |
| `live-stale.json` | §2, band not heard for 45 s |
| `summary-settled.json` | §3, full session with pre and post readings |
| `summary-insufficient.json` | §3, no usable readings at all |
| `summary-404.json` | §3, unknown session (HTTP 404 body) |
| `reviewer-sessions.json` | §4, the two sessions above |
| `reviewer-timeline.json` | §5, timeline of the settled session |
| `reviewer-trends.json` | §6 |

The fixtures are consistent with each other: the settled session appears in the summary, the reviewer list, the timeline and trends with the same numbers.
