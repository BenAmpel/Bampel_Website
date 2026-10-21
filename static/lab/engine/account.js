/* CCAIR Behavioral Lab: /lab/account/ for signed-in researchers: name, password, authenticator, recovery codes, sign out everywhere, and the studies and roles on the account. */
(function () {
  'use strict';
  var A = window.LabAuth, esc = A.esc, root = document.getElementById('account');
  function fmt(ms) { return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never'; }
  function say(id, msg, bad) { var el = document.getElementById(id); if (el) { el.textContent = msg || ''; el.className = (bad ? 'error' : 'ok') + ' statusline'; } }
  if (!A.getSession()) { root.innerHTML = '<h1>Account settings</h1><p>You are not signed in. <a class="btn" href="/lab/signin/?next=%2Flab%2Faccount%2F">Sign in</a></p>'; return; }

  function load() {
    A.api('account/me').then(function (r) {
      if (!r.ok) { root.innerHTML = '<h1>Account settings</h1><p class="error" role="alert">' + esc(A.message(r.data)) + '</p><p><a class="btn" href="/lab/signin/?next=%2Flab%2Faccount%2F">Sign in</a></p>'; return; }
      render(r.data);
    });
  }
  function render(a) {
    root.innerHTML = '<h1 tabindex="-1" id="h">Account settings</h1><p class="muted">Signed in as ' + esc(a.email) + (a.labOwner ? ' (lab owner)' : '') + '. This sign-in ends ' + esc(fmt(a.expiresAt)) + '. <a href="/lab/admin/">My studies</a> · <a href="/lab/guide/">Researcher guide</a></p>' +
      '<section aria-labelledby="h-name"><h2 id="h-name">Name</h2><form id="nameform" class="form-narrow"><label>Your name<input type="text" id="name" autocomplete="name" value="' + esc(a.name) + '"></label><div class="row"><button type="submit">Save name</button></div><p class="statusline" id="s-name" role="status"></p></form></section>' +
      '<section aria-labelledby="h-pw"><h2 id="h-pw">Password</h2><p class="muted">Last changed ' + esc(fmt(a.passwordChangedAt)) + '. Changing it signs out every other browser.</p><form id="pwform" class="form-narrow"><label>Current password<input type="password" id="cur" autocomplete="current-password"></label>' +
      '<label>New password (at least 12 characters)<input type="password" id="n1" autocomplete="new-password"></label><label>New password again<input type="password" id="n2" autocomplete="new-password"></label><div class="row"><button type="submit">Change password</button></div><p class="statusline" id="s-pw" role="status"></p></form></section>' +
      '<section aria-labelledby="h-totp"><h2 id="h-totp">Authenticator app</h2>' + (a.totp
        ? '<p>An authenticator is on. Unused recovery codes: <strong>' + a.recoveryRemaining + '</strong>.</p><form id="totpform" class="form-narrow"><label>Your password, to change this<input type="password" id="tpw" autocomplete="current-password"></label>' +
          '<div class="row"><button type="button" id="regen" class="secondary">Make new recovery codes</button><button type="button" id="totpoff" class="secondary">Turn off the authenticator</button></div></form><p class="statusline" id="s-totp" role="status"></p><div id="codes"></div>'
        : '<p>An authenticator app adds a second step at sign-in: a 6-digit code that changes every 30 seconds. It is optional, and recommended if you can download participant data.</p><div id="totp"><button type="button" id="totpon">Set up an authenticator</button></div>') + '</section>' +
      '<section aria-labelledby="h-out"><h2 id="h-out">Sign out</h2><div class="row"><button type="button" class="secondary" id="out">Sign out of this browser</button><button type="button" class="secondary" id="outall">Sign out everywhere</button></div><p class="statusline" id="s-out" role="status"></p></section>' +
      '<section aria-labelledby="h-st"><h2 id="h-st">Your studies and roles</h2>' + (a.labOwner ? '<p>You are a lab owner: owner of every study.</p>' : a.studies.length
        ? '<div class="table-wrap"><table><tr><th>Study</th><th>Role</th></tr>' + a.studies.map(function (s) { return '<tr><td><a href="/lab/admin/' + esc(s.id) + '">' + esc(s.name) + '</a></td><td>' + esc(s.role) + '</td></tr>'; }).join('') + '</table></div>'
        : '<p>No study access yet. Ask the lab owner to add you to a study.</p>') + '</section>';
    document.getElementById('h').focus();
    document.getElementById('nameform').addEventListener('submit', function (e) { e.preventDefault(); A.api('account/name', { name: document.getElementById('name').value }).then(function (r) { say('s-name', r.ok ? 'Saved.' : A.message(r.data), !r.ok); }); });
    document.getElementById('pwform').addEventListener('submit', function (e) {
      e.preventDefault();
      var n1 = document.getElementById('n1').value;
      if (n1 !== document.getElementById('n2').value) return say('s-pw', 'The two new passwords are not the same.', true);
      A.api('account/password', { current: document.getElementById('cur').value, next: n1, next2: n1 }).then(function (r) {
        if (!r.ok) return say('s-pw', A.message(r.data), true);
        var s = A.getSession(); A.setSession({ token: r.data.token, expiresAt: r.data.expiresAt, name: s.name, email: s.email, labOwner: s.labOwner });
        ['cur', 'n1', 'n2'].forEach(function (id) { document.getElementById(id).value = ''; }); say('s-pw', 'Password changed. Other browsers were signed out.');
      });
    });
    if (a.totp) {
      document.getElementById('regen').addEventListener('click', function () {
        A.api('account/recovery', { password: document.getElementById('tpw').value }).then(function (r) { if (!r.ok) return say('s-totp', A.message(r.data), true); say('s-totp', ''); A.showCodes(document.getElementById('codes'), r.data.recoveryCodes, load); });
      });
      document.getElementById('totpoff').addEventListener('click', function () {
        if (!confirm('Turn off the authenticator? You will sign in with your password alone.')) return;
        A.api('account/totp-disable', { password: document.getElementById('tpw').value }).then(function (r) { if (!r.ok) return say('s-totp', A.message(r.data), true); load(); });
      });
    } else {
      document.getElementById('totpon').addEventListener('click', function () { A.setupTotp(document.getElementById('totp'), load, load); });
    }
    document.getElementById('out').addEventListener('click', function () { A.api('account/signout', {}).then(function () { A.setSession(null); location.href = '/lab/signin/'; }); });
    document.getElementById('outall').addEventListener('click', function () {
      if (!confirm('Sign out of every browser, including this one?')) return;
      A.api('account/signout-all', {}).then(function (r) { if (!r.ok) return say('s-out', A.message(r.data), true); A.setSession(null); location.href = '/lab/signin/'; });
    });
  }
  load();
})();
