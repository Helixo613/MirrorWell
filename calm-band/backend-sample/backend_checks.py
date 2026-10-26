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
check("missing motion data → sensor_missing + motion_unavailable, sensor shown missing",
      st["state"] == "sensor_missing" and "motion_unavailable" in st["problems"] and st["sensors"]["motion"] == "missing"
      and st["pulseRateBpm"] is None,
      f"{st['problems']} sensors {st['sensors']}")

# 7. A window dated in the future (device clock error) is ignored
pub("status", {"dev": DEV, "boot": "chk", "online": True, "clockValid": True, "pulseSensor": "ok",
               "motionSensor": "ok"}, retain=True)
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

# 10. The band reboots and reports both sensors missing: the previous boot's recent readings
#     must not be shown as current (they stay stored as history).
old_boot_windows = s["featureWindows"]
pub("features", window(now() + 60))          # a fresh, clean reading from the OLD boot "chk"
st = status()
check("(setup) old boot reading is usable before the reboot", st["state"] == "usable", st["state"])
pub("status", {"dev": DEV, "boot": "new1", "online": True, "clockValid": True, "droppedWindows": 0,
               "publishFailures": 0, "pulseSensor": "missing", "motionSensor": "missing"}, retain=True)
st = status()
check("new boot with both sensors missing → sensor_missing, no pulse (old boot's 70 bpm not shown)",
      st["state"] == "sensor_missing" and st["pulseRateBpm"] is None and st["boot"] == "new1",
      f"{st['state']} {st['problems']} boot {st['boot']}")
pub("status", {"dev": DEV, "boot": "new1", "online": True, "clockValid": True, "pulseSensor": "ok",
               "motionSensor": "ok"}, retain=True)
st = status()
check("new boot, sensors ok, no reading from it yet → collecting (old readings ignored)",
      st["state"] == "collecting" and st["pulseRateBpm"] is None, st["state"])
s2 = next(x for x in httpx.get(f"{B}/api/companion/reviewer/sessions").json() if x["companionSessionId"] == sid)
check("old boot's readings kept as history", s2["featureWindows"] == old_boot_windows, f"{s2['featureWindows']} windows")
w = window(now() + 70); w["boot"] = "new1"
pub("features", w)
st = status()
check("first reading from the new boot → usable", st["state"] == "usable" and st["pulseRateBpm"] == 70.0, st["state"])

# 11. Malformed telemetry is rejected without stopping reception
before = st["rejectedMessages"]
bad = ["{}", "[]", '"text"', "5", "null", "not json at all", '{"dev":"%s","boot":"new1","seq":"7"}' % DEV,
       json.dumps({**window(now() + 80), "boot": "new1", "quality": "high"}),
       json.dumps({**window(now() + 80), "boot": "new1", "contact": None}),
       json.dumps({**window(now() + 80), "boot": "new1", "windowEndMs": 5, "windowStartMs": 10}),
       json.dumps({**window(now() + 80), "dev": "someone-else"})]
for text in bad:
    subprocess.run(["mosquitto_pub", "-t", f"calmband/{DEV}/features", "-q", "1", "-m", text], check=True)
for kind, text in (("status", "{}"), ("status", '{"online":"yes"}'), ("ack", "[]"), ("events", "{}")):
    subprocess.run(["mosquitto_pub", "-t", f"calmband/{DEV}/{kind}", "-q", "1", "-m", text], check=True)
st = status(0.8)
check("15 malformed messages rejected and counted", st["rejectedMessages"] - before == 15,
      f"{st['rejectedMessages'] - before} rejected, last: {st['lastRejectReason']}")
check("state unchanged by malformed messages", st["state"] == "usable" and st["boot"] == "new1", st["state"])
w = window(now() + 90, pulseRateBpm=66.0); w["boot"] = "new1"
pub("features", w)
st = status()
check("reception still works after malformed messages", st["pulseRateBpm"] == 66.0, f"{st['pulseRateBpm']} bpm")

# 12. Values of the wrong TYPE where a set is expected, and non-finite numbers
before = st["rejectedMessages"]
raw = [("status", '{"online": true, "pulseSensor": []}'),
       ("status", '{"online": true, "motionSensor": {}}'),
       ("ack", '{"commandId": "x", "result": []}'),
       ("ack", '{"commandId": "x", "result": "executed", "reason": 5}'),
       ("events", '{"type": "contact", "detail": [], "atMs": 1}'),
       ("features", json.dumps({**window(now() + 95), "boot": "new1"}).replace('"pulseRateBpm": 70.0', '"pulseRateBpm": NaN')),
       ("features", json.dumps({**window(now() + 95), "boot": "new1"}).replace('"pulseRateBpm": 70.0', '"pulseRateBpm": Infinity')),
       ("features", json.dumps({**window(now() + 95), "boot": "new1"}).replace('"pulseRateBpm": 70.0', '"pulseRateBpm": 1e999')),
       ("features", '[' * 5000 + ']' * 5000)]
for kind, text in raw:
    subprocess.run(["mosquitto_pub", "-t", f"calmband/{DEV}/{kind}", "-q", "1", "-m", text], check=True)
time.sleep(0.8)
r = httpx.get(f"{B}/api/companion/status")
st = r.json()
check("9 wrong-type / non-finite / deeply nested messages rejected, none raised",
      r.status_code == 200 and st["rejectedMessages"] - before == 9, f"{st['rejectedMessages'] - before} rejected")
check("status still serialisable and unchanged (no NaN stored)", st["state"] == "usable" and st["pulseRateBpm"] == 66.0,
      f"{st['state']} {st['pulseRateBpm']}")
check("sensor health not overwritten by bad status", st["sensors"] == {"pulse": "ok", "motion": "ok"}, str(st["sensors"]))

# 13. Immediate contact, separate from the 60 s window
pub("events", {"dev": DEV, "boot": "new1", "type": "contact", "detail": "off", "atMs": now()})
st = status()
check("finger off event → contact_required at once, though the last window was clean",
      st["state"] == "contact_required" and st["contact"] is False and st["pulseRateBpm"] is None, st["state"])
on_at = now()
pub("events", {"dev": DEV, "boot": "new1", "type": "contact", "detail": "on", "atMs": on_at})
w = window(now() + 100, contact=False, quality=0.0, pulseRateBpm=None); w["boot"] = "new1"
pub("features", w)
st = status()
check("finger back but no clean window yet → settling (not usable)", st["state"] == "settling" and st["contact"] is True,
      st["state"])
pub("events", {"dev": DEV, "boot": "old0", "type": "contact", "detail": "off", "atMs": now()})
w = window(now() + 110); w["boot"] = "new1"; w["windowStartMs"] = on_at + 1   # starts after the restoration
pub("features", w)
st = status()
check("contact event from an older boot ignored; clean window → usable", st["state"] == "usable", st["state"])

# 14. A window delivered late (queued offline) still belongs to its session, by its own time
sid2 = f"cs-{uuid.uuid4().hex[:8]}"
t0 = now() - 100_000
httpx.post(f"{B}/api/companion/sessions", json={"companionSessionId": sid2, "startedAtMs": t0})
httpx.post(f"{B}/api/companion/sessions/{sid2}/end", json={"localSessionId": "l2", "endReason": "completed",
           "endedAtMs": t0 + 70_000, "exercises": []})
late = window(t0 + 65_000, motorActive=True); late["boot"] = "new1"
pub("features", late)                         # arrives AFTER the session ended
time.sleep(0.5)
s3 = next(x for x in httpx.get(f"{B}/api/companion/reviewer/sessions").json() if x["companionSessionId"] == sid2)
check("late-delivered window linked to its session by timestamp", s3["featureWindows"] >= 1 and s3["vibrationOverlapWindows"] >= 1,
      f"{s3['featureWindows']} linked")

# 15. Contact restored with NO new window: the old pulse must not come back (regression)
def contact(detail, at):
    pub("events", {"dev": DEV, "boot": "new1", "type": "contact", "detail": detail, "atMs": at})

def win(start, end, bpm):
    w = window(end, pulseRateBpm=bpm); w["boot"] = "new1"; w["windowStartMs"] = start
    return w

T = now()                                     # short windows so every time stays ≤ now + 5 s
pub("features", win(T - 1000, T + 500, 72.0))
st = status()
check("(setup) clean 72 bpm window → usable", st["state"] == "usable" and st["pulseRateBpm"] == 72.0, st["state"])
contact("off", T + 600)
st = status()
check("finger off → contact_required, pulse hidden", st["state"] == "contact_required" and st["pulseRateBpm"] is None, st["state"])
contact("on", T + 1500)
st = status()
check("finger back, no new window → settling, old 72 bpm NOT shown", st["state"] == "settling" and st["pulseRateBpm"] is None,
      f"{st['state']} {st['pulseRateBpm']} {st['problems']}")
pub("features", win(T - 500, T + 1600, 73.0))   # clean flags, but started before the restoration
st = status()
check("clean window that started before the restoration → still settling", st["state"] == "settling", st["state"])
pub("features", win(T + 1600, T + 4000, 74.0))
st = status()
check("first clean window starting after the restoration → usable, new value", st["state"] == "usable" and st["pulseRateBpm"] == 74.0,
      f"{st['state']} {st['pulseRateBpm']}")
contact("off", T + 5200); contact("on", T + 5600)  # brief removal AFTER that window ended (no overlap)
st = status()
check("window that ended before a brief removal → settling afterwards (not usable again)",
      st["state"] == "settling" and st["pulseRateBpm"] is None, st["state"])

# 16. Same eligibility for before/after: a "before" window overlapping a finger-off period is skipped
sid4 = f"cs-{uuid.uuid4().hex[:8]}"
base = now() - 500_000
w = window(base, pulseRateBpm=81.0); w["boot"] = "new1"; pub("features", w)              # clean, early
w = window(base + 30_000, pulseRateBpm=99.0); w["boot"] = "new1"; pub("features", w)     # clean flags, but…
contact("off", base + 10_000); contact("on", base + 12_000)                              # …finger was off inside it
time.sleep(0.4)
httpx.post(f"{B}/api/companion/sessions", json={"companionSessionId": sid4, "startedAtMs": base + 31_000})
httpx.post(f"{B}/api/companion/sessions/{sid4}/end", json={"localSessionId": "l4", "endReason": "completed",
           "endedAtMs": base + 40_000, "exercises": []})
time.sleep(0.4)
s4 = next(x for x in httpx.get(f"{B}/api/companion/reviewer/sessions").json() if x["companionSessionId"] == sid4)
check("'before' pulse skips a window that overlapped a finger-off period", s4["prePulseBpm"] == 81.0, f"pre {s4['prePulseBpm']}")

pub("status", None, retain=True)             # leave no retained state behind
print(f"\n{sum(results)}/{len(results)} backend checks passed")
sys.exit(0 if all(results) else 1)
