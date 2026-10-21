// The rules of the games as pure functions: preset payoffs against hand-computed values, the strategy method,
// decision limits, content validation, matching schedules, cohort formation, and the payment draw.
import assert from 'node:assert/strict';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { presetContent, PRESETS, presetList } from '../../netlify/lib/lab/game/presets.mjs';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { validateGame, normalizeGame, defaultGame, sampleOutcome } from '../../netlify/lib/lab/game/model.mjs';

const type = TYPES.game;
const load = (preset, edit) => { const c = C.normalize(C.defaultContent(type), type); Object.assign(c, presetContent(preset)); if (edit) edit(c); C.normalize(c, type); return c; };
const errs = c => C.validateContent(c, type);
const play = (c, cond, members, raw, round = 0) => { const spec = R.gameOf(c); return R.resolveGroup(spec, R.paramsFor(c, cond), round, members, raw); };

// every preset is valid as shipped and after the engine's normalization
for (const p of presetList()) assert.deepEqual(errs(load(p.id)), [], p.id);
assert.deepEqual(errs(C.normalize(C.defaultContent(type), type)), [], 'default content is valid');
console.log('presets valid:', presetList().map(p => p.id).join(', '));

// ----- prisoner's dilemma: T=5 R=3 P=1 S=0 -----
{
  const c = load('prisoners-dilemma-1'), m = [{ pid: 'a', role: 'player' }, { pid: 'b', role: 'player' }];
  const pay = (x, y) => { const r = play(c, 'main', m, { a: { move: x }, b: { move: y } }).payoffs; return [r.a, r.b]; };
  assert.deepEqual(pay('C', 'C'), [3, 3]); assert.deepEqual(pay('C', 'D'), [0, 5]); assert.deepEqual(pay('D', 'C'), [5, 0]); assert.deepEqual(pay('D', 'D'), [1, 1]);
  const t = R.payoffTable(R.gameOf(c), R.paramsFor(c, 'main'));
  assert.deepEqual(t.cells, [[[3, 3], [0, 5]], [[5, 0], [1, 1]]]); assert.equal(t.rowTitle, 'You'); assert.equal(t.rows.length, 2);
  // the payoff table is not built for games it does not fit
  assert.equal(R.payoffTable(R.gameOf(load('public-goods')), {}), null); assert.equal(R.payoffTable(R.gameOf(load('trust-live')), {}), null);
  // PD ordering and the iterated-game condition hold for the shipped constants
  const k = c.params; assert(k.T > k.R && k.R > k.P && k.P > k.S && 2 * k.R > k.T + k.S);
}
// ----- public goods: endowment 20, MPCR 0.4 -----
{
  const c = load('public-goods'), m = ['a', 'b', 'c', 'd'].map(p => ({ pid: p, role: 'member' }));
  const pay = v => play(c, 'main', m, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { contribution: x }]))).payoffs;
  assert.deepEqual(pay({ a: 0, b: 0, c: 0, d: 0 }), { a: 20, b: 20, c: 20, d: 20 });
  assert.deepEqual(pay({ a: 20, b: 20, c: 20, d: 20 }), { a: 32, b: 32, c: 32, d: 32 });
  assert.deepEqual(pay({ a: 20, b: 0, c: 10, d: 10 }), { a: 16, b: 36, c: 26, d: 26 });
  const r = pay({ a: 5, b: 5, c: 5, d: 5 }); assert(Object.values(r).every(x => Math.abs(x - (15 + 0.4 * 20)) < 1e-9));
}
// ----- trust game: endowment 10, tripled -----
{
  const c = load('trust-live'), m = [{ pid: 's', role: 'sender' }, { pid: 'r', role: 'receiver' }];
  let r = play(c, 'main', m, { s: { send: 6 }, r: { return: 5 } }).payoffs;
  assert.deepEqual(r, { s: 10 - 6 + 5, r: 18 - 5 });
  r = play(c, 'main', m, { s: { send: 0 }, r: { return: 0 } }).payoffs; assert.deepEqual(r, { s: 10, r: 0 });
  r = play(c, 'main', m, { s: { send: 10 }, r: { return: 15 } }).payoffs; assert.deepEqual(r, { s: 15, r: 15 });
  // the receiver's limit is the tripled amount, worked out from what was sent
  const spec = R.gameOf(c), params = R.paramsFor(c, 'main'), steps = R.stepsOf(spec);
  assert.equal(steps.length, 2);
  const ask = R.stepPrompt(spec, params, 'receiver', steps[1], 0, { send: 4 });
  assert.equal(ask[0].decisions[0].max, 12); assert.equal(ask[0].decisions[0].min, 0);
  assert.equal(R.validateStepValues(spec, params, 'receiver', steps[1], 0, { send: 4 }, { return: 12 }).values.return, 12);
  assert.match(R.validateStepValues(spec, params, 'receiver', steps[1], 0, { send: 4 }, { return: 13 }).error, /outside 0 to 12/);
  assert.match(R.validateStepValues(spec, params, 'receiver', steps[1], 0, { send: 4 }, { return: 1.5 }).error, /multiple of/);
  assert.match(R.validateStepValues(spec, params, 'receiver', steps[1], 0, { send: 4 }, { return: 'x' }).error, /not a number/);
  assert.match(R.validateStepValues(spec, params, 'receiver', steps[1], 0, { send: 4 }, {}).error, /Missing/);
  assert.match(R.validateStepValues(spec, params, 'receiver', steps[1], 0, { send: 4 }, { return: 1, extra: 2 }).error, /Unexpected/);
  // a sender cannot send a decision that belongs to the receiver's step
  assert.match(R.validateStepValues(spec, params, 'sender', steps[0], 0, {}, { return: 1 }).error, /Missing|Unexpected/);
}
// ----- trust game with the strategy method (table) -----
{
  const c = load('trust-async'), spec = R.gameOf(c), params = R.paramsFor(c, 'main');
  const table = {}; for (let v = 0; v <= 10; v++) table[String(v)] = Math.floor(v * 3 / 2);   // return half of what they hold
  const m = [{ pid: 's', role: 'sender' }, { pid: 'r', role: 'receiver' }];
  const res = R.resolveGroup(spec, params, 0, m, { s: { send: 6 }, r: { return: { table } } });
  assert.equal(res.concrete.r.return, 9); assert.deepEqual(res.payoffs, { s: 10 - 6 + 9, r: 18 - 9 });
  assert.deepEqual(res.strategy.r.return, { table });
  // validation: all rows required, each within its own limit
  const asked = R.stepPrompt(spec, params, 'receiver', R.stepsOf(spec)[0], 0, {});
  assert.equal(asked[0].strategy.rows.length, 11); assert.equal(asked[0].strategy.rows[4].spec.max, 12);
  const step = { index: -1, stages: [0, 1] };
  const bad = { ...table, '4': 13 };
  assert.match(R.validateStepValues(spec, params, 'receiver', { index: 0, stages: [1] }, 0, {}, { return: { table: bad } }).error, /outside 0 to 12/);
  const short = { ...table }; delete short['3'];
  assert.match(R.validateStepValues(spec, params, 'receiver', { index: 0, stages: [1] }, 0, {}, { return: { table: short } }).error, /outside|not one|not a number/);
  assert.equal(R.validateStepValues(spec, params, 'receiver', { index: 0, stages: [1] }, 0, {}, { return: { table } }).values.return.table['10'], 15);
}
// ----- ultimatum: direct response, and a threshold -----
{
  const c = load('ultimatum-live'), m = [{ pid: 'p', role: 'proposer' }, { pid: 'r', role: 'responder' }];
  assert.deepEqual(play(c, 'main', m, { p: { offer: 3 }, r: { response: 'accept' } }).payoffs, { p: 7, r: 3 });
  assert.deepEqual(play(c, 'main', m, { p: { offer: 3 }, r: { response: 'reject' } }).payoffs, { p: 0, r: 0 });
  assert.deepEqual(play(c, 'main', m, { p: { offer: 0 }, r: { response: 'accept' } }).payoffs, { p: 10, r: 0 });
  const a = load('ultimatum-async'), spec = R.gameOf(a), params = R.paramsFor(a, 'main');
  const th = t => R.resolveGroup(spec, params, 0, m, { p: { offer: 3 }, r: { response: { threshold: t } } });
  assert.equal(th(3).concrete.r.response, 'accept', 'a threshold of 3 accepts an offer of 3'); assert.deepEqual(th(3).payoffs, { p: 7, r: 3 });
  assert.equal(th(4).concrete.r.response, 'reject'); assert.deepEqual(th(4).payoffs, { p: 0, r: 0 });
  assert.equal(th(0).concrete.r.response, 'accept'); assert.equal(th(11).concrete.r.response, 'reject', 'a threshold above the pie rejects everything');
  const ask = R.stepPrompt(spec, params, 'responder', { index: 0, stages: [1] }, 0, {});
  assert.equal(ask[0].strategy.form, 'threshold'); assert.equal(ask[0].strategy.min, 0); assert.equal(ask[0].strategy.max, 10);
  assert.equal(R.validateStepValues(spec, params, 'responder', { index: 0, stages: [1] }, 0, {}, { response: { threshold: 11 } }).values.response.threshold, 11);
  assert.match(R.validateStepValues(spec, params, 'responder', { index: 0, stages: [1] }, 0, {}, { response: { threshold: 12 } }).error, /not valid/);
  assert.match(R.validateStepValues(spec, params, 'responder', { index: 0, stages: [1] }, 0, {}, { response: { threshold: 2.5 } }).error, /not valid/);
  assert.match(R.validateStepValues(spec, params, 'responder', { index: 0, stages: [1] }, 0, {}, { response: 'accept' }).error, /not valid/);
}
// ----- dictator -----
{
  const c = load('dictator'), m = [{ pid: 'd', role: 'dictator' }, { pid: 'r', role: 'recipient' }];
  assert.deepEqual(play(c, 'main', m, { d: { give: 4 }, r: {} }).payoffs, { d: 6, r: 4 });
  const spec = R.gameOf(c); assert.equal(R.actorsOf(spec, R.stepsOf(spec)[0]).has('recipient'), false, 'the recipient is passive');
}
console.log('preset payoffs match hand-computed values; strategy table and threshold resolve; limits depend on what was seen');

// ----- treatments override constants -----
{
  const c = load('public-goods', c => { c.conditions = [{ id: 'low', label: 'Low', params: {} }, { id: 'high', label: 'High', params: { mpcr: 0.8, endowment: 10 } }]; });
  assert.deepEqual(errs(c), []);
  assert.equal(R.paramsFor(c, 'low').mpcr, 0.4); assert.equal(R.paramsFor(c, 'high').mpcr, 0.8); assert.equal(R.paramsFor(c, 'high').endowment, 10);
  const m = ['a', 'b', 'c', 'd'].map(p => ({ pid: p, role: 'member' }));
  const r = play(c, 'high', m, { a: { contribution: 10 }, b: { contribution: 0 }, c: { contribution: 0 }, d: { contribution: 0 } }).payoffs;
  assert.equal(r.a, 0 + 0.8 * 10); assert.equal(r.b, 10 + 0.8 * 10);
  assert.equal(R.stepPrompt(R.gameOf(c), R.paramsFor(c, 'high'), 'member', R.stepsOf(R.gameOf(c))[0], 0, {})[0].decisions[0].max, 10, 'the decision limit follows the treatment');
  assert.match(R.stepPrompt(R.gameOf(c), R.paramsFor(c, 'high'), 'member', R.stepsOf(R.gameOf(c))[0], 0, {})[0].prompt, /your 10 points/, 'the instruction text is filled with the treatment constants');
}

// ----- content validation: readable errors -----
{
  const bad = f => { const c = load('trust-live'); f(c); C.normalize(c, type); return errs(c); };
  assert(bad(c => { c.payoff.sender = 'endowment - my.bogus'; }).some(e => /Payoff for Sender: "my.bogus" is not a decision/.test(e)));
  assert(bad(c => { c.payoff.sender = 'endowment - my.return'; }).some(e => /"my.return" is not a decision of Sender; use role\.<role>\.return/.test(e)));
  assert(bad(c => { c.payoff.sender = 'role.nobody.send'; }).some(e => /there is no role "nobody"/.test(e)));
  assert(bad(c => { c.payoff.sender = 'role.receiver.send'; }).some(e => /does not make a decision "send"/.test(e)));
  assert(bad(c => { c.payoff.sender = 'endowment +'; }).some(e => /Payoff for Sender: The expression ends too early/.test(e)));
  assert(bad(c => { c.payoff.sender = 'frob(1)'; }).some(e => /Unknown function/.test(e)));
  assert(bad(c => { c.payoff.sender = 'notaparam * 2'; }).some(e => /unknown name "notaparam"/.test(e)));
  assert.deepEqual(bad(c => { c.payoff.sender = 'endowment - my.send + other.return'; }), [], 'other.<decision> works in a two-player game');
  assert(errs(load('public-goods', c => { c.payoff.member = 'other.contribution'; })).some(e => /only works with two players/.test(e)));
  assert(bad(c => { c.payoff.sender = 'others.send + 1'; }).some(e => /fail when tried with default decisions|needs numbers/.test(e)), 'a list used as a number is caught by the trial run');
  assert(bad(c => { delete c.payoff.receiver; }).some(e => /Payoff for Receiver: write a formula/.test(e)));
  assert(bad(c => { c.payoff.ghost = '1'; }).some(e => /not a role/.test(e)));
  assert(bad(c => { c.game.stages[1].decisions[0].max = 'multiplier * seen.return'; }).some(e => /not known yet/.test(e)));
  assert(bad(c => { c.game.stages[1].decisions[0].max = 'multiplier * seen.nothing'; }).some(e => /does not exist/.test(e)));
  assert(bad(c => { c.game.stages[1].show = ['return']; }).some(e => /only show decisions from earlier steps/.test(e)));
  assert(bad(c => { c.game.stages[0].parallel = true; }).some(e => /first stage cannot/.test(e)));
  assert(bad(c => { c.game.stages[1].decisions[0].id = 'send'; }).some(e => /share the ID "send"/.test(e)));
  assert(bad(c => { c.game.stages[1].role = 'ghost'; }).some(e => /choose which role decides/.test(e)));
  assert(!bad(c => { c.game.roles[0].count = 2; }).some(e => /add up/.test(e)), 'normalization keeps players equal to the role counts');
  assert(bad(c => { c.game.rounds = 0; }).some(e => /Rounds must be/.test(e)));
  assert(bad(c => { c.game.rounds = 51; }).some(e => /Rounds must be/.test(e)));
  assert(bad(c => { c.game.roles = [{ id: 'a', label: 'A', count: 13 }]; }).some(e => /1 to 12/.test(e)));
  assert(bad(c => { c.game.stages[0].decisions[0].default = 99; }).some(e => /default 99 is outside/.test(e)));
  assert(bad(c => { c.params.endowment = 'ten'; }).some(e => /must be a number/.test(e)));
  assert(bad(c => { c.params['bad name'] = 1; }).some(e => /Constant "bad name"/.test(e)));
  assert(bad(c => { c.conditions = [{ id: 'a', label: 'A', params: { nothere: 1 } }]; }).some(e => /not one of the constants/.test(e)));
  assert(bad(c => { c.payment.method = 'lottery'; }).some(e => /how the paid amount/.test(e)));
  assert(bad(c => { c.payment.maxBonus = -1; }).some(e => /maximum bonus/.test(e)));
  assert(bad(c => { c.game.matching = 'none'; }).some(e => /only for one-player/.test(e)));
  assert(bad(c => { c.game.mode = 'async'; }).some(e => /shows another player's earlier decision/.test(e)), 'asynchronous play needs the strategy method for a later mover');
  assert(bad(c => { c.game.waitFallback = 'async'; }).some(e => /asynchronous fallback/.test(e)));
  assert(bad(c => { c.game.matching = 'perfectStrangers'; c.game.players = 4; c.game.roles = [{ id: 'm', label: 'M', count: 4 }]; c.game.cohortGroups = 2; c.game.rounds = 10; }).length >= 0);
  assert.deepEqual(bad(c => { c.game.mode = 'async'; c.game.stages[1].show = []; c.game.stages[1].parallel = true; c.game.stages[1].strategyMethod = { on: 'send', form: 'table', above: '', below: '', defaultThreshold: 0 }; }), []);
  assert(bad(c => { c.game.mode = 'async'; c.game.stages[1].show = []; c.game.stages[1].strategyMethod = { on: 'send', form: 'threshold', above: 'x', below: 'y', defaultThreshold: 0 }; }).some(e => /number decision|two options|choose which option/.test(e)));
  const pg = load('public-goods', c => { c.game.matching = 'perfectStrangers'; c.game.cohortGroups = 2; });
  assert(errs(pg).some(e => /Perfect strangers cannot be arranged with 2 groups/.test(e) && /Try \d+ groups/.test(e)), errs(pg).join('|'));
  const ok = load('public-goods', c => { c.game.matching = 'perfectStrangers'; c.game.cohortGroups = R.suggestCohortGroups(4, 5); c.game.rounds = 5; });
  assert.deepEqual(errs(ok), [], 'the suggested number of groups works');
  // comprehension questions
  assert(bad(c => { c.comprehension = { enabled: true, maxAttempts: 2, questions: [] }; }).some(e => /Add 1 to 10 comprehension/.test(e)));
  assert.deepEqual(bad(c => { c.comprehension = { enabled: true, maxAttempts: 2, questions: [{ id: 'q1', text: 'How many points does the sender start with?', answer: 10, tolerance: 0 }] }; }), []);
}
console.log('content validation: unknown names, wrong roles, bad limits, async rules, perfect-strangers feasibility, comprehension');

// ----- matching schedules -----
{
  const mk = (G, g, matching) => ({ id: 'cX', G, g, matching, members: Array.from({ length: G * g }, (_, n) => ({ pid: 'p' + n, role: 'r' + (n % g), s: n % g, k: Math.floor(n / g) })) });
  const partners = mk(3, 4, 'partners');
  for (let r = 0; r < 5; r++) assert.deepEqual(R.groupsForRound(partners, r).map(g => g.map(m => m.pid)), [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]].map(g => g.map(i => 'p' + i)));
  // strangers: each round is a partition of the cohort, roles keep their positions, deterministic
  const st = mk(3, 4, 'strangers');
  for (let r = 0; r < 20; r++) {
    const gs = R.groupsForRound(st, r), all = gs.flat().map(m => m.pid);
    assert.equal(new Set(all).size, 12); gs.forEach(g => g.forEach((m, s) => assert.equal(m.s, s)));
    assert.deepEqual(R.groupsForRound(st, r).map(g => g.map(m => m.pid)), gs.map(g => g.map(m => m.pid)), 'deterministic');
  }
  assert(new Set([...Array(20).keys()].map(r => JSON.stringify(R.groupsForRound(st, r).map(g => g.map(m => m.pid))))).size > 5, 'strangers change from round to round');
  // perfect strangers: nobody meets twice, as far as the cohort allows
  for (const [g, G, rounds] of [[2, 5, 5], [4, 5, 5], [4, 7, 7], [3, 3, 3]]) {
    const ps = mk(G, g, 'perfectStrangers'), met = new Set();
    for (let r = 0; r < rounds; r++) for (const grp of R.groupsForRound(ps, r)) for (let a = 0; a < grp.length; a++) for (let b = a + 1; b < grp.length; b++) { const k = [grp[a].pid, grp[b].pid].sort().join('-'); assert(!met.has(k), `pair ${k} met twice (g=${g} G=${G})`); met.add(k); }
    assert(R.perfectStrangersOk(g, G, rounds));
  }
  assert.equal(R.perfectStrangersOk(4, 2, 4), false); assert.equal(R.perfectStrangersOk(4, 4, 4), false, 'four groups of four repeat a pair');
  assert.equal(R.suggestCohortGroups(4, 10), 11); assert.equal(R.suggestCohortGroups(2, 5), 5);
  assert.equal(R.groupOf(st, 3, 'p5').members.length, 4);
}
// ----- cohort formation is a pure function of the candidates -----
{
  const c = load('public-goods'), spec = R.gameOf(c), gameFor = () => spec;
  const cand = Array.from({ length: 19 }, (_, i) => ({ pid: 'P' + String(i).padStart(2, '0'), cond: 'main', ver: 1, test: false, entry: 1000 + (i % 5) * 100 }));
  const a = R.formCohorts(gameFor, 777, cand, 'study'), b = R.formCohorts(gameFor, 777, cand.slice().reverse(), 'study'), shuffled = R.formCohorts(gameFor, 777, cand.slice().sort(() => 0.5 - Math.random()), 'study');
  assert.deepEqual(a, b, 'the same cohorts whatever order the heartbeats were listed in'); assert.deepEqual(a, shuffled);
  assert.equal(a.length, 2, 'two cohorts of eight; three people wait'); assert(a.every(co => co.members.length === 8 && co.G === 2));
  const placed = new Set(a.flatMap(co => co.members.map(m => m.pid)));
  const waiting = cand.filter(x => !placed.has(x.pid)); assert.equal(waiting.length, 3);
  const earliest = cand.slice().sort((x, y) => x.entry - y.entry || (x.pid < y.pid ? -1 : 1)).slice(0, 16).map(x => x.pid).sort();
  assert.deepEqual([...placed].sort(), earliest, 'earliest to arrive are matched first');
  assert(a.every(co => R.groupsForRound(co, 0).every(g => g.length === 4 && g.map(m => m.role).every(r => r === 'member'))));
  // different conditions and test status are never mixed
  const mixed = [...cand.slice(0, 8).map(x => ({ ...x, cond: 'a' })), ...cand.slice(8, 16).map(x => ({ ...x, cond: 'b' })), ...cand.slice(16).map(x => ({ ...x, test: true }))];
  const m = R.formCohorts(gameFor, 5, mixed, 'study'); assert.equal(m.length, 2); assert(m.every(co => new Set(co.members.map(x => mixed.find(y => y.pid === x.pid).cond)).size === 1));
  // after half the maximum wait, strangers settle for a smaller cohort
  const few = cand.slice(0, 4).map(x => ({ ...x, entry: 0 }));
  assert.equal(R.formCohorts(gameFor, 1, few, 's').length, 0, 'not yet');
  const late = R.formCohorts(gameFor, spec.waitMaxSeconds * 100, few, 's'); assert.equal(late.length, 1); assert.equal(late[0].G, 1);
  // roles are assigned by position and respect counts
  const tc = load('trust-live'), tspec = R.gameOf(tc);
  const tr = R.formCohorts(() => tspec, 9, cand.slice(0, 6).map(x => ({ ...x })), 's');
  assert.equal(tr.length, 3); assert(tr.every(co => co.members.map(m => m.role).sort().join() === 'receiver,sender'));
}
// ----- payment -----
{
  const pay = { method: 'randomRound', pointsPerUnit: 0.1, currency: 'USD', showUpFee: 1, maxBonus: null };
  assert.deepEqual(R.paymentFor(pay, [10, 20, 30], 1), { points: 20, bonus: 2 });
  assert.deepEqual(R.paymentFor({ ...pay, method: 'sum' }, [10, 20, 30], 1), { points: 60, bonus: 6 });
  assert.deepEqual(R.paymentFor({ ...pay, method: 'mean' }, [10, 20, 30], 1), { points: 20, bonus: 2 });
  assert.deepEqual(R.paymentFor({ ...pay, method: 'sum', maxBonus: 4 }, [10, 20, 30], 0), { points: 60, bonus: 4 }, 'capped');
  assert.deepEqual(R.paymentFor(pay, [-5, 3], 0), { points: -5, bonus: 0 }, 'a bonus is never negative');
  assert.deepEqual(R.paymentFor(pay, [10, null], 1), { points: null, bonus: null }, 'unknown payoffs give no amount');
  assert.equal(R.round2(1.005), 1.01); assert.equal(R.round2(0.1 + 0.2), 0.3);
  // the draw is a pure function of a server-side secret, participant, and study
  for (const pid of ['P-1', 'P-2', 'P-abc']) assert.equal(R.drawPaidRound('sec', pid, 's', 10), R.drawPaidRound('sec', pid, 's', 10));
  const counts = Array(5).fill(0); for (let i = 0; i < 2000; i++) counts[R.drawPaidRound('sec', 'P-' + i, 'study', 5)]++;
  assert(counts.every(n => n > 300 && n < 500), 'roughly uniform: ' + counts);
  assert(R.drawPaidRound('a', 'P-1', 's', 1000000) !== R.drawPaidRound('b', 'P-1', 's', 1000000), 'depends on the secret, so it cannot be worked out from the ID and study alone');
}
// ----- timeout values -----
{
  const c = load('trust-async', c => { c.game.timeoutAction = 'default'; }), spec = R.gameOf(c), params = R.paramsFor(c, 'main'), rand = () => 0.5;
  const def = R.autoValues(spec, params, 'sender', { index: 0, stages: [0] }, 0, {}, 'default', null, rand); assert.deepEqual(def, { send: 0 });
  const rnd = R.autoValues(spec, params, 'sender', { index: 0, stages: [0] }, 0, {}, 'random', null, () => 0.5); assert.equal(rnd.send, 5);
  const rep = R.autoValues(spec, params, 'sender', { index: 0, stages: [0] }, 1, {}, 'repeatLast', { send: 7 }, rand); assert.deepEqual(rep, { send: 7 });
  const strat = R.autoValues(spec, params, 'receiver', { index: 0, stages: [1] }, 0, {}, 'default', null, rand); assert.equal(Object.keys(strat.return.table).length, 11);
  for (const action of ['default', 'random', 'repeatLast']) for (const role of ['sender', 'receiver']) {
    const stages = role === 'sender' ? [0] : [1], v = R.autoValues(spec, params, role, { index: 0, stages }, 0, {}, action, null, Math.random);
    assert(!R.validateStepValues(spec, params, role, { index: 0, stages }, 0, {}, v).error, `${action} gives valid values for ${role}`);
  }
}
assert.equal(load('public-goods').game.pollSeconds, 2, 'the default refresh is every 2 seconds');
console.log('treatments, matching schedules, cohort formation (determinism, order, mixing), payment and the paid-round draw');
console.log('ALL GAME RULES TESTS PASSED');
