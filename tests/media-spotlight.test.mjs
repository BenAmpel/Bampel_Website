// Media Spotlight (assets/js/site/media_spotlight.js): strings from media.json are shown as text, only https links that are
// not Google redirects become anchors, a malformed url does not break the list, and the year filter still works.
// Run: node --test tests/media-spotlight.test.mjs (jsdom, no build or network needed).
// The records below are test fixtures only; they are not, and must never be copied into, the real media data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SCRIPT = readFileSync(new URL('../assets/js/site/media_spotlight.js', import.meta.url), 'utf8');
const TRICKY = `Quote " amp & <b>bold</b> it's`;

const FIXTURE = [
  { title: `Title ${TRICKY}`, outlet: `Outlet ${TRICKY}`, summary: `Summary ${TRICKY}`, tags: [`Tag ${TRICKY}`, 'Plain'],
    date: '2025-03-01', type: 'Press Release', url: '  https://example.org/a?x=1&y=2  ' },
  { title: 'Script link', outlet: 'O', date: '2025-02-01', type: `Type ${TRICKY}`, url: 'javascript:alert(1)' },
  { title: 'Plain http', outlet: 'O', date: '2025-01-01', type: 'Press Release', url: 'http://example.org' },
  { title: 'Google wrapper', outlet: 'O', date: '2023-06-01', type: 'Press Release', url: 'https://news.google.com/rss/articles/X' },
  { title: 'Google redirect', outlet: 'O', date: '2023-05-01', type: 'Press Release', url: 'https://www.google.com/url?q=x' },
  { title: 'Consent page', outlet: 'O', date: '2023-04-01', type: 'Press Release', url: 'https://consent.google.com/x' },
  { title: 'Broken url', outlet: 'O', date: '2023-03-01', type: 'Press Release', url: 'https://' },
  { title: 'Only 2024 item', outlet: 'O', date: '2024-07-01', type: 'TV Segment' },
];

// The markup the shortcode (layouts/shortcodes/media_spotlight.html) gives the script to work with.
const PAGE = `<!doctype html><html><body>
<div class="media-spotlight" id="media-spotlight">
  <div class="media-header"><div>
    <div class="media-title">Media Spotlight</div>
    <div class="media-subtitle">Coverage and interviews selected by Ben Ampel</div>
  </div><div class="media-summary" id="media-summary"></div></div>
  <div class="media-controls">
    <div class="media-years" id="media-years" role="tablist" aria-label="Media years"></div>
    <div class="media-types" id="media-types" role="tablist" aria-label="Media types"></div>
  </div>
  <div class="media-featured" id="media-featured"></div>
  <div class="media-list" id="media-list"></div>
</div></body></html>`;

async function load() {
  const dom = new JSDOM(PAGE, { url: 'https://bampel.test/cv/', runScripts: 'outside-only' });
  const { window } = dom;
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(FIXTURE))) });
  window.eval(SCRIPT);
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  return window;
}

const titles = (w) => Array.from(w.document.querySelectorAll('.media-featured-title, .media-card-title'));

test('text with quotes, ampersands and tags renders literally', async () => {
  const w = await load();
  const root = w.document.getElementById('media-spotlight');
  assert.equal(root.querySelectorAll('b').length, 0, 'no <b> element is created');
  const featured = w.document.querySelector('.media-featured-title');
  assert.equal(featured.textContent, `Title ${TRICKY}`);
  assert.ok(w.document.querySelector('.media-featured-meta').textContent.startsWith(`Outlet ${TRICKY}`));
  assert.equal(w.document.querySelector('.media-featured-summary').textContent, `Summary ${TRICKY}`);
  assert.equal(w.document.querySelector('.media-featured-tags .media-tag').textContent, `Tag ${TRICKY}`);
  assert.equal(w.document.getElementById('media-summary').textContent, `${FIXTURE.length} mentions • 2 outlets`);
});

test('only https links outside Google become anchors, and a malformed url does not break rendering', async () => {
  const w = await load();
  const links = Array.from(w.document.querySelectorAll('a.media-title-link'));
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), 'https://example.org/a?x=1&y=2');
  assert.equal(links[0].getAttribute('rel'), 'noopener');
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.equal(links[0].closest('.media-featured-title').textContent, `Title ${TRICKY}`);
  const plain = titles(w).filter((el) => !el.querySelector('a')).map((el) => el.textContent);
  for (const name of ['Script link', 'Plain http', 'Google wrapper', 'Google redirect', 'Consent page', 'Broken url', 'Only 2024 item']) {
    assert.ok(plain.includes(name), `${name} renders as plain text`);
  }
  assert.equal(w.document.querySelectorAll('a[href^="javascript" i]').length, 0);
});

test('type buttons carry the literal type in text and data', async () => {
  const w = await load();
  const button = Array.from(w.document.querySelectorAll('.media-type')).find((b) => b.dataset.type === `Type ${TRICKY}`);
  assert.ok(button, 'type button keeps the exact value');
  assert.equal(button.textContent, `Type ${TRICKY}`);
});

test('the year filter leaves only the 2024 item', async () => {
  const w = await load();
  const button = Array.from(w.document.querySelectorAll('.media-year')).find((b) => b.dataset.year === '2024');
  button.click();
  assert.equal(w.document.querySelector('.media-featured-title').textContent, 'Only 2024 item');
  assert.equal(w.document.getElementById('media-list').textContent, 'Additional coverage coming soon.');
  assert.equal(button.getAttribute('aria-selected'), 'true');
});
