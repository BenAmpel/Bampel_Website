// BreadcrumbList JSON-LD on the built site (layouts/partials/breadcrumb_jsonld.html).
// Run after a build: node --test tests/breadcrumb-jsonld.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// Every Hugo page except home, 404, /ccair/ and /lab/ carries exactly one BreadcrumbList; it parses as JSON; positions run
// 1..n; URLs are absolute; the last name equals the page's visible h1; the home page has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const SKIP = /^(ccair|lab)(\/|$)/;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function pages(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) out.push(...pages(dir, r));
    else if (e.name.endsWith('.html')) out.push(r);
  }
  return out;
}

function inspect(file) {
  const doc = new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;
  const crumbs = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const data = JSON.parse(s.textContent); // throws on invalid JSON
    for (const d of [].concat(data)) if (d['@type'] === 'BreadcrumbList') crumbs.push(d);
  }
  const h1s = [...doc.querySelectorAll('h1')].map((h) => norm(h.textContent));
  return { crumbs, h1s };
}

test('built site exists', () => {
  assert.ok(fs.existsSync(path.join(SITE, 'index.html')), `no build in ${SITE}; run the Hugo build first`);
});

test('home page has no BreadcrumbList', () => {
  assert.equal(inspect('index.html').crumbs.length, 0);
});

test('every Hugo page has one valid BreadcrumbList whose last name is the h1', () => {
  let withCrumbs = 0;
  const problems = [];
  for (const file of pages(SITE)) {
    if (file === 'index.html' || file === '404.html' || SKIP.test(file)) continue;
    let r;
    try { r = inspect(file); } catch (e) { problems.push(`${file}: invalid JSON-LD (${e.message})`); continue; }
    if (!r.h1s.length && !r.crumbs.length) continue; // alias redirect stub: no layout, no h1
    if (r.crumbs.length !== 1) { problems.push(`${file}: ${r.crumbs.length} BreadcrumbList blocks`); continue; }
    withCrumbs++;
    const items = r.crumbs[0].itemListElement;
    if (!Array.isArray(items) || items.length < 2) { problems.push(`${file}: fewer than 2 items`); continue; }
    items.forEach((it, i) => {
      if (it['@type'] !== 'ListItem' || it.position !== i + 1) problems.push(`${file}: bad item ${i + 1}`);
      if (!it.name || !/^https:\/\//.test(it.item)) problems.push(`${file}: item ${i + 1} needs a name and an absolute URL`);
    });
    if (items[0].name !== 'Home' && !/^https:\/\/[^/]+\/$/.test(items[0].item)) problems.push(`${file}: first item is not home`);
    if (r.h1s.length !== 1) problems.push(`${file}: ${r.h1s.length} h1 elements`);
    else if (norm(items[items.length - 1].name) !== r.h1s[0]) problems.push(`${file}: last name "${items[items.length - 1].name}" != h1 "${r.h1s[0]}"`);
  }
  assert.deepEqual(problems, []);
  assert.ok(withCrumbs > 20, `only ${withCrumbs} pages carry a BreadcrumbList`);
  console.log(`BreadcrumbList on ${withCrumbs} pages`);
});

test('/ccair/ and /lab/ get none from the site partial', () => {
  for (const file of pages(SITE)) {
    if (!/^(ccair|lab)\//.test(file)) continue;
    // static CCAIR pages may carry their own; the Hugo-built lab pages must not
    if (file.startsWith('lab/')) assert.equal(inspect(file).crumbs.length, 0, file);
  }
});
