/* Study type "game": the participant screens for economic games, live and asynchronous.
   Live play polls the study's API about once a second (POST game/poll) and draws whatever the server says the
   participant should see: waiting room, match confirmation, a decision, waiting for others, results.
   Asynchronous play shows each round's decisions at once and sends them with the engine's trial route.
   Server side: netlify/lib/lab/types/game.mjs and netlify/lib/lab/game/*. Design: static/lab/README.md ("Economic games").
   UI rules followed: plain language, labelled controls, 48 px targets, focus moves to each new screen's heading,
   a calm visible time limit (no countdown pressure beyond the number), the same layout in every condition,
   honest progress ("Round k of N"), and nothing that moves or flashes. */
(function () {
  'use strict';
  var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/lab/engine/types/game.css'; document.head.appendChild(link);

  var G = { run: null, history: [], key: null, feeShown: false, roleShown: false, summary: null, seq: 0 };

  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function num(x) { return typeof x === 'number' ? String(Math.round(x * 1e6) / 1e6) : String(x); }
  function sub(text, vars) { return String(text).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }

  // Labels for decisions and their saved values, from the public game description in the plan.
  function lookup(game) {
    var dec = {};
    game.stages.forEach(function (st) { st.decisions.forEach(function (d) { dec[d.id] = { label: d.label, kind: d.kind, options: d.options, stage: st.id }; }); });
    return dec;
  }
  function valueText(dec, id, v) {
    if (v == null) return '';
    if (typeof v === 'object' && v.threshold != null) return '≥ ' + num(v.threshold);
    if (typeof v === 'object') return '…';
    var d = dec[id];
    if (d && d.kind === 'choice') { var o = (d.options || []).filter(function (x) { return x.value === v; })[0]; return o ? o.label : String(v); }
    return num(v);
  }
  function listText(dec, id, v) { return Array.isArray(v) ? v.map(function (x) { return valueText(dec, id, x); }).join(', ') : valueText(dec, id, v); }

  // ---------- instructions (before the first round) ----------
  function payoffTable(game, ui) {
    var t = game.payoffTable; if (!t) return '';
    var esc = ui.esc;
    return '<h3>' + ui.Th('game_payoff_table') + '</h3><div class="table-scroll"><table class="gm-table"><caption class="sr">' + ui.Th('game_payoff_table') + '</caption><thead><tr><td></td><th scope="colgroup" colspan="' + t.cols.length + '">' + esc(t.colTitle) + '</th></tr>' +
      '<tr><th scope="col">' + esc(t.rowTitle) + '</th>' + t.cols.map(function (c) { return '<th scope="col">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      t.rows.map(function (r, i) { return '<tr><th scope="row">' + esc(r.label) + '</th>' + t.cols.map(function (c, j) { return '<td>' + num(t.cells[i][j][0]) + ', ' + num(t.cells[i][j][1]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muted">' + ui.Th('game_payoff_you') + '</p>';
  }
  function paymentRule(game, ui) {
    var p = game.payment, rule = p.method === 'randomRound' ? 'One round is chosen at random at the end, and only that round is paid.' : p.method === 'sum' ? 'All rounds are paid.' : 'The average over all rounds is paid.';
    var conv = '1 point = ' + num(p.pointsPerUnit) + ' ' + p.currency + '.' + (p.maxBonus != null ? ' The bonus is at most ' + num(p.maxBonus) + ' ' + p.currency + '.' : '');
    return '<p>' + ui.Th('game_payment_note', { rule: rule + ' ' + conv }) + '</p>';
  }
  function instructions(plan, ui) {
    var g = plan.game, esc = ui.esc;
    var text = (g.instructions.general || '').split(/\n\s*\n/).map(function (x) { return '<p>' + esc(x.trim()) + '</p>'; }).join('');
    var roles = g.roles.length > 1 && Object.keys(g.instructions.roles).length ? '<ul class="gm-roles">' + g.roles.map(function (r) { var t = g.instructions.roles[r.id]; return t ? '<li><strong>' + esc(r.label) + '.</strong> ' + esc(t) + '</li>' : ''; }).join('') + '</ul>' : '';
    var pr = g.practiceRounds ? '<p>' + ui.Th('game_practice_note') + ' (' + g.practiceRounds + ')</p>' : '';
    return text + roles + payoffTable(g, ui) + pr + paymentRule(g, ui);
  }

  // ---------- helpers for the screens ----------
  function setProgress(ctx, s) {
    var el = document.getElementById('progress'), g = ctx.plan.game, r = ctx.index, T = ctx.ui.T;
    if (!el) return;
    el.textContent = r < g.practiceRounds ? T('game_round_practice', { i: r + 1, n: g.practiceRounds }) : T('progress_trial', { i: r - g.practiceRounds + 1, n: g.rounds });
  }
  function roleBlock(ctx, role, label) {
    var g = ctx.plan.game, ui = ctx.ui, t = g.instructions.roles[role];
    return '<p class="gm-role">' + ui.Th('game_role_label', { role: label }) + '</p>' + (t ? '<p>' + ui.esc(t) + '</p>' : '');
  }
  function shownBlock(ctx, shown) {
    if (!shown || !shown.length) return '';
    var dec = lookup(ctx.plan.game), ui = ctx.ui;
    return '<div class="gm-shown" role="group" aria-label="' + ui.esc(ui.T('game_shown')) + '"><p class="gm-shown-h">' + ui.Th('game_shown') + '</p><ul>' + shown.map(function (x) {
      return '<li>' + ui.esc(dec[x.id] ? dec[x.id].label : x.id) + (x.by ? ' (' + ui.esc(x.by) + ')' : '') + ': <strong>' + ui.esc(listText(dec, x.id, x.value)) + '</strong></li>';
    }).join('') + '</ul></div>';
  }
  function noticeBlock(ctx, notices) { return notices && notices.indexOf('left') >= 0 ? '<p class="soft" role="status">' + ctx.ui.Th('game_notice_left') + '</p>' : ''; }

  // One decision control (radio buttons for choices, a labelled number box for numbers).
  var cid = 0;
  function control(ui, spec, name, legend) {
    if (spec.kind === 'choice') return ui.choiceGroup(name, legend, spec.options.map(function (o) { return [o.value, ui.esc(o.label)]; }));
    var id = 'gm' + (++cid);
    return '<div class="q-group" data-name="' + name + '"><label class="q" for="' + id + '">' + legend + '</label><input type="text" inputmode="decimal" autocomplete="off" class="num" id="' + id + '" data-name="' + name + '" aria-describedby="' + id + 'h">' +
      '<p class="muted help" id="' + id + 'h">' + num(spec.min) + ' to ' + num(spec.max) + (spec.step !== 1 ? ' in steps of ' + num(spec.step) : '') + '</p></div>';
  }
  function readControl(root, spec, name) {
    if (spec.kind === 'choice') { var r = root.querySelector('input[type=radio][name="' + name + '"]:checked'); return r ? r.value : null; }
    var el = root.querySelector('input.num[data-name="' + name + '"]'); if (!el) return null;
    var t = el.value.trim().replace(/,/g, ''); if (t === '' || !isFinite(Number(t))) return NaN;
    return Number(t);
  }
  function inRange(spec, v) {
    if (spec.kind === 'choice') return v != null;
    if (v == null || isNaN(v) || v < spec.min - 1e-9 || v > spec.max + 1e-9) return false;
    var q = (v - spec.min) / spec.step; return Math.abs(q - Math.round(q)) < 1e-6;
  }

  // The decision form for a poll's `entries`. Returns { html, read() -> { values } | { missing: [names] } }.
  function decisionForm(ctx, entries) {
    var ui = ctx.ui, esc = ui.esc, html = '', parts = [];
    entries.forEach(function (e, ei) {
      html += '<section class="gm-stage" aria-labelledby="gm-st' + ei + '">' + (entries.length > 1 ? '<h3 id="gm-st' + ei + '">' + esc(e.label) + '</h3>' : '<span id="gm-st' + ei + '" class="sr">' + esc(e.label) + '</span>');
      if (e.prompt) html += '<p>' + esc(e.prompt) + '</p>';
      if (e.strategy && e.strategy.form === 'threshold') {
        var s = e.strategy, nm = 'th' + ei, id = 'gm' + (++cid);
        html += '<div class="q-group" data-name="' + nm + '"><label class="q" for="' + id + '">' + ui.Th('game_threshold_label', { what: s.onLabel.toLowerCase() }) + '</label><input type="text" inputmode="decimal" autocomplete="off" class="num" id="' + id + '" data-name="' + nm + '" aria-describedby="' + id + 'h">' +
          '<p class="muted help" id="' + id + 'h">' + num(s.min) + ' to ' + num(s.max + s.step) + '. ' + esc((s.options || []).filter(function (o) { return o.value === s.above; }).map(function (o) { return o.label; })[0] || '') + ' at or above your number, ' + esc((s.options || []).filter(function (o) { return o.value === s.below; }).map(function (o) { return o.label; })[0] || '') + ' below it.</p></div>';
        parts.push({ kind: 'threshold', e: e, name: nm, spec: { kind: 'number', min: s.min, max: s.max + s.step, step: s.step } });
      } else if (e.strategy) {
        html += '<p class="muted">' + ui.Th('game_strategy_intro') + '</p><div class="table-scroll"><table class="gm-table gm-strategy"><caption class="sr">' + esc(e.label) + '</caption><tbody>';
        e.strategy.rows.forEach(function (row, ri) {
          var nm = 'row' + ei + '_' + ri;
          html += '<tr><th scope="row">' + esc(e.strategy.onLabel) + ': ' + esc(num(row.observed)) + '</th><td>' + control(ui, row.spec, nm, esc(row.spec.label)) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        parts.push({ kind: 'table', e: e });
      } else e.decisions.forEach(function (d) { html += control(ui, d, d.id, esc(d.label)); parts.push({ kind: 'one', d: d }); });
      html += '</section>';
    });
    return {
      html: html,
      read: function (root) {
        var values = {}, missing = [];
        parts.forEach(function (p) {
          if (p.kind === 'one') { var v = readControl(root, p.d, p.d.id); if (!inRange(p.d, v)) missing.push(p.d.id); else values[p.d.id] = v; }
          else if (p.kind === 'threshold') { var t = readControl(root, p.spec, p.name); if (!inRange(p.spec, t)) missing.push(p.name); else values[p.e.decisions[0].id] = { threshold: t }; }
          else {
            var table = {};
            p.e.strategy.rows.forEach(function (row, ri) {
              var ei = entries.indexOf(p.e), nm = 'row' + ei + '_' + ri, v = readControl(root, row.spec, nm);
              if (!inRange(row.spec, v)) missing.push(nm); else table[String(row.observed)] = v;
            });
            values[p.e.decisions[0].id] = { table: table };
          }
        });
        return missing.length ? { missing: missing } : { values: values };
      }
    };
  }

  // ---------- the run of one round ----------
  function runTrial(ctx, ui) {
    ctx.ui = ui;
    if (G.run) endRun(G.run);
    var run = G.run = { index: ctx.index, ctx: ctx, hb: null, timers: [], key: null, skew: 0, offerHiddenUntil: 0, t0: 0, hidden: 0, hiddenAt: null, needHistory: ctx.index > 0 && G.history.filter(Boolean).length < ctx.index };
    setProgress(ctx);
    run.visHandler = function () { if (document.hidden) run.hiddenAt = performance.now(); else { if (run.hiddenAt != null) run.hidden += performance.now() - run.hiddenAt; run.hiddenAt = null; if (G.run === run) pollNow(run); } };
    document.addEventListener('visibilitychange', run.visHandler);
    poll(run);
  }
  function alive(run) { return G.run === run; }
  function clearPollTimers(run) { run.timers.forEach(clearTimeout); run.timers = []; }
  function clearTimers(run) { clearPollTimers(run); if (run.tick) { clearInterval(run.tick); run.tick = null; } }
  function endRun(run) { clearTimers(run); document.removeEventListener('visibilitychange', run.visHandler); if (G.run === run) G.run = null; }
  function pollNow(run) { poll(run); }
  function schedule(run, ms) { if (!alive(run)) return; run.timers.push(setTimeout(function () { if (alive(run)) poll(run); }, document.hidden ? Math.max(ms, 5000) : ms)); }

  function poll(run) {
    clearPollTimers(run);   // one polling chain at a time, whatever started this poll
    var ctx = run.ctx, ui = ctx.ui, game = ctx.plan.game, seq = run.seq = (run.seq || 0) + 1;
    ui.call('game/poll', { round: ctx.index, hb: run.hb, needHistory: run.needHistory }).then(function (s) {
      if (!alive(run) || seq !== run.seq) return;   // a newer poll is already on its way
      if (s.serverNow) run.skew = s.serverNow - Date.now();
      if (s.error === 'network' || s.error === 'server_error' || s.error === 'busy') { banner(ctx, 'Connection problem. Trying again.'); return schedule(run, 2000); }
      if (s.error) { ui.show('<h1>' + ui.Th('instr_title') + '</h1>' + ui.errorBox(s.error === 'content_changed' ? 'The study was changed while you were waiting. Please contact the research team.' : 'Something went wrong (' + s.error + '). Reload the page to continue.')); return; }
      banner(ctx, '');
      handle(run, s);
    });
  }
  function banner(ctx, msg) {
    var el = document.getElementById('gm-banner');
    if (msg && !el) { var d = document.createElement('p'); d.id = 'gm-banner'; d.className = 'error'; d.setAttribute('role', 'status'); ctx.ui.stage.insertBefore(d, ctx.ui.stage.firstChild); el = d; }
    if (el) { if (msg) el.textContent = msg; else el.remove(); }
  }
  function fresh(run, key) { var f = run.key !== key; run.key = key; return f; }

  function handle(run, s) {
    var ctx = run.ctx, ui = ctx.ui, game = ctx.plan.game;
    run.hb = s.phase === 'lobby' ? s.hb : null;
    if (s.phase === 'comprehension') return screenComp(run, s);
    if (s.phase === 'lobby') return screenLobby(run, s);
    if (s.phase === 'ready') return screenReady(run, s);
    if (s.phase === 'play') return screenPlay(run, s);
    if (s.phase === 'wait') return screenWait(run, s);
    if (s.phase === 'feedback') return screenFeedback(run, s);
    if (s.phase === 'fee') return screenFee(run, s);
    if (s.phase === 'async') return screenAsync(run, s);
    if (s.phase === 'saved') return finish(run, {});
    if (s.phase === 'sync') return schedule(run, 1000);
    schedule(run, 1500);
  }
  function pollMs(run) { return (run.ctx.plan.game.pollSeconds || 2) * 1000; }

  // ----- comprehension check -----
  function screenComp(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game;
    clearTimers(run);
    if (!fresh(run, 'comp:' + s.attemptsLeft)) return;
    var qs = s.questions.map(function (q) { return ui.questionHtml({ id: q.id, text: q.text, type: 'number' }); }).join('');
    ui.show('<h1>' + ui.Th('game_comp_title') + '</h1><p>' + ui.Th('game_comp_intro', { n: s.attemptsLeft }) + '</p>' + qs + '<div id="gm-msg" role="alert"></div>' +
      '<details class="gm-again"><summary>Read the instructions again</summary>' + instructions(ctx.plan, ui) + '</details><div class="actions"><button id="gm-go">' + ui.Th('game_comp_button') + '</button></div>');
    var answers = {}, root = ui.stage;
    ui.wire(root, function (n, v) { answers[n] = v; });
    if (run.compMsg) { document.getElementById('gm-msg').innerHTML = ui.errorBox(run.compMsg); ui.flag(root, run.compWrong || [], false); }
    document.getElementById('gm-go').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      ui.call('game/check', { answers: answers }).then(function (r) {
        if (!alive(run)) return;
        if (r.error) { btn.disabled = false; document.getElementById('gm-msg').innerHTML = ui.errorBox('Could not check your answers. Try again.'); return; }
        if (r.retry) { btn.disabled = false; return; }   // a duplicate request for the same attempt: nothing was scored
        if (r.passed || r.failed) { run.key = null; return poll(run); }
        run.compMsg = ui.T('game_comp_wrong', { left: r.attemptsLeft }); run.compWrong = r.wrong; run.key = null; poll(run);
      });
    });
  }

  // ----- waiting room -----
  function screenLobby(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game, now = Date.now() + run.skew;
    if (s.noshow) {
      clearTimers(run);
      if (fresh(run, 'lobby:noshow')) {
        ui.show('<h1>' + ui.Th('game_noshow_title') + '</h1><p>' + ui.Th('game_noshow_body') + '</p><div id="gm-msg" role="alert"></div><div class="actions"><button id="gm-go">' + ui.Th('game_noshow_button') + '</button></div>');
        document.getElementById('gm-go').addEventListener('click', function () { this.disabled = true; ui.call('game/rejoin', {}).then(function () { if (alive(run)) { run.key = null; poll(run); } }); });
      }
      return;
    }
    if (s.present != null) run.present = s.present;
    run.waitStart = now - s.waitedMs;
    var over = !!s.fallback && Date.now() >= run.offerHiddenUntil;
    if (fresh(run, 'lobby:' + (over ? 'over' : 'wait') + (s.returned ? ':ret' : ''))) {
      var fbBtn = s.fallback === 'async' ? ui.Th('game_fallback_async') : ui.Th('game_fallback_fee');
      ui.show('<h1>' + ui.Th(over ? 'game_timeout_title' : 'game_lobby_title') + '</h1>' + (s.returned ? '<p class="soft" role="status">' + ui.Th('game_lobby_returned') + '</p>' : '') +
        (over ? '<p>' + ui.Th('game_timeout_body') + '</p>' : '<p>' + ui.Th('game_lobby_body', { m: g.players }) + '</p>') +
        '<p class="gm-count" id="gm-count" aria-live="polite"></p><p class="muted" id="gm-elapsed"></p>' +
        (over ? '<div class="actions split"><button class="secondary" id="gm-keep">' + ui.Th('game_keep_waiting') + '</button><button id="gm-fb">' + fbBtn + '</button></div>' : '') + '<div id="gm-msg" role="alert"></div>');
      if (over) {
        document.getElementById('gm-keep').addEventListener('click', function () { run.offerHiddenUntil = Date.now() + 60000; run.key = null; poll(run); });
        document.getElementById('gm-fb').addEventListener('click', function () {
          this.disabled = true;
          ui.call('game/fallback', { to: s.fallback }).then(function (r) { if (!alive(run)) return; if (r.error && r.error !== 'already_matched') { document.getElementById('gm-msg').innerHTML = ui.errorBox('Could not do that yet. Try again in a moment.'); document.getElementById('gm-fb').disabled = false; return; } run.key = null; poll(run); });
        });
      }
      run.tick = setInterval(function () { var e = document.getElementById('gm-elapsed'); if (e && alive(run)) e.textContent = ui.T('game_lobby_elapsed', { time: fmtTime(Date.now() + run.skew - run.waitStart) }); }, 1000);
    }
    var c = document.getElementById('gm-count'); if (c) c.textContent = ui.T('game_lobby_count', { n: Math.min(run.present == null ? 1 : run.present, g.players), m: g.players });
    var e = document.getElementById('gm-elapsed'); if (e) e.textContent = ui.T('game_lobby_elapsed', { time: fmtTime(Date.now() + run.skew - run.waitStart) });
    schedule(run, pollMs(run));
  }

  // ----- match confirmation -----
  function screenReady(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game;
    if (fresh(run, 'ready:' + s.iAmReady)) {
      ui.show('<h1>' + ui.Th('game_ready_title') + '</h1><p>' + ui.Th('game_ready_body', { role: s.roleLabel }) + '</p>' + roleBlock(ctx, s.role, s.roleLabel) +
        (s.iAmReady ? '<p aria-live="polite" id="gm-rw">' + ui.Th('game_ready_wait', { k: s.ready, n: s.size }) + '</p>' : '<div class="actions"><button id="gm-go">' + ui.Th('game_ready_button') + '</button></div>') + '<div id="gm-msg" role="alert"></div>');
      var b = document.getElementById('gm-go');
      if (b) b.addEventListener('click', function () {
        this.disabled = true;
        ui.call('game/ready', { cid: s.cid }).then(function (r) { if (!alive(run)) return; if (r.error) { b.disabled = false; document.getElementById('gm-msg').innerHTML = ui.errorBox('Could not confirm. Try again.'); return; } run.key = null; poll(run); });
      });
    }
    var w = document.getElementById('gm-rw'); if (w) w.textContent = ui.T('game_ready_wait', { k: s.ready, n: s.size });
    schedule(run, pollMs(run));
  }

  // ----- a decision -----
  function timerHtml(ui) { return '<p class="gm-time" id="gm-time"></p>'; }
  function startClock(run, deadlineAt) {
    var ui = run.ctx.ui;
    function show() {
      var el = document.getElementById('gm-time'); if (!el || !alive(run)) return;
      var left = deadlineAt - (Date.now() + run.skew);
      el.textContent = left > 0 ? ui.T('game_time_left', { time: fmtTime(left) }) : ui.T('game_time_over');
    }
    if (run.tick) clearInterval(run.tick);
    show(); run.tick = setInterval(show, 1000);
  }
  function screenPlay(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game, esc = ui.esc;
    var key = 'play:' + s.round + ':' + s.step;
    if (fresh(run, key)) {
      run.t0 = performance.now(); run.hidden = 0;
      if (run.hiddenAt != null) run.hiddenAt = run.t0;   // drawn while the tab was hidden: count hidden time from now, not from before the screen existed
      var form = decisionForm(ctx, s.entries), head = s.entries.length === 1 ? s.entries[0].label : g.stages[0].label;
      ui.show('<h1>' + esc(head) + '</h1>' + (s.practice ? '<p class="soft">' + ui.Th('game_practice_note') + '</p>' : '') + noticeBlock(ctx, s.notices) + roleBlock(ctx, s.role, s.roleLabel) + shownBlock(ctx, s.shown) + timerHtml(ui) +
        '<div id="gm-form">' + form.html + '</div><div id="gm-msg" role="alert"></div><div class="actions"><button id="gm-go">' + ui.Th('game_submit') + '</button></div><p class="muted" id="gm-progress" aria-live="polite"></p>');
      startClock(run, s.deadlineAt);
      var go = document.getElementById('gm-go');
      go.addEventListener('click', function () {
        var r = form.read(ui.stage);
        if (r.missing) { ui.flag(ui.stage, r.missing, true); document.getElementById('gm-msg').innerHTML = ui.errorBox('Please give a valid answer for each highlighted decision.'); return; }
        go.disabled = true; ui.stage.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
        ui.call('game/move', { cid: s.cid, round: s.round, step: s.step, values: r.values, rtMs: Math.round(performance.now() - run.t0), hiddenMs: Math.round(run.hidden) }).then(function (m) {
          if (!alive(run)) return;
          if (m.error && m.error !== 'late') { go.disabled = false; ui.stage.querySelectorAll('input').forEach(function (i) { i.disabled = false; }); document.getElementById('gm-msg').innerHTML = ui.errorBox(m.message || 'That decision could not be saved. Check it and try again.'); return; }
          run.key = null; poll(run);
        });
      });
    }
    var p = document.getElementById('gm-progress'); if (p && s.of > 1) p.textContent = ui.T('game_wait_others', { k: s.moved, n: s.of });
    schedule(run, pollMs(run));
  }

  // ----- waiting during a round -----
  function screenWait(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game;
    var msg;
    if (s.reason === 'dropped') msg = ui.T('game_wait_dropped');
    else if (s.reason === 'arrivals' || s.reason === 'previous') msg = ui.T('game_wait_arrivals', { k: s.arrived != null ? s.arrived : 0, n: s.of != null ? s.of : g.players });
    else if (s.reason === 'turn') msg = ui.T('game_wait_turn', { who: (s.waitingFor || []).join(', ') || 'the other participants' });
    else msg = ui.T('game_wait_others', { k: s.moved, n: s.of });
    if (fresh(run, 'wait:' + s.reason + ':' + s.step)) {
      clearInterval(run.tick); run.tick = null;
      ui.show('<h1>' + ui.Th(s.reason === 'arrivals' || s.reason === 'previous' ? 'game_wait_title_round' : 'game_wait_title') + '</h1>' + noticeBlock(ctx, s.notices) + roleBlock(ctx, s.role, s.roleLabel) + '<p id="gm-wait" aria-live="polite"></p>');
    }
    var w = document.getElementById('gm-wait'); if (w) w.textContent = msg;
    schedule(run, pollMs(run));
  }

  // ----- results -----
  function feedbackTable(ctx, rec) {
    var g = ctx.plan.game, ui = ctx.ui, esc = ui.esc, dec = lookup(g), rows = '';
    rec.stages.forEach(function (st, si) {
      var spec = g.stages[si];
      spec.decisions.forEach(function (d) {
        var mine = st.acting ? (st.values && st.values[d.id] != null ? valueText(dec, d.id, st.values[d.id]) : '') : '';
        var others = st.others ? st.others.map(function (o) { return o.values && o.values[d.id] != null ? valueText(dec, d.id, o.values[d.id]) : null; }).filter(function (x) { return x != null; }).join(', ') : null;
        if (!mine && !others) return;
        rows += '<tr><th scope="row">' + esc(d.label) + '</th><td>' + esc(mine) + (st.auto ? ' <span class="muted">' + ui.Th('game_auto') + '</span>' : '') + '</td>' + (g.feedback.othersDecisions ? '<td>' + esc(others || '') + '</td>' : '') + '</tr>';
      });
    });
    if (!rows) return '';
    return '<div class="table-scroll"><table class="gm-table"><thead><tr><th scope="col"><span class="sr">Decision</span></th><th scope="col">' + ui.Th('game_feedback_you') + '</th>' + (g.feedback.othersDecisions ? '<th scope="col">' + ui.Th('game_feedback_others') + '</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function historyTable(ctx, list) {
    var g = ctx.plan.game, ui = ctx.ui;
    if (!g.feedback.history || !list.length) return '';
    var cols = []; g.stages.forEach(function (st) { st.decisions.forEach(function (d) { cols.push(d); }); });
    var dec = lookup(g);
    var head = '<tr><th scope="col">Round</th>' + cols.map(function (d) { return '<th scope="col">' + ui.esc(d.label) + '</th>'; }).join('') + (g.feedback.ownPayoff ? '<th scope="col">Points</th>' : '') + '</tr>';
    var body = list.map(function (h) {
      if (!h.played) return '<tr><td colspan="' + (cols.length + 2) + '">' + ui.Th('game_not_played') + '</td></tr>';
      return '<tr><th scope="row">' + (h.practice ? 'P' + h.roundNo : h.roundNo) + '</th>' + cols.map(function (d) {
        var cell = '';
        h.stages.forEach(function (st) { if (st.values && st.values[d.id] != null) cell = valueText(dec, d.id, st.values[d.id]); });
        return '<td>' + ui.esc(cell) + '</td>';
      }).join('') + (g.feedback.ownPayoff ? '<td>' + (h.payoff == null ? '' : num(h.payoff)) + '</td>' : '') + '</tr>';
    }).join('');
    return '<h3>' + ui.Th('game_history_title') + '</h3><div class="table-scroll"><table class="gm-table">' + head + body + '</table></div>';
  }
  function summaryHtml(ui, r) {
    if (!r || r.error) return '';
    var out = '<h3>' + ui.Th('game_summary_title') + '</h3>';
    if (r.points == null) return out + '<p>' + ui.Th('game_summary_pending') + '</p>';
    out += '<p>' + (r.method === 'randomRound' ? ui.Th('game_summary_round', { round: r.paidRound, points: num(r.points) }) : ui.Th('game_summary_total', { points: num(r.points) })) + '</p>';
    out += '<p>' + ui.Th('game_summary_bonus', { bonus: Number(r.bonus).toFixed(2), currency: r.currency }) + (r.fee ? ' ' + ui.Th('game_summary_fee', { fee: Number(r.fee).toFixed(2), currency: r.currency }) : '') + '</p>';
    return out;
  }
  function screenFeedback(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game, rec = s.record;
    clearTimers(run);
    if (s.history) { G.history = s.history.slice(); run.needHistory = false; }
    if (!rec.played) return finish(run, {});
    if (!fresh(run, 'fb:' + ctx.index)) return;
    if (!G.history[ctx.index]) G.history[ctx.index] = rec;
    var title = rec.practice ? ui.T('game_round_practice', { i: rec.roundNo, n: g.practiceRounds }) : ui.T('game_feedback_title', { i: rec.roundNo });
    var body = '<h1>' + ui.esc(title) + '</h1>' + (s.dropped ? '<p class="soft" role="status">' + ui.Th('game_wait_dropped') + '</p>' : '') + noticeBlock(ctx, s.notices) + feedbackTable(ctx, rec) +
      (rec.payoff != null ? '<p class="gm-points">' + ui.Th('game_feedback_payoff', { points: num(rec.payoff) }) + '</p>' : '') + (rec.groupTotal != null ? '<p>' + ui.Th('game_feedback_total', { points: num(rec.groupTotal) }) + '</p>' : '') +
      historyTable(ctx, G.history.filter(Boolean).slice(0, ctx.index)) + (s.last ? '<div id="gm-sum"></div>' : '') + '<div id="gm-msg" role="alert"></div><div class="actions"><button id="gm-go">' + ui.Th(s.last ? 'game_feedback_last' : 'game_feedback_next') + '</button></div>';
    ui.show(body);
    if (s.last) ui.call('game/summary', {}).then(function (r) { var el = document.getElementById('gm-sum'); if (el && alive(run)) el.innerHTML = summaryHtml(ui, r); });
    var b = document.getElementById('gm-go');
    b.addEventListener('click', function () { b.disabled = true; finish(run, {}, function (err) { b.disabled = false; document.getElementById('gm-msg').innerHTML = ui.errorBox(err); }); });
  }

  // ----- no game for this participant -----
  function screenFee(run, s) {
    var ctx = run.ctx, ui = ctx.ui;
    clearTimers(run);
    if (G.feeShown) return finish(run, {});
    G.feeShown = true; run.key = 'fee';
    var failed = s.reason === 'comprehension';
    ui.show('<h1>' + ui.Th(failed ? 'game_comp_failed_title' : 'game_fee_title') + '</h1><p>' + ui.Th(failed ? 'game_comp_failed_body' : 'game_fee_body') + '</p><div id="gm-msg" role="alert"></div><div class="actions"><button id="gm-go">' + ui.Th('game_feedback_last') + '</button></div>');
    var b = document.getElementById('gm-go');
    b.addEventListener('click', function () { b.disabled = true; finish(run, {}, function (err) { b.disabled = false; document.getElementById('gm-msg').innerHTML = ui.errorBox(err); }); });
  }

  // ----- asynchronous round -----
  function screenAsync(run, s) {
    var ctx = run.ctx, ui = ctx.ui, g = ctx.plan.game, esc = ui.esc;
    clearTimers(run);
    var intro = !G.roleShown;
    if (!fresh(run, 'async:' + ctx.index + ':' + intro)) return;
    var title = s.practice ? ui.T('game_round_practice', { i: s.roundNo, n: g.practiceRounds }) : ui.T('progress_trial', { i: s.roundNo, n: g.rounds });
    if (intro) {
      G.roleShown = true; run.key = 'async-intro';
      ui.show('<h1>' + ui.Th('game_async_intro_title') + '</h1>' + roleBlock(ctx, s.role, s.roleLabel) + '<div class="actions"><button id="gm-go">' + ui.Th('begin_button') + '</button></div>');
      document.getElementById('gm-go').addEventListener('click', function () { run.key = null; screenAsync(run, s); });
      return;
    }
    if (s.passive) {
      ui.show('<h1>' + esc(title) + '</h1>' + roleBlock(ctx, s.role, s.roleLabel) + '<p>' + ui.Th('game_passive') + '</p><div id="gm-msg" role="alert"></div><div class="actions"><button id="gm-go">' + ui.Th('game_feedback_last') + '</button></div>');
      var pb = document.getElementById('gm-go');
      pb.addEventListener('click', function () { pb.disabled = true; finish(run, { values: {}, rtMs: 0 }, function (err) { pb.disabled = false; document.getElementById('gm-msg').innerHTML = ui.errorBox(err); }); });
      return;
    }
    var form = decisionForm(ctx, s.entries), t0 = performance.now(); run.hidden = 0;
    if (run.hiddenAt != null) run.hiddenAt = t0;   // as above: hidden time starts with this screen
    ui.show('<h1>' + esc(s.entries.length === 1 ? s.entries[0].label : title) + '</h1>' + (s.practice ? '<p class="soft">' + ui.Th('game_practice_note') + '</p>' : '') + roleBlock(ctx, s.role, s.roleLabel) + '<div id="gm-form">' + form.html + '</div>' +
      '<div id="gm-msg" role="alert"></div><div class="actions"><button id="gm-go">' + ui.Th('game_submit') + '</button></div>');
    var go = document.getElementById('gm-go');
    go.addEventListener('click', function () {
      var r = form.read(ui.stage);
      if (r.missing) { ui.flag(ui.stage, r.missing, true); document.getElementById('gm-msg').innerHTML = ui.errorBox('Please give a valid answer for each highlighted decision.'); return; }
      go.disabled = true;
      finish(run, { values: r.values, rtMs: Math.round(performance.now() - t0), hiddenMs: Math.round(run.hidden) }, function (err) { go.disabled = false; document.getElementById('gm-msg').innerHTML = ui.errorBox(err); });
    });
  }

  // The engine saves the trial (the server confirms the round or stores the decisions) and moves on.
  function finish(run, fields, onError) {
    var ctx = run.ctx;
    clearTimers(run);
    ctx.submit(fields, function (err) { if (onError) onError(err); else schedule(run, 2000); });
  }

  LabEngine.registerType('game', { instructions: instructions, runTrial: runTrial });
})();
