// CCAIR Behavioral Lab: editable study content, shared by every study type.
// Engine-level parts: session length, consent, sign-up rules, start/end-of-session surveys, and the
// screen text the participant shell uses. Each study type adds its own parts (contentKeys), text fields,
// defaults, normalization, validation, and survey "show when" rules. Saved edits are numbered versions.

import { OPS, NO_VALUE_OPS } from './logic.mjs';

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
  ['Surveys', 'survey_page', 'Page indicator on a multi-page survey ({i}, {n})', 'Page {i} of {n}'],
  ['Surveys', 'number_invalid', 'Reminder when a number answer is not a number', 'Enter a number using digits only (for example 25).'],
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
    embedded: [],
    minutesPerSession: 15,
    consent: { approved: false, paragraphs: ['[Paste the IRB-approved consent text here. Leave a blank line between paragraphs.]'], agreeLabel: 'I am 18 or older and I agree to participate.' },
    enrollment: { open: true, domains: ['gsu.edu', 'student.gsu.edu'], gapDays: 0, label: 'self-signup' },
    survey: { pre: [], post: [] }
  };
}

export function defaultContent(type) {
  const base = engineDefaults(), t = type.defaultContent();
  const c = { ...base, ...t, consent: { ...base.consent, ...(t.consent || {}) }, enrollment: { ...base.enrollment, ...(t.enrollment || {}) }, survey: { ...base.survey, ...(t.survey || {}) } };
  c.text = { ...Object.fromEntries(textFieldsFor(type).map(f => [f.key, f.def])), ...(t.text || {}) };
  return c;
}

const ENGINE_KEYS = ['minutesPerSession', 'consent', 'enrollment', 'survey', 'text', 'embedded'];

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
  c.embedded = Array.isArray(c.embedded) ? c.embedded : [];
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
    text: c.text, sessions: type.sessionCount(c), signup: c.enrollment.open ? c.enrollment.domains : [],
    embedded: (c.embedded || []).map(x => (x.source === 'url' ? { name: x.name, source: 'url', param: x.param || x.name } : { name: x.name, source: 'value', value: x.value })),
    ...(type.publicContent ? type.publicContent(c) : {}) };
}

export const QUESTION_TYPES = ['scale', 'choice', 'select', 'text', 'confidence', 'number', 'multi', 'info'];
const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const RESERVED = ['constructor', 'prototype', '__proto__', 'hasownproperty', 'tostring', 'valueof', 'code', 'condition', 'test', 'label', 'self_signup', 'session', 'survey', 'content_version', 'received_at', 'trial_index', 'item_id'];
const NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;
const PARAM_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,40}$/;
const PIPE_ANY = /\{\{(q|ed):([^}]*)\}\}/g;

// Checks one displayIf tree (see logic.mjs). `at(q)` -> { item, earlier } for a variable in this list.
function validateDisplayIf(node, w, e, ctx, depth = 0, count = { n: 0 }) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) { e.push(`${w}: the display rule is not valid.`); return; }
  const kids = node.all ?? node.any;
  if (node.all !== undefined || node.any !== undefined) {
    if ((node.all !== undefined && node.any !== undefined) || !Array.isArray(kids) || !kids.length || kids.length > 20) { e.push(`${w}: a display rule needs "all" or "any" with 1 to 20 conditions.`); return; }
    if (depth >= 2) { e.push(`${w}: display rules can nest all/any only one level deep.`); return; }
    kids.forEach(k => validateDisplayIf(k, w, e, ctx, depth + 1, count));
    return;
  }
  if (++count.n > 40) { if (count.n === 41) e.push(`${w}: a display rule can have at most 40 conditions.`); return; }
  const kinds = ['q', 'ed', 'condition'].filter(k => node[k] != null);
  if (kinds.length !== 1) { e.push(`${w}: each display condition names one question ("q"), embedded data ("ed"), or the participant's condition ("condition").`); return; }
  const kind = kinds[0], ref = node[kind];
  if (kind === 'condition') {
    if (!['eq', 'neq'].includes(node.op)) e.push(`${w}: a test on the condition must be "eq" or "neq".`);
    if (!ctx.conditions.includes(ref)) e.push(`${w}: the display rule refers to an unknown condition "${ref}".`);
    return;
  }
  if (!OPS.includes(node.op)) { e.push(`${w}: unknown display operator "${node.op}".`); return; }
  const needsValue = !NO_VALUE_OPS.includes(node.op);
  if (needsValue) {
    const vals = node.op === 'in' || node.op === 'notIn' ? node.value : [node.value];
    if (!Array.isArray(vals) || !vals.length || vals.length > 50 || !vals.every(v => (typeof v === 'string' && v.length <= 300) || (typeof v === 'number' && Number.isFinite(v)))) { e.push(`${w}: a display condition needs a value (for "in" and "notIn", a list of up to 50).`); return; }
    if (['gt', 'gte', 'lt', 'lte'].includes(node.op) && !Number.isFinite(Number(vals[0]))) e.push(`${w}: "${node.op}" compares numbers, but the value is not a number.`);
  }
  if (kind === 'ed') {
    if (!ctx.embedded.includes(ref)) e.push(`${w}: the display rule uses embedded data "${ref}", which is not defined.`);
    return;
  }
  const hit = ctx.at(ref);
  if (!hit) { e.push(`${w}: the display rule refers to "${ref}", which is not a question in this list.`); return; }
  if (!hit.earlier) { e.push(`${w}: the display rule refers to "${ref}", which does not come earlier (the question must be on an earlier page, or earlier on the same page).`); return; }
  const it = hit.item;
  if (it.type === 'info') { e.push(`${w}: the display rule refers to "${ref}", which has no answer (descriptive text).`); return; }
  if (needsValue && (it.type === 'choice' || it.type === 'select' || it.type === 'multi') && Array.isArray(it.options)) {
    const vals = (node.op === 'in' || node.op === 'notIn' ? node.value : [node.value]).map(String);
    for (const v of vals) if (!it.options.some(o => o.value === v)) e.push(`${w}: "${v}" is not one of the options of "${ref}".`);
  }
  if (needsValue && it.type === 'scale' && ['eq', 'neq', 'in', 'notIn'].includes(node.op)) {
    const lo = Number.isInteger(it.start) ? it.start : 1;
    for (const v of (node.op === 'in' || node.op === 'notIn' ? node.value : [node.value]).map(String)) if (!(/^-?\d+$/.test(v) && Number(v) >= lo && Number(v) <= lo + it.n - 1)) e.push(`${w}: "${v}" is not a point on the ${it.n}-point scale "${ref}" (${lo} to ${lo + it.n - 1}).`);
  }
}

// Validates one list of questions (surveys, or a type's per-item questions).
// opts: nSessions, conditions, rules, allowSessions (surveys), embedded (declared embedded-data names).
export function validateQuestions(items, where, e, { nSessions, conditions, rules, allowSessions = true, embedded = [] }) {
  if (!Array.isArray(items)) { e.push(`${where}s are missing.`); return; }
  const ids = new Set(), rank = new Map();
  items.forEach((it, i) => {
    const w = `${where} ${i + 1}`;
    if (!NAME_RE.test(it.id || '')) e.push(`${w}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (ids.has(it.id)) e.push(`${w}: variable name "${it.id}" is used twice.`);
    else if (RESERVED.includes(it.id)) e.push(`${w}: "${it.id}" is reserved for an export column; choose another variable name.`);
    ids.add(it.id);
    if (!rank.has(it.id)) rank.set(it.id, { item: it, page: allowSessions ? (it.page || 1) : 1, index: i });
    if (!str(it.text, 4000)) e.push(`${w}: question text is empty.`);
    if (!QUESTION_TYPES.includes(it.type)) e.push(`${w}: unknown question type.`);
    if (it.showIf && it.showIf !== 'always' && !rules.includes(it.showIf)) e.push(`${w}: unknown "show when" setting.`);
    if (it.conditions != null && (!Array.isArray(it.conditions) || !it.conditions.every(x => conditions.includes(x)))) e.push(`${w}: conditions must be among ${conditions.join(', ')}.`);
    if (allowSessions && (!Array.isArray(it.sessions) || !it.sessions.every(n => intIn(n, 1, nSessions)))) e.push(`${w}: sessions must be numbers from 1 to ${nSessions}.`);
    if (it.type === 'scale') {
      if (!intIn(it.n, 2, 11)) e.push(`${w}: a scale needs 2 to 11 points.`);
      if (it.start != null && !(intIn(it.start, -10, 100) && intIn(it.n, 2, 11) && it.start + it.n - 1 <= 100)) e.push(`${w}: the first scale number must be a whole number, and the numbers must stay between -10 and 100.`);
      if (it.labels != null && it.labels.length && (!Array.isArray(it.labels) || it.labels.length !== it.n || !it.labels.every(x => str(x, 120)))) e.push(`${w}: give one label per point (${it.n}), or leave the labels empty to label only the ends.`);
    }
    if (it.page != null && !allowSessions) e.push(`${w}: questions asked after an item are all on one screen, so they cannot have a page number.`);
    else if (it.page != null && !intIn(it.page, 1, 99)) e.push(`${w}: the page must be a whole number from 1 to 99.`);
    if (it.type === 'choice' || it.type === 'select' || it.type === 'multi') {
      if (!Array.isArray(it.options) || it.options.length < 2) e.push(`${w}: add at least two options.`);
      else if (!it.options.every(o => str(o.value, 200) && str(o.label, 300))) e.push(`${w}: every option needs text.`);
      else if (new Set(it.options.map(o => o.value)).size !== it.options.length) e.push(`${w}: two options have the same value.`);
    }
    if (it.long != null && typeof it.long !== 'boolean') e.push(`${w}: "long" must be true or false.`);
    if (it.min != null && !Number.isFinite(it.min)) e.push(`${w}: the minimum must be a number.`);
    if (it.max != null && !Number.isFinite(it.max)) e.push(`${w}: the maximum must be a number.`);
    if (Number.isFinite(it.min) && Number.isFinite(it.max) && it.min > it.max) e.push(`${w}: the minimum is above the maximum.`);
    if (it.group != null && !NAME_RE.test(it.group)) e.push(`${w}: the group ID must start with a letter and use only lowercase letters, numbers, and underscores.`);
    if (it.groupText != null && !(typeof it.groupText === 'string' && it.groupText.length <= 2000)) e.push(`${w}: the group heading is too long.`);
    if (it.source != null && !(typeof it.source === 'string' && it.source.length <= 300)) e.push(`${w}: the source note is too long.`);
  });
  const at = ref => { const r = rank.get(ref); return r ? { item: r.item, ref: r } : null; };
  items.forEach((it, i) => {
    const w = `${where} ${i + 1}`, me = rank.get(it.id);
    if (it.displayIf != null && me && me.item === it) {
      const lookup = ref => { const h = at(ref); return h ? { item: h.item, earlier: h.ref.page < me.page || (h.ref.page === me.page && h.ref.index < me.index) } : null; };
      validateDisplayIf(it.displayIf, w, e, { conditions, embedded, at: lookup });
    } else if (it.displayIf != null) validateDisplayIf(it.displayIf, w, e, { conditions, embedded, at: () => null });
    // Piped text: {{q:variable}} (an earlier question) and {{ed:name}} (declared embedded data).
    const texts = [it.text, it.groupText, it.lo, it.hi, ...(Array.isArray(it.labels) ? it.labels : []), ...(Array.isArray(it.options) ? it.options : []).map(o => o && o.label)].filter(x => typeof x === 'string');
    for (const t of texts) for (const m of t.matchAll(PIPE_ANY)) {
      if (!NAME_RE.test(m[2])) { e.push(`${w}: "{{${m[1]}:${m[2]}}}" is not a valid piped-text name.`); continue; }
      if (m[1] === 'ed') { if (!embedded.includes(m[2])) e.push(`${w}: piped text {{ed:${m[2]}}} uses embedded data that is not defined.`); }
      else {
        const h = at(m[2]);
        if (!h) e.push(`${w}: piped text {{q:${m[2]}}} refers to a question that does not exist in this list.`);
        else if (h.item.type === 'info' || !(h.ref.page < me.page || (h.ref.page === me.page && h.ref.index < me.index))) e.push(`${w}: piped text {{q:${m[2]}}} must refer to an earlier question that has an answer.`);
      }
    }
  });
}

// Embedded data: values captured when a session starts (URL parameters such as PROLIFIC_PID, or constants).
function validateEmbedded(list, e) {
  if (list == null) return;
  if (!Array.isArray(list) || list.length > 30) { e.push('Embedded data must be a list of at most 30 fields.'); return; }
  const seen = new Set();
  list.forEach((d, i) => {
    const w = `Embedded data ${i + 1}`;
    if (!d || typeof d !== 'object') { e.push(`${w}: not valid.`); return; }
    if (!NAME_RE.test(d.name || '')) e.push(`${w}: the name must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (seen.has(d.name)) e.push(`${w}: the name "${d.name}" is used twice.`);
    seen.add(d.name);
    if (d.source === 'url') { if (d.param != null && !PARAM_RE.test(d.param)) e.push(`${w}: the URL parameter name is not valid.`); }
    else if (d.source === 'value') { if (!str(d.value, 300)) e.push(`${w}: a constant needs a value of up to 300 characters.`); }
    else e.push(`${w}: the source must be "url" or "value".`);
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
  validateEmbedded(c.embedded, e);
  const opts = { nSessions: nS, conditions: type.conditionsOf(c), rules: (type.surveyRules || []).map(r => r[0]), embedded: (Array.isArray(c.embedded) ? c.embedded : []).map(x => x && x.name) };
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
