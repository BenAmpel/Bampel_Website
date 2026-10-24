/* CCAIR Behavioral Lab: /lab/signin/ for researchers.
   Three views: sign in (email, password, and an authenticator or recovery code when the account has one),
   accept an invitation (#invite=<token>), and set a new password from a reset link (#reset=<token>). */
(function () {
  'use strict';
  var A = window.LabAuth, esc = A.esc, root = document.getElementById('signin');
  var next = (function () { var n = new URLSearchParams(location.search).get('next') || ''; return /^\/lab\/[A-Za-z0-9\/_.#?=&-]*$/.test(n) && n.indexOf('//') < 0 ? n : '/lab/admin/'; })();
  function view(html) { root.innerHTML = html; var h = root.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } }
  function go() { location.href = next; }
  // Shows a validation message beside the field that needs fixing: text in the alert line, the field marked invalid and
  // described by it, and focus moved to it (WCAG 3.3.1). The mark clears when the person types.
  function fieldError(inputId, msg) {
    var f = document.getElementById(inputId), err = document.getElementById('err');
    err.textContent = msg;
    if (!f) return;
    f.setAttribute('aria-invalid', 'true'); f.setAttribute('aria-describedby', 'err');
    f.addEventListener('input', function () { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-describedby'); }, { once: true });
    f.focus();
  }
  function store(r) { A.setSession({ token: r.token, expiresAt: r.expiresAt, name: r.account.name, email: r.account.email, labOwner: r.account.labOwner }); }

  function signinView(msg, email, needCode, pw) {
    view('<h1>Researcher sign-in</h1><p>Sign in with the account the lab owner set up for you. Participants do not sign in here: they use the link for their study.</p>' +
      '<form id="f" class="form-narrow" novalidate><label for="email">Email<input type="email" id="email" autocomplete="username" spellcheck="false" value="' + esc(email || '') + '"></label>' +
      '<label for="pw">Password<input type="password" id="pw" autocomplete="current-password" value="' + esc(pw || '') + '"></label>' +
      (needCode ? '<label for="code">Authenticator code or recovery code<input type="text" id="code" autocomplete="one-time-code" spellcheck="false" autocapitalize="off"></label>' : '') +
      '<p class="error statusline" id="err" role="alert">' + esc(msg || '') + '</p><div class="row"><button type="submit" id="go">Sign in</button></div></form>' +
      '<p class="muted">No account yet? <a href="' + window.LabContact.access() + '">Request access</a> (opens your email app). <a href="' + window.LabContact.signin() + '">Trouble signing in?</a> See also the <a href="/lab/guide/">researcher guide</a>.</p>');
    var f = document.getElementById('f');
    (needCode ? document.getElementById('code') : document.getElementById(email ? 'pw' : 'email')).focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = document.getElementById('email').value.trim(), pw = document.getElementById('pw').value, code = needCode ? document.getElementById('code').value.trim() : '';
      if (!em || !pw) return fieldError(!em ? 'email' : 'pw', 'Enter your email and password.');
      document.getElementById('go').disabled = true;
      A.api('auth/signin', { email: em, password: pw, code: code }, true).then(function (r) {
        if (r.ok) { store(r.data); return go(); }
        if (r.data.error === 'code_required') return signinView(needCode ? r.data.hint : '', em, true, pw);
        signinView(A.message(r.data), em, needCode && r.data.error !== 'locked', needCode && r.data.error === 'bad_code' ? pw : '');
      });
    });
  }

  function pwForm(info, token) {
    var invite = info.kind === 'invite';
    view('<h1>' + (invite ? 'Welcome to the lab' : 'Choose a new password') + '</h1><p>' + (invite ? 'You were invited as <strong>' + esc(info.email) + '</strong>. Set your name and a password.' : 'Setting a new password for <strong>' + esc(info.email) + '</strong>.') + '</p>' +
      '<form id="f" class="form-narrow" novalidate>' + (invite ? '<label for="name">Your name<input type="text" id="name" autocomplete="name" value="' + esc(info.name || '') + '"></label>' : '') +
      '<label for="pw">Password (at least 12 characters)<input type="password" id="pw" autocomplete="new-password"></label><label for="pw2">Type it again<input type="password" id="pw2" autocomplete="new-password"></label>' +
      '<p class="muted">Use a long phrase you do not use anywhere else. A password manager works well. Common passwords, and ones containing your name or email, are refused.</p>' +
      '<p class="error statusline" id="err" role="alert"></p><div class="row"><button type="submit" id="go">' + (invite ? 'Create my account' : 'Set password') + '</button></div></form>');
    document.getElementById(invite ? 'name' : 'pw').focus();
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = document.getElementById('pw').value, pw2 = document.getElementById('pw2').value;
      if (pw !== pw2) return fieldError('pw2', 'The two passwords are not the same.');
      document.getElementById('go').disabled = true;
      A.api('auth/accept', { token: token, name: invite ? document.getElementById('name').value : undefined, password: pw, password2: pw2 }, true).then(function (r) {
        if (!r.ok) { document.getElementById('go').disabled = false; document.getElementById('err').textContent = A.message(r.data); return; }
        // Accepting a link never signs anyone in: sign in with the new password (and a code, if the account has an authenticator).
        signinView(invite ? 'Account created. Sign in with your new password. You can set up an authenticator app afterwards, on the account page.' : 'Password changed. Sign in with the new password.', info.email);
      });
    });
  }

  var m = location.hash.match(/^#(invite|reset)=([A-Za-z0-9_-]{20,80})$/);
  if (m) {
    var token = m[2];
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}   // keep the token out of the address bar and history
    A.api('auth/link-info', { token: token }, true).then(function (r) {
      if (!r.ok) return view('<h1>This link cannot be used</h1><p class="error" role="alert">' + esc(A.message(r.data)) + '</p><p><a href="/lab/signin/">Go to sign-in</a> · <a href="' + window.LabContact.signin() + '">Trouble signing in?</a></p>');
      pwForm(r.data, token);
    });
  } else if (A.getSession()) {
    view('<h1>You are signed in</h1><p><a class="btn" href="' + esc(next) + '">Continue</a> <a href="/lab/account/">Account settings</a></p>');
  } else signinView();
})();
