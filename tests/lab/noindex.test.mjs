// The private lab paths stay out of search: /lab/signin/, /lab/account/, /lab/admin/ and /lab/s/ (and anything under them).
// Static checks on the sources, no build needed: each page's robots meta in static/lab/<path>/index.html, the
// X-Robots-Tag: noindex header rule in netlify.toml, and the sitemap sources (static/lab/sitemap.xml, the CCAIR sitemap
// writer, and robots.txt) listing none of these paths.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHeaderRules, headersFor, productionRules } from '../../scripts/lab/headers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');
const PRIVATE = ['signin', 'account', 'admin', 's'];

// ---------- robots meta on each private page ----------
for (const p of PRIVATE) {
  const file = `static/lab/${p}/index.html`;
  assert(existsSync(join(ROOT, file)), `${file} exists`);
  const tags = [...read(file).matchAll(/<meta\s[^>]*>/gi)].map(m => m[0]).filter(t => /name\s*=\s*["']robots["']/i.test(t));
  assert.equal(tags.length, 1, `${file}: expected one robots meta, found ${tags.length}`);
  const content = (tags[0].match(/content\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
  const tokens = content.toLowerCase().split(',').map(s => s.trim());
  assert(tokens.includes('noindex'), `${file}: robots meta must contain noindex, has "${content}"`);
  assert(tokens.includes('nofollow'), `${file}: robots meta must contain nofollow, has "${content}"`);
}

// ---------- X-Robots-Tag header rule in netlify.toml ----------
const prod = productionRules();
for (const p of PRIVATE) {
  for (const path of [`/lab/${p}/`, `/lab/${p}/anything`]) {
    assert.equal(headersFor(prod, path)['X-Robots-Tag'], 'noindex', `${path}: X-Robots-Tag noindex header rule`);
  }
}
// the rule is read from the real file: the same check fails once the rule is gone
const stripped = parseHeaderRules(read('netlify.toml').replace(/^\s*X-Robots-Tag\s*=.*$/gm, ''));
for (const p of PRIVATE) assert.equal(headersFor(stripped, `/lab/${p}/`)['X-Robots-Tag'], undefined, 'self-check: stripped file has no rule');

// ---------- sitemaps ----------
const isPrivate = u => {
  const path = u.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].toLowerCase();
  return PRIVATE.some(p => path === `/lab/${p}` || path.startsWith(`/lab/${p}/`)) || path.startsWith('/lab/studies/') || path.startsWith('/lab/timing');
};
const sitemap = read('static/lab/sitemap.xml').replace(/<!--[\s\S]*?-->/g, '');
const locs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => m[1]);
assert(locs.length > 0, 'static/lab/sitemap.xml lists pages');
for (const u of locs) assert(!isPrivate(u), `static/lab/sitemap.xml must not list the private path ${u}`);
assert.deepEqual([...locs].sort(), ['/lab/', '/lab/analysis/', '/lab/guide/', '/lab/support/'].map(p => 'https://bampel.com' + p), 'lab sitemap lists only the four public pages');

// other static sitemap sources: any sitemap file under static/ or layouts/, and the writers and robots.txt
const others = ['layouts/robots.txt', 'scripts/ccair-static.mjs', 'static/ccair/sitemap.xml', 'layouts/sitemap.xml', 'layouts/_default/sitemap.xml', 'static/sitemap.xml'];
for (const f of others.filter(f => existsSync(join(ROOT, f)))) {
  const text = read(f).replace(/<!--[\s\S]*?-->/g, '');
  for (const p of PRIVATE) {
    const re = new RegExp(`/lab/${p}(/|\\b)`, 'i');
    for (const line of text.split('\n').filter(l => /sitemap|<loc>|<url>/i.test(l))) {
      assert(!re.test(line), `${f}: sitemap line mentions private path /lab/${p}: ${line.trim()}`);
    }
  }
}
assert(/Sitemap:.*lab\/sitemap\.xml/.test(read('layouts/robots.txt')), 'robots.txt still points to the lab sitemap');
console.log('lab noindex ok');
