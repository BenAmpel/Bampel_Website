// Sealed fields (netlify/lib/lab/seal.mjs, static/lab/engine/seal.js): the scheme round-trips, refuses a wrong key and a
// changed token, opens CSV and JSON exports safely, agrees with the browser copy, and through the routes seals the email,
// the panel ID, identifying embedded data and free text, while the redirect still gets the participant's own panel ID.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handle } from '../../netlify/lib/lab/router.mjs';
import * as S from '../../netlify/lib/lab/seal.mjs';
import { cleanAnswers, resolveEmbedded } from '../../netlify/lib/lab/engine.mjs';
import * as R from '../../netlify/lib/lab/recruit.mjs';
import { blobsFactory } from './import-helpers.mjs';

// ---------- the scheme ----------
const { publicKey, privateKey } = S.generateKeys('t');
const seal = S.sealer(publicKey);
const t1 = seal('ann@gsu.edu'), t2 = seal('ann@gsu.edu');
assert(S.isSealed(t1) && t1 !== t2, 'a fresh key pair per value: the same value never seals the same way twice');
assert.equal(S.unseal(t1, privateKey), 'ann@gsu.edu');
assert.equal(seal(''), ''); assert.equal(seal(null), null); assert.equal(seal(t1), t1, 'empty and already sealed values are left alone');
assert.throws(() => S.unseal(t1, S.generateKeys().privateKey), /not this key/);
assert.throws(() => S.unseal(t1.slice(0, -4) + (t1.endsWith('AAAA') ? 'BBBB' : 'AAAA'), privateKey), 'a changed token fails authentication');
assert.equal(S.checkPublicKey('short'), null); assert.equal(S.checkPublicKey(Buffer.alloc(32).toString('base64url')), null, 'the all-zero key is refused');
assert.equal(S.checkPublicKey(publicKey).kid, privateKey.kid);
{
  const csv = `email,note\n${seal('=HYPERLINK("x")')},1\n${seal('a, "b"')},2\n${S.sealer(S.generateKeys().publicKey)('other')},3\n`;
  const r = S.unsealText(csv, privateKey);
  assert.equal(r.opened, 2); assert.equal(r.other, 1, 'a value sealed with another key is left as it is');
  assert(r.text.includes(`"'=HYPERLINK(""x"")"`), 'an opened value can never become a spreadsheet formula');
  assert(r.text.includes('"a, ""b"""'), 'commas and quotes are quoted');
  const j = S.unsealText(JSON.stringify({ text: seal('line 1\n"two"') }), privateKey, { format: 'json' });
  assert.deepEqual(JSON.parse(j.text), { text: 'line 1\n"two"' }, 'inside JSON the value stays valid JSON');
}
console.log('scheme: round trip, wrong key, tampering, CSV and JSON opening');

// ---------- the browser copy agrees ----------
{
  const ctx = { window: { crypto: globalThis.crypto }, TextEncoder, TextDecoder, atob };
  vm.runInNewContext(readFileSync(new URL('../../static/lab/engine/seal.js', import.meta.url), 'utf8'), ctx);
  const B = ctx.window.LabSeal;
  if (await B.supported()) {
    const made = await B.generate('t');
    assert.equal(made.kid, S.kidOf(made.publicKey), 'the browser computes the same key ID');
    const tok = S.sealer(made.publicKey)('typed in a text box');
    assert.equal(S.unseal(tok, made.file), 'typed in a text box', 'the node side opens with a browser-made key file');
    await B.load(JSON.stringify(made.file));
    assert.equal(await B.open(tok), 'typed in a text box', 'the browser opens what the server sealed');
    const r = await B.openText(`a\n${tok}\n${S.sealer(publicKey)('x')}\n`, 'csv');
    assert.equal(r.opened, 1); assert.equal(r.other, 1);
    console.log('browser copy: same key IDs, opens server tokens');
  } else console.log('browser copy: skipped (this Node has no WebCrypto X25519)');
}

// ---------- engine pieces ----------
{
  const items = [{ id: 'why', type: 'text' }, { id: 'age', type: 'number' }, { id: 'pick', type: 'choice', options: [{ value: 'a' }] }];
  const out = cleanAnswers({ why: 'because', age: '30', pick: 'a' }, items, { seal });
  assert(S.isSealed(out.why) && S.unseal(out.why, privateKey) === 'because', 'free text is sealed');
  assert.equal(out.age, '30'); assert.equal(out.pick, 'a', 'numbers and choices are not');
  const log = S.sealLog([{ name: 'why', value: 'bec' }, { name: 'pick', value: 'a' }], items, seal);
  assert(S.isSealed(log[0].value) && log[1].value === 'a', 'the answer log seals free-text entries only');
  const ed = resolveEmbedded([{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }, { name: 'wave', source: 'url', param: 'wave' }, { name: 'src', source: 'url', param: 'src', sensitive: true },
    { name: 'participant', source: 'value', value: 'x' }], { prolific_pid: '5f00aa', wave: '2', src: 'mail' }, { seal });
  assert(S.isSealed(ed.prolific_pid) && S.isSealed(ed.src), 'identifying link data is sealed');
  assert.equal(ed.wave, '2'); assert.equal(ed.participant, 'x', 'other link data and constants are not');
  assert(!S.sensitiveEmbedded({ source: 'url', name: 'email', sensitive: false }), 'a researcher can mark a field as not identifying');
  assert(S.sensitiveEmbedded({ source: 'url', name: 'who', param: 'who' }, 'who'), 'the panel ID parameter always is');
  console.log('engine: free text, answer log, embedded data');
}

// ---------- the redirect ----------
{
  const pn = { enabled: true, redirectUrl: 'https://x.test/?c={code}&id={pid}', returnCode: 'RET23456' };
  const st = { get: async () => ({ panelId: seal('SONA12345') }) };
  assert.equal((await R.handoff({ store: st }, { returnedAt: 1 }, {}, pn, '')).url, '', 'a sealed ID never goes into an address');
  assert.equal((await R.handoff({ store: st }, { returnedAt: 1 }, {}, pn, 'SONA12345')).url, 'https://x.test/?c=RET23456&id=SONA12345', 'the ID the tab sent is used');
}

// ---------- through the routes ----------
const getStore = blobsFactory(), OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER };
const call = async (path, { body, key } = {}) => {
  const res = await handle(new Request('https://bampel.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }), { getStore, env });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const editable = c => { for (const k of Object.keys(c)) if (k[0] === '_') delete c[k]; return c; };
assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'seal-test', name: 'Seal test', template: 'survey' } })).json.ok);
const P = '/api/lab/seal-test/', A = P + 'admin/';
assert.deepEqual((await call(A + 'seal', { key: OWNER })).json, { enabled: false, previous: [] });
const viewerKey = (await call(A + 'team-add', { key: OWNER, body: { name: 'V', role: 'viewer' } })).json.key;
assert.equal((await call(A + 'seal', { key: viewerKey })).status, 200, 'a viewer may see whether sealing is on');
assert.equal((await call(A + 'seal-set', { key: viewerKey, body: { publicKey } })).status, 403, 'only an owner sets the key');
assert.equal((await call(A + 'seal-set', { key: OWNER, body: { publicKey: 'nope' } })).status, 400);
assert.equal((await call(A + 'seal-set', { key: OWNER, body: { publicKey } })).json.kid, privateKey.kid);
assert.equal((await call(A + 'seal', { key: OWNER })).json.kid, privateKey.kid);

const cur = editable((await call(A + 'content', { key: OWNER })).json);
cur.enrollment.open = true; cur.enrollment.domains = ['gsu.edu'];
cur.enrollment.panel = { ...cur.enrollment.panel, enabled: true, param: 'id' };
cur.embedded = [{ name: 'id', source: 'url', param: 'id' }, { name: 'wave', source: 'value', value: '1' }];
const saved = await call(A + 'content-save', { key: OWNER, body: { content: cur, baseVersion: cur.version } });
assert.equal(saved.status, 200, saved.text);

const lg = await call(P + 'login', { body: { panelId: 'SONA12345' } });
assert.equal(lg.status, 200, lg.text);
assert.equal((await call(P + 'login', { body: { email: 'Ann.Lee@gsu.edu', confirm: true } })).status, 200);
const credit = (await call(A + 'credit.csv', { key: OWNER })).text;
assert(!credit.includes('SONA12345') && !/ann\.lee/i.test(credit), 'neither the panel ID nor the email is stored readably');
const opened = S.unsealText(credit, privateKey).text;
assert(opened.includes('SONA12345') && opened.includes('ann.lee@gsu.edu'), 'the key opens both');
const backup = (await call(A + 'export.json', { key: OWNER })).text;
assert(!backup.includes('SONA12345'), 'and neither is in the research export');

await call(P + 'consent', { body: { token: lg.json.token, agree: true } });
const ses = await call(P + 'session', { body: { token: lg.json.token, session: 1, embedded: { id: 'SONA12345' } } });
assert.equal(ses.status, 200, ses.text);
assert(!ses.text.includes('SONA12345'), 'the plan sent back holds the sealed ID');

assert.equal((await call(A + 'seal-set', { key: OWNER, body: { publicKey: null } })).json.enabled, false);
const off = (await call(A + 'seal', { key: OWNER })).json;
assert.equal(off.enabled, false); assert.equal(off.previous[0].kid, privateKey.kid, 'a replaced key is remembered');
assert((await call(A + 'activity', { key: OWNER })).json.some(x => x.action === 'seal.set'), 'key changes are in the activity log');
console.log('routes: key set by owners only; email, panel ID and link data sealed; credit list opens with the key');
