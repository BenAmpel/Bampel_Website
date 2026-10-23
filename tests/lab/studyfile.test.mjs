// Study design files and Clone (netlify/lib/lab/studyfile.mjs): the design round-trips (export, import as a new
// study, export again gives the same content), uploaded files travel and their addresses follow the new study,
// completion codes are blanked in a download and replaced by fresh ones in a clone (the redirect address is kept), no participant data is ever in the file, and
// bad files are refused before any study is created.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as SF from '../../netlify/lib/lab/studyfile.mjs';
import { blobsFactory } from './import-helpers.mjs';

const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key = OWNER } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const editable = c => { for (const k of Object.keys(c)) if (k[0] === '_') delete c[k]; return c; };
const strip = c => JSON.parse(JSON.stringify(c).replace(/\/api\/lab\/[a-z0-9-]+\/file\//g, '/api/lab/X/file/'));

// a multimodal study with an uploaded clip, panel codes, and one participant with an answer
assert((await call('/api/lab/_lab/create', { body: { id: 'orig-study', name: 'Original', template: 'audio-judgments', description: 'Clips' } })).json.ok);
const A = '/api/lab/orig-study/admin/';
const up = (await call(A + 'file-upload', { body: { mime: 'audio/mpeg', data: Buffer.from('ID3 fake mp3 bytes').toString('base64'), filename: 'clip one.mp3' } })).json;
assert(up.ok && /^\/api\/lab\/orig-study\/file\/f-[0-9a-f]{12}\.mp3$/.test(up.url), JSON.stringify(up));
const c0 = editable((await call(A + 'content', {})).json);
c0.embedded = [{ name: 'intro_clip', source: 'value', value: up.url }];
c0.enrollment.panel = { ...c0.enrollment.panel, enabled: true, preset: 'prolific', redirectUrl: 'https://app.prolific.com/submissions/complete?cc={code}', completionCode: 'SECRET22', returnCode: 'RET22222' };
assert.equal((await call(A + 'content-save', { body: { content: c0, baseVersion: c0.version } })).status, 200);
const lg = (await call('/api/lab/orig-study/login', { key: null, body: { panelId: 'PANEL0001' } })).json;
await call('/api/lab/orig-study/consent', { key: null, body: { token: lg.token, agree: true } });

// ---------- download ----------
const viewer = (await call(A + 'team-add', { body: { name: 'V', role: 'viewer' } })).json.key;
const d = (await call(A + 'design.json', { key: viewer })).json;
assert.equal(d.format, 'ccair-lab-study'); assert.equal(d.schemaVersion, SF.SCHEMA_VERSION); assert.equal(d.contentVersion, 1);
assert.equal(d.study.type, 'multimodal'); assert.equal(d.study.description, 'Clips');
assert(d.platform.name && d.platform.commit, 'which platform code made it');
assert.equal(d.content.enrollment.panel.completionCode, '', 'codes are blanked in a downloaded file'); assert.equal(d.redacted, true);
assert.equal(d.files.length, 1); assert.equal(d.files[0].filename, 'clip one.mp3'); assert.deepEqual(d.filesLeftOut, []);
const txt = JSON.stringify(d);
assert(!/PANEL0001|"P-[0-9a-f]{16}"|consentedAt|SECRET22|savedBy/.test(txt), 'no participants, panel IDs, codes, or editor names');
assert(!('version' in d.content) && !('savedAt' in d.content), 'only the design, not the version bookkeeping');

// ---------- import as a new study (round trip) ----------
const imp = await call('/api/lab/_lab/create', { body: { design: d, id: 'copy-from-file', name: 'From file' } });
assert.equal(imp.status, 200, imp.text); assert.equal(imp.json.files, 1); assert.equal(imp.json.version, 1);
assert.deepEqual(imp.json.newCodes, ['completionCode', 'screenOutCode', 'returnCode'], 'the blank codes were replaced with fresh ones');
const ic = (await call('/api/lab/copy-from-file/admin/content', {})).json.enrollment.panel;
assert(/^[A-Z0-9]{8}$/.test(ic.completionCode) && ic.completionCode !== 'SECRET22', 'and they are new');
const d2 = (await call('/api/lab/copy-from-file/admin/design.json', {})).json;
assert.equal(d2.study.name, 'From file');
const noCodes = c => { const x = strip(c); for (const k of ['completionCode', 'screenOutCode', 'returnCode']) x.enrollment.panel[k] = ''; return x; };
assert.deepEqual(noCodes(d2.content), noCodes(d.content), 'the same design after the round trip');
assert(d2.content.embedded[0].value.startsWith('/api/lab/copy-from-file/file/'), 'file addresses point at the new study');
const served = await handle(new Request('https://bampel.test' + d2.content.embedded[0].value), { getStore, env });
assert.equal(served.status, 200); assert.equal(Buffer.from(await served.arrayBuffer()).toString(), 'ID3 fake mp3 bytes', 'and the file is there');
assert.deepEqual((await call('/api/lab/copy-from-file/admin/participants', {})).json, [], 'no participants came along');

// ---------- clone ----------
const cl = await call('/api/lab/_lab/clone', { body: { from: 'orig-study', id: 'orig-clone', name: 'Clone' } });
assert.equal(cl.status, 200, cl.text);
const cc = (await call('/api/lab/orig-clone/admin/content', {})).json;
assert(/^[A-Z0-9]{8}$/.test(cc.enrollment.panel.completionCode) && cc.enrollment.panel.completionCode !== 'SECRET22', 'a clone gets a new completion code');
assert(/^[A-Z0-9]{8}$/.test(cc.enrollment.panel.returnCode) && cc.enrollment.panel.returnCode !== 'RET22222', 'and a new returned code');
assert.equal(cc.enrollment.panel.screenOutCode, '', 'a code the original did not have stays empty');
assert.deepEqual(cl.json.newCodes, ['completionCode', 'returnCode'], 'the result says which codes are new');
assert.equal(cc.enrollment.panel.redirectUrl, 'https://app.prolific.com/submissions/complete?cc={code}', 'the redirect address is kept');
assert.equal((await call('/api/lab/orig-study/admin/content', {})).json.enrollment.panel.completionCode, 'SECRET22', 'the original keeps its codes');
assert.deepEqual((await call('/api/lab/orig-clone/admin/participants', {})).json, []);
assert.equal((await call('/api/lab/_lab/clone', { body: { from: 'orig-study', id: 'orig-clone' } })).status, 409, 'the link name is taken');
assert.equal((await call('/api/lab/_lab/clone', { body: { from: 'nope-study', id: 'x-clone' } })).status, 404);
assert.equal((await call('/api/lab/_lab/clone', { key: viewer, body: { from: 'orig-study', id: 'y-clone' } })).status, 403, 'a team key cannot create studies');

// ---------- bad files: refused, and no study is created ----------
const tryImport = async (design, id) => (await call('/api/lab/_lab/create', { body: { design, id } })).json;
assert.match((await tryImport({ hello: 1 }, 'bad-one')).hint, /not a CCAIR Lab study design file/);
assert.match((await tryImport({ ...d, schemaVersion: 99 }, 'bad-two')).hint, /newer version of the lab/);
assert.match((await tryImport({ ...d, study: { ...d.study, type: 'nope' } }, 'bad-three')).hint, /study type/);
const broken = structuredClone(d); broken.content.minutesPerSession = 0;
const br = await tryImport(broken, 'bad-four');
assert.equal(br.error, 'bad_design'); assert(br.errors.some(x => /Minutes per session/.test(x)));
const studies = (await call('/api/lab/_lab/studies', {})).json.map(s => s.id);
assert(!studies.some(id => /^bad-/.test(id)), 'nothing was created for a bad file');

// a large file is left out of a download and listed
const small = await SF.exportDesign({ store: { get: async () => null, list: async () => [] }, type: (await import('../../netlify/lib/lab/types/index.mjs')).TYPES.vignettes, study: { id: 'z', name: 'z', type: 'vignettes' } }).catch(e => e);
assert(small.format === 'ccair-lab-study', 'a study with no saved content exports its defaults');
assert.deepEqual(SF.fileRefs({ a: '/api/lab/s-one/file/f-0123456789ab.mp3', b: ['x /api/lab/s-one/file/f-0123456789ab.mp3', '/api/lab/s-one/file/f-aaaaaaaaaaaa.png'] }), ['f-0123456789ab.mp3', 'f-aaaaaaaaaaaa.png']);
console.log('study design file: download, round trip with media, clone makes new codes, bad files refused');
