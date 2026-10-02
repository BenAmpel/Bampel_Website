// CARE Behavioral Lab: storage helpers shared by every study.
// A "store" is { get, set, delete, list(prefix), getMeta?, setIf? }: a Netlify Blobs store in production
// (blobsStore below), an in-memory Map in tests. Study logic never imports @netlify/blobs directly.
//
// Concurrency rule for all studies: Netlify Blobs does not keep conditional (etag) writes atomic when
// requests arrive at the same moment, so anything that must not be lost is written as its own
// write-once key (setNew) and progress is read back from which keys exist. update() (compare-and-swap
// with retries) is only for rarely-changed, low-stakes fields.

export function blobsStore(getStore, name) {
  const s = getStore({ name, consistency: 'strong' });
  return {
    name,
    get: key => s.get(key, { type: 'json' }),
    set: (key, value) => s.setJSON(key, value),
    delete: key => s.delete(key),
    list: async prefix => { const keys = []; for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) keys.push(b.key); return keys; },
    getMeta: async key => { const r = await s.getWithMetadata(key, { type: 'json' }); return r ? { data: r.data, etag: r.etag } : null; },
    setIf: async (key, value, cond) => (await s.setJSON(key, value, cond.onlyIfNew ? { onlyIfNew: true } : { onlyIfMatch: cond.etag })).modified !== false
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Write-once: returns true if this call created the key.
export async function setNew(store, key, value) {
  if (store.setIf) return store.setIf(key, value, { onlyIfNew: true });
  if (await store.get(key)) return false;
  await store.set(key, value); return true;
}

// Read-modify-write with compare-and-swap on the etag, retried on conflict. fn(draft) mutates the
// draft and may return { error } to abort. Use only for low-stakes fields (see the note above).
export async function update(store, key, fn, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const cur = store.getMeta ? await store.getMeta(key) : { data: await store.get(key) };
    if (!cur || cur.data == null) return { error: 'not_found', status: 404 };
    const draft = structuredClone(cur.data);
    const out = await fn(draft);
    if (out && out.error) return out;
    draft.updatedAt = Date.now();
    if (!store.setIf) { await store.set(key, draft); return { value: draft, out }; }
    if (await store.setIf(key, draft, { etag: cur.etag })) return { value: draft, out };
    await sleep(5 + Math.random() * 25 * Math.min(i + 1, 6));
  }
  return { error: 'busy', status: 503 };
}

// Reads many keys in parallel batches; returns [key, value] pairs.
export async function getMany(store, keys, batch = 40) {
  const out = [];
  for (let i = 0; i < keys.length; i += batch) {
    const slice = keys.slice(i, i + batch);
    const vals = await Promise.all(slice.map(k => store.get(k)));
    slice.forEach((k, j) => out.push([k, vals[j]]));
  }
  return out;
}

export async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

export async function deleteKeys(store, keys) {
  for (let i = 0; i < keys.length; i += 40) await Promise.all(keys.slice(i, i + 40).map(k => store.delete(k)));
}
