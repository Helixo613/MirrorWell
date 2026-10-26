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
import math
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
# The band reports contact changes after they have held for 1 s, so a finger-off period really
# began up to this long before the "off" event's time.
CONTACT_DEBOUNCE_MS = int(os.environ.get("CONTACT_DEBOUNCE_MS", "1000"))
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
    "device": {"lastHeardMs": None, "status": None, "boot": None, "contact": None},
    # Finger-off periods from the band's contact events, in band time: [{"boot","offMs","onMs"}]
    # (onMs None while still off). Any window overlapping one is not a clean reading.
    "contactLoss": [],
    "rejected": {"count": 0, "last": None},   # band messages that failed validation
}
active_session: dict = {"id": None}


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------- MQTT
mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="calmband-backend")


def on_connect(client, userdata, flags, rc, props=None):
    client.subscribe(f"calmband/{DEVICE_ID}/#", qos=1)


# ---------------------------------------------------------------- message validation
# Every band message is checked BEFORE it touches state. A bad message is counted and dropped;
# it can never raise inside the MQTT callback (which would stop reception).
SENSOR_STATES = {"ok", "missing", "simulated"}
ACK_RESULTS = {"accepted", "executed", "rejected", "stopped"}


def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _num(v):
    # finite only: NaN / Infinity would pass a range check and then break JSON responses
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _str_in(v, allowed) -> bool:
    return isinstance(v, str) and v in allowed   # type first: [] or {} in a set raises TypeError


FEATURE_REQUIRED = {"dev": str, "boot": str, "seq": _int, "windowStartMs": _int, "windowEndMs": _int,
                    "contact": bool, "quality": _num}
FEATURE_OPTIONAL = {"schema": _int, "origin": str, "clockValid": bool, "validBeatFraction": _num,
                    "validIbis": _int, "motionValid": bool, "motionCoverage": _num, "motorActive": bool,
                    "timingGap": bool,
                    # may be null:
                    "pulseRateBpm": (_num, None), "pulseRateSdBpm": (_num, None),
                    "motionRms_g": (_num, None), "motionMax_g": (_num, None), "moving": (bool, None)}


def _ok(value, rule) -> bool:
    if isinstance(rule, tuple):
        return value is None or _ok(value, rule[0])
    if rule in (str, bool):
        return isinstance(value, rule)
    return rule(value)


def validate(kind: str, body) -> str | None:
    """Returns why the message is invalid, or None if it can be used."""
    if not isinstance(body, dict):
        return "not an object"
    if "dev" in body and not (isinstance(body["dev"], str) and body["dev"] == DEVICE_ID):
        return "wrong device"
    if kind == "features":
        for k, rule in FEATURE_REQUIRED.items():
            if k not in body or not _ok(body[k], rule):
                return f"bad or missing {k}"
        for k, rule in FEATURE_OPTIONAL.items():
            if k in body and not _ok(body[k], rule):
                return f"bad {k}"
        if not body["boot"] or len(body["boot"]) > 16 or body["seq"] < 0:
            return "bad boot/seq"
        if body["windowEndMs"] <= body["windowStartMs"]:
            return "window ends before it starts"
        if not 0 <= body["quality"] <= 1:
            return "quality out of range"
    elif kind == "status":
        if not isinstance(body.get("online"), bool):
            return "bad or missing online"
        if "boot" in body and not (isinstance(body["boot"], str) and 0 < len(body["boot"]) <= 16):
            return "bad boot"
        for k in ("pulseSensor", "motionSensor"):
            if k in body and not _str_in(body[k], SENSOR_STATES):
                return f"bad {k}"
        for k in ("droppedWindows", "publishFailures"):
            if k in body and not _int(body[k]):
                return f"bad {k}"
    elif kind == "ack":
        if not isinstance(body.get("commandId"), str) or not _str_in(body.get("result"), ACK_RESULTS):
            return "bad commandId/result"
        if body.get("reason") is not None and not isinstance(body["reason"], str):
            return "bad reason"
    elif kind == "events":
        if not isinstance(body.get("type"), str):
            return "bad type"
        if "detail" in body and not isinstance(body["detail"], str):
            return "bad detail"
        if body["type"] == "contact" and not (_str_in(body.get("detail"), {"on", "off"}) and _int(body.get("atMs"))):
            return "bad contact event"
    return None


def _reject(reason: str):
    with lock:
        db["rejected"]["count"] += 1
        db["rejected"]["last"] = reason


def _no_constants(name):
    raise ValueError(f"{name} is not valid JSON")       # json.loads would otherwise accept NaN/Infinity


def on_message(client, userdata, msg):
    # ONE error boundary around parse, validation and storage: no message can stop reception.
    kind = "?"
    try:
        kind = msg.topic.rsplit("/", 1)[-1]
        if kind not in BAND_TOPICS:
            return  # our own outgoing commands (and test hooks) echo back on the wildcard subscription
        if not msg.payload:
            return  # an empty retained message is how a retained status is cleared
        try:
            body = json.loads(msg.payload, parse_constant=_no_constants)
        except (ValueError, UnicodeDecodeError, RecursionError):
            _reject(f"{kind}: not JSON")
            return
        why = validate(kind, body)
        if why:
            _reject(f"{kind}: {why}")
            return
        _store(kind, body)
    except Exception as e:  # anything unexpected is counted, never raised into the MQTT loop
        _reject(f"{kind}: {type(e).__name__}")


def _store(kind: str, body: dict):
    with lock:
        if kind == "status" and body.get("online") is False:
            prev = db["device"]["status"] or {}
            # Last Will / clean offline: not "heard from". Keep the last known sensor health.
            db["device"]["status"] = {**{k: prev[k] for k in ("pulseSensor", "motionSensor") if k in prev}, **body}
            return
        db["device"]["lastHeardMs"] = now_ms()
        if kind == "features":
            key = (body["dev"], body["boot"], body["seq"])
            if key in db["feature_windows"]:
                return  # duplicate delivery (QoS 1 can resend) -> ignored
            body["receivedAtMs"] = now_ms()
            # Session association is by the window's own time (see session_windows), so a window
            # queued offline and delivered after the session ended still belongs to it.
            db["feature_windows"][key] = body
        elif kind == "status":
            db["device"]["status"] = body
            if body.get("boot"):
                db["device"]["boot"] = body["boot"]   # the band's current boot (it announces it on connect)
        elif kind == "events" and body["type"] == "contact":
            # Immediate finger on/off from the band (debounced ~1 s), separate from the 60 s windows.
            on = body["detail"] == "on"
            db["device"]["contact"] = {"on": on, "atMs": body["atMs"], "boot": body.get("boot")}
            losses = db["contactLoss"]
            open_loss = next((x for x in reversed(losses) if x["onMs"] is None and x["boot"] == body.get("boot")), None)
            if not on and open_loss is None:
                losses.append({"boot": body.get("boot"), "offMs": body["atMs"] - CONTACT_DEBOUNCE_MS, "onMs": None})
                del losses[:-200]                     # bounded history
            elif on and open_loss is not None:
                open_loss["onMs"] = body["atMs"]      # restored: only windows starting after this are clean
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
    if overlaps_contact_loss(w):
        p.append("contact_interrupted")
    return p


def overlaps_contact_loss(w: dict) -> bool:
    """True if the finger was off at any point the window covers (per the band's contact
    events). So after the finger returns, only a window that STARTS after the restoration
    counts — an older clean window can't come back as the current reading."""
    for x in db["contactLoss"]:
        if x["boot"] is not None and w.get("boot") != x["boot"]:
            continue
        on = x["onMs"] if x["onMs"] is not None else float("inf")
        if w["windowStartMs"] < on and w["windowEndMs"] > x["offMs"]:
            return True
    return False


def is_clean(w: dict) -> bool:
    return not quality_problems(w)


def plausible_windows(now: int, boot: str | None = None) -> list[dict]:
    """Windows ordered by acquisition time, without ones dated in the future (clock errors).
    With boot, only that boot's windows (older boots stay stored as history)."""
    ws = [w for w in db["feature_windows"].values()
          if w["windowEndMs"] <= now + FUTURE_TOLERANCE_MS and (boot is None or w["boot"] == boot)]
    return sorted(ws, key=lambda w: w["windowEndMs"])


def current_boot(now: int) -> str | None:
    """The boot the band announced in its latest status; before any status, the newest window's."""
    if db["device"]["boot"]:
        return db["device"]["boot"]
    ws = plausible_windows(now)
    return ws[-1]["boot"] if ws else None


@app.get("/api/companion/status")
def status():
    now = now_ms()
    with lock:
        heard = db["device"]["lastHeardMs"]
        dev_status = db["device"]["status"] or {}
        boot = current_boot(now)
        windows = plausible_windows(now, boot)       # current boot only
        latest = windows[-1] if windows else None
        rejected = dict(db["rejected"])
        live = db["device"]["contact"]
        problems = quality_problems(latest) if latest else []   # under the lock: reads contactLoss
        # Current reading must START after the latest finger restoration (validator rule): a clean
        # window from before a removal is history, never "current" again.
        restored = [x["onMs"] for x in db["contactLoss"] if x["onMs"] is not None and x["boot"] in (None, boot)]
        if latest and restored and latest["windowStartMs"] < max(restored) and "contact_interrupted" not in problems:
            problems.append("before_contact_restored")
    if live and boot and live.get("boot") not in (None, boot):
        live = None                                   # an event from a previous boot
    live_contact = live["on"] if live else None
    online = dev_status.get("online")
    sensors = {"pulse": dev_status.get("pulseSensor"), "motion": dev_status.get("motionSensor")}
    missing = [k for k, v in sensors.items() if v == "missing"]
    connected = online is not False and heard is not None and now - heard < STALE_AFTER_MS
    age = now - latest["windowEndMs"] if latest else None
    # Order matters: connectivity first, then whether the reading is current, then its quality.
    if online is False:
        state = "offline"
    elif not connected:
        state = "stale"
    elif missing:
        state = "sensor_missing"      # the band says a sensor is gone: no reading can be trusted
    elif live_contact is False:
        state = "contact_required"    # immediate: from the band's contact event, not the 60 s window
    elif latest is None:
        state = "collecting"
    elif age > READING_MAX_AGE_MS:
        state = "reading_stale"
    elif "no_contact" in problems or "contact_interrupted" in problems or "before_contact_restored" in problems:
        # finger is back (live) but no clean window that started after it returned → wait;
        # otherwise ask for contact
        state = "settling" if live_contact or "no_contact" not in problems else "contact_required"
    elif problems == ["vibration_overlap"]:
        state = "vibration_overlap"   # cue just played; pulse is withheld, see CONTRACT §4
    elif problems:
        state = "poor_quality"
    else:
        state = "usable"
    return {
        "device": DEVICE_ID,
        "state": state,
        "problems": ([f"{k}_sensor_missing" for k in missing] + problems) if latest or missing else [],
        # Missing data is reported as missing — never converted into a calm estimate.
        "pulseRateBpm": latest.get("pulseRateBpm") if state == "usable" else None,
        "online": online,
        "lastHeardMs": heard,
        "readingEndMs": latest["windowEndMs"] if latest else None,
        "readingAgeMs": age,
        "sensors": sensors,
        "contact": live_contact,          # immediate finger on/off (None until the band reports it)
        "boot": boot,
        "rejectedMessages": rejected["count"],
        "lastRejectReason": rejected["last"],
    }


def session_windows(s: dict) -> list[dict]:
    """Windows that belong to a session, by the band's own timestamps (whenever they arrived):
    ending after the session started and starting before it ended (or it is still open)."""
    start, end = s["startedAtMs"], s.get("endedAtMs")
    return [w for w in db["feature_windows"].values()
            if w["windowEndMs"] > start and (end is None or w["windowStartMs"] < end)]


@app.get("/api/companion/reviewer/sessions")
def reviewer_sessions():
    with lock:
        out = []
        for s in db["sessions"].values():
            linked = session_windows(s)
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
