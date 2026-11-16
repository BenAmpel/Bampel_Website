// JSON-LD on the four public CCAIR Behavioral Lab pages (static/lab/{,guide,analysis,support}/index.html).
// Run after a build: node --test tests/lab-jsonld.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// /lab/ carries one WebPage whose mainEntity is the lab (ResearchOrganization) inside the CCAIR center inside Georgia State
// University. The other three carry one BreadcrumbList (Home, Lab, page) and one WebPage. Every block parses, uses the
// https://schema.org context, uses absolute bampel.com URLs, and its page URL equals the canonical link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const ORIGIN = 'https://bampel.com';
const PAGES = ['lab/index.html', 'lab/guide/index.html', 'lab/analysis/index.html', 'lab/support/index.html'];
const SUBPAGES = PAGES.slice(1);

function load(file) {
  const doc = new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  return { doc, blocks, canonical: doc.querySelector('link[rel="canonical"]').getAttribute('href') };
}
const metaDescription = (doc) => doc.querySelector('meta[name="description"]').getAttribute('content');
const isAbsolute = (u) => typeof u === 'string' && u.startsWith(`${ORIGIN}/`) && new URL(u).origin === ORIGIN;

test('built site exists', () => {
  assert.ok(fs.existsSync(path.join(SITE, 'index.html')), `no build in ${SITE}; run the Hugo build first`);
});

for (const file of PAGES) {
  test(`${file}: JSON-LD parses, schema.org context, canonical URL`, () => {
    const { doc, blocks, canonical } = load(file);
    assert.equal(blocks.length, file === 'lab/index.html' ? 1 : 2, 'unexpected number of JSON-LD blocks');
    for (const b of blocks) assert.equal(b['@context'], 'https://schema.org');
    const pages = blocks.filter((b) => b['@type'] === 'WebPage');
    assert.equal(pages.length, 1, 'expected exactly one WebPage');
    assert.equal(pages[0].url, canonical);
    assert.equal(pages[0].name, doc.title.trim());
    assert.equal(pages[0].description, metaDescription(doc));
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.ok(doc.querySelector('main#main'));
  });
}

test('lab/index.html: lab organization inside CCAIR inside Georgia State University', () => {
  const { doc, blocks, canonical } = load('lab/index.html');
  assert.equal(blocks[0]['@type'], 'WebPage');
  const lab = blocks[0].mainEntity;
  assert.equal(lab['@type'], 'ResearchOrganization');
  assert.equal(lab.name, 'CCAIR Behavioral Lab');
  assert.equal(lab.url, canonical);
  assert.equal(lab.description, metaDescription(doc));
  const ccair = lab.parentOrganization;
  assert.equal(ccair.name, 'Center for CyberAI Research');
  assert.ok(isAbsolute(ccair.url));
  assert.equal(ccair.parentOrganization.name, 'Georgia State University');
  const visible = doc.body.textContent;
  for (const name of [lab.name, ccair.name, ccair.parentOrganization.name]) {
    assert.ok(visible.includes(name) || doc.title.includes(name) || metaDescription(doc).includes(name), `${name} is not on the page`);
  }
});

for (const file of SUBPAGES) {
  test(`${file}: BreadcrumbList Home, Lab, page`, () => {
    const { doc, blocks, canonical } = load(file);
    const crumbs = blocks.filter((b) => b['@type'] === 'BreadcrumbList');
    assert.equal(crumbs.length, 1, 'expected exactly one BreadcrumbList');
    const items = crumbs[0].itemListElement;
    assert.equal(items.length, 3);
    items.forEach((it, i) => {
      assert.equal(it['@type'], 'ListItem');
      assert.equal(it.position, i + 1);
      assert.ok(it.name && it.name.trim());
      assert.ok(isAbsolute(it.item), `item URL not absolute: ${it.item}`);
    });
    assert.equal(items[0].item, `${ORIGIN}/`);
    assert.equal(items[1].item, `${ORIGIN}/lab/`);
    assert.equal(items[2].item, canonical, 'last breadcrumb URL must equal the canonical');
    assert.equal(items[2].name, doc.querySelector('h1').textContent.trim());
  });
}
