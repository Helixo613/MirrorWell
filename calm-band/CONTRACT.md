# Calm Band — interface contract (hardware, timing, MQTT, HTTP)

This is everything a tester needs to drive or replace any piece of the system. All values below are taken from the code in this package (`firmware/calm_band/*`, `backend-sample/backend/app.py`, `mirrorwell-patch/companion-spike.patch`). Values marked **assumption** are not verified on real parts yet.

## 1. Hardware assumptions (generic parts)

| Item | Specification | Firmware constant |
|---|---|---|
| Controller | ESP32 DevKit V1, ESP32-WROOM-32, 30-pin, Arduino-ESP32 core **2.0.17** | — |
| Pulse sensor | MAX30102 breakout, I2C address **0x57**; VIN 3.3 V | SparkFun MAX3010x driver |
| Motion sensor | GY-521 / MPU6050, I2C address **0x68** (AD0 floating/low); VCC 3.3 V | `MPU6050_ADDR 0x68` |
| I2C bus | SDA **GPIO21**, SCL **GPIO22**, **100 kHz** (30 cm leads) | `PIN_SDA 21`, `PIN_SCL 22`, `I2C_HZ 100000` |
| Motor | Module with built-in driver + flyback protection; control input on **GPIO25**, active HIGH, 3.3 V logic; supply from VIN (5 V) — **assumption** until the module is checked; pin order on the module **unverified** | `PIN_MOTOR 25` |
| STOP | Normally open button, **GPIO27 → GND**, internal pull-up, falling-edge interrupt, 200 ms debounce | `PIN_BUTTON 27` |
| Status LED | GPIO2 (on-board): solid = MQTT connected, 2 Hz blink = not connected | `PIN_STATUS_LED 2` |
| Power | Laptop USB (main), USB power bank (backup) | — |

Breadboard hole map (desk hub): see `firmware/docs` and the 3D build guide. ESP32 VIN-side row in Board L row a cols 2–16; 3V3-side row in Board R row a cols 2–16. Sensors on Board R rows b/c of cols 16 (3V3), 15 (GND), 6 (SDA), 3 (SCL); motor on Board L row b of cols 16 (VIN), 15 (GND), 9 (GPIO25); STOP jumper Board L col 11 row b → col 17 row c.

## 2. Sampling and windows

| Setting | Real build | Test build (`FAST_WINDOWS=1` / sim env) |
|---|---|---|
| Pulse sampling | 100 Hz (MAX30102 400 sps, average 4, IR+red, 411 µs pulse width, 4096 nA range, LED 60) | 100 Hz |
| Motion sampling | 32 Hz, ±2 g, 16384 LSB/g | 32 Hz |
| Window length / hop | **60 000 ms / 15 000 ms** | 5 000 ms / 1 000 ms |
| First window | ends one full window after boot (60 s; 5 s in test) | same |
| Min valid beat intervals for a pulse value | 20 | 3 (`MIN_IBIS=3`) |

Window rules (from `calm_core.cpp`):

- **Contact:** a sample has contact when IR ≥ **50 000**. A window has contact when ≥ **90 %** of its samples do.
- **Beats:** DC-removed, inverted IR; peak with adaptive threshold (50 % of a decaying envelope) and a ≥ 300 ms refractory period. Valid intervals are **300–2000 ms** (200–30 bpm).
- **pulseRateBpm** = 60000 ÷ mean valid interval; `null` when no contact or too few valid intervals. **Never** filled with a made-up value.
- **Motion:** gravity removed per axis (slow baseline, α = 0.01 at 32 Hz), then RMS and max of what remains. `moving = motionRms_g > 0.05`.
- **Motion sensor health:** `motionCoverage` = received ÷ expected motion samples (expected = 32 × window seconds, so 1920 per 60 s window). `motionValid` = coverage ≥ **0.8**. When it is false (MPU6050 missing, unplugged or failing reads), `motionRms_g`, `motionMax_g` and `moving` are **JSON null**. A failed sensor never reads as "perfectly still".
- **quality** = validBeatFraction with contact, else 0; capped at 0.5 when there is no pulse value, when moving, or when `motionValid` is false.
- **motorActive** = the motor was on at any point in the window. Quality is **not** reduced for this on the band; the backend withholds the pulse value for these windows (§4, vibration policy).
- **timingGap** = a full second inside the window had < 80 % of the expected pulse samples, had no data, or had samples **known to be lost** (MAX30102 FIFO overflow).
- **Acquisition on the ESP32** runs in its own FreeRTOS task (core 1, priority 3, above `loop()`), woken every 10 ms, which never touches the network. It drains the MAX30102's 32-sample hardware FIFO directly (bypassing the driver's 4-sample buffer). Samples are stamped back from the read time at 10 ms spacing, and the FIFO overflow counter is reported as lost samples. Motion is read once per 32 Hz slot and stamped with the **actual read time**; missed slots are skipped (they lower `motionCoverage`) and never back-filled with late readings. The FIFO logic (`drainMax30102` in `calm_core`) is unit-tested on Linux against a fake MAX30102 that follows the datasheet: 32 slots, rollover, an overflow counter that saturates at 31 and resets when a sample is popped. The tests cover a normal read, overflow (8 samples lost and reported), a burst cut mid-sample (complete samples kept, the rest read next time), disconnect (a failed read is an error, not an empty FIFO) and reconnect.
- **Sensor health and recovery:** every I2C transaction is checked. 10 failed MAX30102 reads in a row (~0.1 s), or 32 failed MPU6050 reads (~1 s), mark that sensor `missing` in status. A missing sensor (including one absent at power-on) is re-initialised every 5 s. After the pulse sensor recovers, beat detection restarts and a gap is recorded, so no window is clean until a full window has passed since recovery.
- **Emulator evidence is timing only:** in the `SENSOR_SELFTEST` QEMU build, with `loop()` blocked for 3 s, the sensor task produced 301 synthetic pulse samples (the pulse is simulated) and ran 96 of 96 motion read slots on time. It made **0 successful MPU6050 readings**, because QEMU has no MPU6050 (so the windows say `motionValid:false`). This shows the task keeps its schedule; it does **not** test either physical sensor's I2C path.
- **Clock:** nothing is published until NTP has set the clock (`time > 1 700 000 000`). In BENCH mode only, a fixed clock (1 760 000 000 s) is seeded and windows are printed to Serial, never published.

## 3. MQTT

Broker: any MQTT 3.1.1 broker. Real: EMQX Cloud, port 8883, TLS with CA certificate, username/password. Local tests: Mosquitto on 127.0.0.1:1883, no auth. Client library on the ESP32: `256dpi/arduino-mqtt` v2.5.2, 1024-byte buffer, keep-alive 30 s, **clean session**, reconnect attempt every 5 s.

| Topic (device `cb-01`) | Direction | QoS | Retained | Payload |
|---|---|---|---|---|
| `calmband/cb-01/features` | band → backend | 1 | no | feature window (§3.1) |
| `calmband/cb-01/status` | band → backend | 1 | **yes** | status (§3.2); Last Will `{"dev":"cb-01","online":false}` |
| `calmband/cb-01/events` | band → backend | 1 | no | event (§3.3) |
| `calmband/cb-01/cmd` | backend → band | 1 | **never** | command (§3.4) |
| `calmband/cb-01/ack` | band → backend | 1 | no | acknowledgement (§3.5) |
| `calmband/cb-01/raw` | band → recorder | 0 | no | RECORD mode only (§3.6) |
| `calmband/cb-01/sim` | tester → **simulator only** | 1 | no | test hooks (§5) |

### 3.1 Feature window (~350 bytes)

```json
{"schema":1,"dev":"cb-01","boot":"91ce996b","seq":17,"origin":"live",
 "windowStartMs":1760000030003,"windowEndMs":1760000090003,"clockValid":true,
 "contact":true,"quality":1.00,"pulseRateBpm":76.4,"pulseRateSdBpm":0.49,
 "validBeatFraction":1.00,"validIbis":72,"motionValid":true,"motionCoverage":1.00,
 "motionRms_g":0.0120,"motionMax_g":0.031,"moving":false,"motorActive":false,"timingGap":false}
```

- `boot`: 8 hex chars, new on every power-up. Duplicate key = `dev` + `boot` + `seq`.
- `origin`: `"live"` (real MAX30102) or `"replay"` (synthetic pulse: Wokwi, host simulator, `SIM_PULSE=1`).
- Times are epoch milliseconds from the device clock. The receiver should record its own receipt time separately.
- While offline, windows queue on the band (120 slots × 512 B ≈ 30 min). On reconnect they're sent oldest first with **original timestamps**. Overflow drops the oldest and increments `droppedWindows`.

### 3.2 Status (retained)

```json
{"dev":"cb-01","boot":"91ce996b","online":true,"clockValid":true,"droppedWindows":0,"publishFailures":0,
 "pulseSensor":"ok","motionSensor":"ok"}
```

- `pulseSensor` / `motionSensor`: `"ok"`, `"missing"` or `"simulated"`. The band re-sends status when a sensor is lost (about 32 failed MPU6050 reads in a row, ~1 s) or comes back (it retries every 5 s).
- The Last Will `{"dev":"cb-01","online":false}` is published by the broker if the band disappears without a clean disconnect (about 45 s with a 30 s keep-alive).

### 3.3 Event

```json
{"dev":"cb-01","boot":"91ce996b","type":"button","detail":"stop","atMs":1760000041000}
{"dev":"cb-01","boot":"91ce996b","type":"contact","detail":"off","atMs":1760000052000}
```

- `button / stop`: STOP was pressed.
- `contact / on|off`: the **immediate** finger state from single samples (IR ≥ 50 000), debounced: it's reported once the new state has held for **1 s**, so it arrives about 1–2 s after the change. It is re-sent on every MQTT connect. This is separate from the 60 s window's `contact` field, which needs ≥ 90 % of the window.

### 3.4 Command (backend → band)

```json
{"commandId":"6f1c…","sessionId":"cs-1a2b3c4d","pattern":"rep_pulse","maxDurationMs":1500,
 "issuedAtMs":1760000040000,"expiresAtMs":1760000043000}
```

The payload must be **one valid JSON object** with flat values (string, number, true, false, null). Required: `commandId` (1–47 characters, letters, digits, `-`, `_`), `pattern` (string), `issuedAtMs` and `expiresAtMs` (whole numbers). Optional: `maxDurationMs` (whole number), `sessionId`, and any other flat field (ignored).

The band checks in this order, and rejects with the first reason that applies:

1. `malformed`: not exactly one valid flat JSON object (truncated, trailing text, nested values, duplicate keys, single quotes…), or a required field is missing or has the wrong type. No ack is possible if no valid `commandId` could be read.
2. `duplicate`: the ID was seen this boot (last 32 IDs remembered, even if rejected).
3. `no_clock`: the clock is not valid yet.
4. `bad_time`: `expiresAtMs ≤ issuedAtMs`, or `expiresAtMs − issuedAtMs` > **10 000 ms**, or `issuedAtMs` is more than **2000 ms** in the future (clock skew).
5. `expired`: now > `expiresAtMs`, **or** now − `issuedAtMs` > **5000 ms** (3 s TTL + 2 s skew). The band enforces command age itself; it doesn't rely on the backend's expiry.
6. `bad_pattern`: unknown pattern name.
7. `bad_duration`: `maxDurationMs` < 1 or > **1500**.
8. **Final re-check:** right before the motor starts, the band checks `now ≤ expiresAtMs` again (`expired` if not). There is **no network operation** between that check and the start; the `accepted` ack (and any `stopped / replaced` ack) is sent **after** the motor has started.

The pattern runs for at most `min(maxDurationMs, 1500)` ms. `sessionId` is not used by the band. A new command replaces a pattern that is playing; the replaced one is acknowledged as `stopped / replaced`.

**Motor timing on the ESP32:** the pattern is stepped every 2 ms by an `esp_timer` callback, which runs in the ESP-IDF timer **task**, not in `loop()`. So a blocked `loop()` (TLS handshake, reconnect) does not stretch a vibration. The same callback forces the motor off after 1500 ms of continuous on-time. This is software timing, not an independent electrical cut-off: expect the pattern to end within a few milliseconds of its nominal length, not "exactly 1500 ms under every condition". The STOP button also cuts the pin directly in its interrupt. Checked on the emulated ESP32 by the `MOTOR_SELFTEST` build: with `loop()` blocked for 3 s, the 1500 ms pattern ended at +1500 ms in one run and +1503 ms in another (`firmware/results/6-qemu-motor-and-sensor-selftest-log.txt`).

**MQTT callback rule:** the band never publishes from inside the MQTT receive callback (arduino-mqtt does not allow it, and a QoS 1 publish there can deadlock). Commands are copied into a 4-slot queue and handled, and acknowledged, in `loop()` after `mqtt.loop()`. If the queue is full, the command is dropped (never delayed).

| Pattern | Motor on/off sequence (ms) | Total |
|---|---|---|
| `rep_pulse` | on 120 | 120 |
| `ease_off` | on 120, off 100, on 120 | 340 |
| `session_complete` | on 300, off 150, on 300, off 150, on 600 | 1500 |
| `breath_in` | on 80, off 80, on 80 | 240 |
| `breath_out` | on 400 | 400 |

Patterns run locally on the band; only start, finish and stop cross the network.

### 3.5 Acknowledgement

```json
{"commandId":"6f1c…","dev":"cb-01","boot":"91ce996b","result":"executed","reason":null,"atMs":1760000040300}
```

- `result`: `accepted` (pattern started), `executed` (pattern finished on its own), `rejected` (with a reason from §3.4), or `stopped`.
- `stopped` has reason `local_stop` (STOP button), `replaced` (a newer command took over) or `max_duration` (the timer backstop cut the motor; this should never happen in normal use). A stopped command is never also `executed`.
- **STOP** turns the motor off inside the interrupt routine, works with no Wi-Fi or clock, and also publishes the `events` message.

### 3.6 Raw (RECORD mode: hold STOP while powering on)

```json
{"dev":"cb-01","boot":"91ce996b","t0":123456,"atMs":1760000040000,"hz":100,"ir":[120034,119987, …25 values]}
```

4 messages a second. `t0` is the device's milliseconds-since-boot for the first sample. The normal feature windows are produced in this mode too, so a recording has time-matched motion (`motionRms_g`, `moving`, `motionValid`) and quality metadata alongside the raw pulse.

## 4. Backend sample HTTP API (`backend-sample/backend/app.py`, port 8000)

| Method + path | Body / response |
|---|---|
| `POST /api/companion/sessions` | `{"companionSessionId":"cs-…","startedAtMs":…}`; opens the session that new windows are linked to |
| `POST /api/companion/sessions/{id}/events` | One of: `{"type":"exercise_state","seq":1,"atMs":…,"exerciseId":"EX_SMILE","state":"DEMO\|REPS\|REST"}`; `{"type":"rep","seq":2,"atMs":…,"repIndex":0,"peakEffortIndex":0.7,"durationMs":1500}`; `{"type":"ease_off","seq":3,"atMs":…,"active":true}`. Response `{"ok":true,"command":<id or null>}`, or `{"ok":true,"duplicate":true}` for a repeated `seq` |
| `POST /api/companion/sessions/{id}/end` | `{"localSessionId":…,"endReason":"completed\|user_stopped\|red_flag_stopped\|quality_abandoned","endedAtMs":…,"exercises":[{"exerciseId","repsCompleted","meanSymmetryIndex","meanEffortIndex","easeOffCount","lowQualityFramePct"}]}`; also sends `session_complete` |
| `GET /api/companion/status` | `{"device","state","problems":[…],"pulseRateBpm":<number or null>,"online","lastHeardMs","readingEndMs","readingAgeMs","sensors":{"pulse","motion"},"contact":<true/false/null>,"boot","rejectedMessages","lastRejectReason"}`. See the status rules below. Pulse is given **only** when `state` is `usable` |
| `GET /api/companion/reviewer/sessions` | Per session: state, event count, summary, linked windows, `usableWindows` (clean), `vibrationOverlapWindows`, `prePulseBpm`, `postPulseBpm`, command and executed counts |
| `POST /api/companion/_test/command` | **Test only:** `{"pattern","sessionId"?,"ttlMs"?,"commandId"?,"issuedAtMs"?}` publishes a command |
| `GET /api/companion/_test/command/{id}` | **Test only:** the command plus all its acks |
| `GET /api/companion/_test/windows/{boot}` | **Test only:** `{"count":n}` windows stored for that boot ID |

Event → vibration mapping: `rep` → `rep_pulse`; `ease_off` with `active:true` → `ease_off`; `active:false` → nothing; session end → `session_complete`. Command time-to-live is **3000 ms** (`CMD_TTL_MS`).

**Session association is by the band's own timestamps, not by arrival time:** a window belongs to a session when it ends after `startedAtMs` and starts before `endedAtMs` (or the session is still open). A window queued while offline and delivered after the session ended still counts for that session. The "before" and "after" readings are chosen the same way (§ vibration policy). Storage is **in memory**; it resets when the backend restarts.

**Status rules**, checked in this order (first match wins):

| `state` | When |
|---|---|
| `offline` | the retained status says `online:false` (clean offline or Last Will) |
| `stale` | nothing **from the band** (features, status, events or ack) for 45 s. The backend's own outgoing commands and test hooks don't count |
| `sensor_missing` | the band's latest status reports `pulseSensor` or `motionSensor` as `"missing"` |
| `collecting` | connected, but no reading yet |
| `reading_stale` | the newest reading ended more than **30 s** ago, judged by the band's `windowEndMs`, not by when it arrived (a queued window flushed after an outage is real but not current) |
| `contact_required` | the band's latest `contact` event says **off** (immediate), or the newest window has no contact and there is no "on" event |
| `settling` | the finger is back (latest `contact` event says **on**) but the newest window still has no contact. A clean reading needs up to 60–75 s more |
| `vibration_overlap` | the only problem is `motorActive` (a cue just played) |
| `poor_quality` | any other problem: `no_pulse`, `low_quality` (< 0.8), `timing_gap`, `motion_unavailable`, `moving`, `no_clock` |
| `usable` | none of the above; this is the only state that returns `pulseRateBpm` |

Only readings from the **current boot** are used: the boot ID in the band's latest status, or before any status, the newest reading's boot. Older boots' readings stay stored and still count in session history; they're just never shown as the current reading. Readings dated more than 5 s in the future (a device clock error) are ignored.

**Message validation:** every band message is checked before it changes any state. A `features` message must be a JSON object with `dev` (this device), `boot` (1–16 characters), `seq` (whole number ≥ 0), `windowStartMs` < `windowEndMs` (whole numbers), `contact` (bool) and `quality` (number 0–1). The optional fields in §3.1 must have their documented types (numbers, bools, or null where §3.1 allows it). Numbers must be finite: `NaN`, `Infinity` and overflowing values like `1e999` are rejected. Types are checked before set membership, so a list or object where a word is expected is rejected rather than raising. `status` needs a bool `online` (plus `pulseSensor` / `motionSensor` from the allowed words, and whole-number counters); `ack` needs a string `commandId`, a known `result` and a string-or-null `reason`; `events` needs a string `type` (a `contact` event needs `detail` "on"/"off" and a whole-number `atMs`). Parsing, validation and storage all sit inside one error boundary in the MQTT callback. Invalid messages, and anything that is not JSON, are dropped and counted in `rejectedMessages` (with `lastRejectReason`). They can't raise inside the MQTT callback, so reception carries on. `problems` lists every reason the newest reading is not clean, using the same rule as `usableWindows`.

**Vibration policy (Phase 1):** cues are frequent during reps (one every few seconds), so almost every 60 s window inside a session overlaps a vibration. Those windows are stored and counted (`vibrationOverlapWindows`) but **not** used as pulse readings. The comparison pulse is the last clean window ending in the 5 minutes before the session (`prePulseBpm`) and the first clean window starting in the 5 minutes after it (`postPulseBpm`). Once real hardware data exists, measure how long the motor actually disturbs the MAX30102 signal; only then consider using in-session windows with a margin around each cue cut out. Synthetic data cannot answer that question.

**Recording time this needs:** one clean window is 60 s, and a new one finishes every 15 s. So plan about **60–75 s of quiet recording before the first exercise** and **60–75 s after the final vibration** (the `session_complete` cue), with the finger sensor on and the arm still. Allow longer if contact is lost or the arm moves, because that window is spoiled and the next clean one is needed. Keep the sensor attached through both periods. The app should show "hold still" during these periods and wait until `prePulseBpm` / `postPulseBpm` exist.

Environment variables: `MQTT_HOST` (127.0.0.1), `MQTT_PORT` (1883), `DEVICE_ID` (cb-01), `MIRRORWELL_DIST` (../../MirrorWell/dist), `CMD_TTL_MS` (3000), `STALE_AFTER_MS` (45000), `READING_MAX_AGE_MS` (30000), `FUTURE_TOLERANCE_MS` (5000), `PRE_POST_WINDOW_MS` (300000).

## 5. Simulators

**`firmware/host/calm_band_sim`** runs the real `calm_core` on Linux with a synthetic pulse (~72 bpm, slow ±4 bpm drift, ±3 % beat jitter) and synthetic motion (still, or a 2 Hz 0.35 g swing).

- Environment: `DEVICE_ID`, `WINDOW_MS`, `HOP_MS`, `MIN_IBIS`, `CONTACT` (1/0), `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`.
- Test hooks on `calmband/<dev>/sim` (JSON, spaces allowed):
  - `{"contact":false}` / `{"contact":true}`
  - `{"moving":true}` / `{"moving":false}`
  - `{"button":"stop"}`
  - `{"offlineMs":6000}`: drops the MQTT connection for that long while still producing windows
  - `{"clockValid":false}` / `{"clockValid":true}`
  - `{"motionSensor":false}` / `{"motionSensor":true}`: the MPU6050 stops or starts giving samples (status changes to `missing` / back)
- Like the ESP32, the simulator only queues commands in its MQTT callback and handles them in the main loop.

**`backend-sample/fake_band.py`** is the older Python stand-in (no STOP or motion). Use `calm_band_sim` instead.

## 6. Expected test results (re-run 26 Oct 2026, after the third review)

| Test | Command | Expected |
|---|---|---|
| 1. Core unit tests | `cd firmware/host && make && ./test_core` | 48 passed, 0 failed |
| 2. Backend status rules | own backend: `DEVICE_ID=cb-check uvicorn app:app --port 8001`, then `BACKEND_URL=http://127.0.0.1:8001 DEVICE_ID=cb-check python3 backend-sample/backend_checks.py` | 26/26 |
| 3. Integration (band ↔ broker ↔ backend) | broker + backend + `calm_band_sim` (fast windows), then `python3 backend-sample/run_integration.py` | 13/13 |
| 4. Firmware scenarios | **fresh** backend + same simulator, then `python3 firmware/host/firmware_scenarios.py` | 23/23 |
| ESP32 compile (re-measured 26 Oct) | see `firmware/README.md` | Wokwi/sim build 914,781 B (69 % flash); real-sensor build 913,509 B (69 %); RAM 116,076 B (35 %) |
| Emulated ESP32 (QEMU 9.0.0, BENCH build) | see `firmware/README.md` | boots, prints one reading per second with no timing gaps (43 in ~50 s this run), `motionValid:false` and quality ≤ 0.5 because QEMU has no MPU6050 |
| Emulated ESP32, `MOTOR_SELFTEST=1 SENSOR_SELFTEST=1` | see `firmware/README.md` | `RESULT PASS` (6 motor edges, off at ~+1500 ms while `loop()` is blocked for 3 s) and `SENSOR TASK TIMING PASS` (~300 synthetic pulse samples, 96 motion slots on schedule, 0 MPU6050 readings because QEMU has none) |

`scripts/run_all_tests.sh` runs suites 1–4. A suite counts as passed only if its process exits 0, its log has no `FAIL` line and no Python traceback, **and** its summary shows exactly the expected count. Otherwise the script prints `SOME SUITES FAILED` and exits 1. If a tool or Python package is missing, it exits 2 before running anything.

**Not verified by any of this:** either physical sensor's I2C path, real pulse quality, motor interference with the pulse signal, Wi-Fi/TLS to EMQX, and Wokwi. These need the real parts or network access.
