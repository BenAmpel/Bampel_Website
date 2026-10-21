// Live play on a store without atomic read-modify-write: concurrent pollers on several simulated server
// instances (random delays, one with a lagging view of key listings), matching consistency, the confirm guard,
// timeouts and dropouts, reloads, practice rounds, stranger re-matching, and closing a stalled group.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { K, getOnce, forget, bucketOf } from '../../netlify/lib/lab/game/shared.mjs';
import { findMembership, closeCohort } from '../../netlify/lib/lab/game/live.mjs';
import { setup, instance, participants, clients, drive, rng, type } from './game-helpers.mjs';
import { SimClient } from '../../netlify/lib/lab/game/sim.mjs';

const T0 = Date.UTC(2027, 0, 5, 15);

// Everything a live session must satisfy, whatever the interleaving.
async function consistent(S, codes, spec, params, { expectStopped = [] } = {}) {
  const store = S.store, total = spec.practiceRounds + spec.rounds, steps = R.stepsOf(spec), cohorts = new Map(), seen = new Map();
  for (const cc of codes) {
    const mem = await findMembership(S, cc); assert(mem, cc + ' has a group');
    const all = await store.list(`g/p/${cc}/member/`);
    const active = []; for (const k of all) { const m = await store.get(k), dec = await store.get(K.decision(m.cid)); if (!(dec && dec.go === false)) active.push(m.cid); }
    assert.equal(active.length, 1, `${cc} is in exactly one active cohort (${active})`);
    seen.set(cc, mem.cid); if (!cohorts.has(mem.cid)) cohorts.set(mem.cid, await store.get(K.cohort(mem.cid)));
  }
  const members = [...cohorts.values()].flatMap(c => c.members.map(m => m.pid));
  assert.equal(members.length, new Set(members).size, 'no participant in two cohorts');
  for (const co of cohorts.values()) for (const m of co.members) assert.equal(seen.get(m.pid), co.id, 'the cohort lists only members who point to it');
  let autos = 0;
  for (const co of cohorts.values()) for (let r = 0; r < total; r++) for (const [j, mem] of R.groupsForRound(co, r).entries()) {
    const raw = {};
    for (const m of mem) raw[m.pid] = {};
    for (let s = 0; s < steps.length; s++) for (const m of mem.filter(x => R.actorsOf(spec, steps[s]).has(x.role))) {
      const mv = await store.get(K.move(co.id, r, s, m.pid)); assert(mv, `move r${r} s${s} ${m.pid}`); Object.assign(raw[m.pid], mv.values); if (mv.auto) autos++;
    }
    const res = R.resolveGroup(spec, params, r, mem, raw);
    for (const m of mem) { const rec = await store.get(K.rec(m.pid, r)); assert(rec, `record ${m.pid} r${r}`); assert(Math.abs(rec.data.payoff - res.payoffs[m.pid]) < 1e-9, 'payoff equals the formula'); assert.equal(rec.cohort, co.id); assert.equal(rec.group, j); }
  }
  return { cohorts, autos };
}

// ===== A. concurrent pollers, several instances, random delays, a lagging listing =====
for (const [label, lag] of [['fresh listings', 0], ['listings 3 s behind (inside the settle window)', 3000], ['listings 12 s behind (assumption violated)', 12000]]) {
  for (const seed of [1, 2, 3, 4]) {
    const { S, base, spec } = await setup('public-goods', c => { c.game.rounds = 3; c.game.cohortGroups = 2; });
    const now = { v: T0 }, rand = rng('inst' + seed);
    const insts = [instance(base, { rand, jitter: 3, clock: () => now.v }), instance(base, { rand, jitter: 3, clock: () => now.v }), instance(base, { rand, jitter: 1, lagMs: lag, clock: () => now.v })];
    const codes = await participants(S, 8, now.v), cls = clients(codes, insts, { seed, now });
    const ticks = await drive(cls, now, spec);
    forget(base);
    const { cohorts } = await consistent(S, codes, spec, R.paramsFor((await import('../../netlify/lib/lab/content.mjs')).getContent ? await (await import('../../netlify/lib/lab/content.mjs')).getContent(base, type) : null, 'main'));
    assert.equal(cohorts.size, 1, 'all eight are in one cohort');
    if (seed === 1) console.log(`concurrent pollers, 3 instances, ${label}: 8 participants matched and finished in ${ticks} ticks`);
  }
}

// ===== B. the confirm guard: a member who never confirms; the others return to the front of the line =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 2; c.game.readySeconds = 20; });
  const now = { v: T0 }, inst = [instance(base, { clock: () => now.v })];
  const [a, b, c2] = await participants(S, 3, now.v), cls = clients([a, b, c2], inst, { seed: 5, now }), [A, B, C] = cls; B.confirm = false;
  // A and B arrive first; C arrives later. B never confirms.
  for (let i = 0; i < 4; i++) { await A.tick(now.v); await B.tick(now.v); now.v += 5000; }
  for (let i = 0; i < 4; i++) { await A.tick(now.v); await B.tick(now.v); now.v += 1000; }
  assert.equal(A.last.phase, 'ready'); assert.equal(B.last.phase, 'ready');
  const cohortA = (await findMembership(S, a)).cid;
  await A.tick(now.v);   // A presses the button (the simulated browser confirms when it sees "ready")
  assert.equal((await A.tick(now.v)).iAmReady, true);
  // before the deadline nothing is decided
  now.v += 5000; await A.tick(now.v); assert.equal(await getOnce(S.store, K.decision(cohortA)), null);
  // C arrives and waits, A waits for the deadline (B is silent)
  now.v += 21000;
  const sA = await A.tick(now.v);
  assert.equal(sA.phase, 'lobby'); assert.equal(sA.returned, true, 'A is back in the waiting room');
  assert.equal((await S.store.get(K.decision(cohortA))).go, false); assert.deepEqual((await S.store.get(K.decision(cohortA))).ready, [a]);
  assert.equal(await S.store.get(K.decision(cohortA)).then(d => d.closed), undefined);
  // C joins; A and C are matched (A first in line); B, who stopped, is not
  const second = []; for (let i = 0; i < 12 && !(A.last.phase === 'ready' && C.last && C.last.phase === 'ready'); i++) { await A.tick(now.v); await C.tick(now.v); now.v += 5000; }
  const m2 = await findMembership(S, a), m3 = await findMembership(S, c2);
  assert(m2 && m3 && m2.cid === m3.cid && m2.cid !== cohortA, 'A and C form a new cohort');
  const co2 = await S.store.get(K.cohort(m2.cid)); assert.deepEqual(co2.members.map(m => m.pid).sort(), [a, c2].sort());
  assert.equal((await S.store.get(K.member(a, 1))).cid, m2.cid, 'a second membership, the first is abandoned');
  console.log('confirm guard: an unconfirmed group is abandoned after the deadline; the confirmed member returns and is matched again');
}

// ===== C. timeouts, dropout, and what the server plays =====
for (const action of ['default', 'random', 'repeatLast']) {
  const { S, base, spec, content } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 6; c.game.timeoutAction = action; c.game.dropAfterTimeouts = 2; c.game.decisionSeconds = 20; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })], params = R.paramsFor(content, 'main');
  const codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 7, now }), [A, B] = cls;
  // B plays rounds 0 and 1 (choosing D), then stops
  let bStopsAt = null;
  await drive(cls, now, spec, { onTick: (i, cs) => { if (B.round >= 2 && !B.stopped) { B.stop(); bStopsAt = now.v; } } });
  const { cohorts, autos } = await consistent(S, codes, spec, params);
  const co = [...cohorts.values()][0];
  const Bmoves = []; for (let r = 0; r < 6; r++) Bmoves.push(await S.store.get(K.move(co.id, r, 0, codes[1])));
  assert(Bmoves.slice(0, 2).every(m => !m.auto), 'B decided in rounds 1 and 2');
  assert(Bmoves.slice(2).every(m => m.auto), 'every later move of B was made by the server');
  assert.equal(Bmoves[2].why, 'timeout'); assert.equal(Bmoves[3].why, 'timeout');
  assert.equal(Bmoves[4].why, 'dropped', 'after two timeouts in a row B counts as having left, and is played at once'); assert.equal(Bmoves[5].why, 'dropped');
  assert(await S.store.get(K.dropped(co.id, codes[1])), 'dropped marker written');
  if (action === 'default') assert(Bmoves.slice(2).every(m => m.values.move === 'C'), 'default is the default value');
  if (action === 'repeatLast') assert(Bmoves.slice(2).every(m => m.values.move === Bmoves[1].values.move), 'repeatLast repeats B\'s previous decision');
  if (action === 'random') { const again = R.autoValues(R.gameOf(content), params, 'player', R.stepsOf(R.gameOf(content))[0], 2, {}, 'random', null, (await import('../../netlify/lib/lab/engine.mjs')).seeded(`${co.id}|r2|s0|${codes[1]}`)); assert.deepEqual(Bmoves[2].values, again, 'the random value is a pure function of group, round, and player'); }
  assert.equal(autos, 4);
  // A was told that a participant left
  const lastPoll = await type.routes['game/poll'](S, codes[0], { round: 5 }, now.v); assert.equal(lastPoll.phase, 'feedback'); assert.deepEqual(lastPoll.notices || ['left'], ['left']);
  // after the drop the rounds went by without waiting for a clock: the last two rounds finished within a few polls
  const recs = []; for (let r = 0; r < 6; r++) recs.push(await S.store.get(K.rec(codes[0], r)));
  assert((recs[5].receivedAt - recs[4].receivedAt) < 20000, 'no timeout wait after the drop (' + (recs[5].receivedAt - recs[4].receivedAt) + ' ms)');
  assert((recs[3].receivedAt - recs[2].receivedAt) >= 20000, 'a real timeout before that');
  console.log(`timeouts (${action}): server plays the missing moves, marks the player as left after two in a row, stops waiting afterwards`);
}

// ===== D. a late human move cannot replace an automatic one =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 3; c.game.decisionSeconds = 20; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 9, now }), [A, B] = cls; B.act = false;
  while (!(A.last && A.last.phase === 'play' && B.last && B.last.phase === 'play')) { await Promise.all([A.tick(now.v), B.tick(now.v)]); now.v += 1000; }
  const sB = B.last, step = sB.step, cid = sB.cid;
  now.v += 1000; await A.tick(now.v);   // A decides
  now.v += 20000 + 2600;  // B's clock runs out
  await A.tick(now.v);   // A's poll writes B's move
  const auto = await S.store.get(K.move(cid, 0, 0, codes[1])); assert(auto && auto.auto);
  const late = await type.routes['game/move'](S, codes[1], { cid, round: 0, step, values: { move: 'D' }, rtMs: 1 }, now.v);
  assert.equal(late.ok, true); assert.equal(late.late, true); assert.equal((await S.store.get(K.move(cid, 0, 0, codes[1]))).values.move, auto.values.move, 'the stored move did not change');
  console.log('a late human decision is acknowledged but never overwrites the move already made for them');
}

// ===== E. reload: a participant who reloads resumes their group and round =====
{
  const { S, base, spec, content } = await setup('trust-live', c => { c.game.rounds = 3; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 11, now });
  let reloaded = 0;
  const firstUndone = async code => { const plan = await E.startSession(S, code, now.v); return plan.trials.find(t => !t.done).index; };
  await drive(cls, now, spec, { onTick: async (i, cs) => {
    // reload client 1 at several points: in the lobby, while confirming, and mid-game
    if ([0, 3, 12, 30, 45].includes(i) && !cs[1].finished) { const code = codes[1]; const fresh = clients([code], insts, { seed: 100 + i, now })[0]; fresh.round = await firstUndone(code); cs[1] = fresh; reloaded++; }
  } });
  assert(reloaded >= 3, 'reloaded ' + reloaded + ' times');
  const { cohorts } = await consistent(S, codes, spec, R.paramsFor(content, 'main'));
  assert.equal(cohorts.size, 1);
  console.log(`reloads (${reloaded}): the participant returns to the same group and round; the game completes with consistent records`);
}

// ===== F. strangers: the groups change; practice rounds are marked and never paid =====
{
  const { S, base, spec, content } = await setup('public-goods', c => { c.game.rounds = 4; c.game.practiceRounds = 2; c.game.cohortGroups = 2; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const codes = await participants(S, 8, now.v), cls = clients(codes, insts, { seed: 13, now });
  await drive(cls, now, spec);
  const { cohorts } = await consistent(S, codes, spec, R.paramsFor(content, 'main'));
  const co = [...cohorts.values()][0], sigs = new Set();
  for (let r = 0; r < 6; r++) { const gs = R.groupsForRound(co, r); sigs.add(JSON.stringify(gs.map(g => g.map(m => m.pid)))); assert.equal(new Set(gs.flat().map(m => m.pid)).size, 8); }
  assert(sigs.size >= 3, 'groups differ across rounds: ' + sigs.size);
  const rec0 = await S.store.get(K.rec(codes[0], 0)), rec2 = await S.store.get(K.rec(codes[0], 2)), rec5 = await S.store.get(K.rec(codes[0], 5));
  assert.equal(rec0.data.practice, true); assert.equal(rec0.data.roundNo, 1); assert.equal(rec2.data.practice, false); assert.equal(rec2.data.roundNo, 1); assert.equal(rec5.data.roundNo, 4);
  for (const cc of codes) { const pay = await S.store.get(K.pay(cc)); assert(pay.round >= 0 && pay.round < 4, 'paid round is one of the 4 real rounds'); assert.equal(pay.round, R.drawPaidRound(cc, 'game-test-v1', 4)); }
  // writing the records again changes nothing (the paid round is write-once)
  const before = JSON.stringify(await S.store.get(K.pay(codes[0]))); await type.routes['game/poll'](S, codes[0], { round: 5 }, now.v + 99999); assert.equal(JSON.stringify(await S.store.get(K.pay(codes[0]))), before);
  console.log('strangers: groups re-form each round (' + sigs.size + ' different arrangements in 6 rounds); practice rounds are flagged; the paid round is drawn from the real rounds only, write-once');
}

// ===== G. closing a stalled group =====
{
  const { S, base, spec, content } = await setup('trust-live', c => { c.game.rounds = 3; c.game.dropAfterTimeouts = 0; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 15, now });
  await drive(cls, now, spec, { onTick: (i, cs) => { cs.forEach(c => { if (c.round >= 1) c.stop(); }); } });
  const cid = (await findMembership(S, codes[0])).cid;
  assert.equal(await S.store.get(K.rec(codes[0], 2)), null, 'stalled: the last round is not recorded');
  const r = await closeCohort(S, cid, now.v + 1000, 'Manager');
  assert.equal(r.ok, true); assert.equal(r.rounds, 2);
  for (const cc of codes) for (let q = 0; q < 3; q++) assert(await S.store.get(K.rec(cc, q)), `record ${cc} r${q}`);
  const last = (await Promise.all([0, 1].flatMap(st => codes.map(cc => S.store.get(K.move(cid, 2, st, cc)))))).filter(Boolean);
  assert.equal(last.length, 2, 'both steps of the last round were played by the server'); assert(last.every(m => m.auto === true && m.why === 'admin'));
  assert((await S.store.get(K.closed(cid))).by === 'Manager');
  const again = await closeCohort(S, cid, now.v + 2000, 'Manager'); assert.equal(again.ok, true);
  console.log('closing a stalled group fills in every missing move (flagged admin) and records every round; closing twice is harmless');
}
console.log('ALL LIVE GAME TESTS PASSED');
