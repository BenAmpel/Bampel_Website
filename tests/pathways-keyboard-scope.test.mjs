// Pathway Finder keyboard shortcuts (static/ccair/assets/pathways/pathways.js): digits pick an answer and ArrowLeft or
// Backspace go back, but only when the key comes from inside the quiz and not from a text field, select or editable
// element, and with no Ctrl, Meta or Alt held (WCAG 2.1.4 character key shortcuts).
// Run after `npm run build:ccair` (it reads the generated hub page): node --test tests/pathways-keyboard-scope.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HUB = readFileSync(new URL('../static/ccair/pathways/index.html', import.meta.url), 'utf8');
const SCRIPT = ['pathways-motion.js', 'pathways.js'].map((f) => readFileSync(new URL(`../static/ccair/assets/pathways/${f}`, import.meta.url), 'utf8')).join('\n');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function open() {
  const dom = new JSDOM(HUB, { url: 'https://bampel.test/ccair/pathways/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  w.Element.prototype.scrollIntoView = function () {};
  w.eval(SCRIPT);
  return w;
}
const q = (w, s) => w.document.querySelector(s);
const counter = (w) => (q(w, '#quiz .qcard .part, #quiz .qcard .qtext') ? (q(w, '#quiz .quiz-foot span') || {}).textContent : 'none');
const key = (w, target, k, init = {}) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

// Starts the quiz and answers questions (clicking past any intro card) until question 2 is showing.
async function onSecondQuestion(w) {
  q(w, '#pf-start').click();
  for (let n = 0; n < 20 && !/^2 of /.test(counter(w)); n++) {
    if (q(w, '#pf-go')) q(w, '#pf-go').click();
    else q(w, '#quiz .qcard [data-v]').click();
    await tick(20);
  }
  assert.match(counter(w), /^2 of /);
}

test('keys from outside the quiz or from form fields do nothing; the same keys inside the quiz still work', async () => {
  const w = open();
  await onSecondQuestion(w);
  const doc = w.document, mount = q(w, '#quiz');
  const outside = doc.createElement('input'); outside.type = 'search'; doc.body.appendChild(outside);
  const sel = doc.createElement('select'); sel.innerHTML = '<option>a</option>'; mount.appendChild(sel);
  const edit = doc.createElement('div'); edit.setAttribute('contenteditable', 'true'); edit.tabIndex = 0; mount.appendChild(edit);
  const before = counter(w);

  // Outside the quiz: a search field, the page body, and an outside field while focus still sits in the quiz.
  outside.focus(); key(w, outside, '1'); key(w, outside, 'Backspace'); key(w, outside, 'ArrowLeft');
  key(w, doc.body, '1'); key(w, doc.body, 'Backspace');
  q(w, '#quiz .qtext').focus(); key(w, outside, '1'); key(w, outside, 'Backspace');
  // Inside the quiz but in a select or an editable element.
  sel.focus(); key(w, sel, '1'); key(w, sel, 'Backspace');
  edit.focus(); key(w, edit, '1'); key(w, edit, 'Backspace');
  // Modifier held.
  q(w, '#quiz .qtext').focus(); key(w, q(w, '#quiz .qtext'), '1', { ctrlKey: true }); key(w, q(w, '#quiz .qtext'), '1', { metaKey: true }); key(w, q(w, '#quiz .qtext'), '1', { altKey: true });
  await tick(20);
  assert.equal(counter(w), before, 'no key outside the quiz, in a field, or with a modifier changes the quiz');
  assert.equal(q(w, '#quiz .answers .picked'), null, 'no answer was picked');

  // Inside the quiz, focus on the question heading: Backspace goes back, a digit picks an answer.
  const h = q(w, '#quiz .qtext'); h.focus();
  key(w, h, 'Backspace');
  await tick(20);
  assert.match(counter(w), /^1 of /, 'Backspace inside the quiz goes back');
  const h1 = q(w, '#quiz .qtext'); h1.focus();
  key(w, h1, '2');
  await tick(20);
  assert.match(counter(w), /^2 of /, 'a digit inside the quiz answers and advances');
});
