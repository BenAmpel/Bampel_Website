// CCAIR Behavioral Lab, economic games: the live self-test.
// A game needs several participants at once, so this test runs a whole simulated session against the study's real
// store: a group (or cohort) of simulated participants polling concurrently through the same code as real ones, one
// of whom stops responding, and, when the design allows asynchronous play, a batch of participants who decide alone
// and are matched with stored decisions (some pending until others finish). Time is simulated, starting a year
// ahead, so no real waiting is needed and nothing collides with real participants' waiting rooms. All simulated
// participants are test participants (separate lobby and pools). Everything is deleted at the end.
// Resumable like the engine's self-test: each call works for about budgetMs and returns { done: false } until finished.
import * as E from '../engine.mjs';
import { getContent } from '../content.mjs';
import { setNew } from '../store.mjs';
import { seeded } from '../engine.mjs';
import * as R from './rules.mjs';
import { K, SESSION, GRACE_MS, getOnce, forget, bucketOf, tail, seedId } from './shared.mjs';
import { findMembership } from './live.mjs';
import { asyncOutcome, resolvePending, dependsOnOthers } from './async.mjs';
import { SimClient } from './sim.mjs';
import { exportTrials, groupRows, paymentRowFor, paymentsCsv } from './export.mjs';
import { drawPaidRound, groupsPerCohort } from './rules.mjs';

const MAX_PARTICIPANTS = 24;

export async function runSelfTest(S, { condition, code, keep = false, budgetMs = 3000 } = {}) {
  const t0 = Date.now(), store = S.store, c = await getContent(store, S.type), spec = R.gameOf(c);
  let st;
  if (!code) {
    const conds = S.type.conditionsOf(c);
    if (!conds.includes(condition)) return { error: 'bad_condition', status: 400 };
    const id = 'GT-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    st = { id, condition, keep, stage: 'probe', checks: [], startedAt: t0, contentVersion: c.version || 0, base: bucketOf(Date.now() + 400 * 86400000) - 20, now: (bucketOf(Date.now() + 400 * 86400000)) * R.SLOT_MS,
      live: null, async: null, codes: [], cohorts: [] };
  } else {
    st = await store.get(`selftest/${code}`);
    if (!st) return { error: 'not_found', status: 404 };
  }
  const ok = (pass, what) => { st.checks.push({ pass: !!pass, what }); return !!pass; };
  const save = () => store.set(`selftest/${st.id}`, st);
  const progress = () => ({ done: false, code: st.id, condition: st.condition, session: 1, sessions: 1, passed: st.checks.filter(x => x.pass).length, failed: st.checks.filter(x => !x.pass).length });
  const rand = seeded(`selftest|${st.id}`);
  const rounds = spec.practiceRounds + spec.rounds, steps = R.stepsOf(spec);
  const live = spec.mode === 'live', wantAsync = spec.mode === 'async' || spec.waitFallback === 'async';
  const mk = async role => {
    const p = await E.createTestParticipant(S, st.condition);
    st.codes.push(p.code);
    await E.consent(S, p.code, true);
    const plan = await E.startSession(S, p.code, st.now);
    if (plan.error) throw new Error('Session did not open: ' + plan.error);
    return p.code;
  };
  const client = (cl, pidx) => new SimClient(cl.code, { rand, call: (route, body) => S.type.routes[route](S, cl.code, body, st.now), save: (round, values) => E.saveTrial(S, cl.code, SESSION, round, values ? { values, rtMs: 700 } : {}, st.now), maxRound: rounds });
  const hydrate = cl => Object.assign(client(cl), { round: cl.round, hb: cl.hb, stopped: cl.stopped, finished: cl.finished, moves: cl.moves || 0, last: cl.last || null });
  const dehydrate = (sc, cl) => ({ code: cl.code, round: sc.round, hb: sc.hb, stopped: sc.stopped, finished: sc.finished, moves: sc.moves, last: sc.last && { phase: sc.last.phase, deadlineAt: sc.last.deadlineAt, reason: sc.last.reason } });
  try {
    if (st.contentVersion !== (c.version || 0)) { ok(false, 'Study content changed during the self-test; run it again'); st.stage = 'cleanup'; }

    if (st.stage === 'probe') {
      // The race-safety assumptions: write-once under concurrent writers, and a new key visible to a list at once.
      const key = `selftest/race-${st.id}`, wins = (await Promise.all(Array.from({ length: 12 }, (_, i) => setNew(store, key, { by: i })))).filter(Boolean).length;
      ok(wins === 1, `Concurrent write-once: exactly one of 12 simultaneous writers wins (got ${wins})`);
      const k2 = `selftest/vis-${st.id}-${Date.now()}`; await store.set(k2, { v: 1 });
      ok((await store.list(`selftest/vis-${st.id}`)).includes(k2), 'A key written a moment ago is listed immediately');
      await store.delete(k2); await store.delete(key);
      const pub = JSON.stringify(S.type.publicPlanExtras({ game: { spec, params: R.paramsFor(c, st.condition), feedback: c.feedback, payment: c.payment, instructions: c.instructions, comprehension: c.comprehension } }));
      ok(!/"answer"|"payoff"|"tolerance"/.test(pub), 'Payoff formulas and comprehension answers are not sent to the browser');
      st.stage = live ? 'live-setup' : wantAsync ? 'async-setup' : 'cleanup';
    }

    if (st.stage === 'live-setup') {
      const C = spec.players * groupsPerCohort(spec);
      if (C > MAX_PARTICIPANTS) { ok(true, `Live group test skipped: a cohort of ${C} is larger than the self-test runs (${MAX_PARTICIPANTS}). Pilot it with test codes in several tabs.`); st.stage = wantAsync ? 'async-setup' : 'cleanup'; }
      else {
        const codes = []; for (let i = 0; i < C; i++) codes.push(await mk());
        const stopRound = rounds >= 3 ? 1 : null;
        st.live = { clients: codes.map(cc => ({ code: cc, round: 0, hb: null, stopped: false, finished: false, moves: 0 })), stopIdx: stopRound == null ? -1 : C - 1, stopRound, iter: 0, slots: [] };
        ok(true, `Live: ${C} simulated participants created (${spec.players} per group, ${groupsPerCohort(spec)} group${groupsPerCohort(spec) === 1 ? '' : 's'} per cohort)`);
        st.stage = 'live-run';
      }
    }

    while (st.stage === 'live-run') {
      if (Date.now() - t0 > budgetMs) { await save(); return progress(); }
      const L = st.live, scs = L.clients.map(hydrate);
      const states = await Promise.all(scs.map(sc => sc.tick(st.now)));
      scs.forEach((sc, i) => { if (i === L.stopIdx && !sc.stopped && sc.round >= L.stopRound) sc.stop(); L.clients[i] = dehydrate(sc, L.clients[i]); });
      L.iter++;
      const active = L.clients.filter(x => !x.stopped && !x.finished);
      if (!active.length || L.iter > 6000) { if (L.iter > 6000) ok(false, 'Live: the simulated session did not finish'); st.stage = 'live-verify'; break; }
      // Advance simulated time: a little while people are acting, a jump while everyone is waiting on a clock.
      let jump = 1000;
      const waiting = active.filter(x => x.last && ['lobby', 'wait'].includes(x.last.phase));
      if (waiting.length === active.length) {
        const dls = active.map(x => (x.last.deadlineAt ? x.last.deadlineAt - st.now + GRACE_MS + 1 : null)).filter(x => x != null && x > 0);
        if (active.every(x => x.last.phase === 'lobby')) jump = R.SLOT_MS;
        else if (dls.length) jump = Math.max(1000, Math.min(...dls));
        else if (active.some(x => x.last.reason === 'arrivals' || x.last.reason === 'previous')) jump = Math.max(1000, spec.feedbackSeconds * 1000);
      }
      st.now += jump;
    }

    if (st.stage === 'live-verify') {
      await verifyLive(S, c, spec, st, ok);
      st.stage = wantAsync ? 'async-setup' : 'cleanup';
      await save(); if (Date.now() - t0 > budgetMs) return progress();
    }

    if (st.stage === 'async-setup') {
      const n = Math.min(MAX_PARTICIPANTS, Math.max(2, spec.players * 2)), codes = [];
      for (let i = 0; i < n; i++) codes.push(await mk());
      const A = st.async = { clients: codes.map(cc => ({ code: cc, round: 0, hb: null, stopped: false, finished: false, moves: 0 })), cur: 0, iter: 0, order: codes, firstPending: null };
      if (spec.mode === 'live') {
        // As in the waiting room: let the maximum wait pass, then take the asynchronous fallback.
        for (const cc of codes) {
          await S.type.routes['game/poll'](S, cc, {}, st.now);
          const r = await S.type.routes['game/fallback'](S, cc, { to: 'async' }, st.now + spec.waitMaxSeconds * 1000 + 1000);
          ok(r.ok && r.to === 'async', `Fallback: ${cc.slice(-4)} switched to asynchronous play after the maximum wait`);
        }
        st.now += spec.waitMaxSeconds * 1000 + 2000;
      }
      ok(true, `Asynchronous: ${n} simulated participants created`);
      st.stage = 'async-run';
    }

    while (st.stage === 'async-run') {
      if (Date.now() - t0 > budgetMs) { await save(); return progress(); }
      const A = st.async;
      if (A.cur >= A.clients.length) { st.stage = 'async-verify'; break; }
      const sc = hydrate(A.clients[A.cur]);
      await sc.tick(st.now);
      A.clients[A.cur] = dehydrate(sc, A.clients[A.cur]);
      A.iter++;
      if (sc.finished) {
        if (A.cur === 0) A.firstPending = !!(await store.get(K.apend(sc.pid)));
        A.cur++;
      } else if (A.iter > 20000) { ok(false, 'Asynchronous: a participant did not finish'); st.stage = 'async-verify'; }
    }

    if (st.stage === 'async-verify') {
      await verifyAsync(S, c, spec, st, ok);
      st.stage = 'cleanup';
    }
  } catch (e) { ok(false, 'Unexpected error: ' + (e && e.stack || e)); st.stage = 'cleanup'; }

  // cleanup
  if (st.stage === 'cleanup' || st.stage === 'done') {
    if (!st.keep) await cleanup(S, st, ok);
    await store.delete(`selftest/${st.id}`);
    forget(store);
    return { done: true, condition: st.condition, code: st.keep ? st.codes[0] || null : null, kept: st.keep, passed: st.checks.filter(x => x.pass).length, failed: st.checks.filter(x => !x.pass).length, checks: st.checks, ms: Date.now() - st.startedAt, contentVersion: st.contentVersion };
  }
  await save();
  return progress();
}

async function cleanup(S, st, ok) {
  const store = S.store, tests = [];
  for (const cc of st.codes) { const m = await findMembership(S, cc).catch(() => null); if (m) tests.push(m.cid); }
  const cids = new Set(tests);
  for (const cc of st.codes) for (let n = 0; n < 5; n++) { const m = await store.get(K.member(cc, n)); if (m) cids.add(m.cid); else break; }
  for (const cid of cids) { const coh = await store.get(K.cohort(cid)); if (coh && coh.test) for (const k of await store.list(`g/c/${cid}/`)) await store.delete(k); }
  let removed = 0;
  for (const cc of st.codes) { const d = await E.deleteParticipant(S, cc); if (d.ok) removed++; }
  for (const pre of ['g/slot/', 'g/slotdone/', 'g/claim/']) for (const k of await store.list(pre)) if (Number(tail(k)) >= st.base) await store.delete(k);
  const left = (await store.list('g/')).filter(k => st.codes.some(cc => k.includes(cc)) || [...cids].some(cid => k.includes(`/${cid}/`)));
  ok(removed === st.codes.length && !left.length, `Test participants deleted (${removed}) and no game records left behind (${left.length})`);
}

// ---------- live checks ----------
async function verifyLive(S, c, spec, st, ok) {
  const store = S.store, codes = st.live.clients.map(x => x.code), steps = R.stepsOf(spec), total = spec.practiceRounds + spec.rounds, G = groupsPerCohort(spec), C = spec.players * G;
  const params = R.paramsFor(c, st.condition), seen = new Map(), cohorts = new Map();
  // each participant is in exactly one cohort
  let multi = 0, none = 0;
  for (const cc of codes) {
    const keys = await store.list(`g/p/${cc}/member/`), mem = await findMembership(S, cc);
    if (keys.length !== 1) multi++;
    if (!mem) { none++; continue; }
    seen.set(cc, mem.cid);
    if (!cohorts.has(mem.cid)) cohorts.set(mem.cid, await store.get(K.cohort(mem.cid)));
  }
  ok(!none && !multi, `Live: every participant is in exactly one group (${codes.length} of ${codes.length})`);
  const inCohorts = [...cohorts.values()].flatMap(co => co.members.map(m => m.pid));
  ok(inCohorts.length === new Set(inCohorts).size && inCohorts.length === codes.length, 'Live: no participant appears in two cohorts, and none is missing');
  ok([...cohorts.values()].every(co => co.members.length === C), `Live: cohorts have the planned size (${C})`);
  ok([...cohorts.values()].every(co => R.groupsForRound(co, 0).every(g => g.map(m => m.role).sort().join() === R.slotRoles(spec).sort().join())), 'Live: every group has the planned roles');
  const slotsOk = [...cohorts.values()].every(co => co.slot >= st.base);
  ok(slotsOk, 'Live: groups were formed in the simulated slots');
  // concurrent matchers (the same slot attempted by every participant) change nothing
  const before = (await store.list('g/slot/')).length;
  await Promise.all(codes.map(cc => S.type.routes['game/poll'](S, cc, { round: 0 }, st.now)));
  ok((await store.list('g/slot/')).length === before, 'Live: running the matcher again changes no group');
  // moves complete, records written, payoffs equal the formula
  let complete = true, formula = true, autos = 0, missingRec = 0, strangerOk = true;
  const stopCode = st.live.stopIdx >= 0 ? codes[st.live.stopIdx] : null;
  for (const co of cohorts.values()) for (let r = 0; r < total; r++) {
    const groups = R.groupsForRound(co, r);
    if (new Set(groups.flat().map(m => m.pid)).size !== co.members.length) strangerOk = false;
    for (const [j, members] of groups.entries()) {
      const raw = {};
      for (const m of members) raw[m.pid] = {};
      for (let s = 0; s < steps.length; s++) for (const m of members.filter(x => R.actorsOf(spec, steps[s]).has(x.role))) {
        const mv = await store.get(K.move(co.id, r, s, m.pid));
        if (!mv) { complete = false; continue; }
        Object.assign(raw[m.pid], mv.values); if (mv.auto) autos++;
      }
      let res = null; try { res = R.resolveGroup(spec, params, r, members, raw); } catch { complete = false; }
      for (const m of members) {
        const rec = await store.get(K.rec(m.pid, r));
        if (!rec) { missingRec++; continue; }
        if (!res || Math.abs(rec.data.payoff - res.payoffs[m.pid]) > 1e-9) formula = false;
      }
    }
  }
  ok(strangerOk, 'Live: in every round each participant is in exactly one group');
  ok(complete, 'Live: every required move exists for every round');
  ok(!missingRec, `Live: a round record exists for every participant and round (${codes.length * total})`);
  ok(formula, 'Live: every stored payoff equals the payoff formula applied to the stored moves');
  if (stopCode) {
    const co = cohorts.get(seen.get(stopCode)), role = co.members.find(m => m.pid === stopCode).role, acts = steps.some(s => R.actorsOf(spec, s).has(role)), after = total - 1 - st.live.stopRound;
    if (acts) {
      ok(autos > 0, `Live: the participant who stopped was played automatically (${autos} automatic moves)`);
      if (spec.dropAfterTimeouts > 0 && after >= spec.dropAfterTimeouts) ok(!!(await store.get(K.dropped(co.id, stopCode))), `Live: after ${spec.dropAfterTimeouts} timeouts in a row the participant counts as having left`);
    } else ok(autos === 0, 'Live: the participant who stopped has no decisions to make in this game, so nothing had to be played for them');
  }
  const payDraws = await Promise.all(codes.map(cc => store.get(K.pay(cc))));
  ok(payDraws.every((p, i) => p && p.round === drawPaidRound(codes[i], seedId(S), spec.rounds)), 'Live: the paid round was drawn once per participant and repeats the seeded draw');
  // exports
  const people = Object.fromEntries((await Promise.all(codes.map(cc => store.get(`participants/${cc}`)))).map(p => [p.code, p]));
  const recs = []; for (const cc of codes) for (let r = 0; r < total; r++) { const x = await store.get(K.rec(cc, r)); if (x) recs.push(x); }
  const rows = await exportTrials(S, recs, people, codes);
  ok(rows.length === codes.length * total * spec.stages.length, `Live: the trials export has one row per participant, round, and stage (${rows.length})`);
  const keys = new Set(rows.map(x => `${x.code}|${x.trial_index}|${x.stage}`));
  ok(keys.size === rows.length, 'Live: no duplicate export rows');
  const gr = await groupRows(S, { offset: 0, limit: 50 });
  ok(gr.rows.length >= cohorts.size, 'Live: the groups export lists the groups');
  const pays = await Promise.all(codes.map(cc => paymentRowFor(S, people[cc])));
  ok(pays.every(Boolean) && !/@/.test(paymentsCsv(pays.filter(Boolean))), 'Live: payments are computed and contain no email addresses');
  ok(pays.filter((p, i) => codes[i] !== stopCode).every(p => p.completed === 'yes' || p.completed === 'partial'), 'Live: payments report completion');
}

// ---------- asynchronous checks ----------
async function verifyAsync(S, c, spec, st, ok) {
  const store = S.store, A = st.async, codes = A.clients.map(x => x.code), params = R.paramsFor(c, st.condition);
  ok(A.clients.every(x => x.finished), 'Asynchronous: every simulated participant finished all rounds');
  const firstRole = (await store.get(K.role(codes[0]))).role;
  if (dependsOnOthers(spec, firstRole)) ok(A.firstPending === true, 'Asynchronous: the first participant had no partners yet and was pending');
  else ok(A.firstPending === false, 'Asynchronous: the first participant\'s payoff depends on nobody else, so they were matched at once');
  const res = await resolvePending(S, st.now);
  ok((await store.list('g/apend/')).filter(k => codes.some(cc => k.endsWith(cc))).length === 0, `Asynchronous: "resolve pending matches" left nobody pending (${res.resolved} matched)`);
  // every participant is matched or has no partners to find, and the match is consistent
  let allMatched = true, partnerOk = true, copyOk = true, formula = true, notSelf = true;
  const roleCount = {};
  for (const cc of codes) {
    const role = (await store.get(K.role(cc))).role; roleCount[role] = (roleCount[role] || 0) + 1;
    const m = await store.get(K.amatch(cc));
    if (!m) { allMatched = false; continue; }
    const mine = []; for (let r = 0; r < spec.practiceRounds + spec.rounds; r++) mine.push(await store.get(K.rec(cc, r)));
    for (const rd of m.rounds || []) {
      const roles = rd.partners.map(p => p.role).sort(), want = spec.roles.flatMap(r => Array(r.count - (r.id === role ? 1 : 0)).fill(r.id)).sort();
      if (roles.join() !== want.join()) partnerOk = false;
      if (rd.partners.some(p => p.pid === cc)) notSelf = false;
      for (const p of rd.partners) {
        const theirs = await store.get(K.rec(p.pid, spec.practiceRounds + rd.round));
        if (!theirs || JSON.stringify(theirs.data.raw) !== JSON.stringify(p.raw)) copyOk = false;
      }
    }
    const oc = await asyncOutcome(S, { pid: cc, spec, params });
    if (!oc) { allMatched = false; continue; }
    for (let rho = 0; rho < spec.rounds; rho++) {
      const partners = m.selfContained ? [] : m.rounds[rho].partners;
      const members = [{ pid: 'me', role }, ...partners.map((p, i) => ({ pid: 'p' + i, role: p.role }))], raw = { me: mine[spec.practiceRounds + rho].data.raw };
      partners.forEach((p, i) => { raw['p' + i] = p.raw; });
      const want = R.resolveGroup(spec, params, spec.practiceRounds + rho, members, raw).payoffs.me;
      if (!oc[rho] || Math.abs(oc[rho].payoff - want) > 1e-9) formula = false;
    }
  }
  ok(allMatched, 'Asynchronous: every participant has a match after the pending matches are resolved');
  ok(partnerOk, 'Asynchronous: each match has partners in exactly the complementary roles');
  ok(notSelf, 'Asynchronous: nobody is matched with themselves');
  ok(copyOk, 'Asynchronous: the decisions copied into each match equal the partners\' stored decisions');
  ok(formula, 'Asynchronous: every payoff equals the formula applied to the participant\'s and partners\' decisions');
  const counts = Object.entries(roleCount).map(([id, n]) => n / spec.roles.find(r => r.id === id).count);
  ok(Math.max(...counts) - Math.min(...counts) <= 1, `Asynchronous: roles are balanced (${Object.entries(roleCount).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  // the engine path ran without error and the exports agree
  const people = Object.fromEntries((await Promise.all(codes.map(cc => store.get(`participants/${cc}`)))).map(p => [p.code, p]));
  const recs = []; for (const cc of codes) for (let r = 0; r < spec.practiceRounds + spec.rounds; r++) { const x = await store.get(K.rec(cc, r)); if (x) recs.push(x); }
  const rows = await exportTrials(S, recs, people, codes);
  ok(rows.length === codes.length * (spec.practiceRounds + spec.rounds) * spec.stages.length, `Asynchronous: the trials export has one row per participant, round, and stage (${rows.length})`);
  const pays = await Promise.all(codes.map(cc => paymentRowFor(S, people[cc])));
  ok(pays.every(p => p && p.match_status === 'matched' && p.points !== ''), 'Asynchronous: payments are computed for every participant');
}
