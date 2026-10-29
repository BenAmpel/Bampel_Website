/*!
 * TraceLab: passive behavioral trace capture for browser-based studies.
 * CCAIR Behavioral Lab, Georgia State University (bampel.com/lab).
 *
 * Captures, after consent only:
 *   - timing: item duration, first-interaction latency, idle gaps
 *   - pointer: sampled cursor path, clicks, hovers over [data-trace] targets, pointer type (mouse, touch, pen)
 *   - scrolling (the page and scrollable panels inside it) and wheel input
 *   - keyboard: key category and timing (never the key itself), hold and between-key times, text edits,
 *     paste/copy/cut, and time spent in each form field
 *   - attention: tab hidden time, window focus loss, resizes, stretches with no input at all
 *   - answers: every change to a response, not just the final value
 *   - media: play/pause/seek/ended, seconds actually played (not skipped over), muted at the end, for <audio>/<video>
 *   - device context: viewport, screen, pointer type, touch support, language, timezone
 *
 * Usage:
 *   const lab = TraceLab.create({ study: 'demo', version: '1', sink: { type: 'local' } });
 *   lab.start();                         // call only after consent
 *   lab.beginItem('q1', rootElement);    // mark an item (page/question)
 *   lab.recordAnswer('q1', value);       // call on every answer change
 *   lab.endItem({ choice: 'phishing' }); // final response for the item
 *   lab.reopenItem(rawEvents);           // the save failed: resume the item that endItem() closed
 *   const payload = await lab.finish();  // features + raw events, sent to the sink
 *
 * Sinks: 'local' (nothing leaves the browser), 'post' (JSON to an approved URL),
 * 'jatos' (jatos.submitResultData when the page runs inside JATOS).
 */
(function (global) {
  'use strict';

  var VERSION = '0.3.1';
  var IDLE_GAP_MS = 500;        // pointer still this long counts toward idleMs
  var NO_INPUT_MS = 2000;       // no input of any kind this long counts toward noInputMs
  var TYPING_PAUSE_MS = 2000;   // a gap between keys this long is a pause, not a between-key time
  var FLIP_MIN_PX = 3;          // horizontal moves smaller than this never count as a direction change (as in trajectory.mjs)
  var INPUT_TYPES = ['move', 'down', 'click', 'key_down', 'wheel', 'scroll', 'input'];
  // Input events a person makes and the lab's own pages never create: one with isTrusted false was made by a script.
  // (Clicks are different: the pages click a few buttons themselves, always right after a real press or key.)
  var SCRIPTABLE = ['pointermove', 'pointerdown', 'keydown', 'keyup', 'input', 'wheel'];
  var PRESS_WINDOW_MS = 1000;

  function now() { return performance.now(); }
  function round(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }

  function keyCategory(e) {
    var k = e.key || '';
    if (k === 'Backspace') return 'backspace';
    if (k === 'Delete') return 'delete';
    if (k === 'Enter') return 'enter';
    if (k === 'Tab') return 'tab';
    if (k === ' ') return 'space';
    if (k.indexOf('Arrow') === 0) return 'arrow';
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].indexOf(k) >= 0) return 'modifier';
    if (k.length === 1) return 'char';
    return 'other';
  }

  function targetId(el) {
    if (!el || !el.closest) return null;
    var t = el.closest('[data-trace]');
    if (t) return t.getAttribute('data-trace');
    if (el.id) return '#' + el.id;
    return el.tagName ? el.tagName.toLowerCase() : null;
  }

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Coefficient of variation (sd / mean) of between-key times; people type unevenly (about 0.4 and up), a script
  // that types at a fixed rate does not. Null below 5 intervals.
  function cv(a) {
    if (a.length < 5) return null;
    var m = a.reduce(function (s, x) { return s + x; }, 0) / a.length;
    if (!m) return null;
    var v = a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / a.length;
    return round(Math.sqrt(v) / m, 3);
  }

  function isField(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !!el.isContentEditable;
  }

  // Seconds of a clip actually played: the union of its played ranges, so skipping ahead never counts as heard.
  function playedSeconds(m) {
    var r = m && m.played, s = 0;
    if (!r || !r.length) return 0;
    for (var i = 0; i < r.length; i++) s += r.end(i) - r.start(i);
    return s;
  }

  function finiteOrNull(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  function participantFromUrl() {
    var q = new URLSearchParams(global.location.search);
    return q.get('pid') || q.get('PROLIFIC_PID') || q.get('participant') || null;
  }

  function randomId() {
    var a = new Uint8Array(8);
    (global.crypto || global.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function deviceContext() {
    var mm = global.matchMedia ? function (q) { return global.matchMedia(q).matches; } : function () { return null; };
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezoneOffsetMin: new Date().getTimezoneOffset(),
      screen: { w: screen.width, h: screen.height },
      viewport: { w: global.innerWidth, h: global.innerHeight },
      devicePixelRatio: global.devicePixelRatio || 1,
      pointerFine: mm('(pointer: fine)'),
      hover: mm('(hover: hover)'),
      maxTouchPoints: navigator.maxTouchPoints || 0
    };
  }

  function TraceLab(opts) {
    this.opts = Object.assign({ sink: { type: 'local' }, mouseSampleMs: 16, captureRaw: true }, opts || {});
    if (!this.opts.study) throw new Error('TraceLab: opts.study is required');
    this.participant = this.opts.participant || participantFromUrl() || randomId();
    this.session = randomId();
    this.events = [];
    this.items = [];
    this.current = null;
    this.started = false;
    this._handlers = [];
    this._lastMove = 0;
    this._hover = {};
    this._sampled = {};   // last raw-log time per throttled stream (scroll per scroller, wheel)
    this._scrollPos = {};
    this._keysDown = {};  // key code -> press time, held only in memory to pair a press with its release
    this._focus = null;
  }

  // Throttled streams (scrolling, wheel) are summed on every event but written to the raw log at most once per
  // sampling interval, so a fast scroll cannot flood the log.
  TraceLab.prototype._due = function (key) {
    var t = now();
    if (t - (this._sampled[key] || -Infinity) < this.opts.mouseSampleMs) return false;
    this._sampled[key] = t;
    return true;
  };

  TraceLab.prototype._log = function (type, data) {
    var ev = Object.assign({ t: round(now() - this.t0, 1), type: type, item: this.current ? this.current.id : null }, data || {});
    if (this.opts.captureRaw) this.events.push(ev);
    if (this.current) this._accumulate(ev);
    return ev;
  };

  TraceLab.prototype._on = function (target, name, fn, opts) {
    var self = this;
    var h = function (e) { try { self._trust(name, e); fn.call(self, e); } catch (err) { /* never break the study page */ } };
    target.addEventListener(name, h, opts || { passive: true, capture: true });
    this._handlers.push([target, name, h, opts || { passive: true, capture: true }]);
  };

  // Scripted input: input events with isTrusted false, and clicks made by a script with no real press or key in the
  // second before them. Real presses (trusted pointerdown and keydown) are remembered for that window.
  TraceLab.prototype._trust = function (name, e) {
    if (!e || e.isTrusted !== false) { if (name === 'pointerdown' || name === 'keydown') this._lastPress = now(); return; }
    var c = this.current;
    if (SCRIPTABLE.indexOf(name) >= 0) { if (c) c.untrustedInputs++; this._log('scripted', { event: name }); }
    else if (name === 'click' && now() - (this._lastPress == null ? -Infinity : this._lastPress) > PRESS_WINDOW_MS) { if (c) c.unpressedClicks++; this._log('scripted', { event: name }); }
  };

  TraceLab.prototype.start = function () {
    if (this.started) return this;
    this.started = true;
    this.t0 = now();
    this.startedAt = new Date().toISOString();
    this.device = deviceContext();
    var d = global.document;

    this._on(d, 'pointermove', function (e) {
      var t = now();
      if (t - this._lastMove < this.opts.mouseSampleMs) return;
      this._lastMove = t;
      this._log('move', { x: e.clientX, y: e.clientY, pt: e.pointerType });
    });
    this._on(d, 'pointerdown', function (e) {
      this._log('down', { x: e.clientX, y: e.clientY, pt: e.pointerType, target: targetId(e.target) });
      if (this.current && e.pointerType) this.current.pointerTypes[e.pointerType] = (this.current.pointerTypes[e.pointerType] || 0) + 1;
    });
    this._on(d, 'click', function (e) { this._log('click', { x: e.clientX, y: e.clientY, target: targetId(e.target) }); });
    this._on(d, 'pointerover', function (e) {
      var id = targetId(e.target);
      if (!e.target.closest || !e.target.closest('[data-trace]')) return;
      if (this._hover[id]) return;
      this._hover[id] = now();
      this._log('hover_in', { target: id });
    });
    this._on(d, 'pointerout', function (e) {
      if (!e.target.closest) return;
      var el = e.target.closest('[data-trace]');
      if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
      var id = el.getAttribute('data-trace');
      var start = this._hover[id];
      if (start == null) return;
      delete this._hover[id];
      this._log('hover_out', { target: id, dwell: round(now() - start, 1) });
    });
    // Scroll events do not bubble, but a capturing listener on the document sees the page's and every panel's.
    this._on(d, 'scroll', function (e) {
      var el = e.target, page = !el || el === d || el === d.documentElement || el === d.body;
      var key = page ? 'page' : (targetId(el) || 'element'), y = Math.round(page ? (global.scrollY || 0) : (el.scrollTop || 0));
      // A panel's position before its first scroll event is not known; panels start at the top, so take 0 (the page's
      // starting position is read when the item begins).
      var prev = this._scrollPos[key];
      if (prev == null && !page) prev = 0;
      this._scrollPos[key] = y;
      if (this.current && prev != null) {
        var c = this.current, dy = Math.abs(y - prev);
        c.scrollDist += dy;
        if (!page) c.scrollers[key] = (c.scrollers[key] || 0) + dy;
      }
      if (this._due('scroll:' + key)) this._log('scroll', { target: key, y: y });
    });
    this._on(d, 'wheel', function (e) {
      if (this.current) this.current.wheel += Math.abs(e.deltaY || 0);
      this._wheelPending = (this._wheelPending || 0) + (e.deltaY || 0);
      if (this._due('wheel')) { this._log('wheel', { dy: Math.round(this._wheelPending) }); this._wheelPending = 0; }
    });
    this._on(d, 'keydown', function (e) {
      // A press is paired with its release by code, or by key when there is no code (some virtual keyboards); the
      // pair lives only in memory and is never logged.
      var k = keyCategory(e), t = now(), id = e.code || e.key;
      if (!e.repeat && id) this._keysDown[id] = t;
      this._log('key_down', { k: k, target: targetId(e.target), repeat: !!e.repeat });
      var c = this.current;
      if (c && !e.repeat && (k === 'char' || k === 'space' || k === 'backspace' || k === 'delete')) {
        if (c.lastKeyAt != null) { var gap = t - c.lastKeyAt; if (gap >= TYPING_PAUSE_MS) c.typingPauses++; else c.keyIntervals.push(gap); }
        c.lastKeyAt = t;
      }
    });
    this._on(d, 'keyup', function (e) {
      var id = e.code || e.key, down = id ? this._keysDown[id] : null, hold = down != null ? round(now() - down, 1) : null;
      if (id) delete this._keysDown[id];
      this._log('key_up', { k: keyCategory(e), hold: hold });
      if (this.current && hold != null && hold < 2000) this.current.keyHolds.push(hold);
    });
    // Time in each form field, and keyboard visits to [data-trace] targets (the keyboard user's hover).
    this._on(d, 'focusin', function (e) {
      var el = e.target, traced = el && el.closest && el.closest('[data-trace]');
      if (!isField(el) && !traced) return;
      this._closeFocus();   // a field removed from the page while focused never sends focusout
      this._focus = { id: targetId(el), t: now() };
      this._log('focus_in', { target: this._focus.id });
    });
    this._on(d, 'focusout', function () { this._closeFocus(); });
    this._on(d, 'input', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-no-capture]')) { this._log('input', { target: targetId(e.target), inputType: e.inputType || null, len: null }); return; }
      var v = e.target && typeof e.target.value === 'string' ? e.target.value.length : null;
      this._log('input', { target: targetId(e.target), inputType: e.inputType || null, len: v });
    });
    this._on(d, 'paste', function (e) {
      var len = e.clipboardData ? (e.clipboardData.getData('text') || '').length : null;
      this._log('paste', { target: targetId(e.target), len: len });
    });
    this._on(d, 'copy', function (e) { this._log('copy', { target: targetId(e.target) }); });
    this._on(d, 'cut', function (e) { this._log('cut', { target: targetId(e.target) }); });
    this._on(d, 'visibilitychange', function () { this._log(d.hidden ? 'hidden' : 'visible'); });
    // blur and focus on form fields reach a capturing window listener too; only the window's own count.
    this._on(global, 'blur', function (e) { if (e.target === global) this._log('window_blur'); });
    this._on(global, 'focus', function (e) { if (e.target === global) this._log('window_focus'); });
    this._on(global, 'resize', function () { this._log('resize', { w: global.innerWidth, h: global.innerHeight }); });
    // Media events do not bubble; the capturing listener sees them. A play before the clip's length is known
    // (metadata still loading) is kept, with dur null until it is.
    ['play', 'pause', 'seeked', 'ended'].forEach(function (name) {
      this._on(d, name, function (e) {
        var m = e.target;
        if (!m || !('currentTime' in m)) return;
        var id = targetId(m), dur = finiteOrNull(m.duration);
        if (this.current && id) this.current.mediaEls[id] = m;
        this._log('media_' + name, { target: id, at: round(m.currentTime || 0, 2), dur: dur == null ? null : round(dur, 2), heard: round(playedSeconds(m), 2) });
      });
    }, this);
    this._log('start', { device: this.device });
    return this;
  };

  TraceLab.prototype.beginItem = function (id, rootEl) {
    if (!this.started) throw new Error('TraceLab: call start() after consent, before beginItem()');
    if (this.current) this.endItem(null);
    this._closed = null;   // a new item: the previous one can no longer be reopened
    this._hover = {};
    this._scrollPos = { page: Math.round(global.scrollY || 0) };
    var t = now() - this.t0, d = global.document, active = d && d.activeElement;
    this.current = {
      id: id, root: rootEl || null, t: t, firstInteraction: null, lastInput: t, noInputMs: 0, longestNoInput: 0,
      lastMove: null, path: 0, moves: 0, speeds: [], xFlips: 0, lastDx: 0, idleGaps: 0, idleMs: 0,
      clicks: 0, clickTargets: {}, hovers: {}, pointerTypes: {}, scrollDist: 0, scrollers: {}, wheel: 0,
      keys: 0, chars: 0, deletions: 0, pastes: 0, pasteChars: 0, copies: 0,
      keyIntervals: [], keyHolds: [], typingPauses: 0, lastKeyAt: null, fields: {}, untrustedInputs: 0, unpressedClicks: 0,
      answers: [], hiddenMs: 0, hiddenAt: d && d.hidden ? t : null, blurs: 0, media: {}, mediaEls: {}
    };
    // A field that already has focus (autofocus) starts its clock with the item.
    this._focus = active && isField(active) ? { id: targetId(active), t: now() } : null;
    this._log('item_begin', { id: id });
    return this;
  };

  TraceLab.prototype._closeFocus = function () {
    var f = this._focus, c = this.current;
    this._focus = null;
    if (!f) return;
    var ms = now() - f.t;
    this._log('focus_out', { target: f.id, ms: round(ms, 1) });
    if (c && f.id) {
      var x = c.fields[f.id] || (c.fields[f.id] = { visits: 0, ms: 0 });
      x.visits++; x.ms = round(x.ms + ms, 1);
    }
  };

  TraceLab.prototype._accumulate = function (ev) {
    var c = this.current;
    if (INPUT_TYPES.indexOf(ev.type) >= 0) {
      if (c.firstInteraction == null && ev.t > c.t) c.firstInteraction = ev.t - c.t;
      this._noInput(ev.t);
    }
    switch (ev.type) {
      case 'move':
        if (c.lastMove) {
          var dx = ev.x - c.lastMove.x, dy = ev.y - c.lastMove.y, dt = ev.t - c.lastMove.t;
          var dist = Math.sqrt(dx * dx + dy * dy);
          c.path += dist; c.moves++;
          if (dt > 0) c.speeds.push(dist / dt);
          if (dt > IDLE_GAP_MS) { c.idleGaps++; c.idleMs += dt; }
          if (Math.abs(dx) >= FLIP_MIN_PX) { if (c.lastDx !== 0 && Math.sign(dx) !== Math.sign(c.lastDx)) c.xFlips++; c.lastDx = dx; }
        }
        c.lastMove = { x: ev.x, y: ev.y, t: ev.t };
        break;
      case 'click':
        c.clicks++;
        if (ev.target) c.clickTargets[ev.target] = (c.clickTargets[ev.target] || 0) + 1;
        break;
      case 'hover_out':
        var h = c.hovers[ev.target] || (c.hovers[ev.target] = { count: 0, dwellMs: 0 });
        h.count++; h.dwellMs = round(h.dwellMs + ev.dwell, 1);
        break;
      case 'key_down':
        c.keys++;
        if (ev.k === 'char' || ev.k === 'space') c.chars++;
        if (ev.k === 'backspace' || ev.k === 'delete') c.deletions++;
        break;
      case 'paste': c.pastes++; c.pasteChars += ev.len || 0; break;
      case 'copy': c.copies++; break;
      case 'hidden': c.hiddenAt = ev.t; break;
      case 'visible': if (c.hiddenAt != null) { c.hiddenMs += ev.t - c.hiddenAt; c.hiddenAt = null; } break;
      case 'window_blur': c.blurs++; break;
      default:
        if (ev.type.indexOf('media_') === 0 && ev.target) {
          var m = c.media[ev.target] || (c.media[ev.target] = { plays: 0, seeks: 0, ended: false, maxAt: 0, firstPlayMs: null, dur: null, heardSec: 0 });
          if (ev.type === 'media_play') { m.plays++; if (m.firstPlayMs == null) m.firstPlayMs = round(ev.t - c.t, 1); }
          if (ev.type === 'media_seeked') m.seeks++;
          if (ev.type === 'media_ended') m.ended = true;
          if (ev.dur != null) m.dur = ev.dur;
          m.maxAt = Math.max(m.maxAt, ev.at || 0);
          m.heardSec = Math.max(m.heardSec, ev.heard || 0);
        }
    }
  };

  // Time with no input of any kind: each gap of NO_INPUT_MS or more between inputs (from the item's start, and up to its end).
  TraceLab.prototype._noInput = function (t) {
    var c = this.current, gap = t - c.lastInput;
    if (gap >= NO_INPUT_MS) { c.noInputMs += gap; if (gap > c.longestNoInput) c.longestNoInput = gap; }
    c.lastInput = t;
  };

  TraceLab.prototype.recordAnswer = function (field, value) {
    if (!this.current) return;
    var ev = this._log('answer', { field: field, value: value });
    this.current.answers.push({ t: round(ev.t - this.current.t, 1), field: field, value: value });
  };

  TraceLab.prototype.endItem = function (response) {
    var c = this.current;
    if (!c) return null;
    var end = now() - this.t0;
    if (c.hiddenAt != null) { c.hiddenMs += end - c.hiddenAt; c.hiddenAt = null; }
    this._closeFocus();
    if (this._focus === null && global.document && isField(global.document.activeElement)) this._focus = { id: targetId(global.document.activeElement), t: now() };   // still in the field: the next item's clock starts now
    this._noInput(end);
    Object.keys(this._hover).forEach(function (id) {
      var h = c.hovers[id] || (c.hovers[id] = { count: 0, dwellMs: 0 });
      h.count++; h.dwellMs = round(h.dwellMs + (now() - this._hover[id]), 1);
    }, this);
    var speeds = c.speeds.slice().sort(function (a, b) { return a - b; });
    var fields = {};
    c.answers.forEach(function (a) { fields[a.field] = (fields[a.field] || 0) + 1; });
    var changes = Object.keys(fields).reduce(function (s, f) { return s + Math.max(0, fields[f] - 1); }, 0);
    Object.keys(c.media).forEach(function (k) {
      var m = c.media[k], el = c.mediaEls[k];
      if (el) { m.heardSec = Math.max(m.heardSec, playedSeconds(el)); if (m.dur == null) m.dur = finiteOrNull(el.duration); m.mutedAtEnd = !!(el.muted || el.volume === 0); }
      m.heardSec = round(m.heardSec, 2);
      m.shareHeard = m.dur ? round(Math.min(1, m.heardSec / m.dur), 3) : null;     // played, not skipped over
      m.furthestShare = m.dur ? round(Math.min(1, m.maxAt / m.dur), 3) : null;    // furthest point reached (0.1.0's shareHeard)
    });
    var pts = Object.keys(c.pointerTypes).sort(function (a, b) { return c.pointerTypes[b] - c.pointerTypes[a]; });
    var item = {
      id: c.id,
      startMs: round(c.t, 1),
      endMs: round(end, 1),
      response: response,
      answers: c.answers,
      features: {
        traceVersion: VERSION,
        durationMs: round(end - c.t, 1),
        firstInteractionMs: c.firstInteraction == null ? null : round(c.firstInteraction, 1),
        firstAnswerMs: c.answers.length ? c.answers[0].t : null,
        lastAnswerMs: c.answers.length ? c.answers[c.answers.length - 1].t : null,
        answerEvents: c.answers.length,
        answerChanges: changes,
        mousePathPx: Math.round(c.path),
        mouseSamples: c.moves,
        mouseMeanSpeed: speeds.length ? round(speeds.reduce(function (s, v) { return s + v; }, 0) / speeds.length, 3) : null,
        mouseMaxSpeed: speeds.length ? round(speeds[speeds.length - 1], 3) : null,
        mouseXFlips: c.xFlips,
        idleGaps: c.idleGaps,
        idleMs: round(c.idleMs, 1),
        noInputMs: round(c.noInputMs, 1),
        longestNoInputMs: round(c.longestNoInput, 1),
        clicks: c.clicks,
        clickTargets: c.clickTargets,
        hovers: c.hovers,
        pointerTypes: c.pointerTypes,
        pointerType: pts.length ? pts[0] : null,
        scrollPx: Math.round(c.scrollDist),
        scrollers: c.scrollers,
        wheelPx: Math.round(c.wheel),
        keystrokes: c.keys,
        charsTyped: c.chars,
        deletions: c.deletions,
        keyIntervalMedianMs: c.keyIntervals.length ? round(median(c.keyIntervals), 1) : null,
        keyHoldMedianMs: c.keyHolds.length ? round(median(c.keyHolds), 1) : null,
        typingPauses: c.typingPauses,
        keyIntervalCount: c.keyIntervals.length,
        keyIntervalCv: cv(c.keyIntervals),
        untrustedInputs: c.untrustedInputs,
        unpressedClicks: c.unpressedClicks,
        saveRetries: c.reopens || 0,
        fields: c.fields,
        pastes: c.pastes,
        pasteChars: c.pasteChars,
        copies: c.copies,
        hiddenMs: round(c.hiddenMs, 1),
        windowBlurs: c.blurs,
        media: c.media
      }
    };
    this._log('item_end', { id: c.id });
    this.items.push(item);
    this._closed = c;
    this.current = null;
    return item;
  };

  // Undo the last endItem() when its data could not be saved: the item goes on as if it had never ended, so a
  // retried save keeps everything recorded before the failure. rawEvents are the events taken out of lab.events
  // for the failed save; they go back in front of anything logged since.
  TraceLab.prototype.reopenItem = function (rawEvents) {
    var c = this._closed;
    if (!c || this.current) return false;
    this._closed = null;
    this.current = c;
    this.items.pop();
    if (rawEvents && rawEvents.length) {
      var since = this.events.splice(0);
      for (var i = rawEvents.length - 1; i >= 0; i--) if (rawEvents[i].type === 'item_end') { rawEvents = rawEvents.slice(0, i); break; }
      Array.prototype.push.apply(this.events, rawEvents.concat(since));
    }
    c.reopens = (c.reopens || 0) + 1;
    this._log('item_reopen', { id: c.id });
    return true;
  };

  TraceLab.prototype.stop = function () {
    this._handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2], h[3]); });
    this._handlers = [];
  };

  TraceLab.prototype.payload = function (extra) {
    return {
      schema: 'tracelab/' + VERSION,
      study: this.opts.study,
      studyVersion: this.opts.version || null,
      participant: this.participant,
      session: this.session,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      device: this.device,
      items: this.items,
      extra: extra || null,
      events: this.opts.captureRaw ? this.events : undefined
    };
  };

  TraceLab.prototype.finish = function (extra) {
    if (this.current) this.endItem(null);
    this._log('finish');
    this.stop();
    var p = this.payload(extra);
    var sink = this.opts.sink || { type: 'local' };
    if (sink.type === 'post' && sink.url) {
      return fetch(sink.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), keepalive: true
      }).then(function (r) { p._sent = r.ok; return p; }, function () { p._sent = false; return p; });
    }
    if (sink.type === 'jatos' && global.jatos && global.jatos.submitResultData) {
      return global.jatos.submitResultData(JSON.stringify(p)).then(function () { p._sent = true; return p; });
    }
    p._sent = false;
    return Promise.resolve(p);
  };

  TraceLab.download = function (payload, filename) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || (payload.study + '_' + payload.participant + '.json');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };

  TraceLab.create = function (opts) { return new TraceLab(opts); };
  TraceLab.VERSION = VERSION;
  global.TraceLab = TraceLab;
})(window);
