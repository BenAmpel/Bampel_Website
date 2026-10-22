// CCAIR Behavioral Lab: the per-study codebook, generated from the study's own content. One entry per exported
// column of the trials CSV and the surveys CSV, and one per column pattern of the wide CSV (wide.mjs builds those
// names from the same columns): the name, the kind of value, the allowed values with their labels, the question
// or description, and who it applies to (conditions, sessions, items, show-when rules). Downloaded as CSV or
// Markdown from the admin page; the general definitions are in static/lab/CODEBOOK.md.

import { csvCell } from './engine.mjs';
import { itemsFor } from './content.mjs';
import { platformInfo } from './version.mjs';

const SHARED_ID = [
  ['code', 'id', 'Study ID: a keyed hash of the email or panel ID (P-...), or a pilot access code. Never the email or panel ID.'],
  ['condition', 'category', 'Condition (arm) the participant was assigned to; blank if not yet assigned.'],
  ['test', 'binary', '1 = test or pilot participant (exclude from analysis).', '0 = real; 1 = test'],
  ['label', 'text', 'Enrollment label (a class, pilot, self-signup, panel).'],
  ['self_signup', 'binary', '1 = signed up themselves (email domain or online panel).', '0 = no; 1 = yes'],
  ['session', 'integer', 'Session number (1 = first).']
];
const SHARED_TRIAL_TAIL = [
  ['trial_ms', 'ms', 'Time on the trial screen, from TraceLab.'],
  ['mouse_path_px', 'number', 'Pointer path length in pixels.'],
  ['idle_ms', 'ms', 'Time with the pointer still for more than 500 ms.'],
  ['hidden_ms', 'ms', 'Time the browser tab was hidden during the trial.'],
  ['onset_ms', 'ms', 'Stimulus onset: the first animation frame after the item was drawn, on the browser\'s performance.now() clock (or when the type marked a later onset).'],
  ['onset_delay_ms', 'ms', 'Onset minus the moment the item screen started; subtract it from rt_ms for a response time from onset.'],
  ['frame_ms', 'number', 'The display\'s frame interval for this session (median of 60 frames; 16.67 = 60 Hz).'],
  ['preloaded', 'binary', 'The session\'s media were preloaded before the first item (blank = preloading off).', '0 = no (continued after a failure); 1 = yes'],
  ['views', 'integer', 'Times the trial screen was shown (more than 1 = reloaded mid-trial).'],
  ['viewport_w', 'integer', 'Browser window width at submission (CSS pixels).'],
  ['viewport_h', 'integer', 'Browser window height at submission (CSS pixels).'],
  ['received_at', 'timestamp', 'Server time the answer arrived (ISO 8601, UTC).'],
  ['session_started_at', 'timestamp', 'Session start (server time, UTC).'],
  ['session_completed_at', 'timestamp', 'Session completion (server time, UTC).'],
  ['days_since_prev_session', 'number', 'Days between finishing the previous session and starting this one.'],
  ['content_version', 'integer', 'Version of the study content the session plan was built from.']
];
const SHARED_SURVEY = [
  ['survey', 'category', 'Which survey: pre (start of session) or post (end of session).', 'pre; post'],
  ['content_version', 'integer', 'Version of the study content the session plan was built from.'],
  ['received_at', 'timestamp', 'Server time the answers arrived (ISO 8601, UTC).']
];

// Measures each study type adds to the trials CSV (definitions in static/lab/CODEBOOK.md). {q} rows are per question.
const TYPE_COLUMNS = {
  vignettes: [
    ['item_id', 'category', 'Item as defined on the Items tab.'], ['item_title', 'text', 'Item title.'], ['item_kind', 'category', 'Item kind.', 'text; email'],
    ['item_variant', 'category', 'Condition whose wording was shown; blank = the base wording.'],
    ['rt_ms', 'ms', 'Time from the item appearing to submitting.'], ['first_answer_ms', 'ms', 'Time to the first answer.'], ['answer_changes', 'integer', 'Number of answer changes.'],
    ['link_hovers', 'integer', 'Pointer hovers over links in the item.'], ['link_hover_ms', 'ms', 'Total hover time on links.'], ['link_clicks', 'integer', 'Clicks on links (links do not open).']
  ],
  multimodal: [
    ['item_id', 'category', 'Item as defined on the Items tab.'], ['item_title', 'text', 'Item title.'], ['item_kind', 'category', 'Item kind.', 'text; image; audio; video; call'],
    ['item_variant', 'category', 'Arm whose version of the item was shown; blank = the base version.'], ['block', 'integer', 'Block number within the session.'],
    ['call_intent', 'category', 'For calls: set by the researcher, never shown to participants.', 'attack; benign'],
    ['rt_ms', 'ms', 'Time on the item.'], ['first_answer_ms', 'ms', 'Time to the first answer.'], ['answer_changes', 'integer', 'Number of answer changes.'],
    ['decision', 'category', 'The decision (option value; see Decision).'], ['decision_ms', 'ms', 'Time from the item appearing to the decision.'],
    ['decision_changes', 'integer', 'Times the decision was changed (plain layout only).'],
    ['mt_mad', 'number', 'Mouse tracking: maximum absolute deviation from the straight start-to-answer line (normalized space).'], ['mt_auc', 'number', 'Mouse tracking: area under the curve (normalized space).'],
    ['mt_xflips', 'integer', 'Mouse tracking: horizontal direction changes.'], ['mt_init_ms', 'ms', 'Mouse tracking: Start to first movement.'], ['mt_move_ms', 'ms', 'Mouse tracking: first movement to the answer.'],
    ['media_plays', 'integer', 'Clip plays.'], ['media_heard_pct', 'number', 'Furthest point heard (%).'], ['media_first_play_ms', 'ms', 'Time to the first play.'], ['media_transcript', 'binary', 'Transcript opened.', '0 = no; 1 = yes'],
    ['call_answered', 'binary', 'Call answered.', '0 = no; 1 = yes'], ['call_outcome', 'category', 'How the call ended.', 'disclosed; complied; completed; verified; refused; resisted; not_completed; declined; missed; hung_up; max_turns'],
    ['call_final_state', 'category', 'Caller state when the call ended.'], ['call_turns', 'integer', 'Participant turns.'], ['call_digits_disclosed', 'integer', 'Longest run of digits said (digits are removed before saving).'],
    ['call_verifies', 'integer', 'Requests to verify the caller.'], ['call_refusals', 'integer', 'Refusals.'], ['call_callbacks', 'integer', 'Calls made from the directory after the call.'],
    ['call_callback_resolved', 'binary', 'A callback reached the organization\'s real number.', '0 = no; 1 = yes'], ['call_duration_ms', 'ms', 'Call length.'], ['call_hold_ms', 'ms', 'Time on hold.'],
    ['call_median_latency_ms', 'ms', 'Median time from the participant\'s turn to the caller\'s reply.'], ['call_llm_turns', 'integer', 'Caller lines rephrased by the language model.'],
    ['call_typed_turns', 'integer', 'Participant turns typed instead of spoken.'], ['call_interruptions', 'integer', 'Times the participant talked over the caller.'],
    ['call_captions', 'binary', 'Captions turned on.', '0 = no; 1 = yes'], ['call_directory_opened', 'binary', 'Phone directory opened.', '0 = no; 1 = yes'],
    ['voice_recorded', 'binary', 'Spoken answer recorded.', '0 = no; 1 = yes'], ['voice_ms', 'ms', 'Length of the spoken answer.'], ['voice_typed', 'text', 'Typed answer when not recorded.']
  ],
  'alert-triage': [
    ['alert_id', 'category', 'Alert as defined on the Alerts tab.'], ['family', 'category', 'Alert family.'], ['truth', 'category', 'Correct answer as scored.', 'malicious; benign'],
    ['mode', 'category', 'What the participant saw.', 'ai_first; evidence_first; none'], ['ai_type', 'category', 'AI advice type.', 'accurate; uncertain_correct; incorrect; uncertain_incorrect; manipulated'],
    ['ai_verdict', 'category', 'What the AI said.', 'malicious; benign'], ['ai_confidence', 'number', 'Confidence the AI showed (%).'], ['ai_shown_at_ms', 'ms', 'Trial start to the AI appearing.'],
    ['initial_judgment', 'category', 'Evidence-first: answer before the AI appeared.', 'malicious; benign'], ['initial_confidence', 'number', 'Evidence-first: confidence before the AI (0-100).'], ['initial_rt_ms', 'ms', 'Evidence-first: time to the initial answer.'],
    ['final_judgment', 'category', 'Final answer.', 'malicious; benign'], ['final_confidence', 'number', 'Final confidence (0-100).'], ['final_rt_ms', 'ms', 'Trial start to submission.'],
    ['correct', 'binary', 'Final answer matches truth.', '0 = no; 1 = yes'], ['agree_ai', 'binary', 'Final answer matches the AI.', '0 = no; 1 = yes'],
    ['changed_initial_to_final', 'binary', 'Evidence-first: final differs from initial.', '0 = no; 1 = yes'], ['switched_to_ai', 'binary', 'Evidence-first: moved to the AI\'s answer.', '0 = no; 1 = yes'],
    ['panel_order', 'list', 'Order of the evidence tabs on screen (> separated).'], ['answer_order', 'list', 'Order of the answer buttons.'],
    ['first_panel_position', 'integer', 'Screen position of the first panel opened (1 = leftmost).'], ['panels_opened_unique', 'integer', 'Different panels opened.'],
    ['panel_opens_total', 'integer', 'Panel openings.'], ['evidence_breadth', 'number', 'panels_opened_unique / panels on the alert.'], ['revisits', 'integer', 'panel_opens_total - panels_opened_unique.'],
    ['opens_after_ai', 'integer', 'Openings after the AI appeared.'], ['first_panel', 'category', 'First panel opened.'], ['panel_sequence', 'list', 'All openings in order.'],
    ['misleading_inspected', 'binary', 'A misleading panel was opened.', '0 = no; 1 = yes'], ['contradicts_ai_inspected', 'binary', 'A panel against the AI\'s verdict was opened.', '0 = no; 1 = yes'],
    ['contradicts_ai_inspected_after_ai', 'binary', 'Such a panel was on screen after the AI appeared.', '0 = no; 1 = yes'], ['influential_panels', 'list', 'What the participant said influenced them (| separated).']
  ],
  game: [
    ['stage', 'category', 'Game stage.'], ['step', 'integer', 'Step within the round.'], ['acting', 'category', 'Role acting in this step.'], ['auto', 'binary', 'Decision made automatically (time-out or stored partner).', '0 = no; 1 = yes'],
    ['payoff', 'number', 'Payoff for the round.'], ['round', 'integer', 'Round number.'], ['group', 'integer', 'Group within the round.'], ['d_{decision}', 'number', 'This participant\'s value for each decision.'], ['o_{decision}', 'list', 'Other players\' values for each decision (| separated).']
  ]
};

const plainRule = r => (r ? JSON.stringify(r).replace(/[{}"]/g, '').replace(/,/g, ', ') : '');

// Allowed values for one question, as "value = label" pairs (or a range).
export function valuesOf(q) {
  if (q.type === 'scale') {
    const lo = Number.isInteger(q.start) ? q.start : 1, labels = Array.isArray(q.labels) && q.labels.length === q.n ? q.labels : null;
    return labels ? labels.map((l, i) => `${lo + i} = ${l}`).join('; ') : `${lo} = ${q.lo || ''}; ...; ${lo + q.n - 1} = ${q.hi || ''}`.replace(/ = ;/g, ';');
  }
  if (q.type === 'choice' || q.type === 'select') return (q.options || []).map(o => (o.value === o.label ? o.value : `${o.value} = ${o.label}`)).join('; ');
  if (q.type === 'multi') return 'any of (| separated): ' + (q.options || []).map(o => (o.value === o.label ? o.value : `${o.value} = ${o.label}`)).join('; ');
  if (q.type === 'confidence') return '0 to 100';
  if (q.type === 'number') return Number.isFinite(q.min) || Number.isFinite(q.max) ? `number as typed (expected ${q.min ?? ''} to ${q.max ?? ''}; not enforced)` : 'number as typed';
  return 'free text';
}
const KIND = { scale: 'integer', choice: 'category', select: 'category', multi: 'list', confidence: 'integer', number: 'number', text: 'text' };

function questionEntry(file, column, q, appliesExtra, source) {
  const parts = [];
  if (Array.isArray(q.conditions) && q.conditions.length) parts.push('conditions ' + q.conditions.join(', '));
  if (q.showIf && q.showIf !== 'always') parts.push('when ' + q.showIf);
  if (q.displayIf) parts.push('shown if ' + plainRule(q.displayIf));
  if (appliesExtra) parts.unshift(appliesExtra);
  return { file, column, kind: KIND[q.type] || 'text', values: valuesOf(q), label: String(q.text || '').replace(/\s+/g, ' ').trim(), applies_to: parts.join('; ') || 'everyone', source,
    ...(q.required ? { required: 1 } : {}) };
}

// Every column, in export order. c: the study's content; conditions: the type's condition IDs.
export function buildCodebook(S, c) {
  const out = [], conds = S.type.conditionsOf(c), nS = S.type.sessionCount(c), typeId = S.type.id;
  const add = (file, rows, source, applies = 'everyone') => { for (const [column, kind, label, values] of rows) out.push({ file, column, kind, values: values || '', label, applies_to: applies, source }); };

  // ----- trials CSV -----
  const condValues = conds.join('; ');
  add('trials', SHARED_ID.map(r => (r[0] === 'condition' ? [r[0], r[1], r[2], condValues] : r)), 'engine');
  add('trials', [['trial_index', 'integer', 'Position of the trial within the session (0 = first shown).']], 'engine');
  add('trials', TYPE_COLUMNS[typeId] || [], typeId);
  if (typeId === 'alert-triage') for (const k of [...new Set((c.alerts || []).flatMap(a => (a.panels || []).map(p => p.key)))]) out.push({ file: 'trials', column: `dwell_${k}_ms`, kind: 'ms', values: '', label: `Time the "${k}" panel was on screen.`, applies_to: 'alerts with that panel', source: typeId });
  if (typeId === 'multimodal' && c.decision && Array.isArray(c.decision.options)) { const d = out.find(x => x.column === 'decision' && x.file === 'trials'); if (d) { d.values = c.decision.options.map(o => `${o.value} = ${o.label}`).join('; '); d.label = c.decision.prompt || d.label; } }
  for (const q of c.questions || []) if (q.type !== 'info') out.push(questionEntry('trials', `a_${q.id}`, q, typeId === 'multimodal' ? 'items that ask it' : 'every item', 'item question'));
  add('trials', SHARED_TRIAL_TAIL, 'engine');

  // ----- surveys CSV -----
  add('surveys', SHARED_ID.map(r => (r[0] === 'condition' ? [r[0], r[1], r[2], condValues] : r)), 'engine');
  add('surveys', SHARED_SURVEY, 'engine');
  for (const d of c.embedded || []) out.push({ file: 'surveys', column: `ed_${d.name}`, kind: 'text', values: d.source === 'value' ? `always "${d.value}"` : `from the link parameter ${d.param || d.name}`, label: 'Embedded data captured when the session started.', applies_to: 'everyone', source: 'embedded data' });
  const taken = new Set(out.filter(x => x.file === 'surveys').map(x => x.column));
  for (const kind of ['pre', 'post']) {
    for (const q of c.survey[kind] || []) {
      if (q.type === 'info') continue;
      const sessions = [];
      for (let n = 1; n <= nS; n++) if (conds.some(cd => itemsFor([q], kind, { session: n, condition: cd }, S.type).length)) sessions.push(n);
      if (!sessions.length) continue;
      const col = taken.has(q.id) ? `q_${q.id}` : q.id;
      out.push(questionEntry('surveys', col, q, `${kind === 'pre' ? 'start' : 'end'} of session ${sessions.join(', ')}${q.page ? `; page ${q.page}` : ''}`, `${kind}-session survey`));
    }
  }

  // ----- wide CSV (one row per participant; column patterns, see wide.mjs) -----
  add('wide', [
    ...SHARED_ID.filter(r => r[0] !== 'session').map(r => (r[0] === 'condition' ? [r[0], r[1], r[2], condValues] : r)),
    ['consented', 'binary', 'Agreed to take part.', '0 = no; 1 = yes'], ['sessions_completed', 'integer', 'Sessions finished.'], ['total_sessions', 'integer', 'Sessions in the study for this participant.'],
    ['finished', 'binary', 'Finished every session.', '0 = no; 1 = yes'], ['screened_out', 'text', 'Why the study ended early for this participant (blank = not screened out).'],
    ['returned', 'binary', 'Chose "I want to stop taking part".', '0 = no; 1 = yes'], ['panel_study', 'text', 'The panel\'s study ID from the link (for example Prolific STUDY_ID).'],
    ['panel_sessions', 'integer', 'Different panel session IDs seen for this participant (more than 1 = opened the study more than once).'],
    ['s{n}_started_at', 'timestamp', 'Session n start (UTC).'], ['s{n}_completed_at', 'timestamp', 'Session n completion (UTC).'], ['s{n}_minutes', 'number', 'Session n length in minutes.'],
    ['ed_{name}', 'text', 'Embedded data (as in the surveys CSV), from the first survey that has it.'],
    ['s{n}_pre_{question}', 'as in the surveys CSV', 'Answer to a start-of-session question in session n (values as for that question in the surveys CSV).'],
    ['s{n}_post_{question}', 'as in the surveys CSV', 'Answer to an end-of-session question in session n.'],
    ['s{n}_{item}_{measure}', 'as in the trials CSV', 'A trial measure for one item in session n, named by the item ID (t{index} when a trial has no item ID). Measures and values as in the trials CSV; identifiers and timestamps are left out.']
  ], 'engine');
  return out;
}

// One CSV with a row per column (formulas neutralized, like every lab CSV).
export function codebookCsv(rows) {
  const cols = ['file', 'column', 'kind', 'values', 'label', 'applies_to', 'source', 'required'];
  return [cols.join(','), ...rows.map(r => cols.map(k => csvCell(r[k] ?? '')).join(','))].join('\n') + '\n';
}

const md = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function codebookMarkdown(rows, { study, type, version, now = Date.now() }) {
  const p = platformInfo(), files = { trials: 'Trials CSV (one row per trial)', surveys: 'Surveys CSV (one row per survey answered)', wide: 'Wide CSV (one row per participant)' };
  let out = `# Codebook: ${md(study.name)}\n\nStudy \`${study.id}\` (type ${md(type.label || type.id)}), content version ${version}. Generated ${new Date(now).toISOString().slice(0, 10)} by the ${p.name} ${p.version} (commit ${p.commit.slice(0, 12)}). General definitions: static/lab/CODEBOOK.md.\n\n` +
    'Kinds: id, category, binary (0/1), integer, number, ms (milliseconds), timestamp (ISO 8601, UTC), list (separated values), text. Empty cells mean the measure does not apply or was not answered.\n';
  for (const f of Object.keys(files)) {
    const rs = rows.filter(r => r.file === f);
    if (!rs.length) continue;
    out += `\n## ${files[f]}\n\n| Column | Kind | Values | Question or description | Applies to |\n|---|---|---|---|---|\n`;
    for (const r of rs) out += `| \`${md(r.column)}\` | ${md(r.kind)} | ${md(r.values)} | ${md(r.label)}${r.required ? ' (required)' : ''} | ${md(r.applies_to)} |\n`;
  }
  return out;
}
