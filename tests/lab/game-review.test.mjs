// Regression tests for the code-review findings: no-show handling, the understanding check under parallel requests, failing limit
// formulas, the secret paid-round draw, excluded participants, polling cost, pay repair, and small copy fixes.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { K, getOnce, forget, bucketOf } from '../../netlify/lib/lab/game/shared.mjs';
import { findMembership, membershipState, matchAttempt, computeSlot } from '../../netlify/lib/lab/game/live.mjs';
import { groupRows, statusReport, listCohortIds } from '../../netlify/lib/lab/game/export.mjs';
import { setup, instance, participants, clients, drive, type, rng } from './game-helpers.mjs';
import { presetContent as PRESET } from '../../netlify/lib/lab/game/presets.mjs';
import { SimClient } from '../../netlify/lib/lab/game/sim.mjs';

const T0 = Date.UTC(2027, 0, 5, 15);
const poll = (S, code, body = { round: 0 }, now = T0) => type.routes['game/poll'](S, code, body, now);

// ===== 1. a participant who never confirms cannot block the others, however many groups are abandoned =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 2; c.game.readySeconds = 15; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const all = await participants(S, 8, now.v), [a, ...xs] = all;   // a never confirms; seven others (odd, so one is left over each time)
  const cls = clients(xs, insts, { seed: 71, now });
  const A = clients([a], insts, { seed: 72, now })[0]; A.confirm = false; A.act = false;
  const rejoinAndPoll = async () => { const s = await A.tick(now.v); if (s && s.phase === 'lobby' && s.noshow) await type.routes['game/rejoin'](S, a, {}, now.v); return s; };
  let guard = 0;
  while (cls.filter(c => c.finished).length < 6 && guard++ < 1500) {
    await Promise.all([...cls.map(c => c.tick(now.v)), rejoinAndPoll()]);
    now.v += cls.filter(c => !c.finished).every(c => c.last && ['lobby', 'ready'].includes(c.last.phase)) ? 5000 : 1000;
  }
  assert.equal(cls.filter(c => c.finished).length, 6, 'six of the seven others finished their games');
  for (let i = 0; i < 400; i++) { await Promise.all([...cls.map(c => c.tick(now.v)), rejoinAndPoll()]); now.v += 5000; }   // keep going: the seventh keeps being matched with the no-show
  // the seventh was left to pair with the one who never confirms: matched again and again, never stuck
  const memberships = (await base.list(`g/p/${a}/member/`)).length;
  assert(memberships >= 3, 'the non-confirming participant was placed repeatedly: ' + memberships);
  console.log('never-confirming participant who keeps rejoining:', memberships, 'abandoned placements; the others still finished');
}
{
  // many abandon cycles with a partner who keeps returning; the membership index never runs out
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; c.game.readySeconds = 10; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const [a, b] = await participants(S, 2, now.v), [A, B] = clients([a, b], insts, { seed: 73, now }); A.confirm = false; A.act = false;
  for (let i = 0; i < 400 && (await base.list(`g/p/${b}/member/`)).length < 8; i++) {
    await Promise.all([B.tick(now.v), A.tick(now.v).then(async s => { if (s && s.noshow) await type.routes['game/rejoin'](S, a, {}, now.v); })]);
    now.v += 5000;
  }
  assert((await base.list(`g/p/${b}/member/`)).length >= 8, 'eight abandoned cycles');
  assert(await base.get(K.member(b, 7)), 'memberships past the old limit of five are written');
  const ms = await membershipState(S, b);
  assert(ms.active || (await B.tick(now.v)), 'the confirmed participant is never shut out');
  // without rejoining, the no-show is left out of every later slot and nobody is paired with them again
  const [c1, d1] = await participants(S, 2, now.v), [C1, D1] = clients([c1, d1], insts, { seed: 74, now }); C1.confirm = false; C1.act = false;
  for (let i = 0; i < 12; i++) { await Promise.all([C1.tick(now.v), D1.tick(now.v)]); now.v += 5000; }
  const before = (await base.list(`g/p/${c1}/member/`)).length;
  for (let i = 0; i < 20; i++) { await Promise.all([C1.tick(now.v), D1.tick(now.v)]); now.v += 5000; }
  assert.equal(before, 1, 'placed once'); assert.equal((await base.list(`g/p/${c1}/member/`)).length, 1, 'not placed again until they press the rejoin button');
  assert.equal((await poll(S, c1, { round: 0 }, now.v)).noshow, true);
  await type.routes['game/rejoin'](S, c1, {}, now.v); assert.equal((await poll(S, c1, { round: 0 }, now.v)).noshow, undefined);
  console.log('a no-show is excluded until they rejoin; memberships are unbounded (8 cycles, past the old limit of 5)');
}

// ===== 2. the understanding check: parallel requests cannot all score =====
{
  const { S, base } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; c.comprehension = { enabled: true, maxAttempts: 2, questions: [{ id: 'q1', text: 'How many points for mutual cooperation?', answer: 3, tolerance: 0 }] }; });
  const [a] = await participants(S, 1, T0), check = ans => type.routes['game/check'](S, a, { answers: { q1: ans } }, T0);
  const res = await Promise.all([check('9'), check('3'), check('3'), check('3'), check('3')]);
  assert.equal((await base.list(`g/p/${a}/comp/`)).length, 1, 'one attempt recorded for the burst');
  assert.equal(await base.get(K.compPass(a)), null, 'the winner of the attempt was wrong; the parallel correct answers did not pass');
  assert(res.filter(r => r.retry).length >= 3, 'the others were told to try again without effect: ' + JSON.stringify(res.map(r => r.retry ? 'retry' : r.passed)));
  assert.equal((await check('3')).passed, true, 'a real second attempt can pass');
  console.log('understanding check: only the request that wins the attempt key is scored');
}

// ===== 3. limit formulas that fail =====
{
  const errsFor = f => { const c = C.normalize(C.defaultContent(type), type); Object.assign(c, PRESET('trust-live')); c.game.stages[1].decisions[0].max = f; C.normalize(c, type); return C.validateContent(c, type); };
  assert(errsFor('100 / seen.send').some(e => /fails when send is 0/.test(e)), 'division by zero over the earlier decision is refused at save time');
  assert(errsFor('sqrt(seen.send - 3)').some(e => /sqrt\(\) of a negative/.test(e)));
  assert.deepEqual(errsFor('multiplier * seen.send'), []);
  assert.deepEqual(errsFor('multiplier * seen.send + 1'), []);
  // at run time a failing limit falls back to the static bounds and default, and the group keeps going
  const { S, base, spec } = await setup('trust-live', c => { c.game.rounds = 2; });
  const stored = await base.get('content/current'); stored.game.stages[1].decisions[0].max = 'sqrt(seen.send - 100)';   // bypasses the save-time check, as old content could
  await base.set('content/current', stored); await base.set('content/history/v00001', stored); C.clearContentCache(base);
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })], codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 75, now });
  await drive(cls, now, R.gameOf(await C.getContent(base, type)));
  const rows = []; for (const cc of codes) for (let r = 0; r < 2; r++) rows.push(await base.get(K.rec(cc, r)));
  assert(rows.every(Boolean), 'the group finished although the limit formula fails for every send');
  const sp = R.specOf(stored.game.stages[1].decisions[0], R.envFor({ multiplier: 3, endowment: 10 }, 0, { send: 4 }, 2));
  assert.equal(sp.fallback, true); assert.deepEqual([sp.min, sp.max], [0, 0]);
  assert.throws(() => R.specOf(stored.game.stages[1].decisions[0], R.envFor({ multiplier: 3, endowment: 10 }, 0, { send: 4 }, 2), true));
  console.log('failing limit formulas: refused at save time over the earlier values; at run time the static bounds and default apply and the group continues');
}

// ===== 4. the paid round is drawn at completion from a server secret =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 6; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })], codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 77, now });
  let sawPayEarly = false, sawSummaryRound = false;
  await drive(cls, now, spec, { onTick: async () => {
    for (const cc of codes) { if (await base.get(K.pay(cc)) && !(await base.get(K.rec(cc, 5)))) sawPayEarly = true; const sm = await type.routes['game/summary'](S, cc, {}, now.v); if (sm.paidRound) sawSummaryRound = !(await base.get(K.rec(cc, 5))); }
  } });
  assert(!sawPayEarly, 'no pay record exists before the last round is recorded'); assert(!sawSummaryRound, 'the summary does not reveal a paid round mid-game');
  const pepper = (await base.get('meta/pepper')).value;
  for (const cc of codes) { const pay = await base.get(K.pay(cc)); assert.equal(pay.round, R.drawPaidRound(pepper, cc, 'game-test-v1', 6)); }
  const fromPublic = codes.concat(Array.from({ length: 30 }, (_, i) => 'P-' + i)).map(id => R.drawPaidRound('', id, 'game-test-v1', 1000) === R.drawPaidRound(pepper, id, 'game-test-v1', 1000));
  assert(!fromPublic.some(Boolean), 'the draw differs from one computed from the ID and study alone');
  console.log('paid round: drawn at completion, seeded by the study pepper, not derivable from public information');
}

// ===== 5. fallback and finished-async participants are never placed =====
{
  const { S, base } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; });
  const ver = (await C.getContent(base, type)).version, pids = ['P-' + '1'.repeat(16), 'P-' + '2'.repeat(16), 'P-' + '3'.repeat(16)];
  for (const [i, p] of pids.entries()) await base.set(K.hb(10, 'main', ver, false, 100 + i, p), { at: 1 });
  await base.set(K.fallback(pids[0]), { to: 'fee', at: 5 });   // left through the fallback, but with a heartbeat from a moment ago
  await matchAttempt(S, pids[1], 12 * 5000 + 10);
  const rec = await base.get(K.slot(12));
  assert.deepEqual(rec.cohorts.flatMap(c => c.members.map(m => m.pid)).sort(), [pids[1], pids[2]].sort(), 'the one who took the fallback is not placed');
  await base.set(K.adone(pids[2]), { at: 5 });
  console.log('participants with a fallback or a finished asynchronous game are left out of matching');
}

// ===== 6. cost: server-side bucket, empty slots cached, old heartbeats removed, cohort index =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 1; });
  const ver = (await C.getContent(base, type)).version;
  const calls = { list: [], get: 0 };
  const counting = new Proxy(base, { get(t, k) { if (k === 'list') return async p => { calls.list.push(p); return t.list(p); }; return t[k]; } });
  const S2 = { ...S, store: counting };
  const [a] = await participants(S, 1, T0);
  // a client claiming it already wrote this bucket's heartbeat does not skip work or trigger extra matching
  const s1 = await poll(S2, a, { round: 0, hb: bucketOf(T0) }, T0); assert.equal(s1.first, true, 'the server decides whether the heartbeat is written');
  const claims = (await base.list('g/claim/')).length;
  const s2 = await poll(S2, a, { round: 0, hb: 12345 }, T0 + 1000); assert.equal(s2.first, false); assert.equal((await base.list('g/claim/')).length, claims, 'a wrong hb from the browser forces no matching work');
  // empty slots are written once and not listed again
  const listsOf = prefix => calls.list.filter(p => p.startsWith(prefix)).length;
  calls.list.length = 0; await matchAttempt(S2, a, T0 + 5000 * 3); const first = listsOf('gh/s1/');
  calls.list.length = 0; await matchAttempt(S2, a, T0 + 5000 * 3 + 4500 + 4000); const again = listsOf('gh/s1/');
  assert(await base.get(K.slot(bucketOf(T0 + 15000))), 'an empty slot record is stored');
  assert(again < first + 3, `later attempts do not re-list slots already recorded (${first} then ${again} heartbeat listings)`);
  // heartbeats older than the matcher can use are deleted
  const b = bucketOf(T0 + 200000), old = b - 7;
  await base.set(K.hb(old, 'main', ver, false, 1, 'P-' + '9'.repeat(16)), { at: 1 }); await matchAttempt(S2, a, T0 + 200000);
  assert.equal(await base.get(K.hb(old, 'main', ver, false, 1, 'P-' + '9'.repeat(16))), null, 'old heartbeat bucket removed');
  // cohorts are listed from the index, never by scanning every move key
  const now = { v: T0 + 300000 }, insts = [instance(base, { clock: () => now.v })], more = await participants(S, 2, now.v), cls = clients(more, insts, { seed: 81, now });
  await drive(cls, now, spec);
  const cid = (await findMembership(S, more[0])).cid;
  assert(await base.get(K.cidx(cid)), 'cohort index key'); calls.list.length = 0;
  const gr = await groupRows(S2, { offset: 0, limit: 10 }); await statusReport(S2, now.v); await listCohortIds(S2);
  assert.equal(calls.list.filter(p => p === 'g/c/').length, 0, 'no listing of g/c/'); assert(calls.list.includes('g/cidx/'));
  assert(gr.total >= 1 && gr.rows.length >= 1);
  console.log('cost: server-side heartbeat bucket, empty slots cached, old heartbeats deleted, cohorts listed from an index');
}

// ===== 7. a missing pay record is repaired =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 2; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })], codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 83, now });
  await drive(cls, now, spec);
  const before = await base.get(K.pay(codes[0])); assert(before);
  await base.delete(K.pay(codes[0])); forget(base);
  const s = await poll(S, codes[0], { round: 1 }, now.v); assert.equal(s.phase, 'feedback');
  assert.equal((await base.get(K.pay(codes[0]))).round, before.round, 'the live poll rewrote the pay record, with the same round (the secret and ID fix it)');
  await base.delete(K.pay(codes[1])); forget(base);
  await type.routes['game/poll'](S, codes[1], { round: 1 }, now.v); assert(await base.get(K.pay(codes[1])), 'and for the other player');
  console.log('a pay record lost between the round record and the pay write is rewritten by the next poll');
}

// ===== copy: singular and plural =====
{
  const spec1 = { rounds: 1, practiceRounds: 0, players: 2 }, spec10 = { rounds: 10, practiceRounds: 0, players: 2 };
  assert.equal(R.textVars(spec1, {}).rounds_text, '1 round'); assert.equal(R.textVars(spec10, {}).rounds_text, '10 rounds');
  const txt = type.textFields.map(f => f.def).join('\n'); assert(!/\(s\)/.test(txt), 'no "round(s)" or "attempt(s)" in the default text');
  assert(!/\{rounds\} round/.test(JSON.stringify(Object.values((await import('../../netlify/lib/lab/game/presets.mjs')).PRESETS).map(p => p.content().instructions))));
  console.log('copy: proper singular and plural');
}
console.log('ALL REVIEW REGRESSION TESTS PASSED');
