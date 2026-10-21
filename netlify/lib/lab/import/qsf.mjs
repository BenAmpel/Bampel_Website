// Import from a Qualtrics survey file (.qsf, JSON).
//   Questions   MC (single, multiple, dropdown, NPS), Matrix Likert (one question per row), TE (single line,
//               essay, form), Slider, DB (descriptive text). Timing and Meta Info are dropped and reported.
//   Structure   blocks and page breaks become pages; block randomizers become study conditions (one per block
//               combination); branches, display logic, and skip logic become display logic; embedded data
//               becomes embedded data; piped text becomes {{q:...}} and {{ed:...}} tokens.
// Anything else (custom JavaScript, quotas, loop & merge, carry-forward choices, per-choice randomization,
// authenticators, redirects, ...) is listed in the report with the question ID.
import { ImportError, LIMITS, own, newReport, mapped, approximated, unsupported, Names, finishImport, htmlToText, hasMarkup, sanitizeName, andNodes, orNodes, negate } from './common.mjs';
import { Unsupported } from './expr.mjs';

const numKeys = o => Object.keys(o || {}).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
const asList = p => (Array.isArray(p) ? p : Object.values(p || {}));
const conj = c => (String(c || '').toLowerCase() === 'or' ? 'or' : 'and');

// Number of ways to choose k of n, stopping early once it is clearly more than the lab allows.
function countCombos(n, k) { let c = 1; for (let i = 1; i <= k; i++) { c = c * (n - k + i) / i; if (c > 1000) return 1000; } return Math.round(c); }
function combos(n, k) {
  const out = [];
  (function go(start, acc) { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = start; i < n; i++) { acc.push(i); go(i + 1, acc); acc.pop(); } })(0, []);
  return out;
}

export function importQsf(text, { sourceName } = {}) {
  let json;
  try { json = JSON.parse(text); } catch { throw new ImportError('This file is not valid JSON, so it cannot be a Qualtrics .qsf file. Export the survey again with Tools > Import/Export > Export Survey.'); }
  if (!json || typeof json !== 'object' || !Array.isArray(json.SurveyElements)) throw new ImportError('This does not look like a Qualtrics .qsf file (no SurveyElements list).');
  const report = newReport('qsf');
  const els = json.SurveyElements.filter(e => e && typeof e === 'object');
  const title = htmlToText((json.SurveyEntry || {}).SurveyName || '') || sourceName;

  // ---------- parts of the file ----------
  const blocks = new Map(), sq = new Map();
  for (const e of els.filter(e => e.Element === 'BL')) for (const b of asList(e.Payload)) if (b && b.ID) blocks.set(b.ID, b);
  for (const e of els.filter(e => e.Element === 'SQ')) if (e.Payload) sq.set(e.PrimaryAttribute || e.Payload.QuestionID, e.Payload);
  const flowEl = els.find(e => e.Element === 'FL');
  const KNOWN = ['BL', 'FL', 'SQ', 'SO', 'RS', 'QC', 'STAT', 'PL', 'PROJ', 'SCO', 'QO', 'WF', 'TR', 'DE', 'LOOP', 'RP', 'ST', 'PV', 'MD', 'PS'];
  for (const e of els) {
    if (e.Element === 'QO') unsupported(report, 'quotas', 'Quotas are not applied.');
    else if (e.Element === 'SCO') unsupported(report, 'scoring', 'Scoring is not applied.');
    else if (e.Element === 'WF' || e.Element === 'TR') unsupported(report, 'workflows', 'Workflows, web services, and triggers are not run.');
    else if (!KNOWN.includes(e.Element)) report.warnings.push(`A survey element of type "${String(e.Element).slice(0, 20)}" was ignored.`);
  }
  const so = els.find(e => e.Element === 'SO');
  if (so && so.Payload) {
    if (so.Payload.BackButton === 'true') unsupported(report, 'survey options', 'Back button: the lab has no back button.');
    if (so.Payload.SurveyProtection && so.Payload.SurveyProtection !== 'PublicSurvey') unsupported(report, 'survey options', `Survey protection "${so.Payload.SurveyProtection}": the lab signs participants in with its own sign-in.`);
    if (so.Payload.PartialData && so.Payload.PartialData !== 'No') approximated(report, 'survey options', 'Partial responses: the lab saves a survey when its last page is submitted (earlier pages are kept in the tab if it is reloaded).');
  }

  // ---------- the survey flow ----------
  const segments = [], randomizers = [], embedded = [], ends = [];
  const edNames = new Names(), edByField = new Map();
  let stopped = false;
  function declareEmbedded(list, ctx) {
    for (const d of list || []) {
      const field = String(d.Field ?? d.Description ?? '').trim();
      if (!field || edByField.has(field)) continue;
      const hasValue = d.Value != null && String(d.Value).trim() !== '';
      if (hasValue && /\$\{/.test(String(d.Value))) { unsupported(report, `embedded data ${field}`, `Its value is computed from piped text (${String(d.Value).slice(0, 60)}), which the lab cannot do. The field was not imported.`); continue; }
      const name = edNames.make(field, 'ed');
      edByField.set(field, name);
      if (hasValue) embedded.push({ name, source: 'value', value: String(d.Value).slice(0, 300) });
      else {
        const param = /^[A-Za-z][A-Za-z0-9_.-]{0,40}$/.test(field) ? field : null;
        if (!param) { approximated(report, `embedded data ${field}`, `The field name is not a usable URL parameter; the value will be empty.`); embedded.push({ name, source: 'url', param: name }); }
        else embedded.push({ name, source: 'url', param });
      }
      if (d.Type === 'Recipient') approximated(report, `embedded data ${field}`, 'A contact-list (recipient) field is read from the study link as a URL parameter instead.');
      if (ctx.branches.length) approximated(report, `embedded data ${field}`, 'Set inside a branch in Qualtrics; here it is captured for everyone.');
      mapped(report, `embedded data ${field}`, 'embedded data', name);
    }
  }
  function label(f) { return f.Type === 'Standard' || f.Type === 'Block' ? (blocks.get(f.ID) || {}).Description || f.ID : f.Description || f.Type; }
  function walk(items, ctx) {
    for (const f of asList(items)) {
      if (stopped) return;
      if (!f || typeof f !== 'object') continue;
      switch (f.Type) {
        case 'Standard': case 'Block': segments.push({ block: blocks.get(f.ID), id: f.ID, branches: ctx.branches, rand: ctx.rand }); break;
        case 'Branch': walk(f.Flow, { ...ctx, branches: [...ctx.branches, { logic: f.BranchLogic, desc: f.Description || 'a branch' }] }); break;
        case 'Randomizer': {
          const kids = asList(f.Flow), ri = randomizers.length;
          randomizers.push({ sub: Math.max(1, Math.min(kids.length, Number(f.SubSet) || kids.length)), n: kids.length, even: f.EvenPresentation !== false, names: kids.map(label) });
          kids.forEach((k, ci) => walk([k], { ...ctx, rand: [...ctx.rand, { r: ri, c: ci }] }));
          break;
        }
        case 'Group': walk(f.Flow, ctx); break;
        case 'EmbeddedData': declareEmbedded(f.EmbeddedData, ctx); break;
        case 'EndSurvey':
          if (f.EndingType && f.EndingType !== 'Default' && (f.Options?.Advanced === 'true' || f.EndingType === 'Redirect' || f.Options?.EOSRedirectURL)) unsupported(report, `end of survey (${f.FlowID || ''})`, 'A redirect or custom ending is not followed; the lab shows its own completion text (Study content > Screen text).');
          if (!ctx.branches.length) { stopped = true; if (!ctx.rand.length) report.warnings.push('The survey flow ends early; blocks after that point were not imported.'); }
          else ends.push({ branches: ctx.branches, after: segments.length });
          break;
        default: unsupported(report, `flow element ${f.Type || '(unknown)'}${f.FlowID ? ' ' + f.FlowID : ''}`, `${f.Type || 'This element'} is not supported and was skipped.`);
      }
    }
  }
  if (flowEl && flowEl.Payload && flowEl.Payload.Flow) walk(flowEl.Payload.Flow, { branches: [], rand: [] });
  else { report.warnings.push('The file has no survey flow; blocks were taken in the order listed.'); for (const b of blocks.values()) if (b.Type !== 'Trash') segments.push({ block: b, id: b.ID, branches: [], rand: [] }); }
  const reached = new Set(segments.map(s => s.id));
  const unreached = [...blocks.values()].filter(b => b.Type !== 'Trash' && !reached.has(b.ID));
  if (unreached.length) report.warnings.push(`${unreached.length} block${unreached.length > 1 ? 's are' : ' is'} not in the survey flow and was not imported: ${unreached.slice(0, 5).map(b => b.Description || b.ID).join(', ')}.`);

  // ---------- conditions from randomizers ----------
  let conditions = null, allowedFor = () => [];
  if (randomizers.length) {
    const counts = randomizers.map(r => countCombos(r.n, r.sub));
    const total = counts.reduce((n, c) => Math.min(n * c, 100000), 1);
    const sets = total > 8 ? [] : randomizers.map(r => combos(r.n, r.sub));
    if (total > 8) {
      unsupported(report, 'randomizer', `The block randomizers give ${total >= 1000 ? 'more than 1000' : total} combinations of blocks; the lab allows 8 conditions. All blocks are shown to everyone instead.`);
    } else {
      randomizers.forEach((r, i) => {
        if (r.sub === r.n) approximated(report, `randomizer ${i + 1}`, 'All blocks are shown, but not in random order: the lab keeps the listed order.');
        else mapped(report, `randomizer ${i + 1}`, `${sets[i].length} conditions (each participant sees ${r.sub} of ${r.n} blocks; the lab balances them)`);
        if (!r.even) approximated(report, `randomizer ${i + 1}`, 'Qualtrics assigned blocks purely at random; the lab always balances conditions.');
      });
      if (total > 1) {
        const all = [];
        (function go(i, picked) { if (i === sets.length) { all.push(picked.slice()); return; } for (let k = 0; k < sets[i].length; k++) { picked.push(k); go(i + 1, picked); picked.pop(); } })(0, []);
        conditions = all.map((picked, i) => ({ id: `c${i + 1}`, picked, label: randomizers.map((r, ri) => (total > 1 && sets[ri].length > 1 ? sets[ri][picked[ri]].map(c => r.names[c]).join(' + ') : null)).filter(Boolean).join(' | ').slice(0, 80) || `Condition ${i + 1}` }));
        allowedFor = rand => {
          const ids = conditions.filter(c => rand.every(({ r, c: child }) => sets[r][c.picked[r]].includes(child))).map(c => c.id);
          return ids.length === conditions.length ? [] : ids;
        };
      }
    }
  }

  // ---------- pass 1: questions ----------
  const names = new Names(), qmap = new Map(), items = [], qOrder = [];
  let page = 0, pageOpen = false;
  const usedSq = new Set();
  const choicesOf = p => {
    const ch = p.Choices;
    if (!ch) return [];
    const entries = Array.isArray(ch) ? ch.map((v, i) => [String(i), v]).filter(([, v]) => v) : Object.entries(ch);
    const order = Array.isArray(p.ChoiceOrder) && p.ChoiceOrder.length ? p.ChoiceOrder.map(String) : entries.map(([k]) => k);
    const byKey = new Map(entries.map(([k, v]) => [String(k), v]));
    const seen = new Set(order);
    return [...order, ...entries.map(([k]) => String(k)).filter(k => !seen.has(k))].filter(k => byKey.has(k)).map(k => ({ key: k, ...byKey.get(k) }));
  };
  const answersOf = p => {
    const an = p.Answers;
    if (!an) return [];
    const entries = Array.isArray(an) ? an.map((v, i) => [String(i), v]).filter(([, v]) => v) : Object.entries(an);
    const order = Array.isArray(p.AnswerOrder) && p.AnswerOrder.length ? p.AnswerOrder.map(String) : entries.map(([k]) => k);
    const byKey = new Map(entries.map(([k, v]) => [String(k), v]));
    return order.filter(k => byKey.has(k)).map(k => ({ key: k, ...byKey.get(k) }));
  };
  const optionValue = (p, key, c) => {
    const rc = own(p.RecodeValues, key);
    if (rc != null && String(rc) !== '') return String(rc);
    const tag = own(p.ChoiceDataExportTags, key);
    return tag ? String(tag) : String(key);
  };

  function mapQuestion(qid, p, seg, segIndex, conds, startsPage) {
    const tag = p.DataExportTag || qid, src = `${qid} (${tag})`, qt = p.QuestionType, sel = p.Selector, text = htmlToText(p.QuestionText || '');
    const required = !!(p.Validation && p.Validation.Settings && p.Validation.Settings.ForceResponse === 'ON');
    if (p.QuestionJS && String(p.QuestionJS).trim()) unsupported(report, src, 'Custom JavaScript on this question is not run.');
    if (p.DynamicChoices || p.DynamicAnswers) { unsupported(report, src, 'Carry-forward (dynamic) choices are not supported; the question was not imported.'); return; }
    if (p.Randomization && p.Randomization.Type && !['None', 'false', ''].includes(String(p.Randomization.Type))) unsupported(report, src, `Choices are randomized in Qualtrics (${p.Randomization.Type}); the lab shows them in the listed order.`);
    if (p.Validation && p.Validation.Settings && p.Validation.Settings.CustomValidation) unsupported(report, src, 'Custom validation is not applied.');
    if (p.GradingData && Object.keys(p.GradingData).length) unsupported(report, src, 'Scoring/grading data is not applied.');
    if (hasMarkup(p.QuestionText)) approximated(report, src, 'Images or tables in the question text were removed (text only).');
    if (JSON.stringify(Object.keys(p)).match(/Skip/i)) { /* handled in pass 2 */ }
    const base = { page: 0, required, conditions: conds, source: src, _qid: qid, _seg: segIndex };
    const info = { qid, kind: null, id: null };
    qmap.set(qid, info);
    const out = [];
    const put = (item) => { out.push({ ...base, ...item }); return item; };
    switch (qt) {
      case 'DB': {
        if (!text.trim()) { unsupported(report, src, 'A graphic or empty descriptive block with no text was not imported.'); qmap.delete(qid); return; }
        const id = names.make(tag, 'info'); info.kind = 'info'; info.id = id;
        put({ id, type: 'info', text, required: false }); mapped(report, src, 'descriptive text', id); break;
      }
      case 'MC': {
        const chs = choicesOf(p);
        if (sel === 'NPS') {
          const id = names.make(tag, 'q'); info.kind = 'mc'; info.id = id; info.scale = true;
          const nums = chs.map(c => htmlToText(c.Display));
          put({ id, type: 'scale', text, n: 11, start: 0, lo: nums.length === 11 && !/^\d+$/.test(nums[0]) ? nums[0] : 'Not at all likely', hi: nums.length === 11 && !/^\d+$/.test(nums[10]) ? nums[10] : 'Extremely likely' });
          info.optVals = new Map(); for (let i = 0; i < 11; i++) info.optVals.set(chs[i] ? chs[i].key : String(i + 1), String(i));
          mapped(report, src, 'scale (11 points)', id); approximated(report, src, 'The Net Promoter question became an 11-point scale numbered 0 to 10, as in the source.'); break;
        }
        const multi = ['MAVR', 'MAHR', 'MACOL', 'MSB'].includes(sel), dd = sel === 'DL' || sel === 'SB';
        const single = ['SAVR', 'SAHR', 'SACOL', 'DL', 'SB', undefined, ''].includes(sel);
        if (!multi && !single) { unsupported(report, src, `Multiple-choice display "${sel}" is not supported; the question was not imported.`); qmap.delete(qid); return; }
        if (chs.length < 2) { unsupported(report, src, 'A multiple-choice question with fewer than two choices was not imported.'); qmap.delete(qid); return; }
        const id = names.make(tag, 'q'); info.kind = multi ? 'multi' : 'mc'; info.id = id; info.optVals = new Map();
        const options = chs.map(c => { const v = optionValue(p, c.key, c); info.optVals.set(c.key, v); return { value: v, label: htmlToText(c.Display || '') || v }; });
        const q = put({ id, type: multi ? 'multi' : dd ? 'select' : 'choice', text, options });
        mapped(report, src, q.type, id);
        if (chs.some(c => c.Exclusive)) approximated(report, src, 'A choice marked "exclusive" (none of the above) is an ordinary choice; the lab does not stop a participant ticking it with others.');
        if (p.Choices && chs.some(c => c.Display && hasMarkup(c.Display))) approximated(report, src, 'Images in choices were removed.');
        for (const c of chs) if (c.TextEntry === 'true' || c.TextEntry === true) {
          const tid = names.make(`${tag}_${c.key}_text`, 'q');
          put({ id: tid, type: 'text', long: false, text: `${htmlToText(c.Display || '') || 'Other'}: please specify`, required: false, _follow: { q: id, value: optionValue(p, c.key, c) } });
          approximated(report, src, `The text box of the choice "${htmlToText(c.Display || '')}" became a follow-up text question (${tid}) shown when that choice is picked.`);
        }
        break;
      }
      case 'Matrix': {
        const rows = choicesOf(p), cols = answersOf(p);
        if (!['Likert', 'Bipolar'].includes(sel)) { unsupported(report, src, `Matrix of type "${sel}" is not supported; the question was not imported.`); qmap.delete(qid); return; }
        if (rows.length < 1 || cols.length < 2) { unsupported(report, src, 'A matrix needs at least one row and two columns; it was not imported.'); qmap.delete(qid); return; }
        const multiAns = p.SubSelector === 'MultipleAnswer';
        const baseId = names.make(tag, 'q'), grp = sanitizeName(baseId);
        info.kind = 'matrix'; info.id = baseId; info.rows = new Map(); info.colPoint = new Map();
        cols.forEach((c, i) => info.colPoint.set(c.key, multiAns ? String(optionValue({ RecodeValues: p.RecodeValues }, c.key)) : String(i + 1)));
        const labels = cols.map(c => htmlToText(c.Display || '') || c.key);
        const asScale = !multiAns && cols.length <= 11;
        if (p.RecodeValues && !multiAns) approximated(report, src, 'Recode values of the matrix columns were not kept; scale points are numbered 1 to ' + cols.length + ' in the order shown (check the codes against your source if they differ).');
        const ids = [];
        for (const r of rows) {
          const tagR = own(p.ChoiceDataExportTags, r.key) || own(p.VariableNaming, r.key) || r.key;
          const rid = names.make(`${tag}_${tagR}`, 'q');
          ids.push(rid); info.rows.set(r.key, { id: rid });
          const row = asScale ? { type: 'scale', n: cols.length, lo: labels[0], hi: labels[labels.length - 1], labels }
            : multiAns ? { type: 'multi', options: cols.map(c => ({ value: info.colPoint.get(c.key), label: htmlToText(c.Display || '') || c.key })) }
            : { type: 'choice', options: cols.map((c, i) => ({ value: String(i + 1), label: labels[i] })) };
          put({ id: rid, text: htmlToText(r.Display || '') || `Row ${r.key}`, group: grp, groupText: text, ...row });
        }
        if (multiAns) approximated(report, src, 'Matrix with multiple answers per row: each row is a select-all question.');
        else if (!asScale) approximated(report, src, 'More than 11 columns: each row is a multiple-choice question instead of a rating scale.');
        mapped(report, src, `${rows.length} one-row ${asScale ? 'scale' : 'choice'} questions under one heading`, `${ids[0]} ... ${ids[ids.length - 1]}`);
        break;
      }
      case 'TE': {
        const vs = (p.Validation && p.Validation.Settings) || {}, ct = vs.ContentType;
        if (sel === 'PW') { unsupported(report, src, 'Password entry is not supported.'); qmap.delete(qid); return; }
        if (sel === 'FORM') {
          const rows = choicesOf(p);
          if (!rows.length) { unsupported(report, src, 'A form field question with no fields was not imported.'); qmap.delete(qid); return; }
          const baseId = names.make(tag, 'q'), grp = sanitizeName(baseId);
          info.kind = 'form'; info.id = baseId; info.rows = new Map();
          const ids = [];
          for (const r of rows) {
            const rid = names.make(`${tag}_${own(p.ChoiceDataExportTags, r.key) || r.key}`, 'q');
            ids.push(rid); info.rows.set(r.key, { id: rid, type: 'text' });
            put({ id: rid, type: 'text', long: false, text: htmlToText(r.Display || '') || `Field ${r.key}`, group: grp, groupText: text });
          }
          mapped(report, src, `${rows.length} text questions under one heading`, `${ids[0]} ... ${ids[ids.length - 1]}`); break;
        }
        const id = names.make(tag, 'q'); info.kind = 'te'; info.id = id;
        if (ct === 'ValidNumber') {
          const q = { id, type: 'number', text }; if (vs.MinNumber !== undefined && vs.MinNumber !== '' && Number.isFinite(Number(vs.MinNumber))) q.min = Number(vs.MinNumber); if (vs.MaxNumber !== undefined && vs.MaxNumber !== '' && Number.isFinite(Number(vs.MaxNumber))) q.max = Number(vs.MaxNumber);
          put(q); info.numeric = true; mapped(report, src, 'number', id);
          if (q.min != null || q.max != null) approximated(report, src, 'The minimum and maximum are shown as a hint; typed numbers are kept as entered (no range check).');
        } else {
          put({ id, type: 'text', long: sel === 'ML' || sel === 'ESTB', text }); mapped(report, src, sel === 'ML' || sel === 'ESTB' ? 'text (long)' : 'text', id);
          if (ct && ct !== 'None') approximated(report, src, `Validation "${ct}" is not checked; the answer is a plain text box.`);
        }
        break;
      }
      case 'Slider': {
        const cfg = p.Configuration || {}, mn = Number(cfg.CSSliderMin ?? 0), mx = Number(cfg.CSSliderMax ?? 100), grid = Number(cfg.GridLines || 0), snap = String(cfg.SnapToGrid) === 'true';
        if (!['HSLIDER', 'HBAR', 'VSLIDER', undefined].includes(sel) && sel) { unsupported(report, src, `Slider display "${sel}" is not supported; the question was not imported.`); qmap.delete(qid); return; }
        const rows = choicesOf(p);
        if (!rows.length || !Number.isFinite(mn) || !Number.isFinite(mx) || mx <= mn) { unsupported(report, src, 'The slider has no statements or no valid range; it was not imported.'); qmap.delete(qid); return; }
        let n = 0;
        if (snap && grid > 0 && grid + 1 <= 11) n = grid + 1; else if (Number.isInteger(mn) && Number.isInteger(mx) && mx - mn + 1 <= 11) n = mx - mn + 1;
        const lab = p.Labels ? asList(p.Labels).map(l => htmlToText((l && l.Display) || '')) : [];
        const zeroStep = !!n && Number.isInteger(mn) && mx - mn === n - 1;
        info.kind = 'slider'; info.rows = new Map(); info.min = mn; info.max = mx; info.n = n; info.zeroStep = zeroStep;
        const multi = rows.length > 1, baseId = names.make(tag, 'q'), grp = sanitizeName(baseId), ids = [];
        info.id = baseId;
        for (const r of rows) {
          const rid = multi ? names.make(`${tag}_${r.key}`, 'q') : baseId;
          ids.push(rid); info.rows.set(r.key, { id: rid });
          const stmt = htmlToText(r.Display || '');
          const t = multi ? stmt || `Statement ${r.key}` : text || stmt;
          const gb = multi ? { group: grp, groupText: text } : {};
          put(n ? { id: rid, type: 'scale', n, ...(zeroStep ? { start: mn } : {}), lo: lab[0] || String(mn), hi: lab[lab.length - 1] || String(mx), text: t, ...gb } : { id: rid, type: 'number', min: mn, max: mx, text: t, ...gb });
        }
        if (n) approximated(report, src, `Slider ${mn} to ${mx} became a ${n}-point rating scale${zeroStep ? ` numbered ${mn} to ${mx}, as in the source` : ' numbered from 1 (the source steps are not one apart)'} (no handle to drag, in line with the lab's rules).`);
        else approximated(report, src, `Slider ${mn} to ${mx} has more than 11 steps, so each statement is a typed number question with a ${mn} to ${mx} hint (the range is not enforced).`);
        mapped(report, src, n ? 'scale' : 'number', ids.join(', '));
        break;
      }
      case 'Timing': unsupported(report, src, 'Dropped: timing question (page timers). The lab records page timing itself.'); qmap.delete(qid); return;
      case 'Meta': unsupported(report, src, 'Dropped: meta info question (browser, OS, resolution). The lab records device details itself (full JSON export).'); qmap.delete(qid); return;
      default: unsupported(report, src, `Question type ${qt}${sel ? '/' + sel : ''} is not supported; the question was not imported.`); qmap.delete(qid); return;
    }
    return out;
  }

  segments.forEach((seg, si) => {
    const b = seg.block;
    if (!b || b.Type === 'Trash') { if (b) unsupported(report, b.Description || seg.id, 'Block is in the trash.'); else unsupported(report, seg.id, 'The flow refers to a block that is not in the file.'); return; }
    const o = b.Options || {};
    if (o.Looping && !['None', 'false', ''].includes(String(o.Looping))) unsupported(report, `block ${b.Description || b.ID}`, 'Loop & Merge is not supported; the block is shown once.');
    if (o.RandomizeQuestions && !['false', 'None', ''].includes(String(o.RandomizeQuestions))) unsupported(report, `block ${b.Description || b.ID}`, `Questions are randomized within the block (${o.RandomizeQuestions}); the lab shows them in the listed order.`);
    const conds = allowedFor(seg.rand);
    let segStart = true, breakPending = false;
    for (const el of asList(b.BlockElements)) {
      if (!el) continue;
      if (el.Type === 'Page Break') { breakPending = true; continue; }
      if (el.Type !== 'Question') continue;
      const qid = el.QuestionID, p = sq.get(qid);
      if (!p) { unsupported(report, qid, 'The block refers to a question that is not in the file.'); continue; }
      usedSq.add(qid);
      const made = mapQuestion(qid, p, seg, si, conds);
      if (!made || !made.length) continue;
      if (!pageOpen || segStart || breakPending) { page++; pageOpen = true; }
      segStart = false; breakPending = false;
      for (const it of made) { it.page = page; items.push(it); }
      qOrder.push(qid);
    }
  });
  const stray = [...sq.keys()].filter(q => !usedSq.has(q));
  if (stray.length) report.warnings.push(`${stray.length} question${stray.length > 1 ? 's are' : ' is'} in blocks the flow does not reach (${stray.slice(0, 6).join(', ')}) and was not imported.`);

  // The limits are checked here, before the work that grows with questions times rules.
  if (items.length > LIMITS.questions) throw new ImportError(`This survey has ${items.length} questions. Surveys over ${LIMITS.questions} questions are not imported; split it into parts.`);
  // ---------- pass 2: logic ----------
  const leafCache = new Map();
  function leafOf(expr) {
    const lt = expr.LogicType;
    if (lt === 'EmbeddedField') {
      const field = String(expr.LeftOperand ?? ''), ed = edByField.get(field);
      if (!ed) throw new Unsupported(`the embedded field "${field.slice(0, 30)}" is not defined in the flow`);
      return textTest({ ed }, expr.Operator, expr.RightOperand);
    }
    if (lt !== 'Question' && lt !== undefined) throw new Unsupported(`${lt} logic`);
    const m = String(expr.ChoiceLocator || expr.LeftOperand || '').match(/^q:\/\/(QID\d+)\/(.*)$/);
    const qid = expr.QuestionID || (m && m[1]), rest = m ? m[2] : '', info = qmap.get(qid), op = expr.Operator;
    if (!info) throw new Unsupported(`the question ${qid} was not imported`);
    if (op === 'Displayed' || op === 'NotDisplayed') throw new Unsupported('"displayed" tests');
    if (op === 'Empty' || op === 'NotEmpty') { if (info.kind === 'matrix' || info.kind === 'form' || info.kind === 'slider') throw new Unsupported('an empty test on a multi-row question'); return { q: info.id, op: op === 'Empty' ? 'notAnswered' : 'answered' }; }
    if (info.kind === 'mc' || info.kind === 'multi') {
      const sc = rest.match(/^SelectableChoice\/(\d+)$/);
      if (!['Selected', 'NotSelected'].includes(op) || !sc) throw new Unsupported(`the test "${op}" on a multiple-choice question`);
      const v = info.optVals.get(sc[1]);
      if (v == null) throw new Unsupported('a choice that is not in the question');
      return { q: info.id, op: op === 'Selected' ? 'eq' : 'neq', value: v };
    }
    if (info.kind === 'matrix') {
      const mm = rest.match(/^SelectableChoice\/(\d+)\/SelectableAnswer\/(\d+)$/), row = mm && info.rows.get(mm[1]), pt = mm && info.colPoint.get(mm[2]);
      if (!row || pt == null || !['Selected', 'NotSelected'].includes(op)) throw new Unsupported('this test on a matrix');
      return { q: row.id, op: op === 'Selected' ? 'eq' : 'neq', value: pt };
    }
    if (info.kind === 'te' || info.kind === 'form' || info.kind === 'slider') {
      const rk = (rest.match(/\/(\d+)$/) || [])[1], target = info.kind === 'te' ? { id: info.id } : info.rows.get(rk) || (info.rows.size === 1 ? [...info.rows.values()][0] : null);
      if (!target) throw new Unsupported('a field that is not in the question');
      let rv = expr.RightOperand;
      if (info.kind === 'slider' && info.zeroStep && rv != null && Number.isFinite(Number(rv))) rv = String(Math.round(Number(rv)));
      else if (info.kind === 'slider' && info.n && rv != null && Number.isFinite(Number(rv))) {
        // slider answers are points 1..n over min..max
        const span = (info.max - info.min) / (info.n - 1);
        rv = String(Math.max(1, Math.min(info.n, Math.round((Number(rv) - info.min) / span) + 1)));
      }
      return textTest({ q: target.id }, op, rv);
    }
    throw new Unsupported('this kind of question');
  }
  function textTest(subject, op, rv) {
    const v = rv == null ? '' : String(rv);
    switch (op) {
      case 'EqualTo': return v === '' ? { ...subject, op: 'notAnswered' } : { ...subject, op: 'eq', value: v };
      case 'NotEqualTo': return v === '' ? { ...subject, op: 'answered' } : { ...subject, op: 'neq', value: v };
      case 'GreaterThan': case 'GreaterThanOrEqual': case 'LessThan': case 'LessThanOrEqual':
        if (!Number.isFinite(Number(v)) || v === '') throw new Unsupported('a number comparison with a non-number');
        return { ...subject, op: { GreaterThan: 'gt', GreaterThanOrEqual: 'gte', LessThan: 'lt', LessThanOrEqual: 'lte' }[op], value: v };
      case 'Empty': return { ...subject, op: 'notAnswered' };
      case 'NotEmpty': return { ...subject, op: 'answered' };
      default: throw new Unsupported(`the text test "${op}"`);
    }
  }
  function parseLogic(L) {
    const groups = numKeys(L).map(k => L[k]).filter(g => g && typeof g === 'object');
    if (!groups.length) throw new Unsupported('empty logic');
    const combine = list => {
      if (!list.length) throw new Unsupported('empty logic');
      const orParts = []; let cur = [list[0].node];
      for (const x of list.slice(1)) { if (x.conj === 'or') { orParts.push(cur); cur = [x.node]; } else cur.push(x.node); }
      orParts.push(cur);
      const ands = orParts.map(a => a.reduce((acc, n) => { const r = andNodes(acc, n); if (!r) throw new Unsupported('the logic is nested too deeply'); return r; }));
      return ands.reduce((acc, n) => { const r = orNodes(acc, n); if (!r) throw new Unsupported('the logic is nested too deeply'); return r; });
    };
    return combine(groups.map(g => ({ conj: conj(g.Conjuction), node: combine(numKeys(g).map(k => ({ conj: conj(g[k].Conjuction), node: leafOf(g[k]) }))) })));
  }
  const logicCache = new Map();
  function logicNode(L, what) {
    if (!L || typeof L !== 'object' || !numKeys(L).length) return null;
    if (logicCache.has(L)) return logicCache.get(L);
    let node = null;
    try { node = parseLogic(L); } catch (e) { if (!(e instanceof Unsupported)) throw e; unsupported(report, what, `Logic was not converted (${e.message}); it is ignored, so the affected questions are shown to everyone.`); }
    logicCache.set(L, node);
    return node;
  }
  const fail = (what) => unsupported(report, what, 'The combined display logic is nested too deeply for the lab; part of it was dropped.');
  const itemsByQid = new Map();
  for (const it of items) { const l = itemsByQid.get(it._qid) || []; l.push(it); itemsByQid.set(it._qid, l); }

  // skip logic: after question X, hide the following questions when the condition holds
  const skipRules = [], qIndex = new Map(qOrder.map((q, i) => [q, i])), lastSegOf = new Map();
  for (const it of items) lastSegOf.set(it._qid, it._seg);
  for (const qid of qOrder) {
    const p = sq.get(qid), info = qmap.get(qid);
    const rules = [];
    if (p.SkipLogic) {
      for (const r of Array.isArray(p.SkipLogic) ? p.SkipLogic : numKeys(p.SkipLogic).map(k => p.SkipLogic[k])) {
        const dest = r && (r.SkipToDestination || r.Destination || r.SkipTo), L = r && (r.Logic || r);
        if (dest) { const node = logicNode(L, `${qid} skip logic`); if (node) rules.push({ cond: node, dest }); }
      }
    }
    const chs = p.Choices && !Array.isArray(p.Choices) ? Object.entries(p.Choices) : [];
    for (const [k, c] of chs) if (c && c.Skip && info.optVals && info.optVals.has(String(k))) rules.push({ cond: { q: info.id, op: 'eq', value: info.optVals.get(String(k)) }, dest: c.Skip });
    for (const k of Object.keys(p)) if (/skip/i.test(k) && !['SkipLogic'].includes(k) && p[k] && typeof p[k] === 'object' && Object.keys(p[k]).length && !rules.length) { unsupported(report, qid, `Skip logic ("${k}") is in a format the importer does not read; it is ignored.`); break; }
    for (const r of rules) {
      if (skipRules.length >= 3000) throw new ImportError('This survey has more than 3000 skip rules; it is too large to import.');
      const lastSeg = lastSegOf.get(qid);
      const here = qIndex.get(qid);
      let reach;
      if (r.dest === 'EndOfSurvey') reach = () => true;
      else if (r.dest === 'EndOfBlock') reach = (it) => it._seg === lastSeg;
      else {
        const destSeg = segments.findIndex((s, i) => i > lastSeg && s.id === r.dest);
        if (destSeg < 0) { unsupported(report, qid, `Skip to "${String(r.dest).slice(0, 40)}" was not converted (destination not found later in the flow).`); continue; }
        reach = (it) => it._seg === lastSeg || (it._seg > lastSeg && it._seg < destSeg);
      }
      skipRules.push({ here, qid, cond: r.cond, reach });
      mapped(report, `${qid} skip logic`, `hides the following ${r.dest === 'EndOfSurvey' ? 'questions in the survey' : r.dest === 'EndOfBlock' ? 'questions in the block' : 'questions up to the destination block'} when the condition holds`);
    }
  }
  const branchLogic = new Map();
  items.forEach(it => {
    const seg = segments[it._seg], p = sq.get(it._qid);
    let node = null, dropped = false;
    const merge = n => { if (!n) return; const r = andNodes(node, n); if (r) node = r; else dropped = true; };
    for (const b of seg.branches) {
      if (!branchLogic.has(b)) branchLogic.set(b, logicNode(b.logic, `branch "${b.desc}"`));
      merge(branchLogic.get(b));
    }
    merge(logicNode(seg.block && (seg.block.DisplayLogic || (seg.block.Options && seg.block.Options.DisplayLogic)), `block ${seg.block ? seg.block.Description : ''} display logic`));
    merge(logicNode(p.DisplayLogic, `${it._qid} display logic`));
    for (const e of ends) if (e.after <= it._seg) {
      const logic = e.branches.map(b => { if (!branchLogic.has(b)) branchLogic.set(b, logicNode(b.logic, `branch "${b.desc}"`)); return branchLogic.get(b); }).filter(Boolean).reduce((a, n) => andNodes(a, n) || a, null);
      if (logic) merge(negate(logic));
    }
    for (const r of skipRules) if (qIndex.get(it._qid) > r.here && r.reach(it)) merge(negate(r.cond));
    if (dropped) fail(it.source);
    if (it._follow) merge(it._follow.q ? { q: it._follow.q, op: 'eq', value: it._follow.value } : null);
    if (node) it.displayIf = node;
  });
  if (ends.length) mapped(report, 'end of survey in a branch', 'hides all later questions when the branch logic holds');

  // ---------- pass 3: piped text ----------
  const pipe = (s, src) => String(s).replace(/\$\{([^}]*)\}/g, (m, inner) => {
    let r;
    if ((r = inner.match(/^q:\/\/(QID\d+)\/ChoiceGroup\/SelectedChoices$/))) { const i = qmap.get(r[1]); if (i && (i.kind === 'mc' || i.kind === 'multi')) return `{{q:${i.id}}}`; }
    else if ((r = inner.match(/^q:\/\/(QID\d+)\/ChoiceTextEntryValue(?:\/(\d+))?$/))) { const i = qmap.get(r[1]); const t = i && (i.kind === 'te' ? i : i.rows && i.rows.get(r[2])); if (t && (i.kind === 'te' || i.kind === 'form')) return `{{q:${t.id}}}`; }
    else if ((r = inner.match(/^q:\/\/(QID\d+)\/ChoiceNumericEntryValue(?:\/(\d+))?$/))) { const i = qmap.get(r[1]); const t = i && i.kind === 'slider' && i.rows.get(r[2] || [...i.rows.keys()][0]); if (t) return `{{q:${t.id}}}`; }
    else if ((r = inner.match(/^e:\/\/Field\/(.+)$/))) { const ed = edByField.get(decodeURIComponent(r[1])); if (ed) return `{{ed:${ed}}}`; }
    unsupported(report, src, `Piped text ${m.slice(0, 60)} is not supported and was removed.`);
    return '';
  });
  for (const it of items) {
    if (/\$\{/.test(it.text)) it.text = pipe(it.text, it.source).trim() || (it.type === 'info' ? '(text)' : it.text.replace(/\$\{[^}]*\}/g, '').trim() || '(question text)');
    if (it.groupText && /\$\{/.test(it.groupText)) it.groupText = pipe(it.groupText, it.source);
    for (const o of it.options || []) if (/\$\{/.test(o.label)) o.label = pipe(o.label, it.source).trim() || o.value;
    for (const k of ['lo', 'hi']) if (it[k] && /\$\{/.test(it[k])) it[k] = pipe(it[k], it.source);
    if (it.labels) it.labels = it.labels.map(x => (/\$\{/.test(x) ? pipe(x, it.source) || '-' : x));
  }
  for (const it of items) { delete it._qid; delete it._seg; delete it._follow; }
  if (conditions) for (const c of conditions) delete c.picked;
  const outConds = conditions ? conditions.map(({ id, label: l }) => ({ id, label: l })) : null;
  return finishImport(report, items, { title, conditions: outConds, embedded });
}
