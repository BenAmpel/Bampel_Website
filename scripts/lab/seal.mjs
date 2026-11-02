#!/usr/bin/env node
// CCAIR Behavioral Lab: sealed fields from the command line (netlify/lib/lab/seal.mjs).
//   node scripts/lab/seal.mjs keygen <study-id> [out.json]          make a key pair; prints the public key to paste into the admin page
//   node scripts/lab/seal.mjs wrap <key.json> [out.json]             a passphrase-protected copy of a key file (for shared storage)
//   node scripts/lab/seal.mjs open <key.json> <export file> [out]    open sealed values in a CSV, JSON or JSONL export
//   node scripts/lab/seal.mjs open-audio <key.json> <folder> [out]   open sealed recordings (a folder with manifest.json, from the
//                                                                    Recordings tab's zip or scripts/lab/recordings.mjs pull)
// A key file may be the plain one or the wrapped copy; the passphrase comes from LAB_KEY_PASSPHRASE or is asked for.
// Works where the browser cannot (an older browser, a large export, a backup file). Nothing is sent anywhere.
import { readFileSync, writeFileSync, existsSync, openSync, writeSync, closeSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';
import { generateKeys, unsealText, wrapKey, unwrapKey, isWrapped, openBytes, binAad, audioMime, AUDIO_KEY_RE } from '../../netlify/lib/lab/seal.mjs';

const [cmd, a, b, c] = process.argv.slice(2);
const die = msg => { console.error(msg); process.exit(1); };
const USAGE = 'Usage: node scripts/lab/seal.mjs keygen <study-id> [out.json] | wrap <key.json> [out.json] | open <key.json> <export file> [out] | open-audio <key.json> <folder> [out]';

// A passphrase, never echoed or printed.
function askHidden(question) {
  if (process.env.LAB_KEY_PASSPHRASE) return Promise.resolve(process.env.LAB_KEY_PASSPHRASE);
  if (!process.stdin.isTTY) die('Set LAB_KEY_PASSPHRASE, or run this in a terminal to be asked for the passphrase.');
  return new Promise(res => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(question); };
    rl.question(question, ans => { rl.close(); process.stdout.write('\n'); res(ans); });
  });
}
async function readKey(path) {
  let key;
  try { key = JSON.parse(readFileSync(path, 'utf8')); } catch { die(`${path} is not a lab key file.`); }
  if (isWrapped(key)) {
    try { key = unwrapKey(key, await askHidden(`Passphrase for ${basename(path)}: `)); } catch (e) { die(e.message); }
  }
  if (key.crv !== 'X25519' || !key.x || !key.d) die(`${path} is not a lab key file.`);
  return key;
}
// A new file only: refuses to overwrite, and is readable by its owner alone from the moment it exists.
function writeNew(path, data) { const fd = openSync(path, 'wx', 0o600); try { writeSync(fd, data); } finally { closeSync(fd); } }

if (cmd === 'keygen') {
  if (!a) die(USAGE);
  const out = b || `${a}-private-key.json`;
  if (existsSync(out)) die(`${out} already exists; refusing to overwrite a key file.`);
  const { publicKey, privateKey } = generateKeys(a);
  writeFileSync(out, JSON.stringify(privateKey, null, 2) + '\n', { mode: 0o600 });
  console.log(`Private key: ${out} (key ${privateKey.kid}). Keep it off shared drives; whoever has it can read this study's sealed fields.`);
  console.log(`Public key (paste on the study's Encryption tab): ${publicKey}`);
  console.log(`For a copy on shared storage, make a passphrase-protected one: node scripts/lab/seal.mjs wrap ${out}`);
} else if (cmd === 'wrap') {
  if (!a) die(USAGE);
  const key = await readKey(a), out = b || a.replace(/(\.json)?$/, '-wrapped.json');
  if (existsSync(out)) die(`${out} already exists; choose another name.`);
  const p1 = await askHidden('New passphrase (12+ characters): ');
  if (!process.env.LAB_KEY_PASSPHRASE && p1 !== await askHidden('Same passphrase again: ')) die('The passphrases differ; nothing was written.');
  let w;
  try { w = wrapKey(key, p1); } catch (e) { die(e.message); }
  writeNew(out, JSON.stringify(w, null, 2) + '\n');
  try { unwrapKey(JSON.parse(readFileSync(out, 'utf8')), p1); } catch { die(`${out} was written but does not open; do not rely on it.`); }
  console.log(`Wrapped copy of key ${w.kid}: ${out}. It opens with the passphrase only; keep the passphrase apart from the file.`);
} else if (cmd === 'open') {
  if (!a || !b) die(USAGE);
  const key = await readKey(a);
  const format = /\.(json|jsonl)$/i.test(b) ? 'json' : 'csv';
  const r = unsealText(readFileSync(b, 'utf8'), key, { format });
  const out = c || b.replace(/(\.[^./]+)?$/, '-opened$1');
  if (existsSync(out)) die(`${out} already exists; choose another name.`);
  writeFileSync(out, r.text, { mode: 0o600 });
  console.log(`${r.opened} values opened${r.other ? `, ${r.other} sealed with another key left as they are` : ''}: ${out}`);
} else if (cmd === 'open-audio') {
  if (!a || !b) die(USAGE);
  const key = await readKey(a);
  let man;
  try { man = JSON.parse(readFileSync(join(b, 'manifest.json'), 'utf8')); } catch { die(`${b} has no manifest.json (save recordings with the Recordings tab's zip, unzipped, or with scripts/lab/recordings.mjs pull).`); }
  const out = c || `${b.replace(/\/+$/, '')}-opened`;
  if (existsSync(out) && readdirSync(out).length) die(`${out} is not empty; choose another folder.`);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
  let opened = 0; const failed = [];
  for (const r of man.recordings || []) {
    // The storage key names the output file and rebuilds the additional data; nothing else in the manifest is trusted for that.
    const m = AUDIO_KEY_RE.exec(String(r.key || ''));
    if (!m || typeof r.file !== 'string' || basename(r.file) !== r.file) { failed.push(`${r.key}: not a recording key`); continue; }
    const mime = audioMime(r.mime), name = `${m[1]}_s${m[2]}_${m[3]}_${m[4]}.${EXT[mime] || 'webm'}`;
    try {
      const bytes = openBytes(readFileSync(join(b, r.file)), key, binAad(r.kid, r.key.slice(6), mime));
      writeNew(join(out, name), bytes); opened++;
    } catch (e) { failed.push(`${r.key}: ${/another key/.test(e.message) ? e.message : e.code === 'EEXIST' ? 'already opened' : e.code === 'ENOENT' ? 'file missing' : 'did not open (changed in storage, or the wrong key)'}`); }
  }
  console.log(`${opened} recordings opened into ${out}.`);
  if (failed.length) { console.log(`${failed.length} not opened:`); for (const f of failed) console.log(`  ${f}`); process.exitCode = 1; }
} else die(USAGE);
