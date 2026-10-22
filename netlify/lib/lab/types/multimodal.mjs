// Study type: multimodal (media, voice, and conversations).
// Each item is a stimulus of one kind:
//   text   a passage (training material, a scenario, instructions between blocks)
//   image  a picture with an optional caption
//   audio  a clip, with a play button (optionally: must be heard to the end, a limit on plays)
//   video  a clip, same options
//   call   a phone call from an AI voice caller (netlify/lib/lab/voicebot.mjs): the participant answers or
//          declines, talks (speech recognition, or typing as a fallback), can hold, hang up, and look up a
//          number in the directory and call it back
//   check  an equipment check scored on the server: "headphones" (Woods et al. 2017 antiphase test: which of three
//          tones is quietest) or "word" (hear a word, say it back; the lab's own Whisper server must hear it).
//          Failing every attempt screens the participant out (a hard gate); a speech-server outage does not.
// Screening: content.screening.rules [{ question, pass: [values] }] check start-of-session answers (for example
// eligibility); an answer outside `pass` screens the participant out. design.assignAtSession (> 1) defers the arm
// assignment to that session, so screened-out people never hold an arm; design.continuous runs the sessions as one
// sitting.
// After the stimulus an item can ask for a decision (for example accept / verify / refuse) laid out for mouse
// tracking (start button at the bottom, options in the top corners), any of the study's questions, and a spoken
// answer recorded from the microphone. Conditions are defined in the content and each item can have different
// wording or media per condition, so multi-arm designs need no code. Sessions are made of blocks, each shown in
// order or shuffled. Recording needs its own consent (Sign-up & consent tab); without it the participant types.
// Participant renderer: static/lab/engine/types/multimodal.js. Editor: multimodal-admin.js.
import { randomBytes } from 'node:crypto';
import { cleanAnswers, loadParticipant, toCsv } from '../engine.mjs';
import { validateQuestions, getContent } from '../content.mjs';
import { publicQuestions, evalDisplay, orderItems } from '../logic.mjs';
import { getMany, setNew, deleteKeys } from '../store.mjs';
import { trajectoryMetrics, cleanPoints } from '../trajectory.mjs';
import * as bot from '../voicebot.mjs';
import { transcribe, saidWord, asrConfigured } from '../asr.mjs';
import { synthesize } from '../tts.mjs';
import * as X from './multimodal-study.mjs';

const KINDS = ['text', 'image', 'audio', 'video', 'call', 'check'];
const CHECKS = ['headphones', 'word'];
const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Instructions', 'instr_intro', 'Instructions ({n} = items this session)', 'You will go through {n} short items: some to read, some to listen to or watch, and possibly a phone call. Take each one as it comes and answer the questions after it.'),
  F('Item screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Session {session} · Item {i} of {n}'),
  F('Item screen', 'progress_practice', 'Progress line, practice', 'Practice item'),
  F('Item screen', 'submit_button', 'Submit button', 'Continue'),
  F('Media', 'play_button', 'Play button', 'Play'),
  F('Media', 'pause_button', 'Pause button', 'Pause'),
  F('Media', 'replay_button', 'Play again button', 'Play again'),
  F('Media', 'plays_left', 'Plays left ({n})', '{n} play(s) left'),
  F('Media', 'media_wait', 'Shown until the clip has been heard to the end', 'Listen to the whole clip before answering.'),
  F('Media', 'transcript_label', 'Transcript toggle', 'Show transcript'),
  F('Decision', 'decision_start', 'Start button (mouse tracking)', 'Start'),
  F('Decision', 'decision_hint', 'Hint above the start button', 'Click Start, then choose your answer.'),
  F('Phone call', 'call_incoming', 'Incoming call label', 'Incoming call'),
  F('Phone call', 'call_answer', 'Answer button', 'Answer'),
  F('Phone call', 'call_decline', 'Decline button', 'Decline'),
  F('Phone call', 'call_hangup', 'Hang up button', 'Hang up'),
  F('Phone call', 'call_hold', 'Hold button', 'Hold'),
  F('Phone call', 'call_resume', 'Resume button', 'Resume'),
  F('Phone call', 'call_talk', 'Talk button', 'Tap to talk'),
  F('Phone call', 'call_listening', 'While listening', 'Listening… tap again when you are done'),
  F('Phone call', 'call_type_label', 'Typing box label', 'Or type what you would say'),
  F('Phone call', 'call_send', 'Send typed reply', 'Say it'),
  F('Phone call', 'call_ended', 'Call ended', 'Call ended'),
  F('Phone call', 'call_missed', 'Call not answered', 'Missed call'),
  F('Phone call', 'call_captions', 'Captions toggle', 'Captions'),
  F('Phone call', 'call_recording', 'Recording notice', 'This call is being recorded for the study.'),
  F('Phone call', 'directory_title', 'Directory title', 'Phone directory'),
  F('Phone call', 'directory_call', 'Directory call button', 'Call'),
  F('Phone call', 'directory_open', 'Directory button', 'Look up a number'),
  F('Voice answer', 'voice_record', 'Record button', 'Record your answer'),
  F('Voice answer', 'voice_stop', 'Stop button', 'Stop recording'),
  F('Voice answer', 'voice_redo', 'Record again button', 'Record again'),
  F('Voice answer', 'voice_typed', 'Typed alternative label', 'Type your answer instead'),
  F('Device check', 'mic_title', 'Microphone check title', 'Check your sound'),
  F('Device check', 'mic_body', 'Microphone check text', 'This study plays audio and may ask you to speak. Turn your volume up, then click Test sound. If you agreed to be recorded, your browser will ask to use your microphone: please allow it.'),
  F('Device check', 'mic_test', 'Test sound button', 'Test sound'),
  F('Device check', 'mic_ok', 'Continue button', 'Sound works, continue'),
  F('Device check', 'mic_denied', 'Microphone blocked', 'Your microphone is blocked, so you will type instead of speaking. That is fine.'),
  F('Equipment check', 'hp_body', 'Headphone check text', 'Put on your headphones. You will hear three tones. Choose the one that is quietest. There are {n} rounds.'),
  F('Equipment check', 'hp_play', 'Play tones button', 'Play the tones'),
  F('Equipment check', 'hp_choose', 'Question', 'Which tone was the quietest?'),
  F('Equipment check', 'word_body', 'Word check text', 'You will hear one word. After it plays, click Record, say the word out loud, then click Stop.'),
  F('Equipment check', 'word_play', 'Play word button', 'Play the word'),
  F('Equipment check', 'word_record', 'Record button', 'Record'),
  F('Equipment check', 'word_stop', 'Stop button', 'Stop'),
  F('Equipment check', 'check_retry', 'One more try', 'That did not work. Please check your headphones and microphone and try once more.'),
  F('Equipment check', 'check_passed', 'Passed', 'Thanks, that worked.'),
  F('Equipment check', 'check_mic_needed', 'Microphone needed', 'This study needs your microphone. Please allow it in your browser and try again.'),
  F('Equipment check', 'check_server_down', 'Speech server unavailable', 'Our speech system is not responding right now. You can continue.'),
  F('One sitting', 'continuous_title', 'Start screen title (sessions run as one sitting)', 'Before you begin'),
  F('One sitting', 'continuous_button', 'Start button', 'Begin'),
  F('Screened out', 'screenout_title', 'Title', 'Thank you for your interest'),
  F('Screened out', 'screenout_body', 'Text', 'Unfortunately you are not able to take part in this study. Please return to Prolific using the button below. Thank you for your time.')
];

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const opt = (v, max) => v == null || v === '' || (typeof v === 'string' && v.length <= max);
const num = (v, lo, hi) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const jsonSize = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };
export const MEDIA_RE = /^(https:\/\/|\/lab\/|\/api\/lab\/[a-z][a-z0-9-]{2,30}\/file\/)[^\s"'<>]+$/;
// clips (audio examples inside a text screen), minSeconds (least time on the screen), persona (show the role card),
// practiceDial (a practice directory to look a number up and call it), live (answer while an audio clip plays).
const ITEM_FIELDS = ['title', 'kind', 'body', 'media', 'mediaAlt', 'transcript', 'mustFinish', 'maxPlays', 'autoplay', 'decide', 'decisionPrompt', 'decisionOptions', 'ask', 'recordVoice', 'voicePrompt',
  'clips', 'minSeconds', 'persona', 'practiceDial', 'live'];
// callback: what the organization's real line says; deflectLine: what the attacker says on the number they gave out.
const SCRIPT_STATES = ['opener', 'pretext', 'ask', 'pressure1', 'pressure2', 'deflect', 'closeComply', 'closeRefuse', 'close', 'callback', 'deflectLine'];

// The item as this participant sees it: base wording, overridden by their condition's variant.
function resolve(item, condition) {
  const v = (item.variants || {})[condition] || {};
  const out = { id: item.id };
  for (const k of ITEM_FIELDS) out[k] = v[k] != null && v[k] !== '' ? v[k] : item[k];
  if (item.kind === 'call' && item.call) {
    out.call = { ...item.call, script: { ...bot.defaultScript(item.call.intent), ...(item.call.script || {}) } };
    if (v.caller) out.call.caller = v.caller;
    if (v.number) out.call.number = v.number;
  }
  if (item.kind === 'check' && item.check) out.check = item.check;
  out.variant = Object.keys(v).length ? condition : '';
  return out;
}

// Equipment checks: what the server decides when the session starts (the order of tones, the words to say).
// Woods et al. (2017): each round plays a standard tone, the same tone in antiphase (quiet over loudspeakers,
// not over headphones), and a tone 6 dB quieter; the quieter one is the answer.
function checkPlan(check, rand) {
  const attempts = check.attempts || 2;
  if (check.test === 'headphones') {
    const order = () => { const a = ['std', 'anti', 'quiet']; for (let i = 2; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return { test: 'headphones', attempts, pass: check.pass || 2, rounds: Array.from({ length: attempts }, () => Array.from({ length: check.trials || 3 }, order)) };
  }
  const pool = (check.words || []).slice(), picks = [];
  for (let i = 0; i < attempts && pool.length; i++) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return { test: 'word', attempts: picks.length, words: picks };
}
const checkKey = (tag, test, attempt) => `checks/${tag}/${test}-${attempt}`;
const questionsFor = (plan, t) => {
  const all = plan.questions || [], ask = t.item.ask;
  if (ask === 'none') return [];
  return Array.isArray(ask) ? all.filter(q => ask.includes(q.id)) : all;
};
const decisionOf = (c, it) => it.decide ? { prompt: it.decisionPrompt || c.decision.prompt, options: it.decisionOptions && it.decisionOptions.length ? it.decisionOptions : c.decision.options, mouseTracking: !!c.decision.mouseTracking } : null;

function validateOptions(list, e, where) {
  if (!Array.isArray(list) || list.length < 2 || list.length > 4) { e.push(`${where}: give 2 to 4 options.`); return; }
  const seen = new Set();
  list.forEach((o, i) => {
    if (!o || !/^[a-z0-9][a-z0-9_-]{0,30}$/i.test(o.value || '')) e.push(`${where}: option ${i + 1} needs a short saved value (letters, numbers, dashes).`);
    else if (seen.has(o.value)) e.push(`${where}: two options are saved as "${o.value}".`);
    seen.add(o && o.value);
    if (!o || !str(o.label, 80)) e.push(`${where}: option ${i + 1} needs a label.`);
  });
}
function validateItem(it, e, conds, qids, where) {
  if (!str(it.title, 200)) e.push(`${where}: a title is required.`);
  if (!KINDS.includes(it.kind)) { e.push(`${where}: choose what kind of item it is (text, image, audio, video, call, or check).`); return; }
  if (it.kind === 'check' && it.decide) e.push(`${where}: an equipment check cannot ask for a decision.`);
  if (it.kind === 'text' && !str(it.body, 20000)) e.push(`${where}: the text is empty.`);
  if (['image', 'audio', 'video'].includes(it.kind)) {
    if (!str(it.media, 2000)) e.push(`${where}: add the ${it.kind} file (upload it, or paste an https:// address).`);
    else if (!MEDIA_RE.test(it.media)) e.push(`${where}: the ${it.kind} address must start with https:// (or be a file uploaded to this study).`);
  }
  if (it.kind === 'image' && !str(it.mediaAlt, 500)) e.push(`${where}: describe the image for screen-reader users (Image description).`);
  if (!opt(it.body, 20000) || !opt(it.transcript, 20000) || !opt(it.mediaAlt, 500) || !opt(it.voicePrompt, 1000) || !opt(it.decisionPrompt, 300)) e.push(`${where}: a text field is too long.`);
  if (it.maxPlays != null && it.maxPlays !== '' && !int(it.maxPlays, 0, 20)) e.push(`${where}: the play limit must be a whole number from 0 (no limit) to 20.`);
  if (it.decisionOptions && it.decisionOptions.length) validateOptions(it.decisionOptions, e, `${where}, decision`);
  if (Array.isArray(it.ask)) { const bad = it.ask.filter(q => !qids.includes(q)); if (bad.length) e.push(`${where}: asks questions that do not exist (${bad.join(', ')}).`); }
  else if (it.ask != null && !['all', 'none'].includes(it.ask)) e.push(`${where}: choose which questions to ask.`);
  if (it.kind === 'check') {
    const k = it.check;
    if (!k || !CHECKS.includes(k.test)) e.push(`${where}: choose which check this is (headphones or word).`);
    else if (k.attempts != null && !int(k.attempts, 1, 3)) e.push(`${where}: allow 1 to 3 attempts.`);
    else if (k.test === 'headphones' && ((k.trials != null && !int(k.trials, 1, 6)) || (k.pass != null && !int(k.pass, 1, k.trials || 3)))) e.push(`${where}: use 1 to 6 rounds, and a pass mark no higher than the rounds.`);
    else if (k.test === 'word') {
      if (!Array.isArray(k.words) || k.words.length < (k.attempts || 2)) e.push(`${where}: give at least one word per attempt.`);
      else k.words.forEach((w, i) => { if (!w || !/^[a-z]{3,20}$/.test(w.word || '') || !MEDIA_RE.test(w.media || '')) e.push(`${where}: word ${i + 1} needs a lowercase word and its audio file.`); });
    }
  }
  if (it.kind === 'call') {
    const c = it.call;
    if (!c || typeof c !== 'object') { e.push(`${where}: the call settings are missing.`); return; }
    if (!str(c.caller, 80)) e.push(`${where}: the caller ID needs a name (for example "Harborview Bank").`);
    if (!opt(c.number, 40) || !opt(c.callbackNumber, 40)) e.push(`${where}: a phone number is too long.`);
    if (!['attack', 'benign'].includes(c.intent)) e.push(`${where}: say whether the caller is an attack or a legitimate (benign) caller.`);
    if (c.maxTurns != null && !int(c.maxTurns, 5, 20)) e.push(`${where}: the most turns in a call must be from 5 to 20.`);
    if (c.ringSeconds != null && !int(c.ringSeconds, 5, 120)) e.push(`${where}: ring time must be from 5 to 120 seconds.`);
    for (const k of Object.keys(c.script || {})) {
      if (!SCRIPT_STATES.includes(k)) e.push(`${where}: unknown script line "${k}".`);
      else if (!opt(c.script[k], 1000)) e.push(`${where}: the "${k}" line is too long (1,000 characters at most).`);
    }
    if (!opt(c.persona, 1500)) e.push(`${where}: the caller description is too long.`);
    if (c.audio && typeof c.audio === 'object') for (const [k, u] of Object.entries(c.audio)) if (u && !MEDIA_RE.test(u)) e.push(`${where}: the recorded "${k}" line must be an https:// address or an uploaded file.`);
  }
  for (const [k, v] of Object.entries(it.variants || {})) {
    if (!conds.includes(k)) e.push(`${where}: has wording for an unknown condition "${k}".`);
    if (v.media && !MEDIA_RE.test(v.media)) e.push(`${where} (${k}): the media address must start with https:// (or be an uploaded file).`);
  }
}

// Session plan blocks: [{ title?, items: [ids], randomize }]. An older session shape { items } is one block.
const blocksOf = (s, d) => Array.isArray(s.blocks) ? s.blocks : [{ items: s.items || [], randomize: !!d.randomize }];

// ---------- participant routes ----------
const planKey = (code, n) => `plans/${code}/s${n}`;
async function trialContext(S, pid, body) {
  const p = await loadParticipant(S, pid);
  if (!p) return { error: 'expired', status: 401 };
  const session = Number(body.session), idx = body.index === 'practice' ? 'practice' : Number(body.index);
  if (!int(session, 1, 99) || !(idx === 'practice' || int(idx, 0, 999))) return { error: 'bad_index', status: 400 };
  const plan = p.sessions?.[session]?.plan || await S.store.get(planKey(p.code, session));
  if (!plan) return { error: 'wrong_session', status: 409 };
  const trial = idx === 'practice' ? plan.practice : plan.trials[idx];
  if (!trial) return { error: 'bad_index', status: 400 };
  return { p, plan, trial, session, idx, tag: `${p.code}/s${session}/${idx === 'practice' ? 'practice' : 't' + idx}` };
}

async function callTurn(S, pid, body, now) {
  const t0 = Date.now(), ctx = await trialContext(S, pid, body);
  if (ctx.error) return ctx;
  const call = ctx.trial.item.call;
  if (ctx.trial.item.kind !== 'call' || !call) return { error: 'not_a_call', status: 400 };
  const seq = Number(body.seq), kind = String(body.kind || '');
  if (!int(seq, 0, 80)) return { error: 'bad_turn', status: 400 };
  if (!['answer', 'decline', 'say', 'hangup', 'hold', 'resume', 'timeout'].includes(kind)) return { error: 'bad_turn', status: 400 };
  const prefix = `calls/${ctx.tag}/`, key = prefix + String(seq).padStart(3, '0');
  // code: a one-time code "arrives" on the participant's authenticator when the call reaches call.code.at.
  const pub = (r, heard) => ({ seq: r.seq, say: r.say || '', state: r.after.state, done: !!r.after.done, audio: r.audio || null,
    ...(heard != null ? { heard } : {}), ...(r.codeSent && ctx.trial.callCode ? { code: { service: call.code.service || call.caller, value: ctx.trial.callCode } } : {}) });
  const existing = await S.store.get(key);
  if (existing && existing.kind === kind) return pub(existing);   // a retried request gets the same answer
  if (existing) return { error: 'out_of_order', status: 409, next: (await S.store.list(prefix)).length };
  const keys = (await S.store.list(prefix)).sort();
  if (keys.length !== seq) return { error: 'out_of_order', status: 409, next: keys.length };
  const turns = (await getMany(S.store, keys)).map(([, v]) => v).filter(Boolean);
  const st = bot.replay(turns);
  if ((seq === 0) !== ['answer', 'decline', 'timeout'].includes(kind)) return { error: 'bad_turn', status: 400 };
  if (st.done && !['hangup', 'hold', 'resume'].includes(kind)) return { error: 'call_over', status: 409 };

  // The participant's words: typed, or spoken and transcribed here by the lab's own speech server (audio: WAV, base64).
  let said = typeof body.said === 'string' ? body.said.slice(0, 2000) : '', asrMs = null;
  if (kind === 'say' && typeof body.audio === 'string' && body.audio) {
    if (body.audio.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(body.audio)) return { error: 'bad_data', status: 400 };
    const r = await transcribe(Buffer.from(body.audio, 'base64'));
    if (r.error) return { error: 'asr_unavailable', status: 503 };
    said = r.text; asrMs = r.ms;
  }
  const rec = { seq, kind, at: now, clientMs: num(body.clientMs, 0, 36e5), latencyMs: num(body.latencyMs, 0, 6e4), asr: kind === 'say' && (asrMs != null || body.asr === true), ...(asrMs != null ? { asrServer: true, asrMs } : {}) };
  let after = st, line = '';
  if (kind === 'answer') { after = { ...bot.START, state: 'opener' }; line = call.script.opener; }
  else if (kind === 'decline' || kind === 'timeout') after = { ...bot.START, done: true, outcome: kind === 'decline' ? 'declined' : 'missed' };
  else if (kind === 'hangup') after = { ...st, done: true, outcome: st.outcome || 'hung_up' };
  else if (kind === 'say') {
    const cls = bot.classify(said);
    // What was disclosed is decided on the raw words, before redaction; only the labels are kept.
    const disclosed = X.disclosures(said, { code: turns.some(t => t.codeSent) ? ctx.trial.callCode : null, persona: ctx.plan.persona });
    after = bot.step(st, disclosed.length ? { ...cls, intent: 'comply', disclosed: true } : cls, { intent: call.intent, maxTurns: call.maxTurns || 8 });
    line = call.script[after.state] || '';
    Object.assign(rec, { heard: bot.redact(said), heardIntent: disclosed.length ? 'comply' : cls.intent, digits: cls.digits, ...(disclosed.length ? { disclosed } : {}) });
  }
  if (call.code && ctx.trial.callCode && after.state === (call.code.at || 'ask') && !turns.some(t => t.codeSent)) rec.codeSent = true;
  rec.after = after;
  if (line) {
    const history = turns.flatMap(t => [t.heard ? { speaker: 'participant', text: t.heard } : null, t.say ? { speaker: 'caller', text: t.say } : null]).filter(Boolean);
    const recorded = call.audio && call.audio[after.state];
    const scripted = call.llm === false || !!(ctx.p.flags && ctx.p.flags.scripted);   // pilot: the scripted fallback tree only
    const out = recorded || scripted ? { text: line, source: recorded ? 'recorded' : 'script' } : await bot.phrase({ state: after.state, line, persona: call.persona, heard: rec.heard || '', history });
    Object.assign(rec, { say: out.text, source: out.source, llmError: out.error, audio: recorded || null });
    if (!recorded) Object.assign(rec, await voiceFor(S, out.text, call.voice, now));
  }
  rec.serverMs = Date.now() - t0;
  if (!(await setNew(S.store, key, rec))) return pub(await S.store.get(key));
  return pub(rec, kind === 'say' ? said.slice(0, 600) : null);
}

// The caller's voice: made by the lab's voice service and kept as a study file (the caller's audio track). On any
// failure the browser speaks the line with its own voice, and the turn records why.
async function voiceFor(S, text, voice, now) {
  if (!text) return {};
  const v = await synthesize(text, { voice: typeof voice === 'string' ? voice : 'af_heart' });
  if (v.error) return { ttsError: v.error };
  const name = `f-${randomBytes(6).toString('hex')}.wav`;
  await S.store.set(`files/${name}`, { mime: 'audio/wav', data: v.audio.toString('base64'), filename: 'caller-line', at: now, bytes: v.audio.length });
  return { audio: `/api/lab/${S.study.id}/file/${name}`, ttsMs: v.ms };
}

// Calling a number back (from the directory or the dial pad). The organization's real line resolves the truth for
// this item's call; the number an attacker gave out reaches the attacker; any other listed number gets that entry's
// greeting; anything else is "not in service". Numbers match on their last 7 digits (555-0121 = (404) 555-0121).
const digitsOnly = s => String(s || '').replace(/\D/g, '');
const sameNumber = (a, b) => { a = digitsOnly(a); b = digitsOnly(b); return a.length >= 7 && b.length >= 7 && a.slice(-7) === b.slice(-7); };
async function callBack(S, pid, body, now) {
  const ctx = await trialContext(S, pid, body);
  if (ctx.error) return ctx;
  if ((await S.store.list(`callbacks/${ctx.tag}/`)).length >= 20) return { error: 'too_many', status: 429 };
  const dialed = digitsOnly(body.number).slice(0, 20), source = body.source === 'dialpad' ? 'dialpad' : 'directory';
  const entry = (ctx.plan.directory || []).find(d => sameNumber(d.number, dialed)) || null;
  const call = ctx.trial.item.call, resolves = !!(entry && call && sameNumber(call.callbackNumber, dialed));
  const callerSupplied = !!(call && call.deflectNumber && sameNumber(call.deflectNumber, dialed));
  let say;
  if (callerSupplied) say = call.script.deflectLine || `${call.caller}, this is the person you just spoke with. Go ahead.`;
  else if (!entry) say = 'The number you have dialed is not in service. Please check the number and try again.';
  else if (resolves) say = call.script.callback || entry.greeting || `Thank you for calling ${entry.name}.`;
  else say = entry.greeting || `Thank you for calling ${entry.name}. How can I help you today?`;
  await S.store.set(`callbacks/${ctx.tag}/${now}-${randomBytes(2).toString('hex')}`, { at: now, number: dialed, listed: !!entry, name: entry ? entry.name : null, resolves, callerSupplied, source,
    duringCall: body.duringCall === true });
  const voice = callerSupplied ? call.voice : (entry && entry.voice) || 'af_sarah';
  const v = entry || callerSupplied ? await voiceFor(S, say, voice, now) : {};
  return { say, name: callerSupplied ? call.caller : entry ? entry.name : null, audio: v.audio || null };
}

// Whether a gated item (a practice call) was passed, for the item that retries it.
async function gateStatus(S, pid, body) {
  const ctx = await trialContext(S, pid, body);
  if (ctx.error) return ctx;
  const of = ctx.trial.item.call && ctx.trial.item.call.gate && ctx.trial.item.call.gate.retryOf;
  const first = of != null ? ctx.plan.trials.find(t => t.itemId === of) : null;
  if (!first) return { error: 'not_a_retry', status: 400 };
  const rec = await S.store.get(`data/${ctx.p.code}/s${ctx.session}/t${first.index}`);
  return { passed: !!(rec && rec.data && rec.data.callServer && rec.data.callServer.gatePassed) };
}

// The debrief: each scored call with what happened, the points, and the participant's own (redacted) transcript.
async function debrief(S, pid) {
  const p = await loadParticipant(S, pid);
  if (!p) return { error: 'expired', status: 401 };
  const out = [];
  for (const k of (await S.store.list(`plans/${p.code}/`)).sort()) {
    const plan = await S.store.get(k);
    for (const t of (plan && plan.trials) || []) {
      if (t.item.kind !== 'call' || !t.item.call || !t.item.call.scored) continue;
      const tag = `${p.code}/s${plan.session}/t${t.index}`, s = await callSummary(S, tag, t, plan);
      const turns = (await getMany(S.store, (await S.store.list(`calls/${tag}/`)).sort())).map(([, v]) => v).filter(Boolean);
      out.push({ caller: t.item.call.caller, intent: t.item.call.intent, outcome: s ? s.outcome : 'not reached', points: s ? s.points : 0, disclosed: s ? s.disclosed : [], callbacks: s ? s.callbacks : 0,
        transcript: turns.flatMap(v => [v.heard ? { who: 'you', text: v.heard } : null, v.say ? { who: 'caller', text: v.say } : null]).filter(Boolean) });
    }
  }
  return { calls: out, points: out.reduce((a, c) => a + (c.points || 0), 0) };
}

// Equipment checks. Attempts run in order and each is written once; attempt n+1 is allowed only after n failed.
async function checkContext(S, pid, body, test) {
  const ctx = await trialContext(S, pid, body);
  if (ctx.error) return ctx;
  const plan = ctx.trial.checkPlan;
  if (ctx.trial.item.kind !== 'check' || !plan || plan.test !== test) return { error: 'not_a_check', status: 400 };
  const attempt = Number(body.attempt);
  if (!int(attempt, 1, plan.attempts)) return { error: 'bad_attempt', status: 400 };
  const prior = (await getMany(S.store, Array.from({ length: plan.attempts }, (_, i) => checkKey(ctx.tag, test, i + 1)))).map(([, v]) => v);
  if (prior.some(v => v && v.pass)) return { error: 'already_passed', status: 409 };
  if (prior[attempt - 1]) return { ...ctx, plan, attempt, repeat: prior[attempt - 1] };
  if (attempt > 1 && !prior[attempt - 2]) return { error: 'out_of_order', status: 409 };
  return { ...ctx, plan, attempt };
}
// Where a check stands, so a reload resumes it: { passed, nextAttempt } (nextAttempt > attempts: all used).
async function checkStatus(S, pid, body) {
  const ctx = await trialContext(S, pid, body);
  if (ctx.error) return ctx;
  const plan = ctx.trial.checkPlan;
  if (!plan) return { error: 'not_a_check', status: 400 };
  const got = (await getMany(S.store, Array.from({ length: plan.attempts }, (_, i) => checkKey(ctx.tag, plan.test, i + 1)))).map(([, v]) => v);
  const used = got.findIndex(v => !v);
  return { passed: got.some(v => v && v.pass), nextAttempt: used < 0 ? plan.attempts + 1 : used + 1, attempts: plan.attempts };
}
async function checkHeadphones(S, pid, body, now) {
  const ctx = await checkContext(S, pid, body, 'headphones');
  if (ctx.error) return ctx;
  if (ctx.repeat) return { pass: ctx.repeat.pass, attemptsLeft: ctx.plan.attempts - ctx.attempt };
  const rounds = ctx.plan.rounds[ctx.attempt - 1], picks = Array.isArray(body.choices) ? body.choices.slice(0, rounds.length).map(Number) : [];
  if (picks.length !== rounds.length || !picks.every(x => int(x, 1, 3))) return { error: 'bad_choices', status: 400 };
  const correct = picks.filter((x, i) => rounds[i][x - 1] === 'quiet').length, pass = correct >= ctx.plan.pass;
  await setNew(S.store, checkKey(ctx.tag, 'headphones', ctx.attempt), { at: now, picks, correct, pass, chose: picks.map((x, i) => rounds[i][x - 1]) });
  return { pass, attemptsLeft: pass ? 0 : ctx.plan.attempts - ctx.attempt };
}
async function checkWord(S, pid, body, now) {
  const ctx = await checkContext(S, pid, body, 'word');
  if (ctx.error) return ctx;
  if (ctx.repeat) return { pass: ctx.repeat.pass, attemptsLeft: ctx.plan.attempts - ctx.attempt };
  // Researchers previewing (test participants only) may type the word instead of saying it.
  if (ctx.p.test && typeof body.typed === 'string') {
    const target = ctx.plan.words[ctx.attempt - 1].word, pass = saidWord(body.typed, target);
    await setNew(S.store, checkKey(ctx.tag, 'word', ctx.attempt), { at: now, word: target, heard: body.typed.slice(0, 60), pass, typed: true });
    return { pass, heard: body.typed.slice(0, 60), attemptsLeft: pass ? 0 : ctx.plan.attempts - ctx.attempt };
  }
  const data = typeof body.data === 'string' ? body.data : '';
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 1_000_000) return { error: 'bad_data', status: 400 };
  const buf = Buffer.from(data, 'base64');
  if (!buf.subarray(0, 4).toString('latin1').startsWith('RIFF')) return { error: 'bad_data', status: 400 };
  const target = ctx.plan.words[ctx.attempt - 1].word, r = await transcribe(buf);
  // An outage is the lab's problem, not the participant's: it is logged and never counts as a failed attempt.
  if (r.error) {
    await S.store.set(`${checkKey(ctx.tag, 'word', ctx.attempt)}-down-${now}${randomBytes(2).toString('hex')}`, { at: now, error: r.error, ms: r.ms ?? null });
    return { error: 'asr_unavailable', status: 503 };
  }
  const pass = saidWord(r.text, target);
  await setNew(S.store, checkKey(ctx.tag, 'word', ctx.attempt), { at: now, word: target, heard: bot.redact(r.text).slice(0, 200), pass, asrMs: r.ms, durationMs: num(body.durationMs, 0, 6e4) });
  return { pass, heard: r.text.slice(0, 200), attemptsLeft: pass ? 0 : ctx.plan.attempts - ctx.attempt };
}
// The server's record of a check, attached to the item's answer when it is saved. passed: true (an attempt passed),
// null (no pass, but the speech server was down at least once: the participant continues and is flagged), or false
// (anything else, including leaving the check without trying: the participant is screened out).
async function checkSummary(S, tag, plan) {
  const keys = Array.from({ length: plan.attempts }, (_, i) => checkKey(tag, plan.test, i + 1));
  const got = (await getMany(S.store, keys)).map(([, v]) => v).filter(Boolean);
  const outages = (await S.store.list(`checks/${tag}/${plan.test}-`)).filter(k => /-down-\d+[0-9a-f]{4}$/.test(k)).length;
  const passed = got.some(v => v.pass) ? true : outages > 0 ? null : false;
  return { test: plan.test, attempts: got.length, passed, outages, ...(plan.test === 'headphones' ? { correct: got.map(v => v.correct) } : { heard: got.map(v => v.heard) }) };
}

// Participant audio (a call, or a spoken answer): only with recording consent; one file per item and kind, write-once.
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;\s*codecs=[a-z0-9.,\s"-]+)?$/i;
export const MAX_AUDIO_B64 = 3_600_000;
const MAX_AUDIO_PER_PARTICIPANT = 40;
// The first bytes of the audio containers browsers record (WebM/Matroska, Ogg, MP4/M4A, WAV, MP3).
export function looksLikeAudio(b) {
  if (!b || b.length < 4) return false;
  const hex = b.subarray(0, 4).toString('hex'), ascii = b.subarray(0, 12).toString('latin1');
  return hex === '1a45dfa3' || ascii.startsWith('OggS') || ascii.startsWith('RIFF') || ascii.slice(4, 8) === 'ftyp' || ascii.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
}   // about 2.7 MB: 10+ minutes of speech at the browser's default bitrate
async function mediaUpload(S, pid, body, now) {
  const ctx = await trialContext(S, pid, body);
  if (ctx.error) return ctx;
  if (!ctx.p.recordingConsent || !ctx.plan.recording) return { error: 'no_recording_consent', status: 403 };
  const kind = body.kind === 'call' ? 'call' : body.kind === 'voice' ? 'voice' : null;
  if (!kind) return { error: 'bad_kind', status: 400 };
  const mime = String(body.mime || '');
  if (!AUDIO_TYPES.test(mime)) return { error: 'bad_type', status: 400 };
  const data = typeof body.data === 'string' ? body.data : '';
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return { error: 'bad_data', status: 400 };
  if (data.length > MAX_AUDIO_B64) return { error: 'too_large', status: 413 };
  if (!looksLikeAudio(Buffer.from(data.slice(0, 64), 'base64'))) return { error: 'bad_data', status: 400 };
  if ((await S.store.list(`audio/${ctx.p.code}/`)).length >= MAX_AUDIO_PER_PARTICIPANT) return { error: 'too_many', status: 429 };
  const key = `audio/${ctx.tag}-${kind}`;
  const created = await setNew(S.store, key, { at: now, mime: mime.split(';')[0], bytes: Math.floor(data.length * 3 / 4), durationMs: num(body.durationMs, 0, 36e5), data });
  return { ok: true, key, repeat: !created || undefined };
}

// The server's record of a call, attached to the item's answer when it is saved (the browser never sees the outcome).
// trial and plan (optional) add what the study scores: points under the payoff, and whether a gate was passed.
export async function callSummary(S, tag, trial, plan, test = false) {
  const keys = (await S.store.list(`calls/${tag}/`)).sort();
  const cbs = (await getMany(S.store, await S.store.list(`callbacks/${tag}/`))).map(([, v]) => v).filter(Boolean).sort((a, b) => a.at - b.at);
  if (!keys.length && !cbs.length) return null;
  const turns = (await getMany(S.store, keys)).map(([, v]) => v).filter(Boolean);
  const st = bot.replay(turns), says = turns.filter(t => t.kind === 'say');
  const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
  const disclosed = [...new Set(says.flatMap(t => t.disclosed || []))], first = says.findIndex(t => t.disclosed && t.disclosed.length);
  const codeAt = turns.findIndex(t => t.codeSent), call = trial && trial.item.call;
  const s = { answered: turns.some(t => t.kind === 'answer'), outcome: st.outcome || (st.done ? 'ended' : turns.length ? 'open' : 'not_answered'), finalState: st.state, participantTurns: says.length,
    spokenTurns: says.filter(t => t.asrServer).length, digitsDisclosed: Math.max(0, ...says.map(t => t.digits || 0)), disclosed,
    // resistance: caller pressure turns (ask, pressure1, pressure2) spoken before the first disclosure, or in the whole call
    pressureTurns: turns.slice(0, first < 0 ? turns.length : turns.indexOf(says[first])).filter(t => ['ask', 'pressure1', 'pressure2'].includes(t.after && t.after.state) && t.say).length,
    codeSent: codeAt >= 0, verifies: st.verifies || 0, refusals: st.refusals || 0,
    llmTurns: turns.filter(t => t.source === 'llm').length, scriptTurns: turns.filter(t => t.source === 'script' || t.source === 'recorded').length, ttsErrors: turns.filter(t => t.ttsError).length,
    medianServerMs: med(turns.map(t => t.serverMs)), medianLatencyMs: med(turns.map(t => t.latencyMs)), holds: turns.filter(t => t.kind === 'hold').length,
    callbacks: cbs.length, callbackResolved: cbs.some(c => c.resolves), callbacksLookedUp: cbs.filter(c => c.listed && c.source !== 'dialpad').length,
    callbacksCallerSupplied: cbs.filter(c => c.callerSupplied).length, firstCallbackAt: cbs.length ? cbs[0].at : null,
    callStartAt: turns.length ? turns[0].at : null };
  if (call && call.gate) s.gatePassed = s.spokenTurns > 0 || (test && s.participantTurns > 0);
  if (call && call.scored && plan && plan.payoff) s.points = X.pointsFor(call.intent, s, plan.payoff);
  return s;
}

// ---------- admin routes ----------
const AUDIO_KEY_RE = /^audio\/([^/]+)\/s(\d+)\/(t\d+|practice)-(call|voice)$/;
const FILE_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
export const FILE_MIME = Object.fromEntries(Object.entries(FILE_TYPES).map(([m, e]) => [e, m]));
const adminRoutes = {
  recordings: { need: 'manager', handler: async S => {
    const keys = await S.store.list('audio/');
    return keys.map(k => { const m = k.match(AUDIO_KEY_RE); return m ? { key: k, code: m[1], session: +m[2], item: m[3], kind: m[4] } : null; }).filter(Boolean);
  } },
  recording: { need: 'manager', handler: async (S, { url, audit }) => {
    const key = url.searchParams.get('key') || '';
    if (!AUDIO_KEY_RE.test(key)) return { error: 'bad_key', status: 400 };
    const r = await S.store.get(key);
    if (!r) return { error: 'not_found', status: 404 };
    await audit('recording.download', key);
    return { key, mime: r.mime, data: r.data, durationMs: r.durationMs };
  } },
  'recordings-delete': { need: 'owner', post: true, handler: async (S, { body, audit }) => {
    if (body.confirm !== 'DELETE') return { error: 'confirm_required', status: 400, hint: 'Type DELETE to confirm.' };
    const code = body.code ? String(body.code) : null;
    const keys = (await S.store.list(code ? `audio/${code}/` : 'audio/')).filter(k => AUDIO_KEY_RE.test(k));
    await deleteKeys(S.store, keys);
    await audit('recordings.delete', `${keys.length} recordings${code ? ' of ' + code : ''}`);
    return { ok: true, deleted: keys.length };
  } },
  'calls.csv': { need: 'viewer', handler: async S => {
    const keys = (await S.store.list('calls/')).sort();
    const rows = [];
    for (const [k, v] of await getMany(S.store, keys)) {
      const m = k.match(/^calls\/([^/]+)\/s(\d+)\/(t\d+|practice)\/(\d+)$/);
      if (!m || !v) continue;
      rows.push({ code: m[1], session: +m[2], trial_index: m[3] === 'practice' ? 'practice' : m[3].slice(1), turn: v.seq, event: v.kind, participant_said: v.heard || '', participant_intent: v.heardIntent || '',
        digits_said: v.digits ?? '', caller_state: v.after?.state || '', caller_said: v.say || '', caller_source: v.source || '', llm_error: v.llmError || '',
        server_ms: v.serverMs ?? '', latency_ms: v.latencyMs ?? '', asr: v.asr ? 1 : 0, call_done: v.after?.done ? 1 : 0, call_outcome: v.after?.outcome || '', at: new Date(v.at).toISOString() });
    }
    return { csv: toCsv(rows, ['code', 'session', 'trial_index', 'turn']), filename: `${S.study.id}_call_turns.csv` };
  } },
  'file-upload': { need: 'editor', post: true, handler: async (S, { body, now, audit }) => {
    const mime = String(body.mime || '').toLowerCase(), data = typeof body.data === 'string' ? body.data : '', ext = FILE_TYPES[mime];
    if (!ext) return { error: 'bad_type', status: 400, hint: 'Upload an audio file (MP3, M4A, WAV, OGG), a video (MP4, WebM, MOV), or an image (PNG, JPG, GIF, WebP).' };
    if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return { error: 'bad_data', status: 400, hint: 'The file could not be read. Try again.' };
    if (data.length > MAX_AUDIO_B64) return { error: 'too_large', status: 413, hint: 'Files can be up to about 2.5 MB here. For a longer video, put it on a public web address (for example the lab\'s web space) and paste its https:// address instead.' };
    const name = `f-${randomBytes(6).toString('hex')}.${ext}`, label = String(body.filename || '').replace(/[^\w .()-]/g, '').slice(0, 120);
    await S.store.set(`files/${name}`, { mime, data, filename: label, at: now, bytes: Math.floor(data.length * 3 / 4) });
    await audit('file.upload', `${label || name} as ${name}`);
    return { ok: true, name, url: `/api/lab/${S.study.id}/file/${name}`, filename: label };
  } },
  // Prolific bulk bonus: one "participant_id,amount" line per panel participant, from the points they scored in the
  // shift (never below zero). Real participants only; managers and up, since it holds panel IDs.
  'bonus.csv': { need: 'manager', handler: async (S, { audit }) => {
    const c = await getContent(S.store, S.type);
    const rate = Number(c.payoff && c.payoff.centsPerPoint) || 0, lines = [];
    for (const [k, contact] of await getMany(S.store, await S.store.list('contact/'))) {
      if (!contact || !contact.panelId) continue;
      const code = k.slice(8), p = await S.store.get(`participants/${code}`);
      if (!p || p.test) continue;
      let pts = 0;
      for (const [, r] of await getMany(S.store, await S.store.list(`data/${code}/`))) if (r && r.data && r.data.callServer && Number.isFinite(r.data.callServer.points)) pts += r.data.callServer.points;
      const amount = Math.max(0, pts) * rate / 100;
      if (amount > 0) lines.push(`${contact.panelId},${amount.toFixed(2)}`);
    }
    await audit('bonus.export', `${lines.length} bonus lines`);
    return { csv: lines.join('\n') + (lines.length ? '\n' : ''), filename: `${S.study.id}_prolific_bonus.csv` };
  } },
  // The permuted-block allocation list fixed by the seed (for the preregistration), with the slots already used.
  'allocation.csv': { need: 'viewer', handler: async S => {
    const c = await getContent(S.store, S.type), list = X.allocationList(c);
    if (!list) return { error: 'no_block_randomization', status: 400 };
    const used = new Set((await S.store.list('alloc-arm/')).map(k => Number(k.slice(10))));
    const size = c.design.randomization.blockSize, rows = list.map((arm, k) => ({ slot: k + 1, block: Math.floor(k / size) + 1, arm, used: used.has(k) ? 1 : 0 }));
    return { csv: toCsv(rows, ['slot', 'block', 'arm', 'used']), filename: `${S.study.id}_allocation.csv` };
  } },
  files: { need: 'viewer', handler: async S => {
    const keys = await S.store.list('files/');
    return (await getMany(S.store, keys)).filter(([, v]) => v).map(([k, v]) => ({ name: k.slice(6), url: `/api/lab/${S.study.id}/file/${k.slice(6)}`, filename: v.filename, mime: v.mime, bytes: v.bytes, at: v.at }));
  } }
};

export default {
  id: 'multimodal',
  label: 'Media, voice, and conversations (multimodal)',
  description: 'Text, images, audio and video clips, and phone calls with an AI voice caller, in blocks shown in order or shuffled, with per-condition wording and media. Each item can ask for a mouse-tracked decision, any questions, and a spoken answer. Records play behavior, decision paths, answer changes, call transcripts, and (with consent) participant audio.',
  contentKeys: ['design', 'items', 'practice', 'questions', 'decision', 'directory', 'screening', 'persona', 'clipLibrary', 'shift', 'payoff', 'pilot', 'debrief'],
  textFields,
  surveyRules: [],
  conditionsOf: c => (c.design?.conditions || []).map(x => x.id),
  sessionCount: c => c.design.sessions.length,
  assignAtSession: c => c.design?.assignAtSession || 1,
  assignFlags: X.assignFlags,
  allocate: X.allocate,
  publicContent: c => ({ continuous: !!c.design?.continuous, noSoundCheck: !!c.design?.noSoundCheck, debrief: c.debrief && c.debrief.body ? { title: c.debrief.title || 'About this study', body: c.debrief.body } : null }),
  // Engine hooks: eligibility answers (start-of-session survey) and failed equipment checks end the study.
  screenSurvey(c, kind, session, answers) {
    if (kind !== 'pre') return null;
    const bad = (c.screening?.rules || []).find(r => (r.session || 1) === session && !(r.pass || []).includes(answers[r.question]));
    return bad ? `ineligible:${bad.question}` : null;
  },
  // A failed check, or a gated call (the practice call) with no speech heard, on its final try.
  screenOutReason: (rec, t) => {
    if (rec.item?.kind === 'check' && rec.data?.checkServer?.passed === false) return `check_failed:${rec.data.checkServer.test}`;
    const g = t && t.item.call && t.item.call.gate, cs = rec.data?.callServer;
    if (g && g.final && !(cs && (cs.gatePassed || cs.skipped))) return 'practice_call_failed';
    return null;
  },
  editorMeta: () => ({ llm: bot.llmConfigured(), scripts: { attack: bot.defaultScript('attack'), benign: bot.defaultScript('benign') }, maxUploadMb: Math.floor(MAX_AUDIO_B64 * 0.75 / 1e5) / 10 }),
  routes: { 'call/turn': callTurn, 'call/callback': callBack, 'media/upload': mediaUpload, 'check/headphones': checkHeadphones, 'check/word': checkWord, 'check/status': checkStatus,
    'gate/status': gateStatus, debrief: (S, pid) => debrief(S, pid) },
  adminRoutes,

  defaultContent() {
    return {
      minutesPerSession: 15,
      consent: { recording: { enabled: false, required: false, label: 'I agree to have my voice recorded during this study. My recordings are stored securely and are never shared outside the research team.' } },
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: false, sessions: [{ blocks: [{ title: 'Items', items: ['welcome-text', 'sample-audio'], randomize: false }] }] },
      decision: { prompt: 'What would you do?', options: [{ value: 'accept', label: 'Accept' }, { value: 'verify', label: 'Verify first' }, { value: 'refuse', label: 'Refuse' }], mouseTracking: true },
      directory: [{ name: 'Harborview Bank (number on the back of your card)', number: '800-555-0100', greeting: '' }],
      items: [
        { id: 'welcome-text', title: 'Before we start', kind: 'text', body: 'In this study you will listen to short phone messages and decide how you would respond. There are no right or wrong answers.', media: '', mediaAlt: '', transcript: '', decide: false, ask: 'none', variants: {} },
        { id: 'sample-audio', title: 'Voicemail 1', kind: 'audio', body: 'Listen to this voicemail.', media: '/lab/media/samples/voicemail-bank.mp3', mediaAlt: '', transcript: '', mustFinish: true, maxPlays: 2, decide: true, ask: 'all', variants: {} }
      ],
      practice: { id: 'practice', title: 'Practice', kind: 'text', body: 'A coworker asks to borrow your stapler for a meeting.', media: '', mediaAlt: '', transcript: '', decide: true, ask: 'none', variants: {} },
      questions: [{ id: 'confidence', text: 'How confident are you in that choice?', type: 'confidence', required: true, showIf: 'always', conditions: [] }],
      screening: { rules: [] },
      survey: { pre: [], post: [] }
    };
  },

  normalize(c, d) {
    c.design = { ...d.design, ...(c.design || {}) };
    c.design.sessions = (c.design.sessions || []).map(s => ({ blocks: blocksOf(s, c.design).map(b => ({ title: b.title || '', items: Array.isArray(b.items) ? b.items : [], randomize: !!b.randomize, ...(b.pool ? { pool: b.pool } : {}) })) }));
    c.decision = { ...d.decision, ...(c.decision || {}) };
    c.directory = Array.isArray(c.directory) ? c.directory : [];
    for (const it of (c.items || []).concat(c.practice ? [c.practice] : [])) {
      it.variants = it.variants || {}; it.kind = it.kind || 'text';
      if (it.ask == null) it.ask = 'all';
      if (it.decide == null) it.decide = it.kind !== 'text' && it.kind !== 'check';
    }
    for (const q of c.questions || []) { if (!Array.isArray(q.conditions)) q.conditions = []; if (!q.showIf) q.showIf = 'always'; }
    c.screening = { rules: Array.isArray(c.screening?.rules) ? c.screening.rules : [] };
  },

  validate(c, e) {
    const d = c.design, conds = [];
    if (!d || !Array.isArray(d.conditions) || d.conditions.length < 1 || d.conditions.length > 12) e.push('Define 1 to 12 conditions (arms).');
    else d.conditions.forEach((x, i) => {
      if (!/^[a-z][a-z0-9_]{0,30}$/.test(x.id || '')) e.push(`Condition ${i + 1}: the ID must start with a letter and use only lowercase letters, numbers, and underscores.`);
      else if (conds.includes(x.id)) e.push(`Two conditions share the ID "${x.id}".`);
      conds.push(x.id);
      if (!str(x.label, 80)) e.push(`Condition ${i + 1}: a label is required.`);
    });
    const qids = (c.questions || []).map(q => q.id), ids = new Set();
    (c.items || []).forEach((it, i) => {
      if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(it.id || '')) e.push(`Item ${i + 1}: invalid ID (lowercase letters, numbers, dashes).`);
      else if (ids.has(it.id)) e.push(`Two items share the ID "${it.id}".`);
      ids.add(it.id);
      validateItem(it, e, conds, qids, `Item "${it.title || it.id}"`);
    });
    if (d?.practice) { if (!c.practice) e.push('The practice item is missing.'); else validateItem(c.practice, e, conds, qids, 'Practice item'); }
    if (!c.decision || !str(c.decision.prompt, 300)) e.push('The decision needs a prompt (Decision tab).');
    else validateOptions(c.decision.options, e, 'Decision');
    if (!Array.isArray(c.directory) || c.directory.length > 30) e.push('The phone directory can have up to 30 entries.');
    else c.directory.forEach((x, i) => {
      if (!str(x.name, 120) || !/\d{3}/.test(String(x.number || ''))) e.push(`Directory entry ${i + 1}: needs a name and a phone number.`);
      if (!opt(x.greeting, 1000)) e.push(`Directory entry ${i + 1}: the greeting is too long.`);
      if (x.voice != null && !str(x.voice, 40)) e.push(`Directory entry ${i + 1}: the voice must be a voice name.`);
    });
    if (!d || !Array.isArray(d.sessions) || d.sessions.length < 1 || d.sessions.length > 12) e.push('The study needs 1 to 12 sessions.');
    else d.sessions.forEach((s, i) => {
      const all = (s.blocks || []).flatMap(b => b.items || []);
      if (!Array.isArray(s.blocks) || s.blocks.length > 12) e.push(`Session ${i + 1}: use up to 12 blocks.`);
      if (all.length > 80) e.push(`Session ${i + 1}: use up to 80 items.`);
      if (new Set(all).size !== all.length) e.push(`Session ${i + 1}: an item is listed twice.`);
      const missing = all.filter(id => !ids.has(id));
      if (missing.length) e.push(`Session ${i + 1}: uses items that no longer exist (${missing.join(', ')}).`);
    });
    const rec = c.consent && c.consent.recording;
    if ((c.items || []).some(it => it.recordVoice) && !(rec && rec.enabled)) e.push('An item records a spoken answer, so turn on recording consent (Sign-up & consent tab).');
    const nS = d && Array.isArray(d.sessions) ? d.sessions.length : 1;
    if (d && d.assignAtSession != null && !int(d.assignAtSession, 1, nS)) e.push(`Assign the arm at a session from 1 to ${nS}.`);
    const rz = d && d.randomization;
    if (rz && (rz.method !== 'blocks' || !int(rz.blockSize, d.conditions.length, 100) || rz.blockSize % d.conditions.length || !str(String(rz.seed || ''), 80)))
      e.push(`Permuted blocks need a block size that is a multiple of the ${d.conditions.length} arms, and a seed.`);
    if (d && d.assignAtSession > 1) {
      const early = d.sessions.slice(0, d.assignAtSession - 1).flatMap(s => s.blocks.flatMap(b => b.items));
      const armed = (c.items || []).filter(it => early.includes(it.id) && Object.keys(it.variants || {}).length).map(it => it.id);
      if (armed.length) e.push(`Items before the arm is assigned cannot vary by arm (${armed.join(', ')}).`);
    }
    (d && Array.isArray(d.sessions) ? d.sessions : []).forEach((s, i) => (s.blocks || []).forEach(b => {
      if (!b.pool) return;
      if (!X.POOLS.includes(b.pool)) e.push(`Session ${i + 1}: unknown pool "${b.pool}".`);
      else if (b.pool.startsWith('clips:') && !(c.clipLibrary && Array.isArray(c.clipLibrary.lists) && c.clipLibrary.lists.length)) e.push(`Session ${i + 1}: a clip block needs the clip library and its lists.`);
      else if (b.pool === 'shift' && !(c.shift && c.shift.forms && Object.values(c.shift.forms).every(f => Array.isArray(f) && f.every(id => ids.has(id))))) e.push(`Session ${i + 1}: every shift form must list existing call items.`);
    }));
    if (c.clipLibrary) {
      const cids = new Set((c.clipLibrary.clips || []).map(x => x.id));
      (c.clipLibrary.clips || []).forEach((x, i) => { if (!x || !x.id || !MEDIA_RE.test(x.media || '')) e.push(`Clip ${i + 1}: needs an ID and an audio file.`); });
      (c.clipLibrary.lists || []).forEach((l, i) => { if (!l || !['pre', 'post'].every(k => Array.isArray(l[k]) && l[k].every(id => cids.has(id)))) e.push(`Clip list ${i + 1}: pre and post must list clips in the library.`); });
    }
    if (c.persona && !(Array.isArray(c.persona.rows) && c.persona.rows.every(r => r && str(r.label, 80) && str(String(r.value || ''), 200)))) e.push('Every persona row needs a label and a value.');
    const preIds = (c.survey?.pre || []).map(q => q.id);
    (c.screening?.rules || []).forEach((r, i) => {
      if (!r || !preIds.includes(r.question)) e.push(`Screening rule ${i + 1}: choose a start-of-session question.`);
      else if (!Array.isArray(r.pass) || !r.pass.length) e.push(`Screening rule ${i + 1}: list the answers that may continue.`);
    });
    validateQuestions(c.questions || [], 'Item question', e, { nSessions: 99, conditions: conds, rules: [], allowSessions: false, embedded: (c.embedded || []).map(x => x && x.name) });
  },

  buildPlan(p, session, c, rand, { shuffle, seeded }) {
    const spec = c.design.sessions[session - 1], byId = new Map((c.items || []).map(x => [x.id, x]));
    const order = spec.blocks.flatMap((b, bi) => {
      const pooled = X.poolItems(b, c, p, byId);
      const its = pooled ? pooled.map(x => ({ ...x, block: bi + 1, blockTitle: b.title || '' })) : b.items.map(id => byId.get(id)).filter(Boolean).map(it => ({ it, block: bi + 1, blockTitle: b.title || '', meta: it.meta || null }));
      return b.randomize ? shuffle(its, rand) : its;
    });
    const questions = (c.questions || []).filter(q => !q.conditions.length || q.conditions.includes(p.condition));
    // The persona's values belong to the participant, not the session: the same card in every session.
    const persona = c.persona ? X.personaFor(c.persona, seeded(`${p.code}|persona`)) : null;
    const make = (it, i, block, meta, blockTitle) => {
      const item = resolve(it, p.condition);
      return { index: i, itemId: it.id, block, blockTitle, item, decision: decisionOf(c, item), ...(meta ? { meta } : {}),
        ...(item.kind === 'check' && item.check ? { checkPlan: checkPlan(item.check, rand) } : {}),
        ...(item.kind === 'call' && item.call && item.call.code ? { callCode: X.codeFor(rand) } : {}) };
    };
    return {
      questions, directory: (c.directory || []).map(x => ({ name: x.name, number: x.number, greeting: x.greeting || '', dept: x.dept || '', ...(x.voice ? { voice: x.voice } : {}) })),
      recording: !!(c.consent && c.consent.recording && c.consent.recording.enabled && p.recordingConsent),
      trials: order.map(({ it, block, meta, blockTitle }, i) => make(it, i, block, meta, blockTitle)),
      practice: session === 1 && c.design.practice && c.practice ? make(c.practice, 'practice', 0) : null,
      ...(persona ? { persona } : {}), ...(c.payoff ? { payoff: c.payoff } : {}), flags: p.flags || null,
      asr: asrConfigured() ? 'server' : 'browser'
    };
  },

  // What the browser gets: never the item ID, the condition's variant name, or a call's script and intent
  // (the caller's lines arrive one at a time from call/turn).
  publicTrial(t, plan) {
    const { id, variant, call, check, ...item } = t.item;
    if (call) item.call = { caller: call.caller, number: call.number || '', ringSeconds: call.ringSeconds || 30, voice: call.voice || null, scored: !!call.scored,
      ...(call.gate ? { gate: { retryOf: call.gate.retryOf || null, final: !!call.gate.final } } : {}) };
    if (t.meta && t.meta.slider) item.slider = true;
    if (t.meta && t.meta.locked) item.locked = true;
    // A check gets what the browser must play (tone orders, word audio), never the words themselves.
    const k = t.checkPlan;
    if (k) item.check = k.test === 'headphones' ? { test: k.test, attempts: k.attempts, rounds: k.rounds } : { test: k.test, attempts: k.attempts, media: k.words.map(w => w.media) };
    item.ask = questionsFor(plan, t).map(q => q.id);
    return { item, block: t.block, decision: t.decision };
  },
  publicPlanExtras: plan => ({ questions: publicQuestions(plan.questions, plan.condition), directory: (plan.directory || []).map(x => ({ name: x.name, number: x.number, dept: x.dept || '' })), recording: !!plan.recording,
    persona: X.publicPersona(plan.persona), asr: plan.asr || 'browser', payoff: plan.payoff ? { benignComplete: plan.payoff.benignComplete, disclose: plan.payoff.disclose, callback: plan.payoff.callback } : null }),

  // Attaches the server's record of a call to the answer before it is cleaned and saved; anything the browser
  // sent under that name is replaced. Returns nothing, so the engine saves as usual.
  saveTrialHook: async (S, p, plan, index, data) => {
    const t = plan.trials[index];
    const tag = `${p.code}/s${plan.session}/t${index}`;
    if (data && typeof data === 'object') {
      data.callServer = t && t.item.kind === 'call' ? await callSummary(S, tag, t, plan, !!p.test) : null;
      data.checkServer = t && t.checkPlan ? await checkSummary(S, tag, t.checkPlan) : null;
      // The retry of a gated call is skipped when the first try passed (the server checks, not the browser).
      const g = t && t.item.call && t.item.call.gate;
      if (g && g.retryOf) {
        const first = plan.trials.find(x => x.itemId === g.retryOf), r0 = first && await S.store.get(`data/${p.code}/s${plan.session}/t${first.index}`);
        if (r0 && r0.data && r0.data.callServer && r0.data.callServer.gatePassed) data.callServer = { ...(data.callServer || {}), skipped: true };
      }
    }
    return null;
  },
  purgeParticipant: async (S, p) => (await Promise.all([`calls/${p.code}/`, `callbacks/${p.code}/`, `audio/${p.code}/`, `checks/${p.code}/`, `alloc/`].map(k => S.store.list(k)))).flat()
    .filter(k => !k.startsWith('alloc/') || k.endsWith('/' + p.code)),

  cleanTrialData(d, t, plan) {
    d = d && typeof d === 'object' ? d : {};
    const small = (v, max) => v && typeof v === 'object' && jsonSize(v) <= max ? v : null;
    const answerLog = Array.isArray(d.answerLog) ? d.answerLog.slice(0, 1000).map(a => ({ atMs: num(a?.atMs, 0, 864e5), name: typeof a?.name === 'string' ? a.name.slice(0, 40) : null,
      value: typeof a?.value === 'number' ? a.value : String(a?.value ?? '').slice(0, 300) })) : [];
    const dec = t.decision, decision = dec && dec.options.some(o => o.value === d.decision) ? d.decision : null;
    const points = dec && dec.mouseTracking ? cleanPoints(d.trajectory) : [];
    const m = d.media && typeof d.media === 'object' ? d.media : null;
    const media = m ? { plays: num(m.plays, 0, 1000), pauses: num(m.pauses, 0, 1000), seeks: num(m.seeks, 0, 1000), firstPlayMs: num(m.firstPlayMs, 0, 864e5), endedMs: num(m.endedMs, 0, 864e5),
      heardPct: num(m.heardPct, 0, 100), durationMs: num(m.durationMs, 0, 864e5), transcriptOpened: m.transcriptOpened === true } : null;
    const c = d.call && typeof d.call === 'object' ? d.call : null;
    const call = c ? { answered: c.answered === true, ringMs: num(c.ringMs, 0, 36e5), durationMs: num(c.durationMs, 0, 36e5), holdMs: num(c.holdMs, 0, 36e5), typedTurns: num(c.typedTurns, 0, 200),
      spokenTurns: num(c.spokenTurns, 0, 200), interruptions: num(c.interruptions, 0, 200), captions: c.captions === true, directoryOpened: c.directoryOpened === true, endedBy: ['participant', 'caller', 'timeout'].includes(c.endedBy) ? c.endedBy : null,
      latencies: Array.isArray(c.latencies) ? c.latencies.slice(0, 100).map(x => num(x, 0, 6e4)) : [] } : null;
    const v = d.voice && typeof d.voice === 'object' ? d.voice : null;
    return {
      answers: cleanAnswers(d.answers, questionsFor(plan, t), { condition: plan.condition, embedded: plan.embedded }),
      decision, decisionMs: decision ? num(d.decisionMs, 0, 864e5) : null, trajectory: points.length ? points : null, mt: points.length ? trajectoryMetrics(points) : null,
      rtMs: num(d.rtMs, 0, 864e5), answerLog, traces: small(d.traces, 50000), media, call, callServer: small(d.callServer, 4000), checkServer: small(d.checkServer, 2000),
      voice: v ? { recorded: v.recorded === true && !!plan.recording, durationMs: num(v.durationMs, 0, 36e5), typed: typeof v.typed === 'string' ? v.typed.slice(0, 4000) : '' } : null,
      viewport: d.viewport ? { w: num(d.viewport.w, 0, 20000), h: num(d.viewport.h, 0, 20000) } : null, device: small(d.device, 4000), selfTest: d.selfTest === true || undefined,
      uiEvents: Array.isArray(d.uiEvents) ? d.uiEvents.slice(0, 200).map(x => ({ name: String(x && x.name || '').slice(0, 60), at: num(x && x.at, 0, 864e5) })) : [],
      live: t.item.live && dec ? X.cleanLive(d.live, num, dec.options) : null, slider: t.meta && t.meta.slider ? X.cleanSlider(d.slider, num) : null,
      screen: d.screen && typeof d.screen === 'object' ? { dwellMs: num(d.screen.dwellMs, 0, 36e5), clipsPlayed: num(d.screen.clipsPlayed, 0, 50), clipsEnded: num(d.screen.clipsEnded, 0, 50),
        dialed: Array.isArray(d.screen.dialed) ? d.screen.dialed.slice(0, 20).map(x => String(x).replace(/[^\d-]/g, '').slice(0, 20)) : [], reachedTarget: d.screen.reachedTarget === true } : null
    };
  },

  recordFields: (t, plan) => ({ itemId: t.itemId, block: t.block, blockTitle: t.blockTitle || '', item: { id: t.item.id, title: t.item.title, kind: t.item.kind, variant: t.item.variant, media: t.item.media || '', intent: t.item.call ? t.item.call.intent : '' },
    meta: t.meta || null, flags: plan.flags || null, codeSent: t.callCode ? true : undefined,
    questions: questionsFor(plan, t).filter(q => q.type !== 'info').map(q => q.id) }),

  trialRow(r) {
    const d = r.data || {}, tr = d.traces || {}, m = d.media || {}, c = d.call || {}, cs = d.callServer || {}, mt = d.mt || {}, isMedia = r.item?.kind === 'audio' || r.item?.kind === 'video';
    const changes = (d.answerLog || []).filter(a => a.name === 'decision').length;
    const row = { item_id: r.itemId, item_title: r.item?.title || '', item_kind: r.item?.kind || '', item_variant: r.item?.variant || '', block: r.block ?? '', call_intent: r.item?.intent || '',
      rt_ms: d.rtMs ?? '', first_answer_ms: tr.firstAnswerMs ?? '', answer_changes: tr.answerChanges ?? '',
      decision: d.decision ?? '', decision_ms: d.decisionMs ?? '', decision_changes: changes ? changes - 1 : '',
      mt_mad: mt.mad ?? '', mt_auc: mt.auc ?? '', mt_xflips: mt.xFlips ?? '', mt_init_ms: mt.initMs ?? '', mt_move_ms: mt.moveMs ?? '',
      media_plays: m.plays ?? '', media_heard_pct: m.heardPct ?? '', media_first_play_ms: m.firstPlayMs ?? '', media_transcript: isMedia ? (m.transcriptOpened ? 1 : 0) : '',
      call_answered: d.callServer ? (cs.answered ? 1 : 0) : '', call_outcome: cs.outcome || '', call_final_state: cs.finalState || '', call_turns: cs.participantTurns ?? '',
      call_digits_disclosed: cs.digitsDisclosed ?? '', call_verifies: cs.verifies ?? '', call_refusals: cs.refusals ?? '', call_callbacks: cs.callbacks ?? '', call_callback_resolved: d.callServer ? (cs.callbackResolved ? 1 : 0) : '',
      call_duration_ms: c.durationMs ?? '', call_hold_ms: c.holdMs ?? '', call_median_latency_ms: cs.medianLatencyMs ?? '', call_llm_turns: cs.llmTurns ?? '', call_typed_turns: c.typedTurns ?? '', call_interruptions: c.interruptions ?? '', call_captions: d.call ? (c.captions ? 1 : 0) : '', call_directory_opened: d.call ? (c.directoryOpened ? 1 : 0) : '',
      voice_recorded: d.voice ? (d.voice.recorded ? 1 : 0) : '', voice_ms: d.voice?.durationMs ?? '', voice_typed: d.voice?.typed || '',
      check_test: d.checkServer?.test || '', check_passed: d.checkServer ? (d.checkServer.passed == null ? '' : d.checkServer.passed ? 1 : 0) : '', check_attempts: d.checkServer?.attempts ?? '', check_outages: d.checkServer?.outages ?? '' };
    // Study design factors (clip cell, phase, list; call slot) and counterbalancing, for trial-level models.
    const meta = r.meta || {}, f = r.flags || {}, lv = d.live || null, sl = d.slider || null;
    Object.assign(row, { block_title: r.blockTitle || '', clip_id: meta.clipId || '', phase: meta.phase || '', locked: meta.phase ? (meta.locked ? 1 : 0) : '', structure: meta.structure || '', surface: meta.surface || '', topic: meta.topic || '',
      ask_timing: meta.askTiming || '', ask_ms: meta.askMs ?? '', call_slot: meta.slot || '', caller_id: meta.callerId || '', shift_form: f.shiftForm || '', clip_list: f.clipList ?? '', slider_flag: f.slider ? 1 : f.slider === false ? 0 : '',
      pilot_scripted: f.scripted ? 1 : f.scripted === false ? 0 : '',
      live_first: lv && lv.changes[0] ? lv.changes[0].value : '', live_first_ms: lv && lv.changes[0] ? lv.changes[0].ms : '', live_first_clip_ms: lv && lv.changes[0] ? lv.changes[0].clipMs : '',
      live_changes: lv ? Math.max(0, lv.changes.length - 1) : '', live_final: lv ? lv.final || '' : '', live_decided_ms: lv ? lv.decidedMs ?? '' : '', live_decided_clip_ms: lv ? lv.decidedClipMs ?? '' : '',
      live_late: lv ? (lv.late ? 1 : 0) : '', live_clip_ms: lv ? lv.clipMs ?? '' : '',
      slider_samples: sl ? sl.length : '', slider_mean: sl && sl.length ? Math.round(sl.reduce((a, x) => a + (x[1] || 0), 0) / sl.length) : '', slider_last: sl && sl.length ? sl[sl.length - 1][1] : '',
      call_disclosed: d.callServer ? (cs.disclosed || []).join('|') : '', call_disclosure: d.callServer ? ((cs.disclosed || []).length ? 1 : 0) : '', call_code_sent: d.callServer ? (cs.codeSent ? 1 : 0) : '',
      call_pressure_turns: cs.pressureTurns ?? '', call_spoken_turns: cs.spokenTurns ?? '', call_callbacks_lookedup: cs.callbacksLookedUp ?? '', call_callbacks_caller_number: cs.callbacksCallerSupplied ?? '',
      call_callback_latency_ms: cs.firstCallbackAt && cs.callStartAt ? cs.firstCallbackAt - cs.callStartAt : '', call_points: cs.points ?? '', call_tts_errors: cs.ttsErrors ?? '',
      call_gate_passed: cs.gatePassed == null ? '' : cs.gatePassed ? 1 : 0, call_skipped: cs.skipped ? 1 : '',
      screen_dwell_ms: d.screen?.dwellMs ?? '', screen_clips_ended: d.screen?.clipsEnded ?? '', screen_reached_target: d.screen ? (d.screen.reachedTarget ? 1 : 0) : '' });
    for (const q of r.questions || Object.keys(d.answers || {})) row[`a_${q}`] = (d.answers || {})[q] ?? '';
    return row;
  },

  simulate(trial, plan, rand) {
    const pick = a => a[Math.floor(rand() * a.length)];
    const answers = {};
    const qs = (plan.questions || []).filter(q => (trial.item.ask || []).includes(q.id));
    for (const q of orderItems(qs)) {
      if (q.type === 'info' || !evalDisplay(q.displayIf, { answers, ed: plan.embedded })) continue;
      if (q.type === 'scale') answers[q.id] = String((Number.isInteger(q.start) ? q.start : 1) + Math.floor(rand() * q.n));
      else if (q.type === 'choice' || q.type === 'select') answers[q.id] = pick(q.options).value;
      else if (q.type === 'confidence') answers[q.id] = String(Math.floor(rand() * 101));
      else if (q.type === 'number') answers[q.id] = String(Math.floor(rand() * 90));
      else if (q.type === 'multi') answers[q.id] = [pick(q.options).value];
      else answers[q.id] = 'self-test note';
    }
    const out = { answers, rtMs: 1500, traces: { durationMs: 1500 }, selfTest: true, rawEvents: [{ t: 1, type: 'self_test' }] };
    if (trial.decision) {
      out.decision = pick(trial.decision.options).value; out.decisionMs = 900;
      if (trial.decision.mouseTracking) out.trajectory = [[400, 500, 0], [390, 400, 200], [300, 250, 500], [120, 90, 900]];
    }
    if (['audio', 'video'].includes(trial.item.kind)) out.media = { plays: 1, heardPct: 100, firstPlayMs: 300 };
    if (trial.item.kind === 'call') out.call = { answered: true, durationMs: 1000, typedTurns: 0 };
    return out;
  },
  checkRow(row, sent) {
    const problems = [];
    for (const [k, v] of Object.entries(sent.answers)) if (row[`a_${k}`] !== (Array.isArray(v) ? v.join('|') : v)) problems.push(`answer ${k}`);
    if (sent.decision != null && row.decision !== sent.decision) problems.push('decision');
    if (sent.trajectory && row.mt_mad === '') problems.push('mouse-tracking measures');
    return problems;
  },
  checkSession(rows, session, condition, c) {
    const blocks = c.design.sessions[session - 1].blocks, want = blocks.flatMap(b => b.pool ? [] : b.items);
    const pooled = blocks.filter(b => b.pool).reduce((n, b) => n + (b.pool === 'shift' ? (Object.values(c.shift.forms)[0] || []).length : (c.clipLibrary.lists[0][b.pool.slice(6)] || []).length), 0);
    const fixed = rows.filter(x => want.includes(x.item_id)).length;
    return [[fixed === want.length && rows.length === want.length + pooled, `Session ${session}: the right items were shown (${want.length + pooled})`]];
  }
};
