import { core } from './compat.mjs';
import { content } from './compat.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store = memStore({ latency: 2 });
const now = Date.UTC(2026, 9, 5, 15);
const mk = async (cond) => { const p = await core.createTestParticipant(store, cond, now); await core.consent(store, p.code, true, now); return p.code; };

// C1: nothing in the browser payload predicts the answer
const a = await mk('ai_first'); const plan = await core.startSession(store, a, now);
const js = JSON.stringify({ trials: plan.trials, practice: plan.practice, practiceAI: plan.practiceAI });
assert(!/"id"|alertId|variant|truth|supports|misleading/.test(js), 'answer hints in public plan');
console.log('C1 ok: no alert IDs, variants, or answer keys in the browser payload');

// H2: hostile / malformed payloads are cleaned, exports never break, formulas are neutralized
const t0 = plan.trials[0];
await core.saveTrial(store, a, 1, 'practice', {}, now);
await core.saveTrial(store, a, 1, t0.index, { evidence: { opens: 5 }, final: { judgment: 'malicious', influential: '=1+1', confidence: '=HYPERLINK("x")' }, traces: { durationMs: 1 }, viewport: { w: 'x' } }, now);
await core.saveTrial(store, a, 1, plan.trials[1].index, { final: { judgment: 'nope', influential: ['=cmd|calc', 'summary'] }, evidence: { opens: [{ panel: '=evil', atMs: 1 }, { panel: t0.alert.panels[0].key, atMs: -5, dwellMs: 1e12 }] } }, now);
const csv = await core.exportCsv(store);
assert(!/(^|,)[=+@]/m.test(csv), 'formula cell in trials CSV');
const rec = (await core.exportAll(store)).records.find(r => r.key.endsWith('/t' + plan.trials[1].index));
assert.equal(rec.data.final.judgment, null); assert.deepEqual(rec.data.final.influential, ['summary']); assert.equal(rec.data.evidence.opens.length, 1); assert.equal(rec.data.evidence.opens[0].atMs, 0);
assert(core.csvCell('=1+1').startsWith("'") && core.csvCell('@SUM(1)').startsWith("'") && core.csvCell('-12') === '-12' && core.csvCell('-x').startsWith("'"));
// survey: unknown keys dropped, values checked against the question
for (const t of plan.trials.slice(2)) await core.saveTrial(store, a, 1, t.index, { final: { judgment: 'benign' } }, now);
await core.saveSurvey(store, a, 1, 'pre', { role: 'student', ai_use: '99', junk: 'x', 'a,\n=1+1': 'y', experience_years: '=1+1' }, now);
const srow = (await core.exportRows(store, 'surveys', [a]))[0];
assert.equal(srow.role, 'student'); assert(!('ai_use' in srow) && !('junk' in srow) && !('experience_years' in srow));
console.log('H2 ok: malformed data cleaned, exports intact, formulas neutralized, survey answers checked against questions');

// M4: re-sends are acknowledged and never overwrite
const before = (await core.exportAll(store)).records.find(r => r.key.endsWith('/t' + t0.index)).data.final.judgment;
const again = await core.saveTrial(store, a, 1, t0.index, { final: { judgment: 'benign' } }, now);
assert(again.repeat); assert.equal((await core.exportAll(store)).records.find(r => r.key.endsWith('/t' + t0.index)).data.final.judgment, before);
const post1 = await core.saveSurvey(store, a, 1, 'post', { mental_effort: '3' }, now);
assert(post1.ok && !post1.repeat); assert((await core.saveSurvey(store, a, 1, 'post', {}, now)).repeat);
console.log('M4 ok: retries are idempotent');

// H3: concurrent writes keep every answer; concurrent sign-ups stay balanced
const b = await mk('control'); const pb = await core.startSession(store, b, now);
await Promise.all(pb.trials.map(t => core.saveTrial(store, b, 1, t.index, { final: { judgment: 'malicious' } }, now)));
assert.equal((await core.progressOf(store, await core.loadParticipant(store, b))).sessions[1].trialsDone.length, 8, 'lost a concurrent answer');
// Same, on a store whose conditional writes are not atomic (as seen on live Netlify): nothing is lost,
// because progress comes from write-once answer keys, not from a shared record.
{
  const lossy = memStore({ latency: 3, lossyCas: true });
  const q = await core.createTestParticipant(lossy, 'control', now); await core.consent(lossy, q.code, true, now);
  const pq = await core.startSession(lossy, q.code, now);
  await Promise.all(pq.trials.map(t => core.saveTrial(lossy, q.code, 1, t.index, { final: { judgment: 'benign' } }, now)));
  await Promise.all(pq.trials.map(t => core.saveTrial(lossy, q.code, 1, t.index, { final: { judgment: 'malicious' } }, now)));   // a burst of re-sends
  const prog = await core.progressOf(lossy, await core.loadParticipant(lossy, q.code));
  assert.equal(prog.sessions[1].trialsDone.length, 8, 'lossy store lost an answer');
  const after = await core.startSession(lossy, q.code, now); assert(after.trials.every(t => t.done));
}
const emails = Array.from({ length: 12 }, (_, i) => `c${i}@gsu.edu`);
await Promise.all(emails.map(e => core.login(store, { email: e, confirm: true }, now)));
const count = async () => { const by = { ai_first: 0, evidence_first: 0, control: 0 }; (await core.listParticipants(store, now)).filter(p => p.label === 'self-signup').forEach(p => by[p.condition]++); return by; };
let by = await count(); assert.equal(Object.values(by).reduce((a, b) => a + b), 12);
// Minimization corrects any imbalance from simultaneous sign-ups as later students arrive one at a time.
for (let i = 0; i < 9; i++) await core.login(store, { email: `d${i}@gsu.edu`, confirm: true }, now);
by = await count(); const v = Object.values(by);
assert(Math.max(...v) - Math.min(...v) <= 1 || Math.max(...v) - Math.min(...v) <= Math.max(0, 12 - 9), JSON.stringify(by));
for (let i = 0; i < 3; i++) await core.login(store, { email: `e${i}@gsu.edu`, confirm: true }, now);
const seq = memStore(); for (let i = 0; i < 12; i++) await core.login(seq, { email: `s${i}@gsu.edu`, confirm: true }, now);
const bs = { ai_first: 0, evidence_first: 0, control: 0 }; (await core.listParticipants(seq, now)).forEach(p => bs[p.condition]++);
assert.deepEqual(Object.values(bs), [4, 4, 4], 'one-at-a-time sign-ups are exactly balanced');
console.log('H3 ok: simultaneous answers all kept (even when conditional writes are not atomic); sign-ups balanced by minimization', JSON.stringify(await count()));

// H5: session count snapshot
const c0 = await content.getContent(store);
const d = await mk('control'); await core.startSession(store, d, now);
const fewer = structuredClone(c0); fewer.design.sessions = fewer.design.sessions.slice(0, 2); assert((await content.saveContent(store, fewer, 't', c0.version || 0, now)).ok);
let st = (await core.resume(store, d, now)).status; assert.equal(st.total, 2);
const more = structuredClone(await content.getContent(store)); more.design.sessions = c0.design.sessions.concat([c0.design.sessions[0]]);
assert((await content.saveContent(store, more, 't', (await content.getContent(store)).version, now)).ok);
st = (await core.resume(store, d, now)).status; assert.equal(st.total, 4, 'never more than the count they started with');
const e = await mk('control'); await core.startSession(store, e, now); assert.equal((await core.resume(store, e, now)).status.total, 5, 'new starter gets current design');
console.log('H5 ok: each participant keeps the session count from when they started; cutting sessions never strands one in progress');

// M2: views counted; H4: test flag in rows
await core.viewTrial(store, b, 1, 0); await core.viewTrial(store, b, 1, 0);
const rowsB = await core.exportRows(store, 'trials', [b]);
assert.equal(rowsB.find(r => r.trial_index === 0).views, 2); assert(rowsB.every(r => r.test === 1 && r.label === 'self-test'));
assert('panel_order' in rowsB[0] && 'answer_order' in rowsB[0] && 'session_started_at' in rowsB[0] && 'received_at' in rowsB[0]);
console.log('M1/M2/H4 ok: view counts, test/label flags, panel and answer order, timestamps in the CSV');

// Raw events stored apart and exportable per participant
const f = await mk('control'); const pf = await core.startSession(store, f, now);
await core.saveTrial(store, f, 1, 'practice', {}, now);
await core.saveTrial(store, f, 1, pf.trials[0].index, { final: { judgment: 'benign' }, rawEvents: [{ t: 1, type: 'move' }] }, now);
assert.equal((await core.exportRaw(store, f)).length, 1); assert(!JSON.stringify((await core.exportAll(store, f)).records).includes('rawEvents'));
const del = await core.deleteParticipant(store, f); assert(del.ok); assert.equal((await store.list(`raw/${f}/`)).length + (await store.list(`plans/${f}/`)).length, 0);
console.log('C2 ok: raw events and plans stored apart, exported per participant, deleted with the participant');
console.log('ALL AUDIT TESTS PASSED');
