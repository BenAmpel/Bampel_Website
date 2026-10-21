// Participant flows around the game: understanding check, leaving with the show-up fee, editing the study
// while a group is playing, sequential and passive roles, the strategy method in live play, and treatments.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { K } from '../../netlify/lib/lab/game/shared.mjs';
import { findMembership } from '../../netlify/lib/lab/game/live.mjs';
import { paymentRowFor } from '../../netlify/lib/lab/game/export.mjs';
import { presetContent } from '../../netlify/lib/lab/game/presets.mjs';
import { setup, instance, participants, clients, drive, type, study } from './game-helpers.mjs';

const T0 = Date.UTC(2027, 0, 5, 15);
const poll = (S, code, body, now = T0) => type.routes['game/poll'](S, code, body, now);
const rowOf = async (S, code) => paymentRowFor(S, await S.store.get(`participants/${code}`));

// ===== understanding check =====
{
  const { S, base } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 2; c.comprehension = { enabled: true, maxAttempts: 2, questions: [{ id: 'both_c', text: 'How many points does each of you get if both choose Cooperate?', answer: 3, tolerance: 0 }, { id: 'sucker', text: 'How many points do you get if you cooperate and the other defects?', answer: 0, tolerance: 0 }] }; });
  const [a, b] = await participants(S, 2, T0);
  let s = await poll(S, a, { round: 0 }); assert.equal(s.phase, 'comprehension'); assert.equal(s.attemptsLeft, 2); assert.deepEqual(s.questions.map(q => q.id), ['both_c', 'sucker']);
  assert(!JSON.stringify(s).includes('answer') && !JSON.stringify(s).includes('tolerance'), 'no answer key in the question screen');
  assert.equal((await E.saveTrial(S, a, 1, 0, {}, T0)).error, 'comprehension_required');
  let r = await type.routes['game/check'](S, a, { answers: { both_c: '3', sucker: '2' } }, T0); assert.equal(r.passed, false); assert.deepEqual(r.wrong, ['sucker']); assert.equal(r.attemptsLeft, 1);
  assert.equal((await poll(S, a, { round: 0 })).attemptsLeft, 1);
  r = await type.routes['game/check'](S, a, { answers: { both_c: ' 3 ', sucker: '0' } }, T0); assert.equal(r.passed, true);
  s = await poll(S, a, { round: 0 }); assert.equal(s.phase, 'lobby', 'passing admits the participant to the waiting room');
  assert.equal((await base.get(K.comp(a, 0))).wrong[0], 'sucker', 'attempts are stored');
  assert.equal((await type.routes['game/check'](S, a, { answers: {} }, T0)).passed, true, 'passing is final');
  // failing every attempt: excluded from the lobby, show-up fee, session completes
  r = await type.routes['game/check'](S, b, { answers: { both_c: '1', sucker: '1' } }, T0); assert.equal(r.passed, false);
  r = await type.routes['game/check'](S, b, { answers: { both_c: '1', sucker: '1' } }, T0); assert.equal(r.failed, true);
  s = await poll(S, b, { round: 0 }); assert.equal(s.phase, 'fee'); assert.equal(s.reason, 'comprehension');
  assert.equal(await base.get(K.lobby(b)), null, 'never entered the waiting room');
  assert.equal((await type.routes['game/check'](S, b, { answers: { both_c: '3', sucker: '0' } }, T0)).failed, true, 'no further attempts');
  for (let q = 0; q < 2; q++) assert.equal((await E.saveTrial(S, b, 1, q, {}, T0)).repeat, true);
  const fin = await E.saveSurvey(S, b, 1, 'post', {}, T0); assert.equal(fin.status.finished, true, 'the engine session can finish');
  const row = await rowOf(S, b); assert.equal(row.completed, 'partial'); assert.equal(row.match_status, 'not_matched'); assert.equal(row.show_up_fee, 0);
  console.log('understanding check: answers kept server-side, two attempts, failing excludes from the lobby and ends with the fee');
}
// ===== leaving with the show-up fee =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 2; c.game.waitMaxSeconds = 30; c.game.waitFallback = 'fee'; c.payment = { method: 'randomRound', pointsPerUnit: 0.1, currency: 'USD', showUpFee: 1.5, maxBonus: null }; });
  const [a] = await participants(S, 1, T0);
  let s = await poll(S, a, { round: 0 }); assert.equal(s.phase, 'lobby'); assert.equal(s.needed, 2); assert.equal(s.fallback, null);
  for (let t = 5000; t < 31000; t += 5000) s = await poll(S, a, { round: 0, hb: s.hb }, T0 + t);
  assert.equal(s.fallback, 'fee');
  assert.equal((await type.routes['game/fallback'](S, a, { to: 'fee' }, T0 + 31000)).to, 'fee');
  assert.equal((await poll(S, a, { round: 0 }, T0 + 32000)).phase, 'fee');
  for (let q = 0; q < 2; q++) { const rec = await base.get(K.rec(a, q)); assert.equal(rec.data.played, false); assert.equal(rec.data.reason, 'no_match'); }
  for (let q = 0; q < 2; q++) assert.equal((await E.saveTrial(S, a, 1, q, {}, T0)).ok, true);
  assert.equal((await E.saveSurvey(S, a, 1, 'post', {}, T0)).status.finished, true);
  const row = await rowOf(S, a); assert.equal(row.completed, 'partial'); assert.equal(row.show_up_fee, 1.5); assert.equal(row.bonus, ''); assert.equal(row.match_status, 'no_match');
  const people = { [a]: await base.get(`participants/${a}`) };
  const { exportTrials } = await import('../../netlify/lib/lab/game/export.mjs');
  const rows = await exportTrials(S, [await base.get(K.rec(a, 0)), await base.get(K.rec(a, 1))], people, [a]);
  assert.equal(rows.length, 2); assert(rows.every(x => x.played === 0 && x.not_played_reason === 'no_match' && x.fallback === 'fee'));
  console.log('leaving with the show-up fee: rounds recorded as not played, the session finishes, the fee is in the payments');
}
// ===== editing the study while a group is playing =====
{
  const { S, base, spec } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 4; c.game.decisionSeconds = 30; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const old = await participants(S, 2, now.v), oldCls = clients(old, insts, { seed: 31, now });
  // play two rounds, then the owner edits the rules (a different payoff, more rounds), and the old group finishes
  let edited = false;
  await drive(oldCls, now, spec, { onTick: async () => { if (!edited && oldCls.every(c => c.round >= 2)) { edited = true; const c = await C.getContent(base, type); const next = structuredClone(c); next.params.T = 9; next.game.rounds = 8; C.clearContentCache(base); const r = await C.saveContent(base, type, next, 'Owner', c.version); assert.equal(r.ok, true); C.clearContentCache(base); } } });
  assert(edited);
  const cohort = await base.get(K.cohort((await findMembership(S, old[0])).cid)); assert.equal(cohort.ver, 1); assert.equal(cohort.rounds, 4);
  for (let q = 0; q < 4; q++) assert((await base.get(K.rec(old[0], q))).contentVersion === 1, 'every round of the running group keeps version 1');
  let sawNine = false; for (let q = 0; q < 4; q++) { const rec = await base.get(K.rec(old[0], q)); if (rec.data.payoff === 9) sawNine = true; }
  assert(!sawNine, 'the new temptation payoff does not leak into the old group');
  // new participants play the new version, in their own cohort
  const fresh = await participants(S, 2, now.v), freshCls = clients(fresh, insts, { seed: 33, now });
  const spec2 = R.gameOf(await C.getContent(base, type)); assert.equal(spec2.rounds, 8);
  await drive(freshCls, now, spec2);
  const c2 = await base.get(K.cohort((await findMembership(S, fresh[0])).cid)); assert.equal(c2.ver, 2); assert.equal(c2.rounds, 8); assert.notEqual(c2.id, cohort.id);
  assert.equal((await base.get(K.rec(fresh[0], 7))).contentVersion, 2);
  console.log('editing the study mid-game: the running group keeps its rules (version 1); newcomers get version 2 in their own cohort');
}
// ===== sequential play: what the receiver sees and may choose =====
{
  const { S, base, spec, content } = await setup('trust-live', c => { c.game.rounds = 1; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })], codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 41, now });
  const role = {}; let sender, receiver;
  while (!(cls[0].last && cls[1].last && ['play', 'wait'].includes(cls[0].last.phase) && ['play', 'wait'].includes(cls[1].last.phase))) { await Promise.all(cls.map(c => (c.act = false, c.tick(now.v)))); now.v += cls[0].last && cls[0].last.phase === 'lobby' ? 5000 : 1000; }
  for (const [i, c] of cls.entries()) role[c.last.role] = i;
  sender = cls[role.sender]; receiver = cls[role.receiver];
  assert.equal(sender.last.phase, 'play'); assert.equal(sender.last.entries[0].decisions[0].max, 10); assert.equal(sender.last.shown.length, 0);
  assert.equal(receiver.last.phase, 'wait', 'the receiver waits for the sender'); assert.equal(receiver.last.reason, 'turn'); assert.deepEqual(receiver.last.waitingFor, ['Sender']);
  // the receiver cannot move before the sender
  const early = await type.routes['game/move'](S, receiver.pid, { cid: receiver.last.cid, round: 0, step: 1, values: { return: 0 } }, now.v); assert.equal(early.error, 'not_yet');
  assert.equal((await type.routes['game/move'](S, receiver.pid, { cid: receiver.last.cid, round: 0, step: 0, values: { send: 1 } }, now.v)).error, 'not_your_turn');
  assert.equal((await type.routes['game/move'](S, sender.pid, { cid: sender.last.cid, round: 0, step: 1, values: { return: 1 } }, now.v)).error, 'not_your_turn');
  assert.equal((await type.routes['game/move'](S, sender.pid, { cid: sender.last.cid, round: 0, step: 0, values: { send: 11 } }, now.v)).error, 'bad_values');
  assert.equal((await type.routes['game/move'](S, sender.pid, { cid: 'c1-0', round: 0, step: 0, values: { send: 4 } }, now.v)).error, 'no_group', 'another group\'s ID is refused');
  assert.equal((await type.routes['game/move'](S, sender.pid, { cid: sender.last.cid, round: 1, step: 0, values: { send: 4 } }, now.v)).error, 'bad_move');
  assert.equal((await type.routes['game/move'](S, sender.pid, { cid: sender.last.cid, round: 0, step: 0, values: { send: 4 } }, now.v)).ok, true);
  now.v += 1000; await receiver.tick(now.v);
  assert.equal(receiver.last.phase, 'play'); assert.deepEqual(receiver.last.shown, [{ id: 'send', by: 'Sender', value: 4 }], 'the receiver is shown what was sent');
  assert.equal(receiver.last.entries[0].decisions[0].max, 12, 'and may return up to the tripled amount');
  assert.equal((await type.routes['game/move'](S, receiver.pid, { cid: receiver.last.cid, round: 0, step: 1, values: { return: 13 } }, now.v)).error, 'bad_values');
  assert.equal((await type.routes['game/move'](S, receiver.pid, { cid: receiver.last.cid, round: 0, step: 1, values: { return: 5 } }, now.v)).ok, true);
  now.v += 1000; await sender.tick(now.v); await receiver.tick(now.v);
  assert.equal(sender.last.phase, 'feedback'); assert.equal(sender.last.record.payoff, 10 - 4 + 5); assert.equal(receiver.last.record.payoff, 12 - 5);
  console.log('sequential play: the later mover is shown the earlier decision and limited by it; out-of-turn, out-of-range, and foreign moves are refused');
}
// ===== a passive role, and the feedback settings control what is disclosed =====
{
  const { S, base, spec } = await setup('dictator', c => { c.game.rounds = 2; c.feedback = { ownPayoff: true, othersDecisions: false, groupTotal: false, history: false }; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })], codes = await participants(S, 2, now.v), cls = clients(codes, insts, { seed: 43, now });
  await drive(cls, now, spec);
  const fbs = await Promise.all(codes.map(cc => poll(S, cc, { round: 1 })));
  assert(fbs.every(f => f.phase === 'feedback')); for (const f of fbs) { assert(f.record.payoff != null); assert(f.record.stages.every(st => st.others === null), 'others\' decisions hidden by the setting'); assert.equal(f.record.groupTotal, null); }
  const rec = await base.get(K.rec(codes[0], 1)); assert(rec.data.stages[0].others !== undefined, 'but the stored record still holds them for the exports');
  const roles = fbs.map(f => f.role).sort(); assert.deepEqual(roles, ['dictator', 'recipient']);
  const recip = fbs.find(f => f.role === 'recipient'); assert.equal(recip.record.stages[0].acting, false);
  console.log('passive recipient plays through; the feedback settings decide what is shown while the record keeps everything');
}
// ===== the strategy method in live play (collected at the same time) and treatments =====
{
  const { S, base, spec, content } = await setup('trust-async', c => { c.game.mode = 'live'; c.game.rounds = 2; c.conditions = [{ id: 'triple', label: 'Triple', params: {} }, { id: 'double', label: 'Double', params: { multiplier: 2 } }]; });
  const now = { v: T0 }, insts = [instance(base, { clock: () => now.v })];
  const all = await participants(S, 8, now.v), people = await Promise.all(all.map(cc => base.get(`participants/${cc}`)));
  const triple = all.filter((cc, i) => people[i].condition === 'triple'), dbl = all.filter((cc, i) => people[i].condition === 'double'); assert.equal(triple.length, 4); assert.equal(dbl.length, 4);
  const cls = clients(all, insts, { seed: 51, now }); await drive(cls, now, spec);
  const params = { triple: R.paramsFor(content, 'triple'), double: R.paramsFor(content, 'double') };
  let checked = 0;
  for (const [cond, group] of [['triple', triple], ['double', dbl]]) for (const cc of group) for (let r = 0; r < 2; r++) {
    const rec = await base.get(K.rec(cc, r)); assert.equal(rec.condition, cond);
    const d = rec.data; if (d.role === 'sender') { const send = d.stages[0].values.send, back = d.others ? 0 : 0; const rcv = d.stages[1].others[0].values.return; assert.equal(d.payoff, 10 - send + rcv); checked++; }
    else { const send = d.stages[0].others[0].values.send, ret = d.stages[1].values.return; assert.equal(d.payoff, params[cond].multiplier * send - ret); assert(ret <= params[cond].multiplier * send, 'limit follows the condition\'s multiplier'); assert(d.stages[1].strategy.return.table, 'the strategy is kept'); checked++; }
  }
  assert.equal(checked, 16);
  const cohorts = new Set(); for (const cc of all) cohorts.add((await findMembership(S, cc)).cid); assert.equal(cohorts.size, 4, 'two pairs per condition, never across conditions');
  for (const cid of cohorts) { const co = await base.get(K.cohort(cid)); assert.equal(new Set(co.members.map(m => people[all.indexOf(m.pid)].condition)).size, 1); }
  console.log('strategy method in live play (both stated at once); treatments: each condition uses its own multiplier and its own groups');
}
console.log('ALL GAME FLOW TESTS PASSED');
