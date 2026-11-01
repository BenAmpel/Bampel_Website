// A study's stores are lab-<id> and lab-<id>-backup (registry.mjs, createStudy). No study ID may make either name equal the
// lab's own stores (lab-registry, lab-registry-backup) or another study's backup store, and deleteStudy refuses a study whose
// store is a lab store. In-memory stores through the HTTP router, as a researcher who may create studies.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { deleteStudy } from '../../netlify/lib/lab/registry.mjs';
import { blobsStore } from '../../netlify/lib/lab/store.mjs';
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
const L = '/api/lab/_lab/';

// a researcher who may create studies, and nothing else
const inv = ok(await call(L + 'researchers/invite', { body: { name: 'Pat', email: 'pat@example.edu', canCreate: true, studyRoles: {} } }));
ok(await call(L + 'auth/accept', { key: null, body: { token: inv.link.path.split('=')[1], name: 'Pat', password: PW, password2: PW } }));
const pat = ok(await call(L + 'auth/signin', { key: null, body: { email: 'pat@example.edu', password: PW } })).token;
const registryKeys = () => [...stores.get('lab-registry').m.keys()].length;
const before = registryKeys();

// IDs whose stores would be the lab's own stores, or another study's backup store, are refused for researchers and lab owners
ok(await call(L + 'create', { token: pat, body: { id: 'pats-study', name: 'Mine', template: 'audio-judgments' } }));
for (const id of ['registry', 'registry-backup', 'pats-study-backup']) {
  for (const auth of [{ token: pat }, {}]) {
    const r = await call(L + 'create', { ...auth, body: { id, name: 'x', template: 'audio-judgments' } });
    assert.equal(r.status, 400, `${id}: ${r.text}`);
    assert.equal(r.json.error, 'bad_id');
  }
}
assert.equal((await call('/api/lab/registry/admin/activity', { token: pat })).status, 404, 'no study answers at the registry store');

// a study record that already points at a lab store (made before this check) cannot be deleted through it
const registry = blobsStore(getStore, 'lab-registry');
await registry.set('studies/registry', { id: 'registry', name: 'old', type: 'audio-judgments', storeName: 'lab-registry', backupName: 'lab-registry-backup', archived: true, createdByAccount: 'x' });
const r = await deleteStudy({ registry, getStoreFor: name => blobsStore(getStore, name) }, 'registry', 'registry', { role: 'owner', name: 'Lab owner' });
assert.equal(r.status, 403);
assert(registryKeys() > before, 'the registry still holds its records');
assert.equal((await call(L + 'auth/signin', { key: null, body: { email: 'pat@example.edu', password: PW } })).status, 200, 'accounts survive');
console.log('study-id-stores: ok');
