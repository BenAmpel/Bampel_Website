// Study type: quiz (graded questions for a class). Each question is one engine trial, so it is saved as it is answered,
// with the same behavior traces and data-quality signals as any study, and exported as one row. Answer keys stay on
// the server: the browser gets the question and its options in this student's order, never which one is right, and
// scoring is done here from the stored copy of the question as it was shown.
//   pools       questions that share a pool name fill one slot; each student gets one of them, drawn at random
//   order       questions (shuffleItems) and options (shuffleOptions, unless the question keeps its order) are
//               shuffled per student; the order is kept in the plan, so a regrade sees exactly what was on screen
//   time limit  counted from the plan's creation on the server, not the browser clock; a student's timeFactor
//               (extra time, 1 to 4) multiplies it. Answers that arrive after the limit plus a grace period are kept
//               and marked late; they score 0
//   text        short-text answers are kept (sealed when the study has a key) and left for the instructor to grade
// Participant renderer: static/lab/engine/types/quiz.js. Editor: quiz-admin.js.
const F = (group, key, label, def) => ({ group, key, label, def });
// Quiz wording for the engine's screens (they say "session" and "study" by default), then the quiz's own.
const textFields = [
  F('Session start', 'start_title', 'Title ({session}, {total})', 'Quiz'),
  F('Session start', 'start_body', 'Before starting', 'Set aside time to finish the quiz in one sitting. If it has a time limit, the clock starts when you press the button below and keeps running if you close the page.\n\nIf you get disconnected, sign in again and you will pick up where you left off.'),
  F('Session start', 'start_button', 'Start button ({session})', 'Start the quiz'),
  F('Instructions', 'instr_title', 'Title', 'How this quiz works'),
  F('End of session', 'done_title', 'Title', 'Attempt submitted'),
  F('End of session', 'done_body', 'Text', 'Your answers are saved.'),
  F('End of session', 'finished_title', 'Last session: title', 'Quiz submitted'),
  F('End of session', 'finished_body', 'Last session: text', 'Your answers are saved. You can close this page.'),
  F('Instructions', 'instr_intro', 'Instructions ({n} = questions)', 'This quiz has {n} questions, shown one at a time.'),
  F('Item screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Question {i} of {n}'),
  F('Item screen', 'progress_practice', 'Progress line, practice', 'Practice'),
  F('Quiz', 'quiz_final_note', 'How answers work', 'Your answer to each question is saved when you press Next. You cannot go back to change it.'),
  F('Quiz', 'quiz_time_note', 'The time limit ({minutes})', 'You have {minutes} minutes. The clock started when you opened the quiz and keeps running if you close the page.'),
  F('Consent', 'consent_title', 'Title of the page before the quiz (the consent page; its text says what is recorded)', 'Before you start'),
  F('Consent', 'decline_body', 'Shown after "I do not agree"', 'You chose not to start the quiz. Talk to your instructor about another way to take it.'),
  F('Quiz', 'quiz_next', 'Next button', 'Next'),
  F('Quiz', 'quiz_last', 'Button on the last question', 'Submit quiz'),
  F('Quiz', 'quiz_left', 'Time left ({time})', '{time} left'),
  F('Quiz', 'quiz_time_up', 'When time runs out', 'Time is up. Your answers so far have been saved.'),
  F('Quiz', 'quiz_choose_one', 'Hint under a one-answer question', 'Choose one.'),
  F('Quiz', 'quiz_choose_all', 'Hint under a several-answer question', 'Choose all that apply.'),
  F('Quiz', 'quiz_number_hint', 'Hint under a number question', 'Type a number.'),
  F('Quiz', 'quiz_skip_confirm', 'Asked when Next is pressed with no answer', 'You have not answered this question. Press Next again to move on without an answer.'),
  F('Quiz', 'quiz_points', 'Points line ({points})', '{points} points'),
  F('Quiz', 'quiz_point_one', 'Points line for a 1-point question', '1 point')
];

export const KINDS = { single: 'One answer', multi: 'Several answers', number: 'Number', text: 'Short text (graded by hand)' };
export const GRACE_MS = 30000;
const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const fin = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const MAX_TEXT = 5000;

function validateItem(it, i, e) {
  const w = `Question ${i + 1}${it && it.id ? ` (${it.id})` : ''}`;
  if (!it || typeof it !== 'object') { e.push(`${w}: missing.`); return; }
  if (!ID_RE.test(it.id || '')) e.push(`${w}: the ID must start with a letter and use only lowercase letters, numbers, and underscores (up to 40).`);
  if (!Object.hasOwn(KINDS, it.kind)) e.push(`${w}: choose the kind of question.`);
  if (!str(it.prompt, MAX_TEXT)) e.push(`${w}: the question text is empty.`);
  if (!fin(it.points, 0, 100)) e.push(`${w}: points must be a number from 0 to 100.`);
  if (it.pool != null && it.pool !== '' && !ID_RE.test(it.pool)) e.push(`${w}: the pool name uses lowercase letters, numbers, and underscores.`);
  if (it.kind === 'single' || it.kind === 'multi') {
    const opts = Array.isArray(it.options) ? it.options : [];
    if (opts.length < 2 || opts.length > 12) e.push(`${w}: give 2 to 12 options.`);
    if (!opts.every(o => str(o, 500))) e.push(`${w}: every option needs text (up to 500 characters).`);
    if (it.kind === 'single' && !int(it.answer, 0, opts.length - 1)) e.push(`${w}: mark which option is right.`);
    if (it.kind === 'multi' && !(Array.isArray(it.answer) && it.answer.length && it.answer.every(a => int(a, 0, opts.length - 1)) && new Set(it.answer).size === it.answer.length))
      e.push(`${w}: mark at least one right option.`);
  }
  if (it.kind === 'number' && !(it.answer && fin(it.answer.value, -1e12, 1e12) && fin(it.answer.tolerance, 0, 1e12))) e.push(`${w}: give the right number and how far off an answer may be (0 for exact).`);
}

function validateQuiz(q, e) {
  if (!q || typeof q !== 'object') { e.push('The quiz settings are missing.'); return; }
  if (!int(q.timeLimitMin, 0, 600)) e.push('The time limit must be a whole number of minutes from 0 (none) to 600.');
  if (typeof q.shuffleItems !== 'boolean' || typeof q.shuffleOptions !== 'boolean') e.push('Choose whether questions and options are shuffled.');
  const items = Array.isArray(q.items) ? q.items : [];
  if (!items.length) e.push('Add at least one question.');
  if (items.length > 300) e.push('A quiz can have up to 300 questions.');
  items.forEach((it, i) => validateItem(it, i, e));
  const ids = items.map(it => it && it.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) e.push(`Question IDs must be unique (repeated: ${[...new Set(dup)].join(', ')}).`);
  // A pool is one slot, so every student must be able to earn the same points from it whichever question they get.
  const pts = {};
  for (const it of items) if (it && it.pool) (pts[it.pool] = pts[it.pool] || new Set()).add(it.points);
  for (const [pool, s] of Object.entries(pts)) if (s.size > 1) e.push(`Pool "${pool}": every question in a pool must be worth the same points.`);
}

// The slots of a quiz, in the editor's order: one per question without a pool, one per pool (where its first
// question stands).
export function slotsOf(items) {
  const out = [], at = new Map();
  for (const it of items) {
    const key = it.pool ? `pool:${it.pool}` : `item:${it.id}`;
    if (!at.has(key)) { at.set(key, out.length); out.push({ key, items: [] }); }
    out[at.get(key)].items.push(it);
  }
  return out;
}

export const timeFactor = p => (fin(p && p.timeFactor, 1, 4) ? p.timeFactor : 1);
const hasOptions = it => it.kind === 'single' || it.kind === 'multi';

// The score of one saved question: { correct: 1 | 0 | '' (not scored yet), points: number | '' }.
export function scoreRecord(r) {
  const it = r.item || {}, d = r.data || {};
  if (it.kind === 'text') return { correct: '', points: '' };
  let right = false;
  if (!d.late) {
    if (it.kind === 'single') right = Number.isInteger(d.choice) && d.choice === it.answer;
    else if (it.kind === 'multi') right = Array.isArray(d.choices) && d.choices.length === it.answer.length && it.answer.every(a => d.choices.includes(a));
    else if (it.kind === 'number') right = typeof d.number === 'number' && Math.abs(d.number - it.answer.value) <= it.answer.tolerance + 1e-9;
  }
  return { correct: right ? 1 : 0, points: right ? it.points : 0 };
}

const answered = d => d.choice != null || (Array.isArray(d.choices) && d.choices.length > 0) || d.number != null || (d.text != null && d.text !== '');

export default {
  id: 'quiz',
  label: 'Quiz (graded questions)',
  description: 'A graded quiz for a class: one-answer, several-answer, number, and short-text questions, answer keys kept on the server, question pools, per-student shuffling, and a time limit counted on the server. Every question keeps the behavior traces and data-quality signals the lab records for any study.',
  contentKeys: ['design', 'quiz'],
  textFields,
  surveyRules: [],
  conditionsOf: c => (c.design?.conditions || []).map(x => x.id),
  sessionCount: c => c.design.sessions.length,
  editorMeta: () => ({ kinds: KINDS }),

  defaultContent() {
    return {
      minutesPerSession: 15,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], sessions: [{ name: 'Quiz' }] },
      quiz: { timeLimitMin: 15, shuffleItems: true, shuffleOptions: true, items: [
        { id: 'q1', kind: 'single', prompt: 'Which of these is the strongest sign that an email is phishing?', options: ['It has a logo', 'The link goes to a different domain than the sender\'s', 'It was sent in the morning', 'It is short'], answer: 1, points: 1, pool: '', keepOrder: false },
        { id: 'q2', kind: 'multi', prompt: 'Which of these are forms of multi-factor authentication?', options: ['An authenticator app code', 'A hardware security key', 'A longer password', 'A text message code'], answer: [0, 1, 3], points: 1, pool: '', keepOrder: false },
        { id: 'q3', kind: 'number', prompt: 'A password uses 8 characters, each one of 26 lowercase letters. How many bits of entropy is that, to one decimal place?', options: [], answer: { value: 37.6, tolerance: 0.1 }, points: 1, pool: '', keepOrder: false },
        { id: 'q4', kind: 'text', prompt: 'In one or two sentences, explain why reusing a password across sites is risky.', options: [], answer: null, points: 2, pool: '', keepOrder: false }
      ] }
    };
  },
  normalize(c, d) {
    c.design = c.design && typeof c.design === 'object' ? c.design : structuredClone(d.design);
    if (!Array.isArray(c.design.sessions) || !c.design.sessions.length) c.design.sessions = structuredClone(d.design.sessions);
    if (!Array.isArray(c.design.conditions) || !c.design.conditions.length) c.design.conditions = structuredClone(d.design.conditions);
    c.quiz = { ...d.quiz, ...(c.quiz || {}) };
    if (!Array.isArray(c.quiz.items)) c.quiz.items = [];
    for (const it of c.quiz.items) if (it && typeof it === 'object') {
      if (!Array.isArray(it.options)) it.options = [];
      if (it.pool == null) it.pool = '';
      if (typeof it.keepOrder !== 'boolean') it.keepOrder = false;
    }
  },
  validate(c, e) {
    const d = c.design;
    if (!d || !Array.isArray(d.conditions) || !d.conditions.length) e.push('Add at least one condition.');
    else if (!d.conditions.every(x => /^[a-z][a-z0-9_-]{0,30}$/.test(x.id || ''))) e.push('Condition IDs use lowercase letters, numbers, dashes, and underscores.');
    if (!d || !Array.isArray(d.sessions) || !d.sessions.length || d.sessions.length > 20) e.push('Use 1 to 20 sessions.');
    validateQuiz(c.quiz, e);
  },

  // Every session gives the same quiz (a second session is a second attempt, drawn and shuffled again).
  buildPlan(p, session, c, rand, { shuffle }) {
    const q = c.quiz, slots = slotsOf(q.items).map(s => ({ key: s.key, item: s.items[Math.floor(rand() * s.items.length)] }));
    const order = q.shuffleItems ? shuffle(slots, rand) : slots;
    const trials = order.map((s, i) => {
      const n = hasOptions(s.item) ? s.item.options.length : 0, ident = Array.from({ length: n }, (_, k) => k);
      return { index: i, slot: s.key, item: structuredClone(s.item), optOrder: q.shuffleOptions && !s.item.keepOrder ? shuffle(ident, rand) : ident };
    });
    const limitMs = q.timeLimitMin ? Math.round(q.timeLimitMin * 60000 * timeFactor(p)) : 0;
    return { quiz: { limitMs, startedAt: Date.now() }, trials, practice: null };
  },
  // The question and its options in this student's order; never the answer, the question's ID, or its pool.
  publicTrial(t) {
    const it = t.item;
    return { q: { kind: it.kind, prompt: it.prompt, points: it.points, options: t.optOrder.map(k => it.options[k]) } };
  },
  publicPlanExtras: plan => {
    const z = plan.quiz || {};
    return { quiz: { limitMs: z.limitMs || 0, remainingMs: z.limitMs ? Math.max(0, z.startedAt + z.limitMs - Date.now()) : null } };
  },

  // What the browser sends refers to positions on screen; it is stored as the editor's option numbers.
  cleanTrialData(d, t, plan) {
    d = d && typeof d === 'object' ? d : {};
    const it = t.item, shown = t.optOrder, out = { choice: null, choices: null, number: null, text: null };
    if (it.kind === 'single' && int(d.choice, 0, shown.length - 1)) out.choice = shown[d.choice];
    if (it.kind === 'multi' && Array.isArray(d.choices)) {
      const picked = [...new Set(d.choices.filter(x => int(x, 0, shown.length - 1)).map(x => shown[x]))].sort((a, b) => a - b);
      out.choices = picked.length ? picked : null;
    }
    if (it.kind === 'number') { const v = typeof d.number === 'string' && d.number.trim() !== '' ? Number(d.number) : d.number; if (fin(v, -1e15, 1e15)) out.number = v; }
    if (it.kind === 'text' && typeof d.text === 'string' && d.text.trim() !== '') out.text = plan.seal ? plan.seal(d.text.slice(0, MAX_TEXT)) : d.text.slice(0, MAX_TEXT);
    const z = plan.quiz || {}, now = Date.now();
    if (z.limitMs && now > z.startedAt + z.limitMs + GRACE_MS) { out.late = true; out.lateMs = now - (z.startedAt + z.limitMs); }
    out.timedOut = d.timedOut === true;
    out.rtMs = fin(d.rtMs, 0, 864e5) ? Math.round(d.rtMs) : null;
    if (d.selfTest === true) out.selfTest = true;
    return out;
  },
  recordFields: (t, plan) => ({ slot: t.slot, item: structuredClone(t.item), optOrder: t.optOrder.slice(), limitMs: (plan.quiz || {}).limitMs || 0 }),

  trialRow(r) {
    const d = r.data || {}, it = r.item || {}, s = scoreRecord(r);
    const response = it.kind === 'single' ? (d.choice != null ? d.choice + 1 : '') : it.kind === 'multi' ? (d.choices || []).map(x => x + 1).join('|')
      : it.kind === 'number' ? (d.number ?? '') : '';
    return { item_id: it.id || '', item_pool: it.pool || '', item_kind: it.kind || '', points_possible: it.points ?? '', response, response_text: it.kind === 'text' ? (d.text || '') : '',
      answered: answered(d) ? 1 : 0, correct: s.correct, points: s.points, timed_out: d.timedOut ? 1 : 0, late: d.late ? 1 : 0, late_ms: d.lateMs ?? '', rt_ms: d.rtMs ?? '',
      option_order: (r.optOrder || []).map(x => x + 1).join('>') };
  },
  // One row per student: the quiz total for each session.
  wideColumns(recs) {
    const out = {}, by = {};
    for (const r of recs) (by[r.session] = by[r.session] || []).push(r);
    for (const [n, rs] of Object.entries(by)) {
      let pts = 0, max = 0, ungraded = 0, late = 0, blank = 0;
      for (const r of rs) {
        const s = scoreRecord(r), it = r.item || {};
        max += it.points || 0;
        if (s.points === '') ungraded++; else pts += s.points;
        if (r.data && r.data.late) late++;
        if (!answered(r.data || {})) blank++;
      }
      Object.assign(out, { [`s${n}_quiz_points`]: Math.round(pts * 100) / 100, [`s${n}_quiz_possible`]: Math.round(max * 100) / 100,
        [`s${n}_quiz_percent`]: max ? Math.round(pts / max * 1000) / 10 : '', [`s${n}_quiz_to_grade`]: ungraded, [`s${n}_quiz_late`]: late, [`s${n}_quiz_unanswered`]: blank });
    }
    return out;
  },

  // The self-test sees what the browser sees, so it answers the first option shown (or a number, or text).
  simulate(trial) {
    const k = trial.q.kind;
    const ans = k === 'single' ? { choice: 0 } : k === 'multi' ? { choices: [0] } : k === 'number' ? { number: 42 } : { text: 'self-test answer' };
    return { ...ans, rtMs: 1500, timedOut: false, selfTest: true, rawEvents: [{ t: 1, type: 'self_test' }] };
  },
  checkRow(row, sent, planTrial) {
    const problems = [], it = planTrial && planTrial.item;
    if (!it) return ['plan'];
    if (it.kind === 'single' && Number(row.response) !== planTrial.optOrder[0] + 1) problems.push('response');
    if (it.kind === 'multi' && String(row.response) !== String(planTrial.optOrder[0] + 1)) problems.push('response');
    if (it.kind === 'number' && Number(row.response) !== 42) problems.push('response');
    if (it.kind === 'text' && !row.response_text) problems.push('response_text');
    if (Number(row.answered) !== 1) problems.push('answered');
    const s = scoreRecord({ item: it, data: { choice: it.kind === 'single' ? planTrial.optOrder[0] : null, choices: it.kind === 'multi' ? [planTrial.optOrder[0]] : null, number: it.kind === 'number' ? 42 : null } });
    if (String(row.correct) !== String(s.correct)) problems.push('scored on the server');
    return problems;
  },
  checkSession(rows, session, condition, c) {
    const slots = slotsOf(c.quiz.items);
    const covered = rows.every(r => c.quiz.items.some(it => it.id === r.item_id)) && new Set(rows.map(r => slots.findIndex(s => s.items.some(it => it.id === r.item_id)))).size === slots.length;
    return [[rows.length === slots.length, `Session ${session}: ${slots.length} questions saved`], [covered, `Session ${session}: one question from each slot`]];
  }
};
