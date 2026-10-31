// Study 2 phone calls: the practice call (session 1, a hard gate with one retry) and the 10-call softphone shift.
//
// No caller ID (decision 2026-10-22): every call, the practice call included, rings as "Incoming call" with no number,
// so nothing on the screen predicts whether a call is an attack and there is no displayed number to call back.
//
// Shift mix: 5 attacks (3 calm, 2 urgent) and 5 benign
// (2 urgent but legitimate, 3 calm requests), every benign caller also asking for something with no value transfer.
// The directory is down on 4 calls per participant (decision 2026-10-22; multimodal-study.mjs poolItems). Topics (financial / community) are counterbalanced: form A and form B swap the topic of every slot, and
// each participant gets one form (balanced within arm). Order is shuffled per participant.
//
// PLACEHOLDERS: the shift calls are written by the outside script writer (writer independence). These placeholder
// call specs only make the shift run end to end; each is marked placeholder: true and counted in PLACEHOLDER_CALLS.
import { DIRECTORY, VOICES, VOICE, number } from './world.mjs';
import { STIMULI } from './stimuli-data.mjs';

const DISPOSITION = [{ value: 'legitimate', label: 'Legitimate' }, { value: 'suspicious', label: 'Suspicious' }, { value: 'report', label: 'Report to security' }];
const callItem = (id, call, extra = {}) => ({ id, title: 'Incoming call', kind: 'call', body: '', media: '', mediaAlt: '', transcript: '', decide: true,
  decisionPrompt: 'How would you describe that call?', decisionOptions: DISPOSITION, ask: ['confidence6'], variants: {}, ...extra, call: { maxTurns: 10, ringSeconds: 30, scored: true, llm: false, ...call } });   // scripted lines only (decided 2026-10-22)

// ---------- the practice call (not scored; passes if the lab's recognizer hears at least one spoken reply) ----------
const PRACTICE = {
  caller: 'Incoming call', number: '', debriefName: 'Warehouse Receiving', callbackNumber: number('Warehouse Receiving, Northwind'), intent: 'benign', maxTurns: 6, ringSeconds: 45, scored: false, llm: false, voice: VOICES.V2,
  persona: 'Sam, a friendly coworker in the Northwind warehouse.',
  script: {
    opener: 'Hey Alex, it\'s Sam down in receiving. Got a second?',
    pretext: 'A Brightway truck just dropped six pallets, and the paperwork says Summit Paper.',
    ask: 'Can you tell me whether we were expecting a Summit delivery today? Just yes or no is fine.',
    pressure1: 'No worries. Summit Paper is on your vendor list, if that helps.',
    pressure2: 'Okay, I\'ll check with Priya. Thanks anyway.',
    deflect: 'Sure, you can reach me at receiving any time.',
    closeComply: 'Great, thanks. That\'s all I needed.', closeRefuse: 'No problem, I\'ll sort it out. Thanks.', close: 'Thanks, Alex. Talk later.',
    callback: 'Receiving, this is Sam. Yep, that was me about the Summit delivery.'
  }
};
export const PRACTICE_ITEMS = [
  callItem('practice-call', { ...PRACTICE, gate: { final: false } }, { title: 'Practice call', body: 'A practice call from Sam, a coworker. Nothing here is scored. Click Answer. To reply, click Tap to talk, say your reply out loud, then click it again to send it. Wait for Sam to answer before you reply again. The call ends when Sam says goodbye, or click Hang up. Then click Continue.', decide: false, ask: 'none' }),
  callItem('practice-call-retry', { ...PRACTICE, gate: { retryOf: 'practice-call', final: true } }, { title: 'Practice call (second try)', body: 'Sam will call once more. Click Answer, click Tap to talk, say your reply out loud, then click it again to send it. Typing does not count on this call: we need to hear you.', decide: false, ask: 'none' })
];

// ---------- the shift (the writer's calls, stimuli-data.mjs) ----------
// Scoring patterns, by the writer's stimulus id. completeRe (legitimate calls) starts from the writer's completes list;
// a choice call also takes the options its ask offers. lossRe (bank-change, payment and link-approval attacks) adds the
// short ways a person agrees to that action; a bare "okay" or "sure" never matches.
const BANK_CHANGE = "\\b(?:change the bank details|i saved the new bank information|go ahead and update the account|the new account is now on file|i(?:'?ll| will| can) (?:update|change|enter|save) (?:it|that|them|the (?:bank|account))|i(?:'?ve| have) (?:updated|changed|saved) (?:it|that|them)|it'?s (?:updated|saved))\\b";
const PAYMENT = "\\b(?:i sent the payment|go ahead and pay it|the payment is submitted|i paid the invoice to that account|(?:i'?ll|i will|i can) (?:send|submit|pay|make) (?:it|that|the payment)|i(?:'?ve| have| just) (?:sent|submitted|paid) (?:it|that|the payment)|it'?s (?:sent|submitted|paid)|sending it now)\\b";
const LINK = "\\b(?:yes, approve it|i approved the request|the review is approved|go ahead and approve it|(?:i'?ll|i will|i can) (?:approve|click) (?:it|that|the link|the request|access)|i(?:'?ve| have| just) (?:approved|clicked) (?:it|that|the link|the request)|(?:it'?s|that'?s) approved)\\b";
const HELD = '\\b(?:yes|yeah|that is correct|that matches|no, it has changed|the date is correct|the last four are correct)\\b';
const YES_NO = '\\b(?:yes|yeah|no|no, we will not|yes, we expect it|we do not expect it)\\b';
const choice = offered => `\\b(?:email|the account portal|tuesday morning|wednesday afternoon|thursday morning|friday afternoon|front entrance|warehouse door|receiving|afternoon pickup|${offered})\\b`;
const PATTERNS = {
  'S-atk-calm-2-A': BANK_CHANGE, 'S-atk-calm-2-B': BANK_CHANGE, 'R-atk-5': BANK_CHANGE,
  'S-atk-urgent-2-A': PAYMENT, 'S-atk-urgent-2-B': PAYMENT, 'R-atk-4': PAYMENT, 'R-atk-8': PAYMENT,
  'R-atk-6': LINK,
  'S-ben-calm-1-A': HELD, 'S-ben-calm-1-B': HELD, 'R-ben-1': HELD,
  'S-ben-calm-2-A': YES_NO, 'S-ben-calm-2-B': YES_NO, 'S-ben-urgent-2-A': YES_NO, 'S-ben-urgent-2-B': YES_NO, 'R-ben-3': YES_NO, 'R-ben-6': YES_NO, 'R-ben-7': YES_NO,
  'S-ben-calm-3-A': choice('this afternoon|tomorrow morning'), 'S-ben-calm-3-B': choice('portal'), 'R-ben-2': choice('thursday|friday'), 'R-ben-8': choice('this afternoon|tomorrow morning')
};

function toCall(s) {
  const debriefName = s.organization.split(',')[0], attack = s.structure === 'attack', k = s.requestKind;
  const call = { caller: 'Incoming call', number: '', debriefName, callbackNumber: number(s.organization), intent: attack ? 'attack' : 'benign', voice: VOICE, persona: s.persona, script: s.lines };
  if (k === 'code') call.code = { service: debriefName, at: 'ask' };
  if (attack) call.deflectNumber = s.attackerNumber;   // every attack's deflect line gives this number; dialing it is a caller-supplied callback
  if (k === 'caller-callback') call.lossOnCallerCallback = true;
  if (['bank-change', 'payment', 'link-approval'].includes(k)) call.lossRe = PATTERNS[s.id];
  if (k === 'route-own') call.completeViaCallback = true;
  if (['yes-no', 'confirm-held', 'choice'].includes(k)) call.completeRe = PATTERNS[s.id];
  return call;
}
const meta = s => ({ slot: s.slot, structure: s.structure === 'attack' ? 'attack' : 'benign', surface: s.surface === 'high' ? 'urgent' : 'calm', topic: s.topic, askKind: s.requestKind, stimulusId: s.id, form: s.form });

export const SHIFT_ITEMS = [], SHIFT_FORMS = { A: [], B: [] };
for (const s of STIMULI.filter(s => s.set === 'shift')) {
  const id = `call-${s.slot}-${s.form.toLowerCase()}`;
  SHIFT_ITEMS.push(callItem(id, toCall(s), { meta: meta(s) }));
  SHIFT_FORMS[s.form].push(id);
}
// Reserve calls: written and scored like the shift, not used in the study yet.
export const RESERVE_ITEMS = STIMULI.filter(s => s.set === 'reserve').map(s => callItem(`reserve-${s.id}`, toCall(s), { meta: meta(s) }));
export const PLACEHOLDER_CALLS = 0;
export const DIRECTORY_NUMBERS = DIRECTORY.map(d => d.number);
