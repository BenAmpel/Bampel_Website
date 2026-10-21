/* CCAIR Behavioral Lab: researcher sign-in helpers shared by /lab/signin/ and /lab/account/.
   The session token is kept in this tab's sessionStorage (key lab_session), like the admin key, and is sent as
   "Authorization: Bearer <token>". It is not a cookie, so other sites cannot make the browser send it. */
(function () {
  'use strict';
  var KEY = 'lab_session';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getSession() { try { var s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && s.token && s.expiresAt > Date.now() ? s : null; } catch (e) { return null; } }
  function setSession(s) { try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch (e) {} }
  // Resolves to { ok, status, data }; never rejects (a network failure is data.error = 'network').
  function api(route, body, anon) {
    var ses = anon ? null : getSession(), headers = {};
    if (body) headers['content-type'] = 'application/json';
    if (ses) headers.authorization = 'Bearer ' + ses.token;
    return fetch('/api/lab/_lab/' + route, { method: body ? 'POST' : 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (d.error === 'session_expired') setSession(null); return { ok: r.ok, status: r.status, data: d }; });
    }, function () { return { ok: false, status: 0, data: { error: 'network', hint: 'Could not reach the server. Check your connection and try again.' } }; });
  }
  function message(d) { return d.hint || (d.error === 'network' ? 'Could not reach the server.' : 'Something went wrong (' + (d.error || 'error') + '). Try again.'); }
  function group(secret) { return String(secret).replace(/(.{4})/g, '$1 ').trim(); }
  function copy(text, done) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { done('Copied.'); }, function () { done('Select the text and copy it.'); });
  }
  // Recovery codes, shown once.
  function showCodes(el, codes, onDone) {
    el.innerHTML = '<h3 tabindex="-1" id="codes-h">Recovery codes</h3><p>Each code works once if you lose your authenticator. They are shown only now. Save them somewhere safe, such as a password manager.</p>' +
      '<ul class="codes">' + codes.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
      '<div class="row"><button type="button" class="secondary" id="codes-copy">Copy codes</button><label class="check"><input type="checkbox" id="codes-ok"> I saved these codes</label><button type="button" id="codes-done" disabled>Done</button></div><p class="muted statusline" id="codes-state" role="status"></p>';
    document.getElementById('codes-h').focus();
    document.getElementById('codes-copy').addEventListener('click', function () { copy(codes.join('\n'), function (m) { document.getElementById('codes-state').textContent = m; }); });
    document.getElementById('codes-ok').addEventListener('change', function () { document.getElementById('codes-done').disabled = !this.checked; });
    document.getElementById('codes-done').addEventListener('click', onDone);
  }
  // Authenticator setup in the element: shows the key as text (no QR code, nothing loaded from other sites), asks for one code to confirm, then shows recovery codes.
  function setupTotp(el, onDone, onCancel) {
    api('account/totp-setup', {}).then(function (r) {
      if (!r.ok) { el.innerHTML = '<p class="error" role="alert">' + esc(message(r.data)) + '</p>'; return; }
      el.innerHTML = '<h3 tabindex="-1" id="totp-h">Set up an authenticator app</h3>' +
        '<p>In an authenticator app (for example Google Authenticator, Microsoft Authenticator, Authy, or the one in your password manager), add an account by entering a setup key. Choose "time-based", and paste this key:</p>' +
        '<p class="setupkey" id="totp-key">' + esc(group(r.data.secret)) + '</p>' +
        '<details><summary>Or use the setup address</summary><p>Some apps accept this address instead:</p><input type="text" readonly class="mono" id="totp-uri" value="' + esc(r.data.uri) + '" style="width:100%" aria-label="Setup address"></details>' +
        '<form id="totp-form" class="form-narrow"><label>Then type the 6-digit code the app shows<input type="text" id="totp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]*"></label>' +
        '<p class="error statusline" id="totp-err" role="alert"></p><div class="row"><button type="submit">Turn on</button>' + (onCancel ? '<button type="button" class="secondary" id="totp-cancel">Cancel</button>' : '') + '</div></form><div id="totp-codes"></div>';
      document.getElementById('totp-h').focus();
      if (onCancel) document.getElementById('totp-cancel').addEventListener('click', onCancel);
      document.getElementById('totp-form').addEventListener('submit', function (e) {
        e.preventDefault();
        api('account/totp-enable', { code: document.getElementById('totp-code').value }).then(function (x) {
          if (!x.ok) { document.getElementById('totp-err').textContent = message(x.data); return; }
          document.getElementById('totp-form').hidden = true;
          showCodes(document.getElementById('totp-codes'), x.data.recoveryCodes, onDone);
        });
      });
    });
  }
  window.LabAuth = { esc: esc, getSession: getSession, setSession: setSession, api: api, message: message, setupTotp: setupTotp, showCodes: showCodes, copy: copy };
})();
