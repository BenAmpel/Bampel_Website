// ARGOS smishing-warning study (type "smishing", template "argos-smishing"), end to end over HTTP with in-memory stores:
// the bank passes validation; allocation fills the 24 stratum x block x arm cells evenly; a plan has 4 practice and 72
// main trials, 12 per condition with 8 smishing each, in an order that meets every run-length rule; the browser never
// sees labels, cue families or condition names; the raw Prolific ID is never stored; unknown event names and stray
// fields never reach the record; the comprehension gate screens out on a second failure; the export carries the
// analysis columns with the right funnel values.
import assert from 'node:assert/strict';
import { handle } from '../../netlify/lib/lab/router.mjs';
import { memBlobs } from './memstore.mjs';
import smishing, { CONDS, CELLS, conditionFor, orderTrials, warningFor } from '../../netlify/lib/lab/types/smishing.mjs';
import { seeded, shuffle } from '../../netlify/lib/lab/engine.mjs';

const getStore = memBlobs(), OWNER = 'owner-key-0123456789abcdef';
const call = async (path, { body, key } = {}) => {
  const req = new Request('https://lab.test' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handle(req, { getStore, env: { LAB_ADMIN_KEY: OWNER } });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
};
const parseCsv = text => text.trim().split('\n').map(line => { const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out; });

// ---------- pure design rules ----------
{
  const c = smishing.defaultContent(), e = []; smishing.validate(c, e);
  assert.deepEqual(e, [], 'the template bank passes validation');
  const bad = structuredClone(c); bad.consent.approved = true; const e2 = []; smishing.validate(bad, e2);
  assert(e2.some(x => /provisional/.test(x)), 'a provisional bank cannot go live with an approved consent');
  for (let g = 1; g <= 6; g++) assert.equal(new Set([1, 2, 3, 4, 5, 6].map(a => conditionFor(g, a))).size, 6, `group ${g} meets every condition across the arms`);
  for (let a = 1; a <= 6; a++) assert.equal(new Set([1, 2, 3, 4, 5, 6].map(g => conditionFor(g, a))).size, 6, `arm ${a} shows every condition once`);
  const alerted = { alert: true, tier: 'Severe', certainty: 'Low', c5: 'x'.repeat(60), c5p: 'y'.repeat(61) };
  assert.deepEqual(warningFor('C1', alerted), { kind: 'none' }); assert.equal(warningFor('C2', alerted).kind, 'banner'); assert.equal(warningFor('C3', alerted).kind, 'badge');
  assert.equal(warningFor('C4', alerted).line, undefined); assert.equal(warningFor('C5', alerted).line, alerted.c5); assert.equal(warningFor('C5p', alerted).line, alerted.c5p);
  assert.deepEqual(warningFor('C5', { ...alerted, alert: false }), { kind: 'none' }, 'an unalerted item looks like C1 in every condition');
  const items = c.bank.items.filter(x => x.block === 'A');
  for (let s = 0; s < 200; s++) {
    const arm = 1 + (s % 6), o = orderTrials(items.map(item => ({ item, cond: conditionFor(item.group, arm) })), seeded('t' + s), shuffle);
    let rc = 1, rs = 1;
    for (let i = 1; i < o.length; i++) {
      rc = o[i].cond === o[i - 1].cond ? rc + 1 : 1; rs = o[i].item.label === o[i - 1].item.label ? rs + 1 : 1;
      assert(rc <= 3 && !(o[i].item.label === 'smishing' && rs > 4) && !(o[i].item.label === 'benign' && rs > 3), `seed ${s}: run-length rule`);
    }
    assert(o.slice(-6).some(x => x.item.label === 'smishing'), `seed ${s}: a smishing trial among the last 6`);
  }
  console.log('design: bank valid, Latin square complete, warnings per condition, order rules hold over 200 seeds');
}

// ---------- over HTTP ----------
let r = await call('/api/lab/_lab/create', { key: OWNER, body: { id: 'arg', name: 'ARGOS smishing', template: 'argos-smishing' } });
assert(r.json.ok, r.text);
const P = '/api/lab/arg/', store = getStore({ name: 'lab-arg' });
const keys = async (prefix = '') => { const out = []; for await (const page of store.list({ prefix })) out.push(...page.blobs.map(b => b.key)); return out; };
const pubText = (await call(P + 'content')).text, pub = JSON.parse(pubText);
assert.equal(pub.type, 'smishing'); assert.equal(pub.consent.approved, false, 'draft consent until the amendment is approved');
assert.equal(pub.smishing.trialSeconds, 90);
assert(pub.debrief && /set up by the research team/.test(pub.debrief.body), 'the debrief (full disclosure of the deception) reaches the finish page'); assert.equal(pub.environment.desktopOnly, true);
assert(!/"benign"|PRESSURE|FALSE_PRETEXT|SENSITIVE_REQUEST/.test(pubText), 'no bank labels or cue families in the public content');
assert(!pub.embedded.some(x => /PROLIFIC_PID/i.test(x.param)), 'the Prolific ID is never embedded data');

const PIDS = Array.from({ length: 24 }, (_, i) => `5f9c${String(i).padStart(4, '0')}abcdef0123456789`);
const plans = {};
for (const pid of PIDS) {
  const tok = (await call(P + 'login', { body: { panelId: pid, panelStudy: 'STUDYX', panelSession: 'SESS' + pid.slice(4, 8) } })).json.token; assert(tok, pid);
  assert((await call(P + 'consent', { body: { token: tok, agree: true } })).json.ok);
  plans[pid] = { tok, plan: (await call(P + 'session', { body: { token: tok } })).json };
}
const cond = (await keys('cond/')).map(k => k.split('/')[1]);
assert.deepEqual([...new Set(cond)].sort(), [...CELLS].sort(), 'every stratum x block x arm cell is used');
assert(CELLS.every(cell => cond.filter(x => x === cell).length === 1), '24 participants fill the 24 cells once each (balanced within stratum)');

// The raw Prolific ID is stored nowhere (keepId: false): only its keyed hash names the record.
for (const k of await keys()) { const v = JSON.stringify(await store.get(k)); for (const pid of PIDS) assert(!v.includes(pid) && !k.includes(pid), `raw Prolific ID in ${k}`); }
assert.deepEqual(await keys('contact/'), [], 'no contact records');
console.log('allocation: 24 cells filled evenly; no raw Prolific ID anywhere in the store');

// One participant's plan as the browser sees it, and a stored plan's design.
const [pid0] = PIDS, { tok, plan } = plans[pid0];
assert.equal(plan.trials.length, 81, '4 practice + 72 main + 5 comprehension screens');
assert.deepEqual(plan.trials.slice(76).map(t => t.kind), Array(5).fill('comp')); assert.equal(plan.trials.slice(76).filter(t => t.att2).length, 1, 'ATT2 on one comprehension screen');
assert(plan.trials.slice(76).every(t => t.warning.kind !== 'none'), 'each comprehension screen shows a warning'); assert.equal(plan.practiceCount, 4);
const ptext = JSON.stringify(plan.trials);   // the survey's answer options carry their own "label" keys
assert(!/"label"|"cue"|"cond"|C5p|"benign"|"smishing"|PRESSURE|SENSITIVE_REQUEST/.test(ptext), 'the browser never sees labels, cue families or condition names');
assert(!ptext.includes('[link-neutralized]') && plan.trials.filter(t => t.link).every(t => /^https:\/\/sms-link\.example\/[a-z0-9]{6}$/.test(t.link) && t.text.includes(t.link)), 'links shown as the display string');
assert.equal(plan.trials.filter(t => t.att1Before).length, 1); assert(plan.trials[40].att1Before, 'attention check before main message 37');
for (const k of await keys('plans/')) {
  const main = (await store.get(k)).trials.filter(t => !t.practice && t.kind !== 'comp');
  for (const cn of CONDS) {
    assert.equal(main.filter(t => t.cond === cn).length, 12, `${k} ${cn}: 12 trials`);
    assert.equal(main.filter(t => t.cond === cn && t.item.label === 'smishing').length, 8, `${k} ${cn}: 8 smishing`);
  }
  assert([6, 7].includes((await store.get(k)).fpExposure), `${k}: alerted benign shown with a warning, 6 or 7`);
}
console.log('plans: 76 trials, 12 per condition, 8 smishing each, false-alarm dose 6 or 7, no labels in the browser');

// ---------- trial records ----------
const save = (t, index, data) => call(P + 'trial', { body: { token: t, session: 1, index, data } });
const ev = list => list.map(([e, ms, extra]) => ({ e, ms, ...(extra || {}) }));
r = await save(tok, 0, { events: ev([['render', 0], ['ignore', 900], ['probe', 1500], ['next', 2000]]), probe: 20, readback: 'No warning shown', comprehension: { attempts: 1, passed: true, wrong: 0 } });
assert(r.json.ok && !r.json.screenedOut, r.text);
for (let i = 1; i < 76; i++) {   // the messages; the comprehension screens follow
  const engaged = i === 5, att = plan.trials[i].att1Before;
  const events = engaged ? ev([['render', 0], ['link_tap', 800], ['mock_view', 820], ['field_focus', 1500], ['field_input', 1700, { count: 4 }], ['submit', 2500], ['probe', 3000], ['next', 3500], ['keystroke', 3600]])
    : ev([['render', 0], ['ignore', 700], ['probe', 1200], ['next', 1500]]);
  r = await save(tok, i, { events, probe: 50, readback: 'Medium', fieldInputs: engaged ? 4 : 0, ...(att ? { att1: 26 } : {}), password: 'hunter2', typed: 'secret text' });
  assert(r.json.ok, `trial ${i}: ${r.text}`);
}
for (let i = 76; i < 81; i++) {
  const att2 = plan.trials[i].att2;
  r = await save(tok, i, { comp: { comp1: 6, comp2: 5, comp3: 7, comp4: 2, comp5: 6, comp9: 1 }, ...(att2 ? { att2: 2 } : {}) });
  assert(r.json.ok, `comprehension ${i}: ${r.text}`);
}
const rec5 = await store.get((await keys('data/')).find(k => k.endsWith('/t5')));
assert(!JSON.stringify(rec5).includes('hunter2') && !JSON.stringify(rec5).includes('secret text'), 'stray fields are dropped');
assert(!rec5.data.events.some(e => e.e === 'keystroke'), 'unknown event names are dropped');

// ---------- export ----------
const rows = parseCsv((await call(P + 'admin/export.csv', { key: OWNER })).text), head = rows[0], col = n => head.indexOf(n);
for (const n of ['row_kind', 'comprehension_score', 'att2_pass', 'stimulus_id', 'true_label', 'condition', 'trial_index', 'age_stratum', 'engaged', 'visited', 'disclosed', 'funnel_stage', 'suspicion_prob', 'rt_ms', 'tier_readback_correct', 'fp_exposure_count', 'cue_family', 'att1_pass', 'provisional_bank'])
  assert(col(n) >= 0, `export has ${n}`);
assert.equal(rows.length - 1, 81, 'one row per saved message and comprehension screen');
const compRows = rows.slice(1).filter(x => x[col('row_kind')] === 'comprehension');
assert.equal(compRows.length, 5); assert.deepEqual(compRows.map(x => x[col('condition')]).sort(), ['C2', 'C3', 'C4', 'C5', 'C5p']);
assert(compRows.every(x => x[col('comprehension_score')] === '6.00'), 'COMP4 reverse-scored: (6 + 5 + 7 + 6 + 6) / 5');
assert.equal(compRows.filter(x => x[col('att2_pass')] === '1').length, 1, 'ATT2 answered Disagree (2) passes');
assert(!head.includes('comp9'), 'unknown comprehension items are dropped');
const r5 = rows.find(x => x[col('stimulus_id')] === rec5.stimulusId);
assert.equal(r5[col('engaged')], '1'); assert.equal(r5[col('disclosed')], '1'); assert.equal(r5[col('funnel_stage')], '3'); assert.equal(r5[col('field_input_count')], '4');
assert.equal(r5[col('suspicion_prob')], '0.50'); assert.equal(r5[col('rt_ms')], '800');
assert(rows.slice(1).filter(x => x[col('row_kind')] === 'message').length === 76);
assert(rows.slice(1).some(x => x[col('att1_pass')] === '1'), 'attention check 26 passes (25 +/- 2)');
assert(rows.slice(1).every(x => x[col('provisional_bank')] === '1'), 'every row says the bank is provisional');
console.log('records and export: funnel, suspicion, read-back, attention check; stray fields and events dropped');

r = await call(P + 'survey', { body: { token: tok, session: 1, kind: 'post', data: { imc_choice: 'none', fpr_tolerance_pct: 10, dem_age: '18-44', dem_sms: 'yes' } } });
assert(r.json.ok, r.text);
const sv = parseCsv((await call(P + 'admin/export-surveys.csv', { key: OWNER })).text), sh = sv[0];
for (const n of ['imc_choice', 'fpr_tolerance_pct', 'dem_age', 'dem_sms']) assert(sh.includes(n), `surveys export has ${n}`);
console.log('comprehension screens and post-task survey: scored, exported');

// ---------- comprehension gate ----------
{
  const t2 = plans[PIDS[1]].tok;
  r = await save(t2, 0, { events: [], comprehension: { attempts: 2, passed: false, wrong: 1 } });
  assert(r.json.ok && r.json.screenedOut, 'a second failed comprehension check ends the study');
  assert.equal((await call(P + 'session', { body: { token: t2 } })).json.error, 'finished');
  console.log('comprehension: two failures screen out');
}
