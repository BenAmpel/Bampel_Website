// Fixes from the production audit, in participant.js and types/multimodal.js run in Node with a stand-in DOM:
//  - onset: a frame that began before the screen was drawn is skipped, so onset_delay_ms is never negative
//  - frame interval: measured from frames only, hidden-tab gaps left out, a coarse clock falls back to the mean, and
//    the setup checks' display probe fills in when the measurement has not finished (frame_ms was empty on every row)
//  - the multimodal sound check leaves out what the session's setup checks already covered
//  - panel participants are told to reopen the panel's link and to use the button back to the panel, with no Sign out
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../../netlify/lib/lab/content.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const tick = () => new Promise(r => setTimeout(r, 0));

// ---------- a stand-in page with a hand-driven clock and animation frames ----------
let clock = 0, frames = [], visibility = 'visible';
const sent = [], replies = {}, kept = new Map();
const els = {};
const el = id => els[id] || (els[id] = { id, value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, setAttribute() {}, focus() {} });
const stage = { set innerHTML(h) { this._h = h; for (const m of h.matchAll(/id="([^"]+)"/g)) delete els[m[1]]; }, get innerHTML() { return this._h; }, querySelector: () => null, querySelectorAll: () => [], parentNode: null, appendChild() {} };
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {}, requestAnimationFrame: f => frames.push(f), innerWidth: 1200, innerHeight: 800 };
const doc = { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : id === 'progress' ? { textContent: '' } : el(id)), createElement: () => ({}), head: { appendChild() {} }, get visibilityState() { return visibility; } };
const sandbox = { window: win, document: doc, requestAnimationFrame: win.requestAnimationFrame,
  location: { pathname: '/lab/s/xyz', search: '', origin: 'https://lab.test', href: 'https://lab.test/lab/s/xyz' },
  sessionStorage: { getItem: k => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: k => kept.delete(k) },
  performance: { now: () => clock }, setTimeout, clearTimeout, URLSearchParams, URL, Blob, console,
  fetch: (u, o) => { const route = u.split('/').pop(), body = o && o.body ? JSON.parse(o.body) : null; sent.push({ route, body }); return route in replies ? Promise.resolve({ status: 200, json: () => Promise.resolve(replies[route]) }) : new Promise(() => {}); } };
win.window = win; win.document = doc;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const { ui, internals: I } = win.LabEngine, S = I.S;
const text = Object.fromEntries(C.ENGINE_TEXT.map(f => [f.key, f.def]));
S.content = { name: 'A study', text, minutesPerSession: 5, environment: {}, panel: null, sessions: 1 };
S.token = 'X1.tok';
const frame = ts => { const f = frames.shift(); assert(f, 'a frame was requested'); f(ts); };

// ---------- onset is never before the screen was drawn ----------
{
  replies.trial = { ok: true };
  let ctx = null;
  S.type = { runTrial: c => { ctx = c; clock += 5; } };   // drawing the item takes 5 ms
  S.plan = { session: 1, total: 1, preSurveyDone: true, _instructed: true, trials: [{ index: 0, done: false }] };
  clock = 1000; frames = [];
  I.runTrial(S.plan.trials[0], 0);
  frame(1001.3);   // this frame began while the item was being drawn: its timestamp is before the screen existed
  assert.equal(frames.length, 1, 'so the next frame is asked for');
  frame(1018);
  S.frameMs = 16.67;
  ctx.submit({});
  const t = sent.find(x => x.route === 'trial').body.data.timing;
  assert.equal(t.onsetMs, 1018); assert.equal(t.onsetDelayMs, 18, 'onset after the item screen started (it was -3.7 ms on production)');
  assert.equal(t.frameMs, 16.67, 'the frame interval goes with every trial');
  // a frame that began after the screen was drawn is the onset itself
  sent.length = 0; S.plan.trials[0].done = false; clock = 2000; frames = [];
  I.runTrial(S.plan.trials[0], 0);
  frame(2010);
  assert.equal(frames.length, 0);
  ctx.submit({});
  assert.equal(sent.find(x => x.route === 'trial').body.data.timing.onsetDelayMs, 10);
  console.log('onset: the first frame that begins after the screen was drawn; never negative');
}

// ---------- the frame interval ----------
{
  const run = (gaps, opts = {}) => {
    S.frameMs = null; S.measuring = false; frames = [];
    I.measureFrames();
    let ts = 5000; frame(ts);
    gaps.forEach((g, i) => { if (!frames.length) return; if (opts.hideAt === i) visibility = 'hidden'; if (opts.showAt === i) visibility = 'visible'; ts += g; frame(ts); });
    visibility = 'visible';
    return S.frameMs;
  };
  assert.equal(run(Array(60).fill(16.7)), 16.7, '60 frame gaps at 60 Hz');
  assert.equal(frames.length, 0, 'and then it stops asking for frames');
  assert.equal(run([...Array(30).fill(8.33), 4000, ...Array(30).fill(8.33)]), 8.33, 'a long gap (the tab was in the background) is not a frame interval');
  assert.equal(run([...Array(10).fill(16.7), ...Array(5).fill(500), ...Array(55).fill(16.7)], { hideAt: 10, showAt: 15 }), 16.7, 'frames while hidden are left out');
  const coarse = Array.from({ length: 60 }, (_, i) => (i % 6 === 5 ? 100 : 0));   // timestamps rounded to 100 ms: mostly 0 gaps
  assert.equal(run(coarse), 16.67, 'a coarse clock gives a median of 0, so the mean gap is used');
  // the display probe of the setup checks fills in when the measurement has not finished
  S.frameMs = null; S.measuring = false; frames = [];
  I.measureFrames(); frame(1);
  S.content.environment = { timingCheck: true };
  S.plan = { session: 1, total: 1 };
  replies.checks = { ok: true };
  win.LabEnv = { device: () => ({ mobile: false }), deviceProblems: () => [], timingProbe: () => Promise.resolve({ frameMsMedian: 16.68, refreshHz: 59.95 }), fullscreen: { supported: () => false, active: () => false } };
  let done = false;
  I.runChecks(1, () => { done = true; });
  for (let i = 0; i < 5; i++) await tick();
  assert(done, 'checks finished');
  assert.equal(S.frameMs, 16.68, 'the probe\'s median frame interval is used');
  console.log('frame interval: frames only, hidden gaps left out, coarse clocks, probe fallback');
}

// ---------- what the setup checks covered, for the multimodal sound check ----------
{
  S.checked = {}; S.soundChecks = {};
  S.content.environment = { headphoneCheck: true, headphoneFail: 'screen', micCheck: true, micRequired: false };
  S.plan = { session: 1, total: 1, checksDone: true };
  I.runChecks(1, () => {});
  for (let i = 0; i < 3; i++) await tick();
  assert.deepEqual({ ...S.soundChecks[1] }, { heard: true, mic: false }, 'after a reload: a headphone check that screens out on failure was passed; an optional microphone check is unknown');
  S.soundChecks = {}; S.content.environment.headphoneFail = 'record';
  I.runChecks(1, () => {});
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(S.soundChecks[1].heard, false, 'a headphone check that only records a failure proves nothing');
  // the engine hands them to the type's beforeTrial step
  let info = null;
  S.soundChecks = { 1: { heard: true, mic: true } };
  S.type = { beforeTrial: (i, u, go) => { info = i; }, runTrial: () => {} };
  S.plan = { session: 1, total: 1, trials: [{ index: 0 }] };
  const before = sent.length;
  I.runTrial(S.plan.trials[0], 0);
  assert.equal(info.heard, true); assert.equal(info.micHeard, true);
  assert(!sent.slice(before).some(x => x.route === 'view'), 'the item has not started (no view counted) while the step is showing');
}
{
  // types/multimodal.js in its own page
  let shown = '';
  const mmEls = {};
  const mel = id => mmEls[id] || (mmEls[id] = { id, innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } });
  const box = { window: {}, document: { getElementById: mel, documentElement: { getAttribute: () => 'en-US' } }, performance: { now: () => 0 }, setTimeout, console, LabEngine: { registerType: (id, impl) => { box.impl = impl; } } };
  box.window.window = box.window; box.navigator = {};
  vm.createContext(box);
  vm.runInContext(readFileSync(here('../../static/lab/engine/types/multimodal.js'), 'utf8'), box);
  S.content.text = { ...text, mic_title: 'Check your sound', mic_body: 'Turn your volume up, then click Test sound.', mic_test: 'Test sound', mic_ok: 'Sound works, continue' };   // multimodal's own text
  const mui = { ...ui, show: h => { shown = h; } };
  const audio = { kind: 'audio' }, plain = { kind: 'text' };
  const before = (item, plan, heard, micHeard) => { shown = ''; let went = false; box.impl.beforeTrial({ trial: { item }, plan, heard, micHeard }, mui, () => { went = true; }); return went; };
  assert.equal(before(plain, { session: 1 }, false, false), true, 'no sound in the item: no check');
  assert.equal(before(audio, { session: 1, recording: false }, true, false), true, 'the headphone check already played sound: no second sound test');
  assert.equal(shown, '');
  assert.equal(before(audio, { session: 2, recording: true }, true, false), false, 'recording on and the microphone not yet heard: a check is shown');
  assert(!/id="mm-test"/.test(shown) && /mm-meter/.test(shown) && /<h2>Check your sound<\/h2>/.test(shown), 'only the microphone part');
  mmEls['mm-ok'].handlers.click();
  assert.equal(before(audio, { session: 2, recording: true }, true, false), true, 'once per session');
  assert.equal(before(audio, { session: 3, recording: true }, true, true), true, 'both covered by the setup checks: nothing to show');
  assert.equal(before(audio, { session: 4, recording: false }, false, false), false, 'no headphone check: the full sound test');
  assert(/id="mm-test"/.test(shown));
  console.log('multimodal sound check: skipped or cut to the microphone when the setup checks covered it');
}

// ---------- panel participants ----------
{
  S.type = { runTrial: () => {} };
  S.content.panel = { param: 'PROLIFIC_PID', completionUrl: '' };
  kept.set('lab_panel_xyz', '1');
  I.showStatus({ available: true, nextSession: 1, total: 1, completed: 0 });
  assert(/open the study link in Prolific again/.test(stage.innerHTML) && !/sign in again/.test(stage.innerHTML), 'reopen the panel link, not "sign in again"');
  assert(!/id="out"/.test(stage.innerHTML), 'no Sign out for someone who never signed in');
  replies.handoff = { outcome: 'complete', code: 'C0DE1234', url: 'https://app.prolific.com/submissions/complete?cc=C0DE1234', panel: 'Prolific' };
  I.showFinished({ finished: true, total: 1 });
  assert(/click the button below to return to Prolific/i.test(stage.innerHTML) && !/You can close this page/.test(stage.innerHTML), 'told to use the button, not to close the page');
  assert(!/id="out"/.test(stage.innerHTML));
  for (let i = 0; i < 5; i++) await tick();
  assert(/C0DE1234/.test(els.handoff.innerHTML) && /Return to Prolific/.test(els.handoff.innerHTML), 'the code stays on the page above the button');
  replies.handoff = { outcome: 'complete', code: 'C0DE1234', url: '', panel: 'Amazon MTurk' };
  I.showFinished({ finished: true, total: 1 });
  for (let i = 0; i < 5; i++) await tick();
  assert(/Copy the code below and enter it in Amazon MTurk/.test(els.finbody.innerHTML), 'a panel without a return address: copy the code');
  // someone who signed in with an email or code keeps the usual text and Sign out
  kept.delete('lab_panel_xyz');
  I.showStatus({ available: true, nextSession: 1, total: 1, completed: 0 });
  assert(/sign in again/.test(stage.innerHTML) && /id="out"/.test(stage.innerHTML));
  I.showFinished({ finished: true, total: 1 });
  assert(/You can close this page/.test(stage.innerHTML) && /id="out"/.test(stage.innerHTML));
  console.log('panel participants: reopen the panel link, return with the button, no Sign out');
}
console.log('participant onset, frame interval, sound check, and panel copy: all checks passed');
