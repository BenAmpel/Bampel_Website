// Real sign-ups (docs/designs/console-ia.md, Stage 1): engine.isRealSignup / hasRealSignup, which the admin page's
// Draft / Live line and first tab read through the me route, and the me route's live and locked fields.
// A real sign-up is a participant who is not a test and has consented or finished a session (done/ key, or the older
// single-record format's completed array). The page's count applies the same rule to the Participants list.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memStore, memBlobs } from './memstore.mjs';

const type = TYPES.vignettes, now = Date.UTC(2026, 10, 1);
const study = () => ({ store: memStore(), type, study: { id: 'rs', name: 'rs', type: 'vignettes', codePrefix: 'RS' } });
const rec = (code, extra = {}) => ({ code, createdAt: now, gapDays: 0, ...extra });
const FIX = {
  T: [rec('T1', { test: true, consentedAt: now }), false],
  R0: [rec('R0'), false],
  RC: [rec('RC', { consentedAt: now }), true],
  RD: [rec('RD'), true],
  RL: [rec('RL', { completed: [{ session: 1, completedAt: now }] }), true],
};
const put = async (S, name) => {
  await S.store.set('participants/' + FIX[name][0].code, FIX[name][0]);
  if (name === 'RD') await S.store.set(`done/RD/s1-${now}`, { at: now });
};
const pageRule = p => !p.test && (p.consented || p.completedSessions > 0);   // admin.js, load() and A.started

// ---------- hasRealSignup ----------
{
  const S = study();
  assert.equal(await E.hasRealSignup(S), false, 'an empty study has no real sign-up');
  await put(S, 'T'); await put(S, 'R0');
  assert.equal(await E.hasRealSignup(S), false, 'a test participant and a real record with nothing done are not real sign-ups');
  await put(S, 'RC');
  assert.equal(await E.hasRealSignup(S), true, 'a consented real participant is');
}
for (const name of ['RD', 'RL']) {
  const S = study(); await put(S, 'T'); await put(S, name);
  assert.equal(await E.hasRealSignup(S), true, `${name}: a finished session counts without consent`);
}
console.log('hasRealSignup: test and record-only participants do not count; consent, a done/ key or legacy completed do');

// ---------- the server rule agrees with the page rule, fixture by fixture ----------
{
  const S = study();
  for (const name of Object.keys(FIX)) await put(S, name);
  const doneCodes = new Set((await S.store.list('done/')).map(k => k.split('/')[1]));
  const rows = await E.listParticipants(S, now);
  for (const [name, [p, want]] of Object.entries(FIX)) {
    assert.equal(E.isRealSignup(p, doneCodes), want, `${name}: isRealSignup`);
    const row = rows.find(r => r.code === p.code);
    assert(row, `${name}: listed`);
    assert.equal(pageRule(row), want, `${name}: the page's rule on the Participants row`);
  }
}
console.log('isRealSignup matches the page rule on every fixture');

// ---------- stops at the first real sign-up ----------
{
  const S = study();
  for (let i = 0; i < 200; i++) await S.store.set('participants/C' + String(i).padStart(3, '0'), rec('C' + i, { consentedAt: now }));
  let gets = 0; const get = S.store.get;
  S.store.get = k => { gets++; return get(k); };
  assert.equal(await E.hasRealSignup(S), true);
  assert(gets <= 40, `at most one batch of reads (${gets})`);
}
console.log('hasRealSignup reads at most one batch of 40 records when the first batch has a real sign-up');

// ---------- the me route: live and locked ----------
{
  const inner = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
  let failList = false;
  const getStore = o => {
    const s = inner(o);
    return { ...s, list: a => failList && a && a.prefix === 'participants/' ? { async *[Symbol.asyncIterator]() { throw new Error('list failed'); } } : s.list(a) };
  };
  const call = async (path, body) => {
    const res = await handle(new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-key': OWNER }, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER } });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  for (const id of ['rs-b', 'rs-t']) assert((await call('/api/lab/_lab/create', { id, name: id, type: 'multimodal', template: 'multimodal-builder' })).json.ok);

  // A builder study with only a test participant: not live, not locked.
  assert((await call('/api/lab/rs-t/admin/create', { count: 1, test: true })).json.created);
  let me = (await call('/api/lab/rs-t/admin/me')).json;
  assert.equal(me.live, false, 'test participants only: not live');
  assert.equal(me.locked, false, 'test participants only: not locked');

  // A builder study with a real participant enrolled (writes lock/structure), then consented.
  let r = await call('/api/lab/rs-b/admin/me');
  assert.equal(r.json.live, false); assert.equal(r.json.locked, false, 'a new builder study is a draft and not locked');
  const code = (await call('/api/lab/rs-b/admin/create', { count: 1 })).json.created[0].code;
  me = (await call('/api/lab/rs-b/admin/me')).json;
  assert.equal(me.live, false, 'enrolled but not consented: not live');
  assert.equal(me.locked, true, 'enrolled: locked');
  const tok = (await call('/api/lab/rs-b/login', { code })).json.token;
  assert(tok);
  assert.notEqual((await call('/api/lab/rs-b/consent', { token: tok, agree: true })).json.ok, false);
  me = (await call('/api/lab/rs-b/admin/me')).json;
  assert.equal(me.live, true, 'consented: live'); assert.equal(me.locked, true);

  // If the participant list cannot be read, me still answers, without live.
  failList = true;
  const realError = console.error; console.error = () => {};
  try { r = await call('/api/lab/rs-b/admin/me'); } finally { console.error = realError; failList = false; }
  assert.equal(r.status, 200, r.text);
  assert(!('live' in r.json), 'no live field when it cannot be read');
  assert.equal(r.json.locked, true, 'locked is still there');
}
console.log('me: live and locked for draft, enrolled, consented and test-only builder studies; live left out when the list fails');
console.log('real-signups: all checks passed');
