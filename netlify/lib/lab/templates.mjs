// CCAIR Behavioral Lab: study templates for the "Start a new study" gallery in the lab console.
// A template is a study type plus starting content. A study created from one keeps the template's ID in its
// registry entry, and registry.typeFor() uses the template's content as the study's defaults until the first
// save on its admin page, exactly like a built-in study's seed. Every template passes content validation
// (tests/lab/templates.test.mjs), so a new study can be previewed the moment it is created.
//
// The sample clips and images live in static/lab/media/samples/ (made with scripts/lab-samples.sh).

import { VISHING_STUDY2 } from './studies/vishing-study2.mjs';
import { ARGOS_SMISHING } from './studies/argos-smishing.mjs';

const S = '/lab/media/samples/';
const AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
const SUSP7 = ['Not at all suspicious', 'Slightly suspicious', 'Somewhat suspicious', 'Moderately suspicious', 'Quite suspicious', 'Very suspicious', 'Extremely suspicious'];
const q = (id, text, type, extra = {}) => ({ id, text, type, required: false, showIf: 'always', conditions: [], ...extra });
const scale7 = (id, text, labels = AGREE7, extra = {}) => q(id, text, 'scale', { n: 7, lo: labels[0], hi: labels[6], labels, ...extra });
const choice = (id, text, opts, extra = {}) => q(id, text, 'choice', { options: opts.map(o => Array.isArray(o) ? { value: o[0], label: o[1] } : { value: o, label: o }), ...extra });
const textItem = (id, title, body, extra = {}) => ({ id, title, kind: 'text', body, media: '', mediaAlt: '', transcript: '', decide: false, ask: 'none', variants: {}, ...extra });
const audioItem = (id, title, file, transcript, extra = {}) => ({ id, title, kind: 'audio', body: 'Listen to this voicemail.', media: S + file, mediaAlt: '', transcript, mustFinish: true, maxPlays: 2, decide: true, ask: 'all', variants: {}, ...extra });
const DEMOGRAPHICS = [
  q('age', 'How old are you?', 'number', { min: 18, max: 99 }),
  choice('gender', 'What is your gender?', [['woman', 'Woman'], ['man', 'Man'], ['nonbinary', 'Non-binary'], ['self', 'Prefer to self-describe'], ['na', 'Prefer not to say']]),
  choice('vish_before', 'Have you ever received a phone call that you think was a scam?', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']])
];
const RECORDING = { enabled: true, required: false, label: 'I agree to have my voice recorded during the phone calls in this study. Recordings are stored securely, used only by the research team, and deleted on the schedule the IRB approved.' };
const CALL_ACCEPT = [{ value: 'legitimate', label: 'Legitimate' }, { value: 'suspicious', label: 'Suspicious' }, { value: 'report', label: 'Report to security' }];
const AVR = [{ value: 'accept', label: 'Accept the request' }, { value: 'verify', label: 'Verify first' }, { value: 'refuse', label: 'Refuse' }];
const DIRECTORY = [
  { name: 'Harborview Bank, card services (number on the back of your card)', number: '800-555-0100', greeting: '' },
  { name: 'Contoso Pharmacy', number: '800-555-0177', greeting: '' },
  { name: 'University IT Help Desk', number: '404-555-0123', greeting: '' }
];

const bankAttack = {
  id: 'call-bank-fraud', title: 'Incoming call', kind: 'call', body: '', media: '', mediaAlt: '', transcript: '', decide: true, decisionPrompt: 'How would you describe that call?', decisionOptions: CALL_ACCEPT, ask: 'all', variants: {},
  call: { caller: 'Harborview Bank', number: '800-555-0100', callbackNumber: '800-555-0100', intent: 'attack', maxTurns: 8, ringSeconds: 30,
    persona: 'Alex, a calm and polite fraud prevention agent at Harborview Bank, in a call center. Speaks plainly and briefly.', script: {} }
};
const pharmacyBenign = {
  id: 'call-pharmacy', title: 'Incoming call', kind: 'call', body: '', media: '', mediaAlt: '', transcript: '', decide: true, decisionPrompt: 'How would you describe that call?', decisionOptions: CALL_ACCEPT, ask: 'all', variants: {},
  call: { caller: 'Contoso Pharmacy', number: '800-555-0177', callbackNumber: '800-555-0177', intent: 'benign', maxTurns: 6, ringSeconds: 30,
    persona: 'Jordan, a friendly pharmacy technician at Contoso Pharmacy.', script: {
      opener: 'Hi, this is Jordan from Contoso Pharmacy. Do you have a minute?',
      pretext: 'Your prescription refill is ready, and we noticed your insurance on file has changed for the new year.',
      ask: 'Could you tell me which insurance company you have now? Just the company name is fine.',
      pressure1: 'No worries. You can also bring your card in when you pick up your refill.',
      pressure2: 'Thanks. We will hold the refill for you for seven days.',
      deflect: 'Of course. You can call the pharmacy at the number on your prescription label and ask for the pharmacy team.',
      closeComply: 'Perfect, thank you. Your refill will be ready this afternoon.',
      closeRefuse: 'That is fine. Just bring your card when you come in. Bye now.',
      close: 'Thanks, have a nice day.',
      callback: 'Contoso Pharmacy, this is the pharmacy team. Yes, we did call you about your refill and your insurance details.'
    } }
};

const VOICEMAILS = [
  audioItem('vm-bank', 'Voicemail 1', 'voicemail-bank.mp3', 'Hi, this is Harborview Bank fraud prevention. We blocked a suspicious payment on your card. Please call us back right away at 800 555 0199 and have your card ready so we can verify you.'),
  audioItem('vm-it', 'Voicemail 2', 'voicemail-it.mp3', 'Hey, it is Chris from the IT help desk. We are migrating mailboxes tonight, and yours failed. Call me back at extension 4471 with your login so I can move it over before the morning.'),
  audioItem('vm-pharmacy', 'Voicemail 3', 'voicemail-pharmacy.mp3', 'Hello, this is Contoso Pharmacy with a reminder that your prescription is ready for pickup. Our hours are nine to seven. No need to call back.'),
  audioItem('vm-dentist', 'Voicemail 4', 'voicemail-dentist.mp3', 'Hi, this is Bright Smile Dental confirming your cleaning on Thursday at ten. If you need to reschedule, call the office at the number on our website.')
];

export const TEMPLATES = {
  survey: {
    name: 'Survey', icon: 'survey', type: 'vignettes', minutes: 5,
    blurb: 'A questionnaire with rating scales, multiple choice, and open answers. Add display logic and pages, or import one from Qualtrics.',
    content: () => ({
      minutesPerSession: 5,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: false, randomize: false, sessions: [{ items: [] }] },
      items: [], questions: [],
      survey: {
        pre: [
          q('intro', 'Thank you for taking part. This short survey asks about how you handle security at work and at home. There are no right or wrong answers.', 'info', { sessions: [1] }),
          scale7('sec_important', 'Keeping my accounts secure is important to me.', AGREE7, { sessions: [1], page: 1 }),
          scale7('sec_confident', 'I am confident I could spot a scam phone call.', AGREE7, { sessions: [1], page: 1 }),
          choice('mfa', 'Do you use two-step verification on your email?', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'I am not sure']], { sessions: [1], page: 2, required: true }),
          q('mfa_why', 'What stops you from using it?', 'text', { sessions: [1], page: 2, displayIf: { q: 'mfa', op: 'eq', value: 'no' } }),
          ...DEMOGRAPHICS.map(x => ({ ...x, sessions: [1], page: 3 }))
        ],
        post: []
      }
    })
  },

  'ab-test': {
    name: 'A/B or multi-arm experiment', icon: 'split', type: 'vignettes', minutes: 8,
    blurb: 'Randomly assign people to conditions (balanced), show each condition different wording, and compare their answers.',
    content: () => ({
      minutesPerSession: 8,
      design: { conditions: [{ id: 'control', label: 'No warning (control)' }, { id: 'warning', label: 'Warning banner' }], practice: false, randomize: true, sessions: [{ items: ['email-invoice', 'email-hr'] }] },
      items: [
        { id: 'email-invoice', title: 'Invoice email', kind: 'email', from: 'Accounts Payable <billing@contoso-payments.example>', subject: 'Overdue invoice #44821', image: '', imageAlt: '',
          body: 'Hello,\n\nOur records show invoice #44821 is 14 days overdue. Please [review and pay the invoice](https://contoso-payments.example/inv/44821) today to avoid a late fee.\n\nAccounts Payable',
          variants: { warning: { body: '⚠ CAUTION: This email came from outside your organization. Do not click links unless you recognize the sender.\n\nHello,\n\nOur records show invoice #44821 is 14 days overdue. Please [review and pay the invoice](https://contoso-payments.example/inv/44821) today to avoid a late fee.\n\nAccounts Payable' } } },
        { id: 'email-hr', title: 'Benefits email', kind: 'email', from: 'HR Benefits <benefits@yourcompany.example>', subject: 'Open enrollment closes Friday', image: '', imageAlt: '',
          body: 'Hi all,\n\nOpen enrollment for next year\'s benefits closes this Friday. Review your choices on the [benefits portal](https://benefits.yourcompany.example).\n\nThanks,\nHR', variants: {} }
      ],
      practice: { id: 'practice', title: 'Practice', kind: 'text', from: '', subject: '', body: 'A coworker asks to borrow your stapler for a meeting.', image: '', imageAlt: '', variants: {} },
      questions: [
        scale7('suspicion', 'How suspicious is this email?', SUSP7, { required: true }),
        choice('action', 'What would you do next?', [['click', 'Click the link'], ['verify', 'Check another way first'], ['report', 'Report it'], ['ignore', 'Ignore it']], { required: true }),
        q('confidence', 'How confident are you in that choice?', 'confidence', { required: true })
      ],
      survey: { pre: [], post: [choice('noticed_banner', 'Did any email show a warning banner?', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], { sessions: [] })] }
    })
  },

  'audio-judgments': {
    name: 'Audio clip judgments', icon: 'audio', type: 'multimodal', minutes: 10,
    blurb: 'Play voicemails or other clips (heard to the end, limited replays), then a mouse-tracked accept / verify / refuse decision and a confidence rating.',
    content: () => ({
      minutesPerSession: 10,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: true, sessions: [{ blocks: [{ title: 'Voicemails', items: VOICEMAILS.map(v => v.id), randomize: true }] }] },
      decision: { prompt: 'This message asks you to do something. What would you do?', options: AVR, mouseTracking: true },
      directory: [], items: VOICEMAILS,
      practice: textItem('practice', 'Practice', 'A message from a coworker says: "Can you send me the slides from this morning\'s meeting?"', { decide: true }),
      questions: [q('confidence', 'How confident are you in that decision?', 'confidence', { required: true }), scale7('suspicion', 'How suspicious was the message?', SUSP7)],
      survey: { pre: [], post: DEMOGRAPHICS.map(x => ({ ...x, sessions: [] })) }
    })
  },

  'voice-call': {
    name: 'Conversation with an AI voice caller', icon: 'phone', type: 'multimodal', minutes: 12,
    blurb: 'A softphone rings with a caller ID. Participants answer and talk to a scripted AI caller (spoken or typed), can hang up or call back a number from a directory, then rate the call. Audio is recorded with consent.',
    content: () => ({
      minutesPerSession: 12,
      consent: { recording: { ...RECORDING } },
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: false, sessions: [{ blocks: [
        { title: 'Before the calls', items: ['call-intro'], randomize: false },
        { title: 'Calls', items: ['call-bank-fraud', 'call-pharmacy'], randomize: true }] }] },
      decision: { prompt: 'How would you describe that call?', options: CALL_ACCEPT, mouseTracking: false },
      directory: DIRECTORY,
      items: [
        textItem('call-intro', 'You are about to get some calls', 'Imagine this is your own phone on a normal workday. When it rings, answer (or not) as you usually would and talk as you normally would. You can hang up at any time, and you can look up a number in the phone directory and call it.\n\nIf you cannot speak right now, you can type what you would say instead.'),
        bankAttack, pharmacyBenign
      ],
      practice: null,
      questions: [q('confidence', 'How confident are you?', 'confidence', { required: true }), q('why', 'What made you decide that? (optional)', 'text')],
      survey: { pre: [], post: [scale7('realistic', 'The calls felt realistic.', AGREE7, { sessions: [] }), ...DEMOGRAPHICS.map(x => ({ ...x, sessions: [] }))] }
    })
  },

  'image-video': {
    name: 'Image and video ratings', icon: 'image', type: 'multimodal', minutes: 6,
    blurb: 'Show pictures and short videos, with an accessible description and optional captions, and collect ratings for each.',
    content: () => ({
      minutesPerSession: 6,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: false, sessions: [{ blocks: [{ title: 'Stimuli', items: ['img-login', 'vid-cfo'], randomize: true }] }] },
      decision: { prompt: 'Would you trust this?', options: [{ value: 'trust', label: 'Trust it' }, { value: 'distrust', label: 'Do not trust it' }], mouseTracking: false },
      directory: [],
      items: [
        { id: 'img-login', title: 'A sign-in page', kind: 'image', body: 'You followed a link in an email and reached this page.', media: S + 'login-page.png', mediaAlt: 'A sign-in page titled "Contoso 365" asking for an email address and password, at the address contos0-login.example (with a zero in place of the o).', transcript: '', decide: true, ask: ['trust', 'why'], variants: {} },
        { id: 'vid-cfo', title: 'A video message', kind: 'video', body: 'This video was posted in your team\'s chat.', media: S + 'video-cfo.mp4', mediaAlt: 'A short video message from someone introducing themselves as the company\'s chief financial officer.', transcript: 'Hi team, it is Dana, your CFO. I need a favor before the end of the day: please process a wire to our new supplier. Details are in the email I just sent. Thanks.', mustFinish: false, maxPlays: 0, decide: true, ask: ['trust', 'why'], variants: {} }
      ],
      practice: null,
      questions: [scale7('trust', 'How trustworthy does this look?', ['Not at all', 'Slightly', 'Somewhat', 'Moderately', 'Quite', 'Very', 'Completely'], { required: true }), q('why', 'What did you notice? (optional)', 'text')],
      survey: { pre: [], post: [] }
    })
  },

  'mouse-tracking': {
    name: 'Mouse-tracking decision task', icon: 'cursor', type: 'multimodal', minutes: 5,
    blurb: 'Quick two-choice judgments with the classic layout (Start at the bottom, answers in the top corners). Exports MAD, AUC, x-flips, and timing for each decision.',
    content: () => ({
      minutesPerSession: 5,
      design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: true, sessions: [{ blocks: [{ title: 'Links', items: ['url-1', 'url-2', 'url-3', 'url-4', 'url-5', 'url-6'], randomize: true }] }] },
      decision: { prompt: 'Is this link safe to open?', options: [{ value: 'safe', label: 'Safe' }, { value: 'phishing', label: 'Phishing' }], mouseTracking: true },
      directory: [],
      items: [
        ['url-1', 'https://accounts.google.com/signin'], ['url-2', 'https://paypa1.com/account/verify'], ['url-3', 'https://www.irs.gov/refunds'],
        ['url-4', 'https://microsoft-support.help-desk.example/reset'], ['url-5', 'https://github.com/login'], ['url-6', 'https://amaz0n-orders.example/track']
      ].map(([id, url], i) => textItem(id, 'Link ' + (i + 1), url, { decide: true, ask: 'none' })),
      practice: textItem('practice', 'Practice', 'https://www.wikipedia.org', { decide: true, ask: 'none' }),
      questions: [],
      survey: { pre: [], post: [] }
    })
  },

  'vishing-training': {
    name: 'Vishing training experiment (5 arms)', icon: 'shield', type: 'multimodal', minutes: 25,
    blurb: 'The ISR design: five randomized training arms, passive voicemail judgments with accept / verify / refuse and mouse tracking, then live softphone calls with an AI caller and a directory for callbacks.',
    content: () => ({
      minutesPerSession: 25,
      consent: { recording: { ...RECORDING } },
      design: {
        conditions: [
          { id: 'a0', label: 'A0: No training (control)' }, { id: 'a1', label: 'A1: Generic awareness' }, { id: 'a2', label: 'A2: Structural cue training' },
          { id: 'a3', label: 'A3: One-paragraph rule' }, { id: 'a4', label: 'A4: Training plus verification habit' }
        ],
        practice: true,
        sessions: [{ blocks: [
          { title: 'Training', items: ['training'], randomize: false },
          { title: 'Voicemails (passive)', items: VOICEMAILS.map(v => v.id), randomize: true },
          { title: 'Before the calls', items: ['call-intro'], randomize: false },
          { title: 'Calls (softphone)', items: ['call-bank-fraud', 'call-pharmacy'], randomize: true }
        ] }]
      },
      decision: { prompt: 'This message asks you to do something. What would you do?', options: AVR, mouseTracking: true },
      directory: DIRECTORY,
      items: [
        textItem('training', 'Before you begin', 'Please read the following page about your work phone.\n\nYour organization uses a standard phone system. Calls can come from colleagues, customers, and outside organizations.', {
          variants: {
            a1: { body: 'Scammers often call pretending to be from banks, IT, or delivery companies. Be careful with unexpected calls, and do not share passwords or codes over the phone.' },
            a2: { body: 'Scam calls tend to share a structure, whatever the topic:\n\n1. An urgent problem you did not know about.\n2. A request for something only you have: a code, a password, a payment.\n3. Pressure to act now, on this call.\n\nA legitimate call can be about money or accounts too. What matters is whether the caller asks you for a secret or for an action on the spot.' },
            a3: { body: 'One rule: if a caller asks for a code, a password, or a payment, hang up and call the organization back on a number you looked up yourself.' },
            a4: { body: 'Scam calls tend to share a structure, whatever the topic:\n\n1. An urgent problem you did not know about.\n2. A request for something only you have: a code, a password, a payment.\n3. Pressure to act now, on this call.\n\nWhen you are unsure, verify: hang up, open the phone directory on your screen, and call the organization back on its listed number. It takes a minute, and a real organization will always understand.' }
          }
        }),
        ...VOICEMAILS,
        textItem('call-intro', 'Your phone is about to ring', 'For the next part, imagine this is your own work phone. Answer (or not) as you usually would, and talk as you normally would. You can hang up at any time and use the phone directory to call any listed number.\n\nIf you cannot speak right now, type what you would say instead.'),
        bankAttack, pharmacyBenign
      ],
      practice: textItem('practice', 'Practice', 'A message from a coworker says: "Can you send me the slides from this morning\'s meeting?"', { decide: true }),
      questions: [q('confidence', 'How confident are you in that decision?', 'confidence', { required: true })],
      survey: {
        pre: [],
        post: [
          choice('attn_check', 'To show you are reading, please choose "Sometimes".', [['never', 'Never'], ['sometimes', 'Sometimes'], ['often', 'Often']], { sessions: [], required: true }),
          scale7('realistic', 'The calls felt realistic.', AGREE7, { sessions: [] }),
          scale7('training_useful', 'The material at the start was useful.', AGREE7, { sessions: [], conditions: ['a1', 'a2', 'a3', 'a4'] }),
          ...DEMOGRAPHICS.map(x => ({ ...x, sessions: [] }))
        ]
      },
      enrollment: { open: false, domains: [], gapDays: 0, label: 'self-signup', panel: { enabled: true, param: 'PROLIFIC_PID', completionUrl: '', label: 'prolific' } },
      embedded: [{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }, { name: 'study_id', source: 'url', param: 'STUDY_ID' }, { name: 'session_id', source: 'url', param: 'SESSION_ID' }]
    })
  },

  'vishing-study2': VISHING_STUDY2,
  'argos-smishing': ARGOS_SMISHING
};

// A classic interference effect to replicate (the BRM platform paper's validation study): Stroop by default; switch
// to flanker on the Task tab.
TEMPLATES['stroop-flanker'] = {
  name: 'Stroop or flanker task', icon: 'cursor', type: 'reaction', minutes: 8,
  blurb: 'A reaction-time task that reproduces a classic effect: 96 balanced congruent and incongruent trials, practice with feedback, and response times from the first display frame.',
  content: () => ({
    minutesPerSession: 8,
    design: { conditions: [{ id: 'main', label: 'Everyone' }], sessions: [{ name: 'Session 1' }] },
    task: { paradigm: 'stroop', trialsPerSession: 96, practiceTrials: 8, fixationMs: 500, responseMs: 2000, itiMs: 400, feedbackPractice: true, keys: { red: 'd', green: 'f', blue: 'j', yellow: 'k' } },
    environment: { preload: false, fullscreen: true, desktopOnly: true, speechBrowser: false, micCheck: false, micRequired: false, headphoneCheck: false, headphoneFail: 'record', timingCheck: true, language: 'en-US' },
    survey: { pre: [], post: [q('keyboard', 'Did you use a physical keyboard?', 'choice', { options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No (touch screen or on-screen keyboard)' }], sessions: [] }), ...DEMOGRAPHICS] }
  })
};
export const templateList = () => Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, icon: t.icon, type: t.type, minutes: t.minutes, blurb: t.blurb }));
