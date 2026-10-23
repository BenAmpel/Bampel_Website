// Question and option order randomization (order.mjs): anchored options stay last, only ticked questions move and
// only within their page, the order is fixed per participant and session (a reload keeps it), every order occurs,
// the order shown is saved and exported for surveys and per-item questions, the codebook lists the order columns,
// and settings that would break display logic are refused.
import assert from 'node:assert/strict';
import * as O from '../../netlify/lib/lab/order.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { memStore } from './memstore.mjs';

const opt = (value, extra = {}) => ({ value, label: value.toUpperCase(), ...extra });
// ---------- pure parts ----------
const seen = new Set();
for (let i = 0; i < 300; i++) {
  const o = O.orderOptions([opt('a'), opt('other', { anchor: true }), opt('b'), opt('c'), opt('none', { anchor: true })], E.seeded('s' + i));
  assert.deepEqual(o.slice(-2).map(x => x.value), ['other', 'none'], 'anchored options last, in their listed order');
  seen.add(o.slice(0, 3).map(x => x.value).join(''));
}
assert.equal(seen.size, 6, 'all 6 orders of the other three options occur');
const qs = [
  { id: 'p1a', type: 'text', text: 'x', shuffle: true }, { id: 'p1fixed', type: 'text', text: 'x' }, { id: 'p1b', type: 'text', text: 'x', shuffle: true },
  { id: 'p2a', type: 'text', text: 'x', page: 2, shuffle: true }, { id: 'info', type: 'info', text: 'x', page: 2 }, { id: 'p2b', type: 'text', text: 'x', page: 2, shuffle: true },
  { id: 'pick', type: 'choice', text: 'x', page: 2, shuffleOptions: true, options: [opt('a'), opt('b'), opt('z', { anchor: true })] }
];
const orders = new Set();
for (let i = 0; i < 200; i++) {
  const r = O.randomizeQuestions(qs, E.seeded('q' + i)), ids = r.items.map(q => q.id);
  assert.equal(ids[1], 'p1fixed'); assert.equal(ids[4], 'info'); assert.equal(ids[6], 'pick', 'questions without "shuffle" keep their place');
  assert.deepEqual(new Set(ids.slice(0, 3)), new Set(['p1a', 'p1fixed', 'p1b'])); assert.deepEqual(new Set([ids[3], ids[5]]), new Set(['p2a', 'p2b']), 'questions stay on their page');
  assert.deepEqual(r.shown.questions, ids.filter(x => x !== 'info'));
  assert.equal(r.shown.options.pick.at(-1), 'z');
  orders.add(ids.join());
}
assert.equal(orders.size, 4, '2 orders on page 1 x 2 on page 2');
assert.deepEqual(O.randomizeQuestions(qs, E.seeded('same')).items.map(q => q.id), O.randomizeQuestions(qs, E.seeded('same')).items.map(q => q.id), 'the same seed, the same order');
assert.equal(qs[0].id, 'p1a', 'the content list is not changed');
assert.equal(O.randomizeQuestions([{ id: 'x', type: 'text', text: 't' }], E.seeded('n')).shown, null, 'nothing shuffled, nothing recorded');
assert.deepEqual(O.orderColumns({ questions: ['b', 'a'], options: { pick: ['y', 'x'] } }, { order_pick: 'answer' }), { order_questions: 'b|a', shown_order_pick: 'y|x' }, 'a column name already in use gets a prefix');
// refused settings
const errs = items => { const e = []; O.validateOrder(items, 'Q', e); return e; };
assert(errs([{ id: 'a', type: 'text', shuffleOptions: true }]).some(x => /only multiple-choice/.test(x)));
assert(errs([{ id: 'a', type: 'choice', text: 'x', options: [opt('a'), opt('b')] }, { id: 'b', type: 'text', text: 'x', shuffle: true, displayIf: { q: 'a', op: 'eq', value: 'a' } }]).some(x => /cannot use display logic or piped text from "a"/.test(x)));
assert(errs([{ id: 'a', type: 'text', text: 'x', shuffle: true }, { id: 'b', type: 'text', text: 'Re {{q:a}}' }]).some(x => /"b" on the same page depends on this question/.test(x)));
assert.deepEqual(errs([{ id: 'a', type: 'text', text: 'x', page: 1 }, { id: 'b', type: 'text', text: 'Re {{q:a}}', page: 2, shuffle: true }]), [], 'a question on an earlier page is fine');
assert(errs([{ id: 'a', type: 'choice', text: 'x', shuffleOptions: true, options: [opt('a', { anchor: true }), opt('b', { anchor: true })] }]).some(x => /nothing would be shuffled/.test(x)));
console.log('order: anchors, page-bound shuffles, every order occurs, refused settings');

// ---------- through the engine ----------
const type = TYPES.vignettes, store = memStore(), S = { store, type, study: { id: 'ord', name: 'Order', type: 'vignettes', codePrefix: 'OR' } };
const c = C.defaultContent(type);
c.survey.pre = [
  { id: 'q_one', type: 'text', text: 'One', shuffle: true, sessions: [1], conditions: [], showIf: 'always' },
  { id: 'q_two', type: 'text', text: 'Two', shuffle: true, sessions: [1], conditions: [], showIf: 'always' },
  { id: 'q_three', type: 'text', text: 'Three', shuffle: true, sessions: [1], conditions: [], showIf: 'always' },
  { id: 'fav', type: 'choice', text: 'Pick', shuffleOptions: true, sessions: [1], conditions: [], showIf: 'always', options: [opt('a'), opt('b'), opt('c'), opt('none', { anchor: true })] }
];
const iq = c.questions.find(q => q.options && q.options.length >= 3);
assert(iq, 'the default item questions include a multiple-choice question'); iq.shuffleOptions = true;
const saved = await C.saveContent(store, type, c, 'T', 0);
assert.equal(saved.version, 1, JSON.stringify(saved.errors));
const firsts = new Set();
for (let i = 0; i < 12; i++) {
  const [p] = (await E.createParticipants(S, 1, { gapDays: 0 })).created;
  await E.consent(S, p.code, true);
  const plan = await E.startSession(S, p.code), again = await E.startSession(S, p.code);
  assert.deepEqual(again.preItems.map(q => q.id), plan.preItems.map(q => q.id), 'a reload shows the same order');
  assert.equal(plan.preItems.find(q => q.id === 'fav').options.at(-1).value, 'none');
  firsts.add(plan.preItems[0].id);
  assert((await E.saveSurvey(S, p.code, 1, 'pre', { q_one: '1', q_two: '2', q_three: '3', fav: 'b' })).ok);
  const ans = Object.fromEntries(plan.questions.filter(q => q.type !== 'info').map(q => [q.id, q.type === 'scale' ? '1' : q.options ? q.options[0].value : 'x']));
  assert((await E.saveTrial(S, p.code, 1, plan.trials[0].index, { answers: ans, rtMs: 500 })).ok);
  const rec = await store.get(`data/${p.code}/s1/survey-pre`);
  assert.deepEqual(rec.shown.questions, plan.preItems.map(q => q.id), 'the order shown is saved with the answers');
}
assert(firsts.size >= 2, 'different participants see different orders');
const srows = await E.exportRows(S, 'surveys'), trows = await E.exportRows(S, 'trials');
assert(srows.every(r => /^q_(one|two|three)\|q_(one|two|three)\|q_(one|two|three)\|fav$/.test(r.order_questions) && /\|none$/.test(r.order_fav)), JSON.stringify(srows[0]));
assert(trows.every(r => r[`order_${iq.id}`].split('|').length === iq.options.length), 'per-item question options too');
const book = buildCodebook(S, await C.getContent(store, type)).map(x => `${x.file}:${x.column}`);
for (const col of ['surveys:order_questions', 'surveys:order_fav', `trials:order_${iq.id}`]) assert(book.includes(col), col);
console.log('engine: fixed per participant, saved with the answers, exported, in the codebook');
