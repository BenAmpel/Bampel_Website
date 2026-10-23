// Stimulus preloading and onset timing. Browser side (participant.js in Node with a stand-in DOM and fetch): which
// addresses are media, the plan pointed at in-memory copies, progress, the failure screen with retry, and nothing
// fetched with preloading off. Server side: the engine keeps a cleaned timing object on every trial and exports
// onset_ms, onset_delay_ms, frame_ms, and preloaded.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { memStore } from './memstore.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

// ---------- a stand-in page ----------
const els = {};
const el = id => els[id] || (els[id] = { id, value: 0, textContent: '', innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, setAttribute() {}, focus() {} });
const stage = { set innerHTML(h) { this._h = h; for (const m of h.matchAll(/id="([^"]+)"/g)) delete els[m[1]]; }, get innerHTML() { return this._h; }, querySelector: () => null, parentNode: null };
let fetched = [], failOnce = new Set();
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {}, requestAnimationFrame: f => setTimeout(() => f(16), 0) };
const sandbox = { window: win, document: { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : id === 'progress' ? { textContent: '' } : el(id)), createElement: () => ({}), head: { appendChild() {} } },
  location: { pathname: '/lab/s/x', search: '', origin: 'https://lab.test', href: 'https://lab.test/lab/s/x' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => 0 }, setTimeout, setInterval, clearInterval, URLSearchParams, URL: Object.assign(function (u, b) { return new URL(u, b); }, { createObjectURL: b => 'blob:lab/' + b.tag }), Blob, console, clearTimeout, Image: function () { const im = this; Object.defineProperty(im, 'src', { set(v) { setTimeout(() => im.onload(), 0); } }); },
  fetch: u => { fetched.push(u); if (failOnce.has(u)) { failOnce.delete(u); return Promise.resolve({ ok: false, status: 503 }); } return Promise.resolve({ ok: true, blob: () => Promise.resolve({ tag: u.split('/').pop() }) }); } };
win.window = win;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const I = win.LabEngine.internals;
I.S.content = { text: Object.fromEntries(C.ENGINE_TEXT.map(f => [f.key, f.def])), environment: { preload: true }, minutesPerSession: 5 };

// ---------- which strings are media ----------
const plan = { trials: [
  { index: 0, item: { media: '/lab/media/samples/voicemail-bank.mp3', body: 'Listen to it', image: '' } },
  { index: 1, item: { media: '/api/lab/x/file/f-0123456789ab.wav', poster: 'https://cdn.other.test/pic.jpg' } },
  { index: 2, item: { media: '/lab/media/samples/voicemail-bank.mp3', link: '//evil.test/x.mp3', note: 'a file called x.mp3', page: '/lab/guide/' } }
] };
assert.deepEqual([...I.mediaUrls(plan)], ['/lab/media/samples/voicemail-bank.mp3', '/api/lab/x/file/f-0123456789ab.wav', 'https://cdn.other.test/pic.jpg'], 'each media file once; text, pages, and protocol-relative addresses are not media');
const swapped = I.swapUrls(plan, { '/lab/media/samples/voicemail-bank.mp3': 'blob:1' });
assert.equal(swapped.trials[0].item.media, 'blob:1'); assert.equal(swapped.trials[2].item.media, 'blob:1'); assert.equal(swapped.trials[0].item.body, 'Listen to it');
assert.equal(plan.trials[0].item.media, '/lab/media/samples/voicemail-bank.mp3', 'the original plan is not changed');

// ---------- a preload run: progress, failure, retry ----------
const run = (p, tries = 0) => new Promise(res => I.preloadPlan(p, tries, res));
failOnce.add('/api/lab/x/file/f-0123456789ab.wav');
let finished = false;
const first = run(plan).then(() => { finished = true; });
await new Promise(r => setTimeout(r, 200));
assert(!finished, 'a failed file stops the session from starting');
assert.match(stage.innerHTML, /Some files did not load/); assert.match(stage.innerHTML, /1 file\(s\) could not be loaded/);
assert(!/id="anyway"/.test(stage.innerHTML), 'no "continue anyway" before a retry');
assert.equal(els.pl.value, 3, 'the progress bar reached the end');
els.retry.handlers.click();
await first;
assert.equal(I.S.preloaded, true);
assert.equal(I.S.plan.trials[1].item.media, 'blob:lab/f-0123456789ab.wav', 'the retried file is in memory');
assert.equal(I.S.plan.trials[0].item.media, 'blob:lab/voicemail-bank.mp3');
assert.equal(I.S.plan.trials[1].item.poster, 'https://cdn.other.test/pic.jpg', 'another site\'s image is warmed in the cache, not copied');
assert.deepEqual(fetched.filter(u => u.startsWith('/api')).length, 2, 'fetched, failed, fetched again');
fetched = [];
await run({ trials: [{ item: { body: 'no media' } }] });
assert.deepEqual(fetched, [], 'nothing to load, nothing fetched');
console.log('preloading: media found, plan swapped to memory, progress, failure and retry');

// ---------- the browser sends timing with every trial; preloading off sends none ----------
const src = readFileSync(here('../../static/lab/engine/participant.js'), 'utf8');
assert(/timing: \{ onsetMs: onset, onsetDelayMs: onset != null \? onset - t0 : null, frameMs: S\.frameMs, preloaded: env\(\)\.preload \? !!S\.preloaded : null \}/.test(src));
assert(/runChecks\(r\.session, function \(\) \{ if \(env\(\)\.preload\) return preloadPlan\(S\.plan, 0\); next\(\); \}\);/.test(src), 'without preloading (or checks) the session starts as before');
assert(/if \(!any\) return done\(\);/.test(src), 'no checks configured: straight on');

// ---------- server: cleaned, stored, exported ----------
assert.equal(E.cleanTiming(null), null); assert.equal(E.cleanTiming({ onsetMs: 'x', frameMs: -3 }), null, 'junk is dropped');
assert.deepEqual(E.cleanTiming({ onsetMs: 1234.5678, onsetDelayMs: 16.7, frameMs: 16.666, preloaded: true, extra: 1 }), { onsetMs: 1234.57, onsetDelayMs: 16.7, frameMs: 16.67, preloaded: true });
const type = TYPES.vignettes, store = memStore(), S = { store, type, study: { id: 'tm', name: 'T', type: 'vignettes', codePrefix: 'TM' } };
const c = C.defaultContent(type); c.environment = { ...c.environment, preload: true };
assert.equal((await C.saveContent(store, type, c, 'T', 0)).version, 1);
assert.equal((await C.getContent(store, type)).environment.preload, true);
const bad = structuredClone(c); bad.environment = { ...c.environment, preload: 'yes' };
assert(C.validateContent(C.normalize(bad, type), type).some(x => /media are loaded/.test(x)));
assert.equal(C.publicContent(await C.getContent(store, type), type, S.study).environment.preload, true, 'the browser learns the setting');
const [p] = (await E.createParticipants(S, 1, { gapDays: 0 })).created;
await E.consent(S, p.code, true);
const pl = await E.startSession(S, p.code);
const q = Object.fromEntries((pl.questions || []).filter(x => x.type !== 'info').map(x => [x.id, x.type === 'scale' ? '1' : x.options ? x.options[0].value : '5']));
assert((await E.saveTrial(S, p.code, 1, pl.trials[0].index, { answers: q, rtMs: 900, timing: { onsetMs: 5000.5, onsetDelayMs: 17, frameMs: 16.67, preloaded: true } })).ok);
assert((await E.saveTrial(S, p.code, 1, pl.trials[1].index, { answers: q, rtMs: 900 })).ok);
const rows = await E.exportRows(S, 'trials');
const r0 = rows.find(r => r.trial_index === pl.trials[0].index), r1 = rows.find(r => r.trial_index === pl.trials[1].index);
assert.deepEqual([r0.onset_ms, r0.onset_delay_ms, r0.frame_ms, r0.preloaded], [5000.5, 17, 16.67, 1]);
assert.deepEqual([r1.onset_ms, r1.frame_ms, r1.preloaded], ['', '', ''], 'a trial without timing has empty cells');
console.log('timing: cleaned on the server, onset_ms, onset_delay_ms, frame_ms, preloaded in the trials CSV');
