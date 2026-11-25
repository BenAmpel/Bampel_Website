// The study builder's model (static/lab/engine/builder-model.js; docs/designs/study-builder.md, Phase 6), loaded under
// vm with no DOM, as the browser loads it: every fixture in fixtures/builder/ round-trips and compiles to its
// .expected.json, check refuses each design v1 cannot run, and canvas edits compile to valid content that keeps
// every key the canvas does not own.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { typeFor } from '../../netlify/lib/lab/registry.mjs';
import * as content from '../../netlify/lib/lab/content.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const box = {}; box.window = box; vm.createContext(box);
vm.runInContext(readFileSync(here('../../static/lab/engine/builder-model.js'), 'utf8'), box);
const M = box.LabBuilderModel;
assert(M && ['decompile', 'compile', 'check', 'roundTrips'].every(f => typeof M[f] === 'function'), 'the model loads without a DOM');
// Values made inside the sandbox have their own prototypes, so compare them as plain JSON.
const J = x => JSON.parse(JSON.stringify(x));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);
const type = typeFor({ type: 'multimodal', template: 'multimodal-builder' });
const valid = (c, m) => { const e = content.validateContent(content.normalize(J(c), type), type); assert.deepEqual(e, [], m + ': ' + e.join('; ')); };

// ---------- fixtures ----------
const dir = here('./fixtures/builder/');
const names = readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.expected.json')).map(f => f.slice(0, -5)).sort();
deq(names, ['arm-questions', 'assign-at-2', 'three-arm', 'two-arm', 'variants'], 'the five Phase 6 designs');
const fx = {};
for (const n of names) {
  const c = JSON.parse(readFileSync(dir + n + '.json', 'utf8')), expected = JSON.parse(readFileSync(dir + n + '.expected.json', 'utf8'));
  fx[n] = c;
  valid(c, n + ' is valid content');
  const rt = M.roundTrips(c);
  assert(rt.ok, n + ' round-trips; differs at ' + J(rt.paths).join(', '));
  deq(M.compile(M.decompile(c), c), c, n + ': compile(decompile(c), c) equals c');
  deq(M.compile(M.decompile(c), c), expected, n + ': compiled JSON equals ' + n + '.expected.json');
  deq(M.check(M.decompile(c)), [], n + ': check passes');
}
console.log('builder model: ' + names.length + ' fixtures round-trip and match their expected JSON');

// ---------- what decompile draws ----------
{
  const cv = M.decompile(fx['arm-questions']);
  deq(cv.arms.map(a => a.id), ['control', 'treatment']);
  assert.equal(cv.sessions.length, 2); assert.equal(cv.blockSize, 4); assert.equal(cv.quota, false);
  deq(cv.armOnly, { saw_banner: ['treatment'], control_note: ['control'] }, 'arm-only questions');
  deq(cv.sessions[0].zones.end, ['saw_banner', 'trust'], 'session 1 end: the arm question, then the every-session one');
  deq(cv.sessions[1].zones.end, ['final_thoughts', 'trust'], 'session 2 end');
  deq(cv.every, ['trust'], 'a question saved with no sessions is kept as written');
  deq(cv.sessions[0].zones.task.map(b => b.items), [['msg-1']]);
  deq(M.decompile(fx.variants).variants['msg-1'], { decisionPrompt: { control: 'What would you do with this request?' }, body: { treatment: 'A flagged version of the message.' },
    media: { treatment: '/lab/media/banner.png' }, mediaAlt: { treatment: 'A yellow banner reading External sender' } }, 'variants are drawn per field, then per arm');
  assert.equal(M.decompile(fx['assign-at-2']).assignAt, 2);
  console.log('builder model: decompile draws arms, zones, arm-only questions, variants and assignment');
}

// ---------- edits compile to valid content and keep everything else ----------
const owned = ['design', 'survey', 'items', 'builder'];
const others = c => Object.fromEntries(Object.entries(J(c)).filter(([k]) => !owned.includes(k)));
{
  // delete an arm: its variants and its arm-only questions' conditions go, the block size follows
  const base = fx['three-arm'], cv = M.decompile(base);
  cv.arms = cv.arms.filter(a => a.id !== 'video'); cv.blockSize = 4; cv.armOnly.final_thoughts = ['video']; cv.armOnly.work_email = ['video', 'treatment'];
  const out = M.compile(cv, base);
  deq(out.design.conditions.map(a => a.id), ['control', 'treatment']);
  assert(!('video' in out.items[0].variants), 'the deleted arm loses its variants');
  deq(out.survey.post.find(q => q.id === 'final_thoughts').conditions, [], 'conditions naming a deleted arm are removed');
  deq(out.survey.pre.find(q => q.id === 'work_email').conditions, ['treatment'], 'only the deleted arm is removed from a mixed list');
  deq(others(out), others(base), 'keys the canvas does not own pass through');
  valid(out, 'after deleting an arm');
  // the deleted arm\'s variant was the only one with media: the treatment wording stays
  deq(out.items[0].variants.treatment, base.items[0].variants.treatment);
}
{
  // move the final question from session 2 to session 1, rename an arm, raise the block size, assign at session 2
  const base = fx['two-arm'], cv = M.decompile(base);
  cv.sessions[1].zones.end = []; cv.sessions[0].zones.end = ['final_thoughts'];
  cv.arms[1].label = 'Banner'; cv.blockSize = 8; cv.assignAt = 2;
  delete cv.variants['msg-1']; cv.variants['msg-2'] = { media: { control: '/lab/media/x.png' } };
  deq(M.check(cv), [], 'session-1 item no longer varies, so assigning at session 2 is allowed');
  const out = M.compile(cv, base);
  deq(out.survey.post.find(q => q.id === 'final_thoughts').sessions, [1]);
  assert.equal(out.design.conditions[1].label, 'Banner'); assert.equal(out.design.randomization.blockSize, 8);
  assert.equal(out.design.randomization.seed, base.design.randomization.seed, 'the seed is never changed by the canvas');
  assert.equal(out.design.assignAtSession, 2);
  deq(out.items[0].variants, {}, 'clearing every field of an arm removes the arm entry'); deq(out.items[1].variants, { control: { media: '/lab/media/x.png' } });
  deq(others(out), others(base), 'keys the canvas does not own pass through');
  deq(J(out.items).map(i => { const x = { ...i }; delete x.variants; return x; }), J(base.items).map(i => { const x = { ...i }; delete x.variants; return x; }), 'item fields other than variants pass through');
  assert.deepEqual(J(out.builder), { v: 1 });
  valid(out, 'after moving, renaming and re-sizing');
  assert(M.roundTrips(J(out)).ok, 'and the result round-trips');
}
{
  // reorder blocks and move a start question into the end zone
  const base = fx['arm-questions'], cv = M.decompile(base);
  cv.sessions[0].zones.task = [{ title: 'First', items: ['msg-2'], randomize: false }, { title: 'Second', items: ['msg-1'], randomize: true }];
  cv.sessions[1].zones.task = [];
  cv.order.pre = cv.order.pre.filter(id => id !== 'work_email'); cv.order.post.push('work_email');
  cv.sessions[0].zones.start = cv.sessions[0].zones.start.filter(id => id !== 'work_email'); cv.sessions[1].zones.end.push('work_email');
  const out = M.compile(cv, base);
  deq(out.design.sessions[0].blocks.map(b => b.items), [['msg-2'], ['msg-1']]); assert.equal(out.design.sessions[0].blocks[1].randomize, true);
  assert(!out.survey.pre.some(q => q.id === 'work_email') && out.survey.post.at(-1).id === 'work_email', 'start question moved to the end survey');
  deq(out.survey.post.at(-1).sessions, [2]);
  assert(M.roundTrips(J(out)).ok);
  console.log('builder model: edits (delete arm, move question, rename, block size, variants, block order) compile to valid content');
}

// ---------- check refuses what v1 cannot run ----------
const refuses = (edit, code, m) => { const cv = J(M.decompile(fx['two-arm'])); edit(cv); const got = J(M.check(cv));
  assert(got.some(x => x.code === code), m + ': expected ' + code + ', got ' + JSON.stringify(got));
  for (const x of got) assert(/^[A-Z"].*[.]$/.test(x.message) && !/\.\s+[A-Z]/.test(x.message.slice(0, -1)), 'one plain sentence: ' + x.message); };
refuses(cv => { cv.arms = cv.arms.slice(0, 1); cv.blockSize = 2; }, 'arm_limit', 'one arm');
refuses(cv => { cv.arms = Array.from({ length: 7 }, (_, i) => ({ id: 'a' + i, label: 'A' + i })); cv.blockSize = 14; }, 'arm_limit', 'seven arms');
refuses(cv => { cv.blockSize = 2; }, 'block_size', 'block size below twice the arms');
refuses(cv => { cv.blockSize = 5; }, 'block_size', 'block size not a multiple');
refuses(cv => { cv.blockSize = 102; }, 'block_size', 'block size over 100');
refuses(cv => { cv.blockSize = null; }, 'block_size', 'no block size');
refuses(cv => { cv.quota = true; }, 'quota_with_blocks', 'a quota');
refuses(cv => { cv.armOnly['msg-1'] = ['treatment']; }, 'task_item_arm_only', 'a task item in one arm');
refuses(cv => { cv.variants['msg-1'].recordVoice = { treatment: true }; }, 'variant_field', 'recordVoice by arm');
refuses(cv => { cv.variants['msg-2'] = { kind: { control: 'audio' } }; }, 'variant_field', 'kind by arm');
refuses(cv => { cv.assignAt = 2; }, 'before_assignment', 'a session-1 item that varies, with arms assigned at session 2');
refuses(cv => { cv.assignAt = 2; delete cv.variants['msg-1']; cv.armOnly.work_email = ['control']; }, 'before_assignment', 'an arm-only start question before the band');
{ const cv = J(M.decompile(fx['two-arm'])); cv.armOnly.work_email = ['control']; deq(J(M.check(cv)), [], 'an arm-only start question in the assigning session is fine'); }
deq(J(M.VARIANT_FIELDS), ['decisionPrompt', 'body', 'media', 'mediaAlt']);
// the quota flag comes from the content
{ const c = J(fx['two-arm']); c.enrollment.quota = { total: null, perCondition: { control: 10 } }; assert.equal(M.decompile(c).quota, true); }
console.log('builder model: check refuses arm_limit, block_size, quota_with_blocks, task_item_arm_only, variant_field and before_assignment');

// ---------- the round-trip gate the admin uses ----------
{
  const noBuilder = J(fx['two-arm']); delete noBuilder.builder;
  assert.equal(M.roundTrips(noBuilder).ok, false); assert.equal(M.roundTrips(noBuilder).why, 'no_builder');
  // a question with sessions outside the session count cannot be drawn exactly, so the study opens in the form editor
  const odd = J(fx['two-arm']); odd.survey.post[0].sessions = [2, 1];
  const rt = M.roundTrips(odd);
  assert.equal(rt.ok, false); assert(rt.paths.some(p => p.includes('survey.post[0].sessions')), J(rt.paths).join(','));
  console.log('builder model: studies the canvas cannot show exactly fail the round-trip check');
}
console.log('builder-model: all checks passed');
