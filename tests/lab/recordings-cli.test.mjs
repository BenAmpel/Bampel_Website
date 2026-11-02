// Sealed recordings on the command line (scripts/lab/recordings.mjs pull, scripts/lab/seal.mjs wrap and open-audio): a study
// with a key stores a participant's recordings sealed; pull downloads them still sealed with a manifest, never printing the
// credential; open-audio opens them with the key file or its passphrase-protected copy, byte for byte, writes files only its owner
// can read, refuses to overwrite, and ignores a manifest entry that is not a recording key.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import * as Seal from '../../netlify/lib/lab/seal.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const getStore = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
const call = async (path, { body, key } = {}) => {
  const res = await handle(new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  return { status: res.status, json: await res.json().catch(() => null) };
};

// A study with a key, and one participant with two recordings (one sealed in the "browser", one sealed on arrival).
assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'rec-cli', name: 'Rec CLI', template: 'voice-call' } })).json.ok);
const P = '/api/lab/rec-cli/', keys = Seal.generateKeys('rec-cli');
assert((await call(P + 'admin/seal-set', { key: OWNER, body: { publicKey: keys.publicKey } })).json.ok);
const code = (await call(P + 'admin/preview', { key: OWNER, body: {} })).json.code, tok = (await call(P + 'login', { body: { code } })).json.token;
assert((await call(P + 'consent', { body: { token: tok, agree: true, recording: true } })).json.ok);
const plan = (await call(P + 'session', { body: { token: tok } })).json, [i1, i2] = plan.trials.filter(t => t.item.kind === 'call').map(t => t.index);
const audio1 = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(5000, 7)]), audio2 = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(3000, 9)]);
const env1 = Seal.sealBytes(keys.publicKey, audio1, Seal.binAad(keys.privateKey.kid, `${plan.recordingTag}/t${i1}-call`, 'audio/ogg'));
assert((await call(P + 'media/upload', { body: { token: tok, session: 1, index: i1, kind: 'call', mime: 'audio/ogg;codecs=opus', data: env1.toString('base64'), sealed: { v: 1, kid: keys.privateKey.kid } } })).json.ok);
assert((await call(P + 'media/upload', { body: { token: tok, session: 1, index: i2, kind: 'call', mime: 'audio/webm', data: audio2.toString('base64') } })).json.ok);

// The lab over local HTTP, for the scripts.
const server = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await handle(new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}`;
const run = (args, env = {}) => new Promise(res => {
  const p = spawn(process.execPath, args, { cwd: root, env: { PATH: process.env.PATH, ...env } });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  p.on('close', status => res({ status, out }));
});

const tmp = mkdtempSync(join(tmpdir(), 'lab-rec-cli-'));
assert(tmp.startsWith(tmpdir()) && tmp.includes('lab-rec-cli-'));
try {
  const keyFile = join(tmp, 'key.json'), pulled = join(tmp, 'pulled');
  writeFileSync(keyFile, JSON.stringify(keys.privateKey), { mode: 0o600 });

  assert.notEqual((await run(['scripts/lab/recordings.mjs', 'pull', '--site', site, '--study', 'rec-cli', '--out', join(tmp, 'none')])).status, 0, 'no credential, no download');
  let r = await run(['scripts/lab/recordings.mjs', 'pull', '--site', site, '--study', 'rec-cli', '--out', pulled], { LAB_ADMIN_KEY: OWNER });
  assert.equal(r.status, 0, r.out); assert(!r.out.includes(OWNER), 'the credential is never printed');
  const man = JSON.parse(readFileSync(join(pulled, 'manifest.json'), 'utf8'));
  assert.equal(man.recordings.length, 2, 'both stored sealed'); assert.equal(man.plain.length, 0);
  assert.deepEqual(man.recordings.map(x => x.by).sort(), ['browser', 'server']);
  assert(readdirSync(pulled).every(f => f === 'manifest.json' || f.endsWith('.sealed')), 'nothing readable is downloaded');
  assert.notEqual((await run(['scripts/lab/recordings.mjs', 'pull', '--site', site, '--study', 'rec-cli', '--out', pulled], { LAB_ADMIN_KEY: OWNER })).status, 0, 'refuses a folder that is not empty');

  // a manifest entry that is not a recording key is skipped, never written outside the output folder
  const manBad = { ...man, recordings: [...man.recordings, { key: 'audio/../../evil', file: '../evil.sealed', mime: 'audio/ogg', kid: keys.privateKey.kid }] };
  writeFileSync(join(pulled, 'manifest.json'), JSON.stringify(manBad));
  const opened = join(tmp, 'opened');
  r = await run(['scripts/lab/seal.mjs', 'open-audio', keyFile, pulled, opened]);
  assert.equal(r.status, 1, 'reports what it could not open'); assert(/2 recordings opened/.test(r.out), r.out); assert(/not a recording key/.test(r.out));
  const files = readdirSync(opened).sort();
  assert.deepEqual(files, [`${code}_s1_t${i1}_call.ogg`, `${code}_s1_t${i2}_call.webm`].sort());
  assert(readFileSync(join(opened, `${code}_s1_t${i1}_call.ogg`)).equals(audio1) && readFileSync(join(opened, `${code}_s1_t${i2}_call.webm`)).equals(audio2), 'byte for byte');
  assert.equal(statSync(join(opened, files[0])).mode & 0o777, 0o600, 'readable by its owner only');
  assert.notEqual((await run(['scripts/lab/seal.mjs', 'open-audio', keyFile, pulled, opened])).status, 0, 'refuses to overwrite');

  // the passphrase-protected copy opens the same files; a wrong passphrase opens nothing
  const wrapped = join(tmp, 'key-wrapped.json');
  r = await run(['scripts/lab/seal.mjs', 'wrap', keyFile, wrapped], { LAB_KEY_PASSPHRASE: 'a long test passphrase' });
  assert.equal(r.status, 0, r.out); assert(!readFileSync(wrapped, 'utf8').includes(keys.privateKey.d), 'the wrapped copy does not hold the key readable');
  writeFileSync(join(pulled, 'manifest.json'), JSON.stringify(man));
  assert.notEqual((await run(['scripts/lab/seal.mjs', 'open-audio', wrapped, pulled, join(tmp, 'o2')], { LAB_KEY_PASSPHRASE: 'the wrong passphrase' })).status, 0);
  r = await run(['scripts/lab/seal.mjs', 'open-audio', wrapped, pulled, join(tmp, 'o3')], { LAB_KEY_PASSPHRASE: 'a long test passphrase' });
  assert.equal(r.status, 0, r.out); assert.equal(readdirSync(join(tmp, 'o3')).length, 2);

  // the hand-audit set: only the listed keys
  const listFile = join(tmp, 'keys.txt'); writeFileSync(listFile, `audio/${code}/s1/t${i2}-call\n`);
  r = await run(['scripts/lab/recordings.mjs', 'pull', '--site', site, '--study', 'rec-cli', '--out', join(tmp, 'some'), '--keys', listFile], { LAB_ADMIN_KEY: OWNER });
  assert.equal(r.status, 0, r.out); assert.equal(JSON.parse(readFileSync(join(tmp, 'some', 'manifest.json'), 'utf8')).recordings.length, 1);
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log('recordings CLI: pull (sealed, credential never printed, key list), open-audio (byte for byte, 0600, no overwrite, bad entries skipped), wrapped key');
