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
  var tokenKey = 'lab_token_' + studyId;

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
  function api(route, body) {
    return post(route, body)
      .then(function (j) { return j.error === 'network' || j.error === 'server_error' || j.error === 'busy' ? new Promise(function (res) { setTimeout(res, 1000); }).then(function () { return post(route, body); }) : j; })
      .then(function (j) {
        if (j.error === 'expired' && route !== 'login') { store(tokenKey, null); S.token = null; showLogin(ERR.expired); return new Promise(function () {}); }
        return j;
      });
  }
  // Every screen change moves keyboard and screen-reader focus to the new heading (WCAG 2.4.3).
  function show(html) {
    stage.innerHTML = html;
    window.scrollTo(0, 0);
    var h = stage.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
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
  function T(key, vars) {
    var t = (S.content && S.content.text && S.content.text[key]) || '';
    return t.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : k === 'minutes' ? S.content.minutesPerSession : m; });
  }
  function linkify(h) { return h.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>'); }
  function Th(key, vars) { return esc(T(key, vars)); }
  function Tp(key, vars, cls) { return T(key, vars).split(/\n\s*\n/).map(function (x) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + linkify(esc(x.trim())) + '</p>'; }).join(''); }
  var uid = 0; function nextId(p) { return (p || 'id') + (++uid); }

  // ---------- question components ----------
  // Single choice as large tap targets in a fieldset (WCAG 1.3.1; Antoun et al. 2018).
  function choiceGroup(name, legend, opts, traceName) {
    return '<fieldset class="q-group" data-name="' + name + '"><legend class="q">' + legend + '</legend><div class="options">' + opts.map(function (o) {
      return '<label class="option" data-trace="' + (traceName || name) + ':' + esc(o[0]) + '"><input type="radio" name="' + name + '" value="' + esc(o[0]) + '"><span>' + o[1] + '</span></label>';
    }).join('') + '</div></fieldset>';
  }
  // Rating scale with every point labeled; one row on wide screens, stacked on phones (Krosnick &
  // Presser 2010; Tourangeau et al. 2007; Antoun et al. 2018).
  function scaleGroup(it) {
    var labels = it.labels && it.labels.length === it.n ? it.labels : null, cells = '';
    for (var i = 1; i <= it.n; i++) {
      var lab = labels ? labels[i - 1] : i === 1 ? it.lo : i === it.n ? it.hi : '';
      cells += '<label class="option scale-pt" data-trace="' + it.id + ':' + i + '"><input type="radio" name="' + it.id + '" value="' + i + '"><span class="pt-num">' + i + '</span>' + (lab ? '<span class="pt-lab">' + esc(lab) + '</span>' : '') + '</label>';
    }
    return '<fieldset class="q-group" data-name="' + it.id + '"><legend class="q">' + esc(it.text) + '</legend><div class="likert' + (labels ? ' labeled' : '') + '" style="--n:' + it.n + '">' + cells + '</div></fieldset>';
  }
  // Confidence line: click anywhere, no starting handle (no default to anchor on: Liu & Conrad 2019;
  // Funke 2016); keyboard arrows, Page Up/Down, Home/End; no dragging required (WCAG 2.5.7).
  function vas(name, legend) {
    return '<fieldset class="q-group" data-name="' + name + '"><legend class="q">' + legend + '</legend>' +
      '<div class="vas" data-name="' + name + '" data-trace="' + name + '" role="slider" tabindex="0" aria-label="' + legend + '" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Not set">' +
      '<div class="vas-track"><div class="vas-fill"></div><div class="vas-thumb" hidden></div></div>' +
      '<div class="vas-ends"><span>' + Th('conf_low') + '</span><output class="vas-val" aria-hidden="true">–</output><span>' + Th('conf_high') + '</span></div></div>' +
      '<p class="muted help">' + Th('conf_help') + '</p></fieldset>';
  }
  function wireVas(el, onAnswer) {
    var track = el.querySelector('.vas-track'), thumb = el.querySelector('.vas-thumb'), fill = el.querySelector('.vas-fill'), out = el.querySelector('.vas-val');
    var val = null, dragging = false;
    function set(v, commit) {
      v = Math.max(0, Math.min(100, Math.round(v)));
      var changed = v !== val; val = v;
      thumb.hidden = false; thumb.style.left = v + '%'; fill.style.width = v + '%'; out.textContent = v;
      el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', String(v)); el.classList.add('set');
      if (commit && changed) onAnswer(el.getAttribute('data-name'), v);
    }
    function fromEvent(e) { var r = track.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; }
    el.addEventListener('pointerdown', function (e) {
      if (el.getAttribute('aria-disabled') === 'true' || (e.button && e.button !== 0)) return;
      dragging = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} set(fromEvent(e), false); el.focus({ preventScroll: true }); e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) { if (dragging) set(fromEvent(e), false); });
    function end() { if (!dragging) return; dragging = false; if (val != null) onAnswer(el.getAttribute('data-name'), val); }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', function (e) {
      if (el.getAttribute('aria-disabled') === 'true') return;
      var step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (step == null && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      var base = val == null ? 50 : val;   // keyboard users start from the middle
      set(e.key === 'Home' ? 0 : e.key === 'End' ? 100 : base + (val == null ? 0 : step), true);
    });
  }
  // Any question from a study's content (surveys, or a type's per-item questions). Radio buttons, not
  // dropdowns, for short lists (Couper et al. 2004).
  function questionHtml(it) {
    if (it.type === 'scale') return scaleGroup(it);
    if (it.type === 'confidence') return vas(it.id, esc(it.text));
    if (it.type === 'choice' || (it.type === 'select' && it.options.length <= 10)) return choiceGroup(it.id, esc(it.text), it.options.map(function (o) { return [o.value, esc(o.label)]; }));
    if (it.type === 'multi') {
      return '<fieldset class="q-group" data-name="' + it.id + '"><legend class="q">' + esc(it.text) + '</legend><div class="checks">' + it.options.map(function (o) {
        return '<label class="option" data-trace="' + it.id + ':' + esc(o.value) + '"><input type="checkbox" name="' + it.id + '" value="' + esc(o.value) + '"><span>' + esc(o.label) + '</span></label>';
      }).join('') + '</div></fieldset>';
    }
    if (it.type === 'number') {
      var nid = nextId('num');
      return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + nid + '">' + esc(it.text) + '</label><input type="text" id="' + nid + '" class="num" name="' + it.id + '" inputmode="decimal" autocomplete="off" data-trace="num:' + it.id + '"></div>';
    }
    if (it.type === 'select') {
      var sid = nextId('sel');
      return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + sid + '">' + esc(it.text) + '</label><select id="' + sid + '" name="' + it.id + '"><option value="">Select…</option>' +
        it.options.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') + '</select></div>';
    }
    var tid = nextId('txt');
    return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + tid + '">' + esc(it.text) + '</label><textarea id="' + tid + '" name="' + it.id + '" data-trace="text:' + it.id + '"></textarea></div>';
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
    root.querySelectorAll('select').forEach(function (s) { s.addEventListener('change', function () { onAnswer(s.name, s.value); }); });
    root.querySelectorAll('textarea').forEach(function (t) { t.addEventListener('input', function () { onAnswer(t.name, t.value); }); });
    root.querySelectorAll('input.num').forEach(function (t) { t.addEventListener('input', function () { onAnswer(t.name, t.value); }); });
  }
  function flag(root, names, scroll) {
    root.querySelectorAll('.q-group').forEach(function (g) { g.classList.toggle('missing', names.indexOf(g.getAttribute('data-name')) >= 0); });
    var first = root.querySelector('.q-group.missing');
    if (first && scroll) first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }
  function blank(answers, ids) { return ids.filter(function (k) { var v = answers[k]; return v == null || String(v).trim() === '' || (Array.isArray(v) && !v.length); }); }
  // A question set with hard-required items and one gentle reminder for skipped optional ones
  // (de Leeuw et al. 2016; Sischka et al. 2022). Returns { answers, check() -> true when ready }.
  function questionSet(root, items, msgEl, button, onAnswer) {
    var answers = {}, prompted = false, ids = items.map(function (i) { return i.id; });
    wire(root, function (n, v) {
      answers[n] = v; if (onAnswer) onAnswer(n, v);
      if (root.querySelector('.missing')) { var m = blank(answers, ids); flag(root, m); if (!m.length) msgEl.innerHTML = ''; }
    });
    return {
      answers: answers,
      check: function () {
        var hard = blank(answers, items.filter(function (i) { return i.required; }).map(function (i) { return i.id; }));
        var soft = blank(answers, items.filter(function (i) { return !i.required; }).map(function (i) { return i.id; }));
        var badNum = items.filter(function (i) { var v = answers[i.id]; return i.type === 'number' && v != null && String(v).trim() !== '' && !isFinite(Number(String(v).replace(/,/g, ''))); }).map(function (i) { return i.id; });
        if (badNum.length) { flag(root, badNum, true); msgEl.innerHTML = errorBox(T('number_invalid')); return false; }
        if (hard.length) { flag(root, hard, true); msgEl.innerHTML = errorBox(hard.length === 1 && items.filter(function (i) { return i.id === hard[0]; })[0].type === 'confidence' ? T('conf_needed') : T('required_prompt')); return false; }
        if (soft.length && !prompted) {
          prompted = true; flag(root, soft, true);
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
  function loginError(r) {
    if (r.error === 'not_enrolled' && r.domains && r.domains.length) return 'That email can\'t be used for this study. Use an email address ending in @' + r.domains.join(' or @') + '.';
    return ERR[r.error] || ERR.server_error;
  }
  function signIn(creds) {
    api('login', creds).then(function (r) {
      if (r.error === 'confirm_new') return showConfirm(r.email || creds.email);
      if (r.error) return showLogin(loginError(r), creds.email != null ? 'email' : 'code', creds.email);
      S.token = r.token; store(tokenKey, r.token);
      if (!r.consented) return showConsent();
      showStatus(r.status);
    });
  }
  function refresh() {
    api('resume', { token: S.token }).then(function (r) {
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      if (!r.consented) return showConsent();
      showStatus(r.status);
    });
  }

  // ---------- consent ----------
  function para(text) { return linkify(esc(String(text).replace(/\{minutes\}/g, S.content.minutesPerSession))); }
  function showConsent() {
    progress.textContent = '';
    var c = S.content.consent;
    show((c.approved ? '' : '<div class="banner" role="note">Draft consent text, pending IRB approval. Do not enroll participants with this version.</div>') +
      '<h1>' + Th('consent_title') + '</h1>' + c.paragraphs.map(function (x) { return '<p>' + para(x) + '</p>'; }).join('') +
      '<label class="option agree"><input type="checkbox" id="agree"><span>' + esc(c.agreeLabel) + '</span></label>' +
      '<div class="actions split"><button class="secondary" id="decline">I do not agree</button><button id="ok" disabled>Continue</button></div>');
    var agree = document.getElementById('agree'), ok = document.getElementById('ok');
    agree.addEventListener('change', function () { ok.disabled = !agree.checked; });
    ok.addEventListener('click', function () { ok.disabled = true; api('consent', { token: S.token, agree: true }).then(function (r) { if (r.error) return showLogin(ERR[r.error] || ERR.server_error); refresh(); }); });
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
  function showStatus(st) {
    progress.textContent = '';
    if (st.finished) return showFinished(st);
    var done = st.completed ? Tp('progress_done', { completed: st.completed, total: st.total }) : '';
    var out = '<button class="secondary" id="out">' + Th('sign_out') + '</button>';
    if (!st.available) {
      show('<h1>' + Th('wait_title') + '</h1>' + tracker(st.completed, st.total, st.nextSession) + done + Tp('wait_body', { session: st.nextSession, date: fmtDate(st.availableAt) }) +
        '<div class="actions split">' + out + '<button class="secondary" id="cal">' + Th('calendar_button') + '</button></div>');
      document.getElementById('cal').addEventListener('click', function () { calendar(st.nextSession, st.availableAt); });
    } else {
      show('<h1>' + Th('start_title', { session: st.nextSession, total: st.total }) + '</h1>' + tracker(st.completed, st.total, st.nextSession) + done + Tp('start_body') +
        '<div class="actions split">' + out + '<button id="go">' + Th('start_button', { session: st.nextSession }) + '</button></div>');
      document.getElementById('go').addEventListener('click', function () { this.disabled = true; startSession(); });
    }
    document.getElementById('out').addEventListener('click', signOut);
  }
  function showFinished(st) {
    progress.textContent = '';
    show('<h1>' + Th('finished_title') + '</h1>' + (st && st.total ? tracker(st.total, st.total, 0) : '') + Tp('finished_body') + '<div class="actions"><button class="secondary" id="out">' + Th('sign_out') + '</button></div>');
    document.getElementById('out').addEventListener('click', signOut);
  }
  function signOut() { store(tokenKey, null); S.token = null; showLogin(); }
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
  function startSession() {
    api('session', { token: S.token }).then(function (r) {
      if (r.error === 'not_yet' || r.error === 'finished') return refresh();
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      S.plan = r;
      if (!S.lab && window.TraceLab) { S.lab = TraceLab.create({ study: studyId, version: '3.0.0', sink: { type: 'local' }, mouseSampleMs: 50 }); S.lab.start(); }
      next();
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
    progress.textContent = T('start_title', { session: p.session, total: S.content.sessions });
    show('<h1>' + Th('instr_title') + '</h1>' + Tp('instr_intro', { n: p.total }) + extra + (p.practice && !p.practiceDone ? Tp('instr_practice') : '') +
      '<div class="actions"><button id="go">' + Th('begin_button') + '</button></div>');
    document.getElementById('go').addEventListener('click', function () { p._instructed = true; next(); });
  }

  // One item screen. The type renders it and calls ctx.submit(fields); the engine adds behavior traces,
  // raw events, viewport, and device, saves it, and moves on.
  function runTrial(trial, index) {
    var p = S.plan, isPractice = index === 'practice';
    var doneCount = p.trials.filter(function (x) { return x.done; }).length;
    progress.textContent = isPractice ? T('progress_practice') : T('progress_trial', { session: p.session, i: doneCount + 1, n: p.total });
    if (!isPractice) api('view', { token: S.token, session: p.session, index: index });   // a reload re-shows it; the server counts views
    var t0 = performance.now(), answerLog = [];
    if (S.lab) { S.lab.events.length = 0; S.lab.beginItem(isPractice ? 'practice' : 't' + index, stage); }
    var ctx = {
      trial: trial, index: index, isPractice: isPractice, plan: p, content: S.content,
      ms: function () { return Math.round(performance.now() - t0); },
      record: function (name, value) { answerLog.push({ atMs: ctx.ms(), name: name, value: value }); if (S.lab) S.lab.recordAnswer(name, value); },
      submit: function (fields, onError) {
        var feats = S.lab ? S.lab.endItem({}) : null, raw = S.lab ? S.lab.events.splice(0) : [];
        var data = Object.assign({}, fields, { answerLog: answerLog, traces: feats ? feats.features : null, rawEvents: raw, viewport: { w: window.innerWidth, h: window.innerHeight } });
        if (S.lab && !S.deviceSent[p.session] && !isPractice) { data.device = S.lab.device; S.deviceSent[p.session] = true; }
        api('trial', { token: S.token, session: p.session, index: index, data: data }).then(function (r) {
          if (r.error) { if (S.lab) S.lab.beginItem(isPractice ? 'practice' : 't' + index, stage); return onError && onError(ERR[r.error] || ERR.server_error); }
          if (isPractice) { p.practiceDone = true; return showPracticeDone(); }
          p.trials.forEach(function (x) { if (x.index === index) x.done = true; });
          next();
        });
      }
    };
    S.type.runTrial(ctx, ui);
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
    // pages are kept in this tab (sessionStorage) so a reload part-way through does not lose them.
    var pages = [], byPage = {}, all = {}, idx = 0, saveKey = 'lab_sv_' + studyId + '_s' + S.plan.session + '_' + kind;
    items.forEach(function (it) { var k = it.page || 1; if (!byPage[k]) { byPage[k] = []; pages.push(k); } byPage[k].push(it); });
    pages.sort(function (a, b) { return a - b; });
    try { var kept = JSON.parse(store(saveKey) || 'null'); if (kept && kept.all && kept.idx < pages.length) { all = kept.all; idx = kept.idx; } } catch (e) {}
    S.survey = { key: saveKey };
    function showPage() {
      var list = byPage[pages[idx]], last = idx === pages.length - 1;
      progress.textContent = T('start_title', { session: S.plan.session, total: S.content.sessions }) + (pages.length > 1 ? ' · ' + T('survey_page', { i: idx + 1, n: pages.length }) : '');
      show('<h1>' + esc(title) + '</h1>' + list.map(questionHtml).join('') + '<div id="surveymsg"></div><div class="actions"><button id="go">' + Th('continue_button') + '</button></div>');
      var go = document.getElementById('go'), qs = questionSet(stage, list, document.getElementById('surveymsg'), go);
      go.addEventListener('click', function () {
        if (!qs.check()) return;
        Object.keys(qs.answers).forEach(function (k) { all[k] = qs.answers[k]; });
        if (!last) { idx++; store(saveKey, JSON.stringify({ all: all, idx: idx })); return showPage(); }
        go.disabled = true; submitSurvey(all, kind, go);
      });
    }
    showPage();
  }
  function submitSurvey(ans, kind, go) {
    api('survey', { token: S.token, session: S.plan.session, kind: kind, data: ans }).then(function (r) {
      if (r.error) { if (go) go.disabled = false; var m = document.getElementById('surveymsg'); if (m) m.innerHTML = errorBox(ERR[r.error] || ERR.server_error); return; }
      if (S.survey && S.survey.key) store(S.survey.key, null);
      if (kind === 'pre') { S.plan.preSurveyDone = true; return next(); }
      showDone(r.status);
    });
  }
  function showDone(st) {
    progress.textContent = ''; S.lab = null;
    if (st && st.finished) return showFinished(st);
    show('<h1>' + Th('done_title') + '</h1>' + (st ? tracker(st.completed, st.total, 0) : '') + Tp('done_body') + (st && st.availableAt ? Tp('done_next', { date: fmtDate(st.availableAt) }) : '') +
      '<div class="actions split"><button class="secondary" id="out">' + Th('sign_out') + '</button>' + (st && st.availableAt ? '<button class="secondary" id="cal">' + Th('calendar_button') + '</button>' : '') + '</div>');
    document.getElementById('out').addEventListener('click', signOut);
    var cal = document.getElementById('cal'); if (cal) cal.addEventListener('click', function () { calendar(st.nextSession, st.availableAt); });
  }

  // ---------- what study types get ----------
  var ui = { esc: esc, T: T, Th: Th, Tp: Tp, show: show, errorBox: errorBox, choiceGroup: choiceGroup, scaleGroup: scaleGroup, vas: vas, questionHtml: questionHtml,
    wire: wire, flag: flag, blank: blank, questionSet: questionSet, nextId: nextId, reduceMotion: reduceMotion, stage: stage };
  window.LabEngine = { registerType: function (id, impl) { types[id] = impl; }, ui: ui };

  // ---------- boot ----------
  if (!studyId) { show('<h1>Study not found</h1><p>Check the link you were given.</p>'); return; }
  fetch(API + 'content', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (c) {
    S.content = c;
    document.title = c.text.login_title || c.name || 'Research study';
    var s = document.createElement('script'); s.src = '/lab/engine/types/' + c.type + '.js';
    s.onload = function () {
      S.type = types[c.type];
      if (!S.type) return show('<h1>' + esc(c.name) + '</h1>' + errorBox(ERR.server_error));
      S.token = store(tokenKey);
      if (S.token) refresh(); else showLogin();
    };
    s.onerror = function () { show('<h1>' + esc(c.name) + '</h1>' + errorBox(ERR.network)); };
    document.head.appendChild(s);
  }, function () { show('<h1>Study not found</h1><p>Check the link you were given, or try again in a minute.</p>'); });
})();
