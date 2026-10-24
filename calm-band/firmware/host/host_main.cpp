// host_main.cpp — "simulated ESP32": runs the firmware core (calm_core) on Linux with simulated
// sensors and a real MQTT connection, so it can replace fake_band.py in the integration checks.
// The ESP32 build (calm_band.ino) wires the SAME core to real pins, Wi-Fi and NTP instead.
//
// Test hooks (topic calmband/<dev>/sim, JSON): {"contact":false} {"moving":true}
// {"button":"stop"} {"offlineMs":8000} {"clockValid":false} {"motionSensor":false}
//
// Like the ESP32 build, nothing is published from inside the MQTT receive callback: commands are
// copied into a small queue there and handled (and acknowledged) from the main loop.
#include <mosquitto.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <string>
#include "../calm_band/calm_core.h"
#include "../calm_band/sim_sources.h"

using namespace calm;

static Config cfg;
static Band* band;
static CommandGate gate(cfg);
static HapticPlayer player;
static Outbox outbox;
static SimPulse simPulse;
static SimMotion simMotion;
static mosquitto* mq;
static char boot[12];
static char topicFeatures[64], topicStatus[64], topicEvents[64], topicCmd[64], topicAck[64], topicSim[64];
static bool connected = false, clockValid = true, motionSensorOk = true;
static const int kCmdSlots = 4;
static char cmdQueue[kCmdSlots][512]; static size_t cmdLen[kCmdSlots]; static int cmdHead = 0, cmdCount = 0;
static uint32_t publishFailures = 0, offlineUntil = 0;
static char playingId[48] = "";
static uint64_t t0;

static uint64_t monoMs() { timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return ts.tv_sec * 1000ull + ts.tv_nsec / 1000000; }
static uint32_t nowT() { return (uint32_t)(monoMs() - t0); }
static int64_t epochMs() { timespec ts; clock_gettime(CLOCK_REALTIME, &ts); return ts.tv_sec * 1000ll + ts.tv_nsec / 1000000; }
static const char* env(const char* k, const char* d) { const char* v = getenv(k); return v && *v ? v : d; }

static bool pub(const char* topic, const char* msg, size_t len, bool retain = false) {
  if (!connected) return false;
  int rc = mosquitto_publish(mq, nullptr, topic, (int)len, msg, 1, retain);
  if (rc != MOSQ_ERR_SUCCESS) { publishFailures++; return false; }  // checked, counted (v5 §12.2)
  return true;
}

static void sendAck(const char* id, const char* result, const char* reason) {
  char b[256]; size_t k = buildAck(cfg, boot, id, result, reason, epochMs(), b, sizeof b);
  pub(topicAck, b, k);
}

static void sendStatus(bool online) {
  char b[320]; size_t k = buildStatus(cfg, boot, online, clockValid, outbox.dropped(), publishFailures,
                                      "simulated", motionSensorOk ? "simulated" : "missing", b, sizeof b);
  pub(topicStatus, b, k, true);
}

static void pressStop() {
  // Local STOP: works with no network at all; reported when possible.
  bool was = player.stop();
  band->setMotor(false, nowT());
  printf("[band] STOP pressed%s\n", was ? " — vibration stopped" : "");
  if (was && playingId[0]) { sendAck(playingId, "stopped", "local_stop"); playingId[0] = 0; }
  char b[256]; size_t k = buildEvent(cfg, boot, "button", "stop", epochMs(), b, sizeof b);
  pub(topicEvents, b, k);
}

static bool flagIs(const std::string& s, const char* key, const char* val) {
  std::string pat = std::string("\"") + key + "\":" + val;
  return s.find(pat) != std::string::npos || s.find(std::string("\"") + key + "\": " + val) != std::string::npos;
}

static void handleCommand(const char* payload, size_t len) {
  CmdDecision d = gate.check(payload, len, clockValid, epochMs());
  if (d.result == CmdResult::Rejected) {
    printf("[band] reject %s %.8s\n", d.reason, d.commandId);
    if (d.commandId[0]) sendAck(d.commandId, "rejected", d.reason);
    return;
  }
  sendAck(d.commandId, "accepted", nullptr);
  if (player.playing() && playingId[0]) sendAck(playingId, "stopped", "replaced");
  player.start(d.pattern, nowT(), d.durationMs);
  snprintf(playingId, sizeof playingId, "%s", d.commandId);
  printf("[band] BUZZ %s (cap %u ms)\n", patternName(d.pattern), d.durationMs);
}

static void onMessage(mosquitto*, void*, const mosquitto_message* m) {
  const char* payload = (const char*)m->payload;
  size_t len = m->payloadlen;
  if (!strcmp(m->topic, topicCmd)) {
    // Queue only. A command that does not fit is turned into an oversize marker, which the
    // gate rejects as malformed (so it is still acknowledged if it carried a readable id).
    if (cmdCount == kCmdSlots) { printf("[band] command queue full — dropped\n"); return; }
    int tail = (cmdHead + cmdCount) % kCmdSlots;
    size_t n = len < sizeof cmdQueue[0] ? len : 0;
    memcpy(cmdQueue[tail], payload, n); cmdLen[tail] = n; cmdCount++;
    return;
  }
  if (!strcmp(m->topic, topicSim)) {
    std::string s(payload, len);
    if (flagIs(s, "contact", "false")) simPulse.contact = false;
    if (flagIs(s, "contact", "true")) simPulse.contact = true;
    if (flagIs(s, "moving", "true")) simMotion.moving = true;
    if (flagIs(s, "moving", "false")) simMotion.moving = false;
    if (flagIs(s, "clockValid", "false")) clockValid = false;
    if (flagIs(s, "clockValid", "true")) clockValid = true;
    if (flagIs(s, "motionSensor", "false")) { motionSensorOk = false; sendStatus(true); }
    if (flagIs(s, "motionSensor", "true")) { motionSensorOk = true; sendStatus(true); }
    if (flagIs(s, "button", "\"stop\"")) pressStop();
    size_t p = s.find("\"offlineMs\":");
    if (p != std::string::npos) {
      uint32_t ms = (uint32_t)atol(s.c_str() + p + 12);
      offlineUntil = nowT() + ms;
      printf("[band] simulating network loss for %u ms\n", ms);
      mosquitto_disconnect(mq);
      connected = false;
    }
  }
}

static void onConnect(mosquitto*, void*, int rc) {
  if (rc) { printf("[band] connect failed rc=%d\n", rc); return; }
  connected = true;
  mosquitto_subscribe(mq, nullptr, topicCmd, 1);
  mosquitto_subscribe(mq, nullptr, topicSim, 1);
  sendStatus(true);
  // Flush windows queued while offline, oldest first, with their ORIGINAL timestamps.
  int n = 0;
  while (!outbox.empty()) {
    if (!pub(topicFeatures, outbox.front(), strlen(outbox.front()))) break;
    outbox.pop(); n++;
  }
  printf("[band] connected (boot %s)%s\n", boot, n ? (std::string(", flushed ") + std::to_string(n) + " queued windows").c_str() : "");
}

static void onDisconnect(mosquitto*, void*, int) { connected = false; }

int main() {
  cfg.deviceId = env("DEVICE_ID", "cb-01");
  cfg.windowMs = atoi(env("WINDOW_MS", "60000"));
  cfg.hopMs = atoi(env("HOP_MS", "15000"));
  cfg.minValidIbis = atoi(env("MIN_IBIS", "20"));
  simPulse.contact = strcmp(env("CONTACT", "1"), "1") == 0;
  band = new Band(cfg);
  srand((unsigned)epochMs());
  snprintf(boot, sizeof boot, "%08x", (unsigned)rand());
  const char* d = cfg.deviceId;
  snprintf(topicFeatures, 64, "calmband/%s/features", d); snprintf(topicStatus, 64, "calmband/%s/status", d);
  snprintf(topicEvents, 64, "calmband/%s/events", d); snprintf(topicCmd, 64, "calmband/%s/cmd", d);
  snprintf(topicAck, 64, "calmband/%s/ack", d); snprintf(topicSim, 64, "calmband/%s/sim", d);

  mosquitto_lib_init();
  mq = mosquitto_new((std::string("band-") + d).c_str(), true, nullptr);
  char will[128]; snprintf(will, sizeof will, "{\"dev\":\"%s\",\"online\":false}", d);
  mosquitto_will_set(mq, topicStatus, strlen(will), will, 1, true);
  if (getenv("MQTT_USER")) mosquitto_username_pw_set(mq, getenv("MQTT_USER"), getenv("MQTT_PASS"));
  mosquitto_message_callback_set(mq, onMessage);
  mosquitto_connect_callback_set(mq, onConnect);
  mosquitto_disconnect_callback_set(mq, onDisconnect);
  const char* host = env("MQTT_HOST", "127.0.0.1");
  int port = atoi(env("MQTT_PORT", "1883"));
  mosquitto_connect(mq, host, port, 30);
  printf("[band] simulated ESP32 %s: window %u ms, hop %u ms, broker %s:%d\n", d, cfg.windowMs, cfg.hopMs, host, port);
  fflush(stdout);

  t0 = monoMs();
  uint32_t nextPulse = 0, nextMotion = 0;
  uint64_t motionCount = 0;
  bool wasMotor = false;
  while (true) {
    uint32_t t = nowT();
    while ((int32_t)(t - nextPulse) >= 0) { band->addPulseSample(nextPulse, simPulse.sample(nextPulse)); nextPulse += 1000 / cfg.pulseHz; }
    while ((int32_t)(t - nextMotion) >= 0) {
      float ax, ay, az; simMotion.sample(nextMotion, &ax, &ay, &az);
      if (motionSensorOk) band->addMotionSample(nextMotion, ax, ay, az);   // failed sensor → no samples
      motionCount++; nextMotion = (uint32_t)(motionCount * 1000 / cfg.motionHz);
    }
    while (cmdCount) { handleCommand(cmdQueue[cmdHead], cmdLen[cmdHead]); cmdHead = (cmdHead + 1) % kCmdSlots; cmdCount--; }
    bool motor = player.tick(t);
    if (motor != wasMotor) { band->setMotor(motor, t); wasMotor = motor; }
    if (player.takeFinished() && playingId[0]) { sendAck(playingId, "executed", nullptr); playingId[0] = 0; }

    Window w;
    if (band->poll(t, clockValid, epochMs(), &w)) {
      char b[Outbox::kLen]; size_t k = buildFeatures(cfg, boot, w, /*replay=*/true, b, sizeof b);
      if (!pub(topicFeatures, b, k)) outbox.push(b, k);  // offline → keep it, timestamps unchanged
    }
    if (!connected && offlineUntil && (int32_t)(t - offlineUntil) >= 0) {
      offlineUntil = 0;
      printf("[band] network back — reconnecting (%d windows queued)\n", outbox.size());
      mosquitto_reconnect(mq);
    }
    if (!offlineUntil) mosquitto_loop(mq, 0, 1);
    fflush(stdout);
    usleep(1000);
  }
}
