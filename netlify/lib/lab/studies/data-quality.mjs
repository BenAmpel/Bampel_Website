// Built-in study "data-quality": the online-survey data-quality battery (survey-only, one session).
// Items follow the compiled list in SurveyItemsList.docx, which draws on Douglas, Ewell, and Brauer (2023),
// Brotherton, French, and Pickering (2013), and Chmielewski and Kucker (2020). It runs on the "vignettes"
// type with no items, so the whole battery is one start-of-session survey (shown in pages). The content
// below is only the starting point: once saved on the study's admin page, the saved version is used.
//
// Order choices (the source list gives groups, not an order):
//   * Age is asked on page 1; birth year on page 8, for the response-inconsistency check.
//   * The 50 Big Five items are interleaved across traits and alternate positive and negative wording.
//   * The "select strongly agree" check sits inside the personality items; the test-retest item appears
//     twice, 21 questions apart, also inside them.
//   * Every question is optional (a skipped question gets one reminder). A blank attention check is a miss.

const AGREE5 = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'];
const TRUE5 = ['Definitely not true', 'Probably not true', 'Not sure / cannot decide', 'Probably true', 'Definitely true'];
const opts = list => list.map(x => (Array.isArray(x) ? { value: x[0], label: x[1] } : { value: x, label: x }));

const scale = (id, text, labels, page) => ({ id, text, type: 'scale', n: labels.length, lo: labels[0], hi: labels[labels.length - 1], labels: labels.slice(), required: false, showIf: 'always', sessions: [1], conditions: [], page });
const number = (id, text, page) => ({ id, text, type: 'number', required: false, showIf: 'always', sessions: [1], conditions: [], page });
const choice = (id, text, options, page) => ({ id, text, type: 'choice', options: opts(options), required: false, showIf: 'always', sessions: [1], conditions: [], page });
const multi = (id, text, options, page) => ({ id, text, type: 'multi', options: opts(options), required: false, showIf: 'always', sessions: [1], conditions: [], page });
const text = (id, text, page) => ({ id, text, type: 'text', required: false, showIf: 'always', sessions: [1], conditions: [], page });

// Big Five (50 items, five per pole). Variable bf_<trait>_<p|n><k>: p = positively worded, n = negatively
// worded (reverse-score before averaging).
const BIG5 = {
  n: { name: 'Neuroticism',
    p: ['I get stressed out easily', 'I worry about things', 'I am easily disturbed', 'I get upset easily', 'I change my mood a lot'],
    n: ['I am relaxed most of the time', 'I seldom feel blue', 'I am not easily bothered by things', "I don't get too worked up about things", 'I rarely get irritated'] },
  e: { name: 'Extraversion',
    p: ['I feel comfortable around people', 'I make friends easily', 'I am skilled in handling social situations', 'I am the life of the party', 'I know how to captivate people'],
    n: ['I have little to say', 'I keep in the background', 'I would describe my experiences as somewhat dull', "I don't like to draw attention to myself", "I don't talk a lot"] },
  o: { name: 'Openness to experience',
    p: ['I have a rich vocabulary', 'I have a vivid imagination', 'I have excellent ideas', 'I am quick to understand things', 'I use difficult words'],
    n: ['I have difficulty understanding abstract ideas', 'I am not interested in abstract ideas', 'I do not have a good imagination', 'I avoid difficult reading material', 'I tend to vote for conservative political candidates'] },
  a: { name: 'Agreeableness',
    p: ['I have a good word for everyone', 'I believe that others have good intentions', 'I respect others', 'I accept people as they are', 'I make people feel at ease'],
    n: ['I have a sharp tongue', 'I cut others to pieces', 'I suspect hidden motives in others', 'I get back at others', 'I insult people'] },
  c: { name: 'Conscientiousness',
    p: ['I am always prepared', 'I pay attention to details', 'I get chores done right away', 'I carry out my plans', 'I make plans and stick to them'],
    n: ['I leave my belongings around', 'I make a mess of things', 'I often forget to put things back in their proper place', 'I shirk my duties', 'I waste my time'] }
};
const BIG5_ORDER = ['n', 'e', 'o', 'a', 'c'];

// Generalized Conspiracist Beliefs scale (Brotherton et al., 2013), 15 items.
const GCB = [
  'The government is involved in the murder of innocent citizens and/or well-known public figures, and keeps this a secret.',
  'The government permits or perpetrates acts of terrorism on its own soil, disguising its involvement.',
  'The government uses people as patsies to hide its involvement in criminal activity.',
  'The power held by heads of state is second to that of small unknown groups who really control world politics.',
  'A small, secret group of people is responsible for making all major world decisions, such as going to war.',
  'Certain significant events have been the result of the activity of a small group who secretly manipulate world events.',
  'Secret organizations communicate with extraterrestrials, but keep this fact from the public.',
  'Evidence of alien contact is being concealed from the public.',
  'Some UFO sightings and rumors are planned or staged in order to distract the public from real alien contact.',
  'The spread of certain viruses and/or diseases is the result of the deliberate, concealed efforts of some organization.',
  'Technology with mind-control capacities is used on people without their knowledge.',
  'Experiments involving new drugs or technologies are routinely carried out on the public without their knowledge or consent.',
  'Groups of scientists manipulate, fabricate, or suppress evidence in order to deceive the public.',
  'New and advanced technology which would harm current industry is being suppressed.',
  'A lot of important information is deliberately concealed from the public out of self-interest.'
];

const INCOME = ['Less than $10,000', ...Array.from({ length: 14 }, (_, i) => `$${(i + 1) * 10},000 to $${(i + 1) * 10 + 9},999`), '$150,000 or more'];

// Personality block: 50 items interleaved across traits, positive and negative wording alternating, with
// the embedded attention check and the test-retest pair (21 questions apart).
export function personalityBlock() {
  const L = [];
  for (let k = 0; k < 10; k++) for (const t of BIG5_ORDER) {
    const pole = k % 2 === 0 ? 'p' : 'n', j = Math.floor(k / 2);
    L.push(scale(`bf_${t}_${pole}${j + 1}`, BIG5[t][pole][j], AGREE5));
  }
  const GE = text => scale('', text, AGREE5);
  const AC = 12, RT1 = 20, RT2 = RT1 + 21;
  const out = [];
  let bf = 0;
  for (let pos = 0; bf < L.length || pos <= RT2; pos++) {
    if (pos === AC) out.push({ ...GE("Please select 'Strongly agree' for this item."), id: 'ac_agree' });
    else if (pos === RT1) out.push({ ...GE('The government should invest in green energy.'), id: 'test_retest_1' });
    else if (pos === RT2) out.push({ ...GE('The government should invest in green energy.'), id: 'test_retest_2' });
    else if (bf < L.length) out.push(L[bf++]);
    else break;
  }
  return out;
}

export function seed() {
  const pers = personalityBlock();
  const chunks = [14, 13, 13, 13];   // personality pages 2 to 5
  let at = 0, page = 2;
  const personality = [];
  for (const n of chunks) { pers.slice(at, at + n).forEach(q => personality.push({ ...q, page })); at += n; page++; }
  const gcb = GCB.map((t, i) => scale(`gcb_${i + 1}`, t, TRUE5));
  const pre = [
    // Page 1: survey experience and age (asked early for the consistency check)
    number('se_week', 'How many surveys do you think you have taken over the past seven days?', 1),
    number('se_year', 'How many surveys do you think you have taken over the past year?', 1),
    number('age', 'What is your age in years?', 1),
    ...personality,
    // Page 6 and 7: conspiracist beliefs, with the arithmetic check inside
    ...gcb.slice(0, 4).map(q => ({ ...q, page: 6 })),
    { ...number('ac_math', 'What is 3 x 4?'), page: 6 },
    ...gcb.slice(4, 8).map(q => ({ ...q, page: 6 })),
    ...gcb.slice(8).map(q => ({ ...q, page: 7 })),
    // Page 8: consent-form check and birth year (the later half of the age consistency check)
    { ...choice('ac_color', 'Which color did the consent form say was the color of this study?', ['Blue', 'Green', 'Orange', 'Purple', 'Red', 'Teal', 'Yellow']), page: 8 },
    number('birth_year', 'In what year were you born?', 8),
    // Page 9: demographics
    choice('gender', 'What is your gender identity?', ['Female', 'Male', 'Another identity', 'Prefer not to say'], 9),
    choice('transgender', 'Do you identify as transgender?', ['Yes', 'No', 'I am unsure', 'Prefer not to say'], 9),
    multi('ethnicity', 'Which of the following describe your ethnicity? Select all that apply.', ['American Indian or Alaskan Native', 'Asian or Asian American', 'Black or African American', 'Latino, Hispanic, Chicano, or Puerto Rican', 'Middle Eastern, Arab American, or North African', 'Native Hawaiian or Pacific Islander', 'White or European', 'Another identity', 'Prefer not to say'], 9),
    choice('sexual_orientation', 'What is your sexual orientation?', ['Straight or heterosexual', 'Gay or homosexual', 'Bisexual', 'Another identity', 'Prefer not to say'], 9),
    choice('income', 'What is your total family income per year?', INCOME, 9),
    choice('education', 'What is the highest level of education you have completed?', ['Less than high school', 'High school diploma or equivalent', 'Some college, no degree', 'Associate degree', "Bachelor's degree", "Master's degree", 'Doctorate or professional degree'], 9),
    // Page 10: political questions
    scale('political_affiliation', 'Which best describes your political affiliation?', ['Strong Republican', 'Republican', 'Lean Republican', 'Independent', 'Lean Democrat', 'Democrat', 'Strong Democrat'], 10),
    choice('party', 'With which political party do you most closely identify?', ['Republican', 'Libertarian', 'Democratic', 'Green Party'], 10),
    scale('political_social', 'How would you describe your political beliefs on social issues?', ['Very conservative', 'Conservative', 'Moderate', 'Liberal', 'Very liberal'], 10),
    scale('political_economic', 'How would you describe your political beliefs on economic issues?', ['Very conservative', 'Conservative', 'Moderate', 'Liberal', 'Very liberal'], 10),
    // Page 11: self-reported data quality, then the open-ended bot check
    choice('dq_low_quality', 'My data should be considered low quality because I was distracted, responding to questions without reading them, or picking answers randomly.', ['Yes', 'No'], 11),
    text('final_comments', 'Do you have any final comments or questions?', 11)
  ];
  return {
    minutesPerSession: 20,
    consent: {
      approved: false,
      paragraphs: [
        'This study compares the quality of data collected in online surveys. It has one session that takes about {minutes} minutes.',
        'You will answer questions about your survey experience, your personality and beliefs, and some background questions about yourself. A few questions check that you are reading carefully.',
        'To help us check that you are reading this form, please remember this: the color of this study is teal.',
        'Your answers are stored under a study ID, not your name. If you signed in with an email address, it is stored separately and used only to record your participation. The page also records how long you take on each screen.',
        'Participation is voluntary. You may skip any question or stop at any time without penalty.',
        'Questions: Dr. Benjamin Ampel, Georgia State University, bampel@gsu.edu.'
      ],
      agreeLabel: 'I am 18 or older and I agree to participate.'
    },
    enrollment: { open: false, domains: ['gsu.edu', 'student.gsu.edu'], gapDays: 0, label: 'self-signup' },
    text: {
      login_title: 'Online survey study',
      pre_title: 'Survey questions',
      start_body: 'This survey takes about {minutes} minutes. Please complete it in one sitting, somewhere you will not be interrupted.\n\nYour answers are saved when you finish the last page. If you reload this page, your earlier answers on this device are kept. If you close the tab, you will start the survey again.',
      done_body: 'Thank you. Your answers are saved.'
    },
    design: { conditions: [{ id: 'main', label: 'Everyone' }], practice: false, randomize: false, sessions: [{ items: [] }] },
    items: [],
    practice: null,
    questions: [],
    survey: { pre, post: [] }
  };
}
