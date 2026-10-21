// Matching under races: two server instances compute the same slot from different views of the heartbeat
// listing, run at the same moment with random delays. The slot is one write-once record, so the first writer wins
// and everyone adopts it; a person is never in two groups, and people already placed are not placed again.
import assert from 'node:assert/strict';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { K, getOnce, forget } from '../../netlify/lib/lab/game/shared.mjs';
import { computeSlot, publishSlot, matchAttempt, findMembership } from '../../netlify/lib/lab/game/live.mjs';
import { setup, instance, rng, sleep } from './game-helpers.mjs';
import { setNew } from '../../netlify/lib/lab/store.mjs';

const pidOf = i => 'P-' + String(i).padStart(16, '0');
const hbWrite = async (store, bucket, pid, entry = 1000, { cond = 'main', ver = 1, test = false } = {}) => store.set(K.hb(bucket, cond, ver, test, entry, pid), { at: bucket * 5000 });

// ===== two instances with different views compute the same slot at once =====
for (let seed = 1; seed <= 60; seed++) {
  const { S, base, content } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; });
  const ver = content.version;
  const clock = { v: 0 }, rand = rng('race' + seed);
  const a = instance(base, { rand, jitter: 4, clock: () => clock.v }), b = instance(base, { rand, jitter: 4, lagMs: 6000, clock: () => clock.v });
  // seven people have heartbeats in bucket 10; the last of them wrote theirs only a moment before (clock 54999 ms)
  const pids = Array.from({ length: 7 }, (_, i) => pidOf(i));
  clock.v = 40000; for (let i = 0; i < 6; i++) await hbWrite(base, 10, pids[i], 1000 + i, { ver });
  clock.v = 54999; await hbWrite(base, 10, pids[6], 1006, { ver });   // visible to A, not to the lagging B
  clock.v = 55000;
  const [ra, rb] = await Promise.all([computeSlot(a.S, 12, {}), computeSlot(b.S, 12, {})].map(p => sleep(rand() * 3).then(() => p)));
  const stored = await base.get(K.slot(12));
  assert(stored, 'a slot record exists');
  assert.deepEqual(ra, stored, 'instance A adopted the stored record'); assert.deepEqual(rb, stored, 'instance B adopted the stored record');
  await Promise.all([publishSlot(a.S, stored), publishSlot(b.S, stored), publishSlot(a.S, stored)]);
  // 7 present, groups of 2: three groups; one person waits, and every placed person points at exactly one cohort
  const placed = stored.cohorts.flatMap(c => c.members.map(m => m.pid));
  assert.equal(placed.length, new Set(placed).size); assert(placed.length >= 6 && placed.length <= 7 && placed.length % 2 === 0);
  for (const co of stored.cohorts) assert.deepEqual(await base.get(K.cohort(co.id)), co);
  for (const pid of placed) { const mem = await base.get(K.member(pid, 0)); assert(mem && stored.cohorts.some(c => c.id === mem.cid && c.members.some(m => m.pid === pid))); assert.equal(await base.get(K.member(pid, 1)), null, 'no second membership'); }
}
console.log('slot race: 60 runs, two instances with different views of the listing; one outcome, everyone adopts it, nobody placed twice');

// ===== the chain: people placed in an earlier slot are not placed again =====
{
  const { S, base, content } = await setup('public-goods', c => { c.game.rounds = 1; c.game.cohortGroups = 2; });
  const ver = content.version, pids = Array.from({ length: 8 }, (_, i) => pidOf(i));
  for (const bucket of [10, 11, 12, 13, 14]) for (const [i, p] of pids.entries()) await hbWrite(base, bucket, p, 1000 + i, { ver });
  // nobody has run the matcher yet; the first attempt arrives in bucket 13 and must settle slot 12 before slot 13
  await matchAttempt(S, pids[0], 13 * 5000 + 100);
  const s12 = await base.get(K.slot(12)); assert(s12 && s12.cohorts.length === 1 && s12.cohorts[0].members.length === 8);
  assert.deepEqual((await base.get(K.slot(13))).cohorts, [], 'slot 13: the same eight were already placed in slot 12 (an empty record is stored)');
  assert.deepEqual((await base.get(K.slot(11))).cohorts, []);
  await matchAttempt(S, pids[1], 14 * 5000 + 100);
  assert.deepEqual((await base.get(K.slot(14))).cohorts, [], 'slot 14: still nobody left'); for (const p of pids) assert.equal(await base.get(K.member(p, 1)), null);
  for (const p of pids) assert.equal((await findMembership(S, p)).cid, s12.cohorts[0].id);
}
console.log('chain: a person placed in slot 12 is not placed again in slots 13 or 14, even if nobody ran slots 12 or 13 before');

// ===== newcomers form their own cohort, in order of arrival, and the claim limits duplicate work =====
{
  const { S, base, content } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; });
  const ver = content.version, pids = Array.from({ length: 5 }, (_, i) => pidOf(i));
  await hbWrite(base, 20, pids[3], 5000, { ver }); await hbWrite(base, 20, pids[1], 2000, { ver }); await hbWrite(base, 20, pids[4], 9000, { ver }); await hbWrite(base, 20, pids[0], 1000, { ver }); await hbWrite(base, 20, pids[2], 3000, { ver });
  await Promise.all(pids.map((p, i) => matchAttempt(S, p, 22 * 5000 + 10 + i)));
  const rec = await base.get(K.slot(22));
  assert.deepEqual(rec.cohorts.map(c => c.members.map(m => m.pid).sort()), [[pids[0], pids[1]].sort(), [pids[2], pids[3]].sort()], 'earliest arrivals first (by lobby entry time); the fifth waits');
  assert.equal(await findMembership(S, pids[4]), null);
  assert((await base.get(K.claim(22))).by, 'one claim per slot');
  // a stale claim is not a lock
  await base.set(K.claim(30), { by: 'dead', at: 0 });
  await hbWrite(base, 28, pids[3], 100, { ver }); await hbWrite(base, 28, pids[4], 200, { ver });
  await matchAttempt(S, pids[3], 30 * 5000 + 6000);   // a claim made long ago does not stop a later attempt
}
// ===== different content versions and test participants never meet =====
{
  const { S, base, content } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; });
  const ver = content.version;
  await hbWrite(base, 40, pidOf(1), 1, { ver }); await hbWrite(base, 40, pidOf(2), 2, { ver: ver + 1 }); await hbWrite(base, 40, pidOf(3), 3, { ver, test: true }); await hbWrite(base, 40, pidOf(4), 4, { ver, test: true });
  await matchAttempt(S, pidOf(1), 42 * 5000 + 5);
  const rec = await base.get(K.slot(42));
  assert.equal(rec.cohorts.length, 1); assert.deepEqual(rec.cohorts[0].members.map(m => m.pid).sort(), [pidOf(3), pidOf(4)], 'test participants are matched only with each other'); assert.equal(rec.cohorts[0].test, true);
}
console.log('claims are not locks; participants of another content version, and test participants, are matched separately');
console.log('ALL MATCHING TESTS PASSED');
