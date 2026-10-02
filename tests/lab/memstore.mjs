// In-memory store with the same conditional-write semantics as Netlify Blobs (etag CAS, create-only).
// lossyCas: conditional writes always "succeed" and overwrite (the worst case seen on live Netlify under concurrency).
let storeCount = 0;
export function memStore({ latency = 0, lossyCas = false, name } = {}) {
  const m = new Map(); let n = 0;
  const lat = () => latency ? new Promise(r => setTimeout(r, latency)) : Promise.resolve();
  const s = {
    m, name: name || `mem-${++storeCount}`,
    get: async k => { await lat(); return m.has(k) ? structuredClone(m.get(k).v) : null; },
    set: async (k, v) => { await lat(); m.set(k, { v: structuredClone(v), e: String(++n) }); },
    delete: async k => { await lat(); m.delete(k); },
    list: async p => { await lat(); return [...m.keys()].filter(k => k.startsWith(p)); },
    getMeta: async k => { await lat(); return m.has(k) ? { data: structuredClone(m.get(k).v), etag: m.get(k).e } : null; },
    setIf: async (k, v, c) => { await lat();
      if (lossyCas) { m.set(k, { v: structuredClone(v), e: String(++n) }); return true; }
      if (c.onlyIfNew) { if (m.has(k)) return false; }
      else if (!m.has(k) || m.get(k).e !== c.etag) return false;
      m.set(k, { v: structuredClone(v), e: String(++n) }); return true; }
  };
  return s;
}

// A stand-in for @netlify/blobs getStore() backed by memStore, for the router and the local dev server.
export function memBlobs() {
  const stores = new Map();
  return ({ name }) => {
    if (!stores.has(name)) stores.set(name, memStore({ name }));
    const m = stores.get(name);
    return { get: async k => m.get(k),
      setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
      delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
      getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } };
  };
}
