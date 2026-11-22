// Study type: chatbot (a live conversation with an AI chatbot, in text or by voice).
// Each participant has one conversation per session, then answers the study's questions about it. Conditions differ
// only in the instruction the chatbot is given (chat.prompts, one per condition, written on the Chatbot tab), so a
// manipulation of how the chatbot talks needs no code. Replies come from Claude; speech in both directions comes from
// ElevenLabs, with the lab's own voice and speech services and the browser's voice as fallbacks (../chatbot.mjs).
//
// Stored per turn (write-once, in order): chats/{code}/s{n}/t0/{seq} with the participant's message, the reply, the
// condition, a hash of the exact system prompt, the model, and the timings. The transcript export is chat.csv.
// Recordings are turned into text and never stored. Messages are kept readable on the server (the chatbot needs the
// history) with emails, addresses, and long numbers masked before they are stored or sent to the model.
// Participant renderer: static/lab/engine/types/chatbot.js. Editor: chatbot-admin.js.
import { randomBytes } from 'node:crypto';
import { cleanAnswers, loadParticipant, toCsv } from '../engine.mjs';
import { sealLog, logValue } from '../seal.mjs';
import { validateQuestions } from '../content.mjs';
import { publicQuestions, evalDisplay, orderItems } from '../logic.mjs';
import { getMany, setNew } from '../store.mjs';
import { redact } from '../voicebot.mjs';
import { looksLikeAudio, MAX_AUDIO_B64 } from './multimodal.mjs';
import * as bot from '../chatbot.mjs';

const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Instructions', 'instr_intro', 'Instructions', 'You will have a short conversation with an AI chatbot, then answer a few questions about it.'),
  F('Conversation', 'progress_trial', 'Progress line ({session})', 'Conversation'),
  F('Conversation', 'progress_practice', 'Progress line, practice', 'Practice'),
  F('Conversation', 'chat_ai_note', 'Note above the conversation ({bot})', 'You are talking with an AI system, not a person.'),
  F('Conversation', 'chat_label', 'Label of the message box', 'Your message'),
  F('Conversation', 'chat_start', 'Start button (shown when the chatbot speaks)', 'Start the conversation'),
  F('Conversation', 'chat_send', 'Send button', 'Send'),
  F('Conversation', 'chat_record', 'Record button', 'Record a message'),
  F('Conversation', 'chat_stop', 'Stop-recording button', 'Stop and send'),
  F('Conversation', 'chat_stop_review', 'Stop-recording button when the text can be edited first', 'Stop recording'),
  F('Conversation', 'chat_recording', 'Shown while recording', 'Recording. Speak now.'),
  F('Conversation', 'chat_transcribing', 'Shown while a recording is turned into text', 'Writing down what you said...'),
  F('Conversation', 'chat_thinking', 'Shown while the chatbot writes ({bot})', '{bot} is writing...'),
  F('Conversation', 'chat_you', 'Name on the participant\'s messages', 'You'),
  F('Conversation', 'chat_turns', 'Turn counter ({i}, {n})', 'Message {i} of up to {n}'),
  F('Conversation', 'chat_min', 'Shown until the conversation can be ended ({n} = messages still needed)', 'Send at least {n} more before ending the conversation.'),
  F('Conversation', 'chat_end', 'End button', 'End the conversation'),
  F('Conversation', 'chat_ended', 'Shown when the conversation is over', 'The conversation has ended.'),
  F('Conversation', 'chat_type_instead', 'Shown when the microphone cannot be used', 'The microphone is not available, so please type your message.'),
  F('Conversation', 'chat_not_heard', 'Shown when a recording had no speech', 'Nothing was heard. Please try again.'),
  F('Conversation', 'chat_retry', 'Shown when a reply did not arrive', 'The reply did not arrive. Your message is still here; please send it again.'),
  F('Conversation', 'chat_off', 'Shown when the chatbot is not switched on', 'The chatbot is not available right now. Please tell the research team.'),
  F('Conversation', 'chat_skip', 'Button shown when the chatbot is not answering', 'Go on to the questions'),
  F('Questions', 'chat_after', 'Heading above the questions', 'About the conversation'),
  F('Questions', 'submit_button', 'Submit button', 'Continue')
];

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const jsonSize = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };
const pad = n => String(n).padStart(3, '0');
const wordCount = s => String(s || '').split(/\s+/).filter(Boolean).length;
const median = a => { const s = a.filter(x => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const MODES = ['text', 'voice', 'either'];
const MAX_USER = 1500, MAX_HEARD = 60;
const envOf = S => S.env || process.env, fetchOf = S => S.fetchImpl || globalThis.fetch;

const DEFAULT_BASE = 'You are an AI chatbot in a university research study. The participant is an adult who agreed to talk with you about something that has been on their mind. Listen, respond to what they actually said, and keep the conversation going with them for a few turns. You are an AI system and say so if asked. Do not give medical, legal, or financial advice, and do not claim to be a person.';
const DEFAULT_SAFETY = 'If the participant mentions wanting to harm themselves or someone else, or describes an emergency, stop the usual conversation, say plainly that you are an AI system and cannot help with that, and tell them to call or text 988 (in the United States) or their local emergency number.';
const DEFAULT_CRISIS = 'I am an AI system and I am not able to help with this, but people are available right now who can. In the United States you can call or text 988 to reach the Suicide and Crisis Lifeline at any time, or call 911 if you are in immediate danger. Outside the United States, please call your local emergency number. You can stop this study at any point.';

// ---------- conversation routes (participant) ----------
async function chatContext(S, pid, body) {
  const p = await loadParticipant(S, pid);
  if (!p) return { error: 'expired', status: 401 };
  const session = Number(body.session), idx = Number(body.index);
  if (!int(session, 1, 99) || !int(idx, 0, 999)) return { error: 'bad_index', status: 400 };
  const plan = p.sessions?.[session]?.plan || await S.store.get(`plans/${p.code}/s${session}`);
  if (!plan || !plan.chat) return { error: 'wrong_session', status: 409 };
  const trial = plan.trials[idx];
  if (!trial || trial.itemId !== 'chat') return { error: 'bad_index', status: 400 };
  const tag = `${p.code}/s${session}/t${idx}`;
  if (await S.store.get(`data/${tag}`)) return { error: 'chat_over', status: 409 };   // the item is already submitted
  return { p, plan, chat: plan.chat, trial, session, idx, tag };
}
const turnsOf = async (S, tag) => (await getMany(S.store, (await S.store.list(`chats/${tag}/`)).sort())).map(([, v]) => v).filter(Boolean);
const fault = (S, tag, now, rec) => S.store.set(`chaterr/${tag}/${now}-${randomBytes(2).toString('hex')}`, { at: now, ...rec });
// user = the message as stored (masked). safety = the fixed crisis message was sent: the page then lets the participant
// end at once, whatever the minimum number of messages.
const publicTurn = (t, max) => ({ seq: t.seq, user: t.user, bot: t.bot, done: t.seq + 1 >= max, ...(t.source === 'safety' ? { safety: true } : {}) });

// Where the conversation stands, for a page that was reloaded part-way through, and which services are on.
async function chatState(S, pid, body) {
  const ctx = await chatContext(S, pid, body);
  if (ctx.error) return ctx;
  const sv = bot.services(envOf(S));
  return { turns: (await turnsOf(S, ctx.tag)).map(t => publicTurn(t, ctx.chat.maxTurns)), max: ctx.chat.maxTurns,
    on: { chat: sv.llm, hear: sv.eleven || sv.labEars, speak: sv.eleven || sv.labVoice } };
}

// One turn: the participant's message in, the chatbot's reply out. Asking again for a turn that is already stored
// returns the stored reply (a retry never produces a second, different answer). When Claude does not answer, nothing
// is written and the page asks the participant to send the message again.
async function chatTurn(S, pid, body, now) {
  const ctx = await chatContext(S, pid, body);
  if (ctx.error) return ctx;
  const { chat, tag } = ctx, seq = Number(body.seq);
  if (!int(seq, 0, 999)) return { error: 'bad_turn', status: 400 };
  const key = `chats/${tag}/${pad(seq)}`, existing = await S.store.get(key);
  if (existing) return publicTurn(existing, chat.maxTurns);
  if (seq >= chat.maxTurns) return { error: 'chat_over', status: 409 };
  const typed = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_USER);
  if (!typed) return { error: 'empty', status: 400 };
  const prior = await turnsOf(S, tag);
  if (prior.length !== seq) return { error: 'out_of_order', status: 409, next: prior.length };
  // A message that came from a recording points at its transcript, so the data says whether it was spoken and edited.
  const heard = /^\d{10,16}-[0-9a-f]{4}$/.test(body.heard || '') ? await S.store.get(`chatstt/${tag}/${body.heard}`) : null;
  const user = redact(typed);
  let out;
  if (bot.isCrisis(typed)) out = { text: chat.crisisLine, source: 'safety', model: null, ms: 0 };
  else {
    const r = await bot.reply({ system: chat.system, opening: chat.opening, turns: prior, text: user, env: envOf(S), fetchImpl: fetchOf(S) });
    if (r.error) {
      await fault(S, tag, now, { kind: 'llm', seq, error: r.error, ms: r.ms });
      return r.error === 'not_configured' ? { error: 'chat_off', status: 503 } : { error: 'reply_failed', status: 503 };
    }
    out = { text: r.text, source: 'llm', model: r.model, ms: r.ms };
  }
  const rec = { seq, at: now, condition: ctx.p.condition, promptHash: chat.promptHash, user, input: heard ? 'voice' : 'text', heardText: heard ? heard.text : null, edited: heard ? heard.text !== user : null,
    bot: out.text, source: out.source, model: out.model, llmMs: out.ms, sinceMs: num(body.sinceMs, 0, 864e5), userWords: wordCount(user), botWords: wordCount(out.text), ...(ctx.p.test ? { test: true } : {}) };
  if (!(await setNew(S.store, key, rec))) return publicTurn(await S.store.get(key), chat.maxTurns);
  return publicTurn(rec, chat.maxTurns);
}

// A recording in, its words out. The audio is checked, sent to the speech service, and dropped; only the text is kept.
async function chatHear(S, pid, body, now) {
  const ctx = await chatContext(S, pid, body);
  if (ctx.error) return ctx;
  if (ctx.chat.mode === 'text') return { error: 'voice_off', status: 400 };
  const b64 = typeof body.data === 'string' ? body.data : '';
  if (!b64 || b64.length > MAX_AUDIO_B64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return { error: 'bad_audio', status: 400 };
  const audio = Buffer.from(b64, 'base64');
  if (!looksLikeAudio(audio)) return { error: 'bad_audio', status: 400 };
  if ((await S.store.list(`chatstt/${ctx.tag}/`)).length >= MAX_HEARD) return { error: 'too_many', status: 429 };
  const r = await bot.hear(audio, { mime: typeof body.mime === 'string' ? body.mime.slice(0, 60) : 'audio/webm', env: envOf(S), fetchImpl: fetchOf(S) });
  if (r.error) { await fault(S, ctx.tag, now, { kind: 'stt', error: r.error, ms: r.ms }); return { error: 'hear_failed', status: 503 }; }
  const id = `${now}-${randomBytes(2).toString('hex')}`, text = redact(r.text);
  await S.store.set(`chatstt/${ctx.tag}/${id}`, { at: now, text, ms: r.ms, engine: r.engine, language: r.language || null, bytes: audio.length, durationMs: num(body.durationMs, 0, 600000) });
  return { id, text };
}

// The chatbot's message as audio (seq = a turn number, or "open" for the opening line). Stored once per message; the
// opening line is made once per study and voice, then reused. On a failure the page reads the message with the
// browser's voice, and the failure is counted.
async function chatVoice(S, pid, body, now) {
  const ctx = await chatContext(S, pid, body);
  if (ctx.error) return ctx;
  const { chat, tag } = ctx;
  if (!chat.speak) return { error: 'voice_off', status: 400 };
  const open = body.seq === 'open', seq = open ? 'open' : Number(body.seq);
  if (!open && !int(seq, 0, 999)) return { error: 'bad_turn', status: 400 };
  const text = open ? chat.opening : (await S.store.get(`chats/${tag}/${pad(seq)}`))?.bot;
  if (!text) return { error: 'not_found', status: 404 };
  const key = `chattts/${tag}/${open ? 'open' : pad(seq)}`, existing = await S.store.get(key);
  if (existing) return { audio: existing.audio };
  const shared = open ? `chatopen/${bot.promptHash((chat.voiceId || '') + '|' + text)}` : null, cached = shared ? await S.store.get(shared) : null;
  if (cached) { await setNew(S.store, key, { ...cached, at: now, reused: true }); return { audio: cached.audio }; }
  const v = await bot.speak(text, { voiceId: chat.voiceId, env: envOf(S), fetchImpl: fetchOf(S) });
  if (v.error) { await fault(S, tag, now, { kind: 'tts', seq, error: v.error, ms: v.ms }); return { fallback: true }; }
  const name = `f-${randomBytes(6).toString('hex')}.${v.ext}`;
  await S.store.set(`files/${name}`, { mime: v.mime, data: v.audio.toString('base64'), filename: 'chatbot-message', at: now, bytes: v.audio.length });
  const rec = { at: now, audio: `/api/lab/${S.study.id}/file/${name}`, ms: v.ms, engine: v.engine, voice: v.voice, bytes: v.audio.length };
  if (shared) await S.store.set(shared, rec);
  if (!(await setNew(S.store, key, rec))) return { audio: (await S.store.get(key)).audio };
  return { audio: rec.audio };
}

// What the server knows about one conversation, attached to the item's record when it is submitted.
async function chatSummary(S, tag, chat) {
  const [turns, errKeys, ttsKeys] = await Promise.all([turnsOf(S, tag), S.store.list(`chaterr/${tag}/`), S.store.list(`chattts/${tag}/`)]);
  const errs = (await getMany(S.store, errKeys)).map(([, v]) => v).filter(Boolean), count = k => errs.filter(e => e.kind === k).length;
  return { turns: turns.length, voiceTurns: turns.filter(t => t.input === 'voice').length, editedTurns: turns.filter(t => t.edited === true).length,
    wordsUser: turns.reduce((n, t) => n + (t.userWords || 0), 0), wordsBot: turns.reduce((n, t) => n + (t.botWords || 0), 0),
    safetyTurns: turns.filter(t => t.source === 'safety').length, model: turns.map(t => t.model).filter(Boolean).pop() || null, promptHash: chat.promptHash,
    medianLlmMs: median(turns.filter(t => t.source === 'llm').map(t => t.llmMs)), llmErrors: count('llm'), sttErrors: count('stt'), ttsErrors: count('tts'), botAudio: ttsKeys.length,
    reachedMin: turns.length >= chat.minTurns };
}

// ---------- researcher routes ----------
const iso = ms => (Number.isFinite(ms) ? new Date(ms).toISOString() : '');
const adminRoutes = {
  // The transcript, one row per turn, for every participant.
  'chat.csv': { need: 'manager', handler: async (S, { audit }) => {
    const keys = (await S.store.list('chats/')).sort(), rows = [];
    for (const [k, t] of await getMany(S.store, keys)) {
      const m = k.match(/^chats\/([^/]+)\/s(\d+)\/t(\d+)\/(\d+)$/);
      if (!m || !t) continue;
      rows.push({ code: m[1], session: +m[2], trial_index: +m[3], turn: +m[4] + 1, condition: t.condition || '', test: t.test ? 1 : 0, at: iso(t.at), since_ms: t.sinceMs ?? '', input: t.input || '',
        user_text: t.user || '', heard_text: t.heardText ?? '', edited: t.edited == null ? '' : t.edited ? 1 : 0, bot_text: t.bot || '', source: t.source || '', model: t.model || '', llm_ms: t.llmMs ?? '',
        prompt_hash: t.promptHash || '', user_words: t.userWords ?? '', bot_words: t.botWords ?? '' });
    }
    await audit('chat.export', `${rows.length} turns`);
    return { csv: toCsv(rows, ['code', 'session', 'trial_index', 'turn']), filename: `${S.study.id}-chat.csv` };
  } }
};

export default {
  id: 'chatbot',
  label: 'Chatbot conversation (text or voice)',
  description: 'A live conversation with an AI chatbot, typed or spoken, followed by configurable questions. Each condition gives the chatbot a different instruction, so how it talks is the manipulation. Every turn is kept with its condition, model, and timings.',
  contentKeys: ['design', 'chat', 'questions'],
  textFields,
  surveyRules: [],
  conditionsOf: c => (c.design?.conditions || []).map(x => x.id),
  sessionCount: c => c.design.sessions.length,
  editorMeta: () => { const s = bot.services(); return { ...s, defaultVoice: bot.DEFAULT_VOICE, formatRule: bot.FORMAT_RULE, spokenRule: bot.SPOKEN_RULE }; },

  defaultContent() {
    const AGREE = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
    return {
      minutesPerSession: 10,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], sessions: [{}] },
      chat: {
        mode: 'text', botName: 'Assistant',
        scenario: 'Think of something that has been on your mind lately. Tell the chatbot about it in your own words. There are no right or wrong things to say.',
        opening: 'Hello. I am an AI chatbot. What has been on your mind lately?',
        minTurns: 3, maxTurns: 8,
        basePrompt: DEFAULT_BASE,
        prompts: { main: '' },
        promptsReviewed: false,
        safety: { rule: DEFAULT_SAFETY, crisisLine: DEFAULT_CRISIS },
        voice: { speak: false, voiceId: '' }
      },
      questions: [
        { id: 'understood', text: 'The chatbot understood what I was telling it.', type: 'scale', n: 7, lo: AGREE[0], hi: AGREE[6], labels: AGREE, required: true, showIf: 'always', conditions: [] },
        { id: 'comments', text: 'Anything else about the conversation? (optional)', type: 'text', required: false, showIf: 'always', conditions: [] }
      ],
      survey: { pre: [], post: [] }
    };
  },

  normalize(c, d) {
    c.design = { ...d.design, ...(c.design || {}) };
    if (!Array.isArray(c.design.sessions) || !c.design.sessions.length) c.design.sessions = [{}];
    const ch = c.chat || {};
    c.chat = { ...d.chat, ...ch, prompts: ch.prompts && typeof ch.prompts === 'object' ? ch.prompts : { ...d.chat.prompts }, safety: { ...d.chat.safety, ...(ch.safety || {}) }, voice: { ...d.chat.voice, ...(ch.voice || {}) } };
    for (const id of (c.design.conditions || []).map(x => x && x.id)) if (id && typeof c.chat.prompts[id] !== 'string') c.chat.prompts[id] = '';
    for (const q of c.questions || []) { if (!Array.isArray(q.conditions)) q.conditions = []; if (!q.showIf) q.showIf = 'always'; }
  },

  validate(c, e) {
    const d = c.design, conds = [], ch = c.chat || {};
    if (!d || !Array.isArray(d.conditions) || d.conditions.length < 1 || d.conditions.length > 8) e.push('Define 1 to 8 conditions.');
    else d.conditions.forEach((x, i) => {
      if (!/^[a-z][a-z0-9_]{0,30}$/.test(x.id || '')) e.push(`Condition ${i + 1}: the ID must start with a letter and use only lowercase letters, numbers, and underscores.`);
      else if (conds.includes(x.id)) e.push(`Two conditions share the ID "${x.id}".`);
      conds.push(x.id);
      if (!str(x.label, 80)) e.push(`Condition ${i + 1}: a label is required.`);
    });
    if (!d || !Array.isArray(d.sessions) || d.sessions.length < 1 || d.sessions.length > 12) e.push('The study needs 1 to 12 sessions.');
    if (!MODES.includes(ch.mode)) e.push('Chatbot: choose text, voice, or either.');
    if (!str(ch.botName, 60)) e.push('Chatbot: a name is required (60 characters at most).');
    if (!str(ch.scenario, 4000)) e.push('Chatbot: tell participants what to talk about.');
    if (typeof ch.opening !== 'string' || ch.opening.length > 600) e.push('Chatbot: the opening line must be 600 characters or fewer (it can be empty).');
    if (!int(ch.maxTurns, 1, 40)) e.push('Chatbot: the most messages a participant can send must be between 1 and 40.');
    if (!int(ch.minTurns, 1, 40) || ch.minTurns > ch.maxTurns) e.push('Chatbot: the fewest messages must be at least 1 and no more than the most.');
    if (!str(ch.basePrompt, 8000)) e.push('Chatbot: the instruction shared by every condition is empty or longer than 8,000 characters.');
    const prompts = ch.prompts && typeof ch.prompts === 'object' ? ch.prompts : {};
    for (const id of conds) if (typeof prompts[id] !== 'string' || prompts[id].length > 8000) e.push(`Chatbot: the instruction for condition "${id}" is missing or longer than 8,000 characters.`);
    for (const k of Object.keys(prompts)) if (!conds.includes(k)) e.push(`Chatbot: there is an instruction for an unknown condition "${k}".`);
    if (!str(ch.safety?.rule, 2000)) e.push('Chatbot: the safety rule is required.');
    if (!str(ch.safety?.crisisLine, 1200)) e.push('Chatbot: the crisis message is required.');
    if (ch.voice?.voiceId && !bot.VOICE_RE.test(ch.voice.voiceId)) e.push('Chatbot: the ElevenLabs voice ID should be 10 to 40 letters and numbers.');
    validateQuestions(c.questions || [], 'Question', e, { nSessions: 99, conditions: conds, rules: [], allowSessions: false, embedded: (c.embedded || []).map(x => x && x.name) });
  },

  buildPlan(p, session, c) {
    const ch = c.chat, speak = ch.mode !== 'text' && !!ch.voice.speak || ch.mode === 'voice';
    const system = bot.buildSystem({ basePrompt: ch.basePrompt, conditionPrompt: ch.prompts[p.condition] || '', safetyRule: ch.safety.rule, spoken: speak });
    const item = { botName: ch.botName, scenario: ch.scenario, opening: ch.opening || '', mode: ch.mode, minTurns: ch.minTurns, maxTurns: ch.maxTurns, speak };
    return {
      questions: (c.questions || []).filter(q => !q.conditions.length || q.conditions.includes(p.condition)),
      // Private to the server: the page never receives the instruction, only the conversation.
      chat: { system, promptHash: bot.promptHash(system), opening: item.opening, mode: ch.mode, minTurns: ch.minTurns, maxTurns: ch.maxTurns, speak, voiceId: ch.voice.voiceId || '', crisisLine: ch.safety.crisisLine },
      trials: [{ index: 0, itemId: 'chat', item }],
      practice: null
    };
  },

  publicTrial(t) { return { item: t.item }; },
  publicPlanExtras: plan => ({ questions: publicQuestions(plan.questions, plan.condition) }),

  routes: { 'chat/state': chatState, 'chat/turn': chatTurn, 'chat/hear': chatHear, 'chat/voice': chatVoice },
  adminRoutes,

  saveTrialHook: async (S, p, plan, index, data) => {
    if (data && typeof data === 'object' && plan.chat) data.chatServer = await chatSummary(S, `${p.code}/s${plan.session}/t${index}`, plan.chat);
    return null;
  },

  cleanTrialData(d, t, plan) {
    d = d && typeof d === 'object' ? d : {};
    const small = (v, max) => v && typeof v === 'object' && jsonSize(v) <= max ? v : null, ch = d.chat && typeof d.chat === 'object' ? d.chat : {};
    const answerLog = Array.isArray(d.answerLog) ? d.answerLog.slice(0, 1000).map(a => ({ atMs: num(a?.atMs, 0, 864e5), name: typeof a?.name === 'string' ? a.name.slice(0, 40) : null,
      value: logValue(a?.value, plan.seal) })) : [];
    sealLog(answerLog, plan.questions || [], plan.seal);
    return { answers: cleanAnswers(d.answers, plan.questions || [], { condition: plan.condition, embedded: plan.embedded, seal: plan.seal }), rtMs: num(d.rtMs, 0, 864e5), answerLog, traces: small(d.traces, 50000),
      chat: { ended: ['user', 'max', 'error'].includes(ch.ended) ? ch.ended : null, chatMs: num(ch.chatMs, 0, 864e5), browserVoice: num(ch.browserVoice, 0, 999), audioPlayed: num(ch.audioPlayed, 0, 999),
        micBlocked: ch.micBlocked === true, retries: num(ch.retries, 0, 999) },
      chatServer: small(d.chatServer, 4000),
      viewport: d.viewport ? { w: num(d.viewport.w, 0, 20000), h: num(d.viewport.h, 0, 20000) } : null, device: small(d.device, 4000), selfTest: d.selfTest === true || undefined };
  },

  recordFields: (t, plan) => ({ itemId: t.itemId, item: { id: 'chat', mode: t.item.mode, speak: t.item.speak, minTurns: t.item.minTurns, maxTurns: t.item.maxTurns }, questions: (plan.questions || []).filter(q => q.type !== 'info').map(q => q.id) }),

  trialRow(r) {
    const d = r.data || {}, tr = d.traces || {}, cs = d.chatServer || {}, cc = d.chat || {};
    const row = { item_id: r.itemId, chat_mode: r.item?.mode || '', chat_turns: cs.turns ?? '', chat_voice_turns: cs.voiceTurns ?? '', chat_edited_turns: cs.editedTurns ?? '',
      chat_words_user: cs.wordsUser ?? '', chat_words_bot: cs.wordsBot ?? '', chat_ms: cc.chatMs ?? '', chat_ended: cc.ended || '', chat_reached_min: cs.reachedMin == null ? '' : cs.reachedMin ? 1 : 0,
      chat_safety_turns: cs.safetyTurns ?? '', chat_model: cs.model || '', chat_prompt_hash: cs.promptHash || '', chat_median_llm_ms: cs.medianLlmMs ?? '',
      chat_llm_errors: cs.llmErrors ?? '', chat_stt_errors: cs.sttErrors ?? '', chat_tts_errors: cs.ttsErrors ?? '', chat_bot_audio: cs.botAudio ?? '', chat_browser_voice: cc.browserVoice ?? '',
      chat_mic_blocked: cc.micBlocked ? 1 : 0, rt_ms: d.rtMs ?? '', first_answer_ms: tr.firstAnswerMs ?? '', answer_changes: tr.answerChanges ?? '' };
    for (const q of r.questions || Object.keys(d.answers || {})) row[`a_${q}`] = (d.answers || {})[q] ?? '';
    return row;
  },

  simulate(trial, plan, rand) {
    const pick = a => a[Math.floor(rand() * a.length)];
    const answers = {};
    for (const q of orderItems(plan.questions || [])) {   // answers only to questions this participant would see
      if (q.type === 'info' || !evalDisplay(q.displayIf, { answers, ed: plan.embedded })) continue;
      if (q.type === 'scale') answers[q.id] = String((Number.isInteger(q.start) ? q.start : 1) + Math.floor(rand() * q.n));
      else if (q.type === 'choice' || q.type === 'select') answers[q.id] = pick(q.options).value;
      else if (q.type === 'confidence') answers[q.id] = String(Math.floor(rand() * 101));
      else if (q.type === 'number') answers[q.id] = String(Math.floor(rand() * 90));
      else if (q.type === 'multi') answers[q.id] = [pick(q.options).value];
      else answers[q.id] = 'self-test note';
    }
    return { answers, rtMs: 1500, chat: { ended: 'user', chatMs: 1000 }, traces: { durationMs: 1500 }, selfTest: true, rawEvents: [{ t: 1, type: 'self_test' }] };
  },
  checkRow(row, sent) {
    const problems = [];
    for (const [k, v] of Object.entries(sent.answers)) if (row[`a_${k}`] !== (Array.isArray(v) ? v.join('|') : v)) problems.push(`answer ${k}`);
    if (row.chat_prompt_hash === '' || row.chat_turns === '') problems.push('conversation summary');
    return problems;
  },
  checkSession(rows, session) {
    return [[rows.length === 1 && rows[0].item_id === 'chat', `Session ${session}: one conversation was recorded`]];
  },

  // Everything kept about one participant's conversations, including the audio made of the chatbot's replies to them
  // (the opening line's audio is shared by the study and stays).
  purgeParticipant: async (S, p) => {
    const keys = (await Promise.all(['chats', 'chatstt', 'chattts', 'chaterr'].map(k => S.store.list(`${k}/${p.code}/`)))).flat();
    const spoken = (await getMany(S.store, keys.filter(k => k.startsWith('chattts/') && !k.endsWith('/open')))).map(([, v]) => v && String(v.audio || '').split('/file/')[1]).filter(Boolean);
    return [...keys, ...spoken.map(n => `files/${n}`)];
  }
};
