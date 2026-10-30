// Researchers who run their own studies: a study creator (canCreate) makes studies and owns only those; a study owner adds
// their own team by email; nobody sees a study they have no role on, and only the lab owner lists studies, manages accounts,
// and reads the lab activity log. Everything runs on in-memory stores through the HTTP router.
import { handle } from '../../netlify/lib/lab/router.mjs';
import { MAX_OWN_STUDIES } from '../../netlify/lib/lab/accounts.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';

const OWNER = 'owner-key-0123456789abcdef', PW = 'correct horse battery staple';
let NOW = 1_800_000_000_000;
const stores = new Map();
const getStore = ({ name }) => {
  if (!stores.has(name)) stores.set(name, memStore({ name }));
  const m = stores.get(name);
  return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
    delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
    getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } };
};
const call = async (path, { body, key, token } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-admin-key'] = key;
  if (token) headers.authorization = 'Bearer ' + token;
  NOW += 1000;
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER }, now: () => NOW });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const L = '/api/lab/_lab/', A = id => `/api/lab/${id}/admin/`;
const ok = r => { assert(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r.json; };
const join = async (link, email, name) => {
  ok(await call(L + 'auth/accept', { body: { token: link.path.split('=')[1], name, password: PW, password2: PW } }));
  return ok(await call(L + 'auth/signin', { body: { email, password: PW } })).token;
};

// The lab owner makes one study and invites two researchers: one who may create studies, one who may not.
ok(await call(L + 'create', { key: OWNER, body: { id: 'ben-study', name: 'Ben', template: 'survey' } }));
const piInv = ok(await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Pat PI', email: 'pat@uni.edu', canCreate: true } }));
assert.equal(piInv.account.canCreate, true);
const pi = await join(piInv.link, 'pat@uni.edu', 'Pat PI');
const plain = await join(ok(await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Lee', email: 'lee@uni.edu' } })).link, 'lee@uni.edu', 'Lee');
assert.equal(ok(await call(L + 'me', { token: pi })).canCreate, true);

// Nothing of the lab owner's is visible.
assert.deepEqual(ok(await call(L + 'mystudies', { token: pi })), []);
for (const path of [A('ben-study') + 'participants', A('ben-study') + 'export.csv', A('ben-study') + 'credit.csv', A('ben-study') + 'members', L + 'study-summary?id=ben-study'])
  assert.equal((await call(path, { token: pi })).status, 403, `${path} is refused`);
for (const path of [L + 'researchers', L + 'activity', L + 'studies'])
  assert.equal((await call(path, { token: pi })).status, 403, `${path} is the lab owner's`);
assert.equal((await call(L + 'update', { token: pi, body: { id: 'ben-study', archived: true } })).status, 403);
assert.equal((await call(L + 'clone', { token: pi, body: { from: 'ben-study', id: 'stolen', name: 'x' } })).status, 403, 'a study you do not own cannot be copied');
assert.equal((await call(L + 'researchers/invite', { token: pi, body: { name: 'x', email: 'x@uni.edu', labOwner: true } })).status, 403);
console.log('a study creator sees none of the lab owner\'s studies, accounts, or activity');

// A creator makes a study and owns it, and only it.
assert(ok(await call(L + 'templates', { token: pi })).length > 0);
const made = ok(await call(L + 'create', { token: pi, body: { id: 'pat-study', name: 'Pat', template: 'survey' } }));
assert.equal(made.study.createdByAccount, piInv.account.id, 'the study records which account made it');
const mine = ok(await call(L + 'mystudies', { token: pi }));
assert.deepEqual(mine.map(s => [s.id, s.role]), [['pat-study', 'owner']]);
assert.equal((await call(A('pat-study') + 'participants', { token: pi })).status, 200);
assert.equal((await call(A('pat-study') + 'seal-set', { token: pi, body: { publicKey: null } })).status, 200, 'the creator runs their own study: encryption, team, data');
assert.equal((await call(L + 'update', { token: pi, body: { id: 'pat-study', listed: true } })).status, 403, 'only the lab owner lists a study on the public page');
ok(await call(L + 'update', { token: pi, body: { id: 'pat-study', name: 'Pat (renamed)' } }));
ok(await call(L + 'clone', { token: pi, body: { from: 'pat-study', id: 'pat-copy', name: 'Copy' } }));
assert.deepEqual(ok(await call(L + 'mystudies', { token: pi })).map(s => s.id).sort(), ['pat-copy', 'pat-study']);
assert.equal((await call(L + 'create', { token: plain, body: { id: 'lee-study', name: 'Lee', template: 'survey' } })).status, 403, 'a researcher without canCreate cannot create');
assert.equal((await call(L + 'templates', { token: plain })).status, 403);
console.log('a creator makes, renames and copies their own studies; listing stays with the lab owner');

// The study owner builds their own team without the lab owner.
const ra = ok(await call(A('pat-study') + 'member-set', { token: pi, body: { email: 'ra@uni.edu', name: 'Rae RA', role: 'viewer' } }));
assert(ra.link && ra.member.status === 'invited', 'a new person gets an invitation link');
const raTok = await join(ra.link, 'ra@uni.edu', 'Rae RA');
assert.deepEqual(ok(await call(L + 'mystudies', { token: raTok })).map(s => [s.id, s.role]), [['pat-study', 'viewer']], 'the assistant sees that one study');
assert.equal((await call(A('pat-copy') + 'participants', { token: raTok })).status, 403, 'not the owner\'s other study');
assert.equal((await call(A('pat-study') + 'export.csv', { token: raTok })).status, 200, 'a viewer downloads data');
assert.equal((await call(A('pat-study') + 'content-save', { token: raTok, body: { content: {}, baseVersion: 0 } })).status, 403, 'but cannot edit');
assert.equal((await call(A('pat-study') + 'member-set', { token: raTok, body: { email: 'z@uni.edu', name: 'Z', role: 'owner' } })).status, 403, 'and cannot add people');
assert.equal((await call(L + 'create', { token: raTok, body: { id: 'ra-study', name: 'x', template: 'survey' } })).status, 403, 'an invited assistant cannot create studies');
const up = ok(await call(A('pat-study') + 'member-set', { token: pi, body: { email: 'lee@uni.edu', role: 'editor' } }));
assert(!up.link && up.member.status === 'active', 'an existing account just gets the role');
assert.equal((await call(A('pat-study') + 'member-set', { token: pi, body: { email: 'pat@uni.edu', role: 'viewer' } })).json.error, 'self', 'nobody changes their own access');
const ownerAcct = ok(await call(L + 'researchers/invite', { key: OWNER, body: { name: 'Ben', email: 'ben@gsu.edu', labOwner: true } }));
assert.equal((await call(A('pat-study') + 'member-set', { token: pi, body: { email: 'ben@gsu.edu', role: null } })).json.error, 'lab_owner', 'a lab owner cannot be removed from a study');
assert(ownerAcct.ok);
assert.equal((await call(A('ben-study') + 'member-set', { token: pi, body: { email: 'ra@uni.edu', role: 'owner' } })).status, 403, 'roles only on studies you own');
const team = ok(await call(A('pat-study') + 'members', { token: pi }));
assert.deepEqual(team.filter(m => !m.labOwner).map(m => [m.email, m.role]).sort(), [['lee@uni.edu', 'editor'], ['pat@uni.edu', 'owner'], ['ra@uni.edu', 'viewer']]);
assert(!JSON.stringify(team).includes('ben-study') && !JSON.stringify(team).includes('pwHash'), 'the team list shows this study only, and no secrets');
ok(await call(A('pat-study') + 'member-set', { token: pi, body: { email: 'ra@uni.edu', role: null } }));
assert.equal((await call(A('pat-study') + 'participants', { token: raTok })).status, 403, 'removing a member takes effect at once');
assert(ok(await call(A('pat-study') + 'activity', { token: pi })).some(x => x.action === 'team.account'), 'team changes are in the study\'s activity log');
console.log('a study owner adds, changes and removes their own team; roles stay inside their studies');

// Archive, restore and delete their own study; the lab owner still sees everything.
ok(await call(L + 'update', { token: pi, body: { id: 'pat-copy', archived: true } }));
assert(ok(await call(L + 'mystudies', { token: pi })).some(s => s.id === 'pat-copy' && s.archived), 'an owner still sees an archived study, to restore or delete it');
let del;
do del = ok(await call(L + 'delete-study', { token: pi, body: { id: 'pat-copy', confirm: 'pat-copy' } })); while (del.done === false);
assert.deepEqual(ok(await call(L + 'mystudies', { token: pi })).map(s => s.id), ['pat-study']);
assert.equal((await call(L + 'delete-study', { token: pi, body: { id: 'ben-study', confirm: 'ben-study' } })).status, 403);
assert.deepEqual(ok(await call(L + 'studies', { key: OWNER })).filter(s => !s.builtIn).map(s => s.id).sort(), ['ben-study', 'pat-study'], 'the lab owner sees every study');
assert(ok(await call(L + 'activity', { key: OWNER })).some(x => x.action === 'study.member'), 'and every team change in the lab activity log');
console.log('owners archive and delete their own studies; the lab owner oversees all');

// A creator can make at most MAX_OWN_STUDIES studies.
for (let i = 1; i < MAX_OWN_STUDIES; i++) ok(await call(L + 'create', { token: pi, body: { id: `pat-${i}x`, name: `P${i}`, template: 'survey' } }));
assert.equal((await call(L + 'create', { token: pi, body: { id: 'pat-over', name: 'over', template: 'survey' } })).json.error, 'limit');
// Taking creation away stops new studies but leaves the ones they own.
ok(await call(L + 'researchers/update', { key: OWNER, body: { id: piInv.account.id, canCreate: false } }));
assert.equal((await call(L + 'create', { token: pi, body: { id: 'pat-late', name: 'late', template: 'survey' } })).status, 403);
assert.equal((await call(A('pat-study') + 'participants', { token: pi })).status, 200);
console.log(`at most ${MAX_OWN_STUDIES} studies per creator; the lab owner can take creation away`);
