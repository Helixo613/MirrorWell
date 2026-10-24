// Unit tests for calm_core (runs on Linux). Build: make test
#include <stdio.h>
#include <string.h>
#include <math.h>
#include "../calm_band/calm_core.h"
#include "../calm_band/sim_sources.h"

using namespace calm;
static int fails = 0, passes = 0;
#define CHECK(cond, ...) do { if (cond) { passes++; printf("PASS  "); } else { fails++; printf("FAIL  "); } printf(__VA_ARGS__); printf("\n"); } while (0)

// Feed `ms` of simulated signal at the configured rates; return the last window produced.
static bool run(Band& band, SimPulse& p, SimMotion& m, uint32_t& t, uint32_t ms, bool clock, Window* last,
                int* count = nullptr, bool motorOnAt500 = false) {
  bool got = false;
  for (uint32_t end = t + ms; t < end; t++) {
    if (t % 10 == 0) band.addPulseSample(t, p.sample(t));
    if (t % 31 == 0) { float x, y, z; m.sample(t, &x, &y, &z); band.addMotionSample(t, x, y, z); }
    if (motorOnAt500) { if (t % 1000 == 500) band.setMotor(true, t); if (t % 1000 == 620) band.setMotor(false, t); }
    Window w;
    if (band.poll(t, clock, 1'760'000'000'000LL + t, &w)) { *last = w; got = true; if (count) (*count)++; }
  }
  return got;
}

int main() {
  Config c;  // real settings: 60 s window, 15 s hop
  // 1. Steady finger contact → pulse rate close to the simulated ~72 bpm (drift ±4, jitter ±3%)
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{}; int n = 0;
    run(band, p, m, t, 120001, true, &w, &n);
    CHECK(n == 5, "2 minutes → 5 windows (ends at 60,75,90,105,120 s): got %d", n);
    CHECK(w.hasPulse && fabsf(w.pulseRateBpm - 72) < 6, "pulse rate ≈72 bpm: %.1f (sd %.2f, %u valid IBIs)", w.pulseRateBpm, w.pulseRateSdBpm, w.validIbis);
    CHECK(w.contact && w.quality >= 0.8f, "contact window is usable: quality %.2f", w.quality);
    CHECK(!w.moving && !w.timingGap, "still arm, no timing gap");
    char buf[512]; size_t k = buildFeatures(c, "boot1", w, true, buf, sizeof buf);
    CHECK(k > 0 && k < 512 && strstr(buf, "\"origin\":\"replay\""), "feature JSON fits in %zu bytes and is labelled replay", k);
  }
  // 2. Finger removed → contact false, no pulse value (null), quality 0
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{};
    run(band, p, m, t, 60000, true, &w);
    p.contact = false;
    run(band, p, m, t, 60001, true, &w);
    char buf[512]; buildFeatures(c, "b", w, false, buf, sizeof buf);
    CHECK(!w.contact && !w.hasPulse && w.quality == 0 && strstr(buf, "\"pulseRateBpm\":null"), "contact loss → pulseRateBpm null, quality 0");
  }
  // 3. Arm movement → moving flag and quality capped
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{};
    m.moving = true;
    run(band, p, m, t, 60001, true, &w);
    CHECK(w.moving && w.quality <= 0.5f, "movement flagged (rms %.3f g), quality %.2f", w.motionRmsG, w.quality);
  }
  // 4. No valid clock → nothing is published
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{}; int n = 0;
    run(band, p, m, t, 90000, false, &w, &n);
    CHECK(n == 0, "no window without a valid clock (%d)", n);
  }
  // 5. Motor activity → motorActive flag
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{};
    run(band, p, m, t, 60001, true, &w, nullptr, true);
    CHECK(w.motorActive, "motor-on periods flagged in the window");
  }
  // 6. Command rules
  {
    CommandGate g; int64_t now = 1'760'000'000'000LL;
    char ok[200]; snprintf(ok, sizeof ok, "{\"commandId\":\"a1\",\"pattern\":\"rep_pulse\",\"maxDurationMs\":1500,\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", (long long)now, (long long)(now + 3000));
    CmdDecision d = g.check(ok, strlen(ok), true, now);
    CHECK(d.result == CmdResult::Accepted && d.pattern == Pattern::RepPulse, "valid command accepted");
    d = g.check(ok, strlen(ok), true, now);
    CHECK(d.result == CmdResult::Rejected && !strcmp(d.reason, "duplicate"), "same commandId again → duplicate");
    char old[200]; snprintf(old, sizeof old, "{\"commandId\":\"a2\",\"pattern\":\"rep_pulse\",\"expiresAtMs\":%lld}", (long long)(now - 1));
    d = g.check(old, strlen(old), true, now);
    CHECK(!strcmp(d.reason, "expired"), "past expiry → expired");
    d = g.check(old, strlen(old), true, now - 100);
    CHECK(!strcmp(d.reason, "duplicate"), "an expired id can never buzz later (remembered)");
    char nc[200]; snprintf(nc, sizeof nc, "{\"commandId\":\"a3\",\"pattern\":\"rep_pulse\",\"expiresAtMs\":%lld}", (long long)(now + 3000));
    d = g.check(nc, strlen(nc), false, now);
    CHECK(!strcmp(d.reason, "no_clock"), "no valid clock → no_clock");
    char bad[200]; snprintf(bad, sizeof bad, "{\"commandId\":\"a4\",\"pattern\":\"siren\",\"expiresAtMs\":%lld}", (long long)(now + 3000));
    d = g.check(bad, strlen(bad), true, now);
    CHECK(!strcmp(d.reason, "bad_pattern"), "unknown pattern → bad_pattern");
    d = g.check("{oops", 5, true, now);
    CHECK(!strcmp(d.reason, "malformed"), "garbage → malformed");
  }
  // 7. Haptic player: timing, finish, local STOP
  {
    HapticPlayer h;
    h.start(Pattern::EaseOff, 1000, 1500);
    bool on0 = h.tick(1000), on1 = h.tick(1150), on2 = h.tick(1250), done = h.tick(1400);
    CHECK(on0 && !on1 && on2 && !done && h.takeFinished(), "ease_off = on 120, off 100, on 120, then finished");
    h.start(Pattern::SessionComplete, 0, 1500);
    h.tick(50);
    bool was = h.stop();
    CHECK(was && !h.motorOn() && !h.tick(60) && !h.takeFinished(), "STOP turns the motor off at once and does not report 'executed'");
    h.start(Pattern::SessionComplete, 0, 500);
    CHECK(!h.tick(600) && h.takeFinished(), "maxDuration cap ends a long pattern");
  }
  // 8. Outbox: bounded, oldest dropped, order kept
  {
    static Outbox o;
    char m[32];
    for (int i = 0; i < Outbox::kSlots + 5; i++) { int k = snprintf(m, sizeof m, "{\"seq\":%d}", i); o.push(m, k); }
    CHECK(o.size() == Outbox::kSlots && o.dropped() == 5 && !strcmp(o.front(), "{\"seq\":5}"), "outbox keeps newest %d, drops 5 oldest, FIFO order", Outbox::kSlots);
  }
  printf("\n%d passed, %d failed\n", passes, fails);
  return fails ? 1 : 0;
}
