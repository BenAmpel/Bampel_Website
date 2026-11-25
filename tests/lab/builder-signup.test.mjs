// Fixes from the simulated novice test of the study builder (2026-11-25):
//  - F6: a builder study refuses self sign-ups (access code, email, panel link) with not_open while its consent is not
//    marked IRB-approved, so one stray sign-up cannot lock the structure; staff-made codes and test participants still
//    work, a known participant can still sign in, and studies without the builder are unchanged
//  - F14: a trial or survey row recorded before the participant had an arm takes the arm once it is known
//  - F9: the codebook names each arm
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { TEMPLATES } from '../../netlify/lib/lab/templates.mjs';
import { memStore } from './memstore.mjs';

const type = TYPES.multimodal;
const base = C.normalize(structuredClone(TEMPLATES['image-video'].content()), type);
base.design.conditions = [{ id: 'a', label: 'Neutral' }, { id: 'b', label: 'Loss-framed' }];
base.design.randomization = { method: 'blocks', blockSize: 4, seed: 't1' };
const doors = c => {
  c.enrollment.passcode = 'OPEN-SESAME';
  c.enrollment.open = true; c.enrollment.domains = ['example.edu'];
  c.enrollment.panel = { ...(c.enrollment.panel || {}), enabled: true };
  return c;
};
async function study(id, { builder, approved, pre }) {
  const store = memStore(), S = { store, type, study: { id, name: id, type: 'multimodal', codePrefix: 'SU' } };
  const c = doors(structuredClone(base));
  if (pre) c.survey.pre = pre;
  if (builder) c.builder = { v: 1 };
  c.consent = { ...(c.consent || {}), approved: !!approved };
  const r = await C.saveContent(store, type, c, 'T', 0);
  assert(r.ok, JSON.stringify(r.errors));
  return S;
}
const tries = S => [
  ['access code', () => E.login(S, { passcode: 'OPEN-SESAME' })],
  ['email', () => E.login(S, { passcode: 'OPEN-SESAME', email: 'new.person@example.edu', confirm: true })],
  ['panel link', () => E.login(S, { passcode: 'OPEN-SESAME', panelId: 'PANEL12345' })]
];
const real = async S => (await Promise.all((await S.store.list('participants/')).map(k => S.store.get(k)))).filter(p => p && !p.test);

// F6. Builder study, consent still a draft: every self sign-up is refused and nothing is written.
{
  const S = await study('closed', { builder: true, approved: false });
  for (const [how, go] of tries(S)) {
    const r = await go();
    assert.equal(r.error, 'not_open', how + ': refused'); assert.equal(r.status, 403, how);
  }
  assert.deepEqual(await real(S), [], 'no participant record was made');
  assert.equal(await S.store.get('lock/structure'), null, 'and the structure is not locked');
  // Staff-made codes and test participants are not self sign-ups.
  const { created } = await E.createParticipants(S, 1, { gapDays: 0, test: true });
  assert.equal(created.length, 1, 'a test participant can still be made');
  const own = await E.login(S, { passcode: 'OPEN-SESAME', code: created[0].code });
  assert(!own.error, 'a known code signs in: ' + JSON.stringify(own));
  console.log('builder study with draft consent: access code, email and panel sign-ups are refused with not_open');
}
// Once the consent is approved, the same sign-ups work.
{
  const S = await study('open', { builder: true, approved: true });
  for (const [how, go] of tries(S)) { const r = await go(); assert(!r.error, how + ': ' + JSON.stringify(r)); }
  assert.equal((await real(S)).length, 3, 'three real participants');
  console.log('builder study with approved consent: all three sign-ups work');
}
// A study without the builder is unchanged, approved or not.
{
  const S = await study('plain', { builder: false, approved: false });
  for (const [how, go] of tries(S)) { const r = await go(); assert(!r.error, how + ': ' + JSON.stringify(r)); }
  console.log('a study without the builder still takes sign-ups with draft consent');
}

// F14. A survey row saved before the arm existed (condition blank on the record) exports with the arm.
{
  const S = await study('late', { builder: true, approved: true, pre: [{ id: 'age', text: 'Age', type: 'text', sessions: [1] }] });
  const { created: [p] } = await E.createParticipants(S, 1, { gapDays: 0 });
  await E.consent(S, p.code, true);
  const plan = await E.startSession(S, p.code);
  assert(!plan.error, JSON.stringify(plan));
  const arm = (await S.store.get('participants/' + p.code)).condition;
  assert(['a', 'b'].includes(arm));
  const q = plan.preItems.find(x => x.type !== 'info');
  assert(q, 'the template has a start question');
  const sv = await E.saveSurvey(S, p.code, 1, 'pre', { [q.id]: q.type === 'text' ? 'x' : 1 });
  assert(!sv.error, JSON.stringify(sv));
  const key = (await S.store.list(`data/${p.code}/`)).find(k => /survey-pre$/.test(k));
  const rec = await S.store.get(key); delete rec.condition; await S.store.set(key, rec);   // as recorded before assignment
  const rows = await E.exportRows(S, 'surveys');
  assert.equal(rows.length, 1); assert.equal(rows[0].condition, arm, 'the blank condition takes the participant\'s arm');
  // A trial row the same way (unit level: the record's own condition wins when it has one).
  const tr = E.trialRow(S, { code: p.code, session: 1, index: 0, data: {} }, { condition: arm });
  assert.equal(tr.condition, arm, 'trial row without a condition takes the arm');
  assert.equal(E.trialRow(S, { code: p.code, condition: 'a', session: 1, index: 0, data: {} }, { condition: 'b' }).condition, 'a', 'a recorded condition is kept');
  assert.equal(E.surveyRow({ code: 'x', session: 1, kind: 'pre' }, { condition: null }).condition, '', 'still blank before assignment');
  console.log('exports fill a pre-assignment row\'s condition from the participant\'s arm');
}

// F9. Arm names in the codebook.
{
  const c = structuredClone(base); c.builder = { v: 1 };
  const row = buildCodebook({ type, study: { id: 'cb' } }, C.normalize(c, type)).find(x => x.file === 'trials' && x.column === 'condition');
  assert.equal(row.values, 'a = Neutral; b = Loss-framed');
  console.log('codebook: condition values name each arm');
}
