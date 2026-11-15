# Calm Band — demo notes (16 Nov 2026, Windows)

Everything below was run on the real hardware on this laptop.

## Results

| Check | Result | Detail |
|---|---|---|
| Band joins hotspot + broker | PASS | "never gonna give you up", 2.4 GHz, broker at 10.238.49.103:1883 |
| a. `GET /api/companion/status` | PASS | `usable`, 97–98 BPM, quality 1.00 (finger resting, still) |
| b. Test buzz (`rep_pulse`, `ease_off`) | PASS | ack `accepted` → `executed` in ~0.2 s; motor capped at 1.5 s |
| c. MirrorWell session in Chrome | PASS | 5 reps → 5 buzzes + "session complete" (6/6 executed). No ease-off occurred (MirrorWell decides that itself). |
| d. Finger off | PASS | `contact_required`, pulse withheld |
| d. Shaking | PASS | `poor_quality` (low_quality, moving), pulse withheld |
| 10-min soak | PASS | 40/40 windows in order, 0 timing gaps, 0 rejected. Hotspot dropped for ~85 s: band reconnected by itself, re-sent queued windows, nothing lost; backend showed offline meanwhile (safe). |
| MirrorWell unit tests | PASS | 416/416 |
| Backend checks (`backend_checks.py`) | PASS | 33/33 in 16 s (after adding `-h 127.0.0.1` to its `mosquitto_pub` calls) |
| `start-demo.ps1` cold start | PASS | checks network, starts backend, band online within seconds |

## Start for the demo

1. Phone hotspot ON with **Maximize Compatibility** (2.4 GHz). Laptop joins it.
2. Start the broker (keep the window open; click **Allow** if the firewall asks):
   ```
   & 'C:\Program Files\mosquitto\mosquitto.exe' -c 'C:\Users\arnav\OneDrive\Desktop\Arnav\MirrorWell\mosquitto-calmband.conf' -v
   ```
3. In a second window:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\arnav\OneDrive\Desktop\Arnav\MirrorWell\start-demo.ps1
   ```
   It stops with a red **STOP** line if the Wi-Fi name, the 2.4 GHz band or the laptop IP doesn't match what the band was flashed with. Otherwise it starts the backend, waits for the band and opens http://localhost:8000.
4. In MirrorWell use the **full setup, not "Try a demo"** (demo sessions never talk to the band, by design).

Band power: laptop USB or a USB power bank both work. The band starts by itself; the blue LED goes solid when connected. The laptop must still be on the same hotspot running steps 2–3.

## Do / don't

- Pulse sensor **face-up**. Face-down on a table it reflects infrared and fakes a ~140 BPM "pulse".
- Finger **lightly** on the sensor, still, ~75 s before `usable` (one full 60 s clean window).
- Keep the phone near the band and don't use it heavily; a hotspot hiccup makes the band briefly offline (safe, but no buzzes during it).
- If the laptop's hotspot IP is no longer 10.238.49.103: change `MQTT_HOST` in `calm-band\firmware\calm_band\secrets.h` and re-flash (below).

## Re-flash without opening Arduino IDE

Close any Serial Monitor first (it locks COM3). From the repo folder:
```
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli compile --fqbn esp32:esp32:esp32 --libraries calm-band\firmware\libs --build-path "$env:TEMP\calmband-build" calm-band\firmware\calm_band
& $cli upload -p COM3 --fqbn esp32:esp32:esp32 --input-dir "$env:TEMP\calmband-build" calm-band\firmware\calm_band
```

## Local changes (not committed)

- `calm-band/firmware/calm_band/config.h`: `SIM_PULSE 0` (real MAX30102 instead of the synthetic pulse).
- `calm-band/firmware/calm_band/secrets.h`: hotspot + laptop IP (git-ignored, contains the hotspot password).
- `scripts/copy-wasm.ts`, `verify-model.ts`, `seed-dev.ts`, `inspect-db.ts`: "run directly?" check fixed for Windows (`pathToFileURL`). Without it `npm install` on Windows skips copying the face-tracking runtime and the camera screen fails.
- `calm-band/backend-sample/backend_checks.py`: its 4 `mosquitto_pub` calls now pass `-h 127.0.0.1`. Without it, Windows tries IPv6 `localhost` first and waits ~2 s per publish, which made one check see a stale reading.
- New: `start-demo.ps1`, `start-backend.ps1`, `mosquitto-calmband.conf`, this file.
- The Mosquitto Windows service was set to Manual so it doesn't hold port 1883.

## Known issues (not fixed)

- The backend's MQTT client id is fixed (`calmband-backend`), so two backends on one broker kick each other off. Only run one backend per broker.
- Pulse ~98 BPM at rest has not been confirmed against a manual pulse count.
