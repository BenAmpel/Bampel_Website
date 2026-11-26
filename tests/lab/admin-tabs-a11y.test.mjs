// The study admin's section tabs and Edit study subtabs (static/lab/engine/admin.js) expose which one is shown:
//  - the current button carries aria-current="true" (not aria-selected, which is ignored on a plain button), and
//    exactly one button in each group has it after every switch
//  - both button groups are labelled nav landmarks
//  - clicking a subtab moves focus to the rebuilt current subtab instead of dropping it to the page
//  - the shown section matches the current tab
// And the first tab and the status line (docs/designs/console-ia.md, Stage 1): a draft opens on Edit study for an
// editor, a live study on Participants; a tab saved in this browser tab wins; #import opens the import section; the
// automatic choice is not saved; the line under the title says Draft or Live.
// And the grouped row (Stage 2): Results holds Pilot report, Figures and Analyze behind one tab with a view switch;
// More holds Data quality, Team, Encryption, Activity and Backups & sharing; the current control is the row button,
// the Results button or the More summary; Edit study's side list is grouped in the order a participant meets it.
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
const post = async (path, body, key = KEY) => (await fetch(base + path, { method: 'POST', headers: { 'x-admin-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

// The page's own <script> tag is left out (jsdom runs nothing by itself here); admin.js is run below.
const page = readFileSync(STATIC + '/lab/admin/index.html', 'utf8'), TAG = '<script src="/lab/engine/admin.js"></script>';
assert(page.includes(TAG), 'the admin page loads admin.js');
const html = page.split(TAG).join('');
const ADMIN_JS = readFileSync(STATIC + '/lab/engine/admin.js', 'utf8');
const pages = [];
let inFlight = 0;   // page fetches not yet answered; pages are closed only once this is 0

// A fresh page (its own sessionStorage) for a study, signed in with key. savedTab is written where the page keeps
// its tab; hash is added to the address; dropLive removes `live` from the me reply. Resolves once a tab is current.
async function openAdmin({ study = 'tab-test', key = KEY, hash = '', savedTab, dropLive = false } = {}) {
  const dom = new JSDOM(html, { url: base + '/lab/admin/' + study + '/' + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom, doc = window.document;
  pages.push(window);
  window.sessionStorage.setItem('lab_admin_key', key);
  if (savedTab) window.sessionStorage.setItem('lab_admin_tab_' + study, savedTab);
  window.fetch = async (u, o) => {
    inFlight++;
    let res; try { res = await fetch(new URL(u, base), o); } finally { inFlight--; }
    if (!dropLive || !/\/admin\/me$/.test(new URL(u, base).pathname)) return res;
    const j = await res.json(); delete j.live;
    return new Response(JSON.stringify(j), { status: res.status, headers: { 'content-type': 'application/json' } });
  };
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
  window.eval(ADMIN_JS);
  const tabs = await until(() => { const t = doc.getElementById('tabs'); return t && t.querySelector('[aria-current="true"]') && t; }, 'a current section tab');
  const state = doc.getElementById('studystate');
  return { window, doc, tabs, state, saved: () => window.sessionStorage.getItem('lab_admin_tab_' + study) };
}
const current = nav => [...nav.querySelectorAll('button, summary')].filter(b => b.getAttribute('aria-current') === 'true').map(b => b.getAttribute('data-tab') || b.getAttribute('data-sub') || 'more');
const rowLabels = nav => [...nav.children].map(el => el.tagName === 'DETAILS' ? el.querySelector('summary').textContent : el.textContent);
// Opens More and clicks one of its items.
const viaMore = (nav, id) => { nav.querySelector('details.more-menu').open = true; nav.querySelector(`.more-menu button[data-tab="${id}"]`).click(); };

try {
  for (const [id, body] of [['tab-test', { type: 'vignettes' }], ['tab-live', { type: 'vignettes' }], ['tab-lock', { type: 'multimodal', template: 'multimodal-builder' }], ['tab-chat', { type: 'chatbot' }]]) {
    const made = await post('/api/lab/_lab/create', { id, name: id, ...body });
    assert(made.ok, JSON.stringify(made));
  }
  // Live: one real participant enrolled by the admin route (engine enroll), who then consents as a participant would.
  const live = await post('/api/lab/tab-live/admin/create', { count: 1 });
  const code = (live.created || live.participants || [])[0]?.code;
  assert(code, JSON.stringify(live));
  const login = await post('/api/lab/tab-live/login', { code });
  assert(login.token, JSON.stringify(login));
  assert((await post('/api/lab/tab-live/consent', { token: login.token, agree: true })).ok !== false);
  // Locked draft: a builder study with one real participant enrolled (this writes lock/structure) who has not consented.
  assert((await post('/api/lab/tab-lock/admin/create', { count: 1 })).created, 'enrolled on the builder study');
  // A viewer, added the way the Team tab adds one.
  const viewerKey = (await post('/api/lab/tab-test/admin/team-add', { name: 'Viewer', role: 'viewer' })).key;
  assert(viewerKey, 'team-add returns a key');

  // (a) owner, draft
  const A = await openAdmin();
  assert.deepEqual(current(A.tabs), ['content'], '(a1) owner, draft: Edit study is current');
  assert.equal(A.state.textContent, 'Draft: no real sign-ups yet', '(a2) owner, draft: status line');
  assert.equal(A.state.hidden, false);
  assert.equal(A.saved(), null, '(g) the automatic first tab is not saved');
  // (b) owner, live
  const B = await openAdmin({ study: 'tab-live' });
  assert.deepEqual(current(B.tabs), ['participants'], '(b1) owner, live: Participants is current');
  await until(() => B.state.textContent === 'Live: 1 real participant', '(b2) the count after the list loads: ' + B.state.textContent);
  // (c) viewer, draft
  const Cv = await openAdmin({ key: viewerKey });
  assert.deepEqual(current(Cv.tabs), ['participants'], '(c1) viewer, draft: Participants is current');
  assert(Cv.tabs.querySelector('button[data-tab="content"]'), '(c2) viewer: the Edit study tab is visible');
  assert.equal(Cv.state.textContent, 'Draft: no real sign-ups yet. See Edit study for the design.', '(c3) viewer, draft: status line');
  // (d) owner, draft, me without live
  const D = await openAdmin({ dropLive: true });
  assert.deepEqual(current(D.tabs), ['participants'], '(d1) no live field: Participants is current');
  assert.equal(D.state.hidden, true, '(d2) no live field: the status line is hidden');
  // (e) saved tab wins
  const E = await openAdmin({ savedTab: 'students' });
  assert.deepEqual(current(E.tabs), ['students'], '(e) a saved tab is opened');
  // (f) #import wins over a saved tab
  const F = await openAdmin({ hash: '#import', savedTab: 'students' });
  assert.deepEqual(current(F.tabs), ['content'], '(f1) #import: Edit study is current');
  const fsub = await until(() => { const t = F.doc.getElementById('subtabs'); return t && t.querySelector('button[aria-current="true"]') && t; }, 'the import subtab');
  assert.deepEqual(current(fsub), ['import'], '(f2) #import: the import section is current');
  // (h) owner, locked builder draft
  const H = await openAdmin({ study: 'tab-lock' });
  assert.equal(H.state.textContent, 'Draft: no one has consented yet. The design is locked because a real person registered.', '(h) locked draft: status line');
  console.log('first tab and status line: draft, live, viewer, no live field, saved tab, #import, not saved, locked');

  // The tab group itself, on page A.
  const { doc, tabs } = A;
  const shown = () => [...doc.querySelectorAll('section[data-tab]')].filter(s => !s.hidden).map(s => s.getAttribute('data-tab'));
  assert.equal(tabs.tagName, 'NAV'); assert.equal(tabs.getAttribute('aria-label'), 'Study admin sections');
  assert.equal(tabs.querySelector('button').getAttribute('data-tab'), 'content', 'Edit study is the first tab');
  assert.equal(doc.querySelectorAll('[aria-selected]').length, 0, 'no aria-selected on plain buttons');
  assert.deepEqual(shown(), ['content']);
  assert.equal(doc.querySelectorAll('h1').length, 1, 'one h1');

  for (const name of ['report', 'students', 'participants']) {
    tabs.querySelector(`:scope > button[data-tab="${name}"]`).click();
    assert.deepEqual(current(tabs), [name], `${name}: only that tab is current`);
    assert.deepEqual(shown(), [name], `${name}: only its section is shown`);
    assert.equal(A.saved(), name, `${name}: a clicked tab is saved`);
  }
  tabs.querySelector('button[data-tab="content"]').click();
  assert.deepEqual(current(tabs), ['content']);
  console.log('section tabs: aria-current follows the click, one at a time, and matches the shown section');

  // More: an item click opens its section, marks the summary current and closes the menu; Escape closes it and focuses the summary.
  const more = tabs.querySelector('details.more-menu'), summary = more.querySelector('summary');
  assert.equal(tabs.lastElementChild, more, 'More is last in the row');
  assert.deepEqual([...more.querySelectorAll('button')].map(b => b.textContent), ['Data quality', 'Team', 'Encryption', 'Activity', 'Backups & sharing'], 'owner: More items in order');
  viaMore(tabs, 'team');
  assert.deepEqual(current(tabs), ['more'], 'Team open: the More summary is current');
  assert.deepEqual(shown(), ['team']);
  assert.equal(A.saved(), 'team', 'a More item is saved like any tab');
  assert.equal(more.open, false, 'an item click closes More');
  more.open = true; summary.focus();
  doc.dispatchEvent(new A.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(more.open, false, 'Escape closes More');
  assert.equal(doc.activeElement, summary, 'Escape leaves focus on the summary');
  viaMore(tabs, 'activity');
  assert.deepEqual(shown(), ['activity']); assert.deepEqual(current(tabs), ['more']);
  console.log('More: items in order, summary current, item click and Escape close it');

  // Results: one row button; the view switch changes the panel, the row button stays current, the bar follows.
  const bar = doc.getElementById('resultsbar');
  const pressed = () => [...bar.querySelectorAll('[data-view]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.getAttribute('data-view'));
  tabs.querySelector('button[data-results]').click();
  assert.equal(bar.hidden, false, 'the Results bar shows on Results');
  bar.querySelector('[data-view="figures"]').click();
  assert.deepEqual(shown(), ['figures']); assert.deepEqual(current(tabs), ['report'], 'Figures: the Results button is current');
  assert.deepEqual(pressed(), ['figures'], 'Figures is pressed');
  tabs.querySelector(':scope > button[data-tab="students"]').click();
  assert.equal(bar.hidden, true, 'the bar hides off Results');
  tabs.querySelector('button[data-results]').click();
  assert.deepEqual(shown(), ['figures'], 'Results reopens the last view');
  bar.querySelector('#rsgo').click();
  assert.deepEqual(shown(), ['participants'], 'the download link opens Participants');
  tabs.querySelector(':scope > button[data-tab="content"]').click();
  console.log('Results: one row button, a view switch, the last view remembered, a way to the download');

  const subtabs = await until(() => { const t = doc.getElementById('subtabs'); return t && t.querySelector('button') && t; }, 'the content subtabs');
  assert.equal(subtabs.getAttribute('aria-label'), 'Edit study sections');
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

  // The side list's groups, in the order a participant meets them; consent before pre-survey; the type's first own section opens.
  const heads = [...subtabs.querySelectorAll('h3')].map(h => h.textContent);
  assert.equal(heads[0], 'Before the task');
  const order = ['Before the task', 'The study', 'After the task', 'Throughout', 'Delivery'];
  assert.deepEqual(heads, order.filter(h => heads.includes(h)), 'groups in order: ' + heads.join());
  const firstUnder = name => { const h = [...doc.querySelectorAll('#subtabs h3')].find(x => x.textContent === name); return h.nextElementSibling.getAttribute('data-sub'); };
  assert.equal(firstUnder('Before the task'), 'consent', 'consent is drawn before the pre-survey');
  const P = await openAdmin({ savedTab: 'content' });
  const psub = await until(() => { const t = P.doc.getElementById('subtabs'); return t && t.querySelector('button[aria-current="true"]') && t; }, 'a current subtab');
  const pFirst = [...psub.querySelectorAll('h3')].find(x => x.textContent === 'The study').nextElementSibling.getAttribute('data-sub');
  assert.deepEqual(current(psub), [pFirst], 'the type\'s first own section (first under The study) is current');
  console.log('side list: groups in order, consent first, opens on the type\'s first own section');

  // A chat study's row for an owner and a viewer; a saved Results view; Backups & sharing.
  const chatViewer = (await post('/api/lab/tab-chat/admin/team-add', { name: 'V', role: 'viewer' })).key;
  const CO = await openAdmin({ study: 'tab-chat', savedTab: 'analyze' });
  assert.deepEqual(rowLabels(CO.tabs), ['Edit study', 'Participants', 'Results', 'Students', 'Compare', 'Conversations', 'More'], 'chat study, owner: ' + rowLabels(CO.tabs).join());
  assert.equal(CO.doc.querySelector('section[data-tab="analyze"]').hidden, false, 'a saved analyze tab opens Analyze');
  assert.deepEqual(current(CO.tabs), ['report']);
  const CV = await openAdmin({ study: 'tab-chat', key: chatViewer, savedTab: 'sharing' });
  assert.deepEqual(rowLabels(CV.tabs), ['Edit study', 'Participants', 'Results', 'More'], 'chat study, viewer: ' + rowLabels(CV.tabs).join());
  const share = CV.doc.querySelector('section[data-tab="sharing"]');
  assert.equal(share.hidden, false, 'a saved sharing tab opens Backups & sharing');
  assert(share.querySelector('#bundledl'), 'a viewer sees the reproducibility bundle');
  assert.equal(share.querySelector('[data-role="owner"]').hidden, true, 'a viewer does not see Backups');
  // The bundle's file name carries the content version even when Edit study was never opened on this page.
  const get = async path => (await fetch(base + path, { headers: { 'x-admin-key': KEY } })).json();
  const chatContent = await get('/api/lab/tab-chat/admin/content');
  for (const k of Object.keys(chatContent)) if (k[0] === '_' || k === 'locked') delete chatContent[k];
  const savedV = await post('/api/lab/tab-chat/admin/content-save', { content: chatContent, baseVersion: chatContent.version || 0 });
  assert(savedV.ok && savedV.version >= 1, JSON.stringify(savedV));
  const names = [];
  CV.window.URL.createObjectURL = () => 'blob:test'; CV.window.URL.revokeObjectURL = () => {};
  CV.window.HTMLAnchorElement.prototype.click = function () { if (this.download) names.push(this.download); };
  share.querySelector('#bundledl').click();
  await until(() => names.length, 'the bundle download');
  assert.deepEqual(names, [`tab-chat_materials_v${savedV.version}.zip`], 'bundle file name from the content version: ' + names.join());
  console.log('chat study row for owner and viewer; saved analyze and sharing tabs; Backups owner-only; bundle name without the editor');
} finally {
  await until(() => inFlight === 0, 'the pages\' own requests').catch(() => {});
  await wait(50);
  for (const w of pages) w.close();
  server.closeAllConnections?.(); server.close();
}
