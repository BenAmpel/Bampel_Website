// Hang up must work at once, even while the caller's reply is still pending. The simulated panel (2026-10-24) saw a
// call freeze at 1:38: Hang up waited behind a turn that never came back. types/multimodal.js now moves to the
// after-call screen immediately, records the hang-up turn in order behind the pending one, never speaks a reply that
// arrives after hanging up, and saves only once the hang-up turn has landed (the server scores the call from it).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const tick = () => new Promise(r => setTimeout(r, 0));

const els = {};
const el = id => els[id] || (els[id] = { id, value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', handlers: {}, classList: { add() {}, remove() {} },
  addEventListener(t, f) { this.handlers[t] = f; }, setAttribute() {}, focus() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], remove() {} });
let shown = '';
const stage = { set innerHTML(h) { shown = h; for (const m of h.matchAll(/id="([^"]+)"/g)) delete els[m[1]]; }, get innerHTML() { return shown; }, querySelector: () => null, querySelectorAll: () => [] };
const box = { window: {}, navigator: {}, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, performance: { now: () => Date.now() },
  document: { getElementById: el, createElement: () => el('x' + Math.random()), body: { appendChild() {} }, documentElement: { getAttribute: () => 'en-US' }, addEventListener() {}, removeEventListener() {} },
  LabEngine: { registerType: (id, impl) => { box.impl = impl; } } };
box.window.window = box.window;
vm.createContext(box);
vm.runInContext(readFileSync(here('../../static/lab/engine/types/multimodal.js'), 'utf8'), box);

// The server: answers the answer turn, never answers the participant's reply, and records the hang-up.
const turns = [];
let releaseSay = null;
// Helpers this test does not exercise (choice groups, timers) return an empty string.
const ui = new Proxy({
  stage, esc: s => String(s), T: k => k, Th: k => k, Tp: k => '<p>' + k + '</p>',
  show: h => { stage.innerHTML = h; }, errorBox: e => String(e), questionsHtml: () => '',
  questionSet: () => ({ answers: {}, complete: () => true, check: () => true }),
  call: (route, body) => {
    if (route !== 'call/turn') return Promise.resolve({ ok: true });
    turns.push(body.kind);
    if (body.kind === 'answer') return Promise.resolve({ seq: 0, say: 'Hello, this is the Fire Marshal.', state: 'opener', done: false });
    if (body.kind === 'say') return new Promise(r => { releaseSay = r; });
    return Promise.resolve({ seq: body.seq, say: '', state: 'opener', done: true });
  }
}, { get: (t, k) => (k in t ? t[k] : () => '') });
let saved = null;
const ctx = { index: 4, record() {}, submit: d => { saved = d; return Promise.resolve({ ok: true }); }, content: {},
  plan: { session: 2, asr: 'server', recording: false, directory: [], questions: [] },
  trial: { index: 4, decision: { prompt: 'How would you describe that call?', options: [{ value: 'legitimate', label: 'Legitimate' }] },
    item: { kind: 'call', title: 'Incoming call', call: { caller: 'Incoming call', number: '', ringSeconds: 30, scored: true } } } };

box.impl.runTrial(ctx, ui);
assert(els['ph-answer'], 'the phone rings');
els['ph-answer'].handlers.click();
await tick(); await tick();
el('ph-type').value = 'Who is this?';
els['ph-typeform'].handlers.submit({ preventDefault() {} });
await tick();
assert.equal(turns.at(-1), 'say', 'the reply is pending on the server');
els['ph-hang'].handlers.click();
await tick();
assert(/mm-submit/.test(shown), 'Hang up moves to the after-call screen at once, with the reply still pending');
assert(!turns.includes('hangup'), 'the hang-up turn waits its turn behind the pending reply');
releaseSay({ seq: 1, say: 'You can reach me at 555-0199.', state: 'deflect', done: false });
await tick(); await tick();
assert.equal(turns.at(-1), 'hangup', 'then it is recorded, in order');
assert(!/555-0199/.test(shown), 'and the late reply is never shown after hanging up');
console.log('call: Hang up works at once while a reply is pending; the late reply is dropped');
