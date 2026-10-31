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
  // A researcher account signs in on /lab/signin/ and its session is kept here (this tab only), like the key. When both exist the session is used.
  function getSession() { try { var s = JSON.parse(sessionStorage.getItem('lab_session') || 'null'); return s && s.token && s.expiresAt > Date.now() ? s : null; } catch (e) { return null; } }
  function setSession(s) { try { if (s) sessionStorage.setItem('lab_session', JSON.stringify(s)); else sessionStorage.removeItem('lab_session'); } catch (e) {} }
  function signInLink() { return '/lab/signin/?next=' + encodeURIComponent(location.pathname + location.hash); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(ms) { return ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function err(msg) { $('err').textContent = msg || ''; if (msg) $('err').scrollIntoView({ block: 'nearest' }); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var BASE = studyId ? '/api/lab/' + studyId + '/admin/' : '/api/lab/_lab/';
  function call(path, body) {
    var ses = getSession(), auth = ses ? { authorization: 'Bearer ' + ses.token } : { 'x-admin-key': getKey() };
    return fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: Object.assign(auth, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.ok) return r;
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (j.error === 'session_expired') setSession(null);
          var msg = r.status === 503 ? 'Admin is disabled: set LAB_ADMIN_KEY (16+ characters) in Netlify and redeploy.'
            : j.error === 'session_expired' ? 'Your sign-in expired. Sign in again.'
            : j.error === 'forbidden' && ses ? 'Your account does not have access to ' + (studyId ? 'this study. Ask the lab owner to add you.' : 'this page.')
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
  // Exports with sealed values (seal.js): opened in the browser when this tab holds the study's key, else saved as they are with a
  // note. Backups (.gz) are never opened: they stay encrypted on disk.
  function saveFile(data, name, type) {
    if (!window.LabSeal || !/\.(csv|json|jsonl|txt)$/i.test(name)) return saveRaw(data, name, type);
    var read = data instanceof Blob ? data.text() : Promise.resolve(String(data));
    read.then(function (text) {
      if (text.search(LabSeal.RE) < 0) return saveRaw(data, name, type);
      if (!LabSeal.loaded()) { saveRaw(data, name, type); return err('This file has encrypted values (they start with "sealed:v1"). To open them, unlock the Encryption tab with the study\'s key file and download again, or run node scripts/lab/seal.mjs open.'); }
      return LabSeal.openText(text, /\.jsonl?$/i.test(name) ? 'json' : 'csv').then(function (r) {
        saveRaw(new Blob([r.text], { type: (data instanceof Blob && data.type) || type || 'text/plain' }), name, type);
        if (r.other) err(r.other + ' value' + (r.other === 1 ? ' was' : 's were') + ' encrypted with a different key and ' + (r.other === 1 ? 'was' : 'were') + ' left as is. Unlock with the older key file to open ' + (r.other === 1 ? 'it' : 'them') + '.');
      });
    }).catch(function (e) { err(e.message); });
  }
  function saveRaw(data, name, type) {
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
  // `npm run lab` opens /lab/admin/#key=... so the researcher is signed in on their own computer. The key is kept
  // for this tab only and removed from the address bar at once. Only honored on this computer (localhost).
  (function () {
    var m = location.hash.match(/^#key=([^&]+)$/);
    if (!m || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    try { sessionStorage.setItem('lab_admin_key', decodeURIComponent(m[1])); sessionStorage.removeItem('lab_session'); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  })();

  var SIGNIN = '<div id="signinbox"><p style="margin-top:12px"><a class="btn" href="' + esc(signInLink()) + '">Sign in with your researcher account</a></p>' +
    '<form class="row" id="keyform" style="margin-top:12px"><label>Or use an admin key <input type="password" id="key" autocomplete="off" size="36"></label><button type="submit" class="secondary">Use key</button></form></div>' +
    '<p class="muted" id="keyhelp"></p><p class="error" id="err" role="alert"></p>';

  if (!studyId) return labConsole();

  // ======================= study admin =======================
  root.innerHTML = '<div class="who"><div class="brandmark"><span class="wordmark"><b>CCAIR Behavioral Lab</b><small>Georgia State University · J. Mack Robinson College of Business</small></span><h1 style="margin:0" id="title">Study admin</h1></div><span id="whoami" class="muted"></span></div>' + SIGNIN + '<div id="app" hidden>' +
    '<p class="muted links" id="links"></p>' +
    '<div class="preview-bar" id="previewbar" hidden><div><strong>See it as a participant</strong><span class="muted">Opens the study in a new tab as a test participant (left out of real counts), with no wait between sessions.</span></div>' +
      '<div class="row"><label id="pvcondwrap">Arm <select id="pvcond"></select></label><button type="button" class="primary" id="preview">Preview as a participant</button></div><p class="muted" id="pvout" role="status"></p></div>' +
    '<nav class="tabs" id="tabs" aria-label="Study admin sections"></nav>' +
    '<section data-tab="participants">' +
      // Summary figures, then one Download menu (every export, the codebook, analysis starters), then the filtered list.
      '<div class="pt-head"><div class="pt-stats" id="summary" aria-live="polite"></div><div class="pt-actions">' +
        '<button type="button" class="secondary small" id="refresh">Refresh</button>' +
        '<details class="pt-menu" id="dlmenu"><summary class="btn small">Download</summary><div class="pt-pop" role="group" aria-label="Downloads">' +
          '<label class="check pt-real"><input type="checkbox" id="exreal"> Real participants only</label>' +
          '<p class="pt-grp">Answers</p>' +
          '<button type="button" data-export="wide">Wide CSV<small>One row per participant</small></button>' +
          '<button type="button" data-export="trials">Trials CSV<small>One row per item answered</small></button>' +
          '<button type="button" data-export="surveys">Surveys CSV<small>Start- and end-of-session answers</small></button>' +
          '<button type="button" data-export="json">Full JSON<small>Every record, for archiving</small></button>' +
          '<p class="pt-grp">Behavior traces</p>' +
          '<button type="button" data-export="events">Raw events CSV<small>One row per event</small></button>' +
          '<button type="button" data-export="raw">Raw traces JSONL<small>As recorded</small></button>' +
          '<p class="pt-grp">Codebook</p>' +
          '<button type="button" data-codebook="csv">Codebook CSV<small>Every column, its values and labels</small></button>' +
          '<button type="button" data-codebook="md">Codebook document<small>Markdown</small></button>' +
          '<p class="pt-foot">Test participants are included and marked in the <code>test</code> column unless "Real participants only" is ticked. The codebook follows the current study content. ' +
          'Analysis starters: <a href="/lab/analysis/starter.R" download>R</a> · <a href="/lab/analysis/starter.py" download>Python</a> (<a href="/lab/analysis/">how to use them</a>) · <a href="/lab/CODEBOOK.md" target="_blank" rel="noopener">lab codebook</a></p>' +
        '</div></details></div></div>' +
      '<p class="muted" id="exprog" role="status"></p>' +
      '<details class="pt-conds" id="condbox" hidden><summary>Real participants by condition</summary><div class="pt-chips" id="condchips"></div></details>' +
      '<div class="pt-filter"><div class="lc-seg ptseg" role="radiogroup" aria-label="Show" id="ptshow">' +
        [['all', 'All'], ['real', 'Real'], ['test', 'Test'], ['active', 'In progress'], ['done', 'Finished']].map(function (f, i) { return '<button type="button" role="radio" data-show="' + f[0] + '" aria-checked="' + (i === 0) + '" tabindex="' + (i ? -1 : 0) + '">' + f[1] + '</button>'; }).join('') +
        '</div><input type="search" id="ptq" placeholder="Search ID, label, or condition" aria-label="Search participants"><span class="muted" id="ptcount"></span></div>' +
      '<div class="table-wrap pt-table"><table id="tbl"></table></div><div class="section rp" id="replaybox" hidden></div>' +
      '<div class="section" data-role="owner"><h2>Backups</h2><p class="muted">Every hour the study data is copied to a separate backup store on Netlify (answers once, changing records every time). That protects against mistakes and bugs. For a copy outside Netlify, download a complete backup (every record, raw traces, emails, study content, team, and activity log) and save it to GSU-approved storage, for example weekly. It contains emails, so treat it as identifiable data. Deleting a participant also removes them from the backup store.</p>' +
        '<p id="bkstatus" class="muted"></p><div class="row"><button type="button" class="secondary" id="bkrun">Run backup now</button><button type="button" class="secondary" id="bkdl">Download complete backup (.json.gz)</button></div><p id="bkprog" class="muted"></p></div>' +
      '<div class="section" data-role="owner"><h2>Live self-test</h2><p class="muted">Runs one throwaway test participant per group through every session of the current design on this live site (practice, surveys, every item), then checks what was saved and what the exports say, and deletes the test participants. Real participants are not touched.</p>' +
        '<div class="row"><button type="button" id="selftest">Run self-test</button><label class="check"><input type="checkbox" id="stkeep"> Keep the test participants so I can look at them (delete later with "Delete all test participants")</label></div><p class="muted" id="stprog"></p><div id="stout"></div>' +
        '<div class="pt-danger"><div><strong>Test participants</strong><p class="muted">Pilots, previews, and kept self-test runs. Deleting them removes their answers and traces for good; real participants are not touched.</p></div><button type="button" class="danger secondary" id="deltest">Delete all test participants</button></div></div>' +
    '</section>' +
    '<section data-tab="figures" hidden></section><section data-tab="analyze" hidden></section>' +
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
    '<section data-tab="content" hidden><p class="muted" id="contentinfo"></p><div id="contentwarn"></div><p class="ok" id="say" role="status"></p><nav class="tabs sub" id="subtabs" aria-label="Study content sections"></nav><div id="viewsw"></div><fieldset id="editor" style="border:0;padding:0;margin:0;min-width:0"></fieldset>' +
      '<div class="savebar" id="savebar" data-role="editor"><span id="dirty" class="muted">No unsaved changes.</span><input type="text" id="note" class="grow" placeholder="What changed? (optional, shown in the activity log)">' +
      '<button type="button" class="secondary" id="discard" disabled>Discard changes</button><button type="button" id="save" disabled>Save changes</button></div>' +
      '<div class="section"><h2>Versions</h2><p class="muted">Every save makes a new version. Restoring an old version saves it again as the newest version, so nothing is lost. Each answer records the version it was collected under.</p><div class="table-wrap"><table id="vtbl"></table></div></div>' +
      '<div class="section"><h2>Study design file</h2><p class="muted">One file with this study\'s whole design: items, questions, conditions, screen text, consent, and settings, with uploaded media up to about 3 MB. It has no participants and no answers. Use it to share the study with another lab, to deposit it with a paper, or to start a new study from it on the lab console (owners). Completion codes are left blank in the file.</p>' +
      '<div class="row"><button type="button" class="secondary" id="designdl">Download study design (JSON)</button></div><p class="muted" id="designmsg" role="status"></p>' +
      '<h3>Reproducibility bundle</h3><p class="muted">One .zip to deposit with a paper: the design file, this study\'s codebook (CSV and Markdown), the platform version and code commit, the list of content versions, how to cite, and the fields for a Zenodo upload (which gives it a DOI). It holds no participant data. Make it from the content version you ran.</p>' +
      '<div class="row"><button type="button" class="secondary" id="bundledl">Download reproducibility bundle (.zip)</button></div></div></section>' +
    '<section data-tab="team" hidden><h2>Researchers on this study</h2><p class="muted">People with a researcher account (email and password). Add someone by email: a new person gets an invitation link for you to send, and sees this study only. ' +
      'Viewers see progress and download data; editors also edit the content; managers also handle students and the extra-credit list; owners can do everything, including deleting data and managing this list.</p>' +
      '<div class="table-wrap"><table id="memtbl"></table></div>' +
      '<form class="row" id="memform"><label>Email <input type="text" id="memail" style="width:220px" autocomplete="off"></label><label>Name <input type="text" id="mname" style="width:160px" autocomplete="off" placeholder="for new accounts"></label>' +
      '<label>Access <select id="mrole"><option value="viewer">viewer</option><option value="editor">editor</option><option value="manager">manager</option><option value="owner">owner</option></select></label><button type="submit">Add or change</button></form><div id="memout" role="status"></div>' +
      '<h2>Add a team member with a key</h2><p class="muted">Each person gets their own key for this study. Share it privately. Removing a person disables their key immediately.</p>' +
      '<form class="row" id="teamform"><label>Name <input type="text" id="tname" style="width:200px"></label><label>Access <select id="trole"></select></label><button type="submit">Create key</button></form>' +
      '<p class="muted" id="roledesc"></p><div id="newkey" hidden></div><div class="table-wrap"><table id="teamtbl"></table></div></section>' +
    '<section data-tab="privacy" hidden><h2>Encryption</h2><p class="muted">With a key, the server encrypts each participant\'s email or panel ID, identifying link data (such as PROLIFIC_PID), and free-text answers before storing them. ' +
      'Only someone holding this study\'s private key file can read them; the file never leaves your computer, and nobody with access to the website or to Netlify can read them without it. ' +
      'Exports still download as usual: unlock this tab with the key file first and the values are opened in your browser as the file is saved. Ratings, choices and timings are not encrypted.</p>' +
      '<div id="sealstatus"><p class="muted">Loading…</p></div>' +
      '<div class="section"><h2>Unlock downloads in this tab</h2><p class="muted">Choose the study\'s key file. It is kept in this tab\'s memory only and forgotten when you close or reload it.</p>' +
      '<div class="row"><label>Key file <input type="file" id="sealfile" accept=".json,application/json"></label><button type="button" class="secondary" id="sealforget" hidden>Forget the key</button></div><p id="sealunlocked" class="muted"></p></div>' +
      '<div class="section" data-role="owner"><h2>Set the study key</h2>' +
      '<p class="muted">Make a new key: your browser creates it, downloads the private key file, and asks you to choose that file again before encryption starts, so it cannot start without a saved copy. ' +
      '<strong>If every copy of the key file is lost, the encrypted values cannot be recovered by anyone.</strong> Keep two copies on GSU-approved storage, not on shared drives. A new key applies to new values only; keep the old file for older ones.</p>' +
      '<div class="row"><button type="button" id="sealnew">Make a new key</button></div><div id="sealconfirm" hidden><div class="warn">Saved the file? Choose it now to turn encryption on.</div><label>Saved key file <input type="file" id="sealcheck" accept=".json,application/json"></label></div>' +
      '<details><summary>Use a key made with the command line</summary><p class="muted"><code>node scripts/lab/seal.mjs keygen ' + esc(studyId) + '</code> prints a public key. Paste it here.</p>' +
      '<form class="row" id="sealpubform"><input type="text" id="sealpub" style="flex:1" placeholder="Public key (43 characters)" autocomplete="off"><button type="submit" class="secondary">Use this key</button></form></details>' +
      '<div id="sealbrowser" hidden><h3>Encrypt in the participant\'s browser</h3><p class="muted">Free-text answers and identifying link data are encrypted in the participant\'s browser before they are sent, so the server never receives them readable. ' +
      'A browser too old to encrypt (before Chrome or Edge 133, Firefox 130, Safari 17) sends them over the encrypted connection and the server encrypts them on arrival. Tick this to refuse that instead: such browsers are turned away before consent. ' +
      'Each saved record notes how many values the browser encrypted and how many the server did.</p><label class="f check"><input type="checkbox" id="sealreq"> Accept free text and link data only when encrypted in the participant\'s browser</label></div>' +
      '<p><button type="button" class="danger secondary small" id="sealoff" hidden>Stop encrypting new values</button></p></div></section>' +
    '<section data-tab="activity" hidden><p class="muted">Who added students, changed content, ran self-tests, deleted data, or changed the team.</p><div class="table-wrap"><table id="acttbl"></table></div></section></div>';
  $('keyhelp').innerHTML = 'Sign in with your researcher account, or use the lab owner key (the <code>LAB_ADMIN_KEY</code> or <code>VC_ADMIN_KEY</code> Netlify variable) or the team key the owner gave you. Keys and sign-ins are kept in this tab only. New here? Read the <a href="/lab/guide/">researcher guide</a>.';

  // ---------- sign-in and tabs ----------
  var TABS = [['participants', 'Participants', 'viewer'], ['report', 'Pilot report', 'viewer'], ['figures', 'Figures', 'viewer'], ['analyze', 'Analyze', 'viewer'], ['students', 'Students', 'manager'], ['content', 'Study content', 'viewer'], ['team', 'Team', 'owner'], ['privacy', 'Encryption', 'viewer'], ['activity', 'Activity', 'owner']];
  var tabKey = 'lab_admin_tab_' + studyId;
  function showTab(name) {
    document.querySelectorAll('section[data-tab]').forEach(function (s) { s.hidden = s.getAttribute('data-tab') !== name; });
    // aria-current="true", not aria-selected: these buttons are section navigation, not role=tab, and aria-selected is ignored
    // without that role. Keep this attribute: admin.css styles it and types/vignettes-admin.js finds the current subtab by it.
    $('tabs').querySelectorAll('button').forEach(function (b) { if (b.getAttribute('data-tab') === name) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    try { sessionStorage.setItem(tabKey, name); } catch (e) {}
    err();
    if (name === 'participants') { load(); if (can('owner')) loadBackup(); }
    if (name === 'report') initReport();
    if (name === 'figures' || name === 'analyze') mountTool(name);
    if (name === 'content') loadContent();
    if (name === 'team') loadTeam();
    if (name === 'privacy') loadSeal();
    if (name === 'activity') loadActivity();
    // A study type may add top-level tabs (plugin.tabs: [{ id, label, role, render(sectionEl, api) }]), for example the economic game's operations tab.
    (plugin && plugin.tabs || []).forEach(function (t) { if (t.id === name) t.render(document.querySelector('section[data-tab="' + name + '"]'), pluginApi()); });
  }
  function pluginApi() { return { getJSON: getJSON, postJSON: postJSON, call: call, saveFile: saveFile, toCsv: toCsv, esc: esc, err: err, day: day, can: can, fmt: fmt, median: median, mean: mean, studyId: studyId, me: me }; }
  function loadPlugin(type) {
    return new Promise(function (res) {
      if (types[type]) return res(types[type]);
      var s = document.createElement('script'); s.src = '/lab/engine/types/' + type + '-admin.js';
      s.onload = function () { res(types[type] || {}); }; s.onerror = function () { res({}); };
      document.head.appendChild(s);
    });
  }
  function loadScript(src) {
    return new Promise(function (res) { var s = document.createElement('script'); s.src = src; s.onload = function () { res(true); }; s.onerror = function () { res(false); }; document.head.appendChild(s); });
  }
  function start() {
    err();
    loadScript('/lab/engine/logic.js').then(function () { return getJSON('me'); }).then(function (m) {
      me = m;
      return loadPlugin(m.study.type).then(function (p) {
        plugin = p;
        (plugin.tabs || []).forEach(function (t) {
          if (TABS.some(function (x) { return x[0] === t.id; })) return;
          TABS.push([t.id, t.label, t.role || 'viewer']);
          var sec = document.createElement('section'); sec.setAttribute('data-tab', t.id); sec.hidden = true; $('app').appendChild(sec);
        });
        document.title = m.study.name + ': admin';
        $('title').textContent = m.study.name + ': admin';
        $('links').innerHTML = esc(m.study.typeLabel) + ' · participant page: <a href="' + esc(m.study.paths.participant) + '" target="_blank" rel="noopener">' + esc(location.origin + m.study.paths.participant) + '</a>' +
          (getSession() ? ' · <a href="/lab/admin/">My studies</a>' : m.role === 'owner' ? ' · <a href="/lab/admin/">All studies</a>' : '') + ' · <a href="/lab/guide/">Researcher guide</a>';
        $('signinbox').hidden = true; $('keyhelp').hidden = true; $('app').hidden = false;
        $('whoami').innerHTML = esc(m.name) + ' <span class="pill">' + esc(m.role) + '</span>' + (getSession() ? ' <a href="/lab/admin/">My studies</a> · <a href="/lab/account/">Account</a>' : '') + ' <button type="button" class="secondary small" id="signout">Sign out</button>';
        $('signout').addEventListener('click', function () { if (dirty && !confirm('Discard unsaved content changes?')) return; dirty = false; endSession().then(function () { location.reload(); }); });
        document.querySelectorAll('[data-role]').forEach(function (el) { el.hidden = !can(el.getAttribute('data-role')); });
        $('tabs').innerHTML = TABS.filter(function (t) { return can(t[2]); }).map(function (t) { return '<button type="button" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');
        $('tabs').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
        $('trole').innerHTML = ['viewer', 'editor', 'manager'].map(function (r) { return '<option value="' + r + '">' + r[0].toUpperCase() + r.slice(1) + '</option>'; }).join('');
        var desc = function () { $('roledesc').textContent = m.roles[$('trole').value]; }; $('trole').addEventListener('change', desc); desc();
        if (can('editor')) {
          $('previewbar').hidden = false;
          $('pvcond').innerHTML = '<option value="">Any (balanced, as for real participants)</option>' + m.conditions.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
          $('pvcondwrap').hidden = m.conditions.length < 2;
        }
        $('selftest').textContent = 'Run self-test (' + (m.conditions.length === 1 ? 'one group' : 'all ' + m.conditions.length + ' groups') + ')';
        $('rpintro').innerHTML = plugin.reportIntro || 'How the items and sessions are performing, for tuning the study after a pilot.';
        var last = null; try { last = sessionStorage.getItem(tabKey); } catch (e) {}
        if (location.hash === '#import' && can('editor') && plugin.subtabs && plugin.subtabs.some(function (s) { return s[0] === 'import'; })) { sub = 'import'; last = 'content'; }   // opened from the lab console's "create from a survey file"
        showTab(TABS.some(function (t) { return t[0] === last && can(t[2]); }) ? last : 'participants');
      });
    }).catch(function (e) { if (e.code !== 'no_study') { setKey(''); if (e.code !== 'forbidden' || !getSession()) setSession(null); } $('signinbox').hidden = false; $('app').hidden = true; err(e.message); });
  }
  // Signing out of a researcher session also revokes the token on the server, so a copy of it stops working.
  function endSession() {
    var ses = getSession(); setKey(''); setSession(null);
    if (!ses) return Promise.resolve();
    return fetch('/api/lab/_lab/account/signout', { method: 'POST', headers: { authorization: 'Bearer ' + ses.token, 'content-type': 'application/json' }, body: '{}' }).catch(function () {});
  }
  $('keyform').addEventListener('submit', function (e) { e.preventDefault(); setSession(null); setKey($('key').value.trim()); start(); });
  // The window opens first (inside the click, so pop-up blockers allow it) and is pointed at the link once it exists.
  $('preview').addEventListener('click', function () {
    err(); var w = window.open('about:blank', '_blank'), b = $('preview');
    if (dirty) $('pvout').textContent = 'Note: the preview uses the saved version. Save your changes first to see them.';
    b.disabled = true;
    postJSON('preview', { condition: $('pvcond').value }).then(function (r) {
      $('pvout').textContent = (dirty ? 'The preview uses the saved version, not your unsaved changes. ' : '') + 'Opened a preview as ' + r.code + ' (arm ' + r.condition + ').';
      if (w) w.location = r.url; else location.href = r.url;
    }).catch(function (e) { if (w) w.close(); err(e.message); }).then(function () { b.disabled = false; });
  });

  // ---------- participants and exports ----------
  // Exports are assembled here from small batches of participants, so no single server request has to
  // read the whole study (Netlify functions have a time and response-size limit).
  var FIRST = ['code', 'condition', 'test', 'label', 'self_signup', 'session', 'trial_index'];
  var WIDE_FIRST = ['code', 'condition', 'test', 'label', 'self_signup', 'consented', 'sessions_completed', 'total_sessions', 'finished', 'screened_out', 'returned', 'panel_study', 'panel_sessions'];   // netlify/lib/lab/wide.mjs
  // Up to `parallel` batches are in flight at once (each is its own function call, so they run side by side); the results
  // keep the participants' order. Export time is almost all waiting on storage and the network, so this is the big win.
  function batched(codes, size, fetchOne, onProgress, parallel) {
    var batches = [], out = [], next = 0, done = 0, lanes = Math.max(1, parallel || 1);
    for (var i = 0; i < codes.length; i += size) batches.push(codes.slice(i, i + size));
    function lane() {
      if (next >= batches.length) return Promise.resolve();
      var i = next++;
      return fetchOne(batches[i]).then(function (r) { out[i] = r; done++; if (onProgress) onProgress(done / batches.length); return lane(); });
    }
    if (onProgress) onProgress(0);
    var all = []; for (var l = 0; l < Math.min(lanes, batches.length); l++) all.push(lane());
    return Promise.all(all).then(function () { return out; });
  }
  var LANES = 6;   // requests in flight during an export
  function rowsFor(codes, kind, progress) {
    return batched(codes, 10, function (b) { return getJSON('rows?kind=' + kind + '&codes=' + b.join(',')); }, progress, LANES).then(function (parts) { return [].concat.apply([], parts); });
  }
  document.querySelectorAll('[data-export]').forEach(function (b) {
    b.addEventListener('click', function () {
      err(); var kind = b.getAttribute('data-export'), buttons = document.querySelectorAll('[data-export]');
      buttons.forEach(function (x) { x.disabled = true; });
      var prog = function (f) { $('exprog').textContent = 'Exporting… ' + Math.round(f * 100) + '%'; };
      getJSON('codes').then(function (list) {   // just codes and test flags; the full participant list is much slower to build
        var codes = list.filter(function (p) { return !$('exreal').checked || !p.test; }).map(function (p) { return p.code; });
        var work = kind === 'events' ? batched(codes, 1, function (c) { return getJSON('rows?kind=events&codes=' + c[0]); }, prog, LANES).then(function (parts) {
            saveFile(toCsv([].concat.apply([], parts), ['code', 'session', 'trial_index', 't_ms', 'type']), studyId + '_events_' + day() + '.csv', 'text/csv');
          })
          : kind === 'raw' ? batched(codes, 1, function (c) { return getJSON('raw?codes=' + c[0]); }, prog, LANES).then(function (parts) {
            saveFile([].concat.apply([], parts).map(function (x) { return JSON.stringify(x); }).join('\n') + '\n', studyId + '_raw_' + day() + '.jsonl', 'application/x-ndjson');
          })
          : kind === 'json' ? batched(codes, 5, function (c) { return getJSON('records?codes=' + c.join(',')); }, prog, LANES).then(function (parts) {
            saveFile(JSON.stringify({ study: studyId, type: me.study.type, exportedAt: new Date().toISOString(), participants: [].concat.apply([], parts.map(function (r) { return r.participants; })),
              records: [].concat.apply([], parts.map(function (r) { return r.records; })) }), studyId + '_all_' + day() + '.json', 'application/json');
          })
          : rowsFor(codes, kind, prog).then(function (rows) { saveFile(toCsv(rows, kind === 'trials' ? FIRST : kind === 'wide' ? WIDE_FIRST : FIRST.slice(0, 6)), studyId + '_' + kind + '_' + day() + '.csv', 'text/csv'); });
        return work.then(function () { $('exprog').textContent = 'Exported ' + codes.length + ' participants.'; });
      }).catch(function (e) { err(e.message); }).then(function () { buttons.forEach(function (x) { x.disabled = false; }); });
    });
  });
  document.querySelectorAll('[data-codebook]').forEach(function (b) {
    b.addEventListener('click', function () {
      var ext = b.getAttribute('data-codebook'); err();
      call('codebook.' + ext).then(function (r) { return r.blob(); }).then(function (blob) { saveFile(blob, studyId + '_codebook_' + day() + '.' + ext); }).catch(function (e) { err(e.message); });
    });
  });
  $('credit').addEventListener('click', function () {
    err(); call('credit.csv').then(function (r) { return r.blob(); }).then(function (blob) { saveFile(blob, studyId + '_extra_credit_' + day() + '.csv'); }).catch(function (e) { err(e.message); });
  });
  var people = [], show = 'all';
  // One status per participant, in the words a researcher uses: what happened last, or what happens next.
  function status(p) {
    if (p.declined) return ['Declined', 'st-off'];
    if (!p.consented) return ['Not consented', 'st-off'];
    if (p.completedSessions >= p.totalSessions) return ['Finished', 'st-done'];
    if (p.inProgress) return ['In session · ' + p.inProgress + ' / ' + p.inProgressOf, 'st-live'];
    if (p.nextSession) return [(p.availableAt && new Date(p.availableAt).getTime() > Date.now() ? 'Session ' + p.nextSession + ' opens ' + fmt(p.availableAt) : 'Session ' + p.nextSession + ' ready'), 'st-wait'];
    return ['', ''];
  }
  function finished(p) { return p.completedSessions >= p.totalSessions; }
  function load() {
    getJSON('participants').then(function (rows) {
      people = rows;
      var real = rows.filter(function (p) { return !p.test; }), by = {};
      real.forEach(function (p) { by[p.condition] = (by[p.condition] || 0) + 1; });
      var stat = function (n, label, cls) { return '<div class="pt-stat' + (cls ? ' ' + cls : '') + '"><b>' + n.toLocaleString() + '</b><span>' + label + '</span></div>'; };
      $('summary').innerHTML = stat(rows.length, 'participants') + stat(real.length, 'real') + stat(rows.length - real.length, 'test') +
        stat(real.filter(finished).length, 'finished all sessions', 'good') + stat(real.filter(function (p) { return !finished(p) && p.inProgress; }).length, 'in a session now');
      var conds = Object.keys(by).sort();
      $('condbox').hidden = !conds.length;
      $('condbox').querySelector('summary').textContent = 'Real participants by condition (' + conds.length + ')';
      $('condchips').innerHTML = conds.map(function (k) { return '<span class="pt-chip"><code>' + esc(k) + '</code><b>' + by[k] + '</b></span>'; }).join('');
      $('deltest').disabled = !(rows.length - real.length);
      render();
    }).catch(function (e) { err(e.message); });
  }
  function render() {
    var q = $('ptq').value.trim().toLowerCase();
    var rows = people.filter(function (p) {
      if (show === 'real' && p.test) return false;
      if (show === 'test' && !p.test) return false;
      if (show === 'active' && (finished(p) || !p.inProgress)) return false;
      if (show === 'done' && !finished(p)) return false;
      return !q || [p.code, p.label, p.condition, p.type].some(function (x) { return String(x || '').toLowerCase().indexOf(q) >= 0; });
    });
    $('ptcount').textContent = rows.length === people.length ? people.length + ' shown' : rows.length + ' of ' + people.length + ' shown';
    var more = can('manager') || can('owner');
    $('tbl').innerHTML = '<thead><tr><th>Participant</th><th>Condition</th><th>Sessions</th><th>Status</th><th>Last seen</th><th><span class="sr">Actions</span></th></tr></thead><tbody>' + rows.map(function (p) {
      var st = status(p);
      return '<tr' + (p.test ? ' class="is-test"' : '') + '><td><code>' + esc(p.code) + '</code>' + (p.test ? ' <span class="pill pt-test">Test</span>' : '') +
        '<div class="pt-sub">' + esc([p.type, p.label].filter(Boolean).join(' · ')) + (p.gapDays ? ' · ' + p.gapDays + '-day gap' : '') + '</div></td>' +
        '<td><code>' + esc(p.condition) + '</code></td><td class="num">' + p.completedSessions + ' / ' + p.totalSessions + '</td>' +
        '<td>' + (st[0] ? '<span class="pt-st ' + st[1] + '">' + esc(st[0]) + '</span>' : '') + '</td><td class="pt-seen">' + esc(fmt(p.lastSeenAt)) + '</td>' +
        '<td class="pt-acts"><button type="button" class="secondary small" data-replay="' + esc(p.code) + '" aria-label="Replay ' + esc(p.code) + '\'s trials">Replay</button>' +
        (more ? '<details class="pt-menu pt-row"><summary class="btn small" aria-label="More for ' + esc(p.code) + '">⋯</summary><div class="pt-pop">' +
          (can('manager') ? '<button type="button" data-settest="' + esc(p.code) + '|' + (p.test ? '0' : '1') + '">' + (p.test ? 'Mark as real participant' : 'Mark as test') + '</button>' : '') +
          (can('owner') ? '<button type="button" class="danger" data-del="' + esc(p.code) + '">Delete participant…</button>' : '') + '</div></details>' : '') + '</td></tr>';
    }).join('') + (rows.length ? '' : '<tr><td colspan="6" class="muted">' + (people.length ? 'No participants match.' : 'No participants yet. Share the study link or use Preview as a participant.') + '</td></tr>') + '</tbody>';
  }
  $('ptq').addEventListener('input', render);
  $('ptshow').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-show]'); if (!b) return;
    show = b.getAttribute('data-show');
    $('ptshow').querySelectorAll('[data-show]').forEach(function (x) { var on = x === b; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; });
    render();
  });
  $('ptshow').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var bs = [].slice.call($('ptshow').querySelectorAll('[data-show]')), i = bs.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); var n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.click(); n.focus();
  });
  // Menus close when one of their items is used, on Escape, and on a click elsewhere.
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.pt-menu[open]').forEach(function (d) { if (!d.contains(e.target) || (e.target.closest('button') && !e.target.closest('summary'))) d.open = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.pt-menu[open]').forEach(function (d) { d.open = false; d.querySelector('summary').focus(); });
  });
  $('refresh').addEventListener('click', load);
  $('tbl').addEventListener('click', function (e) {
    var rp = e.target.getAttribute && e.target.getAttribute('data-replay');
    if (rp) return openReplay(rp, e.target);
    var v = e.target.getAttribute && e.target.getAttribute('data-settest');
    if (v) { var parts = v.split('|'); return postJSON('set-test', { id: parts[0], test: parts[1] === '1' }).then(load).catch(function (x) { err(x.message); }); }
    var id = e.target.getAttribute && e.target.getAttribute('data-del'); if (!id) return;
    var p = people.filter(function (x) { return x.code === id; })[0] || {};
    if (!confirm('Permanently delete ' + id + (p.test ? ' (test)' : '') + ' and all of their answers and traces?' +
      (p.test ? '' : '\n\nThis is a REAL participant. Only do this if they withdrew or asked for their data to be removed.') + '\n\nThis cannot be undone.')) return;
    postJSON('delete', { id: id }).then(function (r) { load(); setTimeout(function () { $('exprog').innerHTML = '<span class="ok">Deleted ' + esc(r.code) + ' and ' + r.records + ' records.</span>'; }, 600); }).catch(function (x) { err(x.message); });
  });
  // Figures (figures.js, with replay.js for reading traces) and Analyze (analyze.js with stats.js): loaded the first time
  // their tab opens, then kept. Both read the same rows and traces as the downloads.
  var mounted = {};
  function mountTool(name) {
    if (mounted[name]) return;
    var sec = document.querySelector('section[data-tab="' + name + '"]'), files = name === 'figures' ? ['/lab/engine/replay.js', '/lab/engine/figures.js'] : ['/lab/engine/stats.js', '/lab/engine/analyze.js'];
    sec.innerHTML = '<p class="muted">Loading…</p>';
    files.reduce(function (pr, f) { return pr.then(function () { return loadScript(f); }); }, Promise.resolve()).then(function () {
      var mod = name === 'figures' ? window.LabFigures : window.LabAnalyze;
      if (!mod) throw new Error('This tool could not be loaded. Reload the page.');
      mounted[name] = true;
      mod.mountTab(sec, { getJSON: getJSON, rowsFor: rowsFor, saveFile: saveFile, studyId: studyId, esc: esc, day: day, err: err, prepare: window.LabReplay && window.LabReplay.prepare });
    }).catch(function (e) { sec.innerHTML = ''; err(e.message); });
  }
  // Trial replay (replay.js, loaded the first time it is used): the participant's raw traces and trial rows.
  function openReplay(code, from) {
    var box = $('replaybox');
    box.hidden = false; box.innerHTML = '<p class="muted" role="status">Loading the behavior traces for ' + esc(code) + '…</p>'; err();
    Promise.all([window.LabReplay ? true : loadScript('/lab/engine/replay.js'), getJSON('raw?codes=' + encodeURIComponent(code)), getJSON('rows?kind=trials&codes=' + encodeURIComponent(code))]).then(function (r) {
      if (!window.LabReplay) throw new Error('The replay viewer could not be loaded.');
      if (r[1] && r[1].error) throw new Error(r[1].error);
      window.LabReplay.open(box, { code: code, raw: r[1], rows: r[2], esc: esc, onClose: function () { if (from && from.focus) from.focus(); },
        save: saveFile, studyId: studyId, figures: function () { return window.LabFigures ? Promise.resolve(true) : loadScript('/lab/engine/figures.js'); } });
      box.scrollIntoView({ block: 'start' }); var h = box.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }).catch(function (e) { box.innerHTML = ''; box.hidden = true; err(e.message); });
  }
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
    postJSON('delete-test', { confirm: 'DELETE' }).then(function (r) { load(); setTimeout(function () { $('exprog').innerHTML = '<span class="ok">Deleted ' + r.participants + ' test participants and ' + r.records + ' records.</span>'; }, 600); }).catch(function (e) { err(e.message); });
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
            var all = { kind: studyId + ' complete backup', exportedAt: new Date().toISOString(), meta: meta, participants: flat('participants'), contacts: flat('contacts'), plans: flat('plans'), extras: flat('extras'), records: flat('records'), raw: raw };
            var text = JSON.stringify(all), name = studyId + '_backup_' + day() + '.json';
            if (window.CompressionStream) return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob().then(function (b) {
              saveFile(b, name + '.gz'); $('bkprog').textContent = 'Downloaded ' + all.participants.length + ' participants, ' + all.records.length + ' records (' + Math.round(b.size / 1024) + ' KB compressed). Save it to GSU-approved storage.';
            });
            saveRaw(text, name, 'application/json'); $('bkprog').textContent = 'Downloaded. Save it to GSU-approved storage.';
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
        .then(function (rows) { renderReport(sel, rows, res[1]); return dqReport(sel); });
    }).catch(function (e) { err(e.message); }).then(function () { $('rprun').disabled = false; });
  });
  // Data quality: how many participants raise each flag (netlify/lib/lab/quality.mjs), with the IDs to review.
  var DQ_FLAGS = [['dq_honeypot', 'Filled in the hidden box (form-filling software)'], ['dq_webdriver', 'Browser controlled by automation software'], ['dq_paste_count', 'Pasted text into an open answer'],
    ['dq_injected_chars', 'Text appeared without typing or pasting'], ['dq_fast_typing', 'Typed faster than people type'], ['dq_fast_completion', 'Finished a session in under a quarter of the expected time'],
    ['dq_duplicate_panel', 'Opened the study more than once from the panel']];
  function dqReport(sel) {
    if (!sel.length) return;
    return rowsFor(sel.map(function (p) { return p.code; }), 'wide').then(function (wide) {
      var any = wide.filter(function (w) { return w.dq_flags > 0; });
      var h = '<h3>Data quality</h3><p class="muted">Signals to review, not proof. Attention checks alone no longer catch AI agents that take surveys (Westwood 2025, <em>PNAS</em>), so the lab also records what software does and people rarely do. Column definitions are in this study\'s codebook; every flag is in the wide CSV.</p>' +
        '<div class="table-wrap"><table><tr><th>Signal</th><th>Participants</th><th>Study IDs</th></tr>' + DQ_FLAGS.map(function (f) {
          var hit = wide.filter(function (w) { return Number(w[f[0]]) > 0; });
          return '<tr><td>' + esc(f[1]) + '</td><td>' + hit.length + '</td><td class="wrap-cell mono">' + hit.slice(0, 12).map(function (w) { return esc(w.code); }).join(' ') + (hit.length > 12 ? ' …' : '') + '</td></tr>';
        }).join('') + '<tr><td><strong>Any flag</strong></td><td><strong>' + any.length + ' of ' + wide.length + '</strong></td><td></td></tr></table></div>';
      $('rpout').insertAdjacentHTML('beforeend', h);
    });
  }
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
  var QTYPE_LABEL = { scale: 'Rating scale', choice: 'Multiple choice', select: 'Dropdown', text: 'Text answer', confidence: 'Confidence line (0–100)', number: 'Number (typed in)', multi: 'Select all that apply', info: 'Descriptive text (no answer)', slider: 'Slider (no starting point)', rank: 'Ranking (put in order)', matrix: 'Matrix (several statements, same answers)' };
  var AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
  function setDirty(v) { dirty = v; $('dirty').innerHTML = v ? '<strong>Unsaved changes.</strong>' : 'No unsaved changes.'; $('save').disabled = !v; $('discard').disabled = !v; }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function subs() { return (plugin.subtabs || []).concat([['pre', 'Start-of-session survey'], ['post', 'End-of-session survey'], ['consent', 'Sign-up & consent'], ['environment', 'Devices & timing']].concat(me && /^(multimodal|vignettes)$/.test(me.study.type) ? [['order', 'Block order']] : []).concat([['text', 'Screen text']])); }
  // The rows of a Williams design (as netlify/lib/lab/latin.mjs builds them), for the preview on the Block order tab.
  function williams(n) {
    var first = [0], k, rows = [], r;
    for (k = 1; first.length < n; k++) { first.push(k); if (first.length < n) first.push(n - k); }
    for (r = 0; r < n; r++) rows.push(first.map(function (x) { return (x + r) % n; }));
    return n % 2 ? rows.concat(rows.map(function (x) { return x.slice().reverse(); })) : rows;
  }
  function loadContent(force) {
    if (draft && !force) return renderEditor();
    Promise.all([getJSON('content'), getJSON('content-history'), getJSON('participants')]).then(function (res) {
      var c = res[0];
      META = { text: c._textFields, type: c._meta || {}, conditions: c._conditions || [], rules: c._surveyRules || [], qtypes: c._questionTypes || Object.keys(QTYPE_LABEL), presets: c._panelPresets || [], languages: c._languages || null };
      Object.keys(c).forEach(function (k) { if (k[0] === '_') delete c[k]; });
      saved = c; draft = clone(saved); A.draft = draft; setDirty(false);
      if (!sub || !subs().some(function (s) { return s[0] === sub; })) sub = subs()[0][0];
      if (plugin.onLoad) plugin.onLoad(A);
      var started = res[2].filter(function (p) { return !p.test && (p.consented || p.completedSessions); }).length;
      A.counts = {}; res[2].forEach(function (p) { if (!p.test && p.condition) A.counts[p.condition] = (A.counts[p.condition] || 0) + 1; });   // for the quota boxes
      A.started = started;
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
  $('bundledl').addEventListener('click', function () {
    err(); call('bundle.zip').then(function (r) { return r.blob(); }).then(function (blob) { saveFile(blob, studyId + '_materials_v' + (saved ? saved.version || 0 : 0) + '.zip'); }).catch(function (e) { err(e.message); });
  });
  $('designdl').addEventListener('click', function () {
    err(); getJSON('design.json').then(function (d) {
      saveFile(JSON.stringify(d, null, 2), studyId + '_design_v' + d.contentVersion + '_' + day() + '.json', 'application/json');
      $('designmsg').textContent = 'Saved version ' + d.contentVersion + (d.filesLeftOut.length ? '. ' + d.filesLeftOut.length + ' media file(s) were too large to include; copy them separately.' : '.');
    }).catch(function (e) { err(e.message); });
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
      (it.type === 'scale' ? '<div class="grid3">' + field('Points', num(b + '.n', it.n || 7, 2, 11)) + field('First number (blank = 1; use 0 for a 0-based scale)', '<input type="text" data-optnum="' + b + '.start" value="' + esc(it.start != null ? it.start : '') + '">') + field('Label for the first point', inp(b + '.lo', it.lo || '')) + field('Label for the top point', inp(b + '.hi', it.hi || '')) + '</div>' +
        field('Label every point (recommended): one line per point, from 1 to ' + (it.n || 7) + '. Leave empty to label only the ends.', '<textarea data-labels="' + b + '" rows="' + Math.min(11, it.n || 7) + '" class="mono">' + esc((it.labels || []).join('\n')) + '</textarea>') : '') +
      (it.type === 'slider' ? '<div class="grid3">' + field('Smallest value', '<input type="text" data-optnum="' + b + '.min" value="' + esc(it.min != null ? it.min : '') + '">') + field('Largest value', '<input type="text" data-optnum="' + b + '.max" value="' + esc(it.max != null ? it.max : '') + '">') +
        field('Step (1 = whole numbers)', '<input type="text" data-optnum="' + b + '.step" value="' + esc(it.step != null ? it.step : '') + '">') + field('Label at the low end', inp(b + '.lo', it.lo || '')) + field('Label at the high end', inp(b + '.hi', it.hi || '')) + '</div>' +
        '<p class="muted">No handle is shown until the participant clicks or uses the arrow keys, so there is no default answer. Untouched sliders have an empty cell in the CSV.</p>' : '') +
      (it.type === 'rank' ? '<p class="muted">Participants put the options in order with Up and Down buttons (no dragging), or confirm the order shown with "This order is right". The CSV cell lists the saved values in rank order, joined with |. Tick "Show the options in a random order" (Display logic and layout) to vary the starting order.</p>' : '') +
      (it.type === 'matrix' ? field('Statements, one per line: "variable name | statement" (each statement is its own column in the CSV)', '<textarea data-rows="' + b + '" rows="4" class="mono">' + esc((it.rows || []).map(function (r) { return r.id + ' | ' + r.text; }).join('\n')) + '</textarea>') : '') +
      (it.type === 'choice' || it.type === 'select' || it.type === 'multi' || it.type === 'rank' || it.type === 'matrix' ? field(it.type === 'matrix' ? 'Answer columns, one per line (optionally "saved value | text shown")' : 'Options, one per line (optionally "saved value | text shown")', '<textarea data-opts="' + b + '" rows="4" class="mono">' + esc(optText) + '</textarea>') : '') +
      (it.type === 'number' ? '<p class="muted">A box for a typed number, kept exactly as entered (no range check, so an impossible answer is still recorded). Non-numbers are not accepted.</p>' : '') +
      (it.type === 'multi' ? '<p class="muted">Checkboxes. The CSV cell lists the ticked options\' saved values joined with |.</p>' : '') +
      (it.type === 'confidence' ? '<p class="muted">A 0–100 line with no starting point. Its end labels and help text are on the Screen text tab.</p>' : '') +
      (it.type === 'info' ? '<p class="muted">Text shown to the participant. It has no answer and no column in the exports.</p>' : checkbox('data-path="' + b + '.required" data-bool="1"', it.required, 'Required (if unticked, a skipped question gets one gentle reminder)')) +
      advanced(list, it, b, opts) + '</div>';
  }
  // The survey designer's side panel: one question's settings that are not edited on the page itself (its text,
  // options, labels, type, Required, and page are). The same data-* bindings as the question cards, so applyEdit saves them.
  function inspectorCard(list, it, i, opts) {
    var b = list + '.' + i, conds = opts.conditions || [], hasOpts = /^(choice|select|multi|rank|matrix)$/.test(it.type);
    var optText = (it.options || []).map(function (o) { return o.value === o.label ? o.label : o.value + ' | ' + o.label; }).join('\n');
    function sec(t) { return '<h4 class="lc-ih">' + t + '</h4>'; }
    function numBox(key, label) { return field(label, '<input type="text" data-optnum="' + b + '.' + key + '" value="' + esc(it[key] != null ? it[key] : '') + '">'); }
    return '<div class="qcard">' + sec('Data') +
      field('Variable name (the column in the surveys CSV)', inp(b + '.id', it.id, ' class="mono" spellcheck="false"')) +
      (it.type === 'scale' ? numBox('start', 'First number (blank = 1; 0 for a 0-based scale)') : '') +
      (it.type === 'slider' ? '<div class="grid3">' + numBox('min', 'Smallest') + numBox('max', 'Largest') + numBox('step', 'Step') + '</div>' : '') +
      (hasOpts ? '<details class="vcard"><summary>Saved values' + (it.type === 'matrix' ? ' and statement names' : '') + '</summary><p class="muted">What the CSV records for each ' + (it.type === 'matrix' ? 'answer column' : 'option') + ': one per line, "saved value | text shown". Keep the values once data collection starts.</p>' +
        '<textarea data-opts="' + b + '" rows="4" class="mono" spellcheck="false">' + esc(optText) + '</textarea>' +
        (it.type === 'matrix' ? field('Statements: "variable name | statement", one per line (each is its own CSV column)', '<textarea data-rows="' + b + '" rows="3" class="mono" spellcheck="false">' + esc((it.rows || []).map(function (r) { return r.id + ' | ' + r.text; }).join('\n')) + '</textarea>') : '') + '</details>' : '') +
      sec('Who sees it') +
      (opts.rules && opts.rules.length ? field('Show when', sel(b + '.showIf', it.showIf || 'always', [['always', 'Always']].concat(opts.rules))) : '') +
      field('Sessions (numbers, separated by commas; blank = ' + (opts.sessions === 'pre' ? 'session 1 only' : 'every session') + ')', '<input type="text" data-sessions="' + b + '" value="' + esc((it.sessions || []).join(', ')) + '">') +
      (conds.length > 1 ? '<div class="f"><span>Groups (none ticked = everyone)</span><div class="row">' + conds.map(function (c) { return '<label class="check"><input type="checkbox" data-qcond="' + b + '|' + esc(c) + '"' + ((it.conditions || []).indexOf(c) >= 0 ? ' checked' : '') + '> ' + esc(c) + '</label>'; }).join('') + '</div></div>' : '') +
      sec('Logic and order') +
      '<p class="lc-rule">' + (it.displayIf && window.LabLogic ? 'Shown when ' + esc(window.LabLogic.describe(it.displayIf, getPath(list))) + '.' : 'Always shown (no display rule).') + '</p>' +
      advanced(list, it, b, opts).replace(/<p class="muted">Shown when[^<]*<\/p>/, '') + '</div>';
  }
  // Display rule, layout, and source note: the parts an imported survey fills in. Closed unless the question uses them.
  function advanced(list, it, b, opts) {
    var used = !!(it.displayIf || it.group || it.long != null || it.min != null || it.max != null || it.source || it.shuffle || it.shuffleOptions);
    var hasOpts = it.type === 'choice' || it.type === 'select' || it.type === 'multi';
    var shown = it.displayIf && window.LabLogic ? '<p class="muted">Shown when ' + esc(window.LabLogic.describe(it.displayIf, getPath(list))) + '.</p>' : '';
    return '<details class="vcard"' + (used ? ' open' : '') + '><summary>Display logic and layout' + (it.displayIf ? ' · shown conditionally' : '') + '</summary>' + shown +
      field('Show this question only when (display rule; leave empty to always show). Written as JSON: {"all": [{"q": "variable", "op": "eq", "value": "x"}]}. Rules can use answers to earlier questions ("q"), embedded data ("ed"), or the condition ("condition"). See the README.',
        '<textarea data-dif="' + b + '" rows="4" class="mono" spellcheck="false">' + esc(it.displayIf ? JSON.stringify(it.displayIf, null, 1) : '') + '</textarea>') +
      '<div class="grid3">' + field('Group ID (consecutive questions with the same ID share one heading)', '<input type="text" class="mono" data-opt="' + b + '.group" value="' + esc(it.group || '') + '">') +
      field('Group heading (shown once above the group)', '<input type="text" data-opt="' + b + '.groupText" value="' + esc(it.groupText || '') + '">') +
      (it.type === 'text' ? '<label class="f check"><input type="checkbox" data-path="' + b + '.long" data-bool="1"' + (it.long ? ' checked' : '') + '> Multi-line answer box</label>' : '') + '</div>' +
      (it.type === 'number' ? '<div class="grid3">' + field('Smallest expected number (a hint; answers are kept as typed)', '<input type="text" data-optnum="' + b + '.min" value="' + esc(it.min != null ? it.min : '') + '">') +
        field('Largest expected number (a hint)', '<input type="text" data-optnum="' + b + '.max" value="' + esc(it.max != null ? it.max : '') + '">') + '</div>' : '') +
      '<h4 style="margin:12px 0 4px">Order</h4>' +
      checkbox('data-path="' + b + '.shuffle" data-bool="1"', it.shuffle, 'Shuffle: this question trades places at random with the other ticked questions on its page') +
      (hasOpts ? checkbox('data-path="' + b + '.shuffleOptions" data-bool="1"', it.shuffleOptions, 'Show the options in a random order') : '') +
      (hasOpts && it.shuffleOptions ? '<div class="f"><span>Options that always stay at the end (for example "Other" or "None of the above")</span><div class="row">' + (it.options || []).map(function (o, k) {
        return '<label class="check"><input type="checkbox" data-anchor="' + b + '|' + k + '"' + (o.anchor ? ' checked' : '') + '> ' + esc(o.label) + '</label>'; }).join('') + '</div></div>' : '') +
      '<p class="muted">Each participant keeps the same order for the whole session. The order shown is saved with the answers (<code>order_questions</code>, <code>order_' + esc(it.id) + '</code>).</p>' +
      (it.source ? '<p class="muted">Imported from: ' + esc(it.source) + '</p>' : '') + '</details>';
  }
  function qlist(list, opts) {
    var items = getPath(list);
    return items.map(function (it, i) { return qcard(list, it, i, items.length, opts); }).join('') + '<button type="button" class="secondary" data-add="' + list + '">Add a question</button>';
  }
  // A survey file chosen in a file input: text, or base64 for .xlsx. Files over 5 MB are refused here and on the server.
  function readFile(file) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error('Choose a file first.'));
      if (file.size > 5 * 1024 * 1024) return rej(new Error('This file is ' + (file.size / 1048576).toFixed(1) + ' MB. Files over 5 MB are not imported.'));
      var r = new FileReader(), bin = /\.xlsx$/i.test(file.name);
      r.onerror = function () { rej(new Error('The file could not be read.')); };
      r.onload = function () {
        if (!bin) return res({ filename: file.name, data: r.result, encoding: 'text', size: file.size });
        var bytes = new Uint8Array(r.result), str = '', i;
        for (i = 0; i < bytes.length; i += 8192) str += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        res({ filename: file.name, data: btoa(str), encoding: 'base64', size: file.size });
      };
      if (bin) r.readAsArrayBuffer(file); else r.readAsText(file);
    });
  }
  // What type plugins get.
  var A = { draft: null, meta: function () { return META.type; }, conditions: conditionsNow, esc: esc, field: field, checkbox: checkbox, inp: inp, num: num, area: area, sel: sel, btn: btn,
    getPath: getPath, setPath: setPath, clone: clone, qlist: qlist, can: can,
    // for study types that import or generate content
    studyId: studyId, started: 0, post: function (p, b) { return postJSON(p, b); }, err: err, say: function (m) { $('say').textContent = m || ''; },
    markDirty: function () { setDirty(true); }, rerender: function () { renderEditor(); }, goto: function (s) { sub = s; renderEditor(); }, readFile: readFile, fmt: fmt,
    api: { getJSON: getJSON, postJSON: postJSON } };

  // Online panel: a preset fills the link parameters and the redirect address; three codes (completed, screened out,
  // returned) are shown to participants only once they reach that outcome (netlify/lib/lab/recruit.mjs).
  function panelEditor(pn) {
    var pre = (META.presets || []).filter(function (x) { return x.id === pn.preset; })[0];
    var link = location.origin + '/lab/s/' + studyId + (pre ? pre.link : '?' + pn.param + '=...');
    var sample = (pn.redirectUrl || '').replace(/\{code\}/g, pn.completionCode || '(code)').replace(/\{pid\}/g, '(participant ID)');
    function code(k, label, help) {
      return '<div class="f"><span>' + label + '</span><div class="row">' + inp('enrollment.panel.' + k, pn[k] || '', ' class="mono" style="flex:1" aria-label="' + esc(label) + '"') + btn('data-gencode="' + k + '"', 'Generate') + '</div><span class="muted">' + help + '</span></div>';
    }
    return '<div class="grid3">' + field('Panel', sel('enrollment.panel.preset', pn.preset || 'custom', [['custom', 'Other (set everything below)']].concat((META.presets || []).map(function (x) { return [x.id, x.label]; })))) + '</div>' +
      (pre ? '<p class="muted">' + esc(pre.help) + '</p>' : '') +
      '<p class="muted">Study link to give the panel: <code>' + esc(link) + '</code></p>' +
      '<div class="grid3">' + field('Link parameter with the participant ID', inp('enrollment.panel.param', pn.param, ' class="mono"')) +
        field('Link parameter with the panel\'s study ID (optional)', inp('enrollment.panel.studyParam', pn.studyParam || '', ' class="mono" placeholder="STUDY_ID"')) +
        field('Link parameter with the panel\'s session ID (optional)', inp('enrollment.panel.sessionParam', pn.sessionParam || '', ' class="mono" placeholder="SESSION_ID"')) + '</div>' +
      '<p class="muted">The participant ID is kept only in the payment list (Students tab, extra-credit list), never in research exports. The study and session IDs are not identifying; they go in the exports and show when one person opened the study more than once.</p>' +
      field('Address that takes participants back to the panel. Write {code} for the code and {pid} for their panel ID. Leave empty to show the code only.', inp('enrollment.panel.redirectUrl', pn.redirectUrl || '', ' class="mono" placeholder="https://app.prolific.com/submissions/complete?cc={code}"')) +
      (pn.redirectUrl ? '<p class="muted">A participant who finishes goes to: <code>' + esc(sample) + '</code></p>' : '') +
      '<div class="grid3">' + code('completionCode', 'Completion code', 'Shown when every session is done.') +
        code('screenOutCode', 'Screened-out code', 'Shown when a screening question, a failed check, or a full quota ends the study.') +
        code('returnCode', 'Returned code', 'Shown when the participant chooses "I want to stop taking part".') + '</div>' +
      '<p class="muted">Codes stay on the server until a participant reaches that point, so they cannot be read from the page.</p>';
  }
  // Quotas: caps on how many people who sign themselves up are let in, for the study and for each condition.
  function quotaEditor(en) {
    var q = en.quota || (en.quota = { total: null, perCondition: {} }), conds = conditionsNow(), counts = A.counts || {}, total = 0;
    Object.keys(counts).forEach(function (k) { total += counts[k]; });
    function capInput(attr, v, label) { return '<input type="number" min="0" ' + attr + ' value="' + (v == null ? '' : esc(v)) + '" style="max-width:140px" aria-label="' + esc(label) + '">'; }
    return '<h3 style="margin:20px 0 8px">Quotas</h3><p class="muted">The most people who can sign themselves up (by email or from an online panel), counted as real participants assigned to a condition. Leave a box empty for no cap. Someone who arrives when the study, or every condition with room, is full sees "This study is full" and gets the screened-out code. People you add on the Students tab, and test participants, are never capped. When many people arrive in the same second, a cap can be passed by one or two.</p>' +
      '<div class="grid3">' + field('Whole study (now ' + total + ')', capInput('data-quota="total"', q.total, 'Cap for the whole study')) +
      conds.map(function (cn) { return field(esc(cn) + ' (now ' + (counts[cn] || 0) + ')', capInput('data-quota="' + esc(cn) + '"', (q.perCondition || {})[cn], 'Cap for ' + cn)); }).join('') + '</div>';
  }
  function genCode() { var a = '23456789ABCDEFGHJKMNPQRSTVWXYZ', s = '', r = new Uint32Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach(function (x, i) { r[i] = Math.random() * 4294967296; }); for (var i = 0; i < 8; i++) s += a[r[i] % a.length]; return s; }
  function renderEditor() {
    $('subtabs').innerHTML = subs().map(function (s) { return '<button type="button" data-sub="' + s[0] + '"' + (s[0] === sub ? ' aria-current="true"' : '') + '>' + s[1] + '</button>'; }).join('');
    var h = '';
    if (sub === 'pre' || sub === 'post') {
      h = '<p class="muted">' + (sub === 'pre' ? 'Shown at the start of a session, before the items. By default only in session 1; list other session numbers to ask again (for example, 1, 4).' : 'Shown at the end of a session. Leave "Sessions" blank to ask every session.') +
        (META.rules.length ? ' "Show when" limits a question to some sessions (for example, with or without the AI).' : '') +
        ' The variable name is the column name in the surveys CSV: keep it if you only reword a question, and use a new name if it now measures something different.</p>' +
        (surveyView() === 'design' ? '<div id="designer"></div>' : qlist('survey.' + sub, { sessions: sub, rules: META.rules, conditions: conditionsNow() }));
    } else if (sub === 'consent') {
      var en = draft.enrollment;
      h = '<h3 style="margin:0 0 8px">Sign-up</h3>' +
        checkbox('data-path="enrollment.open" data-bool="1"', en.open, 'Anyone with an email address at these domains can sign up (no list needed)') +
        '<p class="muted">Participants type their email each session; the first time, they confirm it. There is no verification email, so the study relies on people entering their own address. Emails added on the Students tab can always sign in, even with sign-up off.</p>' +
        '<div class="grid3">' + field('Email domains (one per line, no @)', '<textarea data-domains="1" rows="3" class="mono">' + esc(en.domains.join('\n')) + '</textarea>') +
        field('Gap days between sessions (self sign-ups)', num('enrollment.gapDays', en.gapDays, 0, 60)) + field('Label for self sign-ups', inp('enrollment.label', en.label || '')) + '</div>' +
        '<h3 style="margin:20px 0 8px">Online panel (Prolific, SONA, MTurk, CloudResearch)</h3>' +
        checkbox('data-path="enrollment.panel.enabled" data-bool="1"', en.panel && en.panel.enabled, 'Participants arrive from an online panel: the study link signs them in with the panel\'s participant ID') +
        (en.panel && en.panel.enabled ? panelEditor(en.panel) : '') +
        quotaEditor(en) +
        (draft.consent.recording ? '<h3 style="margin:20px 0 8px">Voice recording</h3>' +
          checkbox('data-path="consent.recording.enabled" data-bool="1"', draft.consent.recording.enabled, 'Ask for separate consent to record participants\' voices (calls and spoken answers)') +
          (draft.consent.recording.enabled ? field('Recording consent checkbox label', area('consent.recording.label', draft.consent.recording.label || '', 2)) +
            checkbox('data-path="consent.recording.required" data-bool="1"', draft.consent.recording.required, 'Required to take part (if unticked, people who decline type instead of speaking)') +
            '<p class="muted">Recordings stay on the lab server, are listed under Recordings &amp; calls (managers and owners), and are never copied to the hourly backup. Delete them on the schedule your IRB approved.</p>' : '') : '') +
        '<h3 style="margin:20px 0 8px">Consent</h3>' + field('Minutes per session (write {minutes} in any text to insert it)', num('minutesPerSession', draft.minutesPerSession, 1, 180)) +
        field('Consent text (leave a blank line between paragraphs; email addresses become links)', '<textarea id="consenttext" rows="14">' + esc(draft.consent.paragraphs.join('\n\n')) + '</textarea>') +
        field('Agreement checkbox label', inp('consent.agreeLabel', draft.consent.agreeLabel)) +
        checkbox('data-path="consent.approved" data-bool="1"', draft.consent.approved, 'This is the IRB-approved consent text (removes the "draft" banner participants see)');
    } else if (sub === 'order') {
      var dz = draft.design || {}, blocks = me.study.type === 'multimodal';
      h = '<h3 style="margin:0 0 8px">Latin square</h3>' +
        checkbox('data-path="design.latinSquare" data-bool="1"', dz.latinSquare === true, 'Counterbalance the order of each session\'s ' + (blocks ? 'blocks' : 'items') + ' with a Latin square') +
        '<p class="muted">Each participant gets one order from a balanced (Williams) Latin square: every ' + (blocks ? 'block' : 'item') + ' appears equally often in every position and right after every other one. With an odd number there are twice as many orders, which together are balanced. Orders are handed out so each is used about equally often within each condition. ' +
        (blocks ? 'Items inside a block are still shown in order or shuffled as set on the Arms &amp; blocks tab.' : 'This replaces "shuffle the items".') + ' The trials CSV records each participant\'s order (<code>cb_row</code>, <code>cb_sequence</code>).</p>' +
        (dz.sessions || []).map(function (sp, i) {
          var units = blocks ? (sp.blocks || []).map(function (b, j) { return b.title || 'Block ' + (j + 1); }) : (sp.items || []);
          if (units.length < 2) return '<p class="muted">Session ' + (i + 1) + ': only one ' + (blocks ? 'block' : 'item') + ', nothing to counterbalance.</p>';
          var rows = williams(units.length);
          return '<details class="vcard"' + (i === 0 ? ' open' : '') + '><summary>Session ' + (i + 1) + ': ' + rows.length + ' orders of ' + units.length + ' ' + (blocks ? 'blocks' : 'items') + '</summary><div class="table-wrap"><table><tr><th>Order</th><th>Shown as</th></tr>' +
            rows.slice(0, 24).map(function (r, k) { return '<tr><td>' + (k + 1) + '</td><td class="wrap-cell">' + r.map(function (x) { return esc(units[x]); }).join(' → ') + '</td></tr>'; }).join('') + '</table></div></details>';
        }).join('');
    } else if (sub === 'environment') {
      var ev = draft.environment || (draft.environment = { preload: false });
      h = '<h3 style="margin:0 0 8px">Devices and browsers</h3>' +
        checkbox('data-path="environment.desktopOnly" data-bool="1"', ev.desktopOnly, 'Computers only: phones and tablets are asked to come back on a laptop or desktop') +
        checkbox('data-path="environment.speechBrowser" data-bool="1"', ev.speechBrowser, 'A browser that understands speech is needed (Chrome or Edge), for studies where participants talk') +
        '<p class="muted">Participants who do not meet these see why and can come back with the right device; nothing is saved for them until they do. For panels, set the same requirement in the panel (for example Prolific\'s device filter) so fewer people arrive on the wrong device.</p>' +
        '<h3 style="margin:20px 0 8px">Microphone and headphones</h3>' +
        checkbox('data-path="environment.micCheck" data-bool="1"', ev.micCheck, 'Check the microphone before each session (a level meter; participants say a few words)') +
        (ev.micCheck ? checkbox('data-path="environment.micRequired" data-bool="1"', ev.micRequired, 'Required: after two failed tries the study ends for that participant (screened out)') : '') +
        checkbox('data-path="environment.headphoneCheck" data-bool="1"', ev.headphoneCheck, 'Headphone check in session 1 (Huggins pitch test, Milne et al. 2021: 6 short trials, passed at 5 correct)') +
        (ev.headphoneCheck ? field('If the headphone check is not passed', sel('environment.headphoneFail', ev.headphoneFail || 'record', [['record', 'Record the score and continue'], ['screen', 'End the study for that participant (screened out)']])) : '') +
        '<p class="muted">The results are saved once per session and are in the wide CSV (<code>s1_check_mic_ok</code>, <code>s1_check_headphone_correct</code>, and so on). The headphone test plays noise in both ears; one noise hides a faint tone that only headphones reveal, so it also catches people listening on speakers.</p>' +
        checkbox('data-path="environment.timingCheck" data-bool="1"', ev.timingCheck, 'Measure each participant\'s display before each session (refresh rate, frame jitter, dropped frames, audio latency; about 2 seconds)') +
        '<p class="muted">Stored with the session (<code>s1_check_timing_refresh_hz</code> and so on). For the lab\'s own machines, the <a href="/lab/timing/" target="_blank" rel="noopener">timing self-check page</a> also measures the speaker-to-microphone delay.</p>' +
        '<h3 style="margin:20px 0 8px">Full screen</h3>' +
        checkbox('data-path="environment.fullscreen" data-bool="1"', ev.fullscreen, 'Ask participants to switch to full screen before the first item') +
        '<p class="muted">Browsers only allow full screen after a click, so participants see a button. Leaving full screen never stops the session: a bar offers the way back, and each trial records whether it was in full screen and every exit (<code>fullscreen</code>, <code>fullscreen_exits</code>, <code>fullscreen_exit_ms</code>).</p>' +
        '<h3 style="margin:20px 0 8px">Language</h3>' +
        field('Language of the study (screen readers, and the speech recognizer and voices of phone calls follow it)', sel('environment.language', ev.language || 'en-US', META.languages || [['en-US', 'English (US)']])) +
        '<p class="muted">Write the study\'s text in that language yourself, on Screen text and the other tabs. The lab does not translate.</p>' +
        '<h3 style="margin:20px 0 8px">Loading and timing</h3>' +
        checkbox('data-path="environment.preload" data-bool="1"', ev.preload, 'Load every picture, sound, and video before the session starts') +
        '<p class="muted">Participants see a progress bar while the files load, and the session starts only when all of them are ready, so no item waits on the network. If a file fails, they can try again (and, after a second failure, continue without it; the <code>preloaded</code> column then says 0). Use it whenever timing matters. Media you upload are always loaded in full; media on another website can only be warmed up, so upload timing-critical files.</p>' +
        '<p class="muted">Every trial records when its screen first appeared (<code>onset_ms</code>, the first display frame after it was drawn) and the screen\'s frame interval (<code>frame_ms</code>; 16.67 ms is a 60 Hz display). Response times from onset are <code>rt_ms</code> minus <code>onset_delay_ms</code>.</p>';
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
    $('viewsw').innerHTML = sub === 'pre' || sub === 'post' ? '<div class="lc-seg viewswitch" role="radiogroup" aria-label="Survey view">' + [['design', 'Design'], ['list', 'List']].map(function (v) {
      return '<button type="button" role="radio" data-view="' + v[0] + '" aria-checked="' + (surveyView() === v[0]) + '" tabindex="' + (surveyView() === v[0] ? 0 : -1) + '">' + v[1] + '</button>'; }).join('') + '</div>' : '';
    $('editor').innerHTML = h;
    // Viewers: the designer is read-only by itself (and disables its own settings panel), so its bar (Preview, Phone,
    // pages) stays usable; every other editor tab is disabled as a whole.
    $('editor').disabled = !can('editor') && !$('designer');
    document.body.classList.toggle('lc-wide', !!$('designer'));
    if ($('designer')) mountDesigner($('designer'), sub);
    if (plugin.afterRender) plugin.afterRender(sub, A);
  }
  // Survey designer (canvas.js): the survey as participants see it, edited in place. Design is the default view; the
  // List view (question cards) stays one click away and is remembered per browser.
  function surveyView() { try { return localStorage.getItem('lab_survey_view') === 'list' ? 'list' : 'design'; } catch (e) { return 'design'; } }
  function mountDesigner(host, kind) {
    host.innerHTML = '<p class="muted">Loading the designer…</p>';
    if (!document.querySelector('link[href="/lab/engine/canvas.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/lab/engine/canvas.css'; document.head.appendChild(l); }
    (window.LabCanvas ? Promise.resolve(true) : loadScript('/lab/engine/canvas.js')).then(function (ok) {
      if (!ok || !window.LabCanvas || !host.isConnected) { if (host.isConnected) host.innerHTML = '<p class="error">The designer could not be loaded. Use the List view.</p>'; return; }
      var path = 'survey.' + kind, opts = { sessions: kind, rules: META.rules, conditions: conditionsNow() }, defs = {};
      (META.text || []).forEach(function (f) { defs[f.key] = f.def; });
      window.LabCanvas.mount(host, {
        kind: kind, list: getPath(path), text: draft.text, defaults: defs, studyId: studyId, readOnly: !can('editor'),
        started: function () { return A.started; },   // read when used: it is refreshed every time the content reloads
        qtypes: META.qtypes, onChange: function () { setDirty(true); },
        inspector: function (i) { return inspectorCard(path, getPath(path)[i], i, opts); }
      });
    });
  }
  // renderEditor rebuilds the subtab buttons, so focus goes back to the (new) current one instead of being lost to the page.
  $('subtabs').addEventListener('click', function (e) { var s = e.target.getAttribute && e.target.getAttribute('data-sub'); if (s) { sub = s; renderEditor(); var cur = $('subtabs').querySelector('button[aria-current="true"]'); if (cur) cur.focus(); } });
  function setView(v) { try { localStorage.setItem('lab_survey_view', v); } catch (x) {} renderEditor(); var b = document.querySelector('#viewsw [data-view="' + v + '"]'); if (b) b.focus(); }
  $('viewsw').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-view]'); if (b) setView(b.getAttribute('data-view')); });   // a view, not an edit
  $('viewsw').addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setView(surveyView() === 'design' ? 'list' : 'design'); } });

  // Applies one field edit to the draft. Returns true when the screen should be redrawn.
  function applyEdit(t) {
    var v, redraw = false;
    var r = plugin.applyEdit ? plugin.applyEdit(t, A) : undefined;
    if (r !== undefined) { setDirty(true); return r; }
    if (t.id === 'consenttext') draft.consent.paragraphs = t.value.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    else if ((v = t.getAttribute('data-opts'))) {
      var was = {}; (getPath(v).options || []).forEach(function (o) { if (o.anchor) was[o.value] = true; });   // keep "stay at the end" on options that are still there
      setPath(v + '.options', t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
        var m = l.split(/\s+\|\s+/), o = m.length > 1 ? { value: m[0].trim(), label: m.slice(1).join(' | ').trim() } : { value: l, label: l };
        if (was[o.value]) o.anchor = true;
        return o;
      }));
    }
    else if ((v = t.getAttribute('data-quota'))) {
      var qt = draft.enrollment.quota || (draft.enrollment.quota = { total: null, perCondition: {} }), qv = t.value.trim() === '' ? null : Number(t.value);
      if (v === 'total') qt.total = qv; else { qt.perCondition = qt.perCondition || {}; if (qv == null) delete qt.perCondition[v]; else qt.perCondition[v] = qv; }
    }
    else if ((v = t.getAttribute('data-rows'))) setPath(v + '.rows', t.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l, k) {
      var m = l.split(/\s+\|\s+/); return m.length > 1 ? { id: m[0].trim(), text: m.slice(1).join(' | ').trim() } : { id: getPath(v).id + '_' + (k + 1), text: l };
    }));
    else if ((v = t.getAttribute('data-anchor'))) { var an = v.split('|'), ao = getPath(an[0]).options[Number(an[1])]; if (t.checked) ao.anchor = true; else delete ao.anchor; }
    else if ((v = t.getAttribute('data-labels'))) setPath(v + '.labels', t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean));
    else if (t.hasAttribute('data-domains')) draft.enrollment.domains = t.value.split(/[\s,;]+/).map(function (x) { return x.trim().toLowerCase().replace(/^@/, ''); }).filter(Boolean);
    else if ((v = t.getAttribute('data-dif'))) {   // display rule as JSON
      var dq = getPath(v);
      if (!t.value.trim()) { delete dq.displayIf; t.removeAttribute('aria-invalid'); }
      else { try { dq.displayIf = JSON.parse(t.value); t.removeAttribute('aria-invalid'); } catch (x) { t.setAttribute('aria-invalid', 'true'); } }
    }
    else if ((v = t.getAttribute('data-opt'))) { var oq = getPath(v.replace(/\.[^.]+$/, '')), ok = v.split('.').pop(); if (t.value.trim()) oq[ok] = t.value.trim(); else delete oq[ok]; }
    else if ((v = t.getAttribute('data-optnum'))) { var nq = getPath(v.replace(/\.[^.]+$/, '')), nk = v.split('.').pop(), nv = t.value.trim(); if (nv !== '' && isFinite(Number(nv))) nq[nk] = Number(nv); else delete nq[nk]; }
    else if ((v = t.getAttribute('data-page'))) { var pg = parseInt(t.value, 10), pq = getPath(v); if (pg >= 1) pq.page = pg; else delete pq.page; }
    else if ((v = t.getAttribute('data-sessions'))) setPath(v + '.sessions', t.value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(function (x) { return Number.isInteger(x); }));
    else if ((v = t.getAttribute('data-qcond'))) {
      var qc = v.split('|'), q = getPath(qc[0]), list = (q.conditions || []).filter(function (c) { return c !== qc[1]; });
      if (t.checked) list.push(qc[1]);
      q.conditions = conditionsNow().filter(function (c) { return list.indexOf(c) >= 0; });
    } else if ((v = t.getAttribute('data-path'))) {
      setPath(v, t.hasAttribute('data-bool') ? t.checked : t.hasAttribute('data-num') ? Number(t.value) : t.value);
      redraw = t.tagName === 'SELECT' || t.type === 'checkbox';
      if (v === 'enrollment.panel.preset') {   // a preset fills in the link parameters and the redirect address
        var pz = (META.presets || []).filter(function (x) { return x.id === t.value; })[0], pnl = draft.enrollment.panel;
        if (pz) ['param', 'studyParam', 'sessionParam', 'redirectUrl'].forEach(function (k) { pnl[k] = pz[k]; });
      }
      if (/^enrollment\.panel\./.test(v) && t.tagName !== 'SELECT' && t.type !== 'checkbox') redraw = false;
      if (/\.type$/.test(v)) {
        var it = getPath(v.replace(/\.type$/, ''));
        if (it.type === 'info') it.required = false;
        if (it.type === 'scale' && !it.n) { it.n = 7; it.lo = it.lo || AGREE7[0]; it.hi = it.hi || AGREE7[6]; }
        if ((it.type === 'choice' || it.type === 'select' || it.type === 'multi' || it.type === 'rank') && !(it.options && it.options.length)) it.options = [{ value: 'Option 1', label: 'Option 1' }, { value: 'Option 2', label: 'Option 2' }];
        if (it.type === 'slider' && it.min == null) { it.min = 0; it.max = 100; it.step = 1; }
        if (it.type === 'matrix') {
          if (!(it.rows && it.rows.length)) it.rows = [{ id: it.id + '_1', text: 'Statement 1' }, { id: it.id + '_2', text: 'Statement 2' }];
          if (!(it.options && it.options.length)) it.options = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'].map(function (l, k) { return { value: String(k + 1), label: l }; });
        }
      }
    } else return false;
    setDirty(true);
    return redraw;
  }
  // Typing updates the draft without redrawing; checkboxes, dropdowns, and leaving a field can redraw.
  $('editor').addEventListener('input', function (e) { var t = e.target; if (t.tagName !== 'SELECT' && t.type !== 'checkbox' && t.type !== 'radio' && t.type !== 'file') applyEdit(t); });
  $('editor').addEventListener('change', function (e) {
    var t = e.target;
    if (plugin.select && plugin.select(t, A)) return renderEditor();   // navigation inside a type tab (not an edit)
    if ((t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio') && applyEdit(t) === true) renderEditor();
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
    } else if ((v = t.getAttribute('data-gencode'))) {
      draft.enrollment.panel[v] = genCode();
    } else if ((v = t.getAttribute('data-resettext'))) {
      draft.text[v] = META.text.filter(function (f) { return f.key === v; })[0].def;
    } else if (!(plugin.click && plugin.click(t, A))) return;
    setDirty(true); renderEditor();
  });

  // ---------- team ----------
  function loadMembers() {
    getJSON('members').then(function (rows) {
      $('memtbl').innerHTML = '<tr><th>Researcher</th><th>Access</th><th>Status</th><th></th></tr>' + rows.map(function (m) {
        return '<tr><td class="wrap-cell"><strong>' + esc(m.name) + '</strong><br><span class="muted">' + esc(m.email) + '</span></td><td>' + esc(m.role) + (m.labOwner ? ' <span class="pill">lab owner</span>' : '') + '</td><td>' + esc(m.status) + '</td><td>' +
          (m.labOwner ? '' : '<button type="button" class="danger secondary small" data-mrm="' + esc(m.email) + '">Remove</button>') + '</td></tr>';
      }).join('');
    }).catch(function (e) { err(e.message); });
  }
  $('memform').addEventListener('submit', function (e) {
    e.preventDefault(); err();
    var email = $('memail').value.trim(); if (!email) return err('Enter an email address.');
    postJSON('member-set', { email: email, name: $('mname').value.trim(), role: $('mrole').value }).then(function (r) {
      var out = $('memout');
      if (r.link) {
        var url = location.origin + r.link.path;
        out.innerHTML = '<div class="warn"><strong>Invitation for ' + esc(r.member.email) + '.</strong> Copy it now and send it to them yourself; it works once for 7 days.<p><input type="text" readonly class="mono" value="' + esc(url) + '" style="width:100%" aria-label="Invitation link" id="memlink"></p></div>';
        $('memlink').select();
      } else out.innerHTML = '<p class="muted">' + esc(r.member.email) + ' now has ' + esc(r.member.role) + ' access.</p>';
      $('memail').value = ''; $('mname').value = ''; loadMembers();
    }).catch(function (x) { err(x.message); });
  });
  $('memtbl').addEventListener('click', function (e) {
    var em = e.target.getAttribute && e.target.getAttribute('data-mrm'); if (!em) return;
    if (!confirm('Take ' + em + '\'s access to this study away? Their account stays; they lose this study at once.')) return;
    postJSON('member-set', { email: em, role: null }).then(loadMembers).catch(function (x) { err(x.message); });
  });
  function loadTeam() {
    loadMembers();
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

  // ---------- encryption (seal.js, netlify/lib/lab/seal.mjs) ----------
  var pendingKid = null;
  function loadSeal() {
    var un = window.LabSeal && LabSeal.loaded();
    $('sealunlocked').textContent = un ? 'Unlocked with key ' + un.kid + (un.study && un.study !== studyId ? ' (made for study ' + un.study + ')' : '') + '. Downloads from this tab are opened as they are saved.' : 'Locked.';
    $('sealforget').hidden = !un;
    getJSON('seal').then(function (s) {
      var prev = (s.previous || []).map(function (p) { return p.kid; });
      $('sealstatus').innerHTML = s.enabled
        ? '<p><strong>On.</strong> New values are encrypted with key <code>' + esc(s.kid) + '</code>, set ' + esc(fmt(s.setAt)) + ' by ' + esc(s.setBy || '') + '.</p>'
        : '<div class="warn">Off. Emails, panel IDs and free-text answers are stored in readable form. An owner can turn encryption on below.</div>';
      if (prev.length) $('sealstatus').innerHTML += '<p class="muted">Older keys (values saved while they were in use need their file): ' + prev.map(function (k) { return '<code>' + esc(k) + '</code>'; }).join(', ') + '</p>';
      $('sealoff').hidden = !s.enabled;
      $('sealbrowser').hidden = !s.enabled; $('sealreq').checked = !!s.requireBrowser;
    }).catch(function (e) { err(e.message); });
  }
  $('sealreq').addEventListener('change', function () {
    var on = this.checked; err();
    if (on && !confirm('Refuse answers from browsers that cannot encrypt? Participants on older browsers will be asked to switch browsers before they start.')) { this.checked = false; return; }
    postJSON('seal-set', { requireBrowser: on }).then(loadSeal).catch(function (e) { err(e.message); loadSeal(); });
  });
  function sealUnsupported() { err('This browser cannot do X25519 encryption (needs Chrome or Edge 133+, Firefox 130+, or Safari 17+). Use the command line instead: node scripts/lab/seal.mjs.'); }
  function readFile(input) { var f = input.files && input.files[0]; input.value = ''; return f ? f.text() : Promise.reject(new Error('Choose a file.')); }
  $('sealfile').addEventListener('change', function () {
    err(); var input = this;
    LabSeal.supported().then(function (ok) {
      if (!ok) return sealUnsupported();
      return readFile(input).then(LabSeal.load).then(loadSeal);
    }).catch(function (e) { err(e.message); });
  });
  $('sealforget').addEventListener('click', function () { LabSeal.forget(); loadSeal(); });
  $('sealnew').addEventListener('click', function () {
    err();
    if (!confirm('Make a new key for this study? Your browser downloads the private key file; keep it safe, because encrypted values cannot be read without it.')) return;
    LabSeal.supported().then(function (ok) {
      if (!ok) return sealUnsupported();
      return LabSeal.generate(studyId).then(function (k) {
        pendingKid = k.kid; pendingPub = k.publicKey;
        saveRaw(new Blob([JSON.stringify(k.file, null, 2) + '\n'], { type: 'application/json' }), studyId + '-private-key-' + k.kid + '.json');
        $('sealconfirm').hidden = false;
      });
    }).catch(function (e) { err(e.message); });
  });
  var pendingPub = null;
  $('sealcheck').addEventListener('change', function () {
    err(); var input = this;
    readFile(input).then(LabSeal.load).then(function (k) {
      if (!pendingKid || k.kid !== pendingKid) throw new Error('That is not the key file just made (' + (pendingKid || 'none') + '). Choose the file that was downloaded.');
      return postJSON('seal-set', { publicKey: pendingPub });
    }).then(function () { pendingKid = pendingPub = null; $('sealconfirm').hidden = true; loadSeal(); }).catch(function (e) { err(e.message); });
  });
  $('sealpubform').addEventListener('submit', function (e) {
    e.preventDefault(); err();
    var pub = $('sealpub').value.trim(); if (!pub) return err('Paste the public key.');
    if (!confirm('Encrypt new values with this key? Make sure you hold its private key file.')) return;
    postJSON('seal-set', { publicKey: pub }).then(function () { $('sealpub').value = ''; loadSeal(); }).catch(function (e) { err(e.message); });
  });
  $('sealoff').addEventListener('click', function () {
    if (!confirm('Stop encrypting? New emails, panel IDs and free-text answers will be stored in readable form. Values already encrypted stay encrypted.')) return;
    postJSON('seal-set', { publicKey: null }).then(loadSeal).catch(function (e) { err(e.message); });
  });

  // ---------- activity ----------
  function loadActivity() {
    getJSON('activity').then(function (rows) {
      $('acttbl').innerHTML = '<tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>' + rows.map(function (r) {
        return '<tr><td>' + esc(fmt(r.at)) + '</td><td>' + esc(r.who) + ' <span class="pill">' + esc(r.role) + '</span></td><td>' + esc(r.action) + '</td><td class="wrap-cell">' + esc(r.detail) + '</td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>');
    }).catch(function (e) { err(e.message); });
  }

  if (getKey() || getSession()) start();

  // ======================= lab console =======================
  // Owner (the owner key, or a lab owner account): every study, the researchers, new studies.
  // Any other signed-in researcher: "My studies", the studies their account can open.
  function labConsole() {
    document.title = 'Lab console';
    root.innerHTML = '<div class="who"><div class="brandmark"><span class="wordmark"><b>CCAIR Behavioral Lab</b><small>Georgia State University · J. Mack Robinson College of Business</small></span><h1 style="margin:0" id="ctitle">CCAIR Lab: studies</h1></div><span id="whoami" class="muted"></span></div>' + SIGNIN + '<div id="app" hidden>' +
      '<p class="muted" id="cintro"></p>' +
      '<div class="table-wrap"><table id="stbl"></table></div><div id="clonebox"></div>' +
      '<div data-create><div class="section start"><h2>Start a new study</h2><p class="muted">Pick a starting point. Each one is a complete, working study: you can preview it as a participant straight away, then change anything on its Study content tab.</p>' +
      '<div class="tpl-grid" id="tplgrid" role="list"></div>' +
      '<form id="newform" class="newform"><h3 id="newhead" tabindex="-1">Name your study</h3><div class="grid3">' +
      '<label class="f">Starting point<select id="ntpl"></select></label>' +
      '<label class="f">Name (participants see it)<input type="text" id="nname" placeholder="Phone call study, pilot 1"></label>' +
      '<label class="f">Link name (lowercase letters, numbers, dashes)<input type="text" id="nid" class="mono" placeholder="phone-calls-pilot"></label></div><p class="muted" id="ntypedesc"></p>' +
      '<label class="f">Description (shown on the lab page once you list the study)<textarea id="ndesc" rows="2"></textarea></label>' +
      '<div class="row"><button type="submit" class="primary">Create study</button></div></form><div id="newout" role="status"></div></div>' +
      '<div class="section" data-create><h2 id="impheading">Create a study from a survey file</h2><p class="muted">Start from a survey you already have: a Qualtrics export (.qsf), a LimeSurvey structure (.lss), a REDCap data dictionary (.csv), or the lab\'s spreadsheet template (.csv or .xlsx; <a href="/lab/templates/survey-template.csv" download>download the template</a>). This creates a survey study (type "Vignettes and surveys") and opens its Study content, Import a survey page with your file already read and previewed. Nothing is saved to the study until you load the preview into the editor and click Save.</p>' +
      '<form id="impform"><div class="grid3"><label class="f">Name<input type="text" id="iname" placeholder="Attitudes survey"></label>' +
      '<label class="f">ID (in the link)<input type="text" id="iid" class="mono" placeholder="attitudes-survey"></label>' +
      '<label class="f">Survey file<input type="file" id="ifile" accept=".qsf,.lss,.csv,.xlsx,.txt"></label></div><div class="row"><button type="submit">Create study and open the import page</button></div></form><div id="impout" role="status"></div></div>' +
      '<div class="section" data-create><h2>Create a study from a design file</h2><p class="muted">A study design file (.json) holds a study\'s whole design and no data. Download one from a study\'s Study content tab, or get one from another lab or a paper\'s materials. The new study starts unlisted, with no participants.</p>' +
      '<form id="dsgform"><div class="grid3"><label class="f">Name<input type="text" id="dname" placeholder="Leave empty to keep the file\'s name"></label><label class="f">Link name<input type="text" id="did" class="mono" placeholder="replication-1"></label>' +
      '<label class="f">Design file<input type="file" id="dfile" accept=".json,application/json"></label></div><div class="row"><button type="submit">Create study from the file</button></div></form><div id="dsgout" role="status"></div></div>' +
      '<div class="section" id="researchers"><h2>Researchers</h2><p class="muted">Each researcher has their own account (email and password, with an optional authenticator app) and a role in each study: viewer, editor, manager, or owner. There is no email service here: an invitation is a link you copy or send from your own mail app. A link works once. Invitations last 7 days and password-reset links 24 hours. The owner key always works, whatever happens to accounts.</p>' +
      '<div class="table-wrap"><table id="rtbl"></table></div><div id="redit"></div>' +
      '<h3>Invite a researcher</h3><form id="invform"><div class="grid3"><label class="f">Name<input type="text" id="invname" autocomplete="off"></label><label class="f">Email<input type="text" id="invemail" autocomplete="off" inputmode="email"></label>' +
      '<label class="f check"><input type="checkbox" id="invowner"> Lab owner (owner of every study, and can invite researchers)</label>' +
      '<label class="f check"><input type="checkbox" id="invcreate"> Can create their own studies (they own what they make, run it, add their own team, and see no other study)</label></div>' +
      '<fieldset class="roles"><legend>Access to studies</legend><div id="invroles" class="rolegrid"></div></fieldset><div class="row" style="margin-top:8px"><button type="submit">Create invitation link</button></div></form><div id="invout" role="status"></div></div>' +
      '<div class="section" id="labactivity"><h2>Account activity</h2><p class="muted">Sign-ins, sign-outs, invitations, password and authenticator changes, role changes. Passwords are never logged.</p><div class="row"><button type="button" class="secondary" id="actload">Show recent activity</button></div><div class="table-wrap"><table id="acttbl2"></table></div></div></div></div>';
    $('keyhelp').innerHTML = 'Sign in with your researcher account, or use the lab owner key (the <code>LAB_ADMIN_KEY</code> or <code>VC_ADMIN_KEY</code> Netlify variable). Keys and sign-ins are kept in this tab only. New here? Read the <a href="/lab/guide/">researcher guide</a>.';
    var TYPES = [], TPLS = [], idTouched = false, ME = null, ROWS = [], PEOPLE = [];
    function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 31); }
    var isOwner = function () { return ME && ME.role === 'owner'; };
    function btn2(attr, label) { return '<button type="button" class="secondary small" ' + attr + '>' + label + '</button>'; }
    function testText(t) { return t ? (t.failed ? '<span class="error">' + t.passed + ' passed, ' + t.failed + ' failed</span>' : t.passed + ' passed') + '<br><span class="muted">' + esc(fmt(t.at)) + '</span>' : '<span class="muted">not run</span>'; }
    function list() {
      getJSON('mystudies').then(function (rows) {
        ROWS = rows;
        var owner = isOwner(), manages = owner || rows.some(function (s) { return s.role === 'owner'; });
        $('stbl').innerHTML = '<tr><th>Study</th><th>Type</th><th>Your role</th><th>Last backup</th><th>Last self-test</th><th>Participants</th><th>Links</th>' + (manages ? '<th>On lab page</th><th></th>' : '') + '</tr>' + rows.map(function (s) {
          var mine = owner || s.role === 'owner';
          return '<tr><td class="wrap-cell"><strong>' + esc(s.name) + '</strong> <span class="muted mono">' + esc(s.id) + '</span>' + (s.archived ? ' <span class="pill">' + (s.deleting ? 'being deleted' : 'archived') + '</span>' : '') + (s.builtIn ? ' <span class="pill">built in</span>' : '') + '</td><td>' + esc(s.typeLabel) + '</td><td><span class="pill">' + esc(s.role) + '</span></td>' +
            '<td>' + (s.lastBackupAt ? esc(fmt(s.lastBackupAt)) : '<span class="muted">none yet</span>') + '</td><td>' + testText(s.lastSelfTest) + '</td>' +
            '<td id="sum-' + esc(s.id) + '">' + btn2('data-sum="' + esc(s.id) + '"', 'Load counts') + '</td>' +
            '<td class="links"><a href="' + esc(s.paths.admin) + '">Admin</a><a href="' + esc(s.paths.participant) + '" target="_blank" rel="noopener">Participant page</a></td>' +
            (!manages ? '' : !mine ? '<td>' + (s.listed && !s.archived ? 'yes' : 'no') + '</td><td></td>' : '<td>' + (s.listed && !s.archived ? 'yes' : 'no') + '</td><td>' + (s.builtIn ? '<span class="muted">set in code</span> ' : (owner ? btn2('data-list="' + esc(s.id) + '|' + (s.listed ? '0' : '1') + '"', s.listed ? 'Unlist' : 'List') + ' ' : '') + (s.deleting ? '' : btn2('data-arch="' + esc(s.id) + '|' + (s.archived ? '0' : '1') + '"', s.archived ? 'Restore' : 'Archive') + ' ')) + (s.archived || !(owner || (ME && ME.canCreate)) ? '' : btn2('data-clone="' + esc(s.id) + '"', 'Clone')) +
              (s.archived && !s.builtIn ? ' <button type="button" class="danger secondary small" data-del="' + esc(s.id) + '">' + (s.deleting ? 'Finish deleting' : 'Delete permanently') + '</button>' : '') + '</td>') + '</tr>';
        }).join('') + (rows.length ? '' : '<tr><td colspan="9" class="muted">No studies yet. ' + (ME && ME.canCreate ? 'Start one below.' : 'Ask the lab owner to give your account access to a study.') + '</td></tr>');
      }).catch(function (e) { err(e.message); });
    }
    // Participant counts are read when asked for: they list the study's participants, which is too much work to do for every study on every page load.
    function loadSum(id) {
      var cell = $('sum-' + id); cell.textContent = 'Loading…';
      getJSON('study-summary?id=' + encodeURIComponent(id)).then(function (r) {
        cell.innerHTML = 'Real: ' + r.real.started + ' started, ' + r.real.completed + ' completed<br>Test: ' + r.test.started + ' started, ' + r.test.completed + ' completed<br><span class="muted">Last activity ' + (r.lastActivityAt ? esc(fmt(r.lastActivityAt)) : 'none') + '</span>';
      }).catch(function (e) { cell.innerHTML = btn2('data-sum="' + esc(id) + '"', 'Load counts'); err(e.message); });
    }
    // ----- researchers -----
    var ROLE_NAMES = ['', 'viewer', 'editor', 'manager', 'owner'];
    function roleSelects(prefix, current) {
      return ROWS.filter(function (s) { return !s.archived; }).map(function (s) {
        return '<label class="f">' + esc(s.name) + '<select data-study="' + esc(s.id) + '" id="' + prefix + esc(s.id) + '">' + ROLE_NAMES.map(function (r) { return '<option value="' + r + '"' + ((current || {})[s.id] === r ? ' selected' : '') + '>' + (r || 'No access') + '</option>'; }).join('') + '</select></label>';
      }).join('') || '<p class="muted">No studies yet.</p>';
    }
    function pickedRoles(box) { var o = {}; box.querySelectorAll('select[data-study]').forEach(function (x) { if (x.value) o[x.getAttribute('data-study')] = x.value; }); return o; }
    function rolesText(r) { var k = Object.keys(r || {}); return k.length ? k.map(function (id) { var st = ROWS.filter(function (x) { return x.id === id; })[0]; return esc(st ? st.name : id) + ': ' + esc(r[id]); }).join('<br>') : '<span class="muted">none</span>'; }
    function people() {
      getJSON('researchers').then(function (rows) {
        PEOPLE = rows;
        $('rtbl').innerHTML = '<tr><th>Researcher</th><th>Status</th><th>Authenticator</th><th>Studies</th><th></th></tr>' + rows.map(function (a) {
          return '<tr><td class="wrap-cell"><strong>' + esc(a.name) + '</strong>' + (a.labOwner ? ' <span class="pill">lab owner</span>' : a.canCreate ? ' <span class="pill">creates studies</span>' : '') + '<br><span class="muted">' + esc(a.email) + '</span></td><td>' + esc(a.status) + '</td><td>' + (a.totp ? 'on' : 'off') + '</td><td class="wrap-cell">' + rolesText(a.studyRoles) + '</td><td class="acts">' +
            btn2('data-pedit="' + a.id + '"', 'Edit access') + ' ' + btn2('data-preset="' + a.id + '"', a.status === 'invited' ? 'New invitation link' : 'Reset password link') + ' ' + btn2('data-prevoke="' + a.id + '"', 'Sign out everywhere') + ' ' +
            (a.totp ? btn2('data-pclear="' + a.id + '"', 'Remove authenticator') + ' ' : '') + btn2('data-pdis="' + a.id + '|' + (a.disabled ? '0' : '1') + '"', a.disabled ? 'Enable' : 'Disable') + ' ' + btn2('data-prem="' + a.id + '"', 'Remove') + '</td></tr>';
        }).join('') + (rows.length ? '' : '<tr><td colspan="5" class="muted">No researchers yet. Invite one below.</td></tr>');
      }).catch(function (e) { err(e.message); });
    }
    // The link is shown with a Copy button and a mailto link to the invitee, so the owner sends it from their own mail app.
    function linkPanel(r, what, email, name) {
      var url = location.origin + r.link.path, days = Math.round((r.link.expiresAt - Date.now()) / 3600000);
      var body = 'Hello ' + (name || '') + ',\n\nHere is your link for the CCAIR Behavioral Lab (' + what + '). It works once and expires in ' + (days >= 48 ? Math.round(days / 24) + ' days' : days + ' hours') + ':\n\n' + url + '\n\nBen';
      return '<div class="warn"><strong>' + esc(what) + ' for ' + esc(email) + '.</strong> Copy it now: it is not shown again, though you can make a new one at any time.' +
        '<p><input type="text" readonly class="mono" id="linkbox" value="' + esc(url) + '" style="width:100%" aria-label="Link"></p>' +
        '<div class="row"><button type="button" id="linkcopy">Copy link</button><a href="mailto:' + encodeURIComponent(email).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('CCAIR Behavioral Lab') + '&amp;body=' + esc(encodeURIComponent(body)) + '">Email this invitation</a></div><p class="muted" id="linkstate" role="status"></p></div>';
    }
    function wireCopy() {
      var b = $('linkcopy'); if (!b) return;
      b.addEventListener('click', function () {
        var box = $('linkbox'); box.select();
        (navigator.clipboard ? navigator.clipboard.writeText(box.value) : Promise.reject()).then(function () { $('linkstate').textContent = 'Copied.'; }, function () { try { document.execCommand('copy'); $('linkstate').textContent = 'Copied.'; } catch (e) { $('linkstate').textContent = 'Press Ctrl+C or Cmd+C to copy the selected link.'; } });
      });
    }
    function wireResearchers() {
      $('invform').addEventListener('submit', function (e) {
        e.preventDefault(); err();
        postJSON('researchers/invite', { name: $('invname').value.trim(), email: $('invemail').value.trim(), labOwner: $('invowner').checked, canCreate: $('invcreate').checked, studyRoles: pickedRoles($('invroles')) }).then(function (r) {
          $('invout').innerHTML = linkPanel(r, 'Invitation (valid 7 days)', r.account.email, r.account.name); wireCopy();
          $('invname').value = ''; $('invemail').value = ''; $('invowner').checked = false; $('invcreate').checked = false; $('invroles').innerHTML = roleSelects('inv-'); people();
        }).catch(function (x) { err(x.message); });
      });
      $('rtbl').addEventListener('click', function (e) {
        var t = e.target, a = t.getAttribute && t.getAttribute.bind(t); if (!a) return;
        var who = function (id) { return PEOPLE.filter(function (x) { return x.id === id; })[0] || {}; };
        if (a('data-pedit')) {
          var p = who(a('data-pedit'));
          $('redit').innerHTML = '<div class="qcard"><h3>Access for ' + esc(p.name) + ' (' + esc(p.email) + ')</h3><div class="row"><label class="f check"><input type="checkbox" id="ed-owner"' + (p.labOwner ? ' checked' : '') + '> Lab owner</label><label class="f check"><input type="checkbox" id="ed-create"' + (p.canCreate ? ' checked' : '') + '> Can create their own studies</label></div><div class="rolegrid">' + roleSelects('ed-', p.studyRoles) + '</div>' +
            '<div class="row" style="margin-top:8px"><button type="button" id="ed-save">Save</button><button type="button" class="secondary" id="ed-cancel">Cancel</button></div></div>';
          $('ed-cancel').addEventListener('click', function () { $('redit').innerHTML = ''; });
          $('ed-save').addEventListener('click', function () { err(); postJSON('researchers/update', { id: p.id, labOwner: $('ed-owner').checked, canCreate: $('ed-create').checked, studyRoles: pickedRoles($('redit')) }).then(function () { $('redit').innerHTML = ''; people(); }).catch(function (x) { err(x.message); }); });
          $('redit').scrollIntoView({ block: 'nearest' });
        } else if (a('data-preset')) {
          var q = who(a('data-preset'));
          postJSON('researchers/reset-link', { id: q.id }).then(function (r) { $('invout').innerHTML = linkPanel(r, q.status === 'invited' ? 'Invitation (valid 7 days)' : 'Password reset (valid 24 hours)', r.email, r.name); wireCopy(); $('invout').scrollIntoView({ block: 'nearest' }); }).catch(function (x) { err(x.message); });
        } else if (a('data-prevoke')) {
          postJSON('researchers/revoke', { id: a('data-prevoke') }).then(function () { err(); alert('Every session for that account has ended.'); }).catch(function (x) { err(x.message); });
        } else if (a('data-pclear')) {
          if (confirm('Remove the authenticator from this account? They will sign in with the password alone until they set it up again.')) postJSON('researchers/clear-totp', { id: a('data-pclear') }).then(people).catch(function (x) { err(x.message); });
        } else if (a('data-pdis')) {
          var d = a('data-pdis').split('|'); postJSON('researchers/update', { id: d[0], disabled: d[1] === '1' }).then(people).catch(function (x) { err(x.message); });
        } else if (a('data-prem')) {
          var r2 = who(a('data-prem'));
          if (confirm('Remove ' + r2.name + ' (' + r2.email + ')? Their account is deleted and their sessions stop working. Study data is not touched.')) postJSON('researchers/remove', { id: r2.id }).then(people).catch(function (x) { err(x.message); });
        }
      });
      $('actload').addEventListener('click', function () {
        getJSON('activity').then(function (rows) {
          $('acttbl2').innerHTML = '<tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>' + rows.slice(0, 200).map(function (r) { return '<tr><td>' + esc(fmt(r.at)) + '</td><td>' + esc(r.who) + '</td><td>' + esc(r.action) + '</td><td class="wrap-cell">' + esc(r.detail) + '</td></tr>'; }).join('') + (rows.length ? '' : '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>');
        }).catch(function (e) { err(e.message); });
      });
    }
    function begin() {
      err();
      getJSON('me').then(function (me) {
        ME = me;
        $('signinbox').hidden = true; $('keyhelp').hidden = true; $('app').hidden = false;
        var ses = getSession();
        $('whoami').innerHTML = esc(me.name) + ' <span class="pill">' + esc(me.role === 'owner' ? 'owner' : 'researcher') + '</span>' + (ses ? ' <a href="/lab/account/">Account</a>' : '') + ' <a href="/lab/guide/">Researcher guide</a> <button type="button" class="secondary small" id="signout">Sign out</button>';
        $('signout').addEventListener('click', function () { endSession().then(function () { location.reload(); }); });
        var creates = isOwner() || !!me.canCreate;
        document.querySelectorAll('[data-owner]').forEach(function (el) { el.hidden = !isOwner(); });
        document.querySelectorAll('[data-create]').forEach(function (el) { el.hidden = !creates; });
        $('researchers').hidden = $('labactivity').hidden = !isOwner();
        $('ctitle').textContent = isOwner() ? 'CCAIR Lab: studies' : 'My studies';
        $('cintro').innerHTML = isOwner()
          ? 'Every study runs on the same engine: sign-in, consent, sessions, surveys, behavior traces, exports, backups, team access, and the live self-test. A new study gets its own data store, admin page, and participant link. Studies start unlisted; list one on <a href="/lab/">the lab page</a> once its consent text is IRB-approved and it is ready to recruit. New to the lab? Send researchers to the <a href="/lab/guide/">researcher guide</a>.'
          : 'The studies your account can open, with your role in each. Open a study\'s admin page to see participants, edit content, and download data (what you can do depends on your role). Backup and self-test times come from the study itself; click "Load counts" to count participants. New to the lab? Read the <a href="/lab/guide/">researcher guide</a>.';
        if (!creates) { list(); return; }
        return Promise.all([getJSON('types'), getJSON('templates').catch(function () { return []; })]).then(function (res) {
          TYPES = res[0]; TPLS = res[1];
          // Templates first; a blank study of each type after them, for researchers who want to start from nothing.
          $('ntpl').innerHTML = '<optgroup label="Templates">' + TPLS.map(function (x) { return '<option value="tpl:' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') + '</optgroup>' +
            '<optgroup label="Blank study">' + TYPES.map(function (x) { return '<option value="type:' + esc(x.id) + '">Blank: ' + esc(x.label) + '</option>'; }).join('') + '</optgroup>';
          $('tplgrid').innerHTML = TPLS.map(function (x) {
            return '<button type="button" class="tpl-card" role="listitem" data-tpl="' + esc(x.id) + '"><span class="tpl-icon tpl-' + esc(x.icon) + '" aria-hidden="true"></span>' +
              '<span class="tpl-name">' + esc(x.name) + '</span><span class="tpl-blurb">' + esc(x.blurb) + '</span><span class="tpl-meta">About ' + x.minutes + ' min · ' + (x.type === 'multimodal' ? 'media and voice' : x.type === 'reaction' ? 'reaction times' : 'text and surveys') + '</span></button>';
          }).join('');
          var d = function () {
            var v = $('ntpl').value, t = v.indexOf('tpl:') === 0 ? TPLS.filter(function (x) { return 'tpl:' + x.id === v; })[0] : null, y = !t ? TYPES.filter(function (x) { return 'type:' + x.id === v; })[0] : null;
            $('ntypedesc').textContent = t ? t.blurb : y ? y.description : '';
            document.querySelectorAll('.tpl-card').forEach(function (c) { c.setAttribute('aria-pressed', t && c.getAttribute('data-tpl') === t.id ? 'true' : 'false'); });
          };
          $('ntpl').addEventListener('change', d); d();
          $('tplgrid').addEventListener('click', function (e) {
            var c = e.target.closest && e.target.closest('.tpl-card'); if (!c) return;
            $('ntpl').value = 'tpl:' + c.getAttribute('data-tpl'); d();
            $('newform').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
            $('nname').focus({ preventScroll: true });
          });
          return getJSON('mystudies');
        }).then(function (rows) { ROWS = rows; list(); if (isOwner()) { $('invroles').innerHTML = roleSelects('inv-'); wireResearchers(); people(); } });
      }).catch(function (e) { setKey(''); if (e.code === 'session_expired') setSession(null); $('signinbox').hidden = false; $('app').hidden = true; err(e.message); });
    }
    $('keyform').addEventListener('submit', function (e) { e.preventDefault(); setSession(null); setKey($('key').value.trim()); begin(); });
    $('nname').addEventListener('input', function () { if (!idTouched) $('nid').value = slug($('nname').value); });
    $('nid').addEventListener('input', function () { idTouched = true; });
    $('newform').addEventListener('submit', function (e) {
      e.preventDefault(); err();
      var pick = $('ntpl').value, body = { name: $('nname').value.trim(), id: $('nid').value.trim(), description: $('ndesc').value.trim() };
      if (!body.name) { err('Give the study a name.'); return $('nname').focus(); }
      if (pick.indexOf('tpl:') === 0) body.template = pick.slice(4); else body.type = pick.slice(5);
      postJSON('create', body).then(function (r) {
        var s = r.study;
        $('newout').innerHTML = '<div class="done-card"><h3 tabindex="-1" id="donehead">' + esc(s.name) + ' is ready</h3><p>It is not listed on the lab page yet, so only people with the link can reach it. Try it as a participant first, then change the consent text, items, and questions on its admin page.</p>' +
          '<div class="row"><button type="button" class="primary" id="newpreview" data-study="' + esc(s.id) + '">Preview as a participant</button><a class="btn secondary" href="' + esc(s.paths.admin) + '">Open its admin page</a></div>' +
          '<p class="muted">Participant link: <code>' + esc(location.origin + s.paths.participant) + '</code></p></div>';
        $('donehead').focus();
        $('newpreview').addEventListener('click', function () {
          var w = window.open('about:blank', '_blank'), ses = getSession();
          fetch('/api/lab/' + s.id + '/admin/preview', { method: 'POST', headers: Object.assign(ses ? { authorization: 'Bearer ' + ses.token } : { 'x-admin-key': getKey() }, { 'content-type': 'application/json' }), body: '{}' })
            .then(function (x) { return x.json(); }).then(function (p) { if (p.url) { if (w) w.location = p.url; else location.href = p.url; } else { if (w) w.close(); err(p.hint || 'The preview could not start.'); } })
            .catch(function () { if (w) w.close(); err('The preview could not start. Check that the lab is still running.'); });
        });
        $('nname').value = ''; $('nid').value = ''; $('ndesc').value = ''; idTouched = false; list();
      }).catch(function (e) { err(e.message); });
    });
    // Clone: a new study with the same design (content, settings, media) and no participants. Completion codes are new.
    function cloneForm(id, at) {
      var s = ROWS.filter(function (x) { return x.id === id; })[0] || { name: id }, box = $('clonebox');
      box.innerHTML = '<form class="qcard" id="clf"><h3 id="clhead" tabindex="-1">Clone ' + esc(s.name) + '</h3><p class="muted">Copies the design (items, questions, conditions, settings, media). Participants and answers are not copied. The copy gets new completion codes, so the two studies never share a code: enter the new ones in your panel (Prolific, SONA, and so on) before you open the copy to participants. The panel redirect address is copied.</p><div class="grid3">' +
        '<label class="f">Name<input type="text" id="clname" value="' + esc(s.name + ' (copy)') + '"></label><label class="f">Link name<input type="text" id="clid" class="mono" value="' + esc(slug(s.id + '-copy')) + '"></label></div>' +
        '<div class="row"><button type="submit">Create the copy</button><button type="button" class="secondary" id="clcancel">Cancel</button></div></form>';
      $('clhead').focus();
      $('clcancel').addEventListener('click', function () { box.innerHTML = ''; at.focus(); });
      $('clf').addEventListener('submit', function (e) {
        e.preventDefault(); err();
        postJSON('clone', { from: id, name: $('clname').value.trim(), id: $('clid').value.trim() }).then(function (r) {
          list(); box.innerHTML = '<div class="done-card"><h3 tabindex="-1" id="donehead">' + esc(r.study.name) + ' is ready</h3><p>A copy of ' + esc(s.name) + ' with no participants, unlisted.' + (r.newCodes && r.newCodes.length ? ' It has new completion codes: enter them in your panel (they are on its Study content → Sign-up &amp; consent page).' : '') + ' <a href="' + esc(r.study.paths.admin) + '">Open its admin page</a>.</p></div>'; $('donehead').focus();
        }).catch(function (x) { err(x.message); });
      });
    }
    // Delete permanently: archived, not built in, lab owners only. The owner types the study's link name to confirm. A large
    // study is deleted over several calls; this repeats the call until the server says it is done.
    function deleteForm(id, at) {
      var s = ROWS.filter(function (x) { return x.id === id; })[0] || { name: id }, box = $('clonebox');
      box.innerHTML = '<form class="qcard" id="delf"><h3 id="delhead" tabindex="-1">Delete ' + esc(s.name) + ' permanently</h3>' +
        '<p><strong>This cannot be undone.</strong> Every participant, answer, recording, uploaded file, setting, and team key of this study is deleted, and so is its copy in the backup store. Researchers lose their access to it. The lab activity log keeps a note that it was deleted, and by whom.</p>' +
        '<p>Download the complete backup first and keep it in GSU-approved storage, if your IRB protocol or data plan says to keep the data: click Restore, open the study\'s admin page, use "Download complete backup" in its Backups section, then archive it again.</p>' +
        '<label class="f">To confirm, type the link name <span class="mono">' + esc(id) + '</span><input type="text" id="delconfirm" class="mono" autocomplete="off" spellcheck="false"></label>' +
        '<div class="row"><button type="submit" class="danger">Delete permanently</button><button type="button" class="secondary" id="delcancel">Cancel</button></div><p class="muted" id="delprog" role="status"></p></form>';
      $('delhead').focus();
      $('delcancel').addEventListener('click', function () { box.innerHTML = ''; at.focus(); });
      $('delf').addEventListener('submit', function (e) {
        e.preventDefault(); err();
        var typed = $('delconfirm').value.trim(), total = 0;
        if (typed !== id) { err('Type the link name exactly (' + id + ') to confirm.'); $('delconfirm').focus(); return; }
        var btns = box.querySelectorAll('button'); btns.forEach(function (b) { b.disabled = true; });
        (function round() {
          postJSON('delete-study', { id: id, confirm: typed }).then(function (r) {
            total += r.deleted || 0;
            if (!r.done) { $('delprog').textContent = 'Deleting… ' + total + ' records so far, about ' + r.remaining + ' left. Keep this page open.'; return round(); }
            box.innerHTML = '<div class="done-card"><h3 tabindex="-1" id="donehead">' + esc(s.name) + ' was deleted</h3><p>' + total + ' records were deleted, with its backup copy.' + (r.accounts ? ' ' + r.accounts + ' researcher account(s) lost access to it.' : '') + '</p></div>';
            $('donehead').focus(); list();
          }).catch(function (x) { err(x.message + (total ? ' Part of the study was already deleted: click "Finish deleting" to complete it.' : '')); btns.forEach(function (b) { b.disabled = false; }); list(); });
        })();
      });
    }
    $('dsgform').addEventListener('submit', function (e) {
      e.preventDefault(); err(); $('dsgout').textContent = '';
      var f = $('dfile').files[0], id = $('did').value.trim();
      if (!id) return err('Enter a link name for the new study.');
      readFile(f).then(function (file) {
        var d; try { d = JSON.parse(file.data); } catch (x) { throw new Error('That file is not a study design file (it is not valid JSON).'); }
        return postJSON('create', { design: d, id: id, name: $('dname').value.trim() || undefined });
      }).then(function (r) {
        $('dsgout').innerHTML = '<div class="done-card"><h3 tabindex="-1" id="dsghead">' + esc(r.study.name) + ' is ready</h3><p>Made from the design file' + (r.filesLeftOut ? ', but ' + r.filesLeftOut + ' media file(s) were not in it: upload them again on its Items tab' : '') + '.' + (r.newCodes && r.newCodes.length ? ' New completion codes were made (the file had none): enter them in your panel, from Study content, Sign-up &amp; consent.' : '') + ' <a href="' + esc(r.study.paths.admin) + '">Open its admin page</a>.</p></div>';
        $('dsghead').focus(); $('did').value = ''; $('dname').value = ''; list();
      }).catch(function (x) { err(x.message); });
    });
    var impTouched = false;
    $('iname').addEventListener('input', function () { if (!impTouched) $('iid').value = slug($('iname').value); });
    $('iid').addEventListener('input', function () { impTouched = true; });
    $('impform').addEventListener('submit', function (e) {
      e.preventDefault(); err(); $('impout').textContent = '';
      var f = $('ifile').files[0], name = $('iname').value.trim(), id = $('iid').value.trim();
      if (!name || !id) return err('Enter a name and an ID for the new study.');
      readFile(f).then(function (file) {
        return postJSON('create', { name: name, id: id, type: 'vignettes', description: '' }).then(function (r) {
          var s = r.study, kept = false;
          try { sessionStorage.setItem('lab_import_pending', JSON.stringify({ study: s.id, file: file })); kept = true; } catch (x) {}
          $('impout').textContent = 'Created ' + s.name + '. Opening its import page' + (kept ? '' : ' (choose the file again there)') + '…';
          location.href = s.paths.admin + '#import';
        });
      }).catch(function (x) { err(x.message); $('ifile').focus(); });
    });
    $('stbl').addEventListener('click', function (e) {
      var sum = e.target.getAttribute && e.target.getAttribute('data-sum'); if (sum) return loadSum(sum);
      var cl = e.target.getAttribute && e.target.getAttribute('data-clone'); if (cl) return cloneForm(cl, e.target);
      var dl = e.target.getAttribute && e.target.getAttribute('data-del'); if (dl) return deleteForm(dl, e.target);
      var v = e.target.getAttribute && (e.target.getAttribute('data-list') || e.target.getAttribute('data-arch')); if (!v) return;
      var p = v.split('|'), on = p[1] === '1', key = e.target.hasAttribute('data-list') ? 'listed' : 'archived';
      if (key === 'archived' && on && !confirm('Archive "' + p[0] + '"? Its participant page and admin page stop working, but no data is deleted. You can restore it here.')) return;
      var body = { id: p[0] }; body[key] = on;
      postJSON('update', body).then(list).catch(function (x) { err(x.message); });
    });
    if (getKey() || getSession()) begin();
  }
})();
