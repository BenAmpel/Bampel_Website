// Keyboard pass on /, /research/, /publications/, /cv/ and /teaching/.
// Run after a build: node --test tests/keyboard-a11y.test.mjs   (reads ./public, or the folder in KEYBOARD_A11Y_SITE)
// Guards: the skip link is the first focus stop and its target exists; the current page's nav link carries
// aria-current; the CV year and topic filters expose aria-pressed; the home page impact cards (role="button") act
// from the keyboard by opening Publications with the filter in the address; closing the search dialog returns
// focus to the control that opened it; the header search control is a real button (Enter and Space) that reports
// aria-expanded.
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

test('home impact cards: non-filter cards are not Tab stops and carry their tooltip text as hidden text; filter cards stay focusable', () => {
  const { d } = runImpactStats('index.html');
  const cards = [...d.querySelectorAll('.impact-card')];
  const filters = cards.filter((c) => c.dataset.filterType);
  const plain = cards.filter((c) => !c.dataset.filterType);
  assert.equal(filters.length, 3, 'journals, conferences and workshops filter publications');
  assert.equal(plain.length, 4, 'best paper, Q1, FT50 and UTD24 are not filters');
  for (const c of filters) {
    assert.equal(c.getAttribute('tabindex'), '0', `${c.dataset.metric} stays a focus stop`);
    assert.equal(c.getAttribute('role'), 'button');
    assert.ok(c.getAttribute('aria-label'), `${c.dataset.metric} has an accessible name`);
  }
  for (const c of plain) {
    assert.equal(c.hasAttribute('tabindex'), false, `${c.dataset.metric} is not a Tab stop`);
    const tip = c.querySelector('[data-tooltip-text]');
    assert.ok(tip, `${c.dataset.metric} has hidden tooltip text in the DOM`);
    assert.ok(tip.classList.contains('sr-only'));
    assert.equal(tip.textContent.trim(), c.dataset.tooltip, 'hidden text matches the hover tooltip');
    assert.equal(c.hasAttribute('aria-label'), false);
  }
});

test('home page "New in <year>" button opens Publications filtered by that year (no dead control)', () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/site/impact_stats.js'), 'utf8');
  assert.match(js, /window\.location\.assign\(`\$\{path\}publications\/\?/);
  assert.match(js, /params\.set\("year"/);
});

const SEARCH_BTN = '.navbar .js-search';

for (const [url, file] of Object.entries(PAGES)) {
  test(`${url}: the header search control is a <button type="button"> with aria-haspopup and aria-expanded="false"`, () => {
    const d = doc(file);
    const btns = d.querySelectorAll(SEARCH_BTN);
    assert.equal(btns.length, 1, 'one header search control');
    const b = btns[0];
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.getAttribute('type'), 'button');
    assert.equal(b.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(b.getAttribute('aria-expanded'), 'false');
    assert.ok(b.getAttribute('aria-label'), 'has an accessible name');
    assert.ok(!b.hasAttribute('href'));
    assert.equal(d.querySelector('a.js-search'), null, 'no link is left acting as a search or close control');
    assert.equal(d.querySelector('#search .js-search').tagName, 'BUTTON', 'the dialog close control is a button too');
  });
}

// Runs the real open/close code from assets/js/wowchemy.js against a built page.
function searchHarness() {
  const dom = new JSDOM(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), { runScripts: 'outside-only' });
  const { window } = dom;
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/wowchemy.js'), 'utf8');
  const start = src.indexOf('// The control that opened the search dialog');
  const end = src.indexOf('/* ----', src.indexOf('function toggleSearchDialog'));
  assert.ok(start > 0 && end > start, 'search code found in wowchemy.js');
  window.eval(`function removeQueryParamsFromUrl() {}\n${src.slice(start, end)}\nwindow.toggleSearchDialog = toggleSearchDialog;`);
  const d = window.document;
  const btn = d.querySelector(SEARCH_BTN);
  // wowchemy.js wires the click handler (and Space/Enter reach it as a click on a button); do the same here.
  d.querySelectorAll('.js-search').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); window.toggleSearchDialog(); }));
  return { d, btn };
}

test('search: opening sets aria-expanded="true", closing sets it back and returns focus to the header button', () => {
  const { d, btn } = searchHarness();
  btn.focus();
  btn.click();
  assert.ok(d.body.classList.contains('searching'));
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(d.activeElement, d.getElementById('search-query'));
  d.querySelector('#search .js-search').click();
  assert.ok(!d.body.classList.contains('searching'));
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(d.activeElement, btn, 'focus is back on the button after the close control');
});

test('search: opened without a focused control (the "/" key), closing still lands on the header button', () => {
  const { d, btn } = searchHarness();
  d.defaultView.toggleSearchDialog();
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  d.defaultView.toggleSearchDialog();
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(d.activeElement, btn);
});

test('search: wowchemy.js wires every .js-search control by click, so Enter and Space (native button clicks) both open it', () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/wowchemy.js'), 'utf8');
  assert.match(js, /querySelectorAll\('\.js-search'\)[\s\S]{0,120}addEventListener\('click'/);
  assert.doesNotMatch(js, /keydown[\s\S]{0,80}js-search/, 'no custom key handler is needed on a real button');
});

test('closing the search dialog restores focus to the control that opened it', () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/wowchemy.js'), 'utf8');
  assert.match(js, /searchOpener = active/, 'the opener is remembered when the dialog opens');
  assert.match(js, /returnTo\.focus\(\)/, 'and focused again when it closes');
  const open = js.indexOf("body.classList.add('searching')");
  const close = js.indexOf('returnTo.focus()');
  assert.ok(close > 0 && open > close, 'restore happens in the close branch, remember in the open branch');
});
