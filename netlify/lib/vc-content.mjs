// Verification study: editable study content (consent, surveys, alerts).
// Defaults live in code; saved edits live in the store as numbered versions.
import { ALERTS, PRACTICE } from './vc-alerts.mjs';

const scale7 = (id, text, showIf = 'ai') => ({ id, text, type: 'scale', n: 7, lo: 'Strongly disagree', hi: 'Strongly agree', required: true, showIf });

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
  survey: {
    // Shown once, in session 1, before the practice alert.
    pre: [
      { id: 'experience_years', text: 'How many years of cybersecurity work or study experience do you have?', type: 'select', required: true, showIf: 'always',
        options: ['None', 'Less than 1', '1–2', '3–5', 'More than 5'].map(v => ({ value: v, label: v })) },
      { id: 'role', text: 'Which best describes you?', type: 'choice', required: true, showIf: 'always',
        options: [['student', 'Student'], ['analyst', 'Security analyst or SOC staff'], ['it', 'Other IT role'], ['other', 'Other']].map(([value, label]) => ({ value, label })) },
      { id: 'alert_familiarity', text: 'How familiar are you with reviewing security alerts?', type: 'scale', n: 5, lo: 'Not at all familiar', hi: 'Extremely familiar', required: true, showIf: 'always' },
      { id: 'ai_use', text: 'How often do you use AI tools (such as chat assistants) for work or study?', type: 'scale', n: 5, lo: 'Never', hi: 'Several times a day', required: true, showIf: 'always' }
    ],
    // Shown at the end of every session. showIf: always | ai (session had the AI) | no_ai | after_ai (AI removed after earlier sessions had it).
    post: [
      scale7('trust_1', '"I trusted the AI assistant\'s assessments in this session."'),
      scale7('trust_2', '"The AI assistant was reliable."'),
      scale7('reliance_1', '"I relied on the AI assistant to make my decisions."'),
      { id: 'no_ai_difficulty', text: 'How difficult was it to decide without the AI assistant in this session?', type: 'scale', n: 7, lo: 'Not at all difficult', hi: 'Extremely difficult', required: true, showIf: 'after_ai' },
      { id: 'mental_effort', text: 'How much mental effort did this session take?', type: 'scale', n: 9, lo: 'Very, very low', hi: 'Very, very high', required: true, showIf: 'always' }
    ]
  },
  alerts: ALERTS,
  practice: PRACTICE
};

export const SHOW_IF = ['always', 'ai', 'no_ai', 'after_ai'];
const TYPES = ['scale', 'choice', 'select', 'text'];
const SUPPORTS = ['malicious', 'benign', 'neutral'];
const PANEL_KEYS = ['network', 'user', 'system', 'context'];

let cache = null; // { at, content } per function instance
export async function getContent(store) {
  if (cache && Date.now() - cache.at < 5000) return cache.content;
  const c = (await store.get('content/current')) || structuredClone(DEFAULT_CONTENT);
  cache = { at: Date.now(), content: c };
  return c;
}
export function clearContentCache() { cache = null; }

// What participants' browsers receive (no ground truth).
export function publicContent(c) {
  return { version: c.version, minutesPerSession: c.minutesPerSession, consent: c.consent, survey: c.survey };
}

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export function validateContent(c) {
  const e = [];
  if (!c || typeof c !== 'object') return ['Content is missing.'];
  if (!(Number.isInteger(c.minutesPerSession) && c.minutesPerSession >= 1 && c.minutesPerSession <= 180)) e.push('Minutes per session must be a whole number from 1 to 180.');
  if (!c.consent || !Array.isArray(c.consent.paragraphs) || !c.consent.paragraphs.length || !c.consent.paragraphs.every(p => str(p))) e.push('Consent needs at least one paragraph.');
  if (c.consent && !str(c.consent.agreeLabel, 300)) e.push('Consent needs an agreement checkbox label.');
  for (const kind of ['pre', 'post']) {
    const items = c.survey && c.survey[kind];
    if (!Array.isArray(items)) { e.push(`Survey "${kind}" is missing.`); continue; }
    const ids = new Set();
    items.forEach((it, i) => {
      const where = `${kind === 'pre' ? 'Background' : 'End-of-session'} question ${i + 1}`;
      if (!/^[a-z][a-z0-9_]{0,40}$/.test(it.id || '')) e.push(`${where}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
      else if (ids.has(it.id)) e.push(`${where}: variable name "${it.id}" is used twice.`);
      ids.add(it.id);
      if (!str(it.text, 1000)) e.push(`${where}: question text is empty.`);
      if (!TYPES.includes(it.type)) e.push(`${where}: unknown question type.`);
      if (!SHOW_IF.includes(it.showIf)) e.push(`${where}: unknown "show when" setting.`);
      if (it.type === 'scale' && !(Number.isInteger(it.n) && it.n >= 2 && it.n <= 11)) e.push(`${where}: a scale needs 2 to 11 points.`);
      if ((it.type === 'choice' || it.type === 'select')) {
        if (!Array.isArray(it.options) || it.options.length < 2) e.push(`${where}: add at least two options.`);
        else if (!it.options.every(o => str(o.value, 200) && str(o.label, 300))) e.push(`${where}: every option needs text.`);
        else if (new Set(it.options.map(o => o.value)).size !== it.options.length) e.push(`${where}: two options have the same value.`);
      }
    });
  }
  // Alerts: text and labels are editable; the set of alerts (8 families x 4 variants) is fixed because the session design depends on it.
  const want = DEFAULT_CONTENT.alerts.map(a => a.id).sort().join();
  if (!Array.isArray(c.alerts) || c.alerts.map(a => a.id).sort().join() !== want) e.push('The set of alerts cannot change (8 types x 4 versions).');
  else for (const a of [...c.alerts, c.practice]) {
    const where = a && a.id === 'practice' ? 'Practice alert' : `Alert ${a && a.id}`;
    if (!a) { e.push('Practice alert is missing.'); continue; }
    if (!str(a.title, 200) || !str(a.summary, 1000) || !str(a.severity, 40)) e.push(`${where}: title, severity, and summary are required.`);
    if (!['malicious', 'benign'].includes(a.truth)) e.push(`${where}: the correct answer must be malicious or benign.`);
    if (!Array.isArray(a.panels) || a.panels.map(p => p.key).join() !== PANEL_KEYS.join()) { e.push(`${where}: the four evidence panels are required.`); continue; }
    a.panels.forEach(p => {
      if (!str(p.label, 80) || !str(p.text, 2000)) e.push(`${where}: every evidence panel needs a label and text.`);
      if (!SUPPORTS.includes(p.supports)) e.push(`${where}: evidence "${p.label}" must point to malicious, benign, or neither.`);
    });
    if (!Array.isArray(a.misleadingPanels) || !a.misleadingPanels.every(k => PANEL_KEYS.includes(k))) e.push(`${where}: misleading panels are invalid.`);
    if (a.id !== 'practice' && (!str(a.aiRationale?.correct, 1000) || !str(a.aiRationale?.incorrect, 1000))) e.push(`${where}: both AI explanations are required.`);
  }
  return e;
}

export async function saveContent(store, next, who, baseVersion, now = Date.now()) {
  if (!next || typeof next !== 'object') return { error: 'invalid', status: 400, errors: ['Content is missing.'] };
  const cur = await getContentFresh(store);
  if (baseVersion != null && Number(baseVersion) !== (cur.version || 0)) return { error: 'conflict', status: 409, version: cur.version || 0 };
  const clean = {
    minutesPerSession: Number(next.minutesPerSession), consent: next.consent, survey: next.survey, alerts: next.alerts, practice: next.practice
  };
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
  for (const k of keys.slice(0, 100)) { const c = await store.get(k); if (c) out.push({ version: c.version, savedAt: c.savedAt, savedBy: c.savedBy, restoredFrom: c.restoredFrom || null }); }
  return out;
}

export async function restoreContent(store, version, who, now = Date.now()) {
  const old = version === 0 ? structuredClone(DEFAULT_CONTENT) : await store.get(`content/history/v${String(version).padStart(5, '0')}`);
  if (!old) return { error: 'not_found', status: 404 };
  const cur = await getContentFresh(store);
  const r = await saveContent(store, old, who, cur.version || 0, now);
  if (r.ok) { const k = `content/history/v${String(r.version).padStart(5, '0')}`; const c = await store.get(k); c.restoredFrom = version; await store.set(k, c); await store.set('content/current', c); clearContentCache(); }
  return r;
}
