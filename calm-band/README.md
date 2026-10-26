# Calm Band — source package for connection and data-flow testing

This package has everything needed to check that data flows from the band, through MQTT and the backend, into MirrorWell companion mode. No hardware is required. A simulated ESP32 runs the same firmware core on Linux.

**Read `CONTRACT.md` first.** It is the single spec for pins, I2C addresses, timing, MQTT topics and payloads, commands and acks, the HTTP API, test hooks and expected results.

## Contents

| Folder | What it is |
|---|---|
| `CONTRACT.md` | Interface contract. Every value in it comes from this code |
| `firmware/calm_band/` | ESP32 DevKit V1 sketch (Arduino-ESP32 core 2.0.17). `calm_core.*` is platform-free logic shared with the Linux build |
| `firmware/host/` | Linux build: `test_core` (unit tests), `calm_band_sim` (simulated ESP32 over real MQTT), `firmware_scenarios.py` |
| `firmware/libs/` | Bundled Arduino libraries: arduino-mqtt 2.5.2 (256dpi), SparkFun MAX3010x. ArduinoJson is not used and was left out |
| `firmware/wokwi/` + `firmware/build/wokwi/` | Wokwi project and its ready-made 4 MB merged firmware image |
| `firmware/results/` | Outputs from the reference run (24 Oct 2026) |
| `firmware/docs/wiring.*` | Wiring diagram |
| `backend-sample/` | FastAPI companion backend sample (`backend/app.py`), `backend_checks.py` (status rules), `run_integration.py`, the older `fake_band.py`, and `CODEX_BRIEF.md` |
| `scripts/run_all_tests.sh` | One command that runs all three suites |

## Quick start (Ubuntu or Debian)

```bash
sudo apt install build-essential libmosquitto-dev mosquitto mosquitto-clients
pip install fastapi uvicorn paho-mqtt httpx
./scripts/run_all_tests.sh
```

Expected output: `48 passed, 0 failed`, `33/33 backend checks passed`, `13/13 checks passed`, `23/23 firmware checks passed`, and finally `ALL SUITES PASSED`. The script checks exit codes, `FAIL` lines, Python tracebacks and the exact counts, so it can't report success when a suite crashed. Logs go to `test-logs/`. The script uses ports 1883, 8000 and 8001, and it reuses an MQTT broker that's already running on 1883.

## Running pieces by hand

```bash
mosquitto -p 1883 &
(cd backend-sample/backend && python3 -m uvicorn app:app --port 8000) &
make -C firmware/host
WINDOW_MS=5000 HOP_MS=1000 MIN_IBIS=3 firmware/host/calm_band_sim &   # fast test windows
mosquitto_sub -v -t 'calmband/#'                                      # watch the traffic
curl -s localhost:8000/api/companion/status
curl -s -XPOST localhost:8000/api/companion/_test/command -H 'content-type: application/json' -d '{"pattern":"rep_pulse"}'
mosquitto_pub -t calmband/cb-01/sim -m '{"contact":false}'            # test hooks: see CONTRACT §5
```

Restart the backend before `firmware/host/firmware_scenarios.py`. `run_integration.py` leaves a future-dated "no contact" window in its in-memory store.

To use a different broker, set `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER` and `MQTT_PASS` on both the simulator and the backend. TLS (EMQX on port 8883) is implemented on the ESP32 but **not on the simulator or the sample backend**.

## MirrorWell companion bridge

The bridge itself is in this repo: `src/companion/companionBridge.ts`, plus one hook in `src/screens/session/useSessionScreen.ts`, plus `tests/unit/companion-bridge.test.ts`. It's off unless `VITE_COMPANION_ENABLED=true` is set at build time, and it only calls same-origin `/api/companion/*`, so the no-network rule still holds. To serve the app from the sample backend, run `VITE_COMPANION_ENABLED=true npm run build` and set `MIRRORWELL_DIST` to the `dist/` folder.

## Building the ESP32 firmware

Use the Arduino IDE: install "esp32 by Espressif" 2.0.17 and point it at the libraries in `firmware/libs`. Copy `calm_band/secrets.h.example` to `secrets.h` and fill it in. Select the board "ESP32 Dev Module". `SIM_PULSE 1` (the default) uses the synthetic pulse; set `SIM_PULSE 0` for the real MAX30102. Command-line build: see `firmware/README.md`.

## What has and hasn't been verified

**Verified:**
- core logic
- full MQTT and HTTP data flow with the simulated ESP32
- ESP32 compile
- boot on an emulated ESP32 (QEMU)

**Not verified yet:**
- running inside Wokwi
- the EMQX Cloud/TLS path
- real sensors
- motor interference on real hardware

Windows that overlap a vibration are marked `motorActive:true`. The backend does not use them as pulse readings: it reports a clean pulse from just before and just after the session instead (CONTRACT §4, vibration policy).
