// CCAIR Behavioral Lab, economic games: the content model (defaults, normalization, validation).
// The editor, the server, and the self-test all read the same shape:
//   game          mode, players, roles, rounds, matching, timing, and the stages of a round
//   payoff        one expression per role (see expr.mjs)
//   params        named constants that payoffs and decision limits may use
//   conditions    treatments: each overrides some params, so a new treatment needs no code
//   feedback      what a player sees after each round
//   payment       how points become a bonus
//   instructions  general text, plus optional text per role
//   comprehension optional numeric questions that must be answered before the live lobby
import { parse, identifiers, ExprError, envOf } from './expr.mjs';
import { presetContent } from './presets.mjs';
import { gameOf, stepsOf, decisionIndex, stageActs, actorsOf, slotRoles, isStatic, perfectStrangersOk, suggestCohortGroups, resolveGroup, autoValues, paramsFor, totalRounds, domainOf, specOf, envFor, MAX_TABLE_ROWS } from './rules.mjs';

export const ID_RE = /^[a-z][a-z0-9_]{0,30}$/;
const PARAM_RE = /^[A-Za-z][A-Za-z0-9_]{0,30}$/;
const RESERVED = new Set(['my', 'role', 'others', 'other', 'seen', 'n', 'round', 'and', 'or', 'not', 'true', 'false', 'min', 'max', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'sum', 'mean', 'count', 'num', 'constructor', 'prototype']);
export const MODES = ['live', 'async'], MATCHINGS = ['partners', 'strangers', 'perfectStrangers', 'none'], TIMEOUTS = ['default', 'random', 'repeatLast'], FALLBACKS = ['fee', 'async'], METHODS = ['randomRound', 'sum', 'mean'];

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const fin = v => typeof v === 'number' && Number.isFinite(v);

export function defaultGame() { return presetContent('prisoners-dilemma-10'); }

const numOrExpr = v => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);

// Fills in what an older saved version lacks and tidies fields the editor may leave blank.
export function normalizeGame(c, d) {
  for (const k of ['game', 'payoff', 'params', 'conditions', 'feedback', 'payment', 'instructions', 'comprehension']) if (c[k] === undefined) c[k] = structuredClone(d[k]);
  const g = c.game = { ...structuredClone(d.game), ...(c.game || {}) };
  if (!Array.isArray(g.roles) || !g.roles.length) g.roles = [{ id: 'player', label: 'Player', count: Math.max(1, Number(g.players) || 1) }];
  g.roles.forEach(r => { r.count = Number(r.count); });
  if (g.roles.every(r => Number.isInteger(r.count))) g.players = g.roles.reduce((a, r) => a + r.count, 0);
  g.stages = Array.isArray(g.stages) ? g.stages : [];
  g.stages.forEach(st => {
    st.parallel = !!st.parallel; st.show = Array.isArray(st.show) ? st.show : []; st.prompt = st.prompt || '';
    st.decisions = Array.isArray(st.decisions) ? st.decisions : [];
    if (!st.strategyMethod) st.strategyMethod = null;
    st.decisions.forEach(dc => {
      if (dc.kind === 'number') { dc.min = numOrExpr(dc.min ?? 0); dc.max = numOrExpr(dc.max ?? 10); dc.step = Number(dc.step) || 1; if (dc.default === '' || dc.default == null) dc.default = 0; dc.default = Number(dc.default); }
      else { dc.options = Array.isArray(dc.options) ? dc.options : []; }
    });
  });
  if (g.players === 1) g.matching = 'none';
  c.payoff = c.payoff && typeof c.payoff === 'object' ? c.payoff : {};
  c.params = c.params && typeof c.params === 'object' ? c.params : {};
  c.conditions = Array.isArray(c.conditions) && c.conditions.length ? c.conditions : structuredClone(d.conditions);
  c.conditions.forEach(x => { x.params = x.params && typeof x.params === 'object' ? x.params : {}; });
  c.feedback = { ...d.feedback, ...(c.feedback || {}) };
  c.payment = { ...d.payment, ...(c.payment || {}) };
  c.instructions = { general: '', roles: {}, ...(c.instructions || {}) }; c.instructions.roles = c.instructions.roles || {};
  c.comprehension = { ...d.comprehension, ...(c.comprehension || {}) }; c.comprehension.questions = c.comprehension.questions || [];
  return c;
}

function checkExpr(src, where, scope, e) {
  let ast;
  try { ast = parse(String(src)); } catch (x) { e.push(`${where}: ${x.message}`); return null; }
  let ok = true;
  for (const id of identifiers(ast)) { const msg = scope(id); if (msg) { e.push(`${where}: ${msg}`); ok = false; } }
  return ok ? ast : null;
}

export function validateGame(c, e) {
  const g = c.game, params = c.params || {};
  if (!g || typeof g !== 'object') { e.push('The game settings are missing.'); return; }
  if (!MODES.includes(g.mode)) e.push('Choose live or asynchronous play.');
  if (!int(g.players, 1, 12)) e.push('Players per group must be a whole number from 1 to 12.');
  if (!Array.isArray(g.roles) || !g.roles.length || g.roles.length > 6) { e.push('Define 1 to 6 roles.'); return; }
  const roleIds = new Set();
  g.roles.forEach((r, i) => {
    if (!ID_RE.test(r.id || '')) e.push(`Role ${i + 1}: the ID must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (roleIds.has(r.id)) e.push(`Two roles share the ID "${r.id}".`);
    roleIds.add(r.id);
    if (!str(r.label, 60)) e.push(`Role ${i + 1}: a label is required.`);
    if (!int(r.count, 1, 12)) e.push(`Role ${i + 1}: the number of players must be a whole number from 1 to 12.`);
  });
  if (g.roles.every(r => int(r.count, 1, 12)) && g.roles.reduce((a, r) => a + r.count, 0) !== g.players) e.push('The players in each role must add up to the players per group.');
  if (!int(g.rounds, 1, 50)) e.push('Rounds must be a whole number from 1 to 50.');
  if (!int(g.practiceRounds, 0, 10)) e.push('Practice rounds must be a whole number from 0 to 10.');
  if (!MATCHINGS.includes(g.matching)) e.push('Choose how groups are matched.');
  if (g.players === 1 && g.matching !== 'none') e.push('A one-player task has nobody to match with: choose "none" for matching.');
  if (g.players > 1 && g.matching === 'none') e.push('Matching "none" is only for one-player tasks.');
  if (g.players === 1 && g.mode === 'live') e.push('A one-player task has nobody to wait for: use asynchronous play.');
  if (!int(g.cohortGroups, 1, 12)) e.push('Groups per matching cohort must be a whole number from 1 to 12.');
  else if (g.matching === 'perfectStrangers' && int(g.players, 2, 12) && int(g.rounds, 1, 50) && int(g.practiceRounds, 0, 10) && !perfectStrangersOk(g.players, g.cohortGroups, totalRounds(g))) {
    const s = suggestCohortGroups(g.players, totalRounds(g));
    e.push(`Perfect strangers cannot be arranged with ${g.cohortGroups} group${g.cohortGroups === 1 ? '' : 's'} per cohort over ${totalRounds(g)} rounds (some pair would meet twice).${s ? ` Try ${s} groups per cohort.` : ' Use fewer rounds.'}`);
  }
  if (!int(g.decisionSeconds, 5, 600)) e.push('Seconds per decision must be a whole number from 5 to 600.');
  if (!int(g.waitMaxSeconds, 10, 3600)) e.push('Maximum waiting time must be a whole number of seconds from 10 to 3600.');
  if (!int(g.readySeconds, 10, 300)) e.push('Seconds to confirm a match must be a whole number from 10 to 300.');
  if (!int(g.feedbackSeconds, 5, 300)) e.push('Seconds to read the results must be a whole number from 5 to 300.');
  if (!FALLBACKS.includes(g.waitFallback)) e.push('Choose what happens when nobody else arrives.');
  if (!TIMEOUTS.includes(g.timeoutAction)) e.push('Choose what happens when a player runs out of time.');
  if (!int(g.dropAfterTimeouts, 0, 10)) e.push('Timeouts before a player counts as having left must be a whole number from 0 to 10 (0 = never).');
  if (!int(g.pollSeconds, 1, 5)) e.push('The refresh interval must be 1 to 5 seconds.');

  // params
  const pnames = Object.keys(params);
  if (pnames.length > 40) e.push('Use at most 40 constants.');
  for (const k of pnames) {
    if (!PARAM_RE.test(k) || RESERVED.has(k)) e.push(`Constant "${k}": use a name that starts with a letter and uses only letters, numbers, and underscores, and is not a reserved word.`);
    else if (!fin(params[k])) e.push(`Constant "${k}" must be a number.`);
  }
  // conditions
  const condIds = new Set();
  if (!Array.isArray(c.conditions) || c.conditions.length < 1 || c.conditions.length > 8) e.push('Define 1 to 8 conditions.');
  else c.conditions.forEach((x, i) => {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(x.id || '')) e.push(`Condition ${i + 1}: the ID must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (condIds.has(x.id)) e.push(`Two conditions share the ID "${x.id}".`);
    condIds.add(x.id);
    if (!str(x.label, 80)) e.push(`Condition ${i + 1}: a label is required.`);
    for (const [k, v] of Object.entries(x.params || {})) {
      if (!(k in params)) e.push(`Condition "${x.id}": "${k}" is not one of the constants.`);
      else if (!fin(v)) e.push(`Condition "${x.id}": "${k}" must be a number.`);
    }
  });

  // stages and decisions
  if (!Array.isArray(g.stages) || g.stages.length < 1 || g.stages.length > 8) { e.push('A round needs 1 to 8 stages.'); return; }
  const stageIds = new Set(), decIds = new Set();
  let stageErrors = 0;
  g.stages.forEach((st, i) => {
    const w = `Stage ${i + 1}`;
    if (!ID_RE.test(st.id || '')) { e.push(`${w}: the ID must start with a letter and use only lowercase letters, numbers, and underscores.`); stageErrors++; }
    else if (stageIds.has(st.id)) { e.push(`Two stages share the ID "${st.id}".`); stageErrors++; }
    stageIds.add(st.id);
    if (!str(st.label, 80)) { e.push(`${w}: a label is required.`); stageErrors++; }
    if (st.role !== '*' && !roleIds.has(st.role)) { e.push(`${w}: choose which role decides (or everyone).`); stageErrors++; }
    if (i === 0 && st.parallel) { e.push(`${w}: the first stage cannot be "at the same time as the previous stage".`); stageErrors++; }
    if (typeof st.prompt !== 'string' || st.prompt.length > 1000) { e.push(`${w}: the instruction text is too long.`); stageErrors++; }
    if (!Array.isArray(st.decisions) || st.decisions.length < 1 || st.decisions.length > 6) { e.push(`${w}: define 1 to 6 decisions.`); stageErrors++; return; }
    st.decisions.forEach((d, j) => {
      const dw = `${w}, decision ${j + 1}`;
      if (!ID_RE.test(d.id || '') || RESERVED.has(d.id)) { e.push(`${dw}: the ID must start with a letter, use lowercase letters, numbers, and underscores, and not be a reserved word.`); stageErrors++; }
      else if (decIds.has(d.id)) { e.push(`Two decisions share the ID "${d.id}".`); stageErrors++; }
      decIds.add(d.id);
      if (!str(d.label, 120)) { e.push(`${dw}: a label is required.`); stageErrors++; }
      if (d.kind === 'choice') {
        if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 12) { e.push(`${dw}: a choice needs 2 to 12 options.`); stageErrors++; }
        else {
          if (!d.options.every(o => str(o.value, 40) && str(o.label, 120))) { e.push(`${dw}: every option needs a saved value (up to 40 characters) and a label.`); stageErrors++; }
          else if (new Set(d.options.map(o => o.value)).size !== d.options.length) { e.push(`${dw}: two options have the same saved value.`); stageErrors++; }
          else if (!d.options.some(o => o.value === d.default)) { e.push(`${dw}: the default (used if time runs out) must be one of the options.`); stageErrors++; }
        }
      } else if (d.kind === 'number') {
        for (const k of ['min', 'max']) {
          if (isStatic(d[k])) continue;
          if (typeof d[k] !== 'string' || !d[k].trim()) { e.push(`${dw}: ${k} must be a number or a formula.`); stageErrors++; }
        }
        if (!(Number(d.step) > 0)) { e.push(`${dw}: the step must be greater than 0.`); stageErrors++; }
        if (!fin(d.default)) { e.push(`${dw}: the default (used if time runs out) must be a number.`); stageErrors++; }
        else if (isStatic(d.min) && isStatic(d.max)) {
          if (Number(d.min) > Number(d.max)) { e.push(`${dw}: the minimum is above the maximum.`); stageErrors++; }
          else if (d.default < Number(d.min) || d.default > Number(d.max)) { e.push(`${dw}: the default must be between the minimum and the maximum.`); stageErrors++; }
        }
      } else { e.push(`${dw}: choose a choice or a number.`); stageErrors++; }
    });
  });
  if (stageErrors) return;   // the checks below need a sound structure
  const steps = stepsOf(g), idx = decisionIndex(g);
  if (!steps.some(s => actorsOf(g, s).size)) e.push('No role decides anything.');

  // what each stage may show or refer to
  g.stages.forEach((st, i) => {
    const w = `Stage "${st.label}"`, step = steps.findIndex(s => s.stages.includes(i)), sm = st.strategyMethod;
    for (const id of st.show || []) {
      const info = idx.get(id);
      if (!info) e.push(`${w}: "show" lists "${id}", which is not a decision.`);
      else if (info.stage.strategyMethod) e.push(`${w}: "${id}" is stated with the strategy method, so it cannot be shown to others.`);
      else if (info.step >= step) e.push(`${w}: it can only show decisions from earlier steps, not "${id}".`);
      else if (sm && id === sm.on) e.push(`${w}: a stage using the strategy method cannot also show the decision it responds to.`);
    }
    if (sm) {
      if (st.decisions.length !== 1) e.push(`${w}: the strategy method needs exactly one decision in the stage.`);
      const on = idx.get(sm.on);
      if (!on) e.push(`${w}: the strategy method responds to "${sm.on}", which is not a decision.`);
      else {
        if (on.stageIndex >= i) e.push(`${w}: the strategy method must respond to a decision in an earlier stage.`);
        if (on.role === '*' || (g.roles.find(r => r.id === on.role) || {}).count !== 1) e.push(`${w}: the strategy method needs the decision it responds to to belong to a role with exactly one player.`);
        if (on.stage.role === st.role) e.push(`${w}: the strategy method responds to another role's decision.`);
        try { const dom = domainOf(on.decision, params); if (dom.length > MAX_TABLE_ROWS) e.push(`${w}: "${sm.on}" has more than ${MAX_TABLE_ROWS} possible values; use a threshold or fewer values.`); if (!dom.length) e.push(`${w}: "${sm.on}" has no possible values.`); }
        catch (x) { e.push(`${w}: the limits of "${sm.on}" must depend only on the constants (${x.message}).`); }
        if (sm.form === 'threshold') {
          const d = st.decisions[0];
          if (on.decision.kind !== 'number') e.push(`${w}: a threshold needs a number decision to respond to.`);
          if (!d || d.kind !== 'choice' || d.options.length !== 2) e.push(`${w}: a threshold decision must be a choice with exactly two options.`);
          else {
            if (!d.options.some(o => o.value === sm.above) || !d.options.some(o => o.value === sm.below) || sm.above === sm.below) e.push(`${w}: choose which option applies at or above the threshold and which below it.`);
          }
          if (!fin(Number(sm.defaultThreshold))) e.push(`${w}: set the threshold used if time runs out.`);
        } else if (sm.form !== 'table') e.push(`${w}: choose a table or a threshold.`);
      }
    }
    // limits that depend on earlier decisions
    for (const d of st.decisions) if (d.kind === 'number') for (const k of ['min', 'max']) {
      if (isStatic(d[k])) continue;
      checkExpr(d[k], `${w}, ${d.label}, ${k}`, id => {
        if (id in params || id === 'n' || id === 'round') return null;
        const m = /^seen\.([a-z][a-z0-9_]*)$/.exec(id);
        if (m) {
          const info = idx.get(m[1]);
          if (!info) return `"${id}" refers to a decision that does not exist.`;
          if (info.stage.strategyMethod) return `"${id}" is stated with the strategy method, so it is not known as a single value.`;
          if (info.step < step || (sm && m[1] === sm.on)) return null;
          return `"${id}" is not known yet when this decision is made (it is in the same or a later step).`;
        }
        return `unknown name "${id}". Use a constant, seen.<decision>, n, or round.`;
      }, e);
    }
  });

  // payoffs
  for (const r of g.roles) {
    const src = c.payoff && c.payoff[r.id];
    if (!str(src, 2000)) { e.push(`Payoff for ${r.label}: write a formula.`); continue; }
    const mine = new Set([...idx].filter(([, i]) => i.role === '*' || i.role === r.id).map(([id]) => id));
    const w = `Payoff for ${r.label}`;
    checkExpr(src, w, id => {
      if (id in params || id === 'n' || id === 'round') return null;
      let m;
      if ((m = /^my\.([a-z][a-z0-9_]*)$/.exec(id))) return mine.has(m[1]) ? null : idx.has(m[1]) ? `"${id}" is not a decision of ${r.label}; use role.<role>.${m[1]} or others.${m[1]}.` : `"${id}" is not a decision.`;
      if ((m = /^role\.([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(id))) {
        if (!roleIds.has(m[1])) return `"${id}": there is no role "${m[1]}".`;
        const info = idx.get(m[2]);
        return info && (info.role === '*' || info.role === m[1]) ? null : `"${id}": ${m[1]} does not make a decision "${m[2]}".`;
      }
      if ((m = /^others\.([a-z][a-z0-9_]*)$/.exec(id))) return idx.has(m[1]) ? null : `"${id}" is not a decision.`;
      if ((m = /^other\.([a-z][a-z0-9_]*)$/.exec(id))) return g.players !== 2 ? `"${id}" only works with two players; use others.${m[1]} or role.<role>.${m[1]}.` : idx.has(m[1]) ? null : `"${id}" is not a decision.`;
      return `unknown name "${id}". Use a constant, my.<decision>, role.<role>.<decision>, others.<decision>, other.<decision> (two players), n, or round.`;
    }, e);
  }
  for (const k of Object.keys(c.payoff || {})) if (!roleIds.has(k)) e.push(`There is a payoff formula for "${k}", which is not a role.`);

  // a trial run with default decisions catches type errors (for example, adding a list to a number)
  if (!e.length) {
    for (const cond of c.conditions) {
      const pr = paramsFor(c, cond.id);
      for (const [id, info] of idx) {
        const d = info.decision;
        if (d.kind !== 'number' || /seen\./.test(String(d.min) + String(d.max))) continue;
        try {
          const spec = specOf(d, envFor(pr, 0, {}, g.players));
          if (spec.min > spec.max) e.push(`Decision "${d.label}" (condition ${cond.id}): the minimum ${spec.min} is above the maximum ${spec.max}.`);
          else if (d.default < spec.min || d.default > spec.max) e.push(`Decision "${d.label}" (condition ${cond.id}): the default ${d.default} is outside ${spec.min} to ${spec.max}.`);
        } catch (x) { e.push(`Decision "${d.label}" (condition ${cond.id}): the limits fail (${x.message}).`); }
      }
      try { sampleOutcome(g, c, pr); }
      catch (x) { if (!/Division by zero/.test(x.message)) e.push(`The formulas fail when tried with default decisions (condition ${cond.id}): ${x.message}`); }
    }
  }

  // asynchronous play cannot show what another player just did, except through the strategy method
  if (g.mode === 'async' || g.waitFallback === 'async') {
    const why = g.mode === 'async' ? 'asynchronous play' : 'the asynchronous fallback';
    g.stages.forEach(st => {
      if (st.strategyMethod) return;
      if ((st.show || []).length) e.push(`Stage "${st.label}" shows another player's earlier decision, which ${why} cannot do. Use the strategy method for this stage, or remove "show".`);
      for (const d of st.decisions) if (d.kind === 'number') for (const k of ['min', 'max']) if (!isStatic(d[k]) && /seen\./.test(String(d[k]))) e.push(`Stage "${st.label}": the limit of "${d.label}" depends on an earlier decision, which ${why} cannot know. Use the strategy method.`);
    });
  }

  // feedback, payment, instructions, comprehension
  const fb = c.feedback || {};
  for (const k of ['ownPayoff', 'othersDecisions', 'groupTotal', 'history']) if (typeof fb[k] !== 'boolean') e.push('Feedback settings must be on or off.');
  const p = c.payment || {};
  if (!METHODS.includes(p.method)) e.push('Choose how the paid amount is determined.');
  if (!fin(p.pointsPerUnit) || p.pointsPerUnit < 0) e.push('Currency per point must be a number, 0 or more.');
  if (!str(p.currency, 8)) e.push('Enter a currency code or symbol (up to 8 characters).');
  if (!fin(p.showUpFee) || p.showUpFee < 0) e.push('The show-up fee must be a number, 0 or more.');
  if (p.maxBonus != null && (!fin(p.maxBonus) || p.maxBonus < 0)) e.push('The maximum bonus must be a number, 0 or more, or left blank for no cap.');
  const ins = c.instructions || {};
  if (typeof ins.general !== 'string' || ins.general.length > 6000) e.push('The general instructions are too long.');
  for (const [k, v] of Object.entries(ins.roles || {})) { if (!roleIds.has(k)) e.push(`Instructions are given for "${k}", which is not a role.`); else if (typeof v !== 'string' || v.length > 4000) e.push(`The instructions for ${k} are too long.`); }
  const cp = c.comprehension || {};
  if (cp.enabled) {
    if (!int(cp.maxAttempts, 1, 5)) e.push('Comprehension attempts must be a whole number from 1 to 5.');
    if (!Array.isArray(cp.questions) || cp.questions.length < 1 || cp.questions.length > 10) e.push('Add 1 to 10 comprehension questions, or turn the check off.');
    else {
      const qids = new Set();
      cp.questions.forEach((q, i) => {
        if (!ID_RE.test(q.id || '')) e.push(`Comprehension question ${i + 1}: invalid variable name.`);
        else if (qids.has(q.id)) e.push(`Two comprehension questions share the name "${q.id}".`);
        qids.add(q.id);
        if (!str(q.text, 500)) e.push(`Comprehension question ${i + 1}: the text is empty.`);
        if (q.displayIf != null || q.type === 'info' || (q.type != null && q.type !== 'number')) e.push(`Comprehension question ${i + 1}: these are plain numeric questions; conditional display, information text, and other question types belong in the start- and end-of-session surveys.`);
        if (!fin(q.answer)) e.push(`Comprehension question ${i + 1}: the correct answer must be a number.`);
        if (q.tolerance != null && (!fin(q.tolerance) || q.tolerance < 0)) e.push(`Comprehension question ${i + 1}: the tolerance must be a number, 0 or more.`);
      });
    }
  }
}

// One synthetic group playing the default decisions, used to test the formulas when content is saved.
export function sampleOutcome(game, content, params) {
  const steps = stepsOf(game), slots = slotRoles(game), members = slots.map((role, i) => ({ pid: 'm' + i, role })), raw = {}, seen = {};
  for (const step of steps) {
    for (const m of members) {
      if (!actorsOf(game, step).has(m.role)) continue;
      raw[m.pid] = { ...(raw[m.pid] || {}), ...autoValues(game, params, m.role, step, 0, seen, 'default', null, () => 0.5) };
    }
    for (const si of step.stages) for (const d of game.stages[si].decisions) {
      const first = members.find(m => stageActs(game.stages[si], m.role) && raw[m.pid] && d.id in raw[m.pid]);
      if (first && !game.stages[si].strategyMethod) seen[d.id] = raw[first.pid][d.id];
    }
  }
  return resolveGroup({ ...game, payoff: content.payoff }, params, 0, members, raw);
}

export function validateComprehensionInput(cp, answers) {
  const wrong = [];
  for (const q of cp.questions) {
    const a = Number(String((answers || {})[q.id] ?? '').trim().replace(/,/g, ''));
    if (!Number.isFinite(a) || Math.abs(a - q.answer) > (q.tolerance || 0) + 1e-9) wrong.push(q.id);
  }
  return wrong;
}

// The rules in one object (game settings plus payoff formulas): what plans snapshot and the rules module reads.
export const gameSpecOf = c => structuredClone(gameOf(c));
