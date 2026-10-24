# Calm Band — Simulation Brief for Codex (Task 1)

**Goal:** build the Calm Band hardware as an online simulation, with real ESP32 firmware, so the whole system can be tested before any parts are bought. The MirrorWell side (task 2) is already done and tested; your simulated band must plug into it **unchanged**.

## 1. Use Wokwi, not Tinkercad

- **Tinkercad Circuits can't do this project.** It has no ESP32, no Wi-Fi/MQTT, no MAX30102 and no MPU6050.
- **Wokwi** (wokwi.com, free) supports what we need:
  - the ESP32 DevKit
  - an MPU6050
  - push buttons and LEDs
  - Wi-Fi with internet access (SSID `Wokwi-GUEST`, no password)
- Use an **LED as a stand-in for the vibration motor**. In the real build, that pin drives the motor module's `IN` pin.
- **The MAX30102 isn't in Wokwi's parts list.** Two options:
  - **Simple:** generate a synthetic pulse waveform in firmware (about 72 bpm with small variation), behind the same interface the real driver will use.
  - **Better, optional:** write a Wokwi **Custom Chip** that pretends to be a MAX30102 on I2C at address `0x57`, so the real driver code gets exercised.

## 2. Wiring (keep it identical to the real build)

| Part | Pin | ESP32 pin |
|---|---|---|
| MAX30102 (real) / custom chip | SDA, SCL | GPIO21, GPIO22 (I2C, address 0x57) |
| MPU6050 | SDA, SCL | GPIO21, GPIO22 (same bus, address 0x68) |
| Both sensors | VIN, GND | 3V3, GND |
| Vibration motor module (LED in sim) | IN | GPIO25 |
| Stop button | one leg / other leg | GPIO27 (internal pull-up) / GND |
| Status LED | — | GPIO2 (on-board) |

## 3. Firmware behaviour

**Sampling and windows**
- Pulse at **100 Hz**, motion at about **32 Hz**.
- **60-second windows**, sliding every **15 seconds**. For testing, add a fast mode with a **1-second** hop.

**Modes**
- Bench, Record, Live and Replay.
- Replay data must be marked `"origin": "replay"`.

**Stop button**
- Stops any vibration **immediately and locally**.
- Must work even with no Wi-Fi.
- Publishes an event on `events`.

**Commands**
- Reject an **expired** command (`now > expiresAtMs`).
- Reject a **duplicate** `commandId`: remember the IDs already seen during this boot.
- Run the vibration pattern on the band itself; don't send each on/off change over the network.
- Acknowledge every command as `accepted`, then `executed`, or `rejected` with a reason.

**Clock**
- Get time from NTP.
- Until the clock is valid, send `"clockValid": false` and refuse any command that depends on time.

**MQTT client**
- Use `256dpi/arduino-mqtt`, **not** PubSubClient. PubSubClient can only publish at QoS 0 and has a 256-byte default buffer.
- Check every `publish()` return value and count failures.

## 4. Message contract (must match exactly)

The backend and test harness are in this folder: `backend/app.py`, `fake_band.py`, `run_integration.py`. Your firmware replaces `fake_band.py`.

**Topics** (device `cb-01`):

| Topic | Direction | Notes |
|---|---|---|
| `calmband/cb-01/features` | band → backend | QoS 1, not retained |
| `calmband/cb-01/status` | band → backend | QoS 1, retained. Last Will = `{"dev":"cb-01","online":false}` |
| `calmband/cb-01/events` | band → backend | button presses etc. |
| `calmband/cb-01/cmd` | backend → band | never retained |
| `calmband/cb-01/ack` | band → backend | QoS 1 |

**Feature message:**
```json
{"schema":1,"dev":"cb-01","boot":"<random per boot>","seq":17,"origin":"live",
 "windowStartMs":0,"windowEndMs":0,"clockValid":true,
 "contact":true,"quality":0.95,"pulseRateBpm":72.4,"validBeatFraction":0.97,
 "motionRms_g":0.012,"motorActive":false}
```
When there's no finger contact: `"contact": false`, `"quality": 0`, `"pulseRateBpm": null`. **Never send a made-up value.**

**Command (received):**
```json
{"commandId":"uuid","sessionId":"cs-…","pattern":"rep_pulse|ease_off|session_complete",
 "maxDurationMs":1500,"issuedAtMs":0,"expiresAtMs":0}
```

**Ack (sent):**
```json
{"commandId":"uuid","dev":"cb-01","boot":"…","result":"accepted|executed|rejected","reason":"expired|duplicate|null","atMs":0}
```

**Suggested patterns** (match MirrorWell's own phone vibration):
- `rep_pulse`: one short pulse
- `ease_off`: pulse, gap, pulse
- `session_complete`: a distinct longer pattern

## 5. Acceptance test

1. Point the backend at a broker the simulation can reach. Either:
   - an **EMQX Cloud** free deployment (TLS on port 8883, username and password), or
   - for a first smoke test only, a public test broker with a random topic prefix.
2. Start the backend: `cd backend && MQTT_HOST=… uvicorn app:app --port 8000`.
3. Run the Wokwi simulation in fast-hop mode instead of `fake_band.py`.
4. Run `python3 run_integration.py`. **All 13 checks must pass.**
5. Extra checks on the simulated hardware:
   - the button stops a running pattern
   - no window is sent before the clock is valid
   - after a Wi-Fi drop, no stale vibration is replayed
   - queued windows keep their original timestamps

**What simulation does NOT prove:** real pulse quality, sensor compatibility, power stability, comfortable mounting, or motor interference. Those wait for real hardware.
