// The lab's local web server: the static pages under static/ plus the lab API (netlify/lib/lab/router.mjs), with
// the same rewrites as netlify.toml (/lab/s/<study>, /lab/admin/<study>). Used by `npm run lab` (data kept on
// disk) and by the tests' dev server (in memory). Static files answer byte-range requests, which Safari needs
// before it will play audio or video.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';

export const STATIC_ROOT = fileURLToPath(new URL('../../static', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2' };

export function labServer({ getStore, env, root = STATIC_ROOT }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/' || url.pathname === '/lab') { res.writeHead(302, { location: '/lab/' }); return res.end(); }
      if (url.pathname.startsWith('/api/lab/') || url.pathname.startsWith('/api/vc/')) {
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
        const out = await handle(new Request(url, { method: req.method, headers: req.headers, body }), { getStore, env });
        res.writeHead(out.status, Object.fromEntries(out.headers)); return res.end(Buffer.from(await out.arrayBuffer()));
      }
      let p = decodeURIComponent(url.pathname);
      if (/^\/lab\/s\/[^/]+\/?$/.test(p)) p = '/lab/s/index.html';
      if (/^\/lab\/admin\/[^/]+\/?$/.test(p)) p = '/lab/admin/index.html';
      let file = normalize(join(root, p));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      let data;
      try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); data = await readFile(file); }   // read first: headers go out only once the file exists
      catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found. The lab starts at /lab/ and the researcher console at /lab/admin/.'); }
      const head = { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
      const m = (req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
      if (m && (m[1] || m[2])) {
        const size = data.length; let start = m[1] ? +m[1] : size - +m[2], end = m[1] && m[2] ? +m[2] : size - 1;
        start = Math.max(0, start); end = Math.min(size - 1, end);
        if (start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 }); return res.end(data.subarray(start, end + 1));
      }
      res.writeHead(200, { ...head, 'content-length': data.length }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      console.error('lab server error', e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Something went wrong. The details are in the terminal window running the lab.');
    }
  });
}

// Listens on the first free port from `port` up; resolves with the port used. host: undefined for every interface.
export function listen(server, port, host, tries = 15) {
  return new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      const onErr = e => { server.off('listening', onOk); if (e.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1); else reject(e); };
      const onOk = () => { server.off('error', onErr); resolve(p); };
      server.once('error', onErr); server.once('listening', onOk);
      server.listen(p, host);
    };
    attempt(port, tries);
  });
}
