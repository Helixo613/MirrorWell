"""Firmware behaviour checks against the simulated ESP32 (host/calm_band_sim).
Needs: mosquitto on :1883, backend on :8000, calm_band_sim running with WINDOW_MS=5000 HOP_MS=1000.
"""
import json
import sys
import threading
import time
import uuid

import httpx
import paho.mqtt.client as mqtt

B, DEV = "http://127.0.0.1:8000", "cb-01"
results = []
features, acks = [], []
lock = threading.Lock()


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}", flush=True)


def on_msg(c, u, m):
    if not (m.topic.endswith("/features") or m.topic.endswith("/ack")):
        return                       # cmd/sim/status echoes (some tests send deliberately broken text)
    body = json.loads(m.payload)
    with lock:
        if m.topic.endswith("/features"):
            features.append((time.time() * 1000, body))
        elif m.topic.endswith("/ack"):
            acks.append(body)


cli = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"scenario-{uuid.uuid4().hex[:6]}")
cli.on_message = on_msg
cli.connect("127.0.0.1", 1883)
cli.subscribe(f"calmband/{DEV}/#", qos=1)
cli.loop_start()


def sim(payload):
    cli.publish(f"calmband/{DEV}/sim", json.dumps(payload), qos=1)


def command(pattern, ttl_ms=3000, issued=None):
    return httpx.post(f"{B}/api/companion/_test/command",
                      json={"pattern": pattern, "ttlMs": ttl_ms, "issuedAtMs": issued}).json()["commandId"]


def acks_for(cid, wait=4.0):
    end = time.time() + wait
    while time.time() < end:
        with lock:
            a = [x for x in acks if x["commandId"] == cid]
        if any(x["result"] in ("executed", "rejected", "stopped") for x in a):
            time.sleep(0.3)
            with lock:
                return [x for x in acks if x["commandId"] == cid]
        time.sleep(0.05)
    with lock:
        return [x for x in acks if x["commandId"] == cid]


def latest_feature(after_ms):
    end = time.time() + 4
    while time.time() < end:
        with lock:
            fs = [f for (rx, f) in features if rx > after_ms]
        if fs:
            return fs[-1]
        time.sleep(0.1)
    return None


time.sleep(1.5)

# 1. Normal window shape
f = latest_feature(0)
check("live window has the agreed fields", f is not None and all(k in f for k in (
    "schema", "dev", "boot", "seq", "origin", "windowStartMs", "windowEndMs", "clockValid",
    "contact", "quality", "pulseRateBpm", "validBeatFraction", "motionRms_g", "motorActive")),
    f"pulse {f and f['pulseRateBpm']} bpm, quality {f and f['quality']}, origin {f and f['origin']}")
check("window is 60 s → here 5 s test window; end − start matches", f and f["windowEndMs"] - f["windowStartMs"] == 5000)

# 2. Arm movement → moving flag, quality capped, status poor_quality
sim({"moving": True}); time.sleep(5.5)
f = latest_feature(time.time() * 1000 - 800)
st = httpx.get(f"{B}/api/companion/status").json()
check("movement flagged in the window", f and f["moving"] and f["quality"] <= 0.5, f"rms {f and f['motionRms_g']} g, quality {f and f['quality']}")
check("status shows poor_quality while moving", st["state"] == "poor_quality", st["state"])
sim({"moving": False}); time.sleep(5.5)

# 3. Contact loss on the live band → null pulse, then recovers when the finger returns
sim({"contact": False}); time.sleep(5.5)
f = latest_feature(time.time() * 1000 - 800)
check("finger removed → contact false, pulseRateBpm null", f and f["contact"] is False and f["pulseRateBpm"] is None)
sim({"contact": True}); time.sleep(6)
f = latest_feature(time.time() * 1000 - 800)
check("finger back → pulse value returns", f and f["contact"] and f["pulseRateBpm"] is not None, f"{f and f['pulseRateBpm']} bpm")

# 4. Local STOP during a pattern → motor off, ack 'stopped', never 'executed'
cid = command("session_complete")
time.sleep(0.25)
sim({"button": "stop"})
a = acks_for(cid)
res = [x["result"] for x in a]
check("STOP interrupts session_complete", "stopped" in res and "executed" not in res, ",".join(res))

# 5. Motor activity is flagged in the windows that overlap it
cid = command("rep_pulse")
acks_for(cid)
time.sleep(1.5)
with lock:
    recent = [f for (rx, f) in features[-3:]]
check("window overlapping a vibration has motorActive=true", any(f["motorActive"] for f in recent))

# 6. Clock lost → commands rejected 'no_clock' and no windows published
sim({"clockValid": False}); time.sleep(0.5)
n_before = len(features)
cid = command("rep_pulse")
a = acks_for(cid)
time.sleep(3)
check("no valid clock → command rejected no_clock", any(x.get("reason") == "no_clock" for x in a))
check("no valid clock → no windows published", len(features) == n_before, f"{len(features) - n_before} published")
sim({"clockValid": True}); time.sleep(1.5)

# 7. Network drop: windows queued with original timestamps, flushed in order; stale command not replayed
with lock:
    last_seq = features[-1][1]["seq"]
drop_start = time.time() * 1000
sim({"offlineMs": 6000})
time.sleep(1.0)
stale = command("rep_pulse", ttl_ms=2000)        # sent while the band is offline
time.sleep(7.5)
with lock:
    after = [(rx, f) for (rx, f) in features if f["seq"] > last_seq]
seqs = [f["seq"] for _, f in after]
queued = [(rx, f) for rx, f in after if rx - f["windowEndMs"] > 1500]
check("windows made offline were delivered after reconnect", len(queued) >= 4, f"{len(queued)} queued windows")
check("queued windows kept their original timestamps",
      all(f["windowEndMs"] < rx - 1500 and f["windowEndMs"] >= drop_start for rx, f in queued))
check("no sequence gaps, delivered in order", seqs == list(range(seqs[0], seqs[0] + len(seqs))) if seqs else False,
      f"seq {seqs[:3]}…{seqs[-2:]}" if seqs else "none")
a = acks_for(stale, wait=1.0)
check("command sent while offline never buzzes after reconnect", not any(x["result"] == "executed" for x in a),
      ",".join(x["result"] for x in a) or "never delivered")

# 8. Command validation on the band: broken JSON, missing issue time, ancient issue time, long duration
def raw_cmd(text):
    cli.publish(f"calmband/{DEV}/cmd", text, qos=1)

cid = f"raw-{uuid.uuid4().hex[:8]}"
now_ms = int(time.time() * 1000)
raw_cmd(json.dumps({"commandId": cid, "pattern": "rep_pulse", "expiresAtMs": now_ms + 3000}))
a = acks_for(cid, wait=2)
check("command without issuedAtMs → rejected malformed", any(x.get("reason") == "malformed" for x in a),
      ",".join(f"{x['result']}/{x.get('reason')}" for x in a) or "no ack")
cid = f"raw-{uuid.uuid4().hex[:8]}"
raw_cmd('{"commandId":"%s","pattern":"rep_pulse","issuedAtMs":%d,"expiresAtMs":%d} junk' % (cid, now_ms, now_ms + 3000))
a = acks_for(cid, wait=2)
check("non-JSON command never buzzes", not any(x["result"] in ("accepted", "executed") for x in a),
      ",".join(x["result"] for x in a) or "ignored")
cid = command("rep_pulse", ttl_ms=86_400_000 + 3000, issued=int(time.time() * 1000) - 86_400_000)
a = acks_for(cid, wait=2)
check("ancient issuedAtMs with future expiry → rejected bad_time", any(x.get("reason") == "bad_time" for x in a),
      ",".join(f"{x['result']}/{x.get('reason')}" for x in a))
cid = f"raw-{uuid.uuid4().hex[:8]}"
now_ms = int(time.time() * 1000)
raw_cmd(json.dumps({"commandId": cid, "pattern": "rep_pulse", "maxDurationMs": 9000, "issuedAtMs": now_ms,
                    "expiresAtMs": now_ms + 3000}))
a = acks_for(cid, wait=2)
check("maxDurationMs above the 1500 ms cap → rejected bad_duration", any(x.get("reason") == "bad_duration" for x in a))

# 9. Motion sensor failure is reported, not read as "still"
status_msgs = []
def on_status(c, u, m):
    if m.topic.endswith("/status"):
        status_msgs.append(json.loads(m.payload))
cli.message_callback_add(f"calmband/{DEV}/status", on_status)
sim({"motionSensor": False}); time.sleep(6)
f = latest_feature(time.time() * 1000 - 800)
check("motion sensor lost → window motionValid false, motion null, quality ≤ 0.5",
      f and f.get("motionValid") is False and f.get("motionRms_g") is None and f["quality"] <= 0.5,
      f"motionValid {f and f.get('motionValid')}, quality {f and f['quality']}")
check("motion sensor lost → status reports motionSensor missing",
      any(s.get("motionSensor") == "missing" for s in status_msgs))
st = httpx.get(f"{B}/api/companion/status").json()
check("backend does not call it usable", st["state"] == "poor_quality" and "motion_unavailable" in st["problems"], st["state"])
sim({"motionSensor": True}); time.sleep(6)
f = latest_feature(time.time() * 1000 - 800)
check("motion sensor back → motionValid true again", f and f.get("motionValid") is True)

print(f"\n{sum(results)}/{len(results)} firmware checks passed")
sys.exit(0 if all(results) else 1)
