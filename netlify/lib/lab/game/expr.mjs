// CCAIR Behavioral Lab, economic games: a safe expression evaluator for payoffs and decision bounds.
// A hand-written tokenizer and recursive-descent parser; nothing here uses eval, Function, or any lookup that
// reaches Object.prototype or globals. Variables are looked up only as own properties of the environment objects
// the caller builds (null-prototype maps), so `constructor`, `__proto__`, `process`, and `globalThis` are simply
// unknown names.
//
// Grammar, lowest to highest precedence
//   ternary     cond ? a : b                       (right associative)
//   or          a or b        (also ||)
//   and         a and b       (also &&)
//   not         not a         (also !a)
//   comparison  == != < <= > >=                    (not chained)
//   additive    + -
//   term        * / %
//   unary       - +                                (so -2^2 is -4)
//   power       a ^ b                              (right associative, exponent may be unary)
//   primary     number, 'text', true, false, name.path, function(args), ( expression )
//
// Values are numbers, booleans, strings, or lists (arrays of numbers or strings). Arithmetic needs numbers;
// there is no silent conversion. Functions: min max abs round floor ceil sqrt sum mean count num.
//   round(x) or round(x, digits)   count(list) is its length; count(list, value) counts equal items
//   num('3') turns text into a number     sum, mean, min, max take numbers and lists (flattened)

export class ExprError extends Error {
  constructor(message, pos) { super(message); this.name = 'ExprError'; this.pos = pos ?? null; }
}

const MAX_LEN = 2000, MAX_TOKENS = 600, MAX_DEPTH = 40;
const FUNCS = new Set(['min', 'max', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'sum', 'mean', 'count', 'num']);
const KEYWORDS = Object.assign(Object.create(null), { and: 'and', or: 'or', not: 'not', true: 'true', false: 'false' });

function tokenize(src) {
  if (typeof src !== 'string') throw new ExprError('The expression must be text.');
  if (src.length > MAX_LEN) throw new ExprError(`The expression is longer than ${MAX_LEN} characters.`);
  const toks = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (toks.length >= MAX_TOKENS) throw new ExprError('The expression is too long.');
    const start = i;
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`Unexpected "${ch}" at position ${i + 1}.`, i);
      toks.push({ t: 'num', v: Number(m[0]), pos: start }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
      const word = m[0];
      if (KEYWORDS[word]) toks.push({ t: KEYWORDS[word], pos: start });
      else toks.push({ t: 'id', v: word, pos: start });
      i += word.length; continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== ch) out += src[j++];
      if (j >= src.length) throw new ExprError(`The text starting at position ${i + 1} is missing its closing quote.`, i);
      toks.push({ t: 'str', v: out, pos: start }); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { toks.push({ t: two === '&&' ? 'and' : two === '||' ? 'or' : two, pos: start }); i += 2; continue; }
    if ('+-*/%^()<>,?:!'.includes(ch)) { toks.push({ t: ch === '!' ? 'not' : ch, pos: start }); i++; continue; }
    if (ch === '=') throw new ExprError(`Use == to compare (position ${i + 1}).`, i);
    throw new ExprError(`Unexpected "${ch}" at position ${i + 1}.`, i);
  }
  toks.push({ t: 'end', pos: src.length });
  return toks;
}

export function parse(src) {
  const toks = tokenize(src); let k = 0, depth = 0;
  const peek = () => toks[k], take = () => toks[k++];
  const fail = (msg, tok = peek()) => { throw new ExprError(msg, tok.pos); };
  const expect = (t, what) => { if (peek().t !== t) fail(`Expected ${what} at position ${peek().pos + 1}.`); return take(); };
  const enter = () => { if (++depth > MAX_DEPTH) fail('The expression is nested too deeply.'); };
  const leave = () => { depth--; };
  function ternary() {
    enter();
    const c = orExpr();
    if (peek().t === '?') {
      take(); const a = ternary(); expect(':', 'a ":" in the "? :" choice'); const b = ternary();
      leave(); return { k: 'if', c, a, b };
    }
    leave(); return c;
  }
  function orExpr() { let l = andExpr(); while (peek().t === 'or') { take(); l = { k: 'or', l, r: andExpr() }; } return l; }
  function andExpr() { let l = notExpr(); while (peek().t === 'and') { take(); l = { k: 'and', l, r: notExpr() }; } return l; }
  function notExpr() { if (peek().t === 'not') { take(); enter(); const e = { k: 'not', e: notExpr() }; leave(); return e; } return cmp(); }
  function cmp() {
    const l = add();
    if (['==', '!=', '<', '<=', '>', '>='].includes(peek().t)) {
      const op = take().t, r = add();
      if (['==', '!=', '<', '<=', '>', '>='].includes(peek().t)) fail('Comparisons cannot be chained; join them with "and".');
      return { k: 'cmp', op, l, r };
    }
    return l;
  }
  function add() { let l = term(); while (peek().t === '+' || peek().t === '-') { const op = take().t; l = { k: 'bin', op, l, r: term() }; } return l; }
  function term() { let l = unary(); while (['*', '/', '%'].includes(peek().t)) { const op = take().t; l = { k: 'bin', op, l, r: unary() }; } return l; }
  function unary() {
    if (peek().t === '-' || peek().t === '+') { const op = take().t; enter(); const e = unary(); leave(); return op === '-' ? { k: 'neg', e } : e; }
    return power();
  }
  function power() {
    const base = primary();
    if (peek().t === '^') { take(); enter(); const ex = unary(); leave(); return { k: 'bin', op: '^', l: base, r: ex }; }
    return base;
  }
  function primary() {
    const t = take();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'true') return { k: 'bool', v: true };
    if (t.t === 'false') return { k: 'bool', v: false };
    if (t.t === '(') { enter(); const e = ternary(); leave(); expect(')', 'a closing ")"'); return e; }
    if (t.t === 'id') {
      if (peek().t === '(') {
        if (!FUNCS.has(t.v)) fail(`Unknown function "${t.v}". Available: ${[...FUNCS].join(', ')}.`, t);
        take(); const args = [];
        if (peek().t !== ')') { args.push(ternary()); while (peek().t === ',') { take(); args.push(ternary()); } }
        expect(')', `a closing ")" after ${t.v}(`);
        return { k: 'call', name: t.v, args, pos: t.pos };
      }
      return { k: 'id', name: t.v, pos: t.pos };
    }
    if (t.t === 'end') fail('The expression ends too early.', t);
    fail(`Unexpected "${describe(t)}" at position ${t.pos + 1}.`, t);
  }
  const ast = ternary();
  if (peek().t !== 'end') fail(`Unexpected "${describe(peek())}" at position ${peek().pos + 1}.`);
  return ast;
}
const describe = t => t.v !== undefined ? String(t.v) : t.t;

// Every variable path the expression mentions (for validation against the declared decisions).
export function identifiers(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.k === 'id') out.add(ast.name);
  for (const key of ['c', 'a', 'b', 'l', 'r', 'e']) if (ast[key]) identifiers(ast[key], out);
  if (ast.args) ast.args.forEach(a => identifiers(a, out));
  return out;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isList = v => Array.isArray(v);
const typeName = v => isList(v) ? 'a list' : typeof v === 'number' ? 'a number' : typeof v === 'boolean' ? 'true/false' : 'text';

function lookup(env, path, pos) {
  let cur = env;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || isList(cur) || !hasOwn(cur, part)) throw new ExprError(`Unknown name "${path}".`, pos);
    cur = cur[part];
  }
  if (cur !== null && typeof cur === 'object' && !isList(cur)) throw new ExprError(`"${path}" is a group of values; add a name after it (for example ${path}.something).`, pos);
  return cur;
}
function numArg(v, fn) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ExprError(`${fn}() needs numbers, but got ${typeName(v)}.`);
  return v;
}
function flat(args, fn) {
  const out = [];
  for (const a of args) { if (isList(a)) for (const x of a) out.push(numArg(x, fn)); else out.push(numArg(a, fn)); }
  return out;
}
function call(name, a) {
  switch (name) {
    case 'min': { const x = flat(a, 'min'); if (!x.length) throw new ExprError('min() of an empty list.'); return Math.min(...x); }
    case 'max': { const x = flat(a, 'max'); if (!x.length) throw new ExprError('max() of an empty list.'); return Math.max(...x); }
    case 'sum': return flat(a, 'sum').reduce((s, v) => s + v, 0);
    case 'mean': { const x = flat(a, 'mean'); if (!x.length) throw new ExprError('mean() of an empty list.'); return x.reduce((s, v) => s + v, 0) / x.length; }
    case 'abs': if (a.length !== 1) throw new ExprError('abs() takes one argument.'); return Math.abs(numArg(a[0], 'abs'));
    case 'floor': if (a.length !== 1) throw new ExprError('floor() takes one argument.'); return Math.floor(numArg(a[0], 'floor'));
    case 'ceil': if (a.length !== 1) throw new ExprError('ceil() takes one argument.'); return Math.ceil(numArg(a[0], 'ceil'));
    case 'sqrt': { if (a.length !== 1) throw new ExprError('sqrt() takes one argument.'); const x = numArg(a[0], 'sqrt'); if (x < 0) throw new ExprError('sqrt() of a negative number.'); return Math.sqrt(x); }
    case 'round': {
      if (a.length < 1 || a.length > 2) throw new ExprError('round() takes a number and optionally the digits.');
      const x = numArg(a[0], 'round'), d = a.length === 2 ? numArg(a[1], 'round') : 0;
      if (!Number.isInteger(d) || d < 0 || d > 10) throw new ExprError('round() digits must be a whole number from 0 to 10.');
      const f = 10 ** d; return Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f;
    }
    case 'count': {
      if (a.length < 1 || a.length > 2 || !isList(a[0])) throw new ExprError('count() takes a list and optionally a value to count.');
      return a.length === 1 ? a[0].length : a[0].filter(x => x === a[1]).length;
    }
    case 'num': {
      if (a.length !== 1) throw new ExprError('num() takes one argument.');
      const v = typeof a[0] === 'string' ? Number(a[0].trim()) : a[0];
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new ExprError(`num() cannot turn ${JSON.stringify(a[0])} into a number.`);
      return v;
    }
  }
  throw new ExprError(`Unknown function "${name}".`);
}

const needNum = (v, op) => { if (typeof v !== 'number') throw new ExprError(`"${op}" needs numbers, but got ${typeName(v)}.`); return v; };
const needBool = (v, op) => { if (typeof v !== 'boolean') throw new ExprError(`"${op}" needs a true/false value, but got ${typeName(v)}.`); return v; };

export function evaluate(ast, env) {
  switch (ast.k) {
    case 'num': case 'str': case 'bool': return ast.v;
    case 'id': return lookup(env, ast.name, ast.pos);
    case 'neg': return -needNum(evaluate(ast.e, env), '-');
    case 'not': return !needBool(evaluate(ast.e, env), 'not');
    case 'if': return needBool(evaluate(ast.c, env), '?') ? evaluate(ast.a, env) : evaluate(ast.b, env);
    case 'and': return needBool(evaluate(ast.l, env), 'and') && needBool(evaluate(ast.r, env), 'and');
    case 'or': return needBool(evaluate(ast.l, env), 'or') || needBool(evaluate(ast.r, env), 'or');
    case 'call': return call(ast.name, ast.args.map(x => evaluate(x, env)));
    case 'cmp': {
      const l = evaluate(ast.l, env), r = evaluate(ast.r, env);
      if (isList(l) || isList(r)) throw new ExprError(`"${ast.op}" cannot compare a list; use sum(), mean(), min(), max() or count() first.`);
      if (ast.op === '==') return l === r;
      if (ast.op === '!=') return l !== r;
      if (typeof l !== 'number' || typeof r !== 'number') throw new ExprError(`"${ast.op}" compares numbers (use == or != for text).`);
      return ast.op === '<' ? l < r : ast.op === '<=' ? l <= r : ast.op === '>' ? l > r : l >= r;
    }
    case 'bin': {
      const l = needNum(evaluate(ast.l, env), ast.op), r = needNum(evaluate(ast.r, env), ast.op);
      let v;
      switch (ast.op) {
        case '+': v = l + r; break;
        case '-': v = l - r; break;
        case '*': v = l * r; break;
        case '/': if (r === 0) throw new ExprError('Division by zero.'); v = l / r; break;
        case '%': if (r === 0) throw new ExprError('Division by zero.'); v = l % r; break;
        case '^': v = l ** r; break;
      }
      if (!Number.isFinite(v)) throw new ExprError('The result is not a finite number.');
      return v;
    }
  }
  throw new ExprError('Unsupported expression.');
}

// A map with no prototype: environments built from this cannot reach Object.prototype.
export const envOf = (obj = {}) => Object.assign(Object.create(null), obj);

export function compile(src) {
  const ast = parse(src);
  return { src, ast, ids: [...identifiers(ast)], run: env => evaluate(ast, env) };
}
export function evalExpr(src, env) { return evaluate(parse(src), env); }
