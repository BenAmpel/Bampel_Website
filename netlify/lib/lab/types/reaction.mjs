// Study type: reaction (choice reaction time), for classic interference effects: Stroop (name the ink colour of a
// colour word; Stroop 1935) and the arrow flanker task (the direction of the middle arrow; Eriksen & Eriksen 1974).
// Each stimulus is one engine trial, so it is saved as it is answered and exported as one row. A trial is a fixation
// cross, the stimulus until a response (or the response window ends), and an optional "correct / wrong" feedback in
// practice. Response time is measured in the browser from the stimulus's first display frame to the key press
// (both on the performance.now() clock). Trials are balanced: equal congruent and incongruent trials, each target
// value equally often, shuffled for each participant. Participant renderer: static/lab/engine/types/reaction.js.
const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Instructions', 'instr_intro', 'Instructions ({n} = trials this session)', 'You will do {n} quick trials. Keep your fingers on the keys shown below and answer as fast and as accurately as you can.'),
  F('Item screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Trial {i} of {n}'),
  F('Item screen', 'progress_practice', 'Progress line, practice', 'Practice'),
  F('Reaction task', 'rt_too_slow', 'Shown when no key is pressed in time', 'Too slow'),
  F('Reaction task', 'rt_correct', 'Practice feedback: correct', 'Correct'),
  F('Reaction task', 'rt_wrong', 'Practice feedback: wrong', 'Wrong key'),
  F('Reaction task', 'rt_practice_note', 'Before the practice trials', 'The first trials are practice and tell you whether you were right.'),
  F('Reaction task', 'rt_buttons_note', 'Under the keys (touch screens can tap them)', 'You can also tap or click the buttons.')
];

// Answer values per paradigm: [value, what is shown, ink colour (Stroop), default key].
export const PARADIGMS = {
  stroop: { label: 'Stroop (ink colour of a colour word)', values: [['red', 'RED', '#d62828', 'd'], ['green', 'GREEN', '#2a9d3f', 'f'], ['blue', 'BLUE', '#1d6fd1', 'j'], ['yellow', 'YELLOW', '#c99a00', 'k']] },
  flanker: { label: 'Flanker (direction of the middle arrow)', values: [['left', '←', null, 'f'], ['right', '→', null, 'j']] }
};
const KEY_RE = /^[a-z0-9]$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// One stimulus: target value and congruency; an incongruent Stroop trial shows another colour's word, an
// incongruent flanker trial the opposite arrows.
function stimulusFor(task, target, congruent, rand) {
  const vals = PARADIGMS[task.paradigm].values.map(v => v[0]);
  if (task.paradigm === 'flanker') return { target, congruent, flank: congruent ? target : vals.find(v => v !== target) };
  const others = vals.filter(v => v !== target);
  return { target, congruent, word: congruent ? target : others[Math.floor(rand() * others.length)] };
}

// Balanced trial list: every target value equally often, half congruent, shuffled.
export function trialList(task, n, rand, shuffle) {
  const vals = PARADIGMS[task.paradigm].values.map(v => v[0]), out = [];
  for (let i = 0; i < n; i++) out.push(stimulusFor(task, vals[Math.floor(i / 2) % vals.length], i % 2 === 0, rand));
  return shuffle(out, rand);
}

function validateTask(t, e) {
  if (!t || typeof t !== 'object') { e.push('The task settings are missing.'); return; }
  if (!Object.hasOwn(PARADIGMS, t.paradigm)) e.push('Choose Stroop or flanker.');
  if (!int(t.trialsPerSession, 4, 400)) e.push('Trials per session must be a whole number from 4 to 400.');
  if (!int(t.practiceTrials, 0, 40)) e.push('Practice trials must be a whole number from 0 to 40.');
  if (!int(t.fixationMs, 100, 3000)) e.push('The fixation cross must last 100 to 3000 ms.');
  if (!int(t.responseMs, 300, 10000)) e.push('The response window must be 300 to 10000 ms.');
  if (!int(t.itiMs, 0, 5000)) e.push('The pause between trials must be 0 to 5000 ms.');
  if (typeof t.feedbackPractice !== 'boolean') e.push('Choose whether practice trials show feedback.');
  const keys = t.keys && typeof t.keys === 'object' ? t.keys : {}, want = Object.hasOwn(PARADIGMS, t.paradigm) ? PARADIGMS[t.paradigm].values.map(v => v[0]) : [];
  for (const v of want) if (!KEY_RE.test(keys[v] || '')) e.push(`Choose a key (a letter or digit) for "${v}".`);
  const used = want.map(v => keys[v]);
  if (new Set(used).size !== used.length) e.push('Each answer needs its own key.');
}

export default {
  id: 'reaction',
  label: 'Reaction times (Stroop or flanker)',
  description: 'A choice reaction-time task for classic interference effects: Stroop (ink colour of a colour word) or flanker (direction of the middle arrow). Balanced congruent and incongruent trials, a fixation cross, a response window, practice with feedback, keyboard or tap answers, and response times from the first display frame of each stimulus.',
  contentKeys: ['design', 'task'],
  textFields,
  surveyRules: [],
  conditionsOf: c => (c.design?.conditions || []).map(x => x.id),
  sessionCount: c => c.design.sessions.length,
  editorMeta: () => ({ paradigms: Object.fromEntries(Object.entries(PARADIGMS).map(([k, v]) => [k, { label: v.label, values: v.values.map(x => x[0]) }])) }),

  defaultContent() {
    return {
      minutesPerSession: 8,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], sessions: [{ name: 'Session 1' }] },
      task: { paradigm: 'stroop', trialsPerSession: 96, practiceTrials: 8, fixationMs: 500, responseMs: 2000, itiMs: 400, feedbackPractice: true,
        keys: Object.fromEntries(PARADIGMS.stroop.values.map(v => [v[0], v[3]])) }
    };
  },
  normalize(c, d) {
    c.design = c.design && typeof c.design === 'object' ? c.design : structuredClone(d.design);
    if (!Array.isArray(c.design.sessions) || !c.design.sessions.length) c.design.sessions = structuredClone(d.design.sessions);
    if (!Array.isArray(c.design.conditions) || !c.design.conditions.length) c.design.conditions = structuredClone(d.design.conditions);
    c.task = { ...d.task, ...(c.task || {}) };
    // the keys of the chosen paradigm (switching paradigm brings its default keys)
    const want = Object.hasOwn(PARADIGMS, c.task.paradigm) ? PARADIGMS[c.task.paradigm].values : [];
    c.task.keys = Object.fromEntries(want.map(v => [v[0], (c.task.keys || {})[v[0]] || v[3]]));
  },
  validate(c, e) {
    const d = c.design;
    if (!d || !Array.isArray(d.conditions) || !d.conditions.length) e.push('Add at least one condition.');
    else if (!d.conditions.every(x => /^[a-z][a-z0-9_-]{0,30}$/.test(x.id || ''))) e.push('Condition IDs use lowercase letters, numbers, dashes, and underscores.');
    if (!d || !Array.isArray(d.sessions) || !d.sessions.length || d.sessions.length > 20) e.push('Use 1 to 20 sessions.');
    validateTask(c.task, e);
  },

  buildPlan(p, session, c, rand, { shuffle }) {
    const t = c.task, main = trialList(t, t.trialsPerSession, rand, shuffle);
    const practice = session === 1 ? trialList(t, t.practiceTrials, rand, shuffle).map(x => ({ ...x, practice: true })) : [];
    return { task: { paradigm: t.paradigm, fixationMs: t.fixationMs, responseMs: t.responseMs, itiMs: t.itiMs, feedbackPractice: t.feedbackPractice, keys: t.keys },
      trials: practice.concat(main).map((s, i) => ({ index: i, stim: s })), practice: null };
  },
  // The browser needs the stimulus (and so the right answer, for practice feedback); scoring is done on the server
  // from the stored stimulus, never from what the browser says.
  publicTrial(t) { return { stim: { target: t.stim.target, word: t.stim.word, flank: t.stim.flank, practice: !!t.stim.practice } }; },
  publicPlanExtras: plan => ({ task: plan.task }),

  cleanTrialData(d) {
    d = d && typeof d === 'object' ? d : {};
    const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null);
    return { response: typeof d.response === 'string' && /^[a-z_]{1,20}$/.test(d.response) ? d.response : null, key: typeof d.key === 'string' && d.key.length <= 12 ? d.key : null,
      rtMs: num(d.rtMs, 0, 600000), timedOut: d.timedOut === true, via: d.via === 'tap' ? 'tap' : 'key', selfTest: d.selfTest === true || undefined,
      earlyPresses: Number.isInteger(d.earlyPresses) && d.earlyPresses >= 0 ? Math.min(d.earlyPresses, 1000) : null,
      otherKeys: Number.isInteger(d.otherKeys) && d.otherKeys >= 0 ? Math.min(d.otherKeys, 1000) : null,
      hiddenAtStimulus: typeof d.hiddenAtStimulus === 'boolean' ? d.hiddenAtStimulus : null };
  },
  recordFields: (t, plan) => ({ stim: t.stim, paradigm: plan.task.paradigm }),

  trialRow(r) {
    const d = r.data || {}, s = r.stim || {}, correct = d.response != null && !d.timedOut ? (d.response === s.target ? 1 : 0) : '';
    return { paradigm: r.paradigm || '', practice: s.practice ? 1 : 0, target: s.target || '', distractor: s.word || s.flank || '', congruent: s.congruent ? 1 : 0,
      response: d.response || '', response_key: d.key || '', response_via: d.via || '', correct, rt_ms: d.rtMs ?? '', timed_out: d.timedOut ? 1 : 0,
      early_presses: d.earlyPresses ?? '', other_keys: d.otherKeys ?? '', hidden_at_stimulus: d.hiddenAtStimulus == null ? '' : d.hiddenAtStimulus ? 1 : 0 };
  },

  simulate(trial) {
    return { response: trial.stim.target, key: 'x', rtMs: 480, timedOut: false, via: 'key', selfTest: true, rawEvents: [{ t: 1, type: 'self_test' }] };
  },
  checkRow(row, sent) {
    const problems = [];
    if (row.response !== sent.response) problems.push('response');
    if (String(row.rt_ms) !== String(sent.rtMs)) problems.push('rt_ms');
    if (Number(row.correct) !== 1) problems.push('scored correct');
    return problems;
  },
  checkSession(rows, session, condition, c) {
    const want = c.task.trialsPerSession + (session === 1 ? c.task.practiceTrials : 0), main = rows.filter(r => Number(r.practice) !== 1);
    const cong = main.filter(r => Number(r.congruent) === 1).length;
    return [[rows.length === want, `Session ${session}: ${want} trials saved`], [Math.abs(cong - main.length / 2) <= 1, `Session ${session}: half the trials congruent`]];
  }
};
