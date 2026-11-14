// ItemList JSON-LD on /publications/ (layouts/partials/publications_itemlist_jsonld.html).
// Run after a build: node --test tests/publications-itemlist.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// The ItemList holds one ScholarlyArticle per visible .pub-item, in the same order, with the same title, year and venue;
// it parses as JSON; the BreadcrumbList is still there; no other page carries an ItemList; the page keeps one h1,
// main#main and a skip link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const load = (file) => new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;
const blocks = (doc) => [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => [].concat(JSON.parse(s.textContent)));

function pages(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) out.push(...pages(dir, r));
    else if (e.name.endsWith('.html')) out.push(r);
  }
  return out;
}

test('built site exists', () => {
  assert.ok(fs.existsSync(path.join(SITE, 'publications/index.html')), `no build in ${SITE}; run the Hugo build first`);
});

test('ItemList matches the visible publication list', () => {
  const doc = load('publications/index.html');
  const lists = blocks(doc).filter((d) => d['@type'] === 'ItemList');
  assert.equal(lists.length, 1, 'exactly one ItemList');
  const items = lists[0].itemListElement;
  const visible = [...doc.querySelectorAll('#pub-filter-list .pub-item')];
  assert.ok(visible.length > 0);
  assert.equal(items.length, visible.length);
  assert.equal(lists[0].numberOfItems, visible.length);
  items.forEach((it, i) => {
    const v = visible[i];
    const art = it.item;
    assert.equal(it['@type'], 'ListItem');
    assert.equal(it.position, i + 1);
    assert.equal(art['@type'], 'ScholarlyArticle');
    assert.equal(art.name, norm(v.querySelector('.pub-title').textContent), `title ${i + 1}`);
    const meta = norm(v.querySelector('.pub-meta').textContent).split(' · ');
    assert.equal(String(art.datePublished).slice(0, 4), meta[0], `year ${i + 1}`);
    assert.equal(art.isPartOf?.name, meta[1], `venue ${i + 1}`);
    const authors = norm(v.querySelector('.pub-authors').textContent);
    assert.equal((art.author || []).map((a) => a.name).join(', '), authors, `authors ${i + 1}`);
    const link = v.querySelector('a.pub-title');
    if (link) assert.equal(new URL(art.url).pathname, new URL(link.getAttribute('href'), 'https://x.test').pathname);
    else assert.equal(art.url, undefined);
  });
});

test('BreadcrumbList is still on /publications/', () => {
  const crumbs = blocks(load('publications/index.html')).filter((d) => d['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.length, 1);
  assert.ok(crumbs[0].itemListElement.length >= 2);
});

test('/publications/ keeps one h1, main#main and a skip link', () => {
  const doc = load('publications/index.html');
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.ok(doc.querySelector('main#main'));
  assert.ok(doc.querySelector('a[href="#main"]'));
});

test('no other page carries an ItemList of ScholarlyArticle', () => {
  const found = [];
  for (const file of pages(SITE)) {
    if (file === 'publications/index.html' || /^(ccair|lab)\//.test(file)) continue;
    const html = fs.readFileSync(path.join(SITE, file), 'utf8');
    if (!html.includes('"ItemList"')) continue;
    if (blocks(load(file)).some((d) => d['@type'] === 'ItemList')) found.push(file);
  }
  assert.deepEqual(found, []);
});
