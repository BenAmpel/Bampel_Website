/* Study type "alert-triage": admin editors (Sessions & AI, Alerts) and pilot-report sections.
   Loaded by static/lab/engine/admin.js. */
(function () {
  'use strict';
  var alertSel = 'practice', MINN = 5;
  var PANEL_DEFAULTS = [['network', 'Network activity'], ['user', 'User behavior'], ['system', 'System events'], ['context', 'Context & threat intel']];
  function aiTypes(A) { return A.meta().aiTypes || {}; }
  function alertById(A, id) { return id === 'practice' ? A.draft.practice : A.draft.alerts.filter(function (a) { return a.id === id; })[0]; }
  function sessionsUsing(A, id) { var out = []; A.draft.design.sessions.forEach(function (s, i) { if (s.alerts.indexOf(id) >= 0) out.push(i + 1); }); return out; }
  function counts(A, ai) { var c = {}; Object.keys(aiTypes(A)).forEach(function (k) { c[k] = 0; }); (ai || []).forEach(function (t) { c[t] = (c[t] || 0) + 1; }); return c; }
  function fromCounts(A, c) { var a = []; Object.keys(aiTypes(A)).forEach(function (k) { for (var i = 0; i < (c[k] || 0); i++) a.push(k); }); return a; }
  function countMsg(total, n) { return total === n ? '<span class="muted">AI behaviors: ' + total + ' of ' + n + ' alerts.</span>' : '<span class="error">AI behaviors: ' + total + ' of ' + n + ' alerts. These must match before you can save.</span>'; }
  function dropFromSession(s, id) {
    var k = s.alerts.indexOf(id); if (k < 0) return;
    s.alerts.splice(k, 1);
    if (s.ai && s.ai.length > s.alerts.length) { var x = s.ai.lastIndexOf('accurate'); s.ai.splice(x >= 0 ? x : s.ai.length - 1, 1); }
  }

  function renderSessions(A) {
    var d = A.draft.design, nAll = A.draft.alerts.length, esc = A.esc, btn = A.btn, num = A.num, AI = aiTypes(A);
    var h = '<p class="muted">The study runs these sessions in order, each opening after the participant\'s gap days. Each session shows its alerts in a random order. For the AI-first and evidence-first groups, choose what the AI does on each alert in a session; the behaviors are shuffled across that session\'s alerts. The control group never sees the AI.</p>' +
      A.checkbox('data-path="design.practice" data-bool="1"', d.practice, 'Start session 1 with the practice alert') +
      A.checkbox('data-path="design.counterbalance.panels" data-bool="1"', d.counterbalance.panels, 'Counterbalance evidence-panel order across participants (each participant keeps one order)') +
      A.checkbox('data-path="design.counterbalance.answers" data-bool="1"', d.counterbalance.answers, 'Counterbalance the Malicious/Benign button order across participants') +
      '<div class="row" style="margin-bottom:12px">' +
      '<label>AI confidence when "high": from ' + num('design.aiConfidence.highMin', d.aiConfidence.highMin, 50, 100) + '</label><label>to ' + num('design.aiConfidence.highMax', d.aiConfidence.highMax, 50, 100) + '</label>' +
      '<label>when "low": from ' + num('design.aiConfidence.lowMin', d.aiConfidence.lowMin, 50, 100) + '</label><label>to ' + num('design.aiConfidence.lowMax', d.aiConfidence.lowMax, 50, 100) + '</label></div>';
    var sorted = A.draft.alerts.slice().sort(function (a, b) { return (a.family + a.title).localeCompare(b.family + b.title); });
    d.sessions.forEach(function (s, i) {
      var n = s.alerts.length, c = counts(A, s.ai), total = s.ai ? s.ai.length : 0;
      h += '<div class="qcard"><div class="bar"><strong>Session ' + (i + 1) + '</strong><div class="btns">' +
        btn('data-smove="' + i + '|-1"', '↑', null, i === 0) + btn('data-smove="' + i + '|1"', '↓', null, i === d.sessions.length - 1) +
        btn('data-sdup="' + i + '"', 'Duplicate') + btn('data-sremove="' + i + '"', 'Remove', 'danger secondary', d.sessions.length === 1) + '</div></div>' +
        '<p class="muted" style="margin:0 0 6px">' + n + ' of ' + nAll + ' alerts selected (' + s.alerts.filter(function (id) { var a = alertById(A, id); return a && a.truth === 'malicious'; }).length + ' malicious).</p>' +
        '<div class="pick">' + sorted.map(function (a) {
          return '<label title="' + esc(a.summary) + '"><input type="checkbox" data-salert="' + i + '|' + esc(a.id) + '"' + (s.alerts.indexOf(a.id) >= 0 ? ' checked' : '') + '><span>' + esc(a.title) + ' <span class="meta">' + esc(a.id) + ' · ' + (a.truth === 'malicious' ? 'mal' : 'ben') + '</span></span></label>';
        }).join('') + '</div>' +
        A.checkbox('data-sai="' + i + '"', !!s.ai, 'AI assistant in this session (AI groups)') +
        (s.ai ? '<div class="row">' + Object.keys(AI).map(function (k) { return '<label>' + esc(AI[k]) + ' <input type="number" min="0" max="40" style="width:80px" data-scount="' + i + '|' + k + '" value="' + c[k] + '"></label>'; }).join('') + '</div>' +
          '<p id="scount-' + i + '" style="margin-top:6px">' + countMsg(total, n) + '</p>' : '') + '</div>';
    });
    return h + '<button type="button" class="secondary" data-saddsession="1">Add a session</button>';
  }

  function renderAlerts(A) {
    var draft = A.draft, esc = A.esc, btn = A.btn, field = A.field, inp = A.inp, area = A.area, sel = A.sel;
    var all = [draft.practice].concat(draft.alerts.slice().sort(function (a, b) { return (a.family + a.title).localeCompare(b.family + b.title); }));
    var a = alertById(A, alertSel) || draft.practice, isP = a === draft.practice;
    var base = isP ? 'practice' : 'alerts.' + draft.alerts.indexOf(a), used = isP ? [] : sessionsUsing(A, a.id);
    var h = '<div class="row" style="margin-bottom:8px"><label style="flex:1;min-width:240px">Alert <select id="alertsel" style="width:100%">' + all.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === a.id ? ' selected' : '') + '>' + (x.id === 'practice' ? 'Practice alert' : esc(x.title) + ' · ' + esc(x.id) + ' · ' + x.truth) + '</option>';
      }).join('') + '</select></label>' + btn('data-addalert="1"', 'Add alert') + btn('data-dupalert="1"', 'Duplicate') + btn('data-delalert="1"', 'Delete', 'danger secondary', isP) + '</div>' +
      '<p class="muted">' + (isP ? 'Shown once at the start of session 1 when "practice alert" is on (Sessions & AI tab). Not scored.' : used.length ? 'Used in session' + (used.length > 1 ? 's ' : ' ') + used.join(', ') + '.' : '<strong>Not used in any session yet.</strong> Add it on the Sessions & AI tab.') +
      ' "Points to" is the answer a panel supports and drives the CSV measures for contradicting evidence; "Misleading" marks a panel that points the wrong way.</p>' +
      '<div class="grid3">' + field('Title', inp(base + '.title', a.title)) + field('Severity', inp(base + '.severity', a.severity)) +
      field('Correct answer', sel(base + '.truth', a.truth, [['malicious', 'Malicious'], ['benign', 'Benign']])) + '</div>' +
      (isP ? '' : field('Alert type (groups versions of the same alert in analysis)', inp(base + '.family', a.family, ' class="mono"'))) +
      field('Summary', area(base + '.summary', a.summary, 2));
    a.panels.forEach(function (p, j) {
      var pb = base + '.panels.' + j;
      h += '<div class="panel-edit"><div class="bar" style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:14px">Evidence ' + (j + 1) + '</strong><div class="btns" style="display:flex;gap:6px">' +
        btn('data-pmove="' + base + '|' + j + '|-1"', '↑', null, j === 0) + btn('data-pmove="' + base + '|' + j + '|1"', '↓', null, j === a.panels.length - 1) +
        btn('data-premove="' + base + '|' + j + '"', 'Remove', 'danger secondary', a.panels.length === 1) + '</div></div>' +
        '<div class="grid3">' + field('Tab label', inp(pb + '.label', p.label)) + field('Variable name (CSV column)', '<input type="text" class="mono" data-pkey="' + base + '|' + j + '" value="' + esc(p.key) + '">') +
        field('Points to', sel(pb + '.supports', p.supports, [['malicious', 'Malicious'], ['benign', 'Benign'], ['neutral', 'Neither']])) + '</div>' +
        A.checkbox('data-mislead="' + base + '|' + esc(p.key) + '"', a.misleadingPanels.indexOf(p.key) >= 0, 'Misleading') +
        field('Text', area(pb + '.text', p.text, 3)) + '</div>';
    });
    return h + (a.panels.length < 6 ? '<p>' + btn('data-padd="' + base + '"', 'Add evidence panel') + '</p>' : '') +
      '<div class="panel-edit">' + field('AI explanation when the AI is right' + (isP ? ' (in the practice alert the AI is always right)' : ''), area(base + '.aiRationale.correct', a.aiRationale.correct, 2)) +
      (isP ? '' : field('AI explanation when the AI is wrong (low-confidence and manipulated versions add the text set on the Screen text tab)', area(base + '.aiRationale.incorrect', a.aiRationale.incorrect, 2))) + '</div>';
  }

  LabAdmin.registerType('alert-triage', {
    subtabs: [['sessions', 'Sessions & AI'], ['alerts', 'Alerts']],
    onLoad: function (A) { if (!alertById(A, alertSel)) alertSel = 'practice'; },
    render: function (sub, A) { return sub === 'sessions' ? renderSessions(A) : renderAlerts(A); },
    select: function (t) { if (t.id !== 'alertsel') return false; alertSel = t.value; return true; },

    // Returns undefined when the field is not one of ours, else whether to redraw.
    applyEdit: function (t, A) {
      var v, draft = A.draft;
      if ((v = t.getAttribute('data-pkey'))) {
        var pk = v.split('|'), a = A.getPath(pk[0]), panel = a.panels[Number(pk[1])], old = panel.key;
        panel.key = t.value.trim();
        a.misleadingPanels = a.misleadingPanels.map(function (k) { return k === old ? panel.key : k; });
        var mb = document.querySelector('[data-mislead="' + pk[0] + '|' + old + '"]'); if (mb) mb.setAttribute('data-mislead', pk[0] + '|' + panel.key);
        return false;
      }
      if ((v = t.getAttribute('data-mislead'))) {
        var parts = v.split('|'), al = A.getPath(parts[0]);
        al.misleadingPanels = al.panels.map(function (p) { return p.key; }).filter(function (k) { return k === parts[1] ? t.checked : al.misleadingPanels.indexOf(k) >= 0; });
        return false;
      }
      if ((v = t.getAttribute('data-salert'))) {
        var sa = v.split('|'), s = draft.design.sessions[Number(sa[0])], id = sa.slice(1).join('|');
        if (t.checked) { if (s.alerts.indexOf(id) < 0) { s.alerts.push(id); if (s.ai) s.ai.push('accurate'); } } else dropFromSession(s, id);
        return true;
      }
      if ((v = t.getAttribute('data-sai'))) { var ss = draft.design.sessions[Number(v)]; ss.ai = t.checked ? ss.alerts.map(function () { return 'accurate'; }) : null; return true; }
      if ((v = t.getAttribute('data-scount'))) {
        var sc = v.split('|'), s2 = draft.design.sessions[Number(sc[0])], c = counts(A, s2.ai); c[sc[1]] = Math.max(0, parseInt(t.value, 10) || 0); s2.ai = fromCounts(A, c);
        var msg = document.getElementById('scount-' + sc[0]); if (msg) msg.innerHTML = countMsg(s2.ai.length, s2.alerts.length);
        return false;
      }
      return undefined;
    },

    // Returns true when the click was ours (the page then marks the draft changed and redraws).
    click: function (t, A) {
      var v, draft = A.draft, d = draft.design;
      if ((v = t.getAttribute('data-smove'))) { var sm = v.split('|'), si = Number(sm[0]), sj = si + Number(sm[1]), st = d.sessions[si]; d.sessions[si] = d.sessions[sj]; d.sessions[sj] = st; }
      else if ((v = t.getAttribute('data-sdup'))) d.sessions.splice(Number(v) + 1, 0, A.clone(d.sessions[Number(v)]));
      else if ((v = t.getAttribute('data-sremove'))) { if (!confirm('Remove session ' + (Number(v) + 1) + '? Questions limited to later session numbers may need updating.')) return false; d.sessions.splice(Number(v), 1); }
      else if (t.hasAttribute('data-saddsession')) d.sessions.push({ alerts: [], ai: null });
      else if (t.hasAttribute('data-addalert') || t.hasAttribute('data-dupalert')) {
        var src = alertById(A, alertSel), nid = 'alert-' + Date.now().toString(36), dup = t.hasAttribute('data-dupalert');
        var na = dup ? A.clone(src) : { title: 'New alert', severity: 'Medium', truth: 'malicious', family: 'new', summary: '', misleadingPanels: [], aiRationale: { correct: '', incorrect: '' },
          panels: PANEL_DEFAULTS.map(function (p) { return { key: p[0], label: p[1], text: '', supports: 'neutral' }; }) };
        na.id = nid; if (dup) { na.title += ' (copy)'; if (src === draft.practice) na.family = 'practice-copy'; }
        na.aiRationale.incorrect = na.aiRationale.incorrect || '';
        delete na.variant; draft.alerts.push(na); alertSel = nid;
      } else if (t.hasAttribute('data-delalert')) {
        var del = alertById(A, alertSel), usedIn = sessionsUsing(A, del.id);
        if (!confirm('Delete "' + del.title + '"?' + (usedIn.length ? ' It will also be removed from session' + (usedIn.length > 1 ? 's ' : ' ') + usedIn.join(', ') + '.' : ''))) return false;
        d.sessions.forEach(function (s) { dropFromSession(s, del.id); });
        draft.alerts.splice(draft.alerts.indexOf(del), 1); alertSel = 'practice';
      } else if ((v = t.getAttribute('data-padd'))) {
        var pa = A.getPath(v), k = 'evidence' + (pa.panels.length + 1);
        while (pa.panels.some(function (p) { return p.key === k; })) k += '_';
        pa.panels.push({ key: k, label: 'New evidence', text: '', supports: 'neutral' });
      } else if ((v = t.getAttribute('data-premove'))) {
        var pr = v.split('|'), pal = A.getPath(pr[0]), gone = pal.panels.splice(Number(pr[1]), 1)[0];
        pal.misleadingPanels = pal.misleadingPanels.filter(function (x) { return x !== gone.key; });
      } else if ((v = t.getAttribute('data-pmove'))) {
        var pm = v.split('|'), pp = A.getPath(pm[0]).panels, pi = Number(pm[1]), pj = pi + Number(pm[2]), ptmp = pp[pi]; pp[pi] = pp[pj]; pp[pj] = ptmp;
      } else return false;
      return true;
    },

    reportIntro: 'How the alerts and sessions are performing, for tuning the study after a pilot. Accuracy without the AI is the key number: if an alert is answered correctly almost always (or almost never) without help, it can\'t show whether people over-rely on the AI. Flags need at least ' + MINN + ' answers per alert.',
    report: function (rows, content, R) {
      var esc = R.esc, pct = R.pct, mean = R.mean, num = R.num, cnt = function (a) { return a.length ? ' <span class="muted">(' + a.length + ')</span>' : ''; };
      var titles = {}; content.alerts.forEach(function (a) { titles[a.id] = a.title; });
      var cs = {};
      rows.forEach(function (r) { var k = r.condition + '|' + r.session, x = cs[k] = cs[k] || { acc: [], agree: [], conf: [], panels: [] }; if (r.correct !== '') x.acc.push(+r.correct); if (r.agree_ai !== '') x.agree.push(+r.agree_ai); if (num(r.final_confidence) != null) x.conf.push(num(r.final_confidence)); x.panels.push(+r.panels_opened_unique); });
      var h = '<h2>Accuracy and AI use by condition and session</h2><div class="table-wrap"><table><tr><th>Condition</th><th>Session</th><th>Accuracy</th><th>Agreed with AI</th><th>Mean confidence</th><th>Panels opened (mean)</th></tr>' +
        Object.keys(cs).sort().map(function (k) { var x = cs[k], p = k.split('|'); return '<tr><td>' + esc(p[0]) + '</td><td>' + p[1] + '</td><td>' + pct(x.acc) + cnt(x.acc) + '</td><td>' + (x.agree.length ? pct(x.agree) : '–') + '</td><td>' + (x.conf.length ? mean(x.conf).toFixed(0) : '–') + '</td><td>' + mean(x.panels).toFixed(2) + '</td></tr>'; }).join('') + '</table></div>';
      var at = {};
      rows.forEach(function (r) { if (!r.ai_type) return; var x = at[r.ai_type] = at[r.ai_type] || { agree: [], acc: [], contra: [] }; x.agree.push(+r.agree_ai); x.acc.push(+r.correct); if (r.contradicts_ai_inspected !== '') x.contra.push(+r.contradicts_ai_inspected); });
      h += '<h2>When the AI was right or wrong</h2><p class="muted">Agreement with a wrong AI is over-reliance; checking evidence that contradicts the AI is verification.</p><div class="table-wrap"><table><tr><th>AI behavior</th><th>Answers</th><th>Agreed with AI</th><th>Correct</th><th>Opened evidence against the AI</th></tr>' +
        Object.keys(at).map(function (k) { var x = at[k]; return '<tr><td>' + esc(k) + '</td><td>' + x.agree.length + '</td><td>' + pct(x.agree) + '</td><td>' + pct(x.acc) + '</td><td>' + pct(x.contra) + '</td></tr>'; }).join('') + '</table></div>';
      var al = {};
      rows.forEach(function (r) {
        var x = al[r.alert_id] = al[r.alert_id] || { id: r.alert_id, family: r.family, truth: r.truth, noAI: [], aiRight: [], aiWrong: [], all: [], conf: [], rt: [], panels: [], mis: [] };
        var c = r.correct === '' ? null : +r.correct;
        if (c != null) { x.all.push(c); if (!r.ai_type) x.noAI.push(c); else if (r.ai_verdict === r.truth) x.aiRight.push(c); else x.aiWrong.push(c); }
        if (num(r.final_confidence) != null) x.conf.push(num(r.final_confidence)); if (num(r.final_rt_ms) != null) x.rt.push(num(r.final_rt_ms) / 1000);
        x.panels.push(+r.panels_opened_unique); x.mis.push(+r.misleading_inspected);
      });
      var table = Object.keys(al).map(function (k) {
        var x = al[k], na = x.noAI.length >= MINN ? mean(x.noAI) : null, flag = '';
        if (na != null && na >= 0.9) flag = 'Too easy without AI'; else if (na != null && na <= 0.4) flag = 'Too hard without AI'; else if (x.noAI.length < MINN) flag = 'Not enough no-AI answers yet';
        return { alert_id: x.id, title: titles[x.id] || '', family: x.family, truth: x.truth, answers: x.all.length, acc_no_ai: mean(x.noAI), n_no_ai: x.noAI.length, acc_ai_right: mean(x.aiRight), n_ai_right: x.aiRight.length,
          acc_ai_wrong: mean(x.aiWrong), n_ai_wrong: x.aiWrong.length, mean_confidence: mean(x.conf), median_seconds: R.median(x.rt), mean_panels_opened: mean(x.panels), misleading_opened: mean(x.mis), flag: flag };
      }).sort(function (a, b) { return (a.acc_no_ai == null) - (b.acc_no_ai == null) || (b.acc_no_ai || 0) - (a.acc_no_ai || 0); });
      var f = function (v, p) { return v == null ? '–' : p ? Math.round(v * 100) + '%' : v.toFixed(1); };
      h += '<h2>By alert</h2><p class="muted">Sorted from easiest to hardest without the AI. Accuracy without the AI comes from the control group and AI-free sessions. Edit flagged alerts under Study content → Alerts.</p><div class="table-wrap"><table><tr><th>Alert</th><th>Truth</th><th>Answers</th><th>Correct, no AI</th><th>Correct, AI right</th><th>Correct, AI wrong</th><th>Confidence</th><th>Median s</th><th>Panels</th><th>Misleading opened</th><th>Flag</th></tr>' +
        table.map(function (r) { return '<tr><td class="wrap-cell">' + esc(r.title) + ' <span class="muted mono">' + esc(r.alert_id) + '</span></td><td>' + r.truth + '</td><td>' + r.answers + '</td><td>' + f(r.acc_no_ai, 1) + ' <span class="muted">(' + r.n_no_ai + ')</span></td><td>' + f(r.acc_ai_right, 1) + ' <span class="muted">(' + r.n_ai_right + ')</span></td><td>' + f(r.acc_ai_wrong, 1) + ' <span class="muted">(' + r.n_ai_wrong + ')</span></td><td>' + (r.mean_confidence == null ? '–' : r.mean_confidence.toFixed(0)) + '</td><td>' + f(r.median_seconds) + '</td><td>' + f(r.mean_panels_opened) + '</td><td>' + f(r.misleading_opened, 1) + '</td><td>' + (r.flag && !/Not enough/.test(r.flag) ? '<strong>' + esc(r.flag) + '</strong>' : '<span class="muted">' + esc(r.flag) + '</span>') + '</td></tr>'; }).join('') + '</table></div>';
      return { html: h, table: { name: 'alert_report', rows: table, cols: ['alert_id', 'title', 'family', 'truth', 'answers', 'acc_no_ai', 'n_no_ai', 'acc_ai_right', 'n_ai_right', 'acc_ai_wrong', 'n_ai_wrong', 'mean_confidence', 'median_seconds', 'mean_panels_opened', 'misleading_opened', 'flag'] } };
    }
  });
})();
