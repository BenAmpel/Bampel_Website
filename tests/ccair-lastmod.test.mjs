// CCAIR sitemap lastmod: dates come from git history, never the clock, so building the same commit twice is identical
// and changing one page's inputs moves only that page. Covers the resolver, git lookups (full and shallow clone), and
// two real builds of the same tree (data/ccair/app-lastmod.json and static/ccair/sitemap.xml must not change).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { makeGit, resolveLastmod } = require('../scripts/ccair-lastmod.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const none = { inputsDate: () => null, headDate: () => '2026-01-09' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('unchanged hash keeps the committed date, even when git says otherwise', () => {
  const g = { inputsDate: () => '2026-12-31', headDate: () => '2026-12-31' };
  assert.equal(resolveLastmod({ hash: 'a', lastmod: '2026-01-02' }, 'a', ['x'], g), '2026-01-02');
});

test('changed hash takes the date of the last commit to the inputs, not today', () => {
  const g = { inputsDate: (p) => (p[0] === 'x' ? '2026-03-04' : null), headDate: () => '2026-05-06' };
  assert.equal(resolveLastmod({ hash: 'a', lastmod: '2026-01-02' }, 'b', ['x'], g), '2026-03-04');
  assert.equal(resolveLastmod(undefined, 'b', ['x'], g), '2026-03-04');
});

test('no usable history: committed date, then the checked-out commit date, never the clock', () => {
  assert.equal(resolveLastmod({ hash: 'a', lastmod: '2026-01-02' }, 'b', ['x'], none), '2026-01-02');
  assert.equal(resolveLastmod(undefined, 'b', ['x'], none), '2026-01-09');
  assert.equal(resolveLastmod(undefined, 'b', ['x'], { inputsDate: () => null, headDate: () => null }), null);
});

test('git lookups: last commit per path, and a shallow clone refuses to guess', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccair-lastmod-'));
  const env = (d) => ({ GIT_AUTHOR_DATE: `${d}T12:00:00Z`, GIT_COMMITTER_DATE: `${d}T12:00:00Z` });
  const run = (cwd, d, ...a) => execFileSync('git', a, { cwd, env: { ...process.env, ...env(d) }, stdio: 'ignore' });
  try {
    const src = path.join(tmp, 'src'), shallow = path.join(tmp, 'shallow');
    fs.mkdirSync(src);
    run(src, '2026-01-01', 'init', '-q');
    run(src, '2026-01-01', 'config', 'user.email', 't@example.com');
    run(src, '2026-01-01', 'config', 'user.name', 't');
    fs.writeFileSync(path.join(src, 'a.txt'), '1'); fs.writeFileSync(path.join(src, 'b.txt'), '1');
    run(src, '2026-01-01', 'add', 'a.txt', 'b.txt'); run(src, '2026-01-01', 'commit', '-q', '-m', 'one');
    fs.writeFileSync(path.join(src, 'b.txt'), '2');
    run(src, '2026-02-02', 'add', 'b.txt'); run(src, '2026-02-02', 'commit', '-q', '-m', 'two');
    const full = makeGit(src);
    assert.equal(full.inputsDate(['a.txt']), '2026-01-01');
    assert.equal(full.inputsDate(['b.txt']), '2026-02-02');
    assert.equal(full.inputsDate(['a.txt', 'b.txt']), '2026-02-02');
    execFileSync('git', ['clone', '-q', '--depth', '1', 'file://' + src, shallow], { stdio: 'ignore' });
    const sh = makeGit(shallow);
    assert.equal(sh.inputsDate(['a.txt']), null, 'shallow: a.txt would wrongly read 2026-02-02');
    assert.equal(sh.headDate(), '2026-02-02');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('two builds of the same tree give identical app-lastmod.json and sitemap', () => {
  const store = path.join(ROOT, 'data/ccair/app-lastmod.json'), sitemap = path.join(ROOT, 'static/ccair/sitemap.xml');
  const build = () => execFileSync('npm', ['run', '--silent', 'build:ccair'], { cwd: ROOT, stdio: 'ignore' });
  const snap = () => [fs.readFileSync(store, 'utf8'), fs.readFileSync(sitemap, 'utf8')];
  const orig = fs.readFileSync(store, 'utf8');
  try {
    build(); const first = snap();
    build(); const second = snap();
    assert.deepEqual(second, first);
    assert.match(first[1], /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    const pages = JSON.parse(first[0]).pages;
    for (const [u, e] of Object.entries(pages)) assert.match(e.lastmod, /^\d{4}-\d{2}-\d{2}$/, u);
  } finally { fs.writeFileSync(store, orig); }
});
