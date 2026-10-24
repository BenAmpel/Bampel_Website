// The participant page's start path (static/lab/engine/participant.js, "boot"), run in Node with a stand-in for the browser.
// Checks the order of requests (the content, display logic, the type script and the sign-in or resume call go out together
// instead of one after another) and that every way in still ends on the same screen: sign-in form, consent, status,
// link code, online-panel ID, a resumed tab, an expired sign-in, and a type script that fails to load.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const src = readFileSync(here('../../static/lab/engine/participant.js'), 'utf8');

// Pages that boot the participant app ask for the display logic first.
for (const p of ['s/index.html', 'studies/verification/index.html']) {
  const h = readFileSync(here('../../static/lab/' + p), 'utf8');
  assert(h.indexOf('/lab/engine/logic.js') > 0 && h.indexOf('/lab/engine/logic.js') < h.indexOf('/lab/engine/participant.js'), `${p} loads logic.js before participant.js`);
}

const content = (extra = {}) => ({ name: 'Boot study', type: 'vignettes', text: { login_title: 'Welcome' }, environment: {}, consent: { paragraphs: ['p'], agreeLabel: 'I agree', approved: true }, minutesPerSession: 5, ...extra });
const status = { available: true, nextSession: 1, total: 1, completed: 0 };

// A page: scripts and fetches are held until the test releases them, and every event is logged in order.
function page({ search = '', token = null, c = content(), logicFirst = false, typeFails = false, answers = {} } = {}) {
  const log = [], held = [], store = token ? { lab_token_boot: token } : {}, url = { pathname: '/lab/s/boot', search };
  const stage = { innerHTML: '', querySelector: () => null, parentNode: null, appendChild() {}, insertAdjacentHTML() {} };
  const node = () => ({ setAttribute() {}, getAttribute: () => null, appendChild() {}, focus() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, style: {} });
  const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {}, LabLogic: logicFirst ? { marker: 1 } : undefined };
  win.window = win;
  const doc = { documentElement: { getAttribute: k => (k === 'data-study' ? 'boot' : null), setAttribute() {} },
    getElementById: id => (id === 'stage' ? stage : id === 'progress' ? { textContent: '' } : node()), addEventListener() {},
    createElement: () => { const n = node(); n.isScript = true; return n; },
    head: { appendChild(s) { log.push('script ' + s.src); held.push({ kind: 'script', s }); } } };
  const sandbox = { window: win, document: doc, location: url, history: { replaceState(_, __, u) { url.replaced = u; log.push('url cleaned'); } },
    sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    performance: { now: () => 0 }, setTimeout, URLSearchParams, Blob, URL, console, Promise,
    fetch(u, opts) {
      const route = u.replace('/api/lab/boot/', '');
      log.push('fetch ' + route);
      return new Promise(res => held.push({ kind: 'fetch', route, res: () => res({ ok: true, status: 200, json: () => Promise.resolve(route === 'content' ? c : (answers[route] || {})) }) }));
    } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const settle = () => new Promise(r => setTimeout(r, 15));
  return { log, stage, store, url, win,
    async release(pred) { for (const h of held.filter(pred)) { held.splice(held.indexOf(h), 1); if (h.kind === 'fetch') h.res(); else if (/types\//.test(h.s.src)) { if (typeFails) h.s.onerror(); else { win.LabEngine.registerType('vignettes', { runTrial() {} }); h.s.onload(); } } else { win.LabLogic = { marker: 1 }; h.s.onload(); } await settle(); } },
    pending: () => held.map(h => h.kind === 'fetch' ? 'fetch ' + h.route : 'script ' + h.s.src) };
}

// ---- 1. a first visit: the content, the display logic and the type script do not wait for one another ----
{
  const p = page();
  assert.deepEqual([...p.log].sort(), ['fetch content', 'script /lab/engine/logic.js'], 'the display logic is requested together with the content');
  await p.release(h => h.route === 'content');
  assert(p.log.includes('script /lab/engine/types/vignettes.js'), 'the type script is requested as soon as the content is in, without waiting for the display logic');
  assert(!/Welcome/.test(p.stage.innerHTML), 'no screen until the type script and display logic are both in');
  await p.release(h => h.s && /types\//.test(h.s.src));
  assert(!/Welcome/.test(p.stage.innerHTML), 'the type script alone is not enough');
  await p.release(h => h.s && /logic\.js/.test(h.s.src));
  assert(/<h1>Welcome<\/h1>/.test(p.stage.innerHTML) && /id="email"/.test(p.stage.innerHTML), 'no token and no link: the email sign-in form');
  assert.equal(p.log.filter(x => /^fetch (login|resume)/.test(x)).length, 0, 'nothing is sent to sign in before the participant does');
}

// ---- 2. logic.js already on the page (the pages ask for it first): no second request ----
{
  const p = page({ logicFirst: true });
  assert.deepEqual(p.log, ['fetch content'], 'logic.js is not requested again');
  await p.release(h => h.route === 'content'); await p.release(h => h.s);
  assert(/id="email"/.test(p.stage.innerHTML));
}

// ---- 3. a code in the link: one sign-in request, sent with the type script; the code leaves the address after both arrive ----
{
  const p = page({ search: '?code=AB-1234-CDEF&preview=1', token: 'old.token', answers: { login: { token: 'new.token', consented: false, status } } });
  await p.release(h => h.route === 'content');
  assert.deepEqual(p.log.filter(x => /^fetch (login|resume)/.test(x)), ['fetch login'], 'the sign-in goes out while the type script downloads, and a kept token is not resumed');
  assert(!p.log.includes('url cleaned'), 'the address is left alone until the type script is in');
  await p.release(h => true);
  assert.equal(p.log.filter(x => x === 'fetch login').length, 1, 'one sign-in');
  assert.equal(p.url.replaced, '/lab/s/boot?preview=1', 'the code is removed, the preview flag kept');
  assert.equal(p.store.lab_token_boot, 'new.token', 'the new participant replaces the old token');
  assert(/I agree/.test(p.stage.innerHTML), 'a participant who has not consented sees the consent screen');
}

// ---- 4. an online-panel ID in the link: signs in with it (and the panel's study and session parameters) ----
{
  const c = content({ panel: { param: 'PID', studyParam: 'STUDY', sessionParam: 'SESS', name: 'Prolific' } });
  const p = page({ search: '?PID=abc&STUDY=s1&SESS=x9', c, answers: { login: { token: 't.t', consented: true, status } } });
  await p.release(h => h.route === 'content');
  assert.deepEqual(p.log.filter(x => /^fetch (login|resume)/.test(x)), ['fetch login']);
  await p.release(h => true);
  assert.equal(p.url.replaced, '/lab/s/boot', 'the ID is taken out of the address bar');
  assert.equal(p.store.lab_token_boot, 't.t');
  assert(/id="go"/.test(p.stage.innerHTML), 'a consented participant goes to the start screen');
}

// ---- 5. a tab that is already signed in: the resume request goes out with the type script ----
{
  const p = page({ token: 'abc.def', answers: { resume: { consented: true, status } } });
  await p.release(h => h.route === 'content');
  assert.deepEqual(p.log.filter(x => /^fetch (login|resume)/.test(x)), ['fetch resume'], 'resume is requested while the type script downloads');
  await p.release(h => true);
  assert.equal(p.log.filter(x => x === 'fetch resume').length, 1, 'one resume');
  assert(/id="go"/.test(p.stage.innerHTML), 'back on the start screen');
}

// ---- 6. an expired token: the stored token is dropped and the sign-in form shown, but only after the type script is in ----
{
  const p = page({ token: 'abc.def', answers: { resume: { error: 'expired' } } });
  await p.release(h => h.route === 'content'); await p.release(h => h.route === 'resume');
  assert(!/Welcome/.test(p.stage.innerHTML) && p.store.lab_token_boot === 'abc.def', 'the answer is not acted on before the type script is in');
  await p.release(h => true);
  assert(/Sign in again/.test(p.stage.innerHTML), 'expired sign-in message');
  assert.equal(p.store.lab_token_boot, undefined, 'the dead token is removed');
}

// ---- 7. a type script that does not load: the same network message as before, and the page stays usable ----
{
  const p = page({ typeFails: true });
  await p.release(h => h.route === 'content'); await p.release(h => h.s);
  assert(/Could not reach the study server/.test(p.stage.innerHTML) && /Boot study/.test(p.stage.innerHTML));
}

console.log('participant boot: requests go out together, sign-in form, link code, panel ID, resume, expired token');
