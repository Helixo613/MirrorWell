"""SQLite persistence for the Calm Band companion backend (CONTRACT-UI.md §7).

The backend keeps its working state in memory (so the existing endpoints behave exactly as
before) and writes every change through to this file as it arrives. On startup it loads the file
back. Nothing here decides anything; it only saves and loads.

Thread safety: ONE connection (check_same_thread=False). app.py only touches it while holding its
global RLock, so MQTT callbacks (writers) and HTTP requests never use it at the same time.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, started_ms INTEGER NOT NULL, ended_ms INTEGER, state TEXT NOT NULL, end_json TEXT);
CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS session_events_sid ON session_events(session_id);
CREATE TABLE IF NOT EXISTS windows (
  dev TEXT NOT NULL, boot TEXT NOT NULL, seq INTEGER NOT NULL, origin TEXT, end_ms INTEGER NOT NULL,
  body TEXT NOT NULL, PRIMARY KEY (dev, boot, seq));
CREATE TABLE IF NOT EXISTS band_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, boot TEXT NOT NULL DEFAULT '', type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', at_ms INTEGER NOT NULL, body TEXT NOT NULL,
  UNIQUE (boot, type, detail, at_ms));
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY, session_id TEXT, issued_ms INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS acks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, command_id TEXT NOT NULL, body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS acks_cmd ON acks(command_id);
"""


def default_path() -> Path:
    return Path(__file__).resolve().parent / "data" / "calmband.db"


class Store:
    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.executescript(SCHEMA)

    def close(self):
        self.conn.close()

    # ------------------------------------------------------------ writes (caller holds the lock)
    def set_active(self, sid):
        self.conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES('active_session', ?)", (sid,))

    def add_session(self, s: dict):
        self.conn.execute("INSERT OR IGNORE INTO sessions(id, started_ms, ended_ms, state, end_json) VALUES(?,?,NULL,'open',NULL)",
                          (s["id"], s["startedAtMs"]))

    def end_session(self, s: dict):
        self.conn.execute("UPDATE sessions SET ended_ms=?, state=?, end_json=? WHERE id=?",
                          (s.get("endedAtMs"), s["state"], json.dumps(s["end"]), s["id"]))

    def add_event(self, sid: str, event: dict):
        self.conn.execute("INSERT INTO session_events(session_id, body) VALUES(?,?)", (sid, json.dumps(event)))

    def add_window(self, w: dict):
        self.conn.execute("INSERT OR IGNORE INTO windows(dev, boot, seq, origin, end_ms, body) VALUES(?,?,?,?,?,?)",
                          (w["dev"], w["boot"], w["seq"], w.get("origin"), w["windowEndMs"], json.dumps(w)))

    def add_band_event(self, e: dict):
        self.conn.execute("INSERT OR IGNORE INTO band_events(boot, type, detail, at_ms, body) VALUES(?,?,?,?,?)",
                          (e.get("boot") or "", e["type"], e.get("detail") or "", e["atMs"], json.dumps(e)))

    def add_command(self, c: dict):
        body = {k: v for k, v in c.items() if k != "acks"}
        self.conn.execute("INSERT OR IGNORE INTO commands(id, session_id, issued_ms, body) VALUES(?,?,?,?)",
                          (c["commandId"], c.get("sessionId"), c["issuedAtMs"], json.dumps(body)))

    def add_ack(self, command_id: str, ack: dict):
        self.conn.execute("INSERT INTO acks(command_id, body) VALUES(?,?)", (command_id, json.dumps(ack)))

    # ------------------------------------------------------------ load
    def load(self) -> dict:
        c = self.conn
        sessions = {}
        for sid, started, ended, state, end_json in c.execute(
                "SELECT id, started_ms, ended_ms, state, end_json FROM sessions ORDER BY started_ms, rowid"):
            s = {"id": sid, "startedAtMs": started, "events": [], "seen": set(), "state": state,
                 "end": json.loads(end_json) if end_json else None}
            if ended is not None:
                s["endedAtMs"] = ended
            sessions[sid] = s
        for sid, body in c.execute("SELECT session_id, body FROM session_events ORDER BY id"):
            s = sessions.get(sid)
            if s is not None:
                ev = json.loads(body)
                s["events"].append(ev)
                s["seen"].add(ev.get("seq"))
        windows = {}
        for (body,) in c.execute("SELECT body FROM windows ORDER BY end_ms"):
            w = json.loads(body)
            windows[(w["dev"], w["boot"], w["seq"])] = w
        band_events = [json.loads(b) for (b,) in c.execute("SELECT body FROM band_events ORDER BY at_ms, id")]
        commands = {}
        for cid, body in c.execute("SELECT id, body FROM commands ORDER BY issued_ms, rowid"):
            commands[cid] = {**json.loads(body), "acks": []}
        for cid, body in c.execute("SELECT command_id, body FROM acks ORDER BY id"):
            if cid in commands:
                commands[cid]["acks"].append(json.loads(body))
        row = c.execute("SELECT value FROM meta WHERE key='active_session'").fetchone()
        active = row[0] if row and row[0] in sessions and sessions[row[0]]["state"] == "open" else None
        return {"sessions": sessions, "windows": windows, "band_events": band_events,
                "commands": commands, "active": active}
