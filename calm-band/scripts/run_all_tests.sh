#!/usr/bin/env bash
# Runs every data-flow test suite end to end on one Linux machine. A suite counts as passed
# ONLY if (a) its process exits with code 0, (b) its log has no FAIL line and no Python
# traceback, and (c) its summary line shows exactly the expected number of checks.
#
#   suite                     program                                    expected
#   1 core unit tests         firmware/host/test_core                    48 passed, 0 failed
#   2 backend status checks   backend-sample/backend_checks.py           26/26
#   3 integration             backend-sample/run_integration.py          13/13
#   4 firmware scenarios      firmware/host/firmware_scenarios.py        23/23
#
# Needs: g++, make, libmosquitto-dev, mosquitto + mosquitto-clients, python3 with
#        fastapi uvicorn paho-mqtt httpx.  (Debian/Ubuntu:
#        sudo apt install build-essential libmosquitto-dev mosquitto mosquitto-clients
#        pip install fastapi uvicorn paho-mqtt httpx)
# Uses ports 1883 (MQTT), 8000 and 8001 (backends). Logs go to ./test-logs/.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/test-logs"; rm -rf "$LOGS"; mkdir -p "$LOGS"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

port_open() { (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }
wait_port() { for _ in $(seq 1 50); do port_open "$1" && return 0; sleep 0.2; done; echo "port $1 never opened"; return 1; }
die() { echo "SETUP FAILED: $*"; exit 2; }

for tool in make g++ mosquitto_pub python3; do command -v "$tool" >/dev/null || die "missing $tool"; done
python3 -c "import fastapi, uvicorn, paho.mqtt, httpx" 2>/dev/null || die "missing python packages (fastapi uvicorn paho-mqtt httpx)"

SUMMARY=()
FAILED=0
# run_suite <name> <log> <expected-summary-regex> <command...>
run_suite() {
  local name="$1" log="$2" want="$3"; shift 3
  echo "== $name"
  "$@" >"$log" 2>&1
  local rc=$?
  local last; last="$(grep -E '^[0-9]+(/[0-9]+)? .*passed' "$log" | tail -1)"
  local why=""
  [ $rc -ne 0 ] && why="exit code $rc"
  grep -q '^FAIL' "$log" && why="${why:+$why, }FAIL lines"
  grep -q 'Traceback (most recent call last)' "$log" && why="${why:+$why, }Python exception"
  echo "$last" | grep -Eq "$want" || why="${why:+$why, }expected '$want', got '${last:-nothing}'"
  if [ -z "$why" ]; then echo "   ok: $last"; SUMMARY+=("PASS  $name: $last")
  else echo "   FAILED ($why) — see $log"; grep -E '^FAIL|Error|Traceback' "$log" | head -5 | sed 's/^/     /'
       SUMMARY+=("FAIL  $name: $why"); FAILED=1; fi
}

echo "== build host programs"
make -C "$ROOT/firmware/host" -B >"$LOGS/build.txt" 2>&1 || { cat "$LOGS/build.txt"; die "build failed"; }

run_suite "1. core unit tests" "$LOGS/1-core-unit-tests.txt" '^48 passed, 0 failed$' "$ROOT/firmware/host/test_core"

if port_open 1883; then echo "   (using the MQTT broker already on :1883)"
else mosquitto -p 1883 >"$LOGS/mosquitto.txt" 2>&1 & PIDS+=($!); wait_port 1883 || die "broker did not start"; fi
for p in 8000 8001; do port_open $p && die "port $p is busy — stop whatever is using it"; done

start_backend() {  # <port> <device-id> → sets BACKEND
  ( cd "$ROOT/backend-sample/backend" && DEVICE_ID="$2" exec python3 -m uvicorn app:app --port "$1" ) >>"$LOGS/backend-$1.txt" 2>&1 &
  BACKEND=$!; wait_port "$1" || die "backend on $1 did not start"
}
stop_backend() { kill "$1" 2>/dev/null; wait "$1" 2>/dev/null; }

# 2. Backend status rules, on a separate device id and port so the simulated band can't interfere.
start_backend 8001 cb-check; B2=$BACKEND
run_suite "2. backend status checks" "$LOGS/2-backend-checks.txt" '^26/26 backend checks passed$' \
  env BACKEND_URL=http://127.0.0.1:8001 DEVICE_ID=cb-check python3 "$ROOT/backend-sample/backend_checks.py"
stop_backend $B2

# 3. Integration with the simulated ESP32 (fast windows: 5 s window, 1 s hop, 3 beats minimum).
start_backend 8000 cb-01; B1=$BACKEND
WINDOW_MS=5000 HOP_MS=1000 MIN_IBIS=3 "$ROOT/firmware/host/calm_band_sim" >"$LOGS/simulated-esp32-log.txt" 2>&1 &
SIM=$!; PIDS+=($SIM)
sleep 8
kill -0 $SIM 2>/dev/null || die "simulated band exited — see $LOGS/simulated-esp32-log.txt"
run_suite "3. integration" "$LOGS/3-integration.txt" '^13/13 checks passed$' python3 "$ROOT/backend-sample/run_integration.py"

# 4. Firmware scenarios need a fresh backend (integration leaves windows in memory).
stop_backend $B1; start_backend 8000 cb-01; B1=$BACKEND; PIDS+=($B1); sleep 3
run_suite "4. firmware scenarios" "$LOGS/4-firmware-scenarios.txt" '^23/23 firmware checks passed$' python3 "$ROOT/firmware/host/firmware_scenarios.py"

echo; printf '%s\n' "${SUMMARY[@]}"
if [ $FAILED = 0 ]; then echo "ALL SUITES PASSED (logs in $LOGS)"; else echo "SOME SUITES FAILED (logs in $LOGS)"; fi
exit $FAILED
