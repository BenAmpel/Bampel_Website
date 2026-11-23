// Keyboard pass on /, /research/, /publications/, /cv/ and /teaching/.
// Run after a build: node --test tests/keyboard-a11y.test.mjs   (reads ./public, or the folder in KEYBOARD_A11Y_SITE)
// Guards: the skip link is the first focus stop and its target exists; the current page's nav link carries
// aria-current; the CV year and topic filters expose aria-pressed; the home page impact cards (role="button") act
// from the keyboard by opening Publications with the filter in the address; closing the search dialog returns
// focus to the control that opened it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.env.KEYBOARD_A11Y_SITE || path.join(ROOT, 'public'));
const PAGES = { '/': 'index.html', '/research/': 'research/index.html', '/publications/': 'publications/index.html', '/cv/': 'cv/index.html', '/teaching/': 'teaching/index.html' };

const doc = (file) => new JSDOM(fs.readFileSync(path.join(SITE, file), 'utf8')).window.document;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

test('built site exists', () => {
  assert.ok(fs.existsSync(path.join(SITE, 'cv/index.html')), `no build in ${SITE}; run the Hugo build first`);
});

for (const [url, file] of Object.entries(PAGES)) {
  test(`${url}: skip link is the first focus stop and targets main#main; one h1`, () => {
    const d = doc(file);
    const first = d.querySelector(FOCUSABLE);
    assert.ok(first.classList.contains('skip-link'), 'first focusable element is the skip link');
    assert.equal(first.getAttribute('href'), '#main');
    const main = d.querySelectorAll('main#main');
    assert.equal(main.length, 1, 'exactly one main#main');
    assert.equal(main[0].getAttribute('tabindex'), '-1', 'main can take focus when the skip link is used');
    assert.equal(d.querySelectorAll('h1').length, 1, 'exactly one h1');
  });
}

test('the nav link for the current page has aria-current, and only that one', () => {
  const expected = { '/': 'Home', '/research/': 'Research', '/publications/': 'Publications', '/cv/': 'CV', '/teaching/': 'Teaching' };
  for (const [url, file] of Object.entries(PAGES)) {
    const current = [...doc(file).querySelectorAll('#navbar-content a[aria-current]')];
    assert.equal(current.length, 1, `${url}: one aria-current link`);
    assert.equal(current[0].textContent.trim(), expected[url]);
    assert.equal(current[0].getAttribute('aria-current'), 'page');
    assert.ok(current[0].classList.contains('active'), `${url}: aria-current matches the visual active state`);
  }
});

test('/cv/ year and topic filter buttons are buttons with aria-pressed, inside labelled groups', () => {
  const d = doc('cv/index.html');
  for (const sel of ['.talks-year', '.talks-tag']) {
    const buttons = [...d.querySelectorAll(sel)];
    assert.ok(buttons.length > 0, `${sel} present`);
    for (const b of buttons) {
      assert.equal(b.tagName, 'BUTTON', `${sel} is a button`);
      assert.ok(['true', 'false'].includes(b.getAttribute('aria-pressed')), `${sel} has aria-pressed`);
    }
    assert.ok(buttons[0].closest('[role="group"][aria-label]'), `${sel} sits in a labelled group`);
  }
  assert.ok(d.querySelector('#awards-nodes[role="group"][aria-label]'), 'awards year group is labelled');
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/site/awards_timeline.js'), 'utf8');
  assert.match(js, /setAttribute\('aria-pressed'/, 'awards year buttons update aria-pressed');
});

function runImpactStats(page, keyOrClick) {
  const d = doc(page);
  const navigated = [];
  const win = {
    location: { assign: (u) => navigated.push(u) },
    matchMedia: () => ({ matches: false }),
    dispatchEvent: () => true,
  };
  const code = fs.readFileSync(path.join(ROOT, 'assets/js/site/impact_stats.js'), 'utf8');
  new Function('window', 'document', 'fetch', 'CustomEvent', code)(win, d, () => Promise.resolve({ ok: false }), class {});
  return { d, navigated };
}

test('home impact cards: Enter and Space open Publications filtered by type; non-filter cards are not buttons', () => {
  const { d, navigated } = runImpactStats('index.html');
  const cards = [...d.querySelectorAll('.impact-card')];
  const journal = cards.find((c) => c.dataset.filterType === 'journal');
  assert.equal(journal.getAttribute('role'), 'button');
  const press = (el, key) => {
    const ev = new (d.defaultView.KeyboardEvent)('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  assert.ok(press(journal, 'Enter'));
  assert.ok(press(journal, ' '));
  assert.deepEqual(navigated, ['/publications/?type=journal', '/publications/?type=journal']);
  assert.ok(!press(journal, 'a'), 'other keys are left alone');
  const award = cards.find((c) => c.dataset.metric === 'best-paper');
  assert.equal(award.getAttribute('role'), 'group');
});

test('home page "New in <year>" button opens Publications filtered by that year (no dead control)', () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/site/impact_stats.js'), 'utf8');
  assert.match(js, /window\.location\.assign\(`\$\{base\}publications\/\?/);
  assert.match(js, /params\.set\("year"/);
});

test('closing the search dialog restores focus to the control that opened it', () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/wowchemy.js'), 'utf8');
  assert.match(js, /searchOpener = active/, 'the opener is remembered when the dialog opens');
  assert.match(js, /searchOpener\.focus\(\)/, 'and focused again when it closes');
  const open = js.indexOf("body.classList.add('searching')");
  const close = js.indexOf('searchOpener.focus()');
  assert.ok(close > 0 && open > close, 'restore happens in the close branch, remember in the open branch');
});
