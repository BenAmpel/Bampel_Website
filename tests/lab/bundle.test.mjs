// The reproducibility bundle (bundle.mjs): a valid .zip (read back here with zlib, entry by entry, CRC checked) that
// holds the design, codebook, platform version and commit, content versions, citation, and Zenodo metadata, with no
// participant data, for viewers and up, logged in the activity log.
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { zip } from '../../netlify/lib/lab/bundle.mjs';
import { crc32 } from './import-helpers.mjs';
import { blobsFactory } from './import-helpers.mjs';

// A zip reader built from the format, independent of the writer.
function unzip(buf) {
  const out = {}, endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert(endAt >= 0, 'end of central directory');
  let p = buf.readUInt32LE(endAt + 16);
  for (let i = 0; i < buf.readUInt16LE(endAt + 10); i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString();
    const lNameLen = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28), start = local + 30 + lNameLen + lExtra;
    const raw = buf.subarray(start, start + size), data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(data), crc, `${name}: CRC`);
    out[name] = data.toString();
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
assert.deepEqual(unzip(zip([['a.txt', 'hello'], ['b/c.json', '{"x":1}'], ['empty', '']])), { 'a.txt': 'hello', 'b/c.json': '{"x":1}', empty: '' }, 'the writer round-trips');

const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key = OWNER, raw = false } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  return raw ? res : { status: res.status, json: await res.json().catch(() => null) };
};
assert((await call('/api/lab/_lab/create', { body: { id: 'bundle-study', name: 'Bundle "study"', template: 'ab-test' } })).json.ok);
const A = '/api/lab/bundle-study/admin/';
const c = (await call(A + 'content')).json; for (const k of Object.keys(c)) if (k[0] === '_') delete c[k];
c.enrollment.panel = { ...c.enrollment.panel, enabled: true, preset: 'prolific', redirectUrl: 'https://app.prolific.com/submissions/complete?cc={code}', completionCode: 'SECRET77' };
assert.equal((await call(A + 'content-save', { body: { content: c, baseVersion: c.version } })).status, 200);
const c2 = (await call(A + 'content')).json; for (const k of Object.keys(c2)) if (k[0] === '_') delete c2[k];
assert.equal((await call(A + 'content-save', { body: { content: { ...c2, minutesPerSession: 9 }, baseVersion: c2.version } })).status, 200);
const lg = (await call('/api/lab/bundle-study/login', { key: null, body: { panelId: 'PANELX123' } })).json;
await call('/api/lab/bundle-study/consent', { key: null, body: { token: lg.token, agree: true } });

const viewer = (await call(A + 'team-add', { body: { name: 'Viewer V', role: 'viewer' } })).json.key;
const res = await call(A + 'bundle.zip', { key: viewer, raw: true });
assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'application/zip');
assert.match(res.headers.get('content-disposition'), /bundle-study_materials_v2\.zip/);
const files = unzip(Buffer.from(await res.arrayBuffer()));
assert.deepEqual(Object.keys(files).sort(), ['CITATION.cff', 'README.md', 'codebook.csv', 'codebook.md', 'content-versions.csv', 'platform.json', 'study-design.json', 'zenodo-metadata.json']);
const design = JSON.parse(files['study-design.json']), platform = JSON.parse(files['platform.json']), zen = JSON.parse(files['zenodo-metadata.json']);
assert.equal(design.format, 'ccair-lab-study'); assert.equal(design.contentVersion, 2); assert.equal(design.content.minutesPerSession, 9);
assert.equal(platform.contentVersion, 2); assert(platform.platform.commit); assert.equal(platform.study.id, 'bundle-study');
assert.deepEqual(files['content-versions.csv'].trim().split('\n').map(l => l.split(',')[0]), ['version', '1', '2'], 'every version, oldest first');
assert(/^# Codebook: Bundle "study"/.test(files['codebook.md']) && files['codebook.csv'].startsWith('file,column,kind,values,label'));
assert.match(files['README.md'], /How to cite/); assert.match(files['README.md'], /Zenodo/); assert.match(files['README.md'], /no participant data/);
assert.match(files['CITATION.cff'], /^cff-version: 1\.2\.0/); assert.match(files['CITATION.cff'], /title: "Bundle 'study': study materials and codebook"/, 'quotes are made safe in YAML');
assert.equal(zen.upload_type, 'dataset'); assert.equal(zen.version, 'content-2'); assert.match(zen.description, /No participant data/);
const all = Object.values(files).join('\n');
assert(!/SECRET77|PANELX123|P-[0-9a-f]{16}|Viewer V/.test(all), 'no codes, panel IDs, participant IDs, or team names');
assert.equal((await call(A + 'bundle.zip', { key: null, raw: true })).status, 403);
assert((await call(A + 'activity')).json.some(a => a.action === 'bundle.download' && /materials_v2\.zip/.test(a.detail)), 'logged');
console.log('bundle: valid zip, design + codebook + platform + versions + citation + Zenodo metadata, no participant data');
