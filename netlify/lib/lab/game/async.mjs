// CCAIR Behavioral Lab, economic games: asynchronous play.
// Each participant decides alone. Later-mover decisions are stated with the strategy method (a table of responses
// or a threshold), so any stored decision can serve as a partner for anyone who comes later. When a participant has
// answered every round, they are matched with randomly drawn stored decisions of the complementary roles from
// participants who finished earlier in the same condition. The match is one write-once record (g/p/<pid>/amatch)
// holding the partners' IDs and a copy of the decisions used. Participants for whom no partners exist yet are
// "pending" (g/apend/<pid>) and are matched later by the admin action "resolve pending matches", which the payments
// export also runs first.
import { seeded, shuffle } from '../engine.mjs';
import { setNew } from '../store.mjs';
import { parse, identifiers } from './expr.mjs';
import * as R from './rules.mjs';
import { K, SESSION, getOnce, writeOnce, loadCtx, roundInfo, writeUnplayed } from './shared.mjs';

export const ALL_STAGES = spec => ({ index: -1, stages: spec.stages.map((_, i) => i) });

export async function effectiveMode(S, ctx) {
  if (ctx.spec.mode === 'async') return 'async';
  const fb = await getOnce(S.store, K.fallback(ctx.pid));
  return fb && fb.to === 'async' ? 'async' : 'live';
}

// Role by minimization (the role with the fewest participants per place so far), counted from write-once markers.
export async function assignRole(S, ctx, now) {
  const { pid, spec } = ctx;
  const cur = await getOnce(S.store, K.role(pid));
  if (cur) return cur;
  const counts = await Promise.all(spec.roles.map(async r => (await S.store.list(`g/arole/${ctx.condition}/${r.id}/`)).length / r.count));
  const min = Math.min(...counts), options = spec.roles.filter((_, i) => counts[i] === min);
  const pick = options[Math.floor(seeded(`${pid}|${ctx.studyId}|role`)() * options.length)].id;
  await writeOnce(S.store, `g/arole/${ctx.condition}/${pick}/${pid}`, { at: now });
  return (await writeOnce(S.store, K.role(pid), { role: pick, at: now })).value;
}

export async function asyncState(S, ctx, pid, body, now) {
  const { spec, params } = ctx, total = spec.practiceRounds + spec.rounds;
  const role = (await assignRole(S, ctx, now)).role, r = Number(body.round);
  const base = { serverNow: now, mode: 'async', rounds: spec.rounds, practiceRounds: spec.practiceRounds, role, roleLabel: R.roleLabel(spec, role) };
  if (!Number.isInteger(r) || r < 0 || r >= total) return { error: 'bad_round', status: 400 };
  if (await getOnce(S.store, K.rec(pid, r))) return { ...base, phase: 'saved', round: r, ...roundInfo(spec, r), last: r === total - 1 };
  let entries;
  try { entries = R.stepPrompt(spec, params, role, ALL_STAGES(spec), r, {}); } catch (e) { return { error: 'bad_rules', status: 500, message: e.message }; }
  return { ...base, phase: 'async', round: r, ...roundInfo(spec, r), entries, passive: !entries.length, last: r === total - 1 };
}

// The engine's trial route for an asynchronous round: validate against the rules snapshot, store the decisions.
export async function asyncSave(S, ctx, pid, index, data, now) {
  const { spec, params } = ctx, total = spec.practiceRounds + spec.rounds;
  const roleRec = await getOnce(S.store, K.role(pid));
  if (!roleRec) return { error: 'no_role', status: 409 };
  const role = roleRec.role;
  if (spec.comprehension && spec.comprehension.enabled === true) { /* the gate is applied in poll; a saved round implies it passed */ }
  const v = R.validateStepValues(spec, params, role, ALL_STAGES(spec), index, {}, data && data.values);
  if (v.error) return { error: 'bad_values', status: 400, message: v.error };
  const { practice, roundNo } = roundInfo(spec, index), num = x => { x = Number(x); return Number.isFinite(x) ? Math.min(864e5, Math.max(0, Math.round(x))) : null; };
  const steps = R.stepsOf(spec);
  const stages = spec.stages.map((st, si) => {
    const acting = R.stageActs(st, role), values = {}, strat = {};
    if (acting) for (const d of st.decisions) { if (st.strategyMethod) strat[d.id] = v.values[d.id]; else values[d.id] = v.values[d.id]; }
    return { stage: st.id, step: steps.findIndex(x => x.stages.includes(si)), acting, values, strategy: st.strategyMethod && acting ? strat : undefined, auto: false, rtMs: acting ? num(data.rtMs) : null, hiddenMs: acting ? num(data.hiddenMs) : null, others: [] };
  });
  const rec = { code: pid, condition: ctx.condition, session: SESSION, index, role, practice, cohort: null, group: null, contentVersion: ctx.version, receivedAt: now,
    data: { played: true, mode: 'async', role, practice, roundNo, raw: v.values, stages, payoff: null } };
  if (!(await setNew(S.store, K.rec(pid, index), rec))) return { ok: true, repeat: true };
  const have = (await S.store.list(`data/${pid}/s${SESSION}/`)).filter(k => /\/t\d+$/.test(k)).length;
  if (have >= total) await completeAsync(S, ctx, role, now);
  return { ok: true };
}

export async function completeAsync(S, ctx, role, now) {
  const { pid, spec } = ctx;
  await writeOnce(S.store, K.adone(pid), { at: now });
  const person = await S.store.get(`participants/${pid}`);
  await writeOnce(S.store, K.pool(!!(person && person.test), ctx.condition, role, pid), { at: now });
  await setNew(S.store, K.pay(pid), { round: R.drawPaidRound(pid, ctx.studyId, spec.rounds), at: now });
  return matchAsync(S, ctx, now);
}

// ---------- matching against stored decisions ----------
export function dependsOnOthers(spec, roleId) {
  const mine = spec.stages.some(st => R.stageActs(st, roleId) && st.strategyMethod);
  if (mine) return true;
  let ast; try { ast = parse(String(spec.payoff[roleId] || '0')); } catch { return true; }
  for (const id of identifiers(ast)) {
    if (/^others\./.test(id) || /^other\./.test(id)) return true;
    const m = /^role\.([a-z][a-z0-9_]*)\./.exec(id);
    if (m && (m[1] !== roleId || (spec.roles.find(r => r.id === m[1]) || {}).count > 1)) return true;
  }
  return false;
}

export async function matchAsync(S, ctx, now) {
  const { pid, spec } = ctx, total = spec.practiceRounds + spec.rounds;
  const have = await getOnce(S.store, K.amatch(pid));
  if (have) return have;
  const role = (await getOnce(S.store, K.role(pid))).role, person = await S.store.get(`participants/${pid}`), test = !!(person && person.test);
  if (!dependsOnOthers(spec, role)) {
    const m = (await writeOnce(S.store, K.amatch(pid), { at: now, selfContained: true, rounds: [] })).value;
    await S.store.delete(K.apend(pid));
    return m;
  }
  const need = spec.roles.map(r => ({ id: r.id, k: r.count - (r.id === role ? 1 : 0) })).filter(x => x.k > 0);
  const pools = {};
  for (const n of need) {
    const ids = (await S.store.list(K.poolPrefix(test, ctx.condition, n.id))).map(k => k.slice(k.lastIndexOf('/') + 1)).filter(x => x !== pid).sort();
    if (ids.length < n.k) { await setNew(S.store, K.apend(pid), { at: now }); return null; }
    pools[n.id] = ids;
  }
  const rounds = [], used = new Set();
  let fixed = null;
  for (let rho = 0; rho < spec.rounds; rho++) {
    let picks;
    if (spec.matching === 'partners' && fixed) picks = fixed;
    else {
      const rand = seeded(spec.matching === 'partners' ? `${pid}|${ctx.studyId}|amatch` : `${pid}|${ctx.studyId}|amatch|r${rho}`);
      picks = [];
      for (const n of need) {
        let pool = pools[n.id];
        if (spec.matching === 'perfectStrangers') { const fresh = pool.filter(x => !used.has(x)); if (fresh.length >= n.k) pool = fresh; }
        for (const q of shuffle(pool, rand).slice(0, n.k)) { picks.push({ pid: q, role: n.id }); used.add(q); }
      }
      if (spec.matching === 'partners') fixed = picks;
    }
    const partners = [];
    for (const pk of picks) {
      const rec = await S.store.get(K.rec(pk.pid, spec.practiceRounds + rho));
      if (!rec || !rec.data || !rec.data.raw) { await setNew(S.store, K.apend(pid), { at: now }); return null; }
      partners.push({ pid: pk.pid, role: pk.role, raw: rec.data.raw });
    }
    rounds.push({ round: rho, partners });
  }
  const m = (await writeOnce(S.store, K.amatch(pid), { at: now, rounds })).value;
  await S.store.delete(K.apend(pid));
  return m;
}

// Per real round: this participant's concrete decisions, their partners', and the payoff. null until matched.
export async function asyncOutcome(S, ctx) {
  const { pid, spec, params } = ctx, match = await getOnce(S.store, K.amatch(pid));
  if (!match) return null;
  const role = (await getOnce(S.store, K.role(pid))).role, out = [];
  const roleOf = Object.fromEntries(spec.roles.map(r => [r.id, r]));
  for (let rho = 0; rho < spec.rounds; rho++) {
    const mine = await getOnce(S.store, K.rec(pid, spec.practiceRounds + rho));
    if (!mine || !mine.data || !mine.data.raw) { out.push(null); continue; }
    const partners = match.selfContained ? [] : match.rounds[rho].partners;
    const members = [{ pid, role }, ...partners.map((p, i) => ({ pid: `${p.pid}#${i}`, role: p.role }))], raw = { [pid]: mine.data.raw };
    partners.forEach((p, i) => { raw[`${p.pid}#${i}`] = p.raw; });
    try {
      const res = R.resolveGroup(spec, params, spec.practiceRounds + rho, members, raw);
      out.push({ payoff: res.payoffs[pid], concrete: res.concrete[pid], partners: members.slice(1).map(m => ({ role: m.role, values: res.concrete[m.pid] })), groupTotal: Object.values(res.payoffs).reduce((a, b) => a + b, 0), partnerIds: partners.map(p => p.pid) });
    } catch (e) { out.push({ payoff: null, error: e.message }); }
  }
  return out;
}

export async function resolvePending(S, now) {
  const keys = await S.store.list('g/apend/'), result = { pending: keys.length, resolved: 0, stillPending: 0 };
  for (const k of keys) {
    const pid = k.slice(k.lastIndexOf('/') + 1), ctx = await loadCtx(S, pid);
    if (ctx.error || !(await getOnce(S.store, K.adone(pid)))) { await S.store.delete(k); continue; }
    const m = await matchAsync(S, ctx, now);
    if (m) result.resolved++; else result.stillPending++;
  }
  return result;
}
