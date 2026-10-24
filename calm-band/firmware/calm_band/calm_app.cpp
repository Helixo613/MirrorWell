// calm_app.cpp — Calm Band firmware for ESP32 DevKit V1 (Arduino core 2.0.x).
//
// Hardware layer only: pins, I2C sensors, Wi-Fi, NTP time and MQTT. All logic (feature windows,
// command rules, vibration patterns, STOP, offline queue) lives in calm_core.cpp, which is the
// SAME code the Linux simulation (host/) runs through the integration tests.
//
// Modes:   LIVE   (default)              feature windows + commands
//          RECORD (hold STOP at power-on) raw 100 Hz pulse + 32 Hz motion streamed over MQTT
//          BENCH  (no Wi-Fi configured)   sensor values printed to Serial, no network
//          Replay = SIM_PULSE build: synthetic pulse, windows labelled origin "replay"
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <MQTT.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"
#include "secrets.h"
#include "calm_core.h"
#if SIM_PULSE
#include "sim_sources.h"
#else
#include "MAX30105.h"
#endif

using namespace calm;

// ---------------------------------------------------------------- state
static Config cfg;
static Band* band;
static CommandGate gate;
static HapticPlayer player;
static Outbox outbox;
#if SIM_PULSE
static SimPulse simPulse;
#else
static MAX30105 pulseSensor;
#endif
static WiFiClientSecure tlsNet;
static WiFiClient plainNet;
static MQTTClient mqtt(1024);   // 1 KB buffer: our largest message is ~400 bytes
static char boot[12];
static char tFeatures[48], tStatus[48], tEvents[48], tCmd[48], tAck[48], tRaw[48];
static char playingId[48] = "";
static bool clockValid = false, recordMode = false, benchMode = false, mpuOk = false;
static uint32_t publishFailures = 0, lastReconnect = 0, nextMotionMs = 0, motionCount = 0;
static volatile bool stopPressed = false;
static volatile uint32_t lastStopIsr = 0;

// ---------------------------------------------------------------- time
static int64_t epochMs() {
  struct timeval tv; gettimeofday(&tv, nullptr);
  return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}
static void updateClockValid() { clockValid = time(nullptr) > 1700000000; }  // after Nov 2023 = NTP synced

// ---------------------------------------------------------------- STOP button (works without network)
static void IRAM_ATTR onStopIsr() {
  uint32_t now = millis();
  if (now - lastStopIsr < 200) return;  // debounce
  lastStopIsr = now;
  digitalWrite(PIN_MOTOR, LOW);         // motor off inside the interrupt: no waiting for loop()
  stopPressed = true;
}

// ---------------------------------------------------------------- MQTT helpers
static bool pub(const char* topic, const char* msg, bool retain = false, int qos = 1) {
  if (!mqtt.connected()) return false;
  bool ok = mqtt.publish(topic, msg, retain, qos);
  if (!ok) publishFailures++;           // every return value is checked and counted
  return ok;
}
static void sendAck(const char* id, const char* result, const char* reason) {
  char b[256]; if (buildAck(cfg, boot, id, result, reason, epochMs(), b, sizeof b)) pub(tAck, b);
}
static void sendStatus(bool online) {
  char b[256]; if (buildStatus(cfg, boot, online, clockValid, outbox.dropped(), publishFailures, b, sizeof b)) pub(tStatus, b, true);
}

static void onMessage(MQTTClient*, char topic[], char bytes[], int length) {
  if (strcmp(topic, tCmd) != 0) return;
  updateClockValid();
  CmdDecision d = gate.check(bytes, (size_t)length, clockValid, epochMs());
  if (d.result == CmdResult::Rejected) {
    Serial.printf("[band] reject %s %.8s\n", d.reason, d.commandId);
    if (d.commandId[0]) sendAck(d.commandId, "rejected", d.reason);
    return;
  }
  sendAck(d.commandId, "accepted", nullptr);
  if (player.playing() && playingId[0]) sendAck(playingId, "stopped", "replaced");
  player.start(d.pattern, millis(), cfg.maxPatternMs);
  snprintf(playingId, sizeof playingId, "%s", d.commandId);
  Serial.printf("[band] BUZZ %s\n", patternName(d.pattern));
}

static void connectMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastReconnect < RECONNECT_EVERY_MS) return;
  lastReconnect = millis();
  char will[96]; snprintf(will, sizeof will, "{\"dev\":\"%s\",\"online\":false}", DEVICE_ID);
  mqtt.setWill(tStatus, will, true, 1);
  char clientId[32]; snprintf(clientId, sizeof clientId, "band-%s", DEVICE_ID);
  // Clean session: the broker drops commands sent while we were away (a late buzz is worse than none).
  mqtt.setCleanSession(true);
  if (!mqtt.connect(clientId, MQTT_USER, MQTT_PASS)) {
    Serial.printf("[band] MQTT connect failed (%d)\n", (int)mqtt.lastError());
    return;
  }
  mqtt.subscribe(tCmd, 1);
  sendStatus(true);
  int n = 0;  // flush windows queued while offline, oldest first, original timestamps unchanged
  while (!outbox.empty() && pub(tFeatures, outbox.front())) { outbox.pop(); n++; }
  Serial.printf("[band] MQTT connected (boot %s), flushed %d queued windows\n", boot, n);
}

// ---------------------------------------------------------------- sensors
static bool mpuInit() {
  Wire.beginTransmission(MPU6050_ADDR); Wire.write(0x6B); Wire.write(0x00);   // wake up
  if (Wire.endTransmission() != 0) return false;
  Wire.beginTransmission(MPU6050_ADDR); Wire.write(0x1C); Wire.write(0x00);   // ±2 g
  return Wire.endTransmission() == 0;
}
static bool mpuRead(float* ax, float* ay, float* az) {
  Wire.beginTransmission(MPU6050_ADDR); Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU6050_ADDR, 6) != 6) return false;
  int16_t x = (Wire.read() << 8) | Wire.read();
  int16_t y = (Wire.read() << 8) | Wire.read();
  int16_t z = (Wire.read() << 8) | Wire.read();
  *ax = x / 16384.0f; *ay = y / 16384.0f; *az = z / 16384.0f;               // LSB per g at ±2 g
  return true;
}

static char rawBuf[1024]; static int rawN = 0, rawLen = 0;
static void recordRaw(uint32_t t, float ir) {  // RECORD mode: batches of raw IR samples
  if (rawN == 0) rawLen = snprintf(rawBuf, sizeof rawBuf, "{\"dev\":\"%s\",\"boot\":\"%s\",\"t0\":%lu,\"atMs\":%lld,\"hz\":%lu,\"ir\":[",
                                    DEVICE_ID, boot, (unsigned long)t, (long long)epochMs(), (unsigned long)cfg.pulseHz);
  rawLen += snprintf(rawBuf + rawLen, sizeof rawBuf - rawLen, "%s%.0f", rawN ? "," : "", ir);
  if (++rawN == RAW_BATCH) { snprintf(rawBuf + rawLen, sizeof rawBuf - rawLen, "]}"); pub(tRaw, rawBuf, false, 0); rawN = 0; }
}

static uint32_t nextPulseMs = 0;
static void readPulse(uint32_t now) {
#if SIM_PULSE
  while ((int32_t)(now - nextPulseMs) >= 0) {
    float ir = simPulse.sample(nextPulseMs);
    band->addPulseSample(nextPulseMs, ir);
    if (recordMode) recordRaw(nextPulseMs, ir);
    nextPulseMs += 1000 / cfg.pulseHz;
  }
#else
  // Drain the sensor FIFO; samples are spaced by the configured rate, newest at `now`.
  pulseSensor.check();
  int n = pulseSensor.available();
  for (int i = 0; i < n; i++) {
    uint32_t t = now - (uint32_t)(n - 1 - i) * (1000 / cfg.pulseHz);
    float ir = (float)pulseSensor.getFIFOIR();
    band->addPulseSample(t, ir);
    if (recordMode) recordRaw(t, ir);
    pulseSensor.nextSample();
  }
#endif
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  Serial.begin(115200);
  pinMode(PIN_MOTOR, OUTPUT); digitalWrite(PIN_MOTOR, LOW);
  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  delay(50);
  recordMode = ENABLE_RECORD_BOOT && digitalRead(PIN_BUTTON) == LOW;   // hold STOP at power-on → RECORD
  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), onStopIsr, FALLING);

  cfg.deviceId = DEVICE_ID;
#if FAST_WINDOWS
  cfg.windowMs = 5000; cfg.hopMs = 1000; cfg.minValidIbis = 3;
#endif
  band = new Band(cfg);
  snprintf(boot, sizeof boot, "%08lx", (unsigned long)esp_random());
  snprintf(tFeatures, 48, "calmband/%s/features", DEVICE_ID); snprintf(tStatus, 48, "calmband/%s/status", DEVICE_ID);
  snprintf(tEvents, 48, "calmband/%s/events", DEVICE_ID);     snprintf(tCmd, 48, "calmband/%s/cmd", DEVICE_ID);
  snprintf(tAck, 48, "calmband/%s/ack", DEVICE_ID);           snprintf(tRaw, 48, "calmband/%s/raw", DEVICE_ID);

  Wire.begin(PIN_SDA, PIN_SCL, I2C_HZ);
  mpuOk = mpuInit();
#if !SIM_PULSE
  if (pulseSensor.begin(Wire, I2C_HZ)) {
    // 400 samples/s averaged by 4 → 100 samples/s; IR + red LEDs; 411 µs pulse width (18-bit).
    pulseSensor.setup(60, 4, 2, 400, 411, 4096);
  } else {
    Serial.println("[band] MAX30102 not found — check wiring");
  }
#endif
  Serial.printf("[band] Calm Band %s boot %s mode %s, MPU6050 %s, pulse %s\n", DEVICE_ID, boot,
                recordMode ? "RECORD" : "LIVE", mpuOk ? "ok" : "MISSING", SIM_PULSE ? "simulated" : "MAX30102");

  benchMode = strlen(WIFI_SSID) == 0;
  if (benchMode) {
    // BENCH only (no Wi-Fi → no NTP): seed a fixed clock so windows can be printed to Serial.
    // Nothing is ever published in this mode, so the made-up time never leaves the device.
    struct timeval tv = {1760000000, 0};
    settimeofday(&tv, nullptr);
    Serial.println("[band] BENCH mode: no network, fixed bench clock, windows printed to Serial");
  }
  if (!benchMode) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    configTime(0, 0, "pool.ntp.org", "time.google.com");   // UTC; the backend converts for display
#if MQTT_USE_TLS
    tlsNet.setCACert(MQTT_CA_CERT);
    mqtt.begin(MQTT_HOST, MQTT_PORT, tlsNet);
#else
    mqtt.begin(MQTT_HOST, MQTT_PORT, plainNet);
#endif
    mqtt.onMessageAdvanced(onMessage);
    mqtt.setKeepAlive(30);
  }
}

void loop() {
  uint32_t now = millis();
  updateClockValid();

  // 1. Local STOP first — independent of Wi-Fi, MQTT and the clock.
  if (stopPressed) {
    stopPressed = false;
    bool was = player.stop();
    digitalWrite(PIN_MOTOR, LOW);
    band->setMotor(false, now);
    Serial.printf("[band] STOP pressed%s\n", was ? " — vibration stopped" : "");
    if (was && playingId[0]) { sendAck(playingId, "stopped", "local_stop"); playingId[0] = 0; }
    char b[192]; if (buildEvent(cfg, boot, "button", "stop", epochMs(), b, sizeof b)) pub(tEvents, b);
  }

  // 2. Sensors.
  readPulse(now);
  while ((int32_t)(now - nextMotionMs) >= 0) {
    float ax, ay, az;
    if (mpuOk && mpuRead(&ax, &ay, &az)) band->addMotionSample(nextMotionMs, ax, ay, az);
    motionCount++; nextMotionMs = (uint32_t)((uint64_t)motionCount * 1000 / cfg.motionHz);
  }

  // 3. Vibration pattern runs locally; only start/stop/finish go over the network.
  static bool wasOn = false;
  bool on = player.tick(now);
  if (on != wasOn) { digitalWrite(PIN_MOTOR, on ? HIGH : LOW); band->setMotor(on, now); wasOn = on; }
  if (player.takeFinished() && playingId[0]) { sendAck(playingId, "executed", nullptr); playingId[0] = 0; }

  // 4. Feature windows (LIVE). Offline → queue with original timestamps.
  Window w;
  if (!recordMode && band->poll(now, clockValid, epochMs(), &w)) {
    char b[Outbox::kLen];
    size_t k = buildFeatures(cfg, boot, w, SIM_PULSE, b, sizeof b);
    if (benchMode) Serial.println(b);
    else if (k && !pub(tFeatures, b)) outbox.push(b, k);
  }

  // 5. Network upkeep + status LED.
  if (!benchMode) {
    connectMqtt();
    mqtt.loop();
    digitalWrite(PIN_STATUS_LED, mqtt.connected() ? HIGH : ((now / 250) % 2));
  }
  delay(1);
}
