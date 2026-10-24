"""End-to-end check of the companion path WITHOUT a camera:
browser bridge payloads (same shapes the TS bridge sends) -> FastAPI -> MQTT -> fake band -> ack.
Assumes mosquitto, the backend (port 8000) and the simulated band (firmware/host/calm_band_sim,
fast windows) are already running.
"""
import json
import subprocess
import sys
import time

import httpx

B = "http://127.0.0.1:8000"
results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}")


def wait_acks(cid, want, timeout=5):
    end = time.time() + timeout
    while time.time() < end:
        acks = httpx.get(f"{B}/api/companion/_test/command/{cid}").json().get("acks", [])
        if any(a["result"] == want for a in acks):
            return acks
        time.sleep(0.1)
    return httpx.get(f"{B}/api/companion/_test/command/{cid}").json().get("acks", [])


# 1. Band is visible before the session (connection + contact shown separately)
time.sleep(2.5)
st = httpx.get(f"{B}/api/companion/status").json()
check("band status is usable before session", st["state"] == "usable", json.dumps(st))

# 2. Session start + exercise state (what attachCompanion sends on the first stateChanged)
import uuid; sid = f"cs-{uuid.uuid4().hex[:8]}"
httpx.post(f"{B}/api/companion/sessions", json={"companionSessionId": sid, "startedAtMs": int(time.time() * 1000)})
r = httpx.post(f"{B}/api/companion/sessions/{sid}/events",
               json={"type": "exercise_state", "seq": 1, "atMs": 0, "exerciseId": "EX_SMILE", "state": "REPS"}).json()
check("exercise_state event accepted, no haptic", r["ok"] and r["command"] is None)

# 3. Rep completed -> rep_pulse command -> band executes + acks
r = httpx.post(f"{B}/api/companion/sessions/{sid}/events",
               json={"type": "rep", "seq": 2, "atMs": 0, "repIndex": 0, "peakEffortIndex": 0.7, "durationMs": 1500}).json()
acks = wait_acks(r["command"], "executed")
check("rep -> rep_pulse executed on band", any(a["result"] == "executed" for a in acks))

# 4. Same event re-sent (browser retry) -> not stored twice, no second buzz
r2 = httpx.post(f"{B}/api/companion/sessions/{sid}/events",
                json={"type": "rep", "seq": 2, "atMs": 0, "repIndex": 0, "peakEffortIndex": 0.7, "durationMs": 1500}).json()
check("duplicate session event ignored", r2.get("duplicate") is True)

# 5. Ease-off -> ease_off pattern; ease-off cleared -> nothing
r = httpx.post(f"{B}/api/companion/sessions/{sid}/events",
               json={"type": "ease_off", "seq": 3, "atMs": 0, "active": True}).json()
check("ease_off -> band executes", any(a["result"] == "executed" for a in wait_acks(r["command"], "executed")))
r = httpx.post(f"{B}/api/companion/sessions/{sid}/events",
               json={"type": "ease_off", "seq": 4, "atMs": 0, "active": False}).json()
check("ease_off cleared -> no command", r["command"] is None)

# 6. Expired command -> band rejects, no vibration
old = int(time.time() * 1000) - 10_000
c = httpx.post(f"{B}/api/companion/_test/command", json={"pattern": "rep_pulse", "sessionId": sid,
               "issuedAtMs": old, "ttlMs": 3000}).json()
acks = wait_acks(c["commandId"], "rejected")
check("expired command rejected", any(a.get("reason") == "expired" for a in acks))

# 7. Re-delivered command id -> band rejects the second copy
import uuid as _u; FIXED = f"fixed-{_u.uuid4()}"
c = httpx.post(f"{B}/api/companion/_test/command", json={"pattern": "rep_pulse", "sessionId": sid,
               "commandId": FIXED}).json()
wait_acks(FIXED, "executed")
httpx.post(f"{B}/api/companion/_test/command", json={"pattern": "rep_pulse", "sessionId": sid, "commandId": FIXED})
acks = wait_acks(FIXED, "rejected")
execs = sum(1 for a in acks if a["result"] == "executed")
check("duplicate command id buzzes only once", execs == 1 and any(a.get("reason") == "duplicate" for a in acks))

# 8. Duplicate telemetry (QoS 1 re-delivery) stored once
dup = {"schema": 1, "dev": "cb-01", "boot": "dupboot", "seq": 999, "windowStartMs": 0,
       "windowEndMs": int(time.time() * 1000), "contact": True, "quality": 0.9, "pulseRateBpm": 70}
for _ in range(3):
    subprocess.run(["mosquitto_pub", "-t", "calmband/cb-01/features", "-m", json.dumps(dup), "-q", "1"], check=True)
time.sleep(1)
n = httpx.get(f"{B}/api/companion/_test/windows/dupboot").json()["count"]
check("telemetry delivered 3 times is stored once", n == 1, f"{n} stored")

# 9. Session end -> summary stored, session_complete cue, windows linked
time.sleep(2)
end = {"localSessionId": "local-1", "endReason": "completed", "endedAtMs": int(time.time() * 1000),
       "exercises": [{"exerciseId": "EX_SMILE", "repsCompleted": 5, "meanSymmetryIndex": 0.82,
                      "meanEffortIndex": 0.6, "easeOffCount": 1, "lowQualityFramePct": 0.05}]}
httpx.post(f"{B}/api/companion/sessions/{sid}/end", json=end)
time.sleep(1)
s = next(s for s in httpx.get(f"{B}/api/companion/reviewer/sessions").json() if s["companionSessionId"] == sid)
check("session ended with whitelisted summary", s["state"] == "ended" and s["end"]["exercises"][0]["repsCompleted"] == 5)
check("pulse windows linked to the session", s["featureWindows"] >= 2, f"{s['featureWindows']} windows, {s['usableWindows']} usable")
check("haptic commands executed during session", s["hapticExecuted"] >= 3, f"{s['hapticExecuted']}/{s['hapticCommands']}")

# 10. Contact lost -> status says so and reports NO pulse value (missing != calm)
nocontact = {"schema": 1, "dev": "cb-01", "boot": "ncboot", "seq": 1, "windowStartMs": 0,
             "windowEndMs": int(time.time() * 1000) + 2_000, "clockValid": True, "contact": False, "quality": 0.0,
             "pulseRateBpm": None}
subprocess.run(["mosquitto_pub", "-t", "calmband/cb-01/features", "-m", json.dumps(nocontact), "-q", "1"], check=True)
time.sleep(0.5)
st = httpx.get(f"{B}/api/companion/status").json()
check("contact loss -> contact_required, no value shown", st["state"] == "contact_required" and st["pulseRateBpm"] is None, json.dumps(st))

print(f"\n{sum(ok for _, ok in results)}/{len(results)} checks passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
