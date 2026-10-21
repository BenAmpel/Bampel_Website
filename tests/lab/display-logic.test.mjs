// Survey logic: display rules (answer, embedded data, condition tests), piped text, validation, and the rule that
// the server drops answers to hidden questions. The server (netlify/lib/lab/logic.mjs) and the browser
// (static/lab/engine/logic.js) must agree on every case in the table.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as S from '../../netlify/lib/lab/logic.mjs';
import { cleanAnswers } from '../../netlify/lib/lab/engine.mjs';
import { validateQuestions, QUESTION_TYPES } from '../../netlify/lib/lab/content.mjs';
const B = createRequire(import.meta.url)('../../static/lab/engine/logic.js');

// ---------- evaluation table: [node, env, expected] ----------
const q = (id, op, value) => ({ q: id, op, ...(value !== undefined ? { value } : {}) });
const cases = [
  [q('a', 'eq', 'x'), { answers: { a: 'x' } }, true],
  [q('a', 'eq', 'x'), { answers: { a: 'y' } }, false],
  [q('a', 'eq', 'x'), { answers: {} }, false],
  [q('a', 'neq', 'x'), { answers: {} }, true],
  [q('a', 'neq', 'x'), { answers: { a: 'x' } }, false],
  [q('a', 'neq', 'x'), { answers: { a: 'y' } }, true],
  [q('a', 'eq', 3), { answers: { a: '3' } }, true],
  [q('a', 'in', ['x', 'y']), { answers: { a: 'y' } }, true],
  [q('a', 'in', ['x', 'y']), { answers: { a: 'z' } }, false],
  [q('a', 'notIn', ['x', 'y']), { answers: { a: 'z' } }, true],
  [q('a', 'notIn', ['x', 'y']), { answers: {} }, true],
  [q('a', 'gt', 5), { answers: { a: '6' } }, true],
  [q('a', 'gt', 5), { answers: { a: '5' } }, false],
  [q('a', 'gte', 5), { answers: { a: '5' } }, true],
  [q('a', 'lt', 5), { answers: { a: '4.5' } }, true],
  [q('a', 'lte', 5000), { answers: { a: '1,000' } }, true],
  [q('a', 'lt', 5), { answers: { a: 'abc' } }, false],
  [q('a', 'lt', 5), { answers: {} }, false],
  [q('a', 'answered'), { answers: { a: ' ' } }, false],
  [q('a', 'answered'), { answers: { a: '0' } }, true],
  [q('a', 'answered'), { answers: { a: [] } }, false],
  [q('a', 'notAnswered'), { answers: {} }, true],
  [q('m', 'eq', 'b'), { answers: { m: ['a', 'b'] } }, true],          // select-all: eq means "includes"
  [q('m', 'eq', 'c'), { answers: { m: ['a', 'b'] } }, false],
  [q('m', 'neq', 'c'), { answers: { m: ['a', 'b'] } }, true],
  [q('m', 'neq', 'a'), { answers: { m: ['a', 'b'] } }, false],
  [q('m', 'in', ['c', 'b']), { answers: { m: ['a', 'b'] } }, true],
  [q('m', 'notIn', ['c', 'd']), { answers: { m: ['a', 'b'] } }, true],
  [q('m', 'gt', 1), { answers: { m: ['5'] } }, false],
  [{ ed: 'pid', op: 'eq', value: 'abc' }, { ed: { pid: 'abc' } }, true],
  [{ ed: 'pid', op: 'eq', value: 'abc' }, { ed: {} }, false],
  [{ ed: 'pid', op: 'notAnswered' }, { ed: {} }, true],
  [{ ed: 'pid', op: 'answered' }, { ed: { pid: 'x' } }, true],
  [{ condition: 'c1', op: 'eq' }, { condition: 'c1' }, true],
  [{ condition: 'c1', op: 'eq' }, { condition: 'c2' }, false],
  [{ condition: 'c1', op: 'neq' }, { condition: 'c2' }, true],
  [{ const: false }, {}, false],
  [{ all: [q('a', 'eq', 'x'), q('b', 'eq', 'y')] }, { answers: { a: 'x', b: 'y' } }, true],
  [{ all: [q('a', 'eq', 'x'), q('b', 'eq', 'y')] }, { answers: { a: 'x', b: 'z' } }, false],
  [{ any: [q('a', 'eq', 'x'), q('b', 'eq', 'y')] }, { answers: { b: 'y' } }, true],
  [{ any: [q('a', 'eq', 'x'), q('b', 'eq', 'y')] }, { answers: {} }, false],
  [{ all: [{ any: [q('a', 'eq', 'x'), q('a', 'eq', 'z')] }, { ed: 'pid', op: 'eq', value: 'p' }] }, { answers: { a: 'z' }, ed: { pid: 'p' } }, true],
  [{ all: [{ any: [q('a', 'eq', 'x'), q('a', 'eq', 'z')] }, { ed: 'pid', op: 'eq', value: 'p' }] }, { answers: { a: 'z' }, ed: { pid: 'q' } }, false],
  [undefined, {}, true]
];
for (const [node, env, want] of cases) {
  assert.equal(S.evalDisplay(node, env), want, 'server ' + JSON.stringify([node, env]));
  assert.equal(B.evalDisplay(node, env), want, 'browser ' + JSON.stringify([node, env]));
}

// resolve(): a hidden question loses its answer before later rules are read; pages are ordered
const items = [
  { id: 'later', type: 'text', page: 2, displayIf: q('gate', 'eq', 'yes') },
  { id: 'gate', type: 'choice', page: 1, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  { id: 'chain', type: 'text', page: 3, displayIf: q('later', 'answered') },
  { id: 'note', type: 'info', page: 1, text: 'x' }
];
for (const impl of [S, B]) {
  assert.deepEqual(impl.orderItems(items).map(i => i.id), ['gate', 'note', 'later', 'chain']);
  let r = impl.resolve(items, { gate: 'yes', later: 'a', chain: 'b' }, {});
  assert.deepEqual(r.answers, { gate: 'yes', later: 'a', chain: 'b' }); assert.deepEqual(r.hidden, {});
  r = impl.resolve(items, { gate: 'no', later: 'a', chain: 'b' }, {});
  assert.deepEqual(r.answers, { gate: 'no' }, 'hiding "later" also hides "chain", which depends on it'); assert.deepEqual(r.hidden, { later: true, chain: true });
  r = impl.resolve([items[0]], { later: 'a' }, {}, { gate: 'yes' });   // seed: answers from earlier pages
  assert.deepEqual(r.answers, { gate: 'yes', later: 'a' });
}

// plain-words description and piped text: same output on both sides
const tree = { all: [q('gate', 'in', ['yes', 'maybe']), { any: [{ ed: 'pid', op: 'notAnswered' }, { condition: 'c1', op: 'neq' }, q('multi', 'eq', 'b')] }] };
const opt = [{ id: 'gate', type: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }] }, { id: 'multi', type: 'multi', options: [{ value: 'b', label: 'Bee' }] }];
assert.equal(S.describe(tree, opt), B.describe(tree, opt));
assert.equal(S.describe(tree, opt), 'gate is one of "Yes", "Maybe" and (embedded data pid was not answered or the participant\'s condition is not "c1" or multi includes "Bee")');
const look = (kind, name) => (kind === 'q' ? { a: 'Ann', b: undefined }[name] : 'P1');
assert.equal(S.fillPipes('Hi {{q:a}}, {{q:b}}! id {{ed:pid}} {{q:Bad}} {{x}}', look), 'Hi Ann, ! id P1 {{q:Bad}} {{x}}');
assert.equal(B.fillPipes('Hi {{q:a}}, {{q:b}}! id {{ed:pid}} {{q:Bad}} {{x}}', look), S.fillPipes('Hi {{q:a}}, {{q:b}}! id {{ed:pid}} {{q:Bad}} {{x}}', look));
assert.equal(S.fillPipes('<b>{{q:a}}</b>', () => '<script>x</script>'), '<b><script>x</script></b>', 'the helper does not escape; the browser inserts it with textContent (participant.js)');

// public copy: condition tests are settled on the server, so the browser never learns condition names
const pub = S.publicQuestions([{ id: 'x', displayIf: { all: [{ condition: 'secret_a', op: 'eq' }, q('a', 'eq', '1')] } }, { id: 'y' }], 'secret_a');
assert.deepEqual(pub[0].displayIf, { all: [{ const: true }, q('a', 'eq', '1')] });
assert(!JSON.stringify(S.publicQuestions([{ id: 'x', displayIf: { condition: 'secret_a', op: 'neq' } }], 'secret_b')).includes('secret'));
assert.equal(pub[1].displayIf, undefined);

// ---------- server drops answers to hidden questions ----------
const survey = [
  { id: 'smoker', type: 'choice', options: [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }], page: 1 },
  { id: 'packs', type: 'number', page: 1, displayIf: q('smoker', 'eq', 'y') },
  { id: 'why', type: 'text', page: 2, displayIf: q('packs', 'gt', 0) },
  { id: 'intro', type: 'info', text: 'Hello', page: 1 },
  { id: 'only_b', type: 'text', page: 2, displayIf: { condition: 'b', op: 'eq' } },
  { id: 'by_pid', type: 'text', page: 2, displayIf: { ed: 'pid', op: 'eq', value: 'p1' } },
  { id: 'drinks', type: 'multi', page: 2, options: [{ value: 'w', label: 'W' }, { value: 'b', label: 'B' }], displayIf: { any: [q('smoker', 'eq', 'n'), q('packs', 'lt', 1)] } }
];
const all = { smoker: 'y', packs: '2', why: 'habit', intro: 'ignored', only_b: 'x', by_pid: 'z', drinks: ['w', 'zzz'] };
assert.deepEqual(cleanAnswers(all, survey, { condition: 'b', embedded: { pid: 'p1' } }), { smoker: 'y', packs: '2', why: 'habit', only_b: 'x', by_pid: 'z' },
  'info has no answer; "drinks" is hidden (smoker y, packs 2); the others are shown');
assert.deepEqual(cleanAnswers(all, survey, { condition: 'a', embedded: { pid: 'zz' } }), { smoker: 'y', packs: '2', why: 'habit' }, 'condition and embedded-data rules hide answers');
assert.deepEqual(cleanAnswers({ ...all, smoker: 'n' }, survey, { condition: 'a', embedded: {} }), { smoker: 'n', drinks: ['w'] }, 'a hidden question drops its answer, and so does everything that depends on it');
assert.deepEqual(cleanAnswers({ smoker: 'n', packs: '3' }, [survey[0], survey[1]]), { smoker: 'n' }, 'no ctx: still enforced');
assert.deepEqual(cleanAnswers({ a: 'x' }, [{ id: 'a', type: 'text' }]), { a: 'x' }, 'questions without rules work as before');

// ---------- validation ----------
const validate = (list, extra = {}) => { const e = []; validateQuestions(list, 'Q', e, { nSessions: 1, conditions: ['a', 'b'], rules: [], embedded: ['pid'], ...extra }); return e; };
const base = [
  { id: 'p', text: 'P', type: 'choice', options: [{ value: 'y', label: 'Y' }, { value: 'n', label: 'N' }], sessions: [1], page: 1 },
  { id: 's', text: 'S', type: 'scale', n: 5, sessions: [1], page: 2 }
];
const withRule = (rule, over = {}) => [...base, { id: 'z', text: 'Z', type: 'text', sessions: [1], page: 2, displayIf: rule, ...over }];
assert.deepEqual(validate(withRule(q('p', 'eq', 'y'))), []);
assert.deepEqual(validate(withRule({ all: [q('p', 'eq', 'y'), { any: [q('s', 'gte', 3), { ed: 'pid', op: 'answered' }] }, { condition: 'a', op: 'eq' }] })), []);
assert(validate(withRule(q('nope', 'eq', 'y'))).some(m => /not a question in this list/.test(m)));
assert(validate(withRule(q('z', 'answered'))).some(m => /does not come earlier/.test(m)), 'a question cannot depend on itself');
assert(validate([{ ...base[0], displayIf: q('s', 'eq', '3') }, base[1]]).some(m => /does not come earlier/.test(m)), 'no rule may point at a later page');
assert(validate([{ ...base[0], page: 2 }, { ...base[1], page: 1, displayIf: q('p', 'eq', 'y') }]).some(m => /does not come earlier/.test(m)), 'page numbers decide order, not list position');
assert.deepEqual(validate([{ ...base[0], page: 2 }, { ...base[1], page: 1, displayIf: undefined }, { id: 'z', text: 'Z', type: 'text', sessions: [1], page: 3, displayIf: q('p', 'eq', 'y') }]), []);
assert(validate(withRule(q('p', 'eq', 'maybe'))).some(m => /not one of the options/.test(m)));
assert(validate(withRule(q('s', 'eq', '9'))).some(m => /not a point on the 5-point scale/.test(m)));
assert(validate(withRule({ ed: 'unknown', op: 'eq', value: 'x' })).some(m => /embedded data "unknown"/.test(m)));
assert(validate(withRule({ condition: 'zzz', op: 'eq' })).some(m => /unknown condition/.test(m)));
assert(validate(withRule({ condition: 'a', op: 'gt' })).some(m => /must be "eq" or "neq"/.test(m)));
assert(validate(withRule(q('p', 'bogus', 'y'))).some(m => /unknown display operator/.test(m)));
assert(validate(withRule({ q: 'p', ed: 'pid', op: 'eq', value: 'y' })).some(m => /names one question/.test(m)));
assert(validate(withRule({ all: [] })).some(m => /1 to 20 conditions/.test(m)));
assert(validate(withRule({ all: [{ all: [{ all: [q('p', 'eq', 'y')] }] }] })).some(m => /one level deep/.test(m)));
assert(validate(withRule(q('s', 'gt', 'abc'))).some(m => /not a number/.test(m)));
assert(validate(withRule(q('p', 'eq'))).some(m => /needs a value/.test(m)));
assert(validate([{ id: 'i', text: 'Info', type: 'info', sessions: [1] }, { id: 'z', text: 'Z', type: 'text', sessions: [1], displayIf: q('i', 'answered') }]).some(m => /no answer/.test(m)));
assert(QUESTION_TYPES.includes('info'));
assert.deepEqual(validate([{ id: 'i', text: 'Read this.', type: 'info', sessions: [1], required: true }]), [], 'info needs only text; "required" is ignored');
// piped text
assert.deepEqual(validate([base[0], { id: 'z', text: 'You said {{q:p}} for {{ed:pid}}', type: 'text', sessions: [1], page: 2 }]), []);
assert(validate([base[0], { id: 'z', text: 'x {{q:nope}}', type: 'text', sessions: [1] }]).some(m => /does not exist/.test(m)));
assert(validate([{ id: 'z', text: 'x {{q:later}}', type: 'text', sessions: [1] }, { id: 'later', text: 'L', type: 'text', sessions: [1] }]).some(m => /earlier question/.test(m)));
assert(validate([base[0], { id: 'z', text: 'x {{ed:nope}}', type: 'text', sessions: [1] }]).some(m => /embedded data that is not defined/.test(m)));
assert.deepEqual(validate([base[0], { id: 'z', text: 'Pick', type: 'choice', options: [{ value: 'a', label: 'Not {{q:p}}' }, { value: 'b', label: 'B' }], sessions: [1], page: 2 }]), [], 'piping works in option labels');
// layout and answer-box fields
assert.deepEqual(validate([{ id: 'a1', text: 'A', type: 'text', long: true, group: 'grp', groupText: 'Heading', source: 'row 3', sessions: [1] }, { id: 'n1', text: 'N', type: 'number', min: 0, max: 10, sessions: [1] }]), []);
assert(validate([{ id: 'a1', text: 'A', type: 'text', group: 'Bad Group', sessions: [1] }]).some(m => /group ID/.test(m)));
assert(validate([{ id: 'n1', text: 'N', type: 'number', min: 5, max: 1, sessions: [1] }]).some(m => /minimum is above/.test(m)));
console.log('display logic: evaluation table (server = browser), resolve order, public copy, hidden answers dropped, validation, piped text');


// ---------- scale numbering, own properties, per-item pages ----------
{
  const zero = { id: 's0', type: 'scale', n: 11, start: 0 };
  assert.deepEqual(cleanAnswers({ s0: '0' }, [zero]), { s0: '0' }); assert.deepEqual(cleanAnswers({ s0: '10' }, [zero]), { s0: '10' }); assert.deepEqual(cleanAnswers({ s0: '11' }, [zero]), {}); assert.deepEqual(cleanAnswers({ s0: '-1' }, [zero]), {});
  assert.deepEqual(cleanAnswers({ s1: '0' }, [{ id: 's1', type: 'scale', n: 5 }]), {}, 'no start: points are 1 to n as before');
  assert.deepEqual(cleanAnswers({ s1: '5' }, [{ id: 's1', type: 'scale', n: 5 }]), { s1: '5' });
  assert.deepEqual(validate([{ id: 's0', text: 'S', type: 'scale', n: 11, start: 0, sessions: [1] }]), []);
  assert(validate([{ id: 's0', text: 'S', type: 'scale', n: 11, start: 95, sessions: [1] }]).some(m => /between -10 and 100/.test(m)));
  assert(validate([{ id: 's0', text: 'S', type: 'scale', n: 5, start: -11, sessions: [1] }]).length);
  assert(validate([{ id: 's0', text: 'S', type: 'scale', n: 5, start: 1.5, sessions: [1] }]).length);
  const zl = [{ ...zero, text: 'S', sessions: [1] }, { id: 'z', text: 'Z', type: 'text', sessions: [1], displayIf: q('s0', 'eq', '0') }];
  assert.deepEqual(validate(zl), [], 'a rule can use the first number');
  assert(validate([zl[0], { ...zl[1], displayIf: q('s0', 'eq', '11') }]).some(m => /not a point/.test(m)));
  assert.deepEqual(cleanAnswers(Object.create({ constructor: 'x' }), [{ id: 'constructor', type: 'text' }]), {}, 'inherited names are never read');
  assert.equal(S.evalDisplay({ q: 'constructor', op: 'answered' }, { answers: {} }), false); assert.equal(B.evalDisplay({ q: 'constructor', op: 'answered' }, { answers: {} }), false);
  assert.equal(S.evalDisplay({ ed: 'toString', op: 'answered' }, { ed: {} }), false); assert.equal(B.evalDisplay({ ed: 'toString', op: 'answered' }, { ed: {} }), false);
  assert(validate([{ id: 'constructor', text: 'x', type: 'text', sessions: [1] }]).some(m => /reserved/.test(m)));
  assert(validate([{ id: 'a', text: 'x', type: 'text', page: 2 }], { allowSessions: false }).some(m => /cannot have a page number/.test(m)), 'per-item questions reject page');
  assert.deepEqual(validate([{ id: 'a', text: 'x', type: 'text' }], { allowSessions: false }), []);
}
// malformed content never throws from the validator
assert.doesNotThrow(() => validate([{ id: 'a', text: 'A', type: 'choice', options: 'oops', labels: 'x', displayIf: 'bad', sessions: [1] }, { id: 'b', text: 'B', type: 'text', displayIf: { all: 'x' }, sessions: [1] }]));
console.log('ALL DISPLAY LOGIC TESTS PASSED');
