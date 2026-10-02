// Verification study (Clark): server-side study logic.
// Storage is injected (a Netlify Blobs store in production, a Map in tests),
// so this module has no platform dependencies.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getContent, itemsFor, domainAllowed } from './vc-content.mjs';

// Sessions, alerts, and the AI schedule are study content (vc-content.mjs), editable on the admin page.
export const STUDY = {
  id: 'verification-v1',
  defaultGapDays: 6,
  pinFailLimit: 5,          // wrong PINs before a lockout
  pinLockMinutes: 15,
  tokenHours: 12,
  conditions: ['ai_first', 'evidence_first', 'control']
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

// AI advice for one alert. accurate/uncertain_correct: right verdict; incorrect/uncertain_incorrect:
// wrong verdict; manipulated: wrong verdict, high confidence, and a claim that nothing else is notable.
function aiFor(alert, type, rand, c) {
  if (!type) return null;
  const k = c.design.aiConfidence, t = c.text;
  const other = alert.truth === 'malicious' ? 'benign' : 'malicious';
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

export function sessionInfo(p, session, c) {
  const spec = c.design.sessions[session - 1];
  const usesAI = p.condition !== 'control' && Array.isArray(spec.ai);
  const aiRemoved = p.condition !== 'control' && !usesAI && c.design.sessions.slice(0, session - 1).some(x => Array.isArray(x.ai));
  return { spec, usesAI, aiRemoved, mode: usesAI ? p.condition : 'none' };
}

// A participant's plan for one session: alert order and AI behaviors are shuffled with a seed
// from their ID. The plan (with full alert copies) is saved when the session starts, so edits made
// mid-session never change what that participant is working through.
export function buildPlan(p, session, c) {
  const rand = seeded(`${p.code}|${STUDY.id}|s${session}`);
  const { spec, usesAI, aiRemoved, mode } = sessionInfo(p, session, c);
  const order = shuffle(spec.alerts.map(id => c.alerts.find(a => a.id === id)), rand);
  const types = usesAI ? shuffle(spec.ai, rand) : order.map(() => null);
  const practice = session === 1 && c.design.practice ? structuredClone(c.practice) : null;
  return {
    session, mode, aiRemoved, contentVersion: c.version || 0,
    trials: order.map((a, i) => ({ index: i, alertId: a.id, aiType: types[i], ai: aiFor(a, types[i], rand, c), alert: structuredClone(a) })),
    practice,
    practiceAI: practice && mode !== 'none' ? { verdict: practice.truth, confidence: 90, rationale: practice.aiRationale.correct } : null
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
    session: plan.session, mode: plan.mode, aiRemoved: !!plan.aiRemoved, total: plan.trials.length,
    practice: plan.practice ? publicAlert(plan.practice) : null,
    practiceAI: plan.practiceAI || null,
    practiceDone: !!state.practiceDone,
    preSurveyDone: !!state.preSurveyDone,
    trials: plan.trials.map(t => ({
      index: t.index, done: done.has(t.index), alert: publicAlert(t.alert),
      ai: t.ai ? { verdict: t.ai.verdict, confidence: t.ai.confidence, rationale: t.ai.rationale } : null
    }))
  };
}

export function status(p, now = Date.now(), total = 4) {
  const completed = p.completed || [];
  const next = completed.length + 1;
  if (next > total) return { finished: true, completed: completed.length, total };
  const last = completed[completed.length - 1];
  const availableAt = last ? last.completedAt + (p.gapDays ?? STUDY.defaultGapDays) * 86400000 : p.createdAt;
  return { finished: false, completed: completed.length, total, nextSession: next, availableAt, available: now >= availableAt };
}
const nSessions = c => c.design.sessions.length;
async function statusOf(store, p, now) { return status(p, now, nSessions(await getContent(store))); }

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
    const en = (await getContent(store)).enrollment;
    const canSignUp = en.open && EMAIL_RE.test(email) && domainAllowed(email, en.domains);
    const pepper = await getPepper(store, canSignUp);
    const notEnrolled = { error: 'not_enrolled', status: 401, domains: en.open ? en.domains : [] };
    if (!pepper || !EMAIL_RE.test(email)) return notEnrolled;
    const pid = pidFor(pepper, email);
    p = await store.get(pKey(pid));
    const pin = String(creds.pin ?? '');
    if (!p) {
      // Self sign-up: the account is created only once the student sets a PIN.
      if (!canSignUp) return notEnrolled;
      if (!creds.setPin) return { error: 'set_pin', status: 401 };
      if (!PIN_RE.test(pin)) return { error: 'bad_pin_format', status: 400 };
      [p] = await enroll(store, [pid], { gapDays: en.gapDays, label: en.label || null, selfSignup: true }, now, Math.random);
    }
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
  return { token: await issueToken(store, p.code, now), consented: !!p.consentedAt, status: await statusOf(store, p, now) };
}

// Restores a signed-in participant after a page reload.
export async function resume(store, pid, now = Date.now()) {
  const p = await loadParticipant(store, pid);
  if (!p) return { error: 'expired', status: 401 };
  return { consented: !!p.consentedAt, status: await statusOf(store, p, now) };
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
  const c = await getContent(store);
  const st = status(p, now, nSessions(c));
  if (st.finished) return { error: 'finished', status: 409 };
  if (!st.available) return { error: 'not_yet', status: 409, availableAt: st.availableAt };
  const n = st.nextSession;
  p.sessions = p.sessions || {};
  const s = p.sessions[n] || (p.sessions[n] = { startedAt: now, trialsDone: [], practiceDone: false });
  if (!s.plan) s.plan = buildPlan(p, n, c);
  if (s.preSurveyDone == null) s.preSurveyDone = itemsFor(c.survey.pre, 'pre', { session: n, mode: s.plan.mode, aiRemoved: s.plan.aiRemoved }).length === 0;
  if (!s.plan.practice) s.practiceDone = true;
  s.lastResumedAt = now;
  await save(store, p);
  return { ...publicPlan(s.plan, s), priorAI: p.condition !== 'control', contentVersion: s.plan.contentVersion };
}

export async function saveTrial(store, code, session, index, data, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const st = await statusOf(store, p, now);
  if (st.finished || session !== st.nextSession || !p.sessions?.[session]?.plan) return { error: 'wrong_session', status: 409 };
  const s = p.sessions[session];
  const plan = s.plan;
  const kind = index === 'practice' ? 'practice' : 'trial';
  if (kind === 'trial') {
    const t = plan.trials[index];
    if (!t) return { error: 'bad_index', status: 400 };
    // Keep a copy of the alert as scored, so later edits to the alert text or answer key don't change this record.
    const a = t.alert;
    const alert = { id: a.id, family: a.family, variant: a.variant, truth: a.truth, title: a.title, misleadingPanels: a.misleadingPanels, panels: a.panels.map(x => ({ key: x.key, supports: x.supports })) };
    await store.set(`data/${p.code}/s${session}/t${index}`, { code: p.code, condition: p.condition, session, index, alertId: t.alertId, aiType: t.aiType, ai: t.ai, alert, contentVersion: plan.contentVersion, receivedAt: now, data });
    if (!s.trialsDone.includes(index)) s.trialsDone.push(index);
  } else {
    await store.set(`data/${p.code}/s${session}/practice`, { code: p.code, session, contentVersion: plan.contentVersion, receivedAt: now, data });
    s.practiceDone = true;
  }
  await save(store, p);
  return { ok: true, trialsDone: s.trialsDone.length };
}

export async function saveSurvey(store, code, session, kind, data, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const c = await getContent(store);
  const st = status(p, now, nSessions(c));
  if (st.finished || session !== st.nextSession || !p.sessions?.[session]?.plan) return { error: 'wrong_session', status: 409 };
  if (!['pre', 'post'].includes(kind)) return { error: 'bad_kind', status: 400 };
  const s = p.sessions[session];
  if (kind === 'post' && s.trialsDone.length < s.plan.trials.length) return { error: 'trials_incomplete', status: 409 };
  await store.set(`data/${p.code}/s${session}/survey-${kind}`, { code: p.code, condition: p.condition, session, kind, contentVersion: c.version || 0, receivedAt: now, data });
  if (kind === 'pre') s.preSurveyDone = true;
  if (kind === 'post') {
    s.completedAt = now;
    p.completed = p.completed || [];
    p.completed.push({ session, completedAt: now });
  }
  await save(store, p);
  return { ok: true, status: status(p, now, nSessions(c)) };
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
    const p = { code: id, condition: block.pop(), createdAt: now, gapDays: opts.gapDays ?? STUDY.defaultGapDays, label: opts.label || null, test: !!opts.test, selfSignup: !!opts.selfSignup };
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
  const total = nSessions(await getContent(store));
  const out = [];
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const p = pepper && EMAIL_RE.test(email) ? await store.get(pKey(pidFor(pepper, email))) : null;
    if (!p) { out.push({ email, enrolled: false }); continue; }
    const st = status(p, now, total);
    out.push({ email, enrolled: true, totalSessions: total, id: p.code, pinSet: !!p.pin, consented: !!p.consentedAt, declined: !!p.declinedAt,
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
  const total = nSessions(await getContent(store));
  const out = [];
  for (const k of keys) {
    const p = await store.get(k);
    if (!p) continue;
    const st = status(p, now, total);
    out.push({ code: p.code, type: PID_RE.test(p.code) ? (p.selfSignup ? 'email (self)' : 'email') : 'code', pinSet: !!p.pin, condition: p.condition, label: p.label, test: !!p.test, gapDays: p.gapDays, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, nextSession: st.nextSession || null, availableAt: st.availableAt || null, lastSeenAt: p.lastSeenAt || null,
      totalSessions: total, inProgress: p.sessions && st.nextSession && p.sessions[st.nextSession] ? p.sessions[st.nextSession].trialsDone.length : 0,
      inProgressOf: p.sessions && st.nextSession && p.sessions[st.nextSession]?.plan ? p.sessions[st.nextSession].plan.trials.length : 0 });
  }
  return out.sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));
}

export async function exportAll(store) {
  const keys = await store.list('data/');
  const records = [];
  for (const k of keys) records.push({ key: k, ...(await store.get(k)) });
  const participants = [];
  for (const k of await store.list('participants/')) {
    const { pin, sessions, ...p } = await store.get(k);
    p.sessions = Object.fromEntries(Object.entries(sessions || {}).map(([n, x]) => { const { plan, ...rest } = x; return [n, { ...rest, mode: plan?.mode, contentVersion: plan?.contentVersion, alerts: plan?.trials.map(t => t.alertId) }]; }));
    participants.push(p);
  }
  return { study: STUDY.id, exportedAt: new Date().toISOString(), participants, records };
}

// Trial-level CSV with derived verification, reliance, and performance measures.
export async function exportCsv(store) {
  const { records } = await exportAll(store);
  const trials = records.filter(r => /\/t\d+$/.test(r.key));
  // One dwell column per evidence panel variable name in use (the four defaults first).
  const seen = new Set(trials.flatMap(r => (r.alert?.panels || []).map(x => x.key)));
  const panelKeys = ['network', 'user', 'system', 'context'].filter(k => seen.has(k)).concat([...seen].filter(k => !['network', 'user', 'system', 'context'].includes(k)).sort());
  const head = ['code', 'condition', 'session', 'trial_index', 'alert_id', 'family', 'truth', 'ai_type', 'ai_verdict', 'ai_confidence',
    'initial_judgment', 'initial_confidence', 'initial_rt_ms', 'final_judgment', 'final_confidence', 'final_rt_ms',
    'correct', 'agree_ai', 'changed_initial_to_final', 'switched_to_ai',
    'panels_opened_unique', 'panel_opens_total', 'evidence_breadth', 'revisits', 'opens_after_ai', 'first_panel', 'panel_sequence',
    'misleading_inspected', 'contradicts_ai_inspected', 'contradicts_ai_inspected_after_ai', ...panelKeys.map(k => `dwell_${k}_ms`),
    'influential_panels', 'trial_ms', 'mouse_path_px', 'idle_ms', 'hidden_ms', 'content_version'];
  const rows = [head.join(',')];
  for (const r of trials) {
    const a = r.alert; const d = r.data || {}; const ev = d.evidence || {};
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
      keys.length, opens.length, (keys.length / a.panels.length).toFixed(2), opens.length - keys.length,
      aiAt != null ? opens.filter(o => o.atMs >= aiAt).length : '', keys[0] || '', opens.map(o => o.panel).join('>'),
      Number(a.misleadingPanels.some(k => keys.includes(k))),
      r.ai ? Number(contra.some(k => keys.includes(k))) : '',
      r.ai && aiAt != null ? Number(opens.some(o => contra.includes(o.panel) && o.atMs >= aiAt)) : '',
      ...panelKeys.map(dwell),
      (fin.influential || []).join('|'), d.traces?.durationMs ?? '', d.traces?.mousePathPx ?? '', d.traces?.idleMs ?? '', d.traces?.hiddenMs ?? '', r.contentVersion ?? 0];
    rows.push(vals.map(v => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','));
  }
  return rows.join('\n') + '\n';
}

const csvCell = v => { const s = Array.isArray(v) ? v.join('|') : String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

// One row per survey response; one column per question variable seen in any response.
export async function exportSurveyCsv(store) {
  const { records } = await exportAll(store);
  const rs = records.filter(r => /\/survey-(pre|post)$/.test(r.key));
  const vars = [...new Set(rs.flatMap(r => Object.keys(r.data || {})))].sort();
  const head = ['code', 'condition', 'session', 'survey', 'content_version', 'received_at', ...vars];
  const rows = [head.join(',')];
  for (const r of rs) rows.push([r.code, r.condition, r.session, r.kind, r.contentVersion ?? 0, new Date(r.receivedAt).toISOString(), ...vars.map(v => (r.data || {})[v])].map(csvCell).join(','));
  return rows.join('\n') + '\n';
}

// Deletes a participant and every record they produced. Permanent.
export async function deleteParticipant(store, id) {
  const p = await store.get(pKey(id));
  if (!p) return { error: 'not_found', status: 404 };
  const keys = await store.list(`data/${p.code}/`);
  for (const k of keys) await store.delete(k);
  await store.delete(pKey(p.code));
  return { ok: true, code: p.code, test: !!p.test, records: keys.length };
}

export async function deleteTestParticipants(store) {
  let participants = 0, records = 0;
  for (const k of await store.list('participants/')) {
    const p = await store.get(k);
    if (p && p.test) { const r = await deleteParticipant(store, p.code); participants++; records += r.records; }
  }
  return { ok: true, participants, records };
}

// Marks a participant as test (excluded from counts, removable in one step) or real.
export async function setTest(store, id, test) {
  const p = await store.get(pKey(id));
  if (!p) return { error: 'not_found', status: 404 };
  p.test = !!test; await save(store, p);
  return { ok: true, code: p.code, test: p.test };
}
