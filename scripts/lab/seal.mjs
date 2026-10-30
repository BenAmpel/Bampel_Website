#!/usr/bin/env node
// CCAIR Behavioral Lab: sealed fields from the command line (netlify/lib/lab/seal.mjs).
//   node scripts/lab/seal.mjs keygen <study-id> [out.json]        make a key pair; prints the public key to paste into the admin page
//   node scripts/lab/seal.mjs open <key.json> <export file> [out]  open sealed values in a CSV, JSON or JSONL export
// Works where the browser cannot (an older browser, a large export, a backup file). Nothing is sent anywhere.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateKeys, unsealText } from '../../netlify/lib/lab/seal.mjs';

const [cmd, a, b, c] = process.argv.slice(2);
const die = msg => { console.error(msg); process.exit(1); };

if (cmd === 'keygen') {
  if (!a) die('Usage: node scripts/lab/seal.mjs keygen <study-id> [out.json]');
  const out = b || `${a}-private-key.json`;
  if (existsSync(out)) die(`${out} already exists; refusing to overwrite a key file.`);
  const { publicKey, privateKey } = generateKeys(a);
  writeFileSync(out, JSON.stringify(privateKey, null, 2) + '\n', { mode: 0o600 });
  console.log(`Private key: ${out} (key ${privateKey.kid}). Keep it off shared drives; whoever has it can read this study's sealed fields.`);
  console.log(`Public key (paste on the study's Encryption tab): ${publicKey}`);
} else if (cmd === 'open') {
  if (!a || !b) die('Usage: node scripts/lab/seal.mjs open <key.json> <export file> [out]');
  const key = JSON.parse(readFileSync(a, 'utf8'));
  if (key.crv !== 'X25519' || !key.x || !key.d) die(`${a} is not a lab key file.`);
  const format = /\.(json|jsonl)$/i.test(b) ? 'json' : 'csv';
  const r = unsealText(readFileSync(b, 'utf8'), key, { format });
  const out = c || b.replace(/(\.[^./]+)?$/, '-opened$1');
  if (existsSync(out)) die(`${out} already exists; choose another name.`);
  writeFileSync(out, r.text, { mode: 0o600 });
  console.log(`${r.opened} values opened${r.other ? `, ${r.other} sealed with another key left as they are` : ''}: ${out}`);
} else die('Usage: node scripts/lab/seal.mjs keygen <study-id> [out.json] | open <key.json> <export file> [out]');
