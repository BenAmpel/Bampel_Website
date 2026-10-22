// Slider, ranking, and matrix questions (questiontypes.mjs and participant.js): validation, cleaning (an untouched
// slider has no answer; a ranking must be a full order; matrix rows are their own variables), display logic clearing
// matrix rows, exports and codebook, the live self-test, and markup that works by keyboard.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import { runSelfTest } from '../../netlify/lib/lab/selftest.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { memStore } from './memstore.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

const opt = (value, label = value) => ({ value, label });
const base = { sessions: [1], conditions: [], showIf: 'always' };
const slider = { id: 'risk', type: 'slider', text: 'How risky?', min: 0, max: 10, step: 0.5, lo: 'not at all', hi: 'very', ...base };
const rank = { id: 'prefs', type: 'rank', text: 'Rank these', options: [opt('mail', 'Email'), opt('call', 'Phone call'), opt('text', 'Text message')], required: true, ...base };
const gate = { id: 'owns', type: 'choice', text: 'Own a phone?', options: [opt('y'), opt('n')], ...base };
const matrix = { id: 'att', type: 'matrix', text: 'How much do you agree?', rows: [{ id: 'att_trust', text: 'Calls can be trusted.' }, { id: 'att_verify', text: 'I verify callers.' }],
  options: [opt('1', 'Disagree'), opt('2', 'Neutral'), opt('3', 'Agree')], displayIf: { q: 'owns', op: 'eq', value: 'y' }, ...base };
const items = [slider, rank, gate, matrix];

// ---------- validation ----------
const errs = list => { const e = []; C.validateQuestions(list, 'Q', e, { nSessions: 1, conditions: ['a'], rules: [], allowSessions: true, embedded: [] }); return e; };
assert.deepEqual(errs(items), []);
assert(errs([{ ...slider, max: -1 }]).some(x => /largest above the smallest/.test(x)));
assert(errs([{ ...slider, step: 0.3 }]).some(x => /equal steps/.test(x)), '0.3 does not divide 0 to 10');
assert(errs([{ ...rank, options: [opt('a')] }]).some(x => /2 to 20 options|at least two/.test(x)));
assert(errs([{ ...matrix, displayIf: undefined, rows: [{ id: 'risk', text: 'x' }] }, slider]).some(x => /"risk" is used twice/.test(x) || /used twice/.test(x)), 'a row name cannot repeat a question name');
assert(errs([{ ...matrix, displayIf: undefined, rows: [{ id: 'code', text: 'x' }] }]).some(x => /reserved/.test(x)));
{ const e = []; C.validateQuestions([slider], 'Item question', e, { nSessions: 99, conditions: [], rules: [], allowSessions: false, embedded: [] }); assert(e.some(x => /only be used in start- and end-of-session surveys/.test(x)), 'surveys only'); }
console.log('validation: ranges, steps, options, row names, surveys only');

// ---------- cleaning ----------
const clean = d => E.cleanAnswers(d, items, {});
assert.deepEqual(clean({}), {}, 'nothing touched, nothing saved');
assert.deepEqual(clean({ risk: 7.5 }), { risk: '7.5' }); assert.deepEqual(clean({ risk: '0' }), { risk: '0' }, 'zero is an answer');
assert.deepEqual(clean({ risk: 7.3 }), {}, 'off the step grid'); assert.deepEqual(clean({ risk: 11 }), {}, 'out of range');
assert.deepEqual(clean({ prefs: ['call', 'text', 'mail'] }), { prefs: ['call', 'text', 'mail'] });
assert.deepEqual(clean({ prefs: ['call', 'call', 'mail'] }), {}, 'not a full order'); assert.deepEqual(clean({ prefs: ['call', 'mail'] }), {});
assert.deepEqual(clean({ owns: 'y', att_trust: '3', att_verify: '9', att: 'x' }), { owns: 'y', att_trust: '3' }, 'rows are variables; a bad value is dropped');
assert.deepEqual(clean({ owns: 'n', att_trust: '3', att_verify: '1' }), { owns: 'n' }, 'a hidden matrix loses its rows');

// ---------- saved, exported, documented, self-tested ----------
const type = TYPES.vignettes, store = memStore(), S = { store, type, study: { id: 'qt', name: 'Q', type: 'vignettes', codePrefix: 'QT' } };
const c = C.defaultContent(type); c.survey.pre = structuredClone(items);
assert.equal((await C.saveContent(store, type, c, 'T', 0)).version, 1);
const [p] = (await E.createParticipants(S, 1, { gapDays: 0 })).created;
await E.consent(S, p.code, true); await E.startSession(S, p.code);
assert((await E.saveSurvey(S, p.code, 1, 'pre', { risk: 2.5, prefs: ['text', 'mail', 'call'], owns: 'y', att_trust: '1', att_verify: '2' })).ok);
const csv = await E.exportSurveyCsv(S), [head, row] = csv.trim().split('\n').map(l => l.split(','));
const val = k => row[head.indexOf(k)];
assert.deepEqual([val('risk'), val('prefs'), val('att_trust'), val('att_verify')], ['2.5', 'text|mail|call', '1', '2']);
assert(!head.includes('att'), 'the matrix itself has no column, its rows do');
const book = buildCodebook(S, await C.getContent(store, type)).filter(x => x.file === 'surveys');
assert.match(book.find(x => x.column === 'risk').values, /0 to 10 in steps of 0\.5; blank = not touched/);
assert.match(book.find(x => x.column === 'prefs').values, /rank order.*mail = Email; call = Phone call/);
assert.equal(book.find(x => x.column === 'att_verify').label, 'How much do you agree? I verify callers.');
assert.equal(book.find(x => x.column === 'att_verify').values, '1 = Disagree; 2 = Neutral; 3 = Agree');
assert(!book.some(x => x.column === 'att'));
let st = await runSelfTest(S, { condition: type.conditionsOf(await C.getContent(store, type))[0] });
while (!st.done) st = await runSelfTest(S, { code: st.code });
assert.equal(st.failed, 0, JSON.stringify(st.checks.filter(x => !x.pass)));
console.log('engine: saved and exported (rows as columns, ranking as an order), codebook entries, self-test passes');

// ---------- markup ----------
const LabLogic = createRequire(import.meta.url)(here('../../static/lab/engine/logic.js'));
const sandbox = { window: { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {} }, document: { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? { innerHTML: '', querySelector: () => null } : { textContent: '' }), createElement: () => ({}), head: { appendChild() {} } },
  location: { pathname: '/x', search: '', origin: 'https://x.test' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => 0 }, fetch: () => Promise.reject(new Error('offline')), setTimeout, URLSearchParams, Blob, URL, console };
sandbox.window.window = sandbox.window; vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
sandbox.window.LabLogic = LabLogic;
const ui = sandbox.window.LabEngine.ui;
const sh = ui.questionHtml(slider);
assert(/role="slider" tabindex="0"/.test(sh) && /data-min="0" data-max="10" data-step="0.5"/.test(sh) && /class="vas-thumb" hidden/.test(sh) && /aria-valuetext="Not set"/.test(sh), 'a keyboard slider with no handle at first');
const rh = ui.questionHtml(rank);
assert.equal((rh.match(/<button type="button"/g) || []).length, 7, 'Up and Down for each option, and "This order is right"');
assert(/aria-label="Move Phone call up"/.test(rh) && /aria-live="polite"/.test(rh) && !/draggable/.test(rh), 'named buttons, announced moves, no dragging');
const mh = ui.questionHtml(matrix);
assert.equal((mh.match(/<fieldset class="q-group mx-row" data-name="att_(trust|verify)">/g) || []).length, 2); assert(/<legend>Calls can be trusted\.<\/legend>/.test(mh));
assert.equal((mh.match(/type="radio" name="att_trust"/g) || []).length, 3, 'each row has its own radio group');
console.log('markup: keyboard slider without a default, button-based ranking, matrix rows as fieldsets');
