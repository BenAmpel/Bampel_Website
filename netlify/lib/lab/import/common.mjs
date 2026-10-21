// CCAIR Behavioral Lab: survey importers, shared parts.
// Each importer (qsf.mjs, lss.mjs, redcap.mjs, sheet.mjs) turns one file format into a list of lab questions
// and hands them to finishImport(), which numbers the pages, repairs or drops anything the engine would refuse,
// builds complete vignettes-type content (survey only, one session unless the importer asks for more), checks it
// with validateContent, and writes the report. Nothing here saves anything.
import { defaultContent, validateContent, validateQuestions } from '../content.mjs';

// An own property of a parsed object, never an inherited one ("constructor", "__proto__").
export const own = (o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined);
import { TYPES } from '../types/index.mjs';
import { describe } from '../logic.mjs';

export const LIMITS = { bytes: 5 * 1024 * 1024, questions: 500 };

export class ImportError extends Error {
  constructor(message) { super(message); this.name = 'ImportError'; this.userMessage = message; }
}

export function assertSize(bytes) {
  if (bytes > LIMITS.bytes) throw new ImportError(`This file is ${(bytes / 1048576).toFixed(1)} MB. Files over ${LIMITS.bytes / 1048576} MB are not imported. Remove images and unused blocks, or split the survey.`);
}

// ---------- report ----------
export function newReport(format) {
  return { format, counts: { questions: 0, pages: 0, conditions: 1, embedded: 0 }, mapped: [], approximated: [], unsupported: [], warnings: [] };
}
export const mapped = (r, source, as, variable) => { r.mapped.push({ source, as, ...(variable ? { variable } : {}) }); };
export const approximated = (r, source, what) => { r.approximated.push({ source, what }); };
export const unsupported = (r, source, what) => { r.unsupported.push({ source, what }); };

// ---------- text ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', deg: '°', eacute: 'é', times: '×' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
    }
    return Object.hasOwn(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
  });
}

// HTML to plain text, in one linear pass (no backtracking, so hostile input cannot make it slow). Scripts, styles,
// comments, and tags are dropped; line breaks are kept; entities are decoded. The result is never inserted as HTML
// anywhere (the participant page escapes all text).
const SKIP_CONTENT = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'template']);
const BLOCK_END = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'ul', 'ol', 'table', 'blockquote']);
export function htmlToText(html) {
  const src = String(html ?? '').slice(0, 200000);
  if (!/[<&]/.test(src)) return src.replace(/\r\n?/g, '\n').trim();
  const lower = src.toLowerCase();
  let out = '', i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { out += src.slice(i); break; }
    out += src.slice(i, lt);
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
    const m = /^<(\/?)([a-z][a-z0-9]*)/.exec(lower.slice(lt, lt + 24));
    if (!m) { out += '<'; i = lt + 1; continue; }   // a lone "<" (as in "a < b") is text
    const name = m[2], close = m[1] === '/', gt = src.indexOf('>', lt);
    if (!close && SKIP_CONTENT.has(name)) {   // drop everything up to the matching close tag (or to the end)
      const e = lower.indexOf('</' + name, lt + 1);
      if (e < 0) break;
      const g = src.indexOf('>', e); i = g < 0 ? src.length : g + 1; continue;
    }
    if (name === 'br') out += '\n';
    else if (close && BLOCK_END.has(name)) out += '\n';
    else if (!close && name === 'li') out += '\u2022 ';
    else if (close && (name === 'td' || name === 'th')) out += ' ';
    i = gt < 0 ? src.length : gt + 1;
  }
  out = decodeEntities(out).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
  return out.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export const hasMarkup = html => /<\s*(img|video|audio|iframe|embed|object|table)\b/i.test(String(html ?? ''));

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

// ---------- variable names ----------
export const RESERVED_NAMES = ['constructor', 'prototype', '__proto__', 'hasownproperty', 'tostring', 'valueof', 'code', 'condition', 'test', 'label', 'self_signup', 'session', 'survey', 'content_version', 'received_at', 'trial_index', 'item_id'];
// The lab's variable rule: a lowercase letter, then lowercase letters, digits, and underscores, 41 characters at most.
export function sanitizeName(raw, fallback = 'q') {
  let s = String(raw ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = fallback;
  if (!/^[a-z]/.test(s)) s = `${fallback}_${s}`;
  return s.slice(0, 41).replace(/_+$/, '') || fallback;
}
export class Names {
  constructor() { this.used = new Set(); this.last = new Map(); }
  has(n) { return this.used.has(n); }
  // A unique valid name from `raw`; a clash gets _2, _3, ... and a reserved name gets _q.
  make(raw, fallback = 'q') {
    let base = sanitizeName(raw, fallback);
    if (RESERVED_NAMES.includes(base)) base = `${base.slice(0, 38)}_q`;
    let name = base, i = this.last.get(base) || 1;
    while (this.used.has(name)) { i++; const suffix = `_${i}`; name = base.slice(0, 41 - suffix.length) + suffix; }
    this.last.set(base, i);
    this.used.add(name);
    return name;
  }
}

// ---------- logic trees ----------
const NEG = { eq: 'neq', neq: 'eq', in: 'notIn', notIn: 'in', answered: 'notAnswered', notAnswered: 'answered' };
const NUMERIC_NEG = { gt: 'lte', gte: 'lt', lt: 'gte', lte: 'gt' };
export function negate(n) {
  if (n.all) return compact({ any: n.all.map(negate) });
  if (n.any) return compact({ all: n.any.map(negate) });
  if (n.condition != null) return { condition: n.condition, op: n.op === 'neq' ? 'eq' : 'neq' };
  if (NEG[n.op]) return { ...n, op: NEG[n.op] };
  if (NUMERIC_NEG[n.op]) return { any: [{ q: n.q, ed: n.ed, op: 'notAnswered' }, { ...n, op: NUMERIC_NEG[n.op] }].map(x => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined))) };
  return n;
}
// One level of structure removed where it adds nothing.
export function compact(n) {
  if (!n || typeof n !== 'object') return n;
  for (const k of ['all', 'any']) if (n[k]) {
    const kids = [];
    for (const c of n[k].map(compact)) { if (c[k]) kids.push(...c[k]); else kids.push(c); }
    return kids.length === 1 ? kids[0] : { [k]: kids };
  }
  return n;
}
export function depthOf(n) { const k = n && (n.all || n.any); return k ? 1 + Math.max(...k.map(depthOf)) : 0; }
export const MAX_DEPTH = 2;
// a AND b (either may be null = always). Returns null when the result is nested deeper than the engine allows.
export function andNodes(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const out = compact({ all: [a, b] });
  return depthOf(out) <= MAX_DEPTH ? out : null;
}
export function orNodes(a, b) {
  if (!a || !b) return null;
  const out = compact({ any: [a, b] });
  return depthOf(out) <= MAX_DEPTH ? out : null;
}

// ---------- building the content ----------
const AGREE_PLACEHOLDER = '[DRAFT placeholder: paste the IRB-approved consent text here. This study was created from an imported survey, which carries no consent text.]';

function cleanQuestion(q, report) {
  const out = { id: q.id, text: q.text, type: q.type };
  if (q.type === 'info') out.text = clip(q.text, 4000);
  else out.text = clip(q.text || '(no question text)', 4000);
  if (q.options) {
    const seen = new Set();
    out.options = q.options.map(o => {
      let value = clip(String(o.value), 200), i = 1;
      while (seen.has(value)) value = clip(String(o.value), 190) + '_' + (++i);
      seen.add(value);
      return { value, label: clip(String(o.label || o.value), 300) };
    });
  }
  if (q.type === 'scale') {
    out.n = q.n; if (Number.isInteger(q.start) && q.start !== 1) out.start = q.start; out.lo = q.lo ? clip(q.lo, 120) : ''; out.hi = q.hi ? clip(q.hi, 120) : '';
    if (q.labels && q.labels.length === q.n && q.labels.every(x => String(x).trim())) out.labels = q.labels.map(x => clip(String(x), 120));
  }
  if (q.type === 'text' && q.long != null) out.long = !!q.long;
  if (q.type === 'number') { if (Number.isFinite(q.min)) out.min = q.min; if (Number.isFinite(q.max)) out.max = q.max; }
  out.required = q.type === 'info' ? false : !!q.required;
  out.showIf = 'always';
  out.sessions = q.sessions || [1];
  out.conditions = q.conditions || [];
  out.page = q.page;
  if (q.displayIf) out.displayIf = q.displayIf;
  if (q.group) { out.group = q.group; if (q.groupText) out.groupText = clip(q.groupText, 2000); }
  if (q.source) out.source = clip(q.source, 300);
  return out;
}

// Removes display rules and piped-text tokens the engine would refuse (a reference to a later or missing
// question, an unknown option), reporting each one, until the questions validate.
function repair(questions, conditionIds, embeddedNames, nSessions, report) {
  for (let round = 0; round < 6; round++) {
    const errs = [];
    validateQuestions(questions, 'Start-of-session question', errs, { nSessions, conditions: conditionIds, rules: [], embedded: embeddedNames });
    const bad = new Map();
    for (const e of errs) {
      const m = e.match(/^Start-of-session question (\d+): (.*)$/);
      if (m && /display (rule|condition|operator)|piped|is not (one of the options|a point)/.test(m[2])) { const arr = bad.get(+m[1] - 1) || []; arr.push(m[2]); bad.set(+m[1] - 1, arr); }
    }
    if (!bad.size) return errs;
    for (const [i, why] of bad) {
      const q = questions[i];
      if (/piped/.test(why.join(' '))) {
        const strip = s => (typeof s === 'string' ? s.replace(/\{\{(q|ed):[^}]*\}\}/g, '') : s);
        q.text = strip(q.text) || '(no question text)'; if (q.groupText) q.groupText = strip(q.groupText);
        if (q.options) q.options.forEach(o => { o.label = strip(o.label) || o.value; });
        if (q.labels) q.labels = q.labels.map(strip);
        unsupported(report, q.source || q.id, `Piped text could not be kept (${why.find(w => /piped/.test(w))}); the token was removed.`);
      }
      if (q.displayIf && why.some(w => !/piped/.test(w))) {
        delete q.displayIf;
        unsupported(report, q.source || q.id, `Display logic could not be kept (${why.find(w => !/piped/.test(w))}); the question is shown to everyone.`);
      }
    }
  }
  return null;
}

// questions: lab questions in survey order, each { id, text, type, ..., page (any increasing numbers), sessions?, conditions? }.
// opts: { title, conditions: [{id, label}], embedded: [...], sessions: n, consent, formatName, minutes }
export function finishImport(report, questions, opts = {}) {
  if (!questions.length) throw new ImportError('No questions were found in this file. Check that it is the right format (see the template or the format list on this page).');
  if (questions.length > LIMITS.questions) throw new ImportError(`This survey has ${questions.length} questions. Surveys over ${LIMITS.questions} questions are not imported; split it into parts.`);
  const type = TYPES.vignettes;
  const conditions = opts.conditions && opts.conditions.length ? opts.conditions : [{ id: 'main', label: 'Everyone' }];
  const nSessions = Math.max(1, Math.min(12, opts.sessions || 1));
  const embedded = opts.embedded || [];
  // pages: consecutive numbers 1..N in the order given (the engine allows 99)
  const rank = [...new Set(questions.map(q => q.page))].sort((a, b) => a - b);
  if (rank.length > 99) report.warnings.push(`The survey has ${rank.length} pages; the lab allows 99, so the last pages were merged into page 99.`);
  const pageOf = new Map(rank.map((p, i) => [p, Math.min(i + 1, 99)]));
  const list = questions.map(q => cleanQuestion({ ...q, page: pageOf.get(q.page) }, report));
  const condIds = conditions.map(c => c.id);
  const errs = repair(list, condIds, embedded.map(e => e.name), nSessions, report);
  const dc = defaultContent(type);
  const content = {
    ...dc,
    minutesPerSession: opts.minutes || Math.max(3, Math.min(180, Math.ceil(list.filter(q => q.type !== 'info').length * 0.4))),
    consent: opts.consent || { approved: false, paragraphs: [AGREE_PLACEHOLDER], agreeLabel: dc.consent.agreeLabel },
    embedded,
    design: { conditions, practice: false, randomize: false, sessions: Array.from({ length: nSessions }, () => ({ items: [] })) },
    items: [],
    questions: [],
    survey: { pre: list, post: [] }
  };
  content.text = { ...dc.text, ...(opts.title ? { login_title: clip(opts.title, 120), pre_title: clip(opts.title, 120) } : {}) };
  const problems = errs ? validateContent(content, type) : ['display logic could not be repaired'];
  if (problems.length) throw new ImportError(`The survey was read, but it does not fit the lab's rules yet: ${problems.slice(0, 5).join(' ')}${problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''}`);
  report.counts = { questions: list.length, pages: rank.length > 99 ? 99 : rank.length, conditions: conditions.length, embedded: embedded.length, info: list.filter(q => q.type === 'info').length, sessions: nSessions };
  report.outline = outlineOf(list, nSessions);
  return { content, report };
}

export function outlineOf(list, nSessions = 1) {
  const pages = new Map();
  for (const q of list) {
    const key = `${(q.sessions || [1])[0]}|${q.page}`;
    if (!pages.has(key)) pages.set(key, { page: q.page, session: (q.sessions || [1])[0], questions: [] });
    pages.get(key).questions.push({ id: q.id, type: q.type, text: clip(q.text.replace(/\s+/g, ' '), 140), required: !!q.required, ...(q.source ? { source: q.source } : {}),
      ...(q.displayIf ? { logic: 'Show when ' + describe(q.displayIf, list) } : {}), ...(q.conditions && q.conditions.length ? { conditions: q.conditions } : {}), ...(q.group ? { group: q.group } : {}) });
  }
  return [...pages.values()].sort((a, b) => a.session - b.session || a.page - b.page);
}
