// Verification study (Clark): server-side study logic.
// Storage is injected (a Netlify Blobs store in production, a Map in tests),
// so this module has no platform dependencies.
import { ALERTS, PRACTICE } from './vc-alerts.mjs';

export const STUDY = {
  id: 'verification-v1',
  sessions: 4,
  trialsPerSession: 8,
  defaultGapDays: 6,
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
  const code = normalizeCode(rawCode);
  if (!/^VC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return null;
  return await store.get(pKey(code));
}

async function save(store, p) { p.updatedAt = Date.now(); await store.set(pKey(p.code), p); }

export async function login(store, code, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  p.lastSeenAt = now; await save(store, p);
  return { code: p.code, consented: !!p.consentedAt, status: status(p, now) };
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

export async function createParticipants(store, count, opts = {}, now = Date.now(), rand = Math.random) {
  const meta = (await store.get('meta/assignment')) || { assigned: 0 };
  const made = [];
  let block = [];
  for (let i = 0; i < count; i++) {
    if (!block.length) block = shuffle(STUDY.conditions, rand);
    let code; do { code = newCode(rand); } while (await store.get(pKey(code)));
    const p = { code, condition: block.pop(), createdAt: now, gapDays: opts.gapDays ?? STUDY.defaultGapDays, label: opts.label || null, test: !!opts.test };
    await store.set(pKey(code), p);
    made.push({ code, condition: p.condition, label: p.label, gapDays: p.gapDays, test: p.test });
  }
  meta.assigned += count; await store.set('meta/assignment', meta);
  return { created: made };
}

export async function listParticipants(store, now = Date.now()) {
  const keys = await store.list('participants/');
  const out = [];
  for (const k of keys) {
    const p = await store.get(k);
    if (!p) continue;
    const st = status(p, now);
    out.push({ code: p.code, condition: p.condition, label: p.label, test: !!p.test, gapDays: p.gapDays, consented: !!p.consentedAt, declined: !!p.declinedAt,
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
  for (const k of await store.list('participants/')) participants.push(await store.get(k));
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
