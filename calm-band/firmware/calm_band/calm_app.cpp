// calm_app.cpp — Calm Band firmware for ESP32 DevKit V1 (Arduino core 2.0.x).
//
// Hardware layer only: pins, I2C sensors, Wi-Fi, NTP time and MQTT. All logic (feature windows,
// command rules, vibration patterns, STOP, offline queue) lives in calm_core.cpp, which is the
// SAME code the Linux simulation (host/) runs through the integration tests.
//
// Modes:   LIVE   (default)              feature windows + commands
//          RECORD (hold STOP at power-on) raw 100 Hz pulse streamed over MQTT
//          BENCH  (no Wi-Fi configured)   sensor values printed to Serial, no network
//          Replay = SIM_PULSE build: synthetic pulse, windows labelled origin "replay"
//
// Network calls (TLS handshakes, reconnects, QoS 1 publishes) can block loop() for seconds, so
// the time-critical work does not run in loop():
//   * SENSORS: a FreeRTOS task (core 1, priority above loop) wakes every 10 ms. It drains the
//     MAX30102's own 32-sample FIFO directly (the driver's 4-sample buffer is bypassed), stamps
//     samples from the read time, and reports FIFO overflow as lost samples (→ timingGap). Motion
//     is read at 32 Hz and stamped with the ACTUAL read time; missed slots are skipped, never
//     back-filled with late readings (→ lower motionCoverage). The task never touches the network.
//   * MOTOR: a 2 ms esp_timer steps the vibration pattern and turns the motor off once it has
//     been on continuously for Config::maxPatternMs. (This is a timer task, so it is independent
//     of a blocked loop(), but it is software, not an electrical cut-off.)
//   * MQTT: nothing is published inside the receive callback (arduino-mqtt forbids it). Commands
//     are queued there and handled in loop(): validate → re-check expiry → start the motor →
//     then send the acks. There is no network call between the expiry re-check and the start.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <MQTT.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
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
static Band* band;                 // shared by the sensor task and loop(): always under bandLock
static SemaphoreHandle_t bandLock;
static CommandGate gate(cfg);
static HapticPlayer player;        // shared by the motor timer and loop(): always under motorMux
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
static bool clockValid = false, recordMode = false, benchMode = false;
static volatile bool mpuOk = false, pulseOk = SIM_PULSE, sensorHealthChanged = false;
static uint32_t publishFailures = 0, lastReconnect = 0;
static volatile bool stopPressed = false;
static volatile uint32_t lastStopIsr = 0;
static volatile uint32_t pulseLost = 0, motionMissed = 0;   // totals, for Serial diagnostics
static volatile uint32_t pulseAdded = 0, motionSlots = 0;    // counters used by SENSOR_SELFTEST

// Commands received in the MQTT callback, handled later in loop().
static const int kCmdSlots = 4;
static char cmdQueue[kCmdSlots][512];
static size_t cmdLen[kCmdSlots];
static int cmdHead = 0, cmdCount = 0;

// RECORD mode: the sensor task fills raw batches; loop() publishes them.
static portMUX_TYPE rawMux = portMUX_INITIALIZER_UNLOCKED;
static char rawReady[2][1024];
static int rawReadyCount = 0, rawReadyHead = 0;
static volatile uint32_t rawDropped = 0;

// ---------------------------------------------------------------- time
static int64_t epochMs() {
  struct timeval tv; gettimeofday(&tv, nullptr);
  return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}
static void updateClockValid() { clockValid = time(nullptr) > 1700000000; }  // after Nov 2023 = NTP synced

// ---------------------------------------------------------------- motor timer
static portMUX_TYPE motorMux = portMUX_INITIALIZER_UNLOCKED;
static esp_timer_handle_t motorTimer;
static bool timerMotorOn = false;
static uint32_t motorOnSince = 0;
static volatile uint32_t forcedOffCount = 0;
struct MotorEdge { bool on; uint32_t t; };
static MotorEdge edges[16];
static int edgeCount = 0;          // edges waiting for loop() to pass to band->setMotor()

static void motorTick(void*) {     // runs in the esp_timer task, not in loop()
  uint32_t now = millis();
  portENTER_CRITICAL(&motorMux);
  bool on;
  if (stopPressed) { on = false; }                         // STOP pending → never re-energise
  else {
    on = player.tick(now);
    if (on && timerMotorOn && now - motorOnSince > cfg.maxPatternMs) {
      player.stop();                                       // backstop: continuous-on limit
      on = false;
      forcedOffCount++;
    }
  }
  if (on != timerMotorOn) {
    digitalWrite(PIN_MOTOR, on ? HIGH : LOW);
    if (on) motorOnSince = now;
    timerMotorOn = on;
    if (edgeCount < 16) edges[edgeCount++] = {on, now};
  }
  portEXIT_CRITICAL(&motorMux);
}

// ---------------------------------------------------------------- STOP button (works without network)
static void IRAM_ATTR onStopIsr() {
  uint32_t now = millis();
  if (now - lastStopIsr < 200) return;  // debounce
  lastStopIsr = now;
  digitalWrite(PIN_MOTOR, LOW);         // motor off inside the interrupt: no waiting for loop()
  stopPressed = true;
}

// ---------------------------------------------------------------- sensors (sensor task only)
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
  if (++rawN == RAW_BATCH) {
    snprintf(rawBuf + rawLen, sizeof rawBuf - rawLen, "]}");
    portENTER_CRITICAL(&rawMux);
    if (rawReadyCount < 2) { memcpy(rawReady[(rawReadyHead + rawReadyCount) % 2], rawBuf, sizeof rawBuf); rawReadyCount++; }
    else rawDropped++;                                     // loop() is behind: drop, never block
    portEXIT_CRITICAL(&rawMux);
    rawN = 0;
  }
}

static void addPulse(uint32_t t, float ir) {
  xSemaphoreTake(bandLock, portMAX_DELAY);
  band->addPulseSample(t, ir);
  xSemaphoreGive(bandLock);
  pulseAdded++;
  if (recordMode) recordRaw(t, ir);
}

#if !SIM_PULSE
// Read the MAX30102's 32-sample hardware FIFO directly. Registers: 0x04 write pointer,
// 0x05 overflow counter, 0x06 read pointer, 0x07 data (LED mode 2: red then IR, 3 bytes each).
static uint8_t maxReg(uint8_t reg) { return pulseSensor.readRegister8(0x57, reg); }
static void drainPulseFifo(uint32_t now) {
  uint8_t wr = maxReg(0x04), ovf = maxReg(0x05), rd = maxReg(0x06);
  int n = (wr - rd) & 31;
  if (ovf) n = 32;                                         // FIFO full and rolled over
  const int per = 6, maxBatch = 20;                        // 20 × 6 = 120 B, under Wire's 128 B
  uint32_t spacing = 1000 / cfg.pulseHz;
  uint32_t tOldest = now - (uint32_t)(n > 0 ? n - 1 : 0) * spacing;
  if (ovf) {                                               // samples older than the FIFO are gone
    xSemaphoreTake(bandLock, portMAX_DELAY);
    band->notePulseLoss(tOldest - spacing, ovf);
    xSemaphoreGive(bandLock);
    pulseLost += ovf;
  }
  int done = 0;
  while (done < n) {
    int k = n - done < maxBatch ? n - done : maxBatch;
    Wire.beginTransmission(0x57); Wire.write(0x07);
    if (Wire.endTransmission(false) != 0) return;
    if (Wire.requestFrom(0x57, k * per) != k * per) return;
    for (int i = 0; i < k; i++) {
      uint32_t r = 0, ir = 0;
      for (int b = 0; b < 3; b++) r = (r << 8) | Wire.read();
      for (int b = 0; b < 3; b++) ir = (ir << 8) | Wire.read();
      (void)r;
      addPulse(tOldest + (uint32_t)(done + i) * spacing, (float)(ir & 0x3FFFF));
    }
    done += k;
  }
}
#endif

static void sensorTask(void*) {
  // Motion schedule kept in microseconds (64-bit: no wrap) so 32 Hz has no rounding drift.
  const uint64_t motionPeriodUs = 1000000ULL / cfg.motionHz;
  uint64_t nextMotionUs = (uint64_t)esp_timer_get_time();
  uint32_t mpuFailStreak = 0, lastMpuRetry = 0;
#if SIM_PULSE
  uint32_t nextPulse = millis();
#endif
  TickType_t wake = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(10));
    uint32_t now = millis();

    // Pulse.
#if SIM_PULSE
    while ((int32_t)(now - nextPulse) >= 0) { addPulse(nextPulse, simPulse.sample(nextPulse)); nextPulse += 1000 / cfg.pulseHz; }
#else
    if (pulseOk) drainPulseFifo(now);
#endif

    // Motion: one reading per 32 Hz slot, stamped with the time it was actually read.
    uint64_t nowUs = (uint64_t)esp_timer_get_time();
    if (nowUs >= nextMotionUs) {
      uint64_t late = nowUs - nextMotionUs;
      if (late >= motionPeriodUs) {                        // slots missed: skip them, don't back-fill
        uint64_t missed = late / motionPeriodUs;
        motionMissed += (uint32_t)missed;
        nextMotionUs += missed * motionPeriodUs;
      }
      nextMotionUs += motionPeriodUs;
      motionSlots++;
      float ax, ay, az;
      if (mpuOk) {
        if (mpuRead(&ax, &ay, &az)) {
          xSemaphoreTake(bandLock, portMAX_DELAY);
          band->addMotionSample(now, ax, ay, az);
          xSemaphoreGive(bandLock);
          mpuFailStreak = 0;
        } else if (++mpuFailStreak >= 32) {                // ~1 s of failed reads → sensor lost
          mpuOk = false; lastMpuRetry = now; sensorHealthChanged = true;
        }
      } else if (now - lastMpuRetry > 5000) {              // try to bring a lost sensor back
        lastMpuRetry = now;
        if (mpuInit()) { mpuOk = true; mpuFailStreak = 0; sensorHealthChanged = true; }
      }
    }
  }
}

// ---------------------------------------------------------------- MQTT helpers (loop() only)
static bool pub(const char* topic, const char* msg, bool retain = false, int qos = 1) {
  if (!mqtt.connected()) return false;
  bool ok = mqtt.publish(topic, msg, retain, qos);
  if (!ok) publishFailures++;           // every return value is checked and counted
  return ok;
}
static void sendAck(const char* id, const char* result, const char* reason) {
  char b[256]; if (buildAck(cfg, boot, id, result, reason, epochMs(), b, sizeof b)) pub(tAck, b);
}
static const char* pulseHealth() { return SIM_PULSE ? "simulated" : (pulseOk ? "ok" : "missing"); }
static const char* motionHealth() { return mpuOk ? "ok" : "missing"; }
static void sendStatus(bool online) {
  char b[320];
  if (buildStatus(cfg, boot, online, clockValid, outbox.dropped(), publishFailures, pulseHealth(), motionHealth(), b, sizeof b))
    pub(tStatus, b, true);
}

// MQTT receive callback: copy only. No publishing here (see the note at the top of the file).
static void onMessage(MQTTClient*, char topic[], char bytes[], int length) {
  if (strcmp(topic, tCmd) != 0) return;
  if (cmdCount == kCmdSlots) return;                       // queue full: dropped, never late
  int tail = (cmdHead + cmdCount) % kCmdSlots;
  size_t n = (length > 0 && (size_t)length < sizeof cmdQueue[0]) ? (size_t)length : 0;  // oversize → malformed
  memcpy(cmdQueue[tail], bytes, n);
  cmdLen[tail] = n;
  cmdCount++;
}

static void handleCommand(const char* payload, size_t len) {
  updateClockValid();
  CmdDecision d = gate.check(payload, len, clockValid, epochMs());
  if (d.result == CmdResult::Rejected) {
    Serial.printf("[band] reject %s %.8s\n", d.reason, d.commandId);
    if (d.commandId[0]) sendAck(d.commandId, "rejected", d.reason);
    return;
  }
  // Re-check expiry and start the motor with NO network operation in between. Acks come after.
  bool started = false, replacing = false;
  portENTER_CRITICAL(&motorMux);
  if (CommandGate::stillValid(d, epochMs())) {
    replacing = player.playing();
    player.start(d.pattern, millis(), d.durationMs);
    started = true;
  }
  portEXIT_CRITICAL(&motorMux);
  if (!started) { sendAck(d.commandId, "rejected", "expired"); return; }
  char replacedId[48]; snprintf(replacedId, sizeof replacedId, "%s", playingId);
  snprintf(playingId, sizeof playingId, "%s", d.commandId);
  sendAck(d.commandId, "accepted", nullptr);
  if (replacing && replacedId[0]) sendAck(replacedId, "stopped", "replaced");
  Serial.printf("[band] BUZZ %s (cap %u ms)\n", patternName(d.pattern), (unsigned)d.durationMs);
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
  bandLock = xSemaphoreCreateMutex();
  snprintf(boot, sizeof boot, "%08lx", (unsigned long)esp_random());
  snprintf(tFeatures, 48, "calmband/%s/features", DEVICE_ID); snprintf(tStatus, 48, "calmband/%s/status", DEVICE_ID);
  snprintf(tEvents, 48, "calmband/%s/events", DEVICE_ID);     snprintf(tCmd, 48, "calmband/%s/cmd", DEVICE_ID);
  snprintf(tAck, 48, "calmband/%s/ack", DEVICE_ID);           snprintf(tRaw, 48, "calmband/%s/raw", DEVICE_ID);

  Wire.begin(PIN_SDA, PIN_SCL, I2C_HZ);
  mpuOk = mpuInit();
#if !SIM_PULSE
  pulseOk = pulseSensor.begin(Wire, I2C_HZ);
  if (pulseOk) {
    // 400 samples/s averaged by 4 → 100 samples/s; IR + red LEDs; 411 µs pulse width (18-bit).
    pulseSensor.setup(60, 4, 2, 400, 411, 4096);
  } else {
    Serial.println("[band] MAX30102 not found — check wiring");
  }
#endif
  Serial.printf("[band] Calm Band %s boot %s mode %s, MPU6050 %s, pulse %s\n", DEVICE_ID, boot,
                recordMode ? "RECORD" : "LIVE", mpuOk ? "ok" : "MISSING", SIM_PULSE ? "simulated" : (pulseOk ? "MAX30102" : "MISSING"));

  // Motor pattern timer: independent of loop() and of any blocking network call.
  esp_timer_create_args_t ta = {};
  ta.callback = motorTick;
  ta.name = "motor";
  esp_timer_create(&ta, &motorTimer);
  esp_timer_start_periodic(motorTimer, 2000);              // every 2 ms

#if MOTOR_SELFTEST
  // Test build only: start the longest pattern, then block this task for 3 s, as a stuck TLS
  // handshake would. The motor timer must still end the pattern on time.
  {
    uint32_t t0 = millis();
    portENTER_CRITICAL(&motorMux);
    player.start(Pattern::SessionComplete, t0, cfg.maxPatternMs);
    portEXIT_CRITICAL(&motorMux);
    delay(3000);                                           // loop() is NOT running during this
    portENTER_CRITICAL(&motorMux);
    MotorEdge e[16]; int n = edgeCount; memcpy(e, edges, sizeof(MotorEdge) * n); edgeCount = 0;
    bool stillOn = timerMotorOn;
    portEXIT_CRITICAL(&motorMux);
    uint32_t onMs = 0, lastOff = 0;
    for (int i = 0; i < n; i++) {
      Serial.printf("[selftest] motor %s at +%lu ms\n", e[i].on ? "ON " : "OFF", (unsigned long)(e[i].t - t0));
      if (!e[i].on && i > 0) { onMs += e[i].t - e[i - 1].t; lastOff = e[i].t - t0; }
    }
    Serial.printf("[selftest] %d edges, motor on %lu ms total, last off at +%lu ms, still on after 3 s stall: %s\n",
                  n, (unsigned long)onMs, (unsigned long)lastOff, stillOn ? "YES" : "no");
    Serial.printf("[selftest] RESULT %s\n", (!stillOn && lastOff <= cfg.maxPatternMs + 10 && n == 6) ? "PASS" : "FAIL");
  }
#endif

  // Sensor task on core 1 (same core as loop(), higher priority, so a blocked loop can't starve
  // it; Wi-Fi runs on core 0).
  xTaskCreatePinnedToCore(sensorTask, "sensors", 4096, nullptr, 3, nullptr, 1);

#if SENSOR_SELFTEST
  // Test build only: block this task for 3 s (as a stuck network call would) and check that the
  // sensor task kept sampling on its own: ~300 pulse samples and ~96 motion slots expected.
  {
    delay(500);
    uint32_t p0 = pulseAdded, m0 = motionSlots, miss0 = motionMissed, lost0 = pulseLost, t0 = millis();
    delay(3000);
    uint32_t dt = millis() - t0, p = pulseAdded - p0, m = motionSlots - m0;
    uint32_t miss = motionMissed - miss0, lost = pulseLost - lost0;
    Serial.printf("[selftest] during a %lu ms stall: %lu pulse samples (expected ~%lu), %lu motion slots (expected ~%lu), "
                  "%lu motion slots missed, %lu pulse samples lost\n", (unsigned long)dt, (unsigned long)p,
                  (unsigned long)(dt * cfg.pulseHz / 1000), (unsigned long)m, (unsigned long)(dt * cfg.motionHz / 1000),
                  (unsigned long)miss, (unsigned long)lost);
    bool ok = p >= dt * cfg.pulseHz / 1000 * 95 / 100 && m >= dt * cfg.motionHz / 1000 * 95 / 100 && miss == 0 && lost == 0;
    Serial.printf("[selftest] SENSORS %s\n", ok ? "PASS" : "FAIL");
  }
#endif

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
    portENTER_CRITICAL(&motorMux);
    bool was = player.stop();
    digitalWrite(PIN_MOTOR, LOW);
    stopPressed = false;                                   // cleared only after the player stopped
    portEXIT_CRITICAL(&motorMux);
    xSemaphoreTake(bandLock, portMAX_DELAY); band->setMotor(false, now); xSemaphoreGive(bandLock);
    Serial.printf("[band] STOP pressed%s\n", was ? " — vibration stopped" : "");
    if (was && playingId[0]) { sendAck(playingId, "stopped", "local_stop"); playingId[0] = 0; }
    char b[192]; if (buildEvent(cfg, boot, "button", "stop", epochMs(), b, sizeof b)) pub(tEvents, b);
  }

  // 2. Sensor health changes (detected by the sensor task) are reported from here.
  if (sensorHealthChanged) {
    sensorHealthChanged = false;
    Serial.printf("[band] MPU6050 %s\n", mpuOk ? "back" : "stopped answering");
    sendStatus(true);
  }

  // 3. Vibration runs on the motor timer. Here we only pass its on/off edges to the window
  //    logic and report a pattern that finished.
  MotorEdge pending[16]; int nEdges; bool finished; uint32_t forced;
  portENTER_CRITICAL(&motorMux);
  nEdges = edgeCount; memcpy(pending, edges, sizeof(MotorEdge) * nEdges); edgeCount = 0;
  finished = player.takeFinished();
  forced = forcedOffCount; forcedOffCount = 0;
  portEXIT_CRITICAL(&motorMux);
  if (nEdges) {
    xSemaphoreTake(bandLock, portMAX_DELAY);
    for (int i = 0; i < nEdges; i++) band->setMotor(pending[i].on, pending[i].t);
    xSemaphoreGive(bandLock);
  }
  if (forced) Serial.printf("[band] motor backstop cut-off fired (%u)\n", (unsigned)forced);
  if (forced && playingId[0]) { sendAck(playingId, "stopped", "max_duration"); playingId[0] = 0; }
  else if (finished && playingId[0]) { sendAck(playingId, "executed", nullptr); playingId[0] = 0; }

  // 4. Feature windows (LIVE). Offline → queue with original timestamps.
  Window w;
  bool ready = false;
  if (!recordMode) {
    xSemaphoreTake(bandLock, portMAX_DELAY);
    ready = band->poll(now, clockValid, epochMs(), &w);
    xSemaphoreGive(bandLock);
  }
  if (ready) {
    char b[Outbox::kLen];
    size_t k = buildFeatures(cfg, boot, w, SIM_PULSE, b, sizeof b);
    if (benchMode) Serial.println(b);
    else if (k && !pub(tFeatures, b)) outbox.push(b, k);
  }

  // 5. RECORD mode: publish raw batches the sensor task prepared.
  if (recordMode) {
    char b[1024]; bool have = false;
    portENTER_CRITICAL(&rawMux);
    if (rawReadyCount) { memcpy(b, rawReady[rawReadyHead], sizeof b); rawReadyHead = (rawReadyHead + 1) % 2; rawReadyCount--; have = true; }
    portEXIT_CRITICAL(&rawMux);
    if (have && !benchMode) pub(tRaw, b, false, 0);
  }

  // 6. Network upkeep + status LED.
  if (!benchMode) {
    connectMqtt();
    mqtt.loop();
    // Commands received during mqtt.loop() are handled (and acknowledged) here, outside the callback.
    while (cmdCount) {
      handleCommand(cmdQueue[cmdHead], cmdLen[cmdHead]);
      cmdHead = (cmdHead + 1) % kCmdSlots;
      cmdCount--;
    }
    digitalWrite(PIN_STATUS_LED, mqtt.connected() ? HIGH : ((now / 250) % 2));
  }
  delay(1);
}
