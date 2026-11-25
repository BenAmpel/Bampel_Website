// Enrollment in a multimodal study that has permuted blocks but no builder: enroll picks the arm by minimization and
// never claims an alloc-arm/ slot, because only assignNow (deferred assignment) calls the type's allocate. This pins
// today's behaviour so the builder change (deferred assignment for builder studies only) cannot shift it.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as X from '../../netlify/lib/lab/types/multimodal-study.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { TEMPLATES } from '../../netlify/lib/lab/templates.mjs';
import { memStore } from './memstore.mjs';

const type = TYPES.multimodal, store = memStore(), S = { store, type, study: { id: 'blk', name: 'B', type: 'multimodal', codePrefix: 'BK' } };
const c = C.normalize(structuredClone(TEMPLATES['image-video'].content()), type);
c.design.conditions = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
c.design.randomization = { method: 'blocks', blockSize: 4, seed: 't1' };
const sv = await C.saveContent(store, type, c, 'T', 0);
assert.equal(sv.version, 1, JSON.stringify(sv.errors));

const { created } = await E.createParticipants(S, 8, { gapDays: 0 });
// Recorded before the builder change: asserting created arms === X.allocationList(c).slice(0, 8) fails today
// (got b a a b b a a b against the list), because enroll never calls allocate. Pinned instead:
assert.deepEqual(await store.list('alloc-arm/'), [], 'enroll claims no allocation slot');
const n = a => created.filter(p => p.condition === a).length;
assert.equal(n('a'), 4); assert.equal(n('b'), 4);
assert(X.allocationList(c).length > 0, 'the list exists; enroll just does not use it');
console.log('enroll with blocks but no builder: minimization, no alloc-arm slots');

// ---------- builder studies: the arm is taken from the block list when session 1 starts ----------
const builderContent = () => {
  const b = structuredClone(c); b.builder = { v: 1 };
  b.survey.pre = [{ id: 'saw_a', text: 'Arm A only', type: 'text', sessions: [1], conditions: ['a'] }, { id: 'age', text: 'Age', type: 'text', sessions: [1] }];
  return b;
};
const makeBuilder = async (st, id) => {
  const s = { store: st, type, study: { id, name: id, type: 'multimodal', codePrefix: 'BD' } };
  const r = await C.saveContent(st, type, builderContent(), 'T', 0);
  assert(r.ok, JSON.stringify(r.errors));
  return s;
};
{
  const SB = await makeBuilder(memStore(), 'bld');
  const saved = await C.getContent(SB.store, type);
  assert.deepEqual(saved.builder, { v: 1 }, 'saveContent keeps builder');
  const { created: ps } = await E.createParticipants(SB, 8, { gapDays: 0 });
  assert(ps.every(p => p.condition == null), 'no one has an arm at enrollment');
  assert.deepEqual(await SB.store.list('alloc-arm/'), [], 'and no slot is claimed');
  const arms = [];
  for (const p of ps) {
    await E.consent(SB, p.code, true);
    const plan = await E.startSession(SB, p.code);
    assert(!plan.error, JSON.stringify(plan));
    const arm = (await SB.store.get('participants/' + p.code)).condition; arms.push(arm);
    assert(await SB.store.get(`cond/${arm}/${p.code}`), 'the cond/ marker is written');
    // arm-only start-survey question: in this arm's session-1 plan only (the arm is set before the plan is built)
    assert.equal(plan.preItems.some(q => q.id === 'saw_a'), arm === 'a', 'arm-only start question follows the arm');
    assert(plan.preItems.some(q => q.id === 'age'));
    const again = await E.startSession(SB, p.code);   // a repeated start claims nothing new
    assert.equal(again.session, 1);
  }
  assert.deepEqual(arms, X.allocationList(saved).slice(0, 8), 'arms equal slots 0-7 of the block list, in start order');
  assert.equal((await SB.store.list('alloc-arm/')).length, 8, 'one slot per participant, repeats burn none');
  console.log('builder study: no arm at enrollment, arms follow the block list at session 1, arm-only start question');
}
{
  const SL = await makeBuilder(memStore({ latency: 3, lossyCas: true }), 'bld-lossy');
  const saved = await C.getContent(SL.store, type);
  const { created: ps } = await E.createParticipants(SL, 5, { gapDays: 0 });
  for (const p of ps) await E.consent(SL, p.code, true);
  const plans = await Promise.all(ps.map(p => E.startSession(SL, p.code)));
  assert(plans.every(x => !x.error), JSON.stringify(plans.find(x => x.error)));
  const slots = await Promise.all((await SL.store.list('alloc-arm/')).map(k => SL.store.get(k)));
  const holders = slots.map(s => s.code);
  assert.equal(new Set(holders).size, holders.length, 'no slot is held twice');
  const arms = await Promise.all(ps.map(async p => (await SL.store.get('participants/' + p.code)).condition));
  for (const p of ps) assert(slots.some(s => s.code === p.code), 'every starter holds a slot');
  const per = a => arms.filter(x => x === a).length, want = X.allocationList(saved).slice(0, 5);
  for (const a of ['a', 'b']) assert.equal(per(a), want.filter(x => x === a).length, `arm ${a}: count equals the first five slots`);
  console.log('builder study: five simultaneous starts on a non-atomic store take distinct slots');
}
{
  // adding builder to a study with a real participant is refused; with test participants only, it is allowed
  const st = memStore(), SN = { store: st, type, study: { id: 'nb', name: 'nb', type: 'multimodal', codePrefix: 'NB' } };
  assert((await C.saveContent(st, type, structuredClone(c), 'T', 0)).ok);
  await E.createParticipants(SN, 1, { gapDays: 0, test: true });
  assert((await C.saveContent(st, type, builderContent(), 'T', 1)).ok, 'test participants only: allowed');
  const st2 = memStore(), SN2 = { store: st2, type, study: { id: 'nb2', name: 'nb2', type: 'multimodal', codePrefix: 'NB' } };
  assert((await C.saveContent(st2, type, structuredClone(c), 'T', 0)).ok);
  await E.createParticipants(SN2, 1, { gapDays: 0 });
  const r = await C.saveContent(st2, type, builderContent(), 'T', 1);
  assert.equal(r.error, 'structure_locked'); assert.equal(r.status, 409);
  console.log('adding builder to a study with a real participant is refused');
}
