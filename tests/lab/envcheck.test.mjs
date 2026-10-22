// Setup checks and full screen (envcheck.js in the browser, envcheck.mjs on the server): the Huggins-pitch stimulus
// differs between the ears only in its 600 Hz band, device rules, the settings' validation, check results saved once
// per session, a failed required check screening out by the study's settings (never the browser's say-so), full-screen
// exits on each trial, the wide and codebook columns, and the participant page stopping on a phone.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as EV from '../../netlify/lib/lab/envcheck.mjs';
import { wideRows } from '../../netlify/lib/lab/wide.mjs';
import { buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { memStore } from './memstore.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const L = createRequire(import.meta.url)(here('../../static/lab/engine/envcheck.js'));

// ---------- the Huggins stimulus ----------
let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const sr = 48000, len = 48000, [hl, hr] = L.noisePair(sr, len, true, rand), [dl, dr] = L.noisePair(sr, len, false, rand);
assert(dl.every((v, i) => v === dr[i]), 'a control noise is the same in both ears');
const n = 65536, re = new Float64Array(n), im = new Float64Array(n);
for (let i = 0; i < len; i++) re[i] = hl[i] - hr[i];
L.fft(re, im, false);
let band = 0, rest = 0;
for (let k = 1; k < n / 2; k++) { const f = k * sr / n, m = Math.hypot(re[k], im[k]); if (f >= 564 && f <= 636) band += m; else if (f < 450 || f > 750) rest += m; }
assert(rest / band < 0.02, `the ears differ only around 600 Hz (outside/inside = ${(rest / band).toFixed(4)})`);
assert(Math.max(...hl.map(Math.abs)) <= 0.25 + 1e-9 && hl[0] === 0, 'a moderate level, ramped from silence');
assert.equal(L.score([0, 1, 2, 0, 1, 2], [0, 1, 2, 0, 1, 0]), 5);
assert.deepEqual(L.deviceProblems({ desktopOnly: true, speechBrowser: true }, { mobile: true, speech: false }), ['desktop', 'speech']);
assert.deepEqual(L.deviceProblems({ desktopOnly: true }, { mobile: false, speech: false }), []);
console.log('browser: Huggins pitch only in its band, scoring, device rules');

// ---------- settings ----------
const errs = env => { const e = []; EV.validateEnvironment(env, e); return e; };
assert.deepEqual(errs(EV.environmentDefaults()), []);
assert(errs({ ...EV.environmentDefaults(), headphoneFail: 'explode' }).length === 1);
assert(errs({ ...EV.environmentDefaults(), language: 'xx-YY' }).some(x => /language/.test(x)));
assert(errs({ ...EV.environmentDefaults(), fullscreen: 'yes' }).some(x => /fullscreen/.test(x)));

// ---------- saved once per session; screening by the study's own settings ----------
const type = TYPES.vignettes, store = memStore(), S = { store, type, study: { id: 'envs', name: 'Env', type: 'vignettes', codePrefix: 'EN' } };
const c = C.defaultContent(type);
c.environment = { ...c.environment, headphoneCheck: true, headphoneFail: 'record', micCheck: true, micRequired: false, fullscreen: true };
assert.equal((await C.saveContent(store, type, c, 'T', 0)).version, 1);
const env = () => C.getContent(store, type).then(x => x.environment);
const person = async () => { const [p] = (await E.createParticipants(S, 1, { gapDays: 0 })).created; await E.consent(S, p.code, true); return p.code; };
const fail = { device: { mobile: false, browser: 'chrome', speech: true, screenW: 1440, screenH: 900, dpr: 2, problems: [] }, mic: { ok: false, peakDb: -80, tries: 2 }, headphone: { correct: 2, of: 6, pass: false, answers: [0, 0, 0, 0, 0, 0], targets: [0, 1, 2, 2, 1, 0] } };
const a = await person();
let r = await EV.saveChecks(S, E, a, 1, fail, await env());
assert.deepEqual(r, { ok: true }, 'with "record", failed checks do not end the study');
assert.equal((await E.loadParticipant(S, a)).screenedOut, undefined);
r = await EV.saveChecks(S, E, a, 1, { ...fail, headphone: { ...fail.headphone, correct: 6, pass: true } }, await env());
assert.equal(r.repeat, true); assert.equal((await store.get(`data/${a}/s1/checks`)).data.headphone.correct, 2, 'the first result is kept');
assert.equal((await EV.saveChecks(S, E, a, 2, fail, await env())).error, 'wrong_session');
const c2 = await C.getContent(store, type); c2.environment = { ...c2.environment, headphoneFail: 'screen' };
assert.equal((await C.saveContent(store, type, c2, 'T', 1)).version, 2);
C.clearContentCache(store);
const b = await person();
r = await EV.saveChecks(S, E, b, 1, fail, await env());
assert.deepEqual(r, { ok: true, screenedOut: true, reason: 'headphone_check' });
assert.equal((await E.resume(S, b)).status.screenedOut, true);
const d = await person();
assert.deepEqual(await EV.saveChecks(S, E, d, 1, { ...fail, headphone: { ...fail.headphone, correct: 5, pass: true } }, await env()), { ok: true }, 'passed: goes on');
assert.equal(EV.screenReason({ micCheck: true, micRequired: true }, { mic: { ok: false } }), 'mic_check');
assert.equal(EV.screenReason({ micCheck: true, micRequired: false }, { mic: { ok: false } }), null);
assert.equal(EV.screenReason({ headphoneCheck: false, headphoneFail: 'screen' }, { headphone: { pass: false } }), null, 'a check the study does not ask for never screens out');
assert.deepEqual(EV.cleanChecks({ device: { browser: '<b>', mobile: 'yes', problems: ['desktop', 'x y'] }, extra: 1 }).device, { mobile: null, browser: null, speech: null, screenW: null, screenH: null, dpr: null, problems: ['desktop'] });

// ---------- full screen on trials; wide and codebook columns ----------
const plan = await E.startSession(S, d);
const q = Object.fromEntries(plan.questions.filter(x => x.type !== 'info').map(x => [x.id, x.type === 'scale' ? '1' : x.options ? x.options[0].value : '5']));
await E.saveTrial(S, d, 1, plan.trials[0].index, { answers: q, rtMs: 800, fullscreen: { atOnset: true, exitsMs: [1200.4, 3000, -5, 'x'] } });
const row = (await E.exportRows(S, 'trials')).find(x => x.code === d);
assert.deepEqual([row.fullscreen, row.fullscreen_exits, row.fullscreen_exit_ms], [1, 2, '1200|3000']);
const wide = wideRows(S, await E.exportRecords(S, [a, d]));
const wa = wide.find(x => x.code === a), wd = wide.find(x => x.code === d);
assert.deepEqual([wa.s1_check_headphone_correct, wa.s1_check_headphone_pass, wa.s1_check_mic_ok, wa.s1_check_mic_peak_db, wa.s1_check_device_screen], [2, 0, 0, -80, '1440x900']);
assert.equal(wd.s1_check_headphone_pass, 1);
const book = buildCodebook(S, await C.getContent(store, type));
for (const col of ['fullscreen', 'fullscreen_exits', 'fullscreen_exit_ms']) assert(book.some(x => x.file === 'trials' && x.column === col), col);
const pat = book.find(x => x.column === 's{n}_check_{name}');
assert(pat && /headphone_correct/.test(pat.label) && /Milne et al\. 2021/.test(pat.label));
console.log('server: saved once, screening by study settings only, full-screen exits, wide and codebook columns');

// ---------- the participant page stops on a phone, and does nothing when no check is set ----------
const shown = [];
const stage = { set innerHTML(h) { shown.push(h); }, get innerHTML() { return shown.at(-1); }, querySelector: () => null, parentNode: null };
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {} };
const sandbox = { window: win, document: { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : { textContent: '' }), createElement: () => ({}), head: { appendChild() {} } },
  location: { pathname: '/lab/s/x', search: '', origin: 'https://lab.test' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => 0 }, setTimeout, URLSearchParams, URL, Blob, console,
  fetch: () => Promise.reject(new Error('offline')) };
win.window = win;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const I = win.LabEngine.internals;
I.S.content = { text: Object.fromEntries(C.ENGINE_TEXT.map(f => [f.key, f.def])), environment: EV.environmentDefaults(), minutesPerSession: 5 };
let went = 0;
I.runChecks(1, () => went++);
assert.equal(went, 1, 'no checks: straight on');
win.LabEnv = { ...L, device: () => ({ mobile: true, browser: 'safari', speech: false }) };
I.S.content.environment = { ...EV.environmentDefaults(), desktopOnly: true };
I.runChecks(1, () => went++);
assert.equal(went, 1, 'a phone does not go on');
assert.match(shown.at(-1), /needs a laptop or desktop computer/);
console.log('participant page: no checks, no delay; a phone is stopped with the reason');
