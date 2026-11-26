// The study builder canvas (static/lab/engine/builder.js) inside the real admin page, end to end:
//  - a study made from the builder template opens on the Builder subtab, with its two arms and two sessions
//  - adding an arm, renaming it, and writing a new question on the canvas mark the draft dirty, and Save stores
//    content the server accepts (three conditions, the new question asked in session 1)
//  - once lock/structure exists (a real sign-up), the page shows the lock note, refuses a structural edit (adding an
//    arm) with the lock message and leaves the draft alone, but still lets the owner rename an arm and save; the
//    owner's Unlock button (structure-reset) clears the stamp and structural edits work again
//  - a study the canvas cannot show exactly (no builder key) has no Builder subtab
// Runs the real admin.js in jsdom against the local lab server on in-memory stores (nothing is saved to disk).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { labServer, listen } from '../../scripts/lab/server.mjs';
import { memBlobs } from './memstore.mjs';

const STATIC = fileURLToPath(new URL('../../static', import.meta.url));
const KEY = 'builder-ui-owner-key-0123456789';
const getStore = memBlobs();
const server = labServer({ getStore, env: { LAB_ADMIN_KEY: KEY } });
const port = await listen(server, 19300 + Math.floor(Math.random() * 300), '127.0.0.1');
const base = `http://127.0.0.1:${port}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(20); }
}
const api = (path, o = {}) => fetch(base + path, { ...o, headers: { 'x-admin-key': KEY, 'content-type': 'application/json', ...(o.headers || {}) } }).then(r => r.json());
const stored = id => api(`/api/lab/${id}/admin/content`);

// Closes a page once its own requests have settled, so a late reply cannot reach a closed page (a draft opens on Edit
// study, whose content load starts at once).
async function settle(window) {
  for (const end = Date.now() + 5000; (window.__inFlight || 0) > 0 && Date.now() < end;) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 50));
  window.close();
}
// Opens the admin page for a study in jsdom, on the Edit study tab.
async function open(id) {
  const page = readFileSync(STATIC + '/lab/admin/index.html', 'utf8'), TAG = '<script src="/lab/engine/admin.js"></script>';
  const dom = new JSDOM(page.split(TAG).join(''), { url: `${base}/lab/admin/${id}/`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom, doc = window.document;
  window.sessionStorage.setItem('lab_admin_key', KEY);
  window.fetch = async (u, o) => { window.__inFlight = (window.__inFlight || 0) + 1; try { return await fetch(new URL(u, base), o); } finally { window.__inFlight--; } };
  window.confirm = () => true;
  window.Element.prototype.scrollIntoView = function () {};
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
    if (el.tagName === 'LINK') { setTimeout(() => el.onload && el.onload(), 0); return el; }   // stylesheets: nothing to load in jsdom
    return append.call(this, el);
  };
  window.eval(readFileSync(STATIC + '/lab/engine/admin.js', 'utf8'));
  const tabs = await until(() => { const t = doc.getElementById('tabs'); return t && t.querySelector('button[data-tab="content"]') && t; }, 'the section tabs');
  tabs.querySelector('button[data-tab="content"]').click();
  await until(() => doc.querySelector('#subtabs button'), 'the content subtabs');
  return { window, doc };
}
const subs = doc => [...doc.querySelectorAll('#subtabs button')].map(b => b.getAttribute('data-sub'));
const arms = doc => [...doc.querySelectorAll('#builder [data-b="arm-label"]')].map(i => i.value);
function change(window, el, value) { if (value !== undefined) el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); }
async function save(doc) {
  assert.equal(doc.getElementById('save').disabled, false, 'Save is enabled after an edit');
  doc.getElementById('save').click();
  await until(() => doc.getElementById('save').disabled && /No unsaved/.test(doc.getElementById('dirty').textContent), 'the save to finish');
}

try {
  for (const [id, template] of [['bui', 'multimodal-builder'], ['bui-form', '']]) {
    const made = await api('/api/lab/_lab/create', { method: 'POST', body: JSON.stringify({ id, name: id, type: 'multimodal', ...(template ? { template } : {}) }) });
    assert(made.ok, JSON.stringify(made));
  }

  // 1. Opens on the canvas.
  let { window, doc } = await open('bui');
  assert.equal(subs(doc)[0], 'builder', 'Builder is the first subtab');
  await until(() => doc.querySelector('#builder .bd-lanes'), 'the canvas');
  assert.equal(doc.querySelector('#subtabs button[aria-current="true"]').getAttribute('data-sub'), 'builder', 'Builder is current');
  const before = await stored('bui');
  assert.equal(arms(doc).length, before.design.conditions.length, 'one name box per arm');
  assert.equal(doc.querySelectorAll('#builder .bd-sess').length, 2, 'two sessions');
  assert.equal(doc.querySelector('#builder .bd-fs').disabled, false, 'editable');
  assert.match(doc.getElementById('contentwarn').textContent, /Sign-ups are closed/, 'draft consent: the page says real sign-ups are closed');
  console.log('opens on the Builder subtab with the template\'s arms and sessions');

  // 2. Edits, then Save.
  doc.querySelector('#builder [data-b="arm-add"]').click();
  assert.equal(arms(doc).length, 3, 'an arm was added');
  assert.match(doc.getElementById('dirty').textContent, /Unsaved/, 'the draft is dirty');
  const third = doc.querySelectorAll('#builder [data-b="arm-label"]')[2];
  change(window, third, 'Human review');
  assert.equal(arms(doc)[2], 'Human review', 'the arm was renamed');
  const newQ = doc.querySelector('#builder [data-k^="qn-1-start"]') || doc.querySelector('#builder input[data-k^="qn-"]');
  assert(newQ, 'there is a box for a new question');
  newQ.value = 'How familiar are you with AI tools?';
  newQ.parentNode.querySelector('button').click();
  assert([...doc.querySelectorAll('#builder .bd-ct')].some(c => /How familiar/.test(c.textContent)), 'the new question shows on the canvas');
  assert.equal(doc.querySelector('#builder .bd-msg').classList.contains('bad'), false, 'no refusal');
  await save(doc);
  let after = await stored('bui');
  assert.equal(after.design.conditions.length, 3, 'three conditions saved');
  assert(after.design.conditions.some(c => c.label === 'Human review'), 'the new arm name is saved');
  const q = after.survey.pre.concat(after.survey.post).find(x => /How familiar/.test(x.text));
  assert(q, 'the new question is saved'); assert.deepEqual(q.sessions, [1], 'asked in session 1');
  assert.equal(after.design.randomization.blockSize % 3, 0, 'the block size fits three arms');
  await settle(window);
  console.log('canvas edits save as content the server accepts');

  // 2b. Arm names (B2) and the click or Tab that follows an edit (B1). Nothing here is saved.
  const me = await api('/api/lab/bui/admin/me');
  const third3 = after.design.conditions[2];
  assert.equal(me.armLabels[third3.id], 'Human review', '/me gives arm names');
  ({ window, doc } = await open('bui'));
  await until(() => doc.querySelector('#builder .bd-lanes'), 'the canvas');
  await until(() => [...doc.querySelectorAll('#pvcond option')].length > 1, 'the preview arm menu');
  assert([...doc.querySelectorAll('#pvcond option')].some(o => o.textContent === `Human review (${third3.id})`), 'the preview menu shows "name (id)"');
  // A click: pressing Add blurs the name box (change), then the click lands. The click must not be lost.
  const pev = (el, t) => el.dispatchEvent(new window.Event(t, { bubbles: true, cancelable: true }));
  let box = doc.querySelectorAll('#builder [data-b="arm-label"]')[0];
  box.focus(); box.value = 'Plain warning';
  const add = doc.querySelector('#builder [data-b="arm-add"]');
  pev(add, 'pointerdown'); change(window, box); pev(add, 'pointerup'); add.click();
  await wait(30);
  assert.equal(arms(doc)[0], 'Plain warning', 'the edit was kept');
  assert.equal(arms(doc).length, 4, 'and the click on Add that ended it was not lost');
  // Tab: change fires as focus leaves; focus must land on (the redrawn copy of) the next box.
  box = doc.querySelectorAll('#builder [data-b="arm-label"]')[1];
  const nextKey = doc.querySelectorAll('#builder [data-b="arm-label"]')[2].getAttribute('data-k');
  box.focus(); change(window, box, 'Loss framing');
  doc.querySelectorAll('#builder [data-b="arm-label"]')[2].focus();
  await wait(30);
  assert.equal(arms(doc)[1], 'Loss framing');
  assert.equal(doc.activeElement && doc.activeElement.getAttribute('data-k'), nextKey, 'focus is on the next name box after the redraw');
  await settle(window);
  console.log('arm names in /me and the preview menu; the click or Tab after an edit is not lost');

  // 3. The structure lock.
  await getStore({ name: 'lab-bui' }).setJSON('lock/structure', { at: Date.now() });
  ({ window, doc } = await open('bui'));
  await until(() => doc.querySelector('#builder .bd-lanes'), 'the canvas');
  assert.match(doc.getElementById('lockwarn').textContent, /Structure locked/, 'the lock note shows');
  assert(doc.getElementById('unlock'), 'an owner sees the unlock button');
  doc.querySelector('#builder [data-b="arm-add"]')?.click();
  assert.equal(arms(doc).length, 3, 'adding an arm is refused');
  assert.equal(doc.getElementById('save').disabled, true, 'a refused edit leaves the draft clean');
  assert.match(doc.querySelector('#builder .bd-msg').textContent, /real participants have signed up/, 'the refusal says why');
  change(window, doc.querySelectorAll('#builder [data-b="arm-label"]')[2], 'Human reviewer');
  assert.equal(arms(doc)[2], 'Human reviewer', 'renaming an arm is still allowed');
  await save(doc);
  after = await stored('bui');
  assert(after.design.conditions.some(c => c.label === 'Human reviewer'), 'the rename saved under the lock');
  assert.equal(after.design.conditions.length, 3);
  // The owner unlocks (no real participant record exists here, so the server allows it); structural edits work again.
  doc.getElementById('unlock').click();
  await until(() => !doc.getElementById('lockwarn') && doc.querySelector('#builder .bd-lanes'), 'the reload after unlocking');
  assert.equal(await getStore({ name: 'lab-bui' }).get('lock/structure'), null, 'the stamp is gone');
  assert.match(doc.getElementById('contentwarn').textContent, /Structure unlocked/, 'unlocking says so');
  doc.querySelector('#builder [data-b="arm-add"]').click();
  assert.equal(arms(doc).length, 4, 'adding an arm works again');
  await settle(window);
  console.log('the lock refuses structural edits and allows wording; the owner can unlock it');

  // 4. A study without the builder key keeps the form editor only.
  ({ window, doc } = await open('bui-form'));
  assert(!subs(doc).includes('builder'), 'no Builder subtab for a form-editor study');
  await settle(window);
  console.log('a form-editor study has no Builder subtab');
} finally {
  server.closeAllConnections?.(); server.close();
}
