import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { runSelfTest } from '../../netlify/lib/lab/selftest.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const type = TYPES.vignettes, now = Date.UTC(2026, 9, 5, 15);
const study = { id: 'phish-pilot', name: 'Phishing pilot', type: 'vignettes', codePrefix: 'PH' };
const S = store => ({ store, type, study });

// defaults are valid and runnable
assert.deepEqual(C.validateContent(C.defaultContent(type), type), []);
{ const s = S(memStore()); const r = await (async () => { let r = await runSelfTest(s, { condition: 'main' }); while (!r.done) r = await runSelfTest(s, { code: r.code }); return r; })();
  assert.equal(r.failed, 0, JSON.stringify(r.checks.filter(c => !c.pass))); console.log('vignettes default study: self-test', r.passed, 'checks passed'); }

// a two-condition study with per-condition wording, practice, and survey questions
const store = memStore(), s = S(store);
const c = C.normalize(C.defaultContent(type), type);
c.design.conditions = [{ id: 'warn', label: 'Warning banner' }, { id: 'plain', label: 'No banner' }];
c.design.practice = true;
c.items[0].variants = { warn: { body: 'CAUTION: external sender.\n\n' + c.items[0].body } };
c.questions.push({ id: 'trust', text: 'How much do you trust the sender?', type: 'scale', n: 5, lo: 'Not at all', hi: 'Completely', required: false, showIf: 'always', conditions: ['plain'] });
c.survey.post = [{ id: 'effort', text: 'Effort?', type: 'scale', n: 9, lo: 'Low', hi: 'High', required: false, showIf: 'always', sessions: [], conditions: [] }];
c.design.sessions = [{ items: ['example-email', 'example-request'] }, { items: [] }];   // session 2: survey only
assert.equal((await C.saveContent(store, type, c, 'Tester', 0, now)).version, 1);
// validation
const bad = structuredClone(c); bad.items[0].variants = { nope: { body: 'x' } }; bad.questions[0].conditions = ['zzz']; bad.design.conditions[0].id = 'Bad Id';
const errs = C.validateContent(C.normalize(bad, type), type);
assert(errs.some(x => /unknown condition/.test(x)) && errs.some(x => /conditions must be among/.test(x)) && errs.some(x => /Condition 1/.test(x)), errs.join(' | '));
// minimization balances the two conditions
const ids = [];
for (let i = 0; i < 6; i++) { const r = await E.login(s, { email: `v${i}@gsu.edu`, confirm: true }, now); ids.push(await E.verifyToken(s, r.token, now)); }
const people = await E.listParticipants(s, now), by = {}; people.forEach(p => by[p.condition] = (by[p.condition] || 0) + 1);
assert.deepEqual(by, { warn: 3, plain: 3 });
// run one participant from each condition through both sessions
for (const cond of ['warn', 'plain']) {
  const p = people.find(x => x.condition === cond);
  await E.consent(s, p.code, true, now);
  const plan = await E.startSession(s, p.code, now);
  assert.equal(plan.total, 2); assert(plan.practice && plan.practice.item.title);
  assert.equal(plan.questions.some(q => q.id === 'trust'), cond === 'plain', 'condition-filtered question');
  const email = plan.trials.find(t => t.item.kind === 'email');
  assert.equal(email.item.body.startsWith('CAUTION'), cond === 'warn', 'per-condition wording');
  assert(!('id' in email.item) && !JSON.stringify(plan).includes('example-email'), 'item IDs hidden from the browser');
  await E.saveTrial(s, p.code, 1, 'practice', { answers: {} }, now);
  for (const t of plan.trials) await E.saveTrial(s, p.code, 1, t.index, { answers: { suspicion: '6', action: 'report', confidence: '80', why: '=HYPERLINK("x")', trust: '2', bogus: 'x' }, rtMs: 5000,
    traces: { durationMs: 5000, hovers: { 'link:https://northwind-secure.example/verify': { count: 2, dwellMs: 900 } }, clickTargets: { 'link:https://northwind-secure.example/verify': 1 } } }, now);
  assert((await E.saveSurvey(s, p.code, 1, 'post', { effort: '4' }, now)).ok);
  const p2 = await E.startSession(s, p.code, now);
  assert.equal(p2.session, 2); assert.equal(p2.total, 0, 'survey-only session');
  const fin = await E.saveSurvey(s, p.code, 2, 'post', { effort: '5' }, now);
  assert(fin.ok && fin.status.finished, 'survey-only session completes the study');
}
const csv = await E.exportCsv(s), lines = csv.trim().split('\n'), h = lines[0].split(',');
for (const col of ['item_id', 'item_variant', 'a_suspicion', 'a_action', 'a_confidence', 'a_why', 'link_hovers', 'link_hover_ms', 'link_clicks']) assert(h.includes(col), col);
assert(!/(^|,)[=+@]/m.test(csv), 'formula neutralized');
const rows = await E.exportRows(s, 'trials');
const w = rows.find(r => r.condition === 'warn' && r.item_id === 'example-email'), pl = rows.find(r => r.condition === 'plain' && r.item_id === 'example-email');
assert.equal(w.item_variant, 'warn'); assert.equal(pl.item_variant, '');
assert.equal(w.a_trust, undefined, 'trust not asked in warn'); assert.equal(pl.a_trust, '2');
assert.equal(w.link_hovers, 2); assert.equal(w.link_hover_ms, 900); assert.equal(w.link_clicks, 1); assert.equal(w.a_suspicion, '6');
assert(!rows.some(r => 'a_bogus' in r), 'unknown answers dropped');
console.log('vignettes: conditions, per-condition wording, condition-only questions, practice, survey-only session, link hover/click columns, validation');
console.log('ALL VIGNETTES TESTS PASSED');
