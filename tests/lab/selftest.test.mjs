import { runSelfTest } from './compat.mjs';
import { core } from './compat.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store=memStore({latency:80}), m={get:k=>store.m.has(k)?store.m.get(k).v:undefined, entries:()=>[...store.m.entries()].map(([k,x])=>[k,x.v]), values:()=>[...store.m.values()].map(x=>x.v)};

for (const cond of ['ai_first','evidence_first','control']) {
  let r = await runSelfTest(store, { condition: cond }), calls = 1, longest = 0, t = Date.now();
  while (!r.done) { const t1 = Date.now(); r = await runSelfTest(store, { code: r.code }); calls++; longest = Math.max(longest, Date.now() - t1); }
  console.log(cond, `passed ${r.passed}, failed ${r.failed}; ${calls} calls, longest ${longest} ms at 80 ms/storage call`);
  r.checks.filter(c => !c.pass).forEach(c => console.log('  FAIL', c.what)); assert.equal(r.failed, 0); assert(longest < 7000);
}
assert.equal((await core.listParticipants(store)).length, 0); assert.equal((await store.list('selftest/')).length, 0, 'progress cleaned up');
console.log('ALL SELF-TEST CHECKS PASSED (cleaned up)');
