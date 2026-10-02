// In-memory store with the same conditional-write semantics as Netlify Blobs (etag CAS, create-only).
export function memStore({ latency = 0 } = {}) {
  const m = new Map(); let n = 0;
  const lat = () => latency ? new Promise(r => setTimeout(r, latency)) : Promise.resolve();
  const s = {
    m,
    get: async k => { await lat(); return m.has(k) ? structuredClone(m.get(k).v) : null; },
    set: async (k, v) => { await lat(); m.set(k, { v: structuredClone(v), e: String(++n) }); },
    delete: async k => { await lat(); m.delete(k); },
    list: async p => { await lat(); return [...m.keys()].filter(k => k.startsWith(p)); },
    getMeta: async k => { await lat(); return m.has(k) ? { data: structuredClone(m.get(k).v), etag: m.get(k).e } : null; },
    setIf: async (k, v, c) => { await lat();
      if (c.onlyIfNew) { if (m.has(k)) return false; }
      else if (!m.has(k) || m.get(k).e !== c.etag) return false;
      m.set(k, { v: structuredClone(v), e: String(++n) }); return true; }
  };
  return s;
}
