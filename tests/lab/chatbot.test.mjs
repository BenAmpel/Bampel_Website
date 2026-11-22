// Study type "chatbot": a live conversation with a language model, typed or spoken. Offline: the model and the speech
// services are a stub fetch, so the tests can count calls. Covers the template, the plan a participant can see, turns
// (write-once, in order, retried safely), the crisis message, failures, speech in both directions, the summary and
// CSVs, deleting a participant, and the live self-test.
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { TEMPLATES } from '../../netlify/lib/lab/templates.mjs';
import { runSelfTest } from '../../netlify/lib/lab/selftest.mjs';
import * as bot from '../../netlify/lib/lab/chatbot.mjs';
import { memStore } from './memstore.mjs';

const type = TYPES.chatbot;
const KEYS = { ANTHROPIC_API_KEY: 'test-anthropic', ELEVENLABS_API_KEY: 'test-eleven' };
const WEBM = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(600, 7)]).toString('base64');

// A stub for the three services. mode: { llm, tts, stt } each 'ok' | 'fail' | 'refuse'.
function services(mode = {}) {
  const calls = { llm: [], tts: [], stt: [] };
  const fetchImpl = async (url, init) => {
    if (new URL(url).hostname === 'api.anthropic.com') {
      const body = JSON.parse(init.body); calls.llm.push(body);
      if (mode.llm === 'fail') return new Response('{"type":"error"}', { status: 529 });
      if (mode.llm === 'refuse') return Response.json({ content: [], stop_reason: 'refusal', model: body.model });
      return Response.json({ content: [{ type: 'text', text: `Reply ${calls.llm.length} to: ${body.messages.at(-1).content}` }], stop_reason: 'end_turn', model: body.model });
    }
    if (url.includes('/text-to-speech/')) { calls.tts.push(url); return mode.tts === 'fail' ? new Response('no', { status: 500 }) : new Response(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(400, 7)]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }); }
    if (url.includes('/speech-to-text')) { calls.stt.push(url); return mode.stt === 'fail' ? new Response('no', { status: 500 }) : Response.json({ text: '  I have been  worried about work ', language_code: 'en' }); }
    throw new Error('unexpected request to ' + url);
  };
  return { calls, fetchImpl };
}

async function setup({ template = 'chatbot-empathy', edit, env = KEYS, mode } = {}) {
  const base = memStore(), svc = services(mode);
  const study = { id: 'chat-test', name: 'Chat test', type: 'chatbot', codePrefix: 'CT', seedId: 'chat-test-v1', template };
  const S = { store: base, type, study, env, fetchImpl: svc.fetchImpl };
  const c = C.normalize(template ? { ...C.defaultContent(type), ...TEMPLATES[template].content() } : C.defaultContent(type), type);
  if (edit) edit(c);
  C.normalize(c, type);
  assert.deepEqual(C.validateContent(c, type), []);
  const r = await C.saveContent(base, type, c, 'Tester', 0);
  assert(!r.error, JSON.stringify(r));
  C.clearContentCache(base);
  return { S, base, calls: svc.calls, content: c };
}
async function person(S, condition) {
  const p = await E.createTestParticipant(S, condition), code = p.code;
  await E.consent(S, code, true);
  let plan = await E.startSession(S, code);
  if (plan.surveyPre && plan.surveyPre.length && !plan.preDone) {
    const data = { answers: Object.fromEntries(plan.surveyPre.filter(q => q.type === 'scale').map(q => [q.id, 4])) };
    const r = await E.saveSurvey(S, code, plan.session || 1, 'pre', data); assert(r.ok, JSON.stringify(r));
    plan = await E.startSession(S, code);
  }
  return { code, plan, at: { session: plan.session || 1, index: 0 } };
}
const R = type.routes;

// ---------- content ----------
{
  const d = C.normalize(C.defaultContent(type), type);
  assert.deepEqual(C.validateContent(d, type), [], 'the default content is valid');
  const t = C.normalize({ ...C.defaultContent(type), ...TEMPLATES['chatbot-empathy'].content() }, type);
  assert.deepEqual(C.validateContent(t, type), [], 'the template is valid');
  assert.deepEqual(t.design.conditions.map(x => x.id), ['synthetic', 'sympathy', 'humanlike', 'control']);
  assert.deepEqual(Object.keys(t.chat.prompts).sort(), ['control', 'humanlike', 'sympathy', 'synthetic'], 'one instruction per condition');
  assert.equal(t.chat.promptsReviewed, false); assert.equal(t.consent.approved, false, 'the template ships as a draft');
  const bad = structuredClone(t); bad.chat.prompts.ghost = 'x'; delete bad.chat.prompts.control; bad.chat.minTurns = 50;
  const errs = C.validateContent(bad, type); assert(errs.length >= 2, 'an instruction for no condition, a missing one, and a bad turn limit are refused: ' + errs.join(' | '));
  console.log('chatbot: default content and the four-condition template validate; bad instructions are refused');
}

// ---------- the plan: the instruction never reaches the participant ----------
{
  const { S, content } = await setup();
  const hashes = new Set();
  for (const cond of ['synthetic', 'sympathy', 'humanlike', 'control']) {
    const { code, plan } = await person(S, cond);
    const sent = JSON.stringify(plan);
    for (const secret of [content.chat.prompts[cond].slice(0, 40), content.chat.basePrompt.slice(0, 40), content.chat.safety.rule.slice(0, 40), 'promptHash'])
      assert(!sent.includes(secret), `${cond}: the plan sent to the browser does not carry "${secret.slice(0, 20)}"`);
    assert.equal(plan.trials.length, 1); assert.equal(plan.trials[0].item.opening, content.chat.opening);
    const stored = await S.store.get(`plans/${code}/s1`) || (await E.loadParticipant(S, code)).sessions[1].plan;
    assert(stored.chat.system.includes(content.chat.prompts[cond]), 'the stored plan holds this condition\'s instruction');
    for (const other of Object.keys(content.chat.prompts)) if (other !== cond) assert(!stored.chat.system.includes(content.chat.prompts[other]), `${cond} does not get the ${other} instruction`);
    assert(stored.chat.system.includes(content.chat.safety.rule));
    hashes.add(stored.chat.promptHash);
  }
  assert.equal(hashes.size, 4, 'each condition has its own prompt hash');
  console.log('chatbot: each condition gets its own instruction, and none of it is in the plan the browser receives');
}

// ---------- turns ----------
{
  const { S, base, calls } = await setup({ edit: c => { c.chat.minTurns = 2; c.chat.maxTurns = 3; } });
  const { code, at } = await person(S, 'synthetic');
  const st = await R['chat/state'](S, code, at);
  assert.deepEqual(st.turns, []); assert.equal(st.max, 3); assert.deepEqual(st.on, { chat: true, hear: true, speak: true });
  assert.equal((await R['chat/turn'](S, code, { ...at, seq: 1, text: 'too early' })).error, 'out_of_order');
  assert.equal((await R['chat/turn'](S, code, { ...at, seq: 0, text: '   ' })).error, 'empty');
  assert.equal(calls.llm.length, 0);
  const t0 = await R['chat/turn'](S, code, { ...at, seq: 0, text: 'Work has been heavy. Write to me at jo@example.com.', sinceMs: 4200 }, 1000);
  assert.equal(t0.seq, 0); assert(t0.bot.startsWith('Reply 1')); assert.equal(t0.done, false);
  const req = calls.llm[0];
  assert.equal(req.model, bot.DEFAULT_MODEL); assert(!('temperature' in req) && !('thinking' in req), 'no sampling or thinking parameters');
  assert.equal(req.messages[0].role, 'user'); assert.equal(req.messages.at(-1).role, 'user', 'no prefilled assistant turn');
  assert(JSON.stringify(req.system).includes('DRAFT'), 'the condition instruction is in the system prompt');
  const again = await R['chat/turn'](S, code, { ...at, seq: 0, text: 'a different message on retry' }, 2000);
  assert.equal(again.bot, t0.bot, 'a retried turn returns the stored reply'); assert.equal(calls.llm.length, 1, 'and does not call the model again');
  const stored = await base.get(`chats/${code}/s1/t0/000`);
  assert(!stored.user.includes('jo@example.com'), 'emails are masked before a message is stored'); assert.equal(stored.condition, 'synthetic');
  assert.equal(stored.input, 'text'); assert.equal(stored.source, 'llm'); assert.equal(stored.sinceMs, 4200); assert(stored.promptHash);
  await R['chat/turn'](S, code, { ...at, seq: 1, text: 'second' }, 3000);
  assert.equal(calls.llm[1].messages.length >= 3, true, 'earlier turns are sent as history');
  const last = await R['chat/turn'](S, code, { ...at, seq: 2, text: 'third' }, 4000);
  assert.equal(last.done, true, 'the last allowed turn says the conversation is over');
  assert.equal((await R['chat/turn'](S, code, { ...at, seq: 3, text: 'fourth' })).error, 'chat_over');
  assert.equal((await R['chat/state'](S, code, at)).turns.length, 3, 'a reload gets the conversation back');

  // submitting the item attaches the server's summary, and the conversation is then closed
  const saved = await E.saveTrial(S, code, 1, 0, { answers: { je_understood: 6 }, rtMs: 60000, chat: { ended: 'max', chatMs: 51000, browserVoice: 0, audioPlayed: 0, micBlocked: false, retries: 0, junk: 'x' } });
  assert(saved.ok, JSON.stringify(saved));
  const full = await E.exportRecords(S, [code]), rec = full.records.find(x => /\/t0$/.test(x.key)), row = E.trialRow(S, rec, full.participants[0]);
  assert.equal(row.chat_turns, 3); assert.equal(row.chat_ended, 'max'); assert.equal(row.chat_ms, 51000); assert.equal(row.chat_reached_min, 1);
  assert.equal(row.chat_model, bot.DEFAULT_MODEL); assert.equal(row.chat_prompt_hash, stored.promptHash); assert.equal(row.chat_llm_errors, 0); assert.equal(String(row.a_je_understood), '6');
  assert(!JSON.stringify(rec).includes('junk'), 'unknown client fields are dropped');
  assert.equal((await R['chat/state'](S, code, at)).error, 'chat_over', 'no more turns after the item is submitted');

  // the transcript download
  const audits = [], out = await type.adminRoutes['chat.csv'].handler(S, { audit: async (a, d) => { audits.push([a, d]); } }), csv = out.csv;
  assert.equal(type.adminRoutes['chat.csv'].need, 'manager'); assert.deepEqual(audits, [['chat.export', '3 turns']], 'the download is audited');
  assert(csv.split('\n')[0].startsWith('code,session,trial_index,turn,condition'), 'transcript header: ' + csv.slice(0, 80));
  assert.equal(csv.trim().split('\n').length, 4, 'one row per turn'); assert(csv.includes('synthetic') && csv.includes('Reply 1'));
  console.log('chatbot: turns are write-once, ordered, capped, summarised on submit, and exported one row per turn');

  // deleting the participant removes the conversation
  const d = await E.deleteParticipant(S, code); assert(d.ok);
  assert.deepEqual([...base.m.keys()].filter(k => /^(chats|chatstt|chattts|chaterr)\//.test(k)), [], 'nothing of the conversation is left');
}

// ---------- the crisis message, and failures ----------
{
  const { S, base, calls, content } = await setup();
  const { code, at } = await person(S, 'control');
  const t = await R['chat/turn'](S, code, { ...at, seq: 0, text: 'Honestly I want to die.' }, 1000);
  assert.equal(t.bot, content.chat.safety.crisisLine); assert.equal(calls.llm.length, 0, 'the model is not asked');
  assert.equal(t.safety, true, 'the page is told, so it can let the participant end at once');
  assert.equal((await base.get(`chats/${code}/s1/t0/000`)).source, 'safety');
  assert(bot.isCrisis('i have been thinking about suicide') && !bot.isCrisis('this deadline is killing my weekend'));
}
for (const how of ['fail', 'refuse']) {
  const { S, base, calls } = await setup({ mode: { llm: how } });
  const { code, at } = await person(S, 'sympathy');
  const t = await R['chat/turn'](S, code, { ...at, seq: 0, text: 'hello' }, 1000);
  assert.equal(t.error, 'reply_failed'); assert.equal(t.status, 503); assert.equal(calls.llm.length, 1);
  assert.equal(await base.get(`chats/${code}/s1/t0/000`), null, 'no turn is stored, so no made-up reply enters the data');
  assert.equal((await base.list(`chaterr/${code}/`)).length, 1, 'the failure is logged');
  const saved = await E.saveTrial(S, code, 1, 0, { answers: {}, rtMs: 1, chat: { ended: 'error', chatMs: 10 } });
  const full = await E.exportRecords(S, [code]), row = E.trialRow(S, full.records.find(x => /\/t0$/.test(x.key)), full.participants[0]);
  assert(saved.ok); assert.equal(row.chat_turns, 0); assert.equal(row.chat_llm_errors, 1); assert.equal(row.chat_ended, 'error'); assert.equal(row.chat_reached_min, 0);
}
{
  const { S, calls } = await setup({ env: {} });
  const { code, at } = await person(S, 'control');
  assert.deepEqual((await R['chat/state'](S, code, at)).on, { chat: false, hear: false, speak: false });
  const t = await R['chat/turn'](S, code, { ...at, seq: 0, text: 'hello' });
  assert.equal(t.error, 'chat_off'); assert.equal(calls.llm.length, 0);
  console.log('chatbot: crisis text gets the fixed message without a model call; failures and a missing key store no turn');
}

// ---------- speech ----------
{
  const { S, base, calls } = await setup({ edit: c => { c.chat.mode = 'voice'; } });
  const a = await person(S, 'humanlike');
  assert.equal(a.plan.trials[0].item.speak, true, 'a spoken conversation is always answered aloud');
  assert.equal((await R['chat/hear'](S, a.code, { ...a.at, data: Buffer.from('not audio at all').toString('base64'), mime: 'audio/webm' })).error, 'bad_audio');
  const h = await R['chat/hear'](S, a.code, { ...a.at, data: WEBM, mime: 'audio/webm', durationMs: 3100 }, 1795000001000);
  assert.equal(h.text, 'I have been worried about work'); assert(h.id);
  assert(!JSON.stringify([...base.m.values()]).includes(WEBM.slice(0, 60)), 'the recording itself is not stored');
  const t = await R['chat/turn'](S, a.code, { ...a.at, seq: 0, text: 'I have been worried about work and sleep', heard: h.id }, 2000);
  const stored = await base.get(`chats/${a.code}/s1/t0/000`);
  assert.equal(stored.input, 'voice'); assert.equal(stored.heardText, 'I have been worried about work'); assert.equal(stored.edited, true);
  assert(JSON.stringify(calls.llm[0].system).toLowerCase().includes('aloud') || JSON.stringify(calls.llm[0].system).includes(bot.SPOKEN_RULE), 'the spoken-format rule is added');
  const open = await R['chat/voice'](S, a.code, { ...a.at, seq: 'open' }, 3000), v0 = await R['chat/voice'](S, a.code, { ...a.at, seq: 0 }, 3100);
  assert(open.audio.includes('/file/f-') && v0.audio.includes('/file/f-')); assert.equal(calls.tts.length, 2);
  assert.equal((await R['chat/voice'](S, a.code, { ...a.at, seq: 0 }, 3200)).audio, v0.audio, 'asking twice returns the same audio'); assert.equal(calls.tts.length, 2);
  assert.equal((await R['chat/voice'](S, a.code, { ...a.at, seq: 7 })).error, 'not_found');
  const b = await person(S, 'humanlike');
  assert.equal((await R['chat/voice'](S, b.code, { ...b.at, seq: 'open' }, 4000)).audio, open.audio, 'the opening line is spoken once per study'); assert.equal(calls.tts.length, 2);
  assert(t.bot);
  // deleting one participant keeps the shared opening audio and removes their own
  const own = v0.audio.split('/file/')[1], shared = open.audio.split('/file/')[1];
  await E.deleteParticipant(S, a.code);
  assert.equal(await base.get('files/' + own), null); assert(await base.get('files/' + shared), 'the shared opening stays for the others');
}
{
  const { S, base, calls } = await setup({ edit: c => { c.chat.mode = 'either'; c.chat.voice.speak = true; }, mode: { tts: 'fail', stt: 'fail' }, env: { ...KEYS } });
  const { code, at } = await person(S, 'control');
  assert.equal((await R['chat/hear'](S, code, { ...at, data: WEBM, mime: 'audio/webm' }, 1000)).error, 'hear_failed');
  await R['chat/turn'](S, code, { ...at, seq: 0, text: 'typed instead' }, 2000);
  assert.deepEqual(await R['chat/voice'](S, code, { ...at, seq: 0 }, 3000), { fallback: true }, 'a voice failure tells the page to use the browser voice');
  await E.saveTrial(S, code, 1, 0, { answers: {}, rtMs: 1, chat: { ended: 'user', chatMs: 10, browserVoice: 1 } });
  const full = await E.exportRecords(S, [code]), row = E.trialRow(S, full.records.find(x => /\/t0$/.test(x.key)), full.participants[0]);
  assert.equal(row.chat_stt_errors, 1); assert.equal(row.chat_tts_errors, 1); assert.equal(row.chat_browser_voice, 1); assert.equal(row.chat_voice_turns, 0);
  assert(calls.stt.length >= 1 && calls.tts.length >= 1); assert(base);
}
{
  const { S } = await setup({ edit: c => { c.chat.mode = 'text'; } });
  const { code, at, plan } = await person(S, 'control');
  assert.equal(plan.trials[0].item.speak, false);
  assert.equal((await R['chat/hear'](S, code, { ...at, data: WEBM, mime: 'audio/webm' })).error, 'voice_off');
  assert.equal((await R['chat/voice'](S, code, { ...at, seq: 'open' })).error, 'voice_off');
  console.log('chatbot: speech to text, the chatbot\'s voice, the shared opening line, and both fallbacks behave');
}

// ---------- the live self-test, with and without keys ----------
for (const env of [KEYS, {}]) {
  const { S, base } = await setup({ env });
  let r = await runSelfTest(S, { condition: 'synthetic', budgetMs: 5000 });
  while (!r.done) { assert(!r.error, JSON.stringify(r)); r = await runSelfTest(S, { code: r.code, budgetMs: 5000 }); }
  assert.equal(r.failed, 0, JSON.stringify(r.checks.filter(c => !c.pass)));
  assert.deepEqual([...base.m.keys()].filter(k => /^(chats|chatstt|chattts|chaterr|data|plans)\//.test(k)), [], 'the self-test leaves nothing behind');
}
console.log('chatbot: the live self-test passes with the services on and off');
