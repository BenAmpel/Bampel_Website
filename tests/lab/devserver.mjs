// Local lab server: the static lab pages plus the lab API on in-memory stores (nothing is saved).
// Mirrors the netlify.toml rewrites for /lab/s/<study> and /lab/admin/<study>.
//   npm run lab:dev            then open http://localhost:8899/lab/admin/ (owner key: local-owner-key-0123456789)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';

const ROOT = fileURLToPath(new URL('../../static', import.meta.url));
const PORT = Number(process.env.PORT || 8899);
const env = { LAB_ADMIN_KEY: process.env.LAB_ADMIN_KEY || 'local-owner-key-0123456789' };
const getStore = memBlobs();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/lab/') || url.pathname.startsWith('/api/vc/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
    const out = await handle(new Request(url, { method: req.method, headers: req.headers, body }), { getStore, env });
    res.writeHead(out.status, Object.fromEntries(out.headers)); return res.end(Buffer.from(await out.arrayBuffer()));
  }
  let p = url.pathname;
  if (/^\/lab\/s\/[^/]+\/?$/.test(p)) p = '/lab/s/index.html';
  if (/^\/lab\/admin\/[^/]+\/?$/.test(p)) p = '/lab/admin/index.html';
  let file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`Lab dev server: http://localhost:${PORT}/lab/  (admin key: ${env.LAB_ADMIN_KEY})`));
