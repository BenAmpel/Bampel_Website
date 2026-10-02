// Exercises the HTTP router end to end with in-memory stores: lab routes, a new study, the original
// /api/vc URLs, roles, and isolation between studies.
import { handle } from '../../netlify/lib/lab/router.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const stores = new Map();
const getStore = ({ name }) => { if (!stores.has(name)) { const m = memStore({ name }); stores.set(name, m); } const m = stores.get(name);
  // a minimal stand-in for the Blobs API used by blobsStore()
  return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
    delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
    getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } }; };
const OWNER = 'owner-key-0123456789abcdef';
const env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key, method } = {}) => {
  const req = new Request('https://bampel.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};

// lab: public list has the built-in study; creating needs the owner key
let r = await call('/api/lab/_lab/studies'); assert.equal(r.status, 200); assert(r.json.some(s => s.id === 'verification'));
assert.equal((await call('/api/lab/_lab/create', { body: { id: 'phish-pilot', name: 'Phishing pilot', type: 'vignettes' } })).status, 403);
r = await call('/api/lab/_lab/types', { key: OWNER }); assert(r.json.some(t => t.id === 'vignettes') && r.json.some(t => t.id === 'alert-triage'));
r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'phish-pilot', name: 'Phishing pilot', type: 'vignettes' } }); assert(r.json.ok, r.text);
assert.equal(r.json.study.paths.participant, '/lab/s/phish-pilot');
assert.equal((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'phish-pilot', name: 'x', type: 'vignettes' } })).status, 409);
assert.equal((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'Bad ID', name: 'x', type: 'vignettes' } })).status, 400);
assert(!(await call('/api/lab/_lab/studies')).json.some(s => s.id === 'phish-pilot'), 'new studies are unlisted until published');
assert((await call('/api/lab/_lab/update', { key: OWNER, body: { id: 'phish-pilot', listed: true } })).json.ok);
assert((await call('/api/lab/_lab/studies')).json.some(s => s.id === 'phish-pilot'));
console.log('lab routes: list, types, create (owner only, unique, valid IDs), publish');

// the new study works end to end over HTTP
const P = '/api/lab/phish-pilot/';
r = await call(P + 'content'); assert.equal(r.json.type, 'vignettes'); assert.equal(r.json.name, 'Phishing pilot'); assert(!r.text.includes('variants'));
assert.equal((await call(P + 'login', { body: { email: 'a@gsu.edu' } })).json.error, 'confirm_new');
const tok = (await call(P + 'login', { body: { email: 'a@gsu.edu', confirm: true } })).json.token;
assert((await call(P + 'consent', { body: { token: tok, agree: true } })).json.ok);
const plan = (await call(P + 'session', { body: { token: tok } })).json; assert.equal(plan.total, 2);
for (const t of plan.trials) assert((await call(P + 'trial', { body: { token: tok, session: 1, index: t.index, data: { answers: { suspicion: '3', action: 'verify', confidence: '60' } } } })).json.ok);
assert((await call(P + 'survey', { body: { token: tok, session: 1, kind: 'post', data: {} } })).json.status.finished);
assert.equal((await call(P + 'admin/participants')).status, 403);
r = await call(P + 'admin/export.csv', { key: OWNER }); assert(r.text.includes('a_suspicion') && r.text.includes('phish-pilot') === false);
console.log('new study over HTTP: content, sign-in, consent, session, answers, survey, admin export');

// the original verification URLs still work, and studies never share data
const V = '/api/vc/';
r = await call(V + 'content'); assert.equal(r.json.type, 'alert-triage');
const vt = (await call(V + 'login', { body: { email: 'a@gsu.edu', confirm: true } })).json.token;
assert(vt && vt !== tok);
assert.equal((await call(V + 'resume', { body: { token: tok } })).json.error, 'expired', 'a token from one study is useless in another');
assert.equal((await call('/api/lab/verification/content')).json.type, 'alert-triage');
assert.equal((await stores.get('verification-study').list('participants/')).length, 1);
assert.equal((await stores.get('lab-phish-pilot').list('participants/')).length, 1);
assert.equal((await call('/api/lab/nope/content')).status, 404);
console.log('original /api/vc URLs work; each study has its own participants, data, and tokens');

// roles and team keys are per study
const team = (await call(P + 'admin/team-add', { key: OWNER, body: { name: 'RA', role: 'viewer' } })).json.key;
assert.equal((await call(P + 'admin/participants', { key: team })).status, 200);
assert.equal((await call(P + 'admin/content-save', { key: team, body: {} })).status, 403);
assert.equal((await call(V + 'admin/participants', { key: team })).status, 403, 'a team key works only for its study');
assert.equal((await call('/api/lab/_lab/studies', { key: team })).status, 403, 'only the owner manages the lab');
console.log('team keys: per study, roles enforced, no lab access');
console.log('ALL ROUTER TESTS PASSED');
