// Export speed (engine.exportCodes, exportRecords; the admin page's parallel batches): the export's participant list matches
// the Participants list order, batched rows keep that order, and an export request waits on storage a fixed number of
// rounds however many participants it covers (storage waits are what an export costs on Netlify).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { memStore } from './memstore.mjs';
import { blobsStore } from '../../netlify/lib/lab/store.mjs';

const stores = new Map();
const getStore = ({ name }) => {
  if (!stores.has(name)) stores.set(name, memStore({ name }));
  const m = stores.get(name);
  return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
    delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
    getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } };
};
const KEY = 'owner-key-0123456789abcdef';
const call = async (path, body, admin) => {
  const res = await handle(new Request('https://x.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin-key': KEY } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: KEY } });
  return res.json();
};
const A = '/api/lab/speed/admin/', P = '/api/lab/speed/';
await call('/api/lab/_lab/create', { id: 'speed', name: 'Speed', template: 'ab-test' }, true);
const c = await call(A + 'content', null, true); for (const k of Object.keys(c)) if (k[0] === '_') delete c[k];
c.enrollment.open = true; c.enrollment.domains = ['gsu.edu'];
await call(A + 'content-save', { content: c, baseVersion: c.version }, true);
for (let i = 0; i < 23; i++) {
  const t = (await call(P + 'login', { email: `p${i}@gsu.edu`, confirm: true })).token;
  await call(P + 'consent', { token: t, agree: true });
  const plan = await call(P + 'session', { token: t, session: 1 });
  for (const tr of plan.trials || []) await call(P + 'trial', { token: t, session: 1, index: tr.index, data: { answers: {}, rtMs: 900 + i } });
  await call(P + 'survey', { token: t, session: 1, kind: 'pre', data: {} });
}
await call(A + 'set-test', { codes: [(await call(A + 'participants', null, true))[3].code], test: true }, true);

// The export's list: same participants, same order, same test flags as the Participants list, without the progress work.
const full = await call(A + 'participants', null, true), quick = await call(A + 'codes', null, true);
assert.equal(quick.length, 23);
assert.deepEqual(quick, full.map(p => ({ code: p.code, test: p.test })));

// Batched rows (10 per request, as the admin page asks) keep the participants' order.
const codes = quick.map(p => p.code);
for (const kind of ['trials', 'surveys', 'wide']) {
  const parts = [];
  for (let i = 0; i < codes.length; i += 10) parts.push(await call(A + `rows?kind=${kind}&codes=${codes.slice(i, i + 10).join(',')}`, null, true));
  const got = parts.flat().map(r => r.code);
  assert.ok(got.length >= 23, `${kind}: rows exported`);
  assert.deepEqual(got, got.slice().sort((a, b) => codes.indexOf(a) - codes.indexOf(b)), `${kind}: rows keep the participants' order`);
}
console.log('exportCodes matches the Participants list; batched rows keep their order');

// Storage rounds per export request: a constant (lists and participant records together, then records and progress
// lists together), not one more round per step. Measured on the store's own round counter.
{
  const raw = stores.get('lab-speed');
  const S = { store: blobsStore(getStore, 'lab-speed'), type: TYPES['vignettes'], study: { id: 'speed' } };
  for (const n of [4, 10, 23]) {
    const before = raw.rounds;
    const r = await E.exportRecords(S, codes.slice(0, n));
    assert.equal(r.participants.length, n);
    const rounds = raw.rounds - before;
    assert.ok(rounds <= 3, `exportRecords for ${n} participants waited on storage ${rounds} times in a row (at most 3)`);
  }
  console.log('exportRecords: at most 3 storage rounds per request, for 4, 10 or 23 participants');
}

// The admin page's batched(): several batches in flight, results in the participants' order, progress reaches 100%.
{
  const src = readFileSync(new URL('../../static/lab/engine/admin.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('  function batched('), src.indexOf('  var LANES'));
  const batched = vm.runInNewContext(`(${fn.trim()})`, { Promise, Math });
  let inFlight = 0, peak = 0; const seen = [];
  const out = await batched(Array.from({ length: 23 }, (_, i) => i), 4, b => { inFlight++; peak = Math.max(peak, inFlight);
    return new Promise(r => setTimeout(() => { inFlight--; r(b.map(x => x * 2)); }, 5 + (b[0] % 3) * 7)); }, f => seen.push(f), 6);
  assert.deepEqual(JSON.parse(JSON.stringify(out.flat())), Array.from({ length: 23 }, (_, i) => i * 2), 'results in order even when later batches finish first');
  assert.equal(peak, 6, 'six requests in flight');
  assert.equal(seen[seen.length - 1], 1, 'progress ends at 100%');
  console.log('admin batched(): 6 in flight, results in order, progress to 100%');
}
