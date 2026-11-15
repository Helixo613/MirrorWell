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
from datetime import datetime
from pathlib import Path

import paho.mqtt.client as mqtt
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from store import Store, default_path

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

# Re-entrant: MQTT callbacks write while HTTP requests read, all under this one lock, and the
# SQLite connection is only ever used while holding it (see store.py).
lock = threading.RLock()
store = Store(os.environ.get("CALMBAND_DB") or default_path())
# CONTRACT-UI §2: may the LIVE fields use windows that overlap a band buzz? ("1" yes / "0" no)
LIVE_USES_CUE_WINDOWS = os.environ.get("CALMBAND_LIVE_USES_CUE_WINDOWS", "1") != "0"
db = {
    "sessions": {},        # companionSessionId -> session dict
    "feature_windows": {}, # (device, boot, seq) -> window   (unique key = duplicate guard)
    "commands": {},        # commandId -> command + acks
    "device": {"lastHeardMs": None, "status": None, "boot": None, "contact": None},
    # Finger-off periods from the band's contact events, in band time: [{"boot","offMs","onMs"}]
    # (onMs None while still off). Any window overlapping one is not a clean reading.
    "contactLoss": [],
    "band_events": [],     # every band `contact` and `button` event: {"type","detail","boot","atMs"}
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
            store.add_window(body)
        elif kind == "status":
            db["device"]["status"] = body
            if body.get("boot"):
                db["device"]["boot"] = body["boot"]   # the band's current boot (it announces it on connect)
        elif kind == "events" and body["type"] == "contact":
            # Immediate finger on/off from the band (debounced ~1 s), separate from the 60 s windows.
            on = body["detail"] == "on"
            db["device"]["contact"] = {"on": on, "atMs": body["atMs"], "boot": body.get("boot")}
            _apply_contact(body)
            _keep_band_event(body)
        elif kind == "events" and body["type"] == "button":
            _keep_band_event(body)
        elif kind == "ack":
            cmd = db["commands"].get(body.get("commandId"))
            if cmd is not None:
                cmd["acks"].append(body)
                store.add_ack(body["commandId"], body)


def _apply_contact(body: dict):
    """Update the finger-off periods from one contact event (also used to rebuild them at startup)."""
    on = body["detail"] == "on"
    losses = db["contactLoss"]
    open_loss = next((x for x in reversed(losses) if x["onMs"] is None and x["boot"] == body.get("boot")), None)
    if not on and open_loss is None:
        losses.append({"boot": body.get("boot"), "offMs": body["atMs"] - CONTACT_DEBOUNCE_MS, "onMs": None})
        del losses[:-200]                     # bounded history
    elif on and open_loss is not None:
        open_loss["onMs"] = body["atMs"]      # restored: only windows starting after this are clean


def _keep_band_event(body: dict):
    """Every band `contact` and `button` event is kept (CONTRACT-UI §5 timeline), de-duplicated."""
    at = body.get("atMs")
    e = {"type": body["type"], "detail": body.get("detail", ""), "boot": body.get("boot") or "",
         "atMs": at if _int(at) else now_ms()}
    if any(x["type"] == e["type"] and x["detail"] == e["detail"] and x["boot"] == e["boot"] and x["atMs"] == e["atMs"]
           for x in db["band_events"][-50:]):
        return
    db["band_events"].append(e)
    store.add_band_event(e)


def _load_from_disk():
    """Fill the in-memory state from the SQLite file (called once at import, before MQTT starts)."""
    data = store.load()
    db["sessions"].update(data["sessions"])
    db["feature_windows"].update(data["windows"])
    db["commands"].update(data["commands"])
    db["band_events"] = data["band_events"]
    for e in db["band_events"]:                 # finger-off periods are rebuilt from the stored events
        if e["type"] == "contact":
            _apply_contact(e)
    active_session["id"] = data["active"]


mq.on_connect = on_connect
mq.on_message = on_message
_load_from_disk()


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
        if cmd["commandId"] not in db["commands"]:
            db["commands"][cmd["commandId"]] = {**cmd, "acks": []}
            store.add_command(cmd)
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
        if body.companionSessionId not in db["sessions"]:
            db["sessions"][body.companionSessionId] = {
                "id": body.companionSessionId, "startedAtMs": body.startedAtMs, "events": [],
                "seen": set(), "state": "open", "end": None,
            }
            store.add_session(db["sessions"][body.companionSessionId])
        active_session["id"] = body.companionSessionId
        store.set_active(active_session["id"])
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
        store.add_event(sid, event)
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
        store.end_session(s)
        if active_session["id"] == sid:
            active_session["id"] = None
            store.set_active(None)
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
    return build_status(now_ms())


def build_status(now: int) -> dict:
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


# ---------------------------------------------------------------- UI / reviewer API (CONTRACT-UI.md)
CUE_PATTERNS = ("rep_pulse", "ease_off")
SETTLE_DELTA_BPM = 3
CALM_SPAN_BPM = 15
REVIEWER_DIR = Path(os.environ.get("CALMBAND_REVIEWER_DIR") or (Path(__file__).resolve().parents[2] / "reviewer")).resolve()
NO_SIGNAL_STATES = {"offline", "stale", "sensor_missing", "collecting", "reading_stale", "contact_required"}
REASONS = {
    "offline": "The band is off or out of range.",
    "stale": "Lost touch with the band. Check it is switched on and nearby.",
    "sensor_missing": "A band sensor is not responding. Check its wires.",
    "collecting": "Getting a first reading. Rest your fingertip on the sensor and keep still for about a minute.",
    "reading_stale": "Waiting for a fresh reading from the band.",
    "contact_required": "Rest your fingertip lightly on the sensor.",
    "settling": "Finger found. Keep still; a clear reading takes about a minute.",
    "vibration_overlap": "Pulse paused while the band buzzes.",
    "usable": None,
}
REASON_MOVING = "Keep your hand still for a clearer reading."
REASON_UNCLEAR = "The reading is not clear yet. Keep your fingertip still and relaxed on the sensor."
# CALMBAND_LIVE_USES_CUE_WINDOWS=0: while the band buzzes, the live card shows this instead of a pulse
REASON_BUZZ_CLEAN_ONLY = "Paused while the band buzzes"


def rint(x: float) -> int:
    return int(math.floor(x + 0.5))


def r1(x: float) -> float:
    return math.floor(x * 10 + 0.5) / 10


def cue_ok(w: dict) -> bool:
    """A window whose ONLY problem is the buzz (contact, still, quality >= 0.8, pulse present)."""
    return quality_problems(w) == ["vibration_overlap"]


def calm_index(U: list) -> dict:
    return {"value": None, "label": "experimental"}


def session_scope(s: dict, now: int, ok=None):
    """(in, pre, post, U) of CONTRACT-UI section 1. `ok` decides which windows count as readings;
    the default is the clean-window rule. Caller holds the lock."""
    ok = ok or is_clean
    S, E = s["startedAtMs"], s.get("endedAtMs")
    inn = sorted(session_windows(s), key=lambda w: w["windowEndMs"])
    allw = plausible_windows(now)
    pre = [w for w in allw if ok(w) and S - PRE_POST_WINDOW_MS <= w["windowEndMs"] <= S]
    post = [w for w in allw if E is not None and ok(w) and E <= w["windowStartMs"] <= E + PRE_POST_WINDOW_MS]
    pre1, post1 = (pre[-1] if pre else None), (post[0] if post else None)
    U = ([pre1] if pre1 else []) + [w for w in inn if ok(w)] + ([post1] if post1 else [])
    U.sort(key=lambda w: w["windowEndMs"])
    return inn, pre1, post1, U


def pulse_trend(U: list):
    if len(U) < 2:
        return "insufficient", None, None
    a, b = U[0]["pulseRateBpm"], U[-1]["pulseRateBpm"]
    d = b - a
    return ("settled" if d <= -SETTLE_DELTA_BPM else "rose" if d >= SETTLE_DELTA_BPM else "steady"), a, b


def window_origin(ws: list):
    """live / replay / sim / mixed, from the windows' own `origin`; None when there are no windows."""
    kinds = {w.get("origin") or "unknown" for w in ws}
    if not kinds:
        return None
    return next(iter(kinds)) if len(kinds) == 1 else "mixed"


def session_cues(sid: str) -> list:
    out = []
    for c in db["commands"].values():
        if c.get("sessionId") == sid and c.get("pattern") in CUE_PATTERNS:
            acc = [a["atMs"] for a in c["acks"] if a.get("result") == "accepted" and _int(a.get("atMs"))]
            if acc:
                out.append(acc[0])
    return out


def build_summary(s: dict, now: int):
    """The CONTRACT-UI section 3 object plus (in, pre, post, U). Caller holds the lock."""
    inn, pre, post, U = session_scope(s, now)
    ended = s["state"] == "ended"
    if ended:
        exs = (s["end"] or {}).get("exercises", [])
        reps = sum(x["repsCompleted"] for x in exs)
        eo = sum(x["easeOffCount"] for x in exs)
    else:
        reps = len({e.get("seq") for e in s["events"] if e.get("type") == "rep"})
        eo = sum(1 for e in s["events"] if e.get("type") == "ease_off" and e.get("active"))
    trend, sb, eb = pulse_trend(U)
    mv = [w for w in inn if w.get("motionValid") and w.get("moving") is not None]
    steady = rint(100 * sum(1 for w in mv if not w["moving"]) / len(mv)) if mv else None
    den = [w for w in inn if quality_problems(w) != ["vibration_overlap"]]
    sig = rint(100 * sum(1 for w in den if is_clean(w)) / len(den)) if den else None
    words = [
        "No reps were counted in this session." if reps == 0 else "You completed 1 rep." if reps == 1 else f"You completed {reps} reps.",
        "No ease-off cues were needed." if eo == 0 else "You had 1 ease-off cue." if eo == 1 else f"You had {eo} ease-off cues.",
        {"settled": "Your pulse settled as the session went on.", "steady": "Your pulse stayed about the same.",
         "rose": "Your pulse was a little higher at the end than at the start.",
         "insufficient": "The band could not get a clear enough pulse reading this time."}[trend],
    ]
    if steady is not None:
        words.append("Your hand stayed steady for most of the session." if steady >= 80
                     else "Your hand moved quite a bit, which makes pulse readings harder.")
    summary = {
        "schema": 1, "companionSessionId": s["id"], "state": s["state"], "startedAtMs": s["startedAtMs"],
        "endedAtMs": s.get("endedAtMs") if ended else None,
        "endReason": s["end"]["endReason"] if ended and s["end"] else None,
        "durationMs": (s["endedAtMs"] - s["startedAtMs"]) if ended else now - s["startedAtMs"],
        "reps": reps, "easeOffs": eo, "cues": len(session_cues(s["id"])),
        "pulse": {"trend": trend, "startBpm": sb, "endBpm": eb},
        "steadyPct": steady, "signalPct": sig, "calmIndex": calm_index(U),
        "origin": window_origin(inn + [w for w in (pre, post) if w]),
        "plainWords": words,
    }
    return summary, (inn, pre, post, U)


@app.get("/api/companion/sessions/{sid}/summary")
def session_summary(sid: str):
    now = now_ms()
    with lock:
        s = db["sessions"].get(sid)
        if s is None:
            raise HTTPException(404, "unknown session")
        return build_summary(s, now)[0]


@app.get("/api/companion/live")
def live():
    now = now_ms()
    with lock:
        st = build_status(now)
        state = st["state"]
        boot = st["boot"]
        ws = plausible_windows(now, boot)
        latest = ws[-1] if ws else None
        sid = active_session["id"]
        s = db["sessions"].get(sid) if sid else None

        signal = 0
        if state not in NO_SIGNAL_STATES and latest and latest.get("contact"):
            q = latest["quality"]
            signal = 1 if q < 0.5 else 2 if q < USABLE_QUALITY else 3

        # Heart: a clean reading; or, when allowed, one whose only problem is a band buzz.
        heart_bpm, heart_cue = None, False
        if state == "usable":
            heart_bpm = st["pulseRateBpm"]
        elif state == "vibration_overlap" and LIVE_USES_CUE_WINDOWS and latest and cue_ok(latest):
            heart_bpm, heart_cue = latest["pulseRateBpm"], True
        beat = rint(60000 / heart_bpm) if heart_bpm else None

        if state == "poor_quality":
            reason = REASON_MOVING if "moving" in st["problems"] else REASON_UNCLEAR
        elif state == "vibration_overlap":
            reason = None if heart_cue else (REASON_BUZZ_CLEAN_ONLY if not LIVE_USES_CUE_WINDOWS else REASONS[state])
        else:
            reason = REASONS[state]

        steadiness = None
        if state not in ("offline", "stale", "collecting", "reading_stale") and latest:
            mvg = latest.get("moving")
            steadiness = None if mvg is None else ("moving" if mvg else "steady")

        settling, settling_cue = None, False
        calm = {"value": None, "label": "experimental"}
        cue = {"lastAtMs": None, "countThisSession": 0}
        if s is not None:
            ok = (lambda w: is_clean(w) or cue_ok(w)) if LIVE_USES_CUE_WINDOWS else is_clean
            _, _, _, UL = session_scope(s, now, ok)
            if len(UL) >= 2:
                last2 = UL[-2:]
                d = (last2[0]["pulseRateBpm"] + last2[1]["pulseRateBpm"]) / 2 - UL[0]["pulseRateBpm"]
                settling = "settling" if d <= -SETTLE_DELTA_BPM else "rising" if d >= SETTLE_DELTA_BPM else "steady"
                settling_cue = any(w.get("motorActive") for w in last2 + [UL[0]])
            _, _, _, U = session_scope(s, now)       # calm index: clean windows only, always
            calm = calm_index(U)
            cs = session_cues(s["id"])
            cue = {"lastAtMs": max(cs) if cs else None, "countThisSession": len(cs)}
        return {
            "schema": 1, "device": DEVICE_ID, "atMs": now, "sessionId": sid if s else None, "state": state,
            "signal": signal, "reason": reason,
            "heart": {"beatIntervalMs": beat, "duringCue": heart_cue},
            "settling": settling, "settlingDuringCue": settling_cue, "steadiness": steadiness,
            "cue": cue, "calmIndex": calm,
            "origin": latest.get("origin") if latest else None,
        }


@app.get("/api/companion/reviewer/sessions")
def reviewer_sessions():
    now = now_ms()
    with lock:
        out = []
        for s in sorted(db["sessions"].values(), key=lambda x: x["startedAtMs"]):
            sm, (inn, pre, post, U) = build_summary(s, now)
            cmds = [c for c in db["commands"].values() if c["sessionId"] == s["id"]]
            out.append({
                "companionSessionId": s["id"],
                "state": s["state"],
                "events": len(s["events"]),
                "end": s["end"],
                "featureWindows": len(inn),
                "usableWindows": sum(1 for w in inn if is_clean(w)),
                "vibrationOverlapWindows": sum(1 for w in inn if w.get("motorActive")),
                "prePulseBpm": pre["pulseRateBpm"] if pre else None,
                "postPulseBpm": post["pulseRateBpm"] if post else None,
                "hapticCommands": len(cmds),
                "hapticExecuted": sum(1 for c in cmds if any(a["result"] == "executed" for a in c["acks"])),
                "startedAtMs": sm["startedAtMs"], "endedAtMs": sm["endedAtMs"], "durationMs": sm["durationMs"],
                "reps": sm["reps"], "easeOffs": sm["easeOffs"], "cues": sm["cues"],
                "pulseTrend": sm["pulse"]["trend"], "startBpm": sm["pulse"]["startBpm"], "endBpm": sm["pulse"]["endBpm"],
                "signalPct": sm["signalPct"], "steadyPct": sm["steadyPct"], "calmIndex": sm["calmIndex"],
                "origin": sm["origin"],
            })
    return out


@app.get("/api/companion/reviewer/sessions/{sid}/timeline")
def reviewer_timeline(sid: str):
    now = now_ms()
    with lock:
        s = db["sessions"].get(sid)
        if s is None:
            raise HTTPException(404, "unknown session")
        S, E = s["startedAtMs"], s.get("endedAtMs")
        inn, pre, post, U = session_scope(s, now)
        fr, to = S - PRE_POST_WINDOW_MS, (E if E is not None else now) + PRE_POST_WINDOW_MS
        in_keys = {(w["boot"], w["seq"]) for w in inn}
        start_k = (U[0]["boot"], U[0]["seq"]) if len(U) >= 2 else None
        end_k = (U[-1]["boot"], U[-1]["seq"]) if len(U) >= 2 else None
        wins = []
        for w in plausible_windows(now):
            if not (w["windowEndMs"] > fr and w["windowStartMs"] < to):
                continue
            k = (w["boot"], w["seq"])
            probs = quality_problems(w)
            wins.append({
                "boot": w["boot"], "seq": w["seq"], "windowStartMs": w["windowStartMs"], "windowEndMs": w["windowEndMs"],
                "contact": w["contact"], "quality": w["quality"], "pulseRateBpm": w.get("pulseRateBpm"),
                "moving": w.get("moving"), "motionValid": w.get("motionValid"), "motorActive": w.get("motorActive"),
                "timingGap": w.get("timingGap"), "origin": w.get("origin"),
                "usable": not probs, "problems": probs,
                "role": "in" if k in in_keys else "pre" if w["windowEndMs"] <= S else "post",
                "reading": "end" if k == end_k else "start" if k == start_k else None,
            })
        ev = [{"source": "mirrorwell", **e} for e in s["events"]]
        ev += [{"source": "band", "type": b["type"], "detail": b["detail"], "atMs": b["atMs"], "boot": b["boot"]}
               for b in db["band_events"] if fr <= b["atMs"] <= to]
        ev.sort(key=lambda e: e.get("atMs") or 0)
        cmds = []
        for c in sorted((c for c in db["commands"].values() if c.get("sessionId") == sid), key=lambda c: c["issuedAtMs"]):
            res = [a["result"] for a in c["acks"]]
            outcome = next((r for r in ("executed", "stopped", "rejected", "accepted") if r in res), "no_ack")
            cmds.append({"commandId": c["commandId"], "pattern": c["pattern"], "issuedAtMs": c["issuedAtMs"],
                         "expiresAtMs": c["expiresAtMs"], "maxDurationMs": c["maxDurationMs"], "outcome": outcome,
                         "acks": [{"result": a["result"], "reason": a.get("reason"), "atMs": a.get("atMs")} for a in c["acks"]]})
        return {"schema": 1, "companionSessionId": sid, "startedAtMs": S, "endedAtMs": E,
                "range": {"fromMs": fr, "toMs": to}, "windows": wins, "events": ev, "commands": cmds}


@app.get("/api/companion/reviewer/trends")
def reviewer_trends():
    now = now_ms()
    off = datetime.now().astimezone().utcoffset()
    with lock:
        rows, days = [], {}
        for s in sorted(db["sessions"].values(), key=lambda x: x["startedAtMs"]):
            inn, pre, post, U = session_scope(s, now)
            d = datetime.fromtimestamp(s["startedAtMs"] / 1000).strftime("%Y-%m-%d")
            days[d] = days.get(d, 0) + 1
            rows.append({"companionSessionId": s["id"], "startedAtMs": s["startedAtMs"], "date": d,
                         "meanUsablePulseBpm": r1(sum(w["pulseRateBpm"] for w in U) / len(U)) if U else None,
                         "readings": len(U), "pulseTrend": pulse_trend(U)[0],
                         "origin": window_origin(inn + [w for w in (pre, post) if w])})
        return {"schema": 1, "utcOffsetMinutes": int(off.total_seconds() // 60) if off else 0,
                "days": [{"date": d, "sessions": n} for d, n in sorted(days.items())], "sessions": rows}


# Reviewer page (agent C's static folder). A route, not a mount, so it also works if the folder
# appears after startup, and it is registered BEFORE the MirrorWell catch-all below.
@app.get("/reviewer")
def reviewer_redirect():
    return RedirectResponse("/reviewer/")


@app.get("/reviewer/{path:path}")
def reviewer_page(path: str):
    if not REVIEWER_DIR.is_dir():
        raise HTTPException(404, "reviewer page not installed")
    target = (REVIEWER_DIR / (path or "index.html")).resolve()
    if target.is_dir():
        target = target / "index.html"
    if not target.is_relative_to(REVIEWER_DIR) or not target.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(target)


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
