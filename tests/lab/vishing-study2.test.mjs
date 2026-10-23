// Vishing Study 2, step 1 (screening), end to end over HTTP with in-memory stores: required recording consent,
// eligibility screen-outs (IL/TX/WA, age, equipment), the headphone and spoken-word equipment checks (scored on the
// server, two attempts, a speech-server outage never counts against the participant), and deferred arm
// assignment: only people who pass screening get an arm or a cond/ marker.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { sessionGate } from '../../netlify/lib/lab/engine.mjs';
import { memBlobs } from './memstore.mjs';
import { saidWord, peakLevel, transcribe } from '../../netlify/lib/lab/asr.mjs';

const getStore = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
// CSV rows with quoted fields ("Recorded calls, first set").
const parseCsv = text => text.trim().split('\n').map(line => { const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out; });
const call = async (path, { body, key } = {}) => {
  const req = new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};

// A stand-in for the lab's Mac mini: whisper-server (POST /inference "hears" every check word, or nothing; GET / is
// its page) and the voice service (GET /health, POST /tts returns a WAV).
let heard = 'harbor garden pencil window pillow blanket candle ladder turtle button';
const fake = createServer((req, res) => { req.resume(); req.on('end', () => {
  if (req.url === '/health') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: true })); }
  if (req.url === '/tts') { res.setHeader('content-type', 'audio/wav'); return res.end(Buffer.from(wav, 'base64')); }
  if (req.method === 'GET') return res.end('whisper');
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ text: heard })); }); });
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const ASR_URL = `http://127.0.0.1:${fake.address().port}/inference`, TTS_URL = `http://127.0.0.1:${fake.address().port}/tts`;
delete process.env.LAB_ASR_URL; delete process.env.LAB_TTS_URL;

// tiny valid WAVs (16 kHz mono, 0.1 s): a 440 Hz tone (stands in for speech) and pure silence
const makeWav = amp => { const n = 1600, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * Math.sin(2 * Math.PI * 440 * i / 16000)), 44 + i * 2); return b.toString('base64'); };
const wav = makeWav(8000), silentWav = makeWav(0);

assert(saidWord(' A blanket.\n', 'blanket') && saidWord('Harbour', 'harbor') && !saidWord('garden', 'harbor') && !saidWord('', 'harbor'));
assert.equal(peakLevel(Buffer.from(silentWav, 'base64')), 0); assert(peakLevel(Buffer.from(wav, 'base64')) > 0.2); assert.equal(peakLevel(Buffer.from('not a wav')), null);

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
  assert.equal(plan.session, 1); assert.equal(plan.trials.length, 7, 'checks, persona card, tour, practice intro, practice call and its retry');
  assert.deepEqual(plan.preItems.map(x => x.id).filter(x => x.startsWith('elig_') && x !== 'elig_intro'), ['elig_age', 'elig_state', 'elig_equipment', 'elig_quiet']);
  const sv = (await call(P + 'survey', { body: { token: tok, session: 1, kind: 'pre', data: eligibility } })).json;
  return { tok, plan, sv };
}
const hp = (tok, attempt, choices) => call(P + 'check/headphones', { body: { token: tok, session: 1, index: 0, attempt, choices } });
const word = (tok, attempt) => call(P + 'check/word', { body: { token: tok, session: 1, index: 1, attempt, data: wav, durationMs: 1500 } });
const picks = (plan, attempt, want) => plan.trials[0].item.check.rounds[attempt - 1].map(round => round.indexOf(want) + 1);
const save = (tok, index, data = {}, session = 1) => call(P + 'trial', { body: { token: tok, session, index, data: { answers: {}, rtMs: 5000, ...data } } });
const turn = (tok, session, index, seq, kind, extra = {}) => call(P + 'call/turn', { body: { token: tok, session, index, seq, kind, latencyMs: 700, ...extra } });
// The rest of session 1: persona card, tour (with its comprehension check), the practice call spoken through the lab's
// recognizer (here the stand-in), which passes the gate, so its retry is skipped.
async function onboard(tok, plan) {
  assert.equal(plan.persona.rows.find(x => x.label === 'Employee ID').value.length, 7, 'NW- and four digits');
  assert(!JSON.stringify(plan.persona).includes('"secret"'), 'the browser never learns which rows are disclosure targets');
  assert((await save(tok, 2)).json.ok);
  r = await save(tok, 3, { answers: { tour_codes: 'auth', tour_lookup: 'directory', tour_report: 'disposition' } }); assert(r.json.ok, r.text);
  assert((await save(tok, 4)).json.ok);
  assert.equal((await turn(tok, 1, 5, 0, 'answer')).json.state, 'opener');
  const said = await turn(tok, 1, 5, 1, 'say', { audio: wav });
  assert.equal(said.json.heard, heard, 'the participant\'s words come back from the lab\'s recognizer for the captions');
  await turn(tok, 1, 5, 2, 'hangup');
  r = await save(tok, 5, { call: { answered: true } }); assert(r.json.ok && !r.json.screenedOut, r.text);
  assert.equal((await call(P + 'gate/status', { body: { token: tok, session: 1, index: 6 } })).json.passed, true);
  r = await save(tok, 6, { call: { answered: false } }); assert(r.json.ok && !r.json.screenedOut, 'the retry is skipped after a pass');
}

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
  assert.equal(plan.trials[1].item.check.media.length, 2); assert(!/harbor|garden|pencil|window|pillow|blanket|candle|ladder|turtle|button/.test(JSON.stringify(plan.trials[1])), 'the word list stays on the server');
  r = await save(tok, 1); assert.equal(r.json.screenedOut, true, 'leaving the check without trying fails it');
}
assert.deepEqual(await markers(), [], 'failed checks never hold an arm');
console.log('equipment check: scored on the server, two attempts in order, failing or skipping screens out');

// ---------- passing: an outage is not the participant's fault; the arm is assigned at session 2 ----------
let passer = null;
{
  const { tok, plan } = await start('PIDPASSES001');
  r = await hp(tok, 1, picks(plan, 1, 'quiet')); assert.equal(r.json.pass, true);
  assert.equal((await hp(tok, 2, [1, 1, 1])).json.error, 'already_passed');
  assert.equal((await call(P + 'check/status', { body: { token: tok, session: 1, index: 0 } })).json.passed, true, 'a reload after passing shows it passed');
  assert((await save(tok, 0)).json.ok);
  r = await word(tok, 1); assert.equal(r.status, 503); assert.equal(r.json.error, 'asr_unavailable', 'no speech server configured');
  process.env.LAB_ASR_URL = ASR_URL;
  assert.deepEqual(await transcribe(Buffer.from(silentWav, 'base64')), { text: '', ms: 0, silent: true }, 'silence never reaches Whisper, which invents "Thank you." for it');
  heard = 'umm';
  r = await word(tok, 1); assert.equal(r.json.pass, false); assert.equal(r.json.attemptsLeft, 1, 'a wrong word uses an attempt; the outage did not');
  heard = 'harbor garden pencil window pillow blanket candle ladder turtle button';
  r = await word(tok, 2); assert.equal(r.json.pass, true, r.text);
  r = await save(tok, 1); assert(r.json.ok && !r.json.screenedOut, r.text);
  await onboard(tok, plan);
  r = await call(P + 'survey', { body: { token: tok, session: 1, kind: 'post', data: {} } });
  assert(r.json.ok && r.json.status.available && r.json.status.nextSession === 2, 'session 2 follows at once');
  assert.deepEqual(await markers(), [], 'no arm until session 2 starts');
  r = await call(P + 'session', { body: { token: tok } });
  assert.equal(r.status, 503); assert.equal(r.json.error, 'voice_unavailable', 'session 2 does not open while the voice service is down');
  assert.deepEqual(await markers(), [], 'and nobody is assigned an arm');
  process.env.LAB_TTS_URL = TTS_URL;
  const s2 = (await call(P + 'session', { body: { token: tok } })).json;
  assert.equal(s2.session, 2);
  const m = await markers(); assert.equal(m.length, 1, 'exactly one arm marker: the participant who passed');
  const me = (await call(P + 'admin/participants', { key: OWNER })).json.find(x => x.completedSessions === 1);
  assert(['a0', 'a1', 'a2', 'a3', 'a4'].includes(me.condition) && m[0] === `cond/${me.condition}/${me.code}`, JSON.stringify(me));
  const alloc = parseCsv((await call(P + 'admin/allocation.csv', { key: OWNER })).text);
  assert.equal(alloc[1][alloc[0].indexOf('arm')], me.condition, 'the first participant past screening gets the first slot of the pre-set list');
  assert.equal(alloc.slice(1).filter(x => x[alloc[0].indexOf('used')] === '1').length, 1, 'one slot used');
  passer = { tok, s2, me };
}
// ---------- the session gate: voice health and the cap on live sessions ----------
{
  const now = Date.now(), up = { asr: async () => true, tts: async () => true };
  const S = { store: { list: async () => [...Array.from({ length: 8 }, (_, i) => `started/P${i}/s2-${now - 6e4}`), `started/Q/s1-${now}`, `started/R/s2-${now - 2 * 3600e3}`] } };
  const gate = extra => ({ design: { gate: { session: 2, voice: true, ...extra } } });
  assert.equal(await sessionGate(S, gate({ maxActive: 8 }), 2, now, up), 'lab_busy', '8 people started session 2 in the last hour');
  assert.equal(await sessionGate(S, gate({ maxActive: 9 }), 2, now, up), null, 'session 1 starts and older starts do not count');
  assert.equal(await sessionGate(S, gate({ maxActive: 8 }), 1, now, up), null, 'only the gated session is gated');
  assert.equal(await sessionGate(S, gate({}), 2, now, { asr: async () => true, tts: async () => false }), 'voice_unavailable');
  console.log('session gate: closed while the voice service is down or 8 sessions are live; nothing assigned');
}
// ---------- session 2: counterbalancing, passive trials, training, the scored shift ----------
{
  const { tok, s2, me } = passer;
  assert(Number.isInteger(me.flags.clipList) && me.flags.clipList >= 0 && me.flags.clipList < 18, 'a clip list');
  assert(['A', 'B'].includes(me.flags.shiftForm) && typeof me.flags.slider === 'boolean' && typeof me.flags.scripted === 'boolean', JSON.stringify(me.flags));
  const kinds = s2.trials.map(t => t.item.kind);
  assert.equal(s2.trials.length, 1 + 12 + 8 + 1 + 1 + 12 + 1 + 10, 'intro, 12 clips, 8 briefing screens, check, intro, 12 clips, shift intro, 10 calls');
  assert.equal(kinds.filter(k => k === 'audio').length, 24); assert.equal(kinds.filter(k => k === 'call').length, 10);
  assert.deepEqual(s2.preItems.filter(x => x.type !== 'info').map(x => x.id).slice(0, 3), ['age', 'gender', 'education'], 'the baseline survey opens session 2');
  const clips = s2.trials.filter(t => t.item.kind === 'audio');
  assert(clips.every(t => t.item.live && t.decision && t.decision.options.length === 2 && t.decision.mouseTracking), 'binary, mouse-tracked, answered while playing');
  assert.equal(new Set(clips.map(t => t.item.media)).size, 24, '24 different clips');
  assert.equal(clips.filter(t => t.item.slider).length, me.flags.slider ? 12 : 0, 'the slider runs in the first block for half of the participants');
  const train = s2.trials.filter(t => t.item.title && t.block === 3);
  assert.equal(train.length, 8, 'eight briefing screens');
  assert(train.slice(2, 6).every(t => t.item.clips.length === 2) && train.every(t => t.item.minSeconds > 0), 'two examples on each part screen, a minimum time on each');
  assert.equal(train.filter(t => t.item.practiceDial && t.item.practiceDial.target).length, 1, 'every arm\'s exercise has one directory lookup');
  assert(train.every(t => !(t.item.practiceDial) || t.item.practiceDial.directory.every(d => d.media)), 'practice-directory greetings are rendered in the study voice');
  const calls = s2.trials.filter(t => t.item.kind === 'call');
  assert(calls.every(t => t.item.call.scored && !t.item.call.intent && !t.item.call.script), 'the browser never learns whether a call is an attack');
  assert(calls.every(t => t.item.call.caller === 'Incoming call' && t.item.call.number === ''), 'no caller ID: every call rings as "Incoming call" with no number');
  assert(!JSON.stringify(s2).includes('callbackNumber') && !JSON.stringify(s2).includes('deflect'), 'nor which number resolves it');

  // ----- the first set of clips: a live decision with a change, the decided key, confidence -----
  r = await save(tok, 0, {}, 2); assert(r.json.ok);
  for (const t of clips) {
    const live = { startMs: 400, changes: [{ ms: 3000, clipMs: 2500, value: 'suspicious' }, { ms: 7000, clipMs: 6500, value: 'legitimate' }], decidedMs: 7200, decidedClipMs: 6700, final: 'legitimate', late: false, clipMs: 10000 };
    r = await save(tok, t.index, { answers: { confidence6: '4' }, decision: 'legitimate', decisionMs: 3000, trajectory: [[400, 500, 0], [380, 300, 400], [120, 90, 900]], live,
      slider: t.item.slider ? [[0, 50], [250, 55]] : undefined, media: { plays: 1, heardPct: 100 } }, 2);
    assert(r.json.ok, r.text);
  }
  // ----- the briefing, the knowledge check, the shift intro -----
  for (const t of s2.trials.filter(t => t.item.kind === 'text')) {
    const answers = Object.fromEntries((t.item.ask || []).map(id => [id, s2.questions.find(q => q.id === id)]).filter(([, q]) => q).map(([id, q]) =>
      [id, q.type === 'choice' ? q.options[0].value : q.type === 'multi' ? [q.options[0].value] : q.type === 'number' ? '20' : q.type === 'scale' ? '5' : 'test answer']));
    r = await save(tok, t.index, { answers, screen: { dwellMs: 30000, clipsPlayed: 2, clipsEnded: 2, dialed: [], reachedTarget: false } }, 2);
    assert(r.json.ok, `${t.item.title}: ${r.text}`);
  }
  // ----- the shift: every call scored on the server -----
  const pts = {};
  for (const t of calls) {
    let seq = 0;
    const go = (kind, extra) => turn(tok, 2, t.index, seq++, kind, extra);
    r = await go('answer'); assert(r.json.say, r.text);
    let code = null;
    while (!r.json.done && r.json.state !== 'ask') { r = await go('say', { said: 'mm hm, go on' }); if (r.json.code) code = r.json.code; }
    if (code) {
      assert(/^\d{6}$/.test(code.value), 'a six-digit code arrives on the authenticator');
      const cb = await call(P + 'call/callback', { body: { token: tok, session: 2, index: t.index, number: '555-0199', source: 'dialpad' } });
      assert(/not in service/.test(cb.json.say), 'an unlisted number');
      r = await go('say', { said: 'sure, it is ' + code.value.split('').join(' ') });
      assert(r.json.done, 'reading the code ends the call');
    } else if (!r.json.done) r = await go('say', { said: 'okay, sure' });
    if (!r.json.done) await go('hangup');
    r = await save(tok, t.index, { answers: { confidence6: '3' }, decision: 'suspicious', call: { answered: true } }, 2); assert(r.json.ok, r.text);
  }
  const rows = parseCsv((await call(P + 'admin/export.csv', { key: OWNER })).text);
  const head = rows[0], col = n => head.indexOf(n);
  for (const c of ['clip_id', 'phase', 'structure', 'surface', 'topic', 'clip_list', 'live_first', 'live_changes', 'live_final', 'live_decided_clip_ms', 'slider_flag', 'call_slot', 'caller_id',
    'shift_form', 'call_directory_down', 'call_disclosure', 'call_disclosed', 'call_code_sent', 'call_points', 'call_callbacks_lookedup', 'call_callbacks_caller_number', 'call_pressure_turns', 'pilot_scripted', 'a_confidence6'])
    assert(col(c) >= 0, `export has ${c}`);
  const mine = rows.slice(1).filter(x => x[col('code')] === me.code && x[col('session')] === '2');
  const pre = mine.filter(x => x[col('phase')] === 'pre'), post = mine.filter(x => x[col('phase')] === 'post');
  assert.equal(pre.length, 12); assert.equal(post.length, 12);
  for (const ph of [pre, post]) for (const f of ['structure', 'surface', 'topic']) assert.equal(ph.filter(x => x[col(f)] === ph[0][col(f)]).length, 6, `${f} balanced 6/6 in each phase`);
  for (const ph of [pre, post]) for (const s of ['attack', 'benign'])
    assert.equal(ph.filter(x => x[col('structure')] === s && x[col('locked')] === '1').length, 3, 'half of each phase is locked, stratified by structure');
  assert.equal(clips.filter(t => t.item.locked).length, 12, 'the browser knows which trials are locked');
  assert(pre.every(x => x[col('live_changes')] === '1' && x[col('live_final')] === 'legitimate' && x[col('live_decided_clip_ms')] === '6700'), 'the live decision is exported');
  const shift = mine.filter(x => x[col('call_slot')]);
  assert.equal(shift.length, 10);
  const attacks = shift.filter(x => x[col('call_intent')] === 'attack'), benign = shift.filter(x => x[col('call_intent')] === 'benign');
  assert.equal(attacks.length, 5); assert.equal(benign.length, 5);
  const down = shift.filter(x => x[col('call_directory_down')] === '1');
  assert.equal(down.length, 4, 'the directory is down on 4 of the 10 calls');
  for (const s of ['attack', 'benign']) for (const u of ['calm', 'urgent'])
    assert.equal(down.filter(x => x[col('structure')] === s && x[col('surface')] === u).length, 1, `one outage call in the ${s}/${u} stratum`);
  assert.equal(calls.filter(t => t.item.directoryDown).length, 4, 'the browser knows which calls have the directory down');
  const codeCalls = attacks.filter(x => x[col('call_code_sent')] === '1');
  assert.equal(codeCalls.length, 2, 'two attacks send a code');
  assert(codeCalls.every(x => x[col('call_disclosed')] === 'code' && x[col('call_points')] === '-42'), 'reading the code back is a disclosure: -40, and the callback costs 2');
  const routeOwn = benign.filter(x => x[col('call_slot')] === 'ben-urgent-1'), onCall = benign.filter(x => x[col('call_slot')] !== 'ben-urgent-1');
  assert(onCall.every(x => x[col('call_points')] === '10' && x[col('call_benign_completed_on_call')] === '1'), 'a legitimate request completed on the call earns 10');
  assert(routeOwn.length === 1 && routeOwn[0][col('call_points')] === '0' && routeOwn[0][col('call_benign_completed_on_call')] === '0',
    '"okay" to a request to call back does not complete it: only reaching the real number does');
  assert.equal(routeOwn[0][col('call_directory_down')], '0', 'the request to call back through the directory is never an outage call');
  const calm2 = attacks.find(x => x[col('call_slot')] === 'atk-calm-2');
  assert(calm2[col('call_disclosed')] === '' && calm2[col('call_points')] === '0' && Number(calm2[col('call_agreed_no_disclosure')]) >= 1, '"okay" to an attacker is not a disclosure');
  // ----- post survey, debrief, bonus -----
  r = await call(P + 'survey', { body: { token: tok, session: 2, kind: 'post', data: { prev_post: '30', verify_cost: '3', tlx_mental: '40', demand_probe: 'spot scams', bot_suspect: 'some', attn_check: 'sometimes' } } });
  assert(r.json.ok && r.json.status.finished, r.text);
  const db = (await call(P + 'debrief', { body: { token: tok } })).json;
  assert.equal(db.calls.length, 10); assert.equal(db.points, 2 * -42 + 4 * 10, 'the debrief totals the shift');
  assert(db.calls.every(c => c.transcript.length > 0) && !JSON.stringify(db).match(/\b\d{6}\b/), 'own transcript, with the code redacted');
  const bonus = await call(P + 'admin/bonus.csv', { key: OWNER });
  assert.equal(bonus.status, 200, bonus.text);
  assert(!bonus.text.includes('PIDPASSES001'), 'a negative total earns no bonus');
  console.log(`session 2: lists ${me.flags.clipList}/form ${me.flags.shiftForm}; live decisions, briefing, shift scored (${db.points} points), debrief and export`);
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
const all = parseCsv((await call(P + 'admin/export.csv', { key: OWNER })).text);
const head = all[0], col = n => head.indexOf(n), rows = all.slice(1);
const words = rows.filter(x => x[col('check_test')] === 'word');
assert.deepEqual(words.map(x => x[col('check_passed')]).sort(), ['', '0', '1'], 'word checks exported as passed 1, failed 0, outage blank');
assert(words.some(x => x[col('check_outages')] === '2'), 'outages are counted');
console.log('passing participants get an arm when session 2 starts; outages are flagged, never failed');

// ---------- a preview participant with a fixed arm keeps it ----------
r = await call(P + 'admin/preview', { key: OWNER, body: { condition: 'a4' } });
assert(r.json.code, r.text);
assert.equal((await call(P + 'admin/participants', { key: OWNER })).json.find(x => x.code === r.json.code).condition, 'a4');
console.log('preview participants keep the arm the researcher chose');

// ---------- the shipped clip lists, disclosure detection, and the payoff's two thresholds ----------
{
  const { LISTS, CLIPS } = await import('../../netlify/lib/lab/studies/vishing-study2/clips.mjs');
  const meta = new Map(CLIPS.map(c => [c.id, c.meta])), seen = {};
  assert.equal(LISTS.length, 18); assert.equal(CLIPS.length, 72);
  for (const l of LISTS) for (const ph of ['pre', 'post']) {
    assert.equal(l[ph].length, 12);
    for (const f of ['structure', 'surface', 'topic']) assert.equal(l[ph].filter(id => meta.get(id)[f] === meta.get(l[ph][0])[f]).length, 6);
    for (const id of l[ph]) (seen[id] = seen[id] || { pre: 0, post: 0 })[ph]++;
  }
  assert(Object.keys(seen).length === 72 && Object.values(seen).every(s => s.pre === 3 && s.post === 3), 'every clip: 3 lists pre, 3 post');
  const X = await import('../../netlify/lib/lab/types/multimodal-study.mjs');
  // An attack whose ask is not a secret: its own loss phrases count as giving it ('action'); agreeing alone does not.
  const lossRe = "\\b(go ahead and (change|update) (it|them)|i'?ll (call|ring) you (at|on) that number)\\b";
  assert.deepEqual(X.disclosures('yes, go ahead and change it', { lossRe }), ['action']);
  assert.deepEqual(X.disclosures("sure, I'll call you at that number", { lossRe }), ['action']);
  assert.deepEqual(X.disclosures('okay, let me check with my manager first', { lossRe }), [], 'agreeing to wait is not a loss');
  assert.equal(X.pointsFor({ intent: 'attack' }, { disclosed: ['action'], callbacks: 0 }, { disclose: -40 }), -40);
  // permuted blocks: every block of 10 has each arm twice; 50 people assigned at once take 50 distinct slots
  const { VISHING_STUDY2 } = await import('../../netlify/lib/lab/studies/vishing-study2.mjs');
  const { blobsStore } = await import('../../netlify/lib/lab/store.mjs');
  const c2 = VISHING_STUDY2.content(), list = X.allocationList(c2);
  for (let b = 0; b < list.length / 10; b++) for (const a of ['a0', 'a1', 'a2', 'a3', 'a4']) assert.equal(list.slice(b * 10, b * 10 + 10).filter(x => x === a).length, 2);
  assert.deepEqual(X.allocationList(c2), list, 'the list is fixed by the seed');
  const S2 = { store: blobsStore(memBlobs(), 'alloc-test') };
  const got = await Promise.all(Array.from({ length: 50 }, (_, i) => X.allocate(S2, { code: 'P' + i }, c2)));
  assert.deepEqual(got, list.slice(0, 50), 'concurrent assignments fill the list in order, each slot once');
  for (const a of ['a0', 'a1', 'a2', 'a3', 'a4']) assert.equal(got.filter(x => x === a).length, 10, 'after 5 blocks, 10 per arm');
  const persona = { rows: [{ label: 'pw', value: 'maple-harbor-47', secret: 'password' }, { label: 'acct', value: '4815162342', secret: 'account' }] };
  assert.deepEqual(X.disclosures('it is four one five two seven three', { code: '415273', persona }), ['code']);
  assert.deepEqual(X.disclosures('sure, 415 273', { code: '415273', persona }), ['code']);
  assert.deepEqual(X.disclosures('the password is maple harbor forty seven', { code: null, persona }), ['password'], 'spoken two-digit numbers count');
  assert.deepEqual(X.disclosures('maple, I mean, harbor', { code: null, persona }), [], 'part of a password is not the password');
  assert.deepEqual(X.disclosures('maple harbor 47', { code: null, persona }), ['password']);
  assert.deepEqual(X.disclosures('account ending 162342', { code: null, persona }), ['account']);
  assert.deepEqual(X.disclosures('no, I will call you back', { code: '415273', persona }), []);
  // expected points by policy: accept, verify (call the real number back), refuse; verify is best between .05 and .80
  const pay = { benignComplete: 10, disclose: -40, callback: -2 };
  const B = { intent: 'benign' }, A = { intent: 'attack' };
  const ev = (p, policy) => policy === 'accept' ? (1 - p) * X.pointsFor(B, { outcome: 'completed', callbacks: 0 }, pay) + p * X.pointsFor(A, { disclosed: ['code'], callbacks: 0 }, pay)
    : policy === 'verify' ? (1 - p) * X.pointsFor(B, { outcome: 'completed', callbackResolved: true, callbacks: 1 }, pay) + p * X.pointsFor(A, { disclosed: [], callbacks: 1 }, pay) : 0;
  assert.equal(X.pointsFor(B, { outcome: 'not_completed', callbackResolved: true, callbacks: 1 }, pay), -2, 'a callback alone does not complete a legitimate request');
  assert.equal(X.pointsFor({ intent: 'benign', completeViaCallback: true }, { outcome: 'agreed', callbackResolved: true, callbacks: 1 }, pay), 8, 'unless the request was to call back');
  const best = p => ['accept', 'verify', 'refuse'].reduce((a, b) => (ev(p, b) > ev(p, a) ? b : a));
  assert.deepEqual([0.03, 0.06, 0.5, 0.79, 0.81].map(best), ['accept', 'verify', 'verify', 'verify', 'refuse']);
  console.log('clip lists balanced; disclosure detected on spoken and written digits and passwords; verify is optimal for p between .05 and .80');
}

fake.close();
