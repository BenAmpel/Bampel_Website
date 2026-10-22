// Recruitment hand-off (netlify/lib/lab/recruit.mjs): panel presets, validation of codes and the redirect address,
// codes kept out of the public content, the panel's study and session IDs on the participant, and the code and
// redirect for each outcome (still going, returned, completed), through the HTTP routes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as R from '../../netlify/lib/lab/recruit.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { blobsFactory } from './import-helpers.mjs';

const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const editable = c => { for (const k of Object.keys(c)) if (k[0] === '_') delete c[k]; return c; };

// ---------- pure parts ----------
assert.match(R.newPanelCode(), /^[2-9A-HJKMNP-TV-Z]{8}$/, 'eight characters with no look-alikes');
const errs = pn => { const e = []; R.validatePanel({ enabled: true, ...pn }, e); return e; };
assert.deepEqual(errs({ preset: 'prolific', redirectUrl: R.PRESETS.prolific.redirectUrl, completionCode: 'C1X2Y3Z4' }), []);
assert(errs({ redirectUrl: R.PRESETS.sona.redirectUrl }).some(x => /replace YOURSCHOOL/.test(x)), 'the SONA preset placeholders must be filled in');
assert(errs({ redirectUrl: 'http://x.test/?cc={code}', completionCode: 'AB' }).some(x => /https/.test(x)));
assert(errs({ redirectUrl: 'https://x.test/?cc={cc}' }).some(x => /\{code\} and \{pid\} only/.test(x)));
assert(errs({ redirectUrl: 'https://x.test/?cc={code}' }).some(x => /set a completion code/.test(x)));
assert(errs({ completionCode: 'has space' }).some(x => /completion code must be/.test(x)));
assert(errs({ studyParam: '1bad' }).some(x => /study ID parameter/.test(x)));
assert(errs({ preset: 'nope' }).some(x => /unknown panel preset/.test(x)));
{ const e = []; R.validatePanel({ enabled: false, completionCode: 'bad code' }, e); assert.deepEqual(e, [], 'panel settings are only checked when the panel is on'); }
const sona = { redirectUrl: 'https://gsu.sona-systems.com/webstudy_credit.aspx?experiment_id=12&credit_token=ab&survey_code={pid}' };
assert.equal(R.redirectFor(sona, 'complete', '', '4321 &x'), 'https://gsu.sona-systems.com/webstudy_credit.aspx?experiment_id=12&credit_token=ab&survey_code=4321%20%26x', 'SONA gets the survey code, URL-encoded');
assert.equal(R.redirectFor(sona, 'complete', '', ''), '', 'no panel ID, no SONA link');
assert.equal(R.redirectFor({ redirectUrl: 'https://p.test/?cc={code}' }, 'returned', '', 'x'), '', 'an outcome without a code gets no link');
assert.equal(R.redirectFor({ completionUrl: 'https://old.test/done' }, 'complete', '', ''), 'https://old.test/done', 'the older single completion link still works');
assert.equal(R.redirectFor({ screenOutUrl: 'https://old.test/out' }, 'screened_out', '', ''), 'https://old.test/out', 'and a study\'s screen-out link');
assert.deepEqual(R.cleanPanelMeta({ study: 'S1', session: '<x>' }), { study: 'S1', session: '' }, 'odd characters are dropped');
console.log('presets, validation, redirect addresses');

// ---------- through the routes ----------
assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'panel-test', name: 'Panel test', template: 'survey' } })).json.ok);
const P = '/api/lab/panel-test/', A = P + 'admin/';
const cur = (await call(A + 'content', { key: OWNER })).json;
assert(cur._panelPresets.some(x => x.id === 'sona' && /survey_code=\{pid\}/.test(x.redirectUrl)), 'the editor gets the presets');
editable(cur);
const pr = R.PRESETS.prolific;
cur.enrollment.panel = { ...cur.enrollment.panel, enabled: true, preset: 'prolific', param: pr.param, studyParam: pr.studyParam, sessionParam: pr.sessionParam, redirectUrl: pr.redirectUrl,
  completionCode: 'DONE2345', screenOutCode: 'OUT23456', returnCode: 'RET23456' };
const r = await call(A + 'content-save', { key: OWNER, body: { content: cur, baseVersion: cur.version } });
assert.equal(r.status, 200, r.text);
const pub = await call(P + 'content');
assert.deepEqual(pub.json.panel, { param: 'PROLIFIC_PID', completionUrl: '', studyParam: 'STUDY_ID', sessionParam: 'SESSION_ID' });
assert(!/DONE2345|OUT23456|RET23456/.test(pub.text), 'no code is in the public content');
const bad = structuredClone(cur); bad.enrollment.panel.redirectUrl = 'https://x.test/?a={who}';
assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: bad, baseVersion: r.json.version } })).status, 400, 'a bad redirect is refused on save');

const lg = await call(P + 'login', { body: { panelId: 'PROLIFIC5f00aa', panelStudy: 'STUDYabc', panelSession: 'SESS1' } });
assert.equal(lg.status, 200, lg.text);
const token = lg.json.token;
await call(P + 'login', { body: { panelId: 'PROLIFIC5f00aa', panelStudy: 'STUDYabc', panelSession: 'SESS2' } });   // the same person opens the link again
assert.equal((await call(A + 'participants', { key: OWNER })).json.length, 1, 'the same panel ID is the same participant');
const rec = (await call(A + 'export.json', { key: OWNER })).json.participants[0];
assert.equal(rec.panel.study, 'STUDYabc'); assert.deepEqual(rec.panel.sessions.map(x => x.id), ['SESS1', 'SESS2'], 'both panel sessions are kept, in order');
assert(!JSON.stringify(rec).includes('PROLIFIC5f00aa'), 'the panel ID itself is not in the research export');

await call(P + 'consent', { body: { token, agree: true } });
assert.deepEqual((await call(P + 'handoff', { body: { token } })).json, { outcome: null }, 'no code while the study goes on');
assert.equal((await call(P + 'handoff', { body: { token: 'nope' } })).status, 401);

// a second participant finishes; the first stops
const t2 = (await call(P + 'login', { body: { panelId: 'PROLIFIC77bb', panelStudy: 'STUDYabc', panelSession: 'S9' } })).json.token;
await call(P + 'consent', { body: { token: t2, agree: true } });
assert.equal((await call(P + 'session', { body: { token: t2 } })).json.session, 1);
// Every session done (the engine counts done/ keys); the trial flow itself is covered by the survey tests.
const raw = getStore({ name: 'lab-panel-test' }), pid2 = t2.split('.')[0];
const nS = TYPES.vignettes.sessionCount(C.normalize(structuredClone(cur), TYPES.vignettes));
for (let n = 1; n <= nS; n++) await raw.setJSON(`done/${pid2}/s${n}-${Date.now() + n}`, { at: Date.now() });
let h = (await call(P + 'handoff', { body: { token: t2 } })).json;
assert.deepEqual(h, { outcome: 'complete', code: 'DONE2345', url: 'https://app.prolific.com/submissions/complete?cc=DONE2345', panel: 'Prolific' });

const w = (await call(P + 'withdraw', { body: { token } })).json;
assert.deepEqual(w, { outcome: 'returned', code: 'RET23456', url: 'https://app.prolific.com/submissions/complete?cc=RET23456', panel: 'Prolific' });
const st = (await call(P + 'resume', { body: { token } })).json.status;
assert(st.finished && st.returned, 'a participant who stopped is finished');
assert.equal((await call(P + 'session', { body: { token } })).json.error, 'finished', 'and cannot start a session');
assert.equal((await call(P + 'withdraw', { body: { token } })).json.code, 'RET23456', 'stopping twice changes nothing');

// SONA: no codes, the credit link carries the participant's SONA ID
const c2 = editable((await call(A + 'content', { key: OWNER })).json);
c2.enrollment.panel = { ...c2.enrollment.panel, preset: 'sona', param: 'id', studyParam: '', sessionParam: '', redirectUrl: sona.redirectUrl, completionCode: '' };
assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: c2, baseVersion: c2.version } })).status, 200);
h = (await call(P + 'handoff', { body: { token: t2 } })).json;
assert.equal(h.url, sona.redirectUrl.replace('{pid}', 'PROLIFIC77bb')); assert.equal(h.code, ''); assert.equal(h.panel, 'SONA Systems');

// participant page: the hand-off box and the stop link are wired, and the screen text exists
const src = readFileSync(new URL('../../static/lab/engine/participant.js', import.meta.url), 'utf8');
assert(/api\('handoff'/.test(src) && /api\('withdraw'/.test(src) && /panelStudy:/.test(src));
for (const k of ['handoff_code', 'handoff_button', 'stop_link', 'returned_title']) assert(C.ENGINE_TEXT.some(f => f.key === k), k);
console.log('routes: codes hidden until earned, panel study/session IDs kept, completed/returned/SONA hand-offs');
