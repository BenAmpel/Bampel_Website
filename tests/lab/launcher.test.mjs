// `npm run lab`: the file-backed store (same write-once and compare-and-swap behavior as Netlify Blobs) and the
// launcher itself, started in a temporary folder: banner, pages, the example study, the owner key, data kept
// across a restart, and the console's #key= sign-in being limited to this computer.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileBlobs } from '../../scripts/lab/filestore.mjs';
import { blobsStore, setNew, update } from '../../netlify/lib/lab/store.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'lab-launcher-'));
try {
  // ---------- the file store ----------
  const getStore = fileBlobs(dir), s = blobsStore(getStore, 'lab-x');
  assert.equal(await s.get('a/b'), null);
  assert.equal(await setNew(s, 'data/P-1/s1/t0', { v: 1 }), true);
  assert.equal(await setNew(s, 'data/P-1/s1/t0', { v: 2 }), false, 'write-once keys stay as first written');
  assert.deepEqual(await s.get('data/P-1/s1/t0'), { v: 1 });
  await s.set('participants/P-1', { n: 0 });
  await Promise.all([1, 2, 3, 4, 5].map(() => update(s, 'participants/P-1', d => { d.n++; })));
  assert.equal((await s.get('participants/P-1')).n, 5, 'compare-and-swap updates are not lost');
  await s.set('files/f-1.mp3', { ok: true }); await s.set('data/P-2/s1/t0', { v: 3 });
  assert.deepEqual(await s.list('data/'), ['data/P-1/s1/t0', 'data/P-2/s1/t0']);
  assert.deepEqual(await s.list('files/'), ['files/f-1.mp3'], 'keys with dots and slashes round-trip');
  await s.delete('files/f-1.mp3'); assert.equal(await s.get('files/f-1.mp3'), null);
  assert.throws(() => getStore({ name: '../etc' }), /bad store name/);
  console.log('file store: write-once, compare-and-swap, list by prefix, delete, safe names');

  // ---------- the launcher ----------
  const start = port => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts/lab.mjs'), '--no-open'], { env: { ...process.env, LAB_DATA: dir, PORT: String(port), LAB_ADMIN_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('the lab did not start:\n' + out)); }, 15000);
    child.stdout.on('data', d => { out += d; const m = out.match(/http:\/\/localhost:(\d+)\/lab\/admin\//); if (m && out.includes('Press Ctrl+C')) { clearTimeout(timer); resolve({ child, out, base: `http://localhost:${m[1]}` }); } });
    child.stderr.on('data', d => { out += d; });
  });
  const stop = child => new Promise(r => { child.on('exit', r); child.kill('SIGTERM'); });
  const port = 18600 + Math.floor(Math.random() * 300);
  let lab = await start(port);
  assert(lab.out.includes('CCAIR Behavioral Lab is running') && lab.out.includes('sign in with the owner key'), lab.out);
  const key = (await readFile(join(dir, 'owner-key.txt'), 'utf8')).trim();
  assert(key.length >= 16, 'an owner key is made on the first run');
  let r = await fetch(lab.base + '/lab/'); assert.equal(r.status, 200); assert((await r.text()).includes('Georgia State University · J. Mack Robinson College of Business'), 'the lab home page carries the text wordmark');
  r = await fetch(lab.base + '/'); assert.equal(r.url, lab.base + '/lab/', 'the root address goes to the lab');
  r = await fetch(lab.base + '/lab/media/samples/voicemail-bank.mp3', { headers: { range: 'bytes=0-99' } });
  assert.equal(r.status, 206, 'media files answer range requests'); assert.equal((await r.arrayBuffer()).byteLength, 100);
  r = await fetch(lab.base + '/api/lab/_lab/mystudies', { headers: { 'x-admin-key': key } });
  const studies = await r.json(); assert(studies.some(x => x.id === 'example-vishing' && x.type === 'multimodal'), 'the example study is there');
  r = await fetch(lab.base + '/api/lab/_lab/create', { method: 'POST', headers: { 'x-admin-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'kept-study', name: 'Kept', template: 'survey' }) });
  assert((await r.json()).ok);
  await stop(lab.child);
  lab = await start(port);
  r = await fetch(lab.base + '/api/lab/_lab/mystudies', { headers: { 'x-admin-key': key } });
  assert((await r.json()).some(x => x.id === 'kept-study'), 'studies survive a restart');
  assert.equal((await fetch(lab.base + '/nope')).status, 404);
  await stop(lab.child);
  console.log('launcher: starts with one command, makes a key and an example study, serves pages and media, keeps data');

  // the console honors #key= only on this computer
  const adminJs = await readFile(join(ROOT, 'static/lab/engine/admin.js'), 'utf8');
  assert(/#key=/.test(adminJs) && /localhost\|127/.test(adminJs) && /history\.replaceState/.test(adminJs), '#key= is read on localhost only and removed from the address');
  console.log('launcher: all checks passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
