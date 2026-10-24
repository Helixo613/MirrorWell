"""Fake Calm Band — stands in for the ESP32 firmware (Codex owns the real Wokwi/firmware work).

Mirrors the firmware contract from plan v5 §12:
  * publishes a feature window every WINDOW_HOP_S (15 s on the real band; faster for tests),
    each with device id, boot id, sequence number, window start/end and quality flags,
  * subscribes to its cmd topic, REJECTS expired and duplicate command ids, executes the
    pattern locally ("BUZZ ..."), and acknowledges every command with its outcome.
"""
from __future__ import annotations

import json
import math
import os
import random
import threading
import time
import uuid

import paho.mqtt.client as mqtt

DEV = os.environ.get("DEVICE_ID", "cb-01")
HOP_S = float(os.environ.get("WINDOW_HOP_S", "15"))
BOOT = str(uuid.uuid4())[:8]
CONTACT = os.environ.get("CONTACT", "1") == "1"

seen_commands: set[str] = set()
seq = 0
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"band-{DEV}")
client.will_set(f"calmband/{DEV}/status", json.dumps({"dev": DEV, "online": False}), qos=1, retain=True)


def now_ms() -> int:
    return int(time.time() * 1000)


def ack(cmd_id: str, result: str, reason: str | None = None):
    client.publish(f"calmband/{DEV}/ack", json.dumps(
        {"commandId": cmd_id, "dev": DEV, "boot": BOOT, "result": result, "reason": reason, "atMs": now_ms()}
    ), qos=1)


def on_message(c, u, msg):
    cmd = json.loads(msg.payload)
    cid = cmd["commandId"]
    if cid in seen_commands:
        ack(cid, "rejected", "duplicate")
        print(f"[band] reject duplicate {cid[:8]}", flush=True)
        return
    seen_commands.add(cid)
    if now_ms() > cmd["expiresAtMs"]:
        ack(cid, "rejected", "expired")
        print(f"[band] reject expired {cid[:8]}", flush=True)
        return
    ack(cid, "accepted")
    print(f"[band] BUZZ {cmd['pattern']} (≤{cmd['maxDurationMs']} ms)", flush=True)
    ack(cid, "executed")


def on_connect(c, u, f, rc, p=None):
    c.subscribe(f"calmband/{DEV}/cmd", qos=1)
    c.publish(f"calmband/{DEV}/status", json.dumps({"dev": DEV, "boot": BOOT, "online": True}), qos=1, retain=True)


client.on_message = on_message
client.on_connect = on_connect
client.connect(os.environ.get("MQTT_HOST", "127.0.0.1"), int(os.environ.get("MQTT_PORT", "1883")))
client.loop_start()

t0 = time.time()
while True:
    time.sleep(HOP_S)
    seq += 1
    end = now_ms()
    # Synthetic pulse summary: ~72 bpm with slow drift; contact flag drives quality.
    hr = 72 + 4 * math.sin((time.time() - t0) / 30) + random.uniform(-1, 1)
    window = {
        "schema": 1, "dev": DEV, "boot": BOOT, "seq": seq, "origin": "replay",
        "windowStartMs": end - 60_000, "windowEndMs": end, "clockValid": True,
        "contact": CONTACT, "quality": 0.95 if CONTACT else 0.0,
        "pulseRateBpm": round(hr, 1) if CONTACT else None,
        "validBeatFraction": 0.97 if CONTACT else 0.0,
        "motionRms_g": round(random.uniform(0.005, 0.02), 4), "motorActive": False,
    }
    client.publish(f"calmband/{DEV}/features", json.dumps(window), qos=1)
