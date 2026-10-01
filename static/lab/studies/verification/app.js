/* Security Alert Study (verification collapse, Clark). Participant app.
   Server: /api/vc/*. Ground truth never reaches the browser. */
(function () {
  'use strict';

  var CONFIG = {
    api: '/api/vc/',
    draftConsent: true, // set false once IRB-approved consent text replaces the draft below
    minutesPerSession: 20
  };

  var stage = document.getElementById('stage');
  var progress = document.getElementById('progress');
  var S = { code: null, plan: null, lab: null };

  // ---------- utilities ----------
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(ms) { return new Date(ms).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function api(route, body) {
    return fetch(CONFIG.api + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }, function () { return { error: 'server_error', _status: r.status }; }); },
            function () { return { error: 'network' }; });
  }
  function show(html) { stage.innerHTML = html; window.scrollTo(0, 0); }
  function errorBox(msg) { return '<p class="error" role="alert">' + esc(msg) + '</p>'; }
  var ERR = {
    invalid_code: 'That access code was not recognized. Check it and try again.',
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
  }

  // ---------- login ----------
  function showLogin(msg) {
    progress.textContent = '';
    show('<h1>Security alert study</h1><p>Enter the access code from your invitation email. Use the same code each week.</p>' +
      '<form id="f"><input type="text" id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="VC-XXXX-XXXX" aria-label="Access code">' +
      (msg ? errorBox(msg) : '') + '<div class="actions"><button type="submit">Continue</button></div></form>');
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = document.getElementById('code').value.trim();
      if (!code) return;
      login(code);
    });
  }

  function login(code) {
    api('login', { code: code }).then(function (r) {
      if (r.error) { store('vc_code', null); return showLogin(ERR[r.error] || ERR.server_error); }
      S.code = r.code; store('vc_code', r.code);
      if (!r.consented) return showConsent();
      showStatus(r.status);
    });
  }

  // ---------- consent ----------
  function showConsent() {
    progress.textContent = '';
    show((CONFIG.draftConsent ? '<div class="banner">Draft consent text, pending IRB approval. Do not enroll participants with this version.</div>' : '') +
      '<h1>Consent to participate</h1>' +
      '<p>This study examines how people review cybersecurity alerts with and without an AI assistant. It has four sessions, about one week apart, each taking about ' + CONFIG.minutesPerSession + ' minutes.</p>' +
      '<p>In each session you will review short security alerts, look at the evidence you choose, and decide whether each alert is malicious or benign. Some sessions include an AI assistant. The AI assistant is part of the study and is not always correct.</p>' +
      '<p>While you work, the page records your answers and how you reached them: which evidence you open and for how long, timing, mouse movement, clicks, scrolling, and typing rhythm. It does not record which keys you press, and it does not use your camera or microphone. Your data is stored under your access code, not your name.</p>' +
      '<p>Participation is voluntary. You may skip the study or stop at any time without penalty.</p>' +
      '<p class="muted">Questions: Dr. Benjamin Ampel, Georgia State University, <a href="mailto:bampel@gsu.edu">bampel@gsu.edu</a>.</p>' +
      '<label class="option" style="margin-top:12px"><input type="checkbox" id="agree"> I am 18 or older and I agree to participate.</label>' +
      '<div class="actions" style="gap:8px"><button class="secondary" id="decline">I do not agree</button><button id="ok" disabled>Continue</button></div>');
    var agree = document.getElementById('agree'), ok = document.getElementById('ok');
    agree.addEventListener('change', function () { ok.disabled = !agree.checked; });
    ok.addEventListener('click', function () {
      ok.disabled = true;
      api('consent', { code: S.code, agree: true }).then(function (r) { if (r.error) return showLogin(ERR[r.error] || ERR.server_error); login(S.code); });
    });
    document.getElementById('decline').addEventListener('click', function () {
      api('consent', { code: S.code, agree: false }).then(function () { store('vc_code', null); show('<h1>Thank you</h1><p>You have chosen not to take part. You can close this page.</p>'); });
    });
  }

  // ---------- status ----------
  function showStatus(st) {
    progress.textContent = '';
    if (st.finished) return show('<h1>All sessions complete</h1><p>You have finished all ' + st.total + ' sessions. Thank you for taking part.</p>');
    var done = st.completed ? '<p>You have completed ' + st.completed + ' of ' + st.total + ' sessions.</p>' : '';
    if (!st.available) {
      return show('<h1>Your next session is not open yet</h1>' + done + '<p>Session ' + st.nextSession + ' opens on <strong>' + esc(fmtDate(st.availableAt)) + '</strong>. Come back then and enter the same access code.</p>' +
        '<div class="actions"><button class="secondary" id="out">Sign out</button></div>');
    }
    show('<h1>Session ' + st.nextSession + ' of ' + st.total + '</h1>' + done +
      '<p>This session takes about ' + CONFIG.minutesPerSession + ' minutes. Please complete it in one sitting, on a laptop or desktop computer, somewhere you will not be interrupted.</p>' +
      '<p class="muted">If you get disconnected, sign in again with your code and you will pick up where you left off.</p>' +
      '<div class="actions" style="gap:8px"><button class="secondary" id="out">Sign out</button><button id="go">Start session ' + st.nextSession + '</button></div>');
    document.getElementById('go').addEventListener('click', startSession);
    var out = document.getElementById('out'); if (out) out.addEventListener('click', signOut);
  }
  function signOut() { store('vc_code', null); S.code = null; showLogin(); }

  // ---------- session ----------
  function startSession() {
    api('session', { code: S.code }).then(function (r) {
      if (r.error === 'not_yet' || r.error === 'finished') return login(S.code);
      if (r.error) return showLogin(ERR[r.error] || ERR.server_error);
      S.plan = r;
      if (!S.lab) {
        S.lab = TraceLab.create({ study: 'verification-v1', version: '1.0.0', participant: S.code, sink: { type: 'local' }, mouseSampleMs: 50 });
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
        api('trial', { code: S.code, session: p.session, index: index, data: data }).then(function (r) {
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

  // ---------- surveys (DRAFT items: replace with the validated scales chosen for the study) ----------
  function surveyPage(title, html, required, kind) {
    progress.textContent = 'Session ' + S.plan.session;
    show('<h1>' + title + '</h1>' + html + '<div class="actions"><button id="go" disabled>Continue</button></div>');
    var ans = {}; var go = document.getElementById('go');
    wire(stage, function (n, v) { ans[n] = v; go.disabled = !required.every(function (k) { return ans[k] != null && ans[k] !== ''; }); });
    go.addEventListener('click', function () {
      go.disabled = true;
      api('survey', { code: S.code, session: S.plan.session, kind: kind, data: ans }).then(function (r) {
        if (r.error) { go.disabled = false; return stage.insertAdjacentHTML('beforeend', errorBox(ERR[r.error] || ERR.server_error)); }
        if (kind === 'pre') { S.plan.preSurveyDone = true; return next(); }
        showDone(r.status);
      });
    });
  }

  function showPreSurvey() {
    surveyPage('A few questions about you',
      '<p class="q">How many years of cybersecurity work or study experience do you have?</p><select name="experience_years"><option value="">Select…</option><option>None</option><option>Less than 1</option><option>1–2</option><option>3–5</option><option>More than 5</option></select>' +
      '<p class="q">Which best describes you?</p>' + radios('role', [['student', 'Student'], ['analyst', 'Security analyst or SOC staff'], ['it', 'Other IT role'], ['other', 'Other']]) +
      '<p class="q">How familiar are you with reviewing security alerts?</p>' + scale('alert_familiarity', 'Not at all familiar', 'Extremely familiar', 5) +
      '<p class="q">How often do you use AI tools (such as chat assistants) for work or study?</p>' + scale('ai_use', 'Never', 'Several times a day', 5),
      ['experience_years', 'role', 'alert_familiarity', 'ai_use'], 'pre');
  }

  function showPostSurvey() {
    var p = S.plan, hadAI = p.mode !== 'none';
    var html = '';
    var req = ['mental_effort'];
    if (hadAI) {
      html += '<p class="q">"I trusted the AI assistant\'s assessments in this session."</p>' + scale('trust_1', 'Strongly disagree', 'Strongly agree', 7) +
        '<p class="q">"The AI assistant was reliable."</p>' + scale('trust_2', 'Strongly disagree', 'Strongly agree', 7) +
        '<p class="q">"I relied on the AI assistant to make my decisions."</p>' + scale('reliance_1', 'Strongly disagree', 'Strongly agree', 7);
      req = req.concat(['trust_1', 'trust_2', 'reliance_1']);
    }
    if (p.session === 4 && p.priorAI) {
      html += '<p class="q">How difficult was it to decide without the AI assistant in this session?</p>' + scale('no_ai_difficulty', 'Not at all difficult', 'Extremely difficult', 7);
      req.push('no_ai_difficulty');
    }
    html += '<p class="q">How much mental effort did this session take?</p>' + scale('mental_effort', 'Very, very low', 'Very, very high', 9);
    surveyPage('About this session', html, req, 'post');
  }

  function showDone(st) {
    progress.textContent = '';
    if (st && st.finished) return show('<h1>Thank you</h1><p>You have completed all sessions of the study. You can close this page.</p>');
    show('<h1>Session complete</h1><p>Thank you. Your answers are saved.</p>' +
      (st && st.availableAt ? '<p>Your next session opens on <strong>' + esc(fmtDate(st.availableAt)) + '</strong>. Use the same access code.</p>' : '') +
      '<div class="actions"><button class="secondary" id="out">Sign out</button></div>');
    document.getElementById('out').addEventListener('click', signOut);
    S.lab = null;
  }

  // ---------- boot ----------
  var saved = store('vc_code');
  if (saved) login(saved); else showLogin();
})();
