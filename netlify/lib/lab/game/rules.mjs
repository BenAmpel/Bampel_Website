// CCAIR Behavioral Lab, economic games: the rules of a game as pure functions.
// Nothing here touches storage or the clock, so every server instance computes the same answer from the same
// inputs. That is what makes the live game race-safe on a store without atomic read-modify-write: shared state
// is write-once keys, and everything derived (groups, outcomes, payments) is recomputed from them.
import { compile, envOf, evaluate, ExprError } from './expr.mjs';
import { seeded, shuffle } from '../engine.mjs';

export const SLOT_MS = 5000;           // matching windows and heartbeat buckets
export const SETTLE_BUCKETS = 2;       // a group is formed only from heartbeats at least this many buckets old
export const MAX_TABLE_ROWS = 101;

const cache = new Map();
export function exprOf(src) {
  let c = cache.get(src);
  if (!c) { c = compile(String(src)); if (cache.size > 2000) cache.clear(); cache.set(src, c); }
  return c;
}
const isExprString = v => typeof v === 'string' && v.trim() !== '' && !Number.isFinite(Number(v));
export const isStatic = v => typeof v === 'number' || (typeof v === 'string' && Number.isFinite(Number(v)) && v.trim() !== '');

// The rules in one object: the game settings plus the payoff formulas.
export const gameOf = c => ({ ...c.game, payoff: c.payoff });

// ---------- structure ----------
// A step is a run of stages collected at the same time (the first stage, plus any following stage marked parallel).
export function stepsOf(game) {
  const steps = [];
  game.stages.forEach((st, i) => {
    if (st.parallel && steps.length) steps[steps.length - 1].stages.push(i);
    else steps.push({ index: steps.length, stages: [i] });
  });
  return steps;
}
export const stageActs = (stage, roleId) => stage.role === '*' || stage.role === roleId;
// Role ids that must decide something in this step (empty for a step nobody acts in).
export function actorsOf(game, step) {
  const out = new Set();
  for (const si of step.stages) for (const r of game.roles) if (stageActs(game.stages[si], r.id)) out.add(r.id);
  return out;
}
export function decisionIndex(game) {
  const idx = new Map();
  const steps = stepsOf(game);
  game.stages.forEach((st, si) => {
    const step = steps.findIndex(s => s.stages.includes(si));
    for (const d of st.decisions) idx.set(d.id, { decision: d, stage: st, stageIndex: si, step, role: st.role });
  });
  return idx;
}
export function slotRoles(game) { const out = []; for (const r of game.roles) for (let i = 0; i < r.count; i++) out.push(r.id); return out; }
export const roleLabel = (game, id) => (game.roles.find(r => r.id === id) || {}).label || id;
export const totalRounds = game => game.practiceRounds + game.rounds;
export const groupsPerCohort = game => (game.matching === 'strangers' || game.matching === 'perfectStrangers') ? Math.max(1, game.cohortGroups || 1) : 1;
// Treatments override named constants; nothing else changes between conditions.
export function paramsFor(content, condition) {
  const cond = (content.conditions || []).find(c => c.id === condition);
  return { ...(content.params || {}), ...((cond && cond.params) || {}) };
}

// Fills {name} in text with the constants of the game (a treatment's own values).
// Names available in instruction text besides the game's constants.
// "1 round", "12 rounds, including 2 practice rounds": for the opening instructions ({rounds_text} there), which count practice rounds too.
export const roundsTextAll = spec => { const n = spec.rounds + (spec.practiceRounds || 0); return `${n} ${n === 1 ? 'round' : 'rounds'}` + (spec.practiceRounds > 0 ? `, including ${spec.practiceRounds} practice ${spec.practiceRounds === 1 ? 'round' : 'rounds'}` : ''); };
export const textVars = (spec, params) => ({ ...params, rounds: spec.rounds, practiceRounds: spec.practiceRounds, players: spec.players, rounds_text: `${spec.rounds} ${spec.rounds === 1 ? 'round' : 'rounds'}` });
export const fillText = (text, params) => String(text || '').replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params || {}, k) ? String(params[k]) : m));

// ---------- decision specs, bounds, and domains ----------
const numKey = x => String(Number(x));
const bound = (v, env) => (isStatic(v) ? Number(v) : evaluate(exprOf(v).ast, env));

// The decision as the player sees it, with bounds worked out from the constants and what they have seen.
export function envFor(params, round, seen = {}, n = 0) {
  const env = envOf({ ...params, n, round: round + 1 });
  env.seen = envOf(seen);
  return env;
}
// Limits are formulas and can fail for some earlier decisions (a division by zero, a root of a negative number). At run time
// a failing limit never stops a group: the decision falls back to its static bounds and its default, and the spec is flagged
// (fallback: true). Saving the study checks the formulas over the earlier decisions' values (strict), so this is a safety net.
export function specOf(decision, env, strict = false) {
  if (decision.kind === 'choice') return { id: decision.id, label: decision.label, kind: 'choice', options: decision.options };
  const step = Number(decision.step) || 1;
  try {
    const min = bound(decision.min, env), max = bound(decision.max, env);
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new ExprError(`The limits of "${decision.id}" are not numbers.`);
    if (min > max) throw new ExprError(`The minimum of "${decision.id}" (${min}) is above the maximum (${max}).`);
    return { id: decision.id, label: decision.label, kind: 'number', min, max, step };
  } catch (e) {
    if (strict) throw e;
    const def = Number(decision.default) || 0;
    let lo = isStatic(decision.min) ? Number(decision.min) : def, hi = isStatic(decision.max) ? Number(decision.max) : def;
    if (lo > hi) [lo, hi] = [hi, lo];
    lo = Math.min(lo, def); hi = Math.max(hi, def);
    return { id: decision.id, label: decision.label, kind: 'number', min: lo, max: hi, step, fallback: true };
  }
}
// Did any limit of this step fall back to its static bounds?
export function stepFellBack(game, params, roleId, step, round, seen) {
  try {
    return stepPrompt(game, params, roleId, step, round, seen).some(e => e.decisions.some(d => d.fallback) || (e.strategy && e.strategy.rows && e.strategy.rows.some(r => r.spec.fallback)));
  } catch { return true; }
}
function onGrid(v, min, step) { const q = (v - min) / step; return Math.abs(q - Math.round(q)) < 1e-6; }
export function checkAgainst(spec, v) {
  if (spec.kind === 'choice') return typeof v === 'string' && spec.options.some(o => o.value === v) ? null : 'not one of the options';
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'not a number';
  if (v < spec.min - 1e-9 || v > spec.max + 1e-9) return `outside ${spec.min} to ${spec.max}`;
  if (!onGrid(v, spec.min, spec.step)) return `not a multiple of ${spec.step}`;
  return null;
}
// The values a strategy table covers: every option, or every number in the range.
export function domainOf(decision, params) {
  if (decision.kind === 'choice') return decision.options.map(o => o.value);
  const env = envFor(params, 0), min = bound(decision.min, env), max = bound(decision.max, env), step = Number(decision.step) || 1, out = [];
  for (let v = min; v <= max + 1e-9 && out.length <= MAX_TABLE_ROWS; v += step) out.push(Math.round(v * 1e9) / 1e9);
  return out;
}

// What a player is asked at a step: one entry per stage they act in, with limits resolved against `seen`
// (decisions made in earlier steps of this round, by decision id).
export function stepPrompt(game, params, roleId, step, round, seen) {
  const idx = decisionIndex(game), out = [];
  for (const si of step.stages) {
    const st = game.stages[si];
    if (!stageActs(st, roleId)) continue;
    const env = envFor(params, round, seen, game.players);
    const entry = { stage: st.id, label: st.label, prompt: fillText(st.prompt, textVars(game, params)), strategy: null, decisions: [] };
    if (st.strategyMethod) {
      const sm = st.strategyMethod, onDec = idx.get(sm.on).decision, d = st.decisions[0], domain = domainOf(onDec, params);
      entry.strategy = { on: sm.on, onLabel: onDec.label, form: sm.form, above: sm.above, below: sm.below };
      if (sm.form === 'threshold') {
        entry.strategy.min = domain[0]; entry.strategy.max = domain[domain.length - 1]; entry.strategy.step = Number(onDec.step) || 1;
        entry.strategy.options = d.options;
      } else {
        entry.strategy.rows = domain.map(v => ({ observed: v, spec: specOf(d, envFor(params, round, { ...seen, [sm.on]: v }, game.players)) }));
      }
      entry.decisions.push({ id: d.id, label: d.label, kind: d.kind });
    } else for (const d of st.decisions) entry.decisions.push(specOf(d, env));
    out.push(entry);
  }
  return out;
}

// Validates what a player sent for a step. Returns { values } (normalized, by decision id) or { error }.
export function validateStepValues(game, params, roleId, step, round, seen, sent) {
  const idx = decisionIndex(game), values = {};
  sent = sent && typeof sent === 'object' ? sent : {};
  const allowed = new Set();
  try {
    for (const si of step.stages) {
      const st = game.stages[si];
      if (!stageActs(st, roleId)) continue;
      for (const d of st.decisions) {
        allowed.add(d.id);
        const v = sent[d.id];
        if (v === undefined || v === null) return { error: `Missing decision "${d.label || d.id}".` };
        if (st.strategyMethod) {
          const sm = st.strategyMethod, onDec = idx.get(sm.on).decision, domain = domainOf(onDec, params);
          if (sm.form === 'threshold') {
            const t = Number(v && v.threshold), lo = domain[0], step_ = Number(onDec.step) || 1, hi = domain[domain.length - 1] + step_;
            if (!(typeof (v && v.threshold) === 'number') || !Number.isFinite(t) || t < lo - 1e-9 || t > hi + 1e-9 || !onGrid(t, lo, step_)) return { error: `The minimum for "${d.label || d.id}" is not valid.` };
            values[d.id] = { threshold: t };
          } else {
            const table = v && typeof v === 'object' ? v.table : null;
            if (!table || typeof table !== 'object') return { error: `Missing answers for "${d.label || d.id}".` };
            const out = {};
            for (const obs of domain) {
              const spec = specOf(d, envFor(params, round, { ...seen, [sm.on]: obs }, game.players)), key = typeof obs === 'number' ? numKey(obs) : obs, got = table[key];
              const bad = checkAgainst(spec, got);
              if (bad) return { error: `The answer for ${spec.label || d.id} when the other chose ${key} is ${bad}.` };
              out[key] = got;
            }
            if (Object.keys(table).length !== domain.length) return { error: 'Unexpected extra answers.' };
            values[d.id] = { table: out };
          }
        } else {
          const spec = specOf(d, envFor(params, round, seen, game.players)), bad = checkAgainst(spec, v);
          if (bad) return { error: `"${d.label || d.id}" is ${bad}.` };
          values[d.id] = v;
        }
      }
    }
  } catch (e) { return { error: e.message }; }
  for (const k of Object.keys(sent)) if (!allowed.has(k)) return { error: `Unexpected decision "${k}".` };
  return { values };
}

// ---------- defaults used when a player times out ----------
export function clampTo(spec, v) {
  if (spec.kind === 'choice') return spec.options.some(o => o.value === v) ? v : spec.options[0].value;
  let x = Number(v); if (!Number.isFinite(x)) x = spec.min;
  x = Math.min(spec.max, Math.max(spec.min, x));
  return spec.min + Math.round((x - spec.min) / spec.step) * spec.step;
}
// action: 'default' | 'random' | 'repeatLast'. last: this player's previous raw values for the same stage(s), if any.
export function autoValues(game, params, roleId, step, round, seen, action, last, rand) {
  const idx = decisionIndex(game), values = {}, pick = a => a[Math.floor(rand() * a.length)];
  const one = (d, spec, lastV) => {
    if (action === 'repeatLast' && lastV !== undefined && checkAgainst(spec, lastV) === null) return lastV;
    if (action === 'random') return spec.kind === 'choice' ? pick(spec.options).value : clampTo(spec, spec.min + Math.floor(rand() * (Math.floor((spec.max - spec.min) / spec.step + 1e-9) + 1)) * spec.step);
    return clampTo(spec, d.default);
  };
  for (const si of step.stages) {
    const st = game.stages[si];
    if (!stageActs(st, roleId)) continue;
    for (const d of st.decisions) {
      const lastV = last ? last[d.id] : undefined;
      if (st.strategyMethod) {
        const sm = st.strategyMethod, onDec = idx.get(sm.on).decision, domain = domainOf(onDec, params);
        if (sm.form === 'threshold') {
          const lo = domain[0], step_ = Number(onDec.step) || 1, hi = domain[domain.length - 1] + step_;
          let t = action === 'random' ? lo + Math.floor(rand() * (Math.round((hi - lo) / step_) + 1)) * step_
            : action === 'repeatLast' && lastV && typeof lastV.threshold === 'number' ? lastV.threshold : Number(sm.defaultThreshold ?? lo);
          t = Math.min(hi, Math.max(lo, t)); values[d.id] = { threshold: lo + Math.round((t - lo) / step_) * step_ };
        } else {
          const table = {};
          for (const obs of domain) {
            const spec = specOf(d, envFor(params, round, { ...seen, [sm.on]: obs }, game.players)), key = typeof obs === 'number' ? numKey(obs) : obs;
            table[key] = one(d, spec, lastV && lastV.table ? lastV.table[key] : undefined);
          }
          values[d.id] = { table };
        }
      } else values[d.id] = one(d, specOf(d, envFor(params, round, seen, game.players)), lastV);
    }
  }
  return values;
}

// ---------- outcomes ----------
function resolveStrategy(sm, onDecision, raw, observed) {
  if (sm.form === 'threshold') return observed >= raw.threshold - 1e-9 ? sm.above : sm.below;
  const key = typeof observed === 'number' ? numKey(observed) : observed;
  return raw.table[key];
}

// members: [{ pid, role }]; raw: { pid: { decisionId: value as sent (strategy objects included) } }.
// Returns { concrete: {pid: {decisionId: value}}, payoffs: {pid: number}, strategy: {pid: {decisionId: raw}} }.
export function resolveGroup(game, params, round, members, raw) {
  const idx = decisionIndex(game), concrete = {}, strategy = {};
  for (const m of members) concrete[m.pid] = {};
  for (const st of game.stages) {
    for (const m of members) {
      if (!stageActs(st, m.role)) continue;
      for (const d of st.decisions) {
        const r = (raw[m.pid] || {})[d.id];
        if (r === undefined) throw new ExprError(`A decision is missing: ${d.id}.`);
        if (st.strategyMethod) {
          const sm = st.strategyMethod, owner = members.find(x => stageActs(idx.get(sm.on).stage, x.role) && x.pid !== m.pid) || members.find(x => stageActs(idx.get(sm.on).stage, x.role));
          const observed = owner && concrete[owner.pid][sm.on];
          if (observed === undefined) throw new ExprError(`The decision "${sm.on}" needed for the strategy method is missing.`);
          concrete[m.pid][d.id] = resolveStrategy(sm, idx.get(sm.on).decision, r, observed);
          (strategy[m.pid] = strategy[m.pid] || {})[d.id] = r;
        } else concrete[m.pid][d.id] = r;
      }
    }
  }
  const payoffs = {};
  for (const m of members) payoffs[m.pid] = payoffOf(game, params, round, members, concrete, m.pid);
  return { concrete, payoffs, strategy };
}

export function payoffEnv(game, params, round, members, concrete, pid) {
  const idx = decisionIndex(game), me = members.find(m => m.pid === pid), env = envOf({ ...params, n: members.length, round: round + 1 });
  env.my = envOf(concrete[pid] || {});
  const role = envOf(), others = envOf();
  for (const r of game.roles) {
    const r_ = envOf();
    for (const [id, info] of idx) {
      if (!stageActs(info.stage, r.id)) continue;
      const inRole = members.filter(m => m.role === r.id && concrete[m.pid] && id in concrete[m.pid]);
      if (!inRole.length) continue;
      r_[id] = r.count === 1 ? concrete[inRole[0].pid][id] : inRole.map(m => concrete[m.pid][id]);
    }
    role[r.id] = r_;
  }
  for (const [id] of idx) others[id] = members.filter(m => m.pid !== pid && concrete[m.pid] && id in concrete[m.pid]).map(m => concrete[m.pid][id]);
  env.role = role; env.others = others;
  if (members.length === 2) { const o = members.find(m => m.pid !== pid), other = envOf(); for (const [id] of idx) if (o && concrete[o.pid] && id in concrete[o.pid]) other[id] = concrete[o.pid][id]; env.other = other; }
  return env;
}
export function payoffOf(game, params, round, members, concrete, pid) {
  const me = members.find(m => m.pid === pid), src = game.payoff && game.payoff[me.role];
  if (src == null) return 0;
  const v = evaluate(exprOf(src).ast, payoffEnv(game, params, round, members, concrete, pid));
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ExprError(`The payoff for ${me.role} is not a number.`);
  return v;
}

// ---------- matching ----------
// Group positions are fixed per cohort ((k, s): k = starting group, s = slot, slots follow the role order).
// For round r, groupsForRound returns the groups as arrays of members in slot order.
export function groupsForRound(cohort, round) {
  const { G, g } = cohort, grid = Array.from({ length: G }, () => []);
  for (const m of cohort.members) grid[m.k][m.s] = m;
  if (cohort.matching === 'strangers' && G > 1) {
    const perms = Array.from({ length: g }, (_, s) => shuffle([...Array(G).keys()], seeded(`${cohort.id}|r${round}|s${s}`)));
    return Array.from({ length: G }, (_, j) => Array.from({ length: g }, (_, s) => grid[perms[s][j]][s]));
  }
  if (cohort.matching === 'perfectStrangers' && G > 1) return Array.from({ length: G }, (_, j) => Array.from({ length: g }, (_, s) => grid[(j + s * round) % G][s]));
  return grid;
}
export function groupOf(cohort, round, pid) {
  const groups = groupsForRound(cohort, round), j = groups.findIndex(gr => gr.some(m => m.pid === pid));
  return j < 0 ? null : { index: j, members: groups[j] };
}
// Can perfect strangers be arranged: no pair shares a group twice in `rounds` rounds?
export function perfectStrangersOk(g, G, rounds) {
  if (G < 2 || g < 2) return false;
  const seen = new Set();
  for (let r = 0; r < rounds; r++) for (let j = 0; j < G; j++) {
    const ids = []; for (let s = 0; s < g; s++) ids.push(((j + s * r) % G) * g + s);
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const k = ids[a] + '-' + ids[b]; if (seen.has(k)) return false; seen.add(k); }
  }
  return true;
}
export function suggestCohortGroups(g, rounds) { for (let G = Math.max(2, g); G <= 30; G++) if (perfectStrangersOk(g, G, rounds)) return G; return null; }

// candidates: [{ pid, cond, ver, entry }] present in a settled heartbeat bucket and not already in a group.
// Output is deterministic (sorted by lobby entry time, then ID; roles shuffled with a seed from the slot).
export function formCohorts(gameFor, slot, candidates, studyId) {
  const slotMs = slot * SLOT_MS, out = [];
  const gk = c => `${c.cond}~${c.ver}~${c.test ? 1 : 0}`, keys = [...new Set(candidates.map(gk))].sort();
  for (const key of keys) {
    const list = candidates.filter(c => gk(c) === key).sort((a, b) => a.entry - b.entry || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0));
    const [cond, ver, test] = key.split('~'), game = gameFor(Number(ver));
    const g = game.players, G = groupsPerCohort(game), C = g * G, slots = slotRoles(game);
    let take = Math.floor(list.length / C) * C;
    const rest = list.length - take;
    // After half the maximum wait, strangers matching settles for a smaller cohort rather than waiting for a full one.
    if (rest >= g && game.matching === 'strangers' && G > 1 && slotMs - list[take].entry >= (game.waitMaxSeconds * 500)) take += Math.floor(rest / g) * g;
    for (let off = 0, i = 0; off < take; i++) {
      const size = Math.min(C, take - off), part = list.slice(off, off + size); off += size;
      const id = `c${slot}-${out.length}`, order = shuffle(part, seeded(`${studyId}|${id}|${cond}`));
      out.push({ id, slot, cond, ver: Number(ver), test: test === '1', createdAt: slotMs, G: size / g, g, matching: game.matching, rounds: totalRounds(game),
        members: order.map((c, n) => ({ pid: c.pid, role: slots[n % g], s: n % g, k: Math.floor(n / g) })) });
    }
  }
  return out;
}

// ---------- payment ----------
export const round2 = x => Math.round((x + Number.EPSILON * Math.sign(x)) * 100) / 100;
// payoffs: array of real-round payoffs in order (null where unknown). paid: index of the drawn round.
export function paymentFor(payment, payoffs, paid) {
  if (!payoffs.length || payoffs.some(p => p == null)) return { points: null, bonus: null };
  let points;
  if (payment.method === 'sum') points = payoffs.reduce((a, b) => a + b, 0);
  else if (payment.method === 'mean') points = payoffs.reduce((a, b) => a + b, 0) / payoffs.length;
  else points = payoffs[paid];
  if (points == null) return { points: null, bonus: null };
  let bonus = Math.max(0, points) * Number(payment.pointsPerUnit || 0);
  if (payment.maxBonus != null && Number.isFinite(Number(payment.maxBonus))) bonus = Math.min(bonus, Number(payment.maxBonus));
  return { points, bonus: round2(bonus) };
}
// The paid round: seeded by a server-side secret, participant, and study. Drawn at completion and written once (shared.ensurePay).
export const drawPaidRound = (secret, pid, studyId, rounds) => Math.floor(seeded(`${secret}|${pid}|${studyId}|paidround`)() * rounds);

// ---------- payoff table for two-player choice games ----------
export function payoffTable(game, params) {
  if (game.players !== 2 || game.stages.length < 1) return null;
  const steps = stepsOf(game);
  if (steps.length !== 1) return null;
  const actors = [];
  for (const st of game.stages) { if (st.strategyMethod || st.decisions.length !== 1 || st.decisions[0].kind !== 'choice') return null; }
  const slots = slotRoles(game);
  const decOf = role => { const si = game.stages.find(s => stageActs(s, role)); return si ? si.decisions[0] : null; };
  const d1 = decOf(slots[0]), d2 = decOf(slots[1]);
  if (!d1 || !d2 || d1.options.length > 5 || d2.options.length > 5) return null;
  const members = [{ pid: 'a', role: slots[0] }, { pid: 'b', role: slots[1] }], cells = [];
  try {
    for (const o1 of d1.options) {
      const row = [];
      for (const o2 of d2.options) {
        const r = resolveGroup(game, params, 0, members, { a: { [d1.id]: o1.value }, b: { [d2.id]: o2.value } });
        row.push([r.payoffs.a, r.payoffs.b]);
      }
      cells.push(row);
    }
  } catch { return null; }
  const same = slots[0] === slots[1];
  return { rowRole: slots[0], colRole: slots[1], symmetric: same, rowTitle: same ? 'You' : roleLabel(game, slots[0]), colTitle: same ? 'The other participant' : roleLabel(game, slots[1]),
    rows: d1.options, cols: d2.options, cells };
}
