// CCAIR Behavioral Lab: the integrity report (admin tab "Integrity"). One structure for two kinds of study:
//   quiz   cheating in a graded quiz: pasting, help from another tab, retyping, answers too fast for how hard the
//          question was, and pairs of students who share rare wrong answers or answer in lockstep
//   study  software or AI agents taking a research study, and people taking it twice: automation, input no person
//          made, machine-even typing, answers faster than reading, and pairs with near-identical answers or timing
// For each person it lists plain-language reasons, each "strong" (worth a look on its own) or "context" (worth a look
// only together with others), and for the sample it lists pairs. It never scores guilt and never decides anything:
// people are ordered by how many reasons they have, and the page says "worth a look". The signals come from the same
// records as the downloads (TraceLab measures and the data-quality signals in quality.mjs); nothing new is collected.
import * as E from './engine.mjs';
import { wideRows } from './wide.mjs';

export const PASTE_CHARS = 50, INJECTED_CHARS = 20, AWAY_MS = 5000, HARD = 0.5, FAST_PCT = 0.1, MIN_CLASS = 5;
export const RETYPE_KEYS = 150, RARE_WRONG = 0.25, LOCKSTEP_MS = 10000, LOCKSTEP_SHARE = 0.8, LOCKSTEP_MIN = 4;
export const SAME_ANSWERS_MIN = 10, SAME_ANSWERS_SHARE = 0.9, MAX_PAIR_PEOPLE = 1500;

const pct = x => `${Math.round(x * 100)}%`;
const secs = ms => (ms >= 90000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)} s`);
const quantile = (xs, q) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const name = p => p.label || p.code;

// Per-question facts across everyone: share correct (quiz) and response times, so "hard" and "fast" come from the data.
function itemStats(trials) {
  const by = {};
  for (const t of trials) {
    const k = t.row.item_id || `t${t.r.index}`, s = by[k] || (by[k] = { n: 0, right: 0, rts: [], answers: {} });
    if (Number(t.row.answered) !== 1) continue;
    s.n++;
    if (t.row.correct === 1) s.right++;
    if (typeof t.row.rt_ms === 'number') s.rts.push(t.row.rt_ms);
    if (t.row.response !== '' && t.row.response != null) { const v = String(t.row.response); s.answers[v] = (s.answers[v] || 0) + 1; }
  }
  for (const s of Object.values(by)) { s.p = s.n ? s.right / s.n : null; s.fast = s.rts.length >= MIN_CLASS ? quantile(s.rts, FAST_PCT) : null; }
  return by;
}

function personReasons(mode, w, trials, stats) {
  const out = [], add = (level, text) => out.push({ level, text });
  // From the session's data-quality signals (quality.mjs), for every kind of study.
  if (w.dq_scripted === 1) add('strong', `Input the browser marked as made by a program (${w.dq_scripted_events} event${w.dq_scripted_events === 1 ? '' : 's'}): clicks or keys no person pressed.`);
  if (w.dq_webdriver === 1) add('strong', 'The browser reported that automation software was controlling it.');
  if (w.dq_honeypot === 1) add('strong', 'Filled in a hidden box that people never see (form-filling software does).');
  if (w.dq_injected_chars >= INJECTED_CHARS) add('strong', `${w.dq_injected_chars} characters appeared in answer boxes with no key presses and no paste.`);
  if (w.dq_fast_typing === 1) add('strong', `Keys came faster than a person types (${pct(w.dq_fast_keys_share)} under 30 ms apart).`);
  if (w.dq_even_typing === 1) add('context', `Typing rhythm too even for a person (the gaps between keys varied by only ${w.dq_typing_cv_min}).`);
  if (w.dq_fast_completion === 1) add('context', 'Finished a session in under a quarter of the expected time.');
  if (mode === 'study') {
    if (w.dq_fast_answers === 1) add('context', `Answered ${pct(w.dq_fast_answer_share)} of the items within a second of seeing them, faster than reading.`);
    if (w.dq_duplicate_panel === 1) add('context', 'One panel ID arrived with several panel session IDs (opened the study more than once).');
    if (typeof w.dq_hidden_share === 'number' && w.dq_hidden_share >= 0.5) add('context', `The study's tab was hidden for ${pct(w.dq_hidden_share)} of the time on items.`);
  }
  // Per question.
  for (const t of trials) {
    const tr = (t.r.data && t.r.data.traces) || {}, row = t.row, q = row.item_id || `item ${t.r.index + 1}`, s = stats[row.item_id || `t${t.r.index}`];
    if ((tr.pasteChars || 0) >= PASTE_CHARS) add('strong', `Pasted ${tr.pasteChars} characters into ${q}.`);
    if (tr.keyIntervalCv != null && (tr.keyIntervalCount || 0) >= 15 && tr.keyIntervalCv < 0.15 && w.dq_even_typing !== 1) add('context', `Typed ${q} at a machine-even rhythm.`);
    if ((tr.keystrokes || 0) >= RETYPE_KEYS && (tr.deletions || 0) === 0) add('context', `Typed ${tr.keystrokes} keys into ${q} without a single correction, as when copying text from another screen.`);
    if (mode !== 'quiz' || !s) continue;
    const hard = s.p != null && s.n >= MIN_CLASS && s.p < HARD;
    if (row.correct === 1 && hard && (tr.hiddenMs || 0) >= AWAY_MS) add('context', `Away from the quiz for ${secs(tr.hiddenMs)} during ${q}, then answered it correctly (${pct(s.p)} of the class did).`);
    else if (row.correct === 1 && hard && (tr.windowBlurs || 0) > 0) add('context', `Switched to another window during ${q}, then answered it correctly (${pct(s.p)} of the class did).`);
    if (row.correct === 1 && hard && s.fast != null && typeof row.rt_ms === 'number' && row.rt_ms < s.fast) add('context', `Answered ${q} correctly in ${secs(row.rt_ms)}, faster than 90% of the class, on a question ${pct(1 - s.p)} of the class missed.`);
  }
  return out;
}

// Pairs: answers (rare wrong answers in a quiz; near-identical answer sets in a study) and timing in lockstep.
function pairs(mode, people, stats) {
  const out = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j], reasons = [];
    if (mode === 'quiz') {
      const shared = [];
      for (const [k, ra] of Object.entries(a.answers)) {
        const rb = b.answers[k], s = stats[k];
        if (!rb || ra.correct !== 0 || rb.correct !== 0 || ra.response === '' || ra.response !== rb.response || !s || s.n < MIN_CLASS) continue;
        const f = (s.answers[ra.response] || 0) / s.n;
        if (f <= RARE_WRONG) shared.push(`${k} (${pct(f)} of the class chose it)`);
      }
      if (shared.length >= 2) reasons.push(`Chose the same uncommon wrong answer on ${shared.length} questions: ${shared.join(', ')}.`);
    } else {
      let both = 0, same = 0;
      for (const [k, v] of Object.entries(a.answers)) if (k in b.answers) { both++; if (b.answers[k] === v) same++; }
      if (both >= SAME_ANSWERS_MIN && same / both >= SAME_ANSWERS_SHARE) reasons.push(`Gave the same answer on ${same} of the ${both} questions both answered.`);
    }
    let shared = 0, close = 0;
    for (const [k, at] of Object.entries(a.times)) if (k in b.times) { shared++; if (Math.abs(b.times[k] - at) <= LOCKSTEP_MS) close++; }
    if (shared >= LOCKSTEP_MIN && close / shared >= LOCKSTEP_SHARE) reasons.push(`Submitted ${close} of ${shared} ${mode === 'quiz' ? 'questions' : 'items'} within ${LOCKSTEP_MS / 1000} seconds of each other.`);
    if (reasons.length) out.push({ a: a.code, b: b.code, aName: a.name, bName: b.name, reasons });
  }
  return out.sort((x, y) => y.reasons.length - x.reasons.length);
}

// A study's answer columns in the wide export, for comparing two people (no free text: it is sealed or too varied).
const ANSWER_COL = /^s\d+_(pre|post)_|^s\d+_.+_(a_[a-z0-9_]+|response|decision|final_judgment|initial_judgment)$/;
function studyAnswers(w) {
  const out = {};
  for (const [k, v] of Object.entries(w)) if (ANSWER_COL.test(k) && v !== '' && v != null && !(typeof v === 'string' && (v.length > 40 || v.startsWith('sealed:')))) out[k] = String(v);
  return out;
}

export async function integrityReport(S, c, { includeTest = false, now = Date.now() } = {}) {
  const mode = S.type.id === 'quiz' ? 'quiz' : 'study';
  const all = await E.exportRecords(S);
  const keep = new Set(all.participants.filter(p => includeTest || !p.test).map(p => p.code));
  const recs = { records: all.records.filter(r => keep.has(r.code)), participants: all.participants.filter(p => keep.has(p.code)) };
  const wide = Object.fromEntries(wideRows(S, recs, c).map(w => [w.code, w]));
  const byCode = Object.fromEntries(recs.participants.map(p => [p.code, p]));
  const trials = S.type.exportTrials ? [] : recs.records.filter(r => /\/t\d+$/.test(r.key)).map(r => ({ r, row: E.trialRow(S, r, byCode[r.code]) }));
  const stats = itemStats(trials);
  const people = recs.participants.map(p => {
    const mine = trials.filter(t => t.r.code === p.code), w = wide[p.code] || {};
    const answers = {}, times = {};
    for (const t of mine) {
      const k = mode === 'quiz' ? (t.row.item_id || `t${t.r.index}`) : `s${t.r.session}:${t.r.index}`;
      if (mode === 'quiz') answers[k] = { response: String(t.row.response ?? ''), correct: t.row.correct };
      if (t.r.receivedAt) times[mode === 'quiz' ? `s${t.r.session}:${t.r.slot || k}` : k] = t.r.receivedAt;
    }
    const reasons = personReasons(mode, w, mine, stats);
    return { code: p.code, name: name(p), condition: p.condition || '', test: !!p.test, finished: w.finished === 1, extraTime: p.timeFactor > 1 ? p.timeFactor : undefined,
      reasons, strong: reasons.filter(x => x.level === 'strong').length, answers: mode === 'quiz' ? answers : studyAnswers(w), times };
  });
  const tooMany = people.length > MAX_PAIR_PEOPLE;
  const pairList = tooMany ? [] : pairs(mode, people, stats);
  const flagged = people.filter(x => x.reasons.length).sort((x, y) => (y.strong - x.strong) || (y.reasons.length - x.reasons.length) || x.name.localeCompare(y.name))
    .map(({ answers, times, ...x }) => x);
  return {
    mode, generatedAt: new Date(now).toISOString(), includeTest,
    counts: { people: people.length, finished: people.filter(x => x.finished).length, withReasons: flagged.length, pairs: pairList.length },
    people: flagged, pairs: pairList, pairsSkipped: tooMany,
    cannotSee: mode === 'quiz'
      ? ['A phone or a second computer: nothing on another device reaches this page.', 'Someone sitting beside the student.', 'Answers looked up and then typed normally.', 'Reasons are not proof: a slow connection, dictation software, a screen reader, or a student who drafts elsewhere and pastes can raise them. Talk to the student before deciding anything.']
      : ['An AI agent that types and clicks through the operating system like a person can raise none of these signals.', 'Several people sharing one panel account, or one person on two devices with different panel IDs.', 'Reasons are not proof: dictation, assistive technology, and fast but honest readers can raise them. Preregister how you will use them before excluding anyone.']
  };
}
