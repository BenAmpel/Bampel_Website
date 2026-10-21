// Regression tests for the security review of the researcher accounts: link takeover, stale reset links, lockout design,
// parallel requests, removed-and-reinvited accounts, recovery-code hashing, and password-check limits.
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as acc from '../../netlify/lib/lab/accounts.mjs';
import { runBackup, REGISTRY_PREFIXES, REGISTRY_MUTABLE } from '../../netlify/lib/lab/backup.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { memStore } from './memstore.mjs';

const OWNER = 'owner-key-0123456789abcdef', T0 = 1_800_000_000_000, L = '/api/lab/_lab/';
let NOW = T0;
function harness({ latency = 0 } = {}) {
  const stores = new Map();
  const getStore = ({ name }) => {
    if (!stores.has(name)) stores.set(name, memStore({ name, latency }));
    const m = stores.get(name);
    return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
      delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
      getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } };
  };
  const call = async (path, { body, key, token, ip } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (key) headers['x-admin-key'] = key; if (token) headers.authorization = 'Bearer ' + token; if (ip) headers['x-nf-client-connection-ip'] = ip;
    const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER }, now: () => NOW });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  return { stores, call, reg: () => stores.get('lab-registry') };
}
const ok = r => { assert(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r.json; };
const tokenOf = link => link.path.split('=')[1];
const invite = async (R, name, email, extra = {}) => ok(await R.call(L + 'researchers/invite', { key: OWNER, body: { name, email, ...extra } }));
const accept = (R, link, pw, name = 'X') => R.call(L + 'auth/accept', { body: { token: tokenOf(link), name, password: pw, password2: pw } });
const signin = (R, email, password, more = {}) => R.call(L + 'auth/signin', { body: { email, password }, ...more });
const idOf = email => acc.accountId(email);

// ---------- 1. an old invitation cannot take over an active account (owner accounts and authenticator accounts included) ----------
{
  const R = harness(), pw = 'owner passphrase for the lab 11', evil = 'attacker chose this passphrase 22';
  const i1 = await invite(R, 'Dr Boss', 'boss@x.edu', { labOwner: true });
  const i2 = ok(await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id: idOf('boss@x.edu') } }));   // a newer invitation replaces the first
  assert.equal((await accept(R, i1.link, evil)).json.error, 'invalid_link', 'the older invitation no longer works');
  assert.equal((await R.call(L + 'auth/link-info', { body: { token: tokenOf(i1.link) } })).json.error, 'invalid_link');
  ok(await accept(R, i2.link, pw));
  const sess = ok(await signin(R, 'boss@x.edu', pw)).token;
  // turn on an authenticator
  const setup = ok(await R.call(L + 'account/totp-setup', { token: sess, body: {} }));
  const key = acc.base32Decode(setup.secret);
  ok(await R.call(L + 'account/totp-enable', { token: sess, body: { code: acc.totpAt(key, NOW, 6) } }));
  // the first invitation is still unused: it must not reset the password, end sessions, or give a session
  for (const link of [i1.link, i2.link]) {
    const r = await accept(R, link, evil);
    assert.equal(r.status, 400, 'an invitation cannot be redeemed once the account has a password'); assert(!r.json.token);
  }
  assert.equal((await R.call('/api/lab/verification/admin/me', { token: sess })).status, 200, 'the owner is still signed in');
  assert.equal((await signin(R, 'boss@x.edu', evil)).status, 401, 'the attacker password was not set');
  NOW += 30000; assert.equal((await signin(R, 'boss@x.edu', pw)).json.error, 'code_required', 'the real password still needs the authenticator code');
  // a valid reset link sets the password but never returns a session, even for an account with an authenticator
  const rl = ok(await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id: idOf('boss@x.edu') } }));
  const done = ok(await accept(R, rl.link, 'new passphrase after the reset 33'));
  assert(!done.token && !done.expiresAt);
  assert.equal((await signin(R, 'boss@x.edu', 'new passphrase after the reset 33')).json.error, 'code_required');
  NOW = T0;
}
console.log('1: old invitations cannot take over an active or authenticator account; accepting a link never returns a session');

// ---------- 2. reset links die with a newer link, a password change, sign-out-everywhere ----------
{
  const R = harness(), pw = 'a long first passphrase 44', id = idOf('r@x.edu');
  const i = await invite(R, 'Rae', 'r@x.edu'); ok(await accept(R, i.link, pw, 'Rae'));
  const reset = async () => ok(await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id } })).link;
  const dead = async (link, why) => assert.equal((await accept(R, link, 'brand new passphrase 55')).json.error, 'invalid_link', why);
  const a = await reset(), b = await reset();
  await dead(a, 'a newer reset link replaces the older one'); assert.equal((await R.call(L + 'auth/link-info', { body: { token: tokenOf(b) } })).status, 200);
  const s = ok(await signin(R, 'r@x.edu', pw)).token;
  ok(await R.call(L + 'account/password', { token: s, body: { current: pw, next: 'changed passphrase here 66', next2: 'changed passphrase here 66' } }));
  await dead(b, 'a password change kills pending reset links');
  const c = await reset(); const s2 = ok(await signin(R, 'r@x.edu', 'changed passphrase here 66')).token;
  ok(await R.call(L + 'account/signout-all', { token: s2, body: {} }));
  await dead(c, 'sign out everywhere kills pending reset links');
  const d = await reset(); ok(await R.call(L + 'researchers/revoke', { key: OWNER, body: { id } })); await dead(d, 'revoking sessions kills pending reset links');
  const e = await reset(); ok(await accept(R, e, 'chosen after a valid reset 77')); assert.equal((await accept(R, e, 'brand new passphrase 55')).json.error, 'used_link');
}
console.log('2: reset links are single-use and die with newer links, password changes, and sign-out-everywhere');

// ---------- 3. lockout is per (email, address); a ceiling across addresses; failures are logged sparingly ----------
{
  const R = harness(), pw = 'victim has a long passphrase 88';
  const i = await invite(R, 'Vic', 'vic@x.edu'); ok(await accept(R, i.link, pw, 'Vic'));
  for (let n = 0; n < 12; n++) await signin(R, 'vic@x.edu', 'wrong wrong wrong', { ip: '198.51.100.1' });
  assert.equal((await signin(R, 'vic@x.edu', pw, { ip: '198.51.100.1' })).status, 429, 'the attacker\'s own address is locked');
  assert.equal((await signin(R, 'vic@x.edu', pw, { ip: '203.0.113.5' })).status, 200, 'the real user, from another address, is not locked out');
  assert.equal((await signin(R, 'vic@x.edu', pw)).status, 200, 'nor without an address (a different key from the attacker\'s)');
  // the audit log: one failure entry for the window, not one per attempt
  const fails = (await R.reg().list('audit/')).length && (await Promise.all((await R.reg().list('audit/')).map(k => R.reg().get(k)))).filter(a => a.action === 'signin.failure');
  assert.equal(fails.length, 1, `failures are logged once per 15 minutes, got ${fails.length}`);
  assert(/failed sign-in/.test(fails[0].detail));
  NOW += 16 * 60000;
  for (let n = 0; n < 3; n++) await signin(R, 'vic@x.edu', 'wrong wrong wrong', { ip: '198.51.100.1' });
  const again = (await Promise.all((await R.reg().list('audit/')).map(k => R.reg().get(k)))).filter(a => a.action === 'signin.failure');
  assert.equal(again.length, 2, 'one more entry in the next window');
  NOW = T0;
  // distributed guessing: many addresses, one email
  const saved = { ...acc.LIMITS }; acc.LIMITS.email = 20;
  for (let n = 0; n < 20; n++) await signin(R, 'vic@x.edu', 'guess number ' + n + ' wrong', { ip: `192.0.2.${n + 1}` });
  const spread = await signin(R, 'vic@x.edu', pw, { ip: '192.0.2.200' });
  assert.equal(spread.status, 429, 'the per-email ceiling across addresses holds');
  Object.assign(acc.LIMITS, saved);
  NOW += 16 * 60000; assert.equal((await signin(R, 'vic@x.edu', pw, { ip: '192.0.2.200' })).status, 200, 'and it expires');
  NOW = T0;
}
console.log('3: lockout per (email, address), ceiling across addresses, one audit entry per email per window');

// ---------- 4. parallel requests do not overrun limits or single-use keys ----------
for (const latency of [0, 2]) {
  const R = harness({ latency }), pw = 'parallel test long passphrase 99';
  const i = await invite(R, 'Pat', 'pat@x.edu'); ok(await accept(R, i.link, pw, 'Pat'));
  const rs = await Promise.all(Array.from({ length: 40 }, () => signin(R, 'pat@x.edu', 'wrong wrong wrong', { ip: '198.51.100.7' })));
  const checked = rs.filter(r => r.json.error === 'bad_credentials').length;
  assert(checked <= acc.LIMITS.pair, `at most ${acc.LIMITS.pair} of 40 parallel guesses were checked, got ${checked} (latency ${latency})`);
  assert.equal(rs.filter(r => r.status === 429).length, 40 - checked);
  // a parallel burst with the right password and a wrong one: the limit still counts everything written first
  NOW += 16 * 60000;
  // the same authenticator step used in parallel: exactly one sign-in
  const sess = ok(await signin(R, 'pat@x.edu', pw)).token;
  const setup = ok(await R.call(L + 'account/totp-setup', { token: sess, body: {} })), key = acc.base32Decode(setup.secret);
  ok(await R.call(L + 'account/totp-enable', { token: sess, body: { code: acc.totpAt(key, NOW, 6) } }));
  NOW += 30000 * 3;
  const code = acc.totpAt(key, NOW, 6);
  const par = await Promise.all(Array.from({ length: 6 }, () => R.call(L + 'auth/signin', { body: { email: 'pat@x.edu', password: pw, code } })));
  assert.equal(par.filter(r => r.status === 200).length, 1, `one authenticator step, six parallel sign-ins: one succeeds (latency ${latency})`);
  NOW = T0;
}
console.log('4: parallel guesses are capped by write-first attempt keys; one TOTP step is accepted once');

// ---------- 5. remove and invite again: nothing from the old account comes back ----------
{
  const R = harness(), pw = 'first incarnation passphrase 12', id = idOf('z@x.edu');
  const i1 = await invite(R, 'Zed', 'z@x.edu'); ok(await accept(R, i1.link, pw, 'Zed'));
  const old = ok(await signin(R, 'z@x.edu', pw)).token;
  const pending = ok(await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id } })).link;
  const unusedInvite = (await invite(R, 'Zed', 'zz@x.edu')).link;   // an unrelated pending invitation stays valid
  ok(await R.call(L + 'researchers/remove', { key: OWNER, body: { id } }));
  const i2 = await invite(R, 'Zed Again', 'z@x.edu');
  assert.equal((await R.call(L + 'account/me', { token: old })).status, 401, 'an old session does not work for the new account');
  assert.equal((await accept(R, pending, 'attacker passphrase after remove 1')).json.error, 'invalid_link', 'an old reset link does not work');
  assert.equal((await accept(R, i1.link, 'attacker passphrase after remove 2')).json.error, 'used_link');
  ok(await accept(R, i2.link, 'second incarnation passphrase 34', 'Zed Again'));
  assert.equal((await R.call(L + 'account/me', { token: old })).status, 401, 'still refused once the new account is active');
  assert.equal((await signin(R, 'z@x.edu', pw)).status, 401, 'the old password is gone');
  assert.equal(ok(await accept(R, unusedInvite, 'unrelated invitation works 56', 'ZZ')).email, 'zz@x.edu');
}
console.log('5: a removed and re-invited account does not inherit old tokens or links');

// ---------- 6. recovery codes: keyed hashes, unbiased generation ----------
{
  const R = harness(), pw = 'recovery code test passphrase 7';
  const i = await invite(R, 'Rec', 'rec@x.edu'); ok(await accept(R, i.link, pw, 'Rec'));
  const sess = ok(await signin(R, 'rec@x.edu', pw)).token;
  const setup = ok(await R.call(L + 'account/totp-setup', { token: sess, body: {} }));
  const codes = ok(await R.call(L + 'account/totp-enable', { token: sess, body: { code: acc.totpAt(acc.base32Decode(setup.secret), NOW, 6) } })).recoveryCodes;
  const rec = R.reg().m.get('accounts/' + idOf('rec@x.edu')).v.recovery, sha = c => acc.sha(c.replace('-', '')), plain = c => acc.sha('recovery|' + c.replace('-', ''));
  for (const c of codes) for (const h of [acc.sha(c), sha(c), plain(c)]) assert(!rec.includes(h), 'stored recovery hashes are not bare hashes of the code');
  assert(R.reg().m.has('meta/recovery-key'));
  assert.notEqual(await acc.recoveryHash(R.reg(), idOf('rec@x.edu'), codes[0]), await acc.recoveryHash(R.reg(), idOf('other@x.edu'), codes[0]));
  const src = readFileSync(fileURLToPath(new URL('../../netlify/lib/lab/accounts.mjs', import.meta.url)), 'utf8').replace(/\/\/.*$/gm, '');
  assert(!/randomBytes\([^)]*\)[^;]*%/.test(src) && !/%\s*RC_ALPHABET/.test(src), 'no modulo on random bytes (CodeQL js/biased-cryptographic-random)');
  assert(/randomInt\(RC_ALPHABET\.length\)/.test(src));
  const many = acc.newRecoveryCodes(2000).join('').replace(/-/g, ''), count = {};
  for (const ch of many) count[ch] = (count[ch] || 0) + 1;
  assert.equal(Object.keys(count).length, 31); const exp = many.length / 31;
  assert(Object.values(count).every(n => n > exp * 0.85 && n < exp * 1.15), 'characters are evenly distributed');
}
console.log('6: recovery codes are keyed hashes and generated without modulo bias');

// ---------- 7. password re-checks in account settings are limited; accounts are in a backup ----------
{
  const R = harness(), pw = 'settings limit test passphrase 3';
  const i = await invite(R, 'Sue', 'sue@x.edu'); ok(await accept(R, i.link, pw, 'Sue'));
  const sess = ok(await signin(R, 'sue@x.edu', pw)).token;
  const setup = ok(await R.call(L + 'account/totp-setup', { token: sess, body: {} }));
  ok(await R.call(L + 'account/totp-enable', { token: sess, body: { code: acc.totpAt(acc.base32Decode(setup.secret), NOW, 6) } }));
  const tries = [];
  for (let n = 0; n < 12; n++) tries.push((await R.call(L + [ 'account/password', 'account/totp-disable', 'account/recovery'][n % 3], { token: sess, body: { current: 'guess' + n, password: 'guess' + n, next: 'x', next2: 'x' } })).json.error);
  assert.equal(tries.filter(e => e === 'wrong_password').length, 10, 'ten guesses are checked');
  assert(tries.slice(10).every(e => e === 'locked'), 'then the account\'s password checks are locked: ' + tries);
  assert.equal((await R.call(L + 'account/totp-disable', { token: sess, body: { password: pw } })).json.error, 'locked', 'even the right password, until the window passes');
  NOW += 16 * 60000; ok(await R.call(L + 'account/totp-disable', { token: sess, body: { password: pw } })); NOW = T0;

  // the registry backup holds accounts (hashes and all) and the recovery key, but not the session secret, links, or counters
  const back = memStore();
  await runBackup(R.reg(), back, { prefixes: REGISTRY_PREFIXES, mutable: REGISTRY_MUTABLE });
  const keys = await back.list('m/');
  assert(keys.includes('m/accounts/' + idOf('sue@x.edu')) && keys.includes('m/meta/recovery-key'));
  assert((await back.get('m/accounts/' + idOf('sue@x.edu'))).pwHash);
  assert(!keys.some(k => /session-secret|invites|signin-|pw-try|revoked|totp-used/.test(k)), 'disposable keys are not copied');
  assert(R.reg().m.has('meta/session-secret'));
  const src = readFileSync(fileURLToPath(new URL('../../netlify/functions/lab-backup.mjs', import.meta.url)), 'utf8');
  assert(/lab-registry-backup/.test(src) && /REGISTRY_PREFIXES/.test(src), 'the hourly function backs up the registry');
}
console.log('7: password re-checks are limited per account; the registry is in the backup');
console.log('accounts-security: all checks passed');
