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
  const ctx = { window: { crypto: globalThis.crypto }, TextEncoder, TextDecoder, atob, btoa };
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
    const fromBrowser = await B.seal(publicKey, privateKey.kid, 'written in the browser, "quoted"');
    assert.equal(S.unseal(fromBrowser, privateKey), 'written in the browser, "quoted"', 'the server key file opens what the browser sealed');
    assert(S.sealer(publicKey).accepts(fromBrowser), 'and the server accepts it as this study\'s');
    assert(!S.sealer(S.generateKeys().publicKey).accepts(fromBrowser), 'another study does not');
    assert.equal(await B.seal(publicKey, privateKey.kid, ''), '');
    globalThis.browserSeal = v => B.seal(publicKey, privateKey.kid, v);
    console.log('browser copy: same key IDs, opens server tokens, seals for the server');
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
const ok2 = (r, status) => { if (status) { assert.equal(r.status, status); return null; } assert(r.status >= 200 && r.status < 300, r.text); return r.json; };
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

// ---------- end to end: free text sealed in the browser ----------
if (globalThis.browserSeal) {
  ok2(await call(A + 'seal-set', { key: OWNER, body: { publicKey } }));
  const c2 = editable((await call(A + 'content', { key: OWNER })).json);
  for (const q of c2.survey.pre) delete q.displayIf;
  c2.enrollment.panel = { ...c2.enrollment.panel, enabled: false };
  assert.equal((await call(A + 'content-save', { key: OWNER, body: { content: c2, baseVersion: c2.version } })).status, 200);
  const pub2 = (await call(P + 'content')).json.seal;
  assert.equal(pub2.publicKey, publicKey); assert.equal(pub2.kid, privateKey.kid);
  assert(pub2.text.includes('mfa_why') && !pub2.text.includes('age'), 'the page learns which questions are free text');
  assert(!JSON.stringify(pub2).includes(privateKey.d), 'and never the private key');

  const start = async email => {
    const t = (await call(P + 'login', { body: { email, confirm: true } })).json.token;
    await call(P + 'consent', { body: { token: t, agree: true } });
    assert.equal((await call(P + 'session', { body: { token: t, session: 1 } })).status, 200);
    return t;
  };
  const records = async () => (await call(A + 'export.json', { key: OWNER })).json.records || [];
  const answers = { sec_important: '3', sec_confident: '3', mfa: c2.survey.pre.find(q => q.id === 'mfa').options[0].value, age: '30', gender: c2.survey.pre.find(q => q.id === 'gender').options[0].value,
    vish_before: c2.survey.pre.find(q => q.id === 'vish_before').options[0].value };

  // Browser sealing on: the token arrives and is stored exactly as sent; the record says the browser sealed it.
  const tA = await start('bea@gsu.edu'), tok = await globalThis.browserSeal('my own words');
  const sv = await call(P + 'survey', { body: { token: tA, session: 1, kind: 'pre', data: { ...answers, mfa_why: tok } } });
  assert.equal(sv.status, 200, sv.text);
  let rec = (await records()).find(r => r.data && r.data.mfa_why === tok);
  assert(rec, 'the browser\'s token is stored as it came: the server never saw the words');
  assert.deepEqual(rec.sealed, { browser: 1, server: 0 });
  assert.equal(S.unseal(rec.data.mfa_why, privateKey), 'my own words');

  // A token for another key is dropped, not stored unreadable.
  const tB = await start('cy@gsu.edu');
  await call(P + 'survey', { body: { token: tB, session: 1, kind: 'pre', data: { ...answers, age: '41', mfa_why: S.sealer(S.generateKeys().publicKey)('x') } } });
  rec = (await records()).find(r => r.data && r.data.age === '41');
  assert(rec && rec.data.mfa_why === undefined, 'a token sealed with another key is dropped');

  // An old browser (plain text): sealed by the server and counted as such, unless browser sealing is required.
  const tC = await start('dee@gsu.edu');
  await call(P + 'survey', { body: { token: tC, session: 1, kind: 'pre', data: { ...answers, age: '52', mfa_why: 'typed in an old browser' } } });
  rec = (await records()).find(r => r.data && r.data.age === '52');
  assert(S.isSealed(rec.data.mfa_why) && rec.sealed.server === 1, 'the server seals what the browser could not, and says so');
  assert.equal(ok2(await call(A + 'seal-set', { key: viewerKey, body: { requireBrowser: true } }) , 403), null);
  assert.equal((await call(A + 'seal-set', { key: OWNER, body: { requireBrowser: true } })).json.requireBrowser, true);
  assert.equal((await call(P + 'content')).json.seal.requireBrowser, true, 'the participant page is told, so it can turn old browsers away');
  const tD = await start('eli@gsu.edu');
  const refused = await call(P + 'survey', { body: { token: tD, session: 1, kind: 'pre', data: { ...answers, age: '63', mfa_why: 'plain' } } });
  assert.equal(refused.status, 400); assert.equal(refused.json.error, 'seal_required', 'required: readable free text is refused');
  assert(!(await records()).some(r => r.data && r.data.age === '63'), 'and nothing is written');
  assert.equal((await call(P + 'survey', { body: { token: tD, session: 1, kind: 'pre', data: { ...answers, age: '63', mfa_why: await globalThis.browserSeal('sealed') } } })).status, 200, 'a sealed answer is accepted');
  assert.equal((await call(P + 'survey', { body: { token: (await start('fay@gsu.edu')), session: 1, kind: 'pre', data: { ...answers, age: '64' } } })).status, 200, 'no free text at all is fine');
  assert((await call(A + 'activity', { key: OWNER })).json.some(x => x.action === 'seal.require_browser'));
  const edTok = await globalThis.browserSeal('5f00aa');
  assert.equal(resolveEmbedded([{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }], { prolific_pid: edTok }, { seal: S.sealer(publicKey) }).prolific_pid, edTok, 'link data sealed in the browser is kept as sent');
  assert.equal(resolveEmbedded([{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }], { prolific_pid: S.sealer(S.generateKeys().publicKey)('x') }, { seal: S.sealer(publicKey) }).prolific_pid, '', 'and another study\'s token is dropped');
  console.log('end to end: browser tokens stored as sent; other keys dropped; old browsers sealed on the server or refused when required');
}
