// Researcher accounts: password hashing, authenticator codes (RFC 6238), invitation links, sign-in and lockout,
// bearer sessions and their roles, and the rule that participant and researcher tokens never work in each other's place.
// Everything runs on in-memory stores through the HTTP router.
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as acc from '../../netlify/lib/lab/accounts.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
import { createHash } from 'node:crypto';

const OWNER = 'owner-key-0123456789abcdef';
const T0 = 1_800_000_000_000;
let NOW = T0;
const PW = 'correct horse battery staple';
const secrets = [];   // every password and code we ever send; none may appear in a response or in the audit log

function harness({ latency = 0 } = {}) {
  const stores = new Map(), responses = [];
  const getStore = ({ name }) => {
    if (!stores.has(name)) stores.set(name, memStore({ name, latency }));
    const m = stores.get(name);
    return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
      delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
      getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } };
  };
  const call = async (path, { body, key, token, ip, method } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (key) headers['x-admin-key'] = key;
    if (token) headers.authorization = 'Bearer ' + token;
    if (ip) headers['x-nf-client-connection-ip'] = ip;
    const res = await handle(new Request('https://bampel.test' + path, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER }, now: () => NOW });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    responses.push(text);
    return { status: res.status, json, text };
  };
  return { stores, call, responses, reg: () => stores.get('lab-registry') };
}
const L = '/api/lab/_lab/';
const ok = r => { assert(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r.json; };
const tokenOf = link => link.path.split('=')[1];
// accepting a link sets the password and returns no session; the person then signs in
const signup = async (c, link, name, pw) => { const r = ok(await c(L + 'auth/accept', { body: { token: tokenOf(link), name, password: pw, password2: pw } })); assert(!r.token && !r.expiresAt, 'accepting a link never returns a session'); return ok(await c(L + 'auth/signin', { body: { email: r.email, password: pw } })).token; };

// ---------- hashing ----------
{
  const t = Date.now();
  const h = await acc.hashPassword(PW), took = Date.now() - t;
  assert(took < 1000, `one scrypt hash took ${took} ms`);
  assert.equal(h.pwParams.alg, 'scrypt'); assert(h.pwParams.N >= 32768 && h.pwParams.r === 8);
  assert(await acc.verifyPassword(PW, h)); assert(!(await acc.verifyPassword(PW + 'x', h))); assert(!(await acc.verifyPassword('', h)));
  const h2 = await acc.hashPassword(PW);
  assert.notEqual(h.pwSalt, h2.pwSalt); assert.notEqual(h.pwHash, h2.pwHash, 'a fresh salt per account');
  assert(!(await acc.verifyPassword(PW, { ...h, pwHash: null })));
  const o = { email: 'ann.lee@example.edu', name: 'Ann Lee' };
  assert(acc.passwordProblem('short1', o)); assert(acc.passwordProblem('password1234', o)); assert(acc.passwordProblem('aaaaaaaaaaaaaaaa', o));
  assert(acc.passwordProblem('xx ann.lee@example.edu xx', o), 'contains the email'); assert(acc.passwordProblem('myannleepassword', o), 'contains the name'); assert(acc.passwordProblem('ann.lee-2026-ok', o), 'contains the first part of the email');
  assert.equal(acc.passwordProblem(PW, o), null);
  assert(acc.passwordProblem('x'.repeat(201), o));
  console.log(`scrypt: hash ${took} ms, salted, verifies; password rules`);
}

// ---------- TOTP, RFC 6238 appendix B (SHA-1; the secret is the ASCII string 12345678901234567890) ----------
{
  const key = Buffer.from('12345678901234567890');
  for (const [t, code8] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) {
    assert.equal(acc.totpAt(key, t * 1000, 8), code8, `T=${t}`);
    assert.equal(acc.totpAt(key, t * 1000, 6), code8.slice(2), `T=${t} (6 digits)`);
  }
  const b32 = acc.base32Encode(key); assert.equal(b32, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'); assert.deepEqual(acc.base32Decode(b32), key);
  assert.deepEqual(acc.base32Decode('gezd gnbv-GY3T QOJQ GEZDGNBVGY3TQOJQ'), key);
  assert.equal(acc.base32Decode('1!'), null);
  const at = 1111111109000;
  assert.equal(acc.totpMatch(b32, '081804', at), Math.floor(at / 30000));
  assert.equal(acc.totpMatch(b32, '081804', at + 30000), Math.floor(at / 30000), 'one step late is accepted');
  assert.equal(acc.totpMatch(b32, '081804', at - 30000), Math.floor(at / 30000), 'one step early is accepted');
  assert.equal(acc.totpMatch(b32, '081804', at + 60000 + 1), null, 'two steps away is refused');
  assert.equal(acc.totpMatch(b32, '08180', at), null); assert.equal(acc.totpMatch(b32, 'abcdef', at), null);
  assert.match(acc.otpauthUri('ABCD', 'a@b.edu'), /^otpauth:\/\/totp\/CCAIR%20Behavioral%20Lab:a%40b\.edu\?secret=ABCD&issuer=CCAIR%20Behavioral%20Lab&algorithm=SHA1&digits=6&period=30$/);
  const codes = acc.newRecoveryCodes(); assert.equal(codes.length, 8); assert.equal(new Set(codes).size, 8); assert(codes.every(c => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c)));
  { const m = memStore(), a = await acc.recoveryHash(m, 'id1', 'ABCDE-fghjk', true);
    assert.equal(a, await acc.recoveryHash(m, 'id1', 'abcdefghjk'), 'recovery codes ignore case and the dash');
    assert.notEqual(a, await acc.recoveryHash(m, 'id2', 'abcdefghjk'), 'the hash depends on the account');
    assert.notEqual(a, createHash('sha256').update('abcdefghjk').digest('hex'), 'not a bare hash'); }
  console.log('TOTP: RFC 6238 vectors, base32, window of one step, recovery code format');
}

// ---------- invitations, sessions, roles ----------
const H = harness(), { call } = H;
ok(await call(L + 'create', { key: OWNER, body: { id: 'phish-pilot', name: 'Phishing pilot', type: 'vignettes' } }));
assert.equal((await call(L + 'researchers/invite', { body: { name: 'A', email: 'a@x.edu' } })).status, 403, 'no credentials');
assert.equal((await call(L + 'researchers/invite', { key: 'wrong-key-0123456789abcdef', body: { name: 'A', email: 'a@x.edu' } })).status, 403);
assert.equal((await call(L + 'researchers/invite', { key: OWNER, body: { name: 'A', email: 'not-an-email' } })).json.error, 'bad_email');
assert.equal((await call(L + 'researchers/invite', { key: OWNER, body: { name: 'A', email: 'a@x.edu', studyRoles: { nope: 'viewer' } } })).json.error, 'bad_study');
assert.equal((await call(L + 'researchers/invite', { key: OWNER, body: { name: 'A', email: 'a@x.edu', studyRoles: { verification: 'god' } } })).json.error, 'bad_role');

const inv = ok(await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Ann Lee', email: ' Ann.Lee@Example.edu ', studyRoles: { verification: 'viewer', 'phish-pilot': 'editor' } } }));
assert.match(inv.link.path, /^\/lab\/signin\/#invite=vci_[A-Za-z0-9_-]{43}$/);
assert.equal(inv.link.expiresAt, NOW + 7 * 86400000);
const annToken = tokenOf(inv.link), annId = acc.accountId('ann.lee@example.edu');
assert.equal(inv.account.email, 'ann.lee@example.edu'); assert.equal(inv.account.status, 'invited');
{ // only the hash of the link is stored
  const dump = JSON.stringify([...H.reg().m.entries()]);
  assert(!dump.includes(annToken), 'the invitation token itself is never stored');
  assert(H.reg().m.has('invites/' + acc.sha(annToken)));
}
assert.equal((await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: PW } })).json.error, 'bad_credentials', 'an invited account cannot sign in yet');
ok(await call(L + 'auth/link-info', { body: { token: annToken } }));
assert.equal((await call(L + 'auth/link-info', { body: { token: 'vci_' + 'a'.repeat(43) } })).json.error, 'invalid_link');
assert.equal((await call(L + 'auth/link-info', { body: { token: 'garbage' } })).json.error, 'invalid_link');
// a bad password does not use up the link
assert.equal((await call(L + 'auth/accept', { body: { token: annToken, name: 'Ann Lee', password: 'password1234', password2: 'password1234' } })).json.error, 'weak_password');
assert.equal((await call(L + 'auth/accept', { body: { token: annToken, name: 'Ann Lee', password: PW, password2: PW + '!' } })).json.error, 'mismatch');
secrets.push(PW, 'password1234');
const acc1 = ok(await call(L + 'auth/accept', { body: { token: annToken, name: 'Ann Lee', password: PW, password2: PW } }));
assert.equal(acc1.kind, 'invite'); assert(!acc1.token && !acc1.expiresAt, 'accepting a link never returns a session');
assert.equal((await call(L + 'auth/accept', { body: { token: annToken, name: 'Ann Lee', password: PW, password2: PW } })).json.error, 'used_link', 'a link works once');
assert.equal((await call(L + 'auth/link-info', { body: { token: annToken } })).json.error, 'used_link');
assert.equal((await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Ann', email: 'ann.lee@example.edu' } })).json.error, 'exists');
console.log('invitation: one-time link, hash only stored, weak password does not burn it, name and email normalized');

// concurrent redemption of one link: exactly one wins, even with slow storage that interleaves requests
for (const latency of [0, 3]) {
  const R = harness({ latency });
  ok(await R.call(L + 'create', { key: OWNER, body: { id: 'phish-pilot', name: 'P', type: 'vignettes' } }));
  const i2 = ok(await R.call(L + 'researchers/invite', { key: OWNER, body: { name: 'Bob', email: 'bob@x.edu', studyRoles: { verification: 'viewer' } } }));
  const tk = tokenOf(i2.link), pws = Array.from({ length: 6 }, (_, i) => `racing password number ${i}`);
  const rs = await Promise.all(pws.map(p => R.call(L + 'auth/accept', { body: { token: tk, name: 'Bob', password: p, password2: p } })));
  assert.equal(rs.filter(r => r.status === 200).length, 1, `exactly one redemption wins (latency ${latency}): ${rs.map(r => r.status)}`);
  assert(rs.filter(r => r.status !== 200).every(r => r.json.error === 'used_link'));
  const winner = pws.find((p, i) => rs[i].status === 200);
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'bob@x.edu', password: winner } })).status, 200, 'the winning password is the one that was set');
  for (const p of pws.filter(p => p !== winner)) assert.equal((await R.call(L + 'auth/signin', { body: { email: 'bob@x.edu', password: p } })).status, 401);
}
console.log('invitation single use under concurrent redemption (fast and slow storage)');

// expiry
{
  const e = ok(await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Eve', email: 'eve@x.edu' } })), et = tokenOf(e.link);
  NOW += 7 * 86400000 - 1000; assert.equal((await call(L + 'auth/link-info', { body: { token: et } })).status, 200, 'still valid just before 7 days');
  NOW += 2000; assert.equal((await call(L + 'auth/link-info', { body: { token: et } })).json.error, 'expired_link', 'expired after 7 days');
  assert.equal((await call(L + 'auth/accept', { body: { token: et, name: 'Eve', password: PW, password2: PW } })).json.error, 'expired_link');
  NOW = T0;
}
console.log('invitation expiry at 7 days');

// ---------- sign-in ----------
const wrongPw = await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: 'definitely not it' } });
const unknown = await call(L + 'auth/signin', { body: { email: 'nobody@example.edu', password: 'definitely not it' } });
assert.equal(wrongPw.status, 401); assert.equal(unknown.status, 401);
assert.equal(wrongPw.text, unknown.text, 'unknown email and wrong password give the same response');
const t1 = Date.now(); await call(L + 'auth/signin', { body: { email: 'nobody2@example.edu', password: 'x'.repeat(14) } }); const unknownMs = Date.now() - t1;
const t2 = Date.now(); await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: 'y'.repeat(14) } }); const wrongMs = Date.now() - t2;
assert(unknownMs > 5 && Math.abs(unknownMs - wrongMs) < Math.max(80, wrongMs), `unknown email does the same hashing work (${unknownMs} ms vs ${wrongMs} ms)`);
assert.equal((await call(L + 'auth/signin', { body: { email: '', password: '' } })).text, wrongPw.text);
const si = ok(await call(L + 'auth/signin', { body: { email: 'ANN.LEE@example.edu', password: PW } }));
let ann = si.token;
assert.equal(si.account.email, 'ann.lee@example.edu'); assert(!('pwHash' in si.account));
console.log('sign-in: identical answer for unknown email and wrong password, similar time');

// per-study roles through the bearer token
{
  const me = ok(await call('/api/lab/verification/admin/me', { token: ann }));
  assert.equal(me.role, 'viewer'); assert.equal(me.name, 'Ann Lee');
  ok(await call('/api/lab/verification/admin/participants', { token: ann }));
  assert.equal((await call('/api/lab/verification/admin/team', { token: ann })).status, 403, 'viewer cannot list the team');
  assert.equal((await call('/api/lab/verification/admin/roster', { token: ann, body: { emails: 'a@b.edu' } })).status, 403, 'viewer cannot add students');
  assert.equal((await call('/api/lab/phish-pilot/admin/me', { token: ann })).json.role, 'editor');
  assert.equal((await call('/api/lab/phish-pilot/admin/roster', { token: ann, body: { emails: 'a@b.edu' } })).json.error, 'not_allowed', 'editor is below manager');
  const saved = ok(await call('/api/lab/phish-pilot/admin/content', { token: ann }));
  ok(await call('/api/lab/phish-pilot/admin/content-save', { token: ann, body: { content: saved, baseVersion: saved.version, note: 'by account' } }));
  assert.equal((await call('/api/lab/data-quality/admin/me', { token: ann })).status, 403, 'no role in this study');
  assert.equal((await call('/api/lab/_lab/create', { token: ann, body: { id: 'sneaky', name: 'x', type: 'vignettes' } })).status, 403, 'a researcher cannot create studies');
  assert.equal((await call(L + 'researchers', { token: ann })).status, 403);
  assert.equal((await call(L + 'types', { token: ann })).status, 403);
  const mine = ok(await call(L + 'mystudies', { token: ann }));
  assert.deepEqual(mine.map(s => s.id).sort(), ['phish-pilot', 'verification']);
  assert.equal(mine.find(s => s.id === 'verification').role, 'viewer');
  assert.equal((await call(L + 'study-summary?id=data-quality', { token: ann })).status, 403);
  const sum = ok(await call(L + 'study-summary?id=verification', { token: ann }));
  assert.deepEqual(Object.keys(sum).sort(), ['lastActivityAt', 'real', 'test']);
  const act = ok(await call('/api/lab/phish-pilot/admin/activity', { key: OWNER }));
  assert(act.some(a => a.who === 'Ann Lee' && a.action === 'content.save' && a.role === 'editor'), 'the audit log names the account');
}
console.log('bearer sessions resolve per-study roles; non-owner researchers are kept out of owner routes');

// existing owner key and team keys are untouched
{
  assert.equal(ok(await call('/api/lab/verification/admin/me', { key: OWNER })).role, 'owner');
  const k = ok(await call('/api/lab/verification/admin/team-add', { key: OWNER, body: { name: 'RA', role: 'viewer' } })).key;
  assert.equal(ok(await call('/api/lab/verification/admin/me', { key: k })).role, 'viewer');
  assert.equal((await call('/api/lab/phish-pilot/admin/me', { key: k })).status, 403, 'a team key is for its own study');
  assert.equal(ok(await call(L + 'me', { key: OWNER })).role, 'owner');
  assert.equal((await call(L + 'me', { key: k })).status, 403);
  assert.equal((await call('/api/lab/verification/admin/participants', {})).status, 403);
  assert.equal(ok(await call('/api/lab/_lab/studies')).length >= 1, true, 'the public list still works without credentials');
  // with a bearer token present the key header is ignored, and an invalid bearer is refused even if a key is also sent
  assert.equal((await call('/api/lab/verification/admin/me', { key: OWNER, token: 'bogus-token-value-bogus' })).status, 401);
}
console.log('owner key and team keys still work, and are unaffected');

// ---------- lab owner account ----------
let boss;
{
  const i = ok(await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Dr Boss', email: 'boss@x.edu', labOwner: true } }));
  const bp = 'this passphrase is long enough 1'; secrets.push(bp);
  boss = await signup(call, i.link, 'Dr Boss', bp);
  assert.equal(ok(await call(L + 'me', { token: boss })).role, 'owner');
  assert.equal(ok(await call('/api/lab/verification/admin/me', { token: boss })).role, 'owner', 'a lab owner is owner of every study');
  assert.equal(ok(await call('/api/lab/data-quality/admin/team', { token: boss })).length, 0);
  ok(await call(L + 'researchers', { token: boss })); ok(await call(L + 'types', { token: boss }));
  ok(await call(L + 'create', { token: boss, body: { id: 'by-boss', name: 'Made by an account', type: 'vignettes' } }));
  assert.equal(ok(await call(L + 'mystudies', { token: boss })).length, ok(await call(L + 'studies', { key: OWNER })).length);
  assert.equal((await call(L + 'researchers/remove', { token: boss, body: { id: acc.accountId('boss@x.edu') } })).json.error, 'self');
  assert.equal((await call(L + 'researchers/update', { token: boss, body: { id: acc.accountId('boss@x.edu'), disabled: true } })).json.error, 'self');
}
console.log('lab owner account: owner everywhere, including the console; cannot disable or remove itself');

// ---------- roles are changed by the owner and take effect at once ----------
{
  ok(await call(L + 'researchers/update', { key: OWNER, body: { id: annId, studyRoles: { verification: 'manager' } } }));
  assert.equal(ok(await call('/api/lab/verification/admin/me', { token: ann })).role, 'manager');
  assert.equal((await call('/api/lab/phish-pilot/admin/me', { token: ann })).status, 403, 'role removed');
  const list = ok(await call(L + 'researchers', { key: OWNER }));
  assert(list.every(a => !('pwHash' in a) && !('pwSalt' in a) && !('totp' in a && typeof a.totp === 'object')), 'the list shows no secrets');
  ok(await call(L + 'researchers/update', { key: OWNER, body: { id: annId, studyRoles: { verification: 'viewer', 'phish-pilot': 'editor' } } }));
}

// ---------- sign out, sign out everywhere, password change ----------
{
  const s2 = ok(await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: PW } })).token;
  ok(await call(L + 'account/me', { token: s2 }));
  ok(await call(L + 'account/signout', { token: s2, body: {} }));
  assert.equal((await call(L + 'account/me', { token: s2 })).status, 401, 'a signed-out token is refused');
  assert.equal((await call('/api/lab/verification/admin/me', { token: s2 })).status, 401);
  ok(await call('/api/lab/verification/admin/me', { token: ann }));   // other sessions are untouched

  const s3 = ok(await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: PW } })).token;
  ok(await call(L + 'account/signout-all', { token: s3, body: {} }));
  for (const t of [ann, s3]) assert.equal((await call('/api/lab/verification/admin/me', { token: t })).status, 401, 'tokenEpoch moved: older tokens are refused');
  const s4 = ok(await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: PW } })).token;
  ok(await call('/api/lab/verification/admin/me', { token: s4 }));

  // change password: needs the current one, rules apply, other sessions end, this one continues
  const s5 = ok(await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: PW } })).token;
  const NEWPW = 'a brand new passphrase 77'; secrets.push(NEWPW, 'wrong current password');
  assert.equal((await call(L + 'account/password', { token: s5, body: { current: 'wrong current password', next: NEWPW, next2: NEWPW } })).json.error, 'wrong_password');
  assert.equal((await call(L + 'account/password', { token: s5, body: { current: PW, next: 'short', next2: 'short' } })).json.error, 'weak_password');
  assert.equal((await call(L + 'account/password', { token: s5, body: { current: PW, next: 'ann.lee@example.edu', next2: 'ann.lee@example.edu' } })).json.error, 'weak_password');
  const ch = ok(await call(L + 'account/password', { token: s5, body: { current: PW, next: NEWPW, next2: NEWPW } }));
  assert.equal((await call('/api/lab/verification/admin/me', { token: s4 })).status, 401, 'other sessions ended');
  assert.equal((await call('/api/lab/verification/admin/me', { token: s5 })).status, 401, 'the old token of this session ended too');
  ok(await call('/api/lab/verification/admin/me', { token: ch.token }));
  assert.equal((await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: PW } })).status, 401);
  ann = ok(await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: NEWPW } })).token;
  ok(await call(L + 'account/name', { token: ann, body: { name: 'Ann M. Lee' } }));
  assert.equal(ok(await call(L + 'account/me', { token: ann })).name, 'Ann M. Lee');
}
console.log('sign out, sign out everywhere (tokenEpoch), password change, rename');

// ---------- expiry of a session ----------
{
  NOW += 8 * 3600000 - 1000; ok(await call(L + 'account/me', { token: ann }));
  NOW += 2000; assert.equal((await call(L + 'account/me', { token: ann })).json.error, 'session_expired');
  NOW = T0; ann = ok(await call(L + 'auth/signin', { body: { email: 'ann.lee@example.edu', password: 'a brand new passphrase 77' } })).token;
}

// ---------- tampering ----------
{
  const [a, b, c] = ann.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b, 'base64url')), a: acc.accountId('boss@x.edu') })).toString('base64url');
  assert.equal((await call(L + 'account/me', { token: `${a}.${forged}.${c}` })).status, 401, 'a changed payload fails the signature');
  assert.equal((await call(L + 'account/me', { token: `${a}.${b}.${'A'.repeat(43)}` })).status, 401);
  assert.equal((await call(L + 'account/me', { token: `${a}.${b}` })).status, 401);
}

// ---------- authenticator and recovery codes ----------
{
  const R = harness();
  ok(await R.call(L + 'create', { key: OWNER, body: { id: 'phish-pilot', name: 'P', type: 'vignettes' } }));
  const i = ok(await R.call(L + 'researchers/invite', { key: OWNER, body: { name: 'Tia', email: 'tia@x.edu', studyRoles: { verification: 'viewer' } } }));
  const pw = 'tia likes a long passphrase 5'; secrets.push(pw);
  let tok = await signup(R.call, i.link, 'Tia', pw);
  assert.equal((await R.call(L + 'account/totp-enable', { token: tok, body: { code: '123456' } })).json.error, 'no_setup');
  const setup = ok(await R.call(L + 'account/totp-setup', { token: tok, body: {} }));
  assert.match(setup.secret, /^[A-Z2-7]{32}$/); assert(setup.uri.includes('secret=' + setup.secret) && setup.uri.startsWith('otpauth://totp/'));
  secrets.push(setup.secret);
  assert.equal((await R.call(L + 'account/totp-enable', { token: tok, body: { code: '000000' } })).json.error, 'bad_code', 'not on until a code is confirmed');
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'tia@x.edu', password: pw } })).status, 200, 'still no second step before it is confirmed');
  const key = acc.base32Decode(setup.secret), codeAt = ms => acc.totpAt(key, ms, 6);
  const en = ok(await R.call(L + 'account/totp-enable', { token: tok, body: { code: codeAt(NOW) } }));
  assert.equal(en.recoveryCodes.length, 8); secrets.push(...en.recoveryCodes);
  assert.equal((await R.call(L + 'account/totp-setup', { token: tok, body: {} })).json.error, 'already_enabled');
  // the account list shows that it is on, never the secret
  assert(!JSON.stringify(ok(await R.call(L + 'researchers', { key: OWNER }))).includes(setup.secret));
  assert(!JSON.stringify(ok(await R.call(L + 'account/me', { token: tok }))).includes(setup.secret));
  assert.equal(ok(await R.call(L + 'account/me', { token: tok })).recoveryRemaining, 8);

  // sign-in now needs a code
  const sub = { email: 'tia@x.edu', password: pw };
  assert.equal((await R.call(L + 'auth/signin', { body: sub })).json.error, 'code_required');
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: '000000' } })).json.error, 'bad_code');
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'tia@x.edu', password: 'wrong wrong wrong', code: codeAt(NOW) } })).json.error, 'bad_credentials', 'a right code does not rescue a wrong password');
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: codeAt(NOW) } })).json.error, 'bad_code', 'the step used to turn it on cannot be used again');
  NOW += 30000;
  const good = codeAt(NOW);
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: good } })).status, 200);
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: good } })).json.error, 'bad_code', 'a code works once');
  NOW += 90000; assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: codeAt(NOW - 30000) } })).status, 200, 'the previous step is still accepted (one step of drift)');
  NOW += 120000;

  // recovery codes: each works once, including under concurrent use
  const rc = en.recoveryCodes;
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: rc[0].toUpperCase() } })).status, 200);
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: rc[0] } })).json.error, 'bad_code', 'a recovery code works once');
  const race = await Promise.all([1, 2, 3, 4, 5].map(() => R.call(L + 'auth/signin', { body: { ...sub, code: rc[1] } })));
  assert.equal(race.filter(r => r.status === 200).length, 1, 'one recovery code, simultaneous use: one success');
  assert.equal(ok(await R.call(L + 'account/me', { token: tok })).recoveryRemaining, 6);
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: 'zzzzz-zzzzz' } })).json.error, 'bad_code');

  NOW += 20 * 60000;   // the failures above would otherwise lock the account
  // regenerate: needs the password; old codes stop working
  assert.equal((await R.call(L + 'account/recovery', { token: tok, body: { password: 'nope nope nope' } })).json.error, 'wrong_password');
  const regen = ok(await R.call(L + 'account/recovery', { token: tok, body: { password: pw } })).recoveryCodes; secrets.push(...regen);
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: rc[2] } })).json.error, 'bad_code', 'old recovery codes are void');
  assert.equal((await R.call(L + 'auth/signin', { body: { ...sub, code: regen[0] } })).status, 200);

  // turning it off needs the password; the owner can also remove it
  assert.equal((await R.call(L + 'account/totp-disable', { token: tok, body: { password: 'nope nope nope' } })).json.error, 'wrong_password');
  ok(await R.call(L + 'account/totp-disable', { token: tok, body: { password: pw } }));
  assert.equal((await R.call(L + 'auth/signin', { body: sub })).status, 200);
  const s2 = ok(await R.call(L + 'account/totp-setup', { token: tok, body: {} })).secret;
  ok(await R.call(L + 'account/totp-enable', { token: tok, body: { code: acc.totpAt(acc.base32Decode(s2), NOW, 6) } }));
  assert.equal((await R.call(L + 'auth/signin', { body: sub })).json.error, 'code_required');
  ok(await R.call(L + 'researchers/clear-totp', { key: OWNER, body: { id: acc.accountId('tia@x.edu') } }));
  assert.equal((await R.call(L + 'auth/signin', { body: sub })).status, 200, 'the owner removed the authenticator');
  NOW = T0;
}
console.log('authenticator: confirm before on, one use per code and step, recovery codes single use (also concurrently), regenerate, disable');

// ---------- lockout ----------
{
  const R = harness();
  const i = ok(await R.call(L + 'researchers/invite', { key: OWNER, body: { name: 'Lou', email: 'lou@x.edu', studyRoles: { verification: 'viewer' } } }));
  const pw = 'lou has a fine long passphrase'; secrets.push(pw);
  ok(await R.call(L + 'auth/accept', { body: { token: tokenOf(i.link), name: 'Lou', password: pw, password2: pw } }));
  const good = { email: 'lou@x.edu', password: pw }, bad = { email: 'lou@x.edu', password: 'not the password' };
  for (let n = 1; n <= 10; n++) { const r = await R.call(L + 'auth/signin', { body: bad }); assert.equal(r.json.error, 'bad_credentials', `attempt ${n}`); NOW += 1000; }
  const locked = await R.call(L + 'auth/signin', { body: good });
  assert.equal(locked.status, 429); assert.equal(locked.json.error, 'locked'); assert(locked.json.retryAfterSeconds > 800 && locked.json.retryAfterSeconds <= 900);
  assert.equal((await R.call(L + 'auth/signin', { body: bad })).status, 429, 'still locked for a wrong password');
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'unknown@x.edu', password: 'whatever it is' } })).status, 401, 'other emails are not locked');
  // an unknown email locks in the same way, so lockout does not show which emails exist
  for (let n = 0; n < 10; n++) await R.call(L + 'auth/signin', { body: { email: 'ghost@x.edu', password: 'whatever it is' } });
  const ghost = await R.call(L + 'auth/signin', { body: { email: 'ghost@x.edu', password: 'whatever it is' } });
  assert.equal(ghost.status, 429); assert.equal(ghost.json.error, 'locked'); assert.deepEqual(Object.keys(ghost.json).sort(), Object.keys(locked.json).sort());
  NOW += 14 * 60000; assert.equal((await R.call(L + 'auth/signin', { body: good })).status, 429, 'locked until 15 minutes have passed');
  NOW += 2 * 60000; assert.equal((await R.call(L + 'auth/signin', { body: good })).status, 200, 'the lock expires');
  // failures spread over time do not lock: the window is 15 minutes
  for (let n = 0; n < 9; n++) { await R.call(L + 'auth/signin', { body: bad }); NOW += 2 * 60000; }
  assert.equal((await R.call(L + 'auth/signin', { body: good })).status, 200, 'nine failures in 18 minutes do not lock');
  // per client address
  const R2 = harness(); NOW = T0;
  for (let n = 0; n < 40; n++) await R2.call(L + 'auth/signin', { ip: '203.0.113.9', body: { email: `user${n}@x.edu`, password: 'something wrong here' } });
  assert.equal((await R2.call(L + 'auth/signin', { ip: '203.0.113.9', body: { email: 'fresh@x.edu', password: 'something wrong here' } })).status, 429, 'an address with 40 failures is locked');
  assert.equal((await R2.call(L + 'auth/signin', { ip: '203.0.113.10', body: { email: 'fresh@x.edu', password: 'something wrong here' } })).status, 401, 'another address is not');
  NOW = T0;
}
console.log('lockout: 10 failures in 15 minutes lock an email for 15 minutes (known or not), expiry, per-address limit');

// ---------- disabled, reset, removed ----------
{
  const R = harness();
  ok(await R.call(L + 'create', { key: OWNER, body: { id: 'phish-pilot', name: 'P', type: 'vignettes' } }));
  const i = ok(await R.call(L + 'researchers/invite', { key: OWNER, body: { name: 'Dee', email: 'dee@x.edu', studyRoles: { verification: 'editor' } } }));
  const pw = 'dee has a long passphrase 9', id = acc.accountId('dee@x.edu'); secrets.push(pw);
  const tok = await signup(R.call, i.link, 'Dee', pw);
  ok(await R.call('/api/lab/verification/admin/me', { token: tok }));
  ok(await R.call(L + 'researchers/update', { key: OWNER, body: { id, disabled: true } }));
  assert.equal((await R.call('/api/lab/verification/admin/me', { token: tok })).status, 401, 'a disabled account loses its session');
  const dis = await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: pw } });
  assert.equal(dis.text, (await R.call(L + 'auth/signin', { body: { email: 'nobody@x.edu', password: pw } })).text, 'a disabled account answers like an unknown one');
  assert.equal((await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id } })).json.error, 'disabled');
  ok(await R.call(L + 'researchers/update', { key: OWNER, body: { id, disabled: false } }));
  assert.equal((await R.call(L + 'account/me', { token: tok })).status, 401, 'enabling again does not revive the old session');
  // reset link: 24 hours, one use, ends sessions, does not sign in
  const s1 = ok(await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: pw } })).token;
  const rl = ok(await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id } }));
  assert.match(rl.link.path, /^\/lab\/signin\/#reset=vcr_/); assert.equal(rl.link.expiresAt, NOW + 24 * 3600000);
  const np = 'dee chose this new passphrase 3'; secrets.push(np);
  const acp = ok(await R.call(L + 'auth/accept', { body: { token: tokenOf(rl.link), password: np, password2: np } }));
  assert.equal(acp.kind, 'reset'); assert(!acp.token, 'a reset does not sign anyone in');
  assert.equal((await R.call('/api/lab/verification/admin/me', { token: s1 })).status, 401, 'a reset ends existing sessions');
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: pw } })).status, 401);
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: np } })).status, 200);
  assert.equal((await R.call(L + 'auth/accept', { body: { token: tokenOf(rl.link), password: np, password2: np } })).json.error, 'used_link');
  const rl2 = ok(await R.call(L + 'researchers/reset-link', { key: OWNER, body: { id } }));
  NOW += 24 * 3600000 + 1000; assert.equal((await R.call(L + 'auth/link-info', { body: { token: tokenOf(rl2.link) } })).json.error, 'expired_link'); NOW = T0;
  // revoke from the owner side, then remove
  const s2 = ok(await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: np } })).token;
  ok(await R.call(L + 'researchers/revoke', { key: OWNER, body: { id } }));
  assert.equal((await R.call('/api/lab/verification/admin/me', { token: s2 })).status, 401);
  const s3 = ok(await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: np } })).token;
  ok(await R.call(L + 'researchers/remove', { key: OWNER, body: { id } }));
  assert.equal((await R.call('/api/lab/verification/admin/me', { token: s3 })).status, 401);
  assert.equal((await R.call(L + 'auth/signin', { body: { email: 'dee@x.edu', password: np } })).status, 401);
  assert.equal(ok(await R.call(L + 'researchers', { key: OWNER })).length, 0);
  // the audit log has the events and no secrets
  const log = ok(await R.call(L + 'activity', { key: OWNER })).map(a => a.action);
  for (const a of ['researcher.invite', 'invite.used', 'signin.success', 'signin.failure', 'researcher.disable', 'researcher.enable', 'researcher.reset_link', 'reset.used', 'researcher.revoke_sessions', 'researcher.remove']) assert(log.includes(a), `audit has ${a}`);
}
console.log('disabled accounts, reset links (24 h, one use), revoke, remove, and the audit log');

// ---------- audit events for passwords and authenticator ----------
{
  const log = ok(await call(L + 'activity', { key: OWNER })).map(a => a.action);
  for (const a of ['password.changed', 'signout', 'signout.all', 'signin.locked']) if (a !== 'signin.locked') assert(log.includes(a), `audit has ${a}`);
}

// ---------- participant tokens and researcher tokens are not interchangeable ----------
{
  const P = '/api/lab/phish-pilot/';
  ok(await call(P + 'admin/me', { token: ann }));   // Ann is an editor there
  const ptok = ok(await call(P + 'login', { body: { email: 'p1@gsu.edu', confirm: true } })).token;
  assert.equal((await call(P + 'admin/me', { token: ptok })).status, 401, 'a participant token is not a researcher session');
  assert.equal((await call(L + 'account/me', { token: ptok })).status, 401);
  assert.equal((await call(L + 'mystudies', { token: ptok })).status, 401);
  assert.equal((await call(P + 'resume', { body: { token: ann } })).status, 401, 'a researcher session is not a participant token');
  assert.equal((await call(P + 'resume', { body: { token: ann } })).json.error, 'expired');
  assert.equal((await call(P + 'session', { body: { token: boss } })).status, 401);
  assert.equal((await call(P + 'resume', { body: { token: ptok } })).status, 200);
  // a bearer header on a participant route changes nothing
  assert.equal((await call(P + 'resume', { body: { token: ptok }, token: ann })).status, 200);
  assert.equal((await call(P + 'resume', { body: {}, token: ann })).status, 401);
  // a researcher signing in does not create or touch participant records
  assert.equal((await H.stores.get('lab-phish-pilot').list('participants/')).length, 1);
}
console.log('participant routes never accept researcher tokens, and the reverse');

// ---------- nothing secret leaves the server ----------
{
  const all = H.responses.join('\n');
  for (const s of new Set(secrets)) assert(!all.includes(s), 'a password, secret, or code appeared in a response');
  assert(!/"pwHash"|"pwSalt"|"pwParams"|"recovery"|"totpPending"/.test(all), 'no hash fields in responses');
  const audits = (await Promise.all([...H.reg().m.keys()].filter(k => k.startsWith('audit/')).map(k => H.reg().get(k)))).map(v => JSON.stringify(v)).join('\n');
  for (const s of new Set(secrets)) assert(!audits.includes(s), 'a password or code appeared in the audit log');
  // the stored record keeps hashes only
  const rec = H.reg().m.get('accounts/' + annId).v;
  assert(rec.pwHash && rec.pwSalt && rec.pwParams && !JSON.stringify(rec).includes('brand new passphrase'));
}
console.log('responses and the audit log never contain passwords, secrets, or hashes');
console.log('accounts: all checks passed');
