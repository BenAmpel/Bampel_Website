import { runSelfTest } from './compat.mjs';
import { core } from './compat.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store=memStore({latency:80}), m={get:k=>store.m.has(k)?store.m.get(k).v:undefined, entries:()=>[...store.m.entries()].map(([k,x])=>[k,x.v]), values:()=>[...store.m.values()].map(x=>x.v)};

for (const cond of ['ai_first','evidence_first','control']) {
  let r = await runSelfTest(store, { condition: cond }), calls = 1, longest = 0, t = Date.now();
  let most = 0;
  while (!r.done) { const t1 = Date.now(), r0 = store.rounds; r = await runSelfTest(store, { code: r.code }); calls++; longest = Math.max(longest, Date.now() - t1); most = Math.max(most, store.rounds - r0); }
  console.log(cond, `passed ${r.passed}, failed ${r.failed}; ${calls} calls, longest ${longest} ms, at most ${most} storage rounds (${most * 80} ms at 80 ms each)`);
  // Each call must fit well inside a serverless function's time limit (10 s on Netlify). The time is storage waits, so
  // count them (rounds of storage calls x 80 ms) rather than the wall clock, which a busy machine stretches.
  r.checks.filter(c => !c.pass).forEach(c => console.log('  FAIL', c.what)); assert.equal(r.failed, 0); assert(most * 80 < 7000, `${most} storage rounds in one call`);
}
assert.equal((await core.listParticipants(store)).length, 0); assert.equal((await store.list('selftest/')).length, 0, 'progress cleaned up');
console.log('ALL SELF-TEST CHECKS PASSED (cleaned up)');
