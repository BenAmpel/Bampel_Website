// The /ccair/publications/ shell carries every publication as static HTML (scripts/build-ccair.js, publicationsList).
// Run after the build: node --test tests/ccair-publications-static.test.mjs
// (reads public/ccair/publications/index.html when a Hugo build exists, else static/ccair/publications/index.html).
// The static <li> count and order equal publications.json; every DOI links to doi.org; the shell keeps one h1,
// the skip link and the summary nav; the other route shells carry no publication list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(ROOT, 'public/ccair/publications/index.html');
const file = fs.existsSync(built) ? built : path.join(ROOT, 'static/ccair/publications/index.html');
const pubs = JSON.parse(fs.readFileSync(path.join(ROOT, 'static/ccair/data/publications.json'), 'utf8'));
const doc = () => new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('static list has one entry per publication, in the default order', () => {
  const items = [...doc().querySelectorAll('#root ol.pub-list > li.pub')];
  assert.equal(items.length, pubs.length);
  const expected = pubs.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  items.forEach((li, i) => {
    assert.equal(norm(li.querySelector('cite').textContent), norm(expected[i].title), `entry ${i} title`);
    assert.equal(norm(li.querySelector('.authors').textContent), norm(expected[i].authors || ''));
    assert.ok(norm(li.querySelector('.venue').textContent).includes(String(expected[i].year)), `entry ${i} year`);
  });
});

test('every DOI links to doi.org', () => {
  const hrefs = [...doc().querySelectorAll('#root ol.pub-list a[href^="https://doi.org/"]')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs.sort(), pubs.filter((p) => p.doi).map((p) => 'https://doi.org/' + p.doi).sort());
});

test('the shell keeps one h1, the skip link, and no inline-style additions in the list', () => {
  const d = doc();
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.ok(d.querySelector('a.skip[href="#main-content"]'));
  assert.equal(d.querySelectorAll('ol.pub-list [style]').length, 0);
});

test('other route shells have no publication list', () => {
  const people = path.join(path.dirname(file), '..', 'people', 'index.html');
  assert.ok(!/class="pub-list"/.test(fs.readFileSync(people, 'utf8')));
});
