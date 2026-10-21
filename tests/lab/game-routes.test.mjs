// The game over HTTP through the router: who may call what (participant token, admin roles), a full live game of
// two participants with an injected clock, and the exports (trials, groups, payments, Prolific bonus).
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import { SimClient } from '../../netlify/lib/lab/game/sim.mjs';
import { presetContent } from '../../netlify/lib/lab/game/presets.mjs';
import { rng } from './game-helpers.mjs';

const OWNER = 'owner-key-0123456789abcdef', env = { LAB_ADMIN_KEY: OWNER }, getStore = memBlobs(), clock = { v: Date.UTC(2027, 0, 7, 12) };
const call = async (path, { body, key, method } = {}) => {
  const req = new Request('https://bampel.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env, now: () => clock.v });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, type: res.headers.get('content-type') || '', disp: res.headers.get('content-disposition') || '' };
};
const P = '/api/lab/pgame/', A = P + 'admin/';

// ----- a game study, created and filled in over HTTP -----
let r = await call('/api/lab/_lab/types', { key: OWNER }); assert(r.json.some(t => t.id === 'game'), 'the game type is registered');
r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'pgame', name: 'Prisoner\'s dilemma pilot', type: 'game' } }); assert(r.json.ok, r.text);
r = await call(A + 'content', { key: OWNER }); assert.equal(r.status, 200); assert.equal(r.json._type, 'game');
assert(r.json._meta.presets.length >= 8 && r.json._meta.presets.every(p => p.content && p.content.game), 'the editor gets the presets');
assert.deepEqual(r.json._conditions, ['main']);
const draft = r.json; for (const k of Object.keys(draft)) if (k[0] === '_') delete draft[k];
Object.assign(draft, presetContent('prisoners-dilemma-10')); draft.game.rounds = 3; draft.game.decisionSeconds = 20; draft.payment = { method: 'randomRound', pointsPerUnit: 0.5, currency: 'USD', showUpFee: 1, maxBonus: 2 };
draft.consent.approved = true; draft.enrollment = { ...draft.enrollment, open: false };
r = await call(A + 'content-save', { key: OWNER, body: { content: draft, baseVersion: 0 } }); assert.equal(r.json.ok, true, r.text);
// the check route reports what a save would reject, without saving
const broken = structuredClone(draft); broken.payoff.player = 'my.nothing + 1';
r = await call(A + 'game-check', { key: OWNER, body: { content: broken } }); assert.equal(r.status, 200); assert(r.json.errors.some(e => /"my.nothing" is not a decision/.test(e)));
r = await call(A + 'game-check', { key: OWNER, body: { content: draft } }); assert.deepEqual(r.json.errors, []);
r = await call(A + 'content-save', { key: OWNER, body: { content: broken, baseVersion: 1 } }); assert.equal(r.status, 400); assert(r.json.errors.some(e => /my.nothing/.test(e)), 'a bad formula is refused at save time');
console.log('game study created over HTTP; presets served to the editor; bad formulas are refused at save time');

// ----- participants: the token is required, and only the participant's own game is reachable -----
r = await call(A + 'create', { key: OWNER, body: { count: 3, gapDays: 0 } }); const codes = r.json.created.map(c => c.code);
assert.equal(r.json.created.length, 3);
for (const route of ['poll', 'move', 'ready', 'check', 'fallback', 'ext', 'summary']) {
  assert.equal((await call(P + 'game/' + route, { body: {} })).status, 401, route + ' needs a token');
  assert.equal((await call(P + 'game/' + route, { body: { token: 'P-0000000000000000.1.abc' } })).status, 401, route + ' rejects a forged token');
  assert.equal((await call(P + 'game/' + route)).status, 405, route + ' is POST only');
}
const login = async code => (await call(P + 'login', { body: { code } })).json.token;
const tokens = {}; for (const c of codes) { tokens[c] = await login(c); assert((await call(P + 'consent', { body: { token: tokens[c], agree: true } })).json.ok); }
// a poll before the session starts has nothing to read
assert.equal((await call(P + 'game/poll', { body: { token: tokens[codes[0]], round: 0 } })).json.error, 'no_session');
for (const c of codes) { const plan = (await call(P + 'session', { body: { token: tokens[c] } })).json; assert.equal(plan.total, 3); assert(plan.game.payoffTable, 'a payoff table for a 2x2 game'); assert(!JSON.stringify(plan).includes('payoff"'), 'formulas not sent');
  assert.equal(plan.game.mode, 'live'); assert.equal(plan.game.players, 2); assert(!JSON.stringify(plan.game).includes('"payoff"') && !JSON.stringify(plan.game).includes('answer')); }
// a token for one study does nothing in another
const other = await call('/api/vc/login', { body: { email: 'a@gsu.edu', confirm: true } }); assert.equal((await call(P + 'game/poll', { body: { token: other.json.token, round: 0 } })).status, 401);

// ----- admin roles on the new routes -----
const keyFor = async role => (await call(A + 'team-add', { key: OWNER, body: { name: role + ' person', role } })).json.key;
const viewer = await keyFor('viewer'), editor = await keyFor('editor'), manager = await keyFor('manager');
const expect = async (path, key, status, opts = {}) => { const x = await call(A + path, { key, ...opts }); assert.equal(x.status, status, `${path} as ${key === viewer ? 'viewer' : key === editor ? 'editor' : key === manager ? 'manager' : key === OWNER ? 'owner' : 'nobody'}: ${x.status} ${x.text.slice(0, 80)}`); return x; };
for (const path of ['game-status', 'game-groups', 'groups.csv']) { await expect(path, null, 403); await expect(path, 'wrong-key', 403); await expect(path, viewer, 200); await expect(path, manager, 200); }
for (const path of ['payments', 'payments.csv', 'payments-prolific.csv']) { await expect(path, null, 403); await expect(path, viewer, 403); await expect(path, editor, 403); await expect(path, manager, 200); await expect(path, OWNER, 200); }
for (const path of ['game-resolve', 'game-close']) { await expect(path, viewer, 403, { body: {} }); await expect(path, editor, 403, { body: {} }); await expect(path, null, 403, { body: {} }); }
await expect('game-resolve', manager, 405, {});   // POST only (a GET with a manager key)
assert.equal((await expect('game-resolve', manager, 200, { body: {} })).json.ok, true);
assert.equal((await expect('game-close', manager, 400, { body: { cohort: 'nope' } })).json.error, 'bad_cohort');
assert.equal((await expect('game-close', manager, 404, { body: { cohort: 'c1-0' } })).json.error, 'not_found');
await expect('game-check', viewer, 200, { body: { content: draft } });
await expect('game-check', viewer, 405, {});
console.log('roles: viewer sees status, groups; payments and closing need a manager; every admin route refuses a missing or wrong key; participant routes need the study\'s token');

// ----- a full live game of two participants over HTTP, with Prolific IDs -----
const pair = codes.slice(0, 2), rand = rng('http');
const sims = pair.map(code => new SimClient(code, {
  rand: rng('d' + code), call: (route, body) => call(P + route, { body: { token: tokens[code], ...body } }).then(x => x.json),
  save: (round, values) => call(P + 'trial', { body: { token: tokens[code], session: 1, index: round, data: values ? { values, rtMs: 400 } : {} } }).then(x => x.json) }));
assert((await call(P + 'game/ext', { body: { token: tokens[pair[0]], prolificPid: '5f1c0ffee00000PROLIFIC1', studyId: 'STUDY1', sessionId: 'SESS1' } })).json.ok);
assert((await call(P + 'game/ext', { body: { token: tokens[pair[1]], prolificPid: '=HYPERLINK("http://x")' } })).json.ignored, 'an ID with unsafe characters is ignored');
let ticks = 0;
while (sims.some(s => !s.finished) && ticks++ < 500) {
  await Promise.all(sims.map(s => s.tick(clock.v)));
  const active = sims.filter(s => !s.finished);
  clock.v += active.length && active.every(s => s.last && s.last.phase === 'lobby') ? 5000 : 1000;
}
assert(sims.every(s => s.finished), 'both finished over HTTP');
// the engine finishes the session: end-of-session survey, then done
for (const c of pair) { const s = await call(P + 'survey', { body: { token: tokens[c], session: 1, kind: 'post', data: {} } }); assert.equal(s.json.status.finished, true, 'session complete for ' + c); }
// an early trial call for a round that is not finished yet
const third = codes[2]; await call(P + 'session', { body: { token: tokens[third] } });
assert.equal((await call(P + 'trial', { body: { token: tokens[third], session: 1, index: 0, data: {} } })).json.error, 'round_not_complete', 'a round cannot be confirmed before it is played');

// ----- exports -----
const trials = await call(A + 'export.csv', { key: viewer }); assert.equal(trials.status, 200);
const lines = trials.text.trim().split('\n'), head = lines[0].split(',');
for (const col of ['code', 'condition', 'test', 'session', 'trial_index', 'round', 'practice', 'mode', 'played', 'role', 'cohort', 'group', 'group_id', 'group_size', 'stage', 'step', 'acting', 'd_move', 'o_move', 'strategy', 'auto', 'rt_ms', 'payoff', 'group_total', 'in_payment', 'cum_payoff', 'wait_ms', 'dropped', 'fallback', 'external_id', 'received_at', 'content_version']) assert(head.includes(col), 'trials CSV has ' + col);
assert.equal(lines.length - 1, 2 * 3 * 1, 'one row per participant, round, and stage');
const rows = lines.slice(1).map(l => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
const mine = rows.filter(x => x.code === pair[0]).sort((a, b) => a.trial_index - b.trial_index);
assert.deepEqual(mine.map(x => x.round), ['1', '2', '3']); assert(mine.every(x => x.content_version === '1' && x.stage === 'move' && x.group_id.startsWith('c')));
let cum = 0; for (const x of mine) { cum += Number(x.payoff); assert(Math.abs(Number(x.cum_payoff) - cum) < 1e-9, 'cumulative payoff'); }
assert.equal(mine.filter(x => x.in_payment === '1').length, 1, 'one paid round');
const mate = rows.filter(x => x.code === pair[1]).sort((a, b) => a.trial_index - b.trial_index);
for (let i = 0; i < 3; i++) { assert.equal(mine[i].o_move, mate[i].d_move, 'others\' decisions are the partner\'s'); const a = mine[i].d_move, b = mate[i].d_move; assert.equal(Number(mine[i].payoff), a === 'C' ? (b === 'C' ? 3 : 0) : (b === 'C' ? 5 : 1)); }
const groups = await call(A + 'groups.csv', { key: viewer }); assert(groups.disp.includes('_groups.csv'));
const gl = groups.text.trim().split('\n'); assert(gl[0].split(',').includes('group_id') && gl[0].split(',').includes('members')); assert.equal(gl.length - 1, 3, 'one row per round and group');
const pay = await call(A + 'payments.csv', { key: manager }); const pl = pay.text.trim().split('\n'), ph = pl[0].split(',');
for (const col of ['participant_id', 'condition', 'external_id', 'completed', 'paid_round', 'points', 'bonus', 'show_up_fee', 'total', 'currency']) assert(ph.includes(col), 'payments CSV has ' + col);
const payRows = pl.slice(1).map(l => Object.fromEntries(l.split(',').map((v, i) => [ph[i], v]))), me = payRows.find(x => x.participant_id === pair[0]);
const myPoints = mine.find(x => x.in_payment === '1').payoff;
assert.equal(me.completed, 'yes'); assert.equal(me.external_id, '5f1c0ffee00000PROLIFIC1'); assert.equal(Number(me.points), Number(myPoints)); assert.equal(Number(me.bonus), Math.min(2, Number(myPoints) * 0.5)); assert.equal(Number(me.show_up_fee), 1); assert.equal(Number(me.total), Number(me.bonus) + 1);
assert.equal(Number(me.paid_round), Number(mine.findIndex(x => x.in_payment === '1')) + 1);
assert(!/@/.test(pay.text), 'no email addresses in payments');
const noId = payRows.find(x => x.participant_id === pair[1]); assert.equal(noId.external_id, '');
const prol = await call(A + 'payments-prolific.csv', { key: manager }); const prl = prol.text.trim().split('\n'); assert.equal(prl[0], 'participant_id,amount');
const expectedProlific = Number(me.bonus) > 0; assert.equal(prl.length - 1, expectedProlific ? 1 : 0, 'only participants with an external ID and a bonus');
if (expectedProlific) assert.equal(prl[1], `5f1c0ffee00000PROLIFIC1,${Number(me.bonus).toFixed(2)}`);
const sum = await call(A + 'payments', { key: manager }); assert(sum.json.summary.yes >= 2 && sum.json.summary.withoutExternalId >= 1);
// the participant sees their own payment summary
const summ = await call(P + 'game/summary', { body: { token: tokens[pair[0]] } }); assert.equal(summ.json.points, Number(myPoints)); assert.equal(summ.json.currency, 'USD');
// status
const stat = await call(A + 'game-status', { key: viewer }); assert.equal(stat.json.cohorts.length, 1); assert.equal(stat.json.cohorts[0].status, 'playing'); assert(stat.json.cohorts[0].finished);
console.log('full live game over HTTP: 2 participants, 3 rounds; trials, groups, payments, and Prolific CSVs; Prolific ID kept only when well formed; no emails');

// ----- a larger group over HTTP, polling concurrently, one participant stops responding -----
{
  const ID = 'pgoods', Q = `/api/lab/${ID}/`, QA = Q + 'admin/';
  assert((await call('/api/lab/_lab/create', { key: OWNER, body: { id: ID, name: 'Public goods pilot', type: 'game' } })).json.ok);
  const d2 = (await call(QA + 'content', { key: OWNER })).json; for (const k of Object.keys(d2)) if (k[0] === '_') delete d2[k];
  Object.assign(d2, presetContent('public-goods')); d2.game.rounds = 3; d2.game.cohortGroups = 2; d2.game.decisionSeconds = 20; d2.game.dropAfterTimeouts = 2; d2.consent.approved = true;
  assert((await call(QA + 'content-save', { key: OWNER, body: { content: d2, baseVersion: 0 } })).json.ok);
  const cs = (await call(QA + 'create', { key: OWNER, body: { count: 8, gapDays: 0 } })).json.created.map(c => c.code), toks = {};
  for (const c of cs) { toks[c] = (await call(Q + 'login', { body: { code: c } })).json.token; await call(Q + 'consent', { body: { token: toks[c], agree: true } }); assert.equal((await call(Q + 'session', { body: { token: toks[c] } })).json.total, 3); }
  const bots = cs.map(code => new SimClient(code, { rand: rng('pg' + code), call: (route, body) => call(Q + route, { body: { token: toks[code], ...body } }).then(x => x.json),
    save: (round, values) => call(Q + 'trial', { body: { token: toks[code], session: 1, index: round, data: values ? { values } : {} } }).then(x => x.json) }));
  const quitter = bots[7]; let n = 0;
  while (bots.some(b => !b.finished && !b.stopped) && n++ < 3000) {
    await Promise.all(bots.map(b => b.tick(clock.v)));
    if (quitter.round >= 1) quitter.stop();
    const active = bots.filter(b => !b.finished && !b.stopped), waiting = active.filter(b => b.last && ['lobby', 'wait'].includes(b.last.phase));
    let jump = 1000;
    if (waiting.length === active.length) { const dl = active.map(b => b.last.deadlineAt ? b.last.deadlineAt - clock.v + 2600 : null).filter(x => x > 0); jump = active.every(b => b.last.phase === 'lobby') ? 5000 : dl.length ? Math.max(1000, Math.min(...dl)) : 30000; }
    clock.v += jump;
  }
  assert(bots.slice(0, 7).every(b => b.finished), 'the seven who stayed finished');
  const tx = (await call(QA + 'export.csv', { key: OWNER })).text.trim().split('\n'), hh = tx[0].split(','), rr = tx.slice(1).map(l => Object.fromEntries(l.split(',').map((v, i) => [hh[i], v])));
  assert.equal(rr.length, 8 * 3, 'one row per participant and round');
  const byGroup = {}; for (const x of rr) (byGroup[x.group_id] = byGroup[x.group_id] || []).push(x);
  assert.equal(Object.keys(byGroup).length, 2 * 3, 'two groups in each of three rounds'); 
  for (const [gid, mem] of Object.entries(byGroup)) { assert.equal(mem.length, 4, gid); const tot = mem.reduce((a, x) => a + Number(x.d_contribution), 0); for (const x of mem) assert(Math.abs(Number(x.payoff) - (20 - Number(x.d_contribution) + 0.4 * tot)) < 1e-9, 'payoff equals the formula in ' + gid); }
  for (let rd = 0; rd < 3; rd++) assert.equal(new Set(rr.filter(x => Number(x.trial_index) === rd).map(x => x.code)).size, 8, 'each participant in exactly one group per round');
  const quitRows = rr.filter(x => x.code === quitter.pid); assert(quitRows.slice(1).every(x => x.auto === '1'), 'the participant who stopped was played automatically from round 2 on');
  assert.equal(quitRows.find(x => x.trial_index === '2').dropped, '1');
  const st2 = (await call(QA + 'game-status', { key: OWNER })).json; assert.equal(st2.cohorts.length, 1); assert.equal(st2.cohorts[0].members, 8); assert.equal(st2.cohorts[0].dropped, 1);
  const pays = (await call(QA + 'payments.csv', { key: OWNER })).text.trim().split('\n'); assert.equal(pays.length - 1, 8);
  console.log('8 participants over HTTP in two groups with strangers matching and one participant who stopped: groups, payoffs, drop-out, and status are consistent');
}

// ----- the self-test route (owner only) -----
assert.equal((await call(A + 'self-test', { key: manager, body: { condition: 'main' } })).status, 403);
let st = await call(A + 'self-test', { key: OWNER, body: { condition: 'main' } }), n = 0; assert(st.json && !st.json.error, st.text);
while (!st.json.done && n++ < 200) st = await call(A + 'self-test', { key: OWNER, body: { code: st.json.code } });
assert.equal(st.json.failed, 0, JSON.stringify(st.json.checks.filter(c => !c.pass)));
console.log('self-test over HTTP:', st.json.passed, 'checks passed');
// deleting a participant removes their game records and nothing else of the others'
const del = await call(A + 'delete', { key: OWNER, body: { id: pair[1] } }); assert.equal(del.json.ok, true);
const left = await call(A + 'export.csv', { key: viewer }); assert(!left.text.includes(pair[1]) && left.text.includes(pair[0]));
const keys = await (async () => { const s = getStore({ name: 'lab-pgame' }); const all = []; for await (const pg of s.list({ prefix: 'g/' })) for (const b of pg.blobs) all.push(b.key); return all; })();
assert(!keys.some(k => k.includes(pair[1])), 'no game key mentions the deleted participant'); assert(keys.some(k => k.includes(pair[0])));
console.log('deleting a participant removes their game keys');
console.log('ALL GAME ROUTE TESTS PASSED');
