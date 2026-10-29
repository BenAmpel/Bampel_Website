/* Study type "smishing": one text message in a phone frame per trial (the ARGOS warning study, IRB H26762).
   The participant taps the link (a local mock page with decoy fields opens) or ignores the message; the funnel seals
   on Ignore, on Back then Ignore, on Submit, or at the time limit; then a scam-likelihood slider and, when a warning
   was shown, a read-back of its risk level. Server side: netlify/lib/lab/types/smishing.mjs.
   Privacy (AGENT_BUILD_SPEC s6.4): decoy inputs sit inside [data-no-capture], have no name and no form, and this code
   never reads their value; it only counts input events and clears the fields when the page closes. */
(function () {
  'use strict';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/lab/engine/types/smishing.css'; document.head.appendChild(css);

  var comp = null, att1 = null, backCount = 0, shown = {};
  var PAGES = {
    // No password-type input: browsers autofill saved passwords into password fields whatever autocomplete says, which would
    // put a participant's real password on the page and fire input events nobody typed. The field is masked with CSS.
    signin: { title: 'Sign in to continue', fields: [['Username', 'text'], ['Password', 'masked']], button: 'Sign in' },
    payment: { title: 'Complete your payment', fields: [['Name on card', 'text'], ['Card number', 'text'], ['Expiry (MM/YY)', 'text']], button: 'Pay now' },
    delivery: { title: 'Update delivery details', fields: [['Full name', 'text'], ['ZIP code', 'text']], button: 'Reschedule delivery' },
    track: { title: 'Track your package', fields: [['ZIP code', 'text']], button: 'Track' },
    reward: { title: 'Claim your reward', fields: [['Email', 'text'], ['Phone number', 'text']], button: 'Claim' },
    verify: { title: 'Verify your account', fields: [['Account ID', 'text'], ['Verification code', 'text']], button: 'Verify' }
  };
  // Tier read-back: the headings as displayed; the stored value is the tier (or 'Not sure').
  var READBACK = [['Severe', 'readback_severe'], ['Medium', 'readback_medium'], ['Not sure', 'readback_unsure']];
  function cfg(content) { return (content && content.smishing) || { trialSeconds: 90, reminderSeconds: 60, comprehension: [] }; }
  function bigEnough() { return window.innerWidth >= 1024 && window.innerHeight >= 700; }

  // The plan mixes 4 practice messages, 72 messages and 5 warning-question screens; each kind is counted on its own,
  // so the attention check and the follow-up screens never share a message number.
  function parts(plan) {
    var ts = plan.trials || [];
    return { practice: ts.filter(function (x) { return x.practice; }), main: ts.filter(function (x) { return !x.practice && x.kind !== 'comp'; }), comp: ts.filter(function (x) { return x.kind === 'comp'; }) };
  }
  function progressText(trial, plan, ui) {
    var pp = parts(plan), pos = function (list) { for (var i = 0; i < list.length; i++) if (list[i].index === trial.index) return i + 1; return 0; };
    if (trial.kind === 'comp') return ui.T('sm_progress_comp', { i: pos(pp.comp), n: pp.comp.length });
    if (trial.practice) return ui.T('sm_progress_practice', { i: pos(pp.practice), n: pp.practice.length });
    return ui.T('sm_progress_main', { i: pos(pp.main), n: pp.main.length });
  }

  // Warnings (AGENT_BUILD_SPEC s6.2, s6.5): icon plus text, never color alone; the slot keeps one height in every condition.
  function warningHtml(w, ui) {
    var Th = ui.Th, esc = ui.esc;
    if (!w || w.kind === 'none') return '';
    if (w.kind === 'banner') return '<div class="sm-warn sm-banner" role="status">' + Th('w_banner') + '</div>';
    if (w.kind === 'badge') return '<div class="sm-warn sm-badge" role="status">' + Th('w_badge') + '</div>';
    var filled = { High: 3, Moderate: 2, Low: 1 }[w.certainty] || 0, segs = '';
    for (var i = 0; i < 3; i++) segs += '<span class="seg' + (i < filled ? ' on' : '') + '"></span>';
    return '<div class="sm-warn sm-tier sm-' + (w.tier === 'Severe' ? 'severe' : 'medium') + '" role="status">' +
      '<div class="sm-tierline">' + Th(w.tier === 'Severe' ? 'w_severe' : 'w_medium') + '</div>' +
      '<div class="sm-cert"><span class="sm-meter" aria-hidden="true">' + segs + '</span><span>' + Th('w_cert', { level: w.certainty }) + '</span></div>' +
      (w.certainty !== 'High' ? '<div class="sm-caption">' + Th('w_cert_caption') + '</div>' : '') +
      (w.line ? '<div class="sm-line">' + esc(w.line) + '</div>' : '') + '</div>';
  }

  function bubbleHtml(t, ui) {
    var esc = ui.esc;
    if (!t.link) return esc(t.text);
    return t.text.split(t.link).map(esc).join('<span class="sm-link" role="link" tabindex="0" data-trace="link">' + esc(t.link) + '</span>');
  }

  // Before an item: the window-size gate, the comprehension check (before the first practice message) and the
  // attention check (before message 37). None of these counts as part of the item.
  function beforeTrial(info, ui, go) {
    var T = ui.T, Th = ui.Th, Tp = ui.Tp, esc = ui.esc, c = cfg(info.content);
    function step() {
      if (!bigEnough()) {
        ui.show('<h1>' + Th('login_title') + '</h1>' + Tp('small_window') + '<div class="actions"><button id="sm-recheck">' + Th('continue_button') + '</button></div>');
        return document.getElementById('sm-recheck').addEventListener('click', step);
      }
      if (info.index === 0 && !comp && (c.comprehension || []).length) return quiz(1);
      var pp = parts(info.plan);
      if (pp.main.length && info.index === pp.main[0].index && pp.practice.length && !shown.practice) return interstitial('practice', 'sm_practice_done_title', 'practice_done_body');
      if (pp.comp.length && info.index === pp.comp[0].index && !shown.comp) return interstitial('comp', 'sm_comp_intro_title', 'sm_comp_intro_body');
      if (info.trial.att1Before && att1 == null) return attention();
      ui.setProgress(progressText(info.trial, info.plan, ui));
      go();
    }
    function interstitial(key, title, body) {
      ui.setProgress('');
      ui.show('<h1>' + Th(title) + '</h1>' + Tp(body) + '<div class="actions"><button id="sm-inter-go">' + Th('continue_button') + '</button></div>');
      document.getElementById('sm-inter-go').addEventListener('click', function () { shown[key] = true; step(); });
    }
    function quiz(attempt) {
      var qs = c.comprehension;
      ui.show('<h1>' + Th('comp_title') + '</h1>' + (attempt > 1 ? '<p class="sm-retry">' + Th('comp_retry') + '</p>' + Tp('instr_task') + Tp('instr_safe') : '') +
        qs.map(function (q, i) {
          return '<fieldset class="q-group sm-comp"><legend class="q">' + esc(q.q) + '</legend>' + q.options.map(function (o, j) {
            var id = 'sm-c' + i + '-' + j;
            return '<label class="option" for="' + id + '"><input type="radio" name="sm-c' + i + '" value="' + j + '" id="' + id + '"><span>' + esc(o) + '</span></label>';
          }).join('') + '</fieldset>';
        }).join('') + '<div id="sm-compmsg"></div><div class="actions"><button id="sm-comp-go">' + Th('continue_button') + '</button></div>');
      document.getElementById('sm-comp-go').addEventListener('click', function () {
        var answered = 0, wrong = 0;
        qs.forEach(function (q, i) {
          var x = document.querySelector('input[name="sm-c' + i + '"]:checked');
          if (x) { answered++; if (Number(x.value) !== q.answer) wrong++; }
        });
        if (answered < qs.length) { document.getElementById('sm-compmsg').innerHTML = ui.errorBox(T('required_prompt')); return; }
        if (!wrong) { comp = { attempts: attempt, passed: true, wrong: 0 }; return step(); }
        if (attempt < 2) return quiz(2);
        comp = { attempts: attempt, passed: false, wrong: wrong }; go();   // the trial sends the failure; the server ends the study
      });
    }
    function attention() {
      ui.setProgress(T('sm_progress_check'));
      ui.show('<h1>Quick check</h1>' + ui.vas('sm_att1', Th('att1_text')) +
        '<div id="sm-attmsg"></div><div class="actions"><button id="sm-att-go">' + Th('next_button') + '</button></div>');
      var val = null;
      ui.wire(ui.stage, function (n, v) { if (n === 'sm_att1') val = v; });
      document.getElementById('sm-att-go').addEventListener('click', function () {
        if (val == null) { document.getElementById('sm-attmsg').innerHTML = ui.errorBox(T('probe_needed')); return; }
        att1 = val; step();   // step() restores the message's progress line, then starts it
      });
    }
    step();
  }

  // Warning-comprehension screen (after the 72 messages): the condition's warning in the phone frame, then 7-point
  // agreement items (07_measures_instrument.md (c)); ATT2 is one extra item on one of the five screens.
  function compTrial(ctx, ui) {
    var t = ctx.trial, esc = ui.esc, answers = {};
    var items = t.items.map(function (x) { return { id: x[0], text: x[1] }; });
    if (t.att2) items.splice(2, 0, { id: t.att2[0], text: t.att2[1] });
    ui.show('<div class="sm-wrap sm-comp-wrap"><div class="sm-phone sm-phone-short" aria-label="Warning shown in the study"><div class="sm-head">Messages</div><div class="sm-screen">' +
      '<div class="sm-slot">' + warningHtml(t.warning, ui) + '</div></div></div><div class="sm-side"><h2 class="sm-comp-title">About this kind of warning</h2>' +
      '<p>Think about the messages that showed a warning like the one above. How much do you agree with each statement?</p>' +
      items.map(function (it) { return ui.questionHtml({ id: it.id, text: it.text, type: 'scale', n: 7, lo: t.labels[0], hi: t.labels[6], labels: t.labels }); }).join('') +
      '<div id="sm-cmsg"></div><div class="actions"><button id="sm-cnext">Next</button></div></div></div>');
    ui.wire(ui.stage, function (n, v) { answers[n] = Number(v); ctx.record(n, Number(v)); });
    var btn = document.getElementById('sm-cnext');
    btn.addEventListener('click', function () {
      var miss = items.filter(function (it) { return answers[it.id] == null; });
      if (miss.length) { document.getElementById('sm-cmsg').innerHTML = ui.errorBox(ui.T('required_prompt')); return; }
      btn.disabled = true;
      var comp = {}; t.items.forEach(function (x) { comp[x[0]] = answers[x[0]]; });
      ctx.submit(t.att2 ? { comp: comp, att2: answers.att2 } : { comp: comp }, function (err) { btn.disabled = false; document.getElementById('sm-cmsg').innerHTML = ui.errorBox(err); });
    });
    void esc;
  }

  function runTrial(ctx, ui) {
    if (ctx.trial.kind === 'comp') return compTrial(ctx, ui);
    var T = ui.T, Th = ui.Th, esc = ui.esc, t = ctx.trial, c = cfg(ctx.content);
    var ev = [], fieldInputs = 0, sealed = false, timedOut = false, probe = null, readback = null, timers = [], lastInputLog = -1e9;
    function log(e, extra) { var x = { e: e, ms: ctx.ms() }; if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; }); ev.push(x); }
    var extra = { att1: t.att1Before ? att1 : null };
    if (ctx.index === 0 && comp) extra.comprehension = comp;
    if (comp && comp.passed === false && ctx.index === 0) {   // failed the check twice: save it; the server screens out
      return ctx.submit({ events: [], comprehension: comp }, function (err) { ui.show(ui.errorBox(err)); });
    }

    // Browser back is trapped for the whole item: one extra history entry, re-added on every press, and logged.
    try { history.pushState({ smTrial: ctx.index }, ''); } catch (e) {}
    function onPop() { backCount++; log('browser_back'); try { history.pushState({ smTrial: ctx.index }, ''); } catch (e) {} var n = document.getElementById('sm-backnote'); if (n) n.hidden = false; }
    window.addEventListener('popstate', onPop);

    ui.show('<div class="sm-wrap"><div class="sm-phone" aria-label="Phone"><div class="sm-head">' + Th('phone_header') + '</div>' +
      '<div class="sm-screen" id="sm-screen"></div></div><div class="sm-side" id="sm-side"><p class="sm-backnote" id="sm-backnote" hidden>Please use the buttons on the page; the browser back button is turned off during the study.</p>' +
      '<p class="sm-reminder" id="sm-reminder" hidden>' + Th('timeout_reminder') + '</p></div></div>');
    var screen = document.getElementById('sm-screen'), side = document.getElementById('sm-side');
    log('render');

    function messageView() {
      screen.innerHTML = '<div class="sm-sender">' + Th('sender') + '</div><div class="sm-slot" aria-live="polite">' + warningHtml(t.warning, ui) + '</div>' +
        '<div class="sm-bubble" data-trace="message">' + bubbleHtml(t, ui) + '</div>' +
        (sealed ? '' : '<div class="sm-actions"><button type="button" class="secondary" id="sm-ignore" data-trace="ignore">' + Th(t.link ? 'ignore_button' : 'done_button') + '</button></div>');
      var link = screen.querySelector('.sm-link');
      if (link && !sealed) {
        var open = function () { log('link_tap'); pageView(); };
        link.addEventListener('click', open);
        link.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      }
      var ig = document.getElementById('sm-ignore');
      if (ig) ig.addEventListener('click', function () { log('ignore'); seal(); });
    }

    function pageView() {
      var pg = PAGES[t.page] || PAGES.verify;
      screen.innerHTML = '<div class="sm-addr" aria-label="Address">' + esc(t.link || '') + '</div><div class="sm-page" data-no-capture>' +
        '<div class="sm-brand">' + esc(t.brand || '') + '</div><h2>' + esc(pg.title) + '</h2>' +
        pg.fields.map(function (f, i) {
          var id = 'sm-f' + i;
          return '<label class="sm-field" for="' + id + '">' + esc(f[0]) + '<input id="' + id + '" type="text"' + (f[1] === 'masked' ? ' class="sm-masked"' : '') + ' autocomplete="off" data-lpignore="true" data-1p-ignore autocapitalize="off" spellcheck="false" data-trace="field"></label>';
        }).join('') +
        '<button type="button" id="sm-submit" data-trace="page_submit">' + esc(pg.button) + '</button></div>' +
        '<div class="sm-actions"><button type="button" class="secondary" id="sm-back" data-trace="back">' + Th('back_button') + '</button></div>';
      log('mock_view');
      screen.querySelectorAll('.sm-page input').forEach(function (inp) {
        inp.addEventListener('focus', function () { log('field_focus'); });
        // Counts only: the event's type, never the field's value.
        inp.addEventListener('input', function () { fieldInputs++; if (ctx.ms() - lastInputLog > 500) { lastInputLog = ctx.ms(); log('field_input', { count: fieldInputs }); } });
      });
      document.getElementById('sm-submit').addEventListener('click', function () { log('submit'); clearFields(); seal(); });
      document.getElementById('sm-back').addEventListener('click', function () { log('back_to_message'); clearFields(); messageView(); });
    }
    function clearFields() { screen.querySelectorAll('.sm-page input').forEach(function (inp) { inp.value = ''; }); }

    // The funnel is sealed: show the message again (without actions) and ask the questions beside the phone.
    function seal() {
      if (sealed) return;
      sealed = true; timers.forEach(clearTimeout);
      document.getElementById('sm-reminder').hidden = true;
      clearFields(); messageView();
      var askReadback = !!(t.warning && t.warning.kind === 'tier');
      side.insertAdjacentHTML('beforeend', '<div class="sm-qs">' + ui.vas('sm_probe', Th('probe_q')) +
        '<div class="sm-ends"><span>' + Th('probe_lo') + '</span><span>' + Th('probe_hi') + '</span></div>' +
        (askReadback ? '<fieldset class="q-group"><legend class="q">' + Th('readback_q') + '</legend>' + READBACK.map(function (o, j) {
          return '<label class="option" for="sm-rb' + j + '"><input type="radio" name="sm_readback" id="sm-rb' + j + '" value="' + esc(o[0]) + '"><span>' + Th(o[1]) + '</span></label>';
        }).join('') + '</fieldset>' : '') + '<div id="sm-qmsg"></div><div class="actions"><button id="sm-next">' + Th('next_button') + '</button></div></div>');
      ui.wire(side, function (n, v) { if (n === 'sm_probe') { probe = v; log('probe'); } });
      side.querySelectorAll('input[name="sm_readback"]').forEach(function (r) { r.addEventListener('change', function () { readback = r.value; log('readback'); }); });
      var next = document.getElementById('sm-next');
      next.addEventListener('click', function () {
        var msg = document.getElementById('sm-qmsg');
        if (probe == null) { msg.innerHTML = ui.errorBox(T('probe_needed')); return; }
        if (askReadback && readback == null) { msg.innerHTML = ui.errorBox(T('required_prompt')); return; }
        log('next'); next.disabled = true;
        window.removeEventListener('popstate', onPop);
        var fields = { events: ev, probe: probe, readback: askReadback ? readback : null, timedOut: timedOut, fieldInputs: fieldInputs, browserBack: backCount };
        Object.keys(extra).forEach(function (k) { if (extra[k] != null) fields[k] = extra[k]; });
        backCount = 0;
        ctx.submit(fields, function (err) { next.disabled = false; window.addEventListener('popstate', onPop); msg.innerHTML = ui.errorBox(err); });
      });
    }

    timers.push(setTimeout(function () { if (!sealed) document.getElementById('sm-reminder').hidden = false; }, (c.reminderSeconds || 60) * 1000));
    timers.push(setTimeout(function () { if (!sealed) { timedOut = true; log('timeout'); seal(); } }, (c.trialSeconds || 90) * 1000));
    messageView();
  }

  LabEngine.registerType('smishing', {
    // The engine shows instr_intro above these.
    instructions: function (p, ui) { return ui.Tp('instr_task') + ui.Tp('instr_safe') + ui.Tp('instr_practice'); },
    beforeTrial: beforeTrial,
    progressText: progressText,
    runTrial: runTrial,
    // For tests (tests/lab/smishing.test.mjs).
    _internals: { warningHtml: warningHtml, PAGES: PAGES, reset: function () { comp = null; att1 = null; backCount = 0; shown = {}; } }
  });
})();
