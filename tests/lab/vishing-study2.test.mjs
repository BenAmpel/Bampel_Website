// Vishing Study 2, step 1 (screening), end to end over HTTP with in-memory stores: required recording consent,
// eligibility screen-outs (IL/TX/WA, age, equipment), the headphone and spoken-word equipment checks (scored on the
// server, two attempts, a speech-server outage never counts against the participant), and deferred arm
// assignment: only people who pass screening get an arm or a cond/ marker.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import { saidWord } from '../../netlify/lib/lab/asr.mjs';

const getStore = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
const call = async (path, { body, key } = {}) => {
  const req = new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};

// A stand-in for the lab's whisper-server: it "hears" every check word, or nothing.
let heard = 'harbor garden pencil window rocket blanket candle ladder turtle button';
const fake = createServer((req, res) => { req.resume(); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ text: heard })); }); });
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const ASR_URL = `http://127.0.0.1:${fake.address().port}/inference`;
delete process.env.LAB_ASR_URL;

// a tiny valid WAV (16 kHz mono, 0.1 s of silence)
const wav = (() => { const n = 1600, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b.toString('base64'); })();

assert(saidWord(' A blanket.\n', 'blanket') && saidWord('Harbour', 'harbor') && !saidWord('garden', 'harbor') && !saidWord('', 'harbor'));

let r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'vs2', name: 'Vishing Study 2', template: 'vishing-study2' } });
assert(r.json.ok, r.text);
const P = '/api/lab/vs2/', store = getStore({ name: 'lab-vs2' });
const markers = async () => { const out = []; for await (const page of store.list({ prefix: 'cond/' })) out.push(...page.blobs.map(b => b.key)); return out; };
const pub = (await call(P + 'content')).json;
assert.equal(pub.continuous, true); assert.equal(pub.panel.param, 'PROLIFIC_PID'); assert.equal(pub.consent.approved, false, 'draft consent shows the banner');
assert(!(await call(P + 'content')).text.includes('"harbor"'), 'check words never reach the browser');

const ELIGIBLE = { elig_age: 'yes', elig_state: 'georgia', elig_equipment: 'yes', elig_quiet: 'yes', future_contact: 'no' };
async function start(pid, eligibility = ELIGIBLE) {
  const tok = (await call(P + 'login', { body: { panelId: pid } })).json.token; assert(tok, pid);
  const noRec = await call(P + 'consent', { body: { token: tok, agree: true, recording: false } });
  assert.equal(noRec.json.error, 'recording_required', 'audio consent is required');
  assert((await call(P + 'consent', { body: { token: tok, agree: true, recording: true } })).json.ok);
  const plan = (await call(P + 'session', { body: { token: tok } })).json;
  assert.equal(plan.session, 1); assert.equal(plan.trials.length, 2);
  assert.deepEqual(plan.preItems.map(x => x.id).filter(x => x.startsWith('elig_') && x !== 'elig_intro'), ['elig_age', 'elig_state', 'elig_equipment', 'elig_quiet']);
  const sv = (await call(P + 'survey', { body: { token: tok, session: 1, kind: 'pre', data: eligibility } })).json;
  return { tok, plan, sv };
}
const hp = (tok, attempt, choices) => call(P + 'check/headphones', { body: { token: tok, session: 1, index: 0, attempt, choices } });
const word = (tok, attempt) => call(P + 'check/word', { body: { token: tok, session: 1, index: 1, attempt, data: wav, durationMs: 1500 } });
const picks = (plan, attempt, want) => plan.trials[0].item.check.rounds[attempt - 1].map(round => round.indexOf(want) + 1);
const save = (tok, index) => call(P + 'trial', { body: { token: tok, session: 1, index, data: { answers: {}, rtMs: 5000 } } });

// ---------- eligibility screen-outs ----------
for (const [pid, bad, why] of [['PIDTEXAS01', { elig_state: 'texas' }, 'ineligible:elig_state'], ['PIDILLINOIS', { elig_state: 'illinois' }, 'ineligible:elig_state'],
  ['PIDWASH0001', { elig_state: 'washington' }, 'ineligible:elig_state'], ['PIDABROAD01', { elig_state: 'outside_us' }, 'ineligible:elig_state'],
  ['PIDMINOR001', { elig_age: 'no' }, 'ineligible:elig_age'], ['PIDNOMIC001', { elig_equipment: 'no' }, 'ineligible:elig_equipment']]) {
  const { tok, sv } = await start(pid, { ...ELIGIBLE, ...bad });
  assert.equal(sv.screenedOut, true, pid); assert.equal(sv.status.screenedOut, true);
  assert.equal((await call(P + 'session', { body: { token: tok } })).json.error, 'finished', 'a screened-out participant cannot continue');
  assert.equal((await call(P + 'resume', { body: { token: tok } })).json.status.screenedOut, true, 'and sees the screen-out page on return');
  const me = (await call(P + 'admin/participants', { key: OWNER })).json.find(x => x.screenedOut === why && x.condition == null);
  assert(me, `${pid} is listed as screened out (${why}) with no arm`);
}
assert.deepEqual(await markers(), [], 'nobody screened out at eligibility counts toward an arm');
console.log('eligibility: IL, TX, WA, outside the U.S., under 18 and no equipment are screened out, with no arm');

// ---------- headphone check: two failed attempts screen out ----------
{
  const { tok, plan, sv } = await start('PIDSPEAKERS1');
  assert(!sv.screenedOut);
  assert.equal(plan.trials[0].item.check.test, 'headphones'); assert.equal(plan.trials[0].item.check.rounds.length, 2);
  assert.equal((await hp(tok, 2, [1, 1, 1])).json.error, 'out_of_order', 'attempt 2 only after attempt 1');
  r = await hp(tok, 1, picks(plan, 1, 'anti')); assert.equal(r.json.pass, false); assert.equal(r.json.attemptsLeft, 1);
  assert.deepEqual((await hp(tok, 1, [1, 2, 3])).json, r.json, 'a retried attempt gets the same answer');
  assert.deepEqual((await call(P + 'check/status', { body: { token: tok, session: 1, index: 0 } })).json, { passed: false, nextAttempt: 2, attempts: 2 }, 'a reload resumes at attempt 2');
  r = await hp(tok, 2, picks(plan, 2, 'std')); assert.equal(r.json.pass, false); assert.equal(r.json.attemptsLeft, 0);
  r = await save(tok, 0); assert.equal(r.json.screenedOut, true, r.text);
  assert.equal((await save(tok, 1)).json.error, 'wrong_session', 'nothing more can be saved');
}
// ---------- word check skipped without trying: screened out ----------
{
  const { tok, plan } = await start('PIDSKIPWORD1');
  assert.equal((await hp(tok, 1, picks(plan, 1, 'quiet'))).json.pass, true);
  assert((await save(tok, 0)).json.ok);
  assert.equal(plan.trials[1].item.check.media.length, 2); assert(!/harbor|garden|pencil|window|rocket|blanket|candle|ladder|turtle|button/.test(JSON.stringify(plan)), 'the word list stays on the server');
  r = await save(tok, 1); assert.equal(r.json.screenedOut, true, 'leaving the check without trying fails it');
}
assert.deepEqual(await markers(), [], 'failed checks never hold an arm');
console.log('equipment check: scored on the server, two attempts in order, failing or skipping screens out');

// ---------- passing: an outage is not the participant's fault; the arm is assigned at session 2 ----------
{
  const { tok, plan } = await start('PIDPASSES001');
  r = await hp(tok, 1, picks(plan, 1, 'quiet')); assert.equal(r.json.pass, true);
  assert.equal((await hp(tok, 2, [1, 1, 1])).json.error, 'already_passed');
  assert.equal((await call(P + 'check/status', { body: { token: tok, session: 1, index: 0 } })).json.passed, true, 'a reload after passing shows it passed');
  assert((await save(tok, 0)).json.ok);
  r = await word(tok, 1); assert.equal(r.status, 503); assert.equal(r.json.error, 'asr_unavailable', 'no speech server configured');
  process.env.LAB_ASR_URL = ASR_URL;
  heard = 'umm';
  r = await word(tok, 1); assert.equal(r.json.pass, false); assert.equal(r.json.attemptsLeft, 1, 'a wrong word uses an attempt; the outage did not');
  heard = 'harbor garden pencil window rocket blanket candle ladder turtle button';
  r = await word(tok, 2); assert.equal(r.json.pass, true, r.text);
  r = await save(tok, 1); assert(r.json.ok && !r.json.screenedOut, r.text);
  r = await call(P + 'survey', { body: { token: tok, session: 1, kind: 'post', data: {} } });
  assert(r.json.ok && r.json.status.available && r.json.status.nextSession === 2, 'session 2 follows at once');
  assert.deepEqual(await markers(), [], 'no arm until session 2 starts');
  const s2 = (await call(P + 'session', { body: { token: tok } })).json;
  assert.equal(s2.session, 2);
  const m = await markers(); assert.equal(m.length, 1, 'exactly one arm marker: the participant who passed');
  const me = (await call(P + 'admin/participants', { key: OWNER })).json.find(x => x.completedSessions === 1);
  assert(['a0', 'a1', 'a2', 'a3', 'a4'].includes(me.condition) && m[0] === `cond/${me.condition}/${me.code}`, JSON.stringify(me));
}
// ---------- only outages: the participant continues, flagged ----------
{
  const { tok, plan } = await start('PIDOUTAGE001');
  assert((await hp(tok, 1, picks(plan, 1, 'quiet'))).json.pass);
  assert((await save(tok, 0)).json.ok);
  delete process.env.LAB_ASR_URL;
  assert.equal((await word(tok, 1)).json.error, 'asr_unavailable');
  assert.equal((await word(tok, 1)).json.error, 'asr_unavailable');
  r = await save(tok, 1); assert(r.json.ok && !r.json.screenedOut, 'two outages: continue, flagged');
}
const csv = (await call(P + 'admin/export.csv', { key: OWNER })).text;
const head = csv.split('\n')[0].split(','), col = n => head.indexOf(n);
const rows = csv.trim().split('\n').slice(1).map(l => l.split(','));
const words = rows.filter(x => x[col('check_test')] === 'word');
assert.deepEqual(words.map(x => x[col('check_passed')]).sort(), ['', '0', '1'], 'word checks exported as passed 1, failed 0, outage blank');
assert(words.some(x => x[col('check_outages')] === '2'), 'outages are counted');
console.log('passing participants get an arm when session 2 starts; outages are flagged, never failed');

// ---------- a preview participant with a fixed arm keeps it ----------
r = await call(P + 'admin/preview', { key: OWNER, body: { condition: 'a4' } });
assert(r.json.code, r.text);
assert.equal((await call(P + 'admin/participants', { key: OWNER })).json.find(x => x.code === r.json.code).condition, 'a4');
console.log('preview participants keep the arm the researcher chose');

fake.close();
