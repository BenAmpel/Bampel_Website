// CCAIR Behavioral Lab: the slider, ranking, and matrix question types (validation, cleaning, self-test answers).
//   slider  { min, max, step, lo?, hi? }   a line with no handle until the participant touches it, so there is no
//           default to anchor on; untouched = no answer (blank), touched = the number. Keyboard: arrows, Page, Home/End.
//   rank    { options }                    put every option in order with Move up / Move down buttons (no dragging);
//           the answer is the option values in rank order. No answer until the participant moves something.
//   matrix  { rows: [{ id, text }], options } one set of answers shared by several statements; each row is its own
//           variable (its id is the column name), so a matrix exports like separate questions.
// All three are for start- and end-of-session surveys (per-item questions keep the original types).
export const EXTRA_TYPES = ['slider', 'rank', 'matrix'];
const NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

// Extra checks for one question of a new type. ids: variable names used so far in the list (rows add theirs).
export function validateExtra(it, w, e, { ids, reserved, allowMatrix }) {
  if (!EXTRA_TYPES.includes(it.type)) return;
  if (!allowMatrix) { e.push(`${w}: sliders, rankings, and matrices can only be used in start- and end-of-session surveys.`); return; }
  if (it.type === 'slider') {
    const { min, max, step } = it;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) e.push(`${w}: a slider needs a smallest and a largest value, the largest above the smallest.`);
    else if (!(Number.isFinite(step) && step > 0) || (max - min) / step > 1000 || Math.abs((max - min) / step - Math.round((max - min) / step)) > 1e-9) e.push(`${w}: the slider step must divide the range into at most 1,000 equal steps.`);
    for (const k of ['lo', 'hi']) if (it[k] != null && !(typeof it[k] === 'string' && it[k].length <= 120)) e.push(`${w}: the slider's end labels must be 120 characters or fewer.`);
  }
  if (it.type === 'rank') {
    if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 20) e.push(`${w}: a ranking needs 2 to 20 options.`);
  }
  if (it.type === 'matrix') {
    if (!Array.isArray(it.rows) || !it.rows.length || it.rows.length > 30) { e.push(`${w}: a matrix needs 1 to 30 rows.`); return; }
    if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 11) e.push(`${w}: a matrix needs 2 to 11 answer columns.`);
    it.rows.forEach((r, j) => {
      const rw = `${w}, row ${j + 1}`;
      if (!r || !NAME_RE.test(r.id || '')) e.push(`${rw}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
      else if (ids.has(r.id)) e.push(`${rw}: variable name "${r.id}" is used twice.`);
      else if (reserved.includes(r.id)) e.push(`${rw}: "${r.id}" is reserved for an export column; choose another variable name.`);
      else ids.add(r.id);
      if (!r || !str(r.text, 1000)) e.push(`${rw}: the statement is empty.`);
    });
  }
}

// The cleaned answer(s) for one question of a new type: [[variable, value], ...] (a matrix gives one per row).
export function cleanExtra(it, v, d) {
  if (it.type === 'slider') {
    const n = Number(v);
    if (v == null || v === '' || !Number.isFinite(n) || n < it.min || n > it.max) return [];
    const k = Math.round((n - it.min) / it.step), snapped = +(it.min + k * it.step).toFixed(6);
    return Math.abs(snapped - n) < it.step / 1000 ? [[it.id, String(snapped)]] : [];
  }
  if (it.type === 'rank') {
    const vals = (it.options || []).map(o => o.value);
    return Array.isArray(v) && v.length === vals.length && new Set(v).size === vals.length && v.every(x => vals.includes(x)) ? [[it.id, v.slice()]] : [];
  }
  if (it.type === 'matrix') {
    const out = [];
    for (const r of it.rows || []) { const x = Object.hasOwn(d, r.id) ? d[r.id] : undefined; if (x != null && (it.options || []).some(o => o.value === x)) out.push([r.id, x]); }
    return out;
  }
  return [];
}

// The variables a question answers (a matrix: its rows).
export const variablesOf = it => (it.type === 'matrix' ? (it.rows || []).map(r => r.id) : it.type === 'info' ? [] : [it.id]);

// A plausible answer for the self-test, as an object of variables.
export function simulateExtra(it, r) {
  if (it.type === 'slider') { const steps = Math.round((it.max - it.min) / it.step); return { [it.id]: String(+(it.min + Math.floor(r() * (steps + 1)) * it.step).toFixed(6)) }; }
  if (it.type === 'rank') { const v = it.options.map(o => o.value); for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; } return { [it.id]: v }; }
  if (it.type === 'matrix') return Object.fromEntries(it.rows.map(row => [row.id, it.options[Math.floor(r() * it.options.length)].value]));
  return {};
}
