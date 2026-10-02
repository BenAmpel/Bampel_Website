// CARE Behavioral Lab: the study engine shared by every study.
// Every function takes S = { store, type, study }: the study's Blobs store, its study type
// (netlify/lib/lab/types/*.mjs), and its registry entry (netlify/lib/lab/registry.mjs).
//
// Key schema (per study store)
//   participants/{id}            condition, flags, consent time, last seen (rarely changes)
//   consent/{id}                 write-once consent record
//   plans/{id}/s{n}              the session plan, written once when the session starts
//   started/{id}/s{n}-{time}     session start      done/{id}/s{n}-{time}   session completion
//   views/{id}/s{n}/t{i}/{time}  each time a trial screen was shown
//   data/{id}/s{n}/t{i}          one trial (answers, evidence, trace features; no raw events)
//   raw/{id}/s{n}/t{i}           raw TraceLab events for that trial
//   data/{id}/s{n}/practice | survey-pre | survey-post
//   contact/{id}                 the email (extra credit only; never in research exports)
//   cond/{condition}/{id}, cond-test/{condition}/{id}   assignment counts (minimization)
//   meta/pepper, content/*, admins/*, audit/*, selftest/*
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { setNew, update, getMany, inBatches, deleteKeys } from './store.mjs';
import { getContent, itemsFor, domainAllowed } from './content.mjs';

export const TOKEN_HOURS = 12;
const DEFAULT_GAP = 6;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newCode(prefix = 'VC', rand = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}
export function normalizeCode(c) {
  const m = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/^([A-Z]{2})([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
const CODE_RE = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// ---------- identity ----------
// Students sign in with their email (no password; the first sign-in asks them to confirm it). The study
// ID is a keyed hash of the email; the key ("pepper") lives in the study's store, so anyone with access
// to the Netlify site can re-identify participants. The email is stored only under contact/{id}.

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export const PID_RE = /^P-[0-9a-f]{16}$/;
export function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();
export function pidFor(pepper, email) { return 'P-' + hmac(pepper, 'email|' + normalizeEmail(email)).toString('hex').slice(0, 16); }

async function getPepper(store, create = false) {
  let m = await store.get('meta/pepper');
  if (!m && create) { await setNew(store, 'meta/pepper', { value: randomBytes(32).toString('hex'), createdAt: Date.now() }); m = await store.get('meta/pepper'); }
  return m ? m.value : null;
}
async function issueToken(store, pid, now) {
  const pepper = await getPepper(store, true), exp = now + TOKEN_HOURS * 3600000;
  return `${pid}.${exp}.${hmac(pepper, `tok|${pid}|${exp}`).toString('base64url')}`;
}
export async function verifyToken(S, token, now = Date.now()) {
  const [pid, exp, sig] = String(token || '').split('.');
  if (!pid || !exp || !sig || !(Number(exp) > now)) return null;
  const pepper = await getPepper(S.store);
  if (!pepper) return null;
  const want = Buffer.from(hmac(pepper, `tok|${pid}|${exp}`).toString('base64url')), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? pid : null;
}

// ---------- randomization ----------
export function seeded(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return function () {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- keys ----------
const pKey = id => `participants/${id}`;
const contactKey = id => `contact/${id}`;
const planKey = (id, n) => `plans/${id}/s${n}`;

export async function loadParticipant(S, raw) {
  if (PID_RE.test(String(raw || ''))) return await S.store.get(pKey(raw));
  const code = normalizeCode(raw);
  return CODE_RE.test(code) ? await S.store.get(pKey(code)) : null;
}

// ---------- progress (read back from write-once keys) ----------
export async function progressOf(S, p) {
  const st = S.store;
  const [dataKeys, doneKeys, startKeys] = await Promise.all([st.list(`data/${p.code}/`), st.list(`done/${p.code}/`), st.list(`started/${p.code}/`)]);
  const sessions = {};
  const at = n => sessions[n] || (sessions[n] = { trialsDone: [], practiceDone: false, preSurveyDone: false, postDone: false, startedAt: null, completedAt: null });
  for (const k of dataKeys) {
    const m = k.match(/\/s(\d+)\/(?:t(\d+)|(practice|survey-pre|survey-post))$/);
    if (!m) continue;
    const s = at(+m[1]);
    if (m[2] != null) s.trialsDone.push(+m[2]);
    else if (m[3] === 'practice') s.practiceDone = true;
    else if (m[3] === 'survey-pre') s.preSurveyDone = true;
    else s.postDone = true;
  }
  for (const k of startKeys) { const m = k.match(/\/s(\d+)-(\d+)$/); if (m) { const s = at(+m[1]); s.startedAt = Math.min(s.startedAt ?? Infinity, +m[2]); } }
  for (const k of doneKeys) { const m = k.match(/\/s(\d+)-(\d+)$/); if (m) { const s = at(+m[1]); if (s.completedAt == null || +m[2] < s.completedAt) s.completedAt = +m[2]; } }
  const completed = Object.entries(sessions).filter(([, s]) => s.completedAt != null).map(([n, s]) => ({ session: +n, completedAt: s.completedAt }));
  // Records written by the earlier single-record format (verification study, before October 2026).
  if (!completed.length && Array.isArray(p.completed)) completed.push(...p.completed);
  for (const [n, s] of Object.entries(p.sessions || {})) { const t = at(+n); t.startedAt = t.startedAt ?? s.startedAt ?? null; if (!t.trialsDone.length && s.trialsDone) t.trialsDone = s.trialsDone.slice(); }
  completed.sort((a, b) => a.session - b.session);
  return { sessions, completed };
}

// Sessions for this participant: fixed when they start session 1 (adding sessions later doesn't
// un-finish anyone; removing sessions never strands one in progress).
export function totalFor(S, p, c, prog) {
  const nS = S.type.sessionCount(c);
  let total = Math.min(p.totalSessions ?? nS, nS);
  const next = (prog?.completed || []).length + 1, cur = prog?.sessions?.[next];
  if (next > total && cur?.startedAt && !cur.completedAt) total = next;
  return total;
}
export function status(p, now, total, completed) {
  const next = completed.length + 1;
  if (next > total) return { finished: true, completed: completed.length, total };
  const last = completed[completed.length - 1];
  const availableAt = last ? last.completedAt + (p.gapDays ?? DEFAULT_GAP) * 86400000 : p.createdAt;
  return { finished: false, completed: completed.length, total, nextSession: next, availableAt, available: now >= availableAt };
}
async function statusOf(S, p, now, c, prog) {
  c = c || await getContent(S.store, S.type); prog = prog || await progressOf(S, p);
  return status(p, now, totalFor(S, p, c, prog), prog.completed);
}
async function getPlan(S, p, n) { return p.sessions?.[n]?.plan || await S.store.get(planKey(p.code, n)); }

// ---------- validation of survey answers ----------
export function cleanAnswers(d, items) {
  d = d && typeof d === 'object' ? d : {};
  const out = {};
  for (const it of items) {
    const v = d[it.id];
    if (v == null || v === '') continue;
    if (it.type === 'scale') { const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= it.n) out[it.id] = String(n); }
    else if (it.type === 'confidence') { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n <= 100) out[it.id] = String(Math.round(n)); }
    else if (it.type === 'choice' || it.type === 'select') { if (it.options.some(o => o.value === v)) out[it.id] = v; }
    else out[it.id] = String(v).slice(0, 4000);
  }
  return out;
}

// ---------- participant routes ----------

export async function login(S, creds = {}, now = Date.now()) {
  const store = S.store;
  let p;
  if (creds.email != null) {
    const email = normalizeEmail(creds.email), en = (await getContent(store, S.type)).enrollment;
    const canSignUp = en.open && EMAIL_RE.test(email) && domainAllowed(email, en.domains);
    const pepper = await getPepper(store, canSignUp);
    const notEnrolled = { error: 'not_enrolled', status: 401, domains: en.open ? en.domains : [] };
    if (!pepper || !EMAIL_RE.test(email)) return notEnrolled;
    const pid = pidFor(pepper, email);
    p = await store.get(pKey(pid));
    if (!p) {
      if (!canSignUp) return notEnrolled;
      if (!creds.confirm) return { error: 'confirm_new', status: 401, email };
      [p] = await enroll(S, [pid], { gapDays: en.gapDays, label: en.label || null, selfSignup: true }, now, Math.random);
    }
    await setNew(store, contactKey(p.code), { email, firstSeenAt: now });
  } else {
    p = await loadParticipant(S, creds.code);
    if (!p || PID_RE.test(p.code)) return { error: 'invalid_code', status: 401 };
  }
  const u = await update(store, pKey(p.code), d => { d.lastSeenAt = now; });   // informational
  const rec = u.value || p;
  return { token: await issueToken(store, p.code, now), consented: !!rec.consentedAt, status: await statusOf(S, rec, now) };
}

export async function resume(S, pid, now = Date.now()) {
  const p = await loadParticipant(S, pid);
  if (!p) return { error: 'expired', status: 401 };
  return { consented: !!p.consentedAt, status: await statusOf(S, p, now) };
}

export async function consent(S, code, agree, now = Date.now()) {
  if (agree) await setNew(S.store, `consent/${code}`, { at: now });
  const u = await update(S.store, pKey(code), d => { if (agree) d.consentedAt = d.consentedAt || now; else d.declinedAt = now; });
  if (u.error) return u.error === 'not_found' ? { error: 'invalid_code', status: 401 } : u;
  return agree ? { ok: true } : { ok: true, declined: true };
}

// The plan for session n: built by the study type, plus the survey questions this participant sees.
export function buildPlan(S, p, n, c) {
  const seedId = S.study.seedId || S.study.id;
  const rand = seeded(`${p.code}|${seedId}|s${n}`);
  const plan = S.type.buildPlan(p, n, c, rand, { seeded, shuffle, studyId: seedId });
  const ctx = { session: n, condition: p.condition, ...(plan.surveyCtx || {}) };
  return { ...plan, session: n, contentVersion: c.version || 0, createdAt: Date.now(),
    preItems: itemsFor(c.survey.pre, 'pre', ctx, S.type), postItems: itemsFor(c.survey.post, 'post', ctx, S.type) };
}

// What the browser receives for a plan; the type decides what each trial exposes (never answer keys).
export function publicPlan(S, plan, state) {
  const done = new Set(state.trialsDone || []);
  return {
    session: plan.session, total: plan.trials.length,
    practice: plan.practice ? { index: 'practice', ...S.type.publicTrial(plan.practice, plan) } : null,
    practiceDone: !!state.practiceDone, preSurveyDone: !!state.preSurveyDone,
    preItems: plan.preItems || [], postItems: plan.postItems || [],
    trials: plan.trials.map(t => ({ index: t.index, done: done.has(t.index), ...S.type.publicTrial(t, plan) })),
    ...(S.type.publicPlanExtras ? S.type.publicPlanExtras(plan) : {})
  };
}

export async function startSession(S, code, now = Date.now()) {
  const p = await loadParticipant(S, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!p.consentedAt && !(await S.store.get(`consent/${p.code}`))) return { error: 'no_consent', status: 403 };
  const c = await getContent(S.store, S.type), prog = await progressOf(S, p);
  const st = status(p, now, totalFor(S, p, c, prog), prog.completed);
  if (st.finished) return { error: 'finished', status: 409 };
  if (!st.available) return { error: 'not_yet', status: 409, availableAt: st.availableAt };
  const n = st.nextSession;
  let plan = await getPlan(S, p, n);
  if (!plan) {   // written once: whoever writes first wins and everyone reads that copy
    if (await setNew(S.store, planKey(p.code, n), buildPlan(S, p, n, c))) await S.store.set(`started/${p.code}/s${n}-${now}`, { at: now });
    plan = await S.store.get(planKey(p.code, n));
    if (n === 1 && p.totalSessions == null) await update(S.store, pKey(p.code), d => { if (d.totalSessions == null) d.totalSessions = S.type.sessionCount(c); });
  }
  const s = prog.sessions[n] || {};
  const state = { trialsDone: s.trialsDone || [], practiceDone: s.practiceDone || !plan.practice, preSurveyDone: s.preSurveyDone || !(plan.preItems || []).length };
  return { ...publicPlan(S, plan, state), contentVersion: plan.contentVersion };
}

export async function viewTrial(S, code, session, index, now = Date.now()) {
  if (!(Number.isInteger(session) && session > 0 && session < 100 && Number.isInteger(index) && index >= 0 && index < 1000)) return { error: 'bad_index', status: 400 };
  await S.store.set(`views/${code}/s${session}/t${index}/${now}-${randomBytes(3).toString('hex')}`, { at: now });
  return { ok: true };
}

const jsonSize = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };

export async function saveTrial(S, code, session, index, data, now = Date.now()) {
  const store = S.store, p = await loadParticipant(S, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  const kind = index === 'practice' ? 'practice' : 'trial';
  const key = kind === 'trial' ? `data/${p.code}/s${session}/t${index}` : `data/${p.code}/s${session}/practice`;
  if (await store.get(key)) return { ok: true, repeat: true };   // re-sends never overwrite the first answer
  const c = await getContent(store, S.type), prog = await progressOf(S, p);
  const st = status(p, now, totalFor(S, p, c, prog), prog.completed);
  const plan = await getPlan(S, p, session);
  if (st.finished || session !== st.nextSession || !plan) return { error: 'wrong_session', status: 409 };
  const t = kind === 'trial' ? plan.trials[index] : plan.practice;
  if (!t) return { error: 'bad_index', status: 400 };
  const clean = S.type.cleanTrialData(data, t, plan);
  if (kind === 'trial') {
    const raw = Array.isArray(data?.rawEvents) ? data.rawEvents.slice(0, 20000) : [];
    // The type's record fields include a copy of the item and answer key as scored, so later content
    // edits never change this record.
    const rec = { code: p.code, condition: p.condition, session, index, ...S.type.recordFields(t, plan), contentVersion: plan.contentVersion, receivedAt: now, data: clean };
    if (!(await setNew(store, key, rec))) return { ok: true, repeat: true };
    if (raw.length && jsonSize(raw) <= 3e6) await store.set(`raw/${p.code}/s${session}/t${index}`, { code: p.code, session, index, events: raw });
  } else if (!(await setNew(store, key, { code: p.code, session, contentVersion: plan.contentVersion, receivedAt: now, data: clean }))) return { ok: true, repeat: true };
  return { ok: true };
}

export async function saveSurvey(S, code, session, kind, data, now = Date.now()) {
  const store = S.store, p = await loadParticipant(S, code);
  if (!p) return { error: 'invalid_code', status: 401 };
  if (!['pre', 'post'].includes(kind)) return { error: 'bad_kind', status: 400 };
  const c = await getContent(store, S.type), key = `data/${p.code}/s${session}/survey-${kind}`;
  if (await store.get(key)) { const prog = await progressOf(S, p); return { ok: true, repeat: true, status: status(p, now, totalFor(S, p, c, prog), prog.completed) }; }
  const prog = await progressOf(S, p), st = status(p, now, totalFor(S, p, c, prog), prog.completed);
  const plan = await getPlan(S, p, session);
  if (st.finished || session !== st.nextSession || !plan) return { error: 'wrong_session', status: 409 };
  if (kind === 'post' && (prog.sessions[session]?.trialsDone.length || 0) < plan.trials.length) return { error: 'trials_incomplete', status: 409 };
  const items = (kind === 'pre' ? plan.preItems : plan.postItems) || [];
  const created = await setNew(store, key, { code: p.code, condition: p.condition, session, kind, contentVersion: plan.contentVersion, receivedAt: now, data: cleanAnswers(data, items) });
  if (created && kind === 'post') await store.set(`done/${p.code}/s${session}-${now}`, { at: now });
  const after = await progressOf(S, p);
  return { ok: true, repeat: !created || undefined, status: status(p, now, totalFor(S, p, c, after), after.completed) };
}

// ---------- enrollment ----------
// Conditions are assigned by minimization: the condition with the fewest participants so far (ties at
// random), counted from write-once marker keys. Test participants are counted separately.
async function pickCondition(S, test, rand) {
  const conds = S.type.conditionsOf(await getContent(S.store, S.type)), pre = test ? 'cond-test' : 'cond';
  const counts = await Promise.all(conds.map(cn => S.store.list(`${pre}/${cn}/`).then(k => k.length)));
  const min = Math.min(...counts), opts = conds.filter((cn, i) => counts[i] === min);
  return opts[Math.floor(rand() * opts.length)];
}

export async function enroll(S, ids, opts, now, rand) {
  const made = [];
  for (const id of ids) {
    const condition = await pickCondition(S, !!opts.test, rand);
    const p = { code: id, condition, createdAt: now, gapDays: opts.gapDays ?? DEFAULT_GAP, label: opts.label || null, test: !!opts.test, selfSignup: !!opts.selfSignup };
    if (await setNew(S.store, pKey(id), p)) { await S.store.set(`${p.test ? 'cond-test' : 'cond'}/${condition}/${id}`, { at: now }); made.push(p); }
    else made.push(await S.store.get(pKey(id)));
  }
  return made;
}

export async function createParticipants(S, count, opts = {}, now = Date.now(), rand = Math.random) {
  const ids = [], prefix = S.study.codePrefix || 'VC';
  for (let i = 0; i < count; i++) { let code; do { code = newCode(prefix, rand); } while (ids.includes(code) || await S.store.get(pKey(code))); ids.push(code); }
  const made = await enroll(S, ids, opts, now, rand);
  return { created: made.map(p => ({ code: p.code, condition: p.condition, label: p.label, gapDays: p.gapDays, test: p.test })) };
}

// Self-test participants: fixed condition, outside the assignment counts.
export async function createTestParticipant(S, condition, now = Date.now(), rand = Math.random) {
  const conds = S.type.conditionsOf(await getContent(S.store, S.type));
  if (!conds.includes(condition)) return { error: 'bad_condition', status: 400 };
  let code; do { code = newCode(S.study.codePrefix || 'VC', rand); } while (await S.store.get(pKey(code)));
  const p = { code, condition, createdAt: now, gapDays: 0, label: 'self-test', test: true, selfTest: true };
  await S.store.set(pKey(code), p);
  return p;
}

export async function addRoster(S, emails, opts = {}, now = Date.now(), rand = Math.random) {
  const pepper = await getPepper(S.store, true);
  const invalid = [], ids = []; let existing = 0;
  for (const raw of emails) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (!EMAIL_RE.test(e)) { invalid.push(String(raw).slice(0, 100)); continue; }
    const id = pidFor(pepper, e);
    if (ids.includes(id)) continue;
    if (await S.store.get(pKey(id))) { existing++; continue; }
    ids.push(id); await setNew(S.store, contactKey(id), { email: e, addedAt: now });
  }
  await enroll(S, ids, opts, now, rand);
  return { added: ids.length, existing, invalid };
}

// ---------- admin queries ----------

export async function lookupEmails(S, emails, now = Date.now()) {
  const pepper = await getPepper(S.store), c = await getContent(S.store, S.type), out = [];
  for (const raw of emails.slice(0, 2000)) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const p = pepper && EMAIL_RE.test(email) ? await S.store.get(pKey(pidFor(pepper, email))) : null;
    if (!p) { out.push({ email, enrolled: false }); continue; }
    const prog = await progressOf(S, p), total = totalFor(S, p, c, prog), st = status(p, now, total, prog.completed);
    out.push({ email, enrolled: true, totalSessions: total, id: p.code, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, finished: !!st.finished, lastCompletedAt: prog.completed.slice(-1)[0]?.completedAt || null });
  }
  return out;
}

export async function listParticipants(S, now = Date.now()) {
  const c = await getContent(S.store, S.type);
  const people = (await getMany(S.store, await S.store.list('participants/'))).map(([, p]) => p).filter(Boolean);
  const out = await inBatches(people, 20, async p => {
    const prog = await progressOf(S, p), total = totalFor(S, p, c, prog), st = status(p, now, total, prog.completed);
    const cur = st.nextSession && prog.sessions[st.nextSession];
    const plan = cur && cur.startedAt ? await getPlan(S, p, st.nextSession) : null;
    return { code: p.code, type: PID_RE.test(p.code) ? (p.selfSignup ? 'email (self)' : 'email') : 'code', condition: p.condition, label: p.label, test: !!p.test, gapDays: p.gapDays, consented: !!p.consentedAt, declined: !!p.declinedAt,
      completedSessions: st.completed, nextSession: st.nextSession || null, availableAt: st.availableAt || null, lastSeenAt: p.lastSeenAt || null,
      totalSessions: total, inProgress: cur ? cur.trialsDone.length : 0, inProgressOf: plan ? plan.trials.length : 0 };
  });
  return out.sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));
}

async function exportParticipant(S, rec) {
  const { pin, pinFails, pinLockUntil, sessions, completed, ...p } = rec;
  const prog = await progressOf(S, rec), views = await S.store.list(`views/${rec.code}/`);
  p.completed = prog.completed;
  p.sessions = Object.fromEntries(Object.entries(prog.sessions).map(([n, s]) => [n, { startedAt: s.startedAt, completedAt: s.completedAt, trialsDone: s.trialsDone.sort((a, b) => a - b),
    practiceDone: s.practiceDone, preSurveyDone: s.preSurveyDone,
    views: views.filter(k => k.startsWith(`views/${rec.code}/s${n}/`)).reduce((m, k) => { const i = k.split('/')[3].slice(1); m[i] = (m[i] || 0) + 1; return m; }, {}) }]));
  return p;
}

// Records for a batch of participants (the admin page asks in small batches, so no request reads the
// whole study).
export async function exportRecords(S, codes) {
  const list = codes && codes.length ? codes : (await S.store.list('participants/')).map(k => k.slice(13));
  const keys = (await Promise.all(list.map(code => S.store.list(`data/${code}/`)))).flat();
  const records = (await getMany(S.store, keys)).filter(([, v]) => v).map(([key, v]) => ({ key, ...v }));
  const recs = (await getMany(S.store, list.map(pKey))).map(([, v]) => v).filter(Boolean);
  const participants = await inBatches(recs, 10, r => exportParticipant(S, r));
  return { study: S.study.id, type: S.type.id, exportedAt: new Date().toISOString(), participants, records };
}

export async function exportRaw(S, code) {
  return (await getMany(S.store, await S.store.list(`raw/${code}/`))).filter(([, v]) => v).map(([, v]) => v);
}

// One analysis row per trial: shared columns, then the type's measures. Definitions: static/lab/CODEBOOK.md.
export function trialRow(S, r, p) {
  const d = r.data || {}, s = p?.sessions?.[r.session] || {}, prev = (p?.completed || []).find(x => x.session === r.session - 1);
  return {
    code: r.code, condition: r.condition, test: p?.test ? 1 : 0, label: p?.label || '', self_signup: p?.selfSignup ? 1 : 0,
    session: r.session, trial_index: r.index,
    ...S.type.trialRow(r),
    trial_ms: d.traces?.durationMs ?? '', mouse_path_px: d.traces?.mousePathPx ?? '', idle_ms: d.traces?.idleMs ?? '', hidden_ms: d.traces?.hiddenMs ?? '',
    views: s.views?.[r.index] ?? '', viewport_w: d.viewport?.w ?? '', viewport_h: d.viewport?.h ?? '',
    received_at: r.receivedAt ? new Date(r.receivedAt).toISOString() : '',
    session_started_at: s.startedAt ? new Date(s.startedAt).toISOString() : '', session_completed_at: s.completedAt ? new Date(s.completedAt).toISOString() : '',
    days_since_prev_session: prev && s.startedAt ? ((s.startedAt - prev.completedAt) / 864e5).toFixed(2) : '',
    content_version: r.contentVersion ?? 0
  };
}

export function surveyRow(r, p) {
  const row = { code: r.code, condition: r.condition, test: p?.test ? 1 : 0, label: p?.label || '', self_signup: p?.selfSignup ? 1 : 0,
    session: r.session, survey: r.kind, content_version: r.contentVersion ?? 0, received_at: r.receivedAt ? new Date(r.receivedAt).toISOString() : '' };
  for (const [k, v] of Object.entries(r.data || {})) if (/^[a-z][a-z0-9_]{0,40}$/.test(k)) row[k in row ? `q_${k}` : k] = v;
  return row;
}

export async function exportRows(S, kind, codes) {
  const { records, participants } = await exportRecords(S, codes);
  const byCode = Object.fromEntries(participants.map(p => [p.code, p]));
  if (kind === 'surveys') return records.filter(r => /\/survey-(pre|post)$/.test(r.key)).map(r => surveyRow(r, byCode[r.code]));
  return records.filter(r => /\/t\d+$/.test(r.key)).map(r => trialRow(S, r, byCode[r.code]));
}

// CSV cells: quoted when needed; text a spreadsheet would run as a formula is neutralized.
export const csvCell = v => {
  let s = Array.isArray(v) ? v.join('|') : String(v ?? '');
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const FIRST_COLUMNS = ['code', 'condition', 'test', 'label', 'self_signup', 'session', 'trial_index'];
export function toCsv(rows, first = []) {
  const cols = [...first.filter(c => rows.some(r => c in r))];
  for (const r of rows) for (const c of Object.keys(r)) if (!cols.includes(c)) cols.push(c);
  return [cols.map(csvCell).join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
}
export async function exportCsv(S, only) { return toCsv(await exportRows(S, 'trials', only ? [only] : null), FIRST_COLUMNS); }
export async function exportSurveyCsv(S, only) { return toCsv(await exportRows(S, 'surveys', only ? [only] : null), FIRST_COLUMNS.slice(0, 6)); }

export async function deleteParticipant(S, id) {
  const store = S.store, p = await store.get(pKey(id));
  if (!p) return { error: 'not_found', status: 404 };
  const keys = (await Promise.all(['data', 'raw', 'plans', 'started', 'done', 'views'].map(k => store.list(`${k}/${p.code}/`)))).flat();
  await deleteKeys(store, keys.concat([`consent/${p.code}`, `cond/${p.condition}/${p.code}`, `cond-test/${p.condition}/${p.code}`, contactKey(p.code)]));
  await store.delete(pKey(p.code));
  return { ok: true, code: p.code, condition: p.condition, test: !!p.test, records: keys.filter(k => k.startsWith('data/')).length };
}

export async function deleteTestParticipants(S) {
  let participants = 0, records = 0; const deleted = [];
  for (const [, p] of await getMany(S.store, await S.store.list('participants/'))) {
    if (p && p.test) { const r = await deleteParticipant(S, p.code); participants++; records += r.records || 0; deleted.push({ code: p.code, condition: p.condition }); }
  }
  return { ok: true, participants, records, deleted };
}

export async function setTest(S, id, test) {
  const u = await update(S.store, pKey(id), d => { d.test = !!test; });
  if (u.error) return u;
  const p = u.value;   // move the assignment marker so real and test participants are balanced separately
  await S.store.delete(`${test ? 'cond' : 'cond-test'}/${p.condition}/${p.code}`);
  await S.store.set(`${test ? 'cond-test' : 'cond'}/${p.condition}/${p.code}`, { at: Date.now() });
  return { ok: true, code: p.code, test: p.test };
}

// Extra-credit list: every email with completion. Kept out of the research exports.
export async function exportCredit(S, now = Date.now()) {
  const c = await getContent(S.store, S.type), keys = await S.store.list('contact/');
  const contacts = await getMany(S.store, keys);
  const people = Object.fromEntries((await getMany(S.store, keys.map(k => pKey(k.slice(8))))).map(([k, v]) => [k.slice(13), v]));
  const pairs = contacts.filter(([k, ct]) => ct && people[k.slice(8)]);
  const progs = await inBatches(pairs, 20, ([k]) => progressOf(S, people[k.slice(8)]));
  const rows = pairs.map(([k, ct], j) => {
    const p = people[k.slice(8)], prog = progs[j], total = totalFor(S, p, c, prog), st = status(p, now, total, prog.completed), last = prog.completed.slice(-1)[0];
    return { email: ct.email, sessions_completed: st.completed, total_sessions: total, finished: st.finished ? 1 : 0,
      last_session_completed: last ? new Date(last.completedAt).toISOString() : '', first_seen: new Date(ct.firstSeenAt || ct.addedAt || p.createdAt).toISOString(), label: p.label || '', test: p.test ? 1 : 0 };
  });
  return toCsv(rows.sort((a, b) => a.email.localeCompare(b.email)), ['email']);
}
