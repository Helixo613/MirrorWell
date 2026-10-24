"""Backend status and freshness checks (no band needed; windows are injected over MQTT).

Run against its OWN backend instance on a separate device id, so nothing else publishes:
    DEVICE_ID=cb-check uvicorn app:app --port 8001     (from backend-sample/backend)
    BACKEND_URL=http://127.0.0.1:8001 DEVICE_ID=cb-check python3 backend_checks.py

Covers the review findings: an old reading must not count as current, our own outgoing
commands must not count as "heard from the band", online:false must win, and vibration /
timing-gap / missing-motion flags must stop a reading from being called usable.
"""
import json
import os
import subprocess
import sys
import time
import uuid

import httpx

B = os.environ.get("BACKEND_URL", "http://127.0.0.1:8001")
DEV = os.environ.get("DEVICE_ID", "cb-check")
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}", flush=True)


def pub(kind, body, retain=False):
    args = ["mosquitto_pub", "-t", f"calmband/{DEV}/{kind}", "-q", "1"]
    if retain:
        args.append("-r")
    if body is None:
        args += ["-n"]                       # empty payload (clears a retained message)
    else:
        args += ["-m", json.dumps(body)]
    subprocess.run(args, check=True)


seq = 0


def window(end_ms, **over):
    global seq
    seq += 1
    w = {"schema": 1, "dev": DEV, "boot": "chk", "seq": seq, "origin": "replay",
         "windowStartMs": end_ms - 60_000, "windowEndMs": end_ms, "clockValid": True,
         "contact": True, "quality": 1.0, "pulseRateBpm": 70.0, "pulseRateSdBpm": 1.0,
         "validBeatFraction": 1.0, "validIbis": 70, "motionValid": True, "motionCoverage": 1.0,
         "motionRms_g": 0.01, "motionMax_g": 0.02, "moving": False, "motorActive": False,
         "timingGap": False}
    w.update(over)
    return w


def status(wait=0.4):
    time.sleep(wait)
    return httpx.get(f"{B}/api/companion/status").json()


now = lambda: int(time.time() * 1000)
pub("status", None, retain=True)             # start from a clean retained state
time.sleep(0.5)

# 1. Our own outgoing command must not make the band look alive
httpx.post(f"{B}/api/companion/_test/command", json={"pattern": "rep_pulse"})
st = status()
check("outgoing command does not refresh 'last heard'", st["lastHeardMs"] is None and st["state"] == "stale",
      f"state {st['state']}, lastHeard {st['lastHeardMs']}")

# 2. A ten-minute-old reading (with motor + timing-gap flags) is not current
pub("features", window(now() - 600_000, motorActive=True, timingGap=True))
st = status()
check("10-minute-old reading → reading_stale, no pulse", st["state"] == "reading_stale" and st["pulseRateBpm"] is None,
      f"{st['state']}, age {st['readingAgeMs']} ms")

# 3. Fresh clean reading → usable
pub("features", window(now()))
st = status()
check("fresh clean reading → usable with a pulse value", st["state"] == "usable" and st["pulseRateBpm"] == 70.0, st["state"])

# 4. Vibration overlap → withheld
pub("features", window(now() + 10, motorActive=True))
st = status()
check("reading overlapping a vibration → vibration_overlap, no pulse",
      st["state"] == "vibration_overlap" and st["pulseRateBpm"] is None, f"{st['state']} {st['problems']}")

# 5. Timing gap → not usable
pub("features", window(now() + 20, timingGap=True))
st = status()
check("timing gap → poor_quality", st["state"] == "poor_quality" and "timing_gap" in st["problems"], str(st["problems"]))

# 6. Motion sensor missing → not usable, reported
pub("status", {"dev": DEV, "boot": "chk", "online": True, "clockValid": True, "droppedWindows": 0,
               "publishFailures": 0, "pulseSensor": "ok", "motionSensor": "missing"}, retain=True)
pub("features", window(now() + 30, motionValid=False, motionCoverage=0.0, motionRms_g=None, motionMax_g=None,
                       moving=None, quality=0.5))
st = status()
check("missing motion data → poor_quality + motion_unavailable, sensor shown missing",
      st["state"] == "poor_quality" and "motion_unavailable" in st["problems"] and st["sensors"]["motion"] == "missing",
      f"{st['problems']} sensors {st['sensors']}")

# 7. A window dated in the future (device clock error) is ignored
pub("features", window(now() + 30_000 + 600_000, contact=False, quality=0.0, pulseRateBpm=None))
pub("features", window(now() + 40))
st = status()
check("future-dated window ignored; latest real one used", st["state"] == "usable", st["state"])

# 8. online:false wins over a fresh, clean reading
pub("status", {"dev": DEV, "online": False}, retain=True)
st = status()
check("online:false → offline, no pulse even with a fresh clean reading",
      st["state"] == "offline" and st["pulseRateBpm"] is None, st["state"])
pub("status", {"dev": DEV, "boot": "chk", "online": True, "clockValid": True, "pulseSensor": "ok",
               "motionSensor": "ok"}, retain=True)
pub("features", window(now() + 50))
st = status()
check("back online → usable again", st["state"] == "usable", st["state"])

# 9. Vibration policy: pulse comes from clean windows just before and just after the session
sid = f"cs-{uuid.uuid4().hex[:8]}"
start = now() - 200_000                      # whole scenario in the recent past (no future dates)
pub("features", window(start - 2000, pulseRateBpm=80.0))
time.sleep(0.3)
httpx.post(f"{B}/api/companion/sessions", json={"companionSessionId": sid, "startedAtMs": start})
for i in range(3):
    pub("features", window(start + 5000 * (i + 1), motorActive=True, pulseRateBpm=90.0))
end = start + 20_000
time.sleep(0.3)
httpx.post(f"{B}/api/companion/sessions/{sid}/end", json={"localSessionId": "l", "endReason": "completed",
           "endedAtMs": end, "exercises": []})
w_after = window(end + 61_000, pulseRateBpm=74.0)
w_after["windowStartMs"] = end + 1000
pub("features", w_after)
time.sleep(0.5)
s = next(x for x in httpx.get(f"{B}/api/companion/reviewer/sessions").json() if x["companionSessionId"] == sid)
check("in-session vibration windows counted, not used as readings",
      s["vibrationOverlapWindows"] == 3 and s["usableWindows"] == 0, f"{s['vibrationOverlapWindows']} overlap, {s['usableWindows']} usable")
check("pre- and post-session clean pulse reported", s["prePulseBpm"] == 80.0 and s["postPulseBpm"] == 74.0,
      f"pre {s['prePulseBpm']} post {s['postPulseBpm']}")

pub("status", None, retain=True)             # leave no retained state behind
print(f"\n{sum(results)}/{len(results)} backend checks passed")
sys.exit(0 if all(results) else 1)
