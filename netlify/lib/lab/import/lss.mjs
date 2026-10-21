// Import from a LimeSurvey structure file (.lss, XML). Groups become pages; question types L ! M F A B C E
// 5 Y G S T U N D X K Q O P map to lab questions; array questions become one question per row under one
// heading; simple relevance equations become display logic. Everything else is listed in the report.
import { ImportError, newReport, mapped, approximated, unsupported, Names, finishImport, htmlToText, hasMarkup, andNodes } from './common.mjs';
import { parseXml, child, childrenOf } from './xml.mjs';
import { parseExpr, toDisplayIf, Unsupported } from './expr.mjs';

// <section><fields/><rows><row><a>..</a></row></rows></section> -> [{a: '..'}]
function rowsOf(doc, name) {
  const rows = child(child(doc, name), 'rows');
  return childrenOf(rows, 'row').map(r => Object.fromEntries(r.children.map(c => [c.name, c.text.trim()])));
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const ATTR_UNSUPPORTED = ['array_filter', 'array_filter_exclude', 'random_order', 'random_group', 'em_validation_q', 'em_validation_sq', 'max_answers', 'min_answers', 'time_limit', 'exclude_all_others', 'public_statistics', 'em_validation_q_tip'];

export function importLss(text, { sourceName } = {}) {
  const doc = parseXml(text);
  if (doc.name !== 'document' || !child(doc, 'questions')) throw new ImportError('This does not look like a LimeSurvey .lss file (no <document> with <questions>). Export the survey structure from LimeSurvey as .lss.');
  const report = newReport('lss');
  const langs = childrenOf(child(doc, 'languages'), 'language').map(l => l.text.trim());
  const settings = rowsOf(doc, 'surveys')[0] || {};
  const lang = settings.language || langs[0] || '';
  const inLang = r => !r.language || !lang || r.language === lang;
  if (langs.length > 1) report.warnings.push(`The survey has ${langs.length} languages (${langs.join(', ')}); only ${lang} was imported.`);

  const l10n = new Map();   // qid -> { question, help }
  for (const r of rowsOf(doc, 'question_l10ns').filter(inLang)) l10n.set(r.qid, r);
  const qrows = [...rowsOf(doc, 'questions'), ...rowsOf(doc, 'subquestions')].filter(inLang);
  const qText = r => htmlToText((l10n.get(r.qid) || {}).question ?? r.question ?? '');
  const al10n = new Map();
  for (const r of rowsOf(doc, 'answer_l10ns').filter(inLang)) al10n.set(r.aid, r.answer);
  const answers = new Map();   // qid -> [{code, text, order, scale}]
  for (const r of rowsOf(doc, 'answers').filter(inLang)) {
    const list = answers.get(r.qid) || []; list.push({ code: r.code, text: htmlToText(al10n.get(r.aid) ?? r.answer ?? ''), order: num(r.sortorder), scale: num(r.scale_id) }); answers.set(r.qid, list);
  }
  const attrs = new Map();
  for (const r of rowsOf(doc, 'question_attributes')) if (!r.language || !lang || r.language === lang) { const o = attrs.get(r.qid) || {}; o[r.attribute] = r.value; attrs.set(r.qid, o); }
  const groupRows = rowsOf(doc, 'groups').filter(inLang).sort((a, b) => num(a.group_order) - num(b.group_order));
  const groupL10n = rowsOf(doc, 'group_l10ns').filter(inLang);
  const groupName = new Map(groupL10n.map(r => [r.gid, r.group_name]));
  for (const g of groupRows) if (g.group_name) groupName.set(g.gid, g.group_name);
  const subsOf = new Map();
  for (const r of qrows.filter(r => r.parent_qid && r.parent_qid !== '0')) { const l = subsOf.get(r.parent_qid) || []; l.push(r); subsOf.set(r.parent_qid, l); }
  const topRows = qrows.filter(r => !r.parent_qid || r.parent_qid === '0');
  if (!topRows.length) throw new ImportError('The survey has no questions.');
  if (rowsOf(doc, 'quota').length) unsupported(report, 'quotas', 'Quotas are not applied. The lab balances conditions but does not close the survey at a quota.');
  if (rowsOf(doc, 'assessments').length) unsupported(report, 'assessments', 'Assessments (scoring) are not applied.');
  if (settings.anonymized === 'N' && settings.tokenanswerspersistence === 'Y') report.warnings.push('The survey uses tokens (participant invitations); the lab signs participants in with its own sign-in instead.');

  const names = new Names(), refs = new Map(), questions = [], pendingLogic = [];
  let page = 0;
  for (const g of groupRows) {
    const qs = topRows.filter(r => r.gid === g.gid).sort((a, b) => num(a.question_order) - num(b.question_order));
    if (!qs.length) continue;
    page++;
    if (g.randomization_group) unsupported(report, `group ${groupName.get(g.gid) || g.gid}`, `Question order within the group is randomized (group "${g.randomization_group}"); the lab shows them in the listed order.`);
    const gdesc = htmlToText((groupL10n.find(r => r.gid === g.gid) || {}).description || g.description || '');
    if (gdesc) { const id = names.make(`group_${g.gid}_intro`, 'info'); questions.push({ id, type: 'info', text: gdesc, page, source: `group ${groupName.get(g.gid) || g.gid} description` }); }
    for (const r of qs) mapQuestion(r, g, page);
  }

  function mapQuestion(r, g, page) {
    const title = r.title || `q${r.qid}`, at = attrs.get(r.qid) || {}, type = r.type, text = qText(r), src = `${title} (type ${type})`;
    const ans = (answers.get(r.qid) || []).filter(a => a.scale === 0).sort((a, b) => a.order - b.order);
    const subs = (subsOf.get(r.qid) || []).filter(s => num(s.scale_id) === 0).sort((a, b) => num(a.question_order) - num(b.question_order));
    const required = r.mandatory === 'Y';
    if (at.hidden === '1') { unsupported(report, src, 'Hidden question (hidden attribute); not imported.'); return; }
    for (const a of ATTR_UNSUPPORTED) if (at[a] && at[a] !== '0') unsupported(report, src, `Setting "${a}" = ${String(at[a]).slice(0, 60)} is not applied.`);
    if (hasMarkup(l10n.get(r.qid)?.question ?? r.question ?? '')) approximated(report, src, 'Images or tables in the question text were removed (text only).');
    const pre = { page, required, relevance: [g.grelevance, r.relevance].filter(x => x && x.trim() && x.trim() !== '1'), source: src, qid: r.qid };
    const add = (q, refName, extra = {}) => {
      q.page = page; q.required = required; q.source = src; Object.assign(q, extra);
      questions.push(q); pendingLogic.push({ q, relevance: pre.relevance, src });
      const ref = extra.__ref || q.__ref || {};
      if (refName) refs.set(refName.toLowerCase(), { q, ...ref });
      delete q.__ref;
      return q;
    };
    const id = names.make(title, 'q');
    const opts = a => a.map(x => ({ value: x.code, label: x.text || x.code }));
    const rowsQuestion = (make) => {
      if (!subs.length) { unsupported(report, src, 'An array question without sub-questions; not imported.'); return; }
      const ids = [];
      for (const s of subs) {
        const rid = names.make(`${title}_${s.title}`, 'q'), q = { id: rid, text: qText(s) || s.title, group: id, groupText: text, ...make(s) };
        ids.push(rid);
        add(q, `${title}_${s.title}`, { __ref: { row: s.title, codes: q.__codes } });
        delete q.__codes;
      }
      mapped(report, src, `${subs.length} one-row questions`, `${ids[0]} ... ${ids[ids.length - 1]}`);
    };
    switch (type) {
      case 'L': case '!': case 'O': {
        if (ans.length < 2) { unsupported(report, src, 'A list question with fewer than two answers; not imported.'); return; }
        const options = opts(ans);
        if (r.other === 'Y') options.push({ value: '-oth-', label: 'Other' });
        const q = add({ id, text, type: type === '!' ? 'select' : 'choice', options }, title);
        mapped(report, src, q.type, id);
        if (r.other === 'Y' || type === 'O') {
          const oid = names.make(`${id}_${type === 'O' ? 'comment' : 'other'}`, 'q');
          const tq = add({ id: oid, text: type === 'O' ? 'Comment' : 'Other (please specify)', type: 'text', long: false }, null);
          tq.required = false;
          if (type === 'L' || type === '!') tq.__other = { id, value: '-oth-' };
          else tq.__other = null;
          approximated(report, src, type === 'O' ? 'The comment box became a separate text question.' : 'The "Other" option plus its text box became an "Other" option and a follow-up text question.');
        }
        return;
      }
      case 'Y': mapped(report, src, 'choice', id); add({ id, text, type: 'choice', options: [{ value: 'Y', label: 'Yes' }, { value: 'N', label: 'No' }] }, title); return;
      case 'G': mapped(report, src, 'choice', id); add({ id, text, type: 'choice', options: [{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }] }, title); return;
      case '5': mapped(report, src, 'scale (5 points)', id); add({ id, text, type: 'scale', n: 5, lo: '1', hi: '5', __ref: { scaleCodes: ['1', '2', '3', '4', '5'] } }, title); return;
      case 'M': case 'P': {
        if (subs.length < 2) { unsupported(report, src, 'A multiple-choice question with fewer than two options; not imported.'); return; }
        const options = subs.map(s => ({ value: s.title, label: qText(s) || s.title }));
        if (r.other === 'Y') options.push({ value: '-oth-', label: 'Other' });
        const q = add({ id, text, type: 'multi', options }, null);
        for (const s of subs) refs.set(`${title}_${s.title}`.toLowerCase(), { q, optionValue: s.title });
        mapped(report, src, 'multi', id);
        if (type === 'P') approximated(report, src, 'The comment boxes next to each option were dropped.');
        if (r.other === 'Y') approximated(report, src, 'The text box of "Other" was dropped; only the option is kept.');
        return;
      }
      case 'S': mapped(report, src, 'text', id); add({ id, text, type: 'text', long: false }, title); return;
      case 'T': case 'U': mapped(report, src, 'text (long)', id); add({ id, text, type: 'text', long: true }, title); return;
      case 'N': {
        const q = { id, text, type: 'number' };
        if (at.min_num_value_n !== undefined && at.min_num_value_n !== '' && Number.isFinite(Number(at.min_num_value_n))) q.min = Number(at.min_num_value_n);
        if (at.max_num_value_n !== undefined && at.max_num_value_n !== '' && Number.isFinite(Number(at.max_num_value_n))) q.max = Number(at.max_num_value_n);
        if (q.min != null || q.max != null) approximated(report, src, 'The minimum and maximum are shown as a hint; typed numbers are kept as entered (no range check).');
        add(q, title); mapped(report, src, 'number', id); return;
      }
      case 'D': add({ id, text: text + '\n(Enter the date as text.)', type: 'text', long: false }, title); approximated(report, src, 'A date picker became a text box.'); return;
      case 'X': add({ id, text: text || '(text)', type: 'info', required: false }, null); questions[questions.length - 1].required = false; mapped(report, src, 'descriptive text', id); return;
      case 'F': case 'A': case 'B': {
        const cols = type === 'A' ? ['1', '2', '3', '4', '5'] : type === 'B' ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] : null;
        if (type === 'F' && ans.length < 2) { unsupported(report, src, 'An array question with fewer than two answer columns; not imported.'); return; }
        rowsQuestion(() => {
          if (cols) return { type: 'scale', n: cols.length, lo: '1', hi: String(cols.length), __codes: cols };
          if (ans.length <= 11) return { type: 'scale', n: ans.length, lo: ans[0].text, hi: ans[ans.length - 1].text, labels: ans.map(a => a.text || a.code), __codes: ans.map(a => a.code) };
          return { type: 'choice', options: opts(ans) };
        });
        if (type === 'F' && ans.length > 11) approximated(report, src, 'More than 11 answer columns: each row is a multiple-choice question instead of a rating scale.');
        return;
      }
      case 'C': rowsQuestion(() => ({ type: 'choice', options: [{ value: 'Y', label: 'Yes' }, { value: 'U', label: 'Uncertain' }, { value: 'N', label: 'No' }] })); return;
      case 'E': rowsQuestion(() => ({ type: 'choice', options: [{ value: 'I', label: 'Increase' }, { value: 'S', label: 'Same' }, { value: 'D', label: 'Decrease' }] })); return;
      case 'K': rowsQuestion(() => ({ type: 'number' })); return;
      case 'Q': rowsQuestion(() => ({ type: 'text', long: false })); return;
      default: {
        const known = { R: 'Ranking', '|': 'File upload', '*': 'Equation', I: 'Language switch', ';': 'Array (texts)', ':': 'Array (numbers)', H: 'Array by column', '1': 'Array dual scale', '>': 'Array (numbers)', '<': 'Array' };
        unsupported(report, src, `${known[type] || 'Question type ' + type} is not supported; the question was not imported.`);
      }
    }
  }
  // Follow-up text questions for "Other": show only when "Other" is chosen.
  for (const e of questions) if (e.__other) { e.displayIf = { q: e.__other.id, op: 'eq', value: e.__other.value }; delete e.__other; } else delete e.__other;

  // piped text {Q1} and relevance equations, now that every name is known
  const byTitle = new Map([...refs.entries()]);
  const pipe = (s, src) => String(s).replace(/\{([A-Za-z][A-Za-z0-9_]*)(?:\.(?:NAOK|shown|value|valueNAOK))?\}/g, (m, n) => {
    const h = byTitle.get(n.toLowerCase());
    if (h && h.q && h.q.type !== 'info' && !h.optionValue) return `{{q:${h.q.id}}}`;
    unsupported(report, src, `Piped text ${m} was removed (only single-answer questions can be piped).`);
    return '';
  });
  for (const q of questions) {
    if (/\{[A-Za-z]/.test(q.text)) q.text = pipe(q.text, q.source) || '(text)';
    if (q.groupText && /\{[A-Za-z]/.test(q.groupText)) q.groupText = pipe(q.groupText, q.source);
    for (const o of q.options || []) if (/\{[A-Za-z]/.test(o.label)) o.label = pipe(o.label, q.source) || o.value;
  }
  function leaf({ left, op, right, ...rest }) {
    if (op === 'truthy') throw new Unsupported('a bare variable');
    let v = left, lit = right, flip = false;
    if (v.k !== 'var') { v = right; lit = left; flip = true; }
    if (v.k !== 'var' || !lit || lit.k === 'var') throw new Unsupported('a comparison between two questions');
    const h = byTitle.get(v.v.toLowerCase());
    if (!h || !h.q) throw new Unsupported(`the unknown name ${v.v}`);
    const flipOp = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }, o = flip && flipOp[op] ? flipOp[op] : op;
    let lv = String(lit.v);
    const q = h.q;
    if (h.optionValue != null) {   // a multiple-choice option: Q1_SQ001 == "Y"
      if (!['=', '!='].includes(o)) throw new Unsupported('an unsupported comparison on a multiple-choice option');
      const ticked = lv === 'Y' || lv === '1';
      return { q: q.id, op: (o === '=') === ticked ? 'eq' : 'neq', value: h.optionValue };
    }
    if (h.codes || h.scaleCodes) {   // rating-scale rows: the answer code maps to the point number
      const codes = h.codes || h.scaleCodes, k = codes.indexOf(lv);
      if (['=', '!='].includes(o)) { if (lv === '') return { q: q.id, op: o === '=' ? 'notAnswered' : 'answered' }; if (k < 0) throw new Unsupported(`the answer code "${lv}"`); return { q: q.id, op: o === '=' ? 'eq' : 'neq', value: String(k + 1) }; }
      if (k < 0) throw new Unsupported(`the answer code "${lv}"`);
      return { q: q.id, op: { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[o], value: String(k + 1) };
    }
    if (['=', '!='].includes(o)) { if (lv === '') return { q: q.id, op: o === '=' ? 'notAnswered' : 'answered' }; return { q: q.id, op: o === '=' ? 'eq' : 'neq', value: lv }; }
    if (!Number.isFinite(Number(lv))) throw new Unsupported('a number comparison with a non-number');
    return { q: q.id, op: { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[o], value: lv };
  }
  for (const { q, relevance, src } of pendingLogic) {
    for (const rel of relevance) {
      try {
        const node = toDisplayIf(parseExpr(rel), leaf);
        const both = andNodes(q.displayIf || null, node);
        if (!both) throw new Unsupported('the logic is nested too deeply');
        q.displayIf = both;
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e;
        unsupported(report, src, `Relevance equation "${rel.slice(0, 140)}" was not converted (${e.message}); the question is shown to everyone.`);
      }
    }
  }
  for (const q of questions) { delete q.qid; delete q.relevance; }
  return finishImport(report, questions, { title: htmlToText(rowsOf(doc, 'surveys_languagesettings').filter(inLang)[0]?.surveyls_title || '') || sourceName });
}
