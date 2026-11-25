// The structure lock of builder studies (docs/designs/study-builder.md, Phase 4): the first real participant writes
// lock/structure; after that, saves that change arms, sessions, task blocks, block items, arm-only questions or the
// randomization are refused, wording changes pass (marked afterLock), and only an owner reset with no real
// participants left clears it. Studies without builder never lock.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as A from '../../netlify/lib/lab/admin.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { TEMPLATES } from '../../netlify/lib/lab/templates.mjs';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memStore, memBlobs } from './memstore.mjs';

const type = TYPES.multimodal;
const base = () => {
  const c = C.normalize(structuredClone(TEMPLATES['image-video'].content()), type);
  c.design.conditions = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  c.design.randomization = { method: 'blocks', blockSize: 4, seed: 'lock1' };
  c.survey.pre = [{ id: 'saw_a', text: 'Arm A only', type: 'text', sessions: [1], conditions: ['a'] }, { id: 'age', text: 'Age', type: 'text', sessions: [1] }];
  return c;
};
const builder = () => { const c = base(); c.builder = { v: 1 }; return c; };
const study = async (content, id = 'lk') => {
  const S = { store: memStore(), type, study: { id, name: id, type: 'multimodal', codePrefix: 'LK' } };
  const r = await C.saveContent(S.store, type, content, 'T', 0);
  assert(r.ok, JSON.stringify(r));
  return S;
};
const cur = S => C.getContent(S.store, type);
const save = async (S, edit) => { const c = structuredClone(await cur(S)); edit(c); return C.saveContent(S.store, type, c, 'T', c.version); };
const locked = async S => !!(await S.store.get('lock/structure'));

// ---------- structureOf ----------
assert.equal(type.structureOf(base()), null, 'no builder: no fingerprint');
assert.deepEqual(Object.keys(type.structureOf(builder())), ['v', 'arms', 'assignAt', 'sessions', 'armOnly', 'randomization']);
assert.deepEqual(type.structureOf(builder()).armOnly.pre, [['saw_a', ['a']]], 'only arm-only questions are in the fingerprint');

// ---------- when it locks ----------
{
  const S = await study(builder());
  await E.createParticipants(S, 3, { gapDays: 0, test: true });
  assert(!(await locked(S)), 'test sign-ups alone do not lock');
  await E.createParticipants(S, 1, { gapDays: 0 });
  assert(await locked(S), 'one real sign-up locks');
  const stamp = await S.store.get('lock/structure');
  await E.createParticipants(S, 1, { gapDays: 0 });
  assert.deepEqual(await S.store.get('lock/structure'), stamp, 'the first stamp is kept');
}
{
  const S = await study(builder());
  const { created } = await E.createParticipants(S, 1, { gapDays: 0, test: true });
  assert(!(await locked(S)));
  assert((await E.setTest(S, created[0].code, false)).ok);
  assert(await locked(S), 'setTest(false) on a test participant locks');
}
{
  const S = await study(base());
  await E.createParticipants(S, 2, { gapDays: 0 });
  assert(!(await locked(S)), 'a non-builder study never locks');
  const r = await save(S, c => { c.design.conditions.push({ id: 'c', label: 'C' }); c.design.randomization.blockSize = 6; });
  assert(r.ok, 'and its structure can still change: ' + JSON.stringify(r));
  const h = await C.contentHistory(S.store);
  assert(!h[0].afterLock, 'no afterLock mark without a lock');
}
console.log('lock: first real sign-up or setTest(false) locks; test sign-ups and non-builder studies do not');

// ---------- what the lock refuses ----------
{
  const S = await study(builder());
  await E.createParticipants(S, 1, { gapDays: 0 });
  const refused = [
    ['arms', c => { c.design.conditions.push({ id: 'c', label: 'C' }); c.design.randomization.blockSize = 6; }],
    ['arm order', c => c.design.conditions.reverse()],
    ['sessions', c => c.design.sessions.push(structuredClone(c.design.sessions[0]))],
    ['task blocks', c => { const b0 = c.design.sessions[0].blocks[0]; c.design.sessions[0].blocks.push({ title: 'More', items: [b0.items.pop()], randomize: false }); }],
    ['block items', c => c.design.sessions[0].blocks[0].items.reverse()],
    ['arm-only question', c => { c.survey.pre[0].conditions = ['b']; }],
    ['new arm-only question', c => { c.survey.pre[1].conditions = ['a']; }],
    ['block size', c => { c.design.randomization.blockSize = 8; }],
    ['seed', c => { c.design.randomization.seed = 'other'; }],
    ['assign at', c => { c.design.sessions.push(structuredClone(c.design.sessions[0])); c.design.assignAtSession = 2; }],
    ['removing builder', c => { delete c.builder; }],
  ];
  assert(type.structureOf(await cur(S)).sessions[0][0][0].length > 1, 'the template block has more than one item, so reversing it changes the order');
  for (const [what, edit] of refused) {
    const r = await save(S, edit);
    assert.equal(r.error, 'structure_locked', `${what} is refused: ${JSON.stringify(r)}`);
    assert.equal(r.status, 409);
    assert(Array.isArray(r.fields) && r.fields.length, `${what}: fields name the locked parts`);
    assert.match(r.hint, /^Arms, sessions, task blocks, the assignment session, the block size and arm-only questions are locked/);
  }
  const v = (await cur(S)).version;
  assert.equal(v, 1, 'nothing was saved');

  // wording, media and shared questions still change, marked afterLock
  let r = await save(S, c => { c.survey.pre[1].text = 'How old are you?'; c.text[Object.keys(c.text)[0]] = 'New wording here'; c.minutesPerSession = 25; });
  assert(r.ok, JSON.stringify(r));
  r = await save(S, c => { c.survey.post = (c.survey.post || []).concat([{ id: 'shared_end', text: 'Anything else?', type: 'text', sessions: [1] }]); });
  assert(r.ok, 'a shared (not arm-only) question can be added: ' + JSON.stringify(r));
  const h = await C.contentHistory(S.store);
  assert.equal(h[0].afterLock, true); assert.equal(h[1].afterLock, true);
  assert(!h[2].afterLock, 'the save before the lock is not marked');

  // restoring an old version with different arms is refused
  const S2 = await study(builder(), 'lk2');
  assert((await save(S2, c => { c.design.conditions.push({ id: 'c', label: 'C' }); c.design.randomization.blockSize = 6; })).ok);
  await E.createParticipants(S2, 1, { gapDays: 0 });
  r = await C.restoreContent(S2.store, type, 1, 'T');
  assert.equal(r.error, 'structure_locked', 'restoring v1 (two arms) over v2 (three arms) is refused');
  assert.deepEqual(type.structureOf(await cur(S2)).arms, ['a', 'b', 'c']);
}
console.log('lock: structure changes and restores are refused with the hint; wording changes pass, marked afterLock');

// ---------- adding builder ----------
{
  const S = await study(base());
  await E.createParticipants(S, 1, { gapDays: 0 });
  const r = await save(S, c => { c.builder = { v: 1 }; });
  assert.equal(r.error, 'structure_locked', 'adding builder to a study with a real participant is refused');
}

// ---------- delete, setTest and reset ----------
{
  const S = await study(builder());
  const { created } = await E.createParticipants(S, 1, { gapDays: 0 });
  const code = created[0].code;
  await E.consent(S, code, true); await E.startSession(S, code);
  assert.equal((await S.store.list('alloc-arm/')).length, 1);
  assert((await E.setTest(S, code, true)).ok);
  assert(await locked(S), 'setTest(true) on the only real participant leaves the lock');
  assert((await E.setTest(S, code, false)).ok);
  let r = await C.resetStructure(S.store);
  assert.equal(r.error, 'real_participants', 'reset is refused while a real participant remains');
  assert.equal(r.status, 409);
  assert(await locked(S));
  assert((await E.deleteParticipant(S, code)).ok);
  assert(await locked(S), 'deleting the only real participant leaves the lock');
  await E.createParticipants(S, 1, { gapDays: 0, test: true });
  r = await C.resetStructure(S.store);
  assert(r.ok, JSON.stringify(r)); assert.equal(r.wasLocked, true); assert.equal(r.slots, 1);
  assert(!(await locked(S)), 'reset clears the stamp');
  assert.deepEqual(await S.store.list('alloc-arm/'), [], 'and the slots');
  assert((await save(S, c => { c.design.randomization.seed = 'fresh'; })).ok, 'after the reset the structure changes again');
}
console.log('lock: delete and setTest leave it; reset is refused with real participants and clears stamp and slots');

// ---------- allocation.csv: lab owners only for builder studies ----------
{
  const S = await study(builder());
  const h = type.adminRoutes['allocation.csv'].handler;
  const studyOwner = await A.authAdmin(S.store, '', '', Date.now(), { account: { id: 'r1', name: 'R', studyRoles: { lk: 'owner' } }, studyId: 'lk' });
  const labOwner = await A.authAdmin(S.store, '', '', Date.now(), { account: { id: 'o1', name: 'O', labOwner: true }, studyId: 'lk' });
  assert.equal(studyOwner.role, 'owner'); assert(!studyOwner.labOwner);
  assert.equal(labOwner.labOwner, true);
  assert.equal((await h(S, { who: studyOwner })).error, 'lab_owner_only', 'a study owner who is not a lab owner is refused');
  assert((await h(S, { who: labOwner })).csv.startsWith('slot,block,arm,used'));
  const N = await study(base(), 'nb');
  assert((await h(N, { who: { role: 'viewer' } })).csv, 'non-builder studies keep viewer access');
}
console.log('allocation.csv: builder studies open to lab owners only; others unchanged');

// ---------- over HTTP: locked on the content read, structure-reset, allocation.csv ----------
{
  const getStore = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
  const call = async (path, { body, key = OWNER } = {}) => {
    const res = await handle(new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined }), { getStore, env: { LAB_ADMIN_KEY: OWNER } });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  let r = await call('/api/lab/_lab/create', { body: { id: 'lock-http', name: 'Lock', template: 'image-video' } });
  assert(r.json.ok, r.text);
  const P = '/api/lab/lock-http/admin/';
  r = await call(P + 'content-save', { body: { content: builder(), baseVersion: (await call(P + 'content')).json.version || 0 } });
  assert(r.json.ok, r.text);
  assert.equal((await call(P + 'content')).json.locked, undefined, 'not locked yet');
  r = await call(P + 'create', { body: { count: 1 } });
  assert.equal(r.status, 200, r.text);
  const read = (await call(P + 'content')).json;
  assert.equal(read.locked, true, 'the content read says locked');
  const edited = structuredClone(read); edited.design.randomization.seed = 'x';
  r = await call(P + 'content-save', { body: { content: edited, baseVersion: read.version } });
  assert.equal(r.status, 409); assert.equal(r.json.error, 'structure_locked'); assert(r.json.hint && r.json.fields.includes('randomization'), r.text);
  const mgr = (await call(P + 'team-add', { body: { name: 'RA', role: 'manager' } })).json.key;
  assert.equal((await call(P + 'structure-reset', { key: mgr, body: {} })).status, 403, 'a manager cannot reset');
  r = await call(P + 'structure-reset', { body: {} });
  assert.equal(r.status, 409); assert.equal(r.json.error, 'real_participants');
  assert.equal((await call(P + 'allocation.csv', { key: mgr })).json.error, 'lab_owner_only');
  r = await call(P + 'allocation.csv');
  assert(r.text.startsWith('slot,block,arm,used'), r.text);
  const codes = (await call(P + 'participants')).json;
  for (const p of (Array.isArray(codes) ? codes : codes.participants || [])) assert((await call(P + 'delete', { body: { id: p.code } })).json.ok);
  r = await call(P + 'structure-reset', { body: {} });
  assert(r.json.ok, r.text);
  assert.equal((await call(P + 'content')).json.locked, undefined, 'unlocked after reset');
  assert((await call(P + 'activity')).json.some(x => x.action === 'structure.reset'), 'the reset is audited');
}
console.log('lock over HTTP: content read flag, 409 with fields and hint, owner-only audited reset, allocation.csv refusal');
console.log('lock: all checks passed');
