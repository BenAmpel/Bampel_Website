// CCAIR Behavioral Lab, economic games: live play (players matched in real time, deciding round by round).
//
// How it stays correct without atomic read-modify-write (the design argument is in static/lab/README.md):
//  * Presence. A waiting participant's poll (about once a second) writes a heartbeat key once per 5-second bucket.
//  * Matching. Groups are formed per 5-second slot u, only from heartbeats of bucket u-2 (already settled, so every
//    server instance lists the same set), minus people placed in slots u-3..u-1, sorted by (lobby entry, ID). The
//    function is deterministic, and the result is ONE write-once record per slot, so a slot has exactly one outcome
//    whichever instance writes first; everyone else reads and adopts it.
//  * Moves are write-once keys. The round and step advance when the keys exist. A missing move after the deadline is
//    written by whichever poll notices (flagged auto), with the same value wherever it is computed.
//  * Outcomes are pure functions of the moves and the rules snapshot (rules.mjs), recomputed, never updated.
import { seeded } from '../engine.mjs';
import { setNew } from '../store.mjs';
import * as R from './rules.mjs';
import { K, SESSION, GRACE_MS, bucketOf, tail, getOnce, writeOnce, contentAt, loadCtx, roundInfo, writeUnplayed, seedId, ensurePay } from './shared.mjs';

const WINDOW = 3;

// ---------- matching ----------
function parseHb(key) {
  // gh/s1/<bucket>/<cond>~<ver>~<test>/<entry>~<pid>
  const parts = key.split('/'), [cond, ver, test] = parts[3].split('~'), i = parts[4].indexOf('~');
  return { cond, ver: Number(ver), test: test === '1', entry: Number(parts[4].slice(0, i)), pid: parts[4].slice(i + 1) };
}
async function slotRecord(S, u) { return getOnce(S.store, K.slot(u)); }

// Creates the record for slot u if it does not exist yet; returns the winning record (or null if nobody was matched).
export async function computeSlot(S, u, known) {
  const keys = await S.store.list(K.hbPrefix(u - R.SETTLE_BUCKETS));
  const taken = new Set();
  for (let v = u - WINDOW; v < u; v++) for (const c of (known[v] && known[v].cohorts) || []) for (const m of c.members) taken.add(m.pid);
  const best = new Map();
  for (const k of keys) { const h = parseHb(k); if (taken.has(h.pid)) continue; const cur = best.get(h.pid); if (!cur || h.entry < cur.entry) best.set(h.pid, h); }
  // Not placed again: people who took the waiting-room fallback or finished asynchronously, and people who were placed in a
  // group and never confirmed it (until they press the rejoin button).
  const checked = await Promise.all([...best.values()].map(async h => ((await eligible(S, h.pid)) ? h : null)));
  const cands = checked.filter(Boolean), games = new Map();
  for (const v of new Set(cands.map(c => c.ver))) { const c = await contentAt(S, v); if (c) games.set(v, R.gameOf(c)); }
  const usable = cands.filter(c => games.has(c.ver) && games.get(c.ver).mode === 'live');
  const cohorts = R.formCohorts(v => games.get(v), u, usable, seedId(S));
  // An empty slot is recorded too (write-once), so it is not listed again by every later attempt.
  const rec = (await writeOnce(S.store, K.slot(u), { slot: u, createdAt: u * R.SLOT_MS, cohorts }, { verify: true })).value;
  return rec;
}

// Membership history: the newest membership that is not an abandoned cohort, and whether the participant was a no-show
// in the newest abandoned one (placed there but not on the confirmed list, and not rejoined since).
export async function membershipState(S, pid) {
  let active = null, lastAbandoned = null;
  for (let n = 0; n < 100000; n++) {
    const m = await getOnce(S.store, K.member(pid, n));
    if (!m) break;
    const dec = await getOnce(S.store, K.decision(m.cid));
    if (dec && dec.go === false) { lastAbandoned = { cid: m.cid, ready: dec.ready || [] }; active = null; continue; }
    active = { n, cid: m.cid, decision: dec };
  }
  let noshow = null, rejoinAt = null;
  if (lastAbandoned) {
    const rj = await getOnce(S.store, K.rejoin(pid, lastAbandoned.cid));
    if (rj) rejoinAt = rj.at; else if (!lastAbandoned.ready.includes(pid)) noshow = lastAbandoned.cid;
  }
  return { active, noshow, rejoinAt };
}
async function eligible(S, pid) {
  const [fb, done] = await Promise.all([getOnce(S.store, K.fallback(pid)), getOnce(S.store, K.adone(pid))]);
  if (fb || done) return false;
  const st = await membershipState(S, pid);
  return !st.noshow && !st.active;
}

// Writes each cohort's record and a pointer from each member to it. All writes are idempotent.
export async function publishSlot(S, rec) {
  if (!rec.cohorts.length || await getOnce(S.store, `g/slotdone/${rec.slot}`)) return;
  for (const c of rec.cohorts) {
    await writeOnce(S.store, K.cohort(c.id), c, { verify: true });
    await writeOnce(S.store, K.cidx(c.id), { slot: rec.slot });
    await Promise.all(c.members.map(async m => {
      for (let n = 0; n < 100000; n++) {
        const cur = await S.store.get(K.member(m.pid, n));
        if (!cur) { const w = await writeOnce(S.store, K.member(m.pid, n), { cid: c.id, slot: rec.slot }); if (w.value.cid === c.id) return; continue; }
        if (cur.cid === c.id) return;
      }
    }));
  }
  await writeOnce(S.store, `g/slotdone/${rec.slot}`, { at: Date.now() });
}

// Runs the matcher for slot b and the three before it (they are normally already there). Called by one waiting
// participant per slot (the one who wins the claim); anyone else just waits for the member key to appear.
export async function matchAttempt(S, pid, now) {
  const b = bucketOf(now);
  const claim = await S.store.get(K.claim(b));
  if (claim) { if (now - claim.at < 4000) return; } else if (!(await setNew(S.store, K.claim(b), { by: pid, at: now }))) return;
  const known = {};
  await Promise.all(Array.from({ length: WINDOW * 2 + 1 }, (_, i) => b - WINDOW * 2 + i).map(async u => { const r = await slotRecord(S, u); if (r) known[u] = r; }));
  for (let u = b - WINDOW; u <= b; u++) {
    if (!known[u]) { const r = await computeSlot(S, u, known); if (r) known[u] = r; }
    if (known[u]) await publishSlot(S, known[u]);
  }
  // Heartbeats older than the matcher can use are removed (one bucket per attempt), so they do not pile up.
  for (const k of await S.store.list(K.hbPrefix(b - WINDOW - 2 - R.SETTLE_BUCKETS))) await S.store.delete(k);
}

// The newest membership that is not an abandoned cohort.
export async function findMembership(S, pid) { return (await membershipState(S, pid)).active; }

// ---------- reading moves ----------
const stageOfDecision = (spec, id) => spec.stages.find(st => st.decisions.some(d => d.id === id));

// Moves already made in steps before `upTo` (all steps when upTo is the number of steps).
async function readMoves(S, cid, r, members, spec, steps, upTo) {
  const raw = {}, meta = {};
  for (const m of members) { raw[m.pid] = {}; meta[m.pid] = {}; }
  for (let s = 0; s < upTo; s++) {
    const actors = R.actorsOf(spec, steps[s]);
    await Promise.all(members.filter(m => actors.has(m.role)).map(async m => {
      const mv = await getOnce(S.store, K.move(cid, r, s, m.pid));
      if (mv) { Object.assign(raw[m.pid], mv.values); meta[m.pid][s] = mv; }
    }));
  }
  return { raw, meta };
}
// What players have seen so far: decision id -> value (a list when several players made it).
function seenFrom(spec, steps, members, raw, upTo) {
  const seen = {}, who = {};
  for (let s = 0; s < upTo; s++) for (const si of steps[s].stages) {
    const st = spec.stages[si];
    if (st.strategyMethod) continue;
    for (const d of st.decisions) {
      const actors = members.filter(m => R.stageActs(st, m.role) && raw[m.pid] && d.id in raw[m.pid]);
      if (!actors.length) continue;
      seen[d.id] = actors.length === 1 ? raw[actors[0].pid][d.id] : actors.map(m => raw[m.pid][d.id]);
      who[d.id] = R.roleLabel(spec, actors[0].role);
    }
  }
  return { seen, who };
}

// ---------- timeouts and dropped players ----------
async function maybeDrop(S, ctx, cohort, r, s, pid, role, now) {
  const { spec } = ctx;
  if (!(spec.dropAfterTimeouts > 0)) return;
  const steps = R.stepsOf(spec), mine = steps.map((st, i) => (R.actorsOf(spec, st).has(role) ? i : -1)).filter(i => i >= 0);
  let count = 1, rr = r, pos = mine.indexOf(s);
  while (count < spec.dropAfterTimeouts) {
    pos--; if (pos < 0) { rr--; pos = mine.length - 1; }
    if (rr < 0) break;
    const mv = await getOnce(S.store, K.move(cohort.id, rr, mine[pos], pid));
    if (!mv || !mv.auto || mv.why !== 'timeout') break;
    count++;
  }
  if (count >= spec.dropAfterTimeouts) await writeOnce(S.store, K.dropped(cohort.id, pid), { at: now, round: r, step: s });
}

async function writeAuto(S, ctx, cohort, r, s, step, m, seen, deadline, why, now) {
  const { spec, params } = ctx;
  let last = null;
  if (spec.timeoutAction === 'repeatLast') {
    const mine = R.stepsOf(spec).map((st, i) => (R.actorsOf(spec, st).has(m.role) ? i : -1)).filter(i => i >= 0), pos = mine.indexOf(s);
    const prev = pos > 0 ? [r, mine[pos - 1]] : r > 0 ? [r - 1, mine[mine.length - 1]] : null;
    if (prev) { const mv = await getOnce(S.store, K.move(cohort.id, prev[0], prev[1], m.pid)); last = mv ? mv.values : null; }
  }
  const values = R.autoValues(spec, params, m.role, step, r, seen, spec.timeoutAction, last, seeded(`${cohort.id}|r${r}|s${s}|${m.pid}`));
  const w = await writeOnce(S.store, K.move(cohort.id, r, s, m.pid), { values, auto: true, why, at: why === 'timeout' ? deadline : now, ...(R.stepFellBack(spec, params, m.role, step, r, seen) ? { limitFallback: true } : {}) }, { verify: true });
  if (w.created && why === 'timeout') await maybeDrop(S, ctx, cohort, r, s, m.pid, m.role, now);
  return w.value;
}

// ---------- advancing a group through a round ----------
// Brings the group's round up to date: starts steps, writes missing moves after a deadline, reports where things stand.
// It writes only write-once keys, so any member's poll (or the admin's close action) can run it at any time.
async function advanceGroup(S, ctx, cohort, r, j, members, now, opt = {}) {
  const { spec } = ctx, steps = R.stepsOf(spec), cid = cohort.id;
  const closed = !!opt.force || !!(await getOnce(S.store, K.closed(cid)));
  const dropped = new Set(spec.dropAfterTimeouts > 0 ? (await S.store.list(K.droppedPrefix(cid))).map(tail) : []);
  let arrivals = null;
  if (r > 0) {
    arrivals = new Map();
    for (const k of await S.store.list(K.arrivePrefix(cid, r))) { const t = tail(k), i = t.indexOf('~'), ms = Number(t.slice(0, i)), p = t.slice(i + 1); if (!arrivals.has(p) || ms < arrivals.get(p)) arrivals.set(p, ms); }
    if (opt.viewer && !arrivals.has(opt.viewer)) { await setNew(S.store, K.arrivePrefix(cid, r) + `${now}~${opt.viewer}`, { at: now }); arrivals.set(opt.viewer, now); }
  }
  const out = { steps: [], complete: false, dropped, closed, arrivals, blocked: null };
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s], actors = R.actorsOf(spec, step), movers = members.filter(m => actors.has(m.role));
    if (!movers.length) { out.steps.push({ s, movers: [], moved: [], missing: [], done: true, start: null, deadline: null }); continue; }
    let start = await getOnce(S.store, K.start(cid, r, s, j));
    if (!start) {
      let ok = false;
      if (s > 0) ok = out.steps[s - 1].done;
      else if (r === 0 || closed) ok = true;
      else {
        const here = members.filter(m => !dropped.has(m.pid)), first = Math.min(...members.map(m => arrivals.get(m.pid) ?? Infinity));
        ok = here.every(m => arrivals.has(m.pid)) || (first < Infinity && now >= first + spec.feedbackSeconds * 1000);
      }
      if (ok) start = (await writeOnce(S.store, K.start(cid, r, s, j), { at: now }, { verify: true })).value;
    }
    const info = { s, movers, start, deadline: null, moved: [], missing: [], done: false };
    out.steps.push(info);
    if (!start) { out.blocked = s === 0 ? 'arrivals' : 'previous'; break; }
    info.deadline = start.at + spec.decisionSeconds * 1000;
    const moved = new Set((await S.store.list(K.movePrefix(cid, r, s))).map(tail));
    let missing = movers.filter(m => !moved.has(m.pid));
    if (missing.length) {
      const late = closed || now > info.deadline + GRACE_MS, toAuto = missing.filter(m => late || dropped.has(m.pid));
      if (toAuto.length) {
        const { raw } = await readMoves(S, cid, r, members, spec, steps, s), { seen } = seenFrom(spec, steps, members, raw, s);
        for (const m of toAuto) { await writeAuto(S, ctx, cohort, r, s, step, m, seen, info.deadline, dropped.has(m.pid) ? 'dropped' : closed ? 'admin' : 'timeout', now); moved.add(m.pid); }
        missing = movers.filter(m => !moved.has(m.pid));
      }
    }
    info.moved = movers.filter(m => moved.has(m.pid)).map(m => m.pid);
    info.missing = missing.map(m => m.pid);
    info.done = !missing.length;
    if (!info.done) break;
  }
  out.complete = out.steps.length === steps.length && out.steps.every(x => x.done);
  return out;
}

// ---------- the round record ----------
// Writes the finished round for every member of the group (write-once; identical wherever it is computed).
async function finishRound(S, ctx, cohort, r, j, members, now) {
  const { spec, params } = ctx, steps = R.stepsOf(spec), cid = cohort.id;
  const { raw, meta } = await readMoves(S, cid, r, members, spec, steps, steps.length);
  let res = null, err = null;
  try { res = R.resolveGroup(spec, params, r, members, raw); } catch (e) { err = e.message; }
  const { practice, roundNo } = roundInfo(spec, r), total = spec.practiceRounds + spec.rounds;
  const stageRow = (m, st, si) => {
    const step = steps.findIndex(x => x.stages.includes(si)), acting = R.stageActs(st, m.role), mv = acting ? (meta[m.pid][step] || {}) : {};
    const values = {}, strat = {};
    if (acting && res) for (const d of st.decisions) { values[d.id] = res.concrete[m.pid][d.id]; if (st.strategyMethod) strat[d.id] = raw[m.pid][d.id]; }
    return { stage: st.id, step, acting, values, strategy: st.strategyMethod && acting ? strat : undefined, auto: acting ? !!mv.auto : false, why: acting && mv.auto ? mv.why : undefined,
      rtMs: acting ? (mv.rtMs ?? null) : null, hiddenMs: acting ? (mv.hiddenMs ?? null) : null, drawnHidden: acting && typeof mv.drawnHidden === 'boolean' ? mv.drawnHidden : undefined, limitFallback: acting && mv.limitFallback ? true : undefined };
  };
  const total_ = res ? Object.values(res.payoffs).reduce((a, b) => a + b, 0) : null;
  const all = members.map(m => ({ m, stages: spec.stages.map((st, si) => stageRow(m, st, si)) }));
  const writes = all.map(async ({ m, stages }) => {
    const others = stages.map((row, si) => all.filter(x => x.m.pid !== m.pid && x.stages[si].acting).map(x => ({ role: x.m.role, values: x.stages[si].values })));
    const data = { played: true, mode: 'live', cohort: cid, group: j, groupSize: members.length, role: m.role, practice, roundNo,
      stages: stages.map((row, si) => ({ ...row, others: others[si] })), payoff: res ? res.payoffs[m.pid] : null, groupPayoffs: res ? members.map(x => res.payoffs[x.pid]) : null, groupTotal: total_,
      autos: stages.filter(x => x.auto).length, payoffError: err || undefined };
    const rec = { code: m.pid, condition: cohort.cond, session: SESSION, index: r, role: m.role, practice, cohort: cid, group: j, contentVersion: ctx.version, receivedAt: now, data };
    await setNew(S.store, K.rec(m.pid, r), rec);
    if (r === total - 1) await ensurePay(S, ctx, m.pid, now);
  });
  await Promise.all(writes);
}

// What a player may see of a finished round (the feedback settings decide what is disclosed).
export function feedbackView(spec, fb, rec, includeOthers = true) {
  const d = rec.data;
  if (!d.played) return { played: false, reason: d.reason, practice: d.practice, roundNo: d.roundNo };
  return {
    played: true, practice: d.practice, roundNo: d.roundNo, role: d.role, autos: d.autos,
    payoff: fb.ownPayoff ? d.payoff : null,
    groupTotal: fb.groupTotal ? d.groupTotal : null,
    stages: d.stages.map(s => ({ stage: s.stage, acting: s.acting, values: s.values, auto: s.auto,
      others: fb.othersDecisions && includeOthers ? s.others.map(o => ({ role: o.role, values: o.values })) : null }))
  };
}
async function historyOf(S, ctx, upTo) {
  const out = [];
  for (let r = 0; r < upTo; r++) { const rec = await getOnce(S.store, K.rec(ctx.pid, r)); if (rec) out.push(feedbackView(ctx.spec, ctx.g.feedback, rec)); }
  return out;
}

// ---------- the poll ----------
const publicBase = (ctx, now) => ({ serverNow: now, mode: 'live', rounds: ctx.spec.rounds, practiceRounds: ctx.spec.practiceRounds });

async function lobbyState(S, ctx, pid, body, now) {
  const { spec } = ctx;
  let lobby = await getOnce(S.store, K.lobby(pid));
  if (!lobby) { const person = await S.store.get(`participants/${pid}`); lobby = (await writeOnce(S.store, K.lobby(pid), { at: now, cond: ctx.condition, ver: ctx.version, test: !!(person && person.test) })).value; }
  const b = bucketOf(now);   // always the server's own clock; nothing the browser sends decides whether work is done
  const ms = await membershipState(S, pid);
  if (ms.active) return null;
  if (ms.noshow) return { ...publicBase(ctx, now), phase: 'lobby', noshow: true, hb: b, present: null, needed: spec.players, waitedMs: now - lobby.at, waitMaxMs: spec.waitMaxSeconds * 1000, fallback: now - lobby.at >= spec.waitMaxSeconds * 1000 ? spec.waitFallback : null };
  const entry = Math.max(lobby.at, ms.rejoinAt || 0), hbKey = K.hb(b, ctx.condition, ctx.version, lobby.test, entry, pid);
  let first = false;
  if (!(await getOnce(S.store, hbKey))) { await setNew(S.store, hbKey, { at: now }); first = true; }
  let present = null;
  if (first) {
    await matchAttempt(S, pid, now);
    const m = await findMembership(S, pid);
    if (m) return null;   // matched: the caller reads the membership again
    present = (await S.store.list(K.hbGroup(b - 1, ctx.condition, ctx.version, lobby.test))).length;
  }
  const waited = now - entry, over = waited >= spec.waitMaxSeconds * 1000;
  return { ...publicBase(ctx, now), phase: 'lobby', hb: b, first, present, needed: spec.players, waitedMs: waited, waitMaxMs: spec.waitMaxSeconds * 1000, fallback: over ? spec.waitFallback : null };
}

async function readyState(S, ctx, pid, cohort, now) {
  const cid = cohort.id;
  let dec = await getOnce(S.store, K.decision(cid));
  const ready = (await S.store.list(`g/c/${cid}/ready/`)).map(tail);
  if (!dec) {
    const all = cohort.members.every(m => ready.includes(m.pid)), deadline = cohort.createdAt + ctx.spec.readySeconds * 1000;
    if (all) dec = (await writeOnce(S.store, K.decision(cid), { go: true, at: now }, { verify: true })).value;
    else if (now > deadline) dec = (await writeOnce(S.store, K.decision(cid), { go: false, ready, at: now }, { verify: true })).value;
  }
  if (dec) return { dec };
  const me = cohort.members.find(m => m.pid === pid);
  return { state: { ...publicBase(ctx, now), phase: 'ready', cid, role: me.role, roleLabel: R.roleLabel(ctx.spec, me.role), ready: ready.length, size: cohort.members.length, iAmReady: ready.includes(pid), deadlineAt: cohort.createdAt + ctx.spec.readySeconds * 1000, groupSize: ctx.spec.players } };
}

function notices(adv, members) { return adv.dropped.size && members.some(m => adv.dropped.has(m.pid)) ? ['left'] : []; }

export async function livePoll(S, ctx, pid, body, now) {
  const { spec, params } = ctx;
  const total = spec.practiceRounds + spec.rounds;
  let mem = await findMembership(S, pid);
  if (!mem) { const lob = await lobbyState(S, ctx, pid, body, now); if (lob) return lob; mem = await findMembership(S, pid); }
  if (!mem) return { ...publicBase(ctx, now), phase: 'lobby', hb: bucketOf(now), present: null, needed: spec.players, waitedMs: 0, waitMaxMs: spec.waitMaxSeconds * 1000, fallback: null };
  const cohort = await getOnce(S.store, K.cohort(mem.cid));
  if (!cohort) return { ...publicBase(ctx, now), phase: 'lobby', hb: bucketOf(now), present: null, needed: spec.players, waitedMs: 0, waitMaxMs: spec.waitMaxSeconds * 1000, fallback: null };
  if (cohort.ver !== ctx.version) return { error: 'content_changed', status: 409 };
  if (!mem.decision) {
    const rs = await readyState(S, ctx, pid, cohort, now);
    if (rs.state) return rs.state;
    if (rs.dec.go === false) return { ...publicBase(ctx, now), phase: 'lobby', hb: null, present: null, needed: spec.players, waitedMs: 0, waitMaxMs: spec.waitMaxSeconds * 1000, fallback: null, returned: true };
  }
  const r = Number(body.round);
  if (!Number.isInteger(r) || r < 0 || r >= total) return { error: 'bad_round', status: 400 };
  const me = cohort.members.find(m => m.pid === pid);
  const done = await getOnce(S.store, K.rec(pid, r));
  const base = { ...publicBase(ctx, now), cid: cohort.id, round: r, ...roundInfo(spec, r), role: me.role, roleLabel: R.roleLabel(spec, me.role), last: r === total - 1 };
  if (done) {
    if (r === total - 1) await ensurePay(S, ctx, pid, now);   // repairs a pay record lost if a server stopped between the two writes
    const dropped = (await S.store.list(K.droppedPrefix(cohort.id))).map(tail).includes(pid);
    return { ...base, phase: 'feedback', record: feedbackView(spec, ctx.g.feedback, done), dropped, history: body.needHistory ? await historyOf(S, ctx, r) : undefined };
  }
  if (r > 0 && !(await getOnce(S.store, K.rec(pid, r - 1)))) return { ...base, phase: 'sync', round: r - 1 };
  const grp = R.groupOf(cohort, r, pid), steps = R.stepsOf(spec);
  const adv = await advanceGroup(S, ctx, cohort, r, grp.index, grp.members, now, { viewer: pid });
  if (adv.complete) {
    await finishRound(S, ctx, cohort, r, grp.index, grp.members, now);
    if (r === total - 1) await ensurePay(S, ctx, pid, now);
    const rec = await getOnce(S.store, K.rec(pid, r));
    return { ...base, phase: 'feedback', record: feedbackView(spec, ctx.g.feedback, rec), dropped: adv.dropped.has(pid), history: body.needHistory ? await historyOf(S, ctx, r) : undefined, notices: notices(adv, grp.members) };
  }
  const cur = adv.steps[adv.steps.length - 1], nt = notices(adv, grp.members), roleOf = pid_ => R.roleLabel(spec, grp.members.find(m => m.pid === pid_).role);
  if (adv.dropped.has(pid)) return { ...base, phase: 'wait', reason: 'dropped', notices: nt };
  if (adv.blocked) {
    const arrived = adv.arrivals ? grp.members.filter(m => adv.arrivals.has(m.pid) || adv.dropped.has(m.pid)).length : grp.members.length;
    return { ...base, phase: 'wait', reason: adv.blocked, arrived, of: grp.members.length, notices: nt };
  }
  const iMove = cur.movers.some(m => m.pid === pid), iMoved = cur.moved.includes(pid);
  if (iMove && !iMoved) {
    const { raw } = await readMoves(S, cohort.id, r, grp.members, spec, steps, cur.s), { seen, who } = seenFrom(spec, steps, grp.members, raw, cur.s);
    let entries;
    try { entries = R.stepPrompt(spec, params, me.role, steps[cur.s], r, seen); } catch (e) { return { error: 'bad_rules', status: 500, message: e.message }; }
    const shown = [];
    for (const e of entries) { const st = spec.stages.find(x => x.id === e.stage); for (const id of st.show || []) if (id in seen) shown.push({ id, by: who[id], value: seen[id] }); }
    return { ...base, phase: 'play', step: cur.s, steps: steps.length, entries, shown, deadlineAt: cur.deadline, moved: cur.moved.length, of: cur.movers.length, notices: nt };
  }
  return { ...base, phase: 'wait', reason: iMove ? 'others' : 'turn', step: cur.s, moved: cur.moved.length, of: cur.movers.length, deadlineAt: cur.deadline,
    waitingFor: [...new Set(cur.missing.map(roleOf))], notices: nt };
}

// ---------- routes the participant calls ----------
export async function confirmReady(S, ctx, pid, body, now) {
  const mem = await findMembership(S, pid);
  if (!mem || mem.cid !== String(body.cid)) return { error: 'no_group', status: 409 };
  const cohort = await getOnce(S.store, K.cohort(mem.cid));
  if (!cohort || !cohort.members.some(m => m.pid === pid)) return { error: 'no_group', status: 409 };
  await writeOnce(S.store, K.ready(cohort.id, pid), { at: now });
  return { ok: true };
}

export async function submitMove(S, ctx, pid, body, now) {
  const { spec, params } = ctx, total = spec.practiceRounds + spec.rounds;
  const mem = await findMembership(S, pid);
  if (!mem || !mem.decision || mem.decision.go !== true || mem.cid !== String(body.cid)) return { error: 'no_group', status: 409 };
  const cohort = await getOnce(S.store, K.cohort(mem.cid)), r = Number(body.round), s = Number(body.step);
  if (!cohort || !Number.isInteger(r) || r < 0 || r >= total || !Number.isInteger(s) || s < 0) return { error: 'bad_move', status: 400 };
  const steps = R.stepsOf(spec);
  if (s >= steps.length) return { error: 'bad_move', status: 400 };
  const me = cohort.members.find(m => m.pid === pid);
  if (!me) return { error: 'no_group', status: 409 };
  if (!R.actorsOf(spec, steps[s]).has(me.role)) return { error: 'not_your_turn', status: 409 };
  const existing = await getOnce(S.store, K.move(cohort.id, r, s, pid));
  if (existing) return { ok: true, repeat: true, late: !!existing.auto };   // the first move wins; a later human move after an automatic one is only acknowledged
  if (await getOnce(S.store, K.rec(pid, r))) return { error: 'round_over', status: 409 };
  if (r > 0 && !(await getOnce(S.store, K.rec(pid, r - 1)))) return { error: 'not_yet', status: 409 };
  const grp = R.groupOf(cohort, r, pid);
  const start = await getOnce(S.store, K.start(cohort.id, r, s, grp.index));
  if (!start) return { error: 'not_yet', status: 409 };
  if (now > start.at + spec.decisionSeconds * 1000 + GRACE_MS) return { error: 'late', status: 409 };
  const { raw } = await readMoves(S, cohort.id, r, grp.members, spec, steps, s), { seen } = seenFrom(spec, steps, grp.members, raw, s);
  const v = R.validateStepValues(spec, params, me.role, steps[s], r, seen, body.values);
  if (v.error) return { error: 'bad_values', status: 400, message: v.error };
  const num = (x, hi) => { x = Number(x); return Number.isFinite(x) ? Math.min(hi, Math.max(0, Math.round(x))) : null; };
  const w = await writeOnce(S.store, K.move(cohort.id, r, s, pid), { values: v.values, auto: false, at: now, rtMs: num(body.rtMs, 864e5), hiddenMs: num(body.hiddenMs, 864e5), drawnHidden: body.drawnHidden === true, ...(R.stepFellBack(spec, params, me.role, steps[s], r, seen) ? { limitFallback: true } : {}) }, { verify: true });
  return { ok: true, repeat: !w.created, late: !w.created && !!w.value.auto };
}

// The engine's trial route for a live round: the round record is written by the server when the round is over, so
// this only confirms that it exists (and finishes the round if this request is the first to notice).
export async function confirmRound(S, ctx, pid, index, now) {
  if (await getOnce(S.store, K.rec(pid, index))) { if (index === ctx.spec.practiceRounds + ctx.spec.rounds - 1) await ensurePay(S, ctx, pid, now); return { ok: true, repeat: true }; }
  const mem = await findMembership(S, pid);
  if (!mem || !mem.decision || mem.decision.go !== true) return { error: 'round_not_complete', status: 409 };
  const cohort = await getOnce(S.store, K.cohort(mem.cid)), grp = R.groupOf(cohort, index, pid);
  if (!grp) return { error: 'round_not_complete', status: 409 };
  const adv = await advanceGroup(S, ctx, cohort, index, grp.index, grp.members, now, {});
  if (!adv.complete) return { error: 'round_not_complete', status: 409 };
  await finishRound(S, ctx, cohort, index, grp.index, grp.members, now);
  if (index === ctx.spec.practiceRounds + ctx.spec.rounds - 1) await ensurePay(S, ctx, pid, now);
  return { ok: true };
}

// Admin: close a cohort that has stalled. Every missing move is written (flagged admin) and every round recorded.
export async function closeCohort(S, cid, now, by) {
  const cohort = await getOnce(S.store, K.cohort(cid));
  if (!cohort) return { error: 'not_found', status: 404 };
  await writeOnce(S.store, K.closed(cid), { at: now, by });
  let dec = await getOnce(S.store, K.decision(cid));
  if (!dec) dec = (await writeOnce(S.store, K.decision(cid), { go: false, closed: true, at: now })).value;
  if (dec.go === false) return { ok: true, abandoned: true, rounds: 0 };
  const ctx = await loadCtx(S, cohort.members[0].pid);
  if (ctx.error) return ctx;
  let rounds = 0;
  for (let r = 0; r < cohort.rounds; r++) {
    for (const [j, members] of R.groupsForRound(cohort, r).entries()) {
      const adv = await advanceGroup(S, ctx, cohort, r, j, members, now, { force: true });
      if (adv.complete) { const had = await S.store.get(K.rec(members[0].pid, r)); await finishRound(S, ctx, cohort, r, j, members, now); if (!had) rounds++; }
    }
  }
  return { ok: true, rounds };
}
