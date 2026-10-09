// Study type: vignettes (general-purpose).
// Each session shows a set of items (a scenario as plain text or as an email, optionally with an image),
// each followed by the same configurable questions (rating scales, multiple choice, confidence line,
// text). Conditions are defined in the content; each item can have per-condition wording (variants),
// so manipulations need no code. Links written as [text](url) in an item are shown as hover-able,
// non-navigating links whose hovers and clicks are recorded. Sessions with no items make a survey-only
// study. Participant renderer: static/lab/engine/types/vignettes.js.
import { cleanAnswers } from '../engine.mjs';
import { validateQuestions } from '../content.mjs';

const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Instructions', 'instr_intro', 'Instructions ({n} = items this session)', 'You will see {n} short scenarios. Read each one carefully, then answer the questions below it.'),
  F('Item screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Session {session} · Scenario {i} of {n}'),
  F('Item screen', 'progress_practice', 'Progress line, practice', 'Practice scenario'),
  F('Item screen', 'submit_button', 'Submit button', 'Continue'),
  F('Item screen', 'email_from', 'Email: "From" label', 'From'),
  F('Item screen', 'email_subject', 'Email: "Subject" label', 'Subject'),
  F('Item screen', 'link_status', 'Shown at the bottom when pointing at a link ({url})', '{url}')
];

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const jsonSize = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };
const ITEM_FIELDS = ['title', 'kind', 'from', 'subject', 'body', 'image', 'imageAlt'];

// The item as this participant sees it: base wording, overridden by their condition's variant.
function resolve(item, condition) {
  const v = (item.variants || {})[condition] || {};
  const out = { id: item.id };
  for (const k of ITEM_FIELDS) out[k] = v[k] != null && v[k] !== '' ? v[k] : item[k];
  out.variant = Object.keys(v).length ? condition : '';
  return out;
}

function validateItem(it, e, conds, where) {
  if (!str(it.title, 200)) e.push(`${where}: a title is required.`);
  if (!['text', 'email'].includes(it.kind)) e.push(`${where}: choose plain text or email.`);
  if (!str(it.body, 20000)) e.push(`${where}: the text is empty.`);
  if (it.kind === 'email' && (!str(it.from, 200) || !str(it.subject, 300))) e.push(`${where}: an email needs a sender and a subject.`);
  if (it.image && !/^(https:\/\/|\/lab\/)[^\s"'<>]+$/.test(it.image)) e.push(`${where}: the image must be an https:// address or a /lab/ path.`);
  for (const [k, v] of Object.entries(it.variants || {})) {
    if (!conds.includes(k)) e.push(`${where}: has wording for an unknown condition "${k}".`);
    if (v.image && !/^(https:\/\/|\/lab\/)[^\s"'<>]+$/.test(v.image)) e.push(`${where} (${k}): the image must be an https:// address or a /lab/ path.`);
  }
}

export default {
  id: 'vignettes',
  label: 'Vignettes and surveys (general purpose)',
  description: 'Show scenarios or emails, optionally with per-condition wording, each followed by configurable questions (scales, multiple choice, confidence, text). Sessions without items make a survey-only study. Hovers and clicks on links in an item are recorded.',
  contentKeys: ['design', 'items', 'practice', 'questions'],
  textFields,
  surveyRules: [],
  conditionsOf: c => (c.design?.conditions || []).map(x => x.id),
  sessionCount: c => c.design.sessions.length,
  editorMeta: () => ({}),

  defaultContent() {
    const AGREE = ['Not at all suspicious', 'Slightly suspicious', 'Somewhat suspicious', 'Moderately suspicious', 'Quite suspicious', 'Very suspicious', 'Extremely suspicious'];
    return {
      minutesPerSession: 10,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: false, randomize: true, sessions: [{ items: ['example-email', 'example-request'] }] },
      items: [
        { id: 'example-email', title: 'Account notice', kind: 'email', from: 'Northwind Bank <alerts@northwind-secure.example>', subject: 'Action required: verify your account',
          body: 'Dear customer,\n\nWe noticed unusual activity on your account. To keep your account active, [verify your details](https://northwind-secure.example/verify) within 24 hours.\n\nNorthwind Bank Security Team', image: '', imageAlt: '', variants: {} },
        { id: 'example-request', title: 'Shared-drive request', kind: 'text', from: '', subject: '',
          body: 'A colleague you have never met messages you on the company chat. They say they are from IT and ask you to share the folder link for your team\'s shared drive so they can "run a quick permissions audit."', image: '', imageAlt: '', variants: {} }
      ],
      practice: { id: 'practice', title: 'Practice scenario', kind: 'text', from: '', subject: '', body: 'A coworker asks to borrow your stapler for a meeting.', image: '', imageAlt: '', variants: {} },
      questions: [
        { id: 'suspicion', text: 'How suspicious is this?', type: 'scale', n: 7, lo: AGREE[0], hi: AGREE[6], labels: AGREE, required: true, showIf: 'always', conditions: [] },
        { id: 'action', text: 'What would you do next?', type: 'choice', required: true, showIf: 'always', conditions: [],
          options: [['act', 'Do what it asks'], ['verify', 'Check through another channel first'], ['report', 'Report it'], ['ignore', 'Ignore it']].map(([value, label]) => ({ value, label })) },
        { id: 'confidence', text: 'How confident are you in that choice?', type: 'confidence', required: true, showIf: 'always', conditions: [] },
        { id: 'why', text: 'Why? (optional)', type: 'text', required: false, showIf: 'always', conditions: [] }
      ],
      survey: { pre: [], post: [] }
    };
  },

  normalize(c, d) {
    c.design = { ...d.design, ...(c.design || {}) };
    for (const it of c.items || []) { it.variants = it.variants || {}; it.kind = it.kind || 'text'; }
    for (const q of c.questions || []) { if (!Array.isArray(q.conditions)) q.conditions = []; if (!q.showIf) q.showIf = 'always'; }
  },

  validate(c, e) {
    const d = c.design, conds = [];
    if (!d || !Array.isArray(d.conditions) || d.conditions.length < 1 || d.conditions.length > 8) e.push('Define 1 to 8 conditions.');
    else d.conditions.forEach((x, i) => {
      if (!/^[a-z][a-z0-9_]{0,30}$/.test(x.id || '')) e.push(`Condition ${i + 1}: the ID must start with a letter and use only lowercase letters, numbers, and underscores.`);
      else if (conds.includes(x.id)) e.push(`Two conditions share the ID "${x.id}".`);
      conds.push(x.id);
      if (!str(x.label, 80)) e.push(`Condition ${i + 1}: a label is required.`);
    });
    const ids = new Set();
    (c.items || []).forEach((it, i) => {
      if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(it.id || '')) e.push(`Item ${i + 1}: invalid ID.`);
      else if (ids.has(it.id)) e.push(`Two items share the ID "${it.id}".`);
      ids.add(it.id);
      validateItem(it, e, conds, `Item "${it.title || it.id}"`);
    });
    if (d?.practice) { if (!c.practice) e.push('The practice item is missing.'); else validateItem(c.practice, e, conds, 'Practice item'); }
    if (!d || !Array.isArray(d.sessions) || d.sessions.length < 1 || d.sessions.length > 12) e.push('The study needs 1 to 12 sessions.');
    else d.sessions.forEach((s, i) => {
      if (!Array.isArray(s.items) || s.items.length > 60) { e.push(`Session ${i + 1}: choose up to 60 items.`); return; }
      if (new Set(s.items).size !== s.items.length) e.push(`Session ${i + 1}: an item is listed twice.`);
      const missing = s.items.filter(id => !ids.has(id));
      if (missing.length) e.push(`Session ${i + 1}: uses items that no longer exist (${missing.join(', ')}).`);
    });
    if ((d?.sessions || []).some(s => (s.items || []).length) && !(c.questions || []).length) e.push('Add at least one question to ask about each item.');
    validateQuestions(c.questions || [], 'Item question', e, { nSessions: 99, conditions: conds, rules: [], allowSessions: false });
  },

  buildPlan(p, session, c, rand, { shuffle }) {
    const spec = c.design.sessions[session - 1];
    const items = spec.items.map(id => c.items.find(x => x.id === id));
    const order = c.design.randomize ? shuffle(items, rand) : items;
    const questions = (c.questions || []).filter(q => !q.conditions.length || q.conditions.includes(p.condition));
    return {
      questions,
      trials: order.map((it, i) => ({ index: i, itemId: it.id, item: resolve(it, p.condition) })),
      practice: session === 1 && c.design.practice && c.practice ? { item: resolve(c.practice, p.condition) } : null
    };
  },

  publicTrial(t) { const { id, variant, ...item } = t.item; return { item }; },
  publicPlanExtras: plan => ({ questions: plan.questions }),

  cleanTrialData(d, t, plan) {
    d = d && typeof d === 'object' ? d : {};
    const small = (v, max) => v && typeof v === 'object' && jsonSize(v) <= max ? v : null;
    const answerLog = Array.isArray(d.answerLog) ? d.answerLog.slice(0, 1000).map(a => ({ atMs: num(a?.atMs, 0, 864e5), name: typeof a?.name === 'string' ? a.name.slice(0, 40) : null,
      value: typeof a?.value === 'number' ? a.value : String(a?.value ?? '').slice(0, 300) })) : [];
    return { answers: cleanAnswers(d.answers, plan.questions || []), rtMs: num(d.rtMs, 0, 864e5), answerLog, traces: small(d.traces, 50000),
      viewport: d.viewport ? { w: num(d.viewport.w, 0, 20000), h: num(d.viewport.h, 0, 20000) } : null, device: small(d.device, 4000), selfTest: d.selfTest === true || undefined };
  },

  recordFields: (t, plan) => ({ itemId: t.itemId, item: { id: t.item.id, title: t.item.title, kind: t.item.kind, variant: t.item.variant }, questions: (plan.questions || []).map(q => q.id) }),

  trialRow(r) {
    const d = r.data || {}, tr = d.traces || {};
    const linkHovers = Object.entries(tr.hovers || {}).filter(([k]) => k.startsWith('link:'));
    const linkClicks = Object.entries(tr.clickTargets || {}).filter(([k]) => k.startsWith('link:'));
    const row = { item_id: r.itemId, item_title: r.item?.title || '', item_kind: r.item?.kind || '', item_variant: r.item?.variant || '',
      rt_ms: d.rtMs ?? '', first_answer_ms: tr.firstAnswerMs ?? '', answer_changes: tr.answerChanges ?? '',
      link_hovers: linkHovers.reduce((n, [, h]) => n + (h.count || 0), 0), link_hover_ms: Math.round(linkHovers.reduce((n, [, h]) => n + (h.dwellMs || 0), 0)),
      link_clicks: linkClicks.reduce((n, [, c]) => n + c, 0) };
    for (const q of r.questions || Object.keys(d.answers || {})) row[`a_${q}`] = (d.answers || {})[q] ?? '';
    return row;
  },

  simulate(trial, plan, rand) {
    const pick = a => a[Math.floor(rand() * a.length)];
    const answers = {};
    for (const q of plan.questions || []) {
      if (q.type === 'scale') answers[q.id] = String(1 + Math.floor(rand() * q.n));
      else if (q.type === 'choice' || q.type === 'select') answers[q.id] = pick(q.options).value;
      else if (q.type === 'confidence') answers[q.id] = String(Math.floor(rand() * 101));
      else if (q.type === 'number') answers[q.id] = String(Math.floor(rand() * 90));
      else if (q.type === 'multi') answers[q.id] = [pick(q.options).value];
      else answers[q.id] = 'self-test note';
    }
    return { answers, rtMs: 1500, traces: { durationMs: 1500 }, selfTest: true, rawEvents: [{ t: 1, type: 'self_test' }] };
  },
  checkRow(row, sent) {
    const problems = [];
    for (const [k, v] of Object.entries(sent.answers)) if (row[`a_${k}`] !== (Array.isArray(v) ? v.join('|') : v)) problems.push(`answer ${k}`);
    return problems;
  },
  checkSession(rows, session, condition, c) {
    const spec = c.design.sessions[session - 1];
    return [[rows.length === spec.items.length && rows.every(x => spec.items.includes(x.item_id)), `Session ${session}: the right items were shown (${spec.items.length})`]];
  }
};
