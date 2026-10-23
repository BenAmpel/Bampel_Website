// Study 2 training modules A0-A4 (vishing-study-training-modules-draft.md, v2: about 5 minutes per arm, ~335 body
// words, matched within ±0.3%). Every arm has the same eight screens: a shared intro, an overview, four parts with
// two audio examples each, one exercise, and a summary that ends with the shared closing line. A1 is A0 word for word
// except one paragraph of the same length. Examples come only from the four training domains (Lakeview Health,
// StreamNest, Eastbrook College Registrar, Pinewave Wireless), never from the directory or a test-call pretext.
//
// Each screen is one item whose wording, clips and exercise vary by arm (variants), so assignment needs no code.
// Audio: the one study voice (world.mjs VOICE, through the V1-V4 slots), phone band; rendered by scripts/vishing-study2/render-audio.mjs from CLIP_JOBS below.
import { VOICES } from './world.mjs';

const AUDIO = '/lab/media/vishing-study2/training/';
const clip = (id, voice, tag, text, label) => ({ id, voice: VOICES[voice], tag, text, label });

const INTRO = 'Front-desk staff handle many calls in a day: requests from coworkers, vendors and customers, notices from service providers, and now and then a call that is not what it seems. This briefing takes about 5 minutes and has eight short screens. Please play each audio example to the end. The Continue button unlocks after a short minimum time. The examples come from organizations you will not deal with at Northwind, so treat them as illustrations. Afterwards you will answer four short questions.';
const CLOSING = 'That is the end of the briefing. Next you will answer four questions about it.';

const A0_SWAP = 'A front desk is often the first voice a caller hears. Callers form an impression of the whole organization in the first few seconds, from how quickly the phone is answered and how the greeting sounds. A consistent greeting, a steady pace and a clear closing make every caller\'s experience predictable, and they make the desk easier to cover when a colleague steps away. Small habits add up over a full shift.';
const A1_SWAP = 'Most calls a front desk receives from organizations are legitimate. Out of every 100 unexpected calls from a company or office, the large majority are routine: a reminder, a notice, a question about an account. Treating a legitimate call as a scam has real costs. A customer goes unserved, a colleague waits, a payment is delayed and the caller has to start again. Being careful is good; flagging every unfamiliar caller is not.';
const A0_OVERVIEW = 'Most workplace calls are routine: scheduling an appointment, confirming a detail, returning a voicemail. A clear call saves time for both people; an unclear one produces follow-up calls and delays. Call etiquette is a small set of habits that keep routine calls clear.';

// The practice directory for the exercises has only the four training organizations (never the shift's directory).
// Every arm's exercise ends with one lookup and call (R3.5), so A4 differs in what it says about looking a number up,
// not in having done it; A4's call is a verification, the others' are an ordinary call to a listed number.
const PRACTICE_DIRECTORY = [
  { name: 'Pinewave Wireless, Customer Care', dept: 'Phone carrier', number: '(800) 555-0171', greeting: 'Thanks for calling Pinewave Wireless. How can I help?' },
  { name: 'StreamNest Support', dept: 'Streaming service', number: '(800) 555-0172', greeting: 'StreamNest Support, how can I help?' },
  { name: 'Lakeview Health, Billing Office', dept: 'Hospital billing', number: '(800) 555-0173', greeting: 'Lakeview Health billing, how can I help?' },
  { name: 'Eastbrook College Registrar', dept: 'College', number: '(800) 555-0174', greeting: 'Registrar\'s office, how can I help?' }
].map((d, i) => ({ ...d, media: AUDIO + `dir-${i + 1}.mp3` }));
const dialTo = i => ({ directory: PRACTICE_DIRECTORY, target: PRACTICE_DIRECTORY[i].number, say: PRACTICE_DIRECTORY[i].greeting, media: PRACTICE_DIRECTORY[i].media });

// screens[arm] = [s2..s8]: { title, body, clips: [clip, clip], exercise? }
const A0 = [
  { title: 'Why call etiquette matters', body: A0_OVERVIEW + '\n\n' + A0_SWAP },
  { title: 'Greeting and purpose', body: 'Start with a greeting and your name, then state why you are calling in one sentence: "Good morning, this is Dana Reyes in scheduling. I\'m calling to confirm Thursday\'s appointment." Stating the purpose first lets the other person find the right information, and the call is usually shorter.',
    clips: [clip('a0-1', 'V1', 'warm, steady', 'Good morning, this is Dana Reyes with Lakeview Health scheduling. I\'m calling to confirm your appointment this Thursday at ten.'),
      clip('a0-2', 'V3', 'friendly', 'Hi, this is Marcus at the Eastbrook College Registrar. I\'m returning your call about the spring course calendar.')] },
  { title: 'Pace and tone', body: 'Speak at a steady pace, and slow down for numbers, spellings and names. Use a calm, friendly tone: a flat tone sounds uninterested, a rushed one sounds impatient, and listeners can hear a smile.',
    clips: [clip('a0-3', 'V2', 'slow on numbers', 'The confirmation number is four, seven, two, nine, one. Again, that\'s four, seven, two, nine, one.'),
      clip('a0-4', 'V4', 'calm, smiling', 'Thanks for holding. I\'ve got that in front of me now, so let\'s take it one step at a time.')] },
  { title: 'Transfers and messages', body: 'When you transfer a call, say who you are transferring the caller to and why, and stay on the line until that person answers. When you take a message, write down the name, time, reason and when they will try again, and read it back before you finish.',
    clips: [clip('a0-5', 'V1', 'helpful', 'I\'m going to transfer you to Jordan, who handles plan changes at Pinewave. I\'ll stay on until Jordan picks up.'),
      clip('a0-6', 'V3', 'careful', 'Let me read that back. Kim Alvarez, about the account update, called at two fifteen and will try again after four. Is that right?')] },
  { title: 'Scheduling and voicemail', body: 'Offer two or three specific times instead of asking "when are you free?", then repeat the date, time and place. Keep a voicemail under 30 seconds: your name, the reason, and when you will try again.',
    clips: [clip('a0-7', 'V2', 'upbeat', 'I have Tuesday at ten or Wednesday at two. Which works better for you?'),
      clip('a0-8', 'V4', 'clear', 'Hi Sam, it\'s Lee from StreamNest support, returning your call about the household plan. I\'ll try you again after one today; no need to call us back.')] },
  { title: 'Exercise: take a message', body: 'Play the voicemail and fill in the message slip: name, reason and when they will try again. Then call the Registrar from the practice directory.',
    clips: [clip('a0-x', 'V3', 'neutral', 'Hi, this is Robin Chen from the Eastbrook College Registrar. I\'m calling about the room booking for the March information session. I\'ll try again after one, so no need to call me back.', 'Voicemail')],
    ask: ['slip_name', 'slip_reason', 'slip_time'], practiceDial: dialTo(3) },
  { title: 'Summary', body: 'Clear calls follow a simple pattern: greet the person and give your name, state your purpose, keep a steady pace and a calm tone, offer specific options, repeat the details and confirm the next step.\n\n' + CLOSING }
];
const A1 = A0.map((s, i) => i === 0 ? { ...s, body: A0_OVERVIEW + '\n\n' + A1_SWAP } : s);

const A2 = [
  { title: 'What voice phishing is', body: 'Voice phishing is when criminals use phone calls to trick people into giving up sensitive information or money. Attackers may pretend to be a hospital billing office, a streaming service, a college office or your phone carrier. They may spoof caller ID, or pretend to be someone you know. Losses include stolen money, leaked customer data, reputational damage and fines. Experts point to four cues. Each of the next screens plays a malicious and a legitimate example.' },
  { title: 'Cue 1: urgency or pressure', body: 'Attackers create time pressure so you act before you think: deadlines in minutes, threats that something will happen "right now", demands to stay on the line, or a manager who is "waiting". Legitimate organizations rarely need an answer during the call, and they let you respond when it suits you.',
    clips: [clip('a2-1', 'V2', 'urgent', 'This is Pinewave Wireless. Your line will be shut off in the next ten minutes unless you confirm your account PIN right now.', 'Malicious example'),
      clip('a2-2', 'V1', 'calm, straightforward', 'This is Pinewave Wireless calling about some unusual activity on your account. Please call us back at the number on your bill whenever it\'s convenient.', 'Legitimate example')] },
  { title: 'Cue 2: requests for sensitive data', body: 'Attackers ask for what unlocks an account: passwords, PINs and one-time codes, sometimes after small pieces such as a date of birth. Legitimate organizations already hold what they need, and they say plainly that they will never ask for these by phone.',
    clips: [clip('a2-3', 'V4', 'urgent', 'I just need your password and the code we texted you to verify your StreamNest account.', 'Malicious example'),
      clip('a2-4', 'V3', 'calm, straightforward', 'StreamNest will never ask for your password or your verification code over the phone.', 'Legitimate example')] },
  { title: 'Cue 3: tone and prosody', body: 'Listen to how the caller sounds against what they are saying. An emotion that does not fit the message, such as cheerfulness about fraud, is a warning sign, and so is a tone that swings without reason. Legitimate callers sound even and attentive.',
    clips: [clip('a2-5', 'V2', 'laughs, happy', 'Hi there! I\'m so excited to tell you your Lakeview Health account is being sent to collections for fraud!', 'Malicious example (mismatched emotion)'),
      clip('a2-6', 'V1', 'calm', 'This is the Lakeview Health billing office. We\'re mailing you a statement for your recent visit. Please follow the instructions in the letter.', 'Legitimate example')] },
  { title: 'Cue 4: scare tactics', body: 'Attackers threaten arrest, cancellation or legal action, and offer a single way out that only they control: pay now, or read the code now. Legitimate organizations send formal notices in writing and never demand payment on the spot.',
    clips: [clip('a2-7', 'V4', 'very serious', 'If you don\'t pay this fee immediately, your enrollment will be cancelled and your transcript will be withheld.', 'Malicious example'),
      clip('a2-8', 'V3', 'calm', 'This is the Eastbrook College Registrar. We send all official notices in writing. We will never demand immediate payment over the phone.', 'Legitimate example')] },
  { title: 'Exercise: spot the cues', body: 'Play the call, then tick every cue you heard: urgency, a request for sensitive data, odd tone, scare tactics or none. Then find Pinewave in the practice directory and call it.',
    clips: [clip('a2-x', 'V2', 'urgent, stern', 'This is Pinewave security. Your number is being moved to another phone in five minutes. Read me the code we just sent or you\'ll lose service permanently.', 'Practice call')],
    ask: ['cue_tick'], practiceDial: dialTo(0) },
  { title: 'Summary', body: 'Four cues signal a voice phishing call: urgency or pressure, requests for sensitive data, odd tone or prosody, and scare tactics. No single cue proves a call is malicious, but the more cues a call shows, the more careful you should be. When you hear them, slow down, share nothing and contact the organization through a number you already trust.\n\n' + CLOSING }
];

const A3 = [
  { title: 'What a legitimate call sounds like', body: 'Calls that reach a front desk from real organizations doing ordinary business follow a familiar pattern: a billing office with a question, a service provider with a notice, a school office confirming a detail. Knowing the pattern makes these calls quicker to handle, and makes it easier to notice a call that does not fit. Each of the next screens describes one feature and plays two legitimate examples.' },
  { title: 'Feature 1: a clear identity and an existing relationship', body: 'Legitimate callers give their name, organization and department, and say why they are calling you in particular. They refer to a relationship you already have, and they use details they already hold, such as a date of service or the last four digits of an account, instead of asking you for them.',
    clips: [clip('a3-1', 'V1', 'calm, professional', 'Hi, this is Dana in the Lakeview Health billing office. I\'m calling about the statement for your visit on March third, the account ending in four one two.', 'Example'),
      clip('a3-2', 'V3', 'friendly', 'Hello, this is Marcus from the Eastbrook College Registrar, calling about your transcript request from last Tuesday.', 'Example')] },
  { title: 'Feature 2: an unhurried pace', body: 'Legitimate callers speak evenly, leave room for questions and give you time: "no rush", "whenever it\'s convenient". A real organization\'s process does not depend on what you do in the next few minutes, so if you ask them to wait, they wait.',
    clips: [clip('a3-3', 'V2', 'relaxed', 'This is Pinewave Wireless. Your upgrade is ready. There\'s no rush, so whenever it suits you, just let us know which day works.', 'Example'),
      clip('a3-4', 'V4', 'even', 'Hi, it\'s StreamNest support. I can walk you through the plan options now or call back later this week, whichever you prefer.', 'Example')] },
  { title: 'Feature 3: a clear purpose and stated limits', body: 'They say what the call is about in a sentence or two, and what they need is usually small and expected: a statement, a renewal, a reminder. Many say up front what they will never ask for, such as your password or full card number.',
    clips: [clip('a3-5', 'V3', 'calm, straightforward', 'I\'m calling to confirm that your new SIM card arrived. Pinewave will never ask for your password or full card number over the phone.', 'Example'),
      clip('a3-6', 'V1', 'calm', 'This is a courtesy call from Lakeview Health. Your statement is ready in the patient portal. Nothing is due today.', 'Example')] },
  { title: 'Feature 4: official follow-up', body: 'They point you to the organization\'s usual channels: a letter, the app or portal, or the main number on your bill. They are comfortable with you dealing with it later, in writing or through those channels, because the records will still be there.',
    clips: [clip('a3-7', 'V2', 'calm', 'This is the Eastbrook College Registrar. We\'ve mailed you the official notice. Please follow the instructions in the letter.', 'Example'),
      clip('a3-8', 'V4', 'friendly', 'This is StreamNest. If you have any questions about the change, the number on your monthly statement reaches our support team.', 'Example')] },
  { title: 'Exercise: hear the pattern', body: 'Play the call, then tick every feature you heard: identity and relationship, unhurried pace, clear purpose and stated limits, official follow-up. Then call Lakeview Health from the practice directory.',
    clips: [clip('a3-x', 'V3', 'calm, professional', 'Hi, this is Robin at the Lakeview Health billing office about your visit on the twelfth. There\'s a small balance, but nothing is due today, and we never take card numbers by phone. You\'ll get a statement in the mail.', 'Practice call')],
    ask: ['feature_tick'], practiceDial: dialTo(2) },
  { title: 'Summary', body: 'A typical legitimate call from an organization has four features: a clear identity and an existing relationship, an unhurried pace, a clear purpose with stated limits, and official follow-up. Each feature on its own is common; together they describe how ordinary institutional calls tend to sound. The more of them a call has, the more it sounds like ordinary business.\n\n' + CLOSING }
];

const A4X = clip('a4-x', 'V1', 'calm', 'Thanks for calling Pinewave Wireless. I don\'t see any call from us to you today, and we never ask customers to read back codes. Thanks for checking with us.', 'Pinewave answers');
const A4 = [
  { title: 'Four questions for any call that asks for something', body: 'A caller\'s tone tells you little: a calm, polite caller can be a criminal, and an urgent one can be a real fraud team. Caller ID can show any number. What a caller cannot change is the structure of what they want. Before you act on any call that asks you to do something, ask four questions:\n\n1. Who started this contact?\n2. What am I being asked to do?\n3. Through whose channel?\n4. Can I verify myself first?' },
  { title: 'Question 1: who started this contact?', body: 'If you looked the organization up and called it, you started the contact. If they called you, or you dialed a number someone gave you in a call, text or email, the caller started it, even when caller ID shows a familiar number.',
    clips: [clip('a4-1', 'V2', 'pleasant', 'Hi, this is StreamNest. We\'re calling about a problem with your household plan.', 'The caller started it'),
      clip('a4-2', 'V4', 'neutral', 'Thank you for calling StreamNest support, the number you found in your account settings. How can I help?', 'You started it')] },
  { title: 'Question 2: what am I being asked to do?', body: 'Listen for any action: giving information (even "confirming" a date of birth, an account number or a code), paying, granting access or calling a number they give you. A call that asks for nothing is informational. Small, helpful-sounding requests are still actions.',
    clips: [clip('a4-3', 'V1', 'calm', 'This is Lakeview Health billing. Your statement is ready in the patient portal. No action is needed on this call.', 'Asks nothing'),
      clip('a4-4', 'V3', 'calm', 'This is Lakeview Health billing. Before we go on, could you confirm your date of birth and the policy number on your insurance card?', 'Asks something')] },
  { title: 'Question 3: through whose channel?', body: 'If the action runs through a channel the caller controls, such as this call, a number or link they give you, or a code they want read back, the caller controls the outcome. If it runs through your own channel, such as the official app, the number on your bill or a letter, you can act safely.',
    clips: [clip('a4-5', 'V2', 'calm, friendly', 'This is Pinewave Wireless. To keep your number safe, please read me the six-digit code we just texted you.', 'Their channel'),
      clip('a4-6', 'V1', 'calm', 'This is Pinewave Wireless. When you have a moment, please open the Pinewave app and approve the change there.', 'Your channel')] },
  { title: 'Question 4: can I verify myself first?', body: 'You can almost always end the call, look the organization up yourself in a directory or on your card or bill, and call back. Never use a number the caller gives you. Real organizations accept this. A caller who resists is giving you the answer.',
    clips: [clip('a4-7', 'V3', 'calm', 'Of course. Please call the Registrar\'s main line from the college website, and they\'ll have this on file.', 'Accepts verification'),
      clip('a4-8', 'V4', 'calm, persistent', 'You could, but this has to be done during this call. I\'ll give you my direct line instead: five five five, zero one nine eight.', 'Resists verification')] },
  { title: 'Exercise: look it up and call back', body: 'A caller claiming to be Pinewave Wireless asked you to read back a code. Search the practice directory, call the number listed there and hear what the company says. Do not use any number the caller gave you.',
    practiceDial: { directory: PRACTICE_DIRECTORY, target: '(800) 555-0171', say: A4X.text, media: AUDIO + 'a4-x.mp3' } },
  { title: 'Summary', body: 'If a caller started the contact and wants an action through their own channel, do not act during the call. Look the organization up yourself and call back. Tone, politeness and caller ID do not change the answer.\n\n' + CLOSING }
];

export const ARMS = { a0: A0, a1: A1, a2: A2, a3: A3, a4: A4 };
const words = s => (String(s).match(/[A-Za-z0-9']+/g) || []).length;
// Minimum time on a screen: reading at 200 words a minute (clips are gated separately: each must play to the end).
const dwell = s => Math.max(8, Math.round(words(s) / 200 * 60));

const screenItem = (n, perArm) => {
  const base = perArm.a0;
  const v = arm => {
    const s = perArm[arm];
    return { title: s.title, body: s.body, minSeconds: dwell(s.body), clips: (s.clips || []).map(c => ({ label: c.label || 'Example', media: AUDIO + c.id + '.mp3', transcript: c.text })),
      ask: s.ask || 'none', practiceDial: s.practiceDial || null };
  };
  return { id: `train-${n}`, title: base.title, kind: 'text', body: base.body, media: '', mediaAlt: '', transcript: '', decide: false, ask: 'none',
    meta: { block: 'training', screen: n }, variants: Object.fromEntries(Object.keys(perArm).map(a => [a, v(a)])) };
};

export const TRAINING_ITEMS = [
  { id: 'train-1', title: 'Before your shift: a short briefing', kind: 'text', body: INTRO, minSeconds: 15, media: '', mediaAlt: '', transcript: '', decide: false, ask: 'none', variants: {}, meta: { block: 'training', screen: 1 } },
  ...[0, 1, 2, 3, 4, 5, 6].map(i => screenItem(i + 2, Object.fromEntries(Object.entries(ARMS).map(([a, s]) => [a, s[i]]))))
];

// Exercise answers (asked only on that arm's exercise screen) and the arm-keyed knowledge checks.
const q = (id, text, type, extra = {}) => ({ id, text, type, required: true, showIf: 'always', conditions: [], ...extra });
const ch = (id, text, opts, conds) => q(id, text, 'choice', { options: opts.map(([value, label]) => ({ value, label })), conditions: conds });
export const TRAINING_QUESTIONS = [
  q('slip_name', 'Message slip: caller\'s name', 'text', { conditions: ['a0', 'a1'] }),
  q('slip_reason', 'Message slip: reason for the call', 'text', { conditions: ['a0', 'a1'] }),
  q('slip_time', 'Message slip: when they will try again', 'text', { conditions: ['a0', 'a1'] }),
  q('cue_tick', 'Which cues did you hear? Tick every one.', 'multi', { conditions: ['a2'], options: [['urgency', 'Urgency or pressure'], ['data', 'A request for sensitive data'], ['tone', 'Odd tone'], ['scare', 'Scare tactics'], ['none', 'None']].map(([value, label]) => ({ value, label })) }),
  q('feature_tick', 'Which features did you hear? Tick every one.', 'multi', { conditions: ['a3'], options: [['identity', 'A clear identity and relationship'], ['pace', 'An unhurried pace'], ['purpose', 'A clear purpose and stated limits'], ['followup', 'Official follow-up']].map(([value, label]) => ({ value, label })) }),
  // knowledge checks (4 per arm; the correct option is first here and shuffled on screen by the order below)
  ch('kc_e1', 'What should a caller state right after the greeting?', [['time', 'The time the call will end'], ['purpose', 'The purpose of the call'], ['title', 'Their job title'], ['account', 'The other person\'s account number']], ['a0', 'a1']),
  ch('kc_e2', 'When scheduling, the briefing recommended…', [['ask', 'asking when the other person is free'], ['email', 'sending options by email first'], ['options', 'offering two or three specific times'], ['one', 'proposing one time and waiting']], ['a0', 'a1']),
  ch('kc_e3', 'A voicemail should be…', [['two', 'about two minutes'], ['needed', 'as long as needed'], ['number', 'only a phone number'], ['under30', 'under 30 seconds']], ['a0', 'a1']),
  ch('kc_e4', 'When taking a message, what should you do before ending the call?', [['transfer', 'Transfer the caller'], ['readback', 'Read the details back'], ['email', 'Ask for an email address'], ['promise', 'Promise a callback within an hour']], ['a0']),
  ch('kc_b4', 'According to the briefing, what is true of unexpected calls from organizations?', [['half', 'About half are scams'], ['refuse', 'Most are scams and should be refused'], ['legit', 'Most are legitimate, and flagging them has costs'], ['manager', 'They should always be transferred to a manager']], ['a1']),
  ch('kc_c1', 'A caller says your service will be cut off "in ten minutes" unless you act now. Which cue is this?', [['tone', 'Tone and prosody'], ['urgency', 'Urgency or pressure'], ['legit', 'A legitimate notice'], ['none', 'None of the cues']], ['a2']),
  ch('kc_c2', 'Which request did the briefing say legitimate organizations never make by phone?', [['name', 'Your name'], ['time', 'The best time to call back'], ['code', 'Your one-time verification code'], ['letter', 'Whether you received a letter']], ['a2']),
  ch('kc_c3', 'A caller sounds cheerful while reporting fraud on your account. Which cue is this?', [['scare', 'Scare tactics'], ['data', 'Requests for sensitive data'], ['none', 'None of the cues'], ['tone', 'Tone and prosody']], ['a2']),
  ch('kc_c4', 'How do legitimate organizations usually deliver formal notices?', [['urgent', 'By an urgent call'], ['writing', 'In writing'], ['text', 'By text with a link'], ['payment', 'Through a caller who asks for payment']], ['a2']),
  ch('kc_t1', 'What do legitimate callers typically use to identify your account?', [['password', 'Your password'], ['held', 'Details they already hold, such as a date of service'], ['code', 'A code they send you'], ['card', 'Your full card number']], ['a3']),
  ch('kc_t2', 'Which phrase is typical of a legitimate call\'s pace?', [['ten', '"In the next ten minutes"'], ['stay', '"Stay on the line"'], ['convenient', '"Whenever it\'s convenient"'], ['before', '"Before the end of this call"']], ['a3']),
  ch('kc_t3', 'What do many legitimate callers state up front?', [['address', 'Their home address'], ['deadline', 'A deadline for payment'], ['direct', 'A direct number to call them back on'], ['never', 'What they will never ask for']], ['a3']),
  ch('kc_t4', 'Where do legitimate callers usually point you for follow-up?', [['read', 'A number they read out on the call'], ['official', 'A letter, the app or portal, or the number on your bill'], ['link', 'A text message link'], ['colleague', 'A colleague they transfer you to']], ['a3']),
  ch('kc_s1', 'A calm, friendly caller asks you to read back a code they texted you. Which question shows the problem?', [['urgent', 'Did the caller sound urgent?'], ['polite', 'Was the caller polite?'], ['channel', 'Through whose channel?'], ['id', 'Did the caller ID match?']], ['a4']),
  ch('kc_s2', 'When you call back to verify, which number should you use?', [['direct', 'The direct line the caller gives you'], ['lookup', 'One you look up yourself, such as in the directory'], ['callerid', 'The number shown on caller ID'], ['confirmed', 'Any number the caller confirms is official']], ['a4']),
  ch('kc_s3', 'A caller says your statement is ready in the portal and asks for nothing. According to the briefing, this call is…', [['attack', 'an attack because it was unexpected'], ['report', 'something to report immediately'], ['info', 'informational; no action is needed'], ['channel', 'a request through the caller\'s channel']], ['a4']),
  ch('kc_s4', 'A caller says verifying "has to happen during this call". What does the briefing say this tells you?', [['urgent', 'The call is urgent and real'], ['faster', 'You should verify faster'], ['nothing', 'Nothing, because tone does not matter'], ['warning', 'It is a warning sign: real organizations accept a callback']], ['a4'])
];
export const KC_KEY = { kc_e1: 'purpose', kc_e2: 'options', kc_e3: 'under30', kc_e4: 'readback', kc_b4: 'legit', kc_c1: 'urgency', kc_c2: 'code', kc_c3: 'tone', kc_c4: 'writing',
  kc_t1: 'held', kc_t2: 'convenient', kc_t3: 'never', kc_t4: 'official', kc_s1: 'channel', kc_s2: 'lookup', kc_s3: 'info', kc_s4: 'warning' };

// Every training clip to render (render-audio.mjs).
export const CLIP_JOBS = Object.values(ARMS).flat().flatMap(s => s.clips || []).concat([A4X])
  .filter((c, i, all) => all.findIndex(x => x.id === c.id) === i)
  .map(c => ({ file: `training/${c.id}.mp3`, text: c.text, voice: c.voice, phone: true }))
  .concat(PRACTICE_DIRECTORY.map((d, i) => ({ file: `training/dir-${i + 1}.mp3`, text: d.greeting, voice: VOICES.V1, phone: true })));
