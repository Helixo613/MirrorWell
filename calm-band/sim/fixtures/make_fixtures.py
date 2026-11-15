"""Reference implementation of the CONTRACT-UI.md rules, used to write the fixtures in this folder.

Run: python make_fixtures.py [out_dir]   (default: this folder). Agent A can diff its endpoint
output against these files; if they disagree, CONTRACT-UI.md decides.
"""
import json, math, sys, uuid, datetime, os
from pathlib import Path

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
PRE = 300_000
BOOT = "3bd2e0fa"
OLD_BOOT = "9a41c07e"
IST = datetime.timezone(datetime.timedelta(minutes=330))

def r1(x): return math.floor(x * 10 + 0.5) / 10
def rint(x): return int(math.floor(x + 0.5))

# ------------------------------------------------------------ history
S1 = 1794727800000            # 2026-11-15 13:00 IST  (insufficient session, finger never on)
E1 = S1 + 180_000
S2 = 1794813600000            # 2026-11-16 12:50 IST  (settled session)
E2 = S2 + 240_000
SID1 = "c7d2a1e4-0b6f-4f0e-8a51-6e2f9b3d4c10"
SID2 = "5b0e9f8e-6a51-4c8e-9d43-2f1f0c6a7b12"

windows = []
def add_window(boot, seq, end, contact=True, bpm=None, moving=False, motor=False, quality=None):
    has = contact and bpm is not None
    q = quality if quality is not None else (0.96 if has and not moving else (0.0 if not contact else 0.45))
    if not has or moving: q = min(q, 0.5)
    windows.append({"schema": 1, "dev": "cb-01", "boot": boot, "seq": seq, "origin": "replay",
        "windowStartMs": end - 60_000, "windowEndMs": end, "clockValid": True, "contact": contact,
        "quality": q, "pulseRateBpm": r1(bpm) if has else None, "pulseRateSdBpm": (14.2 if moving else 1.8) if has else None,
        "validBeatFraction": q if contact else 0.0, "validIbis": int((bpm or 0) * 0.9) if has else 0,
        "motionValid": True, "motionCoverage": 1.0, "motionRms_g": 0.16 if moving else 0.012,
        "motionMax_g": 0.42 if moving else 0.031, "moving": moving, "motorActive": motor, "timingGap": False})

# session 1: band on, finger off the whole time
for k in range(16):
    add_window(OLD_BOOT, k + 1, S1 - 60_000 + k * 15_000, contact=False)

# session 2 timeline: cues (rep_pulse) every 15 s from S+40 s for 10 reps; ease_off at S+102 s;
# session_complete at E. Hand moves S+190..S+205 s.
cue_times = [S2 + 40_000 + 15_000 * i for i in range(10)]
ease_time = S2 + 102_000
motor_spans = [(t + 20, t + 20 + 120) for t in cue_times] + [(ease_time + 20, ease_time + 360), (E2 + 20, E2 + 1520)]
move_span = (S2 + 190_000, S2 + 205_000)
def hr(t): return 78 + 22 * math.exp(-(t - (S2 - 150_000)) / 110_000)
seq = 0
end = S2 - 150_000 + 60_000 + 5_000      # band connected 2.5 min before the session
while end <= E2 + 120_000:
    seq += 1
    st = end - 60_000
    motor = any(a < end and b > st for a, b in motor_spans)
    moving = move_span[0] < end and move_span[1] > st
    # average pulse over the window
    bpm = sum(hr(st + i * 1000) for i in range(60)) / 60
    add_window(BOOT, seq, end, bpm=bpm + (3 if moving else 0), moving=moving, motor=motor)
    end += 15_000

# ------------------------------------------------------------ sessions, events, commands
def mw_events(S, reps, ease):
    ev, n = [], 0
    def e(**k):
        nonlocal n; n += 1; ev.append({"seq": n, **k})
    e(type="exercise_state", atMs=S, exerciseId="EX_SMILE", state="DEMO")
    e(type="exercise_state", atMs=S + 30_000, exerciseId="EX_SMILE", state="REPS")
    for i, t in enumerate(reps):
        e(type="rep", atMs=t, repIndex=i, peakEffortIndex=round(0.55 + 0.03 * (i % 4), 2), durationMs=1800 + 100 * (i % 3))
        if ease and ease[0] < t + 15_000 and ease[0] > t:
            e(type="ease_off", atMs=ease[0], active=True)
            e(type="ease_off", atMs=ease[0] + 4000, active=False)
    return ev

sessions = {
    SID1: {"id": SID1, "startedAtMs": S1, "endedAtMs": E1, "state": "ended",
           "events": [{"seq": 1, "type": "exercise_state", "atMs": S1, "exerciseId": "EX_SMILE", "state": "DEMO"},
                      {"seq": 2, "type": "exercise_state", "atMs": S1 + 30_000, "exerciseId": "EX_SMILE", "state": "REPS"}]
                     + [{"seq": 3 + i, "type": "rep", "atMs": S1 + 40_000 + 15_000 * i, "repIndex": i, "peakEffortIndex": 0.6, "durationMs": 1700} for i in range(5)],
           "end": {"localSessionId": "a3f1c2d4-1e2b-4c3d-9e8f-0a1b2c3d4e5f", "endReason": "user_stopped", "endedAtMs": E1,
                   "exercises": [{"exerciseId": "EX_SMILE", "repsCompleted": 5, "meanSymmetryIndex": 0.71, "meanEffortIndex": 0.6, "easeOffCount": 0, "lowQualityFramePct": 0.04}]}},
    SID2: {"id": SID2, "startedAtMs": S2, "endedAtMs": E2, "state": "ended",
           "events": mw_events(S2, [t - 40 for t in cue_times], [ease_time - 30]),
           "end": {"localSessionId": "e9b8c7d6-5a4b-4c3d-8e2f-1a0b9c8d7e6f", "endReason": "completed", "endedAtMs": E2,
                   "exercises": [{"exerciseId": "EX_SMILE", "repsCompleted": 10, "meanSymmetryIndex": 0.78, "meanEffortIndex": 0.58, "easeOffCount": 1, "lowQualityFramePct": 0.02}]}},
}

commands = []
def cmd(sid, pattern, t, boot, acks):
    c = {"commandId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"cmd-{t}-{pattern}")), "sessionId": sid, "pattern": pattern,
         "maxDurationMs": 1500, "issuedAtMs": t, "expiresAtMs": t + 3000, "acks": []}
    dur = {"rep_pulse": 120, "ease_off": 340, "session_complete": 1500}[pattern]
    for res in acks:
        at = t + 20 if res == "accepted" else t + 20 + dur
        c["acks"].append({"commandId": c["commandId"], "dev": "cb-01", "boot": boot, "result": res, "reason": None, "atMs": at})
    commands.append(c)
for i in range(5):
    cmd(SID1, "rep_pulse", S1 + 40_000 + 15_000 * i + 40, OLD_BOOT, ["accepted", "executed"])
cmd(SID1, "session_complete", E1 + 40, OLD_BOOT, ["accepted", "executed"])
for t in cue_times:
    cmd(SID2, "rep_pulse", t, BOOT, ["accepted", "executed"])
cmd(SID2, "ease_off", ease_time, BOOT, ["accepted", "executed"])
cmd(SID2, "session_complete", E2, BOOT, ["accepted", "executed"])
commands.sort(key=lambda c: c["issuedAtMs"])

band_events = [
    {"dev": "cb-01", "boot": OLD_BOOT, "type": "contact", "detail": "off", "atMs": S1 - 70_000},
    {"dev": "cb-01", "boot": BOOT, "type": "contact", "detail": "on", "atMs": S2 - 148_000},
]

# ------------------------------------------------------------ rules (CONTRACT-UI §1)
def problems(w):
    p = []
    if not w["contact"]: p.append("no_contact")
    if w["pulseRateBpm"] is None: p.append("no_pulse")
    if w["quality"] < 0.8: p.append("low_quality")
    if w["timingGap"]: p.append("timing_gap")
    if w["motionValid"] is False: p.append("motion_unavailable")
    if w["moving"]: p.append("moving")
    if w["motorActive"]: p.append("vibration_overlap")
    return p
def usable(w): return not problems(w)
def key(w): return (w["boot"], w["seq"])

def scope(s, now):
    S, E = s["startedAtMs"], s["endedAtMs"]
    ws = sorted([w for w in windows if w["windowEndMs"] <= now], key=lambda w: w["windowEndMs"])
    inn = [w for w in ws if w["windowEndMs"] > S and (E is None or w["windowStartMs"] < E)]
    pre = [w for w in ws if usable(w) and S - PRE <= w["windowEndMs"] <= S]
    post = [w for w in ws if E is not None and usable(w) and E <= w["windowStartMs"] <= E + PRE]
    U = ([pre[-1]] if pre else []) + [w for w in inn if usable(w)] + ([post[0]] if post else [])
    U.sort(key=lambda w: w["windowEndMs"])
    return inn, (pre[-1] if pre else None), (post[0] if post else None), U

def calm(U):
    if len(U) < 2: return {"value": None, "label": "experimental"}
    v = (U[0]["pulseRateBpm"] - U[-1]["pulseRateBpm"]) / 15 + 0.5
    return {"value": rint(100 * max(0.0, min(1.0, v))), "label": "experimental"}

def trend(U):
    if len(U) < 2: return "insufficient", None, None
    d = U[-1]["pulseRateBpm"] - U[0]["pulseRateBpm"]
    return ("settled" if d <= -3 else "rose" if d >= 3 else "steady"), U[0]["pulseRateBpm"], U[-1]["pulseRateBpm"]

def cues(sid, now):
    out = []
    for c in commands:
        if c["sessionId"] == sid and c["pattern"] in ("rep_pulse", "ease_off"):
            acc = [a for a in c["acks"] if a["result"] == "accepted" and a["atMs"] <= now]
            if acc: out.append(acc[0]["atMs"])
    return out

def summary(sid, now):
    s = sessions[sid]
    inn, pre, post, U = scope(s, now)
    ended = s["state"] == "ended"
    reps = sum(x["repsCompleted"] for x in s["end"]["exercises"]) if ended else len({e["seq"] for e in s["events"] if e["type"] == "rep"})
    eo = sum(x["easeOffCount"] for x in s["end"]["exercises"]) if ended else sum(1 for e in s["events"] if e["type"] == "ease_off" and e.get("active"))
    tr, sb, eb = trend(U)
    mv = [w for w in inn if w["motionValid"] and w["moving"] is not None]
    steady = rint(100 * sum(1 for w in mv if not w["moving"]) / len(mv)) if mv else None
    den = [w for w in inn if problems(w) != ["vibration_overlap"]]
    sig = rint(100 * sum(1 for w in den if usable(w)) / len(den)) if den else None
    words = []
    words.append("No reps were counted in this session." if reps == 0 else "You completed 1 rep." if reps == 1 else f"You completed {reps} reps.")
    words.append("No ease-off cues were needed." if eo == 0 else "You had 1 ease-off cue." if eo == 1 else f"You had {eo} ease-off cues.")
    words.append({"settled": "Your pulse settled as the session went on.", "steady": "Your pulse stayed about the same.",
                  "rose": "Your pulse was a little higher at the end than at the start.",
                  "insufficient": "The band could not get a clear enough pulse reading this time."}[tr])
    if steady is not None:
        words.append("Your hand stayed steady for most of the session." if steady >= 80 else "Your hand moved quite a bit, which makes pulse readings harder.")
    return {"schema": 1, "companionSessionId": sid, "state": s["state"], "startedAtMs": s["startedAtMs"],
            "endedAtMs": s["endedAtMs"], "endReason": s["end"]["endReason"] if ended else None,
            "durationMs": (s["endedAtMs"] - s["startedAtMs"]) if ended else now - s["startedAtMs"],
            "reps": reps, "easeOffs": eo, "cues": len(cues(sid, now)),
            "pulse": {"trend": tr, "startBpm": sb, "endBpm": eb}, "steadyPct": steady, "signalPct": sig,
            "calmIndex": calm(U), "plainWords": words}, (inn, pre, post, U)

NOW = E2 + 130_000
def reviewer_row(sid):
    s = sessions[sid]
    sm, (inn, pre, post, U) = summary(sid, NOW)
    cs = [c for c in commands if c["sessionId"] == sid]
    return {"companionSessionId": sid, "state": s["state"], "events": len(s["events"]), "end": s["end"],
            "featureWindows": len(inn), "usableWindows": sum(1 for w in inn if usable(w)),
            "vibrationOverlapWindows": sum(1 for w in inn if w["motorActive"]),
            "prePulseBpm": pre["pulseRateBpm"] if pre else None, "postPulseBpm": post["pulseRateBpm"] if post else None,
            "hapticCommands": len(cs), "hapticExecuted": sum(1 for c in cs if any(a["result"] == "executed" for a in c["acks"])),
            "startedAtMs": s["startedAtMs"], "endedAtMs": s["endedAtMs"], "durationMs": sm["durationMs"],
            "reps": sm["reps"], "easeOffs": sm["easeOffs"], "cues": sm["cues"], "pulseTrend": sm["pulse"]["trend"],
            "startBpm": sm["pulse"]["startBpm"], "endBpm": sm["pulse"]["endBpm"], "signalPct": sm["signalPct"],
            "steadyPct": sm["steadyPct"], "calmIndex": sm["calmIndex"]}

def timeline(sid):
    s = sessions[sid]
    S, E = s["startedAtMs"], s["endedAtMs"]
    inn, pre, post, U = scope(s, NOW)
    fr, to = S - PRE, (E if E is not None else NOW) + PRE
    ink = {key(w) for w in inn}
    ws = []
    for w in sorted(windows, key=lambda w: w["windowEndMs"]):
        if not (w["windowEndMs"] > fr and w["windowStartMs"] < to and w["windowEndMs"] <= NOW): continue
        role = "in" if key(w) in ink else "pre" if w["windowEndMs"] <= S else "post"
        reading = None
        if len(U) >= 2 and key(w) == key(U[0]): reading = "start"
        if len(U) >= 2 and key(w) == key(U[-1]): reading = "end"
        ws.append({k: w[k] for k in ("boot", "seq", "windowStartMs", "windowEndMs", "contact", "quality", "pulseRateBpm",
                                     "moving", "motionValid", "motorActive", "timingGap")}
                  | {"usable": usable(w), "problems": problems(w), "role": role, "reading": reading})
    ev = [{"source": "mirrorwell", **e} for e in s["events"]]
    ev += [{"source": "band", "type": b["type"], "detail": b["detail"], "atMs": b["atMs"], "boot": b["boot"]}
           for b in band_events if fr <= b["atMs"] <= to]
    ev.sort(key=lambda e: e["atMs"])
    cs = []
    for c in commands:
        if c["sessionId"] != sid: continue
        res = [a["result"] for a in c["acks"]]
        outcome = next((r for r in ("executed", "stopped", "rejected", "accepted") if r in res), "no_ack")
        cs.append({"commandId": c["commandId"], "pattern": c["pattern"], "issuedAtMs": c["issuedAtMs"],
                   "expiresAtMs": c["expiresAtMs"], "maxDurationMs": c["maxDurationMs"], "outcome": outcome,
                   "acks": [{"result": a["result"], "reason": a["reason"], "atMs": a["atMs"]} for a in c["acks"]]})
    return {"schema": 1, "companionSessionId": sid, "startedAtMs": S, "endedAtMs": E,
            "range": {"fromMs": fr, "toMs": to}, "windows": ws, "events": ev, "commands": cs}

def trends():
    rows, days = [], {}
    for sid in sorted(sessions, key=lambda k: sessions[k]["startedAtMs"]):
        s = sessions[sid]
        _, _, _, U = scope(s, NOW)
        d = datetime.datetime.fromtimestamp(s["startedAtMs"] / 1000, IST).strftime("%Y-%m-%d")
        days[d] = days.get(d, 0) + 1
        rows.append({"companionSessionId": sid, "startedAtMs": s["startedAtMs"], "date": d,
                     "meanUsablePulseBpm": r1(sum(w["pulseRateBpm"] for w in U) / len(U)) if U else None,
                     "readings": len(U), "pulseTrend": trend(U)[0]})
    return {"schema": 1, "utcOffsetMinutes": 330, "days": [{"date": d, "sessions": n} for d, n in sorted(days.items())], "sessions": rows}

# ------------------------------------------------------------ live snapshots
def live(now, state, latest, session_open=True, status_problems=None, pulse=None):
    sid = SID2 if session_open else None
    sig = 0
    if state not in ("offline", "stale", "sensor_missing", "collecting", "reading_stale", "contact_required") and latest and latest["contact"]:
        q = latest["quality"]; sig = 1 if q < 0.5 else 2 if q < 0.8 else 3
    reasons = {"offline": "The band is off or out of range.",
               "stale": "Lost touch with the band. Check it is switched on and nearby.",
               "sensor_missing": "A band sensor is not responding. Check its wires.",
               "collecting": "Getting a first reading. Rest your fingertip on the sensor and keep still for about a minute.",
               "reading_stale": "Waiting for a fresh reading from the band.",
               "contact_required": "Rest your fingertip lightly on the sensor.",
               "settling": "Finger found. Keep still; a clear reading takes about a minute.",
               "vibration_overlap": "Pulse paused while the band buzzes.",
               "usable": None}
    if state == "poor_quality":
        reason = "Keep your hand still for a clearer reading." if "moving" in (status_problems or []) else \
                 "The reading is not clear yet. Keep your fingertip still and relaxed on the sensor."
    else:
        reason = reasons[state]
    settling, ci, cue = None, {"value": None, "label": "experimental"}, {"lastAtMs": None, "countThisSession": 0}
    if session_open:
        s = dict(sessions[SID2], endedAtMs=None, state="open")
        _, _, _, U = scope(s, now)
        if len(U) >= 2:
            d = (U[-1]["pulseRateBpm"] + U[-2]["pulseRateBpm"]) / 2 - U[0]["pulseRateBpm"]
            settling = "settling" if d <= -3 else "rising" if d >= 3 else "steady"
        ci = calm(U)
        cs = cues(SID2, now)
        cue = {"lastAtMs": max(cs) if cs else None, "countThisSession": len(cs)}
    stead = None
    if state not in ("offline", "stale", "collecting", "reading_stale") and latest:
        stead = None if latest["moving"] is None else ("moving" if latest["moving"] else "steady")
    return {"schema": 1, "device": "cb-01", "atMs": now, "sessionId": sid, "state": state, "signal": sig, "reason": reason,
            "heart": {"beatIntervalMs": rint(60000 / pulse) if state == "usable" else None},
            "settling": settling, "steadiness": stead, "cue": cue, "calmIndex": ci}

def newest(now):
    ws = [w for w in windows if w["boot"] == BOOT and w["windowEndMs"] <= now]
    return max(ws, key=lambda w: w["windowEndMs"])

def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")

# usable: in session, before the reps start (S+35 s), newest window clean
t = S2 + 36_000; w = newest(t); assert usable(w), problems(w)
dump("live-usable.json", live(t, "usable", w, pulse=w["pulseRateBpm"]))
# vibration: mid-reps
t = S2 + 121_000; w = newest(t); assert problems(w) == ["vibration_overlap"], problems(w)
dump("live-vibration.json", live(t, "vibration_overlap", w))
# moving: newest window moving (and motor) -> poor_quality
t = S2 + 200_500; w = newest(t); assert "moving" in problems(w), problems(w)
dump("live-poor-quality-moving.json", live(t, "poor_quality", w, status_problems=problems(w)))
# contact required: finger lifted (immediate contact event), newest window still has contact
t = S2 + 150_000; w = newest(t)
dump("live-contact-required.json", live(t, "contact_required", w))
# collecting: just connected, no window, no session
dump("live-collecting.json", live(S2 - 140_000, "collecting", None, session_open=False))
# stale: nothing heard for 45 s, session open
t = S2 + 210_000
dump("live-stale.json", live(t, "stale", newest(t)))

sm2, _ = summary(SID2, NOW); dump("summary-settled.json", sm2)
sm1, _ = summary(SID1, NOW); dump("summary-insufficient.json", sm1)
dump("summary-404.json", {"detail": "unknown session"})
dump("reviewer-sessions.json", [reviewer_row(SID1), reviewer_row(SID2)])
dump("reviewer-timeline.json", timeline(SID2))
dump("reviewer-trends.json", trends())
print("NOW", NOW)
for f in sorted(OUT.glob("*.json")): print(f.name, f.stat().st_size)
