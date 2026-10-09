// The data-quality survey (survey-only battery): content shape, the new question types (typed numbers and
// select-all), pages, answer cleaning, the export, and the live self-test, all on in-memory stores.
import { handle } from '../../netlify/lib/lab/router.mjs';
import { BUILT_IN, typeFor } from '../../netlify/lib/lab/registry.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { cleanAnswers } from '../../netlify/lib/lab/engine.mjs';
import { runSelfTest } from '../../netlify/lib/lab/selftest.mjs';
import { seed } from '../../netlify/lib/lab/studies/data-quality.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const stores = new Map();
const getStore = ({ name }) => { if (!stores.has(name)) { const m = memStore({ name }); stores.set(name, m); } const m = stores.get(name);
  // a minimal stand-in for the Blobs API used by blobsStore()
  return { get: async k => m.get(k), setJSON: async (k, v, o = {}) => { if (o.onlyIfNew || o.onlyIfMatch) return { modified: await m.setIf(k, v, o.onlyIfNew ? { onlyIfNew: true } : { etag: o.onlyIfMatch }) }; await m.set(k, v); return { modified: true }; },
    delete: async k => m.delete(k), list: ({ prefix }) => ({ async *[Symbol.asyncIterator]() { yield { blobs: (await m.list(prefix)).map(key => ({ key })) }; } }),
    getWithMetadata: async k => { const r = await m.getMeta(k); return r ? { data: r.data, etag: r.etag } : null; } }; };
const OWNER = 'owner-key-0123456789abcdef';
const env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key, method } = {}) => {
  const req = new Request('https://bampel.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};


// ---- content shape
const study = BUILT_IN['data-quality'], type = typeFor(study), c = C.normalize(seed(), type);
assert.deepEqual(C.validateContent(c, type), [], 'seed content is valid');
const qs = c.survey.pre, byId = Object.fromEntries(qs.map(q => [q.id, q]));
assert.equal(new Set(qs.map(q => q.id)).size, qs.length, 'variable names are unique');
assert.equal(qs.length, 86);
assert(qs.every(q => q.required === false), 'every question is optional');
const pages = [...new Set(qs.map(q => q.page))];
assert.deepEqual(pages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'pages run 1..11 in order');
assert(qs.every((q, i) => i === 0 || q.page >= qs[i - 1].page), 'pages never go backwards');
// Big Five: 50 items, 5 positive and 5 negative per trait, all on the 5-point agree scale
const bf = qs.filter(q => q.id.startsWith('bf_'));
assert.equal(bf.length, 50);
for (const t of 'neoac') for (const pole of 'pn') assert.equal(bf.filter(q => q.id.startsWith(`bf_${t}_${pole}`)).length, 5, `${t}${pole}`);
assert(bf.every(q => q.type === 'scale' && q.n === 5 && q.labels[0] === 'Strongly disagree' && q.labels[4] === 'Strongly agree'));
assert.equal(bf.filter(q => q.page >= 2 && q.page <= 5).length, 50, 'Big Five is on pages 2 to 5');
// embedded checks and the test-retest pair
const idx = id => qs.findIndex(q => q.id === id);
assert.equal(idx('test_retest_2') - idx('test_retest_1'), 21, 'test-retest items are 21 questions apart');
assert.equal(byId.test_retest_1.text, byId.test_retest_2.text);
const bfIdx = bf.map(q => idx(q.id));
assert(idx('ac_agree') > Math.min(...bfIdx) && idx('ac_agree') < Math.max(...bfIdx), 'the strongly-agree check sits inside the personality items');
assert(idx('test_retest_1') > Math.min(...bfIdx) && idx('test_retest_2') < Math.max(...bfIdx), 'the test-retest pair sits inside the personality items');
assert(/Strongly agree/.test(byId.ac_agree.text));
assert.equal(byId.ac_math.type, 'number'); assert.equal(byId.ac_math.text, 'What is 3 x 4?');
// consent-form check
assert(c.consent.paragraphs.some(p => /color of this study is teal/i.test(p)));
assert(byId.ac_color.options.some(o => o.value === 'Teal'));
// age early, birth year later
assert(byId.age.page === 1 && byId.birth_year.page === 8 && idx('age') < idx('birth_year'));
assert.equal(byId.age.type, 'number'); assert.equal(byId.birth_year.type, 'number');
// conspiracist beliefs: 15 items on the true-ness scale
const gcb = qs.filter(q => q.id.startsWith('gcb_'));
assert.equal(gcb.length, 15); assert(gcb.every(q => q.n === 5 && q.labels[0] === 'Definitely not true' && q.labels[4] === 'Definitely true'));
// demographics, politics, data quality, bot check
assert.equal(byId.ethnicity.type, 'multi'); assert.equal(byId.ethnicity.options.length, 9);
assert.equal(byId.gender.options.length, 4); assert.equal(byId.transgender.options.length, 4); assert.equal(byId.sexual_orientation.options.length, 5);
assert.equal(byId.income.options[0].label, 'Less than $10,000'); assert.equal(byId.income.options.at(-1).label, '$150,000 or more');
assert.equal(byId.education.options.at(-1).label, 'Doctorate or professional degree');
assert.equal(byId.political_affiliation.n, 7); assert.equal(byId.political_affiliation.labels[0], 'Strong Republican'); assert.equal(byId.political_affiliation.labels[6], 'Strong Democrat');
assert.equal(byId.political_social.n, 5); assert.equal(byId.political_economic.labels[4], 'Very liberal');
assert.deepEqual(byId.party.options.map(o => o.label), ['Republican', 'Libertarian', 'Democratic', 'Green Party']);
assert.deepEqual(byId.dq_low_quality.options.map(o => o.label), ['Yes', 'No']);
assert.equal(qs.at(-1).id, 'final_comments'); assert.equal(qs.at(-1).type, 'text');
assert.deepEqual(['se_week', 'se_year'].map(k => byId[k].type), ['number', 'number']);
console.log('data-quality content ok');

// ---- new question types: cleaning and validation
const num = { id: 'n', type: 'number' }, mul = { id: 'm', type: 'multi', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] };
assert.deepEqual(cleanAnswers({ n: ' 5,000 ' }, [num]), { n: '5000' });
assert.deepEqual(cleanAnswers({ n: '250' }, [num]), { n: '250' }, 'an impossible number is kept as entered');
assert.deepEqual(cleanAnswers({ n: 'abc' }, [num]), {}); assert.deepEqual(cleanAnswers({ n: '' }, [num]), {});
assert.deepEqual(cleanAnswers({ m: ['a', 'b', 'a', 'zzz'] }, [mul]), { m: ['a', 'b'] }, 'multi keeps valid, unique values');
assert.deepEqual(cleanAnswers({ m: ['zzz'] }, [mul]), {}); assert.deepEqual(cleanAnswers({ m: [] }, [mul]), {});
const e = []; C.validateQuestions([{ id: 'q1', text: 'x', type: 'multi', options: [{ value: 'a', label: 'A' }], sessions: [1], showIf: 'always' }, { id: 'q2', text: 'x', type: 'number', page: 0, sessions: [1] }], 'Q', e, { nSessions: 1, conditions: ['main'], rules: [] });
assert(e.some(x => /at least two options/.test(x)) && e.some(x => /page must be/.test(x)), e.join(' | '));
console.log('new question types ok');

// ---- end to end over HTTP
let r = await call('/api/lab/data-quality/content');
assert.equal(r.status, 200); assert.equal(r.json.type, 'vignettes'); assert.equal(r.json.sessions, 1); assert.equal(r.json.signup.length, 0, 'closed to self sign-up by default');
assert(!/"truth"/.test(r.text));
assert.equal((await call('/api/lab/_lab/studies')).json.some(s => s.id === 'data-quality'), false, 'unlisted');
assert((await call('/api/lab/_lab/studies', { key: OWNER })).json.some(s => s.id === 'data-quality'));
r = await call('/api/lab/data-quality/admin/content', { key: OWNER });
assert.equal(r.json.survey.pre.length, 86); assert(r.json._questionTypes.includes('number') && r.json._questionTypes.includes('multi'));
r = await call('/api/lab/data-quality/admin/create', { key: OWNER, body: { count: 1, label: 'pilot' } });
const code = r.json.created[0].code;
r = await call('/api/lab/data-quality/login', { body: { code } }); const token = r.json.token; assert(token);
await call('/api/lab/data-quality/consent', { body: { token, agree: true } });
r = await call('/api/lab/data-quality/session', { body: { token } });
assert.equal(r.json.total, 0, 'no items: survey only'); assert.equal(r.json.preItems.length, 86); assert.equal(r.json.postItems.length, 0);
assert(r.json.preItems.every(q => q.page >= 1), 'pages reach the browser');
const answers = { se_week: '3', se_year: '120', age: '34', bf_n_p1: '4', ac_math: '12', ac_color: 'Teal', birth_year: '1992', ethnicity: ['Asian or Asian American', 'White or European'], income: '$150,000 or more', dq_low_quality: 'No', final_comments: 'Fine.' };
r = await call('/api/lab/data-quality/survey', { body: { token, session: 1, kind: 'pre', data: answers } }); assert(r.json.ok, r.text);
r = await call('/api/lab/data-quality/survey', { body: { token, session: 1, kind: 'post', data: {} } }); assert(r.json.ok && r.json.status.finished, r.text);
r = await call('/api/lab/data-quality/admin/export-surveys.csv', { key: OWNER });
const parseCsv = text => { const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  if (cur || row.length) { row.push(cur); rows.push(row); } return rows; };
const [cols, vals] = parseCsv(r.text);
const col = k => vals[cols.indexOf(k)];
assert.equal(col('age'), '34'); assert.equal(col('birth_year'), '1992'); assert.equal(col('se_year'), '120'); assert.equal(col('ac_math'), '12'); assert.equal(col('dq_low_quality'), 'No'); assert.equal(col('income'), '$150,000 or more');
assert(r.text.includes('Asian or Asian American|White or European'), 'select-all answers are joined with |');
console.log('data-quality end to end ok');

// ---- the live self-test passes on the real content
{ const s = { store: memStore(), type, study }; let t = await runSelfTest(s, { condition: 'main' }); while (!t.done) t = await runSelfTest(s, { code: t.code });
  assert.equal(t.failed, 0, JSON.stringify(t.checks.filter(x => !x.pass))); console.log('data-quality self-test:', t.passed, 'checks passed'); }
console.log('ALL DATA-QUALITY TESTS PASSED');
