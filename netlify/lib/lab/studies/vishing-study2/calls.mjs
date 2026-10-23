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
import { DIRECTORY, VOICES, number } from './world.mjs';

const DISPOSITION = [{ value: 'legitimate', label: 'Legitimate' }, { value: 'suspicious', label: 'Suspicious' }, { value: 'report', label: 'Report to security' }];
const callItem = (id, call, extra = {}) => ({ id, title: 'Incoming call', kind: 'call', body: '', media: '', mediaAlt: '', transcript: '', decide: true,
  decisionPrompt: 'How would you describe that call?', decisionOptions: DISPOSITION, ask: ['confidence6'], variants: {}, ...extra, call: { maxTurns: 10, ringSeconds: 30, scored: true, ...call } });

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
  callItem('practice-call', { ...PRACTICE, gate: { final: false } }, { title: 'Practice call', body: 'This is a practice call from a coworker. Answer it, speak your reply out loud, and hang up when you are done. Nothing here is scored.', decide: false, ask: 'none' }),
  callItem('practice-call-retry', { ...PRACTICE, gate: { retryOf: 'practice-call', final: true } }, { title: 'Practice call (second try)', body: 'Let us try the practice call once more. Speak your reply out loud.', decide: false, ask: 'none' })
];

// ---------- the shift (placeholders) ----------
const ATTACKER_NUMBERS = ['(404) 555-0186', '(404) 555-0188', '(404) 555-0191', '(404) 555-0193', '(404) 555-0195'];
function attack({ org, dept, ask, askKind, urgent, n, voice }) {
  const cb = number(dept);
  return {
    caller: 'Incoming call', number: '', debriefName: org.replace(/^the /, ''), callbackNumber: cb, deflectNumber: ATTACKER_NUMBERS[n], intent: 'attack', voice,
    ...(askKind === 'code' ? { code: { service: org, at: 'ask' } } : {}),
    persona: `A caller claiming to be from ${org}. ${urgent ? 'Urgent and insistent.' : 'Calm, polite and patient.'}`,
    script: {
      opener: urgent ? `This is ${org}, and I need a moment of your time right away. Am I speaking with Alex at Northwind Supply?` : `Hi, this is Jordan with ${org}. Is this Alex at Northwind Supply? No rush, I just have a quick question.`,
      pretext: urgent ? `We have flagged unusual activity on Northwind's account, and it needs to be stopped in the next few minutes.` : `We are updating Northwind's file, and I need to verify a detail before I can close it out.`,
      ask, pressure1: urgent ? 'I understand, but this has to happen now, or the account will be locked.' : 'Totally understand. It only takes a second, and then you are all set.',
      pressure2: urgent ? 'If we cannot finish this on this call, Northwind will be responsible for the loss.' : 'I just need that one detail, and I will not need to call again.',
      deflect: `You can reach me directly at ${ATTACKER_NUMBERS[n].replace(/[()]/g, '').replace(/-/g, ' ')}, but it is much faster to finish this now.`,
      deflectLine: `${org}, this is Jordan. Thanks for calling back. Go ahead and read me that detail now.`,
      closeComply: 'Thank you, that is all I needed. You are all set.', closeRefuse: 'All right. Have a good day.', close: 'I have to let you go now. Goodbye.',
      callback: `Thank you for calling ${org}. I do not see any call from us to Northwind today, and we never ask for codes or passwords by phone. Please do not share anything with that caller.`
    }
  };
}
function benign({ org, dept, ask, urgent, n, voice, routeOwn }) {
  const cb = number(dept);
  return {
    caller: 'Incoming call', number: '', debriefName: org.replace(/^the /, ''), callbackNumber: cb, intent: 'benign', voice,
    persona: `A real employee of ${org}. ${urgent ? 'Urgent but polite.' : 'Calm and routine.'}`,
    script: {
      opener: urgent ? `Hello, this is Morgan from ${org}. I am calling about something time-sensitive for Northwind Supply.` : `Hi, this is Casey from ${org}. Is this the Northwind front desk?`,
      pretext: urgent ? 'We stopped a transaction this morning that did not match Northwind\'s usual activity.' : 'I am just confirming a routine detail on our end.',
      ask, pressure1: routeOwn ? 'Again, please use the number in your directory, not one from me.' : 'No problem if you are not sure. It is just a quick confirmation.',
      pressure2: 'Thanks for your time either way.',
      deflect: `Of course. Please call ${org} at the number in your company directory and they can confirm this.`,
      closeComply: 'Perfect, thank you. That is all we needed.', closeRefuse: 'That is completely fine. Have a good day.', close: 'Thanks, goodbye.',
      callback: `Thank you for calling ${org}. Yes, we did call Northwind today about that, and everything is in order. Thanks for checking.`
    }
  };
}
// slot -> [form A spec, form B spec]; topics swap between forms.
const SLOTS = {
  'atk-calm-1': [{ topic: 'financial', org: 'Keystone Card Services', dept: 'Keystone Card Services, Corporate Cards', askKind: 'code', ask: 'I just texted a six-digit code to the company phone. Could you read it back to me so I can verify the account?' },
    { topic: 'community', org: 'Calder Properties', dept: 'Calder Properties, Building Management', askKind: 'code', ask: 'Our system just sent a six-digit access code to your phone. Could you read it back so I can update the badge list?' }],
  'atk-calm-3': [{ topic: 'financial', org: 'Tallgrass Bank', dept: 'Tallgrass Bank, Fraud Prevention', askKind: 'code', ask: 'I just sent a six-digit code to the company phone to confirm I am speaking with the right person. Could you read it to me?' },
    { topic: 'community', org: 'Riverton Water and Power', dept: 'Riverton Water & Power, Business Accounts', askKind: 'code', ask: 'I just sent a six-digit code for the account change. Could you read it to me?' }],
  'atk-urgent-1': [{ topic: 'community', org: 'the Harlan County Tax Office', dept: 'Harlan County Tax Office', askKind: 'password', urgent: true, ask: 'To stop the penalty, I need to log in to Northwind\'s business portal with you. What is the portal password?' },
    { topic: 'financial', org: 'PayLark Payroll', dept: 'PayLark Payroll', askKind: 'password', urgent: true, ask: 'To stop the payroll run, I need the Northwind portal password right now.' }],
  'atk-urgent-2': [{ topic: 'financial', org: 'Meridian Ridge Credit Union', dept: 'Meridian Ridge Credit Union', askKind: 'account', urgent: true, ask: 'I need Northwind\'s full company account number to freeze the transfer. What is it?' },
    { topic: 'community', org: 'Brightway Parcel', dept: 'Brightway Parcel, Riverton Depot', askKind: 'account', urgent: true, ask: 'Your shipment is being returned unless the duty is paid now. What is the company account number for the charge?' }],
  'atk-calm-2': [{ topic: 'financial', org: 'PayLark Payroll', dept: 'PayLark Payroll', askKind: 'account', ask: 'We are moving Northwind to our new funding system. To match your file, could you read me the company account number that payroll is drawn from?' },
    { topic: 'community', org: 'the Harlan County Tax Office', dept: 'Harlan County Tax Office', askKind: 'account', ask: 'Northwind has a small property tax refund. To deposit it, I just need the company account number. Do you have it handy?' }],
  'ben-urgent-1': [{ topic: 'financial', org: 'Tallgrass Bank', dept: 'Tallgrass Bank, Fraud Prevention', urgent: true, routeOwn: true, ask: 'Please hang up and call Tallgrass Fraud Prevention at the number in your company directory, so you know it is really us.' },
    { topic: 'community', org: 'Riverton Water and Power', dept: 'Riverton Water & Power, Business Accounts', urgent: true, routeOwn: true, ask: 'Please call Business Accounts back at the number in your directory today so we can restore the autopay.' }],
  'ben-urgent-2': [{ topic: 'community', org: 'the Riverton Fire Marshal\'s Office', dept: 'Riverton Fire Marshal\'s Office', urgent: true, ask: 'An inspector is on the way this afternoon. Can you confirm someone will be at the front desk until five?' },
    { topic: 'financial', org: 'Keystone Card Services', dept: 'Keystone Card Services, Corporate Cards', urgent: true, ask: 'We blocked a charge on the card ending in the four digits on file. Can you confirm whether anyone at Northwind made a purchase at Orchard Office Furniture today? Just yes or no.' }],
  'ben-calm-1': [{ topic: 'community', org: 'Brightway Parcel', dept: 'Brightway Parcel, Riverton Depot', ask: 'We have a delivery for 2200 Calder Way tomorrow morning. Can you confirm the front desk opens at eight?' },
    { topic: 'financial', org: 'Tallgrass Bank', dept: 'Tallgrass Bank, Business Services', ask: 'Your new deposit slips are ready. Would you like them mailed to the office, or picked up at the branch?' }],
  'ben-calm-2': [{ topic: 'financial', org: 'Ashby Mutual Insurance', dept: 'Ashby Mutual Insurance, Commercial', ask: 'We mailed the renewal packet last week. Could you confirm it arrived? Nothing else is needed.' },
    { topic: 'community', org: 'the Riverton Business Association', dept: 'Riverton Business Association', ask: 'We are confirming attendance for Thursday\'s breakfast. Is Northwind still planning to send someone?' }],
  'ben-calm-3': [{ topic: 'community', org: 'Calder Properties', dept: 'Calder Properties, Building Management', ask: 'The elevator inspection is Thursday morning. Can you confirm someone at the front desk can let the inspector in at nine?' },
    { topic: 'financial', org: 'Ashby Mutual Insurance', dept: 'Ashby Mutual Insurance, Commercial', ask: 'We updated Northwind\'s certificate of insurance. Could you confirm the office address on it is still 2200 Calder Way?' }]
};
const VOICE_BY_SLOT = { 'atk-calm-2': VOICES.V1, 'ben-calm-3': VOICES.V3, 'atk-calm-1': VOICES.V2, 'atk-calm-3': VOICES.V1, 'atk-urgent-1': VOICES.V4, 'atk-urgent-2': VOICES.V3, 'ben-urgent-1': VOICES.V3, 'ben-urgent-2': VOICES.V4, 'ben-calm-1': VOICES.V1, 'ben-calm-2': VOICES.V2 };

export const SHIFT_ITEMS = [], SHIFT_FORMS = { A: [], B: [] };
Object.entries(SLOTS).forEach(([slot, forms], n) => forms.forEach((s, f) => {
  const id = `call-${slot}-${'ab'[f]}`, isAttack = slot.startsWith('atk'), urgent = !!s.urgent;
  const spec = isAttack ? attack({ ...s, urgent, n: n % 5, voice: VOICE_BY_SLOT[slot] }) : benign({ ...s, urgent, n, voice: VOICE_BY_SLOT[slot] });
  SHIFT_ITEMS.push(callItem(id, { ...spec, placeholder: true }, { meta: { slot, structure: isAttack ? 'attack' : 'benign', surface: urgent ? 'urgent' : 'calm', topic: s.topic,
    askKind: s.askKind || 'none', placeholder: true } }));
  SHIFT_FORMS['AB'[f]].push(id);
}));
export const PLACEHOLDER_CALLS = SHIFT_ITEMS.length;
export const DIRECTORY_NUMBERS = DIRECTORY.map(d => d.number);
