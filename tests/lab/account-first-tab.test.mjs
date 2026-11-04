// The account page (static/lab/account/index.html + engine/account.js): the skip link is the first Tab stop in both the
// signed-out and signed-in states, nothing takes focus on page load, there is one h1 and main#main is the skip target.
// Moving focus is kept only after a researcher's own action (turning the authenticator off). Session and API are stubbed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const STATIC = fileURLToPath(new URL('../../static', import.meta.url));
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(10); }
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
const me = { email: 'r@example.edu', name: 'R', labOwner: false, expiresAt: Date.now() + 3600e3, passwordChangedAt: 0, totp: true, recoveryRemaining: 5, studies: [] };

async function open(signedIn) {
  const page = readFileSync(STATIC + '/lab/account/index.html', 'utf8');
  const html = page.replace(/<script src="[^"]*"><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/lab/account/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (signedIn) window.sessionStorage.setItem('lab_session', JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3, email: me.email }));
  let meCalls = 0;
  window.fetch = async u => {
    const route = String(u).split('/_lab/')[1];
    if (route === 'account/me') { meCalls++; return { ok: true, status: 200, json: async () => ({ ...me, totp: meCalls === 1 }) }; }
    if (route === 'account/totp-disable') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.confirm = () => true;
  for (const f of ['auth.js', 'account.js']) window.eval(readFileSync(STATIC + '/lab/engine/' + f, 'utf8'));
  if (signedIn) await until(() => window.document.getElementById('nameform'), 'the signed-in view');
  else await until(() => /not signed in/.test(window.document.body.textContent), 'the signed-out view');
  return window;
}

for (const signedIn of [false, true]) {
  const label = signedIn ? 'signed in' : 'signed out';
  const { document: doc } = await open(signedIn);
  const first = doc.querySelector(FOCUSABLE);
  assert(first && first.classList.contains('skip') && first.getAttribute('href') === '#main', `${label}: the skip link is the first focusable element`);
  assert.equal(doc.activeElement, doc.body, `${label}: nothing takes focus on load`);
  assert.equal(doc.querySelectorAll('h1').length, 1, `${label}: one h1`);
  const main = doc.querySelectorAll('main#main');
  assert.equal(main.length, 1, `${label}: one main#main`);
  assert.equal(doc.querySelectorAll('[autofocus]').length, 0, `${label}: no autofocus`);
}
console.log('account page: skip link first, nothing focused on load, one h1, main#main (signed out and signed in)');

// An action still moves focus: turning the authenticator off re-renders and lands on the heading.
const w = await open(true), d = w.document;
d.getElementById('totpoff').click();
await until(() => d.activeElement && d.activeElement.id === 'h', 'focus on the heading after the action');
assert.equal(d.querySelectorAll('h1').length, 1, 'one h1 after the action');
console.log('account page: focus moves to the heading only after the researcher turns the authenticator off');
