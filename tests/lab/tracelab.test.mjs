// TraceLab 0.2.0 (static/lab/tracelab/tracelab.js) in Node with a stand-in page and a hand-driven clock:
//  - leaving a form field is not a window blur (0.1.0 counted every field blur through the capturing window listener)
//  - scrolling inside a panel counts, per panel, and fast scrolling writes few raw events but the full distance
//  - no-input time covers every input kind, so typing without moving the pointer is not "idle"
//  - key hold and between-key times, with pauses of 2 s or more counted apart; the keys themselves are never kept
//  - time in each form field; the pointer used for most presses; 1 px jitter is not a direction change
//  - share of a clip heard comes from the seconds played, so skipping to the end is not "heard"
//  - a failed save reopens the item with its events, and the engine stores, thins and exports the traces
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { keepRaw, trialRow } from '../../netlify/lib/lab/engine.mjs';
import triage from '../../netlify/lib/lab/types/alert-triage.mjs';
import { traceDq, dqColumns } from '../../netlify/lib/lab/quality.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

let clock = 0;
const target = () => {
  const ls = {};
  return { ls, addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); }, removeEventListener(t, f) { ls[t] = (ls[t] || []).filter(x => x !== f); } };
};
const win = Object.assign(target(), { innerWidth: 1200, innerHeight: 800, scrollY: 0, devicePixelRatio: 1, location: { search: '' },
  matchMedia: () => ({ matches: true }), crypto: { getRandomValues: a => a.fill(7) } });
const doc = Object.assign(target(), { hidden: false, activeElement: null, body: { tagName: 'BODY' }, documentElement: { tagName: 'HTML' } });
const el = (tag, id, trace) => ({ tagName: tag, id, scrollTop: 0, getAttribute: k => (k === 'data-trace' ? trace : null),
  closest(sel) { return sel === '[data-trace]' && trace ? this : null; }, contains: x => false });
const fire = (on, type, props = {}) => { const ev = { type, target: on === doc ? doc : on, ...props }; for (const f of on.ls[type] || []) f(ev); };
const at = (t, on, type, props) => { clock = t; fire(on, type, props); };
const sandbox = { window: win, document: doc, navigator: { userAgent: 'test', language: 'en', maxTouchPoints: 0 }, screen: { width: 1920, height: 1080 },
  performance: { now: () => clock }, URLSearchParams, Blob, setTimeout, console };
win.document = doc;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/tracelab/tracelab.js'), 'utf8'), sandbox);
const TraceLab = sandbox.window.TraceLab;
assert.equal(TraceLab.VERSION, '0.3.1');

const lab = TraceLab.create({ study: 't', mouseSampleMs: 50 }).start();
const field = el('INPUT', 'name'), panel = el('DIV', 'panel', 'evidence'), clip = { tagName: 'AUDIO', id: 'clip', currentTime: 0, duration: 10, muted: false, volume: 1,
  played: { length: 0, start: () => 0, end: () => 0 }, getAttribute: () => null, closest: () => null };
const ranges = rs => ({ length: rs.length, start: i => rs[i][0], end: i => rs[i][1] });

clock = 0; lab.beginItem('t0');
// the participant types without touching the pointer: 3 s of nothing, then keys
at(1000, doc, 'focusin', { target: field });
at(3000, doc, 'keydown', { target: field, key: 'a', code: 'KeyA' });
at(3080, doc, 'keyup', { target: field, key: 'a', code: 'KeyA' });
at(3280, doc, 'keydown', { target: field, key: 'b', code: 'KeyB' });
at(3330, doc, 'keyup', { target: field, key: 'b', code: 'KeyB' });
at(6000, doc, 'keydown', { target: field, key: 'Backspace', code: 'Backspace' });   // after a 2.7 s pause
at(6060, doc, 'keyup', { target: field, key: 'Backspace', code: 'Backspace' });
// tabbing out of the field: the window's capturing listener sees the field's blur, which is not the window losing focus
at(6500, win, 'blur', { target: field }); at(6500, doc, 'focusout', { target: field });
at(7000, win, 'blur', { target: win }); at(9000, win, 'focus', { target: win });
// fast scrolling inside the evidence panel, then the page
for (let i = 1; i <= 10; i++) { panel.scrollTop = i * 40; at(9000 + i, doc, 'scroll', { target: panel }); }   // the first event already finds it at 40
win.scrollY = 120; at(9100, doc, 'scroll', { target: doc });
// pointer: 1 px jitter, then a real reversal; two touches and a mouse press
at(9200, doc, 'pointermove', { clientX: 100, clientY: 100, pointerType: 'mouse' });
at(9260, doc, 'pointermove', { clientX: 101, clientY: 100, pointerType: 'mouse' });
at(9320, doc, 'pointermove', { clientX: 100, clientY: 100, pointerType: 'mouse' });
at(9380, doc, 'pointermove', { clientX: 140, clientY: 100, pointerType: 'mouse' });
at(9440, doc, 'pointermove', { clientX: 90, clientY: 100, pointerType: 'mouse' });
at(9500, doc, 'pointerdown', { target: panel, pointerType: 'touch' }); at(9600, doc, 'pointerdown', { target: panel, pointerType: 'touch' }); at(9700, doc, 'pointerdown', { target: panel, pointerType: 'mouse' });
// a clip played 0-2 s, skipped to 8 s, played to the end
clip.played = ranges([[0, 2]]); clip.currentTime = 2; at(9800, doc, 'play', { target: clip });
clip.currentTime = 8; at(9900, doc, 'seeked', { target: clip });
clip.played = ranges([[0, 2], [8, 10]]); clip.currentTime = 10; at(10000, doc, 'ended', { target: clip });
clock = 14000;
const f = lab.endItem({}).features;

assert.equal(f.traceVersion, '0.3.1');
assert.equal(f.windowBlurs, 1, 'only the window itself losing focus counts');
assert.equal(f.firstInteractionMs, 3000);
// inputs at 3000, 3280 and 6000 (key presses), 9001-9100 (scrolling), 9200-9700 (pointer); the item ends at 14000
assert.equal(f.noInputMs, 3000 + 2720 + 3001 + 4300, 'gaps of 2 s or more between any inputs, from the start and to the end');
assert.equal(f.longestNoInputMs, 4300);
assert.equal(f.keystrokes, 3); assert.equal(f.deletions, 1);
assert.equal(f.keyIntervalMedianMs, 280, 'one interval; the 2.7 s gap is a pause');
assert.equal(f.typingPauses, 1);
assert.equal(f.keyHoldMedianMs, 60, 'median of 80, 50, 60');
assert.deepEqual(JSON.parse(JSON.stringify(f.fields)), { '#name': { visits: 1, ms: 5500 } });
assert.equal(f.scrollers.evidence, 400, 'the panel scrolled from 0 to 400');
assert.equal(f.scrollPx, 400 + 120);
assert.equal(f.mouseXFlips, 1, '1 px jitter is not a reversal; 140 then 90 is');
assert.equal(f.pointerType, 'touch'); assert.equal(f.pointerTypes.touch, 2);
const m = f.media['#clip'];   // no data-trace label: named by its id
assert.equal(m.heardSec, 4); assert.equal(m.shareHeard, 0.4, 'skipped seconds are not heard'); assert.equal(m.furthestShare, 1); assert.equal(m.ended, true); assert.equal(m.seeks, 1);
const rawScroll = lab.events.filter(e => e.type === 'scroll' && e.target === 'evidence');
assert(rawScroll.length <= 2, `fast scrolling is sampled in the raw log (${rawScroll.length} events)`);
assert(!lab.events.some(e => e.type.startsWith('key') && ('key' in e || 'code' in e)), 'raw key events never carry the key');
console.log('TraceLab 0.2.0: window blurs, panel scrolling, no-input time, typing rhythm, fields, pointer type, clip heard');

// a failed save: the engine takes the raw events, the save fails, the item reopens with them and goes on
clock = 20000; lab.beginItem('t1');
at(20500, doc, 'click', { target: panel, clientX: 1, clientY: 1 });
clock = 21000; lab.endItem({});
const taken = lab.events.splice(0);
assert.equal(lab.reopenItem(taken), true);
at(22000, doc, 'click', { target: panel, clientX: 1, clientY: 1 });
clock = 23000;
const again = lab.endItem({});
assert.equal(again.features.clicks, 2, 'clicks before the failed save are kept');
assert.equal(again.features.saveRetries, 1, 'the failed save is counted');
assert.equal(again.features.durationMs, 3000, 'the item clock runs from its first start');
assert.equal(lab.items.filter(i => i.id === 't1').length, 1);
const ev = lab.events.filter(e => e.item === 't1').map(e => e.type);
assert.equal(ev.filter(x => x === 'click').length, 2); assert.equal(ev.filter(x => x === 'item_end').length, 1); assert(ev.includes('item_reopen'));
assert.equal(lab.reopenItem([]), true, 'a second failed save reopens it again'); lab.endItem({});
lab.beginItem('t2');
assert.equal(lab.reopenItem([]), false, 'once the next item has started, the last one stays closed');
console.log('a failed save reopens the item with its traces and raw events');

// 0.3.0: scripted input. A script's events carry isTrusted false; the lab's pages only click buttons right after a real press.
lab.endItem({}); clock = 30000; lab.beginItem('t3');
const human = [0, 180, 420, 530, 900, 1010, 1300, 1620, 1700, 2050, 2190, 2600, 2700, 3010, 3400, 3480, 3900];   // uneven, as people type
for (const ms of human) { at(30000 + ms, doc, 'keydown', { target: field, key: 'a', code: 'KeyA' }); at(30040 + ms, doc, 'keyup', { target: field, key: 'a', code: 'KeyA' }); }
at(34000, doc, 'keydown', { target: field, key: 'Enter', code: 'Enter' }); at(34100, doc, 'click', { target: panel, isTrusted: false });   // the page clicks after a real key: fine
const hf = lab.endItem({}).features;
assert.equal(hf.untrustedInputs, 0); assert.equal(hf.unpressedClicks, 0, 'a page click right after a real key is not scripted');
assert(hf.keyIntervalCv > 0.3, `human typing varies (${hf.keyIntervalCv})`); assert.equal(hf.keyIntervalCount, 16);
clock = 40000; lab.beginItem('t4');
for (let i = 0; i < 20; i++) at(40000 + i * 50, doc, 'keydown', { target: field, key: 'b', code: 'KeyB', isTrusted: false });   // a script typing every 50 ms
at(42000, doc, 'input', { target: field, isTrusted: false }); at(45000, doc, 'click', { target: panel, isTrusted: false });           // and clicking with no press
const bf = lab.endItem({}).features;
assert.equal(bf.untrustedInputs, 21); assert.equal(bf.unpressedClicks, 1); assert.equal(bf.keyIntervalCv, 0, 'a fixed rate does not vary');
assert(lab.events.some(e => e.type === 'scripted' && e.event === 'click'), 'scripted events are marked in the raw log');
console.log('0.3.0: scripted input and click-without-press counted; typing variation measured');

// the participant-level flags built from trials
const humanTrials = Array.from({ length: 6 }, () => ({ traces: { ...hf, firstAnswerMs: 4200, durationMs: 9000, hiddenMs: 0 } }));
const botTrials = Array.from({ length: 6 }, () => ({ traces: { ...bf, firstAnswerMs: 300, durationMs: 1200, hiddenMs: 600 } }));
const hq = traceDq(humanTrials), bq = traceDq(botTrials);
assert.deepEqual([hq.dq_scripted, hq.dq_even_typing, hq.dq_fast_answers, hq.dq_hidden_share], [0, 0, 0, 0], 'a person raises nothing');
assert.deepEqual([bq.dq_scripted, bq.dq_scripted_events, bq.dq_even_typing, bq.dq_fast_answers, bq.dq_fast_answer_share, bq.dq_hidden_share], [1, 132, 1, 1, 1, 0.5]);
assert.equal(traceDq(botTrials, 'reaction').dq_fast_answers, '', 'fast answers are the point of a reaction-time task');
assert.deepEqual(Object.values(traceDq([{ traces: { durationMs: 5, firstAnswerMs: 2000 } }])).slice(0, 4), ['', '', '', ''], 'before 0.3.0: blank, not clean');
assert.equal(dqColumns([], {}, null, botTrials).dq_flags, 3, 'scripted, even typing, fast answers');
assert.equal(dqColumns([], {}, null, humanTrials).dq_flags, 0);
console.log('dq: scripted input, machine-even typing and too-fast answers flag the participant; a person raises none');

// the server keeps a long log by thinning pointer moves, and says how much it kept
const long = Array.from({ length: 30000 }, (_, i) => ({ t: i, type: i % 10 ? 'move' : 'click', x: i, y: i }));
const kept = keepRaw(long);
assert(kept.length <= 20000 && kept.length > 10000);
assert.equal(kept.filter(e => e.type === 'click').length, 3000, 'every non-move event is kept');
assert.deepEqual(keepRaw([{ t: 1, type: 'click' }, null, 3]), [{ t: 1, type: 'click' }]);
const S = { type: { trialRow: () => ({}) } };
const row = trialRow(S, { code: 'X', session: 1, index: 0, data: { traces: f, raw: { sent: 10, kept: 9 } } }, null);
assert.equal(row.trace_version, '0.3.1'); assert.equal(row.window_blurs, 1); assert.equal(row.key_interval_ms, 280); assert.equal(row.no_input_ms, f.noInputMs);
assert.equal(row.raw_events, 9); assert.equal(row.raw_events_sent, 10); assert.equal(row.pointer_type, 'touch');
assert.equal(row.save_retries, 0); assert.equal(trialRow(S, { code: 'X', session: 1, index: 0, data: { traces: { ...f, saveRetries: 2 } } }, null).save_retries, 2);
const old = trialRow(S, { code: 'X', session: 1, index: 0, data: { traces: { durationMs: 5, windowBlurs: 4 } } }, null);
assert.equal(old.save_retries, '', 'not counted before 0.3.1: blank'); assert.equal(old.trace_version, '0.1.0'); assert.equal(old.window_blurs, '', '0.1.0 counted field blurs: left blank'); assert.equal(old.key_interval_ms, '');
console.log('server: long logs thinned not dropped; CSV trace columns, blank where 0.1.0 did not measure');
// alert triage: a trial with no AI stores no AI time (Number(null) is 0, which read as "AI shown at 0 ms")
const at1 = { alertId: 'a1', alert: { panels: [{ key: 'logs' }] } };
assert.equal(triage.cleanTrialData({ mode: 'none', aiShownAtMs: null }, at1, {}).aiShownAtMs, null);
assert.equal(triage.cleanTrialData({ mode: 'ai_first', aiShownAtMs: 0 }, at1, {}).aiShownAtMs, 0, 'AI first is shown at 0 ms');
console.log('alert triage: no AI is blank, not 0 ms');
// alert triage: seen time (in view, tab visible) next to open time; blank where it was not measured
{
  const t = { alertId: 'a1', alert: { panels: [{ key: 'logs' }, { key: 'email' }] } };
  const d = triage.cleanTrialData({ mode: 'none', evidence: { seenTracked: true, opens: [{ panel: 'logs', atMs: 100, dwellMs: 9000, seenMs: 2500 }, { panel: 'email', atMs: 9200, dwellMs: 400, seenMs: 400 }, { panel: 'logs', atMs: 9700, dwellMs: 300, seenMs: 300 }] } }, t, {});
  const r = { alert: { ...t.alert, misleadingPanels: [], truth: 'benign' }, data: d, ai: null, answerOrder: ['malicious', 'benign'] };
  const row = triage.trialRow(r);
  assert.deepEqual([row.dwell_logs_ms, row.seen_logs_ms, row.dwell_email_ms, row.seen_email_ms], [9300, 2800, 400, 400], 'open 9.3 s, in view 2.8 s');
  const old = triage.trialRow({ ...r, data: triage.cleanTrialData({ mode: 'none', evidence: { opens: [{ panel: 'logs', atMs: 1, dwellMs: 50 }] } }, t, {}) });
  assert.deepEqual([old.dwell_logs_ms, old.seen_logs_ms], [50, ''], 'not measured: blank');
}
// multimodal live clips: the final answer's time next to the first's
{
  const mm = (await import('../../netlify/lib/lab/types/multimodal.mjs')).default;
  const row = mm.trialRow({ itemId: 'c1', item: { kind: 'audio' }, data: { live: { changes: [{ ms: 4000, clipMs: 3000, value: 'scam' }, { ms: 9000, clipMs: 8000, value: 'legit' }], final: 'legit' } } });
  assert.deepEqual([row.live_first_ms, row.live_final_ms, row.live_final_clip_ms, row.live_changes], [4000, 9000, 8000, 1]);
}
console.log('audit follow-ups: seen time per panel, final live answer time');
console.log('ALL TRACELAB TESTS PASSED');
