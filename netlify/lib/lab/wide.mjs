// CCAIR Behavioral Lab: the wide export, one row per participant, next to the long trials and surveys CSVs.
// Columns (the codebook lists them as patterns):
//   code, condition, test, label, self_signup, consented, sessions_completed, total_sessions, finished, screened_out,
//   returned, panel_study, panel_sessions, s{n}_started_at, s{n}_completed_at, s{n}_minutes, ed_{name},
//   s{n}_{pre|post}_{question}, s{n}_{item}_{measure}
// Trial measures are named by the item (item_id, or alert_id), not by the position shown, because the order is
// randomized per participant; a trial without an item ID uses t{index}. Identifiers and timestamps repeated on every
// trial row are left out. Values are exactly those of the long CSVs, so the codebook's values apply.

import { trialRow } from './engine.mjs';
import { dqColumns } from './quality.mjs';

export const WIDE_FIRST = ['code', 'condition', 'test', 'label', 'self_signup', 'consented', 'sessions_completed', 'total_sessions', 'finished', 'screened_out', 'returned', 'panel_study', 'panel_sessions'];
const SKIP = new Set(['code', 'condition', 'test', 'label', 'self_signup', 'session', 'trial_index', 'item_id', 'item_title', 'item_kind', 'alert_id', 'content_version',
  'received_at', 'session_started_at', 'session_completed_at', 'days_since_prev_session', 'cb_row', 'cb_sequence']);
const NAME = /^[a-z][a-z0-9_]{0,40}$/;
export const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'x';
const iso = ms => (ms ? new Date(ms).toISOString() : '');

const b = v => (v == null ? '' : v ? 1 : 0);
function checkColumns(n, d) {
  const dv = d.device || {}, p = `s${n}_check_`, out = { [p + 'device_mobile']: b(dv.mobile), [p + 'device_browser']: dv.browser || '', [p + 'device_speech']: b(dv.speech),
    [p + 'device_screen']: dv.screenW ? `${dv.screenW}x${dv.screenH}` : '', [p + 'device_problems']: (dv.problems || []).join('|') };
  if (d.mic) Object.assign(out, { [p + 'mic_ok']: b(d.mic.ok), [p + 'mic_peak_db']: d.mic.peakDb ?? '', [p + 'mic_error']: d.mic.error || '' });
  if (d.headphone) Object.assign(out, { [p + 'headphone_correct']: d.headphone.correct ?? '', [p + 'headphone_pass']: b(d.headphone.pass) });
  if (d.timing) for (const [k, v] of [['refresh_hz', 'refreshHz'], ['frame_ms', 'frameMsMedian'], ['frame_sd_ms', 'frameMsSd'], ['jitter_p95_ms', 'jitterP95Ms'], ['dropped_frames', 'droppedFrames'], ['timer_lag_ms', 'timerLagMs'], ['audio_output_latency_ms', 'audioOutputLatencyMs']]) out[p + 'timing_' + k] = d.timing[v] ?? '';
  return out;
}
// records and participants as exportRecords returns them (one batch of participants); c: the study content (for the
// data-quality flags, which need the minutes per session).
export function wideRows(S, { records, participants }, c = null) {
  const byCode = new Map();
  for (const p of participants) {
    const done = (p.completed || []).length;
    const row = { code: p.code, condition: p.condition ?? '', test: p.test ? 1 : 0, label: p.label || '', self_signup: p.selfSignup ? 1 : 0,
      consented: p.consentedAt ? 1 : 0, sessions_completed: done, total_sessions: p.totalSessions ?? '', finished: p.totalSessions && done >= p.totalSessions ? 1 : 0,
      screened_out: p.screenedOut ? p.screenedOut.reason || 'yes' : '', returned: p.returnedAt ? 1 : 0,
      panel_study: p.panel?.study || '', panel_sessions: p.panel ? p.panel.sessions.length : '' };
    for (const n of Object.keys(p.sessions || {}).map(Number).sort((a, b) => a - b)) {
      const s = p.sessions[n];
      row[`s${n}_started_at`] = iso(s.startedAt); row[`s${n}_completed_at`] = iso(s.completedAt);
      row[`s${n}_minutes`] = s.startedAt && s.completedAt ? ((s.completedAt - s.startedAt) / 60000).toFixed(2) : '';
    }
    byCode.set(p.code, { p, row, dq: [], trials: [] });
  }
  const sorted = records.slice().sort((a, b) => (a.session - b.session) || String(a.key).localeCompare(String(b.key), 'en', { numeric: true }));
  for (const r of sorted) {
    const hit = byCode.get(r.code);
    if (!hit) continue;
    const row = hit.row, m = String(r.key).match(/\/survey-(pre|post)$/);
    if (/\/t\d+$/.test(r.key)) hit.trials.push(r.data || {});   // every trial's traces feed the dq_* signals
    if (/\/checks$/.test(r.key)) Object.assign(row, checkColumns(r.session, r.data || {}));   // setup checks (envcheck.mjs)
    else if (/\/dq$/.test(r.key)) hit.dq.push(r.data || {});   // data-quality signals, summed below (quality.mjs)
    else if (m) {
      for (const [k, v] of Object.entries(r.embedded || {})) if (NAME.test(k) && !(`ed_${k}` in row)) row[`ed_${k}`] = v;
      for (const [k, v] of Object.entries(r.data || {})) if (NAME.test(k)) row[`s${r.session}_${m[1]}_${k}`] = Array.isArray(v) ? v.join('|') : v;
    } else if (/\/t\d+$/.test(r.key) && !S.type.exportTrials) {   // the economic game's rounds stay in its own long export
      const t = trialRow(S, r, hit.p), item = slug(t.item_id || t.alert_id || `t${r.index}`);
      if (t.cb_row) { row[`s${r.session}_cb_row`] = t.cb_row; row[`s${r.session}_cb_sequence`] = t.cb_sequence; }   // once per session
      for (const [k, v] of Object.entries(t)) if (!SKIP.has(k)) row[`s${r.session}_${item}_${k}`] = v;
    }
  }
  for (const x of byCode.values()) Object.assign(x.row, dqColumns(x.dq, x.p, c, x.trials, S.type.id));
  return [...byCode.values()].map(x => x.row).sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));
}
