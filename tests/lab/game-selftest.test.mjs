// The live self-test for the game type: simulated groups through the real code paths, resumable in small slices,
// leaving nothing behind. Runs for each kind of design.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import { runSelfTest } from '../../netlify/lib/lab/selftest.mjs';
import { setup, type, study } from './game-helpers.mjs';
import { memStore } from './memstore.mjs';

const run = async (S, opts, budgetMs) => {
  let r = await runSelfTest(S, { ...opts, budgetMs }), calls = 1;
  while (!r.done) { assert(!r.error, JSON.stringify(r)); r = await runSelfTest(S, { code: r.code, budgetMs }); calls++; }
  return { r, calls };
};
const cases = [
  ['prisoners-dilemma-10', c => { c.game.rounds = 4; }],
  ['public-goods', c => { c.game.rounds = 3; }],
  ['trust-live', c => { c.game.rounds = 3; }],
  ['ultimatum-live', null],
  ['dictator', c => { c.game.rounds = 2; c.game.practiceRounds = 1; }],
  ['trust-async', c => { c.game.rounds = 2; }],
  ['ultimatum-async', c => { c.game.rounds = 2; c.game.practiceRounds = 1; }],
  ['trust-async', c => { c.game.mode = 'live'; c.game.waitFallback = 'async'; c.game.rounds = 2; c.game.waitMaxSeconds = 20; }]   // live, with the asynchronous fallback
];
for (const [preset, edit] of cases) {
  const { S, base, spec } = await setup(preset, edit, { base: memStore({ latency: 1 }) });
  const t0 = Date.now(), { r, calls } = await run(S, { condition: 'main' }, 300);
  const bad = r.checks.filter(c => !c.pass); assert.equal(r.failed, 0, preset + ': ' + JSON.stringify(bad));
  assert(r.passed >= 15, `${preset}: ${r.passed} checks`);
  assert.equal((await E.listParticipants(S)).length, 0, 'every test participant deleted');
  const left = [...base.m.keys()].filter(k => /^(g|gh|selftest|data|plans|done|started|views|raw|consent|cond|cond-test|participants|contact)\//.test(k)); assert.deepEqual(left, [], preset + ' left keys behind: ' + left.slice(0, 4));
  console.log(`self-test ${preset}${spec.mode === 'live' && spec.waitFallback === 'async' ? ' (live + async fallback)' : ''}: ${r.passed} checks passed in ${calls} resumable calls, ${Date.now() - t0} ms`);
}
// keeping the test participants, then deleting them as the admin page does
{
  const { S, base } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 3; });
  const { r } = await run(S, { condition: 'main', keep: true }, 5000);
  assert.equal(r.failed, 0); assert.equal(r.kept, true); assert((await E.listParticipants(S)).length === 2);
  const d = await E.deleteTestParticipants(S); assert.equal(d.participants, 2);
  const left = [...base.m.keys()].filter(k => /^(g\/(p|c|pool|arole|apend)|gh)\//.test(k)); assert.deepEqual(left, [], 'deleting the test participants removes their groups and moves');
  console.log('kept test participants are removed completely by "Delete all test participants"');
}
// a self-test run next to real participants does not touch them
{
  const { S, base } = await setup('prisoners-dilemma-10', c => { c.game.rounds = 2; });
  const real = (await E.createParticipants(S, 2, { gapDays: 0, test: false }, Date.now())).created.map(c => c.code);
  for (const cc of real) { await E.consent(S, cc, true); await E.startSession(S, cc); await type.routes['game/poll'](S, cc, { round: 0 }, Date.now()); }
  const before = (await base.list('g/p/')).filter(k => real.some(cc => k.includes(cc))).sort();
  const { r } = await run(S, { condition: 'main' }, 5000); assert.equal(r.failed, 0);
  const after = (await base.list('g/p/')).filter(k => real.some(cc => k.includes(cc))).sort(); assert.deepEqual(after, before, 'real participants\' keys are untouched');
  assert((await E.listParticipants(S)).filter(p => !p.test).length === 2);
  assert.equal(await type.routes['game/poll'](S, real[0], { round: 0, hb: null }, Date.now()).then(s => s.phase), 'lobby', 'the real participants are still waiting, unmatched with the simulated ones');
  console.log('a self-test beside real participants leaves their waiting-room state alone');
}
console.log('ALL GAME SELF-TEST CHECKS PASSED');
