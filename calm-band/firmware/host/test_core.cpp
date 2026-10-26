// Unit tests for calm_core (runs on Linux). Build: make test
#include <stdio.h>
#include <string.h>
#include <math.h>
#include "../calm_band/calm_core.h"
#include "../calm_band/sim_sources.h"

using namespace calm;

// Fake MAX30102 with the datasheet's FIFO behaviour: 32 slots, write/read pointers, rollover on
// (oldest sample overwritten when full), OVF_COUNTER counts overwritten samples (saturates at
// 31) and resets to 0 when a complete sample is popped; reading FIFO_DATA pops samples.
struct FakeMax30102 : PulseBus {
  uint32_t slot[32] = {}; uint8_t wr = 0, rd = 0, ovf = 0; int count = 0;
  bool connected = true; int cutAfterBytes = -1;   // ≥0: next burst stops after this many bytes
  uint32_t nextValue = 100000;
  void produce(int k) {                            // the sensor takes k new samples
    for (int i = 0; i < k; i++) {
      if (count == 32) { rd = (rd + 1) & 31; count--; if (ovf < 31) ovf++; }   // rollover
      slot[wr] = nextValue++; wr = (wr + 1) & 31; count++;
    }
  }
  bool read8(uint8_t reg, uint8_t* v) override {
    if (!connected) return false;
    if (reg == 0x04) *v = wr; else if (reg == 0x05) *v = ovf; else if (reg == 0x06) *v = rd; else *v = 0;
    return true;
  }
  int readBytes(uint8_t reg, uint8_t* buf, int n) override {
    if (!connected || reg != 0x07) return -1;
    int limit = cutAfterBytes >= 0 ? cutAfterBytes : n; cutAfterBytes = -1;
    int got = 0;
    while (got < n && got < limit) {
      if (got % 6 == 0) { if (!count) break; }
      int inSample = got % 6;
      uint32_t ir = slot[rd];
      uint8_t byte = inSample < 3 ? 0x01 : (uint8_t)(ir >> (8 * (5 - inSample)));
      buf[got++] = byte;
      if (got % 6 == 0) { rd = (rd + 1) & 31; count--; ovf = 0; }   // complete sample popped
    }
    return got;
  }
};
struct Collected { uint32_t t[256]; float ir[256]; int n = 0; };
static void collect(void* ctx, uint32_t t, float ir) { Collected* c = (Collected*)ctx; if (c->n < 256) { c->t[c->n] = t; c->ir[c->n] = ir; c->n++; } }
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
  // 7c. Lost samples (sensor FIFO overflow) mark the covering windows as timing gaps
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{};
    run(band, p, m, t, 30000, true, &w);
    band.notePulseLoss(t, 12);
    run(band, p, m, t, 30001, true, &w);
    bool gapNow = w.timingGap;
    run(band, p, m, t, 60000, true, &w);               // the loss has left the 60 s window
    CHECK(gapNow && !w.timingGap, "lost samples → timingGap while in the window, cleared afterwards");
  }
  // 7d. Expiry re-check right before the motor starts
  {
    CommandGate g; int64_t now = 1'760'000'000'000LL; char b[200];
    snprintf(b, sizeof b, "{\"commandId\":\"e1\",\"pattern\":\"rep_pulse\",\"issuedAtMs\":%lld,\"expiresAtMs\":%lld}", (long long)now, (long long)(now + 50));
    CmdDecision d = g.check(b, strlen(b), true, now);
    CHECK(d.result == CmdResult::Accepted && CommandGate::stillValid(d, now + 50) && !CommandGate::stillValid(d, now + 51),
          "a command accepted 50 ms before expiry is refused if the start is later than its expiry");
  }
  // 9. MAX30102 FIFO reader against a datasheet-behaving fake
  {
    FakeMax30102 f; Collected c;
    f.produce(7);
    FifoResult r = drainMax30102(f, 1000, 10, collect, &c);
    bool order = c.n == 7 && c.t[0] == 940 && c.t[6] == 1000 && c.ir[0] == 100000 && c.ir[6] == 100006;
    CHECK(r.ok && r.samples == 7 && r.lost == 0 && order && f.count == 0, "normal read: 7 samples, oldest first, newest stamped now");
    f.produce(40);                                            // reader late by 400 ms: 8 overwritten
    Collected c2; r = drainMax30102(f, 2000, 10, collect, &c2);
    CHECK(r.ok && r.samples == 32 && r.lost == 8 && c2.ir[0] == 100007 + 8 && c2.t[0] == 2000 - 310 && f.ovf == 0,
          "overflow: 32 newest delivered, 8 reported lost (counter reset after the pop)");
    f.produce(25); f.cutAfterBytes = 6 * 11 + 3;              // burst cut mid-sample
    Collected c3; r = drainMax30102(f, 3000, 10, collect, &c3);
    bool partial = !r.ok && r.samples == 11 && f.count == 14;
    Collected c4; FifoResult r2 = drainMax30102(f, 3010, 10, collect, &c4);
    CHECK(partial && r2.ok && r2.samples == 14 && c4.ir[0] == c3.ir[10] + 1,
          "partial burst: 11 complete samples kept, ok=false, the rest read next time with nothing skipped");
    f.connected = false;
    Collected c5; r = drainMax30102(f, 4000, 10, collect, &c5);
    CHECK(!r.ok && r.samples == 0, "disconnected: read fails (not mistaken for an empty FIFO)");
    f.connected = true; f.produce(3);
    Collected c6; r = drainMax30102(f, 5000, 10, collect, &c6);
    CHECK(r.ok && r.samples == 3, "reconnected: reads resume");
    f.produce(0); Collected c7; r = drainMax30102(f, 6000, 10, collect, &c7);
    CHECK(r.ok && r.samples == 0, "genuinely empty FIFO: ok with 0 samples");
  }
  // 10. Sensor health: repeated failures → missing; paced retries; recovery
  {
    SensorHealth h(5, 5000); h.begin(true, 0);
    bool flipped = false;
    for (int i = 0; i < 4; i++) flipped |= h.report(false, 100 + i);
    bool stillOk = h.ok() && !flipped;
    h.report(true, 200);
    for (int i = 0; i < 4; i++) h.report(false, 300 + i);
    bool notYet = h.ok();
    bool f5 = h.report(false, 400);
    CHECK(stillOk && notYet && f5 && !h.ok(), "5 failures IN A ROW flip to missing; a success resets the count");
    bool early = h.retryDue(3000), due = h.retryDue(5400), again = h.retryDue(5500);
    CHECK(!early && due && !again, "retry paced: none before 5 s, one at 5 s, not again immediately");
    CHECK(h.recovered() && h.ok() && !h.recovered(), "recovery flips back to ok once");
    SensorHealth h2(5, 5000); h2.begin(false, 0);
    CHECK(!h2.ok() && h2.retryDue(5000), "missing at startup → retried after 5 s");
  }
  // 11. Recovery requires a clean window: resetPulse marks a gap for one full window
  {
    Band band(c); SimPulse p; SimMotion m; uint32_t t = 1; Window w{};
    run(band, p, m, t, 70000, true, &w);
    band.resetPulse(t);
    run(band, p, m, t, 15001, true, &w);
    bool gap = w.timingGap && w.quality >= 0;
    run(band, p, m, t, 60000, true, &w);
    CHECK(gap && !w.timingGap && w.hasPulse, "after sensor recovery: windows covering it are gaps, then clean again");
  }
  // 12. Immediate contact: debounced 1 s, independent of the 60 s window
  {
    ContactTracker ct(1000);
    bool c1 = ct.update(0, true), c2 = ct.update(999, true), c3 = ct.update(1000, true), onAfter = ct.on();
    bool b1 = ct.update(1500, false), b2 = ct.update(1900, true), b3 = ct.update(2400, false), b4 = ct.update(3400, false);
    CHECK(!c1 && !c2 && c3 && onAfter, "finger on reported after 1 s");
    CHECK(!b1 && !b2 && !b3 && b4 && !ct.on(), "a 0.4 s blip is ignored; off reported after 1 s steady");
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
