/* CCAIR Behavioral Lab: participant app, shared by every study.
   Handles sign-in (GSU email, or pilot code), consent, session progress, start- and end-of-session
   surveys, behavior traces (TraceLab), retries, and accessibility. Each study type supplies only its
   item screen: static/lab/engine/types/<type>.js calls LabEngine.registerType(id, { instructions?, runTrial }).
   The study comes from <html data-study="..."> or the URL /lab/s/<study>.
   UI choices follow web-survey and process-tracing research; see static/lab/README.md ("Participant UI"). */
(function () {
  'use strict';

  var studyId = document.documentElement.getAttribute('data-study') || (location.pathname.match(/^\/lab\/s\/([a-z][a-z0-9-]{2,30})\/?$/) || [])[1];
  var API = '/api/lab/' + studyId + '/';
  var stage = document.getElementById('stage'), progress = document.getElementById('progress');
  var S = { token: null, plan: null, lab: null, content: null, type: null, deviceSent: {} };
  var types = {};
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tokenKey = 'lab_token_' + studyId, panelKey = 'lab_panel_' + studyId;

  // ---------- utilities ----------
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(ms) { return new Date(ms).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function post(route, body) {
    return fetch(API + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }, function () { return { error: 'server_error', _status: r.status }; }); },
            function () { return { error: 'network' }; });
  }
  // Retries once after a second on a dropped connection or a server hiccup; the server treats repeats
  // as no-ops (a re-sent answer is acknowledged, never overwritten).
  function api(route, body) { return apiRaw(route, body).then(function (j) { return settle(route, j); }); }
  function apiRaw(route, body) {
    return post(route, body)
      .then(function (j) { return j.error === 'network' || j.error === 'server_error' || j.error === 'busy' ? new Promise(function (res) { setTimeout(res, 1000); }).then(function () { return post(route, body); }) : j; });
  }
  // What api() does with an answer. Split out so a request can be sent early and its answer handled later (see "boot").
  function settle(route, j) {
    if (j.error === 'expired' && route !== 'login') { store(tokenKey, null); S.token = null; showLogin(ERR.expired); return new Promise(function () {}); }
    return j;
  }
  // Every screen change moves keyboard and screen-reader focus to the new heading (WCAG 2.4.3).
  function show(html) {
    stage.innerHTML = html;
    window.scrollTo(0, 0);
    updateContact();
    var h = stage.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  // "Questions about this study? Contact the lab": a mailto link under the card. It carries the study name and, once signed in,
  // the study ID taken from the sign-in token (never the email address). Nothing is sent from this page.
  function updateContact() {
    var LC = window.LabContact, el = document.getElementById('contact-note');
    if (!LC) return;
    if (!el) { if (!stage.parentNode || !document.createElement) return; el = document.createElement('p'); el.id = 'contact-note'; el.className = 'muted contact-note'; stage.parentNode.appendChild(el); }
    var id = S.token && /^[A-Za-z0-9-]+\./.test(S.token) ? S.token.split('.')[0] : '';
    el.innerHTML = 'Questions about this study? <a href="' + esc(LC.participant(S.content && S.content.name, id)) + '">Contact the lab</a>';
  }
  function errorBox(msg, id) { return '<p class="error" role="alert"' + (id ? ' id="' + id + '"' : '') + '>' + esc(msg) + '</p>'; }
  var ERR = {
    invalid_code: 'That access code was not recognized. Check it and try again.',
    not_enrolled: 'That email can\'t be used for this study. Contact the research team if you think this is a mistake.',
    expired: 'Your sign-in expired. Sign in again to pick up where you left off.',
    network: 'Could not reach the study server. Check your connection and try again.',
    server_error: 'Something went wrong on our end. Please try again in a minute.',
    busy: 'The server is busy. Please try again in a moment.',
    wrong_session: 'This session is no longer active. Reload the page to continue.'
  };
  // Text for keys a study's saved text may not have yet (added after the study was made). Each is also an
  // ENGINE_TEXT field in netlify/lib/lab/content.mjs, so researchers edit it like any other screen text.
  var TEXT_DEFAULTS = {
    start_body_panel: 'This session takes about {minutes} minutes. Please complete it in one sitting, somewhere you will not be interrupted.\n\nIf you get disconnected, open the study link in {panel} again and you will pick up where you left off.',
    finished_body_panel: 'You have completed all sessions of the study. Click the button below to return to {panel}, so your participation is recorded. If {panel} asks for a code, copy the one shown here.',
    finished_body_panel_code: 'You have completed all sessions of the study. Copy the code below and enter it in {panel}, so your participation is recorded.',
    finished_body_panel_wait: 'You have completed all sessions of the study. How to record your participation in {panel} appears below in a moment.',
    finished_body_panel_none: 'You have completed all sessions of the study. Thank you. There is no code to enter: the research team records your participation.',
    consent_draft_banner: 'Draft consent text, pending IRB approval. Do not enroll participants with this version.'
  };
  function T(key, vars) {
    var t = (S.content && S.content.text && S.content.text[key]) || TEXT_DEFAULTS[key] || '';
    return t.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : k === 'minutes' ? S.content.minutesPerSession : m; });
  }
  function linkify(h) { return h.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>'); }
  function Th(key, vars) { return esc(T(key, vars)); }
  function Tp(key, vars, cls) { return T(key, vars).split(/\n\s*\n/).map(function (x) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + linkify(esc(x.trim())) + '</p>'; }).join(''); }
  var uid = 0; function nextId(p) { return (p || 'id') + (++uid); }

  // ---------- piped text and display logic ----------
  // {{q:variable}} shows an earlier answer (the option's label, or what was typed) and {{ed:name}} shows
  // embedded data. Text is filled in with textContent, never as HTML, so an answer cannot inject markup.
  // Display logic comes from /lab/engine/logic.js (the server applies the same rules when it saves).
  var LL = null;
  function lib() { return LL || window.LabLogic || null; }
  var pipeEnv = { items: {}, lookup: null, ed: {} };
  function setPipeEnv(items, lookup, ed) {
    var byId = {};
    (items || []).forEach(function (i) { byId[i.id] = i; });
    pipeEnv = { items: byId, lookup: lookup || null, ed: ed || (S.plan && S.plan.embedded) || {} };
  }
  function answerText(id) {
    var it = pipeEnv.items[id], v = pipeEnv.lookup ? pipeEnv.lookup(id) : undefined;
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    function label(x) { var o = it && it.options ? it.options.filter(function (p) { return p.value === x; })[0] : null; return o ? o.label : x; }
    if (!it) return String(v);
    if (it.type === 'choice' || it.type === 'select') return label(v);
    if (it.type === 'multi') return (Array.isArray(v) ? v : [v]).map(label).join(', ');
    if (it.type === 'scale') return it.labels && it.labels[Number(v) - 1] ? it.labels[Number(v) - 1] : String(v);
    return String(v);
  }
  function fillPipes(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf('{{') < 0) return s;
    return s.replace(/\{\{(q|ed):([a-z][a-z0-9_]{0,40})\}\}/g, function (m, kind, name) { return kind === 'ed' ? String((pipeEnv.ed || {})[name] || '') : answerText(name); });
  }
  // Escaped text, with a data-tpl copy of the template when it has tokens so it can be refreshed live.
  function txt(s) {
    s = String(s == null ? '' : s);
    return s.indexOf('{{') < 0 ? esc(s) : '<span data-tpl="' + esc(s) + '">' + esc(fillPipes(s)) + '</span>';
  }
  function tplAttr(s) { return String(s).indexOf('{{') < 0 ? '' : ' data-tpl="' + esc(s) + '"'; }

  // ---------- question components ----------
  // Single choice as large tap targets in a fieldset (WCAG 1.3.1; Antoun et al. 2018). Every input also gets an id and
  // its label a matching for="", so the visible text is its accessible name in every browser and checker (WCAG 4.1.2).
  function choiceGroup(name, legend, opts, traceName) {
    return '<fieldset class="q-group" data-name="' + name + '"><legend class="q">' + legend + '</legend><div class="options">' + opts.map(function (o) {
      var id = nextId('opt');
      return '<label class="option" for="' + id + '" data-trace="' + (traceName || name) + ':' + esc(o[0]) + '"><input type="radio" name="' + name + '" value="' + esc(o[0]) + '" id="' + id + '"><span>' + o[1] + '</span></label>';
    }).join('') + '</div></fieldset>';
  }
  // Rating scale with every point labeled; one row on wide screens, stacked on phones (Krosnick &
  // Presser 2010; Tourangeau et al. 2007; Antoun et al. 2018).
  function scaleGroup(it) {
    var labels = it.labels && it.labels.length === it.n ? it.labels : null, cells = '';
    var first = typeof it.start === 'number' && isFinite(it.start) ? Math.floor(it.start) : 1;   // numbers shown and stored: first .. first + n - 1
    for (var k = 1; k <= it.n; k++) {
      var i = first + k - 1, lab = labels ? labels[k - 1] : k === 1 ? it.lo : k === it.n ? it.hi : '', pid = nextId('opt');
      cells += '<label class="option scale-pt" for="' + pid + '" data-trace="' + it.id + ':' + i + '"><input type="radio" name="' + it.id + '" value="' + i + '" id="' + pid + '"><span class="pt-num">' + i + '</span>' + (lab ? '<span class="pt-lab">' + txt(lab) + '</span>' : '') + '</label>';
    }
    return '<fieldset class="q-group" data-name="' + it.id + '"><legend class="q">' + txt(it.text) + '</legend><div class="likert' + (labels ? ' labeled' : '') + '" style="--n:' + it.n + '">' + cells + '</div></fieldset>';
  }
  // Confidence line: click anywhere, no starting handle (no default to anchor on: Liu & Conrad 2019;
  // Funke 2016); keyboard arrows, Page Up/Down, Home/End; no dragging required (WCAG 2.5.7).
  function vas(name, legend, ariaText, ariaTpl) {
    return '<fieldset class="q-group" data-name="' + name + '"><legend class="q">' + legend + '</legend>' +
      '<div class="vas" data-name="' + name + '" data-trace="' + name + '" role="slider" tabindex="0"' + (ariaTpl ? ' data-aria-tpl="' + esc(ariaTpl) + '"' : '') + ' aria-label="' + (ariaText != null ? ariaText : legend) + '" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Not set">' +
      '<div class="vas-track"><div class="vas-fill"></div><div class="vas-thumb" hidden></div></div>' +
      '<div class="vas-ends"><span>' + Th('conf_low') + '</span><output class="vas-val" aria-hidden="true">–</output><span>' + Th('conf_high') + '</span></div></div>' +
      '<p class="muted help">' + Th('conf_help') + '</p></fieldset>';
  }
  // Also the slider question type: data-min, data-max, and data-step (default 0, 100, 1) set its range.
  function wireVas(el, onAnswer) {
    var track = el.querySelector('.vas-track'), thumb = el.querySelector('.vas-thumb'), fill = el.querySelector('.vas-fill'), out = el.querySelector('.vas-val');
    var lo = Number(el.getAttribute('data-min') || 0), hi = Number(el.getAttribute('data-max') || 100), st = Number(el.getAttribute('data-step') || 1);
    var val = null, dragging = false;
    function snap(v) { return +(lo + Math.round((Math.max(lo, Math.min(hi, v)) - lo) / st) * st).toFixed(6); }
    function set(v, commit) {
      v = snap(v);
      var changed = v !== val, pct = (v - lo) / (hi - lo) * 100; val = v;
      thumb.hidden = false; thumb.style.left = pct + '%'; fill.style.width = pct + '%'; out.textContent = v;
      el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', String(v)); el.classList.add('set');
      if (commit && changed) onAnswer(el.getAttribute('data-name'), v);
    }
    function fromEvent(e) { var r = track.getBoundingClientRect(); return lo + (e.clientX - r.left) / r.width * (hi - lo); }
    el.addEventListener('pointerdown', function (e) {
      if (el.getAttribute('aria-disabled') === 'true' || (e.button && e.button !== 0)) return;
      dragging = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} set(fromEvent(e), false); el.focus({ preventScroll: true }); e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) { if (dragging) set(fromEvent(e), false); });
    function end() { if (!dragging) return; dragging = false; if (val != null) onAnswer(el.getAttribute('data-name'), val); }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el._reset = function () {   // a question that becomes hidden loses its answer
      val = null; thumb.hidden = true; thumb.style.left = ''; fill.style.width = ''; out.textContent = '–';
      el.removeAttribute('aria-valuenow'); el.setAttribute('aria-valuetext', 'Not set'); el.classList.remove('set');
    };
    el.addEventListener('keydown', function (e) {
      if (el.getAttribute('aria-disabled') === 'true') return;
      var step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (step == null && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      var base = val == null ? (lo + hi) / 2 : val;   // keyboard users start from the middle
      set(e.key === 'Home' ? lo : e.key === 'End' ? hi : base + (val == null ? 0 : step * st), true);
    });
  }
  // Any question from a study's content (surveys, or a type's per-item questions). Radio buttons, not
  // dropdowns, for short lists (Couper et al. 2004).
  function infoHtml(it) {
    return '<div class="q-group q-info" data-name="' + esc(it.id) + '">' + String(it.text).split(/\n\s*\n/).map(function (para) {
      return '<p>' + para.split('\n').map(txt).join('<br>') + '</p>';
    }).join('') + '</div>';
  }
  // Slider: the confidence line's no-handle design over any range (Liu & Conrad 2019: no default to anchor on).
  function sliderHtml(it) {
    var lo = it.min, hi = it.max;
    return '<fieldset class="q-group" data-name="' + it.id + '"><legend class="q">' + txt(it.text) + '</legend>' +
      '<div class="vas" data-name="' + it.id + '" data-trace="' + it.id + '" data-min="' + lo + '" data-max="' + hi + '" data-step="' + it.step + '" role="slider" tabindex="0"' + tplAttr(it.text).replace('data-tpl', 'data-aria-tpl') + ' aria-label="' + esc(fillPipes(it.text)) + '" aria-valuemin="' + lo + '" aria-valuemax="' + hi + '" aria-valuetext="Not set">' +
      '<div class="vas-track"><div class="vas-fill"></div><div class="vas-thumb" hidden></div></div>' +
      '<div class="vas-ends"><span>' + esc(it.lo ? lo + ' ' + it.lo : lo) + '</span><output class="vas-val" aria-hidden="true">–</output><span>' + esc(it.hi ? hi + ' ' + it.hi : hi) + '</span></div></div>' +
      '<p class="muted help">' + Th('conf_help') + '</p></fieldset>';
  }
  // Ranking: Move up / Move down buttons (keyboard and screen readers; no dragging needed, WCAG 2.5.7). The order shown
  // first is not an answer: the participant moves an option or confirms the order.
  function rankHtml(it) {
    return '<fieldset class="q-group rank" data-name="' + it.id + '"><legend class="q">' + txt(it.text) + '</legend><ol class="rank-list">' + it.options.map(function (o, i) {
      return '<li data-value="' + esc(o.value) + '"><span class="rank-label">' + txt(o.label) + '</span><span class="rank-btns"><button type="button" class="secondary small" data-rank="-1" aria-label="Move ' + esc(fillPipes(o.label)) + ' up">Up</button>' +
        '<button type="button" class="secondary small" data-rank="1" aria-label="Move ' + esc(fillPipes(o.label)) + ' down">Down</button></span></li>';
    }).join('') + '</ol><div class="row"><button type="button" class="secondary small" data-rankok="1">This order is right</button></div><p class="sr" aria-live="polite" data-rankmsg="1"></p></fieldset>';
  }
  // Matrix: one statement per row, each its own variable, answered with the same options (stacked on phones).
  function matrixHtml(it) {
    return '<fieldset class="q-group matrix" data-name="' + it.id + '"><legend class="q">' + txt(it.text) + '</legend>' + it.rows.map(function (r) {
      return '<fieldset class="q-group mx-row" data-name="' + esc(r.id) + '"><legend>' + txt(r.text) + '</legend><div class="likert labeled" style="--n:' + it.options.length + '">' + it.options.map(function (o) {
        var mid = nextId('opt');
        return '<label class="option scale-pt" for="' + mid + '" data-trace="' + esc(r.id) + ':' + esc(o.value) + '"><input type="radio" name="' + esc(r.id) + '" value="' + esc(o.value) + '" id="' + mid + '"><span class="pt-lab">' + txt(o.label) + '</span></label>';
      }).join('') + '</div></fieldset>';
    }).join('') + '</fieldset>';
  }
  function questionHtml(it) {
    if (it.type === 'info') return infoHtml(it);
    if (it.type === 'slider') return sliderHtml(it);
    if (it.type === 'rank') return rankHtml(it);
    if (it.type === 'matrix') return matrixHtml(it);
    if (it.type === 'scale') return scaleGroup(it);
    if (it.type === 'confidence') return vas(it.id, txt(it.text), esc(fillPipes(it.text)), tplAttr(it.text) ? it.text : null);
    if (it.type === 'choice' || (it.type === 'select' && it.options.length <= 10)) return choiceGroup(it.id, txt(it.text), it.options.map(function (o) { return [o.value, txt(o.label)]; }));
    if (it.type === 'multi') {
      return '<fieldset class="q-group" data-name="' + it.id + '"><legend class="q">' + txt(it.text) + '</legend><div class="checks">' + it.options.map(function (o) {
        var cid = nextId('opt');
        return '<label class="option" for="' + cid + '" data-trace="' + it.id + ':' + esc(o.value) + '"><input type="checkbox" name="' + it.id + '" value="' + esc(o.value) + '" id="' + cid + '"><span>' + txt(o.label) + '</span></label>';
      }).join('') + '</div></fieldset>';
    }
    if (it.type === 'number') {
      var nid = nextId('num'), range = it.min != null && it.max != null ? 'Enter a number from ' + it.min + ' to ' + it.max + '.' : it.min != null ? 'Enter a number, ' + it.min + ' or more.' : it.max != null ? 'Enter a number, ' + it.max + ' or less.' : '';
      return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + nid + '">' + txt(it.text) + '</label><input type="text" id="' + nid + '" class="num" name="' + it.id + '" inputmode="decimal" autocomplete="off" data-trace="num:' + it.id + '"' + (range ? ' aria-describedby="' + nid + 'h"' : '') + '>' +
        (range ? '<p class="muted help" id="' + nid + 'h">' + esc(range) + '</p>' : '') + '</div>';
    }
    if (it.type === 'select') {
      var sid = nextId('sel');
      return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + sid + '">' + txt(it.text) + '</label><select id="' + sid + '" name="' + it.id + '"><option value="">Select…</option>' +
        it.options.map(function (o) { return '<option value="' + esc(o.value) + '"' + tplAttr(o.label) + '>' + esc(fillPipes(o.label)) + '</option>'; }).join('') + '</select></div>';
    }
    var tid = nextId('txt');
    if (it.long === false) return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + tid + '">' + txt(it.text) + '</label><input type="text" id="' + tid + '" class="line" name="' + it.id + '" autocomplete="off" data-trace="text:' + it.id + '"></div>';
    return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + tid + '">' + txt(it.text) + '</label><textarea id="' + tid + '" name="' + it.id + '"' + (it.long ? ' rows="7"' : '') + ' data-trace="text:' + it.id + '"></textarea></div>';
  }
  // A list of questions. Consecutive questions that share a "group" ID get the group's heading once, above them
  // (an imported matrix is a group of one-row questions, never a grid). env (optional): { items, lookup, ed } for piped text.
  function questionsHtml(list, env) {
    env = env || {};
    setPipeEnv(env.items || list, env.lookup, env.ed);
    var out = '', cur = null;
    list.forEach(function (it) {
      var g = it.group || null;
      if (cur && g !== cur) { out += '</div>'; cur = null; }
      if (g && g !== cur) {
        var hid = nextId('gh');
        out += '<div class="q-groupwrap" role="group" data-group="' + esc(g) + '"' + (it.groupText ? ' aria-labelledby="' + hid + '"' : '') + '>' + (it.groupText ? '<p class="q-grouphead" id="' + hid + '">' + String(it.groupText).split('\n').map(txt).join('<br>') + '</p>' : '');
        cur = g;
      }
      out += questionHtml(it);
    });
    return out + (cur ? '</div>' : '');
  }
  function wire(root, onAnswer) {
    root.querySelectorAll('input[type=radio]').forEach(function (r) { r.addEventListener('change', function () { onAnswer(r.name, r.value); }); });
    root.querySelectorAll('input[type=checkbox]').forEach(function (c) {
      c.addEventListener('change', function () {
        var vals = Array.prototype.filter.call(root.querySelectorAll('input[type=checkbox][name="' + c.name + '"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
        onAnswer(c.name, vals);
      });
    });
    root.querySelectorAll('.vas').forEach(function (v) { wireVas(v, onAnswer); });
    root.querySelectorAll('.rank').forEach(function (g) {
      var name = g.getAttribute('data-name'), list = g.querySelector('.rank-list'), msg = g.querySelector('[data-rankmsg]');
      function order() { return Array.prototype.map.call(list.children, function (li) { return li.getAttribute('data-value'); }); }
      g.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
        if (b.hasAttribute('data-rankok')) { g.classList.add('set'); onAnswer(name, order()); msg.textContent = 'Order saved.'; return; }
        var li = b.closest('li'), d = Number(b.getAttribute('data-rank')), sib = d < 0 ? li.previousElementSibling : li.nextElementSibling;
        if (!sib) return;
        if (d < 0) list.insertBefore(li, sib); else list.insertBefore(sib, li);
        b.focus();   // focus stays on the button that was pressed, which moved with its option
        msg.textContent = li.querySelector('.rank-label').textContent + ' is now ' + (Array.prototype.indexOf.call(list.children, li) + 1) + ' of ' + list.children.length + '.';
        g.classList.add('set'); onAnswer(name, order());
      });
    });
    root.querySelectorAll('select').forEach(function (s) { s.addEventListener('change', function () { onAnswer(s.name, s.value); }); });
    root.querySelectorAll('textarea').forEach(function (t) { t.addEventListener('input', function () { onAnswer(t.name, t.value); }); });
    root.querySelectorAll('input.num, input.line').forEach(function (t) { t.addEventListener('input', function () { onAnswer(t.name, t.value); }); });
  }
  // Marks the groups in `names` as needing attention. Every call re-syncs, so a group that is answered loses its marks.
  // opts (optional, used by questionSet): { message: text shown inside each flagged group, invalid: true to set
  // aria-invalid on its first control (a required or malformed answer, not a gentle reminder), focus: true to move
  // focus to the first flagged group }. The amber bar is only a second cue; the inline text and aria-invalid carry the
  // meaning (WCAG 1.4.1, 3.3.1). Without opts only the .missing class changes, which is what game.js and alert-triage.js use.
  function groupControl(g) { return g.querySelector('input:not([type=hidden]), select, textarea, button, [tabindex]:not([tabindex="-1"])'); }
  function ownError(g) { return Array.prototype.filter.call(g.children, function (c) { return c.classList.contains('q-error'); })[0]; }
  function dropToken(el, attr, tok) {
    var rest = (el.getAttribute(attr) || '').split(/\s+/).filter(function (t) { return t && t !== tok; }).join(' ');
    if (rest) el.setAttribute(attr, rest); else el.removeAttribute(attr);
  }
  function flag(root, names, scroll, opts) {
    root.querySelectorAll('.q-group').forEach(function (g) {
      var miss = names.indexOf(g.getAttribute('data-name')) >= 0, err = ownError(g), ctl = groupControl(g);
      g.classList.toggle('missing', miss);
      if (!miss) {
        if (err) { if (ctl) { dropToken(ctl, 'aria-describedby', err.id); ctl.removeAttribute('aria-invalid'); } err.remove(); }
        return;
      }
      if (!opts || !opts.message) return;
      if (!err) {
        err = document.createElement('p'); err.className = 'q-error';
        err.id = 'qe-' + String(g.getAttribute('data-name')).replace(/[^A-Za-z0-9_-]/g, '_');
        g.appendChild(err);
      }
      err.textContent = opts.message; err.className = 'q-error' + (opts.invalid ? '' : ' note');
      if (ctl) {
        if ((' ' + (ctl.getAttribute('aria-describedby') || '') + ' ').indexOf(' ' + err.id + ' ') < 0) ctl.setAttribute('aria-describedby', ((ctl.getAttribute('aria-describedby') || '') + ' ' + err.id).trim());
        if (opts.invalid) ctl.setAttribute('aria-invalid', 'true'); else ctl.removeAttribute('aria-invalid');
      }
    });
    var first = root.querySelector('.q-group.missing');
    if (first && opts && opts.focus) { var c = groupControl(first); if (c) c.focus({ preventScroll: true }); }
    if (first && scroll) first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }
  function blank(answers, ids) { return ids.filter(function (k) { var v = answers[k]; return v == null || String(v).trim() === '' || (Array.isArray(v) && !v.length); }); }
  // A question set with hard-required items and one gentle reminder for skipped optional ones
  // (de Leeuw et al. 2016; Sischka et al. 2022). Returns { answers, check() -> true when ready }.
  // ctx (optional): { answers: object to fill, prior: answers from earlier pages, items: every question of the
  // survey (for piped text), ed: embedded data }. Questions with a displayIf are shown and hidden live; a hidden
  // question is cleared, skipped by check(), and never part of answers.
  function clearInputs(el) {
    el.querySelectorAll('input[type=radio], input[type=checkbox]').forEach(function (i) { i.checked = false; });
    el.querySelectorAll('select').forEach(function (x) { x.value = ''; });
    el.querySelectorAll('textarea, input[type=text]').forEach(function (x) { x.value = ''; });
    el.querySelectorAll('.vas').forEach(function (v) { if (v._reset) v._reset(); });
  }
  function questionSet(root, items, msgEl, button, onAnswer, ctx) {
    ctx = ctx || {};
    var answers = ctx.answers || {}, prior = ctx.prior || {}, ed = ctx.ed || (S.plan && S.plan.embedded) || {}, prompted = false, hidden = {};
    function active() { return items.filter(function (i) { return i.type !== 'info' && !hidden[i.id]; }); }
    function ids(list) { return [].concat.apply([], list.map(function (i) { return i.type === 'matrix' ? (i.rows || []).map(function (r) { return r.id; }) : [i.id]; })); }   // a matrix row is its own variable
    setPipeEnv(ctx.items || items, function (id) { return answers[id] !== undefined ? answers[id] : prior[id]; }, ed);
    function applyLogic() {
      hidden = lib() ? lib().resolve(items, answers, { ed: ed }, prior).hidden : {};
      items.forEach(function (it) {
        var el = root.querySelector('.q-group[data-name="' + it.id + '"]');
        if (!el) return;
        var h = !!hidden[it.id];
        el.hidden = h;
        if (h) {
          el.classList.remove('missing'); if (answers[it.id] !== undefined) { delete answers[it.id]; clearInputs(el); }
          if (it.type === 'matrix') (it.rows || []).forEach(function (r) { if (answers[r.id] !== undefined) { delete answers[r.id]; clearInputs(el); } });
        }
      });
      root.querySelectorAll('.q-groupwrap').forEach(function (w) { w.hidden = !w.querySelector('.q-group:not([hidden])'); });
      root.querySelectorAll('[data-tpl]').forEach(function (n) { n.textContent = fillPipes(n.getAttribute('data-tpl')); });
      root.querySelectorAll('[data-aria-tpl]').forEach(function (n) { n.setAttribute('aria-label', fillPipes(n.getAttribute('data-aria-tpl'))); });
    }
    wire(root, function (n, v) {
      answers[n] = v; if (onAnswer) onAnswer(n, v);
      applyLogic();
      if (root.querySelector('.missing')) { var m = blank(answers, ids(active())); flag(root, m); if (!m.length) msgEl.innerHTML = ''; }
    });
    applyLogic();
    return {
      answers: answers,
      check: function () {
        var act = active();
        var hard = blank(answers, ids(act.filter(function (i) { return i.required; })));
        var soft = blank(answers, ids(act.filter(function (i) { return !i.required; })));
        var badNum = act.filter(function (i) { var v = answers[i.id]; return i.type === 'number' && v != null && String(v).trim() !== '' && !isFinite(Number(String(v).replace(/,/g, ''))); }).map(function (i) { return i.id; });
        if (badNum.length) { flag(root, badNum, true, { message: 'Enter a number, using digits only.', invalid: true, focus: true }); msgEl.innerHTML = errorBox(T('number_invalid')); return false; }
        if (hard.length) { flag(root, hard, true, { message: 'This question needs an answer.', invalid: true, focus: true }); msgEl.innerHTML = errorBox(hard.length === 1 && items.filter(function (i) { return i.id === hard[0]; })[0].type === 'confidence' ? T('conf_needed') : T('required_prompt')); return false; }
        if (soft.length && !prompted) {
          prompted = true; flag(root, soft, true, { message: 'You skipped this question. You can leave it blank.' });
          msgEl.innerHTML = '<div class="soft" role="alert"><p>' + Th('skip_prompt', { n: soft.length }) + '</p></div>';
          if (button) button.textContent = T('skip_continue');
          return false;
        }
        return true;
      }
    };
  }

  // ---------- sign-in ----------
  function showLogin(msg, mode, email) {
    progress.textContent = '';
    if (mode === 'code') {
      show('<h1>' + Th('login_title') + '</h1><p>Enter your pilot access code.</p>' +
        '<form id="f" novalidate><label class="field" for="code">Access code</label><input type="text" id="code" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XX-XXXX-XXXX">' +
        (msg ? errorBox(msg) : '') + '<div class="actions split"><button type="button" class="secondary" id="alt">Sign in with email</button><button type="submit">Continue</button></div></form>');
      document.getElementById('alt').addEventListener('click', function () { showLogin(); });
      document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); var code = document.getElementById('code').value.trim(); if (code) signIn({ code: code }); });
      return;
    }
    show('<h1>' + Th('login_title') + '</h1>' + Tp('login_intro') +
      '<form id="f" novalidate><label class="field" for="email">Email</label><input type="email" id="email" autocomplete="email" spellcheck="false" value="' + esc(email || '') + '"' + (msg ? ' aria-describedby="loginerr" aria-invalid="true"' : '') + '>' +
      (msg ? errorBox(msg, 'loginerr') : '') + '<div class="actions split"><button type="button" class="secondary" id="alt">I have an access code</button><button type="submit">Continue</button></div></form>');
    document.getElementById('alt').addEventListener('click', function () { showLogin(null, 'code'); });
    document.getElementById('f').addEventListener('submit', function (e) { e.preventDefault(); var em = document.getElementById('email').value.trim(); if (em) signIn({ email: em }); });
  }
  // First sign-in only: the email links every session, so check it before creating the record.
  function showConfirm(email) {
    progress.textContent = '';
    show('<h1>' + Th('confirm_title') + '</h1><p class="summary"><strong>' + esc(email) + '</strong></p>' + Tp('confirm_body', { email: email }) +
      '<div class="actions split"><button class="secondary" id="no">' + Th('confirm_no') + '</button><button id="yes">' + Th('confirm_yes') + '</button></div>');
    document.getElementById('no').addEventListener('click', function () { showLogin(null, 'email', email); });
    document.getElementById('yes').addEventListener('click', function () { this.disabled = true; signIn({ email: email, confirm: true }); });
  }
  function previewRibbon() {
    if (document.getElementById('preview-ribbon')) return;
    var b = document.createElement('div'); b.id = 'preview-ribbon'; b.className = 'preview-ribbon'; b.setAttribute('role', 'note');
    b.innerHTML = '<strong>Preview</strong> · You are seeing the study as a participant would. This test participant is marked as test and is left out of real counts.';
    document.body.insertBefore(b, document.body.firstChild);
  }
  function loginError(r) {
    if (r.error === 'not_enrolled' && r.domains && r.domains.length) return 'That email can\'t be used for this study. Use an email address ending in @' + r.domains.join(' or @') + '.';
    return ERR[r.error] || ERR.server_error;
  }
  function signIn(creds, early) {
    (early ? early.then(function (j) { return settle('login', j); }) : api('login', creds)).then(function (r) {
      if (r.error === 'confirm_new') return showConfirm(r.email || creds.email);
      if (r.error && creds.panelId != null) return show('<h1>' + Th('login_title') + '</h1>' + errorBox('This study link is not complete. Please go back to the study page where you found it and open it again.'));
      if (r.error) return showLogin(loginError(r), creds.email != null ? 'email' : 'code', creds.email);
      S.token = r.token; store(tokenKey, r.token); store(panelKey, creds.panelId != null ? String(creds.panelId) : null);   // kept in this tab: the server may hold the ID sealed (seal.mjs)
      if (r.status && r.status.screenedOut) return showScreenedOut();   // for example, the study was already full
      if (!r.consented) return showConsent();
      showStatus(r.status);
    });
  }
  function refresh(early) {
    (early ? early.then(function (j) { return settle('resume', j); }) : api('resume', { token: S.token })).then(function (r) {
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      if (r.status && r.status.screenedOut) return showScreenedOut();
      if (!r.consented) return showConsent();
      showStatus(r.status);
    });
  }

  // ---------- consent ----------
  function para(text) { return linkify(esc(String(text).replace(/\{minutes\}/g, S.content.minutesPerSession))); }
  function showConsent() {
    progress.textContent = '';
    var c = S.content.consent, rec = c.recording && c.recording.enabled ? c.recording : null;
    show((c.approved ? '' : '<div class="banner" role="note">' + Th('consent_draft_banner') + '</div>') +
      '<h1>' + Th('consent_title') + '</h1>' + c.paragraphs.map(function (x) { return '<p>' + para(x) + '</p>'; }).join('') +
      '<label class="option agree" for="agree"><input type="checkbox" id="agree"><span>' + esc(c.agreeLabel) + '</span></label>' +
      // Studies that record voice ask separately, so saying no to recording still lets people take part (they type instead).
      (rec ? '<label class="option agree" for="agree-rec"><input type="checkbox" id="agree-rec"><span>' + esc(rec.label) + (rec.required ? '' : ' <span class="muted">(optional: without it you type instead of speaking)</span>') + '</span></label>' : '') +
      '<div class="actions split"><button class="secondary" id="decline">I do not agree</button><button id="ok" disabled>Continue</button></div>');
    var agree = document.getElementById('agree'), ok = document.getElementById('ok'), agreeRec = document.getElementById('agree-rec');
    function ready() { ok.disabled = !agree.checked || !!(rec && rec.required && !agreeRec.checked); }
    agree.addEventListener('change', ready); if (agreeRec) agreeRec.addEventListener('change', ready);
    ok.addEventListener('click', function () {
      ok.disabled = true;
      api('consent', { token: S.token, agree: true, recording: rec ? agreeRec.checked : undefined }).then(function (r) { if (r.error) return showLogin(ERR[r.error] || ERR.server_error); refresh(); });
    });
    document.getElementById('decline').addEventListener('click', function () {
      api('consent', { token: S.token, agree: false }).then(function () { store(tokenKey, null); show('<h1>' + Th('finished_title') + '</h1>' + Tp('decline_body')); });
    });
  }

  // ---------- status ----------
  // Honest progress across sessions: one dot per session (Villar et al. 2013; Conrad et al. 2010).
  function tracker(done, total, current) {
    if (total < 2) return '';
    var dots = '';
    for (var i = 1; i <= total; i++) dots += '<li class="' + (i <= done ? 'done' : i === current ? 'now' : '') + '"><span class="sr">Session ' + i + (i <= done ? ', complete' : i === current ? ', next' : '') + '</span></li>';
    return '<ol class="tracker" aria-label="Your progress">' + dots + '</ol>';
  }
  // Arrived from an online panel's link (Prolific and similar) in this tab: they never typed an email or code, so
  // "sign in again" and "Sign out" mean nothing to them; the panel's link is how they come back.
  function viaPanel() { return !!(S.content && S.content.panel) && !!store(panelKey); }
  var PANEL_NAMES = { PROLIFIC_PID: 'Prolific', workerId: 'Amazon MTurk', participantId: 'CloudResearch Connect' };   // presets in netlify/lib/lab/recruit.mjs
  function panelName() { var pn = S.content.panel || {}; return pn.label || PANEL_NAMES[pn.param] || 'the site where you found this study'; }
  function signOutButton() { return viaPanel() ? '' : '<button class="secondary" id="out">' + Th('sign_out') + '</button>'; }
  function wireSignOut() { var b = document.getElementById('out'); if (b) b.addEventListener('click', signOut); }
  function showStatus(st) {
    progress.textContent = '';
    if (st.screenedOut) return showScreenedOut();
    if (st.finished) return showFinished(st);
    var done = st.completed ? Tp('progress_done', { completed: st.completed, total: st.total }) : '';
    var out = signOutButton() || '<span></span>';
    // One sitting split into sessions: no session numbers or tracker; a returning participant resumes at once.
    if (S.content.continuous && st.available) {
      if (st.completed) return startSession();
      show('<h1>' + Th('continuous_title') + '</h1>' + Tp('start_body') + '<div class="actions split">' + out + '<button id="go">' + Th('continuous_button') + '</button></div>');
      document.getElementById('go').addEventListener('click', function () { this.disabled = true; startSession(); });
      return wireSignOut();
    }
    if (!st.available) {
      show('<h1>' + Th('wait_title') + '</h1>' + tracker(st.completed, st.total, st.nextSession) + done + Tp('wait_body', { session: st.nextSession, date: fmtDate(st.availableAt) }) +
        '<div class="actions split">' + out + '<button class="secondary" id="cal">' + Th('calendar_button') + '</button></div>');
      document.getElementById('cal').addEventListener('click', function () { calendar(st.nextSession, st.availableAt); });
    } else {
      show('<h1>' + Th('start_title', { session: st.nextSession, total: st.total }) + '</h1>' + tracker(st.completed, st.total, st.nextSession) + done + (viaPanel() ? Tp('start_body_panel', { panel: panelName() }) : Tp('start_body')) +
        '<div class="actions split">' + out + '<button id="go">' + Th('start_button', { session: st.nextSession }) + '</button></div>');
      document.getElementById('go').addEventListener('click', function () { this.disabled = true; startSession(); });
    }
    wireSignOut();
    if (S.content.panel) stopLink();
  }
  // Panel participants are told to use the button back to the panel (above it, with the code kept on the page),
  // not that they can close the page; the text follows what the panel needs once the hand-off arrives.
  function showFinished(st) {
    progress.textContent = '';
    if (st && st.returned) return showReturned();
    var out = signOutButton(), panel = viaPanel();
    var db = S.content.debrief;   // a study's debrief text, and (for types that have one) the participant's own record
    var mi = document.getElementById('mm-myinfo'); if (mi && mi.parentNode) mi.parentNode.removeChild(mi);
    show('<h1>' + Th('finished_title') + '</h1>' + (st && st.total && !S.content.continuous ? tracker(st.total, st.total, 0) : '') +
      '<div id="finbody">' + (panel ? Tp('finished_body_panel_wait', { panel: panelName() }) : Tp('finished_body')) + '</div><div id="handoff" aria-live="polite"></div>' +
      (db ? '<section class="debrief"><h2>' + esc(db.title) + '</h2>' + String(db.body).split(/\n\s*\n/).map(function (x) { return '<p>' + linkify(esc(x.trim())) + '</p>'; }).join('') + '</section><div id="debrief-own"></div>' : '') +
      (out ? '<div class="actions">' + out + '</div>' : ''));
    wireSignOut();
    handoff(null, panel ? function (r) {
      var body = document.getElementById('finbody'), name = r.panel || panelName();
      if (body) body.innerHTML = r.url ? Tp('finished_body_panel', { panel: name }) : r.code ? Tp('finished_body_panel_code', { panel: name }) : Tp('finished_body_panel_none', { panel: name });
    } : null);
    if (db && S.type && S.type.debrief && S.token) S.type.debrief(ui, document.getElementById('debrief-own'));
  }
  // ---------- hand-off to the recruitment panel ----------
  // The server sends the code for the outcome reached (completed, screened out, returned) only once it is reached,
  // with the address back to the panel (Prolific, SONA, ...). No automatic redirect: the participant reads the code
  // and follows the link when ready (no time limit, WCAG 2.2.1).
  function handoff(got, onReady) {
    var box = document.getElementById('handoff');
    if (!box || !S.token) return;
    (got ? Promise.resolve(got) : api('handoff', { token: S.token, panelId: store(panelKey) || undefined })).then(function (r) {
      // A failed request must not leave the page promising a button or code that never comes: say so and offer a retry.
      if (!r || r.error) {
        box.innerHTML = errorBox(ERR[(r && r.error)] || ERR.server_error) + '<div class="actions"><button type="button" class="secondary" id="hretry">Try again</button></div>';
        document.getElementById('hretry').addEventListener('click', function () { handoff(null, onReady); });
        return;
      }
      if (onReady) onReady(r);
      if (!r || r.error || !r.outcome || (!r.code && !r.url)) return;
      var where = r.panel || 'the study site';
      box.innerHTML = (r.code ? '<p>' + Th('handoff_code') + '</p><p class="handoff-code"><code id="hcode">' + esc(r.code) + '</code> <button type="button" class="secondary small" id="hcopy">Copy code</button></p>' : '') +
        (r.url ? '<div class="actions"><a class="btn" href="' + esc(r.url) + '" rel="noopener">' + esc(T('handoff_button').replace('{panel}', where)) + '</a></div>' : '');
      var cp = document.getElementById('hcopy');
      if (cp) cp.addEventListener('click', function () {
        (navigator.clipboard ? navigator.clipboard.writeText(r.code) : Promise.reject()).then(function () { cp.textContent = 'Copied'; }, function () { cp.textContent = 'Select the code and copy it'; });
      });
    });
  }
  // "Stop taking part": panel participants can leave at any time and get the panel's "returned" code.
  function stopLink() {
    var a = document.createElement('p'); a.className = 'muted stop-note';
    a.innerHTML = '<button type="button" class="linklike" id="stop">' + Th('stop_link') + '</button>';
    stage.appendChild(a);
    document.getElementById('stop').addEventListener('click', function () {
      show('<h1>' + Th('stop_title') + '</h1>' + Tp('stop_body') + '<div class="actions split"><button class="secondary" id="keep">' + Th('stop_keep') + '</button><button id="yes">' + Th('stop_confirm') + '</button></div>');
      document.getElementById('keep').addEventListener('click', refresh);
      document.getElementById('yes').addEventListener('click', function () { this.disabled = true; api('withdraw', { token: S.token }).then(function () { showReturned(); }); });
    });
  }
  // Screened out (a screening rule or failed check, or the study was full when they arrived): no further sessions,
  // and the panel's screened-out code. The page says "study full" when that is the reason.
  function showScreenedOut() {
    progress.textContent = ''; S.lab = null;
    api('handoff', { token: S.token, panelId: store(panelKey) || undefined }).then(function (r) {
      var full = r && r.reason === 'quota_full';
      show('<h1>' + Th(full ? 'full_title' : 'screenout_title') + '</h1>' + Tp(full ? 'full_body' : 'screenout_body') + '<div id="handoff" aria-live="polite"></div>');
      handoff(r);
    });
  }
  function showReturned() {
    progress.textContent = ''; S.lab = null;
    show('<h1>' + Th('returned_title') + '</h1>' + Tp('returned_body') + '<div id="handoff" aria-live="polite"></div>');
    handoff();
  }
  function signOut() { store(tokenKey, null); store(panelKey, null); S.token = null; showLogin(); }
  // Add-to-calendar file for the next session (Dillman et al. 2014: lower the cost of coming back).
  function calendar(session, at) {
    var d = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var url = location.origin + location.pathname;
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CCAIR Lab//Study//EN', 'BEGIN:VEVENT', 'UID:lab-' + studyId + '-' + at + '-' + session + '@bampel.com', 'DTSTAMP:' + d(Date.now()),
      'DTSTART:' + d(at), 'DTEND:' + d(at + S.content.minutesPerSession * 60000), 'SUMMARY:' + T('login_title') + ': session ' + session, 'URL:' + url, 'DESCRIPTION:' + url, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'study-session-' + session + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- session ----------
  // Embedded data from the address (for example ?PROLIFIC_PID=...): only the names the study declares, kept for
  // this tab so a reload without the parameters still has them. Sent when the session starts; never used to sign in.
  function embeddedFromUrl() {
    var defs = (S.content.embedded || []).filter(function (d) { return d.source === 'url'; }), out = {}, kept = {}, key = 'lab_ed_' + studyId;
    if (!defs.length) return out;
    try { kept = JSON.parse(store(key) || '{}') || {}; } catch (e) { kept = {}; }
    var qs = null; try { qs = new URLSearchParams(location.search); } catch (e) {}
    defs.forEach(function (d) {
      var v = qs ? qs.get(d.param || d.name) : null;
      if (v) kept[d.name] = v;
      if (kept[d.name]) out[d.name] = String(kept[d.name]).slice(0, 200);
    });
    store(key, JSON.stringify(kept));
    return out;
  }
  // The study's gate is closed (its voice system is down or full). Nothing was assigned; the participant can retry.
  function showRetry(why) {
    show('<h1>Please try again in a few minutes</h1><p>' + (why === 'lab_busy' ? 'Many people are taking this part of the study right now.' : 'The study\'s phone system is not available at the moment.') +
      ' Your place is kept. Nothing has started yet, so you lose nothing by waiting.</p><div class="actions"><button id="retry">Try again</button></div>');
    document.getElementById('retry').addEventListener('click', function () { this.disabled = true; startSession(); });
  }
  function startSession() {
    api('session', { token: S.token, embedded: embeddedFromUrl() }).then(function (r) {
      if (r.error === 'not_yet' || r.error === 'finished') return refresh();
      if (r.error === 'voice_unavailable' || r.error === 'lab_busy') return showRetry(r.error);
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      S.plan = r;
      dqStart(r.session);
      if (!S.lab && window.TraceLab) { S.lab = TraceLab.create({ study: studyId, version: '3.0.0', sink: { type: 'local' }, mouseSampleMs: 50 }); S.lab.start(); }
      measureFrames();
      runChecks(r.session, function () { if (env().preload) return preloadPlan(S.plan, 0); next(); });
    });
  }

  // ---------- setup checks and full screen (engine/envcheck.js; Study content → Devices & timing) ----------
  // Before the first item of a session: device and browser, microphone, headphones (session 1), then full screen.
  // Results are saved once per session (route "checks"); the server decides whether a failed check ends the study.
  function loadEnv(then) {
    if (window.LabEnv) return then(window.LabEnv);
    var s = document.createElement('script'); s.src = '/lab/engine/envcheck.js';
    s.onload = function () { then(window.LabEnv); }; s.onerror = function () { then(null); };
    document.head.appendChild(s);
  }
  function runChecks(n, done) {
    var e = env(), any = e.desktopOnly || e.speechBrowser || e.micCheck || (e.headphoneCheck && n === 1) || e.timingCheck || e.fullscreen;
    if (!any) return done();
    loadEnv(function (L) {
      if (!L) return done();   // the check script did not load: run the session (the trials still record full screen and device)
      if ((S.checked && S.checked[n]) || (S.plan && S.plan.checksDone)) { if (!(S.soundChecks && S.soundChecks[n])) noteChecks(n, null); return fullscreenGate(L, done); }
      var dv = L.device(), problems = L.deviceProblems(e, dv), results = { device: Object.assign(dv, { problems: problems }) };
      if (problems.length) {   // no way forward on this device; nothing is saved, so the participant can come back on a computer
        show('<h1>' + Th('check_title') + '</h1>' + Tp(problems[0] === 'desktop' ? 'check_desktop' : 'check_speech'));
        if (S.content.panel) stopLink();
        return;
      }
      var steps = [];
      if (e.micCheck) steps.push(function (go) { micStep(L, results, 0, go); });
      if (e.headphoneCheck && n === 1) steps.push(function (go) { headphoneStep(L, results, go); });
      if (e.timingCheck) steps.push(function (go) {   // two seconds of measuring the display, nothing to do
        show('<h1>' + Th('check_title') + '</h1><p role="status">' + Th('timing_wait') + '</p>');
        L.timingProbe(120).then(function (t) { results.timing = t; if (S.frameMs == null && t && t.frameMsMedian >= 1) S.frameMs = t.frameMsMedian; go(); });
      });
      (function step(i) {
        if (i < steps.length) return steps[i](function () { step(i + 1); });
        api('checks', { token: S.token, session: n, data: results }).then(function (r) {
          if (r.screenedOut) return showScreenedOut();
          S.checked = S.checked || {}; S.checked[n] = true; noteChecks(n, results);
          fullscreenGate(L, done);
        });
      })(0);
    });
  }
  // What this session's checks showed about sound, for a type's own sound check (multimodal skips the parts already
  // done): heard = the headphone check passed (sound plays), mic = the microphone check heard the participant. After a
  // reload the results are not in the page; a check that screens out on failure must have passed to get here.
  function noteChecks(n, results) {
    var e = env();
    S.soundChecks = S.soundChecks || {};
    S.soundChecks[n] = results
      ? { heard: !!(results.headphone && results.headphone.pass), mic: !!(results.mic && results.mic.ok) }
      : { heard: !!(e.headphoneCheck && n === 1 && e.headphoneFail === 'screen'), mic: !!(e.micCheck && e.micRequired) };
  }
  function micStep(L, results, tries, go) {
    show('<h1>' + Th('mic_check_title') + '</h1>' + Tp('mic_check_body') + '<label class="field" for="micm">Microphone level</label><meter id="micm" min="0" max="100" low="40" optimum="70" value="0"></meter>' +
      '<p id="micmsg" role="status"></p><div class="actions split"><span></span><button id="micgo">' + Th('mic_check_start') + '</button></div>');
    var btn = document.getElementById('micgo');
    btn.onclick = function () {
      btn.disabled = true;
      L.micLevel(document.getElementById('micm')).then(function (r) {
        results.mic = { ok: r.ok, peakDb: r.peakDb, error: r.error || null, tries: tries + 1 };
        var msg = document.getElementById('micmsg');
        if (r.ok) { msg.textContent = T('mic_check_ok'); btn.disabled = false; btn.textContent = T('continue_button'); btn.onclick = function () { go(); }; return; }
        msg.innerHTML = errorBox(T('mic_check_fail'));
        var last = tries >= 1;   // two attempts
        if (last && env().micRequired) { btn.disabled = false; btn.textContent = T('continue_button'); btn.onclick = function () { go(); }; return; }   // the server screens out
        btn.disabled = false; btn.textContent = last ? T('continue_button') : T('preload_retry');
        btn.onclick = function () { if (last) go(); else micStep(L, results, tries + 1, go); };
      });
    };
  }
  // Six trials of three noises (Milne et al. 2021); the answer buttons open once the noises have played.
  function headphoneStep(L, results, go) {
    var N = L.HEADPHONE_TRIALS, targets = [], answers = [], rand = Math.random, ac = null;
    for (var i = 0; i < N; i++) targets.push(Math.floor(rand() * 3));
    (function trial(k) {
      if (k >= N) {
        var correct = L.score(answers, targets), pass = correct >= L.HEADPHONE_PASS;
        results.headphone = { correct: correct, of: N, pass: pass, answers: answers, targets: targets };
        progress.textContent = '';
        try { if (ac) ac.close(); } catch (e) {}
        if (pass) return go();
        show('<h1>' + Th('hp_title') + '</h1>' + errorBox(T('hp_fail')) + '<div class="actions"><button id="hpgo">' + Th('continue_button') + '</button></div>');
        return document.getElementById('hpgo').addEventListener('click', go);
      }
      progress.textContent = (k + 1) + ' / ' + N;
      show('<h1>' + Th('hp_title') + '</h1>' + (k === 0 ? Tp('hp_body', { n: N }) : '') + '<div class="actions"><button id="hpplay">' + Th('hp_play') + '</button></div>' +
        choiceGroup('hp', Th('hp_question'), [['0', '1'], ['1', '2'], ['2', '3']]) + '<div class="actions"><button id="hpnext" disabled>' + Th('continue_button') + '</button></div>');
      var radios = stage.querySelectorAll ? stage.querySelectorAll('input[name=hp]') : [], play = document.getElementById('hpplay'), nx = document.getElementById('hpnext');
      radios.forEach(function (r) { r.disabled = true; r.addEventListener('change', function () { nx.disabled = false; }); });
      play.addEventListener('click', function () {
        play.disabled = true;
        try { ac = ac || new L.AudioContext(); } catch (e) { ac = null; }
        if (!ac) { radios.forEach(function (r) { r.disabled = false; }); return; }
        var src = ac.createBufferSource(); src.buffer = L.trialBuffer(ac, targets[k], rand); src.connect(ac.destination);
        src.onended = function () { radios.forEach(function (r) { r.disabled = false; }); };
        if (ac.resume) ac.resume(); src.start();
      });
      nx.addEventListener('click', function () {
        var picked = stage.querySelector('input[name=hp]:checked');
        if (!picked) return;
        answers.push(Number(picked.value)); trial(k + 1);
      });
    })(0);
  }
  // Full screen needs a click. Exits are noted (performance.now()) for the trial they happen in, and a button
  // offers the way back; the session never stops because of it.
  function fullscreenGate(L, done) {
    if (!env().fullscreen || !L.fullscreen.supported() || L.fullscreen.active()) return done();
    progress.textContent = '';
    show('<h1>' + Th('fs_title') + '</h1>' + Tp('fs_body') + '<div class="actions"><button id="fsgo">' + Th('fs_button') + '</button></div>');
    document.getElementById('fsgo').addEventListener('click', function () {
      L.fullscreen.enter().then(function () {
        if (!S.fsWatching) { S.fsWatching = true; L.fullscreen.watch(fsExited); }
        done();
      });
    });
  }
  function fsExited(t) {
    (S.fsExits = S.fsExits || []).push(t);
    var bar = document.getElementById('fs-back');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'fs-back'; bar.className = 'fs-back'; bar.setAttribute('role', 'alert');
      bar.innerHTML = '<span>You left full screen.</span> <button type="button" class="small">' + Th('fs_back') + '</button>';
      document.body.insertBefore(bar, document.body.firstChild);
      bar.querySelector('button').addEventListener('click', function () { window.LabEnv.fullscreen.enter().then(function () { bar.hidden = true; }); });
    }
    bar.hidden = false;
  }

  // ---------- preloading and stimulus timing ----------
  // With "preload" on, every media file in the session's plan is fetched before the first screen and the plan is
  // pointed at in-memory copies (blob: addresses), so no stimulus waits on the network once the session starts.
  // Files on other sites can only be warmed in the browser cache (images) unless that site allows it (CORS); the
  // researcher guide says to upload timing-critical stimuli. Without "preload", nothing changes.
  function env() { return S.content.environment || {}; }
  var MEDIA_RE = /\.(mp3|m4a|wav|ogg|oga|webm|mp4|m4v|mov|png|jpe?g|gif|webp|avif|svg)(\?[^\s"']*)?$/i;
  function mediaUrls(obj, out) {
    out = out || [];
    if (typeof obj === 'string') { if ((/^\/(?!\/)/.test(obj) || /^https:\/\//.test(obj)) && (MEDIA_RE.test(obj) || /^\/api\/lab\/[^/]+\/file\//.test(obj)) && out.indexOf(obj) < 0) out.push(obj); }
    else if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { mediaUrls(obj[k], out); });
    return out;
  }
  function swapUrls(obj, map) {
    if (typeof obj === 'string') return Object.prototype.hasOwnProperty.call(map, obj) ? map[obj] : obj;
    if (Array.isArray(obj)) return obj.map(function (x) { return swapUrls(x, map); });
    if (obj && typeof obj === 'object') { var o = {}; Object.keys(obj).forEach(function (k) { o[k] = swapUrls(obj[k], map); }); return o; }
    return obj;
  }
  function sameOrigin(u) { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; } }
  function preloadPlan(plan, tries, then) {
    then = then || next;
    var urls = mediaUrls(plan), done = 0, failed = [], map = {};
    if (!urls.length) { S.preloaded = true; return then(); }
    progress.textContent = '';
    show('<h1>' + Th('preload_title') + '</h1>' + Tp('preload_body') + '<progress id="pl" max="' + urls.length + '" value="0" aria-label="' + Th('preload_title') + '" aria-describedby="plmsg"></progress><p class="muted" id="plmsg" aria-live="polite"></p>');
    var bar = document.getElementById('pl'), msg = document.getElementById('plmsg');
    function tick() { done++; bar.value = done; msg.textContent = T('preload_progress', { i: done, n: urls.length }); }
    // Each file settles once: loaded, failed, or (after 30 seconds without an answer) failed.
    function one(u) {
      return new Promise(function (res) {
        var settled = false, timer = setTimeout(function () { finish(false); }, 30000);
        function finish(ok, blobUrl) { if (settled) return; settled = true; clearTimeout(timer); if (ok && blobUrl) map[u] = blobUrl; if (!ok) failed.push(u); tick(); res(); }
        if (!sameOrigin(u) && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u)) {   // another site's image: warm the cache
          var im = new Image(); im.onload = function () { finish(true); }; im.onerror = function () { finish(false); }; im.src = u; return;
        }
        fetch(u, { credentials: 'same-origin', mode: sameOrigin(u) ? 'same-origin' : 'cors' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
          .then(function (b) { finish(true, URL.createObjectURL(b)); }, function () { finish(false); });
      });
    }
    var queue = urls.slice(), running = [];
    function pump() { while (queue.length && running.length < 4) { var p = one(queue.shift()); running.push(p); p.then(function () { running.shift(); pump(); }); } }
    var all = new Promise(function (res) { var timer = setInterval(function () { if (done >= urls.length) { clearInterval(timer); res(); } }, 50); });
    pump();
    return all.then(function () {
      S.plan = swapUrls(plan, map);
      if (!failed.length) { S.preloaded = true; return then(); }
      show('<h1>' + Th('preload_failed_title') + '</h1>' + Tp('preload_failed_body', { n: failed.length }) +
        '<div class="actions split">' + (tries >= 1 ? '<button class="secondary" id="anyway">' + Th('preload_continue') + '</button>' : '') + '<button id="retry">' + Th('preload_retry') + '</button></div>');
      document.getElementById('retry').addEventListener('click', function () { preloadPlan(S.plan, tries + 1, then); });
      var any = document.getElementById('anyway'); if (any) any.addEventListener('click', function () { S.preloaded = false; then(); });
    });
  }
  // The display's frame interval: the median gap between 60 animation frames, measured once per session. It counts
  // only frames drawn while the page is in front (a hidden tab draws none, and its first frame back is a long gap
  // that is not a frame interval), and starts from the first frame rather than from performance.now(), which is
  // on a different footing (a frame's timestamp is when the frame began, which can be before the code asking for
  // it ran). With a coarse clock (some privacy settings round timestamps to 100 ms) the median can be 0; the mean
  // gap is used then. The setup checks' display probe fills in if this has not finished when a trial is saved.
  function measureFrames() {
    if (S.frameMs != null || S.measuring || !window.requestAnimationFrame) return;
    S.measuring = true;
    var last = null, gaps = [];
    function hidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
    requestAnimationFrame(function step(ts) {
      if (hidden()) last = null;
      else { if (last != null && ts - last < 250) gaps.push(ts - last); last = ts; }
      if (gaps.length < 60) return requestAnimationFrame(step);
      S.measuring = false;
      var sorted = gaps.slice().sort(function (a, b) { return a - b; }), mid = sorted[30];
      if (!(mid >= 1)) mid = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
      if (mid >= 1) S.frameMs = Math.round(mid * 100) / 100;
    });
  }
  function next() {
    var p = S.plan;
    if (!p.preSurveyDone) return surveyPage(T('pre_title'), p.preItems || [], 'pre');
    var t = p.trials.filter(function (x) { return !x.done; })[0];
    if (!p._instructed && (t || (p.practice && !p.practiceDone))) return showInstructions();
    if (p.practice && !p.practiceDone) return runTrial(p.practice, 'practice');
    if (t) return runTrial(t, t.index);
    surveyPage(T('post_title'), p.postItems || [], 'post');
  }
  function showInstructions() {
    var p = S.plan, extra = S.type.instructions ? S.type.instructions(p, ui) : '';
    progress.textContent = S.content.continuous ? '' : T('start_title', { session: p.session, total: S.content.sessions });
    show('<h1>' + Th('instr_title') + '</h1>' + Tp('instr_intro', p.game && p.game.roundsTextAll ? { n: p.total, rounds_text: p.game.roundsTextAll } : { n: p.total }) + extra + (p.practice && !p.practiceDone ? Tp('instr_practice') : '') +
      '<div class="actions"><button id="go">' + Th('begin_button') + '</button></div>');
    document.getElementById('go').addEventListener('click', function () { p._instructed = true; next(); });
  }

  // One item screen. The type renders it and calls ctx.submit(fields); the engine adds behavior traces,
  // raw events, viewport, and device, saves it, and moves on. A type with a screen to show before an item (the
  // multimodal type's sound check) supplies beforeTrial(info, ui, go): the item, its clock, and its traces start
  // only when it calls go(), so that screen never counts as part of the item.
  function runTrial(trial, index) {
    var p = S.plan, isPractice = index === 'practice';
    var doneCount = p.trials.filter(function (x) { return x.done; }).length;
    // A type whose trial list mixes kinds (practice, main, follow-up screens) words its own progress line.
    var own = S.type.progressText ? S.type.progressText(trial, p, ui) : null;
    progress.textContent = own != null ? own : isPractice ? T('progress_practice') : T('progress_trial', { session: p.session, i: doneCount + 1, n: p.total });
    if (S.type.beforeTrial) {
      var checks = (S.soundChecks && S.soundChecks[p.session]) || {};
      return S.type.beforeTrial({ trial: trial, index: index, isPractice: isPractice, plan: p, content: S.content, heard: !!checks.heard, micHeard: !!checks.mic }, ui, function () { startTrial(trial, index); });
    }
    startTrial(trial, index);
  }
  function startTrial(trial, index) {
    var p = S.plan, isPractice = index === 'practice';
    if (!isPractice) api('view', { token: S.token, session: p.session, index: index });   // a reload re-shows it; the server counts views
    var t0 = performance.now(), answerLog = [], onset = null, fsAtOnset = null;
    if (S.lab) { S.lab.events.length = 0; S.lab.beginItem(isPractice ? 'practice' : 't' + index, stage); }
    var ctx = {
      trial: trial, index: index, isPractice: isPractice, plan: p, content: S.content,
      ms: function () { return Math.round(performance.now() - t0); },
      // Stimulus onset: the first animation frame that begins after the screen was drawn (performance.now() clock). A
      // type that reveals its stimulus later (after a Start click, or when a clip starts) calls ctx.markOnset() then.
      // A frame's timestamp is when that frame began, which can be a few ms before the code that asked for it ran
      // (the browser was still busy when the frame started); such a frame is skipped for the next one, so the onset
      // never comes before the screen was drawn and onset_delay_ms is never negative.
      markOnset: function () {
        if (!window.requestAnimationFrame) return;
        var asked = performance.now();
        requestAnimationFrame(function frame(ts) {
          if (ts < asked) return requestAnimationFrame(frame);
          onset = ts; fsAtOnset = !!(document.fullscreenElement || document.webkitFullscreenElement);
        });
      },
      record: function (name, value) { answerLog.push({ atMs: ctx.ms(), name: name, value: value }); if (S.lab) S.lab.recordAnswer(name, value); },
      submit: function (fields, onError) {
        var feats = S.lab ? S.lab.endItem({}) : null, raw = S.lab ? S.lab.events.splice(0) : [];
        var data = Object.assign({}, fields, { answerLog: answerLog, traces: feats ? feats.features : null, rawEvents: raw, viewport: { w: window.innerWidth, h: window.innerHeight },
          timing: { onsetMs: onset, onsetDelayMs: onset != null ? onset - t0 : null, frameMs: S.frameMs, preloaded: env().preload ? !!S.preloaded : null },
          fullscreen: env().fullscreen ? { atOnset: fsAtOnset, exitsMs: (S.fsExits || []).filter(function (x) { return x >= t0; }).map(function (x) { return x - t0; }) } : undefined });
        var sendsDevice = !!(S.lab && !S.deviceSent[p.session] && !isPractice);
        if (sendsDevice) data.device = S.lab.device;
        dqFlush(p.session);
        api('trial', { token: S.token, session: p.session, index: index, data: data }).then(function (r) {
          // A failed save resumes the same item, with its clock, traces and raw events intact, so the retry sends
          // everything recorded since the item began (not only what happened after the error).
          if (r.error) { if (S.lab && !S.lab.reopenItem(raw)) S.lab.beginItem(isPractice ? 'practice' : 't' + index, stage); return onError && onError(ERR[r.error] || ERR.server_error); }
          if (sendsDevice) S.deviceSent[p.session] = true;
          if (r.screenedOut) return showScreenedOut();
          if (isPractice) { p.practiceDone = true; return showPracticeDone(); }
          p.trials.forEach(function (x) { if (x.index === index) x.done = true; });
          next();
        });
      }
    };
    S.type.runTrial(ctx, ui);
    ctx.markOnset();
  }
  function showPracticeDone() {
    show('<h1>' + Th('practice_done_title') + '</h1>' + Tp('practice_done_body') + '<div class="actions"><button id="go">' + Th('practice_done_button') + '</button></div>');
    document.getElementById('go').addEventListener('click', next);
  }

  // ---------- surveys ----------
  // One question per row, no grids; radios, not dropdowns, for short lists; a soft reminder for skipped
  // questions instead of forced answers (Couper et al. 2013; Roßmann et al. 2018; de Leeuw et al. 2016).
  function surveyPage(title, items, kind) {
    if (!items.length) return submitSurvey({}, kind, null);
    // Questions with the same "page" number are shown together, pages in ascending order. Answers from earlier
    // pages are kept in this tab (sessionStorage) so a reload part-way through does not lose them. A page whose
    // questions are all hidden by display logic is skipped.
    var pages = [], byPage = {}, all = {}, idx = 0, saveKey = 'lab_sv_' + studyId + '_s' + S.plan.session + '_' + kind, ed = S.plan.embedded || {};
    items.forEach(function (it) { var k = it.page || 1; if (!byPage[k]) { byPage[k] = []; pages.push(k); } byPage[k].push(it); });
    pages.sort(function (a, b) { return a - b; });
    try { var kept = JSON.parse(store(saveKey) || 'null'); if (kept && kept.all && kept.idx < pages.length) { all = kept.all; idx = kept.idx; } } catch (e) {}
    S.survey = { key: saveKey };
    function pageVisible(k) {
      var r = lib() ? lib().resolve(byPage[k], {}, { ed: ed }, all) : { hidden: {} };
      return byPage[k].some(function (it) { return !r.hidden[it.id]; });
    }
    function skipHidden() { while (idx < pages.length && !pageVisible(pages[idx])) idx++; }
    function showPage() {
      skipHidden();
      if (idx >= pages.length) return submitSurvey(all, kind, null);
      var list = byPage[pages[idx]], mine = {};
      progress.textContent = (S.content.continuous ? '' : T('start_title', { session: S.plan.session, total: S.content.sessions })) + (pages.length > 1 ? (S.content.continuous ? '' : ' · ') + T('survey_page', { i: idx + 1, n: pages.length }) : '');
      show('<h1>' + esc(title) + '</h1>' + questionsHtml(list, { items: items, ed: ed, lookup: function (id) { return mine[id] !== undefined ? mine[id] : all[id]; } }) +
        honeypotHtml() + '<div id="surveymsg"></div><div class="actions"><button id="go">' + Th('continue_button') + '</button></div>');
      var go = document.getElementById('go'), qs = questionSet(stage, list, document.getElementById('surveymsg'), go, null, { answers: mine, prior: all, items: items, ed: ed });
      go.addEventListener('click', function () {
        honeypotCheck();
        if (!qs.check()) return;
        Object.keys(qs.answers).forEach(function (k) { all[k] = qs.answers[k]; });
        idx++; skipHidden();
        if (idx < pages.length) { store(saveKey, JSON.stringify({ all: all, idx: idx })); return showPage(); }
        go.disabled = true; submitSurvey(all, kind, go);
      });
    }
    showPage();
  }
  function submitSurvey(ans, kind, go) {
    dqFlush(S.plan.session);
    api('survey', { token: S.token, session: S.plan.session, kind: kind, data: ans }).then(function (r) {
      if (r.error) { if (go) go.disabled = false; var m = document.getElementById('surveymsg'); if (m) m.innerHTML = errorBox(ERR[r.error] || ERR.server_error); return; }
      if (S.survey && S.survey.key) store(S.survey.key, null);
      if (r.screenedOut) return showScreenedOut();
      if (kind === 'pre') { S.plan.preSurveyDone = true; return next(); }
      showDone(r.status);
    });
  }
  function showDone(st) {
    progress.textContent = ''; S.lab = null;
    if (st && st.screenedOut) return showScreenedOut();
    if (st && st.finished) return showFinished(st);
    // One sitting split into sessions (for example screening, then the study): go straight on to the next one.
    if (S.content.continuous && st && st.available) return startSession();
    show('<h1>' + Th('done_title') + '</h1>' + (st ? tracker(st.completed, st.total, 0) : '') + Tp('done_body') + (st && st.availableAt ? Tp('done_next', { date: fmtDate(st.availableAt) }) : '') +
      '<div class="actions split">' + (signOutButton() || '<span></span>') + (st && st.availableAt ? '<button class="secondary" id="cal">' + Th('calendar_button') + '</button>' : '') + '</div>');
    wireSignOut();
    var cal = document.getElementById('cal'); if (cal) cal.addEventListener('click', function () { calendar(st.nextSession, st.availableAt); });
  }

  // ---------- data-quality signals (netlify/lib/lab/quality.mjs) ----------
  // Watched for the whole session in this tab, sent as running totals when a page or item is submitted. Only counts
  // and timing are kept, never the text typed or pasted.
  var DQ = { honeypot: false, webdriver: !!(typeof navigator !== 'undefined' && navigator.webdriver), pastes: 0, pasteChars: 0, injectedChars: 0, keys: 0, fastKeys: 0 }, dqSent = '', lastKey = 0, keyBudget = 0;
  // Counts are sent per session and per page load: the server keeps the highest report of each load and adds the
  // loads up, so a reload (which starts the counts again) adds to the session instead of being hidden by the max, and
  // the next session of a one-sitting study does not repeat the counts of the one before.
  var DQ_COUNTS = ['pastes', 'pasteChars', 'injectedChars', 'keys', 'fastKeys'], dqBase = {}, dqLoad = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  function dqStart(session) { if (dqBase.session !== session) { dqBase = { session: session }; DQ_COUNTS.forEach(function (k) { dqBase[k] = DQ[k]; }); } }
  function isTextBox(t) { return t && !(t.closest && t.closest('[data-no-capture]')) && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|email|number|tel|url)?$/.test(t.type || ''))) && !t.classList.contains('hp-input'); }
  if (document.addEventListener) {
    document.addEventListener('keydown', function (e) {
      if (!isTextBox(e.target) || e.key == null || (e.key.length !== 1 && e.key !== 'Backspace')) return;
      var now = performance.now(); DQ.keys++; if (lastKey && now - lastKey < 30) DQ.fastKeys++; lastKey = now; keyBudget += 1;
    }, true);
    document.addEventListener('paste', function (e) {
      if (!isTextBox(e.target)) return;
      var t = ''; try { t = (e.clipboardData || window.clipboardData).getData('text') || ''; } catch (x) {}
      DQ.pastes++; DQ.pasteChars += t.length; keyBudget += t.length;
    }, true);
    // Text that grows by more than the keys pressed and pasted since the last change was set by something else.
    document.addEventListener('input', function (e) {
      var t = e.target; if (!isTextBox(t)) return;
      var len = String(t.value || '').length, was = t._dqLen || 0, grew = len - was;
      t._dqLen = len;
      if (grew > keyBudget + 1 && !/^(insertFromPaste|deleteContent)/.test(e.inputType || '')) DQ.injectedChars += grew - keyBudget;
      keyBudget = 0;
    }, true);
  }
  // A hidden text box people never see or reach; form-filling software finds it and types into it.
  function honeypotHtml() { return '<div class="hp-field" aria-hidden="true"><label>Leave this box empty<input type="text" class="hp-input" name="hp_extra_info" tabindex="-1" autocomplete="off"></label></div>'; }
  function honeypotCheck() { var h = stage.querySelector && stage.querySelector('.hp-input'); if (h && h.value) DQ.honeypot = true; }
  function dqFlush(session) {
    if (!S.token || !session) return;
    var d = { honeypot: DQ.honeypot, webdriver: DQ.webdriver, load: dqLoad };
    DQ_COUNTS.forEach(function (k) { d[k] = DQ[k] - (dqBase.session === session ? dqBase[k] || 0 : 0); });
    var s = session + JSON.stringify(d);
    if (s === dqSent) return;
    dqSent = s; post('dq', { token: S.token, session: session, data: d });   // best effort: no retry, never blocks the page
  }

  // ---------- what study types get ----------
  var ui = { esc: esc, T: T, Th: Th, Tp: Tp, show: show, setProgress: function (text) { progress.textContent = text || ''; }, errorBox: errorBox, choiceGroup: choiceGroup, scaleGroup: scaleGroup, vas: vas, questionHtml: questionHtml, questionsHtml: questionsHtml, fillPipes: fillPipes,
    wire: wire, flag: flag, blank: blank, questionSet: questionSet, nextId: nextId, reduceMotion: reduceMotion, stage: stage,
    // Study types with their own server routes (for example the economic game's polling) call them with the sign-in token.
    call: function (route, body) { return api(route, Object.assign({ token: S.token }, body)); } };
  window.LabEngine = { registerType: function (id, impl) { types[id] = impl; }, ui: ui,
    internals: { S: S, mediaUrls: mediaUrls, swapUrls: swapUrls, preloadPlan: preloadPlan, runChecks: runChecks, DQ: DQ, dqFlush: dqFlush, dqStart: dqStart, honeypotHtml: honeypotHtml,
      showLogin: showLogin, showConsent: showConsent, showStatus: showStatus, showFinished: showFinished, headphoneStep: headphoneStep, micStep: micStep, runTrial: runTrial, measureFrames: measureFrames } };   // for tests (tests/lab/*.test.mjs)

  // ---------- boot ----------
  if (!studyId) { show('<h1>Study not found</h1><p>Check the link you were given.</p>'); return; }
  // The page used to load one thing after another: this script, the content, display logic, the study type's script, then the
  // sign-in or resume request. Now the display logic downloads while the content does (the page also asks for logic.js
  // ahead of this script), the type script and the sign-in or resume request go out together once the content is in, and
  // nothing runs before everything is there. The same decisions are made in the same order as before.
  var logicReady = new Promise(function (res) {
    if (window.LabLogic) { LL = window.LabLogic; return res(); }
    var lg = document.createElement('script'); lg.src = '/lab/engine/logic.js';   // display logic; without it every question shows (the server still drops hidden answers)
    lg.onload = function () { LL = window.LabLogic; res(); }; lg.onerror = function () { res(); };
    document.head.appendChild(lg);
  });
  // The request this visit will make first (a sign-in from the link, or a resume), chosen the way the type script's callback below chooses.
  function entryRequest() {
    var tok = store(tokenKey), qs = null; try { qs = new URLSearchParams(location.search); } catch (e) {}
    var linkCode = qs && qs.get('code'), panel = S.content.panel, panelId = panel && qs ? qs.get(panel.param) : null, creds = null, p;
    if (linkCode) creds = { code: linkCode };
    else if (panelId) creds = { panelId: panelId, panelStudy: panel.studyParam ? qs.get(panel.studyParam) || undefined : undefined, panelSession: panel.sessionParam ? qs.get(panel.sessionParam) || undefined : undefined };
    if (creds) p = apiRaw('login', creds);
    else if (tok) p = apiRaw('resume', { token: tok });
    return p ? { creds: creds, token: creds ? null : tok, p: p } : null;
  }
  fetch(API + 'content', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (c) {
    S.content = c;
    document.title = (c.text.login_title || c.name || 'Research study') + ' | CCAIR Behavioral Lab';   // the same pattern as the lab's other pages
    // The study's language: screen readers and the speech recognizer and voices of call items follow it.
    var lang = (c.environment && c.environment.language) || 'en-US';
    document.documentElement.setAttribute('lang', lang); document.documentElement.setAttribute('data-speech-lang', lang);
    var early = entryRequest();
    function typeLoaded() {
      S.type = types[c.type];
      if (!S.type) return show('<h1>' + esc(c.name) + '</h1>' + errorBox(ERR.server_error));
      S.token = store(tokenKey);
      var qs = null; try { qs = new URLSearchParams(location.search); } catch (e) {}
      var linkCode = qs && qs.get('code'), panel = S.content.panel, panelId = panel && qs ? qs.get(panel.param) : null;
      // A researcher's "Preview as a participant" link (?code=XX-XXXX-XXXX&preview=1): sign in with that code. The
      // code is then removed from the address bar so it is not bookmarked or shared by accident.
      if (qs && qs.get('preview') === '1') previewRibbon();
      // A code in the link always wins over a sign-in kept in this tab (a researcher previewing twice gets the new participant).
      if (linkCode) { store(tokenKey, null); store(panelKey, null); S.token = null; try { history.replaceState(null, '', location.pathname + (qs.get('preview') === '1' ? '?preview=1' : '')); } catch (e) {} return signIn(early.creds, early.p); }
      // Online panel (for example Prolific): the participant ID in the link signs them in, so there is no form to fill.
      // Signing in again with the same ID returns the same participant, so the link is always used.
      if (panelId) {
        embeddedFromUrl();   // keep the link's embedded data (for example STUDY_ID) for this tab, then take the ID out of the address bar
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        return signIn(early.creds, early.p);
      }
      if (S.token) refresh(early && !early.creds && early.token === S.token ? early.p : null); else showLogin();
    }
    var s = document.createElement('script'); s.src = '/lab/engine/types/' + c.type + '.js';
    s.onload = function () { logicReady.then(typeLoaded); };
    s.onerror = function () { show('<h1>' + esc(c.name) + '</h1>' + errorBox(ERR.network)); };
    document.head.appendChild(s);
  }, function () { show('<h1>Study not found</h1><p>Check the link you were given, or try again in a minute.</p>'); });
})();
