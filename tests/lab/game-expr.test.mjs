// The payoff expression evaluator: precedence, functions, errors, and no way out to globals.
import assert from 'node:assert/strict';
import { parse, evaluate, evalExpr, envOf, identifiers, ExprError, compile } from '../../netlify/lib/lab/game/expr.mjs';

const env = envOf({ a: 3, b: 4, n: 4, endowment: 20, mpcr: 0.4, s: 'C', t: true,
  my: envOf({ contribution: 5, move: 'D' }), others: envOf({ contribution: [1, 2, 3], move: ['C', 'D', 'C'] }), role: envOf({ sender: envOf({ send: 6 }) }), other: envOf({ move: 'C' }) });
const ev = src => evalExpr(src, env);

// precedence and associativity
assert.equal(ev('2 + 3 * 4'), 14);
assert.equal(ev('(2 + 3) * 4'), 20);
assert.equal(ev('10 - 4 - 3'), 3);
assert.equal(ev('100 / 10 / 5'), 2);
assert.equal(ev('2 ^ 3 ^ 2'), 512, 'power is right associative');
assert.equal(ev('-2 ^ 2'), -4, 'power binds tighter than unary minus');
assert.equal(ev('2 ^ -1'), 0.5);
assert.equal(ev('7 % 4'), 3);
assert.equal(ev('a + b * a ^ 2'), 3 + 4 * 9);
assert.equal(ev('1 + 2 < 4 and 3 > 2'), true);
assert.equal(ev('not (a == 3)'), false);
assert.equal(ev('!(a == 3) || b == 4'), true);
assert.equal(ev('a > 2 ? a * 10 : 0'), 30);
assert.equal(ev('a > 5 ? 1 : a > 2 ? 2 : 3'), 2, 'ternary is right associative');
// the payoffs the presets use
assert.equal(ev('endowment - my.contribution + mpcr * (my.contribution + sum(others.contribution))'), 20 - 5 + 0.4 * 11);
assert.equal(ev("my.move == 'C' ? (other.move == 'C' ? 3 : 0) : (other.move == 'C' ? 5 : 1)"), 5);
assert.equal(ev('3 * role.sender.send - 2'), 16);
// functions
assert.equal(ev('min(1, 2, 3)'), 1); assert.equal(ev('max(others.contribution)'), 3); assert.equal(ev('max(others.contribution, 10)'), 10);
assert.equal(ev('abs(-3.5)'), 3.5); assert.equal(ev('floor(2.9)'), 2); assert.equal(ev('ceil(2.1)'), 3); assert.equal(ev('round(2.5)'), 3); assert.equal(ev('round(2.345, 2)'), 2.35);
assert.equal(ev('sum(others.contribution)'), 6); assert.equal(ev('mean(others.contribution)'), 2); assert.equal(ev('sqrt(16)'), 4);
assert.equal(ev('count(others.move)'), 3); assert.equal(ev("count(others.move, 'C')"), 2); assert.equal(ev("num('12.5') + 1"), 13.5);
// errors have readable messages
const err = src => { try { ev(src); } catch (e) { assert(e instanceof ExprError, `${src}: ${e.constructor.name}`); return e.message; } assert.fail('no error for ' + src); };
assert.match(err('1 / 0'), /Division by zero/);
assert.match(err('foo + 1'), /Unknown name "foo"/);
assert.match(err('my.nothing'), /Unknown name/);
assert.match(err('my'), /group of values/);
assert.match(err("a + s"), /needs numbers/);
assert.match(err("s < 'D'"), /compares numbers/);
assert.match(err('1 < 2 < 3'), /chained/);
assert.match(err('a = 3'), /Use ==/);
assert.match(err('frob(1)'), /Unknown function/);
assert.match(err('(1 + 2'), /closing/);
assert.match(err('1 +'), /ends too early/);
assert.match(err('1 2'), /Unexpected/);
assert.match(err('"abc'), /closing quote/);
assert.match(err('sum(5, s)'), /needs numbers/);
assert.match(err('others.contribution + 1'), /needs numbers/);
assert.match(err('min()'), /empty/);
assert.match(err('sqrt(-1)'), /negative/);
assert.match(err('10 ^ 1000'), /finite/);
assert.match(err('a ? 1 : 2'), /true\/false/);
assert.match(err('1 # 2'), /Unexpected "#"/);
// identifiers() lists every name, for validation against the declared decisions
assert.deepEqual([...identifiers(parse('endowment - my.x + sum(others.y) + role.r.z'))].sort(), ['endowment', 'my.x', 'others.y', 'role.r.z']);
// no access to globals or the prototype chain
for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'globalThis', 'process', 'process.env', 'require', 'Function', 'eval', 'this', 'window',
  'my.__proto__', 'my.constructor', 'others.contribution.length', 'others.contribution.constructor', 'a.constructor.constructor', 'a.toString', 'Object.keys']) {
  assert.throws(() => ev(bad), ExprError, bad);
}
assert.throws(() => ev('(function(){})()'), ExprError);
assert.throws(() => ev('a["constructor"]'), ExprError);
assert.throws(() => ev('`x`'), ExprError);
assert.throws(() => ev('a.b.c.d.e'), ExprError);
assert.equal(Object.getPrototypeOf(envOf({})), null, 'environments have no prototype');
// a prototype-polluted global does not leak into evaluation
Object.prototype.injected = 42;
try { assert.throws(() => ev('injected'), ExprError); assert.throws(() => evalExpr('injected', envOf({})), ExprError); } finally { delete Object.prototype.injected; }
// limits
assert.throws(() => parse('1+'.repeat(1100) + '1'), /longer than|too long/);
assert.throws(() => parse('('.repeat(60) + '1' + ')'.repeat(60)), /nested too deeply/);
assert.throws(() => parse('1+'.repeat(400) + '1'), /too long/);
assert.throws(() => parse(42), ExprError);
// compile() keeps the names for later checks
assert.deepEqual(compile('a + my.x').ids.sort(), ['a', 'my.x']);
console.log('expression evaluator: precedence, functions, errors, no globals or prototype access, limits');
console.log('ALL EXPRESSION TESTS PASSED');
