// The quiz study type and its template: validation, pools and per-student shuffling, answer keys never sent to the
// browser, server scoring from the stored question (through the routes), late answers after the time limit, extra
// time, the per-student totals in the wide export, the codebook, the live self-test, and the browser renderer
// (answers sent as screen positions, the skip reminder, and the clock sending the answer when time runs out).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';
import Q, { slotsOf, scoreRecord, GRACE_MS } from '../../netlify/lib/lab/types/quiz.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { blobsFactory } from './import-helpers.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

// ---------- validation ----------
const c = C.defaultContent(Q);
const errs = quiz => { const e = []; Q.validate({ ...c, quiz: { ...c.quiz, ...quiz } }, e); return e; };
assert.deepEqual(errs({}), []);
const item = (x = {}) => ({ id: 'a', kind: 'single', prompt: 'P', options: ['x', 'y'], answer: 0, points: 1, pool: '', keepOrder: false, ...x });
assert(errs({ items: [] }).some(x => /at least one question/.test(x)));
assert(errs({ items: [item({ answer: 5 })] }).some(x => /which option is right/.test(x)), 'an answer that is not an option');
assert(errs({ items: [item({ kind: 'multi', answer: [] })] }).some(x => /at least one right option/.test(x)));
assert(errs({ items: [item({ kind: 'number', options: [], answer: { value: 3 } })] }).some(x => /how far off/.test(x)));
assert(errs({ items: [item(), item()] }).some(x => /unique/.test(x)));
assert(errs({ items: [item({ id: 'a', pool: 'p' }), item({ id: 'b', pool: 'p', points: 2 })] }).some(x => /same points/.test(x)), 'a pool is one slot, so its questions are worth the same');
assert(errs({ items: [item({ options: ['only'] })] }).some(x => /2 to 12 options/.test(x)));
assert(errs({ timeLimitMin: 1.5 }).some(x => /time limit/.test(x)));
assert.deepEqual(errs({ items: [item({ kind: 'text', options: [], answer: null })] }), [], 'short text needs no key');
console.log('validation: keys, pools, options, limits');

// ---------- plans: pools, shuffling, what the browser gets ----------
const pooled = { ...c.quiz, timeLimitMin: 10, items: [item({ id: 'p1', pool: 'pa', answer: 1 }), item({ id: 'solo', options: ['a', 'b', 'c', 'd'], answer: 3 }), item({ id: 'p2', pool: 'pa', answer: 0 })] };
assert.deepEqual(slotsOf(pooled.items).map(s => s.items.map(i => i.id)), [['p1', 'p2'], ['solo']], 'two questions in a pool make one slot, where the first stands');
const cp = { ...c, quiz: pooled }, drawn = new Set();
for (let k = 0; k < 40; k++) {
  const pl = Q.buildPlan({ code: 'X' + k }, 1, cp, E.seeded('s' + k), { shuffle: E.shuffle });
  assert.equal(pl.trials.length, 2);
  for (const t of pl.trials) { drawn.add(t.item.id); assert.deepEqual([...t.optOrder].sort(), t.item.options.map((_, i) => i), 'options shuffled, none lost'); }
  const pub = JSON.stringify(pl.trials.map(t => Q.publicTrial(t)));
  assert(!/"answer"|"id"|"pool"|"slot"|optOrder/.test(pub), 'no answer key, ID, pool, or order sent to the browser');
}
assert.deepEqual([...drawn].sort(), ['p1', 'p2', 'solo'], 'both pool questions are drawn across students');
const keep = Q.buildPlan({ code: 'K' }, 1, { ...c, quiz: { ...pooled, items: [item({ id: 'k', options: ['All', 'b', 'c', 'All of the above'], keepOrder: true })] } }, E.seeded('k'), { shuffle: E.shuffle });
assert.deepEqual(keep.trials[0].optOrder, [0, 1, 2, 3], 'a question can keep its option order');
assert.equal(Q.buildPlan({ code: 'T', timeFactor: 1.5 }, 1, cp, E.seeded('t'), { shuffle: E.shuffle }).quiz.limitMs, 15 * 60000, 'extra time multiplies the limit');
assert.equal(Q.buildPlan({ code: 'T', timeFactor: 9 }, 1, cp, E.seeded('t'), { shuffle: E.shuffle }).quiz.limitMs, 10 * 60000, 'an impossible factor is ignored');
console.log('plans: pools, shuffling, kept order, extra time, nothing secret in the browser');

// ---------- scoring ----------
const sc = (it, data) => scoreRecord({ item: it, data });
assert.deepEqual(sc(item({ answer: 1 }), { choice: 1 }), { correct: 1, points: 1 });
assert.deepEqual(sc(item({ answer: 1 }), { choice: 0 }), { correct: 0, points: 0 });
assert.deepEqual(sc(item({ answer: 1 }), { choice: null }), { correct: 0, points: 0 }, 'no answer scores 0');
assert.deepEqual(sc(item({ kind: 'multi', answer: [0, 2], points: 2 }), { choices: [0, 2] }), { correct: 1, points: 2 });
assert.deepEqual(sc(item({ kind: 'multi', answer: [0, 2] }), { choices: [0, 1, 2] }), { correct: 0, points: 0 }, 'several answers: all of them and nothing else');
assert.deepEqual(sc(item({ kind: 'number', answer: { value: 37.6, tolerance: 0.1 } }), { number: 37.7 }), { correct: 1, points: 1 }, 'inside the tolerance (floating point allowed for)');
assert.deepEqual(sc(item({ kind: 'number', answer: { value: 37.6, tolerance: 0.1 } }), { number: 37.8 }), { correct: 0, points: 0 });
assert.deepEqual(sc(item({ answer: 1 }), { choice: 1, late: true }), { correct: 0, points: 0 }, 'a late answer scores 0');
assert.deepEqual(sc(item({ kind: 'text', answer: null }), { text: 'x' }), { correct: '', points: '' }, 'short text waits for the instructor');
// the browser's screen position is stored as the editor's option number
const t1 = { item: item({ options: ['a', 'b', 'c'], answer: 2 }), optOrder: [2, 0, 1] };
assert.equal(Q.cleanTrialData({ choice: 0 }, t1, { quiz: {} }).choice, 2, 'first on screen = option 3');
assert.equal(Q.cleanTrialData({ choice: 7 }, t1, { quiz: {} }).choice, null, 'a position that was not on screen');
assert.deepEqual(Q.cleanTrialData({ choices: [1, 1, 0, 'x'] }, { ...t1, item: { ...t1.item, kind: 'multi', answer: [0] } }, { quiz: {} }).choices, [0, 2], 'several answers: deduplicated, sorted, junk dropped');
assert.equal(Q.cleanTrialData({ number: '12.5' }, { item: item({ kind: 'number' }), optOrder: [] }, { quiz: {} }).number, 12.5);
assert.equal(Q.cleanTrialData({ number: '1e999' }, { item: item({ kind: 'number' }), optOrder: [] }, { quiz: {} }).number, null);
assert.equal(Q.cleanTrialData({ text: 'x'.repeat(9000) }, { item: item({ kind: 'text' }), optOrder: [] }, { quiz: {} }).text.length, 5000, 'text is capped');
const sealed = Q.cleanTrialData({ text: 'my answer' }, { item: item({ kind: 'text' }), optOrder: [] }, { quiz: {}, seal: v => 'sealed:' + v.length });
assert.equal(sealed.text, 'sealed:9', 'short text is sealed when the study has a key');
console.log('scoring: one, several, number with tolerance, late, text; screen positions mapped back');

// ---------- through the routes, from the template ----------
const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key = OWNER } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
assert((await call('/api/lab/_lab/templates')).json.some(t => t.id === 'graded-quiz' && t.type === 'quiz'));
assert((await call('/api/lab/_lab/create', { body: { id: 'quiz-pilot', name: 'Quiz pilot', template: 'graded-quiz' } })).json.ok);
const A = '/api/lab/quiz-pilot/admin/', P = '/api/lab/quiz-pilot/';
const tc = (await call(A + 'content')).json;
assert.equal(tc.consent.approved, true); assert.match(tc.consent.paragraphs.join(' '), /does not use your camera/, 'the consent page says what is recorded');
const keys = Object.fromEntries(tc.quiz.items.map(it => [it.id, it]));

async function student() {
  const code = (await call(A + 'create', { body: { count: 1 } })).json.created[0].code;
  const token = (await call(P + 'login', { key: null, body: { code } })).json.token;
  await call(P + 'consent', { key: null, body: { token, agree: true } });
  return { code, token, plan: (await call(P + 'session', { key: null, body: { token } })).json };
}
const s1 = await student();
assert.equal(s1.plan.total, 4); assert.equal(s1.plan.quiz.limitMs, 15 * 60000);
assert(s1.plan.quiz.remainingMs > 14 * 60000 && s1.plan.quiz.remainingMs <= 15 * 60000, 'time left comes from the server');
assert(!/"answer"|"pool"|optOrder|"q1"|"q2"|"q3"|"q4"/.test(JSON.stringify(s1.plan.trials)), 'the plan the browser gets has no keys or IDs');
const send = (s, t, data) => call(P + 'trial', { key: null, body: { token: s.token, session: 1, index: t.index, data: { rtMs: 4000, ...data } } });
// Answer: the right option for one-answer (found from the prompt), a wrong set for several-answer, the number, and text.
const byKind = k => s1.plan.trials.find(t => t.q.kind === k);
const single = byKind('single'), rightShown = single.q.options.indexOf(keys.q1.options[keys.q1.answer]);
assert((await send(s1, single, { choice: rightShown })).json.ok);
assert((await send(s1, byKind('multi'), { choices: [0, 1, 2, 3] })).json.ok);
assert((await send(s1, byKind('number'), { number: '37.6' })).json.ok);
assert((await send(s1, byKind('text'), { text: 'The same password opens every site once one leaks.' })).json.ok);
assert((await send(s1, single, { choice: (rightShown + 1) % 4 })).json.repeat, 'a re-sent answer never replaces the first');
const rows = (await call(A + 'rows?kind=trials&codes=' + s1.code)).json, row = id => rows.find(r => r.item_id === id);
assert.deepEqual([row('q1').correct, row('q1').points, row('q1').response], [1, 1, keys.q1.answer + 1], 'scored on the server; response in editor numbers');
assert.equal(row('q1').option_order.split('>').map(Number)[rightShown], keys.q1.answer + 1, 'option_order says what was on screen where');
assert.deepEqual([row('q2').correct, row('q2').response], [0, '1|2|3|4']);
assert.deepEqual([row('q3').correct, row('q3').points], [1, 1]);
assert.deepEqual([row('q4').correct, row('q4').points, row('q4').response_text], ['', '', 'The same password opens every site once one leaks.']);
assert(rows.every(r => r.late === 0 && r.answered === 1));
let wide = (await call(A + 'rows?kind=wide&codes=' + s1.code)).json[0];
assert.deepEqual([wide.s1_quiz_points, wide.s1_quiz_possible, wide.s1_quiz_percent, wide.s1_quiz_to_grade, wide.s1_quiz_late, wide.s1_quiz_unanswered], [2, 5, 40, 1, 0, 0], 'per-student totals');
assert.equal(wide.s1_q1_correct, 1, 'per-question columns too');

// Late: the clock runs on the server, so answers after the limit (plus grace) are kept, marked, and score 0.
const s2 = await student(), realNow = Date.now;
assert((await send(s2, s2.plan.trials[0], { choice: 0 })).json.ok);
Date.now = () => realNow() + 15 * 60000 + GRACE_MS + 5000;
try {
  const again = (await call(P + 'session', { key: null, body: { token: s2.token } })).json;
  assert.equal(again.quiz.remainingMs, 0, 'a reload after the limit gets no time back');
  for (const t of s2.plan.trials.slice(1)) assert((await send(s2, t, t.q.kind === 'single' ? { choice: t.q.options.indexOf(keys.q1.options[keys.q1.answer]) } : { timedOut: true })).json.ok);
} finally { Date.now = realNow; }
const r2 = (await call(A + 'rows?kind=trials&codes=' + s2.code)).json;
assert.equal(r2.filter(r => r.late === 1).length, 3); assert(r2.filter(r => r.late === 1).every(r => r.points === 0 || r.points === ''), 'late answers score 0');
assert(r2.filter(r => r.late === 1).every(r => r.late_ms >= 5000));
wide = (await call(A + 'rows?kind=wide&codes=' + s2.code)).json[0];
assert.equal(wide.s1_quiz_late, 3);

const book = new Set((await call(A + 'codebook.csv')).text.split('\n').map(l => l.split(',')[1]));
for (const col of Object.keys(row('q1'))) assert(book.has(col), `column ${col} is in the codebook`);
for (const col of ['s{n}_quiz_points', 's{n}_quiz_possible', 's{n}_quiz_percent', 's{n}_quiz_to_grade', 's{n}_quiz_late', 's{n}_quiz_unanswered']) assert(book.has(col), `wide column ${col} is in the codebook`);
let st = (await call(A + 'self-test', { body: { condition: 'main' } })).json;
while (!st.done) st = (await call(A + 'self-test', { body: { code: st.code } })).json;
assert.equal(st.failed, 0, JSON.stringify(st.checks.filter(x => !x.pass)));
console.log('template and routes: no keys sent, server scoring, re-sends kept, late answers, wide totals, codebook, self-test');

// ---------- the browser renderer ----------
function page() {
  const els = {}, listeners = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', disabled: false, classList: { toggle() {} }, focus() {}, addEventListener(t, f) { (listeners[id + ':' + t] = listeners[id + ':' + t] || []).push(f); } });
  let checked = [];
  const stage = { querySelector: s => (/:checked/.test(s) ? (checked.length ? { value: String(checked[0]) } : null) : null), querySelectorAll: () => checked.map(v => ({ value: String(v) })) };
  return { els, listeners, el, stage, check: v => { checked = v; }, fire: (id, t) => (listeners[id + ':' + t] || []).forEach(f => f({ target: el(id) })) };
}
let pg = page(), clockNow = 0;
const sandbox = { setTimeout: () => 0, clearTimeout() {}, setInterval: (f) => { sandbox._tick = f; return 1; }, clearInterval() { sandbox._tick = null; },
  performance: { now: () => clockNow }, console, isFinite,
  document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: id => pg.el(id) } };
sandbox.LabEngine = { registerType: (id, impl) => { sandbox.impl = impl; } };
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/types/quiz.js'), 'utf8'), sandbox);
let html = '', submitted = null;
const ui = () => ({ esc: s => String(s).replace(/</g, '&lt;'), T: (k, v) => k + (v ? JSON.stringify(v) : ''), Th: (k, v) => k + (v ? JSON.stringify(v) : ''), Tp: k => `<p>${k}</p>`, show: h => { html = h; }, errorBox: m => m, nextId: p => p + Math.random().toString(36).slice(2, 6), stage: pg.stage });
const mk = (q, quiz = { limitMs: 0, remainingMs: null }) => ({ trial: { q }, plan: { total: 3, session: 1, quiz, trials: [{ done: false }, { done: false }, { done: true }] }, ms: () => 1234, record() {}, submit: f => { submitted = f; } });
assert.match(sandbox.impl.instructions({ quiz: { limitMs: 600000 } }, ui()), /quiz_final_note.*quiz_time_note/, 'instructions: answers are final, and the time limit');
sandbox.impl.runTrial(mk({ kind: 'single', prompt: 'Pick <b>one</b>', points: 2, options: ['A', 'B<script>'] }), ui());
assert(/type="radio"/.test(html) && !/<script>/.test(html) && !/<b>one/.test(html), 'radios; question and options escaped');
assert(/quiz_next/.test(html) && !/qzclock/.test(html), 'Next (not the last question), no clock without a limit');
pg.fire('qznext', 'click');
assert.equal(submitted, null); assert.match(pg.el('qzmsg').innerHTML, /quiz_skip_confirm/, 'an empty answer gets one reminder');
pg.fire('qznext', 'click');
assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { rtMs: 1234, timedOut: false }, 'the second press moves on without an answer');
pg = page(); submitted = null;
const u2 = ui(); u2.stage = pg.stage;
sandbox.impl.runTrial({ ...mk({ kind: 'multi', prompt: 'P', points: 1, options: ['a', 'b', 'c'] }), plan: { total: 1, session: 1, quiz: {}, trials: [{ done: false }] } }, u2);
assert(/type="checkbox"/.test(html) && /quiz_last/.test(html), 'checkboxes; the last question says Submit');
pg.check([0, 2]); pg.fire('qznext', 'click');
assert.deepEqual(JSON.parse(JSON.stringify(submitted.choices)), [0, 2], 'screen positions are sent, never option text');   // (an array from the sandbox's realm)
// The clock: when it reaches zero, the current answer is sent, marked timed out; the next question is sent empty at once.
pg = page(); submitted = null; clockNow = 1000;
const u3 = ui(); u3.stage = pg.stage;
const plan3 = { total: 2, session: 1, quiz: { limitMs: 60000, remainingMs: 30000 }, trials: [{ done: false }, { done: false }] };
sandbox.impl.runTrial({ trial: { q: { kind: 'number', prompt: 'N', points: 1, options: [] } }, plan: plan3, ms: () => 500, record() {}, submit: f => { submitted = f; } }, u3);
assert.match(pg.el('qzclock').textContent, /0:30/, 'the clock shows the time the server reported');
pg.el('qzin').value = '12.5'; clockNow = 31001; sandbox._tick();
assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { number: '12.5', rtMs: 500, timedOut: true }, 'time up: the typed answer is sent');
submitted = null;
sandbox.impl.runTrial({ trial: { q: { kind: 'single', prompt: 'S', points: 1, options: ['a', 'b'] } }, plan: plan3, ms: () => 0, record() {}, submit: f => { submitted = f; } }, u3);
assert.match(html, /quiz_time_up/); assert.deepEqual(JSON.parse(JSON.stringify(submitted)), { rtMs: 0, timedOut: true }, 'later questions are sent empty without being shown');
console.log('browser: escaping, skip reminder, screen positions, the clock and time running out');
