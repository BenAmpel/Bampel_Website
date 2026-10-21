// Survey logic and import, end to end on in-memory stores: the import route (roles, no saving, errors),
// embedded data captured at session start, display logic enforced when answers are saved, info questions kept
// out of the exports, per-item questions with logic, and the live self-test on an imported survey.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { runSelfTest } from '../../netlify/lib/lab/selftest.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { importSurvey } from '../../netlify/lib/lab/import/index.mjs';
import { memStore } from './memstore.mjs';
import { blobsFactory } from './import-helpers.mjs';
const fx = n => readFileSync(fileURLToPath(new URL('./fixtures/import/' + n, import.meta.url)), 'utf8');
const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key, method } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};

// ================= the import route =================
assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'imp-test', name: 'Import test', type: 'vignettes' } })).json.ok);
const P = '/api/lab/imp-test/', A = P + 'admin/';
const viewer = (await call(A + 'team-add', { key: OWNER, body: { name: 'View', role: 'viewer' } })).json.key;
const editor = (await call(A + 'team-add', { key: OWNER, body: { name: 'Edit', role: 'editor' } })).json.key;
const body = { filename: 'demo.qsf', data: fx('demo.qsf') };
assert.equal((await call(A + 'import', { body })).status, 403, 'no key');
assert.equal((await call(A + 'import', { body, key: 'wrong-key-0123456789abcdef' })).status, 403, 'wrong key');
assert.equal((await call(A + 'import', { body, key: viewer })).status, 403, 'a viewer cannot import');
assert.equal((await call(A + 'import', { key: editor })).status, 405, 'POST only');
let r = await call(A + 'import', { body, key: editor });
assert.equal(r.status, 200, r.text); assert.equal(r.json.report.counts.questions, 30); assert.deepEqual(C.validateContent(C.normalize(structuredClone(r.json.content), TYPES.vignettes), TYPES.vignettes), []);
assert.equal((await call(A + 'import', { body: { filename: 'demo.qsf', data: fx('demo.qsf'), format: 'qsf' }, key: OWNER })).status, 200, 'the owner can too');
// previewing saves nothing
assert.equal((await call(A + 'content', { key: editor })).json.version, 0, 'content is still the built-in defaults');
assert.deepEqual((await call(A + 'content-history', { key: editor })).json, [], 'no version was made');
const act = (await call(A + 'activity', { key: OWNER })).json;
assert(act.some(a => a.action === 'survey.import_preview' && a.detail.startsWith('survey import previewed: qsf, 30 questions')), JSON.stringify(act.slice(0, 3)));
// errors are readable, never a 500 or a stack
for (const [b, re] of [[{ filename: 'x.qsf', data: '{broken' }, /not valid JSON/], [{ filename: 'x.lss', data: '<a><b></a>' }, /not valid XML/], [{ filename: 'x.csv', data: 'variable,type,text\n,text,A\n' }, /variable name is required/], [{ filename: 'x.csv' }, /No file/], [{ filename: 'x.xlsx', data: 'AAAA', encoding: 'base64' }, /xlsx|file/i]]) {
  const e = await call(A + 'import', { body: b, key: editor });
  assert.equal(e.status, 400, e.text); assert.equal(e.json.error, 'import_failed'); assert(re.test(e.json.hint), e.json.hint); assert(!/at .*\.mjs|Error:/.test(e.text), 'no stack trace');
}
assert.equal((await call(A + 'import', { body: { filename: 'big.csv', data: 'x'.repeat(8_100_000) }, key: editor })).status, 413, 'a body over the import limit');
assert.equal((await call(A + 'import', { body: { filename: 'big.csv', data: 'variable,type,text\n' + 'a'.repeat(5.2 * 1048576) }, key: editor })).json.error, 'import_failed', 'a file over 5 MB is refused with a message');
// only survey studies accept imports
const v = await call('/api/lab/verification/admin/import', { body, key: OWNER });
assert.equal(v.status, 400); assert.equal(v.json.error, 'import_not_supported'); assert(/Vignettes and surveys/.test(v.json.hint));
// the normal save makes the version; public content lists the embedded data but no answer keys
const imported = (await call(A + 'import', { body, key: editor })).json.content;
const saved = await call(A + 'content-save', { key: editor, body: { content: imported, baseVersion: 0, note: 'imported' } });
assert.equal(saved.json.version, 1, saved.text);
const pub = (await call(P + 'content')).json;
assert.deepEqual(pub.embedded, [{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }, { name: 'study_id', source: 'value', value: 'pilot' }, { name: 'session_id', source: 'url', param: 'SESSION_ID' }]);
assert.equal(pub.consent.approved, false);
console.log('import route: roles, preview saves nothing, audit entry, readable errors, type check, normal save');

// ================= participant flow: embedded data, display logic, exports =================
const survey = importSurvey({ filename: 'flow.csv', data: [
  'page,variable,type,text,options,required,show_if,condition',
  ',pid,embedded,param:PROLIFIC_PID,,,,',
  ',batch,embedded,value:wave2,,,,',
  '1,welcome,info,"Welcome {{ed:pid}}",,,,',
  '1,smoker,choice,Do you smoke?,y=Yes|n=No,,,',
  '1,packs,number,"Packs per day, {{q:smoker}}?",,,smoker = y,',
  '2,why,text,Why?,,,packs > 0,',
  '2,only_a,text,Only for group A,,,condition = a,',
  '2,only_b,text,Only for group B,,,condition = b,',
  '2,vip,text,Only with a known id,,,ed:pid = VIP1,'
].join('\n') });
const type = TYPES.vignettes, study = { id: 'flow-test', name: 'Flow', type: 'vignettes', codePrefix: 'FL' }, store = memStore(), S = { store, type, study };
assert.equal((await C.saveContent(store, type, { ...survey.content, enrollment: { ...survey.content.enrollment, domains: ['gsu.edu'], gapDays: 0 } }, 'Tester', 0)).version, 1);
const now = Date.UTC(2026, 9, 21, 15);
const start = async (email, embedded) => {
  const lg = await E.login(S, { email, confirm: true }, now), pid = await E.verifyToken(S, lg.token, now);
  await E.consent(S, pid, true, now);
  return { pid, plan: await E.startSession(S, pid, now, { embedded }) };
};
const dirty = { pid: 'VIP1', batch: 'hijack', stray: 'nope', other: '=1+1' };
const a = await start('a@gsu.edu', dirty), b = await start('b@gsu.edu', { pid: 'ab\u0000c\u0007d  ' + 'x'.repeat(300) });
const condOf = async pid => (await E.loadParticipant(S, pid)).condition;
const ca = (await condOf(a.pid)) === 'a', cb = (await condOf(b.pid)) === 'a';
assert.notEqual(ca, cb, 'the two participants were balanced across the two conditions');
assert.deepEqual(a.plan.embedded, { pid: 'VIP1', batch: 'wave2' }, 'only declared names, constants come from the content, never from the browser');
assert.equal(b.plan.embedded.pid.length, 200); assert(!/[\u0000-\u001f]/.test(b.plan.embedded.pid) && b.plan.embedded.pid.startsWith('abcd'));
assert(!JSON.stringify(a.plan.preItems).includes('"condition"'), 'the browser gets resolved condition tests, not condition names');
assert(a.plan.preItems.every(q => !q.displayIf || !JSON.stringify(q.displayIf).match(/"condition"/)));
const flags = p => ['only_a', 'only_b'].map(id => p.preItems.find(q => q.id === id).displayIf);
assert.deepEqual(flags(a.plan), ca ? [{ const: true }, { const: false }] : [{ const: false }, { const: true }], 'condition tests arrive already settled');
// answers: hidden ones are dropped on save, whatever the browser sends
const sendAll = { smoker: 'n', packs: '3', why: 'because', only_a: 'A!', only_b: 'B!', vip: 'v', welcome: 'text' };
assert((await E.saveSurvey(S, a.pid, 1, 'pre', sendAll, now)).ok);
assert((await E.saveSurvey(S, b.pid, 1, 'pre', { ...sendAll, smoker: 'y' }, now)).ok);
const csv = await E.exportSurveyCsv(S), rows = await E.exportRows(S, 'surveys');
const ra = rows.find(x => x.code === a.pid), rb = rows.find(x => x.code === b.pid);
assert.equal(ra.smoker, 'n'); assert.equal(ra.packs, undefined, 'packs is hidden when smoker = No'); assert.equal(ra.why, undefined, 'and "why" depends on "packs", so it is dropped as well');
assert.equal(ra.vip, 'v', 'the embedded-data rule was met'); assert.equal(ra.only_a, ca ? 'A!' : undefined); assert.equal(ra.only_b, ca ? undefined : 'B!');
assert.equal(rb.packs, '3'); assert.equal(rb.why, 'because'); assert.equal(rb.vip, undefined, 'b\'s id is not VIP1');
assert(!('welcome' in ra) && !csv.split('\n')[0].split(',').includes('welcome'), 'descriptive text has no answer column');
assert.deepEqual([ra.ed_pid, ra.ed_batch, rb.ed_batch], ['VIP1', 'wave2', 'wave2'], 'embedded data is exported in the surveys CSV');
assert(csv.split('\n')[0].split(',').includes('ed_pid'));
// the stored record also keeps the embedded data; a formula typed into a URL parameter is neutralized in the CSV
{
  const f = await start('c@gsu.edu', { pid: '=HYPERLINK("http://x")' });
  await E.saveSurvey(S, f.pid, 1, 'pre', { smoker: 'n' }, now);
  const out = await E.exportSurveyCsv(S);
  assert(out.includes(`"'=HYPERLINK(""http://x"")"`) && !/,=HYPERLINK/.test(out), 'formula neutralized: ' + out.split('\n').pop());
}
// embedded data never changes who someone is: sign-in ignores it
assert.equal((await E.login(S, { email: 'a@gsu.edu', embedded: { pid: 'someone-else' } }, now)).consented, true);
console.log('flow: embedded data captured and sanitized, condition tests settled on the server, hidden answers dropped, exports');

// ================= self-test on an imported survey (every condition) =================
{
  const q = memStore(), s2 = { store: q, type, study: { id: 'st-import', name: 'ST', type: 'vignettes', codePrefix: 'ST' } };
  const demo = importSurvey({ filename: 'demo.qsf', data: fx('demo.qsf') }).content;
  assert.equal((await C.saveContent(q, type, demo, 'Tester', 0)).version, 1);
  for (const cond of demo.design.conditions.map(c => c.id)) {
    let res = await runSelfTest(s2, { condition: cond }); while (!res.done) res = await runSelfTest(s2, { code: res.code });
    assert.equal(res.failed, 0, JSON.stringify(res.checks.filter(c => !c.pass)));
  }
  console.log('self-test: imported Qualtrics survey passes in every condition');
}

// ================= per-item questions: info, logic, piping =================
{
  const q = memStore(), s3 = { store: q, type, study: { id: 'item-logic', name: 'IL', type: 'vignettes', codePrefix: 'IL' } };
  const c = C.normalize(C.defaultContent(type), type);
  c.embedded = [{ name: 'src', source: 'value', value: 'lab' }];
  c.questions = [
    { id: 'read', text: 'Read this carefully.', type: 'info', required: true, showIf: 'always', conditions: [] },
    { id: 'sus', text: 'How suspicious?', type: 'scale', n: 5, lo: 'Not', hi: 'Very', required: false, showIf: 'always', conditions: [] },
    { id: 'why', text: 'You said {{q:sus}}. Why?', type: 'text', long: true, required: false, showIf: 'always', conditions: [], displayIf: { q: 'sus', op: 'gte', value: '4' } },
    { id: 'src_only', text: 'Source rule', type: 'text', required: false, showIf: 'always', conditions: [], displayIf: { ed: 'src', op: 'eq', value: 'other' } }
  ];
  assert.deepEqual(C.validateContent(c, type), []);
  assert.equal((await C.saveContent(q, type, c, 'T', 0)).version, 1);
  const lg = await E.login(s3, { email: 'z@gsu.edu', confirm: true }, now), pid = await E.verifyToken(s3, lg.token, now);
  await E.consent(s3, pid, true, now);
  const plan = await E.startSession(s3, pid, now, {});
  assert.deepEqual(plan.questions.map(x => x.id), ['read', 'sus', 'why', 'src_only']); assert.deepEqual(plan.embedded, { src: 'lab' });
  for (const t of plan.trials) await E.saveTrial(s3, pid, 1, t.index, { answers: { read: 'x', sus: '2', why: 'hidden', src_only: 'hidden' } }, now);
  const rowsT = await E.exportRows(s3, 'trials');
  assert(rowsT.length === 2 && rowsT.every(x => x.a_sus === '2' && x.a_why === '' && x.a_src_only === '' && !('a_read' in x)), JSON.stringify(rowsT[0]));
  let res = await runSelfTest(s3, { condition: 'main' }); while (!res.done) res = await runSelfTest(s3, { code: res.code });
  assert.equal(res.failed, 0, JSON.stringify(res.checks.filter(x => !x.pass)));
  console.log('per-item questions: info excluded, hidden answers dropped, self-test passes');
}
console.log('ALL SURVEY FLOW TESTS PASSED');
