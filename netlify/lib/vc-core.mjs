// Verification study (Clark): server-side study logic.
// Storage is injected (a Netlify Blobs store in production, a Map in tests), so this module has no
// platform dependencies. Store interface: get, set, delete, list(prefix), and optionally
// getMeta(key) -> { data, etag } and setIf(key, value, { etag } | { onlyIfNew: true }) -> boolean
// for conditional writes (see update()).
//
// Key schema
//   participants/{id}          small record: condition, flags, timestamps, per-session status
//   plans/{id}/s{n}            the session plan (alert copies, order, AI advice), fixed when the session starts
//   data/{id}/s{n}/t{i}        one trial (answers, evidence opens, trace features), no raw events
//   raw/{id}/s{n}/t{i}         raw TraceLab events for that trial
//   data/{id}/s{n}/practice | survey-pre | survey-post
//   contact/{id}               the student's email (extra credit only; never in research exports)
//   meta/pepper, meta/assignment, content/*, admins/*, audit/*, selftest/*
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getContent, itemsFor, domainAllowed } from './vc-content.mjs';

export const STUDY = {
  id: 'verification-v1',
  defaultGapDays: 6,
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
// Students sign in with their email (no password; the first sign-in asks them to confirm it). A
// participant's study ID is a keyed hash of the email; the key ("pepper") lives in the same store, so
// anyone with Netlify access to the store can re-identify participants. The email itself is saved only
// under contact/{id} for extra-credit matching, never in research records or exports.

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const PID_RE = /^P-[0-9a-f]{16}$/;

export function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();
export function pidFor(pepper, email) { return 'P-' + hmac(pepper, 'email|' + normalizeEmail(email)).toString('hex').slice(0, 16); }

async function getPepper(store, create = false) {
  let m = await store.get('meta/pepper');
  if (!m && create) {
    const fresh = { value: randomBytes(32).toString('hex'), createdAt: Date.now() };
    if (store.setIf) { await store.setIf('meta/pepper', fresh, { onlyIfNew: true }); m = await store.get('meta/pepper'); }
    else { await store.set('meta/pepper', fresh); m = fresh; }
  }
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

// ---------- Storage helpers ----------

const pKey = code => `participants/${code}`;
const contactKey = code => `contact/${code}`;
const planKey = (code, n) => `plans/${code}/s${n}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Read-modify-write with a compare-and-swap on the blob's etag, retried on conflict, so two requests
// at once (double-click, two tabs) can't overwrite each other. fn(draft) mutates the draft and may
// return { error } to abort without writing. Stores without getMeta/setIf fall back to plain get/set.
export async function update(store, key, fn, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const cur = store.getMeta ? await store.getMeta(key) : { data: await store.get(key) };
    if (!cur || cur.data == null) return { error: 'not_found', status: 404 };
    const draft = structuredClone(cur.data);
    const out = await fn(draft);
    if (out && out.error) return out;
    draft.updatedAt = Date.now();
    if (!store.setIf) { await store.set(key, draft); return { value: draft, out }; }
    if (await store.setIf(key, draft, { etag: cur.etag })) return { value: draft, out };
    await sleep(5 + Math.random() * 25 * Math.min(i + 1, 6));   // jittered backoff
  }
  return { error: 'busy', status: 503 };
}

// Reads many keys in parallel batches.
export async function getMany(store, keys, batch = 40) {
  const out = [];
  for (let i = 0; i < keys.length; i += batch) {
    const slice = keys.slice(i, i + batch);
    const vals = await Promise.all(slice.map(k => store.get(k)));
    slice.forEach((k, j) => out.push([k, vals[j]]));
  }
  return out;
}

async function setNew(store, key, value) {
  if (store.setIf) return store.setIf(key, value, { onlyIfNew: true });
  if (await store.get(key)) return false;
  await store.set(key, value); return true;
}

// ---------- Session design ----------

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

// A participant's plan for one session: alert order and AI behaviors are shuffled with a seed from
// their ID. The plan (with full alert copies) is stored when the session starts, so edits made
// mid-study never change a session in progress.
export function buildPlan(p, session, c) {
  const rand = seeded(`${p.code}|${STUDY.id}|s${session}`);
  const { spec, usesAI, aiRemoved, mode } = sessionInfo(p, session, c);
  const order = shuffle(spec.alerts.map(id => c.alerts.find(a => a.id === id)), rand);
  const types = usesAI ? shuffle(spec.ai, rand) : order.map(() => null);
  // Counterbalancing: a fixed per-participant rotation of evidence panels and answer-button order.
  const cb = c.design.counterbalance || {}, pr = seeded(`${p.code}|${STUDY.id}|cb`), turn = Math.floor(pr() * 1e6), flip = pr() < 0.5;
  const rotate = a => { if (!cb.panels || !a) return a; const k = turn % a.panels.length; a.panels = a.panels.slice(k).concat(a.panels.slice(0, k)); return a; };
  const practice = session === 1 && c.design.practice ? rotate(structuredClone(c.practice)) : null;
  const ctx = { session, mode, aiRemoved };
  return {
    session, mode, aiRemoved, contentVersion: c.version || 0, createdAt: Date.now(),
    answerOrder: cb.answers && flip ? ['benign', 'malicious'] : ['malicious', 'benign'],
    trials: order.map((a, i) => ({ index: i, alertId: a.id, aiType: types[i], ai: aiFor(a, types[i], rand, c), alert: rotate(structuredClone(a)) })),
    practice,
    practiceAI: practice && mode !== 'none' ? { verdict: practice.truth, confidence: 90, rationale: practice.aiRationale.correct } : null,
    // Survey questions this participant sees this session, fixed with the plan.
    preItems: itemsFor(c.survey.pre, 'pre', ctx),
    postItems: itemsFor(c.survey.post, 'post', ctx)
  };
}

// What the browser receives: no IDs (variant numbering could hint at the answer), no ground truth,
// no panel support codes.
export function publicAlert(a) {
  return { title: a.title, severity: a.severity, summary: a.summary, panels: a.panels.map(x => ({ key: x.key, label: x.label, text: x.text })) };
}

export function publicPlan(plan, state) {
  const done = new Set(state.trialsDone || []);
  return {
    session: plan.session, mode: plan.mode, aiRemoved: !!plan.aiRemoved, total: plan.trials.length, answerOrder: plan.answerOrder || ['malicious', 'benign'],
    practice: plan.practice ? publicAlert(plan.practice) : null,
    practiceAI: plan.practiceAI || null,
    practiceDone: !!state.practiceDone,
    preSurveyDone: !!state.preSurveyDone,
    preItems: plan.preItems || [], postItems: plan.postItems || [],
    trials: plan.trials.map(t => ({
      index: t.index, done: done.has(t.index), alert: publicAlert(t.alert),
      ai: t.ai ? { verdict: t.ai.verdict, confidence: t.ai.confidence, rationale: t.ai.rationale } : null
    }))
  };
}

// ---------- Progress is derived from write-once records ----------
// Netlify Blobs does not keep conditional writes atomic under concurrency (the live self-test showed
// simultaneous compare-and-swap updates being lost), so nothing that matters is kept as a counter or list
// inside a shared record. Each answer is its own write-once key; progress is read back from which keys exist:
//   data/{id}/s{n}/t{i} | practice | survey-pre | survey-post   answers
//   started/{id}/s{n}-{time}, done/{id}/s{n}-{time}               session start and completion
//   views/{id}/s{n}/t{i}/{time}-{rand}                             each time a trial screen was shown
export async function progressOf(store, p) {
  const [dataKeys, doneKeys, startKeys] = await Promise.all([store.list(`data/${p.code}/`), store.list(`done/${p.code}/`), store.list(`started/${p.code}/`)]);
  const sessions = {};
  const S = n => sessions[n] || (sessions[n] = { trialsDone: [], practiceDone: false, preSurveyDone: false, postDone: false, startedAt: null, completedAt: null });
  for (const k of dataKeys) {
    const m = k.match(/\/s(\d+)\/(?:t(\d+)|(practice|survey-pre|survey-post))$/);
    if (!m) continue;
    const s = S(+m[1]);
    if (m[2] != null) s.trialsDone.push(+m[2]);
    else if (m[3] === 'practice') s.practiceDone = true;
    else if (m[3] === 'survey-pre') s.preSurveyDone = true;
    else s.postDone = true;
  }
  for (const k of startKeys) { const m = k.match(/\/s(\d+)-(\d+)$/); if (m) { const s = S(+m[1]); s.startedAt = Math.min(s.startedAt ?? Infinity, +m[2]); } }
  const completed = [];
  for (const k of doneKeys) { const m = k.match(/\/s(\d+)-(\d+)$/); if (m) { const s = S(+m[1]); if (s.completedAt == null || +m[2] < s.completedAt) s.completedAt = +m[2]; } }
  for (const [n, s] of Object.entries(sessions)) if (s.completedAt != null) completed.push({ session: +n, completedAt: s.completedAt });
  // Records written by the earlier single-record format.
  if (!completed.length && Array.isArray(p.completed)) completed.push(...p.completed);
  for (const [n, s] of Object.entries(p.sessions || {})) { const t = S(+n); t.startedAt = t.startedAt ?? s.startedAt ?? null; if (!t.trialsDone.length && s.trialsDone) t.trialsDone = s.trialsDone.slice(); }
  completed.sort((a, b) => a.session - b.session);
  return { sessions, completed };
}

// Number of sessions for this participant: fixed when they start session 1, so adding sessions later
// doesn't un-finish anyone, and removing sessions never strands a session already in progress.
export function totalFor(p, c, prog) {
  const nS = c.design.sessions.length;
  let total = Math.min(p.totalSessions ?? nS, nS);
  const next = (prog?.completed || p.completed || []).length + 1;
  const cur = prog?.sessions?.[next];
  if (next > total && cur?.startedAt && !cur.completedAt) total = next;
  return total;
}

export function status(p, now = Date.now(), total = 4, completedList) {
  const completed = completedList || p.completed || [];
  const next = completed.length + 1;
  if (next > total) return { finished: true, completed: completed.length, total };
  const last = completed[completed.length - 1];
  const availableAt = last ? last.completedAt + (p.gapDays ?? STUDY.defaultGapDays) * 86400000 : p.createdAt;
  return { finished: false, completed: completed.length, total, nextSession: next, availableAt, available: now >= availableAt };
}
async function statusOf(store, p, now, c, prog) {
  c = c || await getContent(store); prog = prog || await progressOf(store, p);
  return status(p, now, totalFor(p, c, prog), prog.completed);
}

async function getPlan(store, p, n) { return p.sessions?.[n]?.plan || await store.get(planKey(p.code, n)); }

// ---------- Validation of what the browser sends ----------

const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const oneOf = (v, opts) => opts.includes(v) ? v : null;
const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : null;
const jsonSize = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };

export function cleanTrialData(d, alert) {
  d = d && typeof d === 'object' ? d : {};
  const keys = alert.panels.map(x => x.key), J = ['malicious', 'benign'];
  const step = x => x && typeof x === 'object' ? { judgment: oneOf(x.judgment, J), confidence: num(x.confidence, 0, 100), rtMs: num(x.rtMs, 0, 864e5) } : null;
  const fin = step(d.final) || {};
  fin.influential = Array.isArray(d.final?.influential) ? d.final.influential.filter(k => keys.includes(k) || k === 'summary' || k === 'ai').slice(0, 20) : [];
  const opens = Array.isArray(d.evidence?.opens) ? d.evidence.opens.slice(0, 1000).filter(o => o && keys.includes(o.panel))
    .map(o => ({ panel: o.panel, atMs: num(o.atMs, 0, 864e5), dwellMs: num(o.dwellMs, 0, 864e5), hiddenMs: num(o.hiddenMs, 0, 864e5) || 0, afterAI: !!o.afterAI })) : [];
  const answerLog = Array.isArray(d.answerLog) ? d.answerLog.slice(0, 1000).map(a => ({ atMs: num(a?.atMs, 0, 864e5), name: str(a?.name, 40),
    value: Array.isArray(a?.value) ? a.value.slice(0, 20).map(x => str(String(x), 40)) : typeof a?.value === 'number' ? a.value : str(String(a?.value ?? ''), 200) })) : [];
  const small = (v, max) => v && typeof v === 'object' && jsonSize(v) <= max ? v : null;
  return {
    mode: oneOf(d.mode, ['ai_first', 'evidence_first', 'none']), aiShownAtMs: num(d.aiShownAtMs, 0, 864e5),
    initial: step(d.initial), final: fin,
    evidence: { opens, unique: [...new Set(opens.map(o => o.panel))] },
    answerLog, traces: small(d.traces, 50000),
    viewport: d.viewport ? { w: num(d.viewport.w, 0, 20000), h: num(d.viewport.h, 0, 20000) } : null,
    device: small(d.device, 4000), selfTest: d.selfTest === true || undefined
  };
}

export function cleanSurveyData(d, items) {
  d = d && typeof d === 'object' ? d : {};
  const out = {};
  for (const it of items) {
    const v = d[it.id];
    if (v == null || v === '') continue;
    if (it.type === 'scale') { const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= it.n) out[it.id] = String(n); }
    else if (it.type === 'choice' || it.type === 'select') { if (it.options.some(o => o.value === v)) out[it.id] = v; }
    else out[it.id] = String(v).slice(0, 4000);
  }
  return out;
}

// ---------- Participant handlers ----------

export async function loadParticipant(store, rawCode) {
  if (PID_RE.test(String(rawCode || ''))) return await store.get(pKey(rawCode));
  const code = normalizeCode(rawCode);
  if (!/^VC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return null;
  return await store.get(pKey(code));
}

// Students sign in with their email alone; the first sign-in asks them to confirm it (creds.confirm)
// so a typo doesn't split their sessions. Pilot access codes use { code }.
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
    if (!p) {
      if (!canSignUp) return notEnrolled;
      if (!creds.confirm) return { error: 'confirm_new', status: 401, email };
      [p] = await enroll(store, [pid], { gapDays: en.gapDays, label: en.label || null, selfSignup: true }, now, Math.random);
    }
    await setNew(store, contactKey(p.code), { email, firstSeenAt: now });
  } else {
    p = await loadParticipant(store, creds.code);
    if (!p || PID_RE.test(p.code)) return { error: 'invalid_code', status: 401 };
  }
  // lastSeenAt is informational; a lost update here costs nothing.
  const u = await update(store, pKey(p.code), d => { d.lastSeenAt = now; });
  const rec = u.value || p;
  return { token: await issueToken(store, p.code, now), consented: !!rec.consentedAt, status: await statusOf(store, rec, now) };
}

// Restores a signed-in participant after a page reload.
export async function resume(store, pid, now = Date.now()) {
  const p = await loadParticipant(store, pid);
  if (!p) return { error: 'expired', status: 401 };
  return { consented: !!p.consentedAt, status: await statusOf(store, p, now) };
}

export async function consent(store, code, agree, now = Date.now()) {
  if (agree) await setNew(store, `consent/${code}`, { at: now });   // write-once record of consent
  const u = await update(store, pKey(code), d => { if (agree) d.consentedAt = d.consentedAt || now; else d.declinedAt = now; });
  if (u.error) return u.error === 'not_found' ? { error: 'invalid_code', status: 401 } : u;
  return agree ? { ok: true } : { ok: true, declined: true };
}

function sessionView(prog, n, plan) {
  const s = prog.sessions[n] || { trialsDone: [], practiceDone: false, preSurveyDone: false };
  return { trialsDone: s.trialsDone, practiceDone: s.practiceDone || !plan.practice, preSurveyDone: s.preSurveyDone || !(plan.preItems || []).length };
}

export async function startSession(store, code, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!p.consentedAt && !(await store.get(`consent/${p.code}`))) return { error: 'no_consent', status: 403 };
  const c = await getContent(store);
  const prog = await progressOf(store, p);
  const st = status(p, now, totalFor(p, c, prog), prog.completed);
  if (st.finished) return { error: 'finished', status: 409 };
  if (!st.available) return { error: 'not_yet', status: 409, availableAt: st.availableAt };
  const n = st.nextSession;
  // The plan is written once; whoever writes first wins and everyone reads that copy.
  let plan = await getPlan(store, p, n);
  if (!plan) {
    if (await setNew(store, planKey(p.code, n), buildPlan(p, n, c))) await store.set(`started/${p.code}/s${n}-${now}`, { at: now });
    plan = await store.get(planKey(p.code, n));
    if (n === 1 && p.totalSessions == null) await update(store, pKey(p.code), d => { if (d.totalSessions == null) d.totalSessions = c.design.sessions.length; });
  }
  return { ...publicPlan(plan, sessionView(prog, n, plan)), priorAI: p.condition !== 'control', contentVersion: plan.contentVersion };
}

// Records that a trial screen was shown (a reload re-shows it); exported as views.
export async function viewTrial(store, code, session, index, now = Date.now()) {
  if (!(Number.isInteger(session) && session > 0 && session < 100 && Number.isInteger(index) && index >= 0 && index < 1000)) return { error: 'bad_index', status: 400 };
  await store.set(`views/${code}/s${session}/t${index}/${now}-${randomBytes(3).toString('hex')}`, { at: now });
  return { ok: true };
}

export async function saveTrial(store, code, session, index, data, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const kind = index === 'practice' ? 'practice' : 'trial';
  const key = kind === 'trial' ? `data/${p.code}/s${session}/t${index}` : `data/${p.code}/s${session}/practice`;
  // Re-sends (retries, double clicks) are acknowledged without overwriting the first answer.
  if (await store.get(key)) return { ok: true, repeat: true };
  const c = await getContent(store), prog = await progressOf(store, p);
  const st = status(p, now, totalFor(p, c, prog), prog.completed);
  const plan = await getPlan(store, p, session);
  if (st.finished || session !== st.nextSession || !plan) return { error: 'wrong_session', status: 409 };
  if (kind === 'trial') {
    const t = plan.trials[index];
    if (!t) return { error: 'bad_index', status: 400 };
    const a = t.alert;
    const raw = Array.isArray(data?.rawEvents) ? data.rawEvents.slice(0, 20000) : [];
    const clean = cleanTrialData(data, a);
    // Keep a copy of the alert as scored, so later edits to the alert text or answer key don't change this record.
    const alert = { id: a.id, family: a.family, variant: a.variant, truth: a.truth, title: a.title, misleadingPanels: a.misleadingPanels, panels: a.panels.map(x => ({ key: x.key, supports: x.supports })) };
    const created = await setNew(store, key, { code: p.code, condition: p.condition, session, index, alertId: t.alertId, aiType: t.aiType, ai: t.ai, alert, answerOrder: plan.answerOrder || ['malicious', 'benign'], contentVersion: plan.contentVersion, receivedAt: now, data: clean });
    if (!created) return { ok: true, repeat: true };
    if (raw.length && jsonSize(raw) <= 3e6) await store.set(`raw/${p.code}/s${session}/t${index}`, { code: p.code, session, index, events: raw });
  } else {
    if (!(await setNew(store, key, { code: p.code, session, contentVersion: plan.contentVersion, receivedAt: now, data: { selfTest: data?.selfTest === true || undefined } }))) return { ok: true, repeat: true };
  }
  return { ok: true };
}

export async function saveSurvey(store, code, session, kind, data, now = Date.now()) {
  const p = await loadParticipant(store, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!['pre', 'post'].includes(kind)) return { error: 'bad_kind', status: 400 };
  const c = await getContent(store);
  const key = `data/${p.code}/s${session}/survey-${kind}`;
  if (await store.get(key)) {   // a re-send: acknowledge without overwriting
    const prog = await progressOf(store, p);
    return { ok: true, repeat: true, status: status(p, now, totalFor(p, c, prog), prog.completed) };
  }
  const prog = await progressOf(store, p);
  const st = status(p, now, totalFor(p, c, prog), prog.completed);
  const plan = await getPlan(store, p, session);
  if (st.finished || session !== st.nextSession || !plan) return { error: 'wrong_session', status: 409 };
  if (kind === 'post' && (prog.sessions[session]?.trialsDone.length || 0) < plan.trials.length) return { error: 'trials_incomplete', status: 409 };
  const items = (kind === 'pre' ? plan.preItems : plan.postItems) || itemsFor(c.survey[kind], kind, { session, mode: plan.mode, aiRemoved: plan.aiRemoved });
  const created = await setNew(store, key, { code: p.code, condition: p.condition, session, kind, contentVersion: plan.contentVersion, receivedAt: now, data: cleanSurveyData(data, items) });
  if (created && kind === 'post') await store.set(`done/${p.code}/s${session}-${now}`, { at: now });
  const after = await progressOf(store, p);
  return { ok: true, repeat: !created || undefined, status: status(p, now, totalFor(p, c, after), after.completed) };
}

// ---------- Admin ----------

// Conditions are assigned by minimization: each new participant goes to the condition with the fewest
// participants so far (ties broken at random), counted from write-once marker keys (cond/{condition}/{id}).
// Test participants are counted separately (cond-test/), so pilots don't unbalance the real sample.
async function pickCondition(store, test, rand) {
  const pre = test ? 'cond-test' : 'cond';
  const counts = await Promise.all(STUDY.conditions.map(cn => store.list(`${pre}/${cn}/`).then(k => k.length)));
  const min = Math.min(...counts), opts = STUDY.conditions.filter((cn, i) => counts[i] === min);
  return opts[Math.floor(rand() * opts.length)];
}

async function enroll(store, ids, opts, now, rand) {
  const made = [];
  for (const id of ids) {
    const condition = await pickCondition(store, !!opts.test, rand);
    const p = { code: id, condition, createdAt: now, gapDays: opts.gapDays ?? STUDY.defaultGapDays, label: opts.label || null, test: !!opts.test, selfSignup: !!opts.selfSignup };
    if (await setNew(store, pKey(id), p)) { await store.set(`${p.test ? 'cond-test' : 'cond'}/${condition}/${id}`, { at: now }); made.push(p); }
    else made.push(await store.get(pKey(id)));
  }
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

// Self-test participants: fixed condition, outside the assignment counts.
export async function createTestParticipant(store, condition, now = Date.now(), rand = Math.random) {
  if (!STUDY.conditions.includes(condition)) return { error: 'bad_condition', status: 400 };
  let code; do { code = newCode(rand); } while (await store.get(pKey(code)));
  const p = { code, condition, createdAt: now, gapDays: 0, label: 'self-test', test: true, selfTest: true };
  await store.set(pKey(code), p);
  return p;
}

// Pre-enrolls roster emails. The email is kept under contact/{id} (for extra credit), apart from the data.
export async function addRoster(store, emails, opts = {}, now = Date.now(), rand = Math.random) {
  const pepper = await getPepper(store, true);
  const invalid = []; const ids = []; let existing = 0;
  for (const raw of emails) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (!EMAIL_RE.test(e)) { invalid.push(String(raw).slice(0, 100)); continue; }
    const id = pidFor(pepper, e);
    if (ids.includes(id)) continue;
    if (await store.get(pKey(id))) { existing++; continue; }
    ids.push(id); await setNew(store, contactKey(id), { email: e, addedAt: now });
  }
  await enroll(store, ids, opts, now, rand);
  return { added: ids.length, existing, invalid };
}

// Completion check for course credit: status for each email the admin pastes in.
export async function lookupEmails(store, emails, now = Date.now()) {
  const pepper = await getPepper(store);
  const c = await getContent(store);
  const out = [];
  for (const raw of emails.slice(0, 2000)) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const p = pepper && EMAIL_RE.test(email) ? await store.get(pKey(pidFor(pepper, email))) : null;
    if (!p) { out.push({ email, enrolled: false }); continue; }
    const prog = await progressOf(store, p), total = totalFor(p, c, prog), st = status(p, now, total, prog.completed);
    out.push({ email, enrolled: true, totalSessions: total, id: p.code, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, finished: !!st.finished, lastCompletedAt: prog.completed.slice(-1)[0]?.completedAt || null });
  }
  return out;
}

async function inBatches(items, size, fn) { const out = []; for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn))); return out; }

export async function listParticipants(store, now = Date.now()) {
  const c = await getContent(store);
  const people = (await getMany(store, await store.list('participants/'))).map(([, p]) => p).filter(Boolean);
  const out = await inBatches(people, 20, async p => {
    const prog = await progressOf(store, p), total = totalFor(p, c, prog), st = status(p, now, total, prog.completed);
    const cur = st.nextSession && prog.sessions[st.nextSession];
    const plan = cur && cur.startedAt ? await getPlan(store, p, st.nextSession) : null;
    return { code: p.code, type: PID_RE.test(p.code) ? (p.selfSignup ? 'email (self)' : 'email') : 'code', condition: p.condition, label: p.label, test: !!p.test, gapDays: p.gapDays, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, nextSession: st.nextSession || null, availableAt: st.availableAt || null, lastSeenAt: p.lastSeenAt || null,
      totalSessions: total, inProgress: cur ? cur.trialsDone.length : 0, inProgressOf: plan ? plan.trials.length : 0 };
  });
  return out.sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));
}

// Participant record as exported, with session progress; no plan copies, no PIN fields from older versions.
async function exportParticipant(store, rec) {
  const { pin, pinFails, pinLockUntil, sessions, completed, ...p } = rec;
  const prog = await progressOf(store, rec);
  const views = await store.list(`views/${rec.code}/`);
  p.completed = prog.completed;
  p.sessions = Object.fromEntries(Object.entries(prog.sessions).map(([n, s]) => [n, { startedAt: s.startedAt, completedAt: s.completedAt, trialsDone: s.trialsDone.sort((a, b) => a - b),
    practiceDone: s.practiceDone, preSurveyDone: s.preSurveyDone, views: views.filter(k => k.startsWith(`views/${rec.code}/s${n}/`)).reduce((m, k) => { const i = k.split('/')[3].slice(1); m[i] = (m[i] || 0) + 1; return m; }, {}) }]));
  return p;
}

// Records for some participants (or one, or all). Exports run in batches of participants from the admin
// page, so no single request reads the whole study.
export async function exportRecords(store, codes) {
  const list = codes && codes.length ? codes : (await store.list('participants/')).map(k => k.slice(13));
  const keys = (await Promise.all(list.map(code => store.list(`data/${code}/`)))).flat();
  const records = (await getMany(store, keys)).filter(([, v]) => v).map(([key, v]) => ({ key, ...v }));
  const recs = (await getMany(store, list.map(pKey))).map(([, v]) => v).filter(Boolean);
  const participants = await inBatches(recs, 10, r => exportParticipant(store, r));
  return { study: STUDY.id, exportedAt: new Date().toISOString(), participants, records };
}
export const exportAll = (store, only) => exportRecords(store, only ? [only] : null);

export async function exportRaw(store, code) {
  const keys = await store.list(`raw/${code}/`);
  return (await getMany(store, keys)).filter(([, v]) => v).map(([, v]) => v);
}

// One analysis row per trial, with derived verification, reliance, and performance measures.
// Definitions are in static/lab/CODEBOOK.md. p is the exported participant (with session progress).
export function trialRow(r, p) {
  const a = r.alert, d = r.data || {}, opens = Array.isArray(d.evidence?.opens) ? d.evidence.opens : [];
  const keys = [...new Set(opens.map(o => o.panel))];
  const aiAt = d.aiShownAtMs;
  const contra = r.ai ? a.panels.filter(x => x.supports !== 'neutral' && x.supports !== r.ai.verdict).map(x => x.key) : [];
  const fin = d.final || {}, ini = d.initial || {};
  const s = p?.sessions?.[r.session] || {}, prev = (p?.completed || []).find(x => x.session === r.session - 1);
  const row = {
    code: r.code, condition: r.condition, test: p?.test ? 1 : 0, label: p?.label || '', self_signup: p?.selfSignup ? 1 : 0,
    session: r.session, trial_index: r.index, alert_id: r.alertId, family: a.family, truth: a.truth, mode: d.mode || '',
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
    // A panel counts as inspected after the AI if it was open at any point after the AI appeared.
    contradicts_ai_inspected_after_ai: r.ai && aiAt != null ? Number(opens.some(o => contra.includes(o.panel) && (o.atMs >= aiAt || o.atMs + (o.dwellMs || 0) > aiAt))) : '',
    influential_panels: (Array.isArray(fin.influential) ? fin.influential : []).join('|'),
    trial_ms: d.traces?.durationMs ?? '', mouse_path_px: d.traces?.mousePathPx ?? '', idle_ms: d.traces?.idleMs ?? '', hidden_ms: d.traces?.hiddenMs ?? '',
    views: s.views?.[r.index] ?? '', viewport_w: d.viewport?.w ?? '', viewport_h: d.viewport?.h ?? '',
    received_at: r.receivedAt ? new Date(r.receivedAt).toISOString() : '',
    session_started_at: s.startedAt ? new Date(s.startedAt).toISOString() : '', session_completed_at: s.completedAt ? new Date(s.completedAt).toISOString() : '',
    days_since_prev_session: prev && s.startedAt ? ((s.startedAt - prev.completedAt) / 864e5).toFixed(2) : '',
    content_version: r.contentVersion ?? 0
  };
  for (const k of a.panels.map(x => x.key)) row[`dwell_${k}_ms`] = Math.round(opens.filter(o => o.panel === k).reduce((n, o) => n + (o.dwellMs || 0), 0));
  return row;
}

export function surveyRow(r, p) {
  const row = { code: r.code, condition: r.condition, test: p?.test ? 1 : 0, label: p?.label || '', self_signup: p?.selfSignup ? 1 : 0,
    session: r.session, survey: r.kind, content_version: r.contentVersion ?? 0, received_at: r.receivedAt ? new Date(r.receivedAt).toISOString() : '' };
  // Question variables keep their names unless they collide with a column above.
  for (const [k, v] of Object.entries(r.data || {})) if (/^[a-z][a-z0-9_]{0,40}$/.test(k)) row[k in row ? `q_${k}` : k] = v;
  return row;
}

// Rows (as objects) for a batch of participants; the admin page assembles the CSV.
export async function exportRows(store, kind, codes) {
  const { records, participants } = await exportRecords(store, codes);
  const byCode = Object.fromEntries(participants.map(p => [p.code, p]));
  if (kind === 'surveys') return records.filter(r => /\/survey-(pre|post)$/.test(r.key)).map(r => surveyRow(r, byCode[r.code]));
  return records.filter(r => /\/t\d+$/.test(r.key)).map(r => trialRow(r, byCode[r.code]));
}

// CSV cells: quote when needed, and neutralize text a spreadsheet would run as a formula.


export const csvCell = v => {
  let s = Array.isArray(v) ? v.join('|') : String(v ?? '');
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const TRIAL_FIRST = ['code', 'condition', 'test', 'label', 'self_signup', 'session', 'trial_index', 'alert_id', 'family', 'truth', 'mode'];
export function toCsv(rows, first = []) {
  const cols = [...first.filter(c => rows.some(r => c in r))];
  for (const r of rows) for (const c of Object.keys(r)) if (!cols.includes(c)) cols.push(c);
  return [cols.map(csvCell).join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
}
export async function exportCsv(store, only) { return toCsv(await exportRows(store, 'trials', only ? [only] : null), TRIAL_FIRST); }
export async function exportSurveyCsv(store, only) { return toCsv(await exportRows(store, 'surveys', only ? [only] : null), TRIAL_FIRST.slice(0, 6)); }

// Deletes a participant and every record they produced. Permanent.
export async function deleteParticipant(store, id) {
  const p = await store.get(pKey(id));
  if (!p) return { error: 'not_found', status: 404 };
  const keys = (await Promise.all([`data/${p.code}/`, `raw/${p.code}/`, `plans/${p.code}/`, `started/${p.code}/`, `done/${p.code}/`, `views/${p.code}/`].map(k => store.list(k)))).flat()
    .concat([`consent/${p.code}`, `cond/${p.condition}/${p.code}`, `cond-test/${p.condition}/${p.code}`]);
  for (let i = 0; i < keys.length; i += 40) await Promise.all(keys.slice(i, i + 40).map(k => store.delete(k)));
  await store.delete(contactKey(p.code));
  await store.delete(pKey(p.code));
  return { ok: true, code: p.code, test: !!p.test, records: keys.filter(k => k.startsWith('data/')).length };
}

export async function deleteTestParticipants(store) {
  let participants = 0, records = 0;
  for (const [, p] of await getMany(store, await store.list('participants/'))) {
    if (p && p.test) { const r = await deleteParticipant(store, p.code); participants++; records += r.records || 0; }
  }
  return { ok: true, participants, records };
}

// Marks a participant as test (excluded from counts, removable in one step) or real.
export async function setTest(store, id, test) {
  const u = await update(store, pKey(id), d => { d.test = !!test; });
  if (u.error) return u;
  const p = u.value;   // move the assignment marker so real and test participants are balanced separately
  await store.delete(`${test ? 'cond' : 'cond-test'}/${p.condition}/${p.code}`);
  await store.set(`${test ? 'cond-test' : 'cond'}/${p.condition}/${p.code}`, { at: Date.now() });
  return { ok: true, code: p.code, test: p.test };
}

// Extra-credit list: every student email with completion. Kept out of the research exports.
export async function exportCredit(store, now = Date.now()) {
  const c = await getContent(store);
  const keys = await store.list('contact/');
  const contacts = await getMany(store, keys);
  const people = Object.fromEntries((await getMany(store, keys.map(k => pKey(k.slice(8))))).map(([k, v]) => [k.slice(13), v]));
  const pairs = contacts.filter(([k, ct]) => ct && people[k.slice(8)]);
  const progs = await inBatches(pairs, 20, ([k]) => progressOf(store, people[k.slice(8)]));
  const rows = [];
  for (const [j, [k, ct]] of pairs.entries()) {
    const p = people[k.slice(8)], prog = progs[j];
    const total = totalFor(p, c, prog), st = status(p, now, total, prog.completed), last = prog.completed.slice(-1)[0];
    rows.push({ email: ct.email, sessions_completed: st.completed, total_sessions: total, finished: st.finished ? 1 : 0,
      last_session_completed: last ? new Date(last.completedAt).toISOString() : '', first_seen: new Date(ct.firstSeenAt || ct.addedAt || p.createdAt).toISOString(),
      label: p.label || '', test: p.test ? 1 : 0 });
  }
  return toCsv(rows.sort((a, b) => a.email.localeCompare(b.email)), ['email']);
}
