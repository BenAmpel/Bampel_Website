// Analysis-ready exports: the raw events as one row per event (engine rawEventRows, admin "Raw events as CSV"), and
// the analysis starters in static/lab/analysis/:
//  - event rows: time from the trial's start, the shared columns filled, anything else as JSON in details,
//    trials in order, the key never present
//  - the starters exist, are linked from the admin, and (when R is installed) the R starter runs on a small study
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memStore } from './memstore.mjs';
import { rawEventRows, EVENT_COLUMNS, toCsv } from '../../netlify/lib/lab/engine.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

const store = memStore();
await store.set('raw/AB-1234-5678/s1/t1', { code: 'AB-1234-5678', session: 1, index: 1, events: [
  { t: 5000, type: 'item_begin', item: 't1', id: 't1' }, { t: 5200, type: 'click', item: 't1', x: 40, y: 60, target: 'decision:yes' },
  { t: 5300, type: 'answer', item: 't1', field: 'decision', value: 'yes' }] });
await store.set('raw/AB-1234-5678/s1/t0', { code: 'AB-1234-5678', session: 1, index: 0, events: [
  { t: 1000, type: 'item_begin', item: 't0', id: 't0' }, { t: 1250.25, type: 'move', item: 't0', x: 10, y: 20, pt: 'mouse' },
  { t: 1400, type: 'key_down', item: 't0', k: 'char', target: '#name', repeat: false }, { t: 1480, type: 'key_up', item: 't0', k: 'char', hold: 80 },
  { t: 1600, type: 'hover_out', item: 't0', target: 'link:https://x.example', dwell: 350 }, { t: 1700, type: 'scroll', item: 't0', target: 'page', y: 120 },
  { t: 1800, type: 'answer', item: 't0', field: 'pick', value: ['a', 'b'] }, null] });
const rows = await rawEventRows({ store }, 'AB-1234-5678');
assert.deepEqual(rows.map(r => [r.trial_index, r.t_ms, r.type]), [[0, 0, 'item_begin'], [0, 250.3, 'move'], [0, 400, 'key_down'], [0, 480, 'key_up'], [0, 600, 'hover_out'], [0, 700, 'scroll'], [0, 800, 'answer'], [1, 0, 'item_begin'], [1, 200, 'click'], [1, 300, 'answer']], 'trials in order, time from each trial\'s start');
const by = t => rows.find(r => r.type === t);
assert.deepEqual([by('move').x, by('move').y, by('move').pointer], [10, 20, 'mouse']);
assert.deepEqual([by('key_down').key, by('key_down').target, by('key_down').details], ['char', '#name', '{"repeat":false}']);
assert.equal(by('key_up').ms, 80); assert.equal(by('hover_out').ms, 350, 'durations in one column');
assert.equal(by('scroll').y, 120); assert.equal(rows[6].value, '["a","b"]', 'a list answer as JSON');
assert.equal(by('item_begin').details, '{"id":"t0"}');
assert(rows.every(r => Object.keys(r).join() === EVENT_COLUMNS.join()), 'every row has the same columns, in order');
const csv = toCsv(rows, ['code', 'session', 'trial_index', 't_ms', 'type']);
assert.equal(csv.split('\n')[0], EVENT_COLUMNS.join(',')); assert.equal(csv.trim().split('\n').length, rows.length + 1);
assert.deepEqual(await rawEventRows({ store }, 'NO-ONE'), []);
console.log('raw events: one row per event, time from each trial\'s start, shared columns and details');

const admin = readFileSync(here('../../static/lab/engine/admin.js'), 'utf8');
assert.match(admin, /data-export="events"/); assert.match(admin, /rows\?kind=events&codes=/);
assert.match(admin, /\/lab\/analysis\/starter\.R/); assert.match(admin, /\/lab\/analysis\/starter\.py/);
const R = readFileSync(here('../../static/lab/analysis/starter.R'), 'utf8'), py = readFileSync(here('../../static/lab/analysis/starter.py'), 'utf8');
for (const s of [R, py]) for (const col of ['test', 'dq_flags', 'trace_version', 'rt_ms', 'final_rt_ms', 'item_id', 'alert_id']) assert(s.includes(col), `starters use ${col}`);
console.log('starters: linked from the admin, read the columns the exports have');

// The starters end to end, when their software is here (CI may have neither): a small two-arm study, 40 participants
// x 8 items, with the second arm 25% slower; each script must leave out the test participant and the flagged one and
// recover the effect. Python is the one named by LAB_PYTHON, else python3.
const dir = mkdtempSync(join(tmpdir(), 'lab-analysis-'));
try {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const t = [['code', 'condition', 'test', 'session', 'trial_index', 'item_id', 'rt_ms', 'trace_version']], w = [['code', 'condition', 'test', 'dq_flags']];
  for (let p = 0; p < 42; p++) {
    const code = 'P' + p, cond = p % 2 ? 'warning' : 'control', pe = gauss() * 0.2;
    w.push([code, cond, p === 41 ? 1 : 0, p === 40 ? 4 : 0]);
    for (let i = 0; i < 8; i++) t.push([code, cond, p === 41 ? 1 : 0, 1, i, 'item-' + i, Math.round(Math.exp(Math.log(3000) + (cond === 'warning' ? Math.log(1.25) : 0) + pe + gauss() * 0.25)), '0.3.0']);
  }
  writeFileSync(join(dir, 't.csv'), t.map(r => r.join(',')).join('\n') + '\n'); writeFileSync(join(dir, 'w.csv'), w.map(r => r.join(',')).join('\n') + '\n');
  const py = process.env.LAB_PYTHON || 'python3';
  const tools = [
    ['R', 'Rscript', ['-e', 'quit(status = !requireNamespace("lme4", quietly = TRUE))'], 'starter.R', /conditionwarning\s*\n\s*([\d.]+)/],
    ['Python', py, ['-c', 'import pandas, statsmodels, scipy'], 'starter.py', /\[T\.warning\]': ([\d.]+)/]
  ];
  for (const [name, exe, probe, file, re] of tools) {
    if (spawnSync(exe, probe, { encoding: 'utf8' }).status !== 0) { console.log(`${name} starter: skipped (${exe} with its packages not installed)`); continue; }
    const r = spawnSync(exe, [...(name === 'Python' ? ['-I'] : []), here('../../static/lab/analysis/' + file), join(dir, 't.csv'), join(dir, 'w.csv')], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Analysing 320 trials from 40 participants/, `${name}: test and flagged participants left out`);
    const ratio = Number((r.stdout.match(re) || [])[1]);
    assert(ratio > 1.1 && ratio < 1.45, `${name}: recovers the 25% slower arm (ratio ${ratio})`);
    console.log(`${name} starter: runs, leaves out test and flagged participants, recovers the effect (ratio ${ratio})`);
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
