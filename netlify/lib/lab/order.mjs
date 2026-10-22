// CCAIR Behavioral Lab: question and option order randomization, fixed per participant and session.
//   question.shuffle: true          the question trades places with the other "shuffle" questions on its page
//                                   (questions without it keep their positions)
//   question.shuffleOptions: true   its options are shown in a random order (choice, select, multi)
//   option.anchor: true             the option stays at the end, in its listed order ("Other", "None of the above")
// The order is drawn when the session plan is built (engine.buildPlan, from a seed of the participant, study, and
// session), so a reload shows the same order, and the order shown is saved with each answer (record.shown) and
// exported (order_questions, order_{question}).

const SHUFFLE_TYPES = ['choice', 'select', 'multi'];

export function shuffleArray(a, rand) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Options in a random order, anchored ones last in their listed order.
export function orderOptions(options, rand) {
  return shuffleArray(options.filter(o => !o.anchor), rand).concat(options.filter(o => o.anchor));
}

// A list of questions in the order shown. Returns { items, shown } with shown = { questions?: [ids], options?: { id: [values] } }
// (questions only when some question was shuffled; options only for questions whose options were).
export function randomizeQuestions(items, rand) {
  const list = (items || []).map(q => ({ ...q })), shown = {};
  if (list.some(q => q.shuffle)) {
    const byPage = new Map();
    list.forEach((q, i) => { if (q.shuffle) { const k = q.page || 1; if (!byPage.has(k)) byPage.set(k, []); byPage.get(k).push(i); } });
    const out = list.slice();
    for (const idx of byPage.values()) shuffleArray(idx, rand).forEach((from, j) => { out[idx[j]] = list[from]; });
    list.splice(0, list.length, ...out);
    shown.questions = list.filter(q => q.type !== 'info').map(q => q.id);
  }
  for (const q of list) {
    if (q.shuffleOptions && SHUFFLE_TYPES.includes(q.type) && Array.isArray(q.options)) {
      q.options = orderOptions(q.options, rand);
      (shown.options || (shown.options = {}))[q.id] = q.options.map(o => o.value);
    }
  }
  return { items: list, shown: Object.keys(shown).length ? shown : null };
}

// Export columns for one record's shown order (surveys and trials alike). `taken` holds names already in the row.
export function orderColumns(shown, taken = {}) {
  const row = {};
  if (!shown) return row;
  const put = (k, v) => { row[k in taken ? `shown_${k}` : k] = v; };
  if (shown.questions) put('order_questions', shown.questions.join('|'));
  for (const [id, vals] of Object.entries(shown.options || {})) put(`order_${id}`, vals.join('|'));
  return row;
}

// Checks for the order settings of one list of questions (content.validateQuestions calls it).
const refsOf = q => {
  const out = [];
  (function walk(n) { if (!n || typeof n !== 'object') return; if (n.q) out.push(n.q); for (const k of n.all || n.any || []) walk(k); })(q.displayIf);
  const texts = [q.text, q.groupText, ...(Array.isArray(q.options) ? q.options.map(o => o && o.label) : [])].filter(t => typeof t === 'string');
  for (const t of texts) for (const m of t.matchAll(/\{\{q:([a-z][a-z0-9_]*)\}\}/g)) out.push(m[1]);
  return out;
};
export function validateOrder(items, where, e) {
  const pageOf = new Map(items.map(q => [q.id, q.page || 1]));
  items.forEach((q, i) => {
    const w = `${where} ${i + 1}`;
    if (q.shuffle != null && typeof q.shuffle !== 'boolean') e.push(`${w}: "shuffle" must be true or false.`);
    if (q.shuffleOptions != null && typeof q.shuffleOptions !== 'boolean') e.push(`${w}: "shuffle options" must be true or false.`);
    if (q.shuffleOptions && !SHUFFLE_TYPES.includes(q.type)) e.push(`${w}: only multiple-choice, dropdown, and select-all questions can shuffle their options.`);
    if (Array.isArray(q.options) && q.options.some(o => o && o.anchor != null && typeof o.anchor !== 'boolean')) e.push(`${w}: an option's "stay last" setting must be true or false.`);
    if (Array.isArray(q.options) && q.options.length && q.options.every(o => o && o.anchor) && q.shuffleOptions) e.push(`${w}: every option is set to stay last, so nothing would be shuffled.`);
    // A shuffled question may land before or after its neighbours, so it cannot depend on one, and none can depend on it.
    if (q.shuffle) {
      for (const r of refsOf(q)) if (pageOf.get(r) === (q.page || 1)) e.push(`${w}: a shuffled question cannot use display logic or piped text from "${r}" on the same page. Put "${r}" on an earlier page.`);
      for (const o of items) if (o !== q && (o.page || 1) === (q.page || 1) && refsOf(o).includes(q.id)) e.push(`${w}: "${o.id}" on the same page depends on this question, so it cannot be shuffled.`);
    }
  });
}
