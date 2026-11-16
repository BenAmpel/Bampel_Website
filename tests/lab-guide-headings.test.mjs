// Deep links on the researcher guide (/lab/guide/): every h2 and h3 has a unique id, every in-page href="#..." resolves
// to an id, the "On this page" list covers every h2, and heading levels never skip.
// Run after a build: node --test tests/lab-guide-headings.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const FILE = path.join(SITE, 'lab/guide/index.html');

test('built site exists', () => {
  assert.ok(fs.existsSync(FILE), `no ${FILE}; run the Hugo build first`);
});

const doc = fs.existsSync(FILE) ? new JSDOM(fs.readFileSync(FILE, 'utf8')).window.document : null;
const headings = doc ? [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')] : [];
const ids = doc ? [...doc.querySelectorAll('[id]')].map((e) => e.id) : [];

test('one h1', () => {
  assert.equal(headings.filter((h) => h.tagName === 'H1').length, 1);
});

test('every h2 and h3 has an id, and ids are unique on the page', () => {
  const missing = headings.filter((h) => /^H[23]$/.test(h.tagName) && !h.id).map((h) => h.textContent.trim());
  assert.deepEqual(missing, [], 'headings without an id');
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], 'duplicate ids');
});

test('every in-page href="#..." resolves to an id', () => {
  const idSet = new Set(ids);
  const broken = [...doc.querySelectorAll('a[href^="#"]')]
    .map((a) => a.getAttribute('href').slice(1))
    .filter((id) => id && !idSet.has(decodeURIComponent(id)));
  assert.deepEqual(broken, []);
});

test('the "On this page" list links to every h2', () => {
  const toc = new Set([...doc.querySelectorAll('nav.toc a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)));
  assert.ok(toc.size > 0, 'no table of contents');
  const unlisted = headings.filter((h) => h.tagName === 'H2' && !toc.has(h.id)).map((h) => h.textContent.trim());
  assert.deepEqual(unlisted, []);
});

test('heading levels do not skip', () => {
  let prev = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    assert.ok(level <= prev + 1, `"${h.textContent.trim()}" is h${level} after h${prev}`);
    prev = level;
  }
});
