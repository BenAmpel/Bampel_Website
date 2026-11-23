// ProfilePage JSON-LD on /cv/ (layouts/partials/hooks/head-start/seo-identity.html).
// Run after a build: node --test tests/cv-profilepage-jsonld.test.mjs   (reads ./public, or the folder in CV_PROFILEPAGE_SITE)
// Every ld+json block on / and /cv/ parses; /cv/ has exactly one ProfilePage whose mainEntity @id equals the homepage
// Person @id; the page adds no Person facts of its own; no other page carries a ProfilePage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.CV_PROFILEPAGE_SITE || path.join(ROOT, 'public'));

function blocks(file) {
  const doc = new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;
  const out = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    out.push(...[].concat(JSON.parse(s.textContent))); // throws on invalid JSON
  }
  return { doc, out };
}

test('built site exists', () => {
  assert.ok(fs.existsSync(path.join(SITE, 'cv/index.html')), `no build in ${SITE}; run the Hugo build first`);
});

test('/cv/ ProfilePage points at the homepage Person by @id', () => {
  const home = blocks('index.html').out.find((d) => d['@type'] === 'Person');
  assert.ok(home && home['@id'], 'homepage has a Person with an @id');
  const { doc, out } = blocks('cv/index.html');
  const pages = out.filter((d) => d['@type'] === 'ProfilePage');
  assert.equal(pages.length, 1, 'exactly one ProfilePage on /cv/');
  const pp = pages[0];
  assert.equal(pp['@context'], 'https://schema.org');
  assert.equal(pp.mainEntity['@id'], home['@id']);
  assert.deepEqual(Object.keys(pp.mainEntity), ['@id'], 'mainEntity is a bare reference, no new facts');
  assert.equal(pp.url, 'https://bampel.com/cv/');
  assert.equal(pp['@id'], 'https://bampel.com/cv/#profilepage');
  assert.equal(pp.name, doc.title);
  assert.equal(pp.description, doc.querySelector('meta[name="description"]').content);
  assert.ok(!out.some((d) => d['@type'] === 'Person'), 'no second Person on /cv/');
});

test('ProfilePage appears only on /cv/', () => {
  for (const f of ['index.html', 'research/index.html', 'publications/index.html']) {
    assert.ok(!blocks(f).out.some((d) => d['@type'] === 'ProfilePage'), `${f} has no ProfilePage`);
  }
});
