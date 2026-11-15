"""Simulated Calm Band for Windows (no hardware needed).

Publishes exactly the firmware's MQTT messages (calm-band/CONTRACT.md §3):
  features (one window per hop), status (retained, Last Will), events (contact, button) and acks
  for commands received on calmband/<dev>/cmd. Commands are queued in the MQTT callback and
  handled in the main loop, like the ESP32.

Run (backend venv has paho-mqtt >= 2):
  python sim_band.py --scenario settle            # real timing: 60 s windows every 15 s
  python sim_band.py --scenario mixed --fast      # 15x faster: 4 s windows every 1 s
  python sim_band.py --scenario steady --stop-after 90

Scenarios (times are scenario seconds; --fast runs the scenario clock 15x faster):
  settle      pulse starts ~95 and drifts to ~78; finger on, arm still, quality ~0.95
  steady      pulse ~74 with a small slow wobble
  rising      pulse starts ~72 and climbs to ~90
  finger_off  finger on for 30 s, then off (pulse null, contact false, quality 0)
  moving      arm moving the whole time (moving:true, quality <= 0.5)
  motor       steady pulse plus local cue bursts (every 5 s for 60 s, then 60 s quiet), so windows
              say motorActive:true. Commands from the backend always set motorActive too.
  dropout     steady, but publishing stops for 60 REAL seconds (so the backend goes stale) after
              90 real seconds (20 s with --fast); windows made meanwhile are queued and flushed
              oldest-first with their original timestamps, like the firmware.
  mixed       a realistic 5-minute session: settle, a stretch of arm movement, a finger lift,
              cue bursts during reps, then settling again; steady after 300 s.

Test hooks on calmband/<dev>/sim (same as the Linux simulator, CONTRACT §5):
  {"contact":false|true}  {"moving":true|false}  {"button":"stop"}  {"offlineMs":6000}
  {"clear":true} removes the contact/moving overrides.

Missing data stays missing: pulseRateBpm and pulseRateSdBpm are null when the window has no
contact or too few valid beat intervals (20; 3 with --fast), exactly like calm_core.
"""
from __future__ import annotations

import argparse
import json
import math
import queue
import random
import re
import secrets
import sys
import threading
import time
from collections import deque

import paho.mqtt.client as mqtt

# ---------------------------------------------------------------- firmware constants (CONTRACT §2-§3.4)
PATTERNS_MS = {                      # on/off sequence, ms (CONTRACT §3.4 table)
    "rep_pulse": [120],
    "ease_off": [120, 100, 120],
    "session_complete": [300, 150, 300, 150, 600],
    "breath_in": [80, 80, 80],
    "breath_out": [400],
}
MAX_DURATION_MS = 1500
MAX_SPAN_MS = 10_000                 # expiresAtMs - issuedAtMs
MAX_FUTURE_MS = 2000                 # issuedAtMs clock skew
MAX_AGE_MS = 5000                    # 3 s TTL + 2 s skew
SEEN_IDS = 32
CMD_QUEUE_SLOTS = 4
CONTACT_DEBOUNCE_S = 1.0
OUTBOX_SLOTS = 120
MOVING_RMS_G = 0.05
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,47}$")
SPEED_FAST = 15.0                    # --fast: 60 s / 15 s windows become 4 s / 1 s
BOOT_LEAD_S = 20.0                   # real mode: first window ~40 s after start (see SimBand.__init__)


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------- scenarios
# Each returns the band's "true" state at scenario time t (seconds):
#   contact (finger on), moving (arm), hr (bpm), cue (local motor burst active now)
def _hr_noise(t: float) -> float:
    return 0.6 * math.sin(t / 7.3) + 0.4 * math.sin(t / 3.1)


def sc_settle(t):  return dict(contact=True, moving=False, hr=78 + 22 * math.exp(-t / 90) + _hr_noise(t), cue=False)
def sc_steady(t):  return dict(contact=True, moving=False, hr=74 + 1.5 * math.sin(t / 40) + _hr_noise(t), cue=False)
def sc_rising(t):  return dict(contact=True, moving=False, hr=72 + 18 * (1 - math.exp(-t / 120)) + _hr_noise(t), cue=False)
def sc_finger_off(t): return dict(contact=t < 30, moving=False, hr=76 + _hr_noise(t), cue=False)
def sc_moving(t):  return dict(contact=True, moving=True, hr=82 + _hr_noise(t), cue=False)


def sc_motor(t):
    in_burst = (t % 120) < 60
    return dict(contact=True, moving=False, hr=75 + _hr_noise(t), cue=in_burst and (t % 5) < 0.4)


def sc_mixed(t):
    hr = 78 + 22 * math.exp(-t / 110) + _hr_noise(t)
    if t >= 300:
        return dict(contact=True, moving=False, hr=78 + _hr_noise(t), cue=False)
    moving = 95 <= t < 125            # adjusts position / gestures
    contact = not (150 <= t < 170)    # lifts the finger for 20 s
    cue = 185 <= t < 255 and (t % 6) < 0.4   # reps: one cue every ~6 s
    return dict(contact=contact, moving=moving, hr=hr + (4 if moving else 0), cue=cue)


SCENARIOS = {"settle": sc_settle, "steady": sc_steady, "rising": sc_rising, "finger_off": sc_finger_off,
             "moving": sc_moving, "motor": sc_motor, "dropout": sc_steady, "mixed": sc_mixed}


# ---------------------------------------------------------------- command gate (CONTRACT §3.4)
class _Dup(Exception):
    pass


def _pairs_no_dups(pairs):
    d = {}
    for k, v in pairs:
        if k in d:
            raise _Dup(k)
        d[k] = v
    return d


def _whole(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _reject_constant(name):
    raise ValueError(name)


def gate(payload: bytes, seen: deque, now: int):
    """Returns (commandId or None, reason or None, pattern, durationMs). Order matches the firmware."""
    cid = None
    try:
        body = json.loads(payload.decode("utf-8"), object_pairs_hook=_pairs_no_dups, parse_constant=_reject_constant)
    except (ValueError, UnicodeDecodeError, _Dup, RecursionError):
        body = None
    if isinstance(body, dict) and isinstance(body.get("commandId"), str) and ID_RE.match(body["commandId"]):
        cid = body["commandId"]
    flat = isinstance(body, dict) and all(v is None or isinstance(v, (str, int, float, bool)) for v in body.values())
    ok = (flat and cid is not None and isinstance(body.get("pattern"), str)
          and _whole(body.get("issuedAtMs")) and _whole(body.get("expiresAtMs"))
          and ("maxDurationMs" not in body or _whole(body["maxDurationMs"])))
    if not ok:
        return cid, "malformed", None, 0
    if cid in seen:
        return cid, "duplicate", None, 0
    seen.append(cid)                       # remembered even if rejected below
    issued, expires = body["issuedAtMs"], body["expiresAtMs"]
    if expires <= issued or expires - issued > MAX_SPAN_MS or issued - now > MAX_FUTURE_MS:
        return cid, "bad_time", None, 0
    if now > expires or now - issued > MAX_AGE_MS:
        return cid, "expired", None, 0
    if body["pattern"] not in PATTERNS_MS:
        return cid, "bad_pattern", None, 0
    dur = body.get("maxDurationMs", MAX_DURATION_MS)
    if dur < 1 or dur > MAX_DURATION_MS:
        return cid, "bad_duration", None, 0
    return cid, None, body["pattern"], dur


# ---------------------------------------------------------------- the band
class SimBand:
    def __init__(self, a):
        self.a = a
        self.dev = a.dev
        self.boot = secrets.token_hex(4)
        self.speed = SPEED_FAST if a.fast else 1.0
        self.window_s = 60.0                       # scenario seconds
        self.hop_s = 15.0
        self.min_ibis = 3 if a.fast else 20
        self.scenario = SCENARIOS[a.scenario]
        # The real band connects some seconds after power-on (Wi-Fi + NTP) and its first window ends
        # one full window after boot. Treat boot as BOOT_LEAD seconds ago so the first window arrives
        # before the backend's 45 s "stale" rule (nothing heard) would fire.
        self.t0 = time.time() - (0 if a.fast else BOOT_LEAD_S)
        self.seq = 0
        self.seen = deque(maxlen=SEEN_IDS)
        self.cmdq: queue.Queue = queue.Queue(maxsize=CMD_QUEUE_SLOTS)
        self.hookq: queue.Queue = queue.Queue()
        self.outbox: deque = deque()
        self.dropped = 0
        self.publish_failures = 0
        self.playing = None                        # {"id","start","end"} (real ms)
        self.motor_on: list[tuple[int, int]] = []  # real-time motor intervals (ms)
        self.override = {}                         # hooks: contact / moving
        self.offline_until = 0.0                   # real time; publishing paused while > now
        self.dropout_done = False
        self.contact_reported = None               # last contact state sent in an event
        self.contact_candidate = None              # (state, since real s)
        self.connected = threading.Event()
        self.stop_sent = False

        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"band-{self.dev}", clean_session=True)
        c.will_set(self.topic("status"), json.dumps({"dev": self.dev, "online": False}), qos=1, retain=True)
        c.on_connect = self.on_connect
        c.on_disconnect = lambda *x: self.connected.clear()
        c.on_message = self.on_message
        c.reconnect_delay_set(1, 5)
        self.c = c

    def topic(self, kind):
        return f"calmband/{self.dev}/{kind}"

    def log(self, msg):
        print(f"[band {self.dev}] {msg}", flush=True)

    # ---- time
    def scen_t(self, real=None) -> float:
        return ((real if real is not None else time.time()) - self.t0) * self.speed

    def truth(self, real=None):
        s = dict(self.scenario(self.scen_t(real)))
        s.update({k: v for k, v in self.override.items() if k in ("contact", "moving")})
        return s

    # ---- MQTT callbacks (copy only, no publishing: same rule as the firmware)
    def on_connect(self, c, u, flags, rc, props=None):
        if rc != 0:
            self.log(f"MQTT connect failed ({rc})")
            return
        c.subscribe(self.topic("cmd"), qos=1)
        c.subscribe(self.topic("sim"), qos=1)
        self.connected.set()
        self.hookq.put({"_connected": True})

    def on_message(self, c, u, msg):
        if msg.topic == self.topic("cmd"):
            try:
                self.cmdq.put_nowait(bytes(msg.payload))
            except queue.Full:
                pass                                   # queue full: dropped, never late
        elif msg.topic == self.topic("sim"):
            try:
                self.hookq.put(json.loads(msg.payload))
            except ValueError:
                pass

    # ---- publishing
    def pub(self, kind, body, retain=False):
        info = self.c.publish(self.topic(kind), json.dumps(body, separators=(",", ":")), qos=1, retain=retain)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            self.publish_failures += 1
            return False
        return True

    def online(self):
        return self.connected.is_set() and time.time() >= self.offline_until

    def send_status(self, online=True):
        self.pub("status", {"dev": self.dev, "boot": self.boot, "online": online, "clockValid": True,
                            "droppedWindows": self.dropped, "publishFailures": self.publish_failures,
                            "pulseSensor": "simulated", "motionSensor": "simulated"}, retain=True)

    def send_event(self, typ, detail):
        if self.online():
            self.pub("events", {"dev": self.dev, "boot": self.boot, "type": typ, "detail": detail, "atMs": now_ms()})

    def ack(self, cid, result, reason=None):
        if self.online():
            self.pub("ack", {"commandId": cid, "dev": self.dev, "boot": self.boot, "result": result,
                             "reason": reason, "atMs": now_ms()})

    def flush_outbox(self):
        n = 0
        while self.outbox and self.online():
            if not self.pub("features", self.outbox[0]):
                break
            self.outbox.popleft()
            n += 1
        return n

    # ---- motor
    def motor_start(self, cid, pattern, dur):
        t = now_ms()
        length = min(sum(PATTERNS_MS[pattern]), dur, MAX_DURATION_MS)
        replaced = self.playing
        if replaced:
            self.motor_cut(t)
        self.playing = {"id": cid, "start": t, "end": t + length}
        self.motor_on.append((t, t + length))
        self.ack(cid, "accepted")                       # after the motor started
        if replaced and replaced["id"]:
            self.ack(replaced["id"], "stopped", "replaced")
        self.log(f"BUZZ {pattern} ({length} ms)")

    def motor_cut(self, t):
        if self.playing:
            s, _ = self.motor_on[-1]
            self.motor_on[-1] = (s, max(s, t))
            self.playing = None

    def local_stop(self):
        self.log("STOP button")
        if self.playing:
            cid = self.playing["id"]
            self.motor_cut(now_ms())
            if cid:
                self.ack(cid, "stopped", "local_stop")
        self.send_event("button", "stop")

    # ---- windows
    def make_window(self, end_real: float) -> dict:
        span_real = self.window_s / self.speed
        start_real = end_real - span_real
        n = 60
        samples = [self.truth(start_real + span_real * (i + 0.5) / n) for i in range(n)]
        contact_frac = sum(s["contact"] for s in samples) / n
        moving_frac = sum(s["moving"] for s in samples) / n
        contact = contact_frac >= 0.9
        end_ms, start_ms = int(end_real * 1000), int(start_real * 1000)
        motor = any(a < end_ms and b > start_ms for a, b in self.motor_on)
        rnd = random.Random(self.seq * 7919 + hash(self.boot) % 1000)

        hr_c = [s["hr"] for s in samples if s["contact"]]
        mean_hr = sum(hr_c) / len(hr_c) if hr_c else 0.0
        if contact:
            # beats in the window (with contact), how many survived the validity rules
            beats = int(mean_hr / 60 * self.window_s * contact_frac)
            vbf = (0.25 + rnd.uniform(0, 0.2)) if moving_frac > 0.2 else rnd.uniform(0.93, 0.99)
            vbf *= contact_frac
            valid_ibis = int(beats * vbf)
        else:
            vbf, valid_ibis = 0.0, 0
        has_pulse = contact and valid_ibis >= self.min_ibis
        moving_rms = (0.12 + 0.15 * rnd.random()) * moving_frac + rnd.uniform(0.006, 0.02) * (1 - moving_frac)
        moving = moving_rms > MOVING_RMS_G
        quality = vbf if contact else 0.0
        if not has_pulse or moving:
            quality = min(quality, 0.5)
        sd = (12 + rnd.uniform(0, 8)) if moving_frac > 0.2 else rnd.uniform(0.8, 3.0)
        return {
            "schema": 1, "dev": self.dev, "boot": self.boot, "seq": self.seq, "origin": "replay",
            "windowStartMs": start_ms, "windowEndMs": end_ms, "clockValid": True,
            "contact": contact, "quality": round(quality, 2),
            "pulseRateBpm": round(mean_hr + rnd.uniform(-0.4, 0.4), 1) if has_pulse else None,
            "pulseRateSdBpm": round(sd, 2) if has_pulse else None,
            "validBeatFraction": round(vbf, 2), "validIbis": valid_ibis,
            "motionValid": True, "motionCoverage": 1.00,
            "motionRms_g": round(moving_rms, 4), "motionMax_g": round(moving_rms * 2.6, 3),
            "moving": moving, "motorActive": motor, "timingGap": False,
        }

    # ---- main loop
    def run(self):
        a = self.a
        self.log(f"boot {self.boot}, scenario {a.scenario}{' (fast x15)' if a.fast else ''}, "
                 f"broker {a.host}:{a.port}")
        self.c.connect_async(a.host, a.port, keepalive=30)
        self.c.loop_start()
        hop_real = self.hop_s / self.speed
        next_window = self.t0 + self.window_s / self.speed    # first window: one full window after boot
        started = time.time()
        last_cue_t = self.scen_t()
        was_online = False
        dropout_at = started + (20 if a.fast else 90)
        try:
            while True:
                now = time.time()
                if a.duration and now - started >= a.duration:
                    break
                # hooks + reconnect handling
                while not self.hookq.empty():
                    self.handle_hook(self.hookq.get())
                if self.online() and not was_online and self.offline_until and now >= self.offline_until:
                    self.offline_until = 0.0
                    self.handle_hook({"_connected": True})   # back from an outage: reconnect sequence
                was_online = self.online()
                if self.online() and self.outbox:
                    n = self.flush_outbox()
                    if n:
                        self.log(f"flushed {n} queued windows")
                # commands, handled outside the MQTT callback
                while not self.cmdq.empty():
                    payload = self.cmdq.get()
                    cid, reason, pattern, dur = gate(payload, self.seen, now_ms())
                    if reason:
                        self.log(f"reject {reason} {(cid or '?')[:8]}")
                        if cid:
                            self.ack(cid, "rejected", reason)
                    elif now_ms() > json.loads(payload)["expiresAtMs"]:   # final re-check
                        self.ack(cid, "rejected", "expired")
                    else:
                        self.motor_start(cid, pattern, dur)
                # pattern finished on its own
                if self.playing and now_ms() >= self.playing["end"]:
                    cid = self.playing["id"]
                    self.playing = None
                    if cid:
                        self.ack(cid, "executed")
                # scenario-driven local cue bursts (motor/mixed): motor runs, no command, no ack
                # (sampled in 0.1 s scenario steps so --fast doesn't skip short cues)
                st_now = self.scen_t(now)
                prev_cue = self.scenario(last_cue_t)["cue"]
                t = last_cue_t + 0.1
                while t <= st_now:
                    cue = self.scenario(t)["cue"]
                    if cue and not prev_cue and not self.playing:
                        m = now_ms()
                        self.motor_on.append((m, m + PATTERNS_MS["rep_pulse"][0]))
                    prev_cue, last_cue_t, t = cue, t, t + 0.1
                del self.motor_on[:-500]
                # contact events: immediate state, reported after holding 1 s
                self.track_contact(now)
                # STOP on demand
                if a.stop_after is not None and not self.stop_sent and now - started >= a.stop_after:
                    self.stop_sent = True
                    self.local_stop()
                # dropout scenario
                if a.scenario == "dropout" and not self.dropout_done and now >= dropout_at:
                    self.dropout_done = True
                    self.offline_until = now + 60
                    self.log("dropout: not publishing for 60 s (windows are queued)")
                # feature windows
                if now >= next_window:
                    self.seq += 1
                    w = self.make_window(next_window)
                    next_window += hop_real
                    if self.online() and not self.outbox and self.pub("features", w):
                        self.log(f"window seq {w['seq']}: contact={w['contact']} q={w['quality']:.2f} "
                                 f"bpm={w['pulseRateBpm']} moving={w['moving']} motor={w['motorActive']}")
                    else:
                        if len(self.outbox) == OUTBOX_SLOTS:
                            self.outbox.popleft()
                            self.dropped += 1
                        self.outbox.append(w)
                time.sleep(0.02)
        except KeyboardInterrupt:
            pass
        finally:
            if self.connected.is_set():
                self.send_status(online=False)       # what the Last Will would say ~45 s later
                time.sleep(0.3)
            self.c.loop_stop()
            self.c.disconnect()
            self.log("stopped")

    def track_contact(self, now):
        state = self.truth()["contact"]
        if self.contact_candidate is None or self.contact_candidate[0] != state:
            self.contact_candidate = (state, now)
        elif now - self.contact_candidate[1] >= CONTACT_DEBOUNCE_S and state != self.contact_reported:
            if self.online():
                self.contact_reported = state
                self.send_event("contact", "on" if state else "off")

    def handle_hook(self, h):
        if not isinstance(h, dict):
            return
        if h.get("_connected"):
            # same order as the firmware's connectMqtt(): status, current contact, queued windows
            self.send_status(True)
            if self.contact_reported is not None:
                self.send_event("contact", "on" if self.contact_reported else "off")
            self.log(f"MQTT connected (boot {self.boot})")
            return
        for k in ("contact", "moving"):
            if isinstance(h.get(k), bool):
                self.override[k] = h[k]
                self.log(f"hook {k}={h[k]}")
        if h.get("clear"):
            self.override.clear()
            self.log("hook overrides cleared")
        if h.get("button") == "stop":
            self.local_stop()
        if isinstance(h.get("offlineMs"), int) and h["offlineMs"] > 0:
            self.offline_until = time.time() + h["offlineMs"] / 1000
            self.log(f"hook offline for {h['offlineMs']} ms")


def main(argv=None):
    p = argparse.ArgumentParser(description="Simulated Calm Band (CONTRACT.md message formats)")
    p.add_argument("--scenario", choices=sorted(SCENARIOS), default="settle")
    p.add_argument("--fast", action="store_true", help="15x faster: 4 s windows every 1 s, 3 valid beats minimum")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=1883)
    p.add_argument("--dev", default="cb-01")
    p.add_argument("--stop-after", type=float, default=None, metavar="N", help="press STOP N real seconds after start")
    p.add_argument("--duration", type=float, default=0, help="exit after this many real seconds (0 = run forever)")
    a = p.parse_args(argv)
    SimBand(a).run()


if __name__ == "__main__":
    sys.exit(main())
