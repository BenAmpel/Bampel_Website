// Answers-only downloads (Download → "Leave out behavior traces"; rows?...&traces=0, export.csv and export-wide.csv
// with ?traces=0): codebook.mjs TRACE_COLUMNS and dropTraces. Every listed column is a trials column the codebook
// defines (so the list cannot drift from the export), trace columns go from trials and wide rows, and answers,
// timing, data-quality flags and survey answers stay, even a survey question named like a trace measure.
import assert from 'node:assert/strict';
import { TRACE_COLUMNS, dropTraces, buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { BUILT_IN } from '../../netlify/lib/lab/registry.mjs';

const type = TYPES['alert-triage'], study = BUILT_IN.verification, c = C.normalize(C.defaultContent(type), type);
const book = buildCodebook({ type, study }, c), trialCols = new Set(book.filter(r => r.file === 'trials').map(r => r.column));
for (const t of TRACE_COLUMNS) assert(trialCols.has(t), `${t} is a trials column in the codebook`);
assert.equal(TRACE_COLUMNS.size, 23);

const trial = { code: 'P-1', condition: 'control', final_confidence: 70, correct: 1, onset_ms: 12.5, viewport_w: 1440, trial_ms: 5000, mouse_path_px: 900, keystrokes: 3, trace_version: '0.3.1' };
assert.deepEqual(Object.keys(dropTraces([trial], 'trials')[0]), ['code', 'condition', 'final_confidence', 'correct', 'onset_ms', 'viewport_w'], 'trials: answers and timing stay, traces go');

const wide = { code: 'P-1', condition: 'control', dq_flags: 0, s1_db_3_correct: 1, s1_db_3_trial_ms: 5000, s1_db_3_clicks: 2, s2_db_3_mouse_path_px: 10, s1_pre_age: 30, s1_post_clicks: 'often', s1_completed_at: '2026-10-31' };
assert.deepEqual(Object.keys(dropTraces([wide], 'wide')[0]), ['code', 'condition', 'dq_flags', 's1_db_3_correct', 's1_pre_age', 's1_post_clicks', 's1_completed_at'],
  'wide: per-item trace columns go; a survey question called "clicks" is an answer and stays');
assert.deepEqual(dropTraces([{ trial_ms: 1 }], 'surveys')[0], {}, 'the same names go from any other row kind');
console.log('no-trace exports: ok');
