// The integrity report (integrity.mjs and the admin route "integrity"), in both modes, with seeded people:
//   quiz   honest students raise nothing; a paster, a student away from the tab on a hard question they then got
//          right, and a scripted one are each named with the right reason; two colluders who share rare wrong answers
//          and answer in lockstep come out as a pair, and no honest pair does
//   study  honest participants raise nothing; a bot (automation and the hidden box) is named; two participants with
//          identical answers come out as a pair
// Also: the route needs a manager, each view goes in the activity log, and the report never carries answers or times.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { blobsFactory } from './import-helpers.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';

const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key = OWNER } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const realNow = Date.now;
async function at(t, fn) { Date.now = () => t; try { return await fn(); } finally { Date.now = realNow; } }

// ---------- quiz ----------
assert((await call('/api/lab/_lab/create', { body: { id: 'int-quiz', name: 'Integrity quiz', template: 'graded-quiz' } })).json.ok);
const QA = '/api/lab/int-quiz/admin/', QP = '/api/lab/int-quiz/';
const keys = Object.fromEntries((await call(QA + 'content')).json.quiz.items.map(it => [it.id, it]));
// Each student opens the quiz at their own (simulated) time, so the server's 15-minute clock starts then.
async function student(label, start) {
  const code = (await call(QA + 'create', { body: { count: 1, label } })).json.created[0].code;
  const token = (await call(QP + 'login', { key: null, body: { code } })).json.token;
  await call(QP + 'consent', { key: null, body: { token, agree: true } });
  const plan = (await at(start, () => call(QP + 'session', { key: null, body: { token } }))).json;
  assert(plan.trials, JSON.stringify(plan));
  return { code, token, start, plan };
}
const shown = (t, id, opt) => t.q.options.indexOf(keys[id].options[opt]);
const kindOf = t => t.q.kind;
const human = (extra = {}) => ({ traces: { traceVersion: '0.3.1', durationMs: 20000, keystrokes: 4, deletions: 1, pastes: 0, pasteChars: 0, hiddenMs: 0, windowBlurs: 0, untrustedInputs: 0, unpressedClicks: 0, firstAnswerMs: 6000, ...extra } });
// Everyone answers q1 right, q2 wrong (the usual mistake: all four ticked), q3 right, and writes q4 by hand.
function answers(t, who) {
  const k = kindOf(t);
  if (k === 'single') return who.q1 != null ? { choice: shown(t, 'q1', who.q1) } : { choice: shown(t, 'q1', keys.q1.answer) };
  if (k === 'multi') return who.q2 ? { choices: keys.q2.answer.map(a => t.q.options.indexOf(keys.q2.options[a])) } : { choices: [0, 1, 2, 3] };
  if (k === 'number') return { number: who.q3 != null ? who.q3 : 37.6 };
  return { text: 'A breach at one site unlocks the others.' };
}
// Students answer in the order on their own screen; colluders (together: true) work through the same questions at the
// same moments, whatever order each screen shows them in.
const KIND_ORDER = ['single', 'multi', 'number', 'text'];
async function take(s, who = {}, gap = 30000) {
  for (const [i, t] of s.plan.trials.entries()) {
    const k = kindOf(t), tr = (who.traces || {})[k] || {}, step = who.together ? KIND_ORDER.indexOf(k) : i;
    const r = await at(s.start + (step + 1) * gap, () => call(QP + 'trial', { key: null, body: { token: s.token, session: 1, index: t.index, data: { rtMs: tr.rt || 25000, ...answers(t, who), ...human(tr) } } }));
    assert(r.json.ok, JSON.stringify(r.json));
  }
}
const T0 = realNow() + 60000;   // after every participant record below is created
const honest = [];
for (let i = 0; i < 6; i++) { const s = await student('honest' + i, T0 + i * 7 * 60000); honest.push(s); await take(s); }
const paster = await student('paster', T0 + 50 * 60000); await take(paster, { traces: { text: { pastes: 1, pasteChars: 300, keystrokes: 0 } } });
const away = await student('away', T0 + 60 * 60000); await take(away, { q2: true, traces: { multi: { hiddenMs: 30000, windowBlurs: 1 } } });
const bot = await student('scripted', T0 + 70 * 60000); await take(bot, { traces: { single: { untrustedInputs: 4 } } });
const wrong1 = keys.q1.answer === 0 ? 2 : 0;   // an uncommon wrong option
const colA = await student('colluder_a', T0 + 80 * 60000), colB = await student('colluder_b', T0 + 80 * 60000 + 4000);
await take(colA, { q1: wrong1, q3: 99, together: true }); await take(colB, { q1: wrong1, q3: 99, together: true });

assert([401, 403].includes((await call(QA + 'integrity', { key: null })).status), 'needs a signed-in manager');
const rep = (await call(QA + 'integrity')).json;
assert.equal(rep.mode, 'quiz'); assert.equal(rep.counts.people, 11);
const by = Object.fromEntries(rep.people.map(p => [p.name, p]));
assert(!rep.people.some(p => /^honest/.test(p.name)), `honest students raise nothing: ${JSON.stringify(rep.people.filter(p => /^honest/.test(p.name)))}`);
assert(by.paster.reasons.some(r => r.level === 'strong' && /Pasted 300 characters into q4/.test(r.text)), JSON.stringify(by.paster));
assert(by.away.reasons.some(r => /Away from the quiz for 30 s during q2, then answered it correctly/.test(r.text)), JSON.stringify(by.away));
assert(by.scripted.reasons.some(r => r.level === 'strong' && /made by a program/.test(r.text)), JSON.stringify(by.scripted));
assert(rep.people[0].strong >= 1, 'strong reasons first');
const pair = rep.pairs.find(p => [p.aName, p.bName].sort().join() === 'colluder_a,colluder_b');
assert(pair, JSON.stringify(rep.pairs));
assert(pair.reasons.some(r => /same uncommon wrong answer on 2 questions/.test(r)) && pair.reasons.some(r => /within 10 seconds/.test(r)), JSON.stringify(pair));
assert.equal(rep.pairs.length, 1, `only the colluders pair up: ${JSON.stringify(rep.pairs)}`);
assert(!/"answers"|"times"/.test(JSON.stringify(rep)), 'no answers or times in the report');
assert.match(rep.cannotSee.join(' '), /phone/);
const log = (await call(QA + 'activity')).json;
assert((Array.isArray(log) ? log : log.entries || []).some(e => e.action === 'integrity.view'), `each view is in the activity log: ${JSON.stringify(log).slice(0, 300)}`);
console.log('quiz: paster, away-then-right, scripted named; colluders pair; honest students and pairs clear; manager only; logged');

// ---------- study ----------
assert((await call('/api/lab/_lab/create', { body: { id: 'int-study', name: 'Integrity study', template: 'survey' } })).json.ok);
const SA = '/api/lab/int-study/admin/', SP = '/api/lab/int-study/';
const sc = (await call(SA + 'content')).json, clean = Object.fromEntries(Object.entries(sc).filter(([k]) => !k.startsWith('_')));
for (let i = 1; i <= 12; i++) clean.survey.pre.push({ id: `extra${i}`, text: `Statement ${i}`, type: 'scale', n: 7, lo: 'Low', hi: 'High', labels: ['1', '2', '3', '4', '5', '6', '7'], required: false, showIf: 'always', conditions: [], sessions: [1], page: 4 });
const saved = (await call(SA + 'content-save', { body: { content: clean, baseVersion: sc.version } })).json;
assert(saved.ok, JSON.stringify(saved));
async function participant(label, data, dq) {
  const code = (await call(SA + 'create', { body: { count: 1, label } })).json.created[0].code;
  const token = (await call(SP + 'login', { key: null, body: { code } })).json.token;
  await call(SP + 'consent', { key: null, body: { token, agree: true } });
  await call(SP + 'session', { key: null, body: { token } });
  if (dq) assert((await call(SP + 'dq', { key: null, body: { token, session: 1, data: dq } })).json.ok);
  const r = await call(SP + 'survey', { key: null, body: { token, session: 1, kind: 'pre', data } });
  assert(r.json.ok, JSON.stringify(r.json));
}
// Each seed gives its own random answers (E.seeded), as different people would.
const ans = seed => { const r = E.seeded('person' + seed), d = n => Math.floor(r() * n); const a = { sec_important: String(1 + d(7)), sec_confident: String(1 + d(7)), mfa: ['yes', 'no', 'unsure'][d(3)] }; for (let i = 1; i <= 12; i++) a[`extra${i}`] = String(1 + d(7)); return a; };
for (let i = 0; i < 6; i++) await participant('person' + i, ans(i + 1));
await participant('bot', ans(11), { webdriver: true, honeypot: true });
await participant('twin_a', ans(20)); await participant('twin_b', ans(20));
const srep = (await call(SA + 'integrity')).json;
assert.equal(srep.mode, 'study');
const sby = Object.fromEntries(srep.people.map(p => [p.name, p]));
assert(!srep.people.some(p => /^person/.test(p.name)), `honest participants raise nothing: ${JSON.stringify(srep.people)}`);
assert(sby.bot && sby.bot.reasons.some(r => /automation software/.test(r.text)) && sby.bot.reasons.some(r => /hidden box/.test(r.text)) && sby.bot.strong === 2, JSON.stringify(sby.bot));
const twins = srep.pairs.find(p => [p.aName, p.bName].sort().join() === 'twin_a,twin_b');
assert(twins && twins.reasons.some(r => /same answer on 15 of the 15 questions/.test(r)), JSON.stringify(srep.pairs));
assert.equal(srep.pairs.length, 1, JSON.stringify(srep.pairs));
assert.match(srep.cannotSee.join(' '), /AI agent/);
console.log('study: bot named with strong reasons; identical answer sets pair up; honest participants clear');
