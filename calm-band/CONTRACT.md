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
- **quality** = validBeatFraction with contact, else 0; capped at 0.5 when there is no pulse value or when moving.
- **motorActive** = the motor was on at any point in the window. Quality is **not** reduced for this; consumers must exclude or flag these windows (vibration can disturb the pulse signal).
- **timingGap** = a full second inside the window had < 80 % of the expected pulse samples, or no data.
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
 "validBeatFraction":1.00,"validIbis":72,"motionRms_g":0.0120,"motionMax_g":0.031,
 "moving":false,"motorActive":false,"timingGap":false}
```

- `boot`: 8 hex chars, new on every power-up. Duplicate key = `dev` + `boot` + `seq`.
- `origin`: `"live"` (real MAX30102) or `"replay"` (synthetic pulse: Wokwi, host simulator, `SIM_PULSE=1`).
- Times are epoch milliseconds from the device clock. The receiver should record its own receipt time separately.
- While offline, windows queue on the band (120 slots × 512 B ≈ 30 min). On reconnect they're sent oldest first with **original timestamps**. Overflow drops the oldest and increments `droppedWindows`.

### 3.2 Status (retained)

```json
{"dev":"cb-01","boot":"91ce996b","online":true,"clockValid":true,"droppedWindows":0,"publishFailures":0}
```

### 3.3 Event

```json
{"dev":"cb-01","boot":"91ce996b","type":"button","detail":"stop","atMs":1760000041000}
```

### 3.4 Command (backend → band)

```json
{"commandId":"6f1c…","sessionId":"cs-1a2b3c4d","pattern":"rep_pulse","maxDurationMs":1500,
 "issuedAtMs":1760000040000,"expiresAtMs":1760000043000}
```

The band checks in this order, and rejects with the first reason that applies:

1. `malformed`: no `commandId`, or no `pattern` / `expiresAtMs`.
2. `duplicate`: the ID was seen this boot (last 32 IDs remembered, even if rejected).
3. `no_clock`: the clock is not valid yet.
4. `expired`: now > `expiresAtMs`.
5. `bad_pattern`: unknown pattern name.

`sessionId` and `maxDurationMs` are accepted but not used by the band; it applies its own **1500 ms cap**. A new command replaces a pattern that is playing; the replaced one is acknowledged as `stopped / replaced`.

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
- `stopped` has reason `local_stop` (STOP button) or `replaced` (a newer command took over). A stopped command is never also `executed`.
- **STOP** turns the motor off inside the interrupt routine, works with no Wi-Fi or clock, and also publishes the `events` message.

### 3.6 Raw (RECORD mode: hold STOP while powering on)

```json
{"dev":"cb-01","boot":"91ce996b","t0":123456,"atMs":1760000040000,"hz":100,"ir":[120034,119987, …25 values]}
```

4 messages a second. `t0` is the device's milliseconds-since-boot for the first sample. No feature windows are produced in this mode.

## 4. Backend sample HTTP API (`backend-sample/backend/app.py`, port 8000)

| Method + path | Body / response |
|---|---|
| `POST /api/companion/sessions` | `{"companionSessionId":"cs-…","startedAtMs":…}`; opens the session that new windows are linked to |
| `POST /api/companion/sessions/{id}/events` | One of: `{"type":"exercise_state","seq":1,"atMs":…,"exerciseId":"EX_SMILE","state":"DEMO\|REPS\|REST"}`; `{"type":"rep","seq":2,"atMs":…,"repIndex":0,"peakEffortIndex":0.7,"durationMs":1500}`; `{"type":"ease_off","seq":3,"atMs":…,"active":true}`. Response `{"ok":true,"command":<id or null>}`, or `{"ok":true,"duplicate":true}` for a repeated `seq` |
| `POST /api/companion/sessions/{id}/end` | `{"localSessionId":…,"endReason":"completed\|user_stopped\|red_flag_stopped\|quality_abandoned","endedAtMs":…,"exercises":[{"exerciseId","repsCompleted","meanSymmetryIndex","meanEffortIndex","easeOffCount","lowQualityFramePct"}]}`; also sends `session_complete` |
| `GET /api/companion/status` | `{"device":"cb-01","state":"stale\|collecting\|contact_required\|poor_quality\|usable","pulseRateBpm":<number or null>,"lastSeenMs":…}`. Stale after 45 s with nothing received; `poor_quality` below 0.8; pulse only when `usable` |
| `GET /api/companion/reviewer/sessions` | Per session: state, event count, summary, linked/usable window counts, command and executed counts |
| `POST /api/companion/_test/command` | **Test only:** `{"pattern","sessionId"?,"ttlMs"?,"commandId"?,"issuedAtMs"?}` publishes a command |
| `GET /api/companion/_test/command/{id}` | **Test only:** the command plus all its acks |
| `GET /api/companion/_test/windows/{boot}` | **Test only:** `{"count":n}` windows stored for that boot ID |

Event → vibration mapping: `rep` → `rep_pulse`; `ease_off` with `active:true` → `ease_off`; `active:false` → nothing; session end → `session_complete`. Command time-to-live is **3000 ms** (`CMD_TTL_MS`).

A window is linked to the open session when its `windowEndMs ≥` the session's `startedAtMs`. Storage is **in memory**; it resets when the backend restarts.

Environment variables: `MQTT_HOST` (127.0.0.1), `MQTT_PORT` (1883), `DEVICE_ID` (cb-01), `MIRRORWELL_DIST` (../../MirrorWell/dist), `CMD_TTL_MS` (3000), `STALE_AFTER_MS` (45000).

## 5. Simulators

**`firmware/host/calm_band_sim`** runs the real `calm_core` on Linux with a synthetic pulse (~72 bpm, slow ±4 bpm drift, ±3 % beat jitter) and synthetic motion (still, or a 2 Hz 0.35 g swing).

- Environment: `DEVICE_ID`, `WINDOW_MS`, `HOP_MS`, `MIN_IBIS`, `CONTACT` (1/0), `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`.
- Test hooks on `calmband/<dev>/sim` (JSON, spaces allowed):
  - `{"contact":false}` / `{"contact":true}`
  - `{"moving":true}` / `{"moving":false}`
  - `{"button":"stop"}`
  - `{"offlineMs":6000}`: drops the MQTT connection for that long while still producing windows
  - `{"clockValid":false}` / `{"clockValid":true}`

**`backend-sample/fake_band.py`** is the older Python stand-in (no STOP or motion). Use `calm_band_sim` instead.

## 6. Expected test results (21–24 Oct 2026)

| Test | Command | Expected |
|---|---|---|
| Core unit tests | `cd firmware/host && make && ./test_core` | 20 passed, 0 failed |
| Integration (band ↔ broker ↔ backend) | broker + backend + `calm_band_sim` (fast windows), then `python3 backend-sample/run_integration.py` | 13/13 |
| Firmware scenarios | **fresh** backend + same simulator, then `python3 firmware/host/firmware_scenarios.py` | 14/14 |
| ESP32 compile | see `firmware/README.md` | sim 910,657 B (69 % flash), RAM 111,612 B (34 %); hardware 908,617 B |
| Emulated ESP32 (QEMU 9.0.0, BENCH build) | see `firmware/README.md` | boots, prints readings (38 in 45 s), MPU6050 reported MISSING (QEMU has no MPU6050) |

`scripts/run_all_tests.sh` runs the first three in order and restarts the backend between them. `run_integration.py` injects a future-dated "no contact" window, so the scenarios need a fresh backend.
