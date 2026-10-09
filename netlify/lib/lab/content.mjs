// CCAIR Behavioral Lab: editable study content, shared by every study type.
// Engine-level parts: session length, consent, sign-up rules, start/end-of-session surveys, and the
// screen text the participant shell uses. Each study type adds its own parts (contentKeys), text fields,
// defaults, normalization, validation, and survey "show when" rules. Saved edits are numbered versions.

// Screen text used by the shared participant app (types add or override fields).
export const ENGINE_TEXT = [
  ['Sign-in', 'login_title', 'Page title', 'Research study'],
  ['Sign-in', 'login_intro', 'Sign-in instructions', 'Enter your GSU email address. Use the same email each session so your sessions stay together and your participation is recorded.'],
  ['Sign-in', 'confirm_title', 'First sign-in: title', 'Is this your email?'],
  ['Sign-in', 'confirm_body', 'First sign-in: text ({email})', 'You are starting the study as {email}. Use this same address every time. If it has a typo, change it now.'],
  ['Sign-in', 'confirm_yes', 'First sign-in: confirm button', 'Yes, that is my email'],
  ['Sign-in', 'confirm_no', 'First sign-in: change button', 'Change email'],
  ['Consent', 'consent_title', 'Consent page title', 'Consent to participate'],
  ['Consent', 'decline_body', 'Shown after "I do not agree"', 'You have chosen not to take part. You can close this page.'],
  ['Session start', 'start_title', 'Title ({session}, {total})', 'Session {session} of {total}'],
  ['Session start', 'start_body', 'Before starting ({minutes})', 'This session takes about {minutes} minutes. Please complete it in one sitting, somewhere you will not be interrupted.\n\nIf you get disconnected, sign in again and you will pick up where you left off.'],
  ['Session start', 'start_button', 'Start button ({session})', 'Start session {session}'],
  ['Session start', 'progress_done', 'Progress line ({completed}, {total})', 'You have completed {completed} of {total} sessions.'],
  ['Session start', 'wait_title', 'Next session not open: title', 'Your next session is not open yet'],
  ['Session start', 'wait_body', 'Next session not open: text ({session}, {date})', 'Session {session} opens on {date}. Come back then and sign in the same way.'],
  ['Instructions', 'instr_title', 'Title', 'How this session works'],
  ['Instructions', 'instr_intro', 'Instructions ({n} = items this session)', 'You will see {n} items. Read each one and answer the questions.'],
  ['Instructions', 'instr_practice', 'Practice notice', 'You will start with one practice item that does not count.'],
  ['Instructions', 'begin_button', 'Begin button', 'Begin'],
  ['Item screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Session {session} · Item {i} of {n}'],
  ['Item screen', 'progress_practice', 'Progress line, practice', 'Practice item'],
  ['Item screen', 'submit_button', 'Submit button', 'Continue'],
  ['Item screen', 'practice_submit', 'Submit button, practice', 'Finish practice'],
  ['Confidence scale', 'conf_help', 'Help text', 'Click or tap anywhere on the line to set your answer. You can adjust it before you continue.'],
  ['Confidence scale', 'conf_low', 'Left end', '0'],
  ['Confidence scale', 'conf_high', 'Right end', '100'],
  ['Confidence scale', 'conf_needed', 'Reminder when unanswered', 'Set your answer on the line to continue.'],
  ['Practice', 'practice_done_title', 'After practice: title', 'Practice complete'],
  ['Practice', 'practice_done_body', 'After practice: text', 'The real items start now. They will look the same as the practice item.'],
  ['Practice', 'practice_done_button', 'After practice: button', 'Start'],
  ['Surveys', 'pre_title', 'Start-of-session survey title', 'A few questions about you'],
  ['Surveys', 'post_title', 'End-of-session survey title', 'About this session'],
  ['Surveys', 'continue_button', 'Continue button', 'Continue'],
  ['Surveys', 'skip_prompt', 'Reminder about skipped questions ({n})', 'You left {n} question(s) unanswered. Your answers help the study, but you can continue without them.'],
  ['Surveys', 'skip_continue', 'Continue without answering', 'Continue anyway'],
  ['Surveys', 'required_prompt', 'Reminder about required questions', 'Please answer the highlighted question(s) to continue.'],
  ['End of session', 'done_title', 'Title', 'Session complete'],
  ['End of session', 'done_body', 'Text', 'Thank you. Your answers are saved.'],
  ['End of session', 'done_next', 'Next session ({date})', 'Your next session opens on {date}. Sign in the same way.'],
  ['End of session', 'finished_title', 'Last session: title', 'Thank you'],
  ['End of session', 'finished_body', 'Last session: text', 'You have completed all sessions of the study. You can close this page.'],
  ['End of session', 'calendar_button', 'Add-to-calendar button', 'Add the next session to my calendar'],
  ['End of session', 'sign_out', 'Sign-out button', 'Sign out']
].map(([group, key, label, def]) => ({ group, key, label, def }));

export function textFieldsFor(type) {
  const byKey = new Map(ENGINE_TEXT.map(f => [f.key, f]));
  for (const f of type.textFields || []) byKey.set(f.key, f);
  return [...byKey.values()];
}

// Defaults every study starts from; the type's defaultContent() is merged over these.
export function engineDefaults() {
  return {
    version: 0,
    minutesPerSession: 15,
    consent: { approved: false, paragraphs: ['[Paste the IRB-approved consent text here. Leave a blank line between paragraphs.]'], agreeLabel: 'I am 18 or older and I agree to participate.' },
    enrollment: { open: true, domains: ['gsu.edu', 'student.gsu.edu'], gapDays: 0, label: 'self-signup' },
    survey: { pre: [], post: [] }
  };
}

export function defaultContent(type) {
  const base = engineDefaults(), t = type.defaultContent();
  const c = { ...base, ...t, consent: { ...base.consent, ...(t.consent || {}) }, enrollment: { ...base.enrollment, ...(t.enrollment || {}) }, survey: { ...base.survey, ...(t.survey || {}) } };
  c.text = Object.fromEntries(textFieldsFor(type).map(f => [f.key, f.def]));
  return c;
}

const ENGINE_KEYS = ['minutesPerSession', 'consent', 'enrollment', 'survey', 'text'];

// Survey "show when" rules: always, by condition (it.conditions), plus the type's own rules.
export function itemsFor(items, kind, ctx, type) {
  return (items || []).filter(it => {
    const inSession = Array.isArray(it.sessions) && it.sessions.length ? it.sessions.includes(ctx.session) : (kind === 'pre' ? ctx.session === 1 : true);
    if (!inSession) return false;
    if (Array.isArray(it.conditions) && it.conditions.length && !it.conditions.includes(ctx.condition)) return false;
    if (!it.showIf || it.showIf === 'always') return true;
    return type.surveyRule ? type.surveyRule(it.showIf, ctx) : true;
  });
}

// Fills in anything an older saved version lacks.
export function normalize(c, type) {
  const d = defaultContent(type);
  c.minutesPerSession = c.minutesPerSession ?? d.minutesPerSession;
  c.consent = { ...d.consent, ...(c.consent || {}) };
  c.enrollment = { ...d.enrollment, ...(c.enrollment || {}) };
  c.survey = { pre: c.survey?.pre || d.survey.pre, post: c.survey?.post || d.survey.post };
  c.text = { ...d.text, ...(c.text || {}) };
  for (const kind of ['pre', 'post']) for (const it of c.survey[kind]) if (!Array.isArray(it.sessions)) it.sessions = kind === 'pre' ? [1] : [];
  for (const k of type.contentKeys) if (c[k] === undefined) c[k] = structuredClone(d[k]);
  if (type.normalize) type.normalize(c, d);
  return c;
}

const caches = new Map();   // per store name: { at, content }
export async function getContent(store, type) {
  const hit = caches.get(store.name);
  if (hit && Date.now() - hit.at < 5000) return hit.content;
  const c = normalize((await store.get('content/current')) || defaultContent(type), type);
  caches.set(store.name, { at: Date.now(), content: c });
  return c;
}
export function clearContentCache(store) { if (store) caches.delete(store.name); else caches.clear(); }

// What participants' browsers receive: no answer keys or type-private parts.
export function publicContent(c, type, study) {
  return { study: study.id, type: type.id, name: study.name, version: c.version, minutesPerSession: c.minutesPerSession, consent: c.consent,
    text: c.text, sessions: type.sessionCount(c), signup: c.enrollment.open ? c.enrollment.domains : [], ...(type.publicContent ? type.publicContent(c) : {}) };
}

export const QUESTION_TYPES = ['scale', 'choice', 'select', 'text', 'confidence'];
const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const RESERVED = ['code', 'condition', 'test', 'label', 'self_signup', 'session', 'survey', 'content_version', 'received_at', 'trial_index', 'item_id'];

// Validates one list of questions (surveys, or a type's per-item questions).
export function validateQuestions(items, where, e, { nSessions, conditions, rules, allowSessions = true }) {
  if (!Array.isArray(items)) { e.push(`${where} are missing.`); return; }
  const ids = new Set();
  items.forEach((it, i) => {
    const w = `${where} ${i + 1}`;
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(it.id || '')) e.push(`${w}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (ids.has(it.id)) e.push(`${w}: variable name "${it.id}" is used twice.`);
    else if (RESERVED.includes(it.id)) e.push(`${w}: "${it.id}" is reserved for an export column; choose another variable name.`);
    ids.add(it.id);
    if (!str(it.text, 1000)) e.push(`${w}: question text is empty.`);
    if (!QUESTION_TYPES.includes(it.type)) e.push(`${w}: unknown question type.`);
    if (it.showIf && it.showIf !== 'always' && !rules.includes(it.showIf)) e.push(`${w}: unknown "show when" setting.`);
    if (it.conditions != null && (!Array.isArray(it.conditions) || !it.conditions.every(x => conditions.includes(x)))) e.push(`${w}: conditions must be among ${conditions.join(', ')}.`);
    if (allowSessions && (!Array.isArray(it.sessions) || !it.sessions.every(n => intIn(n, 1, nSessions)))) e.push(`${w}: sessions must be numbers from 1 to ${nSessions}.`);
    if (it.type === 'scale') {
      if (!intIn(it.n, 2, 11)) e.push(`${w}: a scale needs 2 to 11 points.`);
      if (it.labels != null && it.labels.length && (!Array.isArray(it.labels) || it.labels.length !== it.n || !it.labels.every(x => str(x, 120)))) e.push(`${w}: give one label per point (${it.n}), or leave the labels empty to label only the ends.`);
    }
    if (it.type === 'choice' || it.type === 'select') {
      if (!Array.isArray(it.options) || it.options.length < 2) e.push(`${w}: add at least two options.`);
      else if (!it.options.every(o => str(o.value, 200) && str(o.label, 300))) e.push(`${w}: every option needs text.`);
      else if (new Set(it.options.map(o => o.value)).size !== it.options.length) e.push(`${w}: two options have the same value.`);
    }
  });
}

export function validateContent(c, type) {
  const e = [];
  if (!c || typeof c !== 'object') return ['Content is missing.'];
  if (!intIn(c.minutesPerSession, 1, 180)) e.push('Minutes per session must be a whole number from 1 to 180.');
  if (!c.consent || !Array.isArray(c.consent.paragraphs) || !c.consent.paragraphs.length || !c.consent.paragraphs.every(p => str(p))) e.push('Consent needs at least one paragraph.');
  if (c.consent && !str(c.consent.agreeLabel, 300)) e.push('Consent needs an agreement checkbox label.');
  const en = c.enrollment;
  if (!en || typeof en.open !== 'boolean') e.push('Choose whether students can sign up themselves.');
  else {
    if (!Array.isArray(en.domains) || !en.domains.every(x => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(x))) e.push('Sign-up domains must look like gsu.edu (one per line, no @).');
    else if (en.open && !en.domains.length) e.push('Add at least one email domain, or turn off self sign-up.');
    if (!intIn(en.gapDays, 0, 60)) e.push('Gap days for self sign-ups must be a whole number from 0 to 60.');
    if (en.label != null && typeof en.label === 'string' && en.label.length > 40) e.push('The self sign-up label must be 40 characters or fewer.');
  }
  const typeErrors = [];
  if (type.validate) type.validate(c, typeErrors);
  const nS = typeErrors.length ? 99 : type.sessionCount(c);
  const opts = { nSessions: nS, conditions: type.conditionsOf(c), rules: (type.surveyRules || []).map(r => r[0]) };
  validateQuestions(c.survey?.pre, 'Start-of-session question', e, opts);
  validateQuestions(c.survey?.post, 'End-of-session question', e, opts);
  if (!c.text || typeof c.text !== 'object') e.push('Screen text is missing.');
  else for (const f of textFieldsFor(type)) if (!str(c.text[f.key], 3000)) e.push(`Screen text "${f.group}: ${f.label}" is empty.`);
  return e.concat(typeErrors);
}

export async function saveContent(store, type, next, who, baseVersion, now = Date.now()) {
  if (!next || typeof next !== 'object') return { error: 'invalid', status: 400, errors: ['Content is missing.'] };
  clearContentCache(store);
  const cur = await getContent(store, type);
  if (baseVersion != null && Number(baseVersion) !== (cur.version || 0)) return { error: 'conflict', status: 409, version: cur.version || 0 };
  const fields = textFieldsFor(type);
  const clean = Object.fromEntries(ENGINE_KEYS.concat(type.contentKeys).map(k => [k, next[k]]));
  clean.minutesPerSession = Number(next.minutesPerSession);
  clean.text = Object.fromEntries(fields.map(f => [f.key, next.text ? next.text[f.key] : undefined]));
  normalize(clean, type);
  const errors = validateContent(clean, type);
  if (errors.length) return { error: 'invalid', status: 400, errors };
  const version = (cur.version || 0) + 1;
  const saved = { version, savedAt: now, savedBy: who, ...clean };
  const hk = `content/history/v${String(version).padStart(5, '0')}`;
  if (store.setIf) { if (!(await store.setIf(hk, saved, { onlyIfNew: true }))) return { error: 'conflict', status: 409, version }; }
  else await store.set(hk, saved);
  await store.set('content/current', saved);
  clearContentCache(store);
  return { ok: true, version };
}

export async function contentHistory(store) {
  const keys = (await store.list('content/history/')).sort().reverse();
  const vals = await Promise.all(keys.slice(0, 100).map(k => store.get(k)));
  return vals.filter(Boolean).map(c => ({ version: c.version, savedAt: c.savedAt, savedBy: c.savedBy, restoredFrom: c.restoredFrom ?? null }));
}

export async function restoreContent(store, type, version, who, now = Date.now()) {
  const old = version === 0 ? defaultContent(type) : await store.get(`content/history/v${String(version).padStart(5, '0')}`);
  if (!old) return { error: 'not_found', status: 404 };
  clearContentCache(store);
  const cur = await getContent(store, type);
  const r = await saveContent(store, type, normalize(structuredClone(old), type), who, cur.version || 0, now);
  if (r.ok) { const k = `content/history/v${String(r.version).padStart(5, '0')}`; const c = await store.get(k); c.restoredFrom = version; await store.set(k, c); await store.set('content/current', c); clearContentCache(store); }
  return r;
}

export function domainAllowed(email, domains) {
  const at = email.lastIndexOf('@');
  return at > 0 && (domains || []).includes(email.slice(at + 1));
}
