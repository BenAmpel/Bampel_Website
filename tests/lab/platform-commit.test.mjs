// Which commit the lab reports (design files, codebooks, reproducibility bundles): the Netlify build step writes
// COMMIT_REF into netlify/lib/lab/build-info.mjs (functions cannot read COMMIT_REF at run time); locally the commit
// comes from the checkout. Always the short form. The build step is run on a copy, never on the repository's file.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { platformInfo, shortCommit, _resetPlatformInfo } from '../../netlify/lib/lab/version.mjs';
import { BUILD_COMMIT } from '../../netlify/lib/lab/build-info.mjs';

const FULL = '0123456789abcdef0123456789abcdef01234567';
assert.equal(BUILD_COMMIT, '', 'the repository keeps build-info.mjs empty (only a Netlify build fills it)');
assert.equal(shortCommit(FULL), '0123456'); assert.equal(shortCommit('nope'), null); assert.equal(shortCommit(''), null);

const at = (env, build) => { _resetPlatformInfo(); const c = platformInfo(env, build).commit; _resetPlatformInfo(); return c; };
assert.equal(at({}, FULL), '0123456', 'the commit written by the build');
assert.equal(at({ LAB_COMMIT: 'fedcba9876543210' }, FULL), 'fedcba9', 'LAB_COMMIT wins');
assert.equal(at({ COMMIT_REF: 'abcdef0123456789' }, ''), 'abcdef0', 'COMMIT_REF when a host does pass it');
const local = at({}, '');
const git = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' });
if (git.status === 0) assert.equal(local, git.stdout.trim(), 'locally: the checkout\'s commit');
else assert(/^[0-9a-f]{7}$|^unknown$/.test(local));

// the build step, on a copy of the two files
const tmp = mkdtempSync(join(tmpdir(), 'lab-buildinfo-'));
try {
  mkdirSync(join(tmp, 'scripts', 'lab'), { recursive: true }); mkdirSync(join(tmp, 'netlify', 'lib', 'lab'), { recursive: true });
  const script = join(tmp, 'scripts', 'lab', 'build-info.mjs'), mod = join(tmp, 'netlify', 'lib', 'lab', 'build-info.mjs');
  copyFileSync(fileURLToPath(new URL('../../scripts/lab/build-info.mjs', import.meta.url)), script);
  copyFileSync(fileURLToPath(new URL('../../netlify/lib/lab/build-info.mjs', import.meta.url)), mod);
  const before = readFileSync(mod, 'utf8');
  const run = env => spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(run({}).status, 0); assert.equal(readFileSync(mod, 'utf8'), before, 'no COMMIT_REF: the file is left alone');
  assert.equal(run({ COMMIT_REF: "x'; process.exit(1); '" }).status, 0); assert.equal(readFileSync(mod, 'utf8'), before, 'a value that is not a commit is never written');
  assert.equal(run({ COMMIT_REF: FULL.toUpperCase() }).status, 0);
  assert.equal((await import(pathToFileURL(mod).href + '?v=1')).BUILD_COMMIT, FULL, 'the build commit is written');
} finally { if (tmp.startsWith(join(tmpdir(), 'lab-buildinfo-'))) rmSync(tmp, { recursive: true, force: true }); }

// the netlify.toml build command runs the step before the functions are bundled
assert(/command = "[^"]*node scripts\/lab\/build-info\.mjs[^"]*"/.test(readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8')), 'netlify.toml runs the build step');
console.log('platform commit: short form, from the Netlify build, LAB_COMMIT, or the local checkout');
