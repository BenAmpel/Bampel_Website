// CCAIR Behavioral Lab: live self-test for any study.
// Runs one throwaway participant (in a chosen condition) through every session of the current design
// against the study's real store, using the study type's simulate() for answers, then checks what was
// saved and exported (type checks: checkRow, checkSession) and deletes the participant. Resumable:
// each call works for about budgetMs and saves progress under selftest/{code}, returning
// { done: false } until finished, so no call hits the function time limit. Nothing here signs in
// through the website.
import * as E from './engine.mjs';
import { getContent } from './content.mjs';

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const h = rows[0] || []; return rows.slice(1).map(r => Object.fromEntries(r.map((v, i) => [h[i], v])));
}
function answerFor(it, r) {
  if (it.type === 'scale') return String(1 + Math.floor(r() * it.n));
  if (it.type === 'confidence') return String(Math.floor(r() * 101));
  if (it.type === 'choice' || it.type === 'select') return it.options[Math.floor(r() * it.options.length)].value;
  return 'self-test note';
}

export async function runSelfTest(S, { condition, code, keep = false, budgetMs = 2500 } = {}) {
  const t0 = Date.now(), r = Math.random, store = S.store;
  const c = await getContent(store, S.type), nS = S.type.sessionCount(c);
  let st;
  if (!code) {
    const p = await E.createTestParticipant(S, condition);
    if (p.error) return { error: p.error };
    st = { condition, code: p.code, keep, stage: 'start', session: 1, expect: [], checks: [], startedAt: t0, contentVersion: c.version || 0 };
  } else {
    st = await store.get(`selftest/${code}`);
    if (!st) return { error: 'not_found', status: 404 };
  }
  code = st.code; condition = st.condition;
  const ok = (pass, what) => { st.checks.push({ pass: !!pass, what }); return !!pass; };
  const progress = () => ({ done: false, code, condition, session: st.session, sessions: nS, passed: st.checks.filter(x => x.pass).length, failed: st.checks.filter(x => !x.pass).length });
  const save = () => store.set(`selftest/${code}`, st);
  try {
    if (st.contentVersion !== (c.version || 0)) { ok(false, 'Study content changed during the self-test; run it again'); st.stage = 'cleanup'; }
    if (st.stage === 'start') {
      const cas = await casProbe(store);
      ok(cas.etag && cas.stale === false && cas.fresh === true && cas.final === 4 && cas.created === false, `Storage honors conditional writes ${JSON.stringify(cas)}`);
      const lg = await E.login(S, { code });
      ok(lg.token && await E.verifyToken(S, lg.token) === code, 'Sign-in token issued and accepted');
      ok((await E.startSession(S, code)).error === 'no_consent', 'Sessions are blocked before consent');
      await E.consent(S, code, true);
      st.stage = 'sessions';
    }
    while (st.stage === 'sessions') {
      if (st.session > nS) { st.stage = 'verify'; break; }
      if (Date.now() - t0 > budgetMs) { await save(); return progress(); }
      const s = st.session, plan = await E.startSession(S, code);
      if (!ok(!plan.error && plan.session === s, `Session ${s} opens`)) { st.stage = 'cleanup'; break; }
      st.opened = st.opened || {};
      if (!st.opened[s]) {
        st.opened[s] = true;
        if (S.type.expectedMode) { const m = S.type.expectedMode(plan, condition, c, s); ok(plan.mode === m, `Session ${s}: mode is "${m}"`); }
        ok(!/"truth"|"supports"|misleading|"variant"|"alertId"|"itemId"/.test(JSON.stringify(plan.trials.concat(plan.practice || []))) && plan.trials.every(t => !('id' in (t.alert || t.item || {}))),
          `Session ${s}: no answer keys or item IDs sent to the browser`);
        if (!plan.preSurveyDone) {
          const data = Object.fromEntries(plan.preItems.map(it => [it.id, answerFor(it, r)]));
          ok((await E.saveSurvey(S, code, s, 'pre', data)).ok, `Session ${s}: start-of-session survey saved`);
          st.expect.push({ kind: 'pre', session: s, data });
        }
        if (plan.practice && !plan.practiceDone) ok((await E.saveTrial(S, code, s, 'practice', S.type.simulate(plan.practice, plan, r))).ok, `Session ${s}: practice saved`);
        if (plan.trials.length) ok((await E.saveSurvey(S, code, s, 'post', {})).error === 'trials_incomplete', `Session ${s}: cannot finish before all items`);
        continue;
      }
      const pending = plan.trials.filter(t => !t.done);
      if (pending.length) {
        const make = t => { const data = S.type.simulate(t, plan, r); st.expect.push({ kind: 'trial', session: s, index: t.index, sent: structuredClone(data) }); return data; };
        st.firstDone = st.firstDone || {};
        if (!st.firstDone[s] && pending.length > 1) {
          // Several answers at once (double clicks, two tabs) must all be kept; a re-send never overwrites.
          st.firstDone[s] = true;
          const batch = pending.slice(0, 4), datas = batch.map(make);
          const res = await Promise.all(batch.map((t, j) => E.saveTrial(S, code, s, t.index, datas[j])));
          ok(res.every(x => x.ok), `Session ${s}: ${batch.length} simultaneous answers all accepted`);
          const prog = await E.progressOf(S, await E.loadParticipant(S, code));
          ok(batch.every(t => prog.sessions[s].trialsDone.includes(t.index)), `Session ${s}: all ${batch.length} simultaneous answers recorded`);
          ok((await E.saveTrial(S, code, s, batch[0].index, S.type.simulate(batch[0], plan, r))).repeat, `Session ${s}: a re-sent answer is acknowledged, not overwritten`);
        } else ok((await E.saveTrial(S, code, s, pending[0].index, make(pending[0]))).ok, `Session ${s}, item ${pending[0].index + 1}: saved`);
        continue;
      }
      const data = Object.fromEntries(plan.postItems.map(it => [it.id, answerFor(it, r)]));
      const done = await E.saveSurvey(S, code, s, 'post', data);
      ok(done.ok, `Session ${s}: end-of-session survey saved`);
      ok((await E.saveSurvey(S, code, s, 'post', data)).repeat, `Session ${s}: a re-sent survey is acknowledged`);
      st.expect.push({ kind: 'post', session: s, data });
      ok(s < nS ? done.status.nextSession === s + 1 && done.status.available : done.status.finished, s < nS ? `Session ${s + 1} opens next (no wait for test)` : 'Study marked finished');
      st.session++;
    }
    if (st.stage === 'verify') {
      if (Date.now() - t0 > 1500) { await save(); return progress(); }
      await verify(S, c, st, ok); st.stage = 'cleanup';
      await save(); return progress();
    }
  } catch (e) { ok(false, 'Unexpected error: ' + (e && e.message || e)); }
  if (!st.keep) { const d = await E.deleteParticipant(S, code); ok(d.ok && !(await E.loadParticipant(S, code)), `Test participant deleted (${d.records || 0} records)`); }
  await store.delete(`selftest/${code}`);
  return { done: true, condition, code: st.keep ? code : null, kept: st.keep, passed: st.checks.filter(x => x.pass).length, failed: st.checks.filter(x => !x.pass).length, checks: st.checks, ms: Date.now() - st.startedAt, contentVersion: st.contentVersion };
}

async function verify(S, c, st, ok) {
  const { code, condition, expect } = st, nS = S.type.sessionCount(c);
  const plans = {};
  for (let s = 1; s <= nS; s++) plans[s] = await S.store.get(`plans/${code}/s${s}`);
  // One read of this participant's records; both CSVs are built from it exactly as the exports are.
  const full = await E.exportRecords(S, [code]), person = full.participants[0];
  const trialsText = E.toCsv(full.records.filter(x => /\/t\d+$/.test(x.key)).map(x => E.trialRow(S, x, person)), E.FIRST_COLUMNS);
  const surveysText = E.toCsv(full.records.filter(x => /\/survey-(pre|post)$/.test(x.key)).map(x => E.surveyRow(x, person)), E.FIRST_COLUMNS.slice(0, 6));
  const trialsCsv = parseCsv(trialsText), surveysCsv = parseCsv(surveysText);
  const nTrials = Object.values(plans).reduce((n, p) => n + (p ? p.trials.length : 0), 0);
  ok(trialsCsv.length === nTrials, `Trials CSV has ${nTrials} rows (got ${trialsCsv.length})`);
  if (S.type.checkSession) for (let s = 1; s <= nS; s++) for (const [pass, what] of S.type.checkSession(trialsCsv.filter(x => +x.session === s), s, condition, c)) ok(pass, what);
  let bad = [];
  for (const e of expect.filter(x => x.kind === 'trial')) {
    const row = trialsCsv.find(x => +x.session === e.session && +x.trial_index === e.index);
    if (!row) { bad.push(`s${e.session}i${e.index + 1}: missing`); continue; }
    const problems = S.type.checkRow(row, e.sent, plans[e.session].trials[e.index], c);
    if (problems.length) bad.push(`s${e.session}i${e.index + 1}: ${problems.join(', ')}`);
  }
  ok(!bad.length, bad.length ? `Every item row matches what was submitted (problems: ${bad.slice(0, 5).join('; ')})` : 'Every item row matches what was submitted');
  bad = [];
  for (const e of expect.filter(x => x.kind !== 'trial')) {
    const row = surveysCsv.find(x => +x.session === e.session && x.survey === e.kind);
    if (!row) { bad.push(`s${e.session} ${e.kind}: missing`); continue; }
    for (const [k, v] of Object.entries(e.data)) if (row[k] !== v) bad.push(`s${e.session} ${e.kind} ${k}`);
  }
  ok(!bad.length, bad.length ? `Survey answers match (problems: ${bad.slice(0, 5).join('; ')})` : `Survey answers match (${expect.filter(x => x.kind !== 'trial').length} surveys)`);
  ok(trialsCsv.every(x => x.content_version === String(c.version || 0)), `Rows are tagged with content version ${c.version || 0}`);
  ok(trialsCsv.every(x => x.test === '1' && x.label === 'self-test'), 'Rows are marked as test data');
  ok(!/"pin"|"hash"|"salt"/.test(JSON.stringify(full)), 'No PIN data in the export');
  ok(!/rawEvents|self_test/.test(JSON.stringify(full.records)) && (await S.store.list(`raw/${code}/`)).length === nTrials, 'Raw events stored separately, not in the research records');
  ok(full.participants.length === 1 && full.participants[0].completed.length === nS, 'Participant record shows every session complete');
}

async function casProbe(store) {
  if (!store.getMeta || !store.setIf) return { etag: false };
  const k = `selftest/diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await store.set(k, { v: 1 });
    const m1 = await store.getMeta(k);
    await store.set(k, { v: 2 });
    const stale = await store.setIf(k, { v: 3 }, { etag: m1.etag });
    const m2 = await store.getMeta(k);
    const fresh = await store.setIf(k, { v: 4 }, { etag: m2.etag });
    const final = (await store.get(k))?.v;
    const created = await store.setIf(k, { v: 5 }, { onlyIfNew: true });
    return { etag: !!m1.etag && !!m2.etag && m1.etag !== m2.etag, stale, fresh, final, created };
  } finally { await store.delete(k); }
}
