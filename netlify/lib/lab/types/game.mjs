// Study type: game (economic games, live and asynchronous).
// A configurable game builder: players, roles, rounds, stages, payoff formulas, treatments, matching, timing, and
// payment are content (edited on the admin page), so a new game or treatment needs no code. Live play matches
// participants in real time and runs round by round; asynchronous play has people decide alone and matches them
// with stored decisions afterwards (strategy method for later movers). Rules and design: netlify/lib/lab/game/*.mjs
// and static/lab/README.md ("Economic games"). Participant renderer: static/lab/engine/types/game.js.
import { gameOf, paramsFor, payoffTable, totalRounds, fillText, textVars, stepsOf, stageActs, autoValues } from '../game/rules.mjs';
import { defaultGame, normalizeGame, validateGame, validateComprehensionInput } from '../game/model.mjs';
import { presetList, presetContent } from '../game/presets.mjs';
import { K, SESSION, getOnce, writeOnce, loadCtx, writeUnplayed, roundInfo } from '../game/shared.mjs';
import { livePoll, confirmReady, submitMove, confirmRound, closeCohort } from '../game/live.mjs';
import { asyncState, asyncSave, assignRole, effectiveMode, ALL_STAGES, resolvePending } from '../game/async.mjs';
import { exportTrials, groupRows, groupsCsv, paymentRows, paymentsCsv, prolificRows, prolificCsv, paymentSummary, paymentRowFor, statusReport } from '../game/export.mjs';
import { purgeGameKeys } from '../game/purge.mjs';
import { runSelfTest } from '../game/selftest.mjs';
import { normalize as normalizeContent, validateContent } from '../content.mjs';

const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Instructions', 'instr_title', 'Title', 'How the game works'),
  F('Instructions', 'instr_intro', 'Instructions ({n} = rounds, including practice)', 'You will play {n} round(s) of a decision game. Read how it works below before you start.'),
  F('Instructions', 'start_body', 'Before starting ({minutes})', 'This session takes about {minutes} minutes. Please finish it in one sitting and keep this page open. Other participants may be waiting for your decisions.\n\nIf you get disconnected, sign in again and you will return to your game.'),
  F('Instructions', 'game_payoff_table', 'Payoff table heading', 'Points for each pair of choices'),
  F('Instructions', 'game_payoff_you', 'Payoff table: how a cell is read', 'Each cell shows your points first, then the other participant\'s points.'),
  F('Instructions', 'game_payment_note', 'How the bonus works ({rule})', 'Points are converted to a bonus at the end. {rule}'),
  F('Instructions', 'begin_button', 'Begin button', 'Continue'),
  F('End of session', 'finished_body', 'Last session: text', 'Thank you. Your decisions are saved. Your bonus is paid after the study closes, using the points from your paid round.'),
  F('Understanding check', 'game_comp_title', 'Title', 'Check your understanding'),
  F('Understanding check', 'game_comp_intro', 'Introduction ({n} = attempts)', 'Answer these questions about the instructions. You have {n} attempt(s). Type numbers only.'),
  F('Understanding check', 'game_comp_button', 'Button', 'Check my answers'),
  F('Understanding check', 'game_comp_wrong', 'After a wrong answer ({left} = attempts left)', 'Some answers are not correct. Read the instructions again and try once more. Attempts left: {left}.'),
  F('Understanding check', 'game_comp_failed_title', 'Failed: title', 'You cannot take part in the game'),
  F('Understanding check', 'game_comp_failed_body', 'Failed: text', 'Some answers were not correct, so you cannot take part in the game with other participants. You will receive the show-up fee. Thank you for your time.'),
  F('Waiting room', 'game_lobby_title', 'Title', 'Waiting for other participants'),
  F('Waiting room', 'game_lobby_body', 'Text ({m} = players per group)', 'The game starts when {m} participants are ready. Keep this page open.'),
  F('Waiting room', 'game_lobby_count', 'Count ({n}, {m})', 'Waiting for other participants ({n} of {m})'),
  F('Waiting room', 'game_lobby_elapsed', 'Elapsed time ({time})', 'Waiting time: {time}'),
  F('Waiting room', 'game_lobby_returned', 'After a group could not start', 'The group could not start because someone did not confirm in time. You are back in the waiting room, first in line.'),
  F('Waiting room', 'game_timeout_title', 'After the maximum wait: title', 'Not enough participants yet'),
  F('Waiting room', 'game_timeout_body', 'After the maximum wait: text', 'It is taking longer than expected to find other participants.'),
  F('Waiting room', 'game_keep_waiting', 'Keep waiting button', 'Keep waiting'),
  F('Waiting room', 'game_fallback_fee', 'Button: finish with the show-up fee only', 'Finish now and receive the show-up fee only'),
  F('Waiting room', 'game_fallback_async', 'Button: play against stored decisions', 'Play now against decisions other participants have already made'),
  F('Waiting room', 'game_fee_title', 'After finishing with the fee: title', 'You will receive the show-up fee'),
  F('Waiting room', 'game_fee_body', 'After finishing with the fee: text', 'No group could be formed, so there is no game for you. You will receive the show-up fee. Continue to the last questions.'),
  F('Match', 'game_ready_title', 'Title', 'You have been matched'),
  F('Match', 'game_ready_body', 'Text ({role})', 'Your role: {role}. Read what your role does, then press the button when you are ready. The game starts when everyone has pressed it.'),
  F('Match', 'game_ready_button', 'Button', 'I am ready'),
  F('Match', 'game_ready_wait', 'After pressing ({k}, {n})', 'You are ready. {k} of {n} participants have confirmed.'),
  F('Round', 'game_role_label', 'Your role ({role})', 'Your role: {role}'),
  F('Round', 'game_async_intro_title', 'Role screen title (asynchronous)', 'Your role'),
  F('Round', 'game_wait_title', 'Waiting: title', 'Please wait'),
  F('Round', 'game_wait_title_round', 'Waiting at the start of a round: title', 'Waiting for the next round'),
  F('Round', 'game_time_left', 'Time left ({time})', 'Time left: {time}'),
  F('Round', 'game_time_over', 'When time runs out', 'Time is up. Your decision will be made for you.'),
  F('Round', 'game_round_practice', 'Progress line, practice round ({i}, {n})', 'Practice round {i} of {n}'),
  F('Round', 'progress_trial', 'Progress line ({i}, {n})', 'Round {i} of {n}'),
  F('Round', 'game_practice_note', 'Practice round note', 'This is a practice round. It does not count toward your payment.'),
  F('Round', 'game_shown', 'Heading for what another participant chose', 'What was chosen before you'),
  F('Round', 'game_strategy_intro', 'Strategy table: introduction', 'Say what you would choose for each possible earlier choice. Only the one that was actually made is used.'),
  F('Round', 'game_threshold_label', 'Threshold: question ({what})', 'What is the smallest {what} you would accept? Anything lower is rejected.'),
  F('Round', 'game_submit', 'Submit button', 'Send my decision'),
  F('Round', 'game_passive', 'Role with no decision', 'You do not make a decision in this game. Your points depend on what other participants decide.'),
  F('Round', 'game_wait_others', 'Waiting for others ({k}, {n})', 'Waiting for the other participants ({k} of {n} have decided).'),
  F('Round', 'game_wait_turn', 'Waiting for another role ({who})', 'Waiting for {who} to decide.'),
  F('Round', 'game_wait_arrivals', 'Waiting at the start of a round ({k}, {n})', 'Waiting for the other participants to continue ({k} of {n}).'),
  F('Round', 'game_wait_dropped', 'For a player who was removed', 'You were removed from this game because decisions were not made in time. You will still receive the show-up fee. Please wait; you can continue when the game ends.'),
  F('Round', 'game_notice_left', 'Notice to the others', 'A participant has left the game. Their decisions are now made automatically.'),
  F('Round', 'game_auto', 'Marks a decision made for you', '(made for you because time ran out)'),
  F('Results', 'game_feedback_title', 'Title ({i})', 'Round {i} result'),
  F('Results', 'game_feedback_payoff', 'Own payoff ({points})', 'Your points this round: {points}'),
  F('Results', 'game_feedback_total', 'Group total ({points})', 'Group total this round: {points} points'),
  F('Results', 'game_feedback_you', 'Column: you', 'You'),
  F('Results', 'game_feedback_others', 'Column: others', 'Others'),
  F('Results', 'game_feedback_next', 'Next round button', 'Next round'),
  F('Results', 'game_feedback_last', 'Last round button', 'Continue'),
  F('Results', 'game_history_title', 'Earlier rounds heading', 'Earlier rounds'),
  F('Results', 'game_not_played', 'Round not played', 'You did not play this round.'),
  F('Results', 'game_async_saved', 'Asynchronous: after your decision', 'Your decision is saved. Your result is worked out when your decisions are matched with those of other participants.'),
  F('Payment', 'game_summary_title', 'Title', 'Your payment'),
  F('Payment', 'game_summary_round', 'Paid round ({round}, {points})', 'Round {round} was chosen at random for payment: {points} points.'),
  F('Payment', 'game_summary_total', 'Sum or mean of all rounds ({points})', 'Your points for payment: {points}.'),
  F('Payment', 'game_summary_bonus', 'Bonus ({bonus}, {currency})', 'Bonus: {bonus} {currency}.'),
  F('Payment', 'game_summary_fee', 'Show-up fee ({fee}, {currency})', 'Show-up fee: {fee} {currency}.'),
  F('Payment', 'game_summary_pending', 'Not matched yet', 'Your points can be worked out once another participant has finished. You will be paid then.')
];

const lockedKeys = ['game', 'payoff', 'params', 'conditions', 'feedback', 'payment', 'instructions', 'comprehension'];

function publicGame(g) {
  const { spec, params } = g, steps = stepsOf(spec), tv = textVars(spec, params);
  return {
    mode: spec.mode, players: spec.players, roles: spec.roles, rounds: spec.rounds, practiceRounds: spec.practiceRounds, matching: spec.matching,
    decisionSeconds: spec.decisionSeconds, readySeconds: spec.readySeconds, waitMaxSeconds: spec.waitMaxSeconds, waitFallback: spec.waitFallback, feedbackSeconds: spec.feedbackSeconds, pollSeconds: spec.pollSeconds,
    stages: spec.stages.map((st, si) => ({ id: st.id, label: st.label, role: st.role, step: steps.findIndex(s => s.stages.includes(si)), prompt: fillText(st.prompt, tv), show: st.show || [],
      strategy: st.strategyMethod ? { on: st.strategyMethod.on, form: st.strategyMethod.form } : null,
      decisions: st.decisions.map(d => ({ id: d.id, label: d.label, kind: d.kind, options: d.kind === 'choice' ? d.options : undefined })) })),
    params, payoffTable: payoffTable(spec, params), feedback: g.feedback,
    instructions: { general: fillText(g.instructions.general, tv), roles: Object.fromEntries(Object.entries(g.instructions.roles || {}).map(([k, v]) => [k, fillText(v, tv)])) },
    payment: { method: g.payment.method, pointsPerUnit: g.payment.pointsPerUnit, currency: g.payment.currency, showUpFee: g.payment.showUpFee, maxBonus: g.payment.maxBonus },
    comprehension: { enabled: !!g.comprehension.enabled, maxAttempts: g.comprehension.maxAttempts, questions: (g.comprehension.questions || []).map(q => ({ id: q.id, text: q.text })) }
  };
}

// ---------- participant routes (token required; see router.mjs) ----------
const bad = (error, status = 400) => ({ error, status });

async function compState(S, ctx, pid) {
  const cp = ctx.g.comprehension || {};
  if (!cp.enabled) return { required: false };
  const [pass, fail] = await Promise.all([getOnce(S.store, K.compPass(pid)), getOnce(S.store, K.compFail(pid))]);
  const used = pass || fail ? 0 : (await S.store.list(`g/p/${pid}/comp/`)).length;
  return { required: true, passed: !!pass, failed: !!fail, left: Math.max(0, cp.maxAttempts - used), max: cp.maxAttempts };
}

async function gamePoll(S, pid, body, now) {
  const ctx = await loadCtx(S, pid);
  if (ctx.error) return ctx;
  const base = { serverNow: now };
  const fb = await getOnce(S.store, K.fallback(pid));
  if (fb && fb.to === 'fee') return { ...base, phase: 'fee', reason: 'no_match' };
  const comp = await compState(S, ctx, pid);
  if (comp.failed) return { ...base, phase: 'fee', reason: 'comprehension' };
  if (comp.required && !comp.passed) return { ...base, phase: 'comprehension', attemptsLeft: comp.left, max: comp.max, questions: ctx.g.comprehension.questions.map(q => ({ id: q.id, text: q.text })) };
  if (ctx.spec.mode === 'async' || (fb && fb.to === 'async')) return asyncState(S, ctx, pid, body, now);
  return livePoll(S, ctx, pid, body, now);
}

async function gameMove(S, pid, body, now) {
  const ctx = await loadCtx(S, pid);
  if (ctx.error) return ctx;
  if ((await effectiveMode(S, ctx)) === 'async') return bad('not_live', 409);
  return submitMove(S, ctx, pid, body, now);
}
async function gameReady(S, pid, body, now) {
  const ctx = await loadCtx(S, pid);
  return ctx.error ? ctx : confirmReady(S, ctx, pid, body, now);
}

async function gameCheck(S, pid, body, now) {
  const ctx = await loadCtx(S, pid);
  if (ctx.error) return ctx;
  const cp = ctx.g.comprehension;
  if (!cp.enabled) return { ok: true, passed: true };
  if (await getOnce(S.store, K.compPass(pid))) return { ok: true, passed: true };
  if (await getOnce(S.store, K.compFail(pid))) return { ok: true, failed: true };
  const used = (await S.store.list(`g/p/${pid}/comp/`)).length;
  if (used >= cp.maxAttempts) { await writeOnce(S.store, K.compFail(pid), { at: now }); await writeUnplayed(S, ctx, 'comprehension', now); return { ok: true, failed: true }; }
  const answers = {};
  for (const q of cp.questions) { const t = String((body.answers || {})[q.id] ?? '').trim().replace(/,/g, ''); answers[q.id] = t.slice(0, 40); }
  const wrong = validateComprehensionInput(cp, answers);
  await writeOnce(S.store, K.comp(pid, used), { at: now, wrong, answers });
  if (!wrong.length) { await writeOnce(S.store, K.compPass(pid), { at: now }); return { ok: true, passed: true }; }
  if (used + 1 >= cp.maxAttempts) { await writeOnce(S.store, K.compFail(pid), { at: now }); await writeUnplayed(S, ctx, 'comprehension', now); return { ok: true, failed: true }; }
  return { ok: true, passed: false, wrong, attemptsLeft: cp.maxAttempts - used - 1 };
}

// After the maximum wait the participant may leave with the show-up fee or switch to asynchronous play (as configured).
async function gameFallback(S, pid, body, now) {
  const ctx = await loadCtx(S, pid);
  if (ctx.error) return ctx;
  const { spec } = ctx;
  if (spec.mode !== 'live') return bad('not_live', 409);
  if (await getOnce(S.store, K.fallback(pid))) return { ok: true, repeat: true };
  if (body.to !== spec.waitFallback) return bad('bad_fallback');
  const lobby = await getOnce(S.store, K.lobby(pid));
  if (!lobby || now - lobby.at < spec.waitMaxSeconds * 1000) return bad('too_early', 409);
  const { findMembership } = await import('../game/live.mjs');
  if (await findMembership(S, pid)) return bad('already_matched', 409);
  const w = await writeOnce(S.store, K.fallback(pid), { to: spec.waitFallback, at: now });
  if (w.value.to === 'fee') await writeUnplayed(S, ctx, 'no_match', now);
  else await assignRole(S, ctx, now);
  return { ok: true, to: w.value.to };
}

// External IDs (for example Prolific's PROLIFIC_PID, STUDY_ID, SESSION_ID) read from the address at the start.
// The other branch may add a general embedded-data feature; this keeps the one thing payments need.
async function gameExt(S, pid, body, now) {
  const clean = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : '');
  const ext = { prolificPid: clean(body.prolificPid), studyId: clean(body.studyId), sessionId: clean(body.sessionId), at: now };
  if (!ext.prolificPid) return { ok: true, ignored: true };
  const w = await writeOnce(S.store, K.ext(pid), ext);
  return { ok: true, repeat: !w.created };
}

async function gameSummary(S, pid, body, now) {
  const p = await S.store.get(`participants/${pid}`);
  if (!p) return bad('invalid_code', 401);
  const row = await paymentRowFor(S, p);
  if (!row) return bad('no_session', 409);
  const ctx = await loadCtx(S, pid), pay = ctx.g.payment;
  return { ok: true, method: pay.method, paidRound: row.paid_round, points: row.points === '' ? null : row.points, bonus: row.bonus === '' ? null : row.bonus, fee: row.show_up_fee, currency: pay.currency, status: row.match_status, capped: !!row.capped };
}

const routes = { 'game/poll': gamePoll, 'game/move': gameMove, 'game/ready': gameReady, 'game/check': gameCheck, 'game/fallback': gameFallback, 'game/ext': gameExt, 'game/summary': gameSummary };

// ---------- admin routes (roles checked by the router) ----------
const adminRoutes = {
  'game-status': { need: 'viewer', handler: (S, { now }) => statusReport(S, now) },
  'game-groups': { need: 'viewer', handler: (S, { url }) => groupRows(S, { offset: Math.max(0, Number(url.searchParams.get('offset')) || 0), limit: Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 25)) }) },
  'groups.csv': { need: 'viewer', handler: async S => ({ csv: await groupsCsv(S), filename: `${S.study.id}_groups.csv` }) },
  'payments': { need: 'manager', handler: async (S, { now }) => { const rows = await paymentRows(S, now); return { rows, summary: paymentSummary(rows), prolific: prolificRows(rows).skipped }; } },
  'payments.csv': { need: 'manager', handler: async (S, { now }) => ({ csv: paymentsCsv(await paymentRows(S, now)), filename: `${S.study.id}_payments.csv` }) },
  'payments-prolific.csv': { need: 'manager', handler: async (S, { now }) => ({ csv: prolificCsv(prolificRows(await paymentRows(S, now)).rows), filename: `${S.study.id}_prolific_bonus.csv` }) },
  // Checks a draft without saving it (the editor's "Check the design" button): the same validation a save runs.
  'game-check': { need: 'viewer', post: true, handler: (S, { body }) => ({ ok: true, errors: body && body.content && typeof body.content === 'object' ? validateContent(normalizeContent(structuredClone(body.content), S.type), S.type) : ['No content to check.'] }) },
  'game-resolve': { need: 'manager', post: true, handler: async (S, { now, audit }) => { const r = await resolvePending(S, now); await audit('game.resolve', `${r.resolved} matched, ${r.stillPending} still pending`); return { ok: true, ...r }; } },
  'game-close': { need: 'manager', post: true, handler: async (S, { body, now, who, audit }) => {
    const cid = String(body.cohort || ''); if (!/^c\d+-\d+$/.test(cid)) return bad('bad_cohort');
    const r = await closeCohort(S, cid, now, who.name); if (r.ok) await audit('game.close', `${cid}: ${r.rounds} rounds closed`); return r; } }
};

// ---------- the type ----------
export default {
  id: 'game',
  label: 'Economic game (live or asynchronous)',
  description: 'Games such as the prisoner\'s dilemma, public goods, trust, ultimatum, and dictator games, or your own: players matched live round by round, or deciding alone and matched with stored decisions. Payoffs are formulas, treatments are constants, and bonuses are exported.',
  contentKeys: lockedKeys,
  textFields,
  surveyRules: [],
  routes, adminRoutes,
  conditionsOf: c => (c.conditions || []).map(x => x.id),
  sessionCount: () => 1,
  editorMeta: () => ({ presets: presetList().map(p => ({ ...p, content: presetContent(p.id) })) }),
  defaultContent: () => defaultGame(),
  normalize: (c, d) => normalizeGame(c, d),
  validate: (c, e) => validateGame(c, e),
  publicContent: () => ({ game: true }),

  buildPlan(p, session, c) {
    const spec = gameOf(c), params = paramsFor(c, p.condition), total = totalRounds(spec);
    return {
      trials: Array.from({ length: total }, (_, i) => ({ index: i, practice: i < spec.practiceRounds })),
      practice: null,
      game: { spec: structuredClone(spec), params, condition: p.condition, feedback: structuredClone(c.feedback), payment: structuredClone(c.payment), instructions: structuredClone(c.instructions), comprehension: structuredClone(c.comprehension) }
    };
  },
  publicTrial: t => ({ practice: !!t.practice }),
  publicPlanExtras: plan => ({ game: publicGame(plan.game) }),

  // Pure validation of one asynchronous round (the server takes the role from its own record, passed as plan.role).
  cleanTrialData(data, t, plan) {
    const g = plan.game, role = plan.role;
    if (!g || !role) return { values: {} };
    return { values: data && typeof data.values === 'object' ? data.values : {}, rtMs: Number.isFinite(Number(data && data.rtMs)) ? Number(data.rtMs) : null };
  },
  recordFields: (t, plan) => ({ practice: !!t.practice, role: plan.role || null }),
  trialRow(r) { const d = r.data || {}; return { round: d.roundNo ?? '', practice: d.practice ? 1 : 0, role: r.role || '', cohort: r.cohort || '', group: r.group ?? '', played: d.played ? 1 : 0 }; },

  saveTrialHook: async (S, p, plan, index, data, now) => {
    const ctx = await loadCtx(S, p.code);
    if (ctx.error) return ctx;
    const cp = await compState(S, ctx, p.code);
    if (cp.required && !cp.passed && !cp.failed) return bad('comprehension_required', 409);
    if ((await effectiveMode(S, ctx)) === 'async') return asyncSave(S, ctx, p.code, index, data || {}, now);
    return confirmRound(S, ctx, p.code, index, now);
  },
  exportTrials,
  purgeParticipant: purgeGameKeys,
  // State the downloadable backup needs beyond the round records: matches (with copies of the partners' decisions), payment draws, external IDs, fallbacks.
  async backupExtras(S, codes) {
    const out = [];
    for (const pid of codes) for (const k of await S.store.list(`g/p/${pid}/`)) out.push({ key: k, value: await S.store.get(k) });
    return out;
  },
  runSelfTest,

  // Decisions for the generic self-test contract: random valid decisions for the role in plan.role.
  simulate(trial, plan, rand) {
    const g = plan.game, role = plan.role, values = role ? autoValues(g.spec, g.params, role, ALL_STAGES(g.spec), trial.index, {}, 'random', null, rand) : {};
    return { values, rtMs: 1500 };
  },
  checkRow(row, sent) {
    const problems = [];
    for (const [id, v] of Object.entries(sent.values || {})) {
      if (v && typeof v === 'object') continue;   // strategy answers are checked through the strategy column
      if (String(row['d_' + id]) !== String(v)) problems.push(`decision ${id}`);
    }
    return problems;
  },
  checkSession(rows, session, condition, c) {
    const spec = gameOf(c), want = totalRounds(spec) * spec.stages.length;
    return [[rows.length === want, `Session ${session}: one row per round and stage (${want})`]];
  }
};
