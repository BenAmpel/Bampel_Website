// Study 2 of the vishing training paper (ISR plan and build spec, 2026-10-22): content for a multimodal study.
// Built step by step with Ben; the decision log is in the vishing-study-decisions.md note. So far: step 1.
//
// Shape: two sessions run as one sitting (design.continuous); about 50 minutes.
//   Session 1, screening and onboarding (no arm yet): consent with required audio recording; eligibility (18+, not
//     IL/TX/WA, headphones and microphone, a quiet place); the equipment check (Woods antiphase headphone test, 3 rounds,
//     pass at 2; then hear a word and say it back, scored by the lab's Whisper server; two attempts each); the persona
//     card; a tour of the softphone and directory with a comprehension check; the practice call (a hard gate with one
//     retry). Failing any gate screens the participant out.
//   Session 2, the study, with the arm assigned as it starts (design.assignAtSession), so screen-outs never hold one:
//     baseline survey; 12 passive clips (this participant's list); the training module for the arm; the knowledge check
//     and bridge measures; 12 new passive clips; the scored 8-call softphone shift; the post survey; the debrief with
//     the participant's own transcript and score.
// Exported as a lab template ("vishing-study2"), so a study made from it starts from this content.
// Parts: vishing-study2/world.mjs (persona, directory, voices), training.mjs (A0-A4), clips.mjs (passive library and
// lists), calls.mjs (practice call and shift). Audio: scripts/vishing-study2/render-audio.mjs.
import { PERSONA, DIRECTORY, DIRECTORY_JOBS, VOICE, number } from './vishing-study2/world.mjs';
import { TRAINING_ITEMS, TRAINING_QUESTIONS } from './vishing-study2/training.mjs';
import { CLIP_LIBRARY, PLACEHOLDER_CLIPS } from './vishing-study2/clips.mjs';
import { PRACTICE_ITEMS, SHIFT_ITEMS, SHIFT_FORMS, PLACEHOLDER_CALLS } from './vishing-study2/calls.mjs';

// Launch checklist: both must be 0 before data collection (the writer's clips and call specs replace these).
export const PLACEHOLDERS = { clips: PLACEHOLDER_CLIPS, calls: PLACEHOLDER_CALLS };

const q = (id, text, type, extra = {}) => ({ id, text, type, required: true, showIf: 'always', conditions: [], sessions: [1], ...extra });
const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
  'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '_');
// Voice-biometric laws (decision 2026-10-22): Illinois, Texas and Washington are excluded, here and on Prolific.
export const EXCLUDED_STATES = ['illinois', 'texas', 'washington'];
const STATE_OPTIONS = STATES.map(s => ({ value: slug(s), label: s })).concat([{ value: 'outside_us', label: 'I do not live in the U.S.' }]);

// Spoken in the study voice (world.mjs VOICE); Whisper large-v3-turbo on the lab Mac mini must transcribe all ten.
const WORDS = ['harbor', 'garden', 'pencil', 'window', 'pillow', 'blanket', 'candle', 'ladder', 'turtle', 'button']
  .map((word, i) => ({ word, media: `/lab/media/vishing-study2/check/w${String(i + 1).padStart(2, '0')}.mp3` }));

const PRACTICE_SAY = 'Receiving, this is Sam. Just testing the line? Sounds good. Bye now.';
const NOT_IN_SERVICE = 'The number you have dialed is not in service.';
// Everything this file plays that is not a training example or a passive clip, rendered in the study voice.
export const AUDIO_JOBS = [
  ...WORDS.map(w => ({ file: w.media.replace('/lab/media/vishing-study2/', ''), text: w.word, voice: VOICE, phone: false })),
  { file: 'directory/practice-receiving.mp3', text: PRACTICE_SAY, voice: VOICE, phone: true },
  { file: 'directory/not-in-service.mp3', text: NOT_IN_SERVICE, voice: VOICE, phone: true },
  ...DIRECTORY_JOBS
];

const AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
const opts = list => list.map(([value, label]) => ({ value, label }));
const s2 = (id, text, type, extra = {}) => q(id, text, type, { sessions: [2], ...extra });
const BASELINE = [
  s2('base_intro', 'First, a few questions about you and about phone calls.', 'info', { required: false }),
  s2('age', 'How old are you?', 'number', { min: 18, max: 99 }),
  s2('gender', 'What is your gender?', 'choice', { options: opts([['woman', 'Woman'], ['man', 'Man'], ['nonbinary', 'Non-binary'], ['self', 'Prefer to self-describe'], ['na', 'Prefer not to say']]) }),
  s2('education', 'What is the highest level of education you have completed?', 'choice', { options: opts([['hs', 'High school or less'], ['some', 'Some college'], ['ba', 'Bachelor\'s degree'], ['grad', 'Graduate degree']]) }),
  s2('job_phone', 'In your work, how often do you answer phone calls from people outside your organization?', 'choice', { options: opts([['never', 'Never'], ['monthly', 'A few times a month'], ['weekly', 'A few times a week'], ['daily', 'Daily'], ['many', 'Many times a day']]) }),
  s2('job_role', 'Which best describes your job?', 'choice', { options: opts([['admin', 'Administrative or front desk'], ['service', 'Customer service'], ['finance', 'Finance or accounting'], ['it', 'IT'], ['other', 'Something else'], ['none', 'Not currently working']]) }),
  s2('prior_vish', 'In the past two years, which of these has happened to you? Tick all that apply.', 'multi', { options: opts([['call', 'A call I believe was a scam'], ['shared', 'I shared information with a caller who turned out to be a scammer'], ['money', 'I lost money to a phone scam'], ['work', 'A scam call at work'], ['none', 'None of these']]) }),
  s2('prior_training', 'Have you had security training that covered phone scams?', 'choice', { options: opts([['none', 'No'], ['once', 'Yes, once'], ['regular', 'Yes, regularly']]) }),
  s2('prev_base', 'Of 100 unexpected calls from organizations, how many do you think are scams?', 'number', { min: 0, max: 100 }),
  s2('trust_phone', 'I generally trust that callers are who they say they are.', 'scale', { n: 7, labels: AGREE7 }),
  s2('trust_org', 'When a company calls me, I usually do what they ask.', 'scale', { n: 7, labels: AGREE7 })
];
const tlx = (id, text) => q(id, text + ' (0 = very low, 100 = very high)', 'confidence', { sessions: [2] });
const POST = [
  s2('prev_post', 'Of 100 unexpected calls from organizations, how many do you think are scams?', 'number', { min: 0, max: 100 }),
  s2('verify_cost', 'Calling an organization back to check felt like too much trouble.', 'scale', { n: 7, labels: AGREE7 }),
  tlx('tlx_mental', 'How mentally demanding was the phone shift?'),
  tlx('tlx_physical', 'How physically demanding was it?'),
  tlx('tlx_temporal', 'How hurried or rushed was the pace?'),
  tlx('tlx_performance', 'How successful were you at what you were asked to do?'),
  tlx('tlx_effort', 'How hard did you have to work?'),
  tlx('tlx_frustration', 'How insecure, discouraged, irritated or stressed were you?'),
  s2('demand_probe', 'In your own words, what do you think we expected you to do in this study?', 'text', { long: true }),
  s2('bot_suspect', 'Did any caller seem automated to you?', 'choice', { options: opts([['no', 'No'], ['some', 'Some did'], ['all', 'All did'], ['unsure', 'Not sure']]) }),
  s2('bot_which', 'If so, what made a caller seem automated?', 'text', { required: false, long: true }),
  s2('attn_check', 'To show you are reading, please choose "Sometimes".', 'choice', { options: opts([['never', 'Never'], ['sometimes', 'Sometimes'], ['often', 'Often']]) })
];
const DEBRIEF = 'Thank you. This study looked at how a short briefing changes the way people decide about phone calls at work.\n\nSome of the calls in your shift were simulated scam calls, and some were legitimate. The callers were AI voice agents that followed fixed scripts; we did not tell you this beforehand because knowing it could change how people respond. Nothing you shared went to anyone outside the research team, and all the details you used were fictional.\n\nParticipants were randomly given one of five briefings. A short rule that works for any call: before you act on a call that asks for something, ask who started the contact, what you are being asked to do, through whose channel, and whether you can verify first by looking the organization up yourself and calling back.\n\nYour shift, including your own transcript and points, is shown below. If you have questions, or want your data and recordings deleted, message the researcher through Prolific with your Prolific ID before [DATA FREEZE DATE]. Questions about your rights: Georgia State University Office of Human Research Protections, [PHONE], [EMAIL].';

const item = (id, title, kind, extra = {}) => ({ id, title, kind, body: '', media: '', mediaAlt: '', transcript: '', decide: false, ask: 'none', variants: {}, ...extra });

// Draft consent (vishing-study-consent-draft.md); [BRACKETS] are for the IRB. approved stays false until the IRB
// signs off, which keeps the "draft consent" banner on the page.
const CONSENT = [
  'Georgia State University. Informed Consent. Title: Handling Workplace Phone Calls. Principal Investigator: Benjamin M. Ampel, [DEPARTMENT], Georgia State University. Co-Investigator: [Joe Buckman, AFFILIATION]. IRB protocol: [PROTOCOL NUMBER]. Version date: [DATE].',
  'Purpose. We are studying how people handle phone calls at work and how short training changes the decisions they make. About [900] people will take part online.',
  'What you will do. The study takes about {minutes} minutes in one sitting. You will play the role of a front-desk employee at a fictional company, using a fictional employee ID, account number and codes that we give you. These are not real, and you should never use your own information. You will answer questions about yourself and your experience with phone calls, listen to short recorded phone calls and decide how you would treat each one, complete a short training module, and work a short phone shift: you will receive about 10 calls in your browser and speak out loud with the callers. You can answer, ask questions, put a caller on hold, hang up, look up numbers in a company directory and call numbers back. Then you will answer a final set of questions.',
  'Some callers in this study may try to get information from you, and some are ordinary callers. We will not tell you which is which during the study. At the end we will explain the full purpose of the study and show you a record of your own calls.',
  'Audio recording (required). This study requires recording your voice. When you speak with callers, your microphone audio is recorded and converted to a written transcript. Recordings are encrypted and stored on secure university-managed servers, separate from your Prolific ID. Only the research team can access them, and audio is never shared outside the research team. Recordings are deleted [WITHIN X MONTHS / ON THE IRB-APPROVED SCHEDULE]. Transcripts are checked and any accidental personal details (such as phone numbers, addresses or card numbers) are removed; only these cleaned transcripts and summary measures may be shared with other researchers. We will not use your recordings to identify you by your voice, and we do not create voiceprints. If you do not agree to audio recording, you cannot take part in this study.',
  'Risks and discomforts. The risks are minimal and no greater than everyday phone use. Some callers may be pushy or try to rush you, which some people find mildly stressful. You may hang up on any caller at any time. Do not say any real personal information (your real name, address, passwords, bank or card numbers) during the study. If you do, it will be removed from the transcript.',
  'Benefits. There is no direct benefit to you. You may learn something about handling suspicious calls, and the results will help organizations design better security training.',
  'Payment. You will receive [$BASE] through Prolific for completing the study. You can also earn a bonus of up to [$MAX_BONUS] based on points you score during the phone shift; the scoring rules are shown on screen before the shift starts. Points convert to money at [RATE]. If you are screened out at the start, you will receive [$SCREENOUT_PAY].',
  'Voluntary participation and withdrawal. Taking part is voluntary. You may stop at any time by closing the browser window, without penalty. If you withdraw, you may ask us to delete your data, including recordings, by messaging the researcher through Prolific with your Prolific ID before [DATA FREEZE DATE].',
  'Confidentiality. We will keep your records private to the extent allowed by law. Your Prolific ID is used only to pay you and is stored separately from your responses and recordings. [GSU IRB and the Office for Human Research Protection (OHRP) may review study records.] Results will be reported only in summary form.',
  'Contact. Questions about the study: Benjamin Ampel, [EMAIL], [PHONE]. Questions about your rights as a participant: Georgia State University Office of Human Research Protections, [PHONE], [EMAIL].',
  'Please print or save a copy of this page for your records.'
];

export const VISHING_STUDY2 = {
  name: 'Vishing Study 2 (ISR, five arms)', icon: 'shield', type: 'multimodal', minutes: 50,
  blurb: 'Ben Ampel\'s Study 2: screening (eligibility, headphone and spoken-word checks), then five randomized training arms, passive clips before and after, and a softphone shift with AI callers. Built step by step.',
  content: () => ({
    minutesPerSession: 50,
    consent: {
      approved: false, paragraphs: CONSENT, agreeLabel: 'I am 18 or older, I have read this form, and I agree to take part.',
      recording: { enabled: true, required: true, label: 'I agree to have my voice recorded and transcribed as described above.' }
    },
    design: {
      conditions: [
        { id: 'a0', label: 'A0: Active placebo (phone etiquette)' }, { id: 'a1', label: 'A1: Instruction-only' }, { id: 'a2', label: 'A2: Cue-based' },
        { id: 'a3', label: 'A3: Legitimate template' }, { id: 'a4', label: 'A4: Structural rule plus verification' }
      ],
      assignAtSession: 2, continuous: true, practice: false, noSoundCheck: true,
      // Permuted blocks of 10 (each arm twice per block), fixed in advance by the seed (decided 2026-10-22). The list is
      // exported for the preregistration from the console: admin/allocation.csv. Do not change the seed after launch.
      randomization: { method: 'blocks', blockSize: 10, seed: 'vishing-study2-v1' },
      // Exploratory real-time suspicion slider: half of each arm, in the first (pre-training) set of recorded calls, so the
      // post-training clips that carry H1 and H2 are never rated while listening (decided 2026-10-22).
      sliderBlock: 'clips:pre',
      // Within-subject threshold manipulation from the literature review (2026-10-22): half of each phase's clips are
      // locked until the call ends (3 attacks, 3 legitimate), interleaved with free-response clips.
      lockedTrials: true,
      sessions: [
        { blocks: [
          { title: 'Equipment check', items: ['check-headphones', 'check-word'], randomize: false },
          { title: 'Your role', items: ['persona-card', 'tour', 'practice-intro', 'practice-call', 'practice-call-retry'], randomize: false }
        ] },
        { blocks: [
          { title: 'Recorded calls', items: ['clips-intro-1'], randomize: false },
          { title: 'Recorded calls, first set', pool: 'clips:pre', items: [], randomize: true },
          { title: 'Briefing', items: TRAINING_ITEMS.map(x => x.id), randomize: false },
          { title: 'About the briefing', items: ['knowledge-check'], randomize: false },
          { title: 'Recorded calls', items: ['clips-intro-2'], randomize: false },
          { title: 'Recorded calls, second set', pool: 'clips:post', items: [], randomize: true },
          { title: 'Your shift', items: ['shift-intro'], randomize: false },
          { title: 'Phone shift', pool: 'shift', items: [], randomize: true }
        ] }
      ]
    },
    // Passive clips: a binary label with mouse-tracked buttons (decision 2026-10-22); the shift uses its own disposition.
    decision: { prompt: 'Is this call legitimate or suspicious?', options: [{ value: 'legitimate', label: 'Legitimate' }, { value: 'suspicious', label: 'Suspicious' }], mouseTracking: true },
    directory: DIRECTORY,
    persona: PERSONA,
    clipLibrary: CLIP_LIBRARY,
    // Directory outage (secondary test of full channel dependence, decided 2026-10-22): per participant, 1 call of each
    // structure x surface stratum rings while the directory is down, 4 of the 10.
    shift: { forms: SHIFT_FORMS, outage: { 'attack|calm': 1, 'attack|urgent': 1, 'benign|calm': 1, 'benign|urgent': 1 } },
    // Shift payoff (build spec): +10 completing a legitimate request (on the call or by calling the real number back),
    // -40 giving a credential, account number or code to an attacker, 0 reporting a legitimate caller, -2 per callback.
    // Verification then pays when the chance of an attack is between about .05 and .80. centsPerPoint: [IRB/budget].
    payoff: { benignComplete: 10, disclose: -40, callback: -2, report: 0, centsPerPoint: 2 },
    // Pilot mode: a fifth of participants get only the scripted caller lines (the equivalence check); set to 0 for the main wave.
    pilot: { scriptedShare: 0.2 },
    debrief: { title: 'About this study', body: DEBRIEF },
    items: [
      item('check-headphones', 'Headphone check', 'check', { check: { test: 'headphones', trials: 3, pass: 2, attempts: 2 } }),
      item('check-word', 'Microphone check', 'check', { check: { test: 'word', attempts: 2, words: WORDS } }),
      item('persona-card', 'Your role today', 'text', { persona: true, minSeconds: 45,
        body: 'Read your card carefully. You can open it again at any time with the My info button at the bottom right of the screen.' }),
      item('tour', 'Your phone and directory', 'text', { minSeconds: 20, ask: ['tour_codes', 'tour_lookup', 'tour_report'],
        body: 'During your shift, calls ring on a phone like this one. For each call you can:\n\n· Answer or decline it, and see the caller ID.\n· Talk: tap the big button, say your reply out loud, then tap it again. You can also type.\n· Put the caller on hold, or hang up at any time.\n· See one-time codes when a service sends one: they appear in the Authenticator on the phone.\n· Look a number up in the company directory, or dial a number, and call it.\n· After each call, say how you would describe it (legitimate, suspicious, or report to security) and how sure you are.\n\nTry the directory now: search for "receiving" and call Warehouse Receiving.',
        practiceDial: { directory: DIRECTORY, target: number('Warehouse Receiving, Northwind'), say: PRACTICE_SAY, media: '/lab/media/vishing-study2/directory/practice-receiving.mp3',
          missMedia: '/lab/media/vishing-study2/directory/not-in-service.mp3' } }),
      item('practice-intro', 'A practice call', 'text', { body: 'Next, a coworker will call you. This is practice and is not scored. Answer, then speak your reply out loud: tap Tap to talk, speak, and tap it again. Hang up when you are done.' }),
      ...PRACTICE_ITEMS,
      item('clips-intro-1', 'Recorded calls', 'text', { minSeconds: 10,
        // Exact, true base rate for every arm before the first block (decided 2026-10-22): it fixes the prior, so arm
        // differences must run through cue weighting or verification policy. Each set of 12 has 6 attacks (clips.mjs).
        body: 'You will hear 12 short recorded calls to the Northwind front desk. In each set of 12 calls in this study, 6 are attempts to get information or money from Northwind, and 6 are legitimate.\n\nFor each one, click Start: the call plays and two answers appear, Legitimate and Suspicious.\n\nChoose an answer while the call plays. You can change it until the call ends. Press the space bar the moment you have made up your mind. Then say how sure you are.' }),
      ...TRAINING_ITEMS,
      item('knowledge-check', 'A few questions about the briefing', 'text', { ask: [...TRAINING_QUESTIONS.filter(x => x.id.startsWith('kc_')).map(x => x.id), 'prev_bridge', 'cred_useful', 'cred_trust', 'cred_apply', 'intent_inbound'],
        body: 'Please answer from what the briefing said.' }),
      item('clips-intro-2', 'More recorded calls', 'text', { minSeconds: 6, body: 'Now 12 new recorded calls, in the same way as before: click Start, answer while the call plays (you can change it until it ends), press the space bar when you have decided, then say how sure you are.' }),
      item('shift-intro', 'Your shift starts now', 'text', { minSeconds: 25,
        body: 'You are now covering the Northwind main line. Ten calls will come in. Handle each one as you would at work: you can answer or decline, talk, put callers on hold, hang up, check the directory and call any number back. The company directory is sometimes down during a call; the dial pad always works.\n\nYour goal for the shift, paid as a bonus:\n\n· +10 points for each legitimate request you complete (on the call, or by calling the organization back on its real number).\n· −40 points if you give a password, account number or one-time code to a caller who is not who they say they are.\n· 0 points for reporting a legitimate caller to security.\n· −2 points for each call you make back (it takes time).\n\nEach point is worth [RATE]. Your total is shown at the end.' }),
      ...SHIFT_ITEMS
    ],
    practice: null,
    questions: [
      { id: 'confidence6', text: 'How sure are you?', type: 'scale', n: 6, labels: ['Guessing', 'Not sure', 'Somewhat unsure', 'Somewhat sure', 'Sure', 'Completely sure'], required: true, showIf: 'always', conditions: [] },
      { id: 'tour_codes', text: 'Where do new one-time codes appear?', type: 'choice', required: true, showIf: 'always', conditions: [], options: [{ value: 'card', label: 'On my persona card' }, { value: 'auth', label: 'In the Authenticator on the phone' }, { value: 'caller', label: 'The caller reads them to me' }] },
      { id: 'tour_lookup', text: 'How do you call an organization using your own lookup?', type: 'choice', required: true, showIf: 'always', conditions: [], options: [{ value: 'redial', label: 'Call back the number that called me' }, { value: 'directory', label: 'Find it in the directory, then call' }, { value: 'given', label: 'Use the number the caller gives me' }] },
      { id: 'tour_report', text: 'Where do you report a call to security?', type: 'choice', required: true, showIf: 'always', conditions: [], options: [{ value: 'disposition', label: 'In the question after the call' }, { value: 'caller', label: 'By telling the caller' }, { value: 'nowhere', label: 'You cannot report calls' }] },
      ...TRAINING_QUESTIONS,
      { id: 'prev_bridge', text: 'Of 100 unexpected calls from organizations, how many do you think are scams?', type: 'number', min: 0, max: 100, required: true, showIf: 'always', conditions: [] },
      { id: 'cred_useful', text: 'The briefing was useful for handling work calls.', type: 'scale', n: 7, labels: AGREE7, required: true, showIf: 'always', conditions: [] },
      { id: 'cred_trust', text: 'I trust the advice in the briefing.', type: 'scale', n: 7, labels: AGREE7, required: true, showIf: 'always', conditions: [] },
      { id: 'cred_apply', text: 'I expect to use what the briefing said during my shift.', type: 'scale', n: 7, labels: AGREE7, required: true, showIf: 'always', conditions: [] },
      { id: 'intent_inbound', text: 'An organization calls you and asks you to do something. What would you most likely do?', type: 'choice', required: true, showIf: 'always', conditions: [],
        options: [{ value: 'accept', label: 'Do what they ask' }, { value: 'verify', label: 'Check with the organization first' }, { value: 'refuse', label: 'Refuse' }] }
    ],
    screening: { rules: [
      { question: 'elig_age', pass: ['yes'] },
      { question: 'elig_state', pass: STATE_OPTIONS.map(o => o.value).filter(v => v !== 'outside_us' && !EXCLUDED_STATES.includes(v)) },
      { question: 'elig_equipment', pass: ['yes'] },
      { question: 'elig_quiet', pass: ['yes'] }
    ] },
    survey: {
      pre: [
        q('elig_intro', 'Before you begin, please answer a few questions to confirm you can take part.', 'info', { required: false }),
        q('elig_age', 'Are you 18 or older?', 'choice', { options: yesNo }),
        q('elig_state', 'In which U.S. state do you currently live?', 'select', { options: STATE_OPTIONS }),
        q('elig_equipment', 'Are you using a laptop or desktop computer with headphones and a working microphone?', 'choice', { options: yesNo }),
        q('elig_quiet', 'Are you in a quiet place where you can speak out loud for about 15 minutes?', 'choice', { options: yesNo }),
        q('future_contact', 'Optional: may the researchers invite you to a future study through Prolific? Saying no does not affect this study or your payment.', 'choice', { options: yesNo, required: false }),
        // Session 2, before anything else: the baseline survey (build spec, Section 4).
        ...BASELINE
      ],
      post: POST
    },
    text: {
      progress_trial: 'Step {i} of {n}',
      instr_intro: 'The next part has a few short steps. Take each one as it comes.',
      screenout_body: 'Unfortunately you are not able to take part in this study. Please return to Prolific using the button below. Thank you for your time.'
    },
    enrollment: { open: false, domains: [], gapDays: 0, label: 'prolific', panel: { enabled: true, param: 'PROLIFIC_PID', completionUrl: '', screenOutUrl: '', label: 'prolific' } },
    embedded: [{ name: 'prolific_pid', source: 'url', param: 'PROLIFIC_PID' }, { name: 'study_id', source: 'url', param: 'STUDY_ID' }, { name: 'session_id', source: 'url', param: 'SESSION_ID' }]
  })
};
