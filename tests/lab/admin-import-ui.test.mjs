// The "Import a survey" panel (static/lab/engine/types/vignettes-admin.js) run in Node against the real importer:
// file chosen, preview rendered (escaped), loaded into a draft that still passes validateContent.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importSurvey } from '../../netlify/lib/lab/import/index.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const type = TYPES.vignettes;

let impl = null;
const store = new Map();
const sandbox = { window: {}, LabAdmin: { registerType: (id, i) => { impl = i; } }, document: { querySelector: () => null, getElementById: () => null }, sessionStorage: { getItem: k => store.get(k) ?? null, removeItem: k => store.delete(k), setItem: (k, v) => store.set(k, v) }, confirm: () => true, setTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/types/vignettes-admin.js'), 'utf8'), sandbox);
assert(impl && impl.subtabs.some(s => s[0] === 'import'), 'the Import tab is registered');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const calls = { dirty: 0, goto: null, says: [], errs: [], rerender: 0, posts: [] };
const draft = C.normalize(C.defaultContent(type), type);
draft.consent.paragraphs = ['Real consent text'];
const file = { filename: 'demo.qsf', data: readFileSync(here('./fixtures/import/demo.qsf'), 'utf8'), encoding: 'text', size: 12345 };
const A = { draft, esc, started: 2, studyId: 'demo', clone: x => JSON.parse(JSON.stringify(x)),
  btn: (attr, label, cls, disabled) => `<button type="button" class="${cls || 'secondary'} small" ${attr}${disabled ? ' disabled' : ''}>${label}</button>`,
  readFile: async () => file, post: async (path, body) => { calls.posts.push([path, body.filename, body.format]); return importSurvey(body); },
  err: m => calls.errs.push(m), say: m => calls.says.push(m), markDirty: () => { calls.dirty++; }, rerender: () => { calls.rerender++; }, goto: s => { calls.goto = s; } };

let h = impl.render('import', A);
assert(h.includes('type="file"') && h.includes('nothing is saved') && h.includes('2 real participants have already started'), 'panel, no-save note, and the warning about started participants');
assert(/data-imp-preview="1"[^>]*disabled/.test(h), 'Preview is disabled until a file is chosen');
// choosing a file
assert.equal(impl.select({ id: 'imp-file', files: [{}] }, A), false);
await new Promise(r => setTimeout(r, 5));
h = impl.render('import', A);
assert(h.includes('Chosen: demo.qsf') && h.includes('Qualtrics (.qsf)') && !/data-imp-preview="1"[^>]*disabled/.test(h), 'format detected from the file name; Preview enabled');
// preview
impl.click({ hasAttribute: a => a === 'data-imp-preview' }, A);
await new Promise(r => setTimeout(r, 20));
assert.deepEqual(calls.posts[0], ['import', 'demo.qsf', 'auto']);
h = impl.render('import', A);
assert(h.includes('id="imp-result-h"') && h.includes('<strong>30</strong> items') && h.includes('Not reproduced (') && h.includes('Approximated (') && h.includes('Outline'), 'result sections');
assert(h.includes('Show when social is &quot;Yes&quot;'), 'display logic in plain words, escaped');
assert(!/<script|alert\(/.test(h), 'nothing from the file is unescaped');
assert(h.includes('QID15') && h.includes('JavaScript'), 'unsupported pieces listed with IDs');
let focused = null;
sandbox.document.getElementById = id => (id === 'imp-result-h' ? { focus: () => { focused = id; } } : null);
impl.afterRender('import', A);
assert.equal(focused, 'imp-result-h', 'focus moves to the result heading');
// load into the draft: consent kept
assert.equal(impl.click({ hasAttribute: a => a === 'data-imp-load' }, A), false);
assert.equal(calls.dirty, 1); assert.equal(calls.goto, 'pre'); assert(calls.says.some(m => /Loaded 30 items/.test(m)));
assert.equal(draft.survey.pre.length, 30); assert.deepEqual(draft.embedded.map(e => e.name), ['prolific_pid', 'study_id', 'session_id']); assert.equal(draft.design.conditions.length, 2);
assert.deepEqual(draft.consent.paragraphs, ['Real consent text'], 'consent is kept unless asked');
assert.deepEqual(C.validateContent(C.normalize(structuredClone(draft), type), type), [], 'the loaded draft passes validateContent');
// replace consent too
impl.select({ id: 'imp-consent', checked: true }, A);
impl.click({ hasAttribute: a => a === 'data-imp-load' }, A);
assert(/DRAFT/.test(draft.consent.paragraphs[0]) && draft.consent.approved === false);
// errors from the server are shown, not thrown
A.post = async () => { throw new Error('The file format was not recognized.'); };
impl.click({ hasAttribute: a => a === 'data-imp-preview' }, A);
await new Promise(r => setTimeout(r, 20));
assert(calls.errs.includes('The file format was not recognized.'));
// a file chosen in the lab console arrives through sessionStorage and is previewed on load
{
  impl = null; vm.runInContext(readFileSync(here('../../static/lab/engine/types/vignettes-admin.js'), 'utf8'), sandbox);
  store.set('lab_import_pending', JSON.stringify({ study: 'demo', file: { ...file, filename: 'again.qsf' } }));
  const A2 = { ...A, post: async (p, b) => ({ ...importSurvey(b), pended: true }) };
  impl.onLoad(A2);
  await new Promise(r => setTimeout(r, 30));
  assert(!store.has('lab_import_pending'), 'the pending file is consumed');
  assert(impl.render('import', A2).includes('Preview:'), 'and previewed');
}
console.log('admin import panel: file choice, preview, plain-words logic, load into draft, consent option, errors, console hand-off');
console.log('ALL ADMIN IMPORT UI TESTS PASSED');
