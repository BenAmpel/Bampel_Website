/* CCAIR Behavioral Lab: admin page, shared by every study, and the lab console.
   /lab/admin/<study> (or a page with <html data-study="...">): participants, exports, pilot report,
   students, study content editor, team, activity, backups, live self-test.
   /lab/admin/ with no study: the lab console (owner only) to create studies and list them on /lab/.
   Each study type adds its own content-editor tabs and report sections in
   static/lab/engine/types/<type>-admin.js via LabAdmin.registerType(id, {...}); see static/lab/README.md. */
(function () {
  'use strict';
  var studyId = document.documentElement.getAttribute('data-study') || (location.pathname.match(/^\/lab\/admin\/([a-z][a-z0-9-]{2,30})\/?$/) || [])[1] || null;
  var root = document.getElementById('admin');
  var ROLES = ['viewer', 'editor', 'manager', 'owner'];
  var $ = function (id) { return document.getElementById(id); };
  var types = {}, plugin = null, me = null;
  function can(need) { return !!me && ROLES.indexOf(me.role) >= ROLES.indexOf(need); }
  function getKey() { try { return sessionStorage.getItem('lab_admin_key') || ($('key') ? $('key').value : ''); } catch (e) { return $('key') ? $('key').value : ''; } }
  function setKey(k) { try { if (k) sessionStorage.setItem('lab_admin_key', k); else sessionStorage.removeItem('lab_admin_key'); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(ms) { return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function err(msg) { $('err').textContent = msg || ''; if (msg) $('err').scrollIntoView({ block: 'nearest' }); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var BASE = studyId ? '/api/lab/' + studyId + '/admin/' : '/api/lab/_lab/';
  function call(path, body) {
    return fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'x-admin-key': getKey() }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.ok) return r;
        return r.json().catch(function () { return {}; }).then(function (j) {
          var msg = r.status === 503 ? 'Admin is disabled: set LAB_ADMIN_KEY (16+ characters) in Netlify and redeploy.'
            : j.error === 'forbidden' ? 'That key was not recognized' + (studyId ? ' for this study.' : '. The lab console needs the owner key.')
            : j.error === 'no_study' ? 'There is no study called "' + studyId + '". Check the address, or create it in the lab console (/lab/admin/).'
            : j.error === 'not_allowed' ? 'Your access level cannot do that.'
            : j.error === 'invalid' ? 'Not saved. Please fix:\n• ' + j.errors.join('\n• ')
            : j.error === 'conflict' ? 'Someone else saved changes (now version ' + j.version + ') while you were editing. Copy anything you need, then click Discard changes to load their version.'
            : j.hint ? j.hint : j.error === 'exists' ? 'A study with that ID already exists.' : j.error === 'not_found' ? 'Not found.' : 'Request failed (' + r.status + ').';
          var e = new Error(msg); e.code = j.error; throw e;
        });
      });
  }
  var getJSON = function (p) { return call(p).then(function (r) { return r.json(); }); };
  var postJSON = function (p, b) { return call(p, b).then(function (r) { return r.json(); }); };
  function saveFile(data, name, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function csvCell(v) {
    var s = Array.isArray(v) ? v.join('|') : String(v == null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;   // never a spreadsheet formula
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows, first) {
    var cols = first.filter(function (c) { return rows.some(function (r) { return c in r; }); });
    rows.forEach(function (r) { Object.keys(r).forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); }); });
    return [cols.map(csvCell).join(',')].concat(rows.map(function (r) { return cols.map(function (c) { var v = r[c]; return csvCell(typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v); }).join(','); })).join('\n') + '\n';
  }
  var day = function () { return new Date().toISOString().slice(0, 10); };
  var median = function (a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  window.LabAdmin = { registerType: function (id, impl) { types[id] = impl; } };

  var SIGNIN = '<form class="row" id="keyform" style="margin-top:12px"><label>Admin key <input type="password" id="key" autocomplete="off" size="36"></label><button type="submit">Sign in</button></form>' +
    '<p class="muted" id="keyhelp"></p><p class="error" id="err" role="alert"></p>';

  if (!studyId) return labConsole();

  // ======================= study admin =======================
  root.innerHTML = '<div class="who"><h1 style="margin:0" id="title">Study admin</h1><span id="whoami" class="muted"></span></div>' + SIGNIN + '<div id="app" hidden>' +
    '<p class="muted links" id="links"></p><nav class="tabs" id="tabs"></nav>' +
    '<section data-tab="participants"><div class="row">' +
      '<button type="button" class="secondary" id="refresh">Refresh</button>' +
      '<button type="button" class="secondary" data-export="trials">Download trials CSV</button><button type="button" class="secondary" data-export="surveys">Download surveys CSV</button>' +
      '<button type="button" class="secondary" data-export="json">Download full JSON</button><button type="button" class="secondary" data-export="raw">Download raw behavior traces (JSONL)</button>' +
      '<label class="check" style="font-size:13px"><input type="checkbox" id="exreal"> Real participants only</label>' +
      '<button type="button" class="danger secondary" data-role="owner" id="deltest">Delete all test participants</button></div>' +
      '<p class="muted" id="exprog"></p><p class="muted">Column definitions: <a href="/lab/CODEBOOK.md" target="_blank" rel="noopener">codebook</a>. Test participants are included and marked in the <code>test</code> column unless "Real participants only" is ticked.</p>' +
      '<p class="muted" id="summary"></p><div class="table-wrap"><table id="tbl"></table></div>' +
      '<div class="section" data-role="owner"><h2>Backups</h2><p class="muted">Every hour the study data is copied to a separate backup store on Netlify (answers once, changing records every time). That protects against mistakes and bugs. For a copy outside Netlify, download a complete backup (every record, raw traces, emails, study content, team, and activity log) and save it to GSU-approved storage, for example weekly. It contains emails, so treat it as identifiable data. Deleting a participant also removes them from the backup store.</p>' +
        '<p id="bkstatus" class="muted"></p><div class="row"><button type="button" class="secondary" id="bkrun">Run backup now</button><button type="button" class="secondary" id="bkdl">Download complete backup (.json.gz)</button></div><p id="bkprog" class="muted"></p></div>' +
      '<div class="section" data-role="owner"><h2>Live self-test</h2><p class="muted">Runs one throwaway test participant per group through every session of the current design on this live site (practice, surveys, every item), then checks what was saved and what the exports say, and deletes the test participants. Real participants are not touched.</p>' +
        '<div class="row"><button type="button" id="selftest">Run self-test</button><label class="check"><input type="checkbox" id="stkeep"> Keep the test participants so I can look at them (delete later with "Delete all test participants")</label></div><p class="muted" id="stprog"></p><div id="stout"></div></div>' +
    '</section>' +
    '<section data-tab="report" hidden><p class="muted" id="rpintro"></p><div class="row">' +
      '<label>Participants <select id="rpwho"><option value="real">Real participants only</option><option value="all">Everyone, including test</option></select></label>' +
      '<label>Label <select id="rplabel"><option value="">All labels</option></select></label><button type="button" id="rprun">Build report</button>' +
      '<button type="button" class="secondary" id="rpcsv" disabled>Download per-item table (CSV)</button></div><p class="muted" id="rpprog"></p><div id="rpout"></div></section>' +
    '<section data-tab="students" hidden><h2>Add students</h2><p class="muted">Optional while self sign-up is on (Study content → Sign-up &amp; consent): add emails here to pre-enroll a class with its own label or gap days, to mark pilots as test, or to let in addresses outside the sign-up domains. One per line or separated by commas. Each email is stored once, apart from the answers (for extra credit); research exports identify people only by a study ID derived from the email with a secret key. Conditions are assigned so the groups stay balanced. Emails already enrolled are skipped.</p>' +
      '<form id="rosterform"><textarea id="emails" class="mono" style="width:100%;min-height:110px" placeholder="jdoe1@student.gsu.edu&#10;asmith2@student.gsu.edu"></textarea><div class="row" style="margin-top:8px">' +
      '<label>Label (optional) <input type="text" id="rlabel" placeholder="CIS8080-fall26" style="width:180px"></label><label>Gap days <input type="number" id="rgap" min="0" max="60" placeholder="default" style="width:90px"></label>' +
      '<label class="check"><input type="checkbox" id="rtest"> Test</label><button type="submit">Add students</button></div></form><p id="rosterout" class="muted"></p>' +
      '<div class="section"><h2>Check completion</h2><p class="muted">Paste emails to see who has finished, for awarding credit. Emails are looked up, not saved.</p><form id="lookupform"><textarea id="lemails" class="mono" style="width:100%;min-height:90px"></textarea>' +
      '<div class="row" style="margin-top:8px"><button type="submit">Check</button><button type="button" class="secondary" id="lcsv" disabled>Download as CSV</button></div></form><div class="table-wrap"><table id="ltbl"></table></div></div>' +
      '<div class="section"><h2>Extra credit</h2><p class="muted">Every email with how many sessions they completed. Emails are stored apart from the answers and never appear in the research exports.</p><div class="row"><button type="button" class="secondary" id="credit">Download extra-credit list (CSV)</button></div></div>' +
      '<div class="section"><h2>Create pilot access codes</h2><p class="muted">For pilots and team testing without a roster. Mark them as test so they are excluded from the counts and can be deleted in one step. Gap days sets the minimum wait between sessions (0 for piloting).</p>' +
      '<form class="row" id="createform"><label>How many <input type="number" id="count" min="1" max="300" value="3" style="width:90px"></label><label>Label (optional) <input type="text" id="label" placeholder="pilot-oct" style="width:160px"></label>' +
      '<label>Gap days <input type="number" id="gap" min="0" max="60" placeholder="default" style="width:90px"></label><label class="check"><input type="checkbox" id="test" checked> Test codes</label><button type="submit">Create</button></form><div id="created" class="keybox" hidden></div></div></section>' +
    '<section data-tab="content" hidden><p class="muted" id="contentinfo"></p><div id="contentwarn"></div><nav class="tabs sub" id="subtabs"></nav><fieldset id="editor" style="border:0;padding:0;margin:0;min-width:0"></fieldset>' +
      '<div class="savebar" id="savebar" data-role="editor"><span id="dirty" class="muted">No unsaved changes.</span><input type="text" id="note" class="grow" placeholder="What changed? (optional, shown in the activity log)">' +
      '<button type="button" class="secondary" id="discard" disabled>Discard changes</button><button type="button" id="save" disabled>Save changes</button></div>' +
      '<div class="section"><h2>Versions</h2><p class="muted">Every save makes a new version. Restoring an old version saves it again as the newest version, so nothing is lost. Each answer records the version it was collected under.</p><div class="table-wrap"><table id="vtbl"></table></div></div></section>' +
    '<section data-tab="team" hidden><h2>Add a team member</h2><p class="muted">Each person gets their own key for this study. Share it privately. Removing a person disables their key immediately.</p>' +
      '<form class="row" id="teamform"><label>Name <input type="text" id="tname" style="width:200px"></label><label>Access <select id="trole"></select></label><button type="submit">Create key</button></form>' +
      '<p class="muted" id="roledesc"></p><div id="newkey" hidden></div><div class="table-wrap"><table id="teamtbl"></table></div></section>' +
    '<section data-tab="activity" hidden><p class="muted">Who added students, changed content, ran self-tests, deleted data, or changed the team.</p><div class="table-wrap"><table id="acttbl"></table></div></section></div>';
  $('keyhelp').innerHTML = 'Use the lab owner key (the <code>LAB_ADMIN_KEY</code> or <code>VC_ADMIN_KEY</code> Netlify variable) or the team key the owner gave you. It is kept in this tab only.';

  // ---------- sign-in and tabs ----------
  var TABS = [['participants', 'Participants', 'viewer'], ['report', 'Pilot report', 'viewer'], ['students', 'Students', 'manager'], ['content', 'Study content', 'viewer'], ['team', 'Team', 'owner'], ['activity', 'Activity', 'owner']];
  var tabKey = 'lab_admin_tab_' + studyId;
  function showTab(name) {
    document.querySelectorAll('section[data-tab]').forEach(function (s) { s.hidden = s.getAttribute('data-tab') !== name; });
    $('tabs').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    try { sessionStorage.setItem(tabKey, name); } catch (e) {}
    err();
    if (name === 'participants') { load(); if (can('owner')) loadBackup(); }
    if (name === 'report') initReport();
    if (name === 'content') loadContent();
    if (name === 'team') loadTeam();
    if (name === 'activity') loadActivity();
  }
  function loadPlugin(type) {
    return new Promise(function (res) {
      if (types[type]) return res(types[type]);
      var s = document.createElement('script'); s.src = '/lab/engine/types/' + type + '-admin.js';
      s.onload = function () { res(types[type] || {}); }; s.onerror = function () { res({}); };
      document.head.appendChild(s);
    });
  }
  function start() {
    err();
    getJSON('me').then(function (m) {
      me = m;
      return loadPlugin(m.study.type).then(function (p) {
        plugin = p;
        document.title = m.study.name + ': admin';
        $('title').textContent = m.study.name + ': admin';
        $('links').innerHTML = esc(m.study.typeLabel) + ' · participant page: <a href="' + esc(m.study.paths.participant) + '" target="_blank" rel="noopener">' + esc(location.origin + m.study.paths.participant) + '</a>' +
          (m.role === 'owner' ? ' · <a href="/lab/admin/">All studies</a>' : '');
        $('keyform').hidden = true; $('keyhelp').hidden = true; $('app').hidden = false;
        $('whoami').innerHTML = esc(m.name) + ' <span class="pill">' + esc(m.role) + '</span> <button type="button" class="secondary small" id="signout">Sign out</button>';
        $('signout').addEventListener('click', function () { if (dirty && !confirm('Discard unsaved content changes?')) return; dirty = false; setKey(''); location.reload(); });
        document.querySelectorAll('[data-role]').forEach(function (el) { el.hidden = !can(el.getAttribute('data-role')); });
        $('tabs').innerHTML = TABS.filter(function (t) { return can(t[2]); }).map(function (t) { return '<button type="button" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');
        $('tabs').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
        $('trole').innerHTML = ['viewer', 'editor', 'manager'].map(function (r) { return '<option value="' + r + '">' + r[0].toUpperCase() + r.slice(1) + '</option>'; }).join('');
        var desc = function () { $('roledesc').textContent = m.roles[$('trole').value]; }; $('trole').addEventListener('change', desc); desc();
        $('selftest').textContent = 'Run self-test (' + (m.conditions.length === 1 ? 'one group' : 'all ' + m.conditions.length + ' groups') + ')';
        $('rpintro').innerHTML = plugin.reportIntro || 'How the items and sessions are performing, for tuning the study after a pilot.';
        var last = null; try { last = sessionStorage.getItem(tabKey); } catch (e) {}
        showTab(TABS.some(function (t) { return t[0] === last && can(t[2]); }) ? last : 'participants');
      });
    }).catch(function (e) { if (e.code !== 'no_study') setKey(''); $('keyform').hidden = false; $('app').hidden = true; err(e.message); });
  }
  $('keyform').addEventListener('submit', function (e) { e.preventDefault(); setKey($('key').value.trim()); start(); });

  // ---------- participants and exports ----------
  // Exports are assembled here from small batches of participants, so no single server request has to
  // read the whole study (Netlify functions have a time and response-size limit).
  var FIRST = ['code', 'condition', 'test', 'label', 'self_signup', 'session', 'trial_index'];
  function batched(codes, size, fetchOne, onProgress) {
    var batches = [], out = [];
    for (var i = 0; i < codes.length; i += size) batches.push(codes.slice(i, i + size));
    return (function step(i) {
      if (i >= batches.length) return Promise.resolve(out);
      if (onProgress) onProgress(i / Math.max(1, batches.length));
      return fetchOne(batches[i]).then(function (r) { out.push(r); return step(i + 1); });
    })(0);
  }
  function rowsFor(codes, kind, progress) {
    return batched(codes, 4, function (b) { return getJSON('rows?kind=' + kind + '&codes=' + b.join(',')); }, progress).then(function (parts) { return [].concat.apply([], parts); });
  }
  document.querySelectorAll('[data-export]').forEach(function (b) {
    b.addEventListener('click', function () {
      err(); var kind = b.getAttribute('data-export'), buttons = document.querySelectorAll('[data-export]');
      buttons.forEach(function (x) { x.disabled = true; });
      var prog = function (f) { $('exprog').textContent = 'Exporting… ' + Math.round(f * 100) + '%'; };
      getJSON('participants').then(function (list) {
        var codes = list.filter(function (p) { return !$('exreal').checked || !p.test; }).map(function (p) { return p.code; });
        var work = kind === 'raw' ? batched(codes, 1, function (c) { return getJSON('raw?codes=' + c[0]); }, prog).then(function (parts) {
            saveFile([].concat.apply([], parts).map(function (x) { return JSON.stringify(x); }).join('\n') + '\n', studyId + '_raw_' + day() + '.jsonl', 'application/x-ndjson');
          })
          : kind === 'json' ? batched(codes, 2, function (c) { return getJSON('records?codes=' + c.join(',')); }, prog).then(function (parts) {
            saveFile(JSON.stringify({ study: studyId, type: me.study.type, exportedAt: new Date().toISOString(), participants: [].concat.apply([], parts.map(function (r) { return r.participants; })),
              records: [].concat.apply([], parts.map(function (r) { return r.records; })) }), studyId + '_all_' + day() + '.json', 'application/json');
          })
          : rowsFor(codes, kind, prog).then(function (rows) { saveFile(toCsv(rows, kind === 'trials' ? FIRST : FIRST.slice(0, 6)), studyId + '_' + kind + '_' + day() + '.csv', 'text/csv'); });
        return work.then(function () { $('exprog').textContent = 'Exported ' + codes.length + ' participants.'; });
      }).catch(function (e) { err(e.message); }).then(function () { buttons.forEach(function (x) { x.disabled = false; }); });
    });
  });
  $('credit').addEventListener('click', function () {
    err(); call('credit.csv').then(function (r) { return r.blob(); }).then(function (blob) { saveFile(blob, studyId + '_extra_credit_' + day() + '.csv'); }).catch(function (e) { err(e.message); });
  });
  var people = [];
  function load() {
    getJSON('participants').then(function (rows) {
      people = rows;
      var real = rows.filter(function (p) { return !p.test; });
      var by = {}; real.forEach(function (p) { by[p.condition] = (by[p.condition] || 0) + 1; });
      $('summary').textContent = rows.length + ' participants (' + (rows.length - real.length) + ' test). Real participants by condition: ' +
        (Object.keys(by).map(function (k) { return k + ' ' + by[k]; }).join(', ') || 'none yet') + '. Finished all sessions: ' + real.filter(function (p) { return p.completedSessions >= p.totalSessions; }).length + '.';
      var head = ['Study ID', 'Sign-in', 'Label', 'Condition', 'Test', 'Consent', 'Sessions done', 'In progress', 'Next opens', 'Gap', 'Last seen'].concat(can('owner') ? [''] : []);
      $('tbl').innerHTML = '<tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' + rows.map(function (p) {
        return '<tr><td><code>' + esc(p.code) + '</code></td><td>' + esc(p.type) + '</td><td>' + esc(p.label) + '</td><td>' + esc(p.condition) + '</td><td>' + (p.test ? 'yes ' : '') +
          (can('manager') ? '<button type="button" class="secondary small" data-settest="' + esc(p.code) + '|' + (p.test ? '0' : '1') + '">' + (p.test ? 'Mark real' : 'Mark test') + '</button>' : '') + '</td><td>' +
          (p.declined ? 'declined' : p.consented ? 'yes' : '') + '</td><td>' + p.completedSessions + ' / ' + p.totalSessions + '</td><td>' + (p.inProgress ? p.inProgress + ' / ' + p.inProgressOf : '') + '</td><td>' +
          (p.nextSession ? 'S' + p.nextSession + ' ' + esc(fmt(p.availableAt)) : 'done') + '</td><td>' + p.gapDays + 'd</td><td>' + esc(fmt(p.lastSeenAt)) + '</td>' +
          (can('owner') ? '<td><button type="button" class="danger secondary small" data-del="' + esc(p.code) + '">Delete</button></td>' : '') + '</tr>';
      }).join('');
    }).catch(function (e) { err(e.message); });
  }
  $('refresh').addEventListener('click', load);
  $('tbl').addEventListener('click', function (e) {
    var v = e.target.getAttribute && e.target.getAttribute('data-settest');
    if (v) { var parts = v.split('|'); return postJSON('set-test', { id: parts[0], test: parts[1] === '1' }).then(load).catch(function (x) { err(x.message); }); }
    var id = e.target.getAttribute && e.target.getAttribute('data-del'); if (!id) return;
    var p = people.filter(function (x) { return x.code === id; })[0] || {};
    if (!confirm('Permanently delete ' + id + (p.test ? ' (test)' : '') + ' and all of their answers and traces?' +
      (p.test ? '' : '\n\nThis is a REAL participant. Only do this if they withdrew or asked for their data to be removed.') + '\n\nThis cannot be undone.')) return;
    postJSON('delete', { id: id }).then(function (r) { load(); setTimeout(function () { $('summary').insertAdjacentHTML('afterbegin', '<span class="ok">Deleted ' + esc(r.code) + ' and ' + r.records + ' records.</span> '); }, 600); }).catch(function (x) { err(x.message); });
  });
  $('selftest').addEventListener('click', function () {
    var btn = $('selftest'), keep = $('stkeep').checked, groups = me.conditions, results = [];
    btn.disabled = true; err(); $('stout').innerHTML = '';
    function step(i, code) {
      if (i >= groups.length) return finish();
      $('stprog').textContent = 'Running ' + groups[i] + (code ? '…' : ' (starting)…');
      postJSON('self-test', code ? { code: code } : { condition: groups[i], keep: keep }).then(function (r) {
        if (r.error) throw new Error(r.error);
        if (!r.done) { $('stprog').textContent = 'Running ' + groups[i] + ': session ' + r.session + ' of ' + r.sessions + ', ' + r.passed + ' checks passed so far…'; return step(i, r.code); }
        results.push(r); step(i + 1, null);
      }).catch(function (e) { btn.disabled = false; $('stprog').textContent = ''; err('Self-test stopped: ' + e.message); });
    }
    function finish() {
      btn.disabled = false;
      var failed = results.reduce(function (n, r) { return n + r.failed; }, 0), passed = results.reduce(function (n, r) { return n + r.passed; }, 0);
      $('stprog').innerHTML = failed ? '<span class="error">' + failed + ' check(s) failed, ' + passed + ' passed.</span>' : '<span class="ok">All ' + passed + ' checks passed</span> (content version ' + results[0].contentVersion + ').';
      $('stout').innerHTML = results.map(function (r) {
        return '<details' + (r.failed ? ' open' : '') + ' style="margin:8px 0"><summary><strong>' + esc(r.condition) + '</strong>: ' + r.passed + ' passed, ' + r.failed + ' failed, ' + Math.round(r.ms / 1000) + 's' + (r.kept ? ' (kept as ' + esc(r.code) + ')' : '') + '</summary><ul style="margin:6px 0;font-size:13px">' +
          r.checks.map(function (c) { return '<li class="' + (c.pass ? '' : 'error') + '">' + (c.pass ? '✓ ' : '✗ ') + esc(c.what) + '</li>'; }).join('') + '</ul></details>';
      }).join('');
      load();
    }
    step(0, null);
  });
  $('deltest').addEventListener('click', function () {
    var n = people.filter(function (p) { return p.test; }).length;
    if (!n) return err('There are no test participants.');
    if (prompt('This permanently deletes all ' + n + ' test participants and their data. Real participants are not touched.\n\nType DELETE to confirm.') !== 'DELETE') return;
    postJSON('delete-test', { confirm: 'DELETE' }).then(function (r) { load(); setTimeout(function () { $('summary').insertAdjacentHTML('afterbegin', '<span class="ok">Deleted ' + r.participants + ' test participants and ' + r.records + ' records.</span> '); }, 600); }).catch(function (e) { err(e.message); });
  });

  // ---------- backups (owner) ----------
  function loadBackup() {
    getJSON('backup-status').then(function (b) {
      $('bkstatus').innerHTML = b.lastRunAt ? 'Last backup run ' + esc(fmt(b.lastRunAt)) + (b.complete ? ' (complete)' : ' (catching up: ' + b.pending + ' records left)') + '. Last complete copy: ' + esc(fmt(b.lastCompleteAt) || 'not yet') + '. Records in backup: ' + b.keysInMirror + ' of ' + b.keysInStudy + '.' : 'No backup has run yet. The first hourly run happens within an hour, or click "Run backup now".';
    }).catch(function (e) { $('bkstatus').textContent = e.message; });
  }
  $('bkrun').addEventListener('click', function () {
    err(); $('bkrun').disabled = true; $('bkprog').textContent = 'Backing up…';
    (function step(n) {
      return postJSON('backup-run', {}).then(function (r) {
        $('bkprog').textContent = 'Copied ' + r.copied + ' records' + (r.complete ? '. Backup complete.' : ', ' + r.pending + ' left…');
        if (!r.complete && n < 40) return step(n + 1);
      });
    })(0).catch(function (e) { err(e.message); }).then(function () { $('bkrun').disabled = false; loadBackup(); });
  });
  $('bkdl').addEventListener('click', function () {
    err(); var btn = $('bkdl'); btn.disabled = true;
    getJSON('participants').then(function (list) {
      var codes = list.map(function (p) { return p.code; }), n = Math.ceil(codes.length / 2) + codes.length, done = 0;
      var prog = function () { $('bkprog').textContent = 'Collecting… ' + Math.round(done++ / Math.max(1, n) * 100) + '%'; };
      var parts, raw;
      return batched(codes, 2, function (b) { prog(); return getJSON('backup-part?part=people&codes=' + b.join(',')); }).then(function (p) { parts = p; })
        .then(function () { return batched(codes, 1, function (c) { prog(); return getJSON('raw?codes=' + c[0]); }); }).then(function (r) { raw = [].concat.apply([], r); })   // raw traces are the bulk: one participant per request
        .then(function historyStep(page, acc) {   // every saved version of the study content, 10 at a time
          page = page || 0; acc = acc || [];
          return getJSON('backup-part?part=history&page=' + page).then(function (r) { acc = acc.concat(r.entries); return (page + 1) * 10 < r.total ? historyStep(page + 1, acc) : acc; });
        }).then(function (history) {
          return getJSON('backup-part?part=meta').then(function (meta) {
            meta.contentHistory = history;
            var flat = function (k) { return [].concat.apply([], parts.map(function (p) { return p[k] || []; })); };
            var all = { kind: studyId + ' complete backup', exportedAt: new Date().toISOString(), meta: meta, participants: flat('participants'), contacts: flat('contacts'), plans: flat('plans'), records: flat('records'), raw: raw };
            var text = JSON.stringify(all), name = studyId + '_backup_' + day() + '.json';
            if (window.CompressionStream) return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob().then(function (b) {
              saveFile(b, name + '.gz'); $('bkprog').textContent = 'Downloaded ' + all.participants.length + ' participants, ' + all.records.length + ' records (' + Math.round(b.size / 1024) + ' KB compressed). Save it to GSU-approved storage.';
            });
            saveFile(text, name, 'application/json'); $('bkprog').textContent = 'Downloaded. Save it to GSU-approved storage.';
          });
        });
    }).catch(function (e) { err(e.message); }).then(function () { btn.disabled = false; });
  });

  // ---------- pilot report ----------
  var reportTable = null;
  function initReport() {
    getJSON('participants').then(function (list) {
      var labels = []; list.forEach(function (p) { if (p.label && labels.indexOf(p.label) < 0) labels.push(p.label); });
      var cur = $('rplabel').value;
      $('rplabel').innerHTML = '<option value="">All labels</option>' + labels.sort().map(function (l) { return '<option' + (l === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
    }).catch(function (e) { err(e.message); });
  }
  $('rprun').addEventListener('click', function () {
    err(); $('rprun').disabled = true; $('rpout').innerHTML = ''; $('rpcsv').disabled = true;
    Promise.all([getJSON('participants'), getJSON('content')]).then(function (res) {
      var who = $('rpwho').value, label = $('rplabel').value;
      var sel = res[0].filter(function (p) { return (who === 'all' || !p.test) && (!label || p.label === label); });
      return rowsFor(sel.map(function (p) { return p.code; }), 'trials', function (f) { $('rpprog').textContent = 'Reading answers… ' + Math.round(f * 100) + '%'; })
        .then(function (rows) { renderReport(sel, rows, res[1]); });
    }).catch(function (e) { err(e.message); }).then(function () { $('rprun').disabled = false; });
  });
  var RA = { esc: esc, mean: mean, median: median, pct: function (a) { return a.length ? Math.round(mean(a) * 100) + '%' : '–'; }, num: function (v) { return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); } };
  function renderReport(sel, rows, content) {
    $('rpprog').textContent = sel.length + ' participants, ' + rows.length + ' answered items.';
    if (!rows.length) { $('rpout').innerHTML = '<p class="muted">No answers yet for this selection.</p>'; return; }
    // Sessions: started, completed, and time taken (compare with the minutes promised in the consent).
    var sess = {};
    rows.forEach(function (r) { var k = r.code + '|' + r.session; if (!sess[k]) sess[k] = { s: r.session, start: r.session_started_at, end: r.session_completed_at }; });
    var byS = {}; Object.keys(sess).forEach(function (k) { var x = sess[k]; var b = byS[x.s] = byS[x.s] || { started: 0, done: 0, mins: [] }; b.started++; if (x.end) { b.done++; if (x.start) b.mins.push((new Date(x.end) - new Date(x.start)) / 60000); } });
    var h = '<h2>Sessions</h2><div class="table-wrap"><table><tr><th>Session</th><th>Started</th><th>Completed</th><th>Median minutes</th><th>Slowest</th></tr>' +
      Object.keys(byS).sort(function (a, b) { return a - b; }).map(function (s) { var x = byS[s], md = median(x.mins); return '<tr><td>' + s + '</td><td>' + x.started + '</td><td>' + x.done + '</td><td>' + (md == null ? '–' : md.toFixed(1)) + '</td><td>' + (x.mins.length ? Math.max.apply(null, x.mins).toFixed(1) : '–') + '</td></tr>'; }).join('') +
      '</table></div><p class="muted">Compare the median with the ' + content.minutesPerSession + ' minutes promised to participants (Study content → Sign-up &amp; consent).</p>';
    var cs = {};
    rows.forEach(function (r) { var k = r.condition + '|' + r.session, x = cs[k] = cs[k] || { n: 0, secs: [] }; x.n++; var t = RA.num(r.trial_ms); if (t != null) x.secs.push(t / 1000); });
    h += '<h2>By condition and session</h2><div class="table-wrap"><table><tr><th>Condition</th><th>Session</th><th>Answered items</th><th>Median seconds per item</th></tr>' +
      Object.keys(cs).sort().map(function (k) { var x = cs[k], p = k.split('|'), md = median(x.secs); return '<tr><td>' + esc(p[0]) + '</td><td>' + p[1] + '</td><td>' + x.n + '</td><td>' + (md == null ? '–' : md.toFixed(1)) + '</td></tr>'; }).join('') + '</table></div>';
    reportTable = null;
    if (plugin.report) { var r = plugin.report(rows, content, RA); h += r.html; reportTable = r.table || null; }
    $('rpout').innerHTML = h; $('rpcsv').disabled = !reportTable;
  }
  $('rpcsv').addEventListener('click', function () { if (reportTable) saveFile(toCsv(reportTable.rows, reportTable.cols), studyId + '_' + reportTable.name + '_' + day() + '.csv', 'text/csv'); });

  // ---------- students ----------
  function emails(id) { return $(id).value.split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  $('rosterform').addEventListener('submit', function (e) {
    e.preventDefault(); err();
    var list = emails('emails'); if (!list.length) return;
    postJSON('roster', { emails: list, label: $('rlabel').value.trim() || null, gapDays: $('rgap').value === '' ? null : Number($('rgap').value), test: $('rtest').checked }).then(function (res) {
      $('rosterout').innerHTML = '<span class="ok">Added ' + res.added + '.</span> Already enrolled: ' + res.existing + '.' + (res.invalid.length ? ' Not valid emails (skipped): ' + esc(res.invalid.join(', ')) : '');
      $('emails').value = '';
    }).catch(function (e) { err(e.message); });
  });
  var lookupRows = [];
  $('lookupform').addEventListener('submit', function (e) {
    e.preventDefault(); err();
    var list = emails('lemails'); if (!list.length) return;
    postJSON('lookup', { emails: list }).then(function (rows) {
      lookupRows = rows; $('lcsv').disabled = !rows.length;
      $('ltbl').innerHTML = '<tr><th>Email</th><th>Enrolled</th><th>Consented</th><th>Sessions done</th><th>Finished</th><th>Last session</th></tr>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.email) + '</td><td>' + (r.enrolled ? 'yes' : '<strong>no</strong>') + '</td><td>' + (r.declined ? 'declined' : r.consented ? 'yes' : '') + '</td><td>' +
          (r.enrolled ? r.completedSessions + ' / ' + r.totalSessions : '') + '</td><td>' + (r.finished ? '<span class="ok">yes</span>' : '') + '</td><td>' + esc(fmt(r.lastCompletedAt)) + '</td></tr>';
      }).join('');
    }).catch(function (e) { err(e.message); });
  });
  $('lcsv').addEventListener('click', function () {
    saveFile(toCsv(lookupRows.map(function (r) { return { email: r.email, enrolled: r.enrolled ? 1 : 0, consented: r.consented ? 1 : 0, sessions_completed: r.completedSessions || 0, finished: r.finished ? 1 : 0, last_session: r.lastCompletedAt ? new Date(r.lastCompletedAt).toISOString() : '' }; }), []),
      studyId + '_completion_' + day() + '.csv', 'text/csv');
  });
  $('createform').addEventListener('submit', function (e) {
    e.preventDefault(); err();
    postJSON('create', { count: Number($('count').value), label: $('label').value.trim() || null, gapDays: $('gap').value === '' ? null : Number($('gap').value), test: $('test').checked }).then(function (res) {
      var box = $('created'); box.hidden = false;
      box.textContent = 'Created ' + res.created.length + ' codes (send one per person; do not reuse):\n' + res.created.map(function (p) { return p.code + '\t' + p.condition + (p.test ? '\ttest' : ''); }).join('\n');
    }).catch(function (e) { err(e.message); });
  });

  // ---------- study content editor ----------
  // Engine parts (surveys, consent, screen text) are edited here; each study type adds its own tabs.
  var saved = null, draft = null, dirty = false, sub = null, META = {};
  var QTYPE_LABEL = { scale: 'Rating scale', choice: 'Multiple choice', select: 'Dropdown', text: 'Text answer', confidence: 'Confidence line (0–100)', number: 'Number (typed in)', multi: 'Select all that apply' };
  var AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
  function setDirty(v) { dirty = v; $('dirty').innerHTML = v ? '<strong>Unsaved changes.</strong>' : 'No unsaved changes.'; $('save').disabled = !v; $('discard').disabled = !v; }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function subs() { return (plugin.subtabs || []).concat([['pre', 'Start-of-session survey'], ['post', 'End-of-session survey'], ['consent', 'Sign-up & consent'], ['text', 'Screen text']]); }
  function loadContent(force) {
    if (draft && !force) return renderEditor();
    Promise.all([getJSON('content'), getJSON('content-history'), getJSON('participants')]).then(function (res) {
      var c = res[0];
      META = { text: c._textFields, type: c._meta || {}, conditions: c._conditions || [], rules: c._surveyRules || [], qtypes: c._questionTypes || Object.keys(QTYPE_LABEL) };
      Object.keys(c).forEach(function (k) { if (k[0] === '_') delete c[k]; });
      saved = c; draft = clone(saved); A.draft = draft; setDirty(false);
      if (!sub || !subs().some(function (s) { return s[0] === sub; })) sub = subs()[0][0];
      if (plugin.onLoad) plugin.onLoad(A);
      var started = res[2].filter(function (p) { return !p.test && (p.consented || p.completedSessions); }).length;
      $('contentinfo').textContent = 'Current version: ' + (saved.version || 0) + (saved.version ? ', saved ' + fmt(saved.savedAt) + ' by ' + saved.savedBy : ' (the built-in defaults)') + '.' + (can('editor') ? '' : ' You can view the content but not change it.');
      $('contentwarn').innerHTML = started ? '<div class="warn">' + started + ' real participant' + (started === 1 ? ' has' : 's have') + ' already started. Changes apply from each participant\'s next session (a session in progress keeps the plan it started with). Answers record the version they were collected under, and each answer keeps a copy of the item as shown. Changing the design mid-study makes sessions hard to compare, so check with the team first.</div>' : '';
      $('vtbl').innerHTML = '<tr><th>Version</th><th>Saved</th><th>By</th><th></th></tr>' + res[1].map(function (v) {
        return '<tr><td>' + v.version + (v.version === saved.version ? ' (current)' : '') + '</td><td>' + esc(fmt(v.savedAt)) + '</td><td>' + esc(v.savedBy) + (v.restoredFrom != null ? ' (restored v' + v.restoredFrom + ')' : '') + '</td><td>' +
          (can('editor') && v.version !== saved.version ? '<button type="button" class="secondary small" data-restore="' + v.version + '">Restore</button>' : '') + '</td></tr>';
      }).join('') + '<tr><td>0</td><td colspan="2">Built-in defaults</td><td>' + (can('editor') && saved.version ? '<button type="button" class="secondary small" data-restore="0">Restore</button>' : '') + '</td></tr>';
      renderEditor();
    }).catch(function (e) { err(e.message); });
  }
  $('vtbl').addEventListener('click', function (e) {
    var v = e.target.getAttribute && e.target.getAttribute('data-restore'); if (v == null) return;
    if (!confirm((dirty ? 'Your unsaved changes will be discarded. ' : '') + 'Restore version ' + v + '? It will be saved as a new version.')) return;
    postJSON('content-restore', { version: Number(v) }).then(function () { loadContent(true); }).catch(function (e) { err(e.message); });
  });
  $('discard').addEventListener('click', function () { if (confirm('Discard all unsaved changes?')) { err(); loadContent(true); } });
  $('save').addEventListener('click', function () {
    err(); $('save').disabled = true;
    postJSON('content-save', { content: draft, baseVersion: saved.version || 0, note: $('note').value.trim() || undefined })
      .then(function (r) { $('note').value = ''; loadContent(true); setTimeout(function () { $('dirty').innerHTML = '<span class="ok">Saved as version ' + r.version + '.</span>'; }, 400); })
      .catch(function (e) { $('save').disabled = false; err(e.message); });
  });

  // Form helpers. data-path="a.b.0.c" binds a field to that place in the draft.
  function field(label, html) { return '<label class="f">' + label + html + '</label>'; }
  function checkbox(attr, checked, label) { return '<label class="f check"><input type="checkbox" ' + attr + (checked ? ' checked' : '') + '> ' + label + '</label>'; }
  function inp(path, value, extra) { return '<input type="text" data-path="' + path + '" value="' + esc(value) + '"' + (extra || '') + '>'; }
  function num(path, value, lo, hi) { return '<input type="number" min="' + lo + '" max="' + hi + '" data-path="' + path + '" data-num="1" value="' + esc(value) + '">'; }
  function area(path, value, rows) { return '<textarea data-path="' + path + '" rows="' + (rows || 3) + '">' + esc(value) + '</textarea>'; }
  function sel(path, value, opts) { return '<select data-path="' + path + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function getPath(path) { return path.split('.').reduce(function (o, k) { return o[k]; }, draft); }
  function setPath(path, v) { var ks = path.split('.'), last = ks.pop(); ks.reduce(function (o, k) { return o[k]; }, draft)[last] = v; }
  function btn(attr, label, cls, disabled) { return '<button type="button" class="' + (cls || 'secondary') + ' small" ' + attr + (disabled ? ' disabled' : '') + '>' + label + '</button>'; }
  function conditionsNow() { return plugin.conditions ? plugin.conditions(draft) : META.conditions; }

  // One question card. opts: sessions ('pre' | 'post' | false), rules (show-when rules), conditions.
  function qcard(list, it, i, n, opts) {
    var b = list + '.' + i, conds = opts.conditions || [];
    var optText = (it.options || []).map(function (o) { return o.value === o.label ? o.label : o.value + ' | ' + o.label; }).join('\n');
    var typeOpts = META.qtypes.map(function (t) { return [t, QTYPE_LABEL[t] || t]; });
    return '<div class="qcard"><div class="bar"><strong>Question ' + (i + 1) + '</strong><div class="btns">' +
      btn('data-move="' + list + '|' + i + '|-1"', '↑', null, i === 0) + btn('data-move="' + list + '|' + i + '|1"', '↓', null, i === n - 1) +
      btn('data-dupq="' + list + '|' + i + '"', 'Duplicate') + btn('data-remove="' + list + '|' + i + '"', 'Remove', 'danger secondary') + '</div></div>' +
      field('Question text', area(b + '.text', it.text, 2)) +
      '<div class="grid3">' + field('Variable name', inp(b + '.id', it.id, ' class="mono"')) + field('Type', sel(b + '.type', it.type, typeOpts)) +
      (opts.rules && opts.rules.length ? field('Show when', sel(b + '.showIf', it.showIf || 'always', [['always', 'Always']].concat(opts.rules))) : '') + '</div>' +
      (opts.sessions ? field('Page (questions with the same number are shown together; blank = page 1)', '<input type="text" data-page="' + b + '" value="' + esc(it.page || '') + '" style="max-width:120px">') : '') +
      (opts.sessions ? field('Sessions (numbers separated by commas; blank = ' + (opts.sessions === 'pre' ? 'session 1 only' : 'every session') + ')', '<input type="text" data-sessions="' + b + '" value="' + esc((it.sessions || []).join(', ')) + '" style="max-width:240px">') : '') +
      (conds.length > 1 ? '<div class="f"><span>Conditions (none ticked = everyone)</span><div class="row">' + conds.map(function (c) { return '<label class="check"><input type="checkbox" data-qcond="' + b + '|' + esc(c) + '"' + ((it.conditions || []).indexOf(c) >= 0 ? ' checked' : '') + '> ' + esc(c) + '</label>'; }).join('') + '</div></div>' : '') +
      (it.type === 'scale' ? '<div class="grid3">' + field('Points', num(b + '.n', it.n || 7, 2, 11)) + field('Label for 1', inp(b + '.lo', it.lo || '')) + field('Label for the top point', inp(b + '.hi', it.hi || '')) + '</div>' +
        field('Label every point (recommended): one line per point, from 1 to ' + (it.n || 7) + '. Leave empty to label only the ends.', '<textarea data-labels="' + b + '" rows="' + Math.min(11, it.n || 7) + '" class="mono">' + esc((it.labels || []).join('\n')) + '</textarea>') : '') +
      (it.type === 'choice' || it.type === 'select' || it.type === 'multi' ? field('Options, one per line (optionally "saved value | text shown")', '<textarea data-opts="' + b + '" rows="4" class="mono">' + esc(optText) + '</textarea>') : '') +
      (it.type === 'number' ? '<p class="muted">A box for a typed number, kept exactly as entered (no range check, so an impossible answer is still recorded). Non-numbers are not accepted.</p>' : '') +
      (it.type === 'multi' ? '<p class="muted">Checkboxes. The CSV cell lists the ticked options\' saved values joined with |.</p>' : '') +
      (it.type === 'confidence' ? '<p class="muted">A 0–100 line with no starting point. Its end labels and help text are on the Screen text tab.</p>' : '') +
      checkbox('data-path="' + b + '.required" data-bool="1"', it.required, 'Required (if unticked, a skipped question gets one gentle reminder)') + '</div>';
  }
  function qlist(list, opts) {
    var items = getPath(list);
    return items.map(function (it, i) { return qcard(list, it, i, items.length, opts); }).join('') + '<button type="button" class="secondary" data-add="' + list + '">Add a question</button>';
  }
  // What type plugins get.
  var A = { draft: null, meta: function () { return META.type; }, conditions: conditionsNow, esc: esc, field: field, checkbox: checkbox, inp: inp, num: num, area: area, sel: sel, btn: btn,
    getPath: getPath, setPath: setPath, clone: clone, qlist: qlist, can: can };

  function renderEditor() {
    $('subtabs').innerHTML = subs().map(function (s) { return '<button type="button" data-sub="' + s[0] + '" aria-selected="' + (s[0] === sub) + '">' + s[1] + '</button>'; }).join('');
    var h = '';
    if (sub === 'pre' || sub === 'post') {
      h = '<p class="muted">' + (sub === 'pre' ? 'Shown at the start of a session, before the items. By default only in session 1; list other session numbers to ask again (for example, 1, 4).' : 'Shown at the end of a session. Leave "Sessions" blank to ask every session.') +
        (META.rules.length ? ' "Show when" limits a question to some sessions (for example, with or without the AI).' : '') +
        ' The variable name is the column name in the surveys CSV: keep it if you only reword a question, and use a new name if it now measures something different.</p>' +
        qlist('survey.' + sub, { sessions: sub, rules: META.rules, conditions: conditionsNow() });
    } else if (sub === 'consent') {
      var en = draft.enrollment;
      h = '<h3 style="margin:0 0 8px">Sign-up</h3>' +
        checkbox('data-path="enrollment.open" data-bool="1"', en.open, 'Anyone with an email address at these domains can sign up (no list needed)') +
        '<p class="muted">Participants type their email each session; the first time, they confirm it. There is no verification email, so the study relies on people entering their own address. Emails added on the Students tab can always sign in, even with sign-up off.</p>' +
        '<div class="grid3">' + field('Email domains (one per line, no @)', '<textarea data-domains="1" rows="3" class="mono">' + esc(en.domains.join('\n')) + '</textarea>') +
        field('Gap days between sessions (self sign-ups)', num('enrollment.gapDays', en.gapDays, 0, 60)) + field('Label for self sign-ups', inp('enrollment.label', en.label || '')) + '</div>' +
        '<h3 style="margin:20px 0 8px">Consent</h3>' + field('Minutes per session (write {minutes} in any text to insert it)', num('minutesPerSession', draft.minutesPerSession, 1, 180)) +
        field('Consent text (leave a blank line between paragraphs; email addresses become links)', '<textarea id="consenttext" rows="14">' + esc(draft.consent.paragraphs.join('\n\n')) + '</textarea>') +
        field('Agreement checkbox label', inp('consent.agreeLabel', draft.consent.agreeLabel)) +
        checkbox('data-path="consent.approved" data-bool="1"', draft.consent.approved, 'This is the IRB-approved consent text (removes the "draft" banner participants see)');
    } else if (sub === 'text') {
      var group = null;
      h = '<p class="muted">Every piece of text participants see. Words in {braces} are filled in on screen (listed in each label). Leave a blank line between paragraphs.</p>';
      META.text.forEach(function (f) {
        if (f.group !== group) { h += '<h3 style="margin:20px 0 8px">' + esc(f.group) + '</h3>'; group = f.group; }
        var changed = draft.text[f.key] !== f.def;
        h += '<div class="f"><span>' + esc(f.label) + (changed ? ' · ' + btn('data-resettext="' + f.key + '"', 'Reset to default') : '') + '</span>' +
          area('text.' + f.key, draft.text[f.key], Math.min(6, Math.max(1, Math.ceil(String(draft.text[f.key]).length / 90)))) + '</div>';
      });
    } else h = plugin.render(sub, A);
    $('editor').innerHTML = h;
    $('editor').disabled = !can('editor');
  }
  $('subtabs').addEventListener('click', function (e) { var s = e.target.getAttribute && e.target.getAttribute('data-sub'); if (s) { sub = s; renderEditor(); } });

  // Applies one field edit to the draft. Returns true when the screen should be redrawn.
  function applyEdit(t) {
    var v, redraw = false;
    var r = plugin.applyEdit ? plugin.applyEdit(t, A) : undefined;
    if (r !== undefined) { setDirty(true); return r; }
    if (t.id === 'consenttext') draft.consent.paragraphs = t.value.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    else if ((v = t.getAttribute('data-opts'))) setPath(v + '.options', t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.split(/\s+\|\s+/); return m.length > 1 ? { value: m[0].trim(), label: m.slice(1).join(' | ').trim() } : { value: l, label: l };
    }));
    else if ((v = t.getAttribute('data-labels'))) setPath(v + '.labels', t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean));
    else if (t.hasAttribute('data-domains')) draft.enrollment.domains = t.value.split(/[\s,;]+/).map(function (x) { return x.trim().toLowerCase().replace(/^@/, ''); }).filter(Boolean);
    else if ((v = t.getAttribute('data-page'))) { var pg = parseInt(t.value, 10), pq = getPath(v); if (pg >= 1) pq.page = pg; else delete pq.page; }
    else if ((v = t.getAttribute('data-sessions'))) setPath(v + '.sessions', t.value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(function (x) { return Number.isInteger(x); }));
    else if ((v = t.getAttribute('data-qcond'))) {
      var qc = v.split('|'), q = getPath(qc[0]), list = (q.conditions || []).filter(function (c) { return c !== qc[1]; });
      if (t.checked) list.push(qc[1]);
      q.conditions = conditionsNow().filter(function (c) { return list.indexOf(c) >= 0; });
    } else if ((v = t.getAttribute('data-path'))) {
      setPath(v, t.hasAttribute('data-bool') ? t.checked : t.hasAttribute('data-num') ? Number(t.value) : t.value);
      redraw = t.tagName === 'SELECT' || t.type === 'checkbox';
      if (/\.type$/.test(v)) {
        var it = getPath(v.replace(/\.type$/, ''));
        if (it.type === 'scale' && !it.n) { it.n = 7; it.lo = it.lo || AGREE7[0]; it.hi = it.hi || AGREE7[6]; }
        if ((it.type === 'choice' || it.type === 'select' || it.type === 'multi') && !(it.options && it.options.length)) it.options = [{ value: 'Option 1', label: 'Option 1' }, { value: 'Option 2', label: 'Option 2' }];
      }
    } else return false;
    setDirty(true);
    return redraw;
  }
  // Typing updates the draft without redrawing; checkboxes, dropdowns, and leaving a field can redraw.
  $('editor').addEventListener('input', function (e) { var t = e.target; if (t.tagName !== 'SELECT' && t.type !== 'checkbox') applyEdit(t); });
  $('editor').addEventListener('change', function (e) {
    var t = e.target;
    if (plugin.select && plugin.select(t, A)) return renderEditor();   // navigation inside a type tab (not an edit)
    if ((t.tagName === 'SELECT' || t.type === 'checkbox') && applyEdit(t) === true) renderEditor();
  });
  $('editor').addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null; if (!t || t.disabled) return;
    var v;
    if ((v = t.getAttribute('data-add'))) {
      var items = getPath(v), n = items.length + 1, id = 'q' + n;
      while (items.some(function (x) { return x.id === id; })) id = 'q' + (++n);
      items.push({ id: id, text: '', type: 'scale', n: 7, lo: AGREE7[0], hi: AGREE7[6], labels: AGREE7.slice(), required: false, showIf: 'always', sessions: v === 'survey.pre' ? [1] : [], conditions: [] });
    } else if ((v = t.getAttribute('data-remove'))) {
      var r = v.split('|'); if (!confirm('Remove this question?')) return; getPath(r[0]).splice(Number(r[1]), 1);
    } else if ((v = t.getAttribute('data-dupq'))) {
      var q = v.split('|'), list = getPath(q[0]), copy = clone(list[Number(q[1])]); copy.id = copy.id + '_copy'; list.splice(Number(q[1]) + 1, 0, copy);
    } else if ((v = t.getAttribute('data-move'))) {
      var m = v.split('|'), arr = getPath(m[0]), i = Number(m[1]), j = i + Number(m[2]), tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    } else if ((v = t.getAttribute('data-resettext'))) {
      draft.text[v] = META.text.filter(function (f) { return f.key === v; })[0].def;
    } else if (!(plugin.click && plugin.click(t, A))) return;
    setDirty(true); renderEditor();
  });

  // ---------- team ----------
  function loadTeam() {
    getJSON('team').then(function (rows) {
      $('teamtbl').innerHTML = '<tr><th>Name</th><th>Access</th><th>Added</th><th>Last active</th><th></th></tr>' + rows.map(function (m) {
        return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.role) + '</td><td>' + esc(fmt(m.createdAt)) + ' by ' + esc(m.createdBy) + '</td><td>' + esc(fmt(m.lastUsedAt)) + '</td><td><button type="button" class="danger secondary small" data-rm="' + m.id + '" data-name="' + esc(m.name) + '">Remove</button></td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="5" class="muted">No team members yet.</td></tr>');
    }).catch(function (e) { err(e.message); });
  }
  $('teamform').addEventListener('submit', function (e) {
    e.preventDefault(); err();
    var name = $('tname').value.trim(); if (!name) return err('Enter a name.');
    postJSON('team-add', { name: name, role: $('trole').value }).then(function (r) {
      var box = $('newkey'); box.hidden = false;
      box.innerHTML = '<div class="warn">Copy this key now and send it to ' + esc(r.name) + ' privately. It will not be shown again. They sign in at ' + esc(location.origin + location.pathname) + ' with it.</div><div class="row"><div class="keybox" style="flex:1">' + esc(r.key) + '</div><button type="button" class="secondary" id="copykey">Copy</button></div>';
      $('copykey').addEventListener('click', function () { try { navigator.clipboard.writeText(r.key); $('copykey').textContent = 'Copied'; } catch (x) {} });
      $('tname').value = ''; loadTeam();
    }).catch(function (e) { err(e.message); });
  });
  $('teamtbl').addEventListener('click', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-rm'); if (!id) return;
    if (!confirm('Remove ' + e.target.getAttribute('data-name') + '? Their key stops working immediately.')) return;
    postJSON('team-remove', { id: id }).then(loadTeam).catch(function (e) { err(e.message); });
  });

  // ---------- activity ----------
  function loadActivity() {
    getJSON('activity').then(function (rows) {
      $('acttbl').innerHTML = '<tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>' + rows.map(function (r) {
        return '<tr><td>' + esc(fmt(r.at)) + '</td><td>' + esc(r.who) + ' <span class="pill">' + esc(r.role) + '</span></td><td>' + esc(r.action) + '</td><td class="wrap-cell">' + esc(r.detail) + '</td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>');
    }).catch(function (e) { err(e.message); });
  }

  if (getKey()) start();

  // ======================= lab console =======================
  function labConsole() {
    document.title = 'Lab console';
    root.innerHTML = '<div class="who"><h1 style="margin:0">CCAIR Lab: studies</h1><span id="whoami" class="muted"></span></div>' + SIGNIN + '<div id="app" hidden>' +
      '<p class="muted">Every study runs on the same engine: sign-in, consent, sessions, surveys, behavior traces, exports, backups, team access, and the live self-test. A new study gets its own data store, admin page, and participant link. Studies start unlisted; list one on <a href="/lab/">the lab page</a> once its consent text is IRB-approved and it is ready to recruit.</p>' +
      '<div class="table-wrap"><table id="stbl"></table></div>' +
      '<div class="section"><h2>New study</h2><form id="newform"><div class="grid3">' +
      '<label class="f">Name<input type="text" id="nname" placeholder="Phishing email judgments"></label>' +
      '<label class="f">ID (in the link; lowercase letters, numbers, dashes)<input type="text" id="nid" class="mono" placeholder="phishing-judgments"></label>' +
      '<label class="f">Study type<select id="ntype"></select></label></div><p class="muted" id="ntypedesc"></p>' +
      '<label class="f">Description (shown on the lab page when listed)<textarea id="ndesc" rows="2"></textarea></label>' +
      '<div class="row"><button type="submit">Create study</button></div></form><div id="newout"></div></div></div>';
    $('keyhelp').innerHTML = 'Use the lab owner key (the <code>LAB_ADMIN_KEY</code> or <code>VC_ADMIN_KEY</code> Netlify variable). It is kept in this tab only.';
    var TYPES = [], idTouched = false;
    function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 31); }
    function list() {
      getJSON('studies').then(function (rows) {
        $('stbl').innerHTML = '<tr><th>Study</th><th>Type</th><th>Links</th><th>On lab page</th><th></th></tr>' + rows.map(function (s) {
          var t = TYPES.filter(function (x) { return x.id === s.type; })[0];
          return '<tr><td class="wrap-cell"><strong>' + esc(s.name) + '</strong> <span class="muted mono">' + esc(s.id) + '</span>' + (s.archived ? ' <span class="pill">archived</span>' : '') + (s.builtIn ? ' <span class="pill">built in</span>' : '') + '</td><td>' + esc(t ? t.label : s.type) + '</td>' +
            '<td class="links"><a href="' + esc(s.paths.admin) + '">Admin</a><a href="' + esc(s.paths.participant) + '" target="_blank" rel="noopener">Participant page</a></td><td>' + (s.listed && !s.archived ? 'yes' : 'no') + '</td><td>' +
            (s.builtIn ? '<span class="muted">set in code</span>' : btn2('data-list="' + esc(s.id) + '|' + (s.listed ? '0' : '1') + '"', s.listed ? 'Unlist' : 'List') + ' ' + btn2('data-arch="' + esc(s.id) + '|' + (s.archived ? '0' : '1') + '"', s.archived ? 'Restore' : 'Archive')) + '</td></tr>';
        }).join('');
      }).catch(function (e) { err(e.message); });
    }
    function btn2(attr, label) { return '<button type="button" class="secondary small" ' + attr + '>' + label + '</button>'; }
    function begin() {
      err();
      Promise.all([getJSON('me'), getJSON('types')]).then(function (res) {
        TYPES = res[1];
        $('keyform').hidden = true; $('keyhelp').hidden = true; $('app').hidden = false;
        $('whoami').innerHTML = esc(res[0].name) + ' <span class="pill">owner</span> <button type="button" class="secondary small" id="signout">Sign out</button>';
        $('signout').addEventListener('click', function () { setKey(''); location.reload(); });
        $('ntype').innerHTML = TYPES.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === 'vignettes' ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('');
        var d = function () { var t = TYPES.filter(function (x) { return x.id === $('ntype').value; })[0]; $('ntypedesc').textContent = t ? t.description : ''; };
        $('ntype').addEventListener('change', d); d();
        list();
      }).catch(function (e) { setKey(''); $('keyform').hidden = false; $('app').hidden = true; err(e.message); });
    }
    $('keyform').addEventListener('submit', function (e) { e.preventDefault(); setKey($('key').value.trim()); begin(); });
    $('nname').addEventListener('input', function () { if (!idTouched) $('nid').value = slug($('nname').value); });
    $('nid').addEventListener('input', function () { idTouched = true; });
    $('newform').addEventListener('submit', function (e) {
      e.preventDefault(); err();
      postJSON('create', { name: $('nname').value.trim(), id: $('nid').value.trim(), type: $('ntype').value, description: $('ndesc').value.trim() }).then(function (r) {
        var s = r.study;
        $('newout').innerHTML = '<div class="warn"><strong>' + esc(s.name) + '</strong> is ready, unlisted. Next: open its <a href="' + esc(s.paths.admin) + '">admin page</a>, edit the study content (consent, items, questions), and run the self-test. Participants sign in at <code>' + esc(location.origin + s.paths.participant) + '</code>.</div>';
        $('nname').value = ''; $('nid').value = ''; $('ndesc').value = ''; idTouched = false; list();
      }).catch(function (e) { err(e.message); });
    });
    $('stbl').addEventListener('click', function (e) {
      var v = e.target.getAttribute && (e.target.getAttribute('data-list') || e.target.getAttribute('data-arch')); if (!v) return;
      var p = v.split('|'), on = p[1] === '1', key = e.target.hasAttribute('data-list') ? 'listed' : 'archived';
      if (key === 'archived' && on && !confirm('Archive "' + p[0] + '"? Its participant page and admin page stop working, but no data is deleted. You can restore it here.')) return;
      var body = { id: p[0] }; body[key] = on;
      postJSON('update', body).then(list).catch(function (x) { err(x.message); });
    });
    if (getKey()) begin();
  }
})();
