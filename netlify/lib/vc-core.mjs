// Verification study (Clark): server-side study logic.
// Storage is injected (a Netlify Blobs store in production, a Map in tests),
// so this module has no platform dependencies.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ALERTS, PRACTICE } from './vc-alerts.mjs';

export const STUDY = {
  id: 'verification-v1',
  sessions: 4,
  trialsPerSession: 8,
  defaultGapDays: 6,
  pinFailLimit: 5,          // wrong PINs before a lockout
  pinLockMinutes: 15,
  tokenHours: 12,
  conditions: ['ai_first', 'evidence_first', 'control'],
  // AI schedule per session for AI conditions. Each entry is a trial type.
  // accurate: correct verdict, high confidence. uncertain: low confidence.
  // incorrect: wrong verdict, high confidence. manipulated: wrong verdict, high confidence,
  // rationale cites only the misleading evidence and claims nothing else is notable.
  aiSchedule: {
    1: ['accurate', 'accurate', 'accurate', 'accurate', 'accurate', 'accurate', 'accurate', 'accurate'],
    2: ['accurate', 'accurate', 'accurate', 'accurate', 'accurate', 'accurate', 'accurate', 'uncertain_correct'],
    3: ['accurate', 'accurate', 'accurate', 'accurate', 'incorrect', 'incorrect', 'uncertain_incorrect', 'manipulated'],
    4: null // AI removed for every condition
  }
};

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return `VC-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^VC/, '').replace(/(.{4})(.{4}).*/, 'VC-$1-$2');
}

// ---------- Identity ----------
// Students sign in with their email and a 4-digit PIN they choose the first time.
// Emails are never stored: a participant's ID is a keyed hash of the email, with the key
// (the "pepper") kept in the store, so exports stay de-identified. Pilot participants can
// still use generated access codes.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{4}$/;
const PID_RE = /^P-[0-9a-f]{16}$/;

export function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();
export function pidFor(pepper, email) { return 'P-' + hmac(pepper, 'email|' + normalizeEmail(email)).toString('hex').slice(0, 16); }
const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString('hex');

async function getPepper(store, create = false) {
  let m = await store.get('meta/pepper');
  if (!m && create) { m = { value: randomBytes(32).toString('hex'), createdAt: Date.now() }; await store.set('meta/pepper', m); }
  return m ? m.value : null;
}

async function issueToken(store, pid, now) {
  const pepper = await getPepper(store, true);
  const exp = now + STUDY.tokenHours * 3600000;
  return `${pid}.${exp}.${hmac(pepper, `tok|${pid}|${exp}`).toString('base64url')}`;
}

// Returns the participant ID for a valid, unexpired token, else null.
export async function verifyToken(store, token, now = Date.now()) {
  const [pid, exp, sig] = String(token || '').split('.');
  if (!pid || !exp || !sig || !(Number(exp) > now)) return null;
  const pepper = await getPepper(store);
  if (!pepper) return null;
  const want = Buffer.from(hmac(pepper, `tok|${pid}|${exp}`).toString('base64url'));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? pid : null;
}

// Deterministic PRNG so a participant's session plan is identical on resume.
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return function () {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Each session gets one alert per family; variant rotates so every participant sees all 32 once.
export function sessionAlerts(session) {
  const families = [...new Set(ALERTS.map(a => a.family))];
  return families.map((fam, f) => ALERTS.find(a => a.family === fam && a.variant === (f + session - 1) % 4));
}

function aiFor(alert, type, rand) {
  if (!type) return null;
  const other = alert.truth === 'malicious' ? 'benign' : 'malicious';
  const hi = () => 85 + Math.floor(rand() * 11);   // 85-95
  const lo = () => 52 + Math.floor(rand() * 8);    // 52-59
  switch (type) {
    case 'accurate': return { verdict: alert.truth, confidence: hi(), rationale: alert.aiRationale.correct };
    case 'uncertain_correct': return { verdict: alert.truth, confidence: lo(), rationale: 'The evidence is mixed. ' + alert.aiRationale.correct };
    case 'incorrect': return { verdict: other, confidence: hi(), rationale: alert.aiRationale.incorrect };
    case 'uncertain_incorrect': return { verdict: other, confidence: lo(), rationale: 'The evidence is mixed. ' + alert.aiRationale.incorrect };
    case 'manipulated': return { verdict: other, confidence: hi(), rationale: alert.aiRationale.incorrect + ' No other indicators in this alert are notable.' };
    default: return null;
  }
}

export function buildPlan(p, session) {
  const rand = seeded(`${p.code}|${STUDY.id}|s${session}`);
  const alerts = shuffle(sessionAlerts(session), rand);
  const usesAI = p.condition !== 'control' && STUDY.aiSchedule[session];
  const types = usesAI ? shuffle(STUDY.aiSchedule[session], rand) : alerts.map(() => null);
  const mode = usesAI ? p.condition : 'none';
  return {
    session, mode,
    trials: alerts.map((a, i) => ({ index: i, alertId: a.id, aiType: types[i], ai: aiFor(a, types[i], rand) })),
    practice: session === 1
  };
}

// What the browser receives: no ground truth, no panel support codes.
export function publicAlert(a) {
  return {
    id: a.id, title: a.title, severity: a.severity, summary: a.summary,
    panels: a.panels.map(x => ({ key: x.key, label: x.label, text: x.text }))
  };
}

export function publicPlan(plan, state) {
  const done = new Set(state.trialsDone || []);
  return {
    session: plan.session, mode: plan.mode, total: plan.trials.length,
    practice: plan.practice ? publicAlert(PRACTICE) : null,
    practiceAI: plan.practice && plan.mode !== 'none' ? { verdict: PRACTICE.truth, confidence: 90, rationale: PRACTICE.aiRationale.correct } : null,
    practiceDone: !!state.practiceDone,
    preSurveyDone: !!state.preSurveyDone,
    trials: plan.trials.map(t => ({
      index: t.index, done: done.has(t.index), alert: publicAlert(ALERTS.find(a => a.id === t.alertId)),
      ai: t.ai ? { verdict: t.ai.verdict, confidence: t.ai.confidence, rationale: t.ai.rationale } : null
    }))
  };
}

export function status(p, now = Date.now()) {
  const completed = p.completed || [];
  const next = completed.length + 1;
  if (next > STUDY.sessions) return { finished: true, completed: completed.length, total: STUDY.sessions };
  const last = completed[completed.length - 1];
  const availableAt = last ? last.completedAt + (p.gapDays ?? STUDY.defaultGapDays) * 86400000 : p.createdAt;
  return { finished: false, completed: completed.length, total: STUDY.sessions, nextSession: next, availableAt, available: now >= availableAt };
}

// ---------- Handlers (storage: { get(key), set(key, value), list(prefix) }) ----------

const pKey = code => `participants/${code}`;

export async function loadParticipant(store, rawCode) {
  if (PID_RE.test(String(rawCode || ''))) return await store.get(pKey(rawCode));
  const code = normalizeCode(rawCode);
  if (!/^VC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return null;
  return await store.get(pKey(code));
}

async function save(store, p) { p.updatedAt = Date.now(); await store.set(pKey(p.code), p); }

// creds: { email, pin, setPin } for students, or { code } for pilot access codes.
export async function login(store, creds = {}, now = Date.now()) {
  let p;
  if (creds.email != null) {
    const email = normalizeEmail(creds.email);
    const pepper = await getPepper(store);
    if (!pepper || !EMAIL_RE.test(email)) return { error: 'not_enrolled', status: 401 };
    p = await store.get(pKey(pidFor(pepper, email)));
    if (!p) return { error: 'not_enrolled', status: 401 };
    const pin = String(creds.pin ?? '');
    if (!p.pin) {
      if (!creds.setPin) return { error: 'set_pin', status: 401 };
      if (!PIN_RE.test(pin)) return { error: 'bad_pin_format', status: 400 };
      const salt = randomBytes(16).toString('hex');
      p.pin = { salt, hash: hashPin(pin, salt), setAt: now };
    } else {
      if (p.pinLockUntil && now < p.pinLockUntil) return { error: 'locked', status: 429, until: p.pinLockUntil };
      const ok = PIN_RE.test(pin) && timingSafeEqual(Buffer.from(hashPin(pin, p.pin.salt), 'hex'), Buffer.from(p.pin.hash, 'hex'));
      if (!ok) {
        p.pinFails = (p.pinFails || 0) + 1;
        const locked = p.pinFails >= STUDY.pinFailLimit;
        if (locked) { p.pinLockUntil = now + STUDY.pinLockMinutes * 60000; p.pinFails = 0; }
        await save(store, p);
        return locked ? { error: 'locked', status: 429, until: p.pinLockUntil } : { error: 'wrong_pin', status: 401, attemptsLeft: STUDY.pinFailLimit - p.pinFails };
      }
      p.pinFails = 0; p.pinLockUntil = null;
    }
  } else {
    p = await loadParticipant(store, creds.code);
    if (!p || PID_RE.test(p.code)) return { error: 'invalid_code', status: 401 };
  }
  p.lastSeenAt = now; await save(store, p);
  return { token: await issueToken(store, p.code, now), consented: !!p.consentedAt, status: status(p, now) };
}

// Restores a signed-in participant after a page reload.
export async function resume(store, pid, now = Date.now()) {
  const p = await loadParticipant(store, pid);
  if (!p) return { error: 'expired', status: 401 };
  return { consented: !!p.consentedAt, status: status(p, now) };
}

export async function consent(store, code, agree, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!agree) { p.declinedAt = now; await save(store, p); return { ok: true, declined: true }; }
  p.consentedAt = p.consentedAt || now; await save(store, p);
  return { ok: true };
}

export async function startSession(store, code, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!p.consentedAt) return { error: 'no_consent', status: 403 };
  const st = status(p, now);
  if (st.finished) return { error: 'finished', status: 409 };
  if (!st.available) return { error: 'not_yet', status: 409, availableAt: st.availableAt };
  const n = st.nextSession;
  p.sessions = p.sessions || {};
  const s = p.sessions[n] || (p.sessions[n] = { startedAt: now, trialsDone: [], practiceDone: false, preSurveyDone: n !== 1 });
  s.lastResumedAt = now;
  await save(store, p);
  return { ...publicPlan(buildPlan(p, n), s), priorAI: p.condition !== 'control' };
}

export async function saveTrial(store, code, session, index, data, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const st = status(p, now);
  if (st.finished || session !== st.nextSession || !p.sessions?.[session]) return { error: 'wrong_session', status: 409 };
  const s = p.sessions[session];
  const kind = index === 'practice' ? 'practice' : 'trial';
  if (kind === 'trial') {
    const plan = buildPlan(p, session);
    const t = plan.trials[index];
    if (!t) return { error: 'bad_index', status: 400 };
    await store.set(`data/${p.code}/s${session}/t${index}`, { code: p.code, condition: p.condition, session, index, alertId: t.alertId, aiType: t.aiType, ai: t.ai, receivedAt: now, data });
    if (!s.trialsDone.includes(index)) s.trialsDone.push(index);
  } else {
    await store.set(`data/${p.code}/s${session}/practice`, { code: p.code, session, receivedAt: now, data });
    s.practiceDone = true;
  }
  await save(store, p);
  return { ok: true, trialsDone: s.trialsDone.length };
}

export async function saveSurvey(store, code, session, kind, data, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const st = status(p, now);
  if (st.finished || session !== st.nextSession || !p.sessions?.[session]) return { error: 'wrong_session', status: 409 };
  if (!['pre', 'post'].includes(kind)) return { error: 'bad_kind', status: 400 };
  const s = p.sessions[session];
  await store.set(`data/${p.code}/s${session}/survey-${kind}`, { code: p.code, condition: p.condition, session, kind, receivedAt: now, data });
  if (kind === 'pre') s.preSurveyDone = true;
  if (kind === 'post') {
    if (s.trialsDone.length < STUDY.trialsPerSession) return { error: 'trials_incomplete', status: 409 };
    s.completedAt = now;
    p.completed = p.completed || [];
    p.completed.push({ session, completedAt: now });
  }
  await save(store, p);
  return { ok: true, status: status(p, now) };
}

// ---------- Admin ----------

// Conditions come from balanced blocks of three. The unused rest of a block carries over
// between calls, so adding a roster in batches stays balanced.
async function enroll(store, ids, opts, now, rand) {
  const meta = (await store.get('meta/assignment')) || { assigned: 0 };
  let block = meta.block || [];
  const made = [];
  for (const id of ids) {
    if (!block.length) block = shuffle(STUDY.conditions, rand);
    const p = { code: id, condition: block.pop(), createdAt: now, gapDays: opts.gapDays ?? STUDY.defaultGapDays, label: opts.label || null, test: !!opts.test };
    await store.set(pKey(id), p);
    made.push(p);
  }
  meta.assigned += ids.length; meta.block = block; await store.set('meta/assignment', meta);
  return made;
}

export async function createParticipants(store, count, opts = {}, now = Date.now(), rand = Math.random) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    let code; do { code = newCode(rand); } while (ids.includes(code) || await store.get(pKey(code)));
    ids.push(code);
  }
  const made = await enroll(store, ids, opts, now, rand);
  return { created: made.map(p => ({ code: p.code, condition: p.condition, label: p.label, gapDays: p.gapDays, test: p.test })) };
}

// Adds roster emails. Only hashes are stored; emails already enrolled are left as they are.
export async function addRoster(store, emails, opts = {}, now = Date.now(), rand = Math.random) {
  const pepper = await getPepper(store, true);
  const invalid = []; const ids = []; let existing = 0;
  for (const raw of emails) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (!EMAIL_RE.test(e)) { invalid.push(raw); continue; }
    const id = pidFor(pepper, e);
    if (ids.includes(id)) continue;
    if (await store.get(pKey(id))) { existing++; continue; }
    ids.push(id);
  }
  await enroll(store, ids, opts, now, rand);
  return { added: ids.length, existing, invalid };
}

// Completion check for course credit: status for each email the admin pastes in.
export async function lookupEmails(store, emails, now = Date.now()) {
  const pepper = await getPepper(store);
  const out = [];
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const p = pepper && EMAIL_RE.test(email) ? await store.get(pKey(pidFor(pepper, email))) : null;
    if (!p) { out.push({ email, enrolled: false }); continue; }
    const st = status(p, now);
    out.push({ email, enrolled: true, id: p.code, pinSet: !!p.pin, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, finished: !!st.finished, lastCompletedAt: (p.completed || []).slice(-1)[0]?.completedAt || null });
  }
  return out;
}

export async function resetPin(store, email) {
  const pepper = await getPepper(store);
  const p = pepper ? await store.get(pKey(pidFor(pepper, email))) : null;
  if (!p) return { error: 'not_enrolled', status: 404 };
  p.pin = null; p.pinFails = 0; p.pinLockUntil = null; await save(store, p);
  return { ok: true };
}

export async function listParticipants(store, now = Date.now()) {
  const keys = await store.list('participants/');
  const out = [];
  for (const k of keys) {
    const p = await store.get(k);
    if (!p) continue;
    const st = status(p, now);
    out.push({ code: p.code, type: PID_RE.test(p.code) ? 'email' : 'code', pinSet: !!p.pin, condition: p.condition, label: p.label, test: !!p.test, gapDays: p.gapDays, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, nextSession: st.nextSession || null, availableAt: st.availableAt || null, lastSeenAt: p.lastSeenAt || null,
      inProgress: p.sessions && st.nextSession && p.sessions[st.nextSession] ? p.sessions[st.nextSession].trialsDone.length : 0 });
  }
  return out.sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));
}

export async function exportAll(store) {
  const keys = await store.list('data/');
  const records = [];
  for (const k of keys) records.push({ key: k, ...(await store.get(k)) });
  const participants = [];
  for (const k of await store.list('participants/')) { const { pin, ...p } = await store.get(k); participants.push(p); }
  return { study: STUDY.id, exportedAt: new Date().toISOString(), participants, records };
}

// Trial-level CSV with derived verification, reliance, and performance measures.
export async function exportCsv(store) {
  const { records } = await exportAll(store);
  const head = ['code', 'condition', 'session', 'trial_index', 'alert_id', 'family', 'truth', 'ai_type', 'ai_verdict', 'ai_confidence',
    'initial_judgment', 'initial_confidence', 'initial_rt_ms', 'final_judgment', 'final_confidence', 'final_rt_ms',
    'correct', 'agree_ai', 'changed_initial_to_final', 'switched_to_ai',
    'panels_opened_unique', 'panel_opens_total', 'evidence_breadth', 'revisits', 'opens_after_ai', 'first_panel', 'panel_sequence',
    'misleading_inspected', 'contradicts_ai_inspected', 'contradicts_ai_inspected_after_ai', 'dwell_network_ms', 'dwell_user_ms', 'dwell_system_ms', 'dwell_context_ms',
    'influential_panels', 'trial_ms', 'mouse_path_px', 'idle_ms', 'hidden_ms'];
  const rows = [head.join(',')];
  for (const r of records.filter(r => /\/t\d+$/.test(r.key))) {
    const a = ALERTS.find(x => x.id === r.alertId); const d = r.data || {}; const ev = d.evidence || {};
    const opens = ev.opens || [];
    const keys = [...new Set(opens.map(o => o.panel))];
    const aiAt = d.aiShownAtMs;
    const contra = r.ai ? a.panels.filter(x => x.supports !== 'neutral' && x.supports !== r.ai.verdict).map(x => x.key) : [];
    const dwell = k => Math.round(opens.filter(o => o.panel === k).reduce((s, o) => s + (o.dwellMs || 0), 0));
    const fin = d.final || {}; const ini = d.initial || {};
    const vals = [r.code, r.condition, r.session, r.index, r.alertId, a.family, a.truth, r.aiType || '', r.ai?.verdict || '', r.ai?.confidence ?? '',
      ini.judgment || '', ini.confidence ?? '', ini.rtMs ?? '', fin.judgment || '', fin.confidence ?? '', fin.rtMs ?? '',
      fin.judgment ? Number(fin.judgment === a.truth) : '', r.ai && fin.judgment ? Number(fin.judgment === r.ai.verdict) : '',
      ini.judgment && fin.judgment ? Number(ini.judgment !== fin.judgment) : '',
      r.ai && ini.judgment && fin.judgment ? Number(ini.judgment !== r.ai.verdict && fin.judgment === r.ai.verdict) : '',
      keys.length, opens.length, (keys.length / 4).toFixed(2), opens.length - keys.length,
      aiAt != null ? opens.filter(o => o.atMs >= aiAt).length : '', keys[0] || '', opens.map(o => o.panel).join('>'),
      Number(a.misleadingPanels.some(k => keys.includes(k))),
      r.ai ? Number(contra.some(k => keys.includes(k))) : '',
      r.ai && aiAt != null ? Number(opens.some(o => contra.includes(o.panel) && o.atMs >= aiAt)) : '',
      dwell('network'), dwell('user'), dwell('system'), dwell('context'),
      (fin.influential || []).join('|'), d.traces?.durationMs ?? '', d.traces?.mousePathPx ?? '', d.traces?.idleMs ?? '', d.traces?.hiddenMs ?? ''];
    rows.push(vals.map(v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','));
  }
  return rows.join('\n') + '\n';
}
