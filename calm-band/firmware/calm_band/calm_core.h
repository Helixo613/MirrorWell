// calm_core.h — Calm Band firmware logic, independent of Arduino/ESP32 so the SAME code runs on
// the ESP32 and in the Linux host simulation (host/). The hardware layer (calm_band.ino or
// host/host_main.cpp) feeds samples and clock values in, and sends the messages this core builds.
//
// Contract: CODEX_BRIEF.md §4 (topics, JSON fields) and plan v5 §10–§12.
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace calm {

// ---------------------------------------------------------------- configuration
struct Config {
  const char* deviceId = "cb-01";
  uint32_t pulseHz = 100;          // MAX30102 sample rate (v5 §10.1)
  uint32_t motionHz = 32;          // MPU6050 sample rate (v5 §10.1)
  uint32_t windowMs = 60000;       // feature window length
  uint32_t hopMs = 15000;          // a new window every hop
  uint32_t minValidIbis = 20;      // fewer valid beat intervals → no pulse value
  float contactIrMin = 50000.0f;   // IR DC level that means a finger is on the sensor
  float contactFractionMin = 0.9f; // share of samples with contact for a "contact" window
  float movingRmsG = 0.05f;        // motion RMS (g, gravity removed) that flags movement
  uint32_t ibiMinMs = 300;         // 200 bpm
  uint32_t ibiMaxMs = 2000;        // 30 bpm
  uint32_t maxPatternMs = 1500;    // hard cap on any vibration pattern
  float motionCoverageMin = 0.8f;  // share of expected motion samples needed to judge movement
  // Command timing rules (all checked on the band, not only by the backend).
  uint32_t maxCommandAgeMs = 5000; // now − issuedAtMs above this → expired (3 s TTL + 2 s clock skew)
  uint32_t maxClockSkewMs = 2000;  // issuedAtMs further than this in the future → bad_time
  uint32_t maxCommandTtlMs = 10000;// expiresAtMs − issuedAtMs above this → bad_time
};

// ---------------------------------------------------------------- one finished window
struct Window {
  uint32_t seq;
  int64_t windowStartMs, windowEndMs;  // epoch ms (device clock)
  bool clockValid;
  bool contact;
  float quality;                       // 0..1
  bool hasPulse;                       // false → pulseRateBpm is JSON null
  float pulseRateBpm, pulseRateSdBpm;
  float validBeatFraction;
  uint16_t validIbis;
  float motionRmsG, motionMaxG;
  bool motionValid;                    // false → motion sensor missing or too few samples;
                                       // motion fields are JSON null and quality is capped
  float motionCoverage;                // received ÷ expected motion samples (0..1)
  bool moving;
  bool motorActive;
  bool timingGap;
};

// ---------------------------------------------------------------- vibration patterns
enum class Pattern : uint8_t { None, RepPulse, EaseOff, SessionComplete, BreathIn, BreathOut };
Pattern patternFromName(const char* name);
const char* patternName(Pattern p);

class HapticPlayer {
 public:
  // Starts a pattern; returns false if the pattern is unknown. Any running pattern is replaced.
  // capMs limits the total time (motor on + gaps); the motor never runs past it.
  bool start(Pattern p, uint32_t nowMs, uint32_t capMs);
  // Advance the pattern. Returns the motor state the hardware should apply.
  bool tick(uint32_t nowMs);
  // Local STOP: motor off immediately. Returns true if something was playing.
  bool stop();
  bool playing() const { return pattern_ != Pattern::None; }
  bool motorOn() const { return motorOn_; }
  // True exactly once after a pattern finishes on its own (not after stop()).
  bool takeFinished();
 private:
  Pattern pattern_ = Pattern::None;
  const uint16_t* steps_ = nullptr;  // on, off, on, off ... in ms
  uint8_t nSteps_ = 0, step_ = 0;
  uint32_t stepStartMs_ = 0, startMs_ = 0, capMs_ = 0;
  bool motorOn_ = false, finished_ = false;
};

// ---------------------------------------------------------------- command rules
enum class CmdResult : uint8_t { Accepted, Rejected };
struct CmdDecision {
  CmdResult result;
  // null when accepted, else one of: "malformed" | "duplicate" | "no_clock" | "bad_time" |
  // "expired" | "bad_pattern" | "bad_duration"
  const char* reason;
  Pattern pattern;
  uint32_t durationMs;  // cap for this command: min(maxDurationMs, Config::maxPatternMs)
  int64_t expiresAtMs;  // re-checked with stillValid() immediately before the motor starts
  char commandId[48];
};

class CommandGate {
 public:
  explicit CommandGate(const Config& c = Config()) : cfg_(c) {}
  // Parse + check one command payload. The payload must be ONE valid JSON object whose values
  // are strings, numbers, booleans or null. Order: malformed → duplicate → no_clock → bad_time →
  // expired → bad_pattern → bad_duration. A seen id is remembered even when rejected, so a
  // re-delivery can never buzz later.
  CmdDecision check(const char* json, size_t len, bool clockValid, int64_t nowEpochMs);
  // Last check, done with NO network call between it and starting the motor.
  static bool stillValid(const CmdDecision& d, int64_t nowEpochMs) { return nowEpochMs <= d.expiresAtMs; }
 private:
  Config cfg_;
  static const int kSeen = 32;
  char seen_[kSeen][48] = {};
  int next_ = 0;
  bool seenBefore(const char* id) const;
  void remember(const char* id);
};

// ---------------------------------------------------------------- signal processing + windows
class Band {
 public:
  explicit Band(const Config& c);
  // Samples use the device's monotonic clock (ms since boot).
  void addPulseSample(uint32_t tMs, float ir);
  void addMotionSample(uint32_t tMs, float axG, float ayG, float azG);
  void setMotor(bool on, uint32_t tMs);
  // Samples the sensor produced but that never reached us (e.g. FIFO overflow while the reader
  // was late). Every window that covers tMs is then marked timingGap.
  void notePulseLoss(uint32_t tMs, uint16_t count);
  // Call often. Returns true when a new window is ready in *out. epochNowMs must be valid
  // (clockValid) for a window to be produced; until then nothing is emitted.
  bool poll(uint32_t tMs, bool clockValid, int64_t epochNowMs, Window* out);
  float lastIr() const { return lastIr_; }
 private:
  // Per-second buckets cover the window; beats are kept with their own times.
  static const int kSec = 64;       // ≥ windowMs/1000 + slack
  static const int kBeats = 256;
  struct Bucket { uint32_t sec; uint16_t pulseN, contactN, motionN, lost; float motionSq, motionMax; uint16_t motorMs; };
  Config cfg_;
  Bucket b_[kSec];
  uint32_t beats_[kBeats]; int beatHead_ = 0, beatCount_ = 0;
  // pulse filter state
  float dc_ = 0, lp_ = 0, prevLp_ = 0, prevSlope_ = 0, envMax_ = 0; uint32_t lastBeat_ = 0; bool dcInit_ = false;
  float lastIr_ = 0;
  float gx_ = 0, gy_ = 0, gz_ = 0; bool gInit_ = false;  // per-axis gravity baseline
  bool motor_ = false; uint32_t motorSince_ = 0;
  uint32_t nextEmitMs_ = 0, seq_ = 0, bootMs_ = 0; bool started_ = false;
  Bucket& bucket(uint32_t tMs);
  void detectBeat(uint32_t tMs, float ir);
};

// ---------------------------------------------------------------- messages (JSON text)
// Each returns the number of bytes written (0 if the buffer was too small).
size_t buildFeatures(const Config& c, const char* bootId, const Window& w, bool replay, char* buf, size_t n);
size_t buildAck(const Config& c, const char* bootId, const char* commandId, const char* result,
                const char* reason, int64_t atMs, char* buf, size_t n);
// pulseSensor / motionSensor: "ok" | "missing" | "simulated"
size_t buildStatus(const Config& c, const char* bootId, bool online, bool clockValid, uint32_t dropped,
                   uint32_t publishFailures, const char* pulseSensor, const char* motionSensor,
                   char* buf, size_t n);

// Strict parser for a flat JSON object (used for commands). Exposed for tests.
struct JsonField { char key[24]; char str[64]; uint16_t strLen; bool isStr, isNum, isInt; int64_t i; };
// Returns the number of fields (≤ maxFields), or -1 if the text is not exactly one flat object.
int parseFlatJson(const char* json, size_t len, JsonField* fields, int maxFields);
size_t buildEvent(const Config& c, const char* bootId, const char* type, const char* detail, int64_t atMs,
                  char* buf, size_t n);

// ---------------------------------------------------------------- offline queue
// Bounded FIFO for feature messages while MQTT is down. Overflow drops the OLDEST and counts it.
// Commands are never queued (a late vibration is worse than none).
class Outbox {
 public:
  static const int kSlots = 120;   // 30 min at one window per 15 s
  static const int kLen = 512;
  void push(const char* msg, size_t len);
  bool empty() const { return count_ == 0; }
  const char* front() const { return slots_[head_]; }
  void pop();
  int size() const { return count_; }
  uint32_t dropped() const { return dropped_; }
 private:
  char slots_[kSlots][kLen];
  int head_ = 0, count_ = 0; uint32_t dropped_ = 0;
};

}  // namespace calm
