import * as core from '../../netlify/lib/vc-core.mjs';
import { runBackup, backupStatus, purgeParticipant } from '../../netlify/lib/vc-backup.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const main = memStore(), backup = memStore({ latency: 1 });
const now = Date.UTC(2026, 9, 5, 15);
// two participants with some answers
const ps = [];
for (const cond of ['control', 'ai_first']) {
  const p = await core.createTestParticipant(main, cond, now); await core.consent(main, p.code, true, now);
  const plan = await core.startSession(main, p.code, now);
  await core.saveTrial(main, p.code, 1, 'practice', {}, now);
  for (const t of plan.trials.slice(0, 3)) await core.saveTrial(main, p.code, 1, t.index, { final: { judgment: 'benign' }, rawEvents: [{ t: 1 }] }, now);
  ps.push(p);
}
await core.login(main, { email: 'a@gsu.edu', confirm: true }, now);
// first run copies everything
const r1 = await runBackup(main, backup, { now });
assert(r1.complete && r1.copied > 0 && r1.pending === 0);
const studyKeys = (await Promise.all(['participants/', 'data/', 'raw/', 'plans/', 'contact/', 'cond/', 'meta/', 'consent/', 'started/'].map(p => main.list(p)))).flat();
for (const k of studyKeys) assert.deepEqual(await backup.get('m/' + k), await main.get(k), 'mirror differs for ' + k);
// second run copies only changed records (participants, meta) plus anything new
const p0 = ps[0], plan0 = await core.startSession(main, p0.code, now);
await core.saveTrial(main, p0.code, 1, plan0.trials[3].index, { final: { judgment: 'malicious' } }, now);
await core.setTest(main, p0.code, false);
const r2 = await runBackup(main, backup, { now: now + 3600e3 });
const mutable = (await main.list('participants/')).length + (await main.list('meta/')).length + (await main.list('admins/')).length + ((await main.get('content/current')) ? 1 : 0);
assert(r2.copied <= mutable + 2, `second run should be incremental (copied ${r2.copied})`);
assert.equal((await backup.get(`m/participants/${p0.code}`)).test, false, 'changed record recopied');
assert(await backup.get(`m/data/${p0.code}/s1/t${plan0.trials[3].index}`), 'new answer copied');
// budget: a run that runs out of time resumes next time
const big = memStore(), bb = memStore({ latency: 5 });
for (let i = 0; i < 400; i++) await big.set(`data/X/s1/t${i}`, { i });
const a = await runBackup(big, bb, { budgetMs: 50 }); assert(!a.complete && a.pending > 0);
let guard = 0, b; do { b = await runBackup(big, bb, { budgetMs: 50 }); } while (!b.complete && ++guard < 100);
assert(b.complete && (await bb.list('m/data/X/')).length === 400);
assert.equal((await backupStatus(bb)).complete, true);
// withdrawal: purge removes every copy of that participant
const removed = await purgeParticipant(backup, p0.code, p0.condition);
assert(removed > 0);
assert.equal((await backup.list(`m/data/${p0.code}/`)).length + (await backup.list(`m/raw/${p0.code}/`)).length + (await backup.list(`m/plans/${p0.code}/`)).length, 0);
assert.equal(await backup.get(`m/participants/${p0.code}`), null);
assert((await backup.list(`m/data/${ps[1].code}/`)).length > 0, 'other participants untouched');
console.log('backup: full copy, incremental runs, changed records recopied, resumes after time budget, purge on withdrawal');
console.log('ALL BACKUP TESTS PASSED');
