// Pathway Finder markup carries no style="" attributes, so it renders under a strict CSP (style-src 'self') and does
// not depend on the sitewide 'unsafe-inline' exception. Sizes and delays are classes in pathways.css or are set through
// the CSSOM (el.style...) after insertion, which style-src 'self' allows.
// Run after `npm run build:ccair` (it reads the generated pages): node --test tests/pathways-no-inline-style.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../static/ccair/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const SCRIPT = read('assets/pathways/pathways.js');
const CSS = read('assets/pathways/pathways.css');
const HUB = read('pathways/index.html');
const pages = [['pathways/index.html', HUB]];
for (const d of readdirSync(new URL('pathways/', root), { withFileTypes: true })) {
  if (d.isDirectory() && existsSync(new URL(`pathways/${d.name}/index.html`, root))) pages.push([`pathways/${d.name}/index.html`, read(`pathways/${d.name}/index.html`)]);
}

test('pathways.js builds no markup with a style attribute', () => {
  const hits = SCRIPT.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /style\s*=\s*\\?["']/.test(l) || /setAttribute\(\s*['"]style['"]/.test(l));
  assert.deepEqual(hits, [], 'use a class or el.style / el.style.setProperty after insertion');
});

test('the generated hub and role pages have no style attribute', () => {
  assert.ok(pages.length >= 2, 'hub and role pages exist (run npm run build:ccair first)');
  for (const [name, html] of pages) assert.doesNotMatch(html, /\sstyle\s*=/, name);
});

test('every delay and focal class used on the pages has a rule in pathways.css', () => {
  const used = new Set();
  for (const [, html] of pages) for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (/^(d-\d+|focal-[\d-]+)$/.test(c)) used.add(c);
  assert.ok(used.size > 0);
  for (const c of used) assert.ok(CSS.includes(`.${c} {`), `pathways.css has a rule for .${c}`);
});

test('a finished quiz sizes the ranked bars and the radar through the CSSOM', async () => {
  const dom = new JSDOM(HUB, { url: 'https://bampel.test/ccair/pathways/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  w.Element.prototype.scrollIntoView = function () {};
  w.gtag = () => {};
  w.eval(SCRIPT);
  const q = (s) => w.document.querySelector(s);
  q('#pf-start').click();
  for (let n = 0; n < 200 && !q('#quiz .results'); n++) {
    if (q('#pf-go')) q('#pf-go').click();
    else { const o = w.document.querySelectorAll('#quiz .qcard [data-v]'); o[(n * 7) % o.length].click(); }
    await new Promise((r) => setTimeout(r, 0));
  }
  assert.ok(q('#quiz .results'), 'the quiz reaches the results screen');
  const bars = Array.from(w.document.querySelectorAll('#quiz .bars .b i'));
  assert.equal(bars.length, 14);
  for (const b of bars) assert.equal(b.style.width, `${b.getAttribute('data-w')}%`);
  assert.equal(bars[1].style.animationDelay, '0.04s');
  const radar = q('#quiz .radar');
  assert.equal(radar.style.getPropertyValue('--len'), radar.getAttribute('data-len'));
});
