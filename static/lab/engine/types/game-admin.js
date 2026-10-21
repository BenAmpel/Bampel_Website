/* Study type "game": admin editors (presets, game, stages, payoffs and constants, treatments, feedback and payment,
   instructions, understanding check, advanced JSON), the pilot report, and the "Game operations" tab (live status,
   pending matches, groups and payments downloads). Loaded by static/lab/engine/admin.js. */
(function () {
  'use strict';
  var ROLE_ID = /^[a-z][a-z0-9_]{0,30}$/;
  function g(A) { return A.draft.game; }
  function roles(A) { return g(A).roles; }
  function allDecisions(A) { var out = []; g(A).stages.forEach(function (st, si) { st.decisions.forEach(function (d, di) { out.push({ d: d, st: st, si: si, di: di }); }); }); return out; }
  function slug(prefix, list, key) { var n = list.length + 1, id = prefix + n; while (list.some(function (x) { return x[key] === id; })) id = prefix + (++n); return id; }

  // ----- helpers that keep references consistent when an ID changes -----
  function renameRole(A, from, to) {
    var d = A.draft;
    g(A).stages.forEach(function (st) { if (st.role === from) st.role = to; });
    if (d.payoff && from in d.payoff) { d.payoff[to] = d.payoff[from]; delete d.payoff[from]; }
    if (d.instructions.roles && from in d.instructions.roles) { d.instructions.roles[to] = d.instructions.roles[from]; delete d.instructions.roles[from]; }
    var re = new RegExp('\\brole\\.' + from + '\\.', 'g');
    Object.keys(d.payoff).forEach(function (k) { d.payoff[k] = String(d.payoff[k]).replace(re, 'role.' + to + '.'); });
  }
  function renameDecision(A, from, to) {
    var d = A.draft;
    g(A).stages.forEach(function (st) {
      st.show = (st.show || []).map(function (x) { return x === from ? to : x; });
      if (st.strategyMethod && st.strategyMethod.on === from) st.strategyMethod.on = to;
      st.decisions.forEach(function (dc) { ['min', 'max'].forEach(function (k) { if (typeof dc[k] === 'string') dc[k] = dc[k].replace(new RegExp('\\bseen\\.' + from + '\\b', 'g'), 'seen.' + to); }); });
    });
    var re = new RegExp('\\b(my|others|other|seen)\\.' + from + '\\b', 'g'), re2 = new RegExp('(\\brole\\.[a-z][a-z0-9_]*)\\.' + from + '\\b', 'g');
    Object.keys(d.payoff).forEach(function (k) { d.payoff[k] = String(d.payoff[k]).replace(re, '$1.' + to).replace(re2, '$1.' + to); });
  }
  function renameStage(A, from, to) { /* stage IDs are only labels in the data; nothing refers to them */ }
  function renameParam(A, from, to) {
    var d = A.draft, re = new RegExp('\\b' + from + '\\b', 'g');
    d.params[to] = d.params[from]; delete d.params[from];
    d.conditions.forEach(function (c) { if (from in c.params) { c.params[to] = c.params[from]; delete c.params[from]; } });
    Object.keys(d.payoff).forEach(function (k) { d.payoff[k] = String(d.payoff[k]).replace(re, to); });
    g(A).stages.forEach(function (st) {
      st.prompt = (st.prompt || '').replace(new RegExp('\\{' + from + '\\}', 'g'), '{' + to + '}');
      st.decisions.forEach(function (dc) { ['min', 'max'].forEach(function (k) { if (typeof dc[k] === 'string') dc[k] = dc[k].replace(re, to); }); });
    });
    d.instructions.general = (d.instructions.general || '').replace(new RegExp('\\{' + from + '\\}', 'g'), '{' + to + '}');
    Object.keys(d.instructions.roles || {}).forEach(function (k) { d.instructions.roles[k] = d.instructions.roles[k].replace(new RegExp('\\{' + from + '\\}', 'g'), '{' + to + '}'); });
  }

  // ----- tabs -----
  function renderPresets(A) {
    var presets = (A.meta() || {}).presets || [], esc = A.esc;
    return '<p class="muted">A preset replaces the game design in this draft (game settings, payoffs, constants, treatments, feedback, payment, and instructions). Your consent text, surveys, and screen text are kept. Everything stays editable on the other tabs, and nothing changes for participants until you save. Sources are listed in the README (section "Economic games").</p>' +
      presets.map(function (p) {
        return '<div class="qcard"><div class="bar"><strong>' + esc(p.label) + '</strong><div class="btns">' + A.btn('data-preset="' + esc(p.id) + '"', 'Use this preset') + '</div></div><p class="muted" style="margin:0">' + esc(p.description) + '</p></div>';
      }).join('');
  }

  function renderGame(A) {
    var G = g(A), esc = A.esc, f = A.field, n = A.num, sel = A.sel, btn = A.btn;
    var players = G.roles.reduce(function (a, r) { return a + (Number(r.count) || 0); }, 0);
    var h = '<h3 style="margin:0 0 8px">How people play</h3><div class="grid3">' +
      f('Mode', sel('game.mode', G.mode, [['live', 'Live: matched in real time, round by round'], ['async', 'Asynchronous: decide alone, matched with stored decisions']])) +
      f('Rounds that count', n('game.rounds', G.rounds, 1, 50)) + f('Practice rounds (not paid)', n('game.practiceRounds', G.practiceRounds, 0, 10)) + '</div>' +
      '<p class="muted">Live play needs several people at once: use test codes in several browser tabs to pilot it. Asynchronous play works with one person at a time; later movers state a response for every possible earlier move (strategy method), and each participant is matched with stored decisions of earlier participants when they finish.</p>' +
      '<h3 style="margin:20px 0 8px">Roles and group size</h3><p class="muted">Players per group: <strong>' + players + '</strong> (the sum of the players in each role; 1 to 12). A role without any stage is passive (for example the recipient in a dictator game).</p>' +
      G.roles.map(function (r, i) {
        return '<div class="row" style="margin-bottom:6px"><label>ID <input type="text" class="mono" data-roleid="' + i + '" value="' + esc(r.id) + '" style="width:140px"></label>' +
          '<label style="flex:1;min-width:180px">Label shown to players ' + A.inp('game.roles.' + i + '.label', r.label, ' style="width:100%"') + '</label>' +
          '<label>Players with this role ' + n('game.roles.' + i + '.count', r.count, 1, 12) + '</label>' + btn('data-rmrole="' + i + '"', 'Remove', 'danger secondary', G.roles.length === 1) + '</div>';
      }).join('') + (G.roles.length < 6 ? btn('data-addrole="1"', 'Add a role') : '') +
      '<h3 style="margin:20px 0 8px">Matching</h3><div class="grid3">' +
      f('Who plays together', sel('game.matching', G.matching, [['partners', 'Partners: the same group every round'], ['strangers', 'Strangers: groups re-formed every round'], ['perfectStrangers', 'Perfect strangers: nobody meets twice'], ['none', 'None (a one-player task)']])) +
      f('Groups per matching cohort (strangers only)', n('game.cohortGroups', G.cohortGroups, 1, 12)) + '</div>' +
      '<p class="muted">Strangers and perfect strangers re-mix people inside a cohort of this many groups, so a cohort needs players × groups people. With one group, strangers is the same as partners. Perfect strangers needs enough groups for the number of rounds; the check on the Advanced tab tells you the smallest workable number. Each participant keeps their role for the whole game.</p>' +
      '<h3 style="margin:20px 0 8px">Time limits</h3><div class="grid3">' +
      f('Seconds to decide', n('game.decisionSeconds', G.decisionSeconds, 5, 600)) + f('Seconds to read the results before the next round starts anyway', n('game.feedbackSeconds', G.feedbackSeconds, 5, 300)) +
      f('Seconds to confirm a match (live)', n('game.readySeconds', G.readySeconds, 10, 300)) + f('Longest wait for a group (seconds, live)', n('game.waitMaxSeconds', G.waitMaxSeconds, 10, 3600)) +
      f('Screen refresh (seconds between server checks)', n('game.pollSeconds', G.pollSeconds, 1, 5)) + '</div>' +
      '<h3 style="margin:20px 0 8px">When nobody comes, or someone stops</h3><div class="grid3">' +
      f('After the longest wait, offer', sel('game.waitFallback', G.waitFallback, [['fee', 'Finish with the show-up fee only'], ['async', 'Play against stored decisions (asynchronous)']])) +
      f('If a player runs out of time, the server decides', sel('game.timeoutAction', G.timeoutAction, [['default', 'The default value of each decision'], ['random', 'A random valid value'], ['repeatLast', 'Their previous value (default at first)']])) +
      f('Timeouts in a row before a player counts as having left (0 = never)', n('game.dropAfterTimeouts', G.dropAfterTimeouts, 0, 10)) + '</div>' +
      '<p class="muted">A player who has left is played by the timeout rule from then on, and the others are told that a participant left. The fallback to asynchronous play needs stored decisions to match with: run an asynchronous batch first, or the match stays pending.</p>';
    return h;
  }

  function decisionCard(A, si, di) {
    var st = g(A).stages[si], d = st.decisions[di], b = 'game.stages.' + si + '.decisions.' + di, f = A.field, esc = A.esc, btn = A.btn;
    var h = '<div class="vcard"><div class="row"><label>ID <input type="text" class="mono" data-decid="' + si + '|' + di + '" value="' + esc(d.id) + '" style="width:150px"></label>' +
      '<label style="flex:1;min-width:200px">Label shown to players ' + A.inp(b + '.label', d.label, ' style="width:100%"') + '</label>' +
      '<label>Kind <select data-dkind="' + si + '|' + di + '"><option value="number"' + (d.kind === 'number' ? ' selected' : '') + '>A number</option><option value="choice"' + (d.kind === 'choice' ? ' selected' : '') + '>One of several options</option></select></label>' +
      btn('data-rmdec="' + si + '|' + di + '"', 'Remove', 'danger secondary', st.decisions.length === 1) + '</div>';
    if (d.kind === 'choice') {
      var optText = (d.options || []).map(function (o) { return o.value === o.label ? o.label : o.value + ' | ' + o.label; }).join('\n');
      h += f('Options, one per line ("saved value | text shown")', '<textarea data-opts="' + b + '" rows="3" class="mono">' + esc(optText) + '</textarea>') +
        f('Default (used if time runs out)', A.sel(b + '.default', d.default, (d.options || []).map(function (o) { return [o.value, o.label]; })));
    } else {
      h += '<div class="grid3">' + f('Smallest value (a number or a formula)', A.inp(b + '.min', d.min, ' class="mono"')) + f('Largest value (a number or a formula)', A.inp(b + '.max', d.max, ' class="mono"')) + f('Step', A.num(b + '.step', d.step, 0.0001, 1000000)) + '</div>' +
        f('Default (used if time runs out)', A.num(b + '.default', d.default, -1000000, 1000000)) +
        '<p class="muted">A limit can use constants (for example <code>endowment</code>) and, for a later stage, the decision it responds to as <code>seen.&lt;decision id&gt;</code> (for example <code>multiplier * seen.send</code>).</p>';
    }
    return h + '</div>';
  }
  function renderStages(A) {
    var G = g(A), esc = A.esc, f = A.field, btn = A.btn, ds = allDecisions(A);
    var roleOpts = G.roles.map(function (r) { return [r.id, r.label]; }).concat([['*', 'Everyone (all roles, same decisions)']]);
    var h = '<p class="muted">A round is a list of stages in order. Stages marked "at the same time as the previous stage" are collected together (simultaneous moves, or a response given with the strategy method). Otherwise each stage waits for the one before it, so sequential games (trust, ultimatum) are stages in order, each owned by a role.</p>';
    G.stages.forEach(function (st, si) {
      var b = 'game.stages.' + si, earlier = ds.filter(function (x) { return x.si < si && !x.st.strategyMethod; });
      h += '<div class="qcard"><div class="bar"><strong>Stage ' + (si + 1) + ': ' + esc(st.label) + '</strong><div class="btns">' + btn('data-stmove="' + si + '|-1"', '↑', null, si === 0) + btn('data-stmove="' + si + '|1"', '↓', null, si === G.stages.length - 1) +
        btn('data-stdup="' + si + '"', 'Duplicate') + btn('data-strm="' + si + '"', 'Remove', 'danger secondary', G.stages.length === 1) + '</div></div>' +
        '<div class="grid3">' + f('ID', '<input type="text" class="mono" data-stageid="' + si + '" value="' + esc(st.id) + '">') + f('Label', A.inp(b + '.label', st.label)) + f('Who decides', A.sel(b + '.role', st.role, roleOpts)) + '</div>' +
        (si > 0 ? A.checkbox('data-path="' + b + '.parallel" data-bool="1"', st.parallel, 'At the same time as the previous stage') : '') +
        f('Instruction shown with this decision (write {name} to insert a constant)', A.area(b + '.prompt', st.prompt || '', 2));
      if (earlier.length) {
        h += '<div class="f"><span>Show these earlier decisions (from earlier steps only)</span><div class="row">' + earlier.map(function (x) {
          return '<label class="check"><input type="checkbox" data-show="' + si + '|' + esc(x.d.id) + '"' + ((st.show || []).indexOf(x.d.id) >= 0 ? ' checked' : '') + '> ' + esc(x.d.label) + ' <span class="muted mono">' + esc(x.d.id) + '</span></label>';
        }).join('') + '</div></div>';
      }
      var sm = st.strategyMethod, onOpts = ds.filter(function (x) { return x.si < si && x.st.role !== st.role; }).map(function (x) { return [x.d.id, x.d.label + ' (' + x.d.id + ')']; });
      if (onOpts.length && st.decisions.length === 1) {
        h += A.checkbox('data-smon="' + si + '"', !!sm, 'Strategy method: the player states a response for every possible earlier move, instead of seeing the actual move');
        if (sm) {
          var d0 = st.decisions[0];
          h += '<div class="grid3">' + f('Responds to', A.sel(b + '.strategyMethod.on', sm.on, onOpts)) +
            f('Form', A.sel(b + '.strategyMethod.form', sm.form, [['table', 'A response for every value (table)'], ['threshold', 'A threshold (smallest value accepted)']])) + '</div>';
          if (sm.form === 'threshold') {
            var os = (d0.options || []).map(function (o) { return [o.value, o.label]; });
            h += '<div class="grid3">' + f('At or above the threshold', A.sel(b + '.strategyMethod.above', sm.above, os)) + f('Below the threshold', A.sel(b + '.strategyMethod.below', sm.below, os)) +
              f('Threshold used if time runs out', A.num(b + '.strategyMethod.defaultThreshold', sm.defaultThreshold || 0, -1000000, 1000000)) + '</div>' +
              '<p class="muted">The decision above must be a choice with exactly two options. The earlier decision must be a number: the player says the smallest value they accept (for example the smallest offer).</p>';
          }
        }
      }
      h += '<h3 style="margin:14px 0 6px">Decisions</h3>' + st.decisions.map(function (d, di) { return decisionCard(A, si, di); }).join('') +
        (st.decisions.length < 6 && !st.strategyMethod ? btn('data-adddec="' + si + '"', 'Add a decision') : '') + '</div>';
    });
    return h + (G.stages.length < 8 ? btn('data-addstage="1"', 'Add a stage') : '');
  }

  function renderPayoff(A) {
    var d = A.draft, G = g(A), esc = A.esc, f = A.field, btn = A.btn, ds = allDecisions(A);
    var h = '<h3 style="margin:0 0 8px">Constants</h3><p class="muted">Named numbers that formulas, decision limits, and instructions can use. Treatments (next tab) can override them.</p>' +
      Object.keys(d.params).map(function (k, i) {
        return '<div class="row" style="margin-bottom:6px"><label>Name <input type="text" class="mono" data-paramname="' + esc(k) + '" value="' + esc(k) + '" style="width:160px"></label>' +
          '<label>Value <input type="text" class="mono" data-paramval="' + esc(k) + '" value="' + esc(d.params[k]) + '" style="width:140px"></label>' + btn('data-rmparam="' + esc(k) + '"', 'Remove', 'danger secondary') + '</div>';
      }).join('') + btn('data-addparam="1"', 'Add a constant') +
      '<h3 style="margin:20px 0 8px">Payoff formulas</h3><p class="muted">One formula per role: the points that role earns in a round. Operators: <code>+ - * / ^ %</code>, parentheses, comparisons <code>== != &lt; &lt;= &gt; &gt;=</code>, <code>and</code> <code>or</code> <code>not</code>, and <code>condition ? a : b</code>. Functions: <code>min max abs round floor ceil sqrt sum mean count num</code>. Text in quotes, for example <code>my.move == \'C\'</code>.</p>';
    G.roles.forEach(function (r) {
      var mine = ds.filter(function (x) { return x.st.role === r.id || x.st.role === '*'; }).map(function (x) { return 'my.' + x.d.id; });
      var others = ds.map(function (x) { return 'others.' + x.d.id; }), byRole = ds.map(function (x) { return x.st.role === '*' ? null : 'role.' + x.st.role + '.' + x.d.id; }).filter(Boolean);
      h += f('Payoff for ' + esc(r.label) + ' (<span class="mono">' + esc(r.id) + '</span>)', '<textarea class="mono" rows="2" data-payoff="' + esc(r.id) + '">' + esc(d.payoff[r.id] || '') + '</textarea>') +
        '<p class="muted" style="margin-top:-6px">Names you can use: ' + (Object.keys(d.params).concat(['n', 'round']).concat(mine).concat(byRole).map(function (x) { return '<code>' + esc(x) + '</code>'; }).join(' ')) +
        ' and lists <code>' + esc(others.join(' ') || 'others.&lt;decision&gt;') + '</code> (for sum, mean, count)' + (g(A).roles.reduce(function (a, r2) { return a + (Number(r2.count) || 0); }, 0) === 2 ? ', and <code>other.&lt;decision&gt;</code> for the other player' : '') + '.</p>';
    });
    return h + '<div class="row"><button type="button" class="secondary" id="gm-check">Check the design</button></div><div id="gm-check-out" class="muted"></div>';
  }

  function renderTreatments(A) {
    var d = A.draft, esc = A.esc, btn = A.btn, names = Object.keys(d.params);
    var h = '<p class="muted">Each participant is assigned one condition (balanced). A condition can change the constants without any code: for example one with a multiplier of 3 and one with 2. Leave a box empty to keep the base value. The condition ID is saved in the <code>condition</code> column. In live play, groups are formed only within a condition.</p>';
    d.conditions.forEach(function (c, i) {
      h += '<div class="qcard"><div class="bar"><strong>' + esc(c.label) + '</strong><div class="btns">' + btn('data-condrm="' + i + '"', 'Remove', 'danger secondary', d.conditions.length === 1) + '</div></div>' +
        '<div class="row"><label>ID <input type="text" class="mono" data-condid="' + i + '" value="' + esc(c.id) + '" style="width:160px"></label><label style="flex:1;min-width:200px">Label ' + A.inp('conditions.' + i + '.label', c.label, ' style="width:100%"') + '</label></div>' +
        (names.length ? '<div class="row" style="margin-top:8px">' + names.map(function (k) { return '<label>' + esc(k) + ' (base ' + esc(d.params[k]) + ') <input type="text" class="mono" data-condparam="' + i + '|' + esc(k) + '" value="' + (k in c.params ? esc(c.params[k]) : '') + '" style="width:110px"></label>'; }).join('') + '</div>' : '<p class="muted">Add constants on the Payoffs tab first.</p>') + '</div>';
    });
    return h + (d.conditions.length < 8 ? btn('data-condadd="1"', 'Add a condition') : '');
  }

  function renderFeedback(A) {
    var d = A.draft, f = A.field, cb = A.checkbox;
    return '<h3 style="margin:0 0 8px">What players see after each round</h3>' +
      cb('data-path="feedback.ownPayoff" data-bool="1"', d.feedback.ownPayoff, 'Their own points for the round') + cb('data-path="feedback.othersDecisions" data-bool="1"', d.feedback.othersDecisions, 'What the others in their group decided') +
      cb('data-path="feedback.groupTotal" data-bool="1"', d.feedback.groupTotal, 'The group\'s total points for the round') + cb('data-path="feedback.history" data-bool="1"', d.feedback.history, 'A table of earlier rounds') +
      '<p class="muted">Asynchronous play shows no results during play (partners are drawn when a participant finishes). The settings control what is shown, not what is stored: the exports always contain everything.</p>' +
      '<h3 style="margin:20px 0 8px">Payment</h3><div class="grid3">' +
      f('Which points are paid', A.sel('payment.method', d.payment.method, [['randomRound', 'One round drawn at random (by the server, once)'], ['sum', 'The sum of all rounds'], ['mean', 'The average over all rounds']])) +
      f('Currency per point', A.num('payment.pointsPerUnit', d.payment.pointsPerUnit, 0, 1000000)) + f('Currency (code or symbol)', A.inp('payment.currency', d.payment.currency)) +
      f('Show-up fee', A.num('payment.showUpFee', d.payment.showUpFee, 0, 1000000)) + f('Largest bonus (blank = no limit)', '<input type="text" data-maxbonus="1" value="' + A.esc(d.payment.maxBonus == null ? '' : d.payment.maxBonus) + '">') + '</div>' +
      '<p class="muted">Practice rounds are never paid. The bonus is points × currency per point, never below 0, and capped at the largest bonus. The show-up fee is paid to everyone who started, including people who left early or could not be matched. Payments are downloaded on the Game operations tab.</p>';
  }

  function renderInstructions(A) {
    var d = A.draft, f = A.field, esc = A.esc;
    return '<p class="muted">Write {name} to insert a constant (for example {endowment}); it shows the value for the participant\'s condition. A payoff table is added automatically for two-player games in which each player makes one choice.</p>' +
      f('General instructions (blank lines separate paragraphs)', A.area('instructions.general', d.instructions.general, 8)) +
      '<h3 style="margin:16px 0 8px">By role</h3>' + g(A).roles.map(function (r) { return f(esc(r.label) + ' (shown when the player learns their role)', '<textarea rows="3" data-roletext="' + esc(r.id) + '">' + esc((d.instructions.roles || {})[r.id] || '') + '</textarea>'); }).join('');
  }

  function renderComp(A) {
    var d = A.draft, f = A.field, cp = d.comprehension, esc = A.esc, btn = A.btn;
    var h = A.checkbox('data-path="comprehension.enabled" data-bool="1"', cp.enabled, 'Ask understanding questions before the game; anyone who fails is not admitted to the live lobby') +
      '<p class="muted">Standard practice in lab economics. Numeric questions with an answer key (not sent to the browser). Someone who fails every attempt gets the show-up fee and no game. Attempts are stored.</p>';
    if (!cp.enabled) return h;
    h += f('Attempts allowed', A.num('comprehension.maxAttempts', cp.maxAttempts, 1, 5));
    cp.questions.forEach(function (q, i) {
      var b = 'comprehension.questions.' + i;
      h += '<div class="qcard"><div class="bar"><strong>Question ' + (i + 1) + '</strong><div class="btns">' + btn('data-cqrm="' + i + '"', 'Remove', 'danger secondary') + '</div></div>' + f('Question', A.area(b + '.text', q.text, 2)) +
        '<div class="grid3">' + f('Variable name', A.inp(b + '.id', q.id, ' class="mono"')) + f('Correct answer', A.num(b + '.answer', q.answer, -1000000, 1000000)) + f('Allowed error', A.num(b + '.tolerance', q.tolerance || 0, 0, 1000000)) + '</div></div>';
    });
    return h + (cp.questions.length < 10 ? btn('data-cqadd="1"', 'Add a question') : '');
  }

  function renderJson(A) {
    var d = A.draft, keys = ['game', 'payoff', 'params', 'conditions', 'feedback', 'payment', 'instructions', 'comprehension'], o = {};
    keys.forEach(function (k) { o[k] = d[k]; });
    return '<p class="muted">Everything on the other tabs, as JSON, for copying a design between studies or fixing something the forms do not cover. Edits apply to the draft when the JSON is valid.</p>' +
      '<label class="f">Game design<textarea id="gm-json" rows="28" class="mono" spellcheck="false">' + A.esc(JSON.stringify(o, null, 2)) + '</textarea></label><p class="error" id="gm-json-err"></p>';
  }

  // ----- edits -----
  function applyEdit(t, A) {
    var v, d = A.draft, G = g(A);
    if ((v = t.getAttribute('data-roleid'))) {
      var r = G.roles[Number(v)], to = t.value.trim();
      if (ROLE_ID.test(to) && to !== r.id && !G.roles.some(function (x) { return x.id === to; })) { renameRole(A, r.id, to); r.id = to; }
      return false;
    }
    if ((v = t.getAttribute('data-decid'))) {
      var p = v.split('|'), dc = G.stages[Number(p[0])].decisions[Number(p[1])], nid = t.value.trim();
      if (ROLE_ID.test(nid) && nid !== dc.id && !allDecisions(A).some(function (x) { return x.d.id === nid; })) { renameDecision(A, dc.id, nid); dc.id = nid; }
      return false;
    }
    if ((v = t.getAttribute('data-stageid'))) { var st = G.stages[Number(v)], sid = t.value.trim(); if (ROLE_ID.test(sid) && !G.stages.some(function (x) { return x.id === sid; })) st.id = sid; return false; }
    if ((v = t.getAttribute('data-dkind'))) {
      var q = v.split('|'), dd = G.stages[Number(q[0])].decisions[Number(q[1])];
      if (dd.kind !== t.value) {
        dd.kind = t.value;
        if (dd.kind === 'choice') { dd.options = [{ value: 'A', label: 'Option A' }, { value: 'B', label: 'Option B' }]; dd.default = 'A'; delete dd.min; delete dd.max; delete dd.step; }
        else { dd.min = 0; dd.max = 10; dd.step = 1; dd.default = 0; delete dd.options; }
      }
      return true;
    }
    if ((v = t.getAttribute('data-show'))) {
      var s2 = v.split('|'), stg = G.stages[Number(s2[0])]; stg.show = (stg.show || []).filter(function (x) { return x !== s2[1]; });
      if (t.checked) stg.show.push(s2[1]);
      return false;
    }
    if ((v = t.getAttribute('data-smon'))) {
      var sgi = Number(v), sg = G.stages[sgi];
      if (t.checked) {
        var cand = allDecisions(A).filter(function (x) { return x.si < sgi && x.st.role !== sg.role; })[0];
        sg.strategyMethod = { on: cand.d.id, form: cand.d.kind === 'number' && sg.decisions[0].kind === 'choice' && sg.decisions[0].options.length === 2 ? 'threshold' : 'table',
          above: sg.decisions[0].options ? sg.decisions[0].options[0].value : '', below: sg.decisions[0].options && sg.decisions[0].options[1] ? sg.decisions[0].options[1].value : '', defaultThreshold: 0 };
        sg.show = (sg.show || []).filter(function (x) { return x !== cand.d.id; }); sg.parallel = true;
      } else sg.strategyMethod = null;
      return true;
    }
    if ((v = t.getAttribute('data-paramname'))) {
      var nn = t.value.trim();
      if (/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(nn) && nn !== v && !(nn in d.params)) { renameParam(A, v, nn); t.setAttribute('data-paramname', nn); var vi = t.parentNode.parentNode.querySelector('[data-paramval]'); if (vi) vi.setAttribute('data-paramval', nn); }
      return false;
    }
    if ((v = t.getAttribute('data-paramval'))) { var pv = t.value.trim(); d.params[v] = pv === '' || isNaN(Number(pv)) ? pv : Number(pv); return false; }
    if ((v = t.getAttribute('data-payoff'))) { d.payoff[v] = t.value; return false; }
    if ((v = t.getAttribute('data-roletext'))) { d.instructions.roles[v] = t.value; return false; }
    if ((v = t.getAttribute('data-condid'))) { var c = d.conditions[Number(v)], ci = t.value.trim(); if (/^[a-z][a-z0-9_]{0,30}$/.test(ci) && ci !== c.id && !d.conditions.some(function (x) { return x.id === ci; })) c.id = ci; return false; }
    if ((v = t.getAttribute('data-condparam'))) {
      var cp = v.split('|'), cond = d.conditions[Number(cp[0])], raw = t.value.trim();
      if (raw === '' || isNaN(Number(raw))) delete cond.params[cp[1]]; else cond.params[cp[1]] = Number(raw);
      return false;
    }
    if (t.hasAttribute('data-maxbonus')) { var mb = t.value.trim(); d.payment.maxBonus = mb === '' || isNaN(Number(mb)) ? null : Number(mb); return false; }
    if (t.id === 'gm-json') {
      try { var o = JSON.parse(t.value); Object.keys(o).forEach(function (k) { d[k] = o[k]; }); document.getElementById('gm-json-err').textContent = ''; }
      catch (e) { document.getElementById('gm-json-err').textContent = 'Not valid JSON yet: ' + e.message; return false; }
      return false;
    }
    return undefined;
  }

  function click(t, A) {
    var v, d = A.draft, G = g(A);
    if ((v = t.getAttribute('data-preset'))) {
      var pr = ((A.meta() || {}).presets || []).filter(function (p) { return p.id === v; })[0];
      if (!pr || !confirm('Replace the game design in this draft with "' + pr.label + '"? Your consent text, surveys, and screen text are kept.')) return false;
      var c = A.clone(pr.content); Object.keys(c).forEach(function (k) { d[k] = c[k]; });
      return true;
    }
    if (t.hasAttribute('data-addrole')) { var rid = slug('role', G.roles, 'id'); G.roles.push({ id: rid, label: 'Role ' + (G.roles.length + 1), count: 1 }); d.payoff[rid] = '0'; return true; }
    if ((v = t.getAttribute('data-rmrole'))) {
      var gone = G.roles[Number(v)]; if (!confirm('Remove the role "' + gone.label + '" and its payoff formula? Stages owned by it are removed too.')) return false;
      G.roles.splice(Number(v), 1); delete d.payoff[gone.id]; delete d.instructions.roles[gone.id]; G.stages = G.stages.filter(function (s) { return s.role !== gone.id; });
      if (!G.stages.length) G.stages.push(newStage(A)); return true;
    }
    if (t.hasAttribute('data-addstage')) { G.stages.push(newStage(A)); return true; }
    if ((v = t.getAttribute('data-strm'))) { if (!confirm('Remove this stage?')) return false; G.stages.splice(Number(v), 1); if (G.stages.length && G.stages[0].parallel) G.stages[0].parallel = false; return true; }
    if ((v = t.getAttribute('data-stdup'))) { var i = Number(v), cp = A.clone(G.stages[i]); cp.id = slug('stage', G.stages, 'id'); cp.decisions.forEach(function (x) { x.id = x.id + '_' + (G.stages.length + 1); }); cp.strategyMethod = null; G.stages.splice(i + 1, 0, cp); return true; }
    if ((v = t.getAttribute('data-stmove'))) { var m = v.split('|'), a = Number(m[0]), b = a + Number(m[1]), tmp = G.stages[a]; G.stages[a] = G.stages[b]; G.stages[b] = tmp; if (G.stages[0].parallel) G.stages[0].parallel = false; return true; }
    if ((v = t.getAttribute('data-adddec'))) { var stg = G.stages[Number(v)], did = slug('d', allDecisions(A).map(function (x) { return x.d; }), 'id'); stg.decisions.push({ id: did, label: 'New decision', kind: 'number', min: 0, max: 10, step: 1, default: 0 }); return true; }
    if ((v = t.getAttribute('data-rmdec'))) { var rd = v.split('|'); G.stages[Number(rd[0])].decisions.splice(Number(rd[1]), 1); return true; }
    if (t.hasAttribute('data-addparam')) { var pn = 'x'; var n = 1; while (('x' + n) in d.params) n++; d.params['x' + n] = 1; return true; }
    if ((v = t.getAttribute('data-rmparam'))) { delete d.params[v]; d.conditions.forEach(function (c) { delete c.params[v]; }); return true; }
    if (t.hasAttribute('data-condadd')) { var cn = d.conditions.length + 1, cid = 'cond' + cn; while (d.conditions.some(function (x) { return x.id === cid; })) cid = 'cond' + (++cn); d.conditions.push({ id: cid, label: 'Condition ' + cn, params: {} }); return true; }
    if ((v = t.getAttribute('data-condrm'))) { if (!confirm('Remove this condition? Participants already assigned to it keep it.')) return false; d.conditions.splice(Number(v), 1); return true; }
    if (t.hasAttribute('data-cqadd')) { d.comprehension.questions.push({ id: slug('q', d.comprehension.questions, 'id'), text: '', answer: 0, tolerance: 0 }); return true; }
    if ((v = t.getAttribute('data-cqrm'))) { d.comprehension.questions.splice(Number(v), 1); return true; }
    if (t.id === 'gm-check') {
      var out = document.getElementById('gm-check-out'); out.textContent = 'Checking…';
      A.api.postJSON('game-check', { content: d }).then(function (r) { out.innerHTML = r.errors.length ? '<span class="error">' + r.errors.map(A.esc).join('\n') + '</span>' : '<span class="ok">No problems found. The formulas run with the default decisions.</span>'; }).catch(function (e) { out.textContent = e.message; });
      return false;
    }
    return false;
  }
  function newStage(A) {
    var G = g(A), id = slug('stage', G.stages, 'id'), did = slug('d', allDecisions(A).map(function (x) { return x.d; }), 'id');
    return { id: id, label: 'New stage', role: G.roles[0].id, parallel: false, prompt: '', show: [], strategyMethod: null, decisions: [{ id: did, label: 'New decision', kind: 'number', min: 0, max: 10, step: 1, default: 0 }] };
  }

  // ----- the pilot report -----
  function report(rows, content, R) {
    var esc = R.esc, mean = R.mean, num = R.num, G = content.game, decs = [];
    G.stages.forEach(function (st) { st.decisions.forEach(function (d) { decs.push(d); }); });
    var acting = rows.filter(function (r) { return r.acting === 1 || r.acting === '1'; }), real = acting.filter(function (r) { return !+r.practice; });
    var numeric = decs.filter(function (d) { return d.kind === 'number'; }), choice = decs.filter(function (d) { return d.kind === 'choice'; });
    var table = [], by = {};
    real.forEach(function (r) { var k = r.condition + '|' + r.round, x = by[k] = by[k] || { condition: r.condition, round: +r.round, n: 0, vals: {}, auto: [] }; x.n++; x.auto.push(+r.auto ? 1 : 0); numeric.forEach(function (d) { var v = num(r['d_' + d.id]); if (v != null) (x.vals[d.id] = x.vals[d.id] || []).push(v); }); });
    Object.keys(by).sort(function (a, b) { var p = by[a], q = by[b]; return p.condition < q.condition ? -1 : p.condition > q.condition ? 1 : p.round - q.round; }).forEach(function (k) {
      var x = by[k], row = { condition: x.condition, round: x.round, decisions: x.n, timeout_share: mean(x.auto) };
      numeric.forEach(function (d) { row['mean_' + d.id] = x.vals[d.id] ? mean(x.vals[d.id]) : null; }); table.push(row);
    });
    var cols = ['condition', 'round', 'decisions'].concat(numeric.map(function (d) { return 'mean_' + d.id; }), ['timeout_share']);
    var f = function (c, v) { return v == null || v === '' ? '–' : c === 'timeout_share' ? Math.round(v * 100) + '%' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : esc(v); };
    var h = '<h2>Mean decisions by round and condition</h2><p class="muted">Practice rounds are left out. Only rows where the participant actually decided. Timeout share is the part of decisions the server made because time ran out.</p><div class="table-wrap"><table><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>' +
      table.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + f(c, r[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
    if (choice.length) {
      h += '<h2>Choices</h2><div class="table-wrap"><table><tr><th>Decision</th><th>Condition</th><th>Option</th><th>Share</th></tr>' + choice.map(function (d) {
        var conds = {}; real.forEach(function (r) { var v = r['d_' + d.id]; if (v !== '' && v != null) { var c = conds[r.condition] = conds[r.condition] || { n: 0, by: {} }; c.n++; c.by[v] = (c.by[v] || 0) + 1; } });
        return Object.keys(conds).sort().map(function (cn) { return (d.options || []).map(function (o) { var c = conds[cn]; return '<tr><td>' + esc(d.label) + '</td><td>' + esc(cn) + '</td><td>' + esc(o.label) + '</td><td>' + Math.round((c.by[o.value] || 0) / c.n * 100) + '%</td></tr>'; }).join(''); }).join('');
      }).join('') + '</table></div>';
    }
    // participants: timeouts, dropouts, waiting, matching
    var people = {}; rows.forEach(function (r) { var p = people[r.code] = people[r.code] || { code: r.code, condition: r.condition, dropped: 0, wait: null, cohort: false, fallback: r.fallback, mode: r.mode, played: false, auto: 0, acts: 0 }; if (+r.dropped) p.dropped = 1; if (r.cohort) p.cohort = true; if (+r.played) p.played = true; if (r.wait_ms !== '' && p.wait == null) p.wait = +r.wait_ms; if (+r.acting) { p.acts++; if (+r.auto) p.auto++; } });
    var list = Object.keys(people).map(function (k) { return people[k]; }), live = list.filter(function (p) { return p.mode === 'live' || p.cohort || p.fallback === 'fee'; });
    var waits = live.filter(function (p) { return p.wait != null; }).map(function (p) { return p.wait / 1000; });
    h += '<h2>Waiting, matching, and dropouts</h2><div class="table-wrap"><table><tr><th>Participants with data</th><th>Matched into a group</th><th>Match rate (live)</th><th>Median wait (s)</th><th>Longest wait (s)</th><th>Took the fallback</th><th>Left mid-game</th><th>Any timeout</th></tr><tr>' +
      '<td>' + list.length + '</td><td>' + live.filter(function (p) { return p.cohort; }).length + '</td><td>' + (live.length ? Math.round(live.filter(function (p) { return p.cohort; }).length / live.length * 100) + '%' : '–') + '</td><td>' + (waits.length ? R.median(waits).toFixed(0) : '–') + '</td><td>' + (waits.length ? Math.max.apply(null, waits).toFixed(0) : '–') + '</td>' +
      '<td>' + list.filter(function (p) { return p.fallback; }).length + '</td><td>' + list.filter(function (p) { return p.dropped; }).length + ' (' + (list.length ? Math.round(list.filter(function (p) { return p.dropped; }).length / list.length * 100) : 0) + '%)</td><td>' + list.filter(function (p) { return p.auto > 0; }).length + '</td></tr></table></div>' +
      '<p class="muted">Participants who left the waiting room before being matched or choosing the fallback have no data yet, so the match rate counts only people who reached a group or a fallback. Waiting time is from entering the waiting room to the group being formed.</p>';
    return { html: h, table: { name: 'game_by_round', rows: table, cols: cols } };
  }

  // ----- the Game operations tab -----
  function ops(el, X) {
    var esc = X.esc;
    el.innerHTML = '<h2>Live status</h2><p class="muted">Who is waiting, which groups are playing, and which have stalled (no progress for a long while, usually because everyone left). A stalled group can be closed by a manager: the missing decisions are filled in by the timeout rule so every round is recorded.</p>' +
      '<div class="row"><button type="button" class="secondary" id="go-refresh">Refresh</button><label class="check"><input type="checkbox" id="go-auto"> Refresh every 5 seconds</label></div><p id="go-summary" class="muted"></p><div class="table-wrap"><table id="go-tbl"></table></div>' +
      '<div class="section" data-role="manager"><h2>Asynchronous matches</h2><p class="muted">When a participant finishes, they are matched with stored decisions of earlier participants. The first participants have no partners yet and stay pending. This button matches them using everyone who has finished since; the payments download does the same first.</p><div class="row"><button type="button" id="go-resolve">Resolve pending matches</button></div><p id="go-resolve-out" class="muted"></p></div>' +
      '<div class="section"><h2>Downloads</h2><div class="row"><button type="button" class="secondary" id="go-groups">Groups CSV</button><span class="muted">One row per cohort, round, and group. The trials CSV (Participants tab) has one row per participant, round, and stage.</span></div>' +
      '<div data-role="manager"><h2 style="margin-top:20px">Payments</h2><p class="muted">One row per participant who consented and started: points, bonus (capped), show-up fee, and total, with the external ID if the participant\'s link carried one (Prolific\'s PROLIFIC_PID). Email addresses are never included. Pending asynchronous matches are resolved first. Test participants are in the file with test = 1; the Prolific file leaves them out.</p>' +
      '<div class="row"><button type="button" class="secondary" id="go-pay-preview">Preview totals</button><button type="button" class="secondary" id="go-pay">Payments CSV</button><button type="button" class="secondary" id="go-prolific">Prolific bonus CSV (participant_id,amount)</button></div><p id="go-pay-out" class="muted"></p></div></div>';
    el.querySelectorAll('[data-role]').forEach(function (n) { n.hidden = !X.can(n.getAttribute('data-role')); });
    var timer = null;
    function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; }
    function refresh() {
      X.getJSON('game-status').then(function (r) {
        el.querySelector('#go-summary').textContent = r.waiting + ' participant(s) waiting for a group. Asynchronous: ' + r.async.pending + ' pending match(es)' + (Object.keys(r.async.pools).length ? '; stored decisions available: ' + Object.keys(r.async.pools).map(function (k) { return k + ' ' + r.async.pools[k]; }).join(', ') : '') + '.';
        el.querySelector('#go-tbl').innerHTML = '<tr><th>Cohort</th><th>Condition</th><th>Players</th><th>Status</th><th>Round</th><th>Left</th><th>Last activity</th><th></th></tr>' + r.cohorts.map(function (c) {
          return '<tr><td><code>' + esc(c.id) + '</code></td><td>' + esc(c.condition) + '</td><td>' + c.members + '</td><td>' + esc(c.status) + (c.finished ? ' (finished)' : '') + (c.closed ? ', closed' : '') + (c.stalled ? ' <span class="error">stalled</span>' : '') + '</td><td>' + (c.round == null ? '' : c.round + ' of ' + c.rounds) + '</td><td>' + (c.dropped || '') + '</td><td>' + esc(ago(r.now - c.lastActivityAt)) + ' ago</td><td>' +
            (X.can('manager') && c.status !== 'abandoned' && c.status !== 'closed' && !c.finished ? '<button type="button" class="secondary small" data-close="' + esc(c.id) + '">Close</button>' : '') + '</td></tr>';
        }).join('') + (r.cohorts.length ? '' : '<tr><td colspan="8" class="muted">No groups yet.</td></tr>');
      }).catch(function (e) { X.err(e.message); });
    }
    el.querySelector('#go-refresh').addEventListener('click', refresh);
    el.querySelector('#go-auto').addEventListener('change', function () { if (timer) { clearInterval(timer); timer = null; } if (this.checked) timer = setInterval(function () { if (!document.body.contains(el) || el.hidden) { clearInterval(timer); timer = null; return; } refresh(); }, 5000); });
    el.querySelector('#go-tbl').addEventListener('click', function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-close'); if (!id) return;
      if (!confirm('Close group ' + id + '? All missing decisions are filled in by the timeout rule and every round is recorded. This cannot be undone.')) return;
      X.postJSON('game-close', { cohort: id }).then(function (r) { X.err(''); refresh(); }).catch(function (x) { X.err(x.message); });
    });
    el.querySelector('#go-resolve').addEventListener('click', function () {
      var b = this; b.disabled = true;
      X.postJSON('game-resolve', {}).then(function (r) { el.querySelector('#go-resolve-out').textContent = r.pending + ' were pending: ' + r.resolved + ' matched now, ' + r.stillPending + ' still waiting for partners.'; refresh(); }).catch(function (e) { X.err(e.message); }).then(function () { b.disabled = false; });
    });
    function download(route, name) { X.err(''); X.call(route).then(function (r) { return r.blob(); }).then(function (b) { X.saveFile(b, name + '_' + X.day() + '.csv'); }).catch(function (e) { X.err(e.message); }); }
    el.querySelector('#go-groups').addEventListener('click', function () { download('groups.csv', X.studyId + '_groups'); });
    el.querySelector('#go-pay').addEventListener('click', function () { download('payments.csv', X.studyId + '_payments'); });
    el.querySelector('#go-prolific').addEventListener('click', function () { download('payments-prolific.csv', X.studyId + '_prolific_bonus'); });
    el.querySelector('#go-pay-preview').addEventListener('click', function () {
      var out = el.querySelector('#go-pay-out'); out.textContent = 'Working…';
      X.getJSON('payments').then(function (r) {
        var s = r.summary, k = r.prolific;
        out.textContent = s.real + ' real participants: ' + s.yes + ' completed, ' + s.partial + ' partial, ' + s.dropped + ' left mid-game; ' + s.pending + ' pending a match. Bonuses ' + s.totalBonus.toFixed(2) + ' plus show-up fees ' + s.totalFees.toFixed(2) + '; ' + s.capped + ' capped. ' +
          s.withoutExternalId + ' without an external ID. Left out of the Prolific file: ' + k.noExternalId + ' with a bonus but no external ID, ' + k.pending + ' pending, ' + k.zero + ' with no bonus.';
      }).catch(function (e) { out.textContent = ''; X.err(e.message); });
    });
    refresh();
  }

  LabAdmin.registerType('game', {
    subtabs: [['presets', 'Presets'], ['game', 'Game'], ['stages', 'Stages'], ['payoff', 'Payoffs & constants'], ['treatments', 'Treatments'], ['feedback', 'Feedback & payment'], ['instructions', 'Instructions'], ['comp', 'Understanding check'], ['json', 'Advanced (JSON)']],
    conditions: function (draft) { return (draft.conditions || []).map(function (c) { return c.id; }); },
    render: function (sub, A) {
      return { presets: renderPresets, game: renderGame, stages: renderStages, payoff: renderPayoff, treatments: renderTreatments, feedback: renderFeedback, instructions: renderInstructions, comp: renderComp, json: renderJson }[sub](A);
    },
    applyEdit: applyEdit,
    click: click,
    reportIntro: 'Mean decisions by round and condition, timeout and dropout rates, and (for live play) waiting times and match rate. Use test codes in several browser tabs to pilot a live game before recruiting.',
    report: report,
    tabs: [{ id: 'gameops', label: 'Game operations', role: 'viewer', render: ops }]
  });
})();
