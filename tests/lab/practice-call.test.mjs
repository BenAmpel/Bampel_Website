// The practice call checks that the lab can hear the participant: only a spoken reply passes its gate. The simulated
// panel (2026-10-24) found its screen offered a typing box anyway, so a participant who typed failed twice and was
// screened out. On a gated call with a working microphone the typing box is now hidden (as on scored calls), and the
// practice texts name every control the participant needs: Answer, Tap to talk, Hang up, Continue.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRACTICE_ITEMS } from '../../netlify/lib/lab/studies/vishing-study2/calls.mjs';
import { VISHING_STUDY2 } from '../../netlify/lib/lab/studies/vishing-study2.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const tick = () => new Promise(r => setTimeout(r, 0));

// The answered call's screen, for a call with or without a gate, when the participant can speak (or cannot).
function answeredScreen(call, { mic }) {
  const els = {};
  const el = id => els[id] || (els[id] = { id, value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', handlers: {}, classList: { add() {}, remove() {} },
    addEventListener(t, f) { this.handlers[t] = f; }, setAttribute() {}, focus() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], remove() {} });
  let shown = '';
  const stage = { set innerHTML(h) { shown = h; for (const m of h.matchAll(/id="([^"]+)"/g)) delete els[m[1]]; }, get innerHTML() { return shown; }, querySelector: () => null, querySelectorAll: () => [] };
  const box = { window: {}, navigator: mic ? { mediaDevices: { getUserMedia: () => new Promise(() => {}) } } : {}, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    performance: { now: () => Date.now() },
    document: { getElementById: el, createElement: () => el('x' + Math.random()), body: { appendChild() {} }, documentElement: { getAttribute: () => 'en-US' }, addEventListener() {}, removeEventListener() {} },
    LabEngine: { registerType: (id, impl) => { box.impl = impl; } } };
  box.window.window = box.window;
  vm.createContext(box);
  vm.runInContext(readFileSync(here('../../static/lab/engine/types/multimodal.js'), 'utf8'), box);
  const ui = new Proxy({ stage, esc: s => String(s), T: k => k, Th: k => k, Tp: k => '<p>' + k + '</p>', show: h => { stage.innerHTML = h; }, errorBox: e => String(e),
    questionsHtml: () => '', questionSet: () => ({ answers: {}, complete: () => true, check: () => true }),
    call: () => Promise.resolve({ seq: 0, say: 'Hey Alex, it\'s Sam down in receiving.', state: 'opener', done: false }) }, { get: (t, k) => (k in t ? t[k] : () => '') });
  const ctx = { index: 5, record() {}, submit: () => Promise.resolve({ ok: true }), content: {},
    plan: { session: 1, asr: 'server', recording: true, directory: [], questions: [] },
    trial: { index: 5, item: { kind: 'call', title: 'Practice call', call: { caller: 'Incoming call', number: '', ringSeconds: 30, ...call } } } };
  box.impl.runTrial(ctx, ui);
  els['ph-answer'].handlers.click();
  return shown;
}
const typingHidden = html => /<form id="ph-typeform" class="typeform" hidden>/.test(html);

assert(typingHidden(answeredScreen({ scored: false, gate: { final: false } }, { mic: true })), 'the practice call hides typing when the participant can speak');
assert(!typingHidden(answeredScreen({ scored: false, gate: { final: false } }, { mic: false })), 'and shows it when there is no microphone (the retry then asks to check it)');
assert(!typingHidden(answeredScreen({ scored: false }, { mic: true })), 'an ungated, unscored call still offers typing');
await tick();

const intro = VISHING_STUDY2.content().items.find(i => i.id === 'practice-intro').body;
for (const text of [intro, PRACTICE_ITEMS[0].body]) for (const control of ['Answer', 'Tap to talk', 'Hang up', 'Continue']) assert(text.includes(control), `the practice text names ${control}: ${text}`);
assert(/out loud/.test(PRACTICE_ITEMS[1].body) && /Typing does not count/.test(PRACTICE_ITEMS[1].body), 'the retry says only speech counts');
console.log('practice call: typing hidden when the gate needs speech; the texts name Answer, Tap to talk, Hang up and Continue');
