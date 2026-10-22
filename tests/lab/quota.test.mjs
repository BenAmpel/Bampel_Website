// Quotas (quota.mjs): caps for the whole study and per condition, applied to self sign-ups only. A full condition
// is skipped, a full study screens the newcomer out with no condition (and the panel's screened-out code), the team
// and test participants are never capped, and deleting someone frees the place.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as Q from '../../netlify/lib/lab/quota.mjs';
import { blobsFactory } from './import-helpers.mjs';

const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const errs = (q, conds = ['a', 'b']) => { const e = []; Q.validateQuota(q, conds, e); return e; };
assert.deepEqual(errs({ total: 10, perCondition: { a: 5 } }), []);
assert.deepEqual(errs({ total: null, perCondition: {} }), []);
assert(errs({ total: 2.5 }).some(x => /whole study/.test(x)));
assert(errs({ total: 3, perCondition: { zz: 1 } }).some(x => /"zz" is not a condition/.test(x)));
assert(errs({ perCondition: { a: -1 } }).some(x => /cap for "a"/.test(x)));

assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'quota-test', name: 'Quota', template: 'ab-test' } })).json.ok);
const P = '/api/lab/quota-test/', A = P + 'admin/';
const c = (await call(A + 'content', { key: OWNER })).json; for (const k of Object.keys(c)) if (k[0] === '_') delete c[k];
const [ca, cb] = c.design.conditions.map(x => x.id);
c.enrollment.quota = { total: 3, perCondition: { [ca]: 1 } };
c.enrollment.panel = { ...c.enrollment.panel, enabled: true, preset: 'prolific', redirectUrl: 'https://app.prolific.com/submissions/complete?cc={code}', completionCode: 'DONE2222', screenOutCode: 'FULL2222' };
const bad = structuredClone(c); bad.enrollment.quota = { perCondition: { nope: 2 } };
assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: bad, baseVersion: c.version } })).status, 400);
assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: c, baseVersion: c.version } })).status, 200);

const arrive = async id => {
  const r = (await call(P + 'login', { body: { panelId: id } })).json;
  return { ...r, cond: ((await call(A + 'participants', { key: OWNER })).json.find(p => p.code === r.token.split('.')[0]) || {}).condition };
};
const got = [];
for (const id of ['PANEL1111', 'PANEL2222', 'PANEL3333']) got.push(await arrive(id));
assert.equal(got.filter(g => g.cond === ca).length, 1, `the capped condition got its 1 place: ${got.map(g => g.cond)}`);
assert.equal(got.filter(g => g.cond === cb).length, 2, 'everyone else went to the open condition');
assert(got.every(g => !g.status.screenedOut));
const late = await arrive('PANEL4444');
assert.equal(late.cond, null, 'the fourth sign-up has no condition');
assert(late.status.finished && late.status.screenedOut, 'and is screened out');
assert.deepEqual((await call(P + 'handoff', { body: { token: late.token } })).json,
  { outcome: 'screened_out', code: 'FULL2222', url: 'https://app.prolific.com/submissions/complete?cc=FULL2222', panel: 'Prolific', reason: 'quota_full' });
assert.equal((await call(P + 'session', { body: { token: late.token } })).json.error, 'no_consent', 'and cannot start');
await call(P + 'consent', { body: { token: late.token, agree: true } });
assert.equal((await call(P + 'session', { body: { token: late.token } })).json.error, 'finished', 'not even after consenting');
assert.equal((await arrive('PANEL1111')).cond, got[0].cond, 'someone already in keeps their place');

// the team and test participants are not capped
const pv = (await call(A + 'preview', { key: OWNER, body: {} })).json;
assert(pv.condition, 'a preview participant gets a condition');
const made = (await call(A + 'create', { key: OWNER, body: { count: 2 } })).json.created;
assert(made.every(p => p.condition), 'pilot codes the team creates are let in');
// every real participant counts toward the study cap, including the team's (3 panel + 2 pilot codes = 5)
assert.equal((await arrive('PANEL5555')).cond, null, 'still full');
const c2 = (await call(A + 'content', { key: OWNER })).json; for (const k of Object.keys(c2)) if (k[0] === '_') delete c2[k];
c2.enrollment.quota.total = 7;
assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: c2, baseVersion: c2.version } })).status, 200);
assert.equal((await arrive('PANEL6666')).cond, cb, 'raising the cap opens places, in the condition that is not full');
// deleting a participant frees their place
const holders = (await call(A + 'participants', { key: OWNER })).json.filter(p => !p.test && p.condition);
assert.equal(holders.length, 6);
assert.equal((await arrive('PANEL7777')).cond, cb, 'the 7th place');
assert.equal((await arrive('PANEL8888')).cond, null, 'then full again');
await call(A + 'delete', { key: OWNER, body: { id: holders.find(p => p.condition === cb).code } });
assert.equal((await arrive('PANEL9999')).cond, cb, 'a deleted participant\'s place is free again');
console.log('quotas: per-condition and study caps for self sign-ups, full screen-out with code, team and tests not capped, raising the cap or deleting frees a place');
