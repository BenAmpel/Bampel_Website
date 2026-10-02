// Study type: alert triage with AI advice (the verification study, Clark).
// Participants triage security alerts by opening evidence panels, with an AI assistant whose behavior
// (right/wrong, confidence, manipulated) is scheduled per session. Conditions: ai_first,
// evidence_first, control. Participant renderer: static/lab/engine/types/alert-triage.js.
import { ALERTS, PRACTICE } from './alert-triage-alerts.mjs';

const CONDITIONS = ['ai_first', 'evidence_first', 'control'];
export const AI_TYPES = {
  accurate: 'Right, high confidence',
  uncertain_correct: 'Right, low confidence',
  incorrect: 'Wrong, high confidence',
  uncertain_incorrect: 'Wrong, low confidence',
  manipulated: 'Wrong, high confidence, cites only the misleading evidence'
};
// Default design (Clark, Section 4): accurate AI, then mostly accurate, then disrupted, then removed.
const DEFAULT_AI = { 1: Array(8).fill('accurate'), 2: [...Array(7).fill('accurate'), 'uncertain_correct'], 3: ['accurate', 'accurate', 'accurate', 'accurate', 'incorrect', 'incorrect', 'uncertain_incorrect', 'manipulated'], 4: null };
function defaultSessionAlerts(session) {
  const families = [...new Set(ALERTS.map(a => a.family))];
  return families.map((fam, f) => ALERTS.find(a => a.family === fam && a.variant === (f + session - 1) % 4).id);
}
const AGREE7 = ['Strongly disagree', 'Disagree', 'Somewhat disagree', 'Neither agree nor disagree', 'Somewhat agree', 'Agree', 'Strongly agree'];
const scale7 = (id, text, showIf = 'ai') => ({ id, text, type: 'scale', n: 7, lo: AGREE7[0], hi: AGREE7[6], labels: AGREE7, required: false, showIf, sessions: [] });

const F = (group, key, label, def) => ({ group, key, label, def });
const textFields = [
  F('Sign-in', 'login_title', 'Page title', 'Security alert study'),
  F('Instructions', 'instr_intro', 'Opening ({n} = alerts this session)', 'You are a security analyst reviewing alerts from a company network. You will see {n} alerts. Each alert has a short summary and several sources of evidence, such as network activity and user behavior.'),
  F('Instructions', 'instr_ai_first', 'AI-first group, sessions with the AI', 'For each alert, an AI assistant will show its assessment first. Then review whatever evidence you want and make your decision. The AI assistant is helpful but not always correct.'),
  F('Instructions', 'instr_evidence_first', 'Evidence-first group, sessions with the AI', 'For each alert, first review whatever evidence you want and record your initial assessment. Then an AI assistant will show its assessment, and you will make your final decision. You can look at the evidence again before deciding. The AI assistant is helpful but not always correct.'),
  F('Instructions', 'instr_none', 'Sessions without the AI', 'For each alert, review whatever evidence you want and make your decision.'),
  F('Instructions', 'instr_ai_removed', 'AI groups, sessions after the AI is removed', 'In this session there is no AI assistant. For each alert, review whatever evidence you want and make your decision.'),
  F('Instructions', 'instr_outro', 'Closing', 'Open evidence by clicking its tab. Open as much or as little as you think you need. About half of the alerts are malicious.'),
  F('Instructions', 'instr_practice', 'Practice notice', 'You will start with one practice alert that does not count.'),
  F('Item screen', 'progress_trial', 'Progress line ({session}, {i}, {n})', 'Session {session} · Alert {i} of {n}'),
  F('Item screen', 'progress_practice', 'Progress line, practice', 'Practice alert'),
  F('Item screen', 'submit_button', 'Submit button', 'Submit decision'),
  F('Alert screen', 'severity_label', 'Severity label', 'Severity'),
  F('Alert screen', 'evidence_placeholder', 'Before any evidence is opened', 'Select an evidence source above to view it.'),
  F('Alert screen', 'label_malicious', 'Answer: malicious', 'Malicious'),
  F('Alert screen', 'label_benign', 'Answer: benign', 'Benign'),
  F('Alert screen', 'q_initial', 'Initial assessment question (evidence-first)', 'Your initial assessment: is this alert malicious or benign?'),
  F('Alert screen', 'q_initial_conf', 'Initial confidence question', 'How confident are you in your initial assessment?'),
  F('Alert screen', 'lock_button', 'Button that reveals the AI (evidence-first)', 'Record initial assessment and see the AI assessment'),
  F('Alert screen', 'q_final', 'Decision question', 'Your decision: is this alert malicious or benign?'),
  F('Alert screen', 'q_final_two', 'Decision question after an initial assessment', 'Your final decision: is this alert malicious or benign?'),
  F('Alert screen', 'q_conf', 'Confidence question', 'How confident are you?'),
  F('Alert screen', 'q_influence', 'Influential-information question', 'Which information most influenced your decision? Select all that apply.'),
  F('Alert screen', 'infl_summary', 'Option: the summary', 'The alert summary'),
  F('Alert screen', 'infl_ai', 'Option: the AI', 'The AI assessment'),
  F('Confidence scale', 'conf_low', 'Left end', '0 · Guessing'),
  F('Confidence scale', 'conf_high', 'Right end', 'Certain · 100'),
  F('Confidence scale', 'conf_help', 'Help text', 'Click or tap anywhere on the line to set your confidence. You can adjust it before you continue.'),
  F('Confidence scale', 'conf_needed', 'Reminder when unanswered', 'Set your confidence on the line to continue.'),
  F('AI assistant', 'ai_label', 'Box heading', 'AI assistant assessment'),
  F('AI assistant', 'ai_confidence', 'Confidence ({confidence})', '{confidence}% confidence'),
  F('AI assistant', 'ai_uncertain_prefix', 'Added before the explanation on low-confidence alerts', 'The evidence is mixed.'),
  F('AI assistant', 'ai_manipulated_suffix', 'Added after the explanation on manipulated alerts', 'No other indicators in this alert are notable.'),
  F('Practice', 'practice_done_body', 'After practice: text', 'The real alerts start now. They will look the same as the practice alert.'),
  F('End of session', 'done_next', 'Next session ({date})', 'Your next session opens on {date}. Sign in the same way each week.')
];

const str = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const oneOf = (v, opts) => opts.includes(v) ? v : null;
const jsonSize = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };
const alertName = a => a && a.id === 'practice' ? 'Practice alert' : `Alert "${(a && (a.title || a.id)) || '?'}"`;

function validateAlert(a, e, isPractice) {
  const where = alertName(a);
  if (!str(a.title, 200) || !str(a.summary, 1500) || !str(a.severity, 40)) e.push(`${where}: title, severity, and summary are required.`);
  if (!['malicious', 'benign'].includes(a.truth)) e.push(`${where}: the correct answer must be malicious or benign.`);
  if (!Array.isArray(a.panels) || a.panels.length < 1 || a.panels.length > 6) { e.push(`${where}: needs 1 to 6 evidence panels.`); return; }
  const keys = new Set();
  a.panels.forEach((p, i) => {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(p.key || '')) e.push(`${where}, evidence ${i + 1}: the variable name must start with a letter and use only lowercase letters, numbers, and underscores.`);
    else if (keys.has(p.key)) e.push(`${where}: evidence variable name "${p.key}" is used twice.`);
    keys.add(p.key);
    if (!str(p.label, 80) || !str(p.text, 3000)) e.push(`${where}, evidence ${i + 1}: needs a tab label and text.`);
    if (!['malicious', 'benign', 'neutral'].includes(p.supports)) e.push(`${where}, evidence ${i + 1}: "points to" must be malicious, benign, or neither.`);
  });
  if (!Array.isArray(a.misleadingPanels) || !a.misleadingPanels.every(k => keys.has(k))) e.push(`${where}: misleading panels must be among its evidence panels.`);
  if (!str(a.aiRationale?.correct, 1500)) e.push(`${where}: the AI explanation for when the AI is right is required.`);
  if (!isPractice && !str(a.aiRationale?.incorrect, 1500)) e.push(`${where}: the AI explanation for when the AI is wrong is required.`);
}

function aiFor(alert, type, rand, c) {
  if (!type) return null;
  const k = c.design.aiConfidence, t = c.text, other = alert.truth === 'malicious' ? 'benign' : 'malicious';
  const hi = () => k.highMin + Math.floor(rand() * (k.highMax - k.highMin + 1));
  const lo = () => k.lowMin + Math.floor(rand() * (k.lowMax - k.lowMin + 1));
  switch (type) {
    case 'accurate': return { verdict: alert.truth, confidence: hi(), rationale: alert.aiRationale.correct };
    case 'uncertain_correct': return { verdict: alert.truth, confidence: lo(), rationale: t.ai_uncertain_prefix + ' ' + alert.aiRationale.correct };
    case 'incorrect': return { verdict: other, confidence: hi(), rationale: alert.aiRationale.incorrect };
    case 'uncertain_incorrect': return { verdict: other, confidence: lo(), rationale: t.ai_uncertain_prefix + ' ' + alert.aiRationale.incorrect };
    case 'manipulated': return { verdict: other, confidence: hi(), rationale: alert.aiRationale.incorrect + ' ' + t.ai_manipulated_suffix };
    default: return null;
  }
}
const publicAlert = a => ({ title: a.title, severity: a.severity, summary: a.summary, panels: a.panels.map(x => ({ key: x.key, label: x.label, text: x.text })) });

export default {
  id: 'alert-triage',
  label: 'Alert triage with AI advice',
  description: 'Participants triage security alerts by opening evidence panels, with an AI assistant whose accuracy, confidence, and manipulation are scheduled per session. Three conditions: AI first, evidence first, control.',
  contentKeys: ['design', 'alerts', 'practice'],
  textFields,
  surveyRules: [['ai', 'Only in sessions with the AI'], ['no_ai', 'Only in sessions without the AI'], ['after_ai', 'Only after the AI is removed (AI groups)']],
  surveyRule(rule, ctx) {
    if (rule === 'ai') return ctx.mode !== 'none';
    if (rule === 'no_ai') return ctx.mode === 'none';
    if (rule === 'after_ai') return !!ctx.aiRemoved;
    return true;
  },
  conditionsOf: () => CONDITIONS,
  sessionCount: c => c.design.sessions.length,
  editorMeta: () => ({ aiTypes: AI_TYPES }),

  defaultContent() {
    return {
      minutesPerSession: 20,
      consent: {
        approved: false,
        paragraphs: [
          'This study examines how people review cybersecurity alerts with and without an AI assistant. It has four sessions, about one week apart, each taking about {minutes} minutes.',
          'In each session you will review short security alerts, look at the evidence you choose, and decide whether each alert is malicious or benign. Some sessions include an AI assistant. The AI assistant is part of the study and is not always correct.',
          'While you work, the page records your answers and how you reached them: which evidence you open and for how long, timing, mouse movement, clicks, scrolling, and typing rhythm. It does not record which keys you press, and it does not use your camera or microphone. Your email is used to keep your weekly sessions together and to award extra credit. It is stored separately from your answers, which are stored under a study ID, not your name or email.',
          'Participation is voluntary. You may skip the study or stop at any time without penalty.',
          'Questions: Dr. Benjamin Ampel, Georgia State University, bampel@gsu.edu.'
        ],
        agreeLabel: 'I am 18 or older and I agree to participate.'
      },
      enrollment: { open: true, domains: ['gsu.edu', 'student.gsu.edu'], gapDays: 6, label: 'self-signup' },
      survey: {
        pre: [
          { id: 'experience_years', text: 'How many years of cybersecurity work or study experience do you have?', type: 'choice', required: false, showIf: 'always', sessions: [1],
            options: ['None', 'Less than 1', '1–2', '3–5', 'More than 5'].map(v => ({ value: v, label: v })) },
          { id: 'role', text: 'Which best describes you?', type: 'choice', required: false, showIf: 'always', sessions: [1],
            options: [['student', 'Student'], ['analyst', 'Security analyst or SOC staff'], ['it', 'Other IT role'], ['other', 'Other']].map(([value, label]) => ({ value, label })) },
          { id: 'alert_familiarity', text: 'How familiar are you with reviewing security alerts?', type: 'scale', n: 5, lo: 'Not at all familiar', hi: 'Extremely familiar',
            labels: ['Not at all familiar', 'Slightly familiar', 'Moderately familiar', 'Very familiar', 'Extremely familiar'], required: false, showIf: 'always', sessions: [1] },
          { id: 'ai_use', text: 'How often do you use AI tools (such as chat assistants) for work or study?', type: 'scale', n: 5, lo: 'Never', hi: 'Daily',
            labels: ['Never', 'Less than once a month', 'A few times a month', 'A few times a week', 'Daily'], required: false, showIf: 'always', sessions: [1] }
        ],
        post: [
          scale7('trust_1', '"I trusted the AI assistant\'s assessments in this session."'),
          scale7('trust_2', '"The AI assistant was reliable."'),
          scale7('reliance_1', '"I relied on the AI assistant to make my decisions."'),
          { id: 'no_ai_difficulty', text: 'How difficult was it to decide without the AI assistant in this session?', type: 'scale', n: 7, lo: 'Not at all difficult', hi: 'Extremely difficult',
            labels: ['Not at all difficult', 'Slightly difficult', 'Somewhat difficult', 'Moderately difficult', 'Quite difficult', 'Very difficult', 'Extremely difficult'], required: false, showIf: 'after_ai', sessions: [] },
          // Paas (1992) mental-effort scale, with its verbal labels.
          { id: 'mental_effort', text: 'How much mental effort did this session take?', type: 'scale', n: 9, lo: 'Very, very low', hi: 'Very, very high',
            labels: ['Very, very low', 'Very low', 'Low', 'Rather low', 'Neither low nor high', 'Rather high', 'High', 'Very high', 'Very, very high'], required: false, showIf: 'always', sessions: [] }
        ]
      },
      design: {
        practice: true,
        counterbalance: { panels: true, answers: true },
        aiConfidence: { highMin: 85, highMax: 95, lowMin: 52, lowMax: 59 },
        sessions: [1, 2, 3, 4].map(s => ({ alerts: defaultSessionAlerts(s), ai: DEFAULT_AI[s] }))
      },
      alerts: ALERTS,
      practice: PRACTICE
    };
  },

  normalize(c, d) {
    c.design = c.design || structuredClone(d.design);
    c.design.aiConfidence = { ...d.design.aiConfidence, ...(c.design.aiConfidence || {}) };
    c.design.counterbalance = { ...d.design.counterbalance, ...(c.design.counterbalance || {}) };
    if (c.design.practice == null) c.design.practice = true;
    for (const a of c.alerts || []) if (!a.family) a.family = a.id;
  },

  validate(c, e) {
    const ids = new Set();
    if (!Array.isArray(c.alerts) || !c.alerts.length) e.push('Add at least one alert.');
    else c.alerts.forEach(a => {
      if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(a.id || '')) e.push(`${alertName(a)}: invalid ID.`);
      else if (ids.has(a.id)) e.push(`Two alerts share the ID "${a.id}".`);
      ids.add(a.id);
      if (!str(a.family, 40)) e.push(`${alertName(a)}: the alert type (used to group alerts in analysis) is required.`);
      validateAlert(a, e, false);
    });
    if (!c.practice) e.push('The practice alert is missing.'); else validateAlert(c.practice, e, true);
    const d = c.design;
    if (!d || !Array.isArray(d.sessions) || d.sessions.length < 1 || d.sessions.length > 12) e.push('The study needs 1 to 12 sessions.');
    else d.sessions.forEach((s, i) => {
      const where = `Session ${i + 1}`;
      if (!Array.isArray(s.alerts) || !s.alerts.length || s.alerts.length > 40) { e.push(`${where}: choose 1 to 40 alerts.`); return; }
      if (new Set(s.alerts).size !== s.alerts.length) e.push(`${where}: an alert is listed twice.`);
      const missing = s.alerts.filter(id => !ids.has(id));
      if (missing.length) e.push(`${where}: uses alerts that no longer exist (${missing.join(', ')}).`);
      if (s.ai != null) {
        if (!Array.isArray(s.ai) || s.ai.length !== s.alerts.length) e.push(`${where}: the AI behaviors must add up to the number of alerts (${s.alerts.length}).`);
        else if (!s.ai.every(t => t in AI_TYPES)) e.push(`${where}: unknown AI behavior.`);
      }
    });
    const k = d && d.aiConfidence;
    if (!k || !intIn(k.highMin, 50, 100) || !intIn(k.highMax, 50, 100) || !intIn(k.lowMin, 50, 100) || !intIn(k.lowMax, 50, 100) || k.highMin > k.highMax || k.lowMin > k.lowMax)
      e.push('AI confidence ranges must be whole numbers from 50 to 100, with the lowest no higher than the highest.');
    if (typeof d?.practice !== 'boolean') e.push('Choose whether session 1 starts with a practice alert.');
    if (!d?.counterbalance || typeof d.counterbalance.panels !== 'boolean' || typeof d.counterbalance.answers !== 'boolean') e.push('Choose the counterbalancing settings.');
  },

  // A participant's session: alert order and AI behaviors shuffled with a seed from their ID; panel and
  // answer order counterbalanced per participant (fixed across sessions).
  buildPlan(p, session, c, rand, { seeded, shuffle, studyId }) {
    const spec = c.design.sessions[session - 1];
    const usesAI = p.condition !== 'control' && Array.isArray(spec.ai);
    const aiRemoved = p.condition !== 'control' && !usesAI && c.design.sessions.slice(0, session - 1).some(x => Array.isArray(x.ai));
    const mode = usesAI ? p.condition : 'none';
    const order = shuffle(spec.alerts.map(id => c.alerts.find(a => a.id === id)), rand);
    const types = usesAI ? shuffle(spec.ai, rand) : order.map(() => null);
    const cb = c.design.counterbalance || {}, pr = seeded(`${p.code}|${studyId}|cb`), turn = Math.floor(pr() * 1e6), flip = pr() < 0.5;
    const rotate = a => { if (!cb.panels || !a) return a; const k = turn % a.panels.length; a.panels = a.panels.slice(k).concat(a.panels.slice(0, k)); return a; };
    const practice = session === 1 && c.design.practice ? rotate(structuredClone(c.practice)) : null;
    return {
      mode, aiRemoved, surveyCtx: { mode, aiRemoved },
      answerOrder: cb.answers && flip ? ['benign', 'malicious'] : ['malicious', 'benign'],
      trials: order.map((a, i) => ({ index: i, alertId: a.id, aiType: types[i], ai: aiFor(a, types[i], rand, c), alert: rotate(structuredClone(a)) })),
      practice: practice ? { alert: practice, ai: mode !== 'none' ? { verdict: practice.truth, confidence: 90, rationale: practice.aiRationale.correct } : null } : null
    };
  },

  // What the browser gets for one trial: no IDs, answer keys, or panel support codes.
  publicTrial(t, plan) {
    const a = t.alert || t, ai = t.alert ? t.ai : plan.practiceAI;   // older plans stored the practice alert bare
    return { alert: publicAlert(a), ai: ai ? { verdict: ai.verdict, confidence: ai.confidence, rationale: ai.rationale } : null };
  },
  publicPlanExtras: plan => ({ mode: plan.mode, aiRemoved: !!plan.aiRemoved, answerOrder: plan.answerOrder || ['malicious', 'benign'] }),

  cleanTrialData(d, t) {
    d = d && typeof d === 'object' ? d : {};
    if (!t.alertId) return { selfTest: d.selfTest === true || undefined };   // practice: nothing is scored
    const keys = t.alert.panels.map(x => x.key), J = ['malicious', 'benign'];
    const step = x => x && typeof x === 'object' ? { judgment: oneOf(x.judgment, J), confidence: num(x.confidence, 0, 100), rtMs: num(x.rtMs, 0, 864e5) } : null;
    const fin = step(d.final) || {};
    fin.influential = Array.isArray(d.final?.influential) ? d.final.influential.filter(k => keys.includes(k) || k === 'summary' || k === 'ai').slice(0, 20) : [];
    const opens = Array.isArray(d.evidence?.opens) ? d.evidence.opens.slice(0, 1000).filter(o => o && keys.includes(o.panel))
      .map(o => ({ panel: o.panel, atMs: num(o.atMs, 0, 864e5), dwellMs: num(o.dwellMs, 0, 864e5), hiddenMs: num(o.hiddenMs, 0, 864e5) || 0, afterAI: !!o.afterAI })) : [];
    const answerLog = Array.isArray(d.answerLog) ? d.answerLog.slice(0, 1000).map(a => ({ atMs: num(a?.atMs, 0, 864e5), name: typeof a?.name === 'string' ? a.name.slice(0, 40) : null,
      value: Array.isArray(a?.value) ? a.value.slice(0, 20).map(x => String(x).slice(0, 40)) : typeof a?.value === 'number' ? a.value : String(a?.value ?? '').slice(0, 200) })) : [];
    const small = (v, max) => v && typeof v === 'object' && jsonSize(v) <= max ? v : null;
    return {
      mode: oneOf(d.mode, ['ai_first', 'evidence_first', 'none']), aiShownAtMs: num(d.aiShownAtMs, 0, 864e5),
      initial: step(d.initial), final: fin, evidence: { opens, unique: [...new Set(opens.map(o => o.panel))] },
      answerLog, traces: small(d.traces, 50000),
      viewport: d.viewport ? { w: num(d.viewport.w, 0, 20000), h: num(d.viewport.h, 0, 20000) } : null,
      device: small(d.device, 4000), selfTest: d.selfTest === true || undefined
    };
  },

  // Stored with each trial: the alert and answer key as scored.
  recordFields(t, plan) {
    const a = t.alert;
    return { alertId: t.alertId, aiType: t.aiType, ai: t.ai, answerOrder: plan.answerOrder || ['malicious', 'benign'],
      alert: { id: a.id, family: a.family, variant: a.variant, truth: a.truth, title: a.title, misleadingPanels: a.misleadingPanels, panels: a.panels.map(x => ({ key: x.key, supports: x.supports })) } };
  },

  // Type-specific analysis columns (definitions: static/lab/CODEBOOK.md).
  trialRow(r) {
    const a = r.alert, d = r.data || {}, opens = Array.isArray(d.evidence?.opens) ? d.evidence.opens : [];
    const keys = [...new Set(opens.map(o => o.panel))], aiAt = d.aiShownAtMs;
    const contra = r.ai ? a.panels.filter(x => x.supports !== 'neutral' && x.supports !== r.ai.verdict).map(x => x.key) : [];
    const fin = d.final || {}, ini = d.initial || {};
    const row = {
      alert_id: r.alertId, family: a.family, truth: a.truth, mode: d.mode || '',
      ai_type: r.aiType || '', ai_verdict: r.ai?.verdict || '', ai_confidence: r.ai?.confidence ?? '', ai_shown_at_ms: aiAt ?? '',
      initial_judgment: ini.judgment || '', initial_confidence: ini.confidence ?? '', initial_rt_ms: ini.rtMs ?? '',
      final_judgment: fin.judgment || '', final_confidence: fin.confidence ?? '', final_rt_ms: fin.rtMs ?? '',
      correct: fin.judgment ? Number(fin.judgment === a.truth) : '', agree_ai: r.ai && fin.judgment ? Number(fin.judgment === r.ai.verdict) : '',
      changed_initial_to_final: ini.judgment && fin.judgment ? Number(ini.judgment !== fin.judgment) : '',
      switched_to_ai: r.ai && ini.judgment && fin.judgment ? Number(ini.judgment !== r.ai.verdict && fin.judgment === r.ai.verdict) : '',
      panel_order: a.panels.map(x => x.key).join('>'), answer_order: (r.answerOrder || ['malicious', 'benign']).join('>'),
      first_panel_position: keys[0] ? a.panels.findIndex(x => x.key === keys[0]) + 1 : '',
      panels_opened_unique: keys.length, panel_opens_total: opens.length, evidence_breadth: (keys.length / a.panels.length).toFixed(2), revisits: opens.length - keys.length,
      opens_after_ai: aiAt != null ? opens.filter(o => o.atMs >= aiAt).length : '', first_panel: keys[0] || '', panel_sequence: opens.map(o => o.panel).join('>'),
      misleading_inspected: Number(a.misleadingPanels.some(k => keys.includes(k))),
      contradicts_ai_inspected: r.ai ? Number(contra.some(k => keys.includes(k))) : '',
      contradicts_ai_inspected_after_ai: r.ai && aiAt != null ? Number(opens.some(o => contra.includes(o.panel) && (o.atMs >= aiAt || o.atMs + (o.dwellMs || 0) > aiAt))) : '',
      influential_panels: (Array.isArray(fin.influential) ? fin.influential : []).join('|')
    };
    for (const k of a.panels.map(x => x.key)) row[`dwell_${k}_ms`] = Math.round(opens.filter(o => o.panel === k).reduce((n, o) => n + (o.dwellMs || 0), 0));
    return row;
  },

  // Self-test: a simulated answer for a trial, and the checks that the exported row matches it.
  simulate(trial, plan, rand) {
    const pick = a => a[Math.floor(rand() * a.length)];
    const keys = trial.alert.panels.map(x => x.key), opens = keys.filter(() => rand() < 0.6);
    if (!opens.length) opens.push(keys[0]);
    const initial = plan.mode === 'evidence_first' ? pick(['malicious', 'benign']) : null, final = pick(['malicious', 'benign']);
    return { mode: plan.mode, aiShownAtMs: plan.mode === 'ai_first' ? 0 : plan.mode === 'evidence_first' ? 1000 : null,
      initial: initial ? { judgment: initial, confidence: 50, rtMs: 900 } : null,
      final: { judgment: final, confidence: 70, influential: [opens[0]], rtMs: 2000 },
      evidence: { opens: opens.map((k, i) => ({ panel: k, atMs: 100 + i * 400, dwellMs: 300 })) }, traces: { durationMs: 2000 }, selfTest: true, rawEvents: [{ t: 1, type: 'self_test' }] };
  },
  checkRow(row, sent, t, c) {
    const problems = [], a = t.alert, ai = t.ai, fin = sent.final.judgment;
    if (row.final_judgment !== fin) problems.push('answer');
    if (row.correct !== String(+(fin === a.truth))) problems.push('correct');
    if (row.panel_sequence !== sent.evidence.opens.map(o => o.panel).join('>')) problems.push('evidence order');
    if (ai) {
      if (row.ai_verdict !== ai.verdict || row.ai_confidence !== String(ai.confidence)) problems.push('AI advice');
      if (row.agree_ai !== String(+(fin === ai.verdict))) problems.push('agreement');
      if ((row.ai_verdict === a.truth) !== ['accurate', 'uncertain_correct'].includes(row.ai_type)) problems.push('AI right/wrong');
      const k = c.design.aiConfidence, conf = +row.ai_confidence;
      if (row.ai_type.startsWith('uncertain') ? conf < k.lowMin || conf > k.lowMax : conf < k.highMin || conf > k.highMax) problems.push('AI confidence range');
    } else if (row.ai_verdict !== '') problems.push('AI shown in a no-AI session');
    if (sent.initial && (row.initial_judgment !== sent.initial.judgment || row.changed_initial_to_final !== String(+(sent.initial.judgment !== fin)))) problems.push('initial answer');
    return problems;
  },
  // Session-level checks for the self-test: the right alerts and AI schedule for this condition.
  checkSession(rows, session, condition, c) {
    const spec = c.design.sessions[session - 1], out = [];
    const want = {}; (condition !== 'control' && Array.isArray(spec.ai) ? spec.ai : spec.alerts.map(() => '')).forEach(t => want[t] = (want[t] || 0) + 1);
    const got = {}; rows.forEach(x => got[x.ai_type] = (got[x.ai_type] || 0) + 1);
    out.push([JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(want).sort()), `Session ${session}: AI behaviors match the design ${JSON.stringify(want)}`]);
    out.push([new Set(rows.map(x => x.alert_id)).size === spec.alerts.length && rows.every(x => spec.alerts.includes(x.alert_id)), `Session ${session}: the right alerts were shown`]);
    return out;
  },
  expectedMode: (plan, condition, c, session) => {
    const spec = c.design.sessions[session - 1];
    return condition !== 'control' && Array.isArray(spec.ai) ? condition : 'none';
  }
};
