# Calm Band — ESP32 firmware and simulation package

Firmware for the MirrorWell Calm Band, a pulse and motion band worn during seated facial-exercise sessions. This package covers the Codex hand-off steps 1–3 and 5. Step 4 (internet broker) and step 6 (physical build) are still open, as described below.

## What's here

| Path | What it is |
|---|---|
| `calm_band/` | Arduino sketch for the **ESP32 DevKit V1** (Arduino-ESP32 core 2.0.17) |
| `calm_band/calm_core.*` | All the logic: feature windows, pulse and motion features, contact detection, command rules, vibration patterns, local STOP, offline queue. No Arduino code, so the **same file** runs on the ESP32 and on Linux |
| `calm_band/calm_app.cpp` | Hardware layer: pins, I2C sensors (MAX30102 and MPU6050), Wi-Fi, internet clock (NTP), MQTT over TLS |
| `calm_band/sim_sources.h` | Synthetic pulse waveform (Wokwi has no MAX30102). Readings built from it are labelled `"origin":"replay"` |
| `calm_band/config.h` | Pins and build switches |
| `calm_band/secrets.h.example` | Copy to `secrets.h` and add your Wi-Fi and EMQX details |
| `host/` | Linux build of the same core: unit tests, a **simulated ESP32** for integration testing, and firmware scenario tests |
| `wokwi/` | Wokwi project (`diagram.json`, `wokwi.toml`, Wokwi secrets) |
| `build/` | Compiled ESP32 binaries: `sim/` (synthetic pulse), `hardware/` (real MAX30102), `wokwi/` (merged 4 MB image for Wokwi) |
| `docs/wiring.png` / `.svg` | Labelled wiring diagram |
| `results/` | Raw output of every test run listed below |

## Wiring

| Part | Pin | ESP32 pin |
|---|---|---|
| MAX30102 | VIN, GND, SDA, SCL | 3V3, GND, GPIO21, GPIO22 (I2C address 0x57) |
| MPU6050 (GY-521) | VCC, GND, SDA, SCL | 3V3, GND, GPIO21, GPIO22 (I2C address 0x68) |
| Vibration motor module | VCC, GND, IN | VIN (5 V), GND, GPIO25 |
| STOP button | one leg / other leg | GPIO27 (internal pull-up) / GND |
| Status LED | — | GPIO2 (on-board): solid = connected, blinking = not connected |

The I2C bus runs at **100 kHz** (`I2C_HZ` in `config.h`), which tolerates the ~30 cm sensor leads in the desk-hub layout. Both sensors share the bus.

Optional parts: a 100 µF 16 V capacitor across the motor module's VCC and GND (watch the polarity), and a 100 nF capacitor across 3V3 and GND at the breadboard rows.

**Before ordering the motor module, confirm it has:**
- the motor included
- a built-in driver
- flyback protection (a diode that absorbs the voltage spike when the motor switches off)
- a control input documented as 3.3 V-compatible
- a specified supply voltage

## Behaviour

- **Sampling:** pulse at 100 Hz, motion at 32 Hz.
- **Windows:** 60-second windows, a new one every 15 seconds. `FAST_WINDOWS=1` switches to 5 s windows every 1 s for testing.
- **Missing data stays missing.** No finger contact → `contact:false`, `quality:0`, `pulseRateBpm:null`. Arm movement → `moving:true`, quality capped at 0.5. A window overlapping a vibration → `motorActive:true`.
- **Motion sensor health is reported.** If too few motion samples arrive (MPU6050 missing or failing), the window says `motionValid:false`, the motion fields are `null` and quality is capped at 0.5. Status reports `motionSensor: "missing"`, and the band retries the sensor every 5 s.
- **No valid clock, no data.** Nothing is published without an NTP-valid timestamp, and commands are rejected as `no_clock`.
- **Command rules:** the command must be one valid JSON object with `commandId`, `pattern`, `issuedAtMs` and `expiresAtMs`. It is rejected as `malformed`, `duplicate`, `no_clock`, `bad_time`, `expired` (including anything issued more than 5 s ago), `bad_pattern` or `bad_duration` (over 1500 ms). Every command ID is remembered, so a re-delivered command can never vibrate later. Commands are never queued for later.
- **Motor timing doesn't depend on the network:** a 2 ms `esp_timer` callback (it runs in a timer task) steps the vibration pattern and forces the motor off after about 1.5 s of continuous on-time, even if `loop()` is stuck in a TLS handshake. It's software timing, not an electrical cut-off. A command's expiry is re-checked right before the motor starts, and acks go out after the start.
- **Sensor failures are detected and retried:** every I2C read is checked; repeated failures mark the sensor `missing` in status, it is re-initialised every 5 s, and after the pulse sensor recovers no window is clean until a full window has passed.
- **Immediate finger contact:** a `contact` on/off event (debounced 1 s) is sent as soon as the finger moves, separate from the 60 s windows.
- **Sensor sampling doesn't depend on the network:** a separate task reads the sensors every 10 ms. It reads the MAX30102's 32-sample FIFO directly, reports overflow as lost samples (`timingGap`), and stamps motion readings with their real read time (missed slots lower `motionCoverage`).
- **No publishing inside the MQTT callback:** commands are copied into a queue there, then handled and acknowledged in `loop()` (arduino-mqtt can deadlock otherwise).
- **Vibration patterns** run on the band itself and are capped at 1.5 s: `rep_pulse`, `ease_off`, `session_complete`, `breath_in`, `breath_out`. The band acknowledges each command as `accepted`, `executed`, `rejected` or `stopped`.
- **STOP button:** cuts the motor inside the interrupt routine, then reports `stopped / local_stop`. It works without Wi-Fi.
- **Offline queue:** up to 120 windows (30 minutes) are kept while disconnected. On reconnect they're sent oldest first with their original timestamps. If the queue overflows, the oldest are dropped and counted in `status.droppedWindows`.
- **Error counting:** every MQTT publish result is checked, and failures are counted in `status.publishFailures`.
- **MQTT client:** `256dpi/arduino-mqtt` (supports QoS 1), not PubSubClient. Clean session plus non-retained commands means stale vibrations are never replayed.
- **Modes:**
  - **LIVE** (default)
  - **RECORD**: hold STOP while powering on to stream raw 100 Hz IR samples on `…/raw`
  - **BENCH**: leave `WIFI_SSID` empty to print readings to Serial with no network
  - **Replay**: the `SIM_PULSE=1` build

## Test results (re-run 26 Oct 2026, after the third review)

| Test | Result | Output |
|---|---|---|
| Core unit tests (`host/test_core`), incl. a datasheet-behaving fake MAX30102 (overflow, partial read, disconnect, reconnect), sensor health/retry, contact debounce | **48/48 pass** | `results/1-core-unit-tests.txt` |
| Backend status rules, incl. wrong-type and non-finite messages, immediate contact, late-delivered windows | **26/26 pass** | `results/2-backend-status-checks.txt` |
| Integration checks with the **simulated ESP32** | **13/13 pass** | `results/3-integration-with-simulated-esp32.txt` |
| Firmware scenarios, incl. contact "off" event within 2 s | **23/23 pass** | `results/4-firmware-scenarios.txt` |
| ESP32 compile, Wokwi/simulated-pulse build | **pass**: 914,781 B flash (69%), 116,028 B RAM (35%) | `build/wokwi/` |
| ESP32 compile, real-sensor build | **pass**: 913,509 B flash (69%), 116,076 B RAM (35%) | — |
| Real ESP32 binary on an **emulated ESP32** (QEMU 9.0.0), BENCH mode | **pass**: one reading per second, no timing gaps; `motionValid:false`, quality 0.50 (QEMU has no MPU6050) | `results/5-qemu-esp32-boot-log.txt` |
| Motor + sensor-task self-tests on the emulated ESP32 | **pass**: with `loop()` blocked for 3 s, the motor pattern ended at +1500 ms, and the sensor task kept its schedule (301 synthetic pulse samples, 96 motion slots). **Timing only:** 0 MPU6050 readings, because QEMU has none; neither sensor's I2C path is tested here | `results/6-qemu-motor-and-sensor-selftest-log.txt` |

Bugs found and fixed while testing:
- **Sideways arm movement was under-detected** (0.046 g against a 0.05 g threshold). Gravity is now removed separately on each axis, and the same swing reads 0.27 g.
- **Exuberant ctags generated wrong function declarations** for the sketch. The code moved into `calm_app.cpp`.
- **The MAX30102 driver forced 400 kHz** on the shared bus. It now uses `I2C_HZ` (100 kHz).
- **Review fixes (24 Oct):** QoS 1 acks were published inside the MQTT callback (deadlock risk); motor timing depended on `loop()`; a missing motion sensor read as "still, quality 1.0"; command parsing accepted non-JSON and ancient `issuedAtMs`. All four are fixed and tested.
- **Third review (26 Oct):** pulse-sensor health was set once at boot and never updated (no retry, failed reads looked like an empty FIFO); the backend raised on wrong-type values and accepted NaN. Fixed: checked I2C, health tracking with 5 s retries and a clean-window requirement after recovery, type-first validation, finite numbers only, one error boundary.
- **Second review (26 Oct):** a command could expire during its own ack; sensor reads ran in the network loop (the pulse driver's 4-sample buffer could overflow, and late motion reads got old timestamps); the backend showed a previous boot's reading as current; malformed telemetry could raise in the MQTT callback. All four are fixed and tested.

## Not yet verified

- **Running inside Wokwi itself.** wokwi.com is blocked from the machine this was built on. The project and image are ready: open `wokwi/` in VS Code with the Wokwi extension, or run `wokwi-cli` with a free token from wokwi.com/dashboard/ci.
- **Step 4, internet broker.** Public brokers and EMQX are also blocked from that machine. To run it: create a free EMQX Serverless deployment (choose the region closest to India) and fill in `secrets.h` (host, port 8883, TLS, per-device username and password, CA certificate). Then start the backend with `MQTT_HOST/PORT/USER/PASS`, flash or simulate the band, and run both test scripts.
- **The emulator has no MPU6050 chip,** so motion read 0 there. Motion is covered by the host tests and will be covered in Wokwi.
- **Step 6, physical validation:** finger pulse quality, mounting, power stability, and motor interference with the readings.

## How to build

**ESP32 (Arduino IDE):**
1. Install "esp32 by Espressif" version 2.0.17 and the libraries **MQTT by Joel Gaehwiler** (256dpi) and **SparkFun MAX3010x**.
2. Copy `secrets.h.example` to `secrets.h` and fill it in.
3. Choose board "ESP32 Dev Module" and upload.

For the real sensor, set `SIM_PULSE 0` in `config.h`.

**Command line (what was used here):** copy `wokwi/secrets.wokwi.h` to `calm_band/secrets.h` (or write your own) first.
```
arduino-cli compile --fqbn espressif:esp32:esp32:FlashMode=dio,FlashFreq=40 --libraries libs \
  --build-property "compiler.cpp.extra_flags=-DSIM_PULSE=0 -DFAST_WINDOWS=0" --build-path out calm_band
```

**Emulated ESP32 (QEMU):** build with an empty `WIFI_SSID` (BENCH mode) and `-DENABLE_RECORD_BOOT=0 -DFAST_WINDOWS=1`. Add `-DMOTOR_SELFTEST=1 -DSENSOR_SELFTEST=1` for the motor timing and sensor sampling tests. Then:
```
esptool.py --chip esp32 merge_bin -o flash.bin --fill-flash-size 4MB --flash_mode dio --flash_freq 40m \
  0x1000 out/calm_band.ino.bootloader.bin 0x8000 out/calm_band.ino.partitions.bin \
  0xe000 <esp32 core>/tools/partitions/boot_app0.bin 0x10000 out/calm_band.ino.bin
qemu-system-xtensa -nographic -machine esp32 -drive file=flash.bin,if=mtd,format=raw
```

**Linux simulation and tests:**
```
cd host && make
./test_core
WINDOW_MS=5000 HOP_MS=1000 MIN_IBIS=3 ./calm_band_sim          # needs a broker on :1883
python3 firmware_scenarios.py                                   # needs the companion backend on :8000
```
