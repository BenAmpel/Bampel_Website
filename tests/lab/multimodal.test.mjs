// The multimodal study type end to end over HTTP with in-memory stores: templates, preview links, recording
// consent, AI voice calls (state machine, retries, callbacks, transcripts), participant audio, uploaded stimulus
// files, mouse-tracking measures, Prolific sign-in, exports, deletion, and the live self-test.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import { trajectoryMetrics } from '../../netlify/lib/lab/trajectory.mjs';
import * as bot from '../../netlify/lib/lab/voicebot.mjs';
import { TEMPLATES, templateList } from '../../netlify/lib/lab/templates.mjs';
import { typeFor } from '../../netlify/lib/lab/registry.mjs';
import * as content from '../../netlify/lib/lab/content.mjs';

// ---------- mouse-tracking measures ----------
{
  const straight = trajectoryMetrics([[0, 0, 0], [50, -50, 100], [100, -100, 200]]);
  assert.equal(straight.mad, 0); assert.equal(straight.xFlips, 0); assert.equal(straight.totalMs, 200);
  const curved = trajectoryMetrics([[0, 0, 0], [0, -60, 100], [-20, -90, 150], [40, -100, 250], [100, -100, 300]]);
  assert(curved.mad > 0.2, 'a path that bows toward the other option has a positive MAD: ' + curved.mad);
  assert(curved.auc > 0, 'and a positive area');
  assert.equal(curved.xFlips, 1, 'left then right is one flip');
  const mirrored = trajectoryMetrics([[0, 0, 0], [0, -60, 100], [20, -90, 150], [-40, -100, 250], [-100, -100, 300]]);
  assert.equal(mirrored.mad, curved.mad, 'the sign does not depend on which side was chosen');
  assert.equal(trajectoryMetrics([[0, 0, 0]]), null); assert.equal(trajectoryMetrics('junk'), null);
  const long = Array.from({ length: 1700 }, (_, i) => [0, -i * 0.1, i]); long.push([200, -300, 1800]);
  assert.equal(trajectoryMetrics(long).totalMs, 1800, 'over the point cap, the answer click is kept as the end point');
  assert.equal(trajectoryMetrics([[0, 0, 0], [1, 1, 5], [5, 'x', 6], [9, 9, 2], [100, -100, 300]]).samples, 3, 'bad and out-of-order points are dropped');
  console.log('mouse tracking: MAD, AUC, x-flips, timing, cleaning');
}

// ---------- the voice caller ----------
{
  assert.equal(bot.classify('it is four two seven nine one one').intent, 'comply');
  assert.equal(bot.classify('the code is 482913').disclosed, true);
  assert.equal(bot.classify('I will call the bank back myself').intent, 'verify');
  assert.equal(bot.classify('No, I am not comfortable with that').intent, 'refuse');
  assert.equal(bot.classify('Sure, what do you need?').intent, 'question', 'asking what is needed agrees to nothing yet (and must not complete a legitimate request)');
  assert.equal(bot.classify('').intent, 'silence');
  assert.equal(bot.classify('Sure, no problem').intent, 'comply', '"no problem" is not a refusal');
  const last = bot.step({ ...bot.START, state: 'pressure1', lastPressure: 'pressure1', turns: 7 }, bot.classify('fine, it is 4 8 2 9 1 3'), { intent: 'attack', maxTurns: 8 });
  assert.equal(last.outcome, 'disclosed', 'a compliance on the last allowed turn still counts');
  assert.equal(bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask', turns: 3 }, bot.classify('hold on one second'), { intent: 'attack', maxTurns: 10 }).state, 'ask', '"hold on" does not advance the pressure');
  assert.equal(bot.classify('Oh no, okay.').intent, 'comply', '"oh no" is surprise, not a refusal');
  assert.equal(bot.classify('Oh no, okay.').digits, 0, '"oh" is not a zero on its own');
  assert.equal(bot.digitsIn('four oh seven two'), 4, 'but it is inside a run of digits');
  const o = { intent: 'attack', maxTurns: 10 };
  let st = { ...bot.START, state: 'opener' };
  st = bot.step(st, bot.classify('yes, speaking'), o); assert.equal(st.state, 'pretext');
  st = bot.step(st, bot.classify('oh no'), o); assert.equal(st.state, 'ask');
  st = bot.step(st, bot.classify('who is this, how do I know this is real'), o); assert.equal(st.state, 'deflect');
  st = bot.step(st, bot.classify('hmm'), o); assert.equal(st.state, 'pressure1', 'after deflecting the caller presses on');
  st = bot.step(st, bot.classify('no'), o); assert.equal(st.state, 'pressure2');
  st = bot.step(st, bot.classify('no, stop calling me'), o); assert.equal(st.state, 'closeRefuse'); assert.equal(st.outcome, 'refused'); assert(st.done);
  let b = bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify('one two three four five six'), o);
  assert.equal(b.outcome, 'disclosed');
  b = bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify('yes it arrived'), { intent: 'benign' });
  assert.equal(b.outcome, 'completed');
  // Agreement, refusal, hedges, verification and questions, typed and as a recognizer transcribes them (curly
  // apostrophes, "O.K.", leading fillers). "not sure" contains "sure" and must never count as agreement.
  const TABLE = {
    comply: ['yes', 'Yes.', 'yeah sure', 'Sure.', 'sure, go ahead', 'okay', 'OK', 'O.K.', 'Okay, here it is', 'yes it arrived', 'got it', 'Go ahead.'],
    refuse: ['no', 'No.', 'nope', 'I won\u2019t give that out', "I won't", 'I\u2019m not comfortable with that', 'no thanks', 'sure? no', "no, sure isn't",
      "that's not okay", "I don't want to share that", 'this sounds like a scam', 'not interested', 'that sounds like fraud'],
    hedge: ["I'm not sure I should give that out", 'Not sure, let me look', 'not sure.', 'Uh, I\u2019m not sure', 'I\u2019m not sure', 'unsure',
      "I don't know", 'I do not know', 'no idea', 'maybe', "I'm not certain", 'not really sure', 'dunno'],
    verify: ['who is this?', "who's calling", "I'll call you back", 'let me look that up', 'can I call you back?', 'what is your extension?'],
    hold: ['hold on', 'one second', 'okay, hold on', 'wait'],
    question: ['Is that okay?', 'are you sure?', 'sure?', 'what is this about?']
  };
  for (const [want, phrases] of Object.entries(TABLE)) for (const p of phrases) assert.equal(bot.classify(p).intent, want, `"${p}" should be ${want}`);
  assert.notEqual(bot.classify('let me make sure').intent, 'comply', '"make sure" is not agreement');
  // A hedge never ends a call or counts as agreement: an attacker presses on, a legitimate caller restates.
  const hg = bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify('not sure'), o);
  assert.equal(hg.state, 'pressure1'); assert(!hg.done); assert.equal(hg.agreed || 0, 0);
  assert(!bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify("I'm not sure"), { intent: 'benign' }).done, 'a hedge does not complete a legitimate request');
  // Agreeing is not disclosing: "okay" makes an attacker wait for it, then press on; it never ends the call.
  let g = bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify('okay, sure'), o);
  assert.equal(g.state, 'goAhead'); assert(!g.done); assert.equal(g.agreed, 1);
  g = bot.step(g, bot.classify('okay'), o); assert.equal(g.state, 'pressure1', 'a second "okay" with nothing given: the caller presses on');
  assert.equal(bot.classify('okay, hold on').intent, 'hold', '"hold on" wins over "okay"');
  assert.notEqual(bot.classify('Is this fraud prevention?').intent, 'refuse', 'naming the department is not a refusal');
  assert.equal(bot.classify('that sounds like fraud').intent, 'refuse');
  assert.equal(bot.classify("I'm fine").intent, 'other', '"fine" is not agreement');
  assert.equal(bot.classify("who's calling?").intent, 'verify');
  assert.equal(bot.classify('no, I will not read you 4 8 2 1', { digitRule: false }).intent, 'refuse', 'without the digit rule, digits alone are not compliance');
  // A request to verify before the ask is answered at once, then the caller goes on to the ask.
  let v = bot.step({ ...bot.START, state: 'opener' }, bot.classify("who's calling?"), o); assert.equal(v.state, 'deflect');
  v = bot.step(v, bot.classify('hmm'), o); assert.equal(v.state, 'ask');
  // A legitimate caller is not ended by one "no"; a request to call back is "agreed", not completed, on the call.
  let n = bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify('no'), { intent: 'benign' }); assert(!n.done);
  n = bot.step(n, bot.classify('no, not interested'), { intent: 'benign' }); assert.equal(n.outcome, 'refused');
  assert.equal(bot.step({ ...bot.START, state: 'ask', lastPressure: 'ask' }, bot.classify('okay'), { intent: 'benign', completeOnCall: false }).outcome, 'agreed');
  let m = { ...bot.START, state: 'opener' };
  for (let i = 0; i < 4; i++) m = bot.step(m, bot.classify('hmm'), { intent: 'attack', maxTurns: 4 });
  assert.equal(m.outcome, 'max_turns');
  assert.equal(bot.redact('my card is 4111 1111 1111 1111 and email me@x.com'), 'my card is [number] and email [email]');
  assert.equal(bot.redact('code four two seven nine'), 'code [number]');
  assert.equal(bot.redact('I live at 12 Peachtree Street'), 'I live at [address]');
  const noKey = await bot.phrase({ state: 'ask', line: 'Read me the code.', env: {} });
  assert.deepEqual(noKey, { text: 'Read me the code.', source: 'script' });
  let sent = null;
  const ok = await bot.phrase({ state: 'ask', line: 'Read me the code.', heard: 'why?', env: { ANTHROPIC_API_KEY: 'k' },
    fetchImpl: async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'I just need that code, please.' }] }) }; } });
  assert.equal(ok.source, 'llm'); assert.equal(ok.text, 'I just need that code, please.');
  const req = JSON.parse(sent.init.body);
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages'); assert.equal(sent.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.model, 'claude-opus-5-5'); assert(!('temperature' in req), 'no sampling parameters'); assert.equal(req.fallbacks, 'default');
  const refused = await bot.phrase({ state: 'ask', line: 'L', env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => ({ ok: true, json: async () => ({ stop_reason: 'refusal', content: [] }) }) });
  assert.deepEqual([refused.source, refused.text], ['script', 'L']);
  const slow = await bot.phrase({ state: 'ask', line: 'L', env: { ANTHROPIC_API_KEY: 'k', LAB_LLM_TIMEOUT_MS: '20' },
    fetchImpl: (u, i) => new Promise((res, rej) => i.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  assert.deepEqual([slow.source, slow.error], ['script', 'timeout']);
  console.log('voice caller: intents, state machine, redaction, Claude phrasing with scripted fallback (refusal, timeout)');
}

// ---------- every template is valid as created ----------
for (const [id, t] of Object.entries(TEMPLATES)) {
  const type = typeFor({ type: t.type, template: id });
  const errors = content.validateContent(content.normalize(content.defaultContent(type), type), type);
  assert.deepEqual(errors, [], `template ${id}: ${errors.join('; ')}`);
}
assert.equal(templateList().length, Object.keys(TEMPLATES).length);
console.log('templates: all ' + templateList().length + ' validate as created');

// ---------- over HTTP ----------
const getStore = memBlobs();
const OWNER = 'owner-key-0123456789abcdef';
const call = async (path, { body, key, method, headers } = {}) => {
  const req = new Request('https://lab.test' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const buf = Buffer.from(await res.arrayBuffer()), text = buf.toString('utf8'); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, buf, headers: res.headers };
};

let r = await call('/api/lab/_lab/templates', { key: OWNER });
assert(r.json.some(t => t.id === 'voice-call' && t.type === 'multimodal'));
r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'calls-pilot', name: 'Calls pilot', template: 'voice-call' } });
assert(r.json.ok, r.text); assert.equal(r.json.study.type, 'multimodal');
assert.equal((await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'x-bad', name: 'x', template: 'nope' } })).json.error, 'bad_template');
const P = '/api/lab/calls-pilot/';
r = await call(P + 'content');
assert.equal(r.json.type, 'multimodal'); assert(r.json.consent.recording.enabled);
assert(!r.text.includes('fraud prevention'), 'call scripts never reach the browser');
console.log('a study made from a template is ready at once');

// preview: a test participant, gap 0, in the chosen arm, through the participant link
r = await call(P + 'admin/preview', { key: OWNER, body: {} });
assert(r.json.url.startsWith('/lab/s/calls-pilot?code=')); const code = r.json.code;
const tok = (await call(P + 'login', { body: { code } })).json.token; assert(tok);
assert((await call(P + 'consent', { body: { token: tok, agree: true, recording: true } })).json.ok);
const plan = (await call(P + 'session', { body: { token: tok } })).json;
assert.equal(plan.total, 3); assert.equal(plan.recording, true); assert.equal(plan.directory.length, 3);
assert(!JSON.stringify(plan).includes('attack') && !JSON.stringify(plan).includes('benign'), 'the plan never says which caller is an attack');
const callIdx = plan.trials.filter(t => t.item.kind === 'call').map(t => t.index);
const intro = plan.trials.find(t => t.item.kind === 'text');
assert.equal(intro.decision, null);
assert((await call(P + 'trial', { body: { token: tok, session: 1, index: intro.index, data: { answers: {}, rtMs: 900 } } })).json.ok);

// a call: answer, talk, retry, out of order, hang up
const ci = callIdx[0], turn = (seq, kind, said) => call(P + 'call/turn', { body: { token: tok, session: 1, index: ci, seq, kind, said, latencyMs: 800 } });
const callItem = plan.trials[ci].item;
assert.equal((await turn(1, 'say', 'hi')).json.error, 'out_of_order', 'turns arrive in order');
assert.equal((await turn(0, 'say', 'hi')).json.error, 'bad_turn', 'a call starts by answering');
r = await turn(0, 'answer'); assert.equal(r.json.state, 'opener'); assert(r.json.say.length > 10);
const again = await turn(0, 'answer'); assert.equal(again.json.say, r.json.say, 'a retried turn gets the same reply');
assert.equal((await turn(3, 'say', 'hello')).json.error, 'out_of_order');
r = await turn(1, 'say', 'yes this is me'); assert.equal(r.json.state, 'pretext');
r = await turn(2, 'say', 'okay, my account ends in 4417'); assert.equal(r.json.state, 'ask', 'before the ask, the caller moves on whatever is said');
r = await turn(3, 'say', 'I would rather call you back on the number on my card'); assert.equal(r.json.state, 'deflect');
r = await turn(4, 'say', 'no thanks, I will call you back myself'); assert(r.json.done);
assert.equal((await turn(5, 'say', 'hello?')).json.error, 'call_over');
r = await turn(5, 'hangup'); assert(r.json.done);
// callback: the organization's real number resolves the truth; others greet; unlisted numbers are not in service
r = await call(P + 'call/callback', { body: { token: tok, session: 1, index: ci, number: callItem.call.number } });
assert(r.json.name && !/not in service/.test(r.json.say), 'the listed number answers');
r = await call(P + 'call/callback', { body: { token: tok, session: 1, index: ci, number: '555 0000' } });
assert(/not in service/.test(r.json.say));
// participant audio: needs consent, size and type checks, write-once
const audio = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.from('fake-opus-bytes')]).toString('base64');   // starts like a WebM file
assert.equal((await call(P + 'media/upload', { body: { token: tok, session: 1, index: ci, kind: 'call', mime: 'text/html', data: audio } })).json.error, 'bad_type');
assert.equal((await call(P + 'media/upload', { body: { token: tok, session: 1, index: ci, kind: 'call', mime: 'audio/webm;codecs=opus', data: 'x'.repeat(3_700_000) } })).status, 413);
assert.equal((await call(P + 'media/upload', { body: { token: tok, session: 1, index: ci, kind: 'call', mime: 'audio/webm', data: Buffer.from('<html>not audio</html>').toString('base64') } })).json.error, 'bad_data', 'the bytes must look like audio');
r = await call(P + 'media/upload', { body: { token: tok, session: 1, index: ci, kind: 'call', mime: 'audio/webm;codecs=opus', data: audio, durationMs: 42000 } });
assert(r.json.ok); assert.equal(r.json.key, `audio/${code}/s1/t${ci}-call`);
assert((await call(P + 'media/upload', { body: { token: tok, session: 1, index: ci, kind: 'call', mime: 'audio/webm', data: audio } })).json.repeat);
// the answer: the browser cannot set the call outcome; the server attaches its own record
r = await call(P + 'trial', { body: { token: tok, session: 1, index: ci, data: { answers: { confidence: '70', why: 'They wanted me to call another number' }, decision: 'suspicious', decisionMs: 1200, rtMs: 60000,
  answerLog: [{ atMs: 100, name: 'decision', value: 'legitimate' }, { atMs: 900, name: 'decision', value: 'suspicious' }],
  call: { answered: true, durationMs: 41000, typedTurns: 4, latencies: [800, 900] }, callServer: { outcome: 'forged' } } } });
assert(r.json.ok, r.text);
// the second call: declined
const c2 = callIdx[1];
r = await call(P + 'call/turn', { body: { token: tok, session: 1, index: c2, seq: 0, kind: 'decline' } }); assert(r.json.done);
assert((await call(P + 'trial', { body: { token: tok, session: 1, index: c2, data: { answers: { confidence: '50' }, decision: 'legitimate', call: { answered: false } } } })).json.ok);
assert((await call(P + 'survey', { body: { token: tok, session: 1, kind: 'post', data: { realistic: '6', age: '30' } } })).json.ok);

const parts = (await call(P + 'admin/participants', { key: OWNER })).json, codes = parts.map(p => p.code).join(',');
const rows = (await call(P + 'admin/rows?kind=trials&codes=' + codes, { key: OWNER })).json;
const row = rows.find(x => x.trial_index === ci);
assert.equal(row.call_outcome, 'verified', 'asking twice to verify ends the call as verified');
assert.equal(row.call_answered, 1); assert.equal(row.call_verifies, 2); assert.equal(row.call_callbacks, 2); assert.equal(row.call_callback_resolved, 1);
assert.equal(row.call_intent, callItem.call.caller === 'Harborview Bank' ? 'attack' : 'benign');
assert.equal(row.decision, 'suspicious'); assert.equal(row.decision_changes, 1); assert.equal(row.a_confidence, '70');
assert.equal(rows.find(x => x.trial_index === c2).call_outcome, 'declined');
r = await call(P + 'admin/calls.csv', { key: OWNER });
assert.equal(r.status, 200); assert(r.text.includes('[number]'), 'transcripts are stored redacted'); assert(!r.text.includes('4417'));
assert(r.text.split('\n')[0].startsWith('code,session,trial_index,turn'));
// recordings: list, download (managers and up), delete (owner)
r = await call(P + 'admin/recordings', { key: OWNER }); assert.equal(r.json.length, 1); assert.equal(r.json[0].kind, 'call');
r = await call(P + 'admin/recording?key=' + encodeURIComponent(r.json[0].key), { key: OWNER }); assert.equal(r.json.data, audio); assert.equal(r.json.mime, 'audio/webm');
assert.equal((await call(P + 'admin/recording?key=contact/x', { key: OWNER })).json.error, 'bad_key');
console.log('voice calls: turns, retries, order, callbacks, audio upload, server-side outcome, transcripts, recordings');

// stimulus files: upload (editors), served publicly with byte ranges
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
r = await call(P + 'admin/file-upload', { key: OWNER, body: { filename: 'login page.png', mime: 'image/png', data: png.toString('base64') } });
assert(r.json.ok, r.text); assert(/^\/api\/lab\/calls-pilot\/file\/f-[0-9a-f]{12}\.png$/.test(r.json.url));
assert.equal((await call(P + 'admin/file-upload', { key: OWNER, body: { mime: 'text/html', data: 'PGI+' } })).json.error, 'bad_type');
let f = await call(r.json.url); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png'); assert.deepEqual(f.buf, png);
f = await call(r.json.url, { headers: { range: 'bytes=0-3' } }); assert.equal(f.status, 206); assert.equal(f.headers.get('content-range'), `bytes 0-3/${png.length}`); assert.equal(f.buf.length, 4);
assert.equal((await call(P + 'file/f-000000000000.png')).status, 404);
assert.equal((await call(P + 'admin/files', { key: OWNER })).json[0].filename, 'login page.png');
console.log('stimulus files: upload, public serving, range requests');

// recording consent declined: no uploads
r = await call(P + 'admin/preview', { key: OWNER, body: {} });
const tok2 = (await call(P + 'login', { body: { code: r.json.code } })).json.token;
await call(P + 'consent', { body: { token: tok2, agree: true, recording: false } });
const plan2 = (await call(P + 'session', { body: { token: tok2 } })).json;
assert.equal(plan2.recording, false);
assert.equal((await call(P + 'media/upload', { body: { token: tok2, session: 1, index: 1, kind: 'call', mime: 'audio/webm', data: audio } })).json.error, 'no_recording_consent');
console.log('recording consent: separate from study consent, enforced by the server');

// deleting a participant removes their calls, callbacks, and audio
r = await call(P + 'admin/delete', { key: OWNER, body: { id: code } }); assert(r.json.ok, r.text);
assert.equal((await call(P + 'admin/recordings', { key: OWNER })).json.length, 0);
assert(!(await call(P + 'admin/calls.csv', { key: OWNER })).text.includes(code));
console.log('deleting a participant removes their call logs and recordings');

// the five-arm template: preview a chosen arm, Prolific sign-in, mouse tracking
r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'vishing-isr', name: 'Vishing training', template: 'vishing-training' } }); assert(r.json.ok, r.text);
const V = '/api/lab/vishing-isr/';
r = await call(V + 'admin/preview', { key: OWNER, body: { condition: 'a3' } }); assert.equal(r.json.condition, 'a3');
assert.equal((await call(V + 'admin/preview', { key: OWNER, body: { condition: 'zz' } })).json.error, 'bad_condition');
const t3 = (await call(V + 'login', { body: { code: r.json.code } })).json.token;
await call(V + 'consent', { body: { token: t3, agree: true } });
const pv = (await call(V + 'session', { body: { token: t3 } })).json;
assert(/One rule/.test(pv.trials[0].item.body), 'arm A3 sees its own training text');
assert.equal(pv.trials.length, 8); assert.equal(pv.practice.index, 'practice');
assert.deepEqual(pv.trials.map(t => t.block), [1, 2, 2, 2, 2, 3, 4, 4], 'blocks stay in order; items shuffle only within a block');
const vm = pv.trials.find(t => t.item.kind === 'audio');
assert.equal(vm.decision.mouseTracking, true); assert.deepEqual(vm.decision.options.map(o => o.value), ['accept', 'verify', 'refuse']);
r = await call(V + 'trial', { body: { token: t3, session: 1, index: vm.index, data: { answers: { confidence: '40' }, decision: 'verify', decisionMs: 1400,
  trajectory: [[400, 600, 0], [400, 590, 120], [300, 400, 400], [380, 250, 700], [420, 120, 1000]], media: { plays: 2, heardPct: 100, firstPlayMs: 500 } } } });
assert(r.json.ok, r.text);
const vcodes = (await call(V + 'admin/participants', { key: OWNER })).json.map(p => p.code).join(',');
const vr = (await call(V + 'admin/rows?kind=trials&codes=' + vcodes, { key: OWNER })).json.find(x => x.trial_index === vm.index);
assert.equal(vr.decision, 'verify'); assert(typeof vr.mt_mad === 'number' && vr.mt_mad !== 0); assert.equal(vr.mt_xflips, 1); assert.equal(vr.media_plays, 2); assert.equal(vr.block, 2);
console.log('five arms: preview any arm, per-arm training, blocks, mouse-tracking measures in the export');

// Prolific: sign in from the study link's ID, same record on return, completion link in the content
const cc = (await call(V + 'admin/content', { key: OWNER })).json;
for (const k of Object.keys(cc)) if (k[0] === '_') delete cc[k];
cc.enrollment.panel.completionUrl = 'https://app.prolific.com/submissions/complete?cc=C1234';
r = await call(V + 'admin/content-save', { key: OWNER, body: { content: cc, baseVersion: cc.version || 0 } }); assert(r.json.ok, r.text);
r = await call(V + 'content'); assert.equal(r.json.panel.param, 'PROLIFIC_PID'); assert(r.json.panel.completionUrl.endsWith('cc=C1234'));
const a1 = await call(V + 'login', { body: { panelId: '5f8a1b2c3d4e5f6a7b8c9d0e' } }), a2 = await call(V + 'login', { body: { panelId: '5f8a1b2c3d4e5f6a7b8c9d0e' } });
assert(a1.json.token && a2.json.token); assert.equal(a1.json.token.split('.')[0], a2.json.token.split('.')[0], 'the same panel ID is the same participant');
assert.equal((await call(V + 'login', { body: { panelId: 'x' } })).json.error, 'not_enrolled');
r = await call(V + 'admin/credit.csv', { key: OWNER }); assert(r.text.includes('5f8a1b2c3d4e5f6a7b8c9d0e'), 'the panel ID is in the payment list');
r = await call(V + 'admin/rows?kind=trials&codes=' + a1.json.token.split('.')[0], { key: OWNER }); assert(!r.text.includes('5f8a1b'), 'and never in the research exports');
console.log('Prolific: link sign-in, stable IDs, completion link, IDs only in the payment list');

// the live self-test runs the multimodal type through every session of an arm
for (const cond of ['a0', 'a4']) {
  r = await call(V + 'admin/self-test', { key: OWNER, body: { condition: cond } });
  let guard = 0; while (!r.json.done && guard++ < 40) r = await call(V + 'admin/self-test', { key: OWNER, body: { condition: cond, code: r.json.code } });
  assert.equal(r.json.failed, 0, JSON.stringify(r.json).slice(0, 1200));
}
console.log('self-test: passes for the multimodal type');
console.log('multimodal: all checks passed');
