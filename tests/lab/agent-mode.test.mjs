// Agent mode (simulated participants for the sim-panel runner): open only to test participants. A test code's plan
// says agent: true, its recordings carry their words (agentText), and it may skip the equipment checks; a real
// participant gets none of this, whatever the browser sends.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import multimodal from '../../netlify/lib/lab/types/multimodal.mjs';

const getStore = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
const call = async (path, { body, key } = {}) => {
  const req = new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};

let r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'vs2', name: 'Vishing Study 2', template: 'vishing-study2' } });
assert(r.json.ok, r.text);
const P = '/api/lab/vs2/';
assert(!(await call(P + 'content')).text.includes('agentText'), 'the public study content never carries the agent text');

async function begin(creds) {
  const tok = (await call(P + 'login', { body: creds })).json.token; assert(tok, JSON.stringify(creds));
  assert((await call(P + 'consent', { body: { token: tok, agree: true, recording: true } })).json.ok);
  const res = await call(P + 'session', { body: { token: tok } });
  return { tok, plan: res.json, raw: res.text };
}
const check = (tok, index, test, body) => call(P + 'check/' + test, { body: { token: tok, session: 1, index, attempt: 1, ...body } });

// A real participant (a Prolific ID): no agent mode, and asking for it changes nothing.
const real = await begin({ panelId: 'REAL0001' });
assert.equal(real.plan.agent, false, 'a real participant is never in agent mode');
r = await check(real.tok, 0, 'headphones', { agent: true });
assert.equal(r.json.error, 'bad_choices', 'a real participant cannot skip the headphone check: ' + r.text);
r = await check(real.tok, 1, 'word', { agent: true });
assert.notEqual(r.json.pass, true, 'nor the word check');

// A test code made in the admin: agent mode, and both checks can be skipped (recorded as agent: true).
r = await call(P + 'admin/create', { key: OWNER, body: { count: 1, label: 'sim-test', test: true } });
const code = (r.json.created || r.json.codes || [])[0]?.code || (r.json.created || r.json.codes || [])[0];
assert(typeof code === 'string', 'a test code: ' + r.text);
const sim = await begin({ code });
assert.equal(sim.plan.agent, true, 'a test participant may run in agent mode');
assert.deepEqual((await check(sim.tok, 0, 'headphones', { agent: true })).json, { pass: true, attemptsLeft: 0 });
assert.deepEqual((await check(sim.tok, 1, 'word', { agent: true })).json, { pass: true, attemptsLeft: 0 });

// What the browser gets for a recording: its words only in agent mode.
const T = multimodal;
const trial = { item: { id: 'clip-AHF1', kind: 'audio', title: 'Recorded call', media: '/lab/x.mp3', agentText: 'Read me the code.', variant: '' }, block: 1, decision: null };
assert.equal(T.publicTrial(trial, { questions: [] }).item.agentText, undefined, 'no agent text for a real participant');
assert.equal(T.publicTrial(trial, { questions: [], agent: true }).item.agentText, 'Read me the code.', 'the words, for a simulated participant');
console.log('agent mode: test participants only (plan flag, check skip, recording words)');
