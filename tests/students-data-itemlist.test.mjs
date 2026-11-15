// ItemList JSON-LD on /ccair/students/data/ (scripts/build-students.mjs, datasetListLd).
// Run after a build: node --test tests/students-data-itemlist.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// The single JSON-LD block holds one ItemList with one ListItem (position, name, url only) per dataset card, in card order,
// with the same name and the same dataset page URL as the card; numberOfItems equals the card count; no per-item Dataset node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const FILE = path.join(SITE, 'ccair/students/data/index.html');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

test('built page exists', () => {
  assert.ok(fs.existsSync(FILE), `no build in ${SITE}; run the full build first`);
});

test('ItemList matches the dataset cards', () => {
  const doc = new JSDOM(fs.readFileSync(FILE, 'utf8')).window.document;
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  assert.equal(scripts.length, 1, 'one JSON-LD block');
  const nodes = [].concat(JSON.parse(scripts[0].textContent)['@graph']);
  const lists = nodes.filter((n) => n['@type'] === 'ItemList');
  assert.equal(lists.length, 1, 'exactly one ItemList');
  assert.equal(nodes.filter((n) => n['@type'] === 'Dataset').length, 1, 'only the catalog itself is a Dataset');
  const items = lists[0].itemListElement;
  const cards = [...doc.querySelectorAll('#ds-list > li.ds')];
  assert.ok(cards.length > 0);
  assert.equal(items.length, cards.length);
  assert.equal(lists[0].numberOfItems, cards.length);
  items.forEach((it, i) => {
    const c = cards[i];
    assert.deepEqual(Object.keys(it).sort(), ['@type', 'name', 'position', 'url'], `keys ${i + 1}`);
    assert.equal(it['@type'], 'ListItem');
    assert.equal(it.position, i + 1);
    assert.equal(it.name, norm(c.querySelector('h3').textContent), `name ${i + 1}`);
    const link = c.querySelector('.ds-links a');
    assert.ok(link, `card ${i + 1} has a dataset link`);
    assert.equal(it.url, link.getAttribute('href'), `url ${i + 1}`);
  });
});

test('page keeps one h1, main#main and the skip link', () => {
  const doc = new JSDOM(fs.readFileSync(FILE, 'utf8')).window.document;
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.ok(doc.querySelector('main#main'));
  assert.ok(doc.querySelector('a.skip[href="#main"]'));
});
