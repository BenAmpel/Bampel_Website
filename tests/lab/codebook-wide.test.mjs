// The per-study codebook (codebook.mjs) and the wide export (wide.mjs), on a two-condition vignette study run by
// the live self-test: every column of the real trials and surveys CSVs is in the codebook with its values and who it
// applies to, every wide column matches a codebook pattern, wide values equal the long ones, and the CSVs neutralize
// formulas.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { blobsFactory } from './import-helpers.mjs';

const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key = OWNER } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, type: res.headers.get('content-type') };
};
const parseCsv = text => {   // enough for these files: quoted cells, doubled quotes, commas and newlines inside quotes
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  return rows;
};
const objects = text => { const [h, ...rs] = parseCsv(text); return rs.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };

assert((await call('/api/lab/_lab/create', { body: { id: 'cb-study', name: 'Codebook study', template: 'ab-test' } })).json.ok);
const A = '/api/lab/cb-study/admin/';
const c = (await call(A + 'content', {})).json; for (const k of Object.keys(c)) if (k[0] === '_') delete c[k];
const conds = c.design.conditions.map(x => x.id);
assert(conds.length >= 2, 'a two-arm design');
c.embedded = [{ name: 'src', source: 'url', param: 'SRC' }];
c.survey.pre = [
  { id: 'trust', text: 'I trust phone calls from my bank.', type: 'scale', n: 5, labels: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'], required: true, sessions: [1], conditions: [], showIf: 'always' },
  { id: 'arm_only', text: '=SUM(1,2) Only in the first arm', type: 'text', sessions: [1], conditions: [conds[0]], showIf: 'always' },
  { id: 'note', text: 'Thanks', type: 'info', sessions: [1], conditions: [], showIf: 'always' }
];
c.survey.post = [{ id: 'devices', text: 'Which devices do you own?', type: 'multi', options: [{ value: 'phone', label: 'A phone' }, { value: 'pc', label: 'A computer' }], sessions: [], conditions: [], showIf: 'always' }];
const sv = await call(A + 'content-save', { body: { content: c, baseVersion: c.version } });
assert.equal(sv.status, 200, sv.text);

// two simulated participants (one per arm), kept so their data can be exported
for (const cond of conds.slice(0, 2)) {
  let r = (await call(A + 'self-test', { body: { condition: cond, keep: true } })).json;
  while (!r.done) r = (await call(A + 'self-test', { body: { code: r.code } })).json;
  assert.equal(r.failed, 0, JSON.stringify(r.checks.filter(x => !x.pass)));
}

// ---------- codebook ----------
const cbr = await call(A + 'codebook.csv', {});
assert.match(cbr.type, /text\/csv/);
const cb = objects(cbr.text);
const inBook = file => new Set(cb.filter(x => x.file === file).map(x => x.column));
const trialsHead = parseCsv((await call(A + 'export.csv', {})).text)[0], surveysHead = parseCsv((await call(A + 'export-surveys.csv', {})).text)[0];
assert(trialsHead.length > 15 && surveysHead.length > 8);
for (const col of trialsHead) assert(inBook('trials').has(col), `trials column ${col} is in the codebook`);
for (const col of surveysHead) assert(inBook('surveys').has(col), `surveys column ${col} is in the codebook`);
const trust = cb.find(x => x.column === 'trust');
assert.equal(trust.values, '1 = Strongly disagree; 2 = Disagree; 3 = Neutral; 4 = Agree; 5 = Strongly agree');
assert.equal(trust.label, 'I trust phone calls from my bank.'); assert.equal(trust.required, '1'); assert.match(trust.applies_to, /start of session 1/);
const armOnly = cb.find(x => x.column === 'arm_only');
assert.match(armOnly.applies_to, new RegExp(`conditions ${conds[0]}`), 'who a question applies to');
assert.equal(armOnly.label, "'=SUM(1,2) Only in the first arm", 'a formula in a question is neutralized in the CSV');
assert.match(cb.find(x => x.column === 'devices').values, /any of \(\| separated\): phone = A phone; pc = A computer/);
assert(!cb.some(x => x.column === 'note'), 'descriptive text has no column');
assert.match(cb.find(x => x.column === 'ed_src').values, /link parameter SRC/);
assert.equal(cb.find(x => x.column === 'condition' && x.file === 'trials').values, conds.join('; '));
const itemQ = c.questions.find(q => q.type !== 'info');
assert.equal(cb.find(x => x.column === 'a_' + itemQ.id).label, itemQ.text, 'per-item questions too');

const mdr = await call(A + 'codebook.md', {});
assert.match(mdr.type, /text\/markdown/);
assert(mdr.text.startsWith('# Codebook: Codebook study') && /\| `trust` \| integer \|/.test(mdr.text) && /## Wide CSV/.test(mdr.text) && /commit [0-9a-f]{7,}|commit unknown/.test(mdr.text));
assert.equal((await call(A + 'codebook.csv', { key: null })).status, 403, 'admin only');
console.log('codebook: every trials and surveys column, values with labels, applies-to, formulas neutralized, Markdown');

// ---------- wide ----------
const parts = (await call(A + 'participants', {})).json;
const codes = parts.map(p => p.code);
const wide = (await call(A + 'rows?kind=wide&codes=' + codes.join(','), {})).json;
assert.equal(wide.length, 2, 'one row per participant');
const csvWide = objects((await call(A + 'export-wide.csv', {})).text);
assert.equal(csvWide.length, 2);
const wideHead = parseCsv((await call(A + 'export-wide.csv', {})).text)[0];
assert.deepEqual(wideHead.slice(0, 5), ['code', 'condition', 'test', 'label', 'self_signup']);
const patterns = cb.filter(x => x.file === 'wide').map(x => new RegExp('^' + x.column.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[a-z]+\}/g, '[a-z0-9_]+') + '$'));
for (const col of wideHead) assert(patterns.some(re => re.test(col)), `wide column ${col} matches a codebook pattern`);
const longT = objects((await call(A + 'export.csv', {})).text), longS = objects((await call(A + 'export-surveys.csv', {})).text);
let compared = 0;
for (const t of longT) {
  const w = wide.find(x => x.code === t.code), item = t.item_id.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  for (const [k, v] of Object.entries(t)) if (/^a_|^rt_ms$/.test(k)) { assert.equal(String(w[`s${t.session}_${item}_${k}`] ?? ''), v, `${t.code} ${item} ${k}`); compared++; }
}
for (const s of longS) { const w = wide.find(x => x.code === s.code); assert.equal(String(w[`s${s.session}_${s.survey}_trust`] ?? ''), s.trust ?? ''); }
assert(compared > 4, 'trial values compared');
for (const w of wide) {
  assert.equal(w.sessions_completed, w.total_sessions); assert.equal(w.finished, 1); assert.equal(w.consented, 1); assert.equal(w.test, 1);
  assert(w.s1_started_at && Number(w.s1_minutes) >= 0);
  assert(!Object.keys(w).some(k => /_received_at$|_item_title$|_content_version$/.test(k)), 'no repeated identifiers or timestamps per trial');
}
console.log('wide: one row per participant, every column documented, values equal the long exports');

// every trials column is documented for the other study types too (multimodal with a call; alert triage)
for (const [id, make] of [['cb-mm', { template: 'vishing-training' }], ['verification', null]]) {
  if (make) assert((await call('/api/lab/_lab/create', { body: { id, name: id, ...make } })).json.ok);
  const B = `/api/lab/${id}/admin/`, cond = (await call(B + 'me', {})).json.conditions[0];
  let r = (await call(B + 'self-test', { body: { condition: cond, keep: true } })).json;
  while (!r.done) r = (await call(B + 'self-test', { body: { code: r.code } })).json;
  const book = new Set(objects((await call(B + 'codebook.csv', {})).text).filter(x => x.file === 'trials').map(x => x.column));
  const head = parseCsv((await call(B + 'export.csv', {})).text)[0];
  assert(head.length > 20, id);
  for (const col of head) assert(book.has(col), `${id}: trials column ${col} is in the codebook`);
}
console.log('codebook: multimodal and alert-triage trial columns documented');
