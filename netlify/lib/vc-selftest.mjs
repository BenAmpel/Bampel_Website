// Verification study: live self-test. Runs one throwaway participant through every session of the
// current design against the real store, checks what was saved and exported, then deletes it.
// Owner-only; triggered from the admin page. Nothing here signs in through the website.
import * as core from './vc-core.mjs';
import { getContent } from './vc-content.mjs';

const pick = (a, r) => a[Math.floor(r() * a.length)];

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
  if (it.type === 'choice' || it.type === 'select') return pick(it.options, r).value;
  return 'self-test note';
}

// Resumable: each call works for about budgetMs, saves its progress under selftest/{code}, and
// returns { done: false, code } until finished, so no single call hits the function time limit.
export async function runSelfTest(store, { condition, code, keep = false, budgetMs = 2500 } = {}) {
  const t0 = Date.now(), r = Math.random;
  const c = await getContent(store), nS = c.design.sessions.length;
  let st;
  if (!code) {
    const p = await core.createTestParticipant(store, condition);
    if (p.error) return { error: p.error };
    st = { condition, code: p.code, keep, stage: 'start', session: 1, expect: [], checks: [], startedAt: t0, contentVersion: c.version || 0 };
  } else {
    st = await store.get(`selftest/${code}`);
    if (!st) return { error: 'not_found', status: 404 };
  }
  code = st.code; condition = st.condition;
  const ok = (pass, what) => { st.checks.push({ pass: !!pass, what }); return !!pass; };
  const progress = () => ({ done: false, code, condition, session: st.session, sessions: nS, passed: st.checks.filter(x => x.pass).length, failed: st.checks.filter(x => !x.pass).length });
  try {
    if (st.contentVersion !== (c.version || 0)) { ok(false, 'Study content changed during the self-test; run it again'); st.stage = 'cleanup'; }
    if (st.stage === 'start') {
      // The storage must honor conditional writes, or simultaneous requests could overwrite each other.
      const cas = await casProbe(store);
      ok(cas.etag && cas.stale === false && cas.fresh === true && cas.final === 4 && cas.created === false, `Storage honors conditional writes ${JSON.stringify(cas)}`);

      const lg = await core.login(store, { code });
      ok(lg.token && await core.verifyToken(store, lg.token) === code, 'Sign-in token issued and accepted');
      ok((await core.startSession(store, code)).error === 'no_consent', 'Sessions are blocked before consent');
      await core.consent(store, code, true);
      st.stage = 'sessions';
    }
    // One step per loop: open the session (first visit), then one alert at a time, then finish it.
    // Progress is saved between calls, so each call stays well inside the function time limit.
    while (st.stage === 'sessions') {
      if (st.session > nS) { st.stage = 'verify'; break; }
      if (Date.now() - t0 > budgetMs) { await store.set(`selftest/${code}`, st); return progress(); }
      const s = st.session;
      const plan = await core.startSession(store, code);
      if (!ok(!plan.error && plan.session === s, `Session ${s} opens`)) { st.stage = 'cleanup'; break; }
      st.opened = st.opened || {};
      if (!st.opened[s]) {
        st.opened[s] = true;
        const spec = c.design.sessions[s - 1], usesAI = condition !== 'control' && Array.isArray(spec.ai);
        ok(plan.total === spec.alerts.length, `Session ${s}: ${spec.alerts.length} alerts`);
        ok(plan.mode === (usesAI ? condition : 'none'), `Session ${s}: AI mode is "${usesAI ? condition : 'none'}"`);
        ok(!/"truth"|"supports"|misleading|"variant"|"alertId"/.test(JSON.stringify(plan)) && plan.trials.every(t => !('id' in t.alert)), `Session ${s}: no answer key or alert IDs sent to the browser`);
        if (!plan.preSurveyDone) {
          const data = Object.fromEntries(plan.preItems.map(it => [it.id, answerFor(it, r)]));
          ok((await core.saveSurvey(store, code, s, 'pre', data)).ok, `Session ${s}: start-of-session survey saved`);
          st.expect.push({ kind: 'pre', session: s, data });
        }
        if (plan.practice && !plan.practiceDone) ok((await core.saveTrial(store, code, s, 'practice', { selfTest: true })).ok, `Session ${s}: practice saved`);
        ok((await core.saveSurvey(store, code, s, 'post', {})).error === 'trials_incomplete', `Session ${s}: cannot finish before all alerts`);
        continue;
      }
      const pending = plan.trials.filter(t => !t.done);
      if (pending.length) {
        const make = t => {
          const keys = t.alert.panels.map(x => x.key), opens = keys.filter(() => r() < 0.6);
          if (!opens.length) opens.push(keys[0]);
          const initial = plan.mode === 'evidence_first' ? pick(['malicious', 'benign'], r) : null;
          const final = pick(['malicious', 'benign'], r);
          const data = { mode: plan.mode, aiShownAtMs: plan.mode === 'ai_first' ? 0 : plan.mode === 'evidence_first' ? 1000 : null,
            initial: initial ? { judgment: initial, confidence: 50, rtMs: 900 } : null,
            final: { judgment: final, confidence: 70, influential: [opens[0]], rtMs: 2000 },
            evidence: { opens: opens.map((k, i) => ({ panel: k, atMs: 100 + i * 400, dwellMs: 300 })) }, traces: { durationMs: 2000 }, selfTest: true,
            rawEvents: [{ t: 1, type: 'self_test' }] };
          st.expect.push({ kind: 'trial', session: s, index: t.index, final, initial, opens, ai: t.ai });
          return data;
        };
        st.firstDone = st.firstDone || {};
        if (!st.firstDone[s] && pending.length > 1) {
          // Several answers at the same moment (double clicks, two tabs) must all be kept, and a re-sent
          // answer must be acknowledged without overwriting the first.
          st.firstDone[s] = true;
          const batch = pending.slice(0, 4), datas = batch.map(make);
          const res = await Promise.all(batch.map((t, j) => core.saveTrial(store, code, s, t.index, datas[j])));
          ok(res.every(x => x.ok), `Session ${s}: ${batch.length} simultaneous answers all accepted`);
          const prog = await core.progressOf(store, await core.loadParticipant(store, code));
          ok(batch.every(t => prog.sessions[s].trialsDone.includes(t.index)), `Session ${s}: all ${batch.length} simultaneous answers recorded`);
          ok((await core.saveTrial(store, code, s, batch[0].index, { ...datas[0], final: { judgment: 'benign' === datas[0].final.judgment ? 'malicious' : 'benign' } })).repeat, `Session ${s}: a re-sent answer is acknowledged, not overwritten`);
        } else {
          const t = pending[0];
          ok((await core.saveTrial(store, code, s, t.index, make(t))).ok, `Session ${s}, alert ${t.index + 1}: saved`);
        }
        continue;
      }
      const data = Object.fromEntries(plan.postItems.map(it => [it.id, answerFor(it, r)]));
      const done = await core.saveSurvey(store, code, s, 'post', data);
      ok(done.ok, `Session ${s}: end-of-session survey saved`);
      ok((await core.saveSurvey(store, code, s, 'post', data)).repeat, `Session ${s}: a re-sent survey is acknowledged`);
      st.expect.push({ kind: 'post', session: s, data });
      ok(s < nS ? done.status.nextSession === s + 1 && done.status.available : done.status.finished, s < nS ? `Session ${s + 1} opens next (no wait for test)` : 'Study marked finished');
      st.session++;
    }
    if (st.stage === 'verify') {
      if (Date.now() - t0 > 1500) { await store.set(`selftest/${code}`, st); return progress(); }
      await verify(store, c, st, ok); st.stage = 'cleanup';
      await store.set(`selftest/${code}`, st); return progress();   // clean up in the next call
    }
  } catch (e) {
    ok(false, 'Unexpected error: ' + (e && e.message || e));
  }
  // cleanup
  if (!st.keep) { const d = await core.deleteParticipant(store, code); ok(d.ok && !(await core.loadParticipant(store, code)), `Test participant deleted (${d.records || 0} records)`); }
  await store.delete(`selftest/${code}`);
  return { done: true, condition, code: st.keep ? code : null, kept: st.keep, passed: st.checks.filter(x => x.pass).length, failed: st.checks.filter(x => !x.pass).length, checks: st.checks, ms: Date.now() - st.startedAt, contentVersion: st.contentVersion };
}

async function verify(store, c, st, ok) {
  const { code, condition, expect } = st, nS = c.design.sessions.length;
  const plans = {};
  for (let s = 1; s <= nS; s++) plans[s] = await store.get(`plans/${code}/s${s}`);
  const [trialsText, surveysText, full] = await Promise.all([core.exportCsv(store, code), core.exportSurveyCsv(store, code), core.exportAll(store, code)]);
  const trialsCsv = parseCsv(trialsText), surveysCsv = parseCsv(surveysText);
  const nTrials = c.design.sessions.reduce((n, x) => n + x.alerts.length, 0);
  ok(trialsCsv.length === nTrials, `Trials CSV has ${nTrials} rows (got ${trialsCsv.length})`);
  for (let s = 1; s <= nS; s++) {
    const spec = c.design.sessions[s - 1], rows = trialsCsv.filter(x => +x.session === s);
    const want = {}; (condition !== 'control' && Array.isArray(spec.ai) ? spec.ai : spec.alerts.map(() => '')).forEach(t => want[t] = (want[t] || 0) + 1);
    const got = {}; rows.forEach(x => got[x.ai_type] = (got[x.ai_type] || 0) + 1);
    ok(JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(want).sort()), `Session ${s}: AI behaviors match the design ${JSON.stringify(want)}`);
    ok(new Set(rows.map(x => x.alert_id)).size === spec.alerts.length && rows.every(x => spec.alerts.includes(x.alert_id)), `Session ${s}: the right alerts were shown`);
  }
  let bad = [];
  for (const e of expect.filter(x => x.kind === 'trial')) {
    const row = trialsCsv.find(x => +x.session === e.session && +x.trial_index === e.index);
    if (!row) { bad.push(`s${e.session}a${e.index + 1}: missing`); continue; }
    const a = plans[e.session].trials[e.index].alert, problems = [];
    if (row.final_judgment !== e.final) problems.push('answer');
    if (row.correct !== String(+(e.final === a.truth))) problems.push('correct');
    if (row.panel_sequence !== e.opens.join('>')) problems.push('evidence order');
    if (e.ai) {
      if (row.ai_verdict !== e.ai.verdict || row.ai_confidence !== String(e.ai.confidence)) problems.push('AI advice');
      if (row.agree_ai !== String(+(e.final === e.ai.verdict))) problems.push('agreement');
      if ((row.ai_verdict === a.truth) !== ['accurate', 'uncertain_correct'].includes(row.ai_type)) problems.push('AI right/wrong');
      const k = c.design.aiConfidence, conf = +row.ai_confidence;
      if (row.ai_type.startsWith('uncertain') ? conf < k.lowMin || conf > k.lowMax : conf < k.highMin || conf > k.highMax) problems.push('AI confidence range');
    } else if (row.ai_verdict !== '') problems.push('AI shown in a no-AI session');
    if (e.initial && (row.initial_judgment !== e.initial || row.changed_initial_to_final !== String(+(e.initial !== e.final)))) problems.push('initial answer');
    if (problems.length) bad.push(`s${e.session}a${e.index + 1}: ${problems.join(', ')}`);
  }
  ok(!bad.length, bad.length ? `Every alert row matches what was submitted (problems: ${bad.slice(0, 5).join('; ')})` : 'Every alert row matches what was submitted (answer, scoring, AI advice, agreement, evidence order)');
  bad = [];
  for (const e of expect.filter(x => x.kind !== 'trial')) {
    const row = surveysCsv.find(x => +x.session === e.session && x.survey === e.kind);
    if (!row) { bad.push(`s${e.session} ${e.kind}: missing`); continue; }
    for (const [k, v] of Object.entries(e.data)) if (row[k] !== v) bad.push(`s${e.session} ${e.kind} ${k}`);
  }
  ok(!bad.length, bad.length ? `Survey answers match (problems: ${bad.slice(0, 5).join('; ')})` : `Survey answers match (${expect.filter(x => x.kind !== 'trial').length} surveys)`);
  ok(trialsCsv.every(x => x.content_version === String(c.version || 0)), `Rows are tagged with content version ${c.version || 0}`);
  ok(trialsCsv.every(x => x.test === '1' && x.label === 'self-test'), 'Rows are marked as test data');
  ok(!/rawEvents|self_test/.test(JSON.stringify(full.records)) && (await store.list(`raw/${code}/`)).length === nTrials, 'Raw events stored separately, not in the research records');
  ok(!/"pin"|"hash"|"salt"/.test(JSON.stringify(full)), 'No PIN data in the export');
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
