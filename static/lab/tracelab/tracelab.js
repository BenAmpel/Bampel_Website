/*!
 * TraceLab: passive behavioral trace capture for browser-based studies.
 * CCAIR Behavioral Lab, Georgia State University (bampel.com/lab).
 *
 * Captures, after consent only:
 *   - timing: item duration, first-interaction latency, idle gaps
 *   - pointer: sampled cursor path, clicks, hovers over [data-trace] targets
 *   - scrolling and wheel input
 *   - keyboard: key category and timing (never the key itself), text edits, paste/copy/cut
 *   - attention: tab hidden time, window focus loss, resizes
 *   - answers: every change to a response, not just the final value
 *   - media: play/pause/seek/ended and share of the clip heard for <audio>/<video>
 *   - device context: viewport, screen, pointer type, touch support, language, timezone
 *
 * Usage:
 *   const lab = TraceLab.create({ study: 'demo', version: '1', sink: { type: 'local' } });
 *   lab.start();                         // call only after consent
 *   lab.beginItem('q1', rootElement);    // mark an item (page/question)
 *   lab.recordAnswer('q1', value);       // call on every answer change
 *   lab.endItem({ choice: 'phishing' }); // final response for the item
 *   const payload = await lab.finish();  // features + raw events, sent to the sink
 *
 * Sinks: 'local' (nothing leaves the browser), 'post' (JSON to an approved URL),
 * 'jatos' (jatos.submitResultData when the page runs inside JATOS).
 */
(function (global) {
  'use strict';

  var VERSION = '0.1.0';
  var IDLE_GAP_MS = 500;

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
  }

  TraceLab.prototype._log = function (type, data) {
    var ev = Object.assign({ t: round(now() - this.t0, 1), type: type, item: this.current ? this.current.id : null }, data || {});
    if (this.opts.captureRaw) this.events.push(ev);
    if (this.current) this._accumulate(ev);
    return ev;
  };

  TraceLab.prototype._on = function (target, name, fn, opts) {
    var self = this;
    var h = function (e) { try { fn.call(self, e); } catch (err) { /* never break the study page */ } };
    target.addEventListener(name, h, opts || { passive: true, capture: true });
    this._handlers.push([target, name, h, opts || { passive: true, capture: true }]);
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
    this._on(d, 'pointerdown', function (e) { this._log('down', { x: e.clientX, y: e.clientY, pt: e.pointerType, target: targetId(e.target) }); });
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
    this._on(global, 'scroll', function () { this._log('scroll', { y: Math.round(global.scrollY) }); });
    this._on(d, 'wheel', function (e) { this._log('wheel', { dy: Math.round(e.deltaY) }); });
    this._on(d, 'keydown', function (e) { this._log('key_down', { k: keyCategory(e), target: targetId(e.target), repeat: !!e.repeat }); });
    this._on(d, 'keyup', function (e) { this._log('key_up', { k: keyCategory(e) }); });
    this._on(d, 'input', function (e) {
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
    this._on(global, 'blur', function () { this._log('window_blur'); });
    this._on(global, 'focus', function () { this._log('window_focus'); });
    this._on(global, 'resize', function () { this._log('resize', { w: global.innerWidth, h: global.innerHeight }); });
    ['play', 'pause', 'seeked', 'ended'].forEach(function (name) {
      this._on(d, name, function (e) {
        var m = e.target;
        if (!m || !m.duration) return;
        this._log('media_' + name, { target: targetId(m), at: round(m.currentTime, 2), dur: round(m.duration, 2) });
      });
    }, this);
    this._log('start', { device: this.device });
    return this;
  };

  TraceLab.prototype.beginItem = function (id, rootEl) {
    if (!this.started) throw new Error('TraceLab: call start() after consent, before beginItem()');
    if (this.current) this.endItem(null);
    this._hover = {};
    this.current = {
      id: id, root: rootEl || null, t: now() - this.t0, firstInteraction: null,
      lastMove: null, path: 0, moves: 0, speeds: [], xFlips: 0, lastDx: 0, idleGaps: 0, idleMs: 0,
      clicks: 0, clickTargets: {}, hovers: {}, scrollDist: 0, lastScroll: null, wheel: 0,
      keys: 0, chars: 0, deletions: 0, pastes: 0, pasteChars: 0, copies: 0,
      answers: [], hiddenMs: 0, hiddenAt: null, blurs: 0, media: {}
    };
    this._log('item_begin', { id: id });
    return this;
  };

  TraceLab.prototype._accumulate = function (ev) {
    var c = this.current;
    var interactive = ['move', 'down', 'click', 'key_down', 'wheel', 'scroll', 'input'];
    if (c.firstInteraction == null && interactive.indexOf(ev.type) >= 0 && ev.t > c.t) c.firstInteraction = ev.t - c.t;
    switch (ev.type) {
      case 'move':
        if (c.lastMove) {
          var dx = ev.x - c.lastMove.x, dy = ev.y - c.lastMove.y, dt = ev.t - c.lastMove.t;
          var dist = Math.sqrt(dx * dx + dy * dy);
          c.path += dist; c.moves++;
          if (dt > 0) c.speeds.push(dist / dt);
          if (dt > IDLE_GAP_MS) { c.idleGaps++; c.idleMs += dt; }
          if (dx !== 0) { if (c.lastDx !== 0 && Math.sign(dx) !== Math.sign(c.lastDx)) c.xFlips++; c.lastDx = dx; }
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
      case 'scroll':
        if (c.lastScroll != null) c.scrollDist += Math.abs(ev.y - c.lastScroll);
        c.lastScroll = ev.y;
        break;
      case 'wheel': c.wheel += Math.abs(ev.dy); break;
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
          var m = c.media[ev.target] || (c.media[ev.target] = { plays: 0, seeks: 0, ended: false, maxAt: 0, firstPlayMs: null, dur: ev.dur });
          if (ev.type === 'media_play') { m.plays++; if (m.firstPlayMs == null) m.firstPlayMs = round(ev.t - c.t, 1); }
          if (ev.type === 'media_seeked') m.seeks++;
          if (ev.type === 'media_ended') m.ended = true;
          m.maxAt = Math.max(m.maxAt, ev.at || 0);
        }
    }
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
    Object.keys(this._hover).forEach(function (id) {
      var h = c.hovers[id] || (c.hovers[id] = { count: 0, dwellMs: 0 });
      h.count++; h.dwellMs = round(h.dwellMs + (now() - this._hover[id]), 1);
    }, this);
    var speeds = c.speeds.slice().sort(function (a, b) { return a - b; });
    var fields = {};
    c.answers.forEach(function (a) { fields[a.field] = (fields[a.field] || 0) + 1; });
    var changes = Object.keys(fields).reduce(function (s, f) { return s + Math.max(0, fields[f] - 1); }, 0);
    Object.keys(c.media).forEach(function (k) { var m = c.media[k]; m.shareHeard = m.dur ? round(Math.min(1, m.maxAt / m.dur), 3) : null; });
    var item = {
      id: c.id,
      startMs: round(c.t, 1),
      endMs: round(end, 1),
      response: response,
      answers: c.answers,
      features: {
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
        clicks: c.clicks,
        clickTargets: c.clickTargets,
        hovers: c.hovers,
        scrollPx: Math.round(c.scrollDist),
        wheelPx: Math.round(c.wheel),
        keystrokes: c.keys,
        charsTyped: c.chars,
        deletions: c.deletions,
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
    this.current = null;
    return item;
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
