// The lab console's two file forms (static/lab/engine/admin.js) in the real page, end to end:
//  - "Create a study from a design file": choosing a design file and submitting creates the study from it
//  - "Create a study from a survey file": the file is read and handed to the new study's import page
// Both use the page's readFile(file). From 2026-10-30 to this fix a second `function readFile(input)` for the sealed
// key file sat in the same scope, replaced it for every caller, and both forms failed with "Choose a file." (the
// survey import page, which gets readFile through the plugin API, failed the same way). The static check at the end
// keeps a second declaration out.
// Runs the real admin.js in jsdom against the local lab server on in-memory stores (nothing is saved to disk).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { labServer, listen } from '../../scripts/lab/server.mjs';
import { memBlobs } from './memstore.mjs';

const STATIC = fileURLToPath(new URL('../../static', import.meta.url));
const FIX = p => fileURLToPath(new URL('./fixtures/import/' + p, import.meta.url));
const KEY = 'console-forms-owner-key-0123456789';
const server = labServer({ getStore: memBlobs(), env: { LAB_ADMIN_KEY: KEY } });
const port = await listen(server, 19600 + Math.floor(Math.random() * 300), '127.0.0.1');
const base = `http://127.0.0.1:${port}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(20); }
}
const api = (path, o = {}) => fetch(base + path, { ...o, headers: { 'x-admin-key': KEY, 'content-type': 'application/json', ...(o.headers || {}) } }).then(async r => ({ status: r.status, j: await r.json() }));

// Opens the lab console (no study id) in jsdom, signed in with the owner key.
async function openConsole() {
  const page = readFileSync(STATIC + '/lab/admin/index.html', 'utf8'), TAG = '<script src="/lab/engine/admin.js"></script>';
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) console.error(e); });   // the survey form navigates to the import page
  const dom = new JSDOM(page.split(TAG).join(''), { url: `${base}/lab/admin/`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom, doc = window.document;
  window.sessionStorage.setItem('lab_admin_key', KEY);
  window.fetch = (u, o) => fetch(new URL(u, base), o);
  window.Element.prototype.scrollIntoView = function () {};
  window.eval(readFileSync(STATIC + '/lab/engine/admin.js', 'utf8'));
  await until(() => doc.getElementById('dsgform') && doc.getElementById('impform'), 'the console forms');
  return { window, doc };
}
const choose = (window, input, text, name, type) => Object.defineProperty(input, 'files', { configurable: true, value: [new window.File([text], name, { type })] });
const errText = doc => [...doc.querySelectorAll('.err,[role=alert]')].map(e => e.textContent).join(' ').trim();

// A design file to import: export one from a study made from a template.
const src = await api('/api/lab/_lab/create', { method: 'POST', body: JSON.stringify({ id: 'source-study', name: 'Source study', type: 'multimodal', template: 'multimodal-builder' }) });
assert.equal(src.status, 200, JSON.stringify(src.j));
const design = (await api('/api/lab/source-study/admin/design.json')).j;
assert(design.content && design.content.items, 'the source study exports a design file');

{
  const { window, doc } = await openConsole();
  choose(window, doc.getElementById('dfile'), JSON.stringify(design), 'design.json', 'application/json');
  doc.getElementById('did').value = 'from-design-file';
  doc.getElementById('dname').value = 'Made from a design file';
  doc.getElementById('dsgform').requestSubmit();
  await until(() => /is ready/.test(doc.getElementById('dsgout').textContent) || /Choose a file|not a study design/.test(errText(doc)), 'the design-file result');
  assert.equal(errText(doc), '', 'no error from the design-file form');
  assert.match(doc.getElementById('dsgout').textContent, /Made from a design file is ready/);
  const made = await api('/api/lab/from-design-file/admin/design.json');
  assert.equal(made.status, 200);
  assert.deepEqual(made.j.content.items.map(i => i.id), design.content.items.map(i => i.id), 'the new study has the file\'s items');
  assert.equal(made.j.study.type, 'multimodal');

  // A file that is not JSON gets the form's own message, not "Choose a file."
  choose(window, doc.getElementById('dfile'), 'not json', 'notes.txt', 'text/plain');
  doc.getElementById('did').value = 'bad-file';
  doc.getElementById('dsgform').requestSubmit();
  await until(() => errText(doc), 'the bad-file error');
  assert.match(errText(doc), /not a study design file/);
  window.close();
}

{
  const { window, doc } = await openConsole();
  const qsf = readFileSync(FIX('demo.qsf'), 'utf8');
  choose(window, doc.getElementById('ifile'), qsf, 'demo.qsf', 'application/json');
  doc.getElementById('iname').value = 'From a survey file';
  doc.getElementById('iid').value = 'from-survey-file';
  doc.getElementById('impform').requestSubmit();
  await until(() => window.sessionStorage.getItem('lab_import_pending') || errText(doc), 'the survey-file hand-off');
  assert.equal(errText(doc), '', 'no error from the survey-file form');
  const pending = JSON.parse(window.sessionStorage.getItem('lab_import_pending'));
  assert.equal(pending.study, 'from-survey-file');
  assert.equal(pending.file.filename, 'demo.qsf');
  assert.equal(pending.file.data, qsf, 'the file\'s text is handed to the import page');
  assert.equal((await api('/api/lab/from-survey-file/admin/content')).status, 200, 'the survey study was created');
  window.close();
}

// Only one readFile declaration in admin.js: a second one in the same scope silently replaces the first.
const decls = readFileSync(STATIC + '/lab/engine/admin.js', 'utf8').match(/function readFile\s*\(/g) || [];
assert.equal(decls.length, 1, 'exactly one function readFile in admin.js');

server.close();
console.log('console-file-forms: design-file and survey-file forms read the chosen file');
