/* Trial replay for the study admin (Participants tab → Replay): what one participant did on each trial, from the
   raw TraceLab events (raw/{code}/s{n}/t{i}) and the trial's CSV row. Loaded on demand by admin.js.
   - stage: the pointer path drawn to the participant's window size, clicks numbered, script-made input marked
   - timeline: lanes for pointer, clicks, keys, scrolling, form fields, hovers, tab hidden or window away, media,
     answers and scripted input, with a playhead; click a lane or use the slider to jump
   - play at 1x to 8x; the event log lists every event for exact reading (and for screen readers)
   Nothing here changes data. Key events carry only a category (char, backspace, ...), never the key. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var LANES = [
    ['pointer', 'Pointer'], ['click', 'Clicks'], ['key', 'Keys'], ['scroll', 'Scroll'], ['field', 'Fields'], ['hover', 'Hovers'],
    ['away', 'Hidden / away'], ['media', 'Media'], ['answer', 'Answers'], ['scripted', 'Scripted']
  ];
  var SPEEDS = [1, 2, 4, 8];

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function titled(node, text) { var t = document.createElementNS(NS, 'title'); t.textContent = text; node.appendChild(t); return node; }
  function secs(ms) { return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s'; }
  function itemName(r) { return r.item_id || r.alert_id || r.item_title || (r.target ? r.target + (r.distractor ? ' / ' + r.distractor : '') : '') || ''; }

  // Pair begin/end events into spans: [start, end, label]. An open span ends at the end of the trial.
  function spans(ev, open, close, keyOf, end) {
    var on = {}, out = [];
    ev.forEach(function (e) {
      if (e.type === open) on[keyOf(e)] = e;
      else if (e.type === close) { var k = keyOf(e), s = on[k]; if (s) { out.push([s.rt, e.rt, k]); delete on[k]; } }
    });
    Object.keys(on).forEach(function (k) { out.push([on[k].rt, end, k]); });
    return out;
  }

  // One trial's events, with rt = ms since the item began, split into what each lane draws.
  function prepare(rec) {
    var ev = (rec.events || []).filter(function (e) { return e && typeof e.t === 'number'; });
    var begin = ev.filter(function (e) { return e.type === 'item_begin'; })[0];
    var t0 = begin ? begin.t : ev.length ? ev[0].t : 0;
    ev.forEach(function (e) { e.rt = e.t - t0; });
    var endEv = ev.filter(function (e) { return e.type === 'item_end'; }).pop();
    var end = Math.max(endEv ? endEv.rt : 0, ev.length ? ev[ev.length - 1].rt : 0, 1);
    var moves = ev.filter(function (e) { return (e.type === 'move' || e.type === 'down' || e.type === 'click') && typeof e.x === 'number'; });
    var away = spans(ev, 'hidden', 'visible', function () { return 'tab hidden'; }, end)
      .concat(spans(ev, 'window_blur', 'window_focus', function () { return 'window in the background'; }, end));
    return {
      ev: ev, end: end, moves: moves,
      clicks: ev.filter(function (e) { return e.type === 'click'; }),
      keys: ev.filter(function (e) { return e.type === 'key_down'; }),
      scrolls: ev.filter(function (e) { return e.type === 'scroll' || e.type === 'wheel'; }),
      fields: spans(ev, 'focus_in', 'focus_out', function (e) { return e.target || '?'; }, end),
      hovers: spans(ev, 'hover_in', 'hover_out', function (e) { return e.target || '?'; }, end),
      away: away,
      media: ev.filter(function (e) { return /^media_/.test(e.type); }),
      answers: ev.filter(function (e) { return e.type === 'answer'; }),
      scripted: ev.filter(function (e) { return e.type === 'scripted'; }),
      reopened: ev.some(function (e) { return e.type === 'item_reopen'; })
    };
  }

  function open(box, opts) {
    var esc = opts.esc, raw = (opts.raw || []).slice().sort(function (a, b) { return (a.session - b.session) || (a.index - b.index); });
    var rows = {}; (opts.rows || []).forEach(function (r) { rows[r.session + ':' + r.trial_index] = r; });
    if (!raw.length) { box.innerHTML = '<div class="rp-head"><h2>Replay: <code>' + esc(opts.code) + '</code></h2><button type="button" class="secondary small" data-rp="close">Close</button></div><p class="muted">No behavior traces are stored for this participant yet (traces are saved with each finished trial).</p>'; wireClose(); return; }
    box.innerHTML = '<div class="rp-head"><h2>Replay: <code>' + esc(opts.code) + '</code></h2><button type="button" class="secondary small" data-rp="close">Close</button></div>' +
      '<div class="row"><label>Trial <select id="rp-trial">' + raw.map(function (r, i) {
        var row = rows[r.session + ':' + r.index] || {};
        return '<option value="' + i + '">Session ' + r.session + ', trial ' + r.index + (itemName(row) ? ': ' + esc(itemName(row)) : '') + '</option>';
      }).join('') + '</select></label>' +
      '<button type="button" class="secondary small" data-rp="prev" aria-label="Previous trial">◀</button><button type="button" class="secondary small" data-rp="next" aria-label="Next trial">▶</button></div>' +
      '<div class="rp-stats" id="rp-stats"></div>' +
      '<div class="rp-stage-wrap"><svg class="rp-stage" id="rp-stage" role="img" aria-label="Pointer path on the participant\'s screen"></svg></div>' +
      '<div class="rp-controls row"><button type="button" id="rp-play">Play</button><label>Speed <select id="rp-speed">' + SPEEDS.map(function (s) { return '<option value="' + s + '"' + (s === 2 ? ' selected' : '') + '>' + s + '×</option>'; }).join('') + '</select></label>' +
      '<input type="range" id="rp-seek" min="0" max="1000" value="1000" aria-label="Position in the trial"><span class="mono" id="rp-time"></span></div>' +
      '<svg class="rp-timeline" id="rp-timeline" aria-hidden="true"></svg>' +
      '<details class="rp-log"><summary>Event log</summary><div class="table-wrap"><table id="rp-log"></table></div></details>';
    var sel = box.querySelector('#rp-trial'), stage = box.querySelector('#rp-stage'), tl = box.querySelector('#rp-timeline');
    var seek = box.querySelector('#rp-seek'), timeOut = box.querySelector('#rp-time'), playBtn = box.querySelector('#rp-play'), speedSel = box.querySelector('#rp-speed');
    var cur = null, at = 0, playing = false, last = 0, frame = null, parts = {};

    function show(i) {
      stop();
      var rec = raw[i], row = rows[rec.session + ':' + rec.index] || {};
      cur = prepare(rec);
      cur.vw = Number(row.viewport_w) || Math.max.apply(null, [800].concat(cur.moves.map(function (m) { return m.x + 20; })));
      cur.vh = Number(row.viewport_h) || Math.max.apply(null, [600].concat(cur.moves.map(function (m) { return m.y + 20; })));
      stats(row);
      drawStage(); drawTimeline(); drawLog();
      setTime(cur.end);
    }

    function has(v) { return v !== '' && v != null; }
    function stats(row) {
      var chips = [
        ['Time on trial', has(row.trial_ms) ? secs(Number(row.trial_ms)) : secs(cur.end)],
        ['First input', has(row.first_interaction_ms) ? secs(Number(row.first_interaction_ms)) : '—'],
        ['No input', has(row.no_input_ms) ? secs(Number(row.no_input_ms)) : '—'],
        ['Clicks', cur.clicks.length], ['Keys', cur.keys.length], ['Pointer', row.pointer_type || '—'],
        ['Hidden', has(row.hidden_ms) ? secs(Number(row.hidden_ms)) : '0 s'],
        ['Events', cur.ev.length + (Number(row.raw_events_sent) > cur.ev.length ? ' of ' + row.raw_events_sent + ' (thinned)' : '')]
      ];
      if (cur.scripted.length) chips.push(['Scripted input', cur.scripted.length, 'bad']);
      if (cur.reopened) chips.push(['Save retried', 'yes', 'warn']);
      if (row.trace_version) chips.push(['TraceLab', row.trace_version]);
      box.querySelector('#rp-stats').innerHTML = chips.map(function (c) { return '<span class="rp-chip' + (c[2] ? ' rp-' + c[2] : '') + '"><span>' + esc(c[0]) + '</span> <strong>' + esc(c[1]) + '</strong></span>'; }).join('');
    }

    function drawStage() {
      stage.innerHTML = '';
      stage.setAttribute('viewBox', '0 0 ' + cur.vw + ' ' + cur.vh);
      stage.setAttribute('aria-label', 'Pointer path on the participant\'s ' + cur.vw + ' by ' + cur.vh + ' window: ' + cur.moves.length + ' samples, ' + cur.clicks.length + ' clicks');
      el('rect', { x: 0, y: 0, width: cur.vw, height: cur.vh, class: 'rp-screen' }, stage);
      parts.rest = el('polyline', { class: 'rp-path-rest', points: '' }, stage);
      parts.done = el('polyline', { class: 'rp-path', points: '' }, stage);
      parts.marks = el('g', {}, stage);
      cur.clicks.forEach(function (c, n) {
        if (typeof c.x !== 'number') return;
        var g = titled(el('g', { class: 'rp-click', 'data-rt': c.rt }, parts.marks), 'Click ' + (n + 1) + ' at ' + secs(c.rt) + (c.target ? ' on ' + c.target : ''));
        el('circle', { cx: c.x, cy: c.y, r: 9 }, g);
        el('text', { x: c.x, y: c.y + 4, 'text-anchor': 'middle' }, g).textContent = n + 1;
      });
      cur.scripted.forEach(function (s, n) {
        titled(el('text', { x: 10, y: 24 + n * 18, class: 'rp-scripted-mark', 'data-rt': s.rt }, parts.marks), 'Scripted ' + s.event + ' at ' + secs(s.rt)).textContent = '⚠ scripted ' + s.event + ' at ' + secs(s.rt);
      });
      parts.cursor = el('circle', { r: 6, class: 'rp-cursor' }, stage);
      if (!cur.moves.length) el('text', { x: cur.vw / 2, y: cur.vh / 2, 'text-anchor': 'middle', class: 'rp-empty' }, stage).textContent = 'No pointer movement recorded (keyboard or touch only).';
    }

    function lane(i) { return 18 + i * 22; }
    function drawTimeline() {
      tl.innerHTML = '';
      var W = Math.max(320, tl.clientWidth || 800), L = 104, H = lane(LANES.length) + 14, span = W - L - 10;
      tl.setAttribute('viewBox', '0 0 ' + W + ' ' + H); tl.setAttribute('height', H);
      var x = function (rt) { return L + Math.max(0, Math.min(1, rt / cur.end)) * span; };
      cur.x = x; cur.L = L; cur.span = span;
      LANES.forEach(function (ln, i) {
        el('line', { x1: L, x2: W - 10, y1: lane(i), y2: lane(i), class: 'rp-lane' }, tl);
        el('text', { x: L - 8, y: lane(i) + 4, 'text-anchor': 'end', class: 'rp-lane-label' }, tl).textContent = ln[1];
      });
      var tick = cur.end > 60000 ? 10000 : cur.end > 20000 ? 5000 : cur.end > 5000 ? 1000 : 500;
      for (var s = 0; s <= cur.end; s += tick) el('text', { x: x(s), y: H - 2, 'text-anchor': 'middle', class: 'rp-axis' }, tl).textContent = (s / 1000) + 's';
      var dot = function (laneIdx, rt, cls, label) { titled(el('rect', { x: x(rt) - 1.5, y: lane(laneIdx) - 6, width: 3, height: 12, class: cls }, tl), label); };
      var bar = function (laneIdx, a, b, cls, label) { titled(el('rect', { x: x(a), y: lane(laneIdx) - 5, width: Math.max(2, x(b) - x(a)), height: 10, rx: 3, class: cls }, tl), label); };
      // pointer: one mark per 100 ms with movement, so a dense path stays light
      var seen = {}; cur.moves.forEach(function (m) { var k = Math.floor(m.rt / 100); if (!seen[k]) { seen[k] = 1; el('rect', { x: x(m.rt), y: lane(0) - 4, width: Math.max(1, span * 100 / cur.end), height: 8, class: 'rp-m-pointer' }, tl); } });
      cur.clicks.forEach(function (c, n) { dot(1, c.rt, 'rp-m-click', 'Click ' + (n + 1) + ' at ' + secs(c.rt) + (c.target ? ' on ' + c.target : '')); });
      cur.keys.forEach(function (k) { dot(2, k.rt, 'rp-m-key', (k.k || 'key') + ' at ' + secs(k.rt)); });
      cur.scrolls.forEach(function (s) { dot(3, s.rt, 'rp-m-scroll', s.type + (s.target ? ' ' + s.target : '') + ' at ' + secs(s.rt)); });
      cur.fields.forEach(function (f) { bar(4, f[0], f[1], 'rp-m-field', 'In ' + f[2] + ' for ' + secs(f[1] - f[0])); });
      cur.hovers.forEach(function (h) { bar(5, h[0], h[1], 'rp-m-hover', 'Over ' + h[2] + ' for ' + secs(h[1] - h[0])); });
      cur.away.forEach(function (a) { bar(6, a[0], a[1], 'rp-m-away', a[2] + ' for ' + secs(a[1] - a[0])); });
      cur.media.forEach(function (m) { dot(7, m.rt, 'rp-m-media', m.type.replace('media_', '') + (m.at != null ? ' at ' + m.at + ' s of the clip' : '') + ' (' + secs(m.rt) + ')'); });
      cur.answers.forEach(function (a) { titled(el('path', { d: 'M' + x(a.rt) + ' ' + (lane(8) - 6) + ' l6 6 l-6 6 l-6 -6 z', class: 'rp-m-answer' }, tl), a.field + ' = ' + JSON.stringify(a.value) + ' at ' + secs(a.rt)); });
      cur.scripted.forEach(function (s) { dot(9, s.rt, 'rp-m-scripted', 'Scripted ' + s.event + ' at ' + secs(s.rt)); });
      parts.head = el('line', { y1: 4, y2: H - 12, class: 'rp-head-line' }, tl);
    }

    function drawLog() {
      var skip = { t: 1, rt: 1, type: 1, item: 1 }, list = cur.ev.slice(0, 3000);
      box.querySelector('#rp-log').innerHTML = '<tr><th>Time</th><th>Event</th><th>Details</th></tr>' + list.map(function (e) {
        var d = Object.keys(e).filter(function (k) { return !skip[k]; }).map(function (k) { return k + ': ' + (typeof e[k] === 'object' ? JSON.stringify(e[k]) : e[k]); }).join(', ');
        return '<tr' + (e.type === 'scripted' ? ' class="rp-bad"' : '') + '><td class="mono">' + secs(e.rt) + '</td><td>' + esc(e.type) + '</td><td class="mono">' + esc(d.slice(0, 300)) + '</td></tr>';
      }).join('') + (cur.ev.length > list.length ? '<tr><td colspan="3" class="muted">… ' + (cur.ev.length - list.length) + ' more in the raw download</td></tr>' : '');
    }

    // Everything up to time `ms`: the path walked so far, the cursor, clicks so far, the playhead.
    function setTime(ms) {
      at = Math.max(0, Math.min(cur.end, ms));
      var done = [], rest = [], pos = null;
      cur.moves.forEach(function (m) { if (m.rt <= at) { done.push(m.x + ',' + m.y); pos = m; } else rest.push(m.x + ',' + m.y); });
      if (done.length && rest.length) rest.unshift(done[done.length - 1]);
      parts.done.setAttribute('points', done.join(' ')); parts.rest.setAttribute('points', rest.join(' '));
      if (pos) { parts.cursor.setAttribute('cx', pos.x); parts.cursor.setAttribute('cy', pos.y); parts.cursor.removeAttribute('display'); } else parts.cursor.setAttribute('display', 'none');
      [].forEach.call(parts.marks.children, function (g) { g.style.opacity = Number(g.getAttribute('data-rt')) <= at ? 1 : 0.15; });
      var hx = cur.x(at); parts.head.setAttribute('x1', hx); parts.head.setAttribute('x2', hx);
      seek.value = Math.round(at / cur.end * 1000);
      timeOut.textContent = secs(at) + ' / ' + secs(cur.end);
    }

    function tick(now) {
      if (!playing) return;
      var dt = (now - last) * Number(speedSel.value); last = now;
      setTime(at + dt);
      if (at >= cur.end) return stop();
      frame = requestAnimationFrame(tick);
    }
    function play() { if (at >= cur.end) setTime(0); playing = true; playBtn.textContent = 'Pause'; last = performance.now(); frame = requestAnimationFrame(tick); }
    function stop() { playing = false; playBtn.textContent = 'Play'; if (frame) cancelAnimationFrame(frame); frame = null; }

    playBtn.addEventListener('click', function () { if (playing) stop(); else play(); });
    seek.addEventListener('input', function () { stop(); setTime(Number(seek.value) / 1000 * cur.end); });
    tl.addEventListener('click', function (e) {
      var r = tl.getBoundingClientRect(), vb = tl.viewBox.baseVal, px = (e.clientX - r.left) * (vb.width / r.width);
      if (px >= cur.L) { stop(); setTime((px - cur.L) / cur.span * cur.end); }
    });
    sel.addEventListener('change', function () { show(Number(sel.value)); });
    box.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-rp');
      if (a === 'prev' || a === 'next') { var i = Number(sel.value) + (a === 'next' ? 1 : -1); if (i >= 0 && i < raw.length) { sel.value = i; show(i); } }
      if (a === 'close') stop();
    });
    wireClose();
    show(0);

    function wireClose() {
      var b = box.querySelector('[data-rp="close"]');
      b.addEventListener('click', function () { box.innerHTML = ''; box.hidden = true; if (opts.onClose) opts.onClose(); });
    }
  }

  window.LabReplay = { open: open, prepare: prepare };
})();
