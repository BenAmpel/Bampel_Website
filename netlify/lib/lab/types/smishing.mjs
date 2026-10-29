// Study type: smishing warnings (the ARGOS use-context study, IRB H26762; design of record STUDY_SPEC.md v3, Option A).
// Each trial is one text message in a phone frame. The participant taps the link (which opens a local mock page with
// decoy fields) or ignores the message, then rates how likely it is a scam and, when a tier was shown, reads it back.
// Six within-subject warning conditions (C1 none, C2 generic banner, C3 binary badge, C4 tier + certainty, C5 C4 +
// cue line, C5p C4 + length-matched placebo line) are crossed with six stimulus groups by a 6 x 6 Latin square; the
// participant's cell (age stratum x stimulus block x arm) is allocated at session start, balanced within stratum.
// Alerts, tiers and certainty are assigned by design (bank), never by a live detector. Participant renderer:
// static/lab/engine/types/smishing.js. Export columns: static/lab/CODEBOOK.md, "Smishing warning studies".
import { BANK } from '../studies/argos-smishing/bank.mjs';

export const CONDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C5p'];
const STRATA = { y: '18-44', o: '45+' };
const BLOCKS = ['A', 'B'];
const ARMS = [1, 2, 3, 4, 5, 6];
export const CELLS = Object.keys(STRATA).flatMap(s => BLOCKS.flatMap(b => ARMS.map(a => `${s}-${b}${a}`)));
export const parseCell = id => { const m = /^([yo])-([AB])([1-6])$/.exec(id || ''); return m ? { stratum: m[1], block: m[2], arm: Number(m[3]) } : null; };
// Latin square (AGENT_BUILD_SPEC s8): group g in arm a gets conditions[(g - 1 + a - 1) mod 6].
export const conditionFor = (group, arm) => CONDS[(group - 1 + arm - 1) % 6];
const TOKEN = 'hxxps://[link-neutralized].example';
const EVENTS = ['render', 'link_tap', 'mock_view', 'field_focus', 'field_input', 'submit', 'ignore', 'back_to_message', 'probe', 'readback', 'next', 'timeout', 'browser_back'];
// Tier read-back (07_measures (b)): asked only when a tier warning was shown, offering the headings as displayed
// (stored as the tier: 'Severe' = "Likely scam", 'Medium' = "Review recommended") or 'Not sure'.
const READBACK = ['Severe', 'Medium', 'Not sure'];
const PAGES = ['signin', 'payment', 'delivery', 'track', 'reward', 'verify'];
export const PRACTICE_N = 4;
// Warning-comprehension battery (07_measures_instrument.md (c)): after the 72 messages, one screen per warning-bearing
// condition (C2-C5p, seeded order), each re-showing that condition's warning; 7-point agreement; COMP4 reverse-scored.
// ATT2 (f) sits inside one of the five screens. The reference warning is fixed (Severe tier, Moderate certainty, the
// PRESSURE cue line and its placebo) so the screens differ only by condition.
const AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
export const COMP_ITEMS = [
  ['comp1', 'I understood what the warning was telling me about this message.'],
  ['comp2', 'The warning made clear how risky the message was.'],
  ['comp3', 'I could tell why the system flagged this message.'],
  ['comp4', 'I was unsure what action the warning wanted me to take.'],
  ['comp5', 'Based on the warning, I had a clear sense of the chance this message was a scam.']
];
const ATT2 = ['att2', "For quality control, please select 'Disagree' (2) for this statement."];
const COMP_REF = { id: 'COMP-REF', label: 'none', alert: true, tier: 'Severe', certainty: 'Moderate',
  c5: 'Flagged mainly because it pressures you to act right away.', c5p: "Flagged after an automated review of this message's wording.", page: 'verify', brand: '' };
const COMP_CONDS = CONDS.filter(x => x !== 'C1');

// Same display link in both classes, random per stimulus but fixed across participants (AGENT_BUILD_SPEC s6.3).
function linkFor(id, seeded) {
  const r = seeded(`link|${id}`), a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'https://sms-link.example/' + Array.from({ length: 6 }, () => a[Math.floor(r() * a.length)]).join('');
}

// Trial order (AGENT_BUILD_SPEC s8): a seeded permutation with no more than 3 same-condition trials in a row, no
// more than 4 smishing or 3 benign in a row, and at least one smishing trial among the last 6. Rejection sampling.
export function orderTrials(rows, rand, shuffle) {
  for (let tries = 0; tries < 20000; tries++) {
    const o = shuffle(rows.slice(), rand);
    let ok = true, rc = 1, rs = 1;
    for (let i = 1; i < o.length && ok; i++) {
      rc = o[i].cond === o[i - 1].cond ? rc + 1 : 1;
      rs = o[i].item.label === o[i - 1].item.label ? rs + 1 : 1;
      if (rc > 3 || (o[i].item.label === 'smishing' && rs > 4) || (o[i].item.label === 'benign' && rs > 3)) ok = false;
    }
    if (ok && o.slice(-6).some(x => x.item.label === 'smishing')) return o;
  }
  throw new Error('no trial order met the constraints');
}

// What a condition shows on an alerted item (AGENT_BUILD_SPEC s6.2). Unalerted items look like C1 in every condition.
export function warningFor(cond, item) {
  if (!item.alert || cond === 'C1') return { kind: 'none' };
  if (cond === 'C2') return { kind: 'banner' };
  if (cond === 'C3') return { kind: 'badge' };
  const w = { kind: 'tier', tier: item.tier, certainty: item.certainty };
  if (cond === 'C5') w.line = item.c5;
  if (cond === 'C5p') w.line = item.c5p;
  return w;
}

const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Sign-in', 'login_title', 'Page title', 'Text message study'),
  F('Instructions', 'instr_intro', 'Opening', 'You will see 72 text messages, one at a time, in a picture of a phone on your computer screen. Some may come with a short on-screen safety warning.'),
  F('Instructions', 'instr_task', 'What to do', 'For each message, do what you would really do if it arrived on your own phone: tap the link if you would open it, or press "Ignore this message" ("Done with this message" when there is no link). If you open a link, you will see the page it leads to; use it as you normally would, or go back. Then rate how likely the message is a scam.'),
  F('Instructions', 'instr_safe', 'Safety note', 'Nothing here is real: links open practice pages inside this study, and nothing you type is saved or sent anywhere.'),
  F('Instructions', 'instr_practice', 'Practice notice', 'You will start with 4 practice messages that do not count.'),
  F('Comprehension', 'comp_title', 'Title', 'Before you start'),
  F('Comprehension', 'comp_retry', 'After a wrong answer', 'At least one answer was not right. Please read the instructions again and try once more.'),
  F('Phone', 'phone_header', 'Header', 'Messages'),
  F('Phone', 'sender', 'Sender line', 'Unknown sender'),
  F('Phone', 'ignore_button', 'Ignore button', 'Ignore this message'),
  F('Phone', 'back_button', 'Back button on the opened page', 'Back to message'),
  F('Phone', 'page_submit', 'Submit button on the opened page', 'Continue'),
  F('Warnings', 'w_banner', 'C2 banner', '⚠ This message may be a scam (potential smishing).'),
  F('Warnings', 'w_badge', 'C3 badge', '⚠ Flagged as a possible scam'),
  F('Warnings', 'w_medium', 'Tier Medium', '⚠ Review recommended'),
  F('Warnings', 'w_severe', 'Tier Severe', '⛔ Likely scam'),
  F('Warnings', 'w_cert', 'Certainty label ({level})', 'Detector certainty: {level}'),
  F('Warnings', 'w_cert_caption', 'Caption when certainty is not High', "Not fully certain. When in doubt, don't tap the link."),
  F('Questions', 'probe_q', 'Scam-likelihood question', 'How likely do you think this message is a scam?'),
  F('Questions', 'probe_lo', 'Left end', 'Definitely not a scam (0)'),
  F('Questions', 'probe_hi', 'Right end', 'Definitely a scam (100)'),
  F('Questions', 'probe_needed', 'Reminder', 'Move the slider to give your answer.'),
  F('Questions', 'readback_q', 'Tier read-back question', 'Which heading did the warning on this message show?'),
  F('Questions', 'readback_severe', 'Read-back option, Severe tier', 'Likely scam'),
  F('Questions', 'readback_medium', 'Read-back option, Medium tier', 'Review recommended'),
  F('Questions', 'readback_unsure', 'Read-back option, not sure', 'Not sure'),
  F('Phone', 'done_button', 'Button on a message with no link', 'Done with this message'),
  F('Questions', 'next_button', 'Next button', 'Next'),
  F('Timing', 'timeout_reminder', 'Reminder before the time limit', 'Please choose what you would do with this message.'),
  F('Attention', 'att1_text', 'Attention check after message 36', 'To show you are reading carefully, please move the slider to exactly 25.'),
  F('Item screen', 'sm_progress_main', 'Progress line, messages ({i}, {n})', 'Message {i} of {n}'),
  F('Item screen', 'sm_progress_practice', 'Progress line, practice ({i}, {n})', 'Practice message {i} of {n}'),
  F('Item screen', 'sm_progress_comp', 'Progress line, warning questions ({i}, {n})', 'Warning questions {i} of {n}'),
  F('Item screen', 'sm_progress_check', 'Progress line, attention check', 'Quick check'),
  F('Practice', 'sm_practice_done_title', 'After practice: title', 'Practice finished'),
  F('Practice', 'practice_done_body', 'After practice', 'The real messages start now. They work the same way as the practice messages.'),
  F('Practice', 'sm_comp_intro_title', 'Before the warning questions: title', 'Questions about the warnings'),
  F('Practice', 'sm_comp_intro_body', 'Before the warning questions', 'That was the last message. Next are 5 short screens, each showing a different style of warning you may have seen, with a few questions about it.'),
  F('Device', 'small_window', 'Shown when the window is too small', 'This study needs a desktop or laptop window at least 1024 by 700 pixels. Please make the window larger to continue.'),
  F('Consent', 'consent_draft_banner', 'Banner while the consent is not marked IRB-approved', 'Research-team pilot. This consent text is a draft awaiting IRB approval of an amendment; answers given now are test data and are not analyzed.')
];

// The approved consent (H26762, main study v1.3, approved 09/01/2026), word for word. It names Prolific and QuestionPro:
// hosting the task in this lab is item 7 of the amendment draft, so revise this text with the amendment.
const CONSENT = [
  'Title: Calibrated, Tactic-Attributed Warnings and User Susceptibility to SMS Phishing (Smishing): A Within-Subjects Behavioral Experiment. Principal Investigator: Benjamin M. Ampel. Sponsor: This study is internally funded by Georgia State University (Computer Information Systems). IRB Protocol #: H26762.',
  'You are being asked to take part in a research study. If you decide to take part, you will read a series of about 72 text messages on a computer and answer a few quick questions about each one, such as how suspicious it seems and what you would do next. Some of the messages will be shown with a short on-screen safety warning; others will not be. At the end, you will answer a few short questions about your experience. The study takes place entirely online through Prolific and QuestionPro, on your own desktop or laptop computer, in a single session lasting about 25 to 30 minutes.',
  'Some of the messages you see will be realistic examples of scam text messages, and some of the details about the purpose of the study will not be explained until after you finish. This is explained further below.',
  'Procedures. You will complete a single online session, about 25 to 30 minutes long, on a desktop or laptop computer. After you agree to take part, you will view about 72 short text messages, one at a time. For each message you will decide how you would respond (for example, ignoring it or tapping a link), and you will rate how suspicious the message seemed. Some messages will be shown with a short on-screen warning; others will not. Near the end, you will answer a few short questions about your experience. You must be 18 or older, live in the United States, read English fluently, and use a desktop or laptop computer to take part.',
  'Heads-up: some details come later. To keep your answers honest and natural, this study does not explain every detail up front. It includes realistic message examples, and some details about the study’s full purpose are shared with you at the end, not the beginning. If you were told everything up front, it would change how you answer, and the results would not be useful. Nothing you do in this study is risky: you will not be asked for any real passwords, account numbers, or personal information, and no real website links are ever opened. At the end, you will be told the parts that were held back and given tips about spotting scam texts.',
  'Compensation. You will be paid $6.00 (approximately $12 per hour) through Prolific when you finish the study. Payment does not depend on how you respond or on “getting answers right.” If you stop partway through, payment for partial completion follows Prolific’s standard policy.',
  'Risks. The risks of this study are very low. You might feel briefly surprised or uneasy when you learn at the end that some messages were realistic examples made for research; that feeling usually passes quickly, and the end-of-study information is there to explain everything and answer your questions. No real personal information is ever collected and no real links are ever opened, so there is no risk to your accounts or devices.',
  'Benefits. You may learn useful tips for spotting scam text messages. Your participation also helps researchers build better protections against scam texts for everyone.',
  'Confidentiality. This study does not collect your name, email, phone number, or any real account information. Your Prolific ID is used only to pay you; it is stored separately from your answers (scrambled/hashed) so your answers cannot be traced back to you. Your data is stored securely (encrypted), and only the research team can see it. When results are shared, your data is combined with other participants’ and de-identified. Your de-identified data is kept for three years after the study ends, per Georgia State University policy.',
  'Voluntary Participation and Withdrawal. You do not have to be in this study. You may skip questions or stop at any time without penalty and without losing any benefits you would otherwise have. If you stop, you will still be paid for your time. You may also withdraw your data after finishing by contacting the Principal Investigator with your Prolific ID.',
  'Contact Information. Contact Benjamin M. Ampel at bampel@gsu.edu with questions about the study. Contact the Georgia State University Institutional Review Board (Office of Research Integrity Assurance) at 404-413-3500 or irb@gsu.edu with questions about your rights as a research participant.'
];

// Debrief v1.2 (the amendment draft; approved v1.1 says the warnings came from a tool, which Option A makes untrue).
const DEBRIEF = 'Thank you for taking part. Now that you are finished, we want to explain a few details we held back earlier, and why.\n\n' +
  'What we held back, and why. Some of the text messages you saw were realistic examples of "smishing": scam text messages designed to trick people. If you chose to tap a link or respond, any page you saw was a simulated, fake landing page made only for this study. We did not tell you this at the start on purpose. If we had told you which messages were scams, or that we were measuring how people respond to scams, it would have changed how you answered. This is a common and approved practice in research, called incomplete disclosure.\n\n' +
  'Please know: nothing was at risk. The scam messages were simulated for research and could not harm you. No real website links were ever opened. We never collected real passwords, account numbers, or personal information: anything typed into a fake page was not transmitted, logged, or saved anywhere. There is nothing you need to do, and your responses say nothing about you as a person.\n\n' +
  'What we were really studying. We are testing whether different kinds of on-screen safety warnings help people notice and avoid scam texts. Some warnings were plain ("this might be a scam"). Others gave more detail, such as a risk level, how certain the warning was, or the scam "trick" the message used. The warnings were set up by the research team, not produced by a tool checking the messages as you saw them. About one message in six, scam or not, showed no warning at all, so that we could compare. Among the others, every scam message showed a warning, and some legitimate messages also showed a warning on purpose, so that we could study false alarms. The risk levels, certainty levels and scam "tricks" shown were chosen by the researchers in advance.\n\n' +
  'You can withdraw your data. Write to the study contact below with your Prolific ID; there is no penalty and no effect on your payment.\n\n' +
  'Tips for spotting real smishing. Be cautious with unexpected texts that create urgency. Do not tap links in texts from unknown senders; go to the company\'s official app or website instead. Never share passwords, codes, or account numbers by text. Watch for misspellings, strange web addresses, or numbers you do not recognize. Real warning tools also make mistakes: a warning, or the lack of one, is a prompt to check, not a final answer. In the US you can forward scam texts to 7726 (SPAM) and report them at reportfraud.ftc.gov.\n\n' +
  'Questions: Benjamin M. Ampel, bampel@gsu.edu. Your rights as a participant: Georgia State University IRB, 404-413-3500 or irb@gsu.edu.';

// Post-task survey (07_measures_instrument.md): IMC (f), the false-alarm tolerability item (d), minimal demographics (e).
// The IMC is an Oppenheimer-style check: the instruction asks for one specific option; pass = imc_choice is 'none'.
const pq = (id, text, type, extra = {}) => ({ id, text, type, required: true, showIf: 'always', conditions: [], sessions: [], ...extra });
const POST = [
  pq('imc_choice', 'Recent research on decision making shows that choices are affected by context. To help us understand how people read instructions, we are asking you to show that you read this paragraph carefully. Please ignore the question below and instead select the option "None of these". Thank you. Which of these activities do you do most often on your phone?', 'choice',
    { page: 1, options: [['social', 'Social media'], ['news', 'Reading news'], ['games', 'Playing games'], ['shopping', 'Shopping'], ['none', 'None of these']].map(([value, label]) => ({ value, label })) }),
  pq('fpr_tolerance_pct', 'Imagine an app that warns you about scam texts. Out of every 100 safe texts, how many false alarms would you still find acceptable before the warnings became annoying enough that you\'d start ignoring them?', 'number', { page: 2, min: 0, max: 100 }),
  pq('dem_age', 'Which age group are you in?', 'choice', { page: 3, options: [['18-44', '18–44'], ['45plus', '45 or older'], ['na', 'Prefer not to say']].map(([value, label]) => ({ value, label })) }),
  pq('dem_sms', 'Do you personally use a smartphone with text messaging (SMS, iMessage or RCS)?', 'choice', { page: 3, options: [['yes', 'Yes'], ['no', 'No']].map(([value, label]) => ({ value, label })) })
];

const num = (v, lo, hi) => { const x = Number(v); return v != null && v !== '' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const oneOf = (v, opts) => (opts.includes(v) ? v : null);

function validateItem(it, e, where) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(it.id || '')) e.push(`${where}: invalid stimulus ID.`);
  if (!['smishing', 'benign'].includes(it.label)) e.push(`${where} (${it.id}): label must be smishing or benign.`);
  if (typeof it.text !== 'string' || !it.text.trim() || it.text.length > 1200) e.push(`${where} (${it.id}): message text is required (up to 1,200 characters).`);
  if (it.alert) {
    if (!['Medium', 'Severe'].includes(it.tier) || !['High', 'Moderate', 'Low'].includes(it.certainty)) e.push(`${where} (${it.id}): an alerted item needs a tier and a certainty.`);
    if (typeof it.c5 !== 'string' || typeof it.c5p !== 'string' || Math.abs(it.c5.length - it.c5p.length) > 3) e.push(`${where} (${it.id}): the C5 and C5' lines must both exist and differ in length by at most 3 characters.`);
  }
  if (!PAGES.includes(it.page)) e.push(`${where} (${it.id}): unknown mock page "${it.page}".`);
}

export default {
  id: 'smishing',
  label: 'Smishing warnings (phone messages)',
  description: 'Text messages in a phone frame with on-screen warnings in six within-subject conditions (Latin square over stimulus groups), a tap-or-ignore decision with a local mock landing page, a scam-likelihood slider, and a tier read-back.',
  contentKeys: ['design', 'bank'],
  textFields,
  surveyRules: [],
  conditionsOf: () => CELLS,
  sessionCount: () => 1,
  // The cell is chosen when the session starts, after the panel's study ID (which gives the age stratum) is recorded.
  deferAssignment: true,

  defaultContent() {
    return {
      minutesPerSession: 30,
      consent: { approved: false, paragraphs: CONSENT, agreeLabel: 'I am 18 or older and I agree to take part in this study.' },
      enrollment: { open: false, domains: [], gapDays: 0, label: 'prolific', panel: { enabled: true, param: 'PROLIFIC_PID', completionUrl: '', screenOutUrl: '', label: 'prolific', keepId: false } },
      // Only the panel's study and session IDs: the Prolific ID itself is never kept (consent: stored hashed only).
      embedded: [{ name: 'study_id', source: 'url', param: 'STUDY_ID' }, { name: 'session_id', source: 'url', param: 'SESSION_ID' }],
      environment: { preload: false, fullscreen: false, desktopOnly: true, speechBrowser: false, micCheck: false, micRequired: false, headphoneCheck: false, headphoneFail: 'record', timingCheck: false, language: 'en-US' },
      design: {
        // Prolific study IDs per age stratum: one listing per stratum, each filtered by age on Prolific. A participant
        // whose study ID is not listed (for example a preview) goes to the stratum with fewer people so far.
        strata: { y: [], o: [] },
        trialSeconds: 90, reminderSeconds: 60, att1After: 36,
        comprehension: [
          { id: 'c1', q: 'What should you do with each message?', options: ['Do what I would really do if it arrived on my phone', 'Always tap the link', 'Always ignore it'], answer: 0 },
          { id: 'c2', q: 'If you tap a link, what happens?', options: ['A practice page inside this study opens', 'A real website opens', 'My phone receives a text'], answer: 0 },
          { id: 'c3', q: 'What happens to anything you type on an opened page?', options: ['It is not saved or sent anywhere', 'It is sent to the company in the message', 'It is saved with my answers'], answer: 0 }
        ]
      },
      bank: BANK,
      survey: { pre: [], post: POST },
      debrief: { title: 'About this study', body: DEBRIEF },
      text: { screenout_body: 'Thank you for your time. This study has ended for you.' }
    };
  },

  normalize(c, d) {
    c.design = { ...d.design, ...(c.design || {}) };
    c.design.strata = { y: [], o: [], ...(c.design.strata || {}) };
    if (!c.bank) c.bank = d.bank;
  },

  validate(c, e) {
    const b = c.bank;
    if (!b || !Array.isArray(b.items) || !Array.isArray(b.practice)) { e.push('The stimulus bank is missing.'); return; }
    const ids = new Set();
    b.items.forEach(it => { validateItem(it, e, 'Bank'); if (ids.has(it.id)) e.push(`Bank: "${it.id}" appears twice.`); ids.add(it.id); });
    for (const blk of BLOCKS) for (let g = 1; g <= 6; g++) {
      const cell = b.items.filter(x => x.block === blk && x.group === g);
      const sm = cell.filter(x => x.label === 'smishing'), bn = cell.filter(x => x.label === 'benign');
      if (sm.length !== 8 || bn.length !== 4) e.push(`Block ${blk}, group ${g}: needs 8 smishing and 4 benign messages (has ${sm.length} and ${bn.length}).`);
      if (!sm.every(x => x.alert)) e.push(`Block ${blk}, group ${g}: every smishing message must be alerted (Option A).`);
      const fa = bn.filter(x => x.alert).length;
      if (fa < 1 || fa > 2) e.push(`Block ${blk}, group ${g}: 1 or 2 of the benign messages must be alerted (has ${fa}).`);
    }
    if (b.practice.length !== PRACTICE_N) e.push(`The practice set needs ${PRACTICE_N} messages.`);
    b.practice.forEach(it => validateItem(it, e, 'Practice'));
    if (!b.practice.some(x => x.alert)) e.push('At least one practice message must carry a warning.');
    if (b.provisional && c.consent && c.consent.approved) e.push('The stimulus bank is provisional (heuristic cues, fake scores, unapproved brand map). Freeze the real bank before approving the consent.');
    const d = c.design || {};
    if (!Number.isInteger(d.trialSeconds) || d.trialSeconds < 20 || !Number.isInteger(d.reminderSeconds) || d.reminderSeconds >= d.trialSeconds) e.push('Trial timing: the reminder must come before the time limit.');
    if (!Array.isArray(d.comprehension) || d.comprehension.length < 1) e.push('Add at least one comprehension question.');
  },

  // A type-owned allocation: the age stratum comes from which Prolific listing the person came from; within it, the
  // (block, arm) cell with the fewest participants so far (write-once cond/ markers, which the engine adds), ties at random.
  async allocate(S, p, c) {
    const pre = p.test ? 'cond-test' : 'cond', count = async id => (await S.store.list(`${pre}/${id}/`)).length;
    const st = c.design.strata || {}, study = p.panel && p.panel.study;
    let stratum = Object.keys(STRATA).find(k => study && (st[k] || []).includes(study));
    if (!stratum) {
      const per = await Promise.all(Object.keys(STRATA).map(async s => (await Promise.all(CELLS.filter(x => x.startsWith(s + '-')).map(count))).reduce((a, b) => a + b, 0)));
      const min = Math.min(...per), opts = Object.keys(STRATA).filter((s, i) => per[i] === min);
      stratum = opts[Math.floor(Math.random() * opts.length)];
    }
    const cells = CELLS.filter(x => x.startsWith(stratum + '-')), counts = await Promise.all(cells.map(count));
    const min = Math.min(...counts), opts = cells.filter((x, i) => counts[i] === min);
    return opts[Math.floor(Math.random() * opts.length)];
  },

  buildPlan(p, session, c, rand, { seeded, shuffle }) {
    const cell = parseCell(p.condition) || parseCell(CELLS[0]);
    const items = c.bank.items.filter(x => x.block === cell.block);
    const rows = items.map(item => ({ item, cond: conditionFor(item.group, cell.arm) }));
    const order = orderTrials(rows, rand, shuffle);
    const fpExposure = rows.filter(r => r.item.label === 'benign' && r.item.alert && r.cond !== 'C1').length;
    const practice = c.bank.practice.map((item, i) => ({ index: i, practice: true, item, cond: 'C4', presentation: null }));
    const main = order.map((r, k) => ({ index: PRACTICE_N + k, practice: false, item: r.item, cond: r.cond, presentation: k + 1 }));
    const compOrder = shuffle(COMP_CONDS.slice(), rand), att2At = Math.floor(rand() * compOrder.length);
    const comp = compOrder.map((cond, k) => ({ index: PRACTICE_N + main.length + k, kind: 'comp', practice: false, item: COMP_REF, cond, presentation: null, att2: k === att2At }));
    return {
      stratum: STRATA[cell.stratum], block: cell.block, arm: cell.arm, fpExposure, provisional: !!c.bank.provisional,
      att1Index: PRACTICE_N + (c.design.att1After || 36),
      links: Object.fromEntries([...c.bank.practice, ...items].map(x => [x.id, linkFor(x.id, seeded)])),
      trials: [...practice, ...main, ...comp], practice: null, surveyCtx: {}
    };
  },

  // What the browser gets: the message as displayed and the warning to draw. Never the label, cue family or condition.
  publicTrial(t, plan) {
    if (t.kind === 'comp') return { kind: 'comp', warning: warningFor(t.cond, t.item), items: COMP_ITEMS, att2: t.att2 ? ATT2 : null, labels: AGREE7 };
    const it = t.item, link = (plan.links || {})[it.id] || 'https://sms-link.example/xxxxxx';
    return { practice: !!t.practice, text: it.text.split(TOKEN).join(link), link: it.text.includes(TOKEN) ? link : null,
      warning: warningFor(t.cond, it), page: it.page, brand: it.brand, att1Before: t.index === plan.att1Index };
  },
  publicPlanExtras: () => ({ practiceCount: PRACTICE_N }),
  // Timing and the comprehension questions for the browser. The comprehension answers are task mechanics stated in the
  // instructions, not stimulus labels, so the browser grades them; the result is saved with the first practice trial.
  // The debrief must reach the finish page: the study uses deception, and the debrief is its full disclosure.
  publicContent: c => ({ smishing: { trialSeconds: c.design.trialSeconds, reminderSeconds: c.design.reminderSeconds, comprehension: c.design.comprehension }, debrief: c.debrief }),

  cleanTrialData(d, t) {
    d = d && typeof d === 'object' ? d : {};
    if (t && t.kind === 'comp') {
      const lik = v => { const x = num(v, 1, 7); return x == null ? null : Math.round(x); };
      return { comp: Object.fromEntries(COMP_ITEMS.map(([id]) => [id, lik(d.comp && d.comp[id])])), att2: t.att2 ? lik(d.att2) : null, selfTest: d.selfTest === true || undefined };
    }
    const events = Array.isArray(d.events) ? d.events.slice(0, 400).filter(x => x && EVENTS.includes(x.e))
      .map(x => ({ e: x.e, ms: num(x.ms, 0, 864e5), ...(x.e === 'field_input' ? { count: num(x.count, 0, 1e5) } : {}) })) : [];
    const comp = d.comprehension && typeof d.comprehension === 'object'
      ? { attempts: num(d.comprehension.attempts, 0, 5), passed: d.comprehension.passed === true, wrong: num(d.comprehension.wrong, 0, 20) } : null;
    return {
      events, probe: num(d.probe, 0, 100), readback: oneOf(d.readback, READBACK), timedOut: d.timedOut === true,
      fieldInputs: num(d.fieldInputs, 0, 1e5) || 0, browserBack: num(d.browserBack, 0, 1000) || 0,
      att1: d.att1 == null ? null : num(d.att1, 0, 100), ...(comp ? { comprehension: comp } : {}),
      viewport: d.viewport ? { w: num(d.viewport.w, 0, 20000), h: num(d.viewport.h, 0, 20000) } : null,
      selfTest: d.selfTest === true || undefined
    };
  },

  // Stored with each trial: the stimulus and design as shown, so later content edits never change the record.
  recordFields(t, plan) {
    const it = t.item, w = warningFor(t.cond, it);
    if (t.kind === 'comp') return { kind: 'comp', stimulusId: it.id, cond: t.cond, practice: false, presentation: null, warningKind: w.kind, att2Here: !!t.att2,
      stratum: plan.stratum, block: plan.block, arm: plan.arm, fpExposure: plan.fpExposure, provisional: !!plan.provisional };
    return { stimulusId: it.id, trueLabel: it.label, cond: t.cond, practice: !!t.practice, presentation: t.presentation, group: it.group,
      alert: !!it.alert, tier: it.tier, certainty: it.certainty, cue: it.cue, page: it.page, warningKind: w.kind,
      stratum: plan.stratum, block: plan.block, arm: plan.arm, fpExposure: plan.fpExposure, provisional: !!plan.provisional };
  },

  // The comprehension gate (first practice message): a second failed attempt ends the study for this participant.
  screenOutReason(rec) {
    const comp = rec.data && rec.data.comprehension;
    return comp && comp.passed === false && comp.attempts >= 2 ? 'comprehension' : null;
  },

  // Analysis columns (definitions: static/lab/CODEBOOK.md, "Smishing warning studies"). Names follow analysis_skeleton.R.
  trialRow(r) {
    const comp = r.kind === 'comp', cd = comp ? (r.data && r.data.comp) || {} : null;
    const blanks = { comp1: '', comp2: '', comp3: '', comp4: '', comp5: '', comprehension_score: '', att2_value: '', att2_pass: '' };
    if (comp) {
      const vals = COMP_ITEMS.map(([id]) => cd[id]), scored = vals.map((v, i) => (v == null ? null : i === 3 ? 8 - v : v));
      const all = scored.every(v => v != null), a2 = r.data && r.data.att2;
      return { row_kind: 'comprehension', stimulus_id: '', true_label: '', condition: r.cond, is_practice: 0, trial_index: '', age_stratum: r.stratum || '',
        stim_block: r.block || '', arm: r.arm ?? '', warning_kind: r.warningKind, fp_exposure_count: r.fpExposure ?? '', provisional_bank: r.provisional ? 1 : 0,
        comp1: vals[0] ?? '', comp2: vals[1] ?? '', comp3: vals[2] ?? '', comp4: vals[3] ?? '', comp5: vals[4] ?? '',
        comprehension_score: all ? (scored.reduce((x, y) => x + y, 0) / 5).toFixed(2) : '',
        att2_value: r.att2Here ? (a2 ?? '') : '', att2_pass: r.att2Here ? (a2 == null ? '' : Number(a2 === 2)) : '' };
    }
    const d = r.data || {}, ev = Array.isArray(d.events) ? d.events : [], at = name => { const x = ev.find(e => e.e === name); return x ? x.ms : ''; };
    const visit = ev.some(e => e.e === 'link_tap'), engage = ev.some(e => e.e === 'field_focus' || e.e === 'field_input' || e.e === 'submit'), disclose = ev.some(e => e.e === 'submit');
    const first = ev.find(e => e.e === 'link_tap' || e.e === 'ignore'), tierShown = r.warningKind === 'tier';
    const want = tierShown ? r.tier : null;
    return {
      row_kind: 'message', ...blanks,
      stimulus_id: r.stimulusId, true_label: r.trueLabel === 'smishing' ? 1 : 0, condition: r.cond, is_practice: r.practice ? 1 : 0,
      trial_index: r.presentation ?? '', age_stratum: r.stratum || '', stim_block: r.block || '', arm: r.arm ?? '', stim_group: r.group ?? '',
      alert: r.alert ? 1 : 0, warning_shown: r.warningKind === 'none' ? 0 : 1, warning_kind: r.warningKind, tier_shown: tierShown ? r.tier : '',
      certainty_shown: tierShown ? r.certainty : '', cue_family: r.alert ? (r.cue || '') : '', fp_alert: r.trueLabel === 'benign' && r.warningKind !== 'none' ? 1 : 0,
      mock_page: r.page, visited: Number(visit), engaged: Number(engage), disclosed: Number(disclose),
      funnel_stage: disclose ? 3 : engage ? 2 : visit ? 1 : 0, ignored: Number(ev.some(e => e.e === 'ignore')),
      decision: first ? (first.e === 'link_tap' ? 'visit' : 'ignore') : (d.timedOut ? 'no_action' : ''), rt_ms: first ? first.ms : '',
      link_tap_ms: at('link_tap'), field_focus_ms: at('field_focus'), submit_ms: at('submit'), back_to_message: Number(ev.some(e => e.e === 'back_to_message')),
      field_input_count: d.fieldInputs ?? 0, suspicion_prob: d.probe == null ? '' : (d.probe / 100).toFixed(2),
      tier_readback: tierShown ? (d.readback || '') : '', tier_readback_correct: want && d.readback ? Number(d.readback === want) : '',
      timeout: d.timedOut ? 1 : 0, browser_back: d.browserBack || 0, fp_exposure_count: r.fpExposure ?? '',
      att1_value: d.att1 ?? '', att1_pass: d.att1 == null ? '' : Number(Math.abs(d.att1 - 25) <= 2),
      comprehension_attempts: d.comprehension ? d.comprehension.attempts : '', comprehension_passed: d.comprehension ? Number(d.comprehension.passed) : '',
      provisional_bank: r.provisional ? 1 : 0
    };
  },

  // Self-test: a simulated answer for a trial, and the checks that the exported row matches it.
  simulate(trial, plan, rand) {
    if (trial.kind === 'comp') return { comp: Object.fromEntries(COMP_ITEMS.map(([id]) => [id, 1 + Math.floor(rand() * 7)])), ...(trial.att2 ? { att2: 2 } : {}), selfTest: true };
    const tap = rand() < 0.4, ev = [{ e: 'render', ms: 0 }];
    if (tap) { ev.push({ e: 'link_tap', ms: 1500 }, { e: 'mock_view', ms: 1520 }); if (rand() < 0.5) ev.push({ e: 'field_focus', ms: 2500 }, { e: 'field_input', ms: 2600, count: 3 }); ev.push({ e: 'back_to_message', ms: 3000 }); }
    ev.push({ e: 'ignore', ms: tap ? 3200 : 1800 }, { e: 'probe', ms: 4000 }, { e: 'next', ms: 5000 });
    return { events: ev, probe: Math.round(rand() * 100), ...(trial.warning && trial.warning.kind === 'tier' ? { readback: trial.warning.tier } : {}),
      fieldInputs: ev.filter(e => e.e === 'field_input').length * 3, selfTest: true, ...(trial.att1Before ? { att1: 25 } : {}),
      ...(trial.index === 0 ? { comprehension: { attempts: 1, passed: true, wrong: 0 } } : {}) };
  },
  checkRow(row, sent) {
    if (row.row_kind === 'comprehension') return COMP_ITEMS.every(([id], i) => row['comp' + (i + 1)] === String(sent.comp[id])) ? [] : ['comprehension answers'];
    const problems = [], tap = sent.events.some(e => e.e === 'link_tap');
    if (row.visited !== String(Number(tap))) problems.push('visited');
    if (row.suspicion_prob !== (sent.probe / 100).toFixed(2)) problems.push('suspicion');
    if (row.engaged !== String(Number(sent.events.some(e => e.e === 'field_focus')))) problems.push('engaged');
    return problems;
  },
  checkSession(rows) {
    const main = rows.filter(r => r.is_practice === '0' && r.row_kind === 'message');
    const byCond = {}; main.forEach(r => { byCond[r.condition] = (byCond[r.condition] || 0) + 1; });
    return [
      [main.length === 72, `72 main trials (got ${main.length})`],
      [CONDS.every(cn => byCond[cn] === 12), `12 trials per condition ${JSON.stringify(byCond)}`],
      [CONDS.every(cn => main.filter(r => r.condition === cn && r.true_label === '1').length === 8), '8 smishing trials per condition'],
      [rows.filter(r => r.row_kind === 'comprehension').length === 5, 'five comprehension screens (C2-C5p)']
    ];
  }
};
