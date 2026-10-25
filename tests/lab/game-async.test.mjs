// Asynchronous play: participants decide alone; on finishing they are matched with stored decisions of earlier
// participants of the complementary roles in the same condition. The match is write-once and keeps a copy of the
// decisions used. The first participants are pending until partners exist (admin action and payments export).
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { K, getOnce, forget } from '../../netlify/lib/lab/game/shared.mjs';
import { resolvePending, asyncOutcome, assignRole } from '../../netlify/lib/lab/game/async.mjs';
import { paymentRows, paymentRowFor, exportTrials } from '../../netlify/lib/lab/game/export.mjs';
import { setup, participants, clients, instance, drive, rng, type } from './game-helpers.mjs';
import { SimClient } from '../../netlify/lib/lab/game/sim.mjs';

const T0 = Date.UTC(2027, 0, 5, 15);
const save = (S, code, round, values, now = T0, extra = {}) => E.saveTrial(S, code, 1, round, { values, rtMs: 900, ...extra }, now);
const asRole = async (S, code, role) => { await S.store.set(K.role(code), { role, at: T0 }); await S.store.set(`g/arole/main/${role}/${code}`, { at: T0 }); };
const rowOf = async (S, code) => paymentRowFor(S, await S.store.get(`participants/${code}`));

// ===== trust game: strategy table, hand-computed payoffs, pending and resolution =====
{
  const { S, base, spec, content } = await setup('trust-async', c => { c.game.rounds = 1; c.payment = { method: 'sum', pointsPerUnit: 1, currency: 'USD', showUpFee: 0, maxBonus: null }; });
  const [s1, s2, r1] = await participants(S, 3, T0);
  await asRole(S, s1, 'sender'); await asRole(S, s2, 'sender'); await asRole(S, r1, 'receiver');
  const poll = async (code, round) => type.routes['game/poll'](S, code, { round }, T0);
  // what each role is asked
  const ps = await poll(s1, 0); assert.equal(ps.phase, 'async'); assert.equal(ps.role, 'sender'); assert.equal(ps.entries.length, 1); assert.equal(ps.entries[0].decisions[0].max, 10);
  const pr = await poll(r1, 0); assert.equal(pr.entries[0].strategy.rows.length, 11); assert.equal(pr.entries[0].strategy.rows[4].spec.max, 12);
  // the sender decides first: nobody to be matched with yet, so pending
  assert.equal((await save(S, s1, 0, { send: 6 }, T0, { drawnHidden: true })).ok, true);   // the screen appeared while they were in another tab
  assert(await base.get(K.apend(s1)), 'pending'); assert.equal(await base.get(K.amatch(s1)), null);
  let row = await rowOf(S, s1); assert.equal(row.match_status, 'pending'); assert.equal(row.bonus, ''); assert.equal(row.points, '');
  // a receiver states a response for each possible amount, then finishes: matched at once with an earlier sender
  const table = {}; for (let v = 0; v <= 10; v++) table[String(v)] = Math.floor(v * 3 / 2);
  assert.equal((await save(S, r1, 0, { return: { table } }, T0, { drawnHidden: false })).ok, true);
  const mr = await base.get(K.amatch(r1)); assert(mr, 'the receiver is matched when they finish'); assert.equal(mr.rounds[0].partners.length, 1); assert.equal(mr.rounds[0].partners[0].pid, s1); assert.deepEqual(mr.rounds[0].partners[0].raw, { send: 6 }, 'a copy of the decision used');
  let rrow = await rowOf(S, r1); assert.equal(rrow.match_status, 'matched'); assert.equal(Number(rrow.points), 18 - 9, 'receiver: 3 x 6 - 9');
  // the sender is pending until resolved; resolving matches them with the receiver's stored strategy
  assert(await base.get(K.apend(s1)));
  const res = await resolvePending(S, T0); assert.deepEqual([res.pending, res.resolved, res.stillPending], [1, 1, 0]); assert.equal(await base.get(K.apend(s1)), null);
  row = await rowOf(S, s1); assert.equal(row.match_status, 'matched'); assert.equal(Number(row.points), 10 - 6 + 9, 'sender: 10 - 6 + 9');
  // a second sender finishing later is matched at once with the stored receiver decision (the same stored strategy can serve several)
  assert.equal((await save(S, s2, 0, { send: 2 })).ok, true); assert(await base.get(K.amatch(s2)));
  assert.equal(Number((await rowOf(S, s2)).points), 10 - 2 + 3);
  // the match is write-once: resolving again changes nothing
  const before = JSON.stringify(await base.get(K.amatch(s1))); await resolvePending(S, T0 + 5000); assert.equal(JSON.stringify(await base.get(K.amatch(s1))), before);
  // matching is recorded in the exports: the sender's row has the partner's strategy as "others", and the resolved payoff
  const recs = []; for (const cc of [s1, r1]) recs.push(await base.get(K.rec(cc, 0)));
  const people = Object.fromEntries((await Promise.all([s1, r1].map(cc => base.get(`participants/${cc}`)))).map(p => [p.code, p]));
  const rows = await exportTrials(S, recs, people, [s1, r1]);
  const sRows = rows.filter(x => x.code === s1), rRows = rows.filter(x => x.code === r1);
  assert.equal(sRows.length, 2); assert.equal(rRows.length, 2, 'one row per stage, including the stage this role does not decide');
  assert.equal(Number(sRows.find(x => x.stage === 'send').d_send), 6); assert.equal(sRows.find(x => x.stage === 'send').payoff, 13); assert.equal(String(sRows.find(x => x.stage === 'send').o_return), '9', 'what the receiver\'s strategy returned');
  assert.equal(sRows.find(x => x.stage === 'return').acting, 0);
  const rr = rRows.find(x => x.stage === 'return'); assert.equal(rr.acting, 1); assert.equal(Number(rr.d_return), 9, 'the strategy resolved to a concrete decision'); assert.match(rr.strategy, /0:0\|1:1\|2:3/); assert.equal(String(rr.o_send), '6'); assert.equal(rr.payoff, 9);
  assert.equal(rows.every(x => x.mode === 'async'), true);
  assert.deepEqual([sRows.find(x => x.stage === 'send').drawn_hidden, rr.drawn_hidden, sRows.find(x => x.stage === 'return').drawn_hidden], [1, 0, ''], 'drawn while hidden: 1, 0, blank where the role does not decide');
  console.log('trust game (async): strategy table, pending until a partner exists, matched with a copy of the stored decision, hand-computed payoffs 13 and 9');
}
// ===== ultimatum with a threshold =====
{
  const { S, base } = await setup('ultimatum-async', c => { c.game.rounds = 1; });
  const [p1, p2, rA, rB] = await participants(S, 4, T0);
  await asRole(S, p1, 'proposer'); await asRole(S, p2, 'proposer'); await asRole(S, rA, 'responder'); await asRole(S, rB, 'responder');
  await save(S, p1, 0, { offer: 3 }); await save(S, p2, 0, { offer: 3 });
  assert.equal((await save(S, rA, 0, { response: { threshold: 3 } })).ok, true);   // accepts an offer of 3
  const ma = await base.get(K.amatch(rA)); assert.equal(ma.rounds[0].partners[0].raw.offer, 3);
  assert.equal(Number((await rowOf(S, rA)).points), 3, 'the responder accepts 3 and receives 3');
  await save(S, rB, 0, { response: { threshold: 4 } });
  assert.equal(Number((await rowOf(S, rB)).points), 0, 'the responder rejects 3 with a threshold of 4');
  await resolvePending(S, T0);
  for (const pp of [p1, p2]) {
    const m = await base.get(K.amatch(pp)), partner = m.rounds[0].partners[0];
    assert.equal(Number((await rowOf(S, pp)).points), partner.pid === rA ? 7 : 0, 'a proposer is paid 7 if matched with the accepting responder, 0 with the rejecting one');
  }
  console.log('ultimatum (async): minimum acceptable offer; accept at 3, reject at threshold 4');
}
// ===== public goods: distinct partners, strangers re-drawn per round, partners kept =====
for (const matching of ['strangers', 'partners']) {
  const { S, base, spec } = await setup('public-goods', c => { c.game.mode = 'async'; c.game.rounds = 4; c.game.matching = matching; c.game.cohortGroups = 1; });
  const codes = await participants(S, 8, T0);
  const instances = [instance(base, {})], cls = clients(codes, instances, { seed: 21, now: { v: T0 } });
  for (const c of cls) { let n = 0; while (!c.finished && n++ < 100) await c.tick(T0); assert(c.finished); }
  await resolvePending(S, T0);
  const draws = [];
  for (const cc of codes) {
    const m = await base.get(K.amatch(cc)); assert(m, 'matched'); assert.equal(m.rounds.length, 4);
    for (const rd of m.rounds) { assert.equal(rd.partners.length, 3); const ids = rd.partners.map(p => p.pid); assert.equal(new Set(ids).size, 3, 'distinct partners within a round'); assert(!ids.includes(cc), 'never themselves'); assert(rd.partners.every(p => p.role === 'member')); }
    draws.push(m.rounds.map(rd => rd.partners.map(p => p.pid).sort().join()));
    const oc = await asyncOutcome(S, { pid: cc, spec: R.gameOf(await (await import('../../netlify/lib/lab/content.mjs')).getContent(base, type)), params: { endowment: 20, mpcr: 0.4 } });
    for (let rho = 0; rho < 4; rho++) { const mine = (await base.get(K.rec(cc, rho))).data.raw.contribution, others = m.rounds[rho].partners.reduce((a, p) => a + p.raw.contribution, 0); assert(Math.abs(oc[rho].payoff - (20 - mine + 0.4 * (mine + others))) < 1e-9, 'public goods payoff'); }
  }
  const varying = draws.filter(d => new Set(d).size > 1).length;
  if (matching === 'partners') assert.equal(varying, 0, 'partners: the same three every round'); else assert(varying >= 4, 'strangers: partners drawn again each round (' + varying + ' of 8 differ)');
  console.log(`public goods (async, ${matching}): 3 distinct partners from the pool each round; payoffs equal the formula`);
}
// ===== dictator: the dictator needs nobody; the recipient is matched with a stored allocation =====
{
  const { S, base } = await setup('dictator', c => { c.game.mode = 'async'; c.game.rounds = 1; });
  const [d1, d2, r1] = await participants(S, 3, T0);
  await asRole(S, d1, 'dictator'); await asRole(S, d2, 'dictator'); await asRole(S, r1, 'recipient');
  await save(S, d1, 0, { give: 4 }); assert((await base.get(K.amatch(d1))).selfContained, 'the dictator\'s payoff depends on nobody else'); assert.equal(await base.get(K.apend(d1)), null);
  assert.equal(Number((await rowOf(S, d1)).points), 6);
  const pr = await type.routes['game/poll'](S, r1, { round: 0 }, T0); assert.equal(pr.passive, true, 'the recipient decides nothing');
  assert.equal((await save(S, r1, 0, {})).ok, true);   // the recipient's round
  assert.equal((await base.get(K.amatch(r1))).rounds[0].partners[0].pid, d1); assert.equal(Number((await rowOf(S, r1)).points), 4);
  await save(S, d2, 0, { give: 10 }); assert.equal(Number((await rowOf(S, d2)).points), 0);
  console.log('dictator (async): self-contained dictators, a passive recipient matched with a stored allocation');
}
// ===== validation on save, repeats, practice rounds, pools separated by condition and test status =====
{
  const { S, base } = await setup('trust-async', c => { c.game.rounds = 2; c.game.practiceRounds = 1; c.conditions = [{ id: 'one', label: 'One', params: {} }, { id: 'two', label: 'Two', params: { multiplier: 2 } }]; });
  const codes = await participants(S, 6, T0); const people = await Promise.all(codes.map(cc => base.get(`participants/${cc}`)));
  const byCond = c => codes.filter((cc, i) => people[i].condition === c);
  assert.equal(byCond('one').length, 3); assert.equal(byCond('two').length, 3);
  const [a, b, c] = byCond('one'), [d, e, f] = byCond('two');
  await asRole(S, a, 'sender'); await asRole(S, b, 'receiver'); await asRole(S, c, 'sender'); await asRole(S, d, 'sender'); await asRole(S, e, 'receiver');
  // validation: the server checks every decision against the rules snapshot
  assert.equal((await save(S, a, 0, { send: 11 })).error, 'bad_values'); assert.equal((await save(S, a, 0, { send: 2.5 })).error, 'bad_values'); assert.equal((await save(S, a, 0, { send: 'x' })).error, 'bad_values'); assert.equal((await save(S, a, 0, {})).error, 'bad_values');
  assert.equal((await save(S, a, 0, { send: 1, extra: 2 })).error, 'bad_values'); assert.equal((await save(S, a, 0, { return: { table: {} } })).error, 'bad_values', 'a sender cannot send a receiver\'s decision');
  assert.equal((await save(S, a, 7, { send: 1 })).error, 'bad_index');
  assert.equal((await save(S, b, 0, { return: { table: { 0: 0 } } })).error, 'bad_values', 'a strategy table needs a row for every value');
  assert.equal(await base.get(K.rec(a, 0)), null, 'a refused decision is not stored');
  // repeats are acknowledged, never overwritten
  assert.equal((await save(S, a, 0, { send: 5 })).ok, true); const again = await save(S, a, 0, { send: 9 }); assert.equal(again.repeat, true); assert.equal((await base.get(K.rec(a, 0))).data.raw.send, 5);
  // practice round (index 0) is recorded but not used for matching
  assert.equal((await save(S, a, 1, { send: 4 })).ok, true); assert.equal((await save(S, a, 2, { send: 6 })).ok, true);
  assert(await base.get(K.adone(a)), 'finished after all three rounds (one practice, two real)');
  const full = r => { const t = {}; for (let v = 0; v <= 10; v++) t[String(v)] = Math.min(v * 2, r); return { return: { table: t } }; };
  for (let r = 0; r < 3; r++) await save(S, b, r, full(100));
  const mb = await base.get(K.amatch(b)); assert.equal(mb.rounds.length, 2, 'two real rounds matched'); assert.deepEqual(mb.rounds.map(x => x.partners[0].pid), [a, a]);
  assert.deepEqual(mb.rounds.map(x => x.partners[0].raw.send), [4, 6], 'the partner\'s decisions of the same real round, practice skipped');
  // the other condition has its own pool: sender d sees no receiver of condition "two" yet
  for (let r = 0; r < 3; r++) await save(S, d, r, { send: 1 });
  assert(await base.get(K.apend(d)), 'pending: the only receiver finished in the other condition');
  // and its constants: the multiplier is 2 there
  for (let r = 0; r < 3; r++) await save(S, e, r, full(100));
  await resolvePending(S, T0);
  const rd = await rowOf(S, d); assert.equal(rd.match_status, 'matched');
  const ocd = await asyncOutcome(S, (await import('../../netlify/lib/lab/game/shared.mjs')).loadCtx ? await (await import('../../netlify/lib/lab/game/shared.mjs')).loadCtx(S, d) : null);
  assert.equal(ocd[0].payoff, 10 - 1 + Math.min(1 * 2, 100), 'condition "two" uses its own multiplier');
  assert.equal((await rowOf(S, e)).match_status, 'matched');
  // test participants never serve real ones
  const test = await participants(S, 1, T0, { test: true }); await asRole(S, test[0], 'receiver'); for (let r = 0; r < 3; r++) await save(S, test[0], r, full(100));
  await asRole(S, c, 'sender'); for (let r = 0; r < 3; r++) await save(S, c, r, { send: 3 });
  const mc = await base.get(K.amatch(c)); assert(mc && mc.rounds.every(x => x.partners[0].pid === b), 'a real sender was matched with the real receiver, not the test participant');
  assert((await base.list('g/pool-test/')).length === 1 && (await base.list('g/pool/')).every(k => !k.includes(test[0])));
  console.log('validation on save, repeats, practice rounds skipped in matching, pools separated by condition and test status');
}
// ===== a live waiting room that falls back to asynchronous play =====
{
  const { S, base, spec } = await setup('trust-async', c => { c.game.mode = 'live'; c.game.waitMaxSeconds = 30; c.game.waitFallback = 'async'; c.game.rounds = 2; });
  const [a] = await participants(S, 1, T0), fn = (to, now) => type.routes['game/fallback'](S, a, { to }, now);
  let s = await type.routes['game/poll'](S, a, { round: 0 }, T0); assert.equal(s.phase, 'lobby'); assert.equal(s.fallback, null);
  assert.equal((await fn('async', T0 + 5000)).error, 'too_early', 'not before the longest wait');
  s = await type.routes['game/poll'](S, a, { round: 0, hb: s.hb }, T0 + 31000); assert.equal(s.fallback, 'async', 'the configured fallback is offered after the wait');
  assert.equal((await fn('fee', T0 + 31000)).error, 'bad_fallback', 'only the configured fallback is accepted');
  assert.equal((await fn('async', T0 + 31000)).to, 'async'); assert.equal((await fn('async', T0 + 32000)).repeat, true);
  s = await type.routes['game/poll'](S, a, { round: 0 }, T0 + 33000); assert.equal(s.phase, 'async'); assert(['sender', 'receiver'].includes(s.role));
  const cl = clients([a], [instance(base, {})], { seed: 3, now: { v: T0 + 40000 } })[0]; let n = 0; while (!cl.finished && n++ < 50) await cl.tick(T0 + 40000);
  assert(cl.finished && await base.get(K.adone(a)), 'played both rounds asynchronously');
  const row = await rowOf(S, a); assert.equal(row.mode, 'async'); assert.equal(row.match_status, 'pending', 'no stored decisions yet');
  console.log('waiting room fallback to asynchronous play: offered after the longest wait, only as configured, then played alone');
}
console.log('ALL ASYNC GAME TESTS PASSED');
