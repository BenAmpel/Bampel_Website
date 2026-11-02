#!/usr/bin/env node
// CCAIR Behavioral Lab: download a study's participant recordings, still sealed, for opening on this computer.
//   node scripts/lab/recordings.mjs pull --site https://bampel.com --study <id> --out <folder> [--keys <file>]
// --keys: one recording key per line (audio/<code>/s<n>/<item>-<kind>), for example the hand-audit set; all recordings if left out.
// Signs in with LAB_ADMIN_KEY (the owner key, sent as x-admin-key) or LAB_BEARER (an account session, sent as Authorization:
// Bearer); neither is ever printed. Each download is written to the study's activity log by the server (recording.download).
// Writes <name>.sealed for each sealed recording and manifest.json; then open them with
//   node scripts/lab/seal.mjs open-audio <key.json> <folder>
// A recording from before the study had a key is saved as it is (readable) and listed under "plain" in the manifest.
import { openSync, writeSync, closeSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), cmd = args[0];
const opt = name => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : undefined; };
const die = msg => { console.error(msg); process.exit(1); };
const AUDIO_KEY_RE = /^audio\/([^/]+)\/s(\d+)\/(t\d+|practice)-(call|voice)$/;   // as netlify/lib/lab/seal.mjs
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
function writeNew(path, data) { const fd = openSync(path, 'wx', 0o600); try { writeSync(fd, data); } finally { closeSync(fd); } }

if (cmd !== 'pull') die('Usage: node scripts/lab/recordings.mjs pull --site <https://...> --study <id> --out <folder> [--keys <file>]');
const site = String(opt('site') || '').replace(/\/+$/, ''), study = opt('study'), out = opt('out'), keysFile = opt('keys');
if (!/^https?:\/\/[^\s/]+/.test(site) || !study || !out) die('Give --site, --study and --out.');
const auth = process.env.LAB_ADMIN_KEY ? { 'x-admin-key': process.env.LAB_ADMIN_KEY } : process.env.LAB_BEARER ? { authorization: `Bearer ${process.env.LAB_BEARER}` } : null;
if (!auth) die('Set LAB_ADMIN_KEY (owner key) or LAB_BEARER (an account session token) in the environment.');
if (existsSync(out) && readdirSync(out).length) die(`${out} is not empty; choose another folder.`);
mkdirSync(out, { recursive: true, mode: 0o700 });

const base = `${site}/api/lab/${encodeURIComponent(study)}/admin/`;
async function getJSON(path) {
  const res = await fetch(base + path, { headers: auth });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${j.error || res.status}${j.hint ? ` (${j.hint})` : ''}`);
  return j;
}

let wanted = null;
if (keysFile) wanted = new Set(readFileSync(keysFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean));
const list = (await getJSON('recordings')).filter(r => AUDIO_KEY_RE.test(r.key) && (!wanted || wanted.has(r.key)));
if (wanted) for (const k of wanted) if (!list.some(r => r.key === k)) console.log(`not found: ${k}`);
const manifest = { format: 'ccair-lab-recordings', study, site, pulledAt: new Date().toISOString(), recordings: [], plain: [] };
let done = 0, failed = 0;
// Three at a time: quick enough for a hand-audit set, gentle on the site.
const queue = [...list];
await Promise.all([0, 1, 2].map(async () => {
  for (let r = queue.shift(); r; r = queue.shift()) {
    try {
      const g = await getJSON('recording?key=' + encodeURIComponent(r.key));
      const name = `${r.code}_s${r.session}_${r.item}_${r.kind}.${EXT[g.mime] || 'webm'}`;
      if (g.sealed) { writeNew(join(out, name + '.sealed'), Buffer.from(g.data, 'base64')); manifest.recordings.push({ key: r.key, file: name + '.sealed', mime: g.mime, kid: g.sealed.kid, by: g.sealed.by }); }
      else { writeNew(join(out, name), Buffer.from(g.data, 'base64')); manifest.plain.push({ key: r.key, file: name, mime: g.mime }); }
      done++;
    } catch (e) { failed++; console.log(`failed: ${r.key}: ${e.message}`); }
  }
}));
manifest.recordings.sort((x, y) => x.key.localeCompare(y.key)); manifest.plain.sort((x, y) => x.key.localeCompare(y.key));
writeNew(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${done} recordings saved to ${out} (${manifest.recordings.length} sealed${manifest.plain.length ? `, ${manifest.plain.length} not sealed` : ''})${failed ? `; ${failed} failed` : ''}.`);
if (manifest.recordings.length) console.log(`Open them with: node scripts/lab/seal.mjs open-audio <key.json> ${out}`);
if (failed) process.exitCode = 1;
