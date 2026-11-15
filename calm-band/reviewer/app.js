'use strict';
/* Calm Band reviewer page. Plain JS, same-origin only, no build step. */
(function () {
  var Q = new URLSearchParams(location.search);
  var FIX = Q.get('fixtures');              // '1' | 'empty' | 'error'
  var FORCE_ORIGIN = Q.get('origin');       // fixtures only: tag sessions as e.g. 'sim'
  var THEME = Q.get('theme');
  if (THEME === 'light' || THEME === 'dark') document.documentElement.setAttribute('data-theme', THEME);
  var API = '../api/companion/reviewer/';
  var FIXDIR = '../sim/fixtures/';
  var SVGNS = 'http://www.w3.org/2000/svg';

  var state = { sessions: null, trends: null, sid: null, timeline: null, sessionsKey: '', trendsKey: '' };

  /* ---------- helpers ---------- */
  function el(tag, attrs) {
    var svg = /^(svg|g|path|rect|circle|line|text|polygon|defs|pattern|title)$/.test(tag);
    var n = svg ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v.toFixed(d == null ? 1 : d) : '—'; }
  function pct(v) { return typeof v === 'number' ? Math.round(v) + '%' : '—'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function hhmmss(ms) { var d = new Date(ms); return hhmm(ms) + ':' + pad(d.getSeconds()); }
  function dateTime(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hhmm(ms);
  }
  function dur(ms) {
    if (typeof ms !== 'number') return '—';
    var s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + pad(s % 60);
  }
  function isSim(o) { return !!(o && o.origin && o.origin !== 'live'); }
  function setStatus(text, err) {
    var s = document.getElementById('status');
    s.textContent = text || '';
    s.className = 'status' + (err ? ' err' : '');
  }

  /* ---------- data ---------- */
  function getJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function load(kind, sid) {
    if (FIX) {
      if (FIX === 'error') return Promise.reject(new Error('fixtures=error'));
      if (FIX === 'empty') {
        if (kind === 'sessions') return Promise.resolve([]);
        if (kind === 'trends') return Promise.resolve({ schema: 1, utcOffsetMinutes: 0, days: [], sessions: [] });
      }
      if (kind === 'sessions') return getJson(FIXDIR + 'reviewer-sessions.json').then(function (a) {
        if (FORCE_ORIGIN) a.forEach(function (s) { s.origin = FORCE_ORIGIN; });
        return a;
      });
      if (kind === 'trends') return getJson(FIXDIR + 'reviewer-trends.json');
      return getJson(FIXDIR + 'reviewer-timeline.json').then(function (t) {
        if (t.companionSessionId === sid) {
          if (FORCE_ORIGIN === 'mixed') t.windows.forEach(function (w, i) { w.origin = i < t.windows.length / 2 ? 'sim' : 'live'; });
          else if (FORCE_ORIGIN) t.windows.forEach(function (w) { w.origin = FORCE_ORIGIN; });
          return t;
        }
        // No fixture timeline for this session: behave like a session with no band readings.
        var s = (state.sessions || []).filter(function (x) { return x.companionSessionId === sid; })[0] || {};
        var S = s.startedAtMs || 0, E = s.endedAtMs || S;
        return { schema: 1, companionSessionId: sid, startedAtMs: S, endedAtMs: s.endedAtMs, range: { fromMs: S - 300000, toMs: E + 300000 }, windows: [], events: [], commands: [] };
      });
    }
    if (kind === 'sessions') return getJson(API + 'sessions');
    if (kind === 'trends') return getJson(API + 'trends');
    return getJson(API + 'sessions/' + encodeURIComponent(sid) + '/timeline');
  }

  /* ---------- sessions list ---------- */
  function renderSessions() {
    var box = document.getElementById('sessions');
    clear(box);
    var list = state.sessions;
    if (list == null) return;
    if (!list.length) {
      box.appendChild(el('p', { class: 'msg', 'data-testid': 'empty-sessions', text: 'No sessions recorded yet. Sessions appear here after a MirrorWell session is started.' }));
      return;
    }
    list.slice().reverse().forEach(function (s) {
      var title = el('span', { class: 't' },
        el('span', { text: dateTime(s.startedAtMs) }),
        el('span', null,
          s.state === 'open' ? el('span', { class: 'badge open', text: 'OPEN ' }) : null,
          isSim(s) ? el('span', { class: 'badge', 'data-testid': 'sim-badge', title: 'origin: ' + s.origin, text: s.origin === 'mixed' ? 'SIMULATED (MIXED)' : 'SIMULATED' }) : null));
      var cells = [
        ['Duration', dur(s.durationMs)], ['Reps', s.reps != null ? String(s.reps) : '—'], ['Cues', s.cues != null ? String(s.cues) : '—'],
        ['Ease-offs', s.easeOffs != null ? String(s.easeOffs) : '—'], ['Signal', pct(s.signalPct)],
        ['Mean usable pulse', meanPulse(s.companionSessionId)]
      ];
      var m = el('span', { class: 'm' });
      cells.forEach(function (c) { m.appendChild(el('span', null, c[0] + ' ', el('b', { text: c[1] }))); });
      var b = el('button', { type: 'button', class: 'srow', 'data-sid': s.companionSessionId, 'data-testid': 'session-row' }, title, m);
      if (s.companionSessionId === state.sid) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () { selectSession(s.companionSessionId, true); });
      box.appendChild(b);
    });
  }
  function meanPulse(sid) {
    var t = state.trends && state.trends.sessions || [];
    for (var i = 0; i < t.length; i++) if (t[i].companionSessionId === sid) return t[i].meanUsablePulseBpm == null ? '—' : num(t[i].meanUsablePulseBpm) + ' bpm';
    return '—';
  }

  /* ---------- detail ---------- */
  function selectSession(sid, scroll) {
    var switching = sid !== state.sid;
    state.sid = sid;
    renderSessions();
    var box = document.getElementById('detail');
    if (switching) {
      clear(box);
      box.appendChild(el('p', { class: 'msg', text: 'Loading session…' }));
    }
    if (scroll && window.matchMedia('(max-width:820px)').matches) document.getElementById('detail-panel').scrollIntoView({ behavior: 'smooth' });
    return load('timeline', sid).then(function (t) {
      if (state.sid !== sid) return;
      state.timeline = t;
      renderDetail();
    }, function () {
      if (state.sid !== sid) return;
      clear(box);
      box.appendChild(el('p', { class: 'msg err', 'data-testid': 'detail-error', text: 'Could not load this session. The reviewer service did not answer. It will be tried again on the next refresh.' }));
    });
  }
  function currentSession() {
    return (state.sessions || []).filter(function (s) { return s.companionSessionId === state.sid; })[0];
  }
  function renderDetail() {
    var box = document.getElementById('detail');
    clear(box);
    var s = currentSession(), t = state.timeline;
    if (!s || !t || t.companionSessionId !== state.sid) { box.appendChild(el('p', { class: 'msg', text: 'Pick a session from the list.' })); return; }
    var winSim = (t.windows || []).some(isSim);
    box.appendChild(el('h3', { style: 'margin-top:0' }, dateTime(s.startedAtMs) + '  ',
      (isSim(s) || winSim) ? el('span', { class: 'badge', 'data-testid': 'detail-sim-badge', text: 'SIMULATED' }) : null));
    if (winSim && !isSim(s)) box.appendChild(el('p', { class: 'msg', text: 'Some readings in this session are simulated or replayed, not from the live band. Hover a point to see the origin of each reading.' }));
    var usable = (t.windows || []).filter(function (w) { return w.usable && typeof w.pulseRateBpm === 'number'; });
    if (!t.windows || !t.windows.length) {
      box.appendChild(el('p', { class: 'msg', 'data-testid': 'no-windows', text: 'The band sent no readings during this session, so there is no pulse chart. Reps and cues are still counted in the list.' }));
    } else {
      if (!usable.length) box.appendChild(el('p', { class: 'msg', 'data-testid': 'no-usable', text: 'No usable pulse readings in this session. The chart below shows where the signal was moving, interrupted or low quality.' }));
      var wrap = el('div', { class: 'chartwrap', 'data-testid': 'chart' });
      box.appendChild(wrap);
      drawTimeline(wrap, t);
      box.appendChild(legend());
    }
    box.appendChild(facts(s));
  }

  function legend() {
    function li(sw, txt) { return el('li', null, sw, txt); }
    var ul = el('ul', { class: 'legend', 'data-testid': 'legend' });
    ul.appendChild(li(el('span', { class: 'sw line' }), 'Usable pulse (line breaks at gaps)'));
    ul.appendChild(li(el('span', { class: 'sw moving' }), 'Hand moving'));
    ul.appendChild(li(el('span', { class: 'sw motor' }), 'Band buzzing (motor on)'));
    ul.appendChild(li(el('span', { class: 'sw good' }), 'Signal ≥ 0.8'));
    ul.appendChild(li(el('span', { class: 'sw mid' }), '0.5–0.8'));
    ul.appendChild(li(el('span', { class: 'sw bad' }), '< 0.5'));
    ul.appendChild(li(svgIcon('circle'), 'Rep'));
    ul.appendChild(li(svgIcon('tri-ok'), 'Cue (green = executed)'));
    ul.appendChild(li(svgIcon('tri-bad'), 'Cue stopped/rejected'));
    ul.appendChild(li(svgIcon('tri-pend'), 'Cue not confirmed'));
    ul.appendChild(li(svgIcon('diamond'), 'Ease-off'));
    ul.appendChild(li(svgIcon('square'), 'STOP press'));
    return ul;
  }
  function svgIcon(kind) {
    var s = el('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': 'true' });
    if (kind === 'circle') s.appendChild(el('circle', { cx: 7, cy: 7, r: 4, class: 'm-rep' }));
    else if (kind.indexOf('tri') === 0) s.appendChild(el('polygon', { points: '7,2 12,12 2,12', class: kind === 'tri-ok' ? 'm-ok' : kind === 'tri-bad' ? 'm-bad' : 'm-pend' }));
    else if (kind === 'diamond') s.appendChild(el('polygon', { points: '7,1 13,7 7,13 1,7', class: 'm-ease' }));
    else s.appendChild(el('rect', { x: 2, y: 2, width: 10, height: 10, class: 'm-stop' }));
    return s;
  }

  function facts(s) {
    var dl = el('dl', { class: 'facts', 'data-testid': 'facts' });
    function f(k, v, note) { dl.appendChild(el('div', null, el('dt', { text: k }), el('dd', null, v, note ? el('small', { text: note }) : null))); }
    var trend = s.pulseTrend || 'insufficient';
    var d = (s.startBpm != null && s.endBpm != null) ? s.endBpm - s.startBpm : null;
    f('Pulse trend', trend, d == null ? 'not enough usable readings' : (d > 0 ? '+' : '') + num(d) + ' bpm');
    f('Start pulse', s.startBpm == null ? '—' : num(s.startBpm) + ' bpm');
    f('End pulse', s.endBpm == null ? '—' : num(s.endBpm) + ' bpm');
    f('Steady hand', pct(s.steadyPct), 'windows with a still hand');
    f('Signal', pct(s.signalPct), 'usable windows, buzz excluded');
    var ci = s.calmIndex || {};
    f('Calm index', ci.value == null ? '—' : String(ci.value), 'experimental: not a medical or stress measure');
    f('Reps / cues / ease-offs', (s.reps == null ? '—' : s.reps) + ' / ' + (s.cues == null ? '—' : s.cues) + ' / ' + (s.easeOffs == null ? '—' : s.easeOffs));
    f('Pre / post reading', num(s.prePulseBpm) + ' / ' + num(s.postPulseBpm), 'bpm, outside the session');
    return el('div', null, el('h3', { text: 'Session facts' }), dl);
  }

  /* ---------- timeline chart ---------- */
  var tipEl = document.getElementById('tip');
  function showTip(content, x, y) {
    clear(tipEl);
    tipEl.appendChild(content);
    tipEl.hidden = false;
    var r = tipEl.getBoundingClientRect();
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
    var top = y - r.height - 14; if (top < 8) top = y + 18;
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
  }
  function hideTip() { tipEl.hidden = true; }
  function dlist(rows) {
    var dl = el('dl');
    rows.forEach(function (r) { dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', { text: r[1] })); });
    return dl;
  }
  function qClass(q) { return typeof q !== 'number' ? 'q-none' : q >= 0.8 ? 'q-good' : q >= 0.5 ? 'q-mid' : 'q-bad'; }

  function drawTimeline(wrap, t) {
    clear(wrap);
    var W = Math.max(300, wrap.clientWidth || 640);
    var narrow = W < 520;
    var M = { l: narrow ? 52 : 62, r: 10, t: 6 };
    var laneH = 15, lanes = 3;
    var pulseTop = M.t + laneH * lanes + 18, pulseH = narrow ? 170 : 200;
    var qTop = pulseTop + pulseH + 6, qH = 16;
    var axisY = qTop + qH + 4;
    var H = axisY + 22;
    var from = t.range.fromMs, to = t.range.toMs;
    var pw = W - M.l - M.r;
    function X(ms) { return M.l + (ms - from) / (to - from) * pw; }

    var wins = t.windows;
    var steps = [];
    for (var i = 1; i < wins.length; i++) { var dd = wins[i].windowEndMs - wins[i - 1].windowEndMs; if (dd > 0) steps.push(dd); }
    steps.sort(function (a, b) { return a - b; });
    var step = steps.length ? steps[Math.floor(steps.length / 2)] : 15000;

    var pv = wins.filter(function (w) { return w.usable && typeof w.pulseRateBpm === 'number'; }).map(function (w) { return w.pulseRateBpm; });
    var lo = pv.length ? Math.min.apply(null, pv) : 60, hi = pv.length ? Math.max.apply(null, pv) : 100;
    lo = Math.floor(lo / 5) * 5 - 5; hi = Math.ceil(hi / 5) * 5 + 5;
    if (hi - lo < 20) hi = lo + 20;
    function Y(b) { return pulseTop + (hi - b) / (hi - lo) * pulseH; }

    var svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Pulse over time with movement, buzz, reps and cues' });
    svg.appendChild(el('defs', null, el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      el('rect', { width: 6, height: 6, class: 'hatchbg' }), el('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatchline' }))));

    var yStep = (hi - lo) <= 30 ? 5 : 10;
    for (var b = Math.ceil(lo / yStep) * yStep; b <= hi; b += yStep) {
      svg.appendChild(el('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: Y(b), y2: Y(b) }));
      svg.appendChild(el('text', { x: M.l - 5, y: Y(b) + 4, 'text-anchor': 'end', text: String(b) }));
    }
    svg.appendChild(el('text', { x: M.l - 5, y: pulseTop - 5, 'text-anchor': 'end', text: 'bpm' }));

    var span = (to - from) / 60000;
    var stepMin = [1, 2, 5, 10, 15, 30, 60].filter(function (m) { return span / m <= (narrow ? 6 : 10); })[0] || 60;
    var first = Math.ceil(from / (stepMin * 60000)) * stepMin * 60000;
    for (var tk = first; tk <= to; tk += stepMin * 60000) {
      svg.appendChild(el('line', { class: 'grid', x1: X(tk), x2: X(tk), y1: pulseTop, y2: qTop + qH }));
      svg.appendChild(el('text', { x: X(tk), y: axisY + 14, 'text-anchor': 'middle', text: hhmm(tk) }));
    }

    // bands: each window covers its newest 'step' of time
    wins.forEach(function (w) {
      var x0 = X(Math.max(from, w.windowEndMs - step)), x1 = X(Math.min(to, w.windowEndMs));
      if (x1 <= x0) return;
      if (w.moving === true) svg.appendChild(el('rect', { class: 'b-moving', x: x0, y: pulseTop, width: x1 - x0 + 0.5, height: pulseH }));
      if (w.motorActive === true) svg.appendChild(el('rect', { class: 'b-motor', x: x0, y: pulseTop, width: x1 - x0 + 0.5, height: pulseH }));
    });

    [['start', t.startedAtMs], ['end', t.endedAtMs]].forEach(function (p) {
      if (p[1] == null) return;
      svg.appendChild(el('line', { class: 'sess', x1: X(p[1]), x2: X(p[1]), y1: M.t, y2: qTop + qH }));
      svg.appendChild(el('text', { x: X(p[1]) + 3, y: pulseTop + 11, text: p[0] }));
    });

    // pulse line: break at unusable windows and at time gaps
    var path = '', open = false, prevEnd = null, dots = [];
    wins.forEach(function (w) {
      var ok = w.usable && typeof w.pulseRateBpm === 'number';
      if (!ok || (prevEnd != null && w.windowEndMs - prevEnd > step * 2.5)) open = false;
      prevEnd = w.windowEndMs;
      if (!ok) return;
      var x = X(w.windowEndMs), y = Y(w.pulseRateBpm);
      path += (open ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      open = true; dots.push([x, y, w]);
    });
    if (path) svg.appendChild(el('path', { class: 'pulse', d: path, 'data-testid': 'pulse-line' }));
    dots.forEach(function (d) {
      svg.appendChild(el('circle', { class: 'pdot', cx: d[0], cy: d[1], r: d[2].reading ? 4.5 : 2.2 }));
    });

    // quality strip
    svg.appendChild(el('text', { x: M.l - 5, y: qTop + 12, 'text-anchor': 'end', text: 'signal' }));
    wins.forEach(function (w) {
      var x0 = X(Math.max(from, w.windowEndMs - step)), x1 = X(w.windowEndMs);
      svg.appendChild(el('rect', { class: qClass(w.contact === false ? null : w.quality), x: x0, y: qTop, width: Math.max(1, x1 - x0 - 0.5), height: qH }));
    });
    (t.events || []).filter(function (e) { return e.source === 'band' && e.type === 'contact'; }).forEach(function (e) {
      svg.appendChild(el('line', { class: 'm-contact', x1: X(e.atMs), x2: X(e.atMs), y1: qTop - 2, y2: qTop + qH + 2 }, el('title', { text: 'finger ' + e.detail + ' at ' + hhmmss(e.atMs) })));
    });

    // marker lanes
    ['reps', 'cues', 'ease / STOP'].forEach(function (n, i) {
      svg.appendChild(el('text', { class: 'lane', x: M.l - 5, y: M.t + i * laneH + 11, 'text-anchor': 'end', text: n }));
    });
    function laneY(i) { return M.t + i * laneH + laneH / 2; }
    (t.events || []).forEach(function (e) {
      if (e.source === 'mirrorwell' && e.type === 'rep') {
        svg.appendChild(el('circle', { class: 'm-rep', cx: X(e.atMs), cy: laneY(0), r: 3.5 }, el('title', { text: 'rep ' + ((e.repIndex == null ? 0 : e.repIndex) + 1) + ' at ' + hhmmss(e.atMs) })));
      } else if (e.source === 'mirrorwell' && e.type === 'ease_off' && e.active) {
        var x = X(e.atMs), y = laneY(2);
        svg.appendChild(el('polygon', { class: 'm-ease', points: [x, y - 6, x + 6, y, x, y + 6, x - 6, y].join(' ') }, el('title', { text: 'ease-off at ' + hhmmss(e.atMs) })));
      } else if (e.source === 'band' && e.type === 'button') {
        var bx = X(e.atMs), by = laneY(2);
        svg.appendChild(el('rect', { class: 'm-stop', x: bx - 5, y: by - 5, width: 10, height: 10 }, el('title', { text: 'STOP pressed at ' + hhmmss(e.atMs) })));
      }
    });
    (t.commands || []).forEach(function (c) {
      var acc = (c.acks || []).filter(function (a) { return a.result === 'accepted'; })[0];
      var at = acc ? acc.atMs : c.issuedAtMs;
      var cls = c.outcome === 'executed' ? 'm-ok' : (c.outcome === 'stopped' || c.outcome === 'rejected') ? 'm-bad' : 'm-pend';
      var x = X(at), y = laneY(1);
      svg.appendChild(el('polygon', { class: cls, points: [x, y - 6, x + 5.5, y + 5, x - 5.5, y + 5].join(' ') }, el('title', { text: c.pattern + ': ' + c.outcome + ' at ' + hhmmss(at) })));
    });

    // hover / tap layer
    var guide = el('line', { class: 'guide', y1: M.t, y2: qTop + qH, x1: 0, x2: 0, style: 'display:none' });
    svg.appendChild(guide);
    var hit = el('rect', { x: M.l, y: pulseTop, width: pw, height: pulseH + qH + 6, fill: 'transparent', 'data-testid': 'hit' });
    svg.appendChild(hit);
    function onMove(ev) {
      var r = svg.getBoundingClientRect(), scale = W / r.width;
      var px = (ev.clientX - r.left) * scale;
      var ms = from + (px - M.l) / pw * (to - from);
      var best = null, bd = Infinity;
      wins.forEach(function (w) { var d = Math.abs(w.windowEndMs - step / 2 - ms); if (d < bd) { bd = d; best = w; } });
      if (!best || bd > step * 2) { hideTip(); guide.style.display = 'none'; return; }
      var gx = X(best.windowEndMs - step / 2);
      guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.style.display = '';
      var rows = [
        ['Window ends', hhmmss(best.windowEndMs)],
        ['Pulse', typeof best.pulseRateBpm === 'number' ? num(best.pulseRateBpm) + ' bpm' + (best.usable ? '' : ' (not usable)') : '—'],
        ['Usable', best.usable ? 'yes' : 'no' + (best.problems && best.problems.length ? ': ' + best.problems.join(', ') : '')],
        ['Quality', num(best.quality, 2)],
        ['Contact', best.contact ? 'yes' : 'no'],
        ['Moving', best.moving === true ? 'yes' : best.moving === false ? 'no' : 'no data'],
        ['Band buzzing', best.motorActive ? 'yes (flagged)' : 'no'],
        ['Role', best.role + (best.reading ? ' / ' + best.reading + ' reading' : '')]
      ];
      if (best.origin) rows.push(['Origin', best.origin]);
      showTip(dlist(rows), ev.clientX, ev.clientY);
    }
    hit.addEventListener('pointermove', onMove);
    hit.addEventListener('pointerdown', onMove);
    hit.addEventListener('pointerleave', function () { hideTip(); guide.style.display = 'none'; });
    wrap.appendChild(svg);
  }

  /* ---------- trends ---------- */
  function renderTrends() {
    var box = document.getElementById('trends');
    clear(box);
    var t = state.trends;
    if (!t) return;
    if (!t.sessions || !t.sessions.length) {
      box.appendChild(el('p', { class: 'msg', 'data-testid': 'empty-trends', text: 'No trend data yet. Charts appear once at least one session is recorded.' }));
      return;
    }
    var g = el('div', { class: 'trendgrid' });
    var a = el('div', null, el('h3', { text: 'Sessions per day', style: 'margin-top:0' }));
    var b = el('div', null, el('h3', { text: 'Mean usable pulse per session (bpm)', style: 'margin-top:0' }));
    g.appendChild(a); g.appendChild(b); box.appendChild(g);
    a.appendChild(barChart(t.days, Math.max(280, a.clientWidth || 400)));
    b.appendChild(pulseChart(t.sessions, Math.max(280, b.clientWidth || 400)));
  }
  function barChart(days, W) {
    var H = 170, M = { l: 30, r: 8, t: 10, b: 34 }, pw = W - M.l - M.r, ph = H - M.t - M.b;
    var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.sessions; })));
    var svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Sessions per day', 'data-testid': 'trend-days' });
    for (var v = 0; v <= max; v++) {
      var y = M.t + ph - v / max * ph;
      svg.appendChild(el('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: y, y2: y }));
      svg.appendChild(el('text', { x: M.l - 5, y: y + 4, 'text-anchor': 'end', text: String(v) }));
    }
    var bw = Math.min(40, pw / days.length * 0.6);
    days.forEach(function (d, i) {
      var cx = M.l + pw * (i + 0.5) / days.length, h = d.sessions / max * ph;
      svg.appendChild(el('rect', { class: 'm-rep', x: cx - bw / 2, y: M.t + ph - h, width: bw, height: h }, el('title', { text: d.date + ': ' + d.sessions + ' session(s)' })));
      svg.appendChild(el('text', { x: cx, y: H - 14, 'text-anchor': 'middle', text: d.date.slice(5) }));
    });
    return svg;
  }
  function pulseChart(sessions, W) {
    var H = 170, M = { l: 36, r: 12, t: 10, b: 34 }, pw = W - M.l - M.r, ph = H - M.t - M.b;
    var vals = sessions.map(function (s) { return s.meanUsablePulseBpm; }).filter(function (v) { return typeof v === 'number'; });
    var lo = vals.length ? Math.floor(Math.min.apply(null, vals) / 5) * 5 - 5 : 60, hi = vals.length ? Math.ceil(Math.max.apply(null, vals) / 5) * 5 + 5 : 100;
    if (hi - lo < 20) hi = lo + 20;
    function Y(v) { return M.t + (hi - v) / (hi - lo) * ph; }
    function X(i) { return sessions.length === 1 ? M.l + pw / 2 : M.l + 24 + (pw - 48) * i / (sessions.length - 1); }
    var svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Mean usable pulse per session', 'data-testid': 'trend-pulse' });
    for (var v = lo; v <= hi; v += 5) {
      svg.appendChild(el('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v) }));
      svg.appendChild(el('text', { x: M.l - 5, y: Y(v) + 4, 'text-anchor': 'end', text: String(v) }));
    }
    var path = '', open = false;
    sessions.forEach(function (s, i) {
      if (typeof s.meanUsablePulseBpm !== 'number') { open = false; return; }
      path += (open ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s.meanUsablePulseBpm).toFixed(1) + ' '; open = true;
    });
    if (path) svg.appendChild(el('path', { class: 'pulse', d: path }));
    sessions.forEach(function (s, i) {
      var x = X(i);
      if (typeof s.meanUsablePulseBpm === 'number') {
        svg.appendChild(el('circle', { class: 'pdot', cx: x, cy: Y(s.meanUsablePulseBpm), r: 4 }, el('title', { text: s.date + ': ' + num(s.meanUsablePulseBpm) + ' bpm from ' + s.readings + ' reading(s)' })));
      } else {
        svg.appendChild(el('text', { x: x, y: M.t + ph / 2, 'text-anchor': 'middle', text: 'no reading' }, el('title', { text: s.date + ': no usable pulse reading' })));
      }
      svg.appendChild(el('text', { x: x, y: H - 14, 'text-anchor': 'middle', text: s.date.slice(5) }));
    });
    return svg;
  }

  /* ---------- refresh loop ---------- */
  function refresh() {
    return Promise.all([load('sessions'), load('trends')]).then(function (r) {
      var sessions = r[0], trends = r[1];
      setStatus('Updated ' + hhmmss(Date.now()) + '. Refreshes every 10 s.');
      var sk = JSON.stringify(sessions), tk = JSON.stringify(trends);
      var changed = sk !== state.sessionsKey || tk !== state.trendsKey || state.hadError;
      state.sessions = sessions; state.trends = trends; state.sessionsKey = sk; state.trendsKey = tk; state.hadError = false;
      if (changed) { renderSessions(); renderTrends(); }
      if (!state.sid && sessions.length) return selectSession(sessions[sessions.length - 1].companionSessionId, false);
      var cur = currentSession();
      if (state.sid && !cur) { state.sid = null; state.timeline = null; renderDetail(); }
      else if (cur && (cur.state === 'open' || changed)) return selectSession(state.sid, false);
    }, function () {
      state.hadError = true;
      setStatus('Cannot reach the Calm Band service. Showing the last data received, trying again in 10 s.', true);
      if (state.sessions == null) {
        var box = document.getElementById('sessions'); clear(box);
        box.appendChild(el('p', { class: 'msg err', 'data-testid': 'api-error', text: 'Cannot reach the Calm Band service. Check that the backend is running on this address.' }));
        var tb = document.getElementById('trends'); clear(tb);
        tb.appendChild(el('p', { class: 'msg err', text: 'Trends are unavailable until the service answers.' }));
      }
    });
  }

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { renderDetail(); renderTrends(); }, 150); });
  document.addEventListener('scroll', hideTip, true);
  refresh();
  setInterval(refresh, 10000);
})();
