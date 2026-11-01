// Pathway Finder share links (static/ccair/assets/pathways/pathways.js): a results link (#r=...) opened in a fresh page
// shows the same roles in the same order, a link that cannot be read falls back to the start screen with a short note
// and leaves the address, and opening a link counts no quiz_started or quiz_finished event.
// Run after `npm run build:ccair` (it reads the generated hub page): node --test tests/pathways-share-link.test.mjs
// jsdom, no network. Reduced motion is switched on so the quiz moves between questions without waiting on animations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HUB = readFileSync(new URL('../static/ccair/pathways/index.html', import.meta.url), 'utf8')
  .replace(/<script\b(?![^>]*type="application\/(?:json|ld\+json)")[^>]*>[\s\S]*?<\/script>/g, '');
const SCRIPT = readFileSync(new URL('../static/ccair/assets/pathways/pathways.js', import.meta.url), 'utf8');
const BASE = 'https://bampel.test/ccair/pathways/';
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function open(url) {
  const dom = new JSDOM(HUB, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  w.Element.prototype.scrollIntoView = function () {};
  w.events = [];
  w.gtag = (kind, name) => { if (kind === 'event') w.events.push(name); };
  w.eval(SCRIPT);
  return w;
}
const q = (w, s) => w.document.querySelector(s);
const roles = (w) => Array.from(w.document.querySelectorAll('#quiz .bars li a')).map((a) => a.textContent);

async function takeQuiz(w) {
  if (q(w, '#pf-start')) q(w, '#pf-start').click(); // Start over goes straight to the first question
  for (let n = 0; n < 200 && !q(w, '#quiz .results'); n++) {
    const go = q(w, '#pf-go');
    if (go) go.click();
    else {
      const opts = w.document.querySelectorAll('#quiz .qcard [data-v]');
      opts[(n * 7) % opts.length].click(); // varied answers, so the ranking is not a tie broken by list order
    }
    await tick();
  }
  assert.ok(q(w, '#quiz .results'), 'the quiz reaches the results screen');
}

test('a results link opened in a new page shows the same roles in the same order and counts nothing', async () => {
  const w1 = open(BASE);
  await takeQuiz(w1);
  assert.deepEqual(w1.events, ['quiz_started', 'quiz_finished'], 'a real run counts one start and one finish');
  const url = w1.location.href, first = roles(w1);
  assert.match(url, /#r=v2-\d+$/);
  assert.equal(first.length, 14);

  const w2 = open(url);
  await tick(200);
  assert.ok(q(w2, '#quiz .results'), 'the link opens on the results screen');
  assert.deepEqual(roles(w2), first, 'same roles, same order');
  assert.deepEqual(Array.from(w2.document.querySelectorAll('.match h3')).map((h) => h.firstChild.textContent.trim()),
    Array.from(w1.document.querySelectorAll('.match h3')).map((h) => h.firstChild.textContent.trim()), 'same top 3');
  assert.deepEqual(w2.events, [], 'opening a results link counts no start or finish');
  assert.equal(q(w2, '.pf-msg'), null);

  // Start over from a shared link is a real run and is counted once.
  q(w2, '#pf-again').click();
  await takeQuiz(w2);
  assert.deepEqual(w2.events, ['quiz_started', 'quiz_finished']);
});

const BAD = {
  garbage: '#r=hello',
  empty: '#r=',
  truncated: '#r=v2-0120120',
  'cut inside an escape': '#r=v2-012%E2%8',
  'digit out of range': '#r=v2-3' + '0'.repeat(60),
  'old version': '#r=v1-' + '0'.repeat(61),
};
for (const [label, hash] of Object.entries(BAD)) {
  test(`a bad results link (${label}) shows the start screen and a note, and leaves the address`, async () => {
    const w = open(BASE + hash);
    await tick(200);
    assert.ok(q(w, '#pf-start'), 'start screen');
    assert.equal(q(w, '#quiz .results'), null);
    const note = q(w, '#quiz .pf-msg');
    assert.ok(note, 'note is shown');
    assert.equal(note.getAttribute('role'), 'status');
    assert.equal(note.textContent, 'That results link could not be read. Start the quiz to see your matches.');
    assert.equal(w.location.hash, '', 'the bad code is gone from the address');
    assert.equal(w.location.pathname, '/ccair/pathways/');
    assert.deepEqual(w.events, []);
    // The note belongs to the bad link only: starting the quiz removes it.
    q(w, '#pf-start').click();
    assert.equal(q(w, '.pf-msg'), null);
  });
}
