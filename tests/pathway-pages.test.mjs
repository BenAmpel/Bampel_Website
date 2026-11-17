// Page basics for the Pathway Finder (/ccair/pathways/) and the student guides (/ccair/students/), built by
// scripts/build-pathways.mjs and scripts/build-students.mjs.
// Run after a build: node --test tests/pathway-pages.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// Every built page there has exactly one h1, a main#main, a skip link to #main, an absolute https://bampel.com canonical
// URL that ends in the page's own path, a meta description of 110-160 characters, and JSON-LD that parses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const SECTIONS = ['ccair/pathways', 'ccair/students'];

function pages(rel) {
  const out = [];
  for (const e of fs.readdirSync(path.join(SITE, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) out.push(...pages(r));
    else if (e.name === 'index.html') out.push(r);
  }
  return out;
}

test('built site has the pathway and student pages', () => {
  for (const s of SECTIONS) assert.ok(fs.existsSync(path.join(SITE, s, 'index.html')), `no ${s}/index.html in ${SITE}; run the Hugo build first`);
});

for (const file of SECTIONS.flatMap(pages).sort()) {
  test(`${file}: h1, main, skip link, canonical, description, JSON-LD`, () => {
    const doc = new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;
    assert.equal(doc.querySelectorAll('h1').length, 1, 'expected exactly one h1');
    assert.equal(doc.querySelectorAll('main#main').length, 1, 'expected exactly one main#main');
    assert.ok(doc.querySelector('a[href="#main"]'), 'no skip link pointing at #main');

    const urlPath = '/' + file.replace(/index\.html$/, '');
    const canon = doc.querySelectorAll('link[rel="canonical"]');
    assert.equal(canon.length, 1, 'expected one canonical link');
    const href = canon[0].getAttribute('href');
    assert.ok(href.startsWith('https://bampel.com/'), `canonical is not an absolute https://bampel.com URL: ${href}`);
    assert.ok(href.endsWith(urlPath), `canonical ${href} does not end in ${urlPath}`);

    const m = doc.querySelectorAll('meta[name="description"]');
    assert.equal(m.length, 1, 'expected one meta description');
    const len = m[0].getAttribute('content').trim().length;
    assert.ok(len >= 110 && len <= 160, `description is ${len} characters, expected 110-160`);

    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      assert.doesNotThrow(() => JSON.parse(s.textContent), 'JSON-LD does not parse');
    }
  });
}
