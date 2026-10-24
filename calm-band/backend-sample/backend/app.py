"""Calm Band companion backend — SPIKE.

One FastAPI process that (as in plan v5 §8.3):
  * serves the built MirrorWell app (same origin as the API, so the browser never makes an
    off-origin request),
  * receives MirrorWell session events at /api/companion/...,
  * talks MQTT to the band (features/status/events in, cmd out, ack in),
  * maps exercise events to bounded haptic commands with an id + expiry.

Storage is an in-memory dict here; in the real build these writes go to Supabase.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path

import paho.mqtt.client as mqtt
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BROKER_HOST = os.environ.get("MQTT_HOST", "127.0.0.1")
BROKER_PORT = int(os.environ.get("MQTT_PORT", "1883"))
DEVICE_ID = os.environ.get("DEVICE_ID", "cb-01")
DIST = Path(os.environ.get("MIRRORWELL_DIST", "../../MirrorWell/dist")).resolve()
CMD_TTL_MS = int(os.environ.get("CMD_TTL_MS", "3000"))
# Connectivity: no message FROM the band for this long → "stale" (status is retained and the band
# sends a window every 15 s, so 45 s = three missed windows).
STALE_AFTER_MS = int(os.environ.get("STALE_AFTER_MS", "45000"))
# Freshness of the reading itself, judged on the band's own acquisition time (windowEndMs), not
# on when it arrived. A queued window flushed after an outage is real data but not "now".
READING_MAX_AGE_MS = int(os.environ.get("READING_MAX_AGE_MS", "30000"))
# A window whose end time is further than this in the future is a clock error and is ignored.
FUTURE_TOLERANCE_MS = int(os.environ.get("FUTURE_TOLERANCE_MS", "5000"))
USABLE_QUALITY = 0.8
# Pre/post-session pulse: the last clean window ending before the session (within this long)
# and the first clean window starting after it.
PRE_POST_WINDOW_MS = int(os.environ.get("PRE_POST_WINDOW_MS", "300000"))
BAND_TOPICS = ("features", "status", "events", "ack")   # messages that prove the band is alive

# Which MirrorWell event plays which band pattern. Patterns are executed ON the band.
HAPTIC_FOR_EVENT = {
    "rep": "rep_pulse",          # mirrors MirrorWell's existing navigator.vibrate rep pulse
    "ease_off": "ease_off",      # mirrors the existing double pulse (safety-relevant cue)
}

lock = threading.Lock()
db = {
    "sessions": {},        # companionSessionId -> session dict
    "feature_windows": {}, # (device, boot, seq) -> window   (unique key = duplicate guard)
    "commands": {},        # commandId -> command + acks
    "device": {"lastHeardMs": None, "status": None},
}
active_session: dict = {"id": None}


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------- MQTT
mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="calmband-backend")


def on_connect(client, userdata, flags, rc, props=None):
    client.subscribe(f"calmband/{DEVICE_ID}/#", qos=1)


def on_message(client, userdata, msg):
    try:
        body = json.loads(msg.payload)
    except ValueError:
        return
    kind = msg.topic.rsplit("/", 1)[-1]
    if kind not in BAND_TOPICS:
        return  # our own outgoing commands (and test hooks) echo back on the wildcard subscription
    with lock:
        if kind == "status" and body.get("online") is False:
            db["device"]["status"] = body          # Last Will / clean offline: not "heard from"
            return
        db["device"]["lastHeardMs"] = now_ms()
        if kind == "features":
            key = (body["dev"], body["boot"], body["seq"])
            if key in db["feature_windows"]:
                return  # duplicate delivery (QoS 1 can resend) -> ignored
            body["receivedAtMs"] = now_ms()
            # Link to the open session only if the window's own time falls inside it.
            sid = active_session["id"]
            s = db["sessions"].get(sid) if sid else None
            body["companionSessionId"] = sid if s and body["windowEndMs"] >= s["startedAtMs"] else None
            db["feature_windows"][key] = body
        elif kind == "status":
            db["device"]["status"] = body
        elif kind == "ack":
            cmd = db["commands"].get(body.get("commandId"))
            if cmd is not None:
                cmd["acks"].append(body)


mq.on_connect = on_connect
mq.on_message = on_message


def publish_command(pattern: str, session_id: str | None, ttl_ms: int = CMD_TTL_MS,
                    command_id: str | None = None, issued_ms: int | None = None) -> dict:
    issued = issued_ms if issued_ms is not None else now_ms()
    cmd = {
        "commandId": command_id or str(uuid.uuid4()),
        "sessionId": session_id,
        "pattern": pattern,
        "maxDurationMs": 1500,
        "issuedAtMs": issued,
        "expiresAtMs": issued + ttl_ms,
    }
    with lock:
        db["commands"].setdefault(cmd["commandId"], {**cmd, "acks": []})
    # Never retained: a stale motor command must not replay to a band that reconnects later.
    mq.publish(f"calmband/{DEVICE_ID}/cmd", json.dumps(cmd), qos=1, retain=False)
    return cmd


# ---------------------------------------------------------------- HTTP API
app = FastAPI(title="Calm Band companion (spike)")


class StartBody(BaseModel):
    companionSessionId: str
    startedAtMs: int


class EndExercise(BaseModel):
    exerciseId: str
    repsCompleted: int
    meanSymmetryIndex: float | None
    meanEffortIndex: float | None
    easeOffCount: int
    lowQualityFramePct: float


class EndBody(BaseModel):
    localSessionId: str
    endReason: str
    endedAtMs: int
    exercises: list[EndExercise]


@app.on_event("startup")
def _startup():
    mq.connect(BROKER_HOST, BROKER_PORT)
    mq.loop_start()


@app.post("/api/companion/sessions")
def start_session(body: StartBody):
    with lock:
        db["sessions"].setdefault(body.companionSessionId, {
            "id": body.companionSessionId, "startedAtMs": body.startedAtMs, "events": [],
            "seen": set(), "state": "open", "end": None,
        })
        active_session["id"] = body.companionSessionId
    return {"ok": True}


@app.post("/api/companion/sessions/{sid}/events")
def session_event(sid: str, event: dict):
    with lock:
        s = db["sessions"].get(sid)
        if s is None:
            raise HTTPException(404, "unknown session")
        if event.get("seq") in s["seen"]:
            return {"ok": True, "duplicate": True}
        s["seen"].add(event.get("seq"))
        s["events"].append(event)
    pattern = HAPTIC_FOR_EVENT.get(event.get("type"))
    if event.get("type") == "ease_off" and not event.get("active"):
        pattern = None
    cmd = publish_command(pattern, sid) if pattern else None
    return {"ok": True, "command": cmd["commandId"] if cmd else None}


@app.post("/api/companion/sessions/{sid}/end")
def end_session(sid: str, body: EndBody):
    with lock:
        s = db["sessions"].get(sid)
        if s is None:
            raise HTTPException(404, "unknown session")
        s["state"] = "ended"
        s["end"] = body.model_dump()
        s["endedAtMs"] = body.endedAtMs
        if active_session["id"] == sid:
            active_session["id"] = None
    publish_command("session_complete", sid)
    return {"ok": True}


def quality_problems(w: dict) -> list[str]:
    """Why a window cannot be used as a pulse reading ([] = clean). Same rule everywhere."""
    p = []
    if not w.get("contact"):
        p.append("no_contact")
    if w.get("pulseRateBpm") is None:
        p.append("no_pulse")
    if (w.get("quality") or 0) < USABLE_QUALITY:
        p.append("low_quality")
    if w.get("timingGap"):
        p.append("timing_gap")
    if w.get("motionValid") is False:
        p.append("motion_unavailable")
    if w.get("moving"):
        p.append("moving")
    if w.get("motorActive"):
        p.append("vibration_overlap")
    if not w.get("clockValid", True):
        p.append("no_clock")
    return p


def is_clean(w: dict) -> bool:
    return not quality_problems(w)


def plausible_windows(now: int) -> list[dict]:
    """Windows ordered by acquisition time, without ones dated in the future (clock errors)."""
    ws = [w for w in db["feature_windows"].values()
          if isinstance(w.get("windowEndMs"), int) and w["windowEndMs"] <= now + FUTURE_TOLERANCE_MS]
    return sorted(ws, key=lambda w: w["windowEndMs"])


@app.get("/api/companion/status")
def status():
    now = now_ms()
    with lock:
        heard = db["device"]["lastHeardMs"]
        dev_status = db["device"]["status"] or {}
        windows = plausible_windows(now)
        latest = windows[-1] if windows else None
    online = dev_status.get("online")
    connected = online is not False and heard is not None and now - heard < STALE_AFTER_MS
    age = now - latest["windowEndMs"] if latest else None
    problems = quality_problems(latest) if latest else []
    # Order matters: connectivity first, then whether the reading is current, then its quality.
    if online is False:
        state = "offline"
    elif not connected:
        state = "stale"
    elif latest is None:
        state = "collecting"
    elif age > READING_MAX_AGE_MS:
        state = "reading_stale"
    elif "no_contact" in problems:
        state = "contact_required"
    elif problems == ["vibration_overlap"]:
        state = "vibration_overlap"   # cue just played; pulse is withheld, see CONTRACT §4
    elif problems:
        state = "poor_quality"
    else:
        state = "usable"
    return {
        "device": DEVICE_ID,
        "state": state,
        "problems": problems if latest else [],
        # Missing data is reported as missing — never converted into a calm estimate.
        "pulseRateBpm": latest.get("pulseRateBpm") if state == "usable" else None,
        "online": online,
        "lastHeardMs": heard,
        "readingEndMs": latest["windowEndMs"] if latest else None,
        "readingAgeMs": age,
        "sensors": {"pulse": dev_status.get("pulseSensor"), "motion": dev_status.get("motionSensor")},
    }


@app.get("/api/companion/reviewer/sessions")
def reviewer_sessions():
    with lock:
        out = []
        for s in db["sessions"].values():
            linked = [w for w in db["feature_windows"].values() if w.get("companionSessionId") == s["id"]]
            usable = [w for w in linked if is_clean(w)]
            # Vibration policy (Phase 1): cues are frequent during reps, so in-session windows are
            # mostly vibration-overlapped and are NOT used as pulse readings. The comparison is
            # a clean reading just before the session and the first clean one after it.
            allw = plausible_windows(now_ms())
            start, end = s["startedAtMs"], s.get("endedAtMs")
            pre = [w for w in allw if is_clean(w) and start - PRE_POST_WINDOW_MS <= w["windowEndMs"] <= start]
            post = [w for w in allw if end is not None and is_clean(w)
                    and end <= w["windowStartMs"] <= end + PRE_POST_WINDOW_MS]
            cmds = [c for c in db["commands"].values() if c["sessionId"] == s["id"]]
            out.append({
                "companionSessionId": s["id"],
                "state": s["state"],
                "events": len(s["events"]),
                "end": s["end"],
                "featureWindows": len(linked),
                "usableWindows": len(usable),
                "vibrationOverlapWindows": sum(1 for w in linked if w.get("motorActive")),
                "prePulseBpm": pre[-1]["pulseRateBpm"] if pre else None,
                "postPulseBpm": post[0]["pulseRateBpm"] if post else None,
                "hapticCommands": len(cmds),
                "hapticExecuted": sum(1 for c in cmds if any(a["result"] == "executed" for a in c["acks"])),
            })
    return out


# Test-only hooks to exercise the band's duplicate/expiry rules.
@app.post("/api/companion/_test/command")
def test_command(body: dict):
    cmd = publish_command(body["pattern"], body.get("sessionId"), ttl_ms=body.get("ttlMs", CMD_TTL_MS),
                          command_id=body.get("commandId"), issued_ms=body.get("issuedAtMs"))
    return cmd


@app.get("/api/companion/_test/windows/{boot}")
def test_windows(boot: str):
    with lock:
        return {"count": sum(1 for k in db["feature_windows"] if k[1] == boot)}


@app.get("/api/companion/_test/command/{cid}")
def test_command_acks(cid: str):
    with lock:
        return db["commands"].get(cid, {})


# ---------------------------------------------------------------- MirrorWell app (same origin)
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")
    for sub in ("wasm", "models"):
        if (DIST / sub).exists():
            app.mount(f"/{sub}", StaticFiles(directory=DIST / sub), name=sub)

    @app.get("/{path:path}")
    def spa(path: str):
        candidate = DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
