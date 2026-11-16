// Titles, meta descriptions and sitemap dates for the four public CCAIR Behavioral Lab pages.
// Run after a build: node --test tests/lab-meta.test.mjs   (reads ./public, or the folder in BREADCRUMB_SITE)
// Each page has one non-empty title, the titles differ, each description is 120-160 characters and differs from the
// others, og:title/og:description match, and /lab/sitemap.xml lists every page with a lastmod that is a real date and
// not older than the last commit to that page's source (skipped in a shallow clone, where git cannot say).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.BREADCRUMB_SITE || path.join(ROOT, 'public'));
const PATHS = ['lab/', 'lab/guide/', 'lab/analysis/', 'lab/support/'];
const docs = new Map();
const load = (p) => {
  if (!docs.has(p)) docs.set(p, new JSDOM(fs.readFileSync(path.join(SITE, p, 'index.html'), 'utf8')).window.document);
  return docs.get(p);
};
const meta = (d, sel) => d.querySelectorAll(sel);

test('each page has exactly one non-empty title, and the titles differ', () => {
  const titles = PATHS.map((p) => {
    const t = meta(load(p), 'title');
    assert.equal(t.length, 1, `${p}: expected one <title>`);
    assert.ok(t[0].textContent.trim(), `${p}: empty title`);
    return t[0].textContent.trim();
  });
  assert.equal(new Set(titles).size, titles.length, `duplicate titles: ${titles.join(' | ')}`);
});

test('descriptions are 120-160 characters, distinct, and repeated in og tags', () => {
  const seen = new Set();
  for (const p of PATHS) {
    const d = load(p);
    const m = meta(d, 'meta[name="description"]');
    assert.equal(m.length, 1, `${p}: expected one meta description`);
    const desc = m[0].getAttribute('content').trim();
    assert.ok(desc.length >= 120 && desc.length <= 160, `${p}: description is ${desc.length} characters`);
    assert.ok(!seen.has(desc), `${p}: duplicate description`);
    seen.add(desc);
    assert.equal(meta(d, 'meta[property="og:description"]')[0]?.getAttribute('content'), desc, `${p}: og:description differs`);
    assert.equal(meta(d, 'meta[property="og:title"]')[0]?.getAttribute('content'), d.title.trim(), `${p}: og:title differs`);
  }
});

test('lab sitemap lists every page with a current lastmod', () => {
  const xml = fs.readFileSync(path.join(SITE, 'lab', 'sitemap.xml'), 'utf8');
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim() === 'true';
  for (const p of PATHS) {
    const m = xml.match(new RegExp(`<loc>https://bampel\\.com/${p}</loc>\\s*<lastmod>(\\d{4}-\\d{2}-\\d{2})</lastmod>`));
    assert.ok(m, `${p}: no lastmod in lab sitemap`);
    assert.ok(!Number.isNaN(Date.parse(m[1])), `${p}: bad lastmod ${m[1]}`);
    if (shallow) continue;
    const src = `static/${p}index.html`;
    const last = execFileSync('git', ['log', '-1', '--format=%cs', '--', src], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (last) assert.ok(m[1] >= last, `${p}: lastmod ${m[1]} is older than the last commit to ${src} (${last})`);
  }
});
