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
                int* count = nullptr, bool motorOnAt500 = false, int motionEvery = 1) {
  bool got = false;
  for (uint32_t end = t + ms; t < end; t++) {
    if (t % 10 == 0) band.addPulseSample(t, p.sample(t));
    if (motionEvery && t % 31 == 0 && (t / 31) % motionEvery == 0) { float x, y, z; m.sample(t, &x, &y, &z); band.addMotionSample(t, x, y, z); }
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
    char old[200]; snprintf(old, sizeof old, "{\"commandId\":\"a2\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", (long long)(now - 3001), (long long)(now - 1));
    d = g.check(old, strlen(old), true, now);
    CHECK(!strcmp(d.reason, "expired"), "past expiry → expired");
    d = g.check(old, strlen(old), true, now - 100);
    CHECK(!strcmp(d.reason, "duplicate"), "an expired id can never buzz later (remembered)");
    char nc[200]; snprintf(nc, sizeof nc, "{\"commandId\":\"a3\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", (long long)now, (long long)(now + 3000));
    d = g.check(nc, strlen(nc), false, now);
    CHECK(!strcmp(d.reason, "no_clock"), "no valid clock → no_clock");
    char bad[200]; snprintf(bad, sizeof bad, "{\"commandId\":\"a4\",\"pattern\":\"siren\",\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", (long long)now, (long long)(now + 3000));
    d = g.check(bad, strlen(bad), true, now);
    CHECK(!strcmp(d.reason, "bad_pattern"), "unknown pattern → bad_pattern");
    d = g.check("{oops", 5, true, now);
    CHECK(!strcmp(d.reason, "malformed"), "garbage → malformed");
  }
  // 6b. Strict JSON: anything that is not exactly one flat JSON object is malformed
  {
    CommandGate g; int64_t now = 1'760'000'000'000LL;
    char good[220]; snprintf(good, sizeof good, "{\"commandId\":\"PLACEHOLDER\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", (long long)now, (long long)(now + 3000));
    const char* bad[] = {
      "{\"commandId\":\"m1\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":1,\"expiresAtMs\":2} trailing",
      "{\"commandId\":\"m2\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":1,\"expiresAtMs\":",      // truncated
      "{'commandId':'m3','pattern':'rep_pulse'}",                                                  // not JSON quotes
      "{\"commandId\":\"m4\",\"pattern\":{\"x\":1},\"issuedAtMs\":1,\"expiresAtMs\":2}",           // nested
      "{\"commandId\":\"m5\",\"commandId\":\"m6\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":1,\"expiresAtMs\":2}", // dup key
      "xx \"commandId\":\"m7\" \"pattern\":\"rep_pulse\" \"expiresAtMs\":99999999999999",            // loose text
      "{\"commandId\":\"m8\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":1.5,\"expiresAtMs\":2}",      // non-integer time
      "{\"commandId\":\"has space\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":1,\"expiresAtMs\":2}", // bad id chars
    };
    int ok = 0;
    for (const char* b : bad) { CmdDecision d = g.check(b, strlen(b), true, now); if (d.result == CmdResult::Rejected && !strcmp(d.reason, "malformed")) ok++; else printf("      not malformed: %s → %s\n", b, d.reason ? d.reason : "accepted"); }
    CHECK(ok == 8, "8 kinds of broken input all rejected as malformed (%d/8)", ok);
    char noIss[200]; snprintf(noIss, sizeof noIss, "{\"commandId\":\"m9\",\"pattern\":\"rep_pulse\",\"expiresAtMs\":%lld}", (long long)(now + 3000));
    CmdDecision d = g.check(noIss, strlen(noIss), true, now);
    CHECK(d.reason && !strcmp(d.reason, "malformed"), "missing issuedAtMs → malformed");
    char sp[260]; snprintf(sp, sizeof sp, " {\n \"commandId\" : \"m10\" , \"pattern\" : \"rep_pulse\", \"sessionId\": null, \"issuedAtMs\": %lld , \"expiresAtMs\": %lld }\n", (long long)now, (long long)(now + 3000));
    d = g.check(sp, strlen(sp), true, now);
    CHECK(d.result == CmdResult::Accepted && d.durationMs == 1500, "valid JSON with spaces/newlines and a null field is accepted (cap %u ms)", d.durationMs);
    (void)good;
  }
  // 6c. Time and duration rules are enforced by the band itself
  {
    CommandGate g; int64_t now = 1'760'000'000'000LL; char b[240]; CmdDecision d;
    auto cmd = [&](const char* id, int64_t iss, int64_t exp, int dur) {
      if (dur) snprintf(b, sizeof b, "{\"commandId\":\"%s\",\"pattern\":\"rep_pulse\",\"maxDurationMs\":%d,\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", id, dur, (long long)iss, (long long)exp);
      else snprintf(b, sizeof b, "{\"commandId\":\"%s\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", id, (long long)iss, (long long)exp);
      return g.check(b, strlen(b), true, now);
    };
    d = cmd("t1", now - 86'400'000LL, now + 3000, 0);
    CHECK(d.reason && !strcmp(d.reason, "bad_time"), "ancient issuedAtMs with a future expiry → bad_time (%s)", d.reason);
    d = cmd("t2", now - 6000, now + 1000, 0);
    CHECK(d.reason && !strcmp(d.reason, "expired"), "issued 6 s ago, expiry still ahead → expired by age (%s)", d.reason);
    d = cmd("t3", now + 5000, now + 8000, 0);
    CHECK(d.reason && !strcmp(d.reason, "bad_time"), "issued 5 s in the future → bad_time (%s)", d.reason);
    d = cmd("t4", now, now - 1, 0);
    CHECK(d.reason && !strcmp(d.reason, "bad_time"), "expires before it was issued → bad_time (%s)", d.reason);
    d = cmd("t5", now, now + 3000, 5000);
    CHECK(d.reason && !strcmp(d.reason, "bad_duration"), "maxDurationMs 5000 > 1500 cap → bad_duration (%s)", d.reason);
    d = cmd("t6", now, now + 3000, 0);
    CmdDecision d7 = cmd("t7", now, now + 3000, 400);
    CHECK(d.result == CmdResult::Accepted && d7.result == CmdResult::Accepted && d7.durationMs == 400, "maxDurationMs 400 accepted and used as the cap (%u ms)", d7.durationMs);
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
  // 7b. Motion sensor health: missing or sparse motion data is reported, never read as "still"
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{};
    run(band, p, m, t, 60001, true, &w, nullptr, false, 0);   // pulse only, no motion samples
    char buf[512]; buildFeatures(c, "b", w, true, buf, sizeof buf);
    CHECK(!w.motionValid && w.motionCoverage == 0 && w.quality <= 0.5f && strstr(buf, "\"motionRms_g\":null") && strstr(buf, "\"moving\":null"),
          "no MPU6050 data → motionValid false, motion fields null, quality capped (%.2f)", w.quality);
    Band band2(c); SimPulse p2; SimMotion m2; uint32_t t2 = 1; Window w2{};
    run(band2, p2, m2, t2, 60001, true, &w2, nullptr, false, 2);  // half the motion samples
    CHECK(!w2.motionValid && w2.motionCoverage < 0.6f, "half the motion samples → not valid (coverage %.2f)", w2.motionCoverage);
    Band band3(c); SimPulse p3; SimMotion m3; uint32_t t3 = 1; Window w3{};
    run(band3, p3, m3, t3, 60001, true, &w3);
    CHECK(w3.motionValid && w3.motionCoverage > 0.95f, "full motion data → valid (coverage %.2f)", w3.motionCoverage);
    char st[300]; buildStatus(c, "b", true, true, 0, 0, "ok", "missing", st, sizeof st);
    CHECK(strstr(st, "\"motionSensor\":\"missing\"") != nullptr, "status reports sensor health: %s", st);
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
