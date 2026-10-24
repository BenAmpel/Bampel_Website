// A request that never returns must not leave a participant stuck. The simulated panel (2026-10-24) saw requests hang
// for good when several participants started at once: a call turn with no caller reply, "Saving..." that never cleared,
// and Hang up blocked behind the pending turn. participant.js now aborts every request after a timeout and retries once,
// so the caller of ui.call always gets an answer (here: the reply on the retry, or { error: 'network' }).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));

let behave = () => 'hang', calls = 0;
const el = () => ({ value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', addEventListener() {}, setAttribute() {}, focus() {} });
const stage = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild() {} };
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {}, requestAnimationFrame() {}, innerWidth: 1200, innerHeight: 800, LAB_REQUEST_MS: 40 };
const doc = { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : el()), createElement: () => ({}), head: { appendChild() {} }, visibilityState: 'visible' };
const sandbox = { window: win, document: doc, location: { pathname: '/lab/s/xyz', search: '', origin: 'https://lab.test', href: 'https://lab.test/lab/s/xyz' },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => Date.now() }, setTimeout, clearTimeout,
  URLSearchParams, URL, Blob, console, AbortController,
  // A fetch that hangs until aborted (like a request lost in a burst), or answers, as `behave` says for this attempt.
  fetch: (u, o) => {
    calls++;
    const what = behave(calls);
    if (what === 'hang') return new Promise((_, rej) => { o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    return Promise.resolve({ status: 200, json: () => Promise.resolve(what) });
  } };
win.window = win; win.document = doc;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const { ui, internals: I } = win.LabEngine;
I.S.token = 'X1.tok';

const timed = async p => { const t0 = Date.now(); const r = await p; return { r, ms: Date.now() - t0 }; };
{
  calls = 0; behave = () => 'hang';
  const { r, ms } = await timed(ui.call('call/turn', { session: 2, index: 3, seq: 1, kind: 'say', said: 'hello' }));
  assert.equal(r.error, 'network', 'a turn that never returns ends as a network error');
  assert.equal(calls, 2, 'after one retry');
  assert(ms < 2000, `and promptly (${ms} ms), not forever`);
}
{
  calls = 0; behave = n => (n === 1 ? 'hang' : { say: 'Thanks for checking.', state: 'pressure1' });
  const { r } = await timed(ui.call('call/turn', { session: 2, index: 3, seq: 1, kind: 'say', said: 'hello' }));
  assert.equal(r.say, 'Thanks for checking.', 'the retry delivers the caller reply when the first attempt hangs');
}
console.log('requests: a hung request times out, retries once, and always returns');
