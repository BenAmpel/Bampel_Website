// The open conversation mode for call items, over HTTP with in-memory stores and stubbed Claude and ElevenLabs:
// Claude writes each caller line, ElevenLabs speaks it (mp3) and transcribes the participant, <end/> ends the call,
// the turn cap closes it, a failed reply asks again, a crisis line ends it, and attack calls cannot use it.
// The default scripted call never touches ElevenLabs.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import { OPEN_RETRY, OPEN_CRISIS } from '../../netlify/lib/lab/types/multimodal.mjs';

process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.ELEVENLABS_API_KEY = 'test-eleven';

const seen = [], claudeBodies = [];
let replies = [], claudeDown = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); seen.push(u);
  if (u.startsWith('https://api.anthropic.com/')) {
    claudeBodies.push(JSON.parse(init.body));
    if (claudeDown) return new Response('{}', { status: 529 });
    return Response.json({ model: 'claude-test', stop_reason: 'end_turn', content: [{ type: 'text', text: replies.shift() || 'Okay.' }] });
  }
  if (u.startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) return new Response(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(400)]), { headers: { 'content-type': 'audio/mpeg' } });
  if (u === 'https://api.elevenlabs.io/v1/speech-to-text') return Response.json({ text: 'We switched to Aetna this year', language_code: 'en' });
  return new Response('not here', { status: 404 });
};
const eleven = () => seen.filter(u => new URL(u).hostname === 'api.elevenlabs.io');

const OWNER = 'owner-key-for-tests-0123456789';
const getStore = memBlobs();
const call = async (path, { body, key } = {}) => {
  const req = new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const buf = Buffer.from(await res.arrayBuffer()), text = buf.toString('utf8'); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
};

let r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'open-call', name: 'Open call', template: 'voice-call' } });
assert(r.json.ok, r.text);
const P = '/api/lab/open-call/';
const content = async () => { const c = (await call(P + 'admin/content', { key: OWNER })).json; for (const k of Object.keys(c)) if (k[0] === '_') delete c[k]; return c; };
const save = c => call(P + 'admin/content-save', { key: OWNER, body: { content: c, baseVersion: c.version || 0 } });

// validation: open conversation is for legitimate callers only, and needs a persona and an opener
let c = await content();
const bank = c.items.find(i => i.id === 'call-bank-fraud'), pharmacy = c.items.find(i => i.id === 'call-pharmacy');
bank.call.mode = 'open';
r = await save(c); assert(!r.json.ok, 'an attack call cannot be an open conversation'); assert(/benign/.test(r.text), r.text);
bank.call.mode = 'scripted'; pharmacy.call.mode = 'open'; pharmacy.call.elevenVoice = 'bad voice!';
r = await save(c); assert(!r.json.ok); assert(/voice ID/.test(r.text), r.text);
pharmacy.call.elevenVoice = 'AbCdEf0123456789XyZw'; const persona = pharmacy.call.persona; pharmacy.call.persona = '';
r = await save(c); assert(!r.json.ok); assert(/caller description/.test(r.text), r.text);
pharmacy.call.persona = persona;
r = await save(c); assert(r.json.ok, r.text);
console.log('validation: open conversation only for benign callers, with a voice ID, persona and opener');

// one participant through the intro, returning the plan
async function participant() {
  const code = (await call(P + 'admin/preview', { key: OWNER, body: {} })).json.code;
  const tok = (await call(P + 'login', { body: { code } })).json.token;
  assert((await call(P + 'consent', { body: { token: tok, agree: true, recording: true } })).json.ok);
  const plan = (await call(P + 'session', { body: { token: tok } })).json;
  const intro = plan.trials.find(t => t.item.kind === 'text');
  assert((await call(P + 'trial', { body: { token: tok, session: 1, index: intro.index, data: { answers: {}, rtMs: 900 } } })).json.ok);
  const idx = n => plan.trials.find(t => t.item.kind === 'call' && t.item.call.number === n).index;
  const turn = (index, seq, kind, extra = {}) => call(P + 'call/turn', { body: { token: tok, session: 1, index, seq, kind, latencyMs: 700, ...extra } });
  return { pharm: idx('800-555-0177'), bank: plan.trials.find(t => t.item.kind === 'call' && t.item.call.number !== '800-555-0177').index, turn };
}

// a full open conversation: verbatim opener, Claude's lines, ElevenLabs voice and transcription, <end/>
{
  const p = await participant();
  r = await p.turn(p.pharm, 0, 'answer');
  assert.equal(r.json.say, pharmacy.call.script.opener, 'the opener is the study\'s line, word for word');
  assert.equal(claudeBodies.length, 0, 'answering does not call Claude');
  assert(/\/file\/f-[0-9a-f]{12}\.mp3$/.test(r.json.audio), 'the opener is spoken by ElevenLabs: ' + r.json.audio);
  const f = await call(r.json.audio); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'audio/mpeg');

  replies = ['Great. Your refill is ready, and your insurance on file changed. Which company are you with now?'];
  r = await p.turn(p.pharm, 1, 'say', { said: 'Hi, sure, I have a minute' });
  assert.equal(r.json.say, 'Great. Your refill is ready, and your insurance on file changed. Which company are you with now?');
  assert.equal(r.json.state, 'talk'); assert(!r.json.done); assert(r.json.audio.endsWith('.mp3'));
  const sent = claudeBodies.at(-1);
  assert(/Contoso Pharmacy/.test(sent.system) && /Never ask for a password/.test(sent.system) && /<end\/>/.test(sent.system));
  assert.deepEqual(sent.messages.slice(0, 2).map(m => m.content), ['(The person answers the phone.)', pharmacy.call.script.opener], 'Claude sees the opener it already said');

  replies = ['Aetna, got it. Thanks, that is all I needed. Have a good day. <end/>'];
  r = await p.turn(p.pharm, 2, 'say', { audio: Buffer.from('RIFF fake wav bytes').toString('base64') });
  assert.equal(r.json.heard, 'We switched to Aetna this year', 'spoken answers are transcribed by ElevenLabs');
  assert(r.json.done, 'the <end/> marker ends the call'); assert(!r.json.say.includes('<end'), 'and is never spoken');
  assert.equal(claudeBodies.at(-1).messages.at(-1).content, 'We switched to Aetna this year');
  assert.equal((await p.turn(p.pharm, 3, 'say', { said: 'hello?' })).json.error, 'call_over');

  const csv = (await call(P + 'admin/calls.csv', { key: OWNER })).text;
  assert(/,open,/.test(csv) && /elevenlabs/.test(csv), 'the per-turn export marks the mode and the voice engine');
  console.log('open call: verbatim opener, Claude lines, ElevenLabs voice and transcription, <end/> closes it');

  // the scripted call next to it never calls ElevenLabs
  const before = eleven().length;
  r = await p.turn(p.bank, 0, 'answer'); assert.equal(r.json.state, 'opener');
  r = await p.turn(p.bank, 1, 'say', { said: 'yes this is me' }); assert.equal(r.json.state, 'pretext');
  assert.equal(eleven().length, before, 'a scripted call makes no ElevenLabs requests');
  console.log('scripted call stays the default and never calls ElevenLabs');
}

// Claude down: the caller asks again; a crisis line ends the call with the fixed message
{
  const p = await participant();
  await p.turn(p.pharm, 0, 'answer');
  claudeDown = true;
  r = await p.turn(p.pharm, 1, 'say', { said: 'Who is this again?' });
  assert.equal(r.json.say, OPEN_RETRY); assert(!r.json.done);
  claudeDown = false;
  const n = claudeBodies.length;
  r = await p.turn(p.pharm, 2, 'say', { said: 'honestly I want to die' });
  assert.equal(r.json.say, OPEN_CRISIS); assert(r.json.done); assert.equal(claudeBodies.length, n, 'a crisis line never goes to Claude');
  const csv = (await call(P + 'admin/calls.csv', { key: OWNER })).text;
  assert(/fallback/.test(csv) && /http_529/.test(csv), 'the failed reply is recorded');
  console.log('Claude failure asks again; a crisis line ends the call without Claude');
}

// the turn cap: the last turn says goodbye and closes the call
{
  const p = await participant();
  await p.turn(p.pharm, 0, 'answer');
  const max = pharmacy.call.maxTurns;
  for (let i = 1; i <= max; i++) {
    replies = ['Mm-hm, go on.'];
    r = await p.turn(p.pharm, i, 'say', { said: 'let me think about it' });
    if (i < max) assert(!r.json.done, 'turn ' + i);
  }
  assert(r.json.done, 'the call closes at the turn cap'); assert(/last turn/.test(claudeBodies.at(-1).system));
  console.log('the turn cap closes the call with a goodbye');
}

// no Claude key: an open item quietly runs as the scripted call
{
  delete process.env.ANTHROPIC_API_KEY;
  const p = await participant(), before = eleven().length;
  await p.turn(p.pharm, 0, 'answer');
  r = await p.turn(p.pharm, 1, 'say', { said: 'yes this is me' });
  assert.equal(r.json.state, 'pretext', 'without Claude the scripted tree runs'); assert.equal(eleven().length, before);
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  console.log('without a Claude key the open item falls back to the scripted call');
}
