#!/usr/bin/env node
// Runs the CCAIR Behavioral Lab on this computer:  npm run lab
//
// - Studies and data are kept in .lab-data/ (next to this repository), so they survive a restart.
// - The first run makes an owner key (saved in .lab-data/owner-key.txt) and an example study
//   ("Example: vishing training") so there is something to look at.
// - Opens the researcher console in your browser, already signed in on this computer.
// - Optional settings go in a file named .env.lab at the top of the repository, one per line:
//     ANTHROPIC_API_KEY=...      the AI caller rephrases its scripted lines with Claude (without it, the script is used)
//     LAB_LLM_MODEL=...          another Claude model, for example claude-haiku-5-5 for faster replies
//     PORT=8899                  the first port to try
// Flags: --no-open (do not open a browser), --reset-example (re-create the example study's starting content).
// No `npm install` is needed: the lab's server code uses only Node itself (version 20 or newer).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`\nThe lab needs Node.js 20 or newer, and this computer has ${process.versions.node}.\nInstall the current LTS version from https://nodejs.org (the green button), then run "npm run lab" again.\n`);
  process.exit(1);
}

const REPO = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
// Settings file: KEY=VALUE lines; # starts a comment. Values already in the environment win.
const envFile = join(REPO, '.env.lab');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { labServer, listen } = await import('./lab/server.mjs');
const { fileBlobs } = await import('./lab/filestore.mjs');
const { blobsStore } = await import('../netlify/lib/lab/store.mjs');
const { createStudy, getStudy } = await import('../netlify/lib/lab/registry.mjs');
const { llmConfigured } = await import('../netlify/lib/lab/voicebot.mjs');

const DATA = process.env.LAB_DATA || join(REPO, '.lab-data');
mkdirSync(DATA, { recursive: true });
const keyFile = join(DATA, 'owner-key.txt');
let ownerKey = process.env.LAB_ADMIN_KEY;
if (!ownerKey) {
  if (!existsSync(keyFile)) writeFileSync(keyFile, 'lab-' + randomBytes(18).toString('base64url') + '\n', { mode: 0o600 });
  ownerKey = readFileSync(keyFile, 'utf8').trim();
}
if (ownerKey.length < 16) { console.error('The owner key must be at least 16 characters (LAB_ADMIN_KEY or .lab-data/owner-key.txt).'); process.exit(1); }
const getStore = fileBlobs(DATA);

// The example study, made once from the five-arm vishing template.
const registry = blobsStore(getStore, 'lab-registry');
if (!(await getStudy(registry, 'example-vishing'))) {
  const r = await createStudy(registry, { id: 'example-vishing', name: 'Example: vishing training (5 arms)', template: 'vishing-training',
    description: 'A worked example: five training arms, voicemail judgments with mouse tracking, and calls with an AI voice caller.' }, { name: 'lab setup' });
  if (!r.ok) console.warn('Could not create the example study:', r.error);
} else if (args.has('--reset-example')) {
  await blobsStore(getStore, 'lab-example-vishing').delete('content/current');
}

const server = labServer({ getStore, env: { LAB_ADMIN_KEY: ownerKey } });
let port;
try { port = await listen(server, Number(process.env.PORT || 8899), process.env.LAB_HOST || 'localhost'); }
catch (e) { console.error(`\nCould not start the lab web server (${e.code || e.message}). Is another copy already running? Close it, or set PORT in .env.lab.\n`); process.exit(1); }

const base = `http://localhost:${port}`, willOpen = !args.has('--no-open') && !process.env.CI;
// The key travels in the address's #fragment, which browsers never send to a server; the console stores it for
// this tab and removes it from the address bar at once.
const consoleUrl = `${base}/lab/admin/#key=${encodeURIComponent(ownerKey)}`;
const line = '─'.repeat(66);
console.log(`\n${line}\n  CCAIR Behavioral Lab is running\n${line}
  Researcher console   ${base}/lab/admin/   ${willOpen ? '(opening it in your browser, signed in)' : '(sign in with the owner key below)'}
  Lab home page        ${base}/lab/
  Example study        ${base}/lab/admin/example-vishing
  Owner key            saved in ${keyFile}
  Your data            ${DATA}
  AI caller            ${llmConfigured() ? 'Claude rephrases the scripted lines (' + (process.env.LAB_LLM_MODEL || 'claude-opus-5-5') + ')' : 'scripted lines (add ANTHROPIC_API_KEY to .env.lab to use Claude)'}

  Keep this window open while you work. Press Ctrl+C to stop the lab.
${line}\n`);

if (willOpen) {
  const [cmd, cmdArgs] = process.platform === 'darwin' ? ['open', [consoleUrl]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', consoleUrl]] : ['xdg-open', [consoleUrl]];
  try { spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => console.log('Open this address in your browser: ' + consoleUrl)).unref(); }
  catch { console.log('Open this address in your browser: ' + consoleUrl); }
}
const stop = () => { console.log('\nThe lab has stopped. Your data is still in ' + DATA + '.'); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
