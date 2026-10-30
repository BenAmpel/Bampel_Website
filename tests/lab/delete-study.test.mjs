// Deleting a study permanently (registry.mjs, deleteStudy; lab route delete-study): only a lab owner, only an archived
// study that is not built in, only with the study's ID typed to confirm. It removes every key in the study's store and in
// its backup store, its studies-list entry and the registry backup's copy of it, and its role on researcher accounts,
// and writes the lab activity log. A large study is deleted over several calls, and cannot be restored once started.
// In-memory stores through the HTTP router.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { deleteStudy, getStudy } from '../../netlify/lib/lab/registry.mjs';
import { blobsStore } from '../../netlify/lib/lab/store.mjs';
import { runBackup, REGISTRY_PREFIXES, REGISTRY_MUTABLE } from '../../netlify/lib/lab/backup.mjs';
import { memStore } from './memstore.mjs';

const OWNER = 'owner-key-0123456789abcdef', PW = 'correct horse battery staple';
const stores = new Map();
const getStore = ({ name }) => {
  if (!stores.has(name)) stores.set(name, memStore({ name }));
  const m = stores.get(name);
  return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
    delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
    getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } };
};
const call = async (path, { body, key = OWNER, token } = {}) => {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : key ? { 'x-admin-key': key } : {}) };
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const ok = r => { assert(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r.json; };
const keys = name => (stores.get(name) ? [...stores.get(name).m.keys()] : []);
const L = '/api/lab/_lab/';

// two studies with data, uploaded files, team keys, and backups
for (const id of ['gone-study', 'kept-study']) {
  ok(await call(L + 'create', { body: { id, name: id, template: 'audio-judgments' } }));
  ok(await call(`/api/lab/${id}/admin/file-upload`, { body: { mime: 'audio/mpeg', data: Buffer.from('ID3 fake').toString('base64'), filename: 'a.mp3' } }));
  const code = ok(await call(`/api/lab/${id}/admin/create`, { body: { count: 1, label: 'pilot' } })).created[0].code;
  const lg = ok(await call(`/api/lab/${id}/login`, { key: null, body: { code } }));
  ok(await call(`/api/lab/${id}/consent`, { key: null, body: { token: lg.token, agree: true } }));
  ok(await call(`/api/lab/${id}/admin/backup-run`, { body: {} }));
}
const team = ok(await call('/api/lab/gone-study/admin/team-add', { body: { name: 'RA', role: 'manager' } })).key;
// a researcher who owns gone-study (but is not a lab owner) and can view kept-study
const inv = ok(await call(L + 'researchers/invite', { body: { name: 'Pat', email: 'pat@example.edu', studyRoles: { 'gone-study': 'owner', 'kept-study': 'viewer' } } }));
ok(await call(L + 'auth/accept', { key: null, body: { token: inv.link.path.split('=')[1], name: 'Pat', password: PW, password2: PW } }));
const pat = ok(await call(L + 'auth/signin', { key: null, body: { email: 'pat@example.edu', password: PW } })).token;
assert(pat);
const registry = blobsStore(getStore, 'lab-registry'), regBackup = blobsStore(getStore, 'lab-registry-backup');
await runBackup(registry, regBackup, { prefixes: REGISTRY_PREFIXES, mutable: REGISTRY_MUTABLE });
assert(keys('lab-gone-study').length > 5 && keys('lab-gone-study-backup').length > 5 && keys('lab-registry-backup').includes('m/studies/gone-study'), 'the study has data and backups to delete');
const keptBefore = keys('lab-kept-study').sort(), keptBackupBefore = keys('lab-kept-study-backup').sort();
const del = (body, opts) => call(L + 'delete-study', { body, ...opts });

// ---------- refusals ----------
let r = await del({ id: 'gone-study', confirm: 'gone-study' });
assert.equal(r.status, 409); assert.equal(r.json.error, 'not_archived', 'a study that is not archived is refused');
for (const id of ['verification', 'data-quality']) {
  r = await del({ id, confirm: id });
  assert.equal(r.status, 400); assert.equal(r.json.error, 'built_in', `the built-in study ${id} is refused`);
}
ok(await call(L + 'update', { body: { id: 'gone-study', archived: true } }));
r = await del({ id: 'gone-study', confirm: 'gone-study' }, { key: team });
assert.equal(r.status, 403, 'a team key for the study is refused');
r = await del({ id: 'gone-study', confirm: 'gone-study' }, { token: pat });
assert.equal(r.status, 403, 'a researcher who owns the study but did not create it is refused');
assert.equal((await deleteStudy({ registry, registryBackup: regBackup, getStoreFor: n => blobsStore(getStore, n) }, 'gone-study', 'gone-study', { name: 'Pat', role: 'researcher' })).error, 'forbidden', 'and refused in the library too');
for (const confirm of [undefined, '', 'gone', 'GONE-STUDY', 'kept-study']) {
  r = await del({ id: 'gone-study', confirm });
  assert.equal(r.status, 400); assert.equal(r.json.error, 'confirm', `confirmation ${JSON.stringify(confirm)} is refused`);
}
assert.equal((await del({ id: 'nope-study', confirm: 'nope-study' })).status, 404);
assert(keys('lab-gone-study').length > 5 && await registry.get('studies/gone-study'), 'nothing was deleted by a refused request');
assert(!(await call(L + 'activity', {})).json.some(e => /^study\.delete/.test(e.action)), 'and nothing was logged as deleted');

// ---------- rounds: a call that runs out of time leaves the study marked, and it cannot be restored ----------
const ctx = { registry, registryBackup: regBackup, getStoreFor: n => blobsStore(getStore, n) };
r = await deleteStudy(ctx, 'gone-study', 'gone-study', { name: 'Owner', role: 'owner' }, { budgetMs: -1 });
assert(r.ok && r.done === false && r.remaining > 0, JSON.stringify(r));
assert((await registry.get('studies/gone-study')).deletingAt, 'marked as being deleted');
r = await call(L + 'update', { body: { id: 'gone-study', archived: false } });
assert.equal(r.status, 409, 'a study being deleted cannot be restored');
const row = ok(await call(L + 'mystudies', {})).find(s => s.id === 'gone-study');
assert(row && row.deleting && row.archived, 'the console shows it as being deleted');

// ---------- the delete ----------
r = ok(await del({ id: 'gone-study', confirm: ' gone-study ' }));
assert(r.done && r.deleted > 10 && r.accounts === 1, JSON.stringify(r));
assert.deepEqual(keys('lab-gone-study'), [], 'every key in the study store is gone');
assert.deepEqual(keys('lab-gone-study-backup'), [], 'every key in its backup store is gone');
assert.equal(await registry.get('studies/gone-study'), null, 'the studies-list entry is gone');
assert(!keys('lab-registry-backup').includes('m/studies/gone-study'), 'and its copy in the registry backup');
assert.equal(await getStudy(registry, 'gone-study'), null);
assert(!ok(await call(L + 'mystudies', {})).some(s => s.id === 'gone-study'));
const acct = ok(await call(L + 'researchers', {})).find(a => a.email === 'pat@example.edu');
assert.deepEqual(acct.studyRoles, { 'kept-study': 'viewer' }, 'the account lost its role on the deleted study only');
assert.equal((await call('/api/lab/gone-study/admin/participants', { key: team })).status, 404, 'its team key opens nothing');
assert.deepEqual(keys('lab-kept-study').sort(), keptBefore, 'the other study is untouched');
assert.deepEqual(keys('lab-kept-study-backup').sort(), keptBackupBefore, 'and its backup');

// ---------- audit ----------
const log = ok(await call(L + 'activity', {}));
const started = log.filter(e => e.action === 'study.delete_started'), done = log.filter(e => e.action === 'study.delete');
assert.equal(started.length, 1, 'the start is logged once, however many calls it takes');
assert.equal(done.length, 1); assert.equal(done[0].who, 'Owner'); assert(/gone-study/.test(done[0].detail) && /pat@example\.edu/.test(done[0].detail), done[0].detail);

// a second request after it is gone finds nothing; the link name can be used again for a new, empty study
assert.equal((await del({ id: 'gone-study', confirm: 'gone-study' })).status, 404);
ok(await call(L + 'create', { body: { id: 'gone-study', name: 'New', template: 'survey' } }));
assert.deepEqual(ok(await call('/api/lab/gone-study/admin/participants', {})), [], 'a new study under the old name starts empty');

console.log('delete study: owner only, archived only, not built in, typed confirmation, every key removed, roles dropped, audited');
