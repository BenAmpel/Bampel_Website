/* Security Alert Study (verification, Clark). Participant app.
   Server: /api/vc/*. Ground truth never reaches the browser.
   UI choices follow web-survey and process-tracing research; see static/lab/README.md ("Participant UI"). */
(function () {
  'use strict';

  // Consent text, survey questions, and screen text come from /api/vc/content, edited on the admin page.
  var CONFIG = { api: '/api/vc/' };

  var stage = document.getElementById('stage');
  var progress = document.getElementById('progress');
  var S = { token: null, plan: null, lab: null, content: null, deviceSent: {} };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- utilities ----------
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(ms) { return new Date(ms).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function post(route, body) {
    return fetch(CONFIG.api + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }, function () { return { error: 'server_error', _status: r.status }; }); },
            function () { return { error: 'network' }; });
  }
  // Retries once after a second on a dropped connection or a server hiccup. The server treats repeats
  // as no-ops (a re-sent answer is acknowledged, never overwritten).
  function api(route, body) {
    return post(route, body)
      .then(function (j) { return j.error === 'network' || j.error === 'server_error' || j.error === 'busy' ? new Promise(function (res) { setTimeout(res, 1000); }).then(function () { return post(route, body); }) : j; })
      .then(function (j) {
        if (j.error === 'expired' && route !== 'login') { store('vc_token', null); S.token = null; showLogin(ERR.expired); return new Promise(function () {}); }
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
  // Screen text from the study content. {placeholders} are filled from vars; blank lines split paragraphs.
  function T(key, vars) {
    var t = (S.content && S.content.text && S.content.text[key]) || '';
    return t.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : k === 'minutes' ? S.content.minutesPerSession : m; });
  }
  function linkify(h) { return h.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>'); }
  function Th(key, vars) { return esc(T(key, vars)); }
  function Tp(key, vars, cls) { return T(key, vars).split(/\n\s*\n/).map(function (x) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + linkify(esc(x.trim())) + '</p>'; }).join(''); }
  var uid = 0; function nextId(p) { return (p || 'id') + (++uid); }

  // ---------- form controls ----------
  // Single choice as large tap targets inside a fieldset (WCAG 1.3.1; Antoun et al. 2018).
  function choiceGroup(name, legend, opts, traceName) {
    return '<fieldset class="q-group" data-name="' + name + '"><legend class="q">' + legend + '</legend><div class="options">' + opts.map(function (o) {
      return '<label class="option" data-trace="' + (traceName || name) + ':' + esc(o[0]) + '"><input type="radio" name="' + name + '" value="' + esc(o[0]) + '"><span>' + o[1] + '</span></label>';
    }).join('') + '</div></fieldset>';
  }
  // Rating scale with every point labeled; horizontal on wide screens, stacked on phones (Krosnick &
  // Presser 2010; Tourangeau et al. 2007; Antoun et al. 2018).
  function scaleGroup(it) {
    var labels = it.labels && it.labels.length === it.n ? it.labels : null, cells = '';
    for (var i = 1; i <= it.n; i++) {
      var lab = labels ? labels[i - 1] : i === 1 ? it.lo : i === it.n ? it.hi : '';
      cells += '<label class="option scale-pt" data-trace="' + it.id + ':' + i + '"><input type="radio" name="' + it.id + '" value="' + i + '"><span class="pt-num">' + i + '</span>' +
        (lab ? '<span class="pt-lab">' + esc(lab) + '</span>' : '') + '</label>';
    }
    return '<fieldset class="q-group" data-name="' + it.id + '"><legend class="q">' + esc(it.text) + '</legend>' +
      '<div class="likert' + (labels ? ' labeled' : '') + '" style="--n:' + it.n + '">' + cells + '</div></fieldset>';
  }

  // Confidence: a click-anywhere line with no starting handle, so there is no default to anchor on
  // (Liu & Conrad 2019; Funke 2016). Works with keyboard (arrows, Page Up/Down, Home/End) and without
  // dragging (WCAG 2.5.7). The number appears once a point is chosen.
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

  // Wires inputs in root; onAnswer(name, value) fires on every change.
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
  }
  function flag(root, names, scroll) {
    root.querySelectorAll('.q-group').forEach(function (g) { g.classList.toggle('missing', names.indexOf(g.getAttribute('data-name')) >= 0); });
    var first = root.querySelector('.q-group.missing');
    if (first && scroll) first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  // ---------- sign-in: GSU email (pilot access codes also accepted) ----------
  function showLogin(msg, mode, email) {
    progress.textContent = '';
    if (mode === 'code') {
      show('<h1>' + Th('login_title') + '</h1><p>Enter your pilot access code.</p>' +
        '<form id="f" novalidate><label class="field" for="code">Access code</label><input type="text" id="code" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="VC-XXXX-XXXX">' +
        (msg ? errorBox(msg) : '') + '<div class="actions split"><button type="button" class="secondary" id="alt">Sign in with email</button><button type="submit">Continue</button></div></form>');
      document.getElementById('alt').addEventListener('click', function () { showLogin(); });
      document.getElementById('f').addEventListener('submit', function (e) {
        e.preventDefault();
        var code = document.getElementById('code').value.trim();
        if (code) signIn({ code: code });
      });
      return;
    }
    show('<h1>' + Th('login_title') + '</h1>' + Tp('login_intro') +
      '<form id="f" novalidate><label class="field" for="email">Email</label><input type="email" id="email" autocomplete="email" spellcheck="false" value="' + esc(email || '') + '"' + (msg ? ' aria-describedby="loginerr" aria-invalid="true"' : '') + '>' +
      (msg ? errorBox(msg, 'loginerr') : '') + '<div class="actions split"><button type="button" class="secondary" id="alt">I have an access code</button><button type="submit">Continue</button></div></form>');
    document.getElementById('alt').addEventListener('click', function () { showLogin(null, 'code'); });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = document.getElementById('email').value.trim();
      if (em) signIn({ email: em });
    });
  }

  // First sign-in only: the email links every week's sessions, so check it before creating the record.
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
      S.token = r.token; store('vc_token', r.token);
      if (!r.consented) return showConsent();
      showStatus(r.status);
    });
  }

  // Re-reads progress for the signed-in participant (after a reload or between screens).
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
    ok.addEventListener('click', function () {
      ok.disabled = true;
      api('consent', { token: S.token, agree: true }).then(function (r) { if (r.error) return showLogin(ERR[r.error] || ERR.server_error); refresh(); });
    });
    document.getElementById('decline').addEventListener('click', function () {
      api('consent', { token: S.token, agree: false }).then(function () { store('vc_token', null); show('<h1>' + Th('finished_title') + '</h1>' + Tp('decline_body')); });
    });
  }

  // ---------- status ----------
  // Honest progress across weeks: one dot per session (Villar et al. 2013; Conrad et al. 2010).
  function tracker(done, total, current) {
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
  function signOut() { store('vc_token', null); S.token = null; showLogin(); }

  // Add-to-calendar file for the next session (Dillman et al. 2014: lower the cost of coming back).
  function calendar(session, at) {
    var d = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var url = location.origin + location.pathname;
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CARE Lab//Security alert study//EN', 'BEGIN:VEVENT',
      'UID:vc-' + at + '-' + session + '@bampel.com', 'DTSTAMP:' + d(Date.now()), 'DTSTART:' + d(at), 'DTEND:' + d(at + S.content.minutesPerSession * 60000),
      'SUMMARY:' + T('login_title') + ': session ' + session, 'URL:' + url, 'DESCRIPTION:' + url, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'study-session-' + session + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- session ----------
  function startSession() {
    api('session', { token: S.token }).then(function (r) {
      if (r.error === 'not_yet' || r.error === 'finished') return refresh();
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      S.plan = r;
      if (!S.lab) {
        S.lab = TraceLab.create({ study: 'verification-v1', version: '2.0.0', sink: { type: 'local' }, mouseSampleMs: 50 });
        S.lab.start();
      }
      next();
    });
  }

  function next() {
    var p = S.plan;
    if (!p.preSurveyDone) return showPreSurvey();
    if (!p._instructed) return showInstructions();
    if (p.practice && !p.practiceDone) return runTrial(p.practice, p.practiceAI, 'practice');
    var t = p.trials.filter(function (x) { return !x.done; })[0];
    if (t) return runTrial(t.alert, t.ai, t.index);
    showPostSurvey();
  }

  function showInstructions() {
    var p = S.plan, mode = p.mode;
    var how = mode === 'ai_first' ? 'instr_ai_first' : mode === 'evidence_first' ? 'instr_evidence_first' : p.aiRemoved ? 'instr_ai_removed' : 'instr_none';
    progress.textContent = T('start_title', { session: p.session, total: S.content.sessions });
    show('<h1>' + Th('instr_title') + '</h1>' + Tp('instr_intro', { n: p.total }) + Tp(how) + Tp('instr_outro') +
      (p.practice && !p.practiceDone ? Tp('instr_practice') : '') +
      '<div class="actions"><button id="go">' + Th('begin_button') + '</button></div>');
    document.getElementById('go').addEventListener('click', function () { p._instructed = true; next(); });
  }

  // ---------- trial ----------
  function runTrial(alert, ai, index) {
    var p = S.plan, mode = ai ? p.mode : 'none';
    var isPractice = index === 'practice';
    var doneCount = p.trials.filter(function (x) { return x.done; }).length;
    progress.textContent = isPractice ? T('progress_practice') : T('progress_trial', { session: p.session, i: doneCount + 1, n: p.total });
    if (!isPractice) api('view', { token: S.token, session: p.session, index: index });   // a reload re-shows the trial; the server counts views
    var t0 = performance.now();
    var ms = function () { return Math.round(performance.now() - t0); };
    var opens = [], openNow = null, aiShownAtMs = null, answers = {}, initial = null, answerLog = [];

    // AI advice looks the same in every AI condition: same box, wording, and neutral styling; only its
    // timing differs (Buçinca et al. 2021; Fogliato et al. 2022).
    function aiBox() {
      if (!ai) return '';
      var v = ai.verdict === 'malicious' ? Th('label_malicious') : Th('label_benign');
      return '<section class="ai-box" data-trace="ai_box" aria-label="' + Th('ai_label') + '"><div class="label">' + Th('ai_label') + '</div><div class="verdict">' + v + ' · ' + Th('ai_confidence', { confidence: ai.confidence }) + '</div><p>' + esc(ai.rationale) + '</p></section>';
    }
    var aiAtTop = mode === 'ai_first' && ai;
    var twoStep = mode === 'evidence_first' && ai;
    // Answer order is fixed per participant and counterbalanced across participants (server-assigned).
    var answerOpts = (p.answerOrder || ['malicious', 'benign']).map(function (v) { return [v, Th(v === 'malicious' ? 'label_malicious' : 'label_benign')]; });
    var tabIds = alert.panels.map(function (x, i) { return 'tab-' + i; });

    // Evidence: click-to-reveal tabs (manual activation), one open at a time, order fixed per participant.
    show('<div class="alert-head"><h2>' + esc(alert.title) + '</h2><span class="sev">' + Th('severity_label') + ': ' + esc(alert.severity) + '</span></div>' +
      '<p class="summary" data-trace="summary">' + esc(alert.summary) + '</p>' +
      (aiAtTop ? aiBox() : '') +
      '<div class="evidence"><div class="tabs" role="tablist" aria-label="Evidence">' + alert.panels.map(function (x, i) {
        return '<button type="button" role="tab" id="' + tabIds[i] + '" aria-selected="false" aria-controls="pbody" tabindex="' + (i ? -1 : 0) + '" data-panel="' + esc(x.key) + '" data-trace="tab:' + esc(x.key) + '">' + esc(x.label) + '</button>';
      }).join('') + '</div><div class="panel-body" id="pbody" role="tabpanel" tabindex="0" data-trace="panel_body"><p class="placeholder">' + Th('evidence_placeholder') + '</p></div></div>' +
      (twoStep ?
        '<div class="step" id="step1">' + choiceGroup('initial_judgment', Th('q_initial'), answerOpts, 'initial') + vas('initial_confidence', Th('q_initial_conf')) +
        '<div class="actions"><button id="lock">' + Th('lock_button') + '</button></div></div><div id="step2" hidden></div>'
        : '<div class="step" id="step2"></div>'));

    var pbody = document.getElementById('pbody'), tabs = Array.prototype.slice.call(stage.querySelectorAll('[role=tab]'));
    function closePanel() {
      if (!openNow) return;
      if (openNow.hiddenAt != null) { openNow.hiddenMs += ms() - openNow.hiddenAt; openNow.hiddenAt = null; }
      openNow.dwellMs = Math.max(0, ms() - openNow.atMs - openNow.hiddenMs);   // time on screen, excluding a hidden tab
      openNow.afterAI = aiShownAtMs != null && openNow.atMs >= aiShownAtMs; delete openNow.hiddenAt; openNow = null;
    }
    function onVis() { if (!openNow) return; if (document.hidden) openNow.hiddenAt = ms(); else if (openNow.hiddenAt != null) { openNow.hiddenMs += ms() - openNow.hiddenAt; openNow.hiddenAt = null; } }
    document.addEventListener('visibilitychange', onVis);
    function openTab(b) {
      var key = b.getAttribute('data-panel');
      if (openNow && openNow.panel === key) return;
      closePanel();
      tabs.forEach(function (x) { var on = x === b; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
      var panel = alert.panels.filter(function (x) { return x.key === key; })[0];
      pbody.setAttribute('aria-labelledby', b.id);
      pbody.innerHTML = '<p>' + esc(panel.text) + '</p>';
      openNow = { panel: key, atMs: ms(), hiddenMs: 0, hiddenAt: null }; opens.push(openNow);
    }
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { openTab(b); });
      // Arrow keys move between tabs; Enter/Space opens (manual activation keeps reveals deliberate).
      b.addEventListener('keydown', function (e) {
        var j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (j == null) return;
        e.preventDefault(); j = (j + tabs.length) % tabs.length; tabs[j].focus();
      });
    });

    function finalBlock() {
      var opts = alert.panels.map(function (x) { return [x.key, esc(x.label)]; }).concat([['summary', Th('infl_summary')]]).concat(ai ? [['ai', Th('infl_ai')]] : []);
      return choiceGroup('final_judgment', Th(twoStep ? 'q_final_two' : 'q_final'), answerOpts, 'final') + vas('final_confidence', Th('q_conf')) +
        '<fieldset class="q-group" data-name="influential"><legend class="q">' + Th('q_influence') + '</legend><div class="checks">' +
        opts.map(function (o) { return '<label class="option" data-trace="infl:' + esc(o[0]) + '"><input type="checkbox" name="influential" value="' + esc(o[0]) + '"><span>' + o[1] + '</span></label>'; }).join('') + '</div></fieldset>' +
        '<div id="trialmsg"></div><div class="actions"><button id="submit">' + Th(isPractice ? 'practice_submit' : 'submit_button') + '</button></div>';
    }

    if (S.lab) { S.lab.events.length = 0; S.lab.beginItem(isPractice ? 'practice' : 't' + index, stage); }
    if (aiAtTop) aiShownAtMs = 0;

    function record(name, value) { answers[name] = value; answerLog.push({ atMs: ms(), name: name, value: value }); if (S.lab) S.lab.recordAnswer(name, value); }
    function missingOf(names) { return names.filter(function (n) { var v = answers[n]; return v == null || v === '' || (Array.isArray(v) && !v.length); }); }

    function mountFinal() {
      var step2 = document.getElementById('step2');
      step2.hidden = false;
      step2.innerHTML = (twoStep ? aiBox() : '') + finalBlock();
      var need = ['final_judgment', 'final_confidence', 'influential'];
      wire(step2, function (n, v) {
        record(n, v);
        if (step2.querySelector('.missing')) { var m = missingOf(need); flag(step2, m); if (!m.length) document.getElementById('trialmsg').innerHTML = ''; }
      });
      var submit = document.getElementById('submit');
      // Trial answers are required (they are the task). The button explains what is missing rather than
      // sitting disabled (WCAG 3.3.1).
      submit.addEventListener('click', function () {
        var miss = missingOf(need);
        if (miss.length) { flag(step2, miss, true); document.getElementById('trialmsg').innerHTML = errorBox(miss.length === 1 && miss[0] === 'final_confidence' ? T('conf_needed') : T('required_prompt')); return; }
        document.getElementById('trialmsg').innerHTML = '';
        submit.disabled = true; closePanel(); document.removeEventListener('visibilitychange', onVis);
        var feats = S.lab ? S.lab.endItem({ final: answers.final_judgment }) : null;
        var raw = S.lab ? S.lab.events.splice(0) : [];
        var data = {
          mode: mode, aiShownAtMs: aiShownAtMs, initial: initial,
          final: { judgment: answers.final_judgment, confidence: answers.final_confidence, influential: answers.influential, rtMs: ms() },
          evidence: { opens: opens }, answerLog: answerLog,
          traces: feats ? feats.features : null, rawEvents: raw,
          viewport: { w: window.innerWidth, h: window.innerHeight }
        };
        if (S.lab && !S.deviceSent[p.session] && !isPractice) { data.device = S.lab.device; S.deviceSent[p.session] = true; }
        api('trial', { token: S.token, session: p.session, index: index, data: data }).then(function (r) {
          if (r.error) { submit.disabled = false; document.getElementById('trialmsg').innerHTML = errorBox(ERR[r.error] || ERR.server_error); return; }
          if (isPractice) { p.practiceDone = true; return showPracticeDone(); }
          p.trials.forEach(function (x) { if (x.index === index) x.done = true; });
          next();
        });
      });
    }

    if (twoStep) {
      var step1 = document.getElementById('step1'), lock = document.getElementById('lock'), need1 = ['initial_judgment', 'initial_confidence'];
      wire(step1, function (n, v) {
        record(n, v);
        if (step1.querySelector('.missing')) { var m = missingOf(need1); flag(step1, m); if (!m.length) { var e = step1.querySelector('.error'); if (e) e.remove(); } }
      });
      lock.addEventListener('click', function () {
        var miss = missingOf(need1);
        if (miss.length) { flag(step1, miss, true); if (!step1.querySelector('.error')) lock.parentNode.insertAdjacentHTML('beforebegin', errorBox(T('required_prompt'))); return; }
        initial = { judgment: answers.initial_judgment, confidence: answers.initial_confidence, rtMs: ms() };
        step1.classList.add('locked');
        step1.querySelectorAll('input').forEach(function (x) { x.disabled = true; });
        step1.querySelectorAll('.vas').forEach(function (x) { x.setAttribute('aria-disabled', 'true'); x.tabIndex = -1; });
        var err = step1.querySelector('.error'); if (err) err.remove();
        lock.parentNode.remove();
        aiShownAtMs = ms(); if (S.lab) S.lab.recordAnswer('ai_shown', true);
        mountFinal();
        var s2 = document.getElementById('step2');
        s2.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        var box = s2.querySelector('.ai-box'); if (box) { box.setAttribute('tabindex', '-1'); box.focus({ preventScroll: true }); }
      });
    } else {
      mountFinal();
    }
  }

  function showPracticeDone() {
    show('<h1>' + Th('practice_done_title') + '</h1>' + Tp('practice_done_body') + '<div class="actions"><button id="go">' + Th('practice_done_button') + '</button></div>');
    document.getElementById('go').addEventListener('click', next);
  }

  // ---------- surveys (items come from the session plan) ----------
  // One question per row, no grids; radio buttons, not dropdowns, for short lists; a soft reminder for
  // skipped questions instead of forced answers (Couper et al. 2013; Roßmann et al. 2018; Couper et al.
  // 2004; de Leeuw et al. 2016; Sischka et al. 2022).
  function itemHtml(it) {
    if (it.type === 'scale') return scaleGroup(it);
    if (it.type === 'choice' || (it.type === 'select' && it.options.length <= 10)) return choiceGroup(it.id, esc(it.text), it.options.map(function (o) { return [o.value, esc(o.label)]; }));
    if (it.type === 'select') {
      var sid = nextId('sel');
      return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + sid + '">' + esc(it.text) + '</label><select id="' + sid + '" name="' + it.id + '"><option value="">Select…</option>' +
        it.options.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') + '</select></div>';
    }
    var tid = nextId('txt');
    return '<div class="q-group" data-name="' + it.id + '"><label class="q" for="' + tid + '">' + esc(it.text) + '</label><textarea id="' + tid + '" name="' + it.id + '" data-trace="text:' + it.id + '"></textarea></div>';
  }
  function surveyPage(title, items, kind) {
    if (!items.length) return submitSurvey({}, kind, null);
    progress.textContent = T('start_title', { session: S.plan.session, total: S.content.sessions });
    show('<h1>' + esc(title) + '</h1>' + items.map(itemHtml).join('') + '<div id="surveymsg"></div><div class="actions"><button id="go">' + Th('continue_button') + '</button></div>');
    var ans = {}, go = document.getElementById('go'), prompted = false;
    var ids = items.map(function (i) { return i.id; });
    var blank = function (list) { return list.filter(function (k) { return ans[k] == null || String(ans[k]).trim() === ''; }); };
    wire(stage, function (n, v) {
      ans[n] = v;
      if (stage.querySelector('.missing')) { var m = blank(ids); flag(stage, m); if (!m.length) document.getElementById('surveymsg').innerHTML = ''; }
    });
    go.addEventListener('click', function () {
      var hard = blank(items.filter(function (i) { return i.required; }).map(function (i) { return i.id; }));
      var soft = blank(items.filter(function (i) { return !i.required; }).map(function (i) { return i.id; }));
      var msg = document.getElementById('surveymsg');
      if (hard.length) { flag(stage, hard, true); msg.innerHTML = errorBox(T('required_prompt')); return; }
      if (soft.length && !prompted) {
        prompted = true; flag(stage, soft, true);
        msg.innerHTML = '<div class="soft" role="alert"><p>' + Th('skip_prompt', { n: soft.length }) + '</p></div>';
        go.textContent = T('skip_continue');
        return;
      }
      go.disabled = true; submitSurvey(ans, kind, go);
    });
  }
  function submitSurvey(ans, kind, go) {
    api('survey', { token: S.token, session: S.plan.session, kind: kind, data: ans }).then(function (r) {
      if (r.error) { if (go) go.disabled = false; var m = document.getElementById('surveymsg'); if (m) m.innerHTML = errorBox(ERR[r.error] || ERR.server_error); return; }
      if (kind === 'pre') { S.plan.preSurveyDone = true; return next(); }
      showDone(r.status);
    });
  }
  function showPreSurvey() { surveyPage(T('pre_title'), S.plan.preItems || [], 'pre'); }
  function showPostSurvey() { surveyPage(T('post_title'), S.plan.postItems || [], 'post'); }

  function showDone(st) {
    progress.textContent = '';
    S.lab = null;
    if (st && st.finished) return showFinished(st);
    show('<h1>' + Th('done_title') + '</h1>' + (st ? tracker(st.completed, st.total, 0) : '') + Tp('done_body') +
      (st && st.availableAt ? Tp('done_next', { date: fmtDate(st.availableAt) }) : '') +
      '<div class="actions split"><button class="secondary" id="out">' + Th('sign_out') + '</button>' + (st && st.availableAt ? '<button class="secondary" id="cal">' + Th('calendar_button') + '</button>' : '') + '</div>');
    document.getElementById('out').addEventListener('click', signOut);
    var cal = document.getElementById('cal'); if (cal) cal.addEventListener('click', function () { calendar(st.nextSession, st.availableAt); });
  }

  // ---------- boot ----------
  fetch(CONFIG.api + 'content', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
    S.content = c;
    S.token = store('vc_token');
    if (S.token) refresh(); else showLogin();
  }, function () { show('<h1>Security alert study</h1>' + errorBox(ERR.network)); });
})();
