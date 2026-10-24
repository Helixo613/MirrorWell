// sim_sources.h — synthetic sensor signals for simulation (Wokwi has no MAX30102; the Linux host
// simulation has neither sensor). Clearly labelled: windows built from these carry origin "replay".
#pragma once
#include <math.h>
#include <stdint.h>

namespace calm {

class Lcg {  // tiny deterministic random source (same results on ESP32 and Linux)
 public:
  explicit Lcg(uint32_t seed) : s_(seed) {}
  float uniform() { s_ = s_ * 1664525u + 1013904223u; return (s_ >> 8) / 16777216.0f; }
  float noise(float amp) { return (uniform() * 2.0f - 1.0f) * amp; }
 private:
  uint32_t s_;
};

// MAX30102-like IR samples: a DC level with a dip at every heartbeat (systolic) and a smaller
// dicrotic dip, ~72 bpm drifting slowly, small beat-to-beat variation. No finger → low IR.
class SimPulse {
 public:
  bool contact = true;
  float baseBpm = 72.0f;
  float sample(uint32_t tMs) {
    if (!contact) { lastT_ = tMs; return 1500.0f + rnd_.noise(200.0f); }
    float dt = lastT_ ? (tMs - lastT_) / 1000.0f : 0.0f;
    lastT_ = tMs;
    phase_ += dt * curBpm_ / 60.0f;
    if (phase_ >= 1.0f) {  // new beat: pick its rate (slow drift + ±3% jitter)
      phase_ -= 1.0f;
      curBpm_ = baseBpm + 4.0f * sinf(tMs / 30000.0f) + rnd_.noise(baseBpm * 0.03f);
    }
    float p = phase_;
    float systolic = expf(-((p - 0.15f) * (p - 0.15f)) / (2 * 0.004f));
    float dicrotic = 0.35f * expf(-((p - 0.45f) * (p - 0.45f)) / (2 * 0.003f));
    return 120000.0f - 2500.0f * (systolic + dicrotic) + rnd_.noise(60.0f);
  }
 private:
  float phase_ = 0.0f, curBpm_ = 72.0f;
  uint32_t lastT_ = 0;
  Lcg rnd_{12345u};
};

// MPU6050-like accelerometer (g). Still: gravity on Z + sensor noise. Moving: a 2 Hz arm swing.
class SimMotion {
 public:
  bool moving = false;
  void sample(uint32_t tMs, float* ax, float* ay, float* az) {
    float t = tMs / 1000.0f;
    float m = moving ? 0.35f * sinf(2.0f * 3.14159f * 2.0f * t) : 0.0f;
    *ax = m + rnd_.noise(0.004f);
    *ay = 0.5f * m + rnd_.noise(0.004f);
    *az = 1.0f + rnd_.noise(0.004f);
  }
 private:
  Lcg rnd_{777u};
};

}  // namespace calm
