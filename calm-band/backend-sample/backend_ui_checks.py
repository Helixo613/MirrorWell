"""Checks for the UI/reviewer endpoints (CONTRACT-UI.md) and SQLite persistence.

Run with the backend's venv python (from anywhere):
    calm-band/backend-sample/backend/.venv/Scripts/python.exe calm-band/backend-sample/backend_ui_checks.py

Part A (in-process, no broker): the fixtures in calm-band/sim/fixtures are loaded into the backend and
every new endpoint must reproduce them exactly; both values of CALMBAND_LIVE_USES_CUE_WINDOWS; 404s;
"insufficient" sessions; origin; concurrent reads and writes.
Part B (end to end): its OWN Mosquitto (port 1884), backend (port 8001) and simulated band (--fast) with a
temp CALMBAND_DB, for the scenarios settle, finger_off, moving, motor, dropout, mixed. Restarts the backend
and checks the data is still there. Never touches port 1883 or any other process.
"""
import json
import os
import runpy
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE / "backend"
SIM_DIR = HERE.parent / "sim"
FIX_DIR = SIM_DIR / "fixtures"
MQTT_PORT, HTTP_PORT = 1884, 8001
MOSQ = r"C:\Program Files\mosquitto\mosquitto.exe"
MOSQ_PUB = r"C:\Program Files\mosquitto\mosquitto_pub.exe"
BASE = f"http://127.0.0.1:{HTTP_PORT}"
TMP = Path(tempfile.mkdtemp(prefix="calmband-ui-checks-"))
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  - ' + str(detail)[:300]) if (detail and not ok) else ''}", flush=True)


FORBIDDEN = ("stress", "anxi", "relax", "medical", "diagnos", "heart health", "normal", "abnormal")


def clean_words(words):
    return not any(f in " ".join(words).lower() for f in FORBIDDEN)


# =============================================================================== Part A
os.environ["CALMBAND_DB"] = str(TMP / "part-a.db")
os.environ["CALMBAND_REVIEWER_DIR"] = str(TMP / "reviewer")
os.environ.pop("CALMBAND_LIVE_USES_CUE_WINDOWS", None)
(TMP / "reviewer").mkdir()
(TMP / "reviewer" / "index.html").write_text("<html>reviewer ok</html>", encoding="utf-8")
(TMP / "outside.txt").write_text("secret", encoding="utf-8")
sys.path.insert(0, str(BACKEND_DIR))
import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(app.app)


def reset_state():
    with app.lock:
        for k in ("sessions", "feature_windows", "commands"):
            app.db[k].clear()
        app.db["band_events"].clear()
        app.db["contactLoss"].clear()
        app.db["device"].update({"lastHeardMs": None, "status": None, "boot": None, "contact": None})
        app.active_session["id"] = None


def seed(F, until=None, open_sid=None):
    """Load the fixture data set into the backend's memory (as it would look after the real messages)."""
    reset_state()
    with app.lock:
        for w in F["windows"]:
            if until is not None and w["windowEndMs"] > until:
                continue            # the backend only ever holds windows that already happened
            app.db["feature_windows"][(w["dev"], w["boot"], w["seq"])] = dict(w)
        for sid, s in F["sessions"].items():
            d = {"id": sid, "startedAtMs": s["startedAtMs"], "events": [dict(e) for e in s["events"]],
                 "seen": {e["seq"] for e in s["events"]}, "state": s["state"], "end": s["end"], "endedAtMs": s["endedAtMs"]}
            if sid == open_sid:
                d.update(state="open", end=None)
                del d["endedAtMs"]
            app.db["sessions"][sid] = d
        for c in F["commands"]:
            acks = [dict(a) for a in c["acks"] if until is None or a["atMs"] <= until]
            app.db["commands"][c["commandId"]] = {**{k: v for k, v in c.items() if k != "acks"}, "acks": acks}
        app.db["band_events"].extend(dict(b) for b in F["band_events"])
        app.active_session["id"] = open_sid


CALM_IMPLEMENTED = True


def norm(o):
    """Until the calm index exists, compare everything except its value."""
    if CALM_IMPLEMENTED:
        return o
    if isinstance(o, list):
        return [norm(x) for x in o]
    if isinstance(o, dict):
        return {k: ({**v, "value": None} if k == "calmIndex" else norm(v)) for k, v in o.items()}
    return o


def fx(name):
    return norm(json.loads((FIX_DIR / name).read_text(encoding="utf-8")))


def diff(a, b):
    if isinstance(a, dict) and isinstance(b, dict):
        return {k: (a.get(k), b.get(k)) for k in set(a) | set(b) if a.get(k) != b.get(k)}
    return "differs"


def get(path, c=client):
    r = c.get(path)
    return r.status_code, norm(r.json())


def part_a():
    print("\n== Part A: fixtures, settings, edge cases (in-process) ==")
    argv = sys.argv
    sys.argv = ["make_fixtures.py", str(TMP / "fx-out")]
    F = runpy.run_path(str(FIX_DIR / "make_fixtures.py"))
    sys.argv = argv
    NOW, BOOT, SID1, SID2 = F["NOW"], F["BOOT"], F["SID1"], F["SID2"]
    app.now_ms = lambda: NOW

    seed(F)
    code, body = get(f"/api/companion/sessions/{SID2}/summary")
    check("summary (settled) equals fixture", code == 200 and body == fx("summary-settled.json"), diff(body, fx("summary-settled.json")))
    code, body = get(f"/api/companion/sessions/{SID1}/summary")
    check("summary (no usable windows) equals fixture, nulls not zeros", code == 200 and body == fx("summary-insufficient.json"), body)
    check("insufficient: trend + start/end + calm index are null",
          body["pulse"] == {"trend": "insufficient", "startBpm": None, "endBpm": None} and body["calmIndex"]["value"] is None)
    check("insufficient: plainWords says the band could not get a reading", "The band could not get a clear enough pulse reading this time." in body["plainWords"])
    code, body = get("/api/companion/sessions/nope/summary")
    check("summary unknown session -> 404 {'detail':'unknown session'}", code == 404 and body == fx("summary-404.json"), body)
    code, body = get("/api/companion/reviewer/sessions/nope/timeline")
    check("timeline unknown session -> 404", code == 404 and body == {"detail": "unknown session"})
    code, body = get("/api/companion/reviewer/sessions")
    check("reviewer sessions equal fixture", code == 200 and body == fx("reviewer-sessions.json"), [diff(a, b) for a, b in zip(body, fx("reviewer-sessions.json"))])
    code, body = get(f"/api/companion/reviewer/sessions/{SID2}/timeline")
    check("timeline equals fixture", code == 200 and body == fx("reviewer-timeline.json"), "differs")
    code, body = get("/api/companion/reviewer/trends")
    exp = fx("reviewer-trends.json")
    strip = lambda t: {"schema": t["schema"], "sessions": [{k: v for k, v in x.items() if k != "date"} for x in t["sessions"]]}
    check("trends equal fixture (dates are in the backend's local zone)", code == 200 and strip(body) == strip(exp), body)
    check("trends: one day entry per date, counts add up, dates are YYYY-MM-DD",
          sum(d["sessions"] for d in body["days"]) == 2 and all(len(d["date"]) == 10 for d in body["days"])
          and isinstance(body["utcOffsetMinutes"], int))

    # --- calm index formula (experimental)
    ci = lambda a, b: app.calm_index([{"pulseRateBpm": a}, {"pulseRateBpm": b}])
    check("calm index: same pulse -> 50; drop of 7.5 -> 100; rise of 7.5 -> 0; clamps beyond",
          ci(80, 80)["value"] == 50 and ci(80, 72.5)["value"] == 100 and ci(80, 87.5)["value"] == 0
          and ci(80, 60)["value"] == 100 and ci(80, 99)["value"] == 0 and ci(86.2, 78.5)["value"] == 100)
    check("calm index: labelled experimental; null with fewer than 2 readings (never 0)",
          ci(80, 80)["label"] == "experimental" and app.calm_index([]) == {"value": None, "label": "experimental"}
          and app.calm_index([{"pulseRateBpm": 80}])["value"] is None)

    # --- origin
    code, rows = get("/api/companion/reviewer/sessions")
    check("origin: replay data -> session origin 'replay'", {r["origin"] for r in rows} == {"replay"})
    _, tl = get(f"/api/companion/reviewer/sessions/{SID2}/timeline")
    check("origin: every timeline window carries its origin", all(w["origin"] == "replay" for w in tl["windows"]))
    with app.lock:
        ws2 = [w for w in app.db["feature_windows"].values() if w["boot"] == BOOT]
        ws2[10]["origin"] = "live"
    _, rows = get("/api/companion/reviewer/sessions")
    check("origin: live + replay windows -> 'mixed'", [r["origin"] for r in rows if r["companionSessionId"] == SID2] == ["mixed"])
    with app.lock:
        for w in ws2:
            w["origin"] = "live"
    _, rows = get("/api/companion/reviewer/sessions")
    _, sm = get(f"/api/companion/sessions/{SID2}/summary")
    check("origin: all live -> 'live'", [r["origin"] for r in rows if r["companionSessionId"] == SID2] == ["live"] and sm["origin"] == "live")
    with app.lock:
        app.db["sessions"]["empty"] = {"id": "empty", "startedAtMs": NOW + 10_000_000_000, "events": [], "seen": set(),
                                      "state": "open", "end": None}
    code, sm = get("/api/companion/sessions/empty/summary")
    check("session with no windows: origin null, insufficient, steadyPct/signalPct null, reps 0",
          code == 200 and sm["origin"] is None and sm["pulse"]["trend"] == "insufficient" and sm["steadyPct"] is None
          and sm["signalPct"] is None and sm["reps"] == 0 and sm["state"] == "open" and sm["endReason"] is None)

    # --- live: fixtures, both settings
    def live_case(t, lastheard, contact, open_sid, setting=True, boot=BOOT):
        seed(F, until=t, open_sid=open_sid)
        app.now_ms = lambda: t
        app.LIVE_USES_CUE_WINDOWS = setting
        with app.lock:
            app.db["device"].update({"lastHeardMs": lastheard, "boot": boot,
                                     "status": {"online": True, "boot": boot, "pulseSensor": "ok", "motionSensor": "ok"},
                                     "contact": None if contact is None else {"on": contact, "atMs": t, "boot": boot}})
        return get("/api/companion/live")[1]

    S2 = F["S2"]
    cases = [
        ("live usable", "live-usable.json", S2 + 36_000, S2 + 36_000, True, SID2, True),
        ("live vibration, CUE WINDOWS ON (default)", "live-vibration.json", S2 + 121_000, S2 + 121_000, True, SID2, True),
        ("live vibration, CUE WINDOWS OFF", "live-vibration-clean-only.json", S2 + 121_000, S2 + 121_000, True, SID2, False),
        ("live poor quality (moving)", "live-poor-quality-moving.json", S2 + 200_500, S2 + 200_500, True, SID2, True),
        ("live contact required", "live-contact-required.json", S2 + 150_000, S2 + 150_000, False, SID2, True),
        ("live collecting (no session)", "live-collecting.json", S2 - 140_000, S2 - 140_000, None, None, True),
        ("live stale", "live-stale.json", S2 + 210_000, S2 + 210_000 - 45_000, True, SID2, True),
    ]
    for name, fname, t, heard, contact, sid, setting in cases:
        body = live_case(t, heard, contact, sid, setting)
        check(f"{name} equals {fname}", body == fx(fname), diff(body, fx(fname)))
    app.LIVE_USES_CUE_WINDOWS = True

    # specific rule checks
    t = S2 + 121_000
    on = live_case(t, t, True, SID2, True)
    off = live_case(t, t, True, SID2, False)
    check("setting 1: heart beats during a buzz and is flagged duringCue", on["heart"]["beatIntervalMs"] is not None and on["heart"]["duringCue"] is True and on["state"] == "vibration_overlap")
    check("setting 1: settling may use buzz windows and says so", on["settlingDuringCue"] is True and on["settling"] is not None)
    check("setting 0: no heart during a buzz, reason 'Paused while the band buzzes'",
          off["heart"] == {"beatIntervalMs": None, "duringCue": False} and off["reason"] == "Paused while the band buzzes")
    check("setting 0: settling uses clean windows only", off["settlingDuringCue"] is False)
    check("signal is the same under both settings (quality of the newest window)", on["signal"] == off["signal"] == 3)
    check("calm index is the same under both settings", on["calmIndex"] == off["calmIndex"])
    app.LIVE_USES_CUE_WINDOWS = True
    seed(F)
    app.now_ms = lambda: NOW
    s_on = get(f"/api/companion/sessions/{SID2}/summary")[1]
    app.LIVE_USES_CUE_WINDOWS = False
    s_off = get(f"/api/companion/sessions/{SID2}/summary")[1]
    t_off = get("/api/companion/reviewer/trends")[1]
    app.LIVE_USES_CUE_WINDOWS = True
    t_on = get("/api/companion/reviewer/trends")[1]
    check("summary and trends use clean windows only, whatever the setting", s_on == s_off == fx("summary-settled.json") and t_on == t_off)
    live_on = live_case(S2 + 121_000, S2 + 121_000, True, SID2, True)
    check("no medical/stress wording anywhere in live/summary text",
          clean_words([live_on["reason"] or ""]) and clean_words(s_on["plainWords"]))

    # --- reviewer page
    app.now_ms = lambda: NOW
    r = client.get("/reviewer/")
    check("/reviewer/ serves the reviewer index", r.status_code == 200 and "reviewer ok" in r.text)
    check("/reviewer (no slash) redirects", client.get("/reviewer", follow_redirects=False).status_code in (301, 302, 307, 308))
    check("/reviewer/../ traversal is refused", client.get("/reviewer/..%2Foutside.txt").status_code == 404
          and "secret" not in client.get("/reviewer/..%2Foutside.txt").text)
    old = app.REVIEWER_DIR
    app.REVIEWER_DIR = TMP / "missing"
    r = client.get("/reviewer/")
    check("/reviewer/ with no folder -> 404 (not MirrorWell's page)", r.status_code == 404)
    app.REVIEWER_DIR = old

    # --- concurrent writers and readers
    reset_state()
    base = int(time.time() * 1000)
    errors, N = [], 300

    def writer():
        try:
            for i in range(N):
                w = {"schema": 1, "dev": app.DEVICE_ID, "boot": "cc", "seq": i, "origin": "live",
                     "windowStartMs": base + i * 1000, "windowEndMs": base + i * 1000 + 60_000, "clockValid": True,
                     "contact": True, "quality": 1.0, "pulseRateBpm": 70.0, "motionValid": True, "moving": False,
                     "motorActive": False, "timingGap": False}
                app._store("features", w)
                app._store("events", {"type": "button", "detail": "stop", "atMs": base + i, "boot": "cc"})
        except Exception as e:  # noqa: BLE001
            errors.append(repr(e))

    def reader():
        try:
            c = TestClient(app.app)
            for _ in range(60):
                for p in ("/api/companion/status", "/api/companion/live", "/api/companion/reviewer/sessions",
                          "/api/companion/reviewer/trends"):
                    if c.get(p).status_code != 200:
                        errors.append(f"{p} not 200")
        except Exception as e:  # noqa: BLE001
            errors.append(repr(e))

    app.now_ms = lambda: base + 400_000
    client.post("/api/companion/sessions", json={"companionSessionId": "cc-s", "startedAtMs": base})
    ths = [threading.Thread(target=writer)] + [threading.Thread(target=reader) for _ in range(3)]
    [t.start() for t in ths]
    [t.join(60) for t in ths]
    with app.lock:
        n_mem = len(app.db["feature_windows"])
        n_db = app.store.conn.execute("SELECT COUNT(*) FROM windows WHERE boot='cc'").fetchone()[0]
        n_ev = app.store.conn.execute("SELECT COUNT(*) FROM band_events WHERE boot='cc'").fetchone()[0]
    check("concurrent MQTT-style writes + HTTP reads: no errors", not errors, errors[:3])
    check("concurrent writes: memory and SQLite agree and nothing lost", n_mem == N == n_db and n_ev == N, (n_mem, n_db, n_ev))
    part_model(F)


def part_model(F):
    """Experimental stress model: off = no change; on = only clean windows are scored, formula = hand calculation."""
    print("\n== Part A2: experimental stress model ==")
    NOW, SID1, SID2 = F["NOW"], F["SID1"], F["SID2"]
    stub = HERE.parent / "model" / "stress_lr_stub.json"
    app.now_ms = lambda: NOW
    # --- model off
    app.MODEL = None
    seed(F)
    sm = get(f"/api/companion/sessions/{SID2}/summary")[1]
    rows = get("/api/companion/reviewer/sessions")[1]
    tl = get(f"/api/companion/reviewer/sessions/{SID2}/timeline")[1]
    check("model off: summary equals fixture; stressEstimate and model are null", sm == fx("summary-settled.json") and sm["stressEstimate"] is None and sm["model"] is None)
    check("model off: sessions equal fixture, all null", rows == fx("reviewer-sessions.json") and all(r["stressEstimate"] is None and r["model"] is None for r in rows))
    check("model off: timeline equals fixture; every window's stressEstimate is null", tl == fx("reviewer-timeline.json") and all(w["stressEstimate"] is None for w in tl["windows"]) and tl["model"] is None)
    live_off = get("/api/companion/live")[1]
    # --- loader: missing / invalid / unset -> no model
    import stress_model as sm_mod
    bad = TMP / "bad.json"
    good = json.loads(stub.read_text(encoding="utf-8"))
    cases = {"unset": None, "missing file": str(TMP / "nope.json")}
    for name, mutate in {"2 features": lambda d: d.update(features=d["features"][:2]), "coef length": lambda d: d.update(coef=[1, 2]),
                         "std zero": lambda d: d.update(scalerStd=[1, 0, 1]), "wrong type": lambda d: d.update(type="svm"),
                         "NaN-ish string": lambda d: d.update(intercept="x")}.items():
        d = json.loads(json.dumps(good)); mutate(d)
        f = TMP / f"bad-{len(cases)}.json"; f.write_text(json.dumps(d), encoding="utf-8"); cases[name] = str(f)
    bad.write_text("{not json", encoding="utf-8"); cases["not JSON"] = str(bad)
    check("loader: unset, missing, malformed or invalid model files all give no model",
          all(sm_mod.load(v) is None for v in cases.values()), [k for k, v in cases.items() if sm_mod.load(v) is not None])
    check("loader: the stub file is valid", sm_mod.load(str(stub)) is not None and sm_mod.load(str(stub))["modelVersion"] == "stub-not-trained")
    # --- model on
    app.MODEL = sm_mod.load(str(stub))
    seed(F)
    sm = get(f"/api/companion/sessions/{SID2}/summary")[1]
    rows = get("/api/companion/reviewer/sessions")[1]
    tl = get(f"/api/companion/reviewer/sessions/{SID2}/timeline")[1]
    check("model on: summary equals the -model fixture", sm == fx("summary-settled-model.json"), diff(sm, fx("summary-settled-model.json")))
    check("model on: sessions equal the -model fixture", rows == fx("reviewer-sessions-model.json"))
    check("model on: timeline equals the -model fixture", tl == fx("reviewer-timeline-model.json"))
    check("model on: /live is unchanged", get("/api/companion/live")[1] == live_off and "stressEstimate" not in live_off)
    wins = tl["windows"]
    scored = [w for w in wins if w["stressEstimate"]["value"] is not None]
    check("model on: exactly the clean windows are scored; every other window is null",
          scored and all(w["usable"] for w in scored) and all(w["stressEstimate"]["value"] is None for w in wins if not w["usable"])
          and all(w["stressEstimate"]["value"] is not None for w in wins if w["usable"]))
    check("model on: stub model version and label on every window", all(w["stressEstimate"]["modelVersion"] == "stub-not-trained"
          and w["stressEstimate"]["label"] == "experimental: not a medical measure" for w in wins))
    check("model on: moving, buzzing and contact-less windows are null",
          all(w["stressEstimate"]["value"] is None for w in wins if w["moving"] or w["motorActive"] or not w["contact"] or w["quality"] < 0.8))
    # hand calculation of one window: baseline = start reading (U[0]) pulse
    base = next(w for w in wins if w["reading"] == "start")["pulseRateBpm"]
    w = scored[len(scored) // 2]
    raw = next(x for x in F["windows"] if (x["boot"], x["seq"]) == (w["boot"], w["seq"]))
    m = good
    xs = [raw["pulseRateBpm"], raw["pulseRateSdBpm"], raw["pulseRateBpm"] - base]
    z = m["intercept"] + sum(c * (x - mu) / sd for c, x, mu, sd in zip(m["coef"], xs, m["scalerMean"], m["scalerStd"]))
    hand = 1 / (1 + 2.718281828459045 ** (-z))
    check("model on: score matches a hand calculation of the formula", abs(w["stressEstimate"]["value"] - hand) < 1e-4, (w["stressEstimate"]["value"], hand))
    mean = sum(x["stressEstimate"]["value"] for x in wins if x["role"] == "in" and x["stressEstimate"]["value"] is not None)
    n = sum(1 for x in wins if x["role"] == "in" and x["stressEstimate"]["value"] is not None)
    check("model on: session value is the mean of its scored windows", n and sm["stressEstimate"]["scoredWindows"] == n and abs(sm["stressEstimate"]["value"] - mean / n) < 1e-3)
    s1 = next(r for r in rows if r["companionSessionId"] == SID1)
    check("model on: a session with no clean windows has value null (not 0), but still names the model",
          s1["stressEstimate"]["value"] is None and s1["stressEstimate"]["modelVersion"] == "stub-not-trained" and s1["model"]["balancedAccuracyMean"] == 0.5)
    check("model on: no medical/stress wording leaked into plainWords", clean_words(sm["plainWords"]))
    app.MODEL = None


# =============================================================================== Part B
def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


class Proc:
    def __init__(self, name, argv, cwd, env=None):
        self.log = open(TMP / f"{name}.log", "w", encoding="utf-8")
        self.p = subprocess.Popen(argv, cwd=cwd, env={**os.environ, **(env or {})}, stdout=self.log, stderr=subprocess.STDOUT)

    def stop(self):
        if self.p.poll() is None:
            self.p.terminate()
            try:
                self.p.wait(5)
            except subprocess.TimeoutExpired:
                self.p.kill()
        self.log.close()


def http(method, path, **kw):
    import httpx
    return httpx.request(method, BASE + path, timeout=10, **kw)


def jget(path):
    return http("GET", path).json()


def start_backend(db_path, cue_setting):
    env = {"MQTT_HOST": "127.0.0.1", "MQTT_PORT": str(MQTT_PORT), "DEVICE_ID": "cb-01", "CALMBAND_DB": str(db_path),
           "MIRRORWELL_DIST": str(TMP / "no-dist"), "CALMBAND_REVIEWER_DIR": str(TMP / "reviewer"),
           "CALMBAND_LIVE_USES_CUE_WINDOWS": cue_setting, "STALE_AFTER_MS": "6000"}
    p = Proc("backend", [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(HTTP_PORT)], BACKEND_DIR, env)
    deadline = time.time() + 25
    while time.time() < deadline:
        try:
            http("GET", "/api/companion/status")
            return p
        except Exception:  # noqa: BLE001
            time.sleep(0.4)
    raise RuntimeError("backend did not start")


def snapshot(sid):
    return {"sessions": jget("/api/companion/reviewer/sessions"), "timeline": jget(f"/api/companion/reviewer/sessions/{sid}/timeline"),
            "summary": jget(f"/api/companion/sessions/{sid}/summary"), "trends": jget("/api/companion/reviewer/trends")}


LIVE_KEYS = {"schema", "device", "atMs", "sessionId", "state", "signal", "reason", "heart", "settling", "settlingDuringCue",
             "steadiness", "cue", "calmIndex", "origin"}
STATES = {"offline", "stale", "sensor_missing", "collecting", "reading_stale", "contact_required", "settling",
          "vibration_overlap", "poor_quality", "usable"}


def live_ok(b, setting):
    h = b["heart"]
    ok = set(b) == LIVE_KEYS and b["state"] in STATES and b["signal"] in (0, 1, 2, 3)
    ok &= b["settling"] in (None, "settling", "steady", "rising") and b["steadiness"] in (None, "steady", "moving")
    ok &= b["calmIndex"]["label"] == "experimental" and set(h) == {"beatIntervalMs", "duringCue"}
    ok &= (h["beatIntervalMs"] is None) or b["state"] == "usable" or (b["state"] == "vibration_overlap" and setting == "1" and h["duringCue"])
    ok &= (b["state"] == "usable") == (b["reason"] is None) or (b["state"] == "vibration_overlap" and h["duringCue"] and b["reason"] is None)
    if b["state"] in ("offline", "stale", "sensor_missing", "collecting", "reading_stale", "contact_required"):
        ok &= b["signal"] == 0 and h["beatIntervalMs"] is None
    if b["state"] == "vibration_overlap" and setting == "0":
        ok &= b["reason"] == "Paused while the band buzzes" and h["beatIntervalMs"] is None
    return bool(ok)


def run_scenario(scenario, run_s, cue_setting="1", extra=None):
    tag = f"{scenario}/cue={cue_setting}"
    print(f"\n== Part B: {tag} ==")
    db_path = TMP / f"{scenario}-{cue_setting}.db"
    backend = start_backend(db_path, cue_setting)
    band = None
    try:
        band = Proc("band", [sys.executable, "-u", str(SIM_DIR / "sim_band.py"), "--scenario", scenario, "--port", str(MQTT_PORT), "--fast"], SIM_DIR)
        deadline = time.time() + 20
        while time.time() < deadline and not jget("/api/companion/status")["online"]:
            time.sleep(0.5)
        check(f"[{tag}] simulated band connects", jget("/api/companion/status")["online"])
        sid = f"ui-check-{scenario}-{cue_setting}"
        t0 = int(time.time() * 1000)
        http("POST", "/api/companion/sessions", json={"companionSessionId": sid, "startedAtMs": t0})
        check(f"[{tag}] live: session is active", jget("/api/companion/live")["sessionId"] == sid)
        seen, bad, polls = set(), [], []
        start = time.time()
        rep_at = [3, 5.5, 8]
        reps_sent, ease_sent, extra_done, seq = 0, False, False, 0
        while time.time() - start < run_s:
            el = time.time() - start
            if reps_sent < 3 and el >= rep_at[reps_sent]:
                seq += 1
                http("POST", f"/api/companion/sessions/{sid}/events", json={"type": "rep", "seq": seq, "atMs": int(time.time() * 1000),
                                                                          "repIndex": reps_sent, "peakEffortIndex": 0.6, "durationMs": 1500})
                reps_sent += 1
            if reps_sent == 3 and not ease_sent and el >= 9.5:
                seq += 1
                http("POST", f"/api/companion/sessions/{sid}/events", json={"type": "ease_off", "seq": seq, "atMs": int(time.time() * 1000), "active": True})
                ease_sent = True
            if extra and not extra_done and el >= 6:
                extra()
                extra_done = True
            b = jget("/api/companion/live")
            polls.append(b)
            seen.add(b["state"])
            if not live_ok(b, cue_setting):
                bad.append(b)
            time.sleep(0.5)
        check(f"[{tag}] live: schema and rules hold on every poll ({len(polls)} polls, states {sorted(seen)})", not bad, bad[:1])
        t1 = int(time.time() * 1000)
        end_body = {"localSessionId": "local-1", "endReason": "completed", "endedAtMs": t1,
                    "exercises": [{"exerciseId": "EX_SMILE", "repsCompleted": 3, "meanSymmetryIndex": 0.7, "meanEffortIndex": 0.6,
                                   "easeOffCount": 1, "lowQualityFramePct": 0.0}]}
        mid = jget(f"/api/companion/sessions/{sid}/summary")
        check(f"[{tag}] summary while open: state open, no endedAt, reps counted", mid["state"] == "open" and mid["endedAtMs"] is None and mid["endReason"] is None and mid["reps"] == 3)
        http("POST", f"/api/companion/sessions/{sid}/end", json=end_body)
        time.sleep(8 if scenario != "dropout" else 1)
        sm = jget(f"/api/companion/sessions/{sid}/summary")
        check(f"[{tag}] summary: ended, reps 3, ease-offs 1, duration right",
              sm["state"] == "ended" and sm["reps"] == 3 and sm["easeOffs"] == 1 and sm["durationMs"] == t1 - t0 and sm["endReason"] == "completed")
        check(f"[{tag}] summary: plainWords start with the reps and ease-off sentences",
              sm["plainWords"][:2] == ["You completed 3 reps.", "You had 1 ease-off cue."] and clean_words(sm["plainWords"]))
        trend = sm["pulse"]["trend"]
        check(f"[{tag}] summary: pulse trend '{trend}' is consistent (nulls when insufficient, numbers otherwise)",
              (trend == "insufficient" and sm["pulse"]["startBpm"] is None and sm["pulse"]["endBpm"] is None and sm["calmIndex"]["value"] is None)
              or (trend != "insufficient" and isinstance(sm["pulse"]["startBpm"], float) and isinstance(sm["pulse"]["endBpm"], float)))
        check(f"[{tag}] summary: percentages are null or whole 0-100",
              all(v is None or (isinstance(v, int) and 0 <= v <= 100) for v in (sm["steadyPct"], sm["signalPct"])))
        check(f"[{tag}] origin is 'replay' (simulated band never passes as live)", sm["origin"] == "replay")
        if scenario != "dropout":
            check(f"[{tag}] cues counted from accepted acks", sm["cues"] >= 1, sm["cues"])
        tl = jget(f"/api/companion/reviewer/sessions/{sid}/timeline")
        w = tl["windows"]
        check(f"[{tag}] timeline: {len(w)} windows, ordered, usable matches problems, origin on each",
              len(w) > 0 and [x["windowEndMs"] for x in w] == sorted(x["windowEndMs"] for x in w)
              and all(x["usable"] == (x["problems"] == []) and x["origin"] == "replay" and x["role"] in ("pre", "in", "post") for x in w))
        check(f"[{tag}] timeline: MirrorWell events kept with source",
              sum(1 for e in tl["events"] if e["source"] == "mirrorwell" and e["type"] == "rep") == 3)
        cmds = tl["commands"]
        if scenario != "dropout":
            check(f"[{tag}] timeline: cue commands with acks, an 'executed' outcome, session_complete present",
                  any(c["outcome"] == "executed" for c in cmds) and any(c["pattern"] == "session_complete" for c in cmds)
                  and all(a["result"] in ("accepted", "executed", "rejected", "stopped") for c in cmds for a in c["acks"]))
        rows = jget("/api/companion/reviewer/sessions")
        row = next((r for r in rows if r["companionSessionId"] == sid), None)
        check(f"[{tag}] reviewer sessions: row matches the summary",
              row and row["pulseTrend"] == trend and row["reps"] == 3 and row["cues"] == sm["cues"] and row["origin"] == "replay"
              and row["signalPct"] == sm["signalPct"] and row["calmIndex"] == sm["calmIndex"] and row["usableWindows"] <= row["featureWindows"])
        tr = jget("/api/companion/reviewer/trends")
        trow = next((r for r in tr["sessions"] if r["companionSessionId"] == sid), None)
        check(f"[{tag}] trends: session listed with matching trend/readings",
              trow and trow["pulseTrend"] == trend and (trow["meanUsablePulseBpm"] is None) == (trow["readings"] == 0))
        check(f"[{tag}] unknown session -> 404 on summary and timeline",
              http("GET", "/api/companion/sessions/nope/summary").status_code == 404
              and http("GET", "/api/companion/reviewer/sessions/nope/timeline").status_code == 404)
        page = http("GET", "/reviewer/")
        check(f"[{tag}] /reviewer/ served by the backend", page.status_code == 200 and "reviewer ok" in page.text)

        # scenario specifics
        bands = [e for e in tl["events"] if e["source"] == "band"]
        if scenario in ("finger_off", "mixed"):
            check(f"[{tag}] band contact events stored and shown", any(e["type"] == "contact" and e["detail"] == "off" for e in bands), bands)
        if scenario == "moving":
            check(f"[{tag}] moving: poor_quality seen, no usable pulse, insufficient", "poor_quality" in seen and trend == "insufficient")
            check(f"[{tag}] moving: steadiness reported as moving", any(p["steadiness"] == "moving" for p in polls))
        if scenario == "settle":
            check(f"[{tag}] settle: a beating heart was shown", any(p["heart"]["beatIntervalMs"] for p in polls))
        if scenario == "motor":
            check(f"[{tag}] motor: windows overlapping the motor are flagged", any(x["motorActive"] for x in w))
            check(f"[{tag}] motor: band STOP button event stored", any(e["type"] == "button" and e["detail"] == "stop" for e in bands), bands)
            if cue_setting == "0":
                check(f"[{tag}] setting 0: heart never beats during a buzz",
                      all(p["heart"]["beatIntervalMs"] is None for p in polls if p["state"] == "vibration_overlap"))
        if scenario == "dropout":
            check(f"[{tag}] dropout: backend shows the band as stale/offline (seen {sorted(seen)})", bool(seen & {"stale", "offline"}))

        # restart: stop band, snapshot, restart backend on the same DB, compare
        band.stop()
        band = None
        time.sleep(1)
        before = snapshot(sid)
        n_before = len(before["timeline"]["windows"])
        backend.stop()
        time.sleep(1)
        backend = start_backend(db_path, cue_setting)
        after = snapshot(sid)
        check(f"[{tag}] RESTART: reviewer sessions, timeline (incl. windows, events, commands, acks), summary and trends identical",
              before == after, [k for k in before if before[k] != after[k]])
        check(f"[{tag}] RESTART: {n_before} windows still there, no active session invented",
              len(after["timeline"]["windows"]) == n_before and jget("/api/companion/live")["sessionId"] is None)
    finally:
        if band:
            band.stop()
        backend.stop()


def part_b():
    if port_open(MQTT_PORT) or port_open(HTTP_PORT):
        print(f"FAIL  port {MQTT_PORT} or {HTTP_PORT} already in use; not starting Part B")
        check("ports 1884/8001 free", False)
        return
    conf = TMP / "mosquitto.conf"
    conf.write_text(f"listener {MQTT_PORT} 127.0.0.1\nallow_anonymous true\n", encoding="ascii")
    broker = Proc("mosquitto", [MOSQ, "-c", str(conf)], str(TMP))
    try:
        deadline = time.time() + 10
        while time.time() < deadline and not port_open(MQTT_PORT):
            time.sleep(0.3)
        check("own broker started on 1884", port_open(MQTT_PORT))
        pub_stop = lambda: subprocess.run([MOSQ_PUB, "-h", "127.0.0.1", "-p", str(MQTT_PORT), "-t", "calmband/cb-01/sim",
                                           "-m", json.dumps({"button": "stop"})], check=False)
        run_scenario("settle", 16)
        run_scenario("finger_off", 14)
        run_scenario("moving", 14)
        run_scenario("motor", 16, "1", extra=pub_stop)
        run_scenario("motor", 16, "0", extra=pub_stop)
        run_scenario("dropout", 28)
        run_scenario("mixed", 24)
    finally:
        broker.stop()


if __name__ == "__main__":
    only_a = "--part-a" in sys.argv
    try:
        part_a()
        if not only_a:
            part_b()
    finally:
        passed = sum(results)
        print(f"\n{passed}/{len(results)} checks passed", flush=True)
        shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(0 if results and all(results) else 1)
