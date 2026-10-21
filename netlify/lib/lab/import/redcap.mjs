// Import from a REDCap data dictionary (CSV: Variable / Field Name, Form Name, Section Header, Field Type,
// Field Label, Choices..., Field Note, Text Validation..., Identifier?, Branching Logic, Required Field?, ...).
// Forms become pages (or, if asked, one session per form). Simple branching logic becomes display logic.
import { ImportError, newReport, mapped, approximated, unsupported, Names, finishImport, htmlToText, hasMarkup, sanitizeName } from './common.mjs';
import { parseCsv } from './csv.mjs';
import { parseExpr, toDisplayIf, Unsupported } from './expr.mjs';

const HEADERS = [
  ['name', /variable/i], ['form', /form\s*name/i], ['section', /section\s*header/i], ['type', /field\s*type/i], ['label', /field\s*label/i], ['choices', /choices|calculations|slider\s*labels/i],
  ['note', /field\s*note/i], ['vtype', /text\s*validation\s*type|show\s*slider\s*number/i], ['vmin', /validation\s*min/i], ['vmax', /validation\s*max/i], ['identifier', /identifier/i],
  ['branching', /branching/i], ['required', /required\s*field/i], ['matrix', /matrix\s*group\s*name/i], ['annotation', /field\s*annotation/i]
];

export function looksLikeRedcap(rows) {
  const h = (rows.find(r => r && r.some(c => String(c).trim())) || []).map(c => String(c).toLowerCase());
  return h.some(x => /variable\s*\/?\s*field\s*name/.test(x)) && h.some(x => /field\s*type/.test(x));
}

// "1, Yes | 2, No" -> [{value:'1', label:'Yes'}, ...]
export function parseChoices(s) {
  return String(s || '').split('|').map(x => x.trim()).filter(Boolean).map(x => {
    const c = x.indexOf(',');   // no regex: a long cell cannot make this slow
    return c > 0 && x.slice(0, c).trim() !== '' ? { value: x.slice(0, c).trim(), label: x.slice(c + 1).trim() } : { value: x, label: x };
  });
}

export function importRedcap(text, { formsAs = 'pages', sourceName } = {}) {
  const rows = parseCsv(text).filter(r => r.some(c => String(c).trim() !== ''));
  if (!rows.length || !looksLikeRedcap(rows)) throw new ImportError('This does not look like a REDCap data dictionary. The first row should have "Variable / Field Name", "Form Name", "Field Type", and the other dictionary columns.');
  const report = newReport('redcap');
  const idx = {};
  rows[0].forEach((h, i) => { for (const [key, re] of HEADERS) if (!(key in idx) && re.test(String(h))) { idx[key] = i; break; } });
  const get = (r, k) => (idx[k] != null && r[idx[k]] != null ? String(r[idx[k]]).trim() : '');
  const fields = rows.slice(1).filter(r => get(r, 'name'));
  fields.forEach((r, i) => r.forEach((c, j) => { if (String(c).length > (j === idx.choices ? 50000 : 4000)) throw new ImportError(`Field ${get(r, 'name') || i + 2}: a cell is too long to import (over ${j === idx.choices ? 50000 : 4000} characters).`); }));
  if (!fields.length) throw new ImportError('The data dictionary has no fields.');

  const names = new Names(), forms = [], byVar = new Map(), identifiers = [], questions = [];
  // pass 1: names and types, so branching logic can point at fields defined anywhere
  for (const r of fields) {
    const form = get(r, 'form') || 'form';
    if (!forms.includes(form)) forms.push(form);
    const type = get(r, 'type').toLowerCase(), orig = get(r, 'name');
    byVar.set(orig, { id: names.make(orig, 'q'), type, row: r, form, orig });
  }
  const sessionsMode = formsAs === 'sessions' && forms.length > 1;
  if (formsAs === 'sessions' && forms.length > 12) throw new ImportError(`This dictionary has ${forms.length} forms; the lab allows 12 sessions. Import as pages instead.`);

  const optsOf = new Map(), kindOf = new Map();
  function logicFor(src, f) {
    const tree = parseExpr(src, { brackets: true });
    return toDisplayIf(tree, ({ left, op, right }) => {
      if (op === 'truthy') throw new Unsupported('a reference without a comparison');
      let v = left, lit = right, flip = false;
      if (v.k !== 'var') { v = right; lit = left; flip = true; }
      if (v.k !== 'var' || !lit || lit.k === 'var') throw new Unsupported('a comparison between two fields');
      const ref = byVar.get(v.v);
      if (!ref) throw new Unsupported(`the unknown field [${v.v}]`);
      if (sessionsMode && ref.form !== f.form) throw new Unsupported(`[${v.v}] is on another form, which is another session here`);
      if (ref.type === 'calc' || ref.type === 'file' || ref.type === 'descriptive') throw new Unsupported(`[${v.v}] has no stored answer here`);
      const lv = String(lit.v);
      const flipOp = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
      const o = flip && flipOp[op] ? flipOp[op] : op;
      if (ref.type === 'checkbox') {
        if (v.sub == null) throw new Unsupported(`the checkbox field [${v.v}] without an option number`);
        if (!['=', '!='].includes(o)) throw new Unsupported('an unsupported comparison on a checkbox');
        const checked = lv === '1';   // [f(1)] = '1' means option 1 is ticked; = '0' means it is not
        return { q: ref.id, op: (o === '=') === checked ? 'eq' : 'neq', value: v.sub };
      }
      if (v.sub != null) throw new Unsupported(`[${v.v}(${v.sub})] on a field that is not a checkbox`);
      if (o === '=' || o === '!=') {
        if (lv === '') return { q: ref.id, op: o === '=' ? 'notAnswered' : 'answered' };
        return { q: ref.id, op: o === '=' ? 'eq' : 'neq', value: lv };
      }
      if (!Number.isFinite(Number(lv))) throw new Unsupported('a number comparison with a non-number');
      return { q: ref.id, op: { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[o], value: lv };
    });
  }

  let formPage = 0, lastForm = null, lastMatrix = null;
  const runText = {};
  const pending = [];   // piped text fix-ups once every name is known
  for (const r of fields) {
    const orig = get(r, 'name'), f = byVar.get(orig), id = f.id, type = f.type, form = f.form;
    if (form !== lastForm) { formPage++; lastForm = form; }
    const sessionNo = sessionsMode ? forms.indexOf(form) + 1 : 1;
    const base = { page: sessionsMode ? 1 : formPage, sessions: [sessionNo], source: `field ${orig}` };
    const label = htmlToText(get(r, 'label')), note = htmlToText(get(r, 'note')), header = htmlToText(get(r, 'section'));
    if (hasMarkup(get(r, 'label'))) approximated(report, orig, 'Images or tables in the field label were removed (text only).');
    // A matrix group (consecutive fields with the same group name) becomes one question per row under one heading,
    // never a grid. The heading is the section header of the group's first field.
    const matrix = get(r, 'matrix') ? sanitizeName(get(r, 'matrix'), 'grp') : null;
    let groupHead = null, usedHeader = false;
    if (matrix) {
      if (matrix !== lastMatrix) { runText[matrix] = header || null; usedHeader = !!header; }
      groupHead = runText[matrix] || null;
    }
    lastMatrix = matrix;
    if (header && !usedHeader) {
      const hid = names.make(`${id}_header`, 'info');
      questions.push({ id: hid, type: 'info', text: header, ...base, source: `section header of ${orig}` });
      mapped(report, `section header of ${orig}`, 'descriptive text', hid);
    }
    const q = { id, text: label + (note ? `\n${note}` : ''), ...base, required: /^y/i.test(get(r, 'required')) };
    if (groupHead) { q.group = matrix; q.groupText = groupHead; }
    if (/^y/i.test(get(r, 'identifier'))) identifiers.push(orig);
    const ann = get(r, 'annotation');
    if (/@[A-Z]/.test(ann)) unsupported(report, orig, `Action tag(s) in the field annotation (${[...new Set(ann.match(/@[A-Z][A-Z0-9-]*/g))].join(', ')}) are not applied.`);
    const vtype = get(r, 'vtype').toLowerCase(), vmin = get(r, 'vmin'), vmax = get(r, 'vmax');
    if (!label && type !== 'descriptive') report.warnings.push(`Field ${orig} has no label; its variable name is shown as the question text.`);
    if (!label) q.text = orig;
    switch (type) {
      case 'text': {
        if (/^(integer|number|number_[0-9a-z_]+|number_comma_decimal)$/.test(vtype)) {
          q.type = 'number';
          if (vmin !== '' && Number.isFinite(Number(vmin))) q.min = Number(vmin);
          if (vmax !== '' && Number.isFinite(Number(vmax))) q.max = Number(vmax);
          if (q.min != null || q.max != null) approximated(report, orig, 'The minimum and maximum are shown as a hint; typed numbers are kept as entered (no range check).');
        } else {
          q.type = 'text'; q.long = false;
          if (vtype) approximated(report, orig, `Text validation "${vtype}" is not checked; the answer is a plain text box.`);
        }
        break;
      }
      case 'notes': q.type = 'text'; q.long = true; break;
      case 'radio': case 'dropdown': case 'checkbox': {
        q.type = type === 'radio' ? 'choice' : type === 'dropdown' ? 'select' : 'multi';
        q.options = parseChoices(get(r, 'choices'));
        if (q.options.length < 2) { unsupported(report, orig, `A ${type} field needs at least two choices; the field was skipped.`); continue; }
        optsOf.set(id, q.options);
        if (type === 'checkbox') approximated(report, orig, 'A checkbox field is one "select all" question; in the export it is one column with the ticked codes joined by |, not REDCap\'s one column per option.');
        break;
      }
      case 'yesno': q.type = 'choice'; q.options = [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }]; break;
      case 'truefalse': q.type = 'choice'; q.options = [{ value: '1', label: 'True' }, { value: '0', label: 'False' }]; break;
      case 'slider': {
        q.type = 'number'; q.min = 0; q.max = 100;
        const labs = String(get(r, 'choices')).split('|').map(x => x.trim()).filter(Boolean);
        if (labs.length) q.text += `\n(${labs.join(' / ')})`;
        approximated(report, orig, 'A slider (0 to 100) became a typed number question with a 0 to 100 hint (the range is not enforced).');
        break;
      }
      case 'descriptive': q.type = 'info'; q.text = label || orig; q.required = false; break;
      case 'calc': unsupported(report, orig, 'Calculated field: not computed. Calculate it in your analysis from the answers.'); continue;
      case 'file': unsupported(report, orig, 'File upload field.'); continue;
      case 'sql': unsupported(report, orig, 'SQL (dynamic) field.'); continue;
      default: unsupported(report, orig, `Field type "${type}" is not supported; the field was skipped.`); continue;
    }
    if (!q.text) q.text = orig;
    q.__branch = get(r, 'branching'); q.__form = form;
    kindOf.set(id, q.type);
    questions.push(q);
    mapped(report, orig, q.type === 'info' ? 'descriptive text' : q.type === 'text' && q.long ? 'text (long)' : q.type, id);
  }
  // branching logic
  const byId = new Map([...byVar.values()].map(x => [x.id, x]));
  for (const q of questions) {
    const src = q.__branch; const f = byId.get(q.id);
    if (src && f) {
      try { q.displayIf = logicFor(src, f); }
      catch (e) { if (!(e instanceof Unsupported)) throw e; unsupported(report, q.source, `Branching logic "${src.slice(0, 120)}" was not converted (${e.message}); the field is shown to everyone.`); }
    }
    delete q.__branch; delete q.__form;
  }
  // piped text: [field] in labels becomes {{q:field}}
  const known = new Map([...byVar.values()].map(x => [x.orig, x]));
  const pipe = (s, srcName) => String(s).replace(/\[([A-Za-z][A-Za-z0-9_]*)(?::value)?\]/g, (m, n) => {
    const k = known.get(n);
    if (k && !['calc', 'descriptive', 'file'].includes(k.type) && k.type !== 'checkbox') return `{{q:${k.id}}}`;
    unsupported(report, srcName, `Piped text ${m} was removed (${k ? 'that field type cannot be piped' : 'not a field in this dictionary'}).`);
    return '';
  });
  for (const q of questions) {
    if (/\[[A-Za-z]/.test(q.text)) q.text = pipe(q.text, q.source) || q.text;
    if (q.groupText && /\[[A-Za-z]/.test(q.groupText)) q.groupText = pipe(q.groupText, q.source);
  }
  if (identifiers.length) {
    report.identifiers = identifiers;
    report.warnings.push(`Identifiable data: ${identifiers.length} field${identifiers.length > 1 ? 's are' : ' is'} marked as an identifier in the dictionary (${identifiers.slice(0, 15).join(', ')}${identifiers.length > 15 ? ', ...' : ''}). The lab stores these answers in the surveys export like any other answer. Check your IRB protocol and data storage approval before collecting them, or remove the fields.`);
  }
  if (sessionsMode) report.warnings.push(`Each of the ${forms.length} forms became one session (${forms.slice(0, 6).join(', ')}${forms.length > 6 ? ', ...' : ''}). Set the days between sessions under Students (gap days) or Sign-up and consent.`);
  return finishImport(report, questions, { sessions: sessionsMode ? forms.length : 1, title: sourceName });
}
