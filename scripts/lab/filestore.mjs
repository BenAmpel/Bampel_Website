// A stand-in for @netlify/blobs getStore() that keeps every store as a folder of JSON files, so a lab run on a
// laptop (npm run lab) keeps its studies and data between restarts. Same conditional-write behavior as Blobs
// (create-only, and compare-and-swap on an etag), which is what the engine's write-once records rely on.
//   .lab-data/<store name>/<key, URI-encoded>.json
import { mkdir, readFile, writeFile, rename, rm, readdir, link } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

const etagOf = text => createHash('sha1').update(text).digest('hex');
const fileName = key => encodeURIComponent(key).replace(/\./g, '%2E') + '.json';
const keyOf = name => decodeURIComponent(name.slice(0, -5));

export function fileBlobs(root) {
  const made = new Set(), locks = new Map();
  // Conditional writes check and write under a per-key lock, so overlapping requests in this one process
  // cannot both pass the check (the lab runs as a single local process).
  const locked = (k, fn) => {
    const prev = locks.get(k) || Promise.resolve(), run = prev.then(fn, fn);
    const tail = run.catch(() => {}); locks.set(k, tail); tail.then(() => { if (locks.get(k) === tail) locks.delete(k); });
    return run;
  };
  return ({ name }) => {
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(name)) throw new Error('bad store name: ' + name);
    const dir = join(root, name);
    const ready = async () => { if (!made.has(dir)) { await mkdir(dir, { recursive: true }); made.add(dir); } };
    const read = async key => { try { return await readFile(join(dir, fileName(key)), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
    const write = async (key, text, flag) => {
      await ready();
      const tmp = join(dir, '.tmp-' + randomBytes(6).toString('hex'));   // write aside first, so no reader ever sees half a file
      await writeFile(tmp, text);
      if (flag === 'wx') {   // create-only: link() is atomic and fails if the key exists
        try { await link(tmp, join(dir, fileName(key))); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; } finally { await rm(tmp, { force: true }); }
      }
      await rename(tmp, join(dir, fileName(key))); return true;
    };
    return {
      get: async key => { const t = await read(key); return t == null ? null : JSON.parse(t); },
      getWithMetadata: async key => { const t = await read(key); return t == null ? null : { data: JSON.parse(t), etag: etagOf(t) }; },
      setJSON: async (key, value, o = {}) => {
        const text = JSON.stringify(value);
        if (o.onlyIfNew) return { modified: await write(key, text, 'wx') };
        return locked(dir + '|' + key, async () => {
          if (o.onlyIfMatch) { const cur = await read(key); if (cur == null || etagOf(cur) !== o.onlyIfMatch) return { modified: false }; }
          await write(key, text); return { modified: true };
        });
      },
      delete: async key => { await rm(join(dir, fileName(key)), { force: true }); },
      list: ({ prefix = '' } = {}) => ({
        async *[Symbol.asyncIterator]() {
          await ready();
          const names = (await readdir(dir)).filter(n => n.endsWith('.json') && !n.startsWith('.tmp-'));
          yield { blobs: names.map(keyOf).filter(k => k.startsWith(prefix)).sort().map(key => ({ key })) };
        }
      })
    };
  };
}
