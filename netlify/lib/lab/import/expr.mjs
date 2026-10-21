// A small, safe parser for the simple logic expressions found in survey files: comparisons joined by
// and/or (&&, ||), with parentheses and not (!). Used for REDCap branching logic and LimeSurvey relevance.
// It evaluates nothing; it only builds a tree, which the caller turns into a lab displayIf tree.
// Anything outside this small language (function calls, arithmetic, smart variables) throws Unsupported.
import { andNodes, orNodes, negate, depthOf, MAX_DEPTH } from './common.mjs';

export class Unsupported extends Error { constructor(msg) { super(msg); this.name = 'Unsupported'; } }

const WORDS = { and: 'and', or: 'or', not: 'not', eq: '=', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=' };

export function tokenize(src, { brackets = false } = {}) {
  const t = [], s = String(src);
  if (s.length > 2000) throw new Unsupported('the expression is very long');
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { t.push({ k: ch }); i++; continue; }
    if (ch === '"' || ch === "'") {
      let j = i + 1, v = '';
      for (; j < s.length && s[j] !== ch; j++) v += s[j] === '\\' && j + 1 < s.length ? s[++j] : s[j];
      if (j >= s.length) throw new Unsupported('an unclosed quotation mark');
      t.push({ k: 'str', v }); i = j + 1; continue;
    }
    if (brackets && ch === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) throw new Unsupported('an unclosed bracket');
      if (s[j + 1] === '[') throw new Unsupported('a reference to another event or instrument');
      const inner = s.slice(i + 1, j).trim(), m = inner.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]*)\))?$/);
      if (!m) throw new Unsupported(`the reference [${inner.slice(0, 30)}]`);
      t.push({ k: 'var', v: m[1], sub: m[2] != null ? m[2].trim() : null }); i = j + 1; continue;
    }
    const num = s.slice(i).match(/^-?\d+(\.\d+)?(?![A-Za-z_])/);
    if (num && (t.length === 0 || t[t.length - 1].k === 'op' || t[t.length - 1].k === '(' || ['and', 'or', 'not'].includes(t[t.length - 1].k))) { t.push({ k: 'num', v: num[0] }); i += num[0].length; continue; }
    if (num) { t.push({ k: 'num', v: num[0] }); i += num[0].length; continue; }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<>', '>=', '<=', '&&', '||'].includes(two)) { t.push(two === '&&' ? { k: 'and' } : two === '||' ? { k: 'or' } : { k: 'op', v: two === '==' ? '=' : two === '<>' ? '!=' : two }); i += 2; continue; }
    if (ch === '=' || ch === '>' || ch === '<') { t.push({ k: 'op', v: ch }); i++; continue; }
    if (ch === '!') { t.push({ k: 'not' }); i++; continue; }
    const id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (id) {
      const w = id[0].toLowerCase();
      if (WORDS[w] === 'and' || WORDS[w] === 'or' || WORDS[w] === 'not') t.push({ k: WORDS[w] });
      else if (WORDS[w]) t.push({ k: 'op', v: WORDS[w] });
      else {
        let j = i + id[0].length;
        while (j < s.length && s[j] === ' ') j++;
        if (s[j] === '(') throw new Unsupported(`the function ${id[0]}()`);
        if (brackets) throw new Unsupported(`"${id[0]}" outside brackets`);
        t.push({ k: 'var', v: id[0].replace(/\.(NAOK|shown|value|valueNAOK)$/i, ''), sub: null });
      }
      i += id[0].length; continue;
    }
    throw new Unsupported(`the character "${ch}"`);
  }
  return t;
}

export function parseExpr(src, opts) {
  const t = tokenize(src, opts); let p = 0;
  const peek = () => t[p], next = () => t[p++];
  function expr() { const a = [and_()]; while (peek() && peek().k === 'or') { next(); a.push(and_()); } return a.length === 1 ? a[0] : { or: a }; }
  function and_() { const a = [unary()]; while (peek() && peek().k === 'and') { next(); a.push(unary()); } return a.length === 1 ? a[0] : { and: a }; }
  function unary() { if (peek() && peek().k === 'not') { next(); return { not: unary() }; } return primary(); }
  function primary() {
    const x = peek();
    if (!x) throw new Unsupported('the expression ends unexpectedly');
    if (x.k === '(') { next(); const e = expr(); if (!peek() || next().k !== ')') throw new Unsupported('a missing closing parenthesis'); return e; }
    const left = operand();
    const o = peek();
    if (!o || o.k !== 'op') { if (left.k === 'var') return { cmp: { left, op: 'truthy', right: null } }; throw new Unsupported('a value without a comparison'); }
    next();
    return { cmp: { left, op: o.v, right: operand() } };
  }
  function operand() { const x = next(); if (!x || !['var', 'str', 'num'].includes(x.k)) throw new Unsupported('something other than a variable or a value'); return x; }
  const out = expr();
  if (p < t.length) throw new Unsupported('extra text after the expression');
  return out;
}

// Tree -> displayIf node. leafFn({left, op, right}) returns a node (or throws Unsupported).
export function toDisplayIf(tree, leafFn) {
  const walk = n => {
    if (n.cmp) return leafFn(n.cmp);
    if (n.not) return negate(walk(n.not));
    const kids = (n.and || n.or).map(walk);
    let out = kids[0];
    for (const k of kids.slice(1)) { out = n.and ? andNodes(out, k) : orNodes(out, k); if (!out) throw new Unsupported('the logic is nested too deeply'); }
    return out;
  };
  const r = walk(tree);
  if (depthOf(r) > MAX_DEPTH) throw new Unsupported('the logic is nested too deeply');
  return r;
}
