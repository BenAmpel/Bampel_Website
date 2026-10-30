// The study admin's section tabs and Study content subtabs (static/lab/engine/admin.js) expose which one is shown:
//  - the current button carries aria-current="true" (not aria-selected, which is ignored on a plain button), and
//    exactly one button in each group has it after every switch
//  - both button groups are labelled nav landmarks
//  - clicking a subtab moves focus to the rebuilt current subtab instead of dropping it to the page
//  - the shown section matches the current tab
// Runs the real admin.js in jsdom against the local lab server on in-memory stores (nothing is saved).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { labServer, listen } from '../../scripts/lab/server.mjs';
import { memBlobs } from './memstore.mjs';

const STATIC = fileURLToPath(new URL('../../static', import.meta.url));
const KEY = 'tab-test-owner-key-0123456789';
const server = labServer({ getStore: memBlobs(), env: { LAB_ADMIN_KEY: KEY } });
const port = await listen(server, 18900 + Math.floor(Math.random() * 300), '127.0.0.1');
const base = `http://127.0.0.1:${port}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(20); }
}

try {
  const made = await (await fetch(base + '/api/lab/_lab/create', { method: 'POST', headers: { 'x-admin-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'tab-test', name: 'Tab test', type: 'vignettes' }) })).json();
  assert(made.ok, JSON.stringify(made));

  const html = readFileSync(STATIC + '/lab/admin/index.html', 'utf8').replace(/<script src="[^"]*"><\/script>/, '');
  const dom = new JSDOM(html, { url: base + '/lab/admin/tab-test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom, doc = window.document;
  window.sessionStorage.setItem('lab_admin_key', KEY);
  window.fetch = (u, o) => fetch(new URL(u, base), o);
  window.Element.prototype.scrollIntoView = function () {};
  // Scripts the page adds (logic.js, the study type's admin file) are read from static/ and run in the page.
  const append = window.HTMLHeadElement.prototype.appendChild;
  window.HTMLHeadElement.prototype.appendChild = function (el) {
    if (el.tagName === 'SCRIPT' && el.src) {
      const path = new URL(el.src).pathname;
      setTimeout(() => {
        let src = null; try { src = readFileSync(STATIC + path, 'utf8'); } catch (e) {}
        if (src == null) return el.onerror && el.onerror();
        window.eval(src); el.onload && el.onload();
      }, 0);
      return el;
    }
    return append.call(this, el);
  };
  window.eval(readFileSync(STATIC + '/lab/engine/admin.js', 'utf8'));

  const tabs = await until(() => { const t = doc.getElementById('tabs'); return t && t.querySelector('button') && t; }, 'the section tabs');
  const current = nav => [...nav.querySelectorAll('button')].filter(b => b.getAttribute('aria-current') === 'true').map(b => b.getAttribute('data-tab') || b.getAttribute('data-sub'));
  const shown = () => [...doc.querySelectorAll('section[data-tab]')].filter(s => !s.hidden).map(s => s.getAttribute('data-tab'));

  assert.equal(tabs.tagName, 'NAV'); assert.equal(tabs.getAttribute('aria-label'), 'Study admin sections');
  assert.equal(doc.querySelectorAll('[aria-selected]').length, 0, 'no aria-selected on plain buttons');
  assert.deepEqual(current(tabs), ['participants'], 'Participants is current at first');
  assert.deepEqual(shown(), ['participants']);
  assert.equal(doc.querySelectorAll('h1').length, 1, 'one h1');

  for (const name of ['report', 'students', 'activity', 'content']) {
    tabs.querySelector(`button[data-tab="${name}"]`).click();
    assert.deepEqual(current(tabs), [name], `${name}: only that tab is current`);
    assert.deepEqual(shown(), [name], `${name}: only its section is shown`);
  }
  console.log('section tabs: aria-current follows the click, one at a time, and matches the shown section');

  const subtabs = await until(() => { const t = doc.getElementById('subtabs'); return t && t.querySelector('button') && t; }, 'the content subtabs');
  assert.equal(subtabs.getAttribute('aria-label'), 'Study content sections');
  const subs = [...subtabs.querySelectorAll('button')].map(b => b.getAttribute('data-sub'));
  assert(subs.includes('pre') && subs.includes('consent') && subs.includes('text'), subs.join());
  assert.equal(current(subtabs).length, 1, 'one subtab is current');
  for (const s of ['consent', 'pre', 'text', subs[0]]) {
    doc.getElementById('subtabs').querySelector(`button[data-sub="${s}"]`).click();
    const nav = doc.getElementById('subtabs');
    assert.deepEqual(current(nav), [s], `${s}: only that subtab is current`);
    assert.equal(doc.activeElement, nav.querySelector(`button[data-sub="${s}"]`), `${s}: focus stays on the current subtab after the rebuild`);
  }
  assert.equal(doc.querySelectorAll('[aria-selected]').length, 0);
  assert.deepEqual(current(tabs), ['content'], 'switching subtabs leaves the section tab alone');
  console.log('subtabs: aria-current follows the click and focus returns to the rebuilt current subtab');
  window.close();
} finally {
  server.closeAllConnections?.(); server.close();
}
