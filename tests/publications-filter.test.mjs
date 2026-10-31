// Publications filter (assets/js/site/publications_filter.js): strings from publications.json are shown as text,
// links are only http(s) or relative, and filtering plus the filter state in the URL still work.
// Run: node --test tests/publications-filter.test.mjs (jsdom, no build or network needed).
// The records below are test fixtures only; they are not, and must never be copied into, the real publication data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SCRIPT = readFileSync(new URL('../assets/js/site/publications_filter.js', import.meta.url), 'utf8');
const TRICKY = `Quote " amp & <b>bold</b> it's`;

const FIXTURE = [
  { title: `Title ${TRICKY}`, venue: `Venue ${TRICKY}`, award: `Award ${TRICKY}`, year: 2025, type: 'journal',
    url: 'https://example.org/paper?a=1&b=2', authors: ['Test Author', `Co ${TRICKY}`] },
  { title: 'Script link', venue: 'Plain Venue', year: 2024, type: 'conference', url: 'javascript:alert(1)', authors: ['X Y'] },
  { title: 'Data link', venue: 'Plain Venue', year: 2024, type: 'conference', url: ' JaVa\tscript:alert(1)', authors: ['X Y'] },
  { title: 'Relative link', venue: 'Plain Venue', year: 2023, type: 'workshop', url: '/publication/x/', authors: ['X Y'] },
];

// The markup the shortcode (layouts/shortcodes/publications_filter.html) gives the script to work with.
const PAGE = `<!doctype html><html><body>
<details class="spoiler pub-filter-spoiler"><summary>Publications</summary><div class="spoiler-content">
<div class="pub-filter" id="pub-filter">
  <button class="pub-filter-reset" type="button">Clear Filters</button>
  <div id="pub-filter-count"></div>
  <details class="pub-filter-group" open><summary>Type</summary><div id="pub-filter-type"></div></details>
  <details class="pub-filter-group" open><summary>Year</summary><div id="pub-filter-year"></div></details>
  <details class="pub-filter-group"><summary>Venue</summary><div id="pub-filter-venue"></div></details>
  <details class="pub-filter-group"><summary>Co-author</summary><div id="pub-filter-author"></div></details>
  <div id="pub-filter-summary"></div>
  <div id="pub-filter-list"></div>
</div></div></details></body></html>`;

async function load(search = '') {
  const dom = new JSDOM(PAGE, { url: `https://bampel.test/publication/${search}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.loadPublications = () => Promise.resolve(JSON.parse(JSON.stringify(FIXTURE)));
  window.eval(SCRIPT);
  // The script renders after the loadPublications promise resolves.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  return window;
}

const items = (w) => Array.from(w.document.querySelectorAll('#pub-filter-list .pub-item'));
const optionFor = (w, group, value) => Array.from(w.document.querySelectorAll('input[data-group]'))
  .find((i) => i.dataset.group === group && i.dataset.value === value);
const toggle = (w, input) => {
  input.checked = !input.checked;
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
};

test('title, venue, award and co-author with quotes, ampersands and tags render as literal text', async () => {
  const w = await load();
  const list = w.document.getElementById('pub-filter-list');
  assert.equal(list.querySelectorAll('b').length, 0, 'no <b> element is created');
  const first = items(w)[0];
  assert.equal(first.querySelector('.pub-title').textContent, `Title ${TRICKY}`);
  assert.equal(first.querySelector('.pub-meta').textContent, `2025 · Venue ${TRICKY} · Journal`);
  const award = first.querySelector('.pub-badge--award');
  assert.equal(award.textContent.trim(), `Award ${TRICKY}`);
  assert.equal(award.getAttribute('title'), `Award ${TRICKY}`);
  assert.equal(first.querySelector('.pub-authors').textContent, `Test Author, Co ${TRICKY}`);
  assert.equal(first.querySelector('a.pub-title').getAttribute('href'), 'https://example.org/paper?a=1&b=2');

  const venueBox = optionFor(w, 'venue', `Venue ${TRICKY}`);
  assert.ok(venueBox, 'venue option keeps the exact value');
  assert.equal(venueBox.closest('label').textContent.trim(), `Venue ${TRICKY}`);
  assert.equal(w.document.querySelectorAll('#pub-filter b').length, 0);
});

test('only http(s) and relative links become anchors', async () => {
  const w = await load();
  const byTitle = Object.fromEntries(items(w).map((el) => [el.querySelector('.pub-title').textContent, el]));
  assert.equal(byTitle['Script link'].querySelector('a'), null);
  assert.equal(byTitle['Script link'].querySelector('span.pub-title').textContent, 'Script link');
  assert.equal(byTitle['Data link'].querySelector('a'), null);
  assert.equal(byTitle['Relative link'].querySelector('a.pub-title').getAttribute('href'), '/publication/x/');
  assert.equal(w.document.querySelectorAll('a[href^="javascript" i]').length, 0);
});

test('filtering by a venue with special characters works and is written to the URL', async () => {
  const w = await load();
  toggle(w, optionFor(w, 'venue', `Venue ${TRICKY}`));
  assert.equal(items(w).length, 1);
  assert.equal(w.document.getElementById('pub-filter-count').textContent, '1 of 4');
  assert.equal(new w.URL(w.location.href).searchParams.get('venue'), `Venue ${TRICKY}`);
  assert.equal(w.document.querySelector('#pub-filter-summary .pub-filter-chip').textContent, `Venue: Venue ${TRICKY}`);
});

test('a shared URL restores the same filter, including special characters', async () => {
  const params = new URLSearchParams();
  params.append('venue', `Venue ${TRICKY}`);
  params.append('year', '2025');
  const w = await load(`?${params}`);
  assert.equal(items(w).length, 1);
  assert.equal(optionFor(w, 'venue', `Venue ${TRICKY}`).checked, true);
  assert.equal(optionFor(w, 'year', '2025').checked, true);
  assert.equal(w.document.querySelector('details.pub-filter-spoiler').open, true);
});

test('the pub-filter:apply event matches values exactly and ignores selector syntax', async () => {
  const w = await load();
  w.dispatchEvent(new w.CustomEvent('pub-filter:apply', { detail: { type: 'conference' } }));
  assert.equal(items(w).length, 2);
  assert.equal(new w.URL(w.location.href).searchParams.get('type'), 'conference');

  // A value that would have widened or broken a built selector string matches nothing and does not throw.
  w.dispatchEvent(new w.CustomEvent('pub-filter:apply', { detail: { type: 'journal"],input[data-group="year' } }));
  assert.equal(w.document.querySelectorAll('#pub-filter input:checked').length, 0);
  assert.equal(items(w).length, 4);

  w.dispatchEvent(new w.CustomEvent('pub-filter:apply', { detail: { year: 2024 } }));
  assert.equal(items(w).length, 2);
  assert.equal(optionFor(w, 'year', '2024').checked, true);
});
