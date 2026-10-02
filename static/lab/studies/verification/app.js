/* Security Alert Study (verification collapse, Clark). Participant app.
   Server: /api/vc/*. Ground truth never reaches the browser. */
(function () {
  'use strict';

  // Consent text, survey questions, and session length come from /api/vc/content,
  // which the research team edits on the admin page.
  var CONFIG = { api: '/api/vc/' };

  var stage = document.getElementById('stage');
  var progress = document.getElementById('progress');
  var S = { token: null, plan: null, lab: null, content: null };

  // ---------- utilities ----------
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(ms) { return new Date(ms).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function api(route, body) {
    return fetch(CONFIG.api + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }, function () { return { error: 'server_error', _status: r.status }; }); },
            function () { return { error: 'network' }; })
      .then(function (j) {
        if (j.error === 'expired' && route !== 'login') { store('vc_token', null); S.token = null; showLogin(ERR.expired); return new Promise(function () {}); }
        return j;
      });
  }
  function show(html) { stage.innerHTML = html; window.scrollTo(0, 0); }
  function errorBox(msg) { return '<p class="error" role="alert">' + esc(msg) + '</p>'; }
  // Screen text from the study content. {placeholders} are filled from vars; blank lines split paragraphs.
  function T(key, vars) {
    var t = (S.content && S.content.text && S.content.text[key]) || '';
    return t.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : k === 'minutes' ? S.content.minutesPerSession : m; });
  }
  function linkify(h) { return h.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>'); }
  function Th(key, vars) { return esc(T(key, vars)); }
  function Tp(key, vars, cls) { return T(key, vars).split(/\n\s*\n/).map(function (x) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + linkify(esc(x.trim())) + '</p>'; }).join(''); }
  var ERR = {
    invalid_code: 'That access code was not recognized. Check it and try again.',
    not_enrolled: 'That email can\'t be used for this study. Contact the research team if you think this is a mistake.',
    expired: 'Your sign-in expired. Sign in again to pick up where you left off.',
    network: 'Could not reach the study server. Check your connection and try again.',
    server_error: 'Something went wrong on our end. Please try again in a minute.',
    wrong_session: 'This session is no longer active. Reload the page to continue.'
  };

  function slider(name, label) {
    return '<p class="q">' + label + '</p><div class="slider-row"><input type="range" min="0" max="100" step="1" value="50" name="' + name + '" aria-label="' + esc(label) + '"><span class="slider-val">50</span></div>' +
      '<p class="muted">' + Th('conf_help') + '</p>';
  }
  function radios(name, opts, traceName) {
    return '<div class="options">' + opts.map(function (o) {
      return '<label class="option" data-trace="' + (traceName || name) + ':' + o[0] + '"><input type="radio" name="' + name + '" value="' + o[0] + '"> ' + o[1] + '</label>';
    }).join('') + '</div>';
  }
  function scale(name, lo, hi, n) {
    var cells = '';
    for (var i = 1; i <= n; i++) cells += '<label class="option" data-trace="' + name + ':' + i + '"><input type="radio" name="' + name + '" value="' + i + '"> ' + i + '</label>';
    return '<div class="likert" style="grid-template-columns:repeat(' + n + ',1fr)">' + cells + '</div><p class="muted" style="display:flex;justify-content:space-between"><span>' + lo + '</span><span>' + hi + '</span></p>';
  }
  // Wires inputs in root; onAnswer(name, value) fires on every change. Sliders count when touched.
  function wire(root, onAnswer) {
    root.querySelectorAll('input[type=radio]').forEach(function (r) { r.addEventListener('change', function () { onAnswer(r.name, r.value); }); });
    root.querySelectorAll('input[type=checkbox]').forEach(function (c) {
      c.addEventListener('change', function () {
        var vals = Array.prototype.filter.call(root.querySelectorAll('input[type=checkbox][name="' + c.name + '"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
        onAnswer(c.name, vals);
      });
    });
    root.querySelectorAll('input[type=range]').forEach(function (s) {
      var out = s.parentNode.querySelector('.slider-val'); var last = null;
      s.addEventListener('input', function () { out.textContent = s.value; });
      function commit() { var v = Number(s.value); if (v === last) return; last = v; onAnswer(s.name, v); }
      s.addEventListener('change', commit); s.addEventListener('pointerup', commit); s.addEventListener('keyup', commit);
    });
    root.querySelectorAll('select').forEach(function (s) { s.addEventListener('change', function () { onAnswer(s.name, s.value); }); });
    root.querySelectorAll('textarea').forEach(function (t) { t.addEventListener('input', function () { onAnswer(t.name, t.value); }); });
  }

  // ---------- sign-in: GSU email (pilot access codes also accepted) ----------
  function showLogin(msg, mode, email) {
    progress.textContent = '';
    if (mode === 'code') {
      show('<h1>' + Th('login_title') + '</h1><p>Enter your pilot access code.</p>' +
        '<form id="f"><input type="text" id="code" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="VC-XXXX-XXXX" aria-label="Access code">' +
        (msg ? errorBox(msg) : '') + '<div class="actions" style="justify-content:space-between"><button type="button" class="secondary" id="alt">Sign in with email</button><button type="submit">Continue</button></div></form>');
      document.getElementById('alt').addEventListener('click', function () { showLogin(); });
      document.getElementById('f').addEventListener('submit', function (e) {
        e.preventDefault();
        var code = document.getElementById('code').value.trim();
        if (code) signIn({ code: code });
      });
      return;
    }
    show('<h1>' + Th('login_title') + '</h1>' + Tp('login_intro') +
      '<form id="f"><label class="field">Email<input type="email" id="email" autocomplete="email" spellcheck="false" value="' + esc(email || '') + '"></label>' +
      (msg ? errorBox(msg) : '') + '<div class="actions" style="justify-content:space-between"><button type="button" class="secondary" id="alt">I have an access code</button><button type="submit">Continue</button></div></form>');
    document.getElementById('alt').addEventListener('click', function () { showLogin(null, 'code'); });
    document.getElementById('email').focus();
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
      '<div class="actions" style="gap:8px"><button class="secondary" id="no">' + Th('confirm_no') + '</button><button id="yes">' + Th('confirm_yes') + '</button></div>');
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
    show((c.approved ? '' : '<div class="banner">Draft consent text, pending IRB approval. Do not enroll participants with this version.</div>') +
      '<h1>' + Th('consent_title') + '</h1>' + c.paragraphs.map(function (x) { return '<p>' + para(x) + '</p>'; }).join('') +
      '<label class="option" style="margin-top:12px"><input type="checkbox" id="agree"> ' + esc(c.agreeLabel) + '</label>' +
      '<div class="actions" style="gap:8px"><button class="secondary" id="decline">I do not agree</button><button id="ok" disabled>Continue</button></div>');
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
  function showStatus(st) {
    progress.textContent = '';
    if (st.finished) return showFinished();
    var done = st.completed ? Tp('progress_done', { completed: st.completed, total: st.total }) : '';
    var out = '<button class="secondary" id="out">' + Th('sign_out') + '</button>';
    if (!st.available) {
      show('<h1>' + Th('wait_title') + '</h1>' + done + Tp('wait_body', { session: st.nextSession, date: fmtDate(st.availableAt) }) + '<div class="actions">' + out + '</div>');
    } else {
      show('<h1>' + Th('start_title', { session: st.nextSession, total: st.total }) + '</h1>' + done + Tp('start_body') +
        '<div class="actions" style="gap:8px">' + out + '<button id="go">' + Th('start_button', { session: st.nextSession }) + '</button></div>');
      document.getElementById('go').addEventListener('click', startSession);
    }
    document.getElementById('out').addEventListener('click', signOut);
  }
  function showFinished() {
    progress.textContent = '';
    show('<h1>' + Th('finished_title') + '</h1>' + Tp('finished_body') + '<div class="actions"><button class="secondary" id="out">' + Th('sign_out') + '</button></div>');
    document.getElementById('out').addEventListener('click', signOut);
  }
  function signOut() { store('vc_token', null); S.token = null; showLogin(); }

  // ---------- session ----------
  function startSession() {
    api('session', { token: S.token }).then(function (r) {
      if (r.error === 'not_yet' || r.error === 'finished') return refresh();
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      S.plan = r;
      if (!S.lab) {
        S.lab = TraceLab.create({ study: 'verification-v1', version: '1.0.0', sink: { type: 'local' }, mouseSampleMs: 50 });
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
    var itemId = isPractice ? 'practice' : 't' + index;
    var t0 = performance.now();
    var ms = function () { return Math.round(performance.now() - t0); };
    var opens = []; var openNow = null; var aiShownAtMs = null;
    var answers = {}; var initial = null; var answerLog = [];

    function aiBox() {
      if (!ai) return '';
      var v = ai.verdict === 'malicious' ? Th('label_malicious') : Th('label_benign');
      return '<div class="ai-box" data-trace="ai_box"><div class="label">' + Th('ai_label') + '</div><div class="verdict">' + v + ' · ' + Th('ai_confidence', { confidence: ai.confidence }) + '</div><p style="margin:6px 0 0">' + esc(ai.rationale) + '</p></div>';
    }
    var aiAtTop = mode === 'ai_first' && ai;
    var twoStep = mode === 'evidence_first' && ai;
    var influenceOpts = alert.panels.map(function (x) { return [x.key, x.label]; }).concat([['summary', T('infl_summary')]]);
    var answerOpts = [['malicious', Th('label_malicious')], ['benign', Th('label_benign')]];

    show('<div class="alert-head"><h2 style="margin:0">' + esc(alert.title) + '</h2><span class="sev">' + Th('severity_label') + ': ' + esc(alert.severity) + '</span></div>' +
      '<p class="summary" data-trace="summary">' + esc(alert.summary) + '</p>' +
      (aiAtTop ? aiBox() : '') +
      '<div class="evidence"><div class="tabs" role="tablist">' + alert.panels.map(function (x) {
        return '<button role="tab" aria-selected="false" data-panel="' + x.key + '" data-trace="tab:' + x.key + '">' + esc(x.label) + '</button>';
      }).join('') + '</div><div class="panel-body" id="pbody" data-trace="panel_body"><p class="placeholder">' + Th('evidence_placeholder') + '</p></div></div>' +
      (twoStep ?
        '<div class="step" id="step1"><p class="q">' + Th('q_initial') + '</p>' + radios('initial_judgment', answerOpts, 'initial') + slider('initial_confidence', Th('q_initial_conf')) +
        '<div class="actions"><button id="lock" disabled>' + Th('lock_button') + '</button></div></div><div id="step2" hidden></div>'
        : '<div class="step" id="step2"></div>') +
      '');

    var pbody = document.getElementById('pbody');
    function closePanel() {
      if (!openNow) return;
      openNow.dwellMs = ms() - openNow.atMs; openNow.afterAI = aiShownAtMs != null && openNow.atMs >= aiShownAtMs; openNow = null;
    }
    stage.querySelectorAll('[role=tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-panel');
        if (openNow && openNow.panel === key) return;
        closePanel();
        stage.querySelectorAll('[role=tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        var panel = alert.panels.filter(function (x) { return x.key === key; })[0];
        pbody.innerHTML = '<p style="margin:0">' + esc(panel.text) + '</p>';
        openNow = { panel: key, atMs: ms() }; opens.push(openNow);
      });
    });

    function finalBlock() {
      var showAiOpt = !!ai;
      var opts = influenceOpts.concat(showAiOpt ? [['ai', T('infl_ai')]] : []);
      return '<p class="q">' + Th(twoStep ? 'q_final_two' : 'q_final') + '</p>' + radios('final_judgment', answerOpts, 'final') +
        slider('final_confidence', Th('q_conf')) +
        '<p class="q">' + Th('q_influence') + '</p><div class="checks">' +
        opts.map(function (o) { return '<label class="option" data-trace="infl:' + o[0] + '"><input type="checkbox" name="influential" value="' + o[0] + '"> ' + esc(o[1]) + '</label>'; }).join('') + '</div>' +
        '<div class="actions"><button id="submit" disabled>' + Th(isPractice ? 'practice_submit' : 'submit_button') + '</button></div>';
    }

    var evStart = S.lab ? S.lab.events.length : 0;
    if (S.lab) S.lab.beginItem(itemId, stage);
    if (aiAtTop) aiShownAtMs = 0;

    function record(name, value) { answers[name] = value; answerLog.push({ atMs: ms(), name: name, value: value }); if (S.lab) S.lab.recordAnswer(name, value); }

    function mountFinal() {
      var step2 = document.getElementById('step2');
      step2.hidden = false;
      step2.innerHTML = (twoStep ? aiBox() : '') + finalBlock();
      wire(step2, function (n, v) { record(n, v); checkFinal(); });
      var submit = document.getElementById('submit');
      function checkFinal() { submit.disabled = !(answers.final_judgment && answers.final_confidence != null && answers.influential && answers.influential.length); }
      submit.addEventListener('click', function () {
        submit.disabled = true; closePanel();
        var feats = S.lab ? S.lab.endItem({ final: answers.final_judgment }) : null;
        var raw = S.lab ? S.lab.events.splice(evStart) : [];
        var data = {
          mode: mode, aiShownAtMs: aiShownAtMs,
          initial: initial,
          final: { judgment: answers.final_judgment, confidence: answers.final_confidence, influential: answers.influential, rtMs: ms() },
          evidence: { opens: opens, unique: Array.from(new Set(opens.map(function (o) { return o.panel; }))) },
          answerLog: answerLog,
          traces: feats ? feats.features : null,
          rawEvents: raw,
          viewport: { w: window.innerWidth, h: window.innerHeight }
        };
        api('trial', { token: S.token, session: p.session, index: index, data: data }).then(function (r) {
          if (r.error) { submit.disabled = false; return stage.insertAdjacentHTML('beforeend', errorBox(ERR[r.error] || ERR.server_error)); }
          if (isPractice) { p.practiceDone = true; return showPracticeDone(); }
          p.trials.forEach(function (x) { if (x.index === index) x.done = true; });
          next();
        });
      });
    }

    if (twoStep) {
      var step1 = document.getElementById('step1'); var lock = document.getElementById('lock');
      wire(step1, function (n, v) { record(n, v); lock.disabled = !(answers.initial_judgment && answers.initial_confidence != null); });
      lock.addEventListener('click', function () {
        initial = { judgment: answers.initial_judgment, confidence: answers.initial_confidence, rtMs: ms() };
        step1.classList.add('locked'); step1.querySelectorAll('input').forEach(function (x) { x.disabled = true; });
        lock.parentNode.remove();
        aiShownAtMs = ms(); if (S.lab) S.lab.recordAnswer('ai_shown', true);
        mountFinal();
        document.getElementById('step2').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      mountFinal();
    }
  }

  function showPracticeDone() {
    show('<h1>' + Th('practice_done_title') + '</h1>' + Tp('practice_done_body') + '<div class="actions"><button id="go">' + Th('practice_done_button') + '</button></div>');
    document.getElementById('go').addEventListener('click', next);
  }

  // ---------- surveys (items come from the study content) ----------
  function itemHtml(it) {
    var q = '<p class="q">' + esc(it.text) + (it.required ? '' : ' <span class="muted">(optional)</span>') + '</p>';
    if (it.type === 'scale') return q + scale(it.id, esc(it.lo || ''), esc(it.hi || ''), it.n);
    if (it.type === 'choice') return q + radios(it.id, it.options.map(function (o) { return [esc(o.value), esc(o.label)]; }));
    if (it.type === 'select') return q + '<select name="' + it.id + '"><option value="">Select…</option>' + it.options.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') + '</select>';
    return q + '<textarea name="' + it.id + '" data-trace="text:' + it.id + '"></textarea>';
  }
  // Mirrors itemsFor() in netlify/lib/vc-content.mjs.
  function shown(it, kind) {
    var p = S.plan;
    var inSession = it.sessions && it.sessions.length ? it.sessions.indexOf(p.session) >= 0 : (kind === 'pre' ? p.session === 1 : true);
    if (!inSession) return false;
    if (it.showIf === 'ai') return p.mode !== 'none';
    if (it.showIf === 'no_ai') return p.mode === 'none';
    if (it.showIf === 'after_ai') return !!p.aiRemoved;
    return true;
  }
  function surveyPage(title, items, kind) {
    items = items.filter(function (it) { return shown(it, kind); });
    if (!items.length) return submitSurvey({}, kind, null);
    var required = items.filter(function (it) { return it.required; }).map(function (it) { return it.id; });
    progress.textContent = T('start_title', { session: S.plan.session, total: S.content.sessions });
    show('<h1>' + esc(title) + '</h1>' + items.map(itemHtml).join('') + '<div class="actions"><button id="go"' + (required.length ? ' disabled' : '') + '>' + Th('continue_button') + '</button></div>');
    var ans = {}; var go = document.getElementById('go');
    wire(stage, function (n, v) { ans[n] = v; go.disabled = !required.every(function (k) { return ans[k] != null && String(ans[k]).trim() !== ''; }); });
    go.addEventListener('click', function () { go.disabled = true; submitSurvey(ans, kind, go); });
  }
  function submitSurvey(ans, kind, go) {
    api('survey', { token: S.token, session: S.plan.session, kind: kind, data: ans }).then(function (r) {
      if (r.error) { if (go) go.disabled = false; return stage.insertAdjacentHTML('beforeend', errorBox(ERR[r.error] || ERR.server_error)); }
      if (kind === 'pre') { S.plan.preSurveyDone = true; return next(); }
      showDone(r.status);
    });
  }
  function showPreSurvey() { surveyPage(T('pre_title'), S.content.survey.pre, 'pre'); }
  function showPostSurvey() { surveyPage(T('post_title'), S.content.survey.post, 'post'); }

  function showDone(st) {
    progress.textContent = '';
    S.lab = null;
    if (st && st.finished) return showFinished();
    show('<h1>' + Th('done_title') + '</h1>' + Tp('done_body') +
      (st && st.availableAt ? Tp('done_next', { date: fmtDate(st.availableAt) }) : '') +
      '<div class="actions"><button class="secondary" id="out">' + Th('sign_out') + '</button></div>');
    document.getElementById('out').addEventListener('click', signOut);
  }

  // ---------- boot ----------
  fetch(CONFIG.api + 'content', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
    S.content = c;
    S.token = store('vc_token');
    if (S.token) refresh(); else showLogin();
  }, function () { show('<h1>Security alert study</h1>' + errorBox(ERR.network)); });
})();
