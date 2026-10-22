// Data-quality flags without a CAPTCHA (quality.mjs and participant.js): the page counts key timing, pastes, and
// text that appears with no typing; the hidden box is out of reach for people; running totals are merged on the
// server (true stays true, counts never go down); the wide CSV has the dq_* columns, including duplicate panel IDs
// and fast completion; the codebook documents them.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as Q from '../../netlify/lib/lab/quality.mjs';
import { blobsFactory } from './import-helpers.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

// ---------- the browser side ----------
const handlers = {}, posted = [];
let clock = 0;
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {} };
const sandbox = { window: win, navigator: { webdriver: true },
  document: { documentElement: { getAttribute: () => null }, addEventListener: (t, f) => { handlers[t] = f; }, getElementById: id => (id === 'stage' ? { innerHTML: '', querySelector: () => null, parentNode: null } : { textContent: '' }), createElement: () => ({}), head: { appendChild() {} } },
  location: { pathname: '/lab/s/x', search: '', origin: 'https://lab.test' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => clock },
  fetch: (url, o) => { posted.push([url, JSON.parse(o.body)]); return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) }); }, setTimeout, URLSearchParams, URL, Blob, console };
win.window = win;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const I = win.LabEngine.internals;
const box = { tagName: 'TEXTAREA', value: '', classList: { contains: () => false } };
const key = (k, at) => { clock = at; handlers.keydown({ target: box, key: k }); };
const input = (value, inputType = 'insertText') => { box.value = value; handlers.input({ target: box, inputType }); };
for (const [i, ch] of [...'hello there'].entries()) { key(ch, 1000 + i * 150); input(box.value + ch); }
assert.deepEqual([I.DQ.keys, I.DQ.fastKeys, I.DQ.injectedChars], [11, 0, 0], 'human typing: no flags');
for (const [i, ch] of [...'abcdefghij'].entries()) { key(ch, 5000 + i * 5); input(box.value + ch); }
assert.equal(I.DQ.fastKeys, 9, 'keys 5 ms apart are counted as fast (the first follows a pause)');
input(box.value + ' and this whole sentence appeared at once', undefined);
assert.equal(I.DQ.injectedChars, ' and this whole sentence appeared at once'.length, 'text set by a program');
handlers.paste({ target: box, clipboardData: { getData: () => 'pasted words' } }); input(box.value + 'pasted words', 'insertFromPaste');
assert.deepEqual([I.DQ.pastes, I.DQ.pasteChars, I.DQ.injectedChars], [1, 12, 41], 'a paste is counted as a paste, not as injected text');
const hp = { tagName: 'INPUT', type: 'text', value: '', classList: { contains: c => c === 'hp-input' } };
handlers.keydown({ target: hp, key: 'x' });
assert.equal(I.DQ.keys, 21, 'keys in the hidden box are not typing');
assert.equal(I.DQ.webdriver, true, 'navigator.webdriver is noticed');
assert.match(I.honeypotHtml(), /aria-hidden="true"/); assert.match(I.honeypotHtml(), /tabindex="-1"/); assert.match(I.honeypotHtml(), /autocomplete="off"/);
const css = readFileSync(here('../../static/lab/engine/participant.css'), 'utf8');
assert(/\.hp-field \{ position: absolute; left: -10000px/.test(css), 'off screen, not display:none (which bots skip)');
I.S.token = 'tok'; I.dqFlush(1); I.dqFlush(1);
assert.equal(posted.length, 1, 'unchanged totals are not sent twice');
assert.deepEqual(posted[0][1].data, { honeypot: false, webdriver: true, pastes: 1, pasteChars: 12, injectedChars: 41, keys: 21, fastKeys: 9 });
assert(!JSON.stringify(posted[0][1]).includes('hello'), 'never the text itself');
console.log('browser: key timing, pastes, injected text, hidden box, webdriver; totals sent once');

// ---------- server: merged running totals, wide columns, codebook ----------
const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key: k } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(k ? { 'x-admin-key': k } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  return { status: res.status, json: await res.json().catch(() => null) };
};
assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'dq-study', name: 'DQ', template: 'survey' } })).json.ok);
const P = '/api/lab/dq-study/', A = P + 'admin/';
const c = (await call(A + 'content', { key: OWNER })).json; for (const k of Object.keys(c)) if (k[0] === '_') delete c[k];
c.enrollment.panel = { ...c.enrollment.panel, enabled: true, preset: 'prolific', studyParam: 'STUDY_ID', sessionParam: 'SESSION_ID' };
assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: c, baseVersion: c.version } })).status, 200);
const bot = (await call(P + 'login', { body: { panelId: 'BOT00001', panelSession: 'S1' } })).json.token;
await call(P + 'login', { body: { panelId: 'BOT00001', panelSession: 'S2' } });
const human = (await call(P + 'login', { body: { panelId: 'HUMAN001', panelSession: 'S3' } })).json.token;
assert.deepEqual((await call(P + 'dq', { body: { token: bot, session: 1, data: { honeypot: true, pastes: 2, pasteChars: 80, keys: 40, fastKeys: 30 } } })).json, { ok: true });
await call(P + 'dq', { body: { token: bot, session: 1, data: { honeypot: false, pastes: 1, keys: 41, fastKeys: 31, injectedChars: 5 } } });   // after a reload the browser's counts restart
await call(P + 'dq', { body: { token: human, session: 1, data: { keys: 300, fastKeys: 12 } } });
assert.equal((await call(P + 'dq', { body: { token: bot, session: 0, data: {} } })).status, 400);
assert.equal((await call(P + 'dq', { body: { token: 'nope', session: 1, data: {} } })).status, 401);
const wide = (await call(A + 'export-wide.csv', { key: OWNER })).status === 200 && (await call(A + 'rows?kind=wide&codes=' + [bot, human].map(t => t.split('.')[0]).join(','), { key: OWNER })).json;
const wb = wide.find(w => w.code === bot.split('.')[0]), wh = wide.find(w => w.code === human.split('.')[0]);
assert.deepEqual([wb.dq_honeypot, wb.dq_paste_count, wb.dq_paste_chars, wb.dq_injected_chars, wb.dq_fast_typing, wb.dq_duplicate_panel], [1, 2, 80, 5, 1, 1], 'merged: true stays true, counts keep their highest');
assert.equal(wb.dq_fast_keys_share, 0.76);
assert.equal(wb.dq_flags, 5, 'honeypot, fast typing, duplicate panel, pastes, injected text');
assert.deepEqual([wh.dq_flags, wh.dq_fast_typing, wh.dq_duplicate_panel], [0, 0, 0], 'the careful human raises nothing');
// fast completion: a session done in under a quarter of the promised minutes
const p = { sessions: { 1: { startedAt: 1792700000000, completedAt: 1792700060000 } } };
assert.equal(Q.dqColumns([], p, { minutesPerSession: 10 }).dq_fast_completion, 1, '1 minute for a 10-minute session');
assert.equal(Q.dqColumns([], p, { minutesPerSession: 4 }).dq_fast_completion, 0, '1 minute for a 4-minute session is fine');
assert.equal(Q.dqColumns([{ keys: 10, fastKeys: 10 }], {}, null).dq_fast_typing, 0, 'too few keys to judge');
const book = (await (await handle(new Request('https://bampel.test' + A + 'codebook.md', { headers: { 'x-admin-key': OWNER } }), { getStore, env })).text());
assert(/`dq_honeypot`/.test(book) && /Westwood 2025/.test(book), 'documented, with the reason');
console.log('server: totals merged, dq_* in the wide CSV, duplicate panel and fast completion, codebook');
