// CCAIR Behavioral Lab: setup checks and full screen, server side (the browser part is static/lab/engine/envcheck.js).
//   content.environment: { preload, fullscreen, desktopOnly, speechBrowser, micCheck, micRequired, headphoneCheck,
//                          headphoneFail: 'record' | 'screen', language }
//   data/{id}/s{n}/checks   write-once, the session's check results (participant route "checks")
// A failed required check can end the study for the participant (screened out, with the panel's screened-out code);
// which failures may do that is fixed here, never taken from the browser.

import { setNew, update } from './store.mjs';

export const LANGUAGES = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'], ['fr-FR', 'French'], ['de-DE', 'German'],
  ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'], ['nl-NL', 'Dutch'], ['zh-CN', 'Chinese (Mandarin)'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['hi-IN', 'Hindi'], ['ar-SA', 'Arabic']];
export function environmentDefaults() {
  return { preload: false, fullscreen: false, desktopOnly: false, speechBrowser: false, micCheck: false, micRequired: false, headphoneCheck: false, headphoneFail: 'record', language: 'en-US' };
}
const BOOLS = ['preload', 'fullscreen', 'desktopOnly', 'speechBrowser', 'micCheck', 'micRequired', 'headphoneCheck'];
export function validateEnvironment(env, e) {
  if (env == null) return;
  if (typeof env !== 'object') { e.push('Devices & timing settings are not valid.'); return; }
  for (const k of BOOLS) if (env[k] != null && typeof env[k] !== 'boolean') e.push(k === 'preload' ? 'Choose whether media are loaded before the session starts.' : `Devices & timing: "${k}" must be on or off.`);
  if (env.headphoneFail != null && !['record', 'screen'].includes(env.headphoneFail)) e.push('Devices & timing: choose what happens when the headphone check fails.');
  if (env.language != null && !LANGUAGES.some(([id]) => id === env.language)) e.push('Devices & timing: choose a language from the list.');
}

const bool = v => (typeof v === 'boolean' ? v : null);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : null);
const word = v => (typeof v === 'string' && /^[a-z_]{1,20}$/.test(v) ? v : null);
export function cleanChecks(d) {
  d = d && typeof d === 'object' ? d : {};
  const dv = d.device || {}, mic = d.mic, hp = d.headphone;
  return {
    device: { mobile: bool(dv.mobile), browser: word(dv.browser), speech: bool(dv.speech), screenW: num(dv.screenW, 0, 20000), screenH: num(dv.screenH, 0, 20000), dpr: num(dv.dpr, 0, 10), problems: Array.isArray(dv.problems) ? dv.problems.map(word).filter(Boolean).slice(0, 5) : [] },
    ...(mic ? { mic: { ok: bool(mic.ok), peakDb: num(mic.peakDb, -200, 10), error: word(mic.error), tries: num(mic.tries, 0, 20) } } : {}),
    ...(hp ? { headphone: { correct: num(hp.correct, 0, 6), of: num(hp.of, 0, 6), pass: bool(hp.pass), answers: Array.isArray(hp.answers) ? hp.answers.slice(0, 6).map(x => num(x, 0, 2)) : [], targets: Array.isArray(hp.targets) ? hp.targets.slice(0, 6).map(x => num(x, 0, 2)) : [] } } : {})
  };
}

// Which failed checks end the study, by the study's own settings (the browser's claim is checked against them).
export function screenReason(env, checks) {
  if (env.headphoneCheck && env.headphoneFail === 'screen' && checks.headphone && checks.headphone.pass === false) return 'headphone_check';
  if (env.micCheck && env.micRequired && checks.mic && checks.mic.ok === false) return 'mic_check';
  return null;
}

// Saves the checks for the participant's current session (once) and screens out when a required check failed.
// E: the engine (passed in, so this module has no import cycle with content.mjs).
export async function saveChecks(S, E, code, session, data, env, now = Date.now()) {
  const p = await E.loadParticipant(S, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const st = (await E.resume(S, code, now)).status || {};
  if (st.finished || session !== st.nextSession) return { error: 'wrong_session', status: 409 };
  const checks = { ...cleanChecks(data), at: now };
  const created = await setNew(S.store, `data/${p.code}/s${session}/checks`, { code: p.code, condition: p.condition, session, receivedAt: now, data: checks });
  const saved = created ? checks : ((await S.store.get(`data/${p.code}/s${session}/checks`)) || {}).data || checks;
  const why = screenReason(env, saved);
  if (why) { await update(S.store, `participants/${p.code}`, d => { if (!d.screenedOut) d.screenedOut = { at: now, reason: why }; }); return { ok: true, screenedOut: true, reason: why }; }
  return created ? { ok: true } : { ok: true, repeat: true };
}

// Full screen during one trial (kept on the trial record by the engine): on at onset, and each exit (ms after the item started).
export function cleanFullscreen(f) {
  if (!f || typeof f !== 'object') return null;
  const exits = Array.isArray(f.exitsMs) ? f.exitsMs.filter(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 864e5).slice(0, 50).map(Math.round) : [];
  return { atOnset: bool(f.atOnset), exitsMs: exits };
}
