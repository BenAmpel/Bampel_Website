// Study 2 of the vishing training paper (ISR plan and build spec, 2026-10-22): content for a multimodal study.
// Built step by step with Ben; the decision log is in the vishing-study-decisions.md note. So far: step 1.
//
// Shape: two sessions run as one sitting (design.continuous).
//   Session 1, screening (no arm yet): consent with required audio recording, eligibility (18+, not IL/TX/WA,
//     headphones and microphone, a quiet place), then the equipment check (Woods antiphase headphone test, 3 rounds,
//     pass at 2; then hear a word and say it back, scored by the lab's Whisper server). Two attempts each; failing
//     either screens the participant out. Later steps add the persona onboarding and the practice call here.
//   Session 2, the study: the arm is assigned when it starts (design.assignAtSession), so screen-outs never hold one.
// Exported as a lab template ("vishing-study2"), so a study made from it starts from this content.

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

// Spoken with Kokoro af_heart; Whisper large-v3-turbo on the lab Mac mini transcribed all ten correctly (2026-10-22).
const WORDS = ['harbor', 'garden', 'pencil', 'window', 'rocket', 'blanket', 'candle', 'ladder', 'turtle', 'button']
  .map((word, i) => ({ word, media: `/lab/media/vishing-study2/check/w${String(i + 1).padStart(2, '0')}.mp3` }));

const item = (id, title, kind, extra = {}) => ({ id, title, kind, body: '', media: '', mediaAlt: '', transcript: '', decide: false, ask: 'none', variants: {}, ...extra });

// Draft consent (vishing-study-consent-draft.md); [BRACKETS] are for the IRB. approved stays false until the IRB
// signs off, which keeps the "draft consent" banner on the page.
const CONSENT = [
  'Georgia State University. Informed Consent. Title: Handling Workplace Phone Calls. Principal Investigator: Benjamin M. Ampel, [DEPARTMENT], Georgia State University. Co-Investigator: [Joe Buckman, AFFILIATION]. IRB protocol: [PROTOCOL NUMBER]. Version date: [DATE].',
  'Purpose. We are studying how people handle phone calls at work and how short training changes the decisions they make. About [900] people will take part online.',
  'What you will do. The study takes about {minutes} minutes in one sitting. You will play the role of a front-desk employee at a fictional company, using a fictional employee ID, account number and codes that we give you. These are not real, and you should never use your own information. You will answer questions about yourself and your experience with phone calls, listen to short recorded phone calls and decide how you would treat each one, complete a short training module, and work a short phone shift: you will receive about 8 calls in your browser and speak out loud with the callers. You can answer, ask questions, put a caller on hold, hang up, look up numbers in a company directory and call numbers back. Then you will answer a final set of questions.',
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
      assignAtSession: 2, continuous: true, practice: false,
      sessions: [
        { blocks: [{ title: 'Equipment check', items: ['check-headphones', 'check-word'], randomize: false }] },
        { blocks: [{ title: 'Study', items: ['study-start'], randomize: false }] }
      ]
    },
    decision: { prompt: 'How would you label this call?', options: [{ value: 'legitimate', label: 'Legitimate' }, { value: 'suspicious', label: 'Suspicious' }], mouseTracking: true },
    directory: [],
    items: [
      item('check-headphones', 'Headphone check', 'check', { check: { test: 'headphones', trials: 3, pass: 2, attempts: 2 } }),
      item('check-word', 'Microphone check', 'check', { check: { test: 'word', attempts: 2, words: WORDS } }),
      item('study-start', 'The study begins', 'text', { body: 'Placeholder: the persona onboarding, practice call, training and phone shift are added in the next build steps.' })
    ],
    practice: null,
    questions: [],
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
        q('future_contact', 'Optional: may the researchers invite you to a future study through Prolific? Saying no does not affect this study or your payment.', 'choice', { options: yesNo, required: false })
      ],
      post: []
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
