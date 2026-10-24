// Security headers: the lab's local server sends what production sends for each page, read from netlify.toml
// (scripts/lab/headers.mjs), and the lab blocks there allow the microphone for this site while keeping a full
// Content-Security-Policy (frame-ancestors 'none', object-src 'none', scripts from this site only).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { labServer } from '../../scripts/lab/server.mjs';
import { parseHeaderRules, headersFor, productionRules } from '../../scripts/lab/headers.mjs';
import { memBlobs } from './memstore.mjs';

// ---------- parsing and combining, as Netlify does ----------
const rules = parseHeaderRules(`
[[headers]]
  for = "/*"   # everything
  [headers.values]
    X-Frame-Options = "DENY"
    Content-Security-Policy = "default-src 'self'"
[[headers]]
  for = "/lab/s/*"
  [headers.values]
    Content-Security-Policy = "frame-ancestors 'none'"
[[headers]]
  for = "/lab/studies/*/admin.html"
  [headers.values]
    Cache-Control = "no-store"
[[redirects]]
  from = "/x"
  to = "/y"
`);
assert.deepEqual(rules.map(r => r.for), ['/*', '/lab/s/*', '/lab/studies/*/admin.html']);
assert.equal(headersFor(rules, '/lab/s/abc', {})['Content-Security-Policy'], "frame-ancestors 'none'", 'a later block replaces the value');
assert.equal(headersFor(rules, '/lab/s/', {})['Content-Security-Policy'], "frame-ancestors 'none'", '* matches nothing too');
assert.equal(headersFor(rules, '/lab/', {})['Content-Security-Policy'], "default-src 'self'");
assert.equal(headersFor(rules, '/lab/studies/v/admin.html', {})['Cache-Control'], 'no-store', 'a * in the middle of a path');
assert.equal(headersFor(rules, '/lab/studies/v/index.html', {})['Cache-Control'], undefined);

// ---------- the real netlify.toml ----------
const prod = productionRules();
const csp = path => headersFor(prod, path)['Content-Security-Policy'] || '', pp = path => headersFor(prod, path)['Permissions-Policy'] || '';
const directives = s => Object.fromEntries(s.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(([k, ...v]) => [k, v]));
const LAB_PAGES = ['/lab/s/some-study', '/lab/s/', '/lab/studies/verification/', '/lab/studies/verification/admin.html', '/lab/admin/', '/lab/admin/some-study', '/lab/timing/'];
for (const p of [...LAB_PAGES, '/lab/signin/', '/lab/account/']) {
  const d = directives(csp(p));
  assert.deepEqual(d['frame-ancestors'], ["'none'"], `${p}: never framed`);
  assert.deepEqual(d['object-src'], ["'none'"], `${p}: no plugins`);
  assert.deepEqual(d['script-src'], ["'self'"], `${p}: scripts from this site only, none inline`);
  assert.deepEqual(d['base-uri'], ["'self'"], p); assert.deepEqual(d['form-action'], ["'self'"], p);
  assert.equal(headersFor(prod, p)['X-Robots-Tag'], 'noindex', p);
}
for (const p of LAB_PAGES) {
  assert(/(^|,\s*)microphone=\(self\)/.test(pp(p)), `${p}: microphone allowed for this site: ${pp(p)}`);
  assert(/autoplay=\(self\)/.test(pp(p)) && /fullscreen=\(self\)/.test(pp(p)) && /camera=\(\)/.test(pp(p)) && /geolocation=\(\)/.test(pp(p)), `${p}: ${pp(p)}`);
}
assert(/connect-src 'self' https:/.test(csp('/lab/s/x')), 'participant pages may preload media from other https sites');
assert(/connect-src 'self';/.test(csp('/lab/admin/')) && /connect-src 'self';/.test(csp('/lab/studies/verification/admin.html')), 'admin pages talk to this site only');
assert(/microphone=\(\)/.test(pp('/')) && /microphone=\(\)/.test(pp('/lab/signin/')), 'the rest of the site keeps the microphone off');
// No page runs inline script (2026-10-24): every script is a file, so no script-src may allow 'unsafe-inline'.
for (const p of ['/', '/cv/', '/ccair/', '/ccair/pathways/', '/lab/', '/lab/studies/demo-phishing/index.html']) {
  const scriptSrc = (csp(p).match(/script-src [^;]+/) || [''])[0];
  assert(scriptSrc && !scriptSrc.includes("'unsafe-inline'"), `${p}: script-src allows inline script: ${scriptSrc}`);
}
// The Wowchemy plugin's own Permissions-Policy (config/_default/params.yaml) matches the lab blocks, so it never blocks the microphone.
const params = readFileSync(new URL('../../config/_default/params.yaml', import.meta.url), 'utf8');
assert.equal((params.match(/^\s+policy:\s*'([^']+)'/m) || [])[1], pp('/lab/s/x'), 'params.yaml security.permissions.policy = the lab policy in netlify.toml');

// ---------- the local server sends them ----------
const server = labServer({ getStore: memBlobs(), env: { LAB_ADMIN_KEY: 'local-owner-key-0123456789' } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const p of ['/lab/s/some-study', '/lab/admin/', '/lab/timing/', '/lab/studies/verification/']) {
    const res = await fetch(base + p); await res.arrayBuffer();
    assert.equal(res.status, 200, p);
    assert(/(^|,\s*)microphone=\(self\)/.test(res.headers.get('permissions-policy') || ''), `${p} sends a Permissions-Policy allowing the microphone: ${res.headers.get('permissions-policy')}`);
    const c = res.headers.get('content-security-policy') || '';
    assert(c.includes("frame-ancestors 'none'") && c.includes("object-src 'none'"), `${p} CSP: ${c}`);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', p);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', p);
  }
  const si = await fetch(base + '/lab/signin/'); await si.arrayBuffer();
  assert(/microphone=\(\)/.test(si.headers.get('permissions-policy')) && si.headers.get('referrer-policy') === 'no-referrer', 'sign-in keeps the microphone off and sends no referrer');
  const js = await fetch(base + '/lab/engine/participant.js'); await js.arrayBuffer();
  assert.equal(js.headers.get('cache-control'), 'no-store', 'the dev server still never caches');
  const api = await fetch(base + '/api/lab/_lab/studies'); await api.arrayBuffer();
  assert.equal(api.headers.get('content-security-policy'), null, 'API answers are not pages (Netlify does not add page headers to functions)');
} finally { server.close(); }

console.log('security headers: netlify.toml lab blocks (full CSP, microphone for this site), dev server sends the same');
