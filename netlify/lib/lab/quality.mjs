// CCAIR Behavioral Lab: data-quality signals without a CAPTCHA. Attention checks alone no longer catch AI agents
// that take surveys (Westwood 2025, PNAS), so the participant page also watches for what
// software does and people rarely do:
//   honeypot    a hidden text box on every survey page; people never see it, form-filling software fills it
//   webdriver   navigator.webdriver: the browser says it is controlled by automation (Selenium, Playwright, ...)
//   pastes      text pasted into open answers (count and characters)
//   injected    characters that appeared in a text box with no key press and no paste (text set by a program)
//   keys        key presses in text boxes, and how many came faster than 30 ms after the previous one
// Per session, data/{id}/s{n}/dq holds running totals (participant route "dq"; merged, never lowered). The wide CSV
// turns them into dq_* columns, with the duplicate-panel and fast-completion flags computed from the record.

import { setNew, update } from './store.mjs';

const int = (v, hi) => (Number.isInteger(v) && v >= 0 ? Math.min(v, hi) : 0);
export function cleanDq(d) {
  d = d && typeof d === 'object' ? d : {};
  return { honeypot: d.honeypot === true, webdriver: d.webdriver === true, pastes: int(d.pastes, 1e5), pasteChars: int(d.pasteChars, 1e7), injectedChars: int(d.injectedChars, 1e7),
    keys: int(d.keys, 1e7), fastKeys: int(d.fastKeys, 1e7) };
}

// Running totals from the browser, per page load: true stays true, each load's counts only go up, and the session's
// counts are the sum over its loads. A reload restarts the browser's counts under a new load id, so its counts add
// to what was seen before it instead of being hidden by a maximum. Reports from before load ids (and records saved
// before them) count as one load, "page".
const DQ_COUNTS = ['pastes', 'pasteChars', 'injectedChars', 'keys', 'fastKeys'], MAX_LOADS = 50;
export async function saveDq(S, E, code, session, data, now = Date.now()) {
  const p = await E.loadParticipant(S, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!(Number.isInteger(session) && session > 0 && session < 100)) return { error: 'bad_session', status: 400 };
  const got = cleanDq(data), key = `data/${p.code}/s${session}/dq`;
  const load = typeof data?.load === 'string' && /^[a-z0-9]{6,32}$/.test(data.load) ? data.load : 'page';
  const merge = d => {
    if (!d.data) Object.assign(d, { code: p.code, condition: p.condition, session, data: cleanDq({}) });
    if (!d.loads) d.loads = { page: Object.fromEntries(DQ_COUNTS.map(k => [k, d.data[k] || 0])) };
    for (const k of ['honeypot', 'webdriver']) d.data[k] = d.data[k] || got[k];
    if (d.loads[load] || Object.keys(d.loads).length < MAX_LOADS) {
      const was = d.loads[load] || {};
      d.loads[load] = Object.fromEntries(DQ_COUNTS.map(k => [k, Math.max(was[k] || 0, got[k])]));
    }
    for (const k of DQ_COUNTS) d.data[k] = Object.values(d.loads).reduce((n, l) => n + (l[k] || 0), 0);
    d.receivedAt = now;
  };
  const first = {}; merge(first);
  if (await setNew(S.store, key, first)) return { ok: true };   // the session's first report
  const u = await update(S.store, key, merge);
  return u.error ? u : { ok: true };
}

// The dq_* columns for one participant: their sessions' dq records, the participant record, and the content.
// fast completion: a finished session shorter than a quarter of the minutes the study says it takes.
export const FAST_SHARE = 0.25, FAST_KEY_MS = 30;
export function dqColumns(dqs, p, c, trials = [], typeId = '') {
  const sum = k => dqs.reduce((n, d) => n + (d[k] || 0), 0), any = k => dqs.some(d => d[k]);
  const keys = sum('keys'), fast = sum('fastKeys');
  const minutes = Object.values(p.sessions || {}).filter(s => s.startedAt && s.completedAt).map(s => (s.completedAt - s.startedAt) / 60000);
  const per = c && c.minutesPerSession;
  const row = {
    dq_honeypot: any('honeypot') ? 1 : 0, dq_webdriver: any('webdriver') ? 1 : 0, dq_paste_count: sum('pastes'), dq_paste_chars: sum('pasteChars'), dq_injected_chars: sum('injectedChars'),
    dq_fast_keys_share: keys ? Math.round(fast / keys * 100) / 100 : '', dq_fast_typing: keys >= 20 && fast / keys > 0.5 ? 1 : 0,
    dq_fast_completion: per && minutes.some(m => m < per * FAST_SHARE) ? 1 : 0, dq_duplicate_panel: p.panel && p.panel.sessions.length > 1 ? 1 : 0,
    ...traceDq(trials, typeId)
  };
  row.dq_flags = ['dq_honeypot', 'dq_webdriver', 'dq_fast_typing', 'dq_fast_completion', 'dq_duplicate_panel', 'dq_scripted', 'dq_even_typing', 'dq_fast_answers']
    .reduce((n, k) => n + (row[k] === 1 ? 1 : 0), 0) + (row.dq_paste_count ? 1 : 0) + (row.dq_injected_chars ? 1 : 0);
  return row;
}

// Signals from the trials' TraceLab measures (0.3.0 and later for scripted input and typing rhythm). Blank when no
// trial carries the measure, so participants from before it do not read as clean.
export const EVEN_TYPING_CV = 0.15, EVEN_TYPING_MIN_KEYS = 15, FAST_ANSWER_MS = 1000, FAST_ANSWER_SHARE = 0.5, FAST_ANSWER_MIN_TRIALS = 5;
export function traceDq(trials, typeId = '') {
  const tr = trials.map(t => t && t.traces).filter(t => t && typeof t === 'object');
  const scored = tr.filter(t => 'untrustedInputs' in t);
  const scripted = scored.reduce((n, t) => n + (t.untrustedInputs || 0) + (t.unpressedClicks || 0), 0);
  const typed = tr.filter(t => t.keyIntervalCv != null && (t.keyIntervalCount || 0) >= EVEN_TYPING_MIN_KEYS);
  const cvMin = typed.length ? Math.min(...typed.map(t => t.keyIntervalCv)) : null;
  // Reaction-time tasks are meant to be answered within a second; there it is not a signal.
  const answered = typeId === 'reaction' ? [] : tr.filter(t => typeof t.firstAnswerMs === 'number');
  const fastShare = answered.length ? answered.filter(t => t.firstAnswerMs < FAST_ANSWER_MS).length / answered.length : null;
  const shown = tr.reduce((n, t) => n + (t.durationMs || 0), 0), hidden = tr.reduce((n, t) => n + (t.hiddenMs || 0), 0);
  return {
    dq_scripted_events: scored.length ? scripted : '', dq_scripted: scored.length ? (scripted > 0 ? 1 : 0) : '',
    dq_typing_cv_min: cvMin == null ? '' : cvMin, dq_even_typing: cvMin == null ? '' : cvMin < EVEN_TYPING_CV ? 1 : 0,
    dq_fast_answer_share: fastShare == null ? '' : Math.round(fastShare * 100) / 100,
    dq_fast_answers: fastShare == null ? '' : answered.length >= FAST_ANSWER_MIN_TRIALS && fastShare >= FAST_ANSWER_SHARE ? 1 : 0,
    dq_hidden_share: shown ? Math.round(hidden / shown * 100) / 100 : ''
  };
}
export const DQ_CODEBOOK = [
  ['dq_flags', 'integer', 'How many of the data-quality flags below are raised (0 = none). Flags are signals to review, not proof: attention checks alone no longer catch AI agents (Westwood 2025, PNAS), so the lab records behavior that software shows and people rarely do.'],
  ['dq_honeypot', 'binary', 'A hidden text box on a survey page was filled in (people never see it; form-filling software does).', '0 = no; 1 = yes'],
  ['dq_webdriver', 'binary', 'The browser reported that it is controlled by automation software (navigator.webdriver).', '0 = no; 1 = yes'],
  ['dq_paste_count', 'integer', 'Times text was pasted into an open answer.'],
  ['dq_paste_chars', 'integer', 'Characters pasted into open answers.'],
  ['dq_injected_chars', 'integer', 'Characters that appeared in a text box with no key press and no paste (set by a program, or by dictation software).'],
  ['dq_fast_keys_share', 'number', 'Share of key presses in text boxes that came under 30 ms after the previous one (people rarely type that fast).'],
  ['dq_fast_typing', 'binary', 'More than half of 20 or more key presses came under 30 ms apart.', '0 = no; 1 = yes'],
  ['dq_fast_completion', 'binary', 'A session was finished in under a quarter of the minutes the study says it takes.', '0 = no; 1 = yes'],
  ['dq_duplicate_panel', 'binary', 'The same panel ID opened the study with more than one panel session ID (for example two Prolific submissions).', '0 = no; 1 = yes'],
  ['dq_scripted_events', 'integer', 'Input events made by a script rather than a person during trials: pointer, key or typing events the browser marks as untrusted, and clicks with no real press or key in the second before (blank before TraceLab 0.3.0).'],
  ['dq_scripted', 'binary', 'Any scripted input during trials. The lab\'s own pages never create such events.', '0 = no; 1 = yes'],
  ['dq_typing_cv_min', 'number', 'Lowest variation of between-key times (standard deviation / mean) in a trial with 15 or more typed keys. People type unevenly (about 0.4 and up); software typing at a fixed rate comes out near 0. Blank = not enough typing.'],
  ['dq_even_typing', 'binary', 'Typing in some trial was machine-even (variation under 0.15).', '0 = no; 1 = yes'],
  ['dq_fast_answer_share', 'number', 'Share of trials whose first answer came within 1 s of the item appearing (not computed for reaction-time tasks).'],
  ['dq_fast_answers', 'binary', 'Half or more of 5 or more trials were answered within 1 s, faster than the item could be read.', '0 = no; 1 = yes'],
  ['dq_hidden_share', 'number', 'Share of trial time the browser tab was hidden (the participant was elsewhere). Not a flag: context for attention.']
];
