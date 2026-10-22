// CCAIR Behavioral Lab: hand-off back to a recruitment panel (Prolific, SONA, MTurk, CloudResearch).
// A study has up to three codes (completed, screened out, returned) and one redirect address with {code} and
// {pid} placeholders. The codes live only in the study content on the server: the browser learns a code only
// after the participant reaches that outcome (participant route "handoff"), so reading the public content or
// the page source never reveals the completion code.
//
// Panel IDs: the participant's panel ID (for example PROLIFIC_PID) is kept only under contact/{id}; the panel's
// study and session IDs (STUDY_ID, SESSION_ID) are not identifying and are kept on the participant record
// (participants/{id}.panel), so they appear in the exports.

import { update } from './store.mjs';

export const OUTCOMES = ['complete', 'screened_out', 'returned'];
const CODE_FIELD = { complete: 'completionCode', screened_out: 'screenOutCode', returned: 'returnCode' };
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PANEL_CODE_RE = /^[A-Za-z0-9_-]{2,40}$/;
export const PANEL_PARAM_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
// Capitalized words a preset leaves for the researcher to replace (the SONA credit link, for example).
const UNFILLED = /\b(YOURSCHOOL|EXPERIMENT_ID|CREDIT_TOKEN|PROJECT_CODE)\b/;

// Settings each panel needs. link: what to append to the study address in the panel's own settings.
// The researcher can change any field after choosing a preset.
export const PRESETS = {
  prolific: { label: 'Prolific', param: 'PROLIFIC_PID', studyParam: 'STUDY_ID', sessionParam: 'SESSION_ID',
    redirectUrl: 'https://app.prolific.com/submissions/complete?cc={code}', link: '?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}',
    help: 'In Prolific, choose "I\'ll use URL parameters" and paste the study link. Copy each completion code Prolific shows you (completed, screened out, returned) into the boxes below, or generate codes here and enter them in Prolific.' },
  sona: { label: 'SONA Systems', param: 'id', studyParam: '', sessionParam: '',
    redirectUrl: 'https://YOURSCHOOL.sona-systems.com/webstudy_credit.aspx?experiment_id=EXPERIMENT_ID&credit_token=CREDIT_TOKEN&survey_code={pid}', link: '?id=%SURVEY_CODE%',
    help: 'In SONA, set the study URL to the link shown, ending in ?id=%SURVEY_CODE%. Copy the "client-side completion URL" from SONA\'s study information page into the redirect box: it grants credit automatically. Keep {pid} where SONA shows XXXX.' },
  mturk: { label: 'Amazon MTurk', param: 'workerId', studyParam: 'hitId', sessionParam: 'assignmentId',
    redirectUrl: '', link: '?workerId=${workerId}&hitId=${hitId}&assignmentId=${assignmentId}',
    help: 'Workers paste the completion code into the HIT, so no redirect is needed. Put the same code in the HIT\'s answer check.' },
  cloudresearch: { label: 'CloudResearch Connect', param: 'participantId', studyParam: 'projectId', sessionParam: 'assignmentId',
    redirectUrl: 'https://connect.cloudresearch.com/participant/project/PROJECT_CODE/complete', link: '?participantId={%PARTICIPANT_ID%}&assignmentId={%ASSIGNMENT_ID%}&projectId={%PROJECT_ID%}',
    help: 'Copy the completion URL and completion code from your Connect project. Check the parameter names in Connect\'s "URL parameters" setting.' }
};
export const presetList = () => Object.entries(PRESETS).map(([id, p]) => ({ id, ...p }));

// A fresh code for the researcher to paste into the panel (8 characters, no look-alike letters).
export function newPanelCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export function panelDefaults() {
  return { preset: 'custom', studyParam: '', sessionParam: '', redirectUrl: '', completionCode: '', screenOutCode: '', returnCode: '' };
}

// Errors for the panel settings (content.validateContent adds them).
export function validatePanel(pn, e) {
  if (!pn || !pn.enabled) return;
  if (pn.preset != null && pn.preset !== 'custom' && !Object.hasOwn(PRESETS, pn.preset)) e.push('Online panel: unknown panel preset.');
  for (const [k, what] of [['studyParam', 'study ID'], ['sessionParam', 'session ID']]) {
    if (pn[k] && !PANEL_PARAM_RE.test(pn[k])) e.push(`Online panel: the ${what} parameter must be a name like STUDY_ID (letters, numbers, underscores).`);
  }
  for (const [k, what] of [['completionCode', 'completion code'], ['screenOutCode', 'screened-out code'], ['returnCode', 'returned code']]) {
    if (pn[k] && !PANEL_CODE_RE.test(pn[k])) e.push(`Online panel: the ${what} must be 2 to 40 letters, numbers, dashes, or underscores.`);
  }
  const u = pn.redirectUrl || '';
  if (u) {
    if (!/^https:\/\/[^\s"'<>]+$/.test(u)) e.push('Online panel: the redirect address must start with https:// (copy it from the panel).');
    else if (UNFILLED.test(u)) e.push(`Online panel: replace ${u.match(UNFILLED)[1]} in the redirect address with the value from your panel.`);
    for (const m of u.matchAll(/\{([^}]*)\}/g)) if (!['code', 'pid'].includes(m[1])) e.push(`Online panel: the redirect address may use {code} and {pid} only, not {${m[1]}}.`);
    if (/\{code\}/.test(u) && !pn.completionCode) e.push('Online panel: the redirect address uses {code}, so set a completion code.');
  }
}

// The redirect address for one outcome. Values are URL-encoded; an outcome without a code and an address that
// needs {pid} without a panel ID give no address. Without a template, the older single links still work
// (completionUrl, and screenOutUrl where a study sets one).
export function redirectFor(pn, outcome, code, panelId) {
  const u = pn.redirectUrl || '';
  if (!u) return outcome === 'complete' && /^https:\/\//.test(pn.completionUrl || '') ? pn.completionUrl : outcome === 'screened_out' && /^https:\/\//.test(pn.screenOutUrl || '') ? pn.screenOutUrl : '';
  if (/\{code\}/.test(u) && !code) return '';
  if (/\{pid\}/.test(u) && !panelId) return '';
  return u.replace(/\{code\}/g, encodeURIComponent(code || '')).replace(/\{pid\}/g, encodeURIComponent(panelId || ''));
}

// Where this participant stands: complete (all sessions done), screened_out (a screening rule or a full quota
// ended the study for them), returned (they chose to stop), or null (still going).
export function outcomeOf(p, st) {
  if (p.returnedAt) return 'returned';
  if (p.screenedOut || st.screenedOut) return 'screened_out';
  return st.finished ? 'complete' : null;
}

// What the participant's last page shows: the code to copy and the address that takes them back to the panel.
export async function handoff(S, p, st, pn) {
  const outcome = outcomeOf(p, st);
  if (!outcome) return { outcome: null };
  const code = (pn && pn[CODE_FIELD[outcome]]) || '';
  const contact = pn && pn.enabled ? await S.store.get(`contact/${p.code}`) : null;
  const url = pn && pn.enabled ? redirectFor(pn, outcome, code, contact && contact.panelId) : '';
  return { outcome, code, url, panel: pn && pn.enabled ? (PRESETS[pn.preset] || {}).label || 'the study site' : null,
    ...(outcome === 'screened_out' && p.screenedOut && p.screenedOut.reason ? { reason: p.screenedOut.reason } : {}) };
}

// The participant chose to stop: kept on the record (write-once), so the "returned" code is shown from then on.
export async function markReturned(S, code, now = Date.now()) {
  const u = await update(S.store, `participants/${code}`, d => { if (!d.returnedAt) d.returnedAt = now; });
  return u.error ? u : { ok: true };
}

// The panel's study and session IDs from the link, kept on the participant (each session ID once, the first 20).
// Several session IDs for one panel ID mean the same person opened the study more than once (a data-quality flag).
export function cleanPanelMeta(m) {
  const ok = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : '');
  return { study: ok(m && m.study), session: ok(m && m.session) };
}
export async function recordPanelMeta(S, code, meta, now = Date.now()) {
  const { study, session } = cleanPanelMeta(meta);
  if (!study && !session) return;
  await update(S.store, `participants/${code}`, d => {
    const pm = d.panel || (d.panel = { study: '', sessions: [] });
    if (study && !pm.study) pm.study = study;
    if (session && !pm.sessions.some(x => x.id === session) && pm.sessions.length < 20) pm.sessions.push({ id: session, at: now });
  });
}
