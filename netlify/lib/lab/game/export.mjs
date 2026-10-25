// CCAIR Behavioral Lab, economic games: exports and operations views.
//   trials CSV    one row per participant x round x stage (the engine's /admin/rows and export.csv call exportTrials)
//   groups CSV    one row per cohort x round x group
//   payments CSV  one row per participant (managers and the owner only; never contains an email address)
//   Prolific CSV  participant_id,amount for Prolific's bulk bonus upload
//   status        who is waiting, which groups are running or stalled, how many asynchronous matches are pending
import { toCsv, FIRST_COLUMNS } from '../engine.mjs';
import { inBatches } from '../store.mjs';
import * as R from './rules.mjs';
import { K, SESSION, tail, getOnce, bucketOf, loadCtx, contentAt } from './shared.mjs';
import { findMembership } from './live.mjs';
import { asyncOutcome, effectiveMode, resolvePending } from './async.mjs';

const iso = ms => (ms ? new Date(ms).toISOString() : '');
const strategyText = s => {
  if (!s) return '';
  const out = [];
  for (const [id, v] of Object.entries(s)) {
    if (v && v.table) out.push(Object.entries(v.table).map(([k, x]) => `${k}:${x}`).join('|'));
    else if (v && typeof v.threshold === 'number') out.push(`>=${v.threshold}`);
  }
  return out.join(';');
};

// Everything about one participant that is not in their round records.
export async function participantExtras(S, pid) {
  const [lobby, fb, pay, adone, plan] = await Promise.all([K.lobby(pid), K.fallback(pid), K.pay(pid), K.adone(pid), K.plan(pid)].map(k => getOnce(S.store, k)));
  // External ID: the embedded-data field prolific_pid (the engine reads it from the address when the session starts). Anything but letters, digits, _ and - is ignored.
  const rawId = plan && plan.embedded && plan.embedded.prolific_pid, ext = typeof rawId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawId) ? { prolificPid: rawId } : null;
  const ctx = plan && plan.game ? await loadCtx(S, pid) : null;
  let cohort = null, droppedAny = false, cids = [];
  for (let n = 0; n < 5; n++) { const m = await getOnce(S.store, K.member(pid, n)); if (!m) break; cids.push(m.cid); }
  for (const cid of cids) { if (await getOnce(S.store, K.dropped(cid, pid))) droppedAny = true; }
  let waitMs = null, matchedAt = null;
  if (ctx && !ctx.error && ctx.spec.mode === 'live') {
    const mem = await findMembership(S, pid);
    if (mem) { cohort = await getOnce(S.store, K.cohort(mem.cid)); if (cohort && lobby) { matchedAt = cohort.createdAt; waitMs = Math.max(0, cohort.createdAt - lobby.at); } }
    else if (fb && lobby) waitMs = Math.max(0, fb.at - lobby.at);
  }
  const mode = !ctx || ctx.error ? '' : (await effectiveMode(S, ctx));
  return { ctx: ctx && !ctx.error ? ctx : null, lobby, fallback: fb, ext, pay, adone, cohort, dropped: droppedAny, waitMs, matchedAt, mode };
}

export async function exportTrials(S, records, byCode, codes) {
  const pids = [...new Set(records.map(r => r.code))];
  const extras = new Map(await inBatches(pids, 4, async pid => [pid, await participantExtras(S, pid)]));
  const outcomes = new Map();
  for (const pid of pids) { const x = extras.get(pid); if (x.ctx && x.mode === 'async') outcomes.set(pid, await asyncOutcome(S, x.ctx)); }
  const rows = [];
  for (const rec of records.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.index - b.index))) {
    const p = byCode[rec.code] || {}, x = extras.get(rec.code), spec = x.ctx && x.ctx.spec, d = rec.data || {};
    const base = { code: rec.code, condition: rec.condition, test: p.test ? 1 : 0, label: p.label || '', self_signup: p.selfSignup ? 1 : 0, session: rec.session, trial_index: rec.index,
      round: d.roundNo ?? '', practice: d.practice ? 1 : 0, mode: d.played ? d.mode : (x.mode || ''), played: d.played ? 1 : 0, not_played_reason: d.played ? '' : d.reason || '',
      role: rec.role || '', cohort: rec.cohort || '', group: rec.group ?? '', group_id: rec.cohort ? `${rec.cohort}.r${rec.index}.g${rec.group}` : '', group_size: d.groupSize ?? (spec ? spec.players : '') };
    const tail_ = { wait_ms: x.waitMs ?? '', dropped: x.dropped ? 1 : 0, fallback: x.fallback ? x.fallback.to : '', external_id: x.ext ? x.ext.prolificPid : '',
      received_at: iso(rec.receivedAt), content_version: rec.contentVersion ?? 0 };
    if (!spec) { rows.push({ ...base, stage: '', ...tail_ }); continue; }
    if (!d.played) { rows.push({ ...base, stage: '', step: '', acting: '', auto: '', payoff: '', ...tail_ }); continue; }
    const out = outcomes.get(rec.code);
    const rho = rec.index - spec.practiceRounds, oc = out && rho >= 0 ? out[rho] : null;
    const payoff = d.mode === 'async' ? (oc ? oc.payoff : null) : d.payoff;
    const gtotal = d.mode === 'async' ? (oc ? oc.groupTotal : null) : d.groupTotal;
    for (let si = 0; si < spec.stages.length; si++) {
      const st = spec.stages[si], sr = d.stages[si] || {}, row = { ...base, stage: st.id, step: sr.step, acting: sr.acting ? 1 : 0 };
      for (const dec of spec.stages.flatMap(s => s.decisions)) {
        const mine = sr.acting && dec.id in (sr.values || {}) ? sr.values[dec.id] : (sr.acting && st.strategyMethod && oc && oc.concrete && st.decisions.some(q => q.id === dec.id) ? oc.concrete[dec.id] : '');
        row['d_' + dec.id] = mine ?? '';
      }
      row.strategy = strategyText(sr.strategy);
      for (const dec of spec.stages.flatMap(s => s.decisions)) {
        // what the others decided in this round (all stages), in group order
        let others = [];
        if (d.mode === 'async') others = oc && oc.partners ? oc.partners.filter(pt => dec.id in pt.values).map(pt => pt.values[dec.id]) : [];
        else for (const s2 of d.stages) for (const o of s2.others || []) if (o.values && dec.id in o.values) others.push(o.values[dec.id]);
        row['o_' + dec.id] = others.join('|');
      }
      row.auto = sr.acting ? (sr.auto ? 1 : 0) : ''; row.auto_why = sr.auto ? sr.why || '' : '';
      row.limit_fallback = sr.limitFallback ? 1 : 0; row.rt_ms = sr.rtMs ?? ''; row.hidden_ms = sr.hiddenMs ?? ''; row.drawn_hidden = sr.drawnHidden == null ? '' : sr.drawnHidden ? 1 : 0;
      row.payoff = payoff ?? ''; row.group_total = gtotal ?? '';
      const paidIdx = x.pay ? x.pay.round : null, method = x.ctx && x.ctx.g.payment.method;
      row.in_payment = d.practice ? 0 : method === 'randomRound' ? (paidIdx === rho ? 1 : 0) : 1;
      Object.assign(row, tail_);
      rows.push(row);
    }
  }
  // cumulative payoff over the paid-eligible (non-practice) rounds, per participant in round order
  const run = new Map();
  for (const row of rows) {
    if (row.practice === 1 || row.payoff === '' || row.payoff == null || row.stage === '' ) { row.cum_payoff = run.has(row.code) ? run.get(row.code).total : ''; continue; }
    const cur = run.get(row.code) || { total: 0, seenRound: -1 };
    if (cur.seenRound !== row.trial_index) { cur.total += Number(row.payoff); cur.seenRound = row.trial_index; }
    run.set(row.code, cur); row.cum_payoff = cur.total;
  }
  return rows;
}

// ---------- groups ----------
// Cohorts are listed from a small index (one key each), not by scanning every move key.
export async function listCohortIds(S) { return (await S.store.list('g/cidx/')).map(k => k.slice('g/cidx/'.length)).sort(); }

export async function groupRows(S, { offset = 0, limit = 25, all = null } = {}) {
  const everyId = all || await listCohortIds(S), ids = everyId.slice(offset, offset + limit), rows = [];
  for (const cid of ids) {
    const cohort = await getOnce(S.store, K.cohort(cid)), dec = await getOnce(S.store, K.decision(cid));
    const status = !dec ? 'waiting_to_start' : dec.go ? 'started' : dec.closed ? 'closed_before_start' : 'abandoned';
    const dropped = (await S.store.list(K.droppedPrefix(cid))).map(tail);
    const base = { cohort: cid, slot: cohort.slot, created_at: iso(cohort.createdAt), condition: cohort.cond, content_version: cohort.ver, matching: cohort.matching, groups_in_cohort: cohort.G, status, started_at: dec && dec.go ? iso(dec.at) : '', dropped: dropped.length };
    if (!dec || !dec.go) { rows.push({ ...base, round: '', group: '', members: cohort.members.map(m => m.pid).join('|'), roles: cohort.members.map(m => m.role).join('|') }); continue; }
    const closed = !!(await getOnce(S.store, K.closed(cid)));
    for (let r = 0; r < cohort.rounds; r++) {
      for (const [j, members] of R.groupsForRound(cohort, r).entries()) {
        const recs = await Promise.all(members.map(m => getOnce(S.store, K.rec(m.pid, r))));
        const done = recs.every(Boolean), first = recs.find(Boolean);
        rows.push({ ...base, round: first ? first.data.roundNo : '', practice: first ? (first.data.practice ? 1 : 0) : '', trial_index: r, group: j, group_id: `${cid}.r${r}.g${j}`,
          members: members.map(m => m.pid).join('|'), roles: members.map(m => m.role).join('|'), completed: done ? 1 : 0, auto_moves: recs.reduce((n, x) => n + (x && x.data ? x.data.autos || 0 : 0), 0),
          group_total: done ? first.data.groupTotal ?? '' : '', payoffs: done ? recs.map(x => x.data.payoff).join('|') : '', closed_by_admin: closed ? 1 : 0 });
      }
    }
  }
  return { rows, total: everyId.length };
}
export async function groupsCsv(S) {
  const all = [], ids = await listCohortIds(S); let off = 0;
  while (off < ids.length) { const { rows } = await groupRows(S, { offset: off, limit: 25, all: ids }); all.push(...rows); off += 25; }
  return toCsv(all, ['cohort', 'slot', 'round', 'group']);
}

// ---------- payments ----------
export async function paymentRowFor(S, p) {
  const x = await participantExtras(S, p.code);
  if (!x.ctx) return null;
  const { spec, g } = x.ctx, pay = g.payment, total = spec.practiceRounds + spec.rounds;
  const done = (await S.store.list(`done/${p.code}/`)).length > 0;
  let payoffs = [], matchStatus = 'matched', played = true;
  const recs = await Promise.all(Array.from({ length: total }, (_, r) => getOnce(S.store, K.rec(p.code, r))));
  if (x.mode === 'async') {
    const oc = await asyncOutcome(S, x.ctx);
    if (!oc) { matchStatus = x.adone ? 'pending' : 'not_finished'; payoffs = []; }
    else payoffs = oc.map(o => (o ? o.payoff : null));
  } else {
    payoffs = recs.slice(spec.practiceRounds).map(rec => (rec && rec.data && rec.data.played ? rec.data.payoff : null));
    played = recs.some(rec => rec && rec.data && rec.data.played);
    if (!played) matchStatus = x.fallback ? 'no_match' : 'not_matched';
    else if (payoffs.some(v => v == null)) matchStatus = 'not_finished';
  }
  const paidIdx = x.pay ? x.pay.round : null, calc = payoffs.length === spec.rounds && payoffs.every(v => v != null) ? R.paymentFor(pay, payoffs, paidIdx) : { points: null, bonus: null };
  const completed = x.dropped ? 'dropped' : done && played && calc.points != null ? 'yes' : 'partial';
  const uncapped = calc.points == null ? null : R.round2(Math.max(0, calc.points) * Number(pay.pointsPerUnit || 0));
  const fee = Number(pay.showUpFee || 0);
  return { participant_id: p.code, condition: p.condition, test: p.test ? 1 : 0, label: p.label || '', external_id: x.ext ? x.ext.prolificPid : '', mode: x.mode, completed, match_status: matchStatus,
    paid_round: pay.method === 'randomRound' && paidIdx != null ? paidIdx + 1 : '', points: calc.points == null ? '' : calc.points, bonus: calc.bonus == null ? '' : calc.bonus,
    capped: calc.bonus != null && uncapped != null && uncapped > calc.bonus ? 1 : 0, show_up_fee: fee, total: calc.bonus == null ? '' : R.round2(calc.bonus + fee), currency: pay.currency, payment_method: pay.method };
}
export async function paymentRows(S, now, { resolve = true } = {}) {
  if (resolve) await resolvePending(S, now);
  const people = (await inBatches(await S.store.list('participants/'), 20, k => S.store.get(k))).filter(Boolean);
  const rows = await inBatches(people.filter(p => p.consentedAt), 10, p => paymentRowFor(S, p));
  return rows.filter(Boolean).sort((a, b) => (a.participant_id < b.participant_id ? -1 : 1));
}
export const PAYMENT_COLUMNS = ['participant_id', 'condition', 'test', 'label', 'external_id', 'mode', 'completed', 'match_status', 'paid_round', 'points', 'bonus', 'capped', 'show_up_fee', 'total', 'currency', 'payment_method'];
export const paymentsCsv = rows => (rows.length ? toCsv(rows, PAYMENT_COLUMNS) : PAYMENT_COLUMNS.join(',') + '\n');
// Prolific's bulk bonus upload: participant_id,amount. Only real participants with an external ID and a bonus above zero.
export function prolificRows(rows) {
  const out = [], skipped = { noExternalId: 0, pending: 0, zero: 0, test: 0 };
  for (const r of rows) {
    if (r.test) { skipped.test++; continue; }
    if (r.match_status === 'pending') { skipped.pending++; continue; }
    if (!r.external_id) { if (r.bonus !== '' && Number(r.bonus) > 0) skipped.noExternalId++; continue; }
    if (r.bonus === '' || !(Number(r.bonus) > 0)) { skipped.zero++; continue; }
    out.push({ participant_id: r.external_id, amount: Number(r.bonus).toFixed(2) });
  }
  return { rows: out, skipped };
}
export const prolificCsv = rows => 'participant_id,amount\n' + rows.map(r => `${r.participant_id},${r.amount}`).join('\n') + (rows.length ? '\n' : '');
export function paymentSummary(rows) {
  const real = rows.filter(r => !r.test), sum = k => real.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return { participants: rows.length, real: real.length, yes: real.filter(r => r.completed === 'yes').length, partial: real.filter(r => r.completed === 'partial').length, dropped: real.filter(r => r.completed === 'dropped').length,
    pending: real.filter(r => r.match_status === 'pending').length, withoutExternalId: real.filter(r => !r.external_id).length, totalBonus: R.round2(sum('bonus')), totalFees: R.round2(sum('show_up_fee')), capped: real.filter(r => r.capped).length };
}

// ---------- status for the person running a session ----------
export async function statusReport(S, now) {
  const b = bucketOf(now), waiting = new Set();
  for (const bk of [b, b - 1, b - 2]) for (const k of await S.store.list(K.hbPrefix(bk))) waiting.add(k.split('/')[4].split('~').slice(1).join('~'));
  const ids = (await listCohortIds(S)).slice(-60).reverse(), cohorts = [];
  for (const cid of ids) {
    const cohort = await getOnce(S.store, K.cohort(cid)), dec = await getOnce(S.store, K.decision(cid));
    const status = !dec ? 'confirming' : dec.go === false ? (dec.closed ? 'closed' : 'abandoned') : 'playing';
    const entry = { id: cid, createdAt: cohort.createdAt, members: cohort.members.length, groups: cohort.G, condition: cohort.cond, status, rounds: cohort.rounds, round: null, lastActivityAt: dec ? dec.at : cohort.createdAt, dropped: 0, stalled: false, closed: false };
    if (status === 'playing') {
      const starts = (await S.store.list(`g/c/${cid}/start/`)).map(k => k.match(/start\/r(\d+)\/s(\d+)\/g(\d+)$/)).filter(Boolean).map(m => ({ r: +m[1], s: +m[2], key: m[0] }));
      starts.sort((a, c) => a.r - c.r || a.s - c.s);
      const lastStart = starts.length ? await getOnce(S.store, `g/c/${cid}/${starts[starts.length - 1].key}`) : null;
      const lastRound = starts.length ? starts[starts.length - 1].r : 0;
      entry.round = lastRound + 1; entry.lastActivityAt = lastStart ? lastStart.at : entry.lastActivityAt;
      entry.dropped = (await S.store.list(K.droppedPrefix(cid))).length; entry.closed = !!(await getOnce(S.store, K.closed(cid)));
      const finalRec = await getOnce(S.store, K.rec(cohort.members[0].pid, cohort.rounds - 1)), allDone = !!finalRec;
      entry.finished = allDone;
      const ctxM = await loadCtx(S, cohort.members[0].pid);
      const limit = ctxM.error ? 120000 : (ctxM.spec.decisionSeconds + ctxM.spec.feedbackSeconds) * 1000 * 2;
      entry.stalled = !allDone && !entry.closed && now - entry.lastActivityAt > limit;
    }
    cohorts.push(entry);
  }
  const apend = (await S.store.list('g/apend/')).length, pools = {};
  for (const pre of ['g/pool/', 'g/pool-test/']) for (const k of await S.store.list(pre)) { const p = k.split('/'); const key = `${p[1] === 'pool-test' ? 'test ' : ''}${p[2]}/${p[3]}`; pools[key] = (pools[key] || 0) + 1; }
  return { now, waiting: waiting.size, cohorts, async: { pending: apend, pools } };
}
