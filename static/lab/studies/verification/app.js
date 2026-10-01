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
  var ERR = {
    invalid_code: 'That access code was not recognized. Check it and try again.',
    not_enrolled: 'That email is not on the study roster. Use the email address your invitation was sent to, or contact the research team.',
    bad_pin_format: 'Your PIN must be exactly 4 digits.',
    expired: 'Your sign-in expired. Sign in again to pick up where you left off.',
    network: 'Could not reach the study server. Check your connection and try again.',
    server_error: 'Something went wrong on our end. Please try again in a minute.',
    wrong_session: 'This session is no longer active. Reload the page to continue.'
  };

  function slider(name, label) {
    return '<p class="q">' + label + '</p><div class="slider-row"><input type="range" min="0" max="100" step="1" value="50" name="' + name + '" aria-label="' + esc(label) + '"><span class="slider-val">50</span></div>' +
      '<p class="muted">0 = guessing, 100 = certain. Click or move the slider to record your answer.</p>';
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

  // ---------- sign-in: email + 4-digit PIN (pilot access codes also accepted) ----------
  var PIN_ATTR = 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" spellcheck="false"';
  function showLogin(msg, mode, email) {
    progress.textContent = '';
    if (mode === 'code') {
      show('<h1>Security alert study</h1><p>Enter your pilot access code.</p>' +
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
    show('<h1>Security alert study</h1><p>Sign in with the email address your invitation was sent to. Use the same email and PIN each week.</p>' +
      '<form id="f"><label class="field">Email<input type="email" id="email" autocomplete="email" spellcheck="false" value="' + esc(email || '') + '"></label>' +
      '<label class="field">4-digit PIN<input type="password" id="pin" autocomplete="current-password" ' + PIN_ATTR + '></label>' +
      '<p class="muted">First time here? Leave the PIN blank and you will create one.</p>' +
      (msg ? errorBox(msg) : '') + '<div class="actions" style="justify-content:space-between"><button type="button" class="secondary" id="alt">I have an access code</button><button type="submit">Continue</button></div></form>');
    document.getElementById('alt').addEventListener('click', function () { showLogin(null, 'code'); });
    document.getElementById(email ? 'pin' : 'email').focus();
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = document.getElementById('email').value.trim();
      if (em) signIn({ email: em, pin: document.getElementById('pin').value.trim() });
    });
  }

  function showSetPin(email, msg) {
    progress.textContent = '';
    show('<h1>Create your PIN</h1><p>Choose a 4-digit PIN. You will sign in each week with <strong>' + esc(email) + '</strong> and this PIN, so pick one you will remember.</p>' +
      '<form id="f"><label class="field">New PIN<input type="password" id="p1" autocomplete="new-password" ' + PIN_ATTR + '></label>' +
      '<label class="field">Type it again<input type="password" id="p2" autocomplete="new-password" ' + PIN_ATTR + '></label>' +
      (msg ? errorBox(msg) : '') + '<div class="actions"><button type="submit">Save PIN and continue</button></div></form>');
    document.getElementById('p1').focus();
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = document.getElementById('p1').value.trim(), b = document.getElementById('p2').value.trim();
      if (!/^\d{4}$/.test(a)) return showSetPin(email, ERR.bad_pin_format);
      if (a !== b) return showSetPin(email, 'The two PINs do not match.');
      signIn({ email: email, pin: a, setPin: true });
    });
  }

  function loginError(r) {
    if (r.error === 'wrong_pin') return 'That PIN is not right. ' + r.attemptsLeft + (r.attemptsLeft === 1 ? ' try' : ' tries') + ' left before a 15-minute lock. Forgot it? Contact the research team to reset it.';
    if (r.error === 'locked') return 'Too many wrong PINs. Try again after ' + new Date(r.until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + ', or contact the research team to reset your PIN.';
    return ERR[r.error] || ERR.server_error;
  }

  function signIn(creds) {
    api('login', creds).then(function (r) {
      if (r.error === 'set_pin') return showSetPin(creds.email);
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
  function para(text) {
    var t = esc(String(text).replace(/\{minutes\}/g, S.content.minutesPerSession));
    return t.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
  }
  function showConsent() {
    progress.textContent = '';
    var c = S.content.consent;
    show((c.approved ? '' : '<div class="banner">Draft consent text, pending IRB approval. Do not enroll participants with this version.</div>') +
      '<h1>Consent to participate</h1>' + c.paragraphs.map(function (x) { return '<p>' + para(x) + '</p>'; }).join('') +
      '<label class="option" style="margin-top:12px"><input type="checkbox" id="agree"> ' + esc(c.agreeLabel) + '</label>' +
      '<div class="actions" style="gap:8px"><button class="secondary" id="decline">I do not agree</button><button id="ok" disabled>Continue</button></div>');
    var agree = document.getElementById('agree'), ok = document.getElementById('ok');
    agree.addEventListener('change', function () { ok.disabled = !agree.checked; });
    ok.addEventListener('click', function () {
      ok.disabled = true;
      api('consent', { token: S.token, agree: true }).then(function (r) { if (r.error) return showLogin(ERR[r.error] || ERR.server_error); refresh(); });
    });
    document.getElementById('decline').addEventListener('click', function () {
      api('consent', { token: S.token, agree: false }).then(function () { store('vc_token', null); show('<h1>Thank you</h1><p>You have chosen not to take part. You can close this page.</p>'); });
    });
  }

  // ---------- status ----------
  function showStatus(st) {
    progress.textContent = '';
    if (st.finished) return show('<h1>All sessions complete</h1><p>You have finished all ' + st.total + ' sessions. Thank you for taking part.</p>');
    var done = st.completed ? '<p>You have completed ' + st.completed + ' of ' + st.total + ' sessions.</p>' : '';
    if (!st.available) {
      return show('<h1>Your next session is not open yet</h1>' + done + '<p>Session ' + st.nextSession + ' opens on <strong>' + esc(fmtDate(st.availableAt)) + '</strong>. Come back then and sign in the same way.</p>' +
        '<div class="actions"><button class="secondary" id="out">Sign out</button></div>');
    }
    show('<h1>Session ' + st.nextSession + ' of ' + st.total + '</h1>' + done +
      '<p>This session takes about ' + S.content.minutesPerSession + ' minutes. Please complete it in one sitting, on a laptop or desktop computer, somewhere you will not be interrupted.</p>' +
      '<p class="muted">If you get disconnected, sign in again and you will pick up where you left off.</p>' +
      '<div class="actions" style="gap:8px"><button class="secondary" id="out">Sign out</button><button id="go">Start session ' + st.nextSession + '</button></div>');
    document.getElementById('go').addEventListener('click', startSession);
    var out = document.getElementById('out'); if (out) out.addEventListener('click', signOut);
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
    if (p.session === 1 && !p.preSurveyDone) return showPreSurvey();
    if (!p._instructed) return showInstructions();
    if (p.practice && !p.practiceDone) return runTrial(p.practice, p.practiceAI, 'practice');
    var t = p.trials.filter(function (x) { return !x.done; })[0];
    if (t) return runTrial(t.alert, t.ai, t.index);
    showPostSurvey();
  }

  function showInstructions() {
    var p = S.plan, mode = p.mode;
    var how = {
      ai_first: '<p>For each alert, an AI assistant will show its assessment first. Then review whatever evidence you want and make your decision. The AI assistant is helpful but not always correct.</p>',
      evidence_first: '<p>For each alert, first review whatever evidence you want and record your initial assessment. Then an AI assistant will show its assessment, and you will make your final decision. You can look at the evidence again before deciding. The AI assistant is helpful but not always correct.</p>',
      none: '<p>For each alert, review whatever evidence you want and make your decision.</p>'
    }[mode];
    if (mode === 'none' && p.session === 4 && p.priorAI) how = '<p>In this session there is no AI assistant. For each alert, review whatever evidence you want and make your decision.</p>';
    progress.textContent = 'Session ' + p.session;
    show('<h1>How this session works</h1>' +
      '<p>You are a security analyst reviewing alerts from a company network. You will see ' + p.total + ' alerts. Each alert has a short summary and four sources of evidence: network activity, user behavior, system events, and context &amp; threat intel.</p>' + how +
      '<p>Open evidence by clicking its tab. Open as much or as little as you think you need. About half of the alerts are malicious.</p>' +
      (p.practice && !p.practiceDone ? '<p>You will start with one practice alert that does not count.</p>' : '') +
      '<div class="actions"><button id="go">Begin</button></div>');
    document.getElementById('go').addEventListener('click', function () { p._instructed = true; next(); });
  }

  // ---------- trial ----------
  function runTrial(alert, ai, index) {
    var p = S.plan, mode = ai ? p.mode : 'none';
    var isPractice = index === 'practice';
    var doneCount = p.trials.filter(function (x) { return x.done; }).length;
    progress.textContent = isPractice ? 'Practice alert' : 'Session ' + p.session + ' · Alert ' + (doneCount + 1) + ' of ' + p.total;
    var itemId = isPractice ? 'practice' : 't' + index;
    var t0 = performance.now();
    var ms = function () { return Math.round(performance.now() - t0); };
    var opens = []; var openNow = null; var aiShownAtMs = null;
    var answers = {}; var initial = null; var answerLog = [];

    function aiBox() {
      if (!ai) return '';
      var v = ai.verdict === 'malicious' ? 'Malicious' : 'Benign';
      return '<div class="ai-box" data-trace="ai_box"><div class="label">AI assistant assessment</div><div class="verdict">' + v + ' · ' + ai.confidence + '% confidence</div><p style="margin:6px 0 0">' + esc(ai.rationale) + '</p></div>';
    }
    var aiAtTop = mode === 'ai_first' && ai;
    var twoStep = mode === 'evidence_first' && ai;
    var influenceOpts = alert.panels.map(function (x) { return [x.key, x.label]; }).concat([['summary', 'The alert summary']]);

    show('<div class="alert-head"><h2 style="margin:0">' + esc(alert.title) + '</h2><span class="sev">Severity: ' + esc(alert.severity) + '</span></div>' +
      '<p class="summary" data-trace="summary">' + esc(alert.summary) + '</p>' +
      (aiAtTop ? aiBox() : '') +
      '<div class="evidence"><div class="tabs" role="tablist">' + alert.panels.map(function (x) {
        return '<button role="tab" aria-selected="false" data-panel="' + x.key + '" data-trace="tab:' + x.key + '">' + esc(x.label) + '</button>';
      }).join('') + '</div><div class="panel-body" id="pbody" data-trace="panel_body"><p class="placeholder">Select an evidence source above to view it.</p></div></div>' +
      (twoStep ?
        '<div class="step" id="step1"><p class="q">Your initial assessment: is this alert malicious or benign?</p>' + radios('initial_judgment', [['malicious', 'Malicious'], ['benign', 'Benign']], 'initial') + slider('initial_confidence', 'How confident are you in your initial assessment?') +
        '<div class="actions"><button id="lock" disabled>Record initial assessment and see the AI assessment</button></div></div><div id="step2" hidden></div>'
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
      var opts = influenceOpts.concat(showAiOpt ? [['ai', 'The AI assessment']] : []);
      return '<p class="q">' + (twoStep ? 'Your final decision' : 'Your decision') + ': is this alert malicious or benign?</p>' + radios('final_judgment', [['malicious', 'Malicious'], ['benign', 'Benign']], 'final') +
        slider('final_confidence', 'How confident are you?') +
        '<p class="q">Which information most influenced your decision? Select all that apply.</p><div class="checks">' +
        opts.map(function (o) { return '<label class="option" data-trace="infl:' + o[0] + '"><input type="checkbox" name="influential" value="' + o[0] + '"> ' + esc(o[1]) + '</label>'; }).join('') + '</div>' +
        '<div class="actions"><button id="submit" disabled>' + (isPractice ? 'Finish practice' : 'Submit decision') + '</button></div>';
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
    show('<h1>Practice complete</h1><p>The real alerts start now. They will look the same as the practice alert.</p><div class="actions"><button id="go">Start</button></div>');
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
  function shown(it) {
    var p = S.plan;
    if (it.showIf === 'ai') return p.mode !== 'none';
    if (it.showIf === 'no_ai') return p.mode === 'none';
    if (it.showIf === 'after_ai') return p.mode === 'none' && p.priorAI && p.session > 1;
    return true;
  }
  function surveyPage(title, items, kind) {
    items = items.filter(shown);
    if (!items.length) return submitSurvey({}, kind, null);
    var required = items.filter(function (it) { return it.required; }).map(function (it) { return it.id; });
    progress.textContent = 'Session ' + S.plan.session;
    show('<h1>' + title + '</h1>' + items.map(itemHtml).join('') + '<div class="actions"><button id="go"' + (required.length ? ' disabled' : '') + '>Continue</button></div>');
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
  function showPreSurvey() { surveyPage('A few questions about you', S.content.survey.pre, 'pre'); }
  function showPostSurvey() { surveyPage('About this session', S.content.survey.post, 'post'); }

  function showDone(st) {
    progress.textContent = '';
    if (st && st.finished) return show('<h1>Thank you</h1><p>You have completed all sessions of the study. You can close this page.</p>');
    show('<h1>Session complete</h1><p>Thank you. Your answers are saved.</p>' +
      (st && st.availableAt ? '<p>Your next session opens on <strong>' + esc(fmtDate(st.availableAt)) + '</strong>. Sign in the same way each week.</p>' : '') +
      '<div class="actions"><button class="secondary" id="out">Sign out</button></div>');
    document.getElementById('out').addEventListener('click', signOut);
    S.lab = null;
  }

  // ---------- boot ----------
  fetch(CONFIG.api + 'content', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
    S.content = c;
    S.token = store('vc_token');
    if (S.token) refresh(); else showLogin();
  }, function () { show('<h1>Security alert study</h1>' + errorBox(ERR.network)); });
})();
