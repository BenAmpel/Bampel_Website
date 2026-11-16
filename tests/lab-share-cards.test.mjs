// Open Graph and Twitter card tags on the four public CCAIR Behavioral Lab pages (static/lab/{,guide,analysis,support}/index.html).
// Run after a build: node --test tests/lab-share-cards.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// Each page carries og:title and og:description equal to its <title> and meta description, og:url equal to its canonical link,
// og:type website, og:site_name, an absolute https og:image that exists in the build with the width and height written in the
// tags, og:image:alt, and twitter:card summary_large_image. Each page keeps one h1, main#main and a skip link.
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
const load = (file) => new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;

function meta(doc, attr, name) {
  const found = [...doc.querySelectorAll(`meta[${attr}="${name}"]`)];
  assert.equal(found.length, 1, `${name}: expected exactly one tag, found ${found.length}`);
  const v = found[0].getAttribute('content');
  assert.ok(v && v.trim(), `${name}: empty content`);
  return v;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test('built site exists', () => {
  assert.ok(fs.existsSync(path.join(SITE, 'index.html')), `no build in ${SITE}; run the Hugo build first`);
});

for (const file of PAGES) {
  test(`${file}: share card tags`, () => {
    const doc = load(file);
    const canonical = doc.querySelector('link[rel="canonical"]').getAttribute('href');
    assert.match(canonical, /^https:\/\/bampel\.com\/lab\//);
    assert.equal(meta(doc, 'property', 'og:url'), canonical, 'og:url must equal the canonical href');
    assert.equal(meta(doc, 'property', 'og:title'), doc.title.trim());
    assert.equal(meta(doc, 'property', 'og:description'), meta(doc, 'name', 'description'));
    assert.equal(meta(doc, 'property', 'og:type'), 'website');
    meta(doc, 'property', 'og:site_name');
    meta(doc, 'property', 'og:image:alt');
    assert.equal(meta(doc, 'name', 'twitter:card'), 'summary_large_image');

    const image = meta(doc, 'property', 'og:image');
    assert.ok(image.startsWith(`${ORIGIN}/`), `og:image must be an absolute https URL on ${ORIGIN}`);
    const onDisk = path.join(SITE, decodeURIComponent(new URL(image).pathname));
    assert.ok(fs.existsSync(onDisk), `og:image is not in the build: ${onDisk}`);
    const size = pngSize(onDisk);
    assert.equal(Number(meta(doc, 'property', 'og:image:width')), size.width);
    assert.equal(Number(meta(doc, 'property', 'og:image:height')), size.height);
    assert.ok(size.width / size.height >= 1.5, 'summary_large_image needs a wide image');
  });

  test(`${file}: one h1, main#main, skip link`, () => {
    const doc = load(file);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.ok(doc.querySelector('main#main'));
    assert.ok(doc.querySelector('a.skip[href="#main"]'));
  });
}
