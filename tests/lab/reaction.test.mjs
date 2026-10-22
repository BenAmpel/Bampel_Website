// The reaction-time study type (Stroop or flanker) and its template: balanced trial lists, practice first, server-side
// scoring from the stored stimulus, exports and codebook, the live self-test, and the browser renderer measuring the
// response time from the stimulus's first frame (with a stand-in page, frames, and keys).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';
import R, { trialList, PARADIGMS } from '../../netlify/lib/lab/types/reaction.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { blobsFactory } from './import-helpers.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

// ---------- trial lists ----------
for (const paradigm of ['stroop', 'flanker']) {
  const list = trialList({ paradigm }, 96, E.seeded('x' + paradigm), E.shuffle), vals = PARADIGMS[paradigm].values.map(v => v[0]);
  assert.equal(list.filter(s => s.congruent).length, 48, `${paradigm}: half congruent`);
  for (const v of vals) assert.equal(list.filter(s => s.target === v).length, 96 / vals.length, `${paradigm}: ${v} equally often`);
  for (const v of vals) assert.equal(list.filter(s => s.target === v && s.congruent).length, 96 / vals.length / 2, `${paradigm}: ${v} half congruent`);
  if (paradigm === 'stroop') assert(list.every(s => s.congruent === (s.word === s.target)));
  else assert(list.every(s => s.congruent === (s.flank === s.target)));
}
const c = C.defaultContent(R);
const errs = t => { const e = []; R.validate({ ...c, task: { ...c.task, ...t } }, e); return e; };
assert.deepEqual(errs({}), []);
assert(errs({ keys: { red: 'd', green: 'd', blue: 'j', yellow: 'k' } }).some(x => /its own key/.test(x)));
assert(errs({ responseMs: 50 }).some(x => /response window/.test(x)));
assert(errs({ paradigm: 'nope' }).some(x => /Stroop or flanker/.test(x)));
const n = structuredClone(c); n.task.paradigm = 'flanker'; R.normalize(n, R.defaultContent());
assert.deepEqual(n.task.keys, { left: 'f', right: 'j' }, 'switching to flanker brings its keys');
console.log('trial lists: balanced by congruency and target; settings checked');

// ---------- through the routes, from the template ----------
const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key = OWNER } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
assert((await call('/api/lab/_lab/templates')).json.some(t => t.id === 'stroop-flanker' && t.type === 'reaction'));
assert((await call('/api/lab/_lab/create', { body: { id: 'stroop-pilot', name: 'Stroop pilot', template: 'stroop-flanker' } })).json.ok);
const A = '/api/lab/stroop-pilot/admin/', P = '/api/lab/stroop-pilot/';
const tc = (await call(A + 'content')).json;
assert.equal(tc.environment.fullscreen, true); assert.equal(tc.environment.timingCheck, true); assert.equal(tc.environment.desktopOnly, true);
const code = (await call(A + 'create', { body: { count: 1 } })).json.created[0].code;
const token = (await call(P + 'login', { key: null, body: { code } })).json.token;
await call(P + 'consent', { key: null, body: { token, agree: true } });
const plan = (await call(P + 'session', { key: null, body: { token } })).json;
assert.equal(plan.total, 104, '8 practice + 96 trials'); assert.deepEqual(plan.trials.slice(0, 8).map(t => t.stim.practice), Array(8).fill(true), 'practice first');
assert.equal(plan.task.paradigm, 'stroop'); assert.deepEqual(plan.task.keys, { red: 'd', green: 'f', blue: 'j', yellow: 'k' });
const t0 = plan.trials[8], wrong = Object.keys(plan.task.keys).find(v => v !== t0.stim.target);
assert((await call(P + 'trial', { key: null, body: { token, session: 1, index: t0.index, data: { response: wrong, key: plan.task.keys[wrong], rtMs: 612.345, timedOut: false, via: 'key', timing: { onsetMs: 1000, onsetDelayMs: 500, frameMs: 16.67 } } } })).json.ok);
assert((await call(P + 'trial', { key: null, body: { token, session: 1, index: plan.trials[9].index, data: { response: null, timedOut: true } } })).json.ok);
const rows = (await call(A + 'rows?kind=trials&codes=' + code)).json;
const r0 = rows.find(r => r.trial_index === t0.index), r1 = rows.find(r => r.trial_index === plan.trials[9].index);
assert.deepEqual([r0.correct, r0.rt_ms, r0.response, r0.practice, r0.paradigm, r0.onset_ms], [0, 612.35, wrong, 0, 'stroop', 1000], 'scored on the server from the stored stimulus');
assert.deepEqual([r1.correct, r1.timed_out, r1.rt_ms], ['', 1, ''], 'no answer in time');
const book = new Set((await call(A + 'codebook.csv')).text.split('\n').map(l => l.split(',')[1]));
for (const col of Object.keys(r0)) assert(book.has(col), `column ${col} is in the codebook`);
let st = (await call(A + 'self-test', { body: { condition: 'main' } })).json;
while (!st.done) st = (await call(A + 'self-test', { body: { code: st.code } })).json;
assert.equal(st.failed, 0, JSON.stringify(st.checks.filter(x => !x.pass)));
console.log('template and routes: practice first, server scoring, timeouts, codebook, self-test');

// ---------- the browser renderer ----------
let frameTs = 0, keyHandler = null, submitted = null, html = '';
const stageEl = { innerHTML: '' }, btns = [];
const sandbox = { setTimeout, clearTimeout, performance: { now: () => 5000 }, requestAnimationFrame: f => setTimeout(() => f(frameTs), 0), console,
  document: { querySelector: s => (s === '.rt-stage' ? stageEl : null), querySelectorAll: () => btns, getElementById: () => ({ innerHTML: '' }),
    addEventListener: (t, f) => { if (t === 'keydown') keyHandler = f; }, removeEventListener: (t, f) => { if (keyHandler === f) keyHandler = null; } } };
sandbox.LabEngine = { registerType: (id, impl) => { sandbox.impl = impl; } };
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/types/reaction.js'), 'utf8'), sandbox);
const ui = { esc: s => String(s), T: k => k, Th: k => k, Tp: k => `<p>${k}</p>`, show: h => { html = h; }, errorBox: m => m };
const task = { paradigm: 'stroop', keys: { red: 'd', green: 'f', blue: 'j', yellow: 'k' }, fixationMs: 1, responseMs: 5000, itiMs: 0, feedbackPractice: true };
let marked = 0;
const done = new Promise(res => sandbox.impl.runTrial({ plan: { task }, trial: { stim: { target: 'blue', word: 'red', practice: false } }, markOnset: () => marked++, submit: f => { submitted = f; res(); } }, ui));
assert(/<kbd>D<\/kbd> Red/.test(html) && /rt-fix/.test(html), 'fixation and the answer keys');
keyHandler({ key: 'j', timeStamp: 900, repeat: false, preventDefault() {} });   // too early: before the stimulus, ignored
frameTs = 1000;
await new Promise(r => setTimeout(r, 20));
assert.match(stageEl.innerHTML, /color:#1d6fd1">RED</, 'the word RED in blue ink');
assert.equal(marked, 1, 'the engine is told when the stimulus appeared');
keyHandler({ key: 'J', timeStamp: 1523.4, repeat: false, preventDefault() {} });
await done;
const sent = JSON.parse(JSON.stringify(submitted)); sent.rtMs = Math.round(sent.rtMs * 100) / 100;   // the server keeps 0.01 ms
assert.deepEqual(sent, { response: 'blue', key: 'j', rtMs: 523.4, timedOut: false, via: 'key' }, 'response time from the first frame of the stimulus');
assert.equal(keyHandler, null, 'the key listener is removed after the answer');
assert.match(sandbox.impl.instructions({ task, trials: [{ stim: { practice: true } }] }, ui), /ink colour/);
console.log('browser: early keys ignored, RT from the stimulus frame, listener removed');
