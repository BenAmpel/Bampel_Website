// CCAIR Behavioral Lab: the AI voice caller used by "call" items in multimodal studies.
//
// A call is a state machine with preregistrable rules (the stimulus is controlled here, not by a model):
//   opener → pretext → ask → pressure1 → pressure2 → close
// plus "deflect" (the caller answers a request to verify or call back), "goAhead" (an attacker hears "okay" with
// nothing given yet and waits for it, so agreeing is not mistaken for disclosing) and three endings:
//   closeComply (the participant did what was asked), closeRefuse (refused twice, or kept insisting on
//   verifying), close (the caller ran out of turns or pressure).
// Each state has a scripted line written by the researcher. That line is what the caller says unless an LLM
// is configured, in which case the LLM only rephrases the line for the current state, with the participant's
// last words as context; on any error, refusal, or timeout the scripted line is used. So a study runs the
// same way with no API key at all (the scripted fallback tree) and every turn records which one was spoken.
//
// The participant's words are classified with transparent keyword rules (classify below), never by a model,
// so the transitions are reproducible from the transcript.

export const STATES = ['opener', 'pretext', 'ask', 'pressure1', 'pressure2', 'deflect', 'goAhead', 'closeComply', 'closeRefuse', 'close'];
// Lines used when a script does not have one for a state.
export const DEFAULT_LINES = { goAhead: 'Great. Go ahead whenever you are ready.', waiting: 'Sure, take your time.' };
// What the caller says after a reply: its line for the new state, except that a request to wait gets a waiting line
// instead of the current line again (a caller repeating the same request word for word sounds like a loop).
export function replyLine(script, cls, prev, after) {
  if (cls && cls.intent === 'hold' && prev && after && prev.state === after.state && !after.done) return (script && script.waiting) || DEFAULT_LINES.waiting;
  return (script && script[after.state]) || DEFAULT_LINES[after.state] || '';
}
export const ENDINGS = ['closeComply', 'closeRefuse', 'close'];
const PRESSURE = ['ask', 'pressure1', 'pressure2'];

export function defaultScript(intent = 'attack') {
  return intent === 'benign' ? {
    opener: 'Hi, this is Sam calling from Harborview Bank\'s card services team. Is now a good time for a quick call?',
    pretext: 'We mailed you a replacement card last week because the old one is expiring, and I am calling to make sure it arrived.',
    ask: 'Could you confirm whether the new card has arrived? I do not need any numbers from it.',
    pressure1: 'No problem. If it has arrived you can activate it in the app whenever is convenient.',
    pressure2: 'Thanks for your time. If anything looks wrong, you can always call the number on the back of your card.',
    deflect: 'Of course. Please call the number on the back of your card or on our website, and they can confirm this.',
    closeComply: 'Great, that is all I needed. Thank you, and have a good day.',
    closeRefuse: 'That is completely fine. Have a good day.',
    close: 'Thanks for your time. Goodbye.',
    callback: 'Thank you for calling Harborview Bank. I can see a courtesy call about your replacement card on your account, so that was us.'
  } : {
    opener: 'Hello, this is Alex from the Harborview Bank fraud prevention team. Am I speaking with the account holder?',
    pretext: 'We have flagged a payment of eight hundred and forty dollars to an online electronics store that looks unusual for your account.',
    ask: 'To stop it, I need to verify you. I just texted you a six-digit code. Could you read it back to me?',
    pressure1: 'I understand. The payment will clear in a few minutes, so I do need that code now to block it.',
    pressure2: 'If we cannot verify you, the charge will go through and you may not get the money back. Can you read me the code?',
    deflect: 'Sure, you can reach me directly at 800 555 0199, but the payment will clear before then. It is faster to read me the code now.',
    goAhead: 'Great, thank you. Go ahead and read me the code whenever you are ready.',
    closeComply: 'Thank you, that has stopped the payment. You are all set.',
    closeRefuse: 'All right. Please keep an eye on your account. Goodbye.',
    close: 'I have to let you go now. Goodbye.',
    callback: 'Thank you for calling Harborview Bank. I do not see any fraud alert or call from us on your account. Please do not share any codes with callers.'
  };
}

// ---------- understanding the participant (keyword rules) ----------
const NUMBER_WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
// Digits the participant said, counting spoken digits ("four two seven") and written ones.
export function digitsIn(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let run = 0, best = 0;
  for (const w of words) {
    if (/^\d+$/.test(w)) run += w.length;
    else if (w === 'oh' && run === 0) continue;   // "oh" is a zero only inside a run of digits ("four oh seven"), not "oh no"
    else if (Object.hasOwn(NUMBER_WORDS, w)) run += 1;
    else { best = Math.max(best, run); run = 0; }
  }
  return Math.max(best, run);
}
const RE = {
  verify: /\b(call (you|them|the bank|it|your office|back)|call ?back|verify (you|this|who)|look (it |that )?up|official number|number on (the back of )?(my|the) card|hang up and call|let me (check|call)|i'?ll call|i will call|i'?ll (check|look into (it|this|that)) and (call|ring|get back)|get back to you|(call|check with|go through) (the |our |my )?(company )?directory|who is this|who'?s (this|calling)|who is calling|what'?s your (name|extension|number|department)|what is your (name|extension|number|department)|which (department|office|branch)|(can|could|may) i (call|ring) (you )?back|how do i know|prove)\b/i,
  // "fraud" alone is not a refusal ("is this fraud prevention?"); calling the call a scam or fraud is.
  refuse: /\b(no|nope|not comfortable|won'?t|will not|don'?t (want|feel|think|give|share)|not going to|i refuse|stop calling|not interested|scam(mer)?|fraudster|(this|that|it) (is|sounds like|seems like) (a )?fraud|leave me alone|no thanks|(not|n't) (ok|okay)|can'?t|cannot|can not|unable to|not able to|(i'?d )?rather not|prefer not|not (allowed|authorized|permitted)|against (our |company )?policy|i decline|not over the phone|not giving (that|it|you)|not sharing|i'?ll pass|no way)\b/i,
  // Hedges are neither agreement nor refusal ("not sure" contains "sure", "no idea" contains "no"); checked first.
  hedge: /\b((not|n't|never) (really |quite |too |so |100% )?(sure|certain)|unsure|uncertain|no idea|(i )?(don'?t|do not) know|dunno|maybe|perhaps|i'?m not positive|(don'?t|do not) have (it|that|this|the [a-z]+)( [a-z]+)? (in front of me|on hand|handy|here|with me))\b/i,
  // "fine" and "it's" are not agreement on their own ("I'm fine", "it's not something I can share").
  comply: /\b(yes|yeah|yep|sure|okay|ok|go ahead|here it is|the code is|my (code|pin|password|number) is|it arrived|got it)\b/i,
  // A request to wait, not any "wait" ("wait, why do you need that?" is a question).
  hold: /\b(hold on|hang on|one (sec|second|moment|minute)|just a (sec|second|moment|minute)|give me a (sec|second|moment|minute)|wait a (sec|second|moment|minute)|please wait)\b|^\s*wait[.!]?\s*$/i
};
// One intent per utterance, in this order of precedence: giving digits counts as complying whatever else is said
// (digitRule; a study that knows the participant's secrets turns it off and scores disclosure from the secrets).
export function classify(text, { digitRule = true } = {}) {
  // Typed and transcribed text arrive with curly apostrophes and "O.K." spellings; normalize them first.
  const raw = String(text || '').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\bo\.\s?k\.?(?=\W|$)/gi, 'ok').trim(), digits = digitsIn(raw);
  // "oh no" is surprise and "no problem" is agreement, not a refusal; "make sure" and "are you sure" are not agreement.
  const t = raw.replace(/\b(oh|uh|ah),?\s+no\b[!.,]?/gi, '').replace(/\bno (problem|worries|rush|trouble)\b/gi, 'okay')
    .replace(/\b(make|making|be|are you|you)\s+sure\b/gi, ' ')
    .replace(/\b(can'?t|cannot|can not) (hear|understand|make out|see)\b/gi, ' ').trim();   // a line problem, not a refusal
  if (!raw) return { intent: 'silence', digits: 0 };
  // A long run of digits is a disclosure only when nothing better is known; studies with persona secrets decide
  // disclosure from the secrets themselves (multimodal.mjs callTurn), so a read-back employee ID is not a leak.
  if (digitRule && digits >= 4) return { intent: 'comply', digits, disclosed: true };
  if (!t) return { intent: 'other', digits };
  // "Sure, I'll call them from the directory" verifies and agrees at once; a caller who asked for exactly that callback
  // hears the yes (step, completeOnCall false) instead of restating the request.
  if (RE.verify.test(t)) return { intent: 'verify', digits, agreed: !RE.refuse.test(t) && (RE.comply.test(t) || /\b(i'?ll|i will|let me|going to) (call|ring)\b/i.test(t)) };
  if (RE.hedge.test(t)) return { intent: 'hedge', digits };     // before refuse: "no idea" is a hedge, not a "no"
  if (RE.refuse.test(t)) return { intent: 'refuse', digits };
  if (RE.hold.test(t)) return { intent: 'hold', digits };   // "okay, hold on" waits rather than agrees
  // A question whose only agreeing word is "okay"/"sure" ("is that okay?") asks rather than agrees.
  if (/\?\s*$/.test(t) && !/\b(yes|yeah|yep|go ahead|here it is|the code is|my (code|pin|password|number) is)\b/i.test(t)) return { intent: 'question', digits };
  if (RE.comply.test(t)) return { intent: 'comply', digits };
  if (/\?\s*$/.test(t)) return { intent: 'question', digits };
  return { intent: 'other', digits };
}

// ---------- the state machine ----------
// st: { state, refusals, verifies, turns, lastPressure } from the turns so far. Returns the next state and,
// when the call ends, the outcome.
export function step(st, cls, { intent = 'attack', maxTurns = 8, completeOnCall = true } = {}) {
  const s = { ...st, turns: (st.turns || 0) + 1 };
  const end = (state, outcome) => ({ ...s, state, done: true, outcome });
  const nextPressure = () => {
    if (s.lastPressure === 'pre') return 'ask';   // a deflection before the ask leads to the ask
    const i = PRESSURE.indexOf(s.lastPressure || 'ask');
    return i < 0 ? 'ask' : PRESSURE[i + 1] || null;
  };
  const cur = s.state;
  // The turn cap applies only when this reply did not end the call, so a last-turn compliance or refusal still counts.
  const capped = next => (next.done || s.turns < maxTurns ? next : end('close', 'max_turns'));
  // Before the ask: a request to verify is answered at once (then the caller goes on to the ask), and a refusal counts.
  if (cur === 'opener' || cur === 'pretext') {
    if (cls.intent === 'verify') {
      s.verifies = (s.verifies || 0) + 1;
      if (s.verifies >= 2) return end('closeRefuse', 'verified');
      return capped({ ...s, state: 'deflect', lastPressure: 'pre' });
    }
    if (cls.intent === 'refuse') {
      s.refusals = (s.refusals || 0) + 1;
      if (s.refusals >= 2) return end('closeRefuse', 'refused');
    }
    return capped(cur === 'opener' ? { ...s, state: 'pretext' } : { ...s, state: 'ask', lastPressure: 'ask' });
  }
  const live = PRESSURE.includes(cur) || cur === 'deflect' || cur === 'goAhead';
  if (cls.intent === 'hold' && live) return capped({ ...s });   // "hold on": the caller waits and repeats itself
  // A legitimate caller whose request is the callback itself takes "I'll call you through the directory" as the answer.
  if (live && intent === 'benign' && !completeOnCall && cls.intent === 'verify' && cls.agreed) return end('closeComply', 'agreed');
  if (live) {
    if (cls.intent === 'comply') {
      if (intent === 'benign') return end('closeComply', completeOnCall ? 'completed' : 'agreed');
      if (cls.disclosed) return end('closeComply', 'disclosed');
      // "Okay" with nothing given: the attacker waits for it once, then presses on.
      s.agreed = (s.agreed || 0) + 1;
      if (cur !== 'goAhead') return capped({ ...s, state: 'goAhead' });
    }
    if (cls.intent === 'verify') {
      s.verifies = (s.verifies || 0) + 1;
      if (s.verifies >= 2) return end('closeRefuse', 'verified');
      return capped({ ...s, state: 'deflect' });
    }
    if (cls.intent === 'refuse') {
      s.refusals = (s.refusals || 0) + 1;
      if (s.refusals >= 2) return end('closeRefuse', 'refused');
    }
    const n = nextPressure();   // after a deflection the caller presses on from where it was
    if (!n) return end('close', intent === 'benign' ? 'not_completed' : 'resisted');
    return capped({ ...s, state: n, lastPressure: n });
  }
  return end('close', 'ended');
}

// The call so far: every logged turn stores the whole state it moved to, so the last one is the current state.
export const START = { state: null, refusals: 0, verifies: 0, agreed: 0, turns: 0, lastPressure: null, done: false, outcome: null };
export function replay(turns) {
  const withState = (turns || []).filter(t => t && t.after);
  return withState.length ? withState[withState.length - 1].after : { ...START };
}

// ---------- privacy: what is kept of the participant's words ----------
// Long digit runs (codes, card and phone numbers), email addresses, and street addresses are replaced before a
// transcript is stored. The count of digits disclosed is kept as a number, which is what the analysis needs.
export function redact(text) {
  return String(text || '').slice(0, 2000)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b\d{1,5}\s+([A-Z][a-z]+\s){1,3}(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|way|court|ct)\b\.?/gi, '[address]')
    .replace(/(\d[\s-]?){4,}/g, '[number] ')
    .replace(/\b((zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s,-]+){3,}(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, '[number]')
    .replace(/\s+/g, ' ').trim();
}

// ---------- optional LLM phrasing ----------
// Configured with environment variables (Netlify site settings, or the shell for `npm run lab`):
//   ANTHROPIC_API_KEY   enables phrasing with Claude through the Messages API.
//   LAB_LLM_MODEL       model ID (default claude-opus-5-5; claude-haiku-5-5 answers faster, which helps the 1.2 s target).
//   LAB_LLM_TIMEOUT_MS  give up and use the scripted line after this long (default 4000).
// Plain fetch, no SDK: the lab's server code has no runtime dependencies so `npm run lab` works without an install.
export function llmConfigured(env = process.env) { return !!(env && env.ANTHROPIC_API_KEY); }

export async function phrase({ state, line, persona, heard, history = [], env = process.env, fetchImpl = globalThis.fetch }) {
  if (!llmConfigured(env) || !line || typeof fetchImpl !== 'function') return { text: line, source: 'script' };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), Number(env.LAB_LLM_TIMEOUT_MS) || 4000);
  const system = 'You voice a phone caller in a university research study on how people handle phone calls. Participants consented to calls that may try to get information from them; everything you say is fictional. ' +
    'Each turn you get the line the script calls for in the current state. Say essentially that line in one or two short, natural spoken sentences, adapting only so it answers what the participant just said. ' +
    'Never ask for anything the line does not ask for, never add threats or new claims, never mention being an AI, a script, or a study, and never use lists or markup. Reply with the words to speak only.' +
    (persona ? '\n\nCaller: ' + String(persona).slice(0, 1500) : '');
  const transcript = history.slice(-8).map(h => (h.speaker === 'caller' ? 'Caller: ' : 'Participant: ') + h.text).join('\n');
  const user = (transcript ? 'Conversation so far:\n' + transcript + '\n\n' : '') + 'The participant just said: "' + String(heard || '(nothing yet)').slice(0, 600) + '"\nState: ' + state + '\nScripted line: "' + line + '"';
  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      body: JSON.stringify({ model: env.LAB_LLM_MODEL || 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'low' }, fallbacks: 'default',
        system, messages: [{ role: 'user', content: user }] })
    });
    if (!r.ok) return { text: line, source: 'script', error: 'http_' + r.status };
    const j = await r.json();
    if (j.stop_reason === 'refusal') return { text: line, source: 'script', error: 'refusal' };
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').replace(/\s+/g, ' ').trim();
    return text ? { text: text.slice(0, 600), source: 'llm', model: j.model } : { text: line, source: 'script', error: 'empty' };
  } catch (e) {
    return { text: line, source: 'script', error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally { clearTimeout(timer); }
}
