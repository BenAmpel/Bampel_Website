// Import from the lab's own spreadsheet template (CSV or the first sheet of an .xlsx).
// Columns: page, variable, type, text, options, required, scale_points, low_label, high_label, labels,
// min, max, show_if, condition. One row per question. Lines starting with # are comments. The template is
// static/lab/templates/survey-template.csv; the column rules are in static/lab/README.md.
import { ImportError, newReport, mapped, approximated, unsupported, Names, finishImport, sanitizeName, hasMarkup } from './common.mjs';
import { parseCsv } from './csv.mjs';
import { readXlsx } from './xlsx.mjs';

export const COLUMNS = ['page', 'variable', 'type', 'text', 'options', 'required', 'scale_points', 'low_label', 'high_label', 'labels', 'min', 'max', 'show_if', 'condition'];
const TYPE_ALIAS = {
  choice: 'choice', radio: 'choice', single: 'choice', select: 'select', dropdown: 'select', multi: 'multi', multiple: 'multi', checkbox: 'multi', scale: 'scale', likert: 'scale',
  text: 'text', short: 'text', long: 'long', longtext: 'long', essay: 'long', textarea: 'long', number: 'number', numeric: 'number', confidence: 'confidence', slider: 'slider',
  info: 'info', descriptive: 'info', text_block: 'info', embedded: 'embedded'
};
const YES = /^(y|yes|true|1|x|required)$/i;
const cell = (row, i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');

// Splits on "|" that is not escaped as "\|".
function splitBar(s) {
  const out = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; } else if (s[i] === '|') { out.push(cur.trim()); cur = ''; } else cur += s[i];
  }
  out.push(cur.trim());
  return out.filter(x => x !== '');
}
function parseOptions(s) {
  const parts = splitBar(s);
  const keyed = parts.length > 0 && parts.every(p => /^[^=]+=.+/.test(p));
  return parts.map(p => { if (keyed) { const k = p.indexOf('='); return { value: p.slice(0, k).trim(), label: p.slice(k + 1).trim() }; } return { value: p, label: p }; });
}

// show_if: "variable op value", joined by "and" or "or" (one kind per cell).
//   q1 = yes | q2 != no | age >= 18 | q3 in a|b|c | q3 not in a|b | q1 answered | q1 not answered
//   ed:prolific_pid = abc | condition = c1
function parseShowIf(src, resolveVar, where) {
  const text = src.trim();
  if (!text) return null;
  // split on and/or outside double quotes
  const clauses = [], joiners = [];
  let cur = '', q = false;
  const re = /\s+(and|or)\s+/iy;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') q = !q;
    if (!q) { re.lastIndex = i; const m = re.exec(text); if (m && i > 0) { clauses.push(cur); joiners.push(m[1].toLowerCase()); cur = ''; i += m[0].length - 1; continue; } }
    cur += text[i];
  }
  clauses.push(cur);
  if (new Set(joiners).size > 1) throw new ImportError(`${where}: show_if mixes "and" with "or". Use one kind in a cell (or split the logic over simpler questions).`);
  const leaves = clauses.map(c => {
    c = c.trim();
    let m;
    if ((m = c.match(/^(.+?)\s+not\s+answered$/i))) return { ...subject(m[1]), op: 'notAnswered' };
    if ((m = c.match(/^(.+?)\s+answered$/i))) return { ...subject(m[1]), op: 'answered' };
    if ((m = c.match(/^(.+?)\s+(not\s+in|in)\s+(.+)$/i))) return { ...subject(m[1]), op: /not/i.test(m[2]) ? 'notIn' : 'in', value: splitBar(m[3]).map(unquote) };
    if ((m = c.match(/^(.+?)\s*(==|!=|<>|>=|<=|=|>|<)\s*(.*)$/))) {
      const op = { '=': 'eq', '==': 'eq', '!=': 'neq', '<>': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[m[2]];
      return { ...subject(m[1]), op, value: unquote(m[3].trim()) };
    }
    throw new ImportError(`${where}: could not read the show_if part "${c.slice(0, 60)}". Use "variable = value", "variable in a|b", "variable answered", and so on.`);
  });
  function unquote(v) { return /^".*"$/.test(v) ? v.slice(1, -1) : v; }
  function subject(raw) {
    raw = raw.trim();
    if (/^ed:/i.test(raw)) return { ed: sanitizeName(raw.slice(3)) };
    if (/^condition$/i.test(raw)) return { condition: null };
    return { q: resolveVar(raw, where) };
  }
  for (const l of leaves) {
    if ('condition' in l) { if (!['eq', 'neq'].includes(l.op)) throw new ImportError(`${where}: a test on the condition must use = or !=.`); l.condition = String(l.value); delete l.value; }
  }
  return leaves.length === 1 ? leaves[0] : { [joiners[0] === 'or' ? 'any' : 'all']: leaves };
}

export function importRows(rows, { sourceName = 'sheet' } = {}) {
  const report = newReport('sheet');
  rows = rows.filter(r => r && r.some(c => String(c ?? '').trim() !== '') && !String(r[0] ?? '').trim().startsWith('#'));
  if (!rows.length) throw new ImportError('The sheet has no rows.');
  const head = rows[0].map(h => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '_'));
  const col = Object.fromEntries(COLUMNS.map(c => [c, head.indexOf(c)]));
  const missing = ['variable', 'type', 'text'].filter(c => col[c] < 0);
  if (missing.length) throw new ImportError(`The first row must be the column names. Missing: ${missing.join(', ')}. Expected columns: ${COLUMNS.join(', ')} (see the template).`);
  const extra = head.filter((h, i) => h && !COLUMNS.includes(h) && rows.slice(1).some(r => cell(r, i)));
  if (extra.length) report.warnings.push(`Columns not used: ${extra.join(', ')}.`);

  const names = new Names(), alias = new Map(), embedded = [], questions = [], condIds = [], problems = [];
  const optionsOf = new Map();
  let page = 1, infoN = 0;
  rows.slice(1).forEach((r, k) => {
    const rowNo = k + 2, v = cell(r, col.variable), typeRaw = cell(r, col.type).toLowerCase().replace(/\s+/g, '_');
    const where = `Row ${rowNo}${v ? ` (${v})` : ''}`;
    const type = TYPE_ALIAS[typeRaw];
    if (!type) { problems.push(`${where}: unknown type "${cell(r, col.type)}". Use one of: choice, select, multi, scale, text, long, number, slider, confidence, info, embedded.`); return; }
    if (type === 'embedded') {
      const t = cell(r, col.text);
      const name = names.make(v || t.replace(/^(param|value):/i, ''), 'ed');
      let d;
      if (/^value:/i.test(t)) d = { name, source: 'value', value: t.slice(6).trim() };
      else d = { name, source: 'url', param: t.replace(/^param:/i, '').trim() || v };
      if (d.source === 'url' && !/^[A-Za-z][A-Za-z0-9_.-]{0,40}$/.test(d.param)) { problems.push(`${where}: the URL parameter name "${d.param}" is not valid.`); return; }
      if (d.source === 'value' && !d.value) { problems.push(`${where}: an embedded constant needs a value (text column: value:something).`); return; }
      embedded.push(d); mapped(report, where, 'embedded data', name);
      return;
    }
    const pg = cell(r, col.page);
    if (pg !== '') { const n = Math.floor(Number(pg)); if (!Number.isFinite(n) || n < 1) { problems.push(`${where}: the page must be a number from 1.`); return; } page = n; }
    const text = cell(r, col.text);
    if (!text) { problems.push(`${where}: the text is empty.`); return; }
    if (type === 'info' && !v) { /* generated below */ }
    else if (!v) { problems.push(`${where}: a variable name is required.`); return; }
    const id = names.make(v || `info_${++infoN}`, type === 'info' ? 'info' : 'q');
    if (v) { alias.set(v.toLowerCase(), id); if (id !== v) approximated(report, where, `The variable name "${v}" was changed to "${id}" to fit the lab's naming rule.`); }
    const q = { id, text, type, page, source: `row ${rowNo}${v && id !== v ? `, variable ${v}` : ''}` };
    q.required = YES.test(cell(r, col.required));
    if (type === 'choice' || type === 'select' || type === 'multi') {
      q.options = parseOptions(cell(r, col.options));
      if (q.options.length < 2) { problems.push(`${where}: a ${type} question needs at least two options (options column: value=label|value=label).`); return; }
      optionsOf.set(id, q.options);
    } else if (type === 'scale' || type === 'slider') {
      const labels = splitBar(cell(r, col.labels));
      let n = Number(cell(r, col.scale_points)) || 0;
      const mn = cell(r, col.min), mx = cell(r, col.max);
      if (type === 'slider') {
        const lo = Number(mn), hi = Number(mx);
        if (!n && mn !== '' && mx !== '' && Number.isInteger(lo) && Number.isInteger(hi) && hi > lo && hi - lo + 1 <= 11) n = hi - lo + 1;
        if (!n) {
          if (!(mn !== '' && mx !== '' && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) { problems.push(`${where}: a slider needs min and max (or scale_points).`); return; }
          q.type = 'number'; q.min = lo; q.max = hi;
          approximated(report, where, `Slider from ${lo} to ${hi} has more than 11 steps, so it is a typed number question with a ${lo} to ${hi} hint (the range is not enforced).`);
          delete q.options;
        } else approximated(report, where, `Slider became a rating scale with ${n} points (points are numbered from 1).`);
      }
      if (q.type !== 'number') {
        if (!n && labels.length) n = labels.length;
        if (!(n >= 2 && n <= 11)) { problems.push(`${where}: a scale needs scale_points from 2 to 11 (or a labels list).`); return; }
        q.type = 'scale'; q.n = n;
        if (labels.length) { if (labels.length !== n) { problems.push(`${where}: ${labels.length} labels for ${n} points. Give one label per point, or use low_label and high_label.`); return; } q.labels = labels; q.lo = labels[0]; q.hi = labels[n - 1]; }
        else { q.lo = cell(r, col.low_label); q.hi = cell(r, col.high_label); if (!q.lo || !q.hi) report.warnings.push(`${where}: label the end points (low_label, high_label) or every point (labels).`); }
        if (cell(r, col.low_label) && labels.length) q.lo = cell(r, col.low_label);
        if (cell(r, col.high_label) && labels.length) q.hi = cell(r, col.high_label);
      }
    } else if (type === 'number') {
      const mn = cell(r, col.min), mx = cell(r, col.max);
      if (mn !== '' && Number.isFinite(Number(mn))) q.min = Number(mn);
      if (mx !== '' && Number.isFinite(Number(mx))) q.max = Number(mx);
      if (q.min != null || q.max != null) approximated(report, where, 'The min and max are shown as a hint; typed numbers are kept as entered (no range check), as in every lab survey.');
    } else if (type === 'text') q.long = false;
    else if (type === 'long') { q.type = 'text'; q.long = true; }
    if (hasMarkup(text)) report.warnings.push(`${where}: the text has HTML; it is shown as plain text.`);
    // conditions
    const cs = cell(r, col.condition).split(/[|,;]/).map(x => x.trim()).filter(Boolean).map(x => sanitizeName(x, 'c'));
    if (cs.length) { q.conditions = [...new Set(cs)]; for (const c of q.conditions) if (!condIds.includes(c)) condIds.push(c); }
    q.__showIf = cell(r, col.show_if); q.__where = where;
    questions.push(q);
    mapped(report, where, type === 'info' ? 'descriptive text' : q.type === 'text' && q.long ? 'text (long)' : q.type, id);
  });
  if (problems.length) throw new ImportError(`The sheet has ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n- ${problems.slice(0, 12).join('\n- ')}${problems.length > 12 ? `\n- and ${problems.length - 12} more` : ''}`);
  // show_if once every variable is known (a rule can only point backward; the builder drops forward references and says so)
  const lateAlias = new Map(alias);
  for (const q of questions) {
    if (q.__showIf) {
      const val = (n) => {   // let option labels stand in for option values
        if (n.q) { const opts = optionsOf.get(n.q); if (opts && n.value != null) { const fix = x => { const hit = opts.find(o => o.value === String(x)) || opts.find(o => o.label.toLowerCase() === String(x).toLowerCase()); return hit ? hit.value : x; }; n.value = Array.isArray(n.value) ? n.value.map(fix) : fix(n.value); } }
        for (const k of ['all', 'any']) if (n[k]) n[k].forEach(val);
      };
      q.displayIf = parseShowIf(q.__showIf, (raw, where) => { const id = lateAlias.get(raw.toLowerCase()); if (!id) throw new ImportError(`${where}: show_if refers to "${raw}", which is not a variable in this sheet.`); return id; }, q.__where);
      val(q.displayIf);
      (function conds(n) { if (!n) return; if (n.condition != null && !condIds.includes(n.condition)) condIds.push(n.condition); for (const k of ['all', 'any']) if (n[k]) n[k].forEach(conds); })(q.displayIf);   // "condition = a" in a rule means condition a exists
    }
    delete q.__showIf; delete q.__where;
  }
  const conditions = condIds.length ? condIds.map(id => ({ id, label: id })) : null;
  if (conditions && questions.some(q => !q.conditions || !q.conditions.length)) report.warnings.push('Some questions have no condition and are shown in every condition.');
  if (conditions && conditions.length > 8) throw new ImportError(`The condition column names ${conditions.length} conditions; the lab allows 8.`);
  return finishImport(report, questions, { conditions, embedded, title: sourceName });
}

// text: a CSV string. buffer: the bytes of an .xlsx.
export function importSheetText(text, opts) { return importRows(parseCsv(text), opts); }
export function importXlsx(buffer, opts) { return importRows(readXlsx(buffer), opts); }
