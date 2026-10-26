// calm_core.cpp — see calm_core.h. No Arduino headers: compiles for ESP32 and for Linux.
#include "calm_core.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace calm {

// ================================================================ patterns
// on, off, on, off ... (ms). Short and distinct; tuned later through comfort testing (v5 §11.2).
static const uint16_t kRep[] = {120};
static const uint16_t kEase[] = {120, 100, 120};
static const uint16_t kDone[] = {300, 150, 300, 150, 600};
static const uint16_t kIn[] = {80, 80, 80};
static const uint16_t kOut[] = {400};

Pattern patternFromName(const char* s) {
  if (!s) return Pattern::None;
  if (!strcmp(s, "rep_pulse")) return Pattern::RepPulse;
  if (!strcmp(s, "ease_off")) return Pattern::EaseOff;
  if (!strcmp(s, "session_complete")) return Pattern::SessionComplete;
  if (!strcmp(s, "breath_in")) return Pattern::BreathIn;
  if (!strcmp(s, "breath_out")) return Pattern::BreathOut;
  return Pattern::None;
}

const char* patternName(Pattern p) {
  switch (p) {
    case Pattern::RepPulse: return "rep_pulse";
    case Pattern::EaseOff: return "ease_off";
    case Pattern::SessionComplete: return "session_complete";
    case Pattern::BreathIn: return "breath_in";
    case Pattern::BreathOut: return "breath_out";
    default: return "none";
  }
}

bool HapticPlayer::start(Pattern p, uint32_t now, uint32_t capMs) {
  switch (p) {
    case Pattern::RepPulse: steps_ = kRep; nSteps_ = 1; break;
    case Pattern::EaseOff: steps_ = kEase; nSteps_ = 3; break;
    case Pattern::SessionComplete: steps_ = kDone; nSteps_ = 5; break;
    case Pattern::BreathIn: steps_ = kIn; nSteps_ = 3; break;
    case Pattern::BreathOut: steps_ = kOut; nSteps_ = 1; break;
    default: return false;
  }
  pattern_ = p; step_ = 0; stepStartMs_ = startMs_ = now; capMs_ = capMs;
  motorOn_ = true; finished_ = false;
  return true;
}

bool HapticPlayer::tick(uint32_t now) {
  if (pattern_ == Pattern::None) { motorOn_ = false; return false; }
  bool capped = (now - startMs_) >= capMs_;
  while (!capped && step_ < nSteps_ && (now - stepStartMs_) >= steps_[step_]) {
    stepStartMs_ += steps_[step_];
    step_++;
  }
  if (capped || step_ >= nSteps_) {
    pattern_ = Pattern::None; motorOn_ = false; finished_ = true;
    return false;
  }
  motorOn_ = (step_ % 2) == 0;  // even steps vibrate, odd steps are gaps
  return motorOn_;
}

bool HapticPlayer::stop() {
  bool was = pattern_ != Pattern::None;
  pattern_ = Pattern::None; motorOn_ = false; finished_ = false;
  return was;
}

bool HapticPlayer::takeFinished() {
  bool f = finished_;
  finished_ = false;
  return f;
}

// ================================================================ strict flat JSON parser
// Accepts exactly one JSON object whose values are strings, numbers, true, false or null.
// Anything else (truncated text, trailing bytes, nested objects/arrays, duplicate keys,
// control characters in strings) is rejected, so a garbled command can never be "half read".
namespace {
struct Cursor { const char* p; const char* end; };
void ws(Cursor& c) { while (c.p < c.end && (*c.p == ' ' || *c.p == '\t' || *c.p == '\n' || *c.p == '\r')) c.p++; }
// Reads a JSON string into out (truncated to n-1 chars); *fullLen gets the decoded length.
bool str(Cursor& c, char* out, size_t n, uint16_t* fullLen) {
  if (c.p >= c.end || *c.p != '"') return false;
  c.p++;
  size_t k = 0, full = 0;
  while (c.p < c.end && *c.p != '"') {
    unsigned char ch = (unsigned char)*c.p++;
    if (ch < 0x20) return false;                         // raw control char: not valid JSON
    if (ch == '\\') {
      if (c.p >= c.end) return false;
      char e = *c.p++;
      switch (e) {
        case '"': case '\\': case '/': ch = (unsigned char)e; break;
        case 'b': ch = '\b'; break; case 'f': ch = '\f'; break; case 'n': ch = '\n'; break;
        case 'r': ch = '\r'; break; case 't': ch = '\t'; break;
        case 'u':
          for (int i = 0; i < 4; i++) {
            if (c.p >= c.end) return false;
            char h = *c.p++;
            if (!((h >= '0' && h <= '9') || (h >= 'a' && h <= 'f') || (h >= 'A' && h <= 'F'))) return false;
          }
          ch = '?';                                        // not needed for commands; kept as a placeholder
          break;
        default: return false;
      }
    }
    if (k + 1 < n) out[k++] = (char)ch;
    full++;
  }
  if (c.p >= c.end) return false;                          // unterminated
  c.p++;
  if (n) out[k] = 0;
  if (fullLen) *fullLen = (uint16_t)(full > 65535 ? 65535 : full);
  return true;
}
bool num(Cursor& c, JsonField& f) {
  const char* s = c.p;
  bool neg = false, isInt = true;
  if (c.p < c.end && *c.p == '-') { neg = true; c.p++; }
  if (c.p >= c.end) return false;
  if (*c.p == '0') c.p++;
  else if (*c.p >= '1' && *c.p <= '9') { while (c.p < c.end && *c.p >= '0' && *c.p <= '9') c.p++; }
  else return false;
  int intDigits = (int)(c.p - s) - (neg ? 1 : 0);
  if (c.p < c.end && *c.p == '.') {
    isInt = false; c.p++;
    if (c.p >= c.end || *c.p < '0' || *c.p > '9') return false;
    while (c.p < c.end && *c.p >= '0' && *c.p <= '9') c.p++;
  }
  if (c.p < c.end && (*c.p == 'e' || *c.p == 'E')) {
    isInt = false; c.p++;
    if (c.p < c.end && (*c.p == '+' || *c.p == '-')) c.p++;
    if (c.p >= c.end || *c.p < '0' || *c.p > '9') return false;
    while (c.p < c.end && *c.p >= '0' && *c.p <= '9') c.p++;
  }
  f.isNum = true;
  f.isInt = isInt && intDigits <= 18;                      // fits int64 without overflow
  if (f.isInt) {
    int64_t v = 0;
    for (const char* q = s + (neg ? 1 : 0); q < c.p; q++) v = v * 10 + (*q - '0');
    f.i = neg ? -v : v;
  }
  return true;
}
bool lit(Cursor& c, const char* w) {
  size_t n = strlen(w);
  if ((size_t)(c.end - c.p) < n || memcmp(c.p, w, n) != 0) return false;
  c.p += n;
  return true;
}
}  // namespace

int parseFlatJson(const char* json, size_t len, JsonField* fields, int maxFields) {
  if (!json) return -1;
  for (size_t i = 0; i < len; i++) if (json[i] == 0) return -1;  // embedded NUL
  Cursor c{json, json + len};
  ws(c);
  if (c.p >= c.end || *c.p != '{') return -1;
  c.p++;
  int n = 0;
  ws(c);
  if (c.p < c.end && *c.p == '}') { c.p++; }
  else {
    while (true) {
      ws(c);
      JsonField f{};
      uint16_t keyLen = 0;
      if (!str(c, f.key, sizeof f.key, &keyLen) || keyLen >= sizeof f.key) return -1;
      ws(c);
      if (c.p >= c.end || *c.p != ':') return -1;
      c.p++;
      ws(c);
      if (c.p >= c.end) return -1;
      char ch = *c.p;
      if (ch == '"') { if (!str(c, f.str, sizeof f.str, &f.strLen)) return -1; f.isStr = true; }
      else if (ch == '-' || (ch >= '0' && ch <= '9')) { if (!num(c, f)) return -1; }
      else if (ch == 't') { if (!lit(c, "true")) return -1; }
      else if (ch == 'f') { if (!lit(c, "false")) return -1; }
      else if (ch == 'n') { if (!lit(c, "null")) return -1; }
      else return -1;                                      // nested object/array or junk
      for (int i = 0; i < n && i < maxFields; i++) if (!strcmp(fields[i].key, f.key)) return -1;  // duplicate key
      if (n < maxFields) fields[n] = f;
      n++;
      ws(c);
      if (c.p < c.end && *c.p == ',') { c.p++; continue; }
      if (c.p < c.end && *c.p == '}') { c.p++; break; }
      return -1;
    }
  }
  ws(c);
  if (c.p != c.end) return -1;                             // trailing bytes
  return n > maxFields ? maxFields : n;
}

static const JsonField* field(const JsonField* f, int n, const char* key) {
  for (int i = 0; i < n; i++) if (!strcmp(f[i].key, key)) return &f[i];
  return nullptr;
}

static bool validId(const JsonField* f) {
  if (!f || !f->isStr || f->strLen == 0 || f->strLen > 47) return false;
  for (const char* p = f->str; *p; p++)
    if (!((*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') || (*p >= '0' && *p <= '9') || *p == '-' || *p == '_')) return false;
  return true;
}

// ================================================================ command gate
bool CommandGate::seenBefore(const char* id) const {
  for (int i = 0; i < kSeen; i++)
    if (seen_[i][0] && !strcmp(seen_[i], id)) return true;
  return false;
}

void CommandGate::remember(const char* id) {
  snprintf(seen_[next_], sizeof seen_[0], "%s", id);
  seen_[next_][sizeof seen_[0] - 1] = 0;
  next_ = (next_ + 1) % kSeen;
}

CmdDecision CommandGate::check(const char* json, size_t len, bool clockValid, int64_t now) {
  CmdDecision d{};
  d.result = CmdResult::Rejected;
  d.pattern = Pattern::None;
  d.reason = "malformed";
  JsonField f[12];
  int n = parseFlatJson(json, len, f, 12);
  if (n < 0) return d;
  const JsonField* id = field(f, n, "commandId");
  if (!validId(id)) return d;
  memcpy(d.commandId, id->str, id->strLen);  // validId() guarantees strLen ≤ 47
  d.commandId[id->strLen] = 0;
  if (seenBefore(d.commandId)) { d.reason = "duplicate"; return d; }
  remember(d.commandId);
  const JsonField* pat = field(f, n, "pattern");
  const JsonField* iss = field(f, n, "issuedAtMs");
  const JsonField* exp = field(f, n, "expiresAtMs");
  const JsonField* dur = field(f, n, "maxDurationMs");
  if (!pat || !pat->isStr || !iss || !iss->isInt || !exp || !exp->isInt) return d;      // malformed
  if (dur && !dur->isInt) return d;                                                     // malformed
  if (!clockValid) { d.reason = "no_clock"; return d; }
  if (exp->i <= iss->i || exp->i - iss->i > (int64_t)cfg_.maxCommandTtlMs ||
      iss->i > now + (int64_t)cfg_.maxClockSkewMs) { d.reason = "bad_time"; return d; }
  if (now > exp->i || now - iss->i > (int64_t)cfg_.maxCommandAgeMs) { d.reason = "expired"; return d; }
  d.pattern = patternFromName(pat->strLen < sizeof pat->str ? pat->str : nullptr);
  if (d.pattern == Pattern::None) { d.reason = "bad_pattern"; return d; }
  d.durationMs = cfg_.maxPatternMs;
  if (dur) {
    if (dur->i < 1 || dur->i > (int64_t)cfg_.maxPatternMs) { d.pattern = Pattern::None; d.reason = "bad_duration"; return d; }
    d.durationMs = (uint32_t)dur->i;
  }
  d.expiresAtMs = exp->i;
  d.result = CmdResult::Accepted;
  d.reason = nullptr;
  return d;
}

// ================================================================ signal processing
Band::Band(const Config& c) : cfg_(c) { memset(b_, 0, sizeof b_); }

Band::Bucket& Band::bucket(uint32_t t) {
  uint32_t sec = t / 1000;
  Bucket& b = b_[sec % kSec];
  if (b.sec != sec) { memset(&b, 0, sizeof b); b.sec = sec; }  // slot reused for a new second
  return b;
}

void Band::detectBeat(uint32_t t, float ir) {
  // MAX30102 IR dips at each heartbeat (more blood absorbs more light), so look for peaks of the
  // inverted, DC-removed, smoothed signal.
  if (!dcInit_) { dc_ = ir; dcInit_ = true; }
  dc_ += (ir - dc_) * 0.01f;            // slow baseline (~1 s at 100 Hz)
  float ac = -(ir - dc_);
  lp_ += (ac - lp_) * 0.35f;            // light smoothing
  float slope = lp_ - prevLp_;
  envMax_ *= 0.995f;                    // decaying envelope for an adaptive threshold
  if (lp_ > envMax_) envMax_ = lp_;
  bool peak = prevSlope_ > 0 && slope <= 0 && prevLp_ > 0.5f * envMax_ && envMax_ > 1.0f;
  if (peak && (lastBeat_ == 0 || t - lastBeat_ >= cfg_.ibiMinMs)) {
    beats_[beatHead_] = t;
    beatHead_ = (beatHead_ + 1) % kBeats;
    if (beatCount_ < kBeats) beatCount_++;
    lastBeat_ = t;
  }
  prevSlope_ = slope;
  prevLp_ = lp_;
}

void Band::addPulseSample(uint32_t t, float ir) {
  lastIr_ = ir;
  Bucket& b = bucket(t);
  b.pulseN++;
  bool contact = ir >= cfg_.contactIrMin;
  if (contact) { b.contactN++; detectBeat(t, ir); }
  else { dcInit_ = false; envMax_ = 0; lastBeat_ = 0; }  // restart the filter when the finger returns
}

void Band::addMotionSample(uint32_t t, float ax, float ay, float az) {
  Bucket& b = bucket(t);
  // Remove gravity per axis with a slow baseline (~3 s at 32 Hz), then take the size of what is
  // left. ("|a| − 1 g" would hide most sideways movement, which is exactly what arm swings are.)
  if (!gInit_) { gx_ = ax; gy_ = ay; gz_ = az; gInit_ = true; }
  gx_ += (ax - gx_) * 0.01f; gy_ += (ay - gy_) * 0.01f; gz_ += (az - gz_) * 0.01f;
  float dx = ax - gx_, dy = ay - gy_, dz = az - gz_;
  float dev = sqrtf(dx * dx + dy * dy + dz * dz);
  b.motionN++;
  b.motionSq += dev * dev;
  if (dev > b.motionMax) b.motionMax = dev;
}

void Band::notePulseLoss(uint32_t t, uint16_t count) {
  Bucket& b = bucket(t);
  b.lost = (uint16_t)(b.lost + count);
}

void Band::setMotor(bool on, uint32_t t) {
  if (on == motor_) return;
  if (on) motorSince_ = t;
  else {
    uint32_t ms = t - motorSince_;
    Bucket& b = bucket(t);
    b.motorMs = (uint16_t)(b.motorMs + (ms > 60000 ? 60000 : ms));
  }
  motor_ = on;
}

bool Band::poll(uint32_t t, bool clockValid, int64_t epochNow, Window* out) {
  if (!started_) { started_ = true; bootMs_ = t; nextEmitMs_ = t + cfg_.windowMs; }
  if ((int32_t)(t - nextEmitMs_) < 0) return false;
  nextEmitMs_ += cfg_.hopMs;
  if ((int32_t)(t - nextEmitMs_) > (int32_t)cfg_.hopMs) nextEmitMs_ = t + cfg_.hopMs;  // fell behind
  if (!clockValid) return false;  // never publish a window without a valid timestamp

  Window w{};
  w.seq = ++seq_;
  w.clockValid = true;
  w.windowEndMs = epochNow;
  w.windowStartMs = epochNow - (int64_t)cfg_.windowMs;

  uint32_t from = t - cfg_.windowMs;
  uint32_t firstSec = from / 1000 + 1, lastSec = t / 1000;
  uint32_t pulseN = 0, contactN = 0, motionN = 0, motorMs = 0;
  float motionSq = 0, motionMax = 0;
  for (uint32_t s = firstSec; s <= lastSec; s++) {
    const Bucket& b = b_[s % kSec];
    if (b.sec != s) { if (s < lastSec) w.timingGap = true; continue; }
    pulseN += b.pulseN; contactN += b.contactN; motionN += b.motionN; motorMs += b.motorMs;
    motionSq += b.motionSq;
    if (b.motionMax > motionMax) motionMax = b.motionMax;
    if (s < lastSec && b.pulseN < cfg_.pulseHz * 8 / 10) w.timingGap = true;
    if (b.lost) w.timingGap = true;                    // samples known to be lost in this second
  }
  w.contact = pulseN > 0 && (float)contactN / pulseN >= cfg_.contactFractionMin;
  // Motion is only judged when enough samples arrived. A missing or failed MPU6050 must never
  // look like "perfectly still".
  float expectedMotion = (float)cfg_.motionHz * cfg_.windowMs / 1000.0f;
  w.motionCoverage = expectedMotion > 0 ? (float)motionN / expectedMotion : 0;
  if (w.motionCoverage > 1) w.motionCoverage = 1;
  w.motionValid = w.motionCoverage >= cfg_.motionCoverageMin;
  w.motionRmsG = motionN ? sqrtf(motionSq / motionN) : 0;
  w.motionMaxG = motionMax;
  w.moving = w.motionValid && w.motionRmsG > cfg_.movingRmsG;
  w.motorActive = motorMs > 0 || motor_;

  // Beat intervals inside the window.
  uint32_t ts[kBeats]; int n = 0;
  for (int i = 0; i < beatCount_; i++) {
    uint32_t bt = beats_[(beatHead_ - beatCount_ + i + kBeats) % kBeats];
    if ((int32_t)(bt - from) > 0 && (int32_t)(bt - t) <= 0) ts[n++] = bt;
  }
  int total = n > 1 ? n - 1 : 0, valid = 0;
  double sumIbi = 0, sumHr = 0, sumHr2 = 0;
  for (int i = 1; i < n; i++) {
    uint32_t ibi = ts[i] - ts[i - 1];
    if (ibi >= cfg_.ibiMinMs && ibi <= cfg_.ibiMaxMs) {
      valid++; sumIbi += ibi;
      double hr = 60000.0 / ibi; sumHr += hr; sumHr2 += hr * hr;
    }
  }
  w.validIbis = (uint16_t)valid;
  w.validBeatFraction = total ? (float)valid / total : 0;
  w.hasPulse = w.contact && valid >= (int)cfg_.minValidIbis;
  if (w.hasPulse) {
    w.pulseRateBpm = (float)(60000.0 / (sumIbi / valid));
    double mean = sumHr / valid;
    double var = sumHr2 / valid - mean * mean;
    w.pulseRateSdBpm = (float)sqrt(var > 0 ? var : 0);
  }
  float q = w.contact ? w.validBeatFraction : 0.0f;
  if (!w.hasPulse) q = q < 0.5f ? q : 0.5f;
  if (w.moving || !w.motionValid) q = q < 0.5f ? q : 0.5f;  // can't confirm a still arm → not usable
  w.quality = q;
  *out = w;
  return true;
}

// ================================================================ messages
size_t buildFeatures(const Config& c, const char* boot, const Window& w, bool replay, char* buf, size_t n) {
  char pulse[24], sd[24], rms[24], mx[24], moving[8];
  if (w.motionValid) {
    snprintf(rms, sizeof rms, "%.4f", w.motionRmsG);
    snprintf(mx, sizeof mx, "%.3f", w.motionMaxG);
    strcpy(moving, w.moving ? "true" : "false");
  } else {
    strcpy(rms, "null"); strcpy(mx, "null"); strcpy(moving, "null");  // unknown, not "still"
  }
  if (w.hasPulse) {
    snprintf(pulse, sizeof pulse, "%.1f", w.pulseRateBpm);
    snprintf(sd, sizeof sd, "%.2f", w.pulseRateSdBpm);
  } else {
    strcpy(pulse, "null"); strcpy(sd, "null");  // missing stays missing — never a made-up value
  }
  int k = snprintf(buf, n,
      "{\"schema\":1,\"dev\":\"%s\",\"boot\":\"%s\",\"seq\":%lu,\"origin\":\"%s\","
      "\"windowStartMs\":%lld,\"windowEndMs\":%lld,\"clockValid\":%s,"
      "\"contact\":%s,\"quality\":%.2f,\"pulseRateBpm\":%s,\"pulseRateSdBpm\":%s,"
      "\"validBeatFraction\":%.2f,\"validIbis\":%u,\"motionValid\":%s,\"motionCoverage\":%.2f,"
      "\"motionRms_g\":%s,\"motionMax_g\":%s,\"moving\":%s,\"motorActive\":%s,\"timingGap\":%s}",
      c.deviceId, boot, (unsigned long)w.seq, replay ? "replay" : "live",
      (long long)w.windowStartMs, (long long)w.windowEndMs, w.clockValid ? "true" : "false",
      w.contact ? "true" : "false", w.quality, pulse, sd, w.validBeatFraction, (unsigned)w.validIbis,
      w.motionValid ? "true" : "false", w.motionCoverage, rms, mx, moving, w.motorActive ? "true" : "false",
      w.timingGap ? "true" : "false");
  return (k > 0 && (size_t)k < n) ? (size_t)k : 0;
}

size_t buildAck(const Config& c, const char* boot, const char* id, const char* result, const char* reason,
                int64_t at, char* buf, size_t n) {
  char r[40];
  if (reason) snprintf(r, sizeof r, "\"%s\"", reason); else strcpy(r, "null");
  int k = snprintf(buf, n, "{\"commandId\":\"%s\",\"dev\":\"%s\",\"boot\":\"%s\",\"result\":\"%s\",\"reason\":%s,\"atMs\":%lld}",
                   id, c.deviceId, boot, result, r, (long long)at);
  return (k > 0 && (size_t)k < n) ? (size_t)k : 0;
}

size_t buildStatus(const Config& c, const char* boot, bool online, bool clockValid, uint32_t dropped,
                   uint32_t fails, const char* pulseSensor, const char* motionSensor, char* buf, size_t n) {
  int k = snprintf(buf, n, "{\"dev\":\"%s\",\"boot\":\"%s\",\"online\":%s,\"clockValid\":%s,\"droppedWindows\":%lu,"
                   "\"publishFailures\":%lu,\"pulseSensor\":\"%s\",\"motionSensor\":\"%s\"}",
                   c.deviceId, boot, online ? "true" : "false", clockValid ? "true" : "false",
                   (unsigned long)dropped, (unsigned long)fails, pulseSensor, motionSensor);
  return (k > 0 && (size_t)k < n) ? (size_t)k : 0;
}

size_t buildEvent(const Config& c, const char* boot, const char* type, const char* detail, int64_t at,
                  char* buf, size_t n) {
  int k = snprintf(buf, n, "{\"dev\":\"%s\",\"boot\":\"%s\",\"type\":\"%s\",\"detail\":\"%s\",\"atMs\":%lld}",
                   c.deviceId, boot, type, detail ? detail : "", (long long)at);
  return (k > 0 && (size_t)k < n) ? (size_t)k : 0;
}

// ================================================================ outbox
void Outbox::push(const char* msg, size_t len) {
  if (len >= (size_t)kLen) return;
  if (count_ == kSlots) { pop(); dropped_++; }
  int tail = (head_ + count_) % kSlots;
  memcpy(slots_[tail], msg, len);
  slots_[tail][len] = 0;
  count_++;
}

void Outbox::pop() {
  if (!count_) return;
  head_ = (head_ + 1) % kSlots;
  count_--;
}

}  // namespace calm
