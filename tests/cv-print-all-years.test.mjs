// CV page print: the talks and awards lists show one year on screen, but printing (or saving as PDF) must list every year,
// and the selected year must come back afterwards. Run: node --test tests/cv-print-all-years.test.mjs (jsdom, no build).
// The records below are test fixtures only; they are not, and must never be copied into, the real talks or awards data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const TALKS = [
  { title: 'T-a', year: 2026, tags: ['x'] }, { title: 'T-b', year: 2026, tags: [] },
  { title: 'T-c', year: 2025, tags: ['x'] }, { title: 'T-d', year: 2023, tags: [] },
];
const AWARDS = [
  { title: 'A-a', year: 2025, category: 'Award' }, { title: 'A-b', year: 2022, category: 'Grant' },
  { title: 'A-c', year: 2022, category: 'Grant' }, { title: 'A-d', year: 2018, endYear: 2021, category: 'Honor' },
];

async function load(script, markup, data) {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { url: 'https://bampel.test/cv/', runScripts: 'outside-only' });
  const { window } = dom;
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(data))) });
  window.requestAnimationFrame = (f) => f();
  window.matchMedia = () => ({ addEventListener() {} });
  window.eval(script);
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  return window;
}

test('talks: beforeprint draws every talk, afterprint restores the selected year', async () => {
  const w = await load(read('../assets/js/site/talks_showcase.js'),
    '<div id="talks-showcase"><div id="talks-summary"></div><div id="talks-years"></div><div id="talks-tags"></div><div id="talks-cards"></div></div>', TALKS);
  const count = () => w.document.querySelectorAll('.talks-card').length;
  assert.equal(count(), 2, 'screen: newest year only');
  w.document.querySelector('.talks-year[data-year="2023"]').click();
  assert.equal(count(), 1);
  w.dispatchEvent(new w.Event('beforeprint'));
  assert.equal(count(), TALKS.length, 'print: all years');
  w.dispatchEvent(new w.Event('afterprint'));
  assert.equal(count(), 1, 'screen again: the year picked before printing');
});

test('awards: beforeprint draws every year, afterprint restores the selected year', async () => {
  const w = await load(read('../assets/js/site/awards_timeline.js'),
    '<div id="awards-nodes"></div><div id="awards-detail"></div>', AWARDS);
  const items = () => w.document.querySelectorAll('.awards-detail-item').length;
  const heads = () => Array.from(w.document.querySelectorAll('.awards-detail-year')).map((n) => n.textContent);
  assert.equal(items(), 1, 'screen: newest year only');
  w.dispatchEvent(new w.Event('beforeprint'));
  assert.equal(items(), AWARDS.length, 'print: all years');
  assert.deepEqual(heads(), ['2025', '2022', '2018-2021']);
  w.dispatchEvent(new w.Event('afterprint'));
  assert.equal(items(), 1);
  assert.deepEqual(heads(), ['2025']);
});
