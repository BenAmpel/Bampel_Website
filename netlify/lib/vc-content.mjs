// Verification study: editable study content. Everything participants see and the session
// design (which alerts each session shows, and what the AI does) lives here. Defaults are in
// code; saved edits live in the store as numbered versions.
import { ALERTS, PRACTICE } from './vc-alerts.mjs';

export const AI_TYPES = {
  accurate: 'Right, high confidence',
  uncertain_correct: 'Right, low confidence',
  incorrect: 'Wrong, high confidence',
  uncertain_incorrect: 'Wrong, low confidence',
  manipulated: 'Wrong, high confidence, cites only the misleading evidence'
};

// Session design from Clark (Section 4): accurate AI, then mostly accurate, then disrupted, then removed.
const DEFAULT_AI = {
  1: Array(8).fill('accurate'),
  2: [...Array(7).fill('accurate'), 'uncertain_correct'],
  3: ['accurate', 'accurate', 'accurate', 'accurate', 'incorrect', 'incorrect', 'uncertain_incorrect', 'manipulated'],
  4: null
};
// One version of each of the 8 alert types per session; versions rotate so every alert is seen once.
function defaultSessionAlerts(session) {
  const families = [...new Set(ALERTS.map(a => a.family))];
  return families.map((fam, f) => ALERTS.find(a => a.family === fam && a.variant === (f + session - 1) % 4).id);
}

// Every piece of participant-facing text. Placeholders in {braces} are filled in on screen.
// Leave a blank line between paragraphs.
export const TEXT_FIELDS = [
  ['Sign-in', 'login_title', 'Page title', 'Security alert study'],
  ['Sign-in', 'login_intro', 'Sign-in instructions', 'Sign in with the email address your invitation was sent to. Use the same email and PIN each week.'],
  ['Sign-in', 'login_first_time', 'First-time hint', 'First time here? Leave the PIN blank and you will create one.'],
  ['Consent', 'consent_title', 'Consent page title', 'Consent to participate'],
  ['Consent', 'decline_body', 'Shown after "I do not agree"', 'You have chosen not to take part. You can close this page.'],
  ['Session start', 'start_title', 'Title ({session}, {total})', 'Session {session} of {total}'],
  ['Session start', 'start_body', 'Before starting ({minutes})', 'This session takes about {minutes} minutes. Please complete it in one sitting, on a laptop or desktop computer, somewhere you will not be interrupted.\n\nIf you get disconnected, sign in again and you will pick up where you left off.'],
  ['Session start', 'start_button', 'Start button ({session})', 'Start session {session}'],
  ['Session start', 'progress_done', 'Progress line ({completed}, {total})', 'You have completed {completed} of {total} sessions.'],
  ['Session start', 'wait_title', 'Next session not open: title', 'Your next session is not open yet'],
  ['Session start', 'wait_body', 'Next session not open: text ({session}, {date})', 'Session {session} opens on {date}. Come back then and sign in the same way.'],
  ['Instructions', 'instr_title', 'Title', 'How this session works'],
  ['Instructions', 'instr_intro', 'Opening ({n} = alerts this session)', 'You are a security analyst reviewing alerts from a company network. You will see {n} alerts. Each alert has a short summary and several sources of evidence, such as network activity and user behavior.'],
  ['Instructions', 'instr_ai_first', 'AI-first group, sessions with the AI', 'For each alert, an AI assistant will show its assessment first. Then review whatever evidence you want and make your decision. The AI assistant is helpful but not always correct.'],
  ['Instructions', 'instr_evidence_first', 'Evidence-first group, sessions with the AI', 'For each alert, first review whatever evidence you want and record your initial assessment. Then an AI assistant will show its assessment, and you will make your final decision. You can look at the evidence again before deciding. The AI assistant is helpful but not always correct.'],
  ['Instructions', 'instr_none', 'Sessions without the AI', 'For each alert, review whatever evidence you want and make your decision.'],
  ['Instructions', 'instr_ai_removed', 'AI groups, first session after the AI is removed', 'In this session there is no AI assistant. For each alert, review whatever evidence you want and make your decision.'],
  ['Instructions', 'instr_outro', 'Closing', 'Open evidence by clicking its tab. Open as much or as little as you think you need. About half of the alerts are malicious.'],
  ['Instructions', 'instr_practice', 'Practice notice', 'You will start with one practice alert that does not count.'],
  ['Instructions', 'begin_button', 'Begin button', 'Begin'],
  ['Alert screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Session {session} · Alert {i} of {n}'],
  ['Alert screen', 'progress_practice', 'Progress line, practice', 'Practice alert'],
  ['Alert screen', 'severity_label', 'Severity label', 'Severity'],
  ['Alert screen', 'evidence_placeholder', 'Before any evidence is opened', 'Select an evidence source above to view it.'],
  ['Alert screen', 'label_malicious', 'Answer: malicious', 'Malicious'],
  ['Alert screen', 'label_benign', 'Answer: benign', 'Benign'],
  ['Alert screen', 'q_initial', 'Initial assessment question (evidence-first)', 'Your initial assessment: is this alert malicious or benign?'],
  ['Alert screen', 'q_initial_conf', 'Initial confidence question', 'How confident are you in your initial assessment?'],
  ['Alert screen', 'lock_button', 'Button that reveals the AI (evidence-first)', 'Record initial assessment and see the AI assessment'],
  ['Alert screen', 'q_final', 'Decision question', 'Your decision: is this alert malicious or benign?'],
  ['Alert screen', 'q_final_two', 'Decision question after an initial assessment', 'Your final decision: is this alert malicious or benign?'],
  ['Alert screen', 'q_conf', 'Confidence question', 'How confident are you?'],
  ['Alert screen', 'conf_help', 'Confidence slider help', '0 = guessing, 100 = certain. Click or move the slider to record your answer.'],
  ['Alert screen', 'q_influence', 'Influential-information question', 'Which information most influenced your decision? Select all that apply.'],
  ['Alert screen', 'infl_summary', 'Option: the summary', 'The alert summary'],
  ['Alert screen', 'infl_ai', 'Option: the AI', 'The AI assessment'],
  ['Alert screen', 'submit_button', 'Submit button', 'Submit decision'],
  ['Alert screen', 'practice_submit', 'Submit button, practice', 'Finish practice'],
  ['AI assistant', 'ai_label', 'Box heading', 'AI assistant assessment'],
  ['AI assistant', 'ai_confidence', 'Confidence ({confidence})', '{confidence}% confidence'],
  ['AI assistant', 'ai_uncertain_prefix', 'Added before the explanation on low-confidence alerts', 'The evidence is mixed.'],
  ['AI assistant', 'ai_manipulated_suffix', 'Added after the explanation on manipulated alerts', 'No other indicators in this alert are notable.'],
  ['Practice', 'practice_done_title', 'After practice: title', 'Practice complete'],
  ['Practice', 'practice_done_body', 'After practice: text', 'The real alerts start now. They will look the same as the practice alert.'],
  ['Practice', 'practice_done_button', 'After practice: button', 'Start'],
  ['Surveys', 'pre_title', 'Start-of-session survey title', 'A few questions about you'],
  ['Surveys', 'post_title', 'End-of-session survey title', 'About this session'],
  ['Surveys', 'continue_button', 'Continue button', 'Continue'],
  ['End of session', 'done_title', 'Title', 'Session complete'],
  ['End of session', 'done_body', 'Text', 'Thank you. Your answers are saved.'],
  ['End of session', 'done_next', 'Next session ({date})', 'Your next session opens on {date}. Sign in the same way each week.'],
  ['End of session', 'finished_title', 'Last session: title', 'Thank you'],
  ['End of session', 'finished_body', 'Last session: text', 'You have completed all sessions of the study. You can close this page.'],
  ['End of session', 'sign_out', 'Sign-out button', 'Sign out']
].map(([group, key, label, def]) => ({ group, key, label, def }));
export const DEFAULT_TEXT = Object.fromEntries(TEXT_FIELDS.map(f => [f.key, f.def]));

const scale7 = (id, text, showIf = 'ai') => ({ id, text, type: 'scale', n: 7, lo: 'Strongly disagree', hi: 'Strongly agree', required: true, showIf, sessions: [] });

export const DEFAULT_CONTENT = {
  version: 0,
  minutesPerSession: 20,
  consent: {
    approved: false,
    paragraphs: [
      'This study examines how people review cybersecurity alerts with and without an AI assistant. It has four sessions, about one week apart, each taking about {minutes} minutes.',
      'In each session you will review short security alerts, look at the evidence you choose, and decide whether each alert is malicious or benign. Some sessions include an AI assistant. The AI assistant is part of the study and is not always correct.',
      'While you work, the page records your answers and how you reached them: which evidence you open and for how long, timing, mouse movement, clicks, scrolling, and typing rhythm. It does not record which keys you press, and it does not use your camera or microphone. Your email is used only to sign you in and to confirm that you completed the study. Your responses are stored under a study ID, not your name or email.',
      'Participation is voluntary. You may skip the study or stop at any time without penalty.',
      'Questions: Dr. Benjamin Ampel, Georgia State University, bampel@gsu.edu.'
    ],
    agreeLabel: 'I am 18 or older and I agree to participate.'
  },
  design: {
    practice: true,                // one practice alert at the start of session 1
    aiConfidence: { highMin: 85, highMax: 95, lowMin: 52, lowMax: 59 },
    // Per session: the alerts shown (in random order) and, for the AI groups, one AI behavior per alert
    // (shuffled), or null for no AI. The control group never sees the AI.
    sessions: [1, 2, 3, 4].map(s => ({ alerts: defaultSessionAlerts(s), ai: DEFAULT_AI[s] }))
  },
  survey: {
    // Start-of-session questions; "sessions" picks which sessions (default: session 1 only).
    pre: [
      { id: 'experience_years', text: 'How many years of cybersecurity work or study experience do you have?', type: 'select', required: true, showIf: 'always', sessions: [1],
        options: ['None', 'Less than 1', '1–2', '3–5', 'More than 5'].map(v => ({ value: v, label: v })) },
      { id: 'role', text: 'Which best describes you?', type: 'choice', required: true, showIf: 'always', sessions: [1],
        options: [['student', 'Student'], ['analyst', 'Security analyst or SOC staff'], ['it', 'Other IT role'], ['other', 'Other']].map(([value, label]) => ({ value, label })) },
      { id: 'alert_familiarity', text: 'How familiar are you with reviewing security alerts?', type: 'scale', n: 5, lo: 'Not at all familiar', hi: 'Extremely familiar', required: true, showIf: 'always', sessions: [1] },
      { id: 'ai_use', text: 'How often do you use AI tools (such as chat assistants) for work or study?', type: 'scale', n: 5, lo: 'Never', hi: 'Several times a day', required: true, showIf: 'always', sessions: [1] }
    ],
    // End-of-session questions; empty "sessions" means every session.
    post: [
      scale7('trust_1', '"I trusted the AI assistant\'s assessments in this session."'),
      scale7('trust_2', '"The AI assistant was reliable."'),
      scale7('reliance_1', '"I relied on the AI assistant to make my decisions."'),
      { id: 'no_ai_difficulty', text: 'How difficult was it to decide without the AI assistant in this session?', type: 'scale', n: 7, lo: 'Not at all difficult', hi: 'Extremely difficult', required: true, showIf: 'after_ai', sessions: [] },
      { id: 'mental_effort', text: 'How much mental effort did this session take?', type: 'scale', n: 9, lo: 'Very, very low', hi: 'Very, very high', required: true, showIf: 'always', sessions: [] }
    ]
  },
  text: DEFAULT_TEXT,
  alerts: ALERTS,
  practice: PRACTICE
};

export const SHOW_IF = ['always', 'ai', 'no_ai', 'after_ai'];
const TYPES = ['scale', 'choice', 'select', 'text'];
const SUPPORTS = ['malicious', 'benign', 'neutral'];

// Which survey items a participant sees. Shared rule; app.js mirrors it.
export function itemsFor(items, kind, ctx) {
  return (items || []).filter(it => {
    const inSession = Array.isArray(it.sessions) && it.sessions.length ? it.sessions.includes(ctx.session) : (kind === 'pre' ? ctx.session === 1 : true);
    if (!inSession) return false;
    if (it.showIf === 'ai') return ctx.mode !== 'none';
    if (it.showIf === 'no_ai') return ctx.mode === 'none';
    if (it.showIf === 'after_ai') return !!ctx.aiRemoved;
    return true;
  });
}

// Fills in anything an older saved version lacks.
export function normalize(c) {
  c.design = c.design || structuredClone(DEFAULT_CONTENT.design);
  c.design.aiConfidence = { ...DEFAULT_CONTENT.design.aiConfidence, ...(c.design.aiConfidence || {}) };
  if (c.design.practice == null) c.design.practice = true;
  c.text = { ...DEFAULT_TEXT, ...(c.text || {}) };
  for (const kind of ['pre', 'post']) for (const it of (c.survey?.[kind] || [])) if (!Array.isArray(it.sessions)) it.sessions = kind === 'pre' ? [1] : [];
  for (const a of c.alerts || []) if (!a.family) a.family = a.id;
  return c;
}

let cache = null; // { at, content } per function instance
export async function getContent(store) {
  if (cache && Date.now() - cache.at < 5000) return cache.content;
  const c = normalize((await store.get('content/current')) || structuredClone(DEFAULT_CONTENT));
  cache = { at: Date.now(), content: c };
  return c;
}
export function clearContentCache() { cache = null; }

// What participants' browsers receive (no alerts, no answer keys).
export function publicContent(c) {
  return { version: c.version, minutesPerSession: c.minutesPerSession, consent: c.consent, survey: c.survey, text: c.text, sessions: c.design.sessions.length };
}

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function alertName(a) { return a && a.id === 'practice' ? 'Practice alert' : `Alert "${(a && (a.title || a.id)) || '?'}"`; }

function validateAlert(a, e, isPractice) {
  const where = alertName(a);
  if (!str(a.title, 200) || !str(a.summary, 1500) || !str(a.severity, 40)) e.push(`${where}: title, severity, and summary are required.`);
  if (!['malicious', 'benign'].includes(a.truth)) e.push(`${where}: the correct answer must be malicious or benign.`);
  if (!Array.isArray(a.panels) || a.panels.length < 1 || a.panels.length > 6) { e.push(`${where}: needs 1 to 6 evidence panels.`); return; }
  const keys = new Set();
  a.panels.forEach((p, i) => {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(p.key || '')) e.push(`${where}, evidence ${i + 1}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (keys.has(p.key)) e.push(`${where}: evidence variable name "${p.key}" is used twice.`);
    keys.add(p.key);
    if (!str(p.label, 80) || !str(p.text, 3000)) e.push(`${where}, evidence ${i + 1}: needs a tab label and text.`);
    if (!SUPPORTS.includes(p.supports)) e.push(`${where}, evidence ${i + 1}: "points to" must be malicious, benign, or neither.`);
  });
  if (!Array.isArray(a.misleadingPanels) || !a.misleadingPanels.every(k => keys.has(k))) e.push(`${where}: misleading panels must be among its evidence panels.`);
  if (!str(a.aiRationale?.correct, 1500)) e.push(`${where}: the AI explanation for when the AI is right is required.`);
  if (!isPractice && !str(a.aiRationale?.incorrect, 1500)) e.push(`${where}: the AI explanation for when the AI is wrong is required.`);
}

export function validateContent(c) {
  const e = [];
  if (!c || typeof c !== 'object') return ['Content is missing.'];
  if (!intIn(c.minutesPerSession, 1, 180)) e.push('Minutes per session must be a whole number from 1 to 180.');
  if (!c.consent || !Array.isArray(c.consent.paragraphs) || !c.consent.paragraphs.length || !c.consent.paragraphs.every(p => str(p))) e.push('Consent needs at least one paragraph.');
  if (c.consent && !str(c.consent.agreeLabel, 300)) e.push('Consent needs an agreement checkbox label.');

  // Alerts
  const ids = new Set();
  if (!Array.isArray(c.alerts) || !c.alerts.length) e.push('Add at least one alert.');
  else c.alerts.forEach(a => {
    if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(a.id || '')) e.push(`${alertName(a)}: invalid ID.`);
    else if (ids.has(a.id)) e.push(`Two alerts share the ID "${a.id}".`);
    ids.add(a.id);
    if (!str(a.family, 40)) e.push(`${alertName(a)}: the alert type (used to group alerts in analysis) is required.`);
    validateAlert(a, e, false);
  });
  if (!c.practice) e.push('The practice alert is missing.'); else validateAlert(c.practice, e, true);

  // Sessions and AI
  const d = c.design;
  if (!d || !Array.isArray(d.sessions) || d.sessions.length < 1 || d.sessions.length > 12) e.push('The study needs 1 to 12 sessions.');
  else d.sessions.forEach((s, i) => {
    const where = `Session ${i + 1}`;
    if (!Array.isArray(s.alerts) || !s.alerts.length || s.alerts.length > 40) { e.push(`${where}: choose 1 to 40 alerts.`); return; }
    if (new Set(s.alerts).size !== s.alerts.length) e.push(`${where}: an alert is listed twice.`);
    const missing = s.alerts.filter(id => !ids.has(id));
    if (missing.length) e.push(`${where}: uses alerts that no longer exist (${missing.join(', ')}).`);
    if (s.ai != null) {
      if (!Array.isArray(s.ai) || s.ai.length !== s.alerts.length) e.push(`${where}: the AI behaviors must add up to the number of alerts (${s.alerts.length}).`);
      else if (!s.ai.every(t => t in AI_TYPES)) e.push(`${where}: unknown AI behavior.`);
    }
  });
  const conf = d && d.aiConfidence;
  if (!conf || !intIn(conf.highMin, 50, 100) || !intIn(conf.highMax, 50, 100) || !intIn(conf.lowMin, 50, 100) || !intIn(conf.lowMax, 50, 100) || conf.highMin > conf.highMax || conf.lowMin > conf.lowMax)
    e.push('AI confidence ranges must be whole numbers from 50 to 100, with the lowest no higher than the highest.');
  if (typeof d?.practice !== 'boolean') e.push('Choose whether session 1 starts with a practice alert.');

  // Surveys
  const nS = d && Array.isArray(d.sessions) ? d.sessions.length : 0;
  for (const kind of ['pre', 'post']) {
    const items = c.survey && c.survey[kind];
    if (!Array.isArray(items)) { e.push(`Survey "${kind}" is missing.`); continue; }
    const qids = new Set();
    items.forEach((it, i) => {
      const where = `${kind === 'pre' ? 'Start-of-session' : 'End-of-session'} question ${i + 1}`;
      if (!/^[a-z][a-z0-9_]{0,40}$/.test(it.id || '')) e.push(`${where}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
      else if (qids.has(it.id)) e.push(`${where}: variable name "${it.id}" is used twice.`);
      qids.add(it.id);
      if (!str(it.text, 1000)) e.push(`${where}: question text is empty.`);
      if (!TYPES.includes(it.type)) e.push(`${where}: unknown question type.`);
      if (!SHOW_IF.includes(it.showIf)) e.push(`${where}: unknown "show when" setting.`);
      if (!Array.isArray(it.sessions) || !it.sessions.every(n => intIn(n, 1, nS))) e.push(`${where}: sessions must be numbers from 1 to ${nS}.`);
      if (it.type === 'scale' && !intIn(it.n, 2, 11)) e.push(`${where}: a scale needs 2 to 11 points.`);
      if (it.type === 'choice' || it.type === 'select') {
        if (!Array.isArray(it.options) || it.options.length < 2) e.push(`${where}: add at least two options.`);
        else if (!it.options.every(o => str(o.value, 200) && str(o.label, 300))) e.push(`${where}: every option needs text.`);
        else if (new Set(it.options.map(o => o.value)).size !== it.options.length) e.push(`${where}: two options have the same value.`);
      }
    });
  }

  // Screen text
  if (!c.text || typeof c.text !== 'object') e.push('Screen text is missing.');
  else for (const f of TEXT_FIELDS) if (!str(c.text[f.key], 3000)) e.push(`Screen text "${f.group}: ${f.label}" is empty.`);
  return e;
}

export async function saveContent(store, next, who, baseVersion, now = Date.now()) {
  if (!next || typeof next !== 'object') return { error: 'invalid', status: 400, errors: ['Content is missing.'] };
  const cur = await getContentFresh(store);
  if (baseVersion != null && Number(baseVersion) !== (cur.version || 0)) return { error: 'conflict', status: 409, version: cur.version || 0 };
  const text = Object.fromEntries(TEXT_FIELDS.map(f => [f.key, next.text ? next.text[f.key] : undefined]));
  const clean = {
    minutesPerSession: Number(next.minutesPerSession), consent: next.consent, design: next.design, survey: next.survey, text, alerts: next.alerts, practice: next.practice
  };
  normalize(clean);
  const errors = validateContent(clean);
  if (errors.length) return { error: 'invalid', status: 400, errors };
  const version = (cur.version || 0) + 1;
  const saved = { version, savedAt: now, savedBy: who, ...clean };
  await store.set(`content/history/v${String(version).padStart(5, '0')}`, saved);
  await store.set('content/current', saved);
  clearContentCache();
  return { ok: true, version };
}

async function getContentFresh(store) { clearContentCache(); return getContent(store); }

export async function contentHistory(store) {
  const keys = (await store.list('content/history/')).sort().reverse();
  const out = [];
  for (const k of keys.slice(0, 100)) { const c = await store.get(k); if (c) out.push({ version: c.version, savedAt: c.savedAt, savedBy: c.savedBy, restoredFrom: c.restoredFrom ?? null }); }
  return out;
}

export async function restoreContent(store, version, who, now = Date.now()) {
  const old = version === 0 ? structuredClone(DEFAULT_CONTENT) : await store.get(`content/history/v${String(version).padStart(5, '0')}`);
  if (!old) return { error: 'not_found', status: 404 };
  const cur = await getContentFresh(store);
  const r = await saveContent(store, normalize(old), who, cur.version || 0, now);
  if (r.ok) { const k = `content/history/v${String(r.version).padStart(5, '0')}`; const c = await store.get(k); c.restoredFrom = version; await store.set(k, c); await store.set('content/current', c); clearContentCache(); }
  return r;
}
