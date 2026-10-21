// CCAIR Behavioral Lab: survey display logic and piped text, as pure functions.
// The browser has its own copy (static/lab/engine/logic.js, no modules so a plain <script> can load it).
// tests/lab/display-logic.test.mjs runs both against one table of cases, so they cannot drift apart.
//
// displayIf (on any survey question or per-item question) is a tree:
//   { all: [node, ...] } | { any: [node, ...] }       one more level of all/any is allowed inside
//   { q: '<variable>', op, value }                     answer to an earlier question
//   { ed: '<name>', op, value }                        embedded data
//   { condition: '<id>', op: 'eq' | 'neq' }            the participant's condition
//   { const: true | false }                            server-made only: a condition resolved for the browser
// Operators: eq neq in notIn gt gte lt lte answered notAnswered. A missing answer: eq, in, gt, gte, lt,
// lte are false; neq, notIn, notAnswered are true. A select-all answer is a list: eq means "includes",
// in means "includes any of".

export const OPS = ['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'answered', 'notAnswered'];
export const NO_VALUE_OPS = ['answered', 'notAnswered'];
export const PIPE_RE = /\{\{(q|ed):([a-z][a-z0-9_]{0,40})\}\}/g;

export const isAnswered = v => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');
const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);
const num = v => { const t = String(v).trim().replace(/,/g, ''); const n = Number(t); return t !== '' && Number.isFinite(n) ? n : null; };

function test(op, have, want) {
  const ans = isAnswered(have), arr = Array.isArray(have);
  if (op === 'answered') return ans;
  if (op === 'notAnswered') return !ans;
  const h = !ans ? null : arr ? have.map(String) : String(have);
  const inList = () => { const w = (Array.isArray(want) ? want : [want]).map(String); return ans && (arr ? h.some(x => w.includes(x)) : w.includes(h)); };
  switch (op) {
    case 'eq': return ans && (arr ? h.includes(String(want)) : h === String(want));
    case 'neq': return !(ans && (arr ? h.includes(String(want)) : h === String(want)));
    case 'in': return inList();
    case 'notIn': return !inList();
    case 'gt': case 'gte': case 'lt': case 'lte': {
      if (!ans || arr) return false;
      const a = num(h), b = num(want);
      if (a == null || b == null) return false;
      return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
    }
  }
  return false;
}

// env: { answers: {variable: value}, ed: {name: value}, condition: 'id' }
export function evalDisplay(node, env = {}) {
  if (!node || typeof node !== 'object') return true;
  if (Array.isArray(node.all)) return node.all.every(n => evalDisplay(n, env));
  if (Array.isArray(node.any)) return node.any.some(n => evalDisplay(n, env));
  if ('const' in node) return !!node.const;
  if (node.q != null) return test(node.op, own(env.answers, node.q), node.value);
  if (node.ed != null) return test(node.op, own(env.ed, node.ed), node.value);
  if (node.condition != null) return node.op === 'neq' ? env.condition !== node.condition : env.condition === node.condition;
  return true;
}

// Questions in the order a participant meets them: by page, then as listed.
export function orderItems(items) {
  return (items || []).map((it, i) => [it, i]).sort((a, b) => ((a[0].page || 1) - (b[0].page || 1)) || (a[1] - b[1])).map(x => x[0]);
}

// Walks the questions in order. A hidden question loses its answer before later questions are
// evaluated, so logic that depends on a hidden question sees it as unanswered. `seed` holds answers from
// earlier pages (the browser evaluates one page at a time). Returns { hidden: {id: true}, answers }.
export function resolve(items, answers, env = {}, seed = {}) {
  const kept = { ...seed }, hidden = {};
  for (const it of orderItems(items)) {
    if (!evalDisplay(it.displayIf, { answers: kept, ed: env.ed, condition: env.condition })) { hidden[it.id] = true; continue; }
    if (it.type !== 'info' && answers && Object.hasOwn(answers, it.id) && answers[it.id] !== undefined) kept[it.id] = answers[it.id];
  }
  return { hidden, answers: kept };
}

// The copy of the questions sent to a participant's browser: tests on the participant's condition are
// settled here, so the browser never learns condition names from the logic.
export function publicQuestions(items, condition) {
  const fix = n => {
    if (!n || typeof n !== 'object') return n;
    if (Array.isArray(n.all)) return { all: n.all.map(fix) };
    if (Array.isArray(n.any)) return { any: n.any.map(fix) };
    if (n.condition != null) return { const: n.op === 'neq' ? condition !== n.condition : condition === n.condition };
    return n;
  };
  return (items || []).map(it => (it.displayIf ? { ...it, displayIf: fix(it.displayIf) } : it));
}

// Variable and embedded-data names a displayIf tree depends on.
export function refsOf(node, out = { q: [], ed: [], condition: [] }) {
  if (!node || typeof node !== 'object') return out;
  for (const k of ['all', 'any']) if (Array.isArray(node[k])) node[k].forEach(n => refsOf(n, out));
  if (node.q != null) out.q.push(node.q);
  if (node.ed != null) out.ed.push(node.ed);
  if (node.condition != null) out.condition.push(node.condition);
  return out;
}

// Plain-words version of a displayIf tree, for the admin page. `items` (optional) turns option values
// into their labels.
export function describe(node, items = []) {
  const byId = Object.fromEntries((items || []).map(i => [i.id, i]));
  const word = { eq: 'is', neq: 'is not', in: 'is one of', notIn: 'is not one of', gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most', answered: 'was answered', notAnswered: 'was not answered' };
  const val = (q, v) => {
    const it = q && byId[q], one = x => { const o = it && it.options ? it.options.find(p => p.value === String(x)) : null; return '"' + (o ? o.label : x) + '"'; };
    return Array.isArray(v) ? v.map(one).join(', ') : one(v);
  };
  const leaf = n => {
    if (n.condition != null) return `the participant's condition ${n.op === 'neq' ? 'is not' : 'is'} "${n.condition}"`;
    if ('const' in n) return n.const ? 'always' : 'never';
    const subject = n.q != null ? n.q : `embedded data ${n.ed}`;
    const it = n.q != null ? byId[n.q] : null;
    let w = word[n.op] || n.op;
    if (it && it.type === 'multi') w = n.op === 'eq' ? 'includes' : n.op === 'neq' ? 'does not include' : n.op === 'in' ? 'includes any of' : n.op === 'notIn' ? 'includes none of' : w;
    return NO_VALUE_OPS.includes(n.op) ? `${subject} ${w}` : `${subject} ${w} ${n.q != null ? val(n.q, n.value) : Array.isArray(n.value) ? n.value.map(x => '"' + x + '"').join(', ') : '"' + n.value + '"'}`;
  };
  const walk = (n, top) => {
    if (!n) return 'always';
    const kids = n.all || n.any;
    if (!kids) return leaf(n);
    const s = kids.map(k => walk(k, false)).join(n.all ? ' and ' : ' or ');
    return top || kids.length < 2 ? s : `(${s})`;
  };
  return walk(node, true);
}

// Replaces {{q:name}} and {{ed:name}} using lookup(kind, name) -> string.
export function fillPipes(text, lookup) {
  return String(text == null ? '' : text).replace(PIPE_RE, (m, kind, name) => String(lookup(kind, name) ?? ''));
}
