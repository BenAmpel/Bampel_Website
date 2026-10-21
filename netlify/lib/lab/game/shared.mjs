// CCAIR Behavioral Lab, economic games: keys, caches, and helpers shared by live and asynchronous play.
//
// Storage rule (see static/lab/README.md, "Economic games"): Netlify Blobs does not keep read-modify-write
// atomic, so every piece of shared state is a write-once key and state is derived from which keys exist.
// Nothing here updates a record in place. Keys that never change once written are cached per function instance.
//
//   g/p/<pid>/...        one participant: lobby, member/<n>, role, fallback, comp/<n>, comp-pass, comp-fail, pay,
//                        adone, amatch
//   g/cidx/<cohort>      index of cohorts (so listings do not scan every move)
//   g/slot/<slot>        the groups formed in one 5-second matching slot (one record, so a slot has one outcome)
//   g/claim/<slot>       who is running the slot (reduces duplicate work; not needed for correctness)
//   g/c/<cohort>/...     one cohort: cohort, ready/<pid>, decision, arrive/r<r>/<ms>~<pid>, start/r<r>/s<s>/g<j>,
//                        move/r<r>/s<s>/<pid>, dropped/<pid>, closed
//   g/pool/<cond>/<role>/<pid>   asynchronous participants whose decisions can be used as partners (g/pool-test/ for test participants)
//   g/apend/<pid>        asynchronous participants still waiting for partners
//   gh/s1/<bucket>/<cond>~<ver>~<test>/<entry>~<pid>   heartbeats while waiting (not backed up)
//   data/<pid>/s1/t<r>   the round record the engine's exports read (written by the server, once)
import { setNew } from '../store.mjs';
import { defaultContent, normalize } from '../content.mjs';
import { randomBytes } from 'node:crypto';
import { SLOT_MS, drawPaidRound } from './rules.mjs';

export const SESSION = 1;
export const GRACE_MS = 2500;   // a decision sent just after the clock ran out is still accepted
export const K = {
  plan: pid => `plans/${pid}/s${SESSION}`,
  rec: (pid, r) => `data/${pid}/s${SESSION}/t${r}`,
  lobby: pid => `g/p/${pid}/lobby`,
  member: (pid, n) => `g/p/${pid}/member/${n}`,
  role: pid => `g/p/${pid}/role`,
  fallback: pid => `g/p/${pid}/fallback`,
  comp: (pid, n) => `g/p/${pid}/comp/${n}`,
  compPass: pid => `g/p/${pid}/comp-pass`,
  compFail: pid => `g/p/${pid}/comp-fail`,
  pay: pid => `g/p/${pid}/pay`,
  adone: pid => `g/p/${pid}/adone`,
  amatch: pid => `g/p/${pid}/amatch`,
  rejoin: (pid, cid) => `g/p/${pid}/rejoin/${cid}`,
  cidx: cid => `g/cidx/${cid}`,
  slot: u => `g/slot/${u}`,
  claim: u => `g/claim/${u}`,
  cohort: cid => `g/c/${cid}/cohort`,
  ready: (cid, pid) => `g/c/${cid}/ready/${pid}`,
  decision: cid => `g/c/${cid}/decision`,
  arrivePrefix: (cid, r) => `g/c/${cid}/arrive/r${r}/`,
  start: (cid, r, s, j) => `g/c/${cid}/start/r${r}/s${s}/g${j}`,
  movePrefix: (cid, r, s) => `g/c/${cid}/move/r${r}/s${s}/`,
  move: (cid, r, s, pid) => `g/c/${cid}/move/r${r}/s${s}/${pid}`,
  dropped: (cid, pid) => `g/c/${cid}/dropped/${pid}`,
  droppedPrefix: cid => `g/c/${cid}/dropped/`,
  closed: cid => `g/c/${cid}/closed`,
  // Test participants (pilots, self-tests) only ever meet each other: their pools and lobbies are separate from real participants'.
  pool: (test, cond, role, pid) => `g/pool${test ? '-test' : ''}/${cond}/${role}/${pid}`,
  poolPrefix: (test, cond, role) => `g/pool${test ? '-test' : ''}/${cond}/${role}/`,
  apend: pid => `g/apend/${pid}`,
  hbPrefix: bucket => `gh/s${SESSION}/${bucket}/`,
  hb: (bucket, cond, ver, test, entry, pid) => `gh/s${SESSION}/${bucket}/${cond}~${ver}~${test ? 1 : 0}/${entry}~${pid}`,
  hbGroup: (bucket, cond, ver, test) => `gh/s${SESSION}/${bucket}/${cond}~${ver}~${test ? 1 : 0}/`
};
export const bucketOf = now => Math.floor(now / SLOT_MS);
export const tail = key => key.slice(key.lastIndexOf('/') + 1);

// Per-instance cache for keys that are written once and never change.
const caches = new WeakMap();
const cacheFor = store => { let m = caches.get(store); if (!m) { m = new Map(); caches.set(store, m); } return m; };
export async function getOnce(store, key) {
  const m = cacheFor(store);
  if (m.has(key)) return m.get(key);
  const v = await store.get(key);
  if (v != null) { if (m.size > 5000) m.clear(); m.set(key, v); }
  return v;
}
export function forget(store) { caches.delete(store); }
// Write-once, returning what the store holds afterwards: the existing value wins when another request got there first.
// With verify, the key is read back after a successful create: if the store ever let two creators both succeed, the
// value that stuck wins for everyone (used for the records different instances could compute differently).
export async function writeOnce(store, key, value, { verify = false } = {}) {
  if (await setNew(store, key, value)) {
    if (verify) {
      const cur = await store.get(key);
      if (cur != null && JSON.stringify(cur) !== JSON.stringify(value)) { cacheFor(store).set(key, cur); return { value: cur, created: false }; }
    }
    cacheFor(store).set(key, value); return { value, created: true };
  }
  let cur = await getOnce(store, key);
  if (cur == null) { await new Promise(r => setTimeout(r, 40)); cur = await getOnce(store, key); }
  return { value: cur == null ? value : cur, created: false };
}

// The content as it was at a version (immutable once saved), normalized for this study type.
export async function contentAt(S, ver) {
  const cache = cacheFor(S.store), ck = `@content/${ver}`;
  if (cache.has(ck)) return cache.get(ck);
  const raw = ver === 0 ? defaultContent(S.type) : await S.store.get(`content/history/v${String(ver).padStart(5, '0')}`);
  if (!raw) return null;
  const c = normalize(structuredClone(raw), S.type);
  cache.set(ck, c);
  return c;
}

export const seedId = S => S.study.seedId || S.study.id;

// The plan the participant started with carries the rules snapshot, so later edits never change a running game.
export async function loadCtx(S, pid) {
  const plan = await getOnce(S.store, K.plan(pid));
  if (!plan) return { error: 'no_session', status: 409 };
  const g = plan.game;
  if (!g) return { error: 'bad_plan', status: 409 };
  return { pid, plan, g, spec: g.spec, params: g.params, condition: g.condition, version: plan.contentVersion || 0, studyId: seedId(S) };
}
export const roundInfo = (spec, r) => ({ practice: r < spec.practiceRounds, roundNo: r < spec.practiceRounds ? r + 1 : r - spec.practiceRounds + 1 });
export const realRoundIndex = (spec, r) => r - spec.practiceRounds;   // negative for practice

// A round record for a participant who never played it (no match, failed comprehension check, and so on).
export async function writeUnplayed(S, ctx, reason, now) {
  const { pid, spec } = ctx, total = spec.practiceRounds + spec.rounds;
  const writes = [];
  for (let r = 0; r < total; r++) {
    const { practice, roundNo } = roundInfo(spec, r);
    writes.push(setNew(S.store, K.rec(pid, r), { code: pid, condition: ctx.condition, session: SESSION, index: r, role: null, practice, cohort: null, group: null,
      contentVersion: ctx.version, receivedAt: now, data: { played: false, reason, practice, roundNo, stages: [], payoff: null } }));
  }
  await Promise.all(writes);
}

// The paid round is drawn once, at completion, from a server-side secret (the study's pepper), so it cannot be worked out
// from public information before the last round. Write-once: whoever writes first fixes it.
export async function ensurePay(S, ctx, pid, now) {
  const have = await getOnce(S.store, K.pay(pid));
  if (have) return have;
  const pep = await getOnce(S.store, 'meta/pepper');
  const secret = (pep && pep.value) || randomBytes(16).toString('hex');
  return (await writeOnce(S.store, K.pay(pid), { round: drawPaidRound(secret, pid, ctx.studyId, ctx.spec.rounds), at: now })).value;
}
