// CCAIR Behavioral Lab: the per-study codebook, generated from the study's own content. One entry per exported
// column of the trials CSV and the surveys CSV, and one per column pattern of the wide CSV (wide.mjs builds those
// names from the same columns): the name, the kind of value, the allowed values with their labels, the question
// or description, and who it applies to (conditions, sessions, items, show-when rules). Downloaded as CSV or
// Markdown from the admin page; the general definitions are in static/lab/CODEBOOK.md.

import { csvCell } from './engine.mjs';
import { itemsFor } from './content.mjs';
import { platformInfo } from './version.mjs';
import { DQ_CODEBOOK } from './quality.mjs';

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
  ['first_interaction_ms', 'ms', 'Time from the item appearing to the first input of any kind (pointer move, click, key, scroll, typing).'],
  ['no_input_ms', 'ms', 'Total time in stretches of 2 s or more with no input at all (pointer, key, scroll or typing); includes the start and end of the item.'],
  ['longest_no_input_ms', 'ms', 'The longest such stretch.'],
  ['clicks', 'integer', 'Clicks or taps during the item.'],
  ['pointer_type', 'category', 'The pointer used for most presses (blank = none).', 'mouse; touch; pen'],
  ['scroll_px', 'number', 'Distance scrolled, in pixels, on the page and in scrollable panels together.'],
  ['window_blurs', 'integer', 'Times the browser window lost focus (another window or app came forward). Blank for records from TraceLab 0.1.0, which also counted leaving a form field.'],
  ['keystrokes', 'integer', 'Keys pressed (which keys is never recorded).'],
  ['deletions', 'integer', 'Backspace and Delete presses.'],
  ['paste_count', 'integer', 'Paste actions during the item.'],
  ['key_interval_ms', 'ms', 'Median time between typing keys, leaving out pauses of 2 s or more.'],
  ['key_hold_ms', 'ms', 'Median time a typing key was held down.'],
  ['typing_pauses', 'integer', 'Gaps of 2 s or more between typing keys.'],
  ['key_interval_cv', 'number', 'Variation of between-key times (standard deviation / mean; 5 or more intervals). Near 0 = machine-even typing.'],
  ['scripted_events', 'integer', 'Input events made by a script during the trial (untrusted pointer, key or typing events, and clicks with no real press before them). Blank before TraceLab 0.3.0.'],
  ['trace_version', 'text', 'TraceLab version that recorded the measures (0.1.0 = before the October 2026 revision; 0.3.0 added scripted-input and typing-variation measures).'],
  ['raw_events', 'integer', 'Raw events stored for the trial (pointer moves are thinned when the log is very long; 0 = log too large to store).'],
  ['raw_events_sent', 'integer', 'Raw events the browser sent.'],
  ['onset_ms', 'ms', 'Stimulus onset: the first animation frame after the item was drawn, on the browser\'s performance.now() clock (or when the type marked a later onset).'],
  ['onset_delay_ms', 'ms', 'Onset minus the moment the item screen started; subtract it from rt_ms for a response time from onset (not for reaction-time tasks, whose rt_ms already starts at the stimulus frame).'],
  ['frame_ms', 'number', 'The display\'s frame interval for this session (median of 60 frames; 16.67 = 60 Hz).'],
  ['preloaded', 'binary', 'The session\'s media were preloaded before the first item (blank = preloading off).', '0 = no (continued after a failure); 1 = yes'],
  ['fullscreen', 'binary', 'The page was in full screen when the item appeared (blank = the study does not use full screen).', '0 = no; 1 = yes'],
  ['fullscreen_exits', 'integer', 'Times the participant left full screen during the item.'],
  ['fullscreen_exit_ms', 'list', 'When each exit happened, in ms after the item started (| separated).'],
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
    ['link_hovers', 'integer', 'Pointer hovers over links in the item.'], ['link_hover_ms', 'ms', 'Total hover time on links.'], ['link_clicks', 'integer', 'Clicks on links, or Enter pressed on a link (links do not open).'], ['link_focus', 'integer', 'Keyboard visits to links (the keyboard user\'s hover; blank before TraceLab 0.2.0). On touch screens a tap also counts as a hover.']
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
    ['mt_input', 'category', 'Mouse tracking: how the answer was given; the mt_ measures are blank for keyboard and touch, which leave no pointer path.', 'mouse; pen; touch; keyboard'], ['media_pauses', 'integer', 'Times the clip was paused before its end.'], ['media_ended_ms', 'ms', 'Time from the item appearing to the clip ending.'], ['media_error', 'binary', 'The clip could not load or play.', '0 = no; 1 = yes'], ['call_ring_ms', 'ms', 'Time the phone rang before it was answered or declined.'],
    ['call_answered', 'binary', 'Call answered.', '0 = no; 1 = yes'], ['call_outcome', 'category', 'How the call ended.', 'disclosed; complied; completed; agreed (a request to call back, accepted on the call); verified; refused; resisted; not_completed; declined; missed; hung_up; max_turns'],
    ['call_final_state', 'category', 'Caller state when the call ended.'], ['call_turns', 'integer', 'Participant turns.'], ['call_digits_disclosed', 'integer', 'Longest run of digits said (digits are removed before saving).'],
    ['call_verifies', 'integer', 'Requests to verify the caller.'], ['call_refusals', 'integer', 'Refusals.'], ['call_callbacks', 'integer', 'Calls made from the directory after the call.'],
    ['call_callback_resolved', 'binary', 'A callback reached the organization\'s real number.', '0 = no; 1 = yes'], ['call_duration_ms', 'ms', 'Call length.'], ['call_hold_ms', 'ms', 'Time on hold.'],
    ['call_median_latency_ms', 'ms', 'Median time from the participant\'s turn to the caller\'s reply.'], ['call_llm_turns', 'integer', 'Caller lines rephrased by the language model.'],
    ['call_typed_turns', 'integer', 'Participant turns typed instead of spoken.'], ['call_interruptions', 'integer', 'Times the participant talked over the caller.'],
    ['call_captions', 'binary', 'Captions turned on.', '0 = no; 1 = yes'], ['call_directory_opened', 'binary', 'Phone directory opened.', '0 = no; 1 = yes'],
    ['voice_recorded', 'binary', 'Spoken answer recorded.', '0 = no; 1 = yes'], ['voice_ms', 'ms', 'Length of the spoken answer.'], ['voice_typed', 'text', 'Typed answer when not recorded.'],
    // Equipment checks (check items: headphones, spoken word), scored on the server.
    ['check_test', 'category', 'Equipment check on this item.', 'headphones; word'], ['check_passed', 'binary', 'Passed the check.', '0 = no; 1 = yes'],
    ['check_attempts', 'integer', 'Attempts used.'], ['check_outages', 'integer', 'Attempts lost to a speech-server outage (never counted against the participant).'],
    // Study design factors and counterbalancing (pools: passive clips and the shift).
    ['block_title', 'text', 'Title of the block the item was in.'], ['clip_id', 'category', 'Passive clip ID from the clip library.'],
    ['phase', 'category', 'Passive clips: before or after training.', 'pre; post'], ['locked', 'binary', 'Passive clip whose answer opened only when the clip ended.', '0 = no; 1 = yes'],
    ['structure', 'category', 'Ground truth by the labeling rule.', 'attack; benign'], ['surface', 'category', 'Persuasion cues.', 'high; low (clips); urgent; calm (calls)'],
    ['topic', 'category', 'Topic of the organization.', 'financial; community'],
    ['ask_timing', 'category', 'Where in the clip the request comes.', 'early; middle; late'], ['ask_ms', 'ms', 'Time of the request in the clip.'],
    ['call_slot', 'category', 'Shift call slot (structure, surface and number), e.g. atk-calm-1.'], ['caller_id', 'category', 'Caller ID state shown on the phone; blank when calls show none.'],
    ['call_directory_down', 'binary', 'The company directory was down on this call (within-subject outage); the dial pad still worked.', '0 = no; 1 = yes'],
    ['shift_form', 'category', 'Shift form (topic version) assigned to the participant.'], ['clip_list', 'integer', 'Counterbalanced clip list assigned to the participant.'],
    ['slider_flag', 'binary', 'Participant had the real-time suspicion slider.', '0 = no; 1 = yes'], ['pilot_scripted', 'binary', 'Participant heard scripted caller lines only (pilot equivalence check).', '0 = no; 1 = yes'],
    // Live passive decisions (answer while the clip plays).
    ['live_first', 'category', 'First answer chosen while the clip played.'], ['live_first_ms', 'ms', 'Time of the first answer from the item start.'], ['live_first_clip_ms', 'ms', 'Clip position at the first answer.'],
    ['live_changes', 'integer', 'Answer changes after the first.'], ['live_final', 'category', 'Final answer.'], ['live_decided_ms', 'ms', 'Time of the "decided" key press.'],
    ['live_decided_clip_ms', 'ms', 'Clip position at the "decided" key press.'], ['live_late', 'binary', 'First answered after the clip ended.', '0 = no; 1 = yes'], ['live_clip_ms', 'ms', 'Clip length.'],
    ['slider_samples', 'integer', 'Suspicion slider samples (every 250 ms).'], ['slider_mean', 'number', 'Mean slider value (0 to 100).'], ['slider_last', 'number', 'Last slider value (0 to 100).'],
    // Scored calls (computed on the server; the browser never learns the outcome).
    ['call_disclosed', 'text', 'What was given away, | separated.', 'code; password; account; action (a non-secret request the call defines, e.g. changing bank details)'],
    ['call_disclosure', 'binary', 'Anything was given away.', '0 = no; 1 = yes'], ['call_code_sent', 'binary', 'A one-time code reached the authenticator.', '0 = no; 1 = yes'],
    ['call_pressure_turns', 'integer', 'Caller pressure turns spoken before the first disclosure (or in the whole call).'], ['call_spoken_turns', 'integer', 'Participant turns spoken (recognized on the lab server).'],
    ['call_agreed_no_disclosure', 'integer', 'Times the participant agreed ("okay") without giving anything.'],
    ['call_callbacks_lookedup', 'integer', 'Callbacks to a number looked up in the directory.'], ['call_callbacks_caller_number', 'integer', 'Callbacks to a number the caller gave.'],
    ['call_callbacks_dialpad_listed', 'integer', 'Callbacks typed on the dial pad to a listed number.'],
    ['call_callback_resolved_via', 'category', 'How the callback that reached the organization was placed.', 'directory; dialpad'],
    ['call_callback_latency_ms', 'ms', 'Time from the call start to the first callback.'],
    ['call_benign_completed_on_call', 'binary', 'Legitimate calls: the request was completed on the call.', '0 = no; 1 = yes'],
    ['call_benign_completed_via_callback', 'binary', 'Legitimate calls asking to be called back: the participant reached the real number.', '0 = no; 1 = yes'],
    ['call_points', 'integer', 'Points for the call under the payoff.'], ['call_tts_errors', 'integer', 'Caller lines the voice service failed to render (spoken by the browser instead).'],
    ['call_gate_passed', 'binary', 'Practice call: passed the voice-pipeline gate.', '0 = no; 1 = yes'], ['call_skipped', 'binary', 'Practice retry skipped after a pass.', '1 = yes'],
    // Training screens.
    ['screen_dwell_ms', 'ms', 'Time on the screen.'], ['screen_clips_ended', 'integer', 'Embedded examples played to the end.'], ['screen_reached_target', 'binary', 'Practice directory: reached the number the screen asks for.', '0 = no; 1 = yes']
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
  reaction: [
    ['paradigm', 'category', 'The task.', 'stroop; flanker'], ['practice', 'binary', 'A practice trial (exclude from analysis).', '0 = no; 1 = yes'],
    ['target', 'category', 'The correct answer: the ink colour (Stroop) or the middle arrow\'s direction (flanker).', 'red; green; blue; yellow; left; right'],
    ['distractor', 'category', 'What competed with it: the word (Stroop) or the outer arrows\' direction (flanker).'], ['congruent', 'binary', 'The distractor matched the target.', '0 = incongruent; 1 = congruent'],
    ['response', 'category', 'The answer given (blank = no answer in time).'], ['response_key', 'text', 'The key pressed (blank for a tap).'], ['response_via', 'category', 'How the answer was given.', 'key; tap'],
    ['correct', 'binary', 'The answer matched the target (blank = no answer in time).', '0 = no; 1 = yes'], ['rt_ms', 'ms', 'Response time from the stimulus\'s first display frame to the key press or tap (blank = no answer in time).'],
    ['timed_out', 'binary', 'No answer within the response window.', '0 = no; 1 = yes'],
    ['early_presses', 'integer', 'Answer keys pressed or buttons touched during the fixation cross, before the stimulus (anticipations).'],
    ['other_keys', 'integer', 'Keys pressed after the stimulus that are not answer keys.'],
    ['hidden_at_stimulus', 'binary', 'The tab was hidden when the stimulus was due; such a trial times out without being a slow answer.', '0 = no; 1 = yes']
  ],
  game: [
    ['stage', 'category', 'Game stage.'], ['step', 'integer', 'Step within the round.'], ['acting', 'category', 'Role acting in this step.'], ['auto', 'binary', 'Decision made automatically (time-out or stored partner).', '0 = no; 1 = yes'],
    ['payoff', 'number', 'Payoff for the round.'], ['round', 'integer', 'Round number.'], ['group', 'integer', 'Group within the round.'], ['d_{decision}', 'number', 'This participant\'s value for each decision.'], ['o_{decision}', 'list', 'Other players\' values for each decision (| separated).']
  ]
};

// Columns that record a shuffled order (order.mjs): order_questions, and order_{question} for shuffled options.
function orderEntries(file, qs, _, out) {
  if (qs.some(q => q.shuffle)) out.push({ file, column: 'order_questions', kind: 'list', values: 'question variable names, | separated', label: 'The order the shuffled questions were shown in (all questions of the list, in display order).', applies_to: 'lists with shuffled questions', source: 'engine' });
  for (const q of qs) if (q.shuffleOptions) out.push({ file, column: `order_${q.id}`, kind: 'list', values: 'option values, | separated', label: `The order the options of "${q.id}" were shown in${q.options.some(o => o.anchor) ? ' (options set to stay last are always at the end)' : ''}.`, applies_to: `whoever saw ${q.id}`, source: 'engine' });
}
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
  if (q.type === 'slider') return `${q.min} to ${q.max} in steps of ${q.step}; blank = not touched (no handle until the participant moves it)`;
  if (q.type === 'rank') return 'every option in rank order, first = ranked highest (| separated): ' + (q.options || []).map(o => (o.value === o.label ? o.value : `${o.value} = ${o.label}`)).join('; ');
  if (q.type === 'matrix') return (q.options || []).map(o => (o.value === o.label ? o.value : `${o.value} = ${o.label}`)).join('; ');
  if (q.type === 'number') return Number.isFinite(q.min) || Number.isFinite(q.max) ? `number as typed (expected ${q.min ?? ''} to ${q.max ?? ''}; not enforced)` : 'number as typed';
  return 'free text';
}
const KIND = { scale: 'integer', choice: 'category', select: 'category', multi: 'list', confidence: 'integer', number: 'number', text: 'text', slider: 'number', rank: 'list', matrix: 'category' };

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
  orderEntries('trials', c.questions || [], v => v, out);
  if (c.design && c.design.latinSquare === true) {
    const units = Array.isArray((c.design.sessions || [])[0]?.blocks) ? 'blocks' : 'items';
    add('trials', [['cb_row', 'integer', `Latin-square row (sequence) this participant got for the session (Williams design, balanced within condition).`],
      ['cb_sequence', 'list', `The session's ${units} in the order shown, as their positions in the design (> separated; 2>1>3 = the second ${units.slice(0, -1)} first).`]], 'engine');
  }

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
      const where = `${kind === 'pre' ? 'start' : 'end'} of session ${sessions.join(', ')}${q.page ? `; page ${q.page}` : ''}`;
      if (q.type === 'matrix') { for (const r of q.rows || []) out.push({ ...questionEntry('surveys', taken.has(r.id) ? `q_${r.id}` : r.id, q, where, `${kind}-session survey (matrix ${q.id})`), label: `${String(q.text).trim()} ${r.text}`.replace(/\s+/g, ' ') }); continue; }
      const col = taken.has(q.id) ? `q_${q.id}` : q.id;
      out.push(questionEntry('surveys', col, q, where, `${kind}-session survey`));
    }
  }
  orderEntries('surveys', (c.survey.pre || []).concat(c.survey.post || []), v => v, out);

  // ----- wide CSV (one row per participant; column patterns, see wide.mjs) -----
  add('wide', [
    ...SHARED_ID.filter(r => r[0] !== 'session').map(r => (r[0] === 'condition' ? [r[0], r[1], r[2], condValues] : r)),
    ['consented', 'binary', 'Agreed to take part.', '0 = no; 1 = yes'], ['sessions_completed', 'integer', 'Sessions finished.'], ['total_sessions', 'integer', 'Sessions in the study for this participant.'],
    ['finished', 'binary', 'Finished every session.', '0 = no; 1 = yes'], ['screened_out', 'text', 'Why the study ended early for this participant (blank = not screened out).'],
    ['returned', 'binary', 'Chose "I want to stop taking part".', '0 = no; 1 = yes'], ['panel_study', 'text', 'The panel\'s study ID from the link (for example Prolific STUDY_ID).'],
    ['panel_sessions', 'integer', 'Different panel session IDs seen for this participant (more than 1 = opened the study more than once).'],
    ...DQ_CODEBOOK,
    ['s{n}_check_{name}', 'as described', 'Setup checks before session n (Devices & timing): device_mobile (1 = phone or tablet), device_browser, device_speech (1 = speech recognition available), device_screen (width x height), device_problems (| separated: desktop, speech), mic_ok (1/0), mic_peak_db (loudest level heard, dBFS), mic_error, headphone_correct (of 6), headphone_pass (1 = 5 or more correct; Milne et al. 2021), timing_refresh_hz, timing_frame_ms (median frame interval), timing_frame_sd_ms, timing_jitter_p95_ms (95th percentile of the deviation from the median), timing_dropped_frames (of 120), timing_timer_lag_ms, timing_audio_output_latency_ms (as the browser reports it).'],
    ['s{n}_cb_row', 'integer', 'Latin-square row for session n (counterbalanced studies).'], ['s{n}_cb_sequence', 'list', 'Order of session n\'s blocks or items (> separated design positions).'],
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
