// Trial replay in the study admin (static/lab/engine/replay.js), its event handling in Node:
//  - times are counted from the item's start; the end is the item's end
//  - focus, hover, tab-hidden and window-away events pair into spans, and one still open runs to the end
//  - pointer samples include presses and clicks with a position; scripted input and a retried save are picked out
//  - the admin page offers it on every participant row and loads it from its own file (no inline script)
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/replay.js'), 'utf8'), sandbox);
const { prepare } = sandbox.window.LabReplay;

const rec = { session: 1, index: 0, events: [
  { t: 1000, type: 'item_begin' },
  { t: 1100, type: 'move', x: 10, y: 10 }, { t: 1150, type: 'move', x: 30, y: 12 },
  { t: 1200, type: 'focus_in', target: '#name' }, { t: 1300, type: 'key_down', k: 'char' }, { t: 1700, type: 'focus_out', target: '#name' },
  { t: 1800, type: 'hover_in', target: 'link:https://x.example' }, { t: 2300, type: 'hover_out', target: 'link:https://x.example' },
  { t: 2400, type: 'hidden' }, { t: 3400, type: 'visible' }, { t: 3500, type: 'window_blur' },
  { t: 3600, type: 'down', x: 40, y: 40, pt: 'mouse' }, { t: 3610, type: 'click', x: 40, y: 40, target: 'decision:yes' },
  { t: 3620, type: 'answer', field: 'decision', value: 'yes' }, { t: 3700, type: 'scripted', event: 'input' },
  { t: 3800, type: 'item_reopen' }, { t: 3900, type: 'focus_in', target: '#note' },
  { t: 4000, type: 'item_end' }
] };
const p = prepare(rec);
assert.equal(p.end, 3000, 'time runs from item_begin to item_end');
assert.deepEqual(p.moves.map(m => [m.rt, m.x]), [[100, 10], [150, 30], [2600, 40], [2610, 40]], 'moves, presses and clicks with a position');
assert.deepEqual(JSON.parse(JSON.stringify(p.fields)), [[200, 700, '#name'], [2900, 3000, '#note']], 'a field still focused at the end runs to the end');
assert.deepEqual(JSON.parse(JSON.stringify(p.hovers)), [[800, 1300, 'link:https://x.example']]);
assert.deepEqual(JSON.parse(JSON.stringify(p.away)), [[1400, 2400, 'tab hidden'], [2500, 3000, 'window in the background']]);
assert.equal(p.clicks.length, 1); assert.equal(p.keys.length, 1); assert.equal(p.answers[0].rt, 2620);
assert.equal(p.scripted.length, 1); assert.equal(p.reopened, true);
assert.equal(prepare({ events: [] }).end, 1, 'an empty trial does not divide by zero');
console.log('replay: times from the item start, spans paired and closed at the end, scripted input and retries picked out');

const admin = readFileSync(here('../../static/lab/engine/admin.js'), 'utf8');
assert.match(admin, /data-replay="/, 'a Replay button on each participant row');
assert.match(admin, /loadScript\('\/lab\/engine\/replay\.js'\)/, 'loaded from its own file when first used');
assert.match(admin, /getJSON\('raw\?codes='/, 'reads the stored raw traces');
console.log('admin: Replay on every participant row, viewer loaded on demand');
