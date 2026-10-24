#!/usr/bin/env bash
# Runs the three data-flow test suites end to end on one Linux machine:
#   1. core unit tests          (firmware/host/test_core)          expect 20 passed
#   2. integration checks       (backend-sample/run_integration.py) expect 13/13
#   3. firmware scenarios       (firmware/host/firmware_scenarios.py) expect 14/14
# Needs: g++, make, libmosquitto-dev, mosquitto + mosquitto-clients, python3 with
#        fastapi uvicorn paho-mqtt httpx.  (Debian/Ubuntu:
#        sudo apt install build-essential libmosquitto-dev mosquitto mosquitto-clients
#        pip install fastapi uvicorn paho-mqtt httpx)
# Uses ports 1883 (MQTT) and 8000 (backend). Logs go to ./test-logs/.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/test-logs"; mkdir -p "$LOGS"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

port_open() { (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }
wait_port() { for _ in $(seq 1 50); do port_open "$1" && return 0; sleep 0.2; done; echo "port $1 never opened"; return 1; }

FAIL=0

echo "== 0. build host programs"
make -C "$ROOT/firmware/host" >"$LOGS/build.txt" 2>&1 || { cat "$LOGS/build.txt"; exit 1; }

echo "== 1. core unit tests"
"$ROOT/firmware/host/test_core" | tee "$LOGS/1-core-unit-tests.txt" | tail -1
grep -q " 0 failed" "$LOGS/1-core-unit-tests.txt" || FAIL=1

if port_open 1883; then echo "   (using the MQTT broker already on :1883)"
else mosquitto -p 1883 >"$LOGS/mosquitto.txt" 2>&1 & PIDS+=($!); wait_port 1883 || exit 1; fi

start_backend() {
  if port_open 8000; then echo "port 8000 is busy — stop whatever is using it"; exit 1; fi
  ( cd "$ROOT/backend-sample/backend" && exec python3 -m uvicorn app:app --port 8000 ) >>"$LOGS/backend.txt" 2>&1 &
  BACKEND=$!; wait_port 8000 || exit 1
}
stop_backend() { kill "$BACKEND" 2>/dev/null; wait "$BACKEND" 2>/dev/null; for _ in $(seq 1 25); do port_open 8000 || break; sleep 0.2; done; }

start_backend
# Simulated ESP32 with fast windows (5 s window, 1 s hop, 3 beats minimum).
WINDOW_MS=5000 HOP_MS=1000 MIN_IBIS=3 "$ROOT/firmware/host/calm_band_sim" >"$LOGS/simulated-esp32-log.txt" 2>&1 &
PIDS+=($!)
echo "   waiting 8 s for the first windows..."; sleep 8

echo "== 2. integration (backend <-> broker <-> simulated band)"
python3 "$ROOT/backend-sample/run_integration.py" | tee "$LOGS/2-integration.txt" | tail -1
grep -q "^FAIL" "$LOGS/2-integration.txt" && FAIL=1

echo "== 3. firmware scenarios (fresh backend)"
stop_backend; start_backend; sleep 3
python3 "$ROOT/firmware/host/firmware_scenarios.py" | tee "$LOGS/3-firmware-scenarios.txt" | tail -1
grep -q "^FAIL" "$LOGS/3-firmware-scenarios.txt" && FAIL=1
stop_backend

[ $FAIL = 0 ] && echo "ALL SUITES PASSED (logs in $LOGS)" || echo "SOME CHECKS FAILED (logs in $LOGS)"
exit $FAIL
