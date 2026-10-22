// Latin-square counterbalancing (latin.mjs): the Williams design is balanced for position and for which unit follows
// which (even n: one square; odd n: square and mirror); participants get the least-used sequence within their
// condition; the plan shows the blocks (multimodal) or items (vignettes) in that order; the order is exported and in
// the codebook; deleting a participant frees their sequence.
import assert from 'node:assert/strict';
import * as LQ from '../../netlify/lib/lab/latin.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import { wideRows } from '../../netlify/lib/lab/wide.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { TEMPLATES } from '../../netlify/lib/lab/templates.mjs';
import { memStore } from './memstore.mjs';

for (let n = 2; n <= 9; n++) {
  const rows = LQ.williams(n), pos = new Map(), pair = new Map();
  assert.equal(rows.length, n % 2 ? 2 * n : n);
  for (const r of rows) {
    assert.deepEqual([...r].sort((a, b) => a - b), [...Array(n).keys()], 'each row uses every unit once');
    r.forEach((u, i) => pos.set(`${u}@${i}`, (pos.get(`${u}@${i}`) || 0) + 1));
    for (let i = 0; i < n - 1; i++) pair.set(`${r[i]}>${r[i + 1]}`, (pair.get(`${r[i]}>${r[i + 1]}`) || 0) + 1);
  }
  assert.equal(new Set(pos.values()).size, 1, `n=${n}: every unit equally often in every position`);
  assert.equal(pair.size, n * (n - 1), `n=${n}: every unit follows every other`); assert.equal(new Set(pair.values()).size, 1, `n=${n}: equally often`);
}
console.log('Williams design: balanced for position and first-order carryover, n = 2 to 9');

// ---------- multimodal: three blocks ----------
const type = TYPES.multimodal, store = memStore(), S = { store, type, study: { id: 'lsq', name: 'L', type: 'multimodal', codePrefix: 'LQ' } };
const tc = TEMPLATES['audio-judgments'].content, c = C.normalize(structuredClone(typeof tc === 'function' ? tc() : tc), type);
const ids = c.items.map(x => x.id);
assert(ids.length >= 3);
c.design.sessions = [{ blocks: [{ title: 'A', items: [ids[0]], randomize: false }, { title: 'B', items: [ids[1]], randomize: false }, { title: 'C', items: ids.slice(2), randomize: false }] }];
c.design.latinSquare = true;
const bad = structuredClone(c); bad.design.latinSquare = 'yes';
assert(C.validateContent(bad, type).some(x => /Latin-square/.test(x)));
const sv = await C.saveContent(store, type, c, 'T', 0);
assert.equal(sv.version, 1, JSON.stringify(sv.errors));
const blockOf = id => (id === ids[0] ? 'A' : id === ids[1] ? 'B' : 'C');
const seqs = [], codes = [];
for (let i = 0; i < 12; i++) {
  const [p] = (await E.createParticipants(S, 1, { gapDays: 0 })).created;
  await E.consent(S, p.code, true);
  const plan = await E.startSession(S, p.code);
  const saved = await store.get(`plans/${p.code}/s1`), itemOf = t => t.itemId || (t.item && t.item.id);
  const shown = [...new Set(saved.trials.map(t => blockOf(itemOf(t))))].join('');
  assert.equal(shown, saved.latin.sequence.map(x => 'ABC'[x - 1]).join(''), 'the blocks run in the sequence recorded');
  assert.deepEqual(JSON.stringify((await E.startSession(S, p.code)).trials), JSON.stringify(plan.trials), 'a reload keeps the order');
  seqs.push(shown); codes.push(p.code);
}
const tally = seqs.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map());
assert.equal(tally.size, 6, 'all 6 sequences of the odd (3-block) design are used'); assert.deepEqual([...new Set(tally.values())], [2], '12 participants: each sequence twice');
// exports and the codebook
const pl = await store.get(`plans/${codes[0]}/s1`);
await E.saveTrial(S, codes[0], 1, pl.trials[0].index, { decision: 'accept', rtMs: 500 });
const tr = (await E.exportRows(S, 'trials')).find(r => r.code === codes[0]);
assert.equal(tr.cb_row, pl.latin.row + 1); assert.equal(tr.cb_sequence, pl.latin.sequence.join('>'));
const w = wideRows(S, await E.exportRecords(S, [codes[0]]), c)[0];
assert.equal(w.s1_cb_sequence, tr.cb_sequence); assert(!Object.keys(w).some(k => /_[a-z0-9_]+_cb_row$/.test(k) && k !== 's1_cb_row'), 'once per session, not per item');
const book = buildCodebook(S, await C.getContent(store, type)).map(x => x.column);
assert(book.includes('cb_row') && book.includes('cb_sequence'));
// deleting a participant frees that sequence for the next person
const freed = pl.latin.row;
await E.deleteParticipant(S, codes[0]);
const [next] = (await E.createParticipants(S, 1, { gapDays: 0 })).created;
await E.consent(S, next.code, true); await E.startSession(S, next.code);
assert.equal((await store.get(`plans/${next.code}/s1`)).latin.row, freed, 'the freed sequence is used next');
console.log('multimodal: least-used sequence, blocks in that order, exported, freed on delete');

// ---------- vignettes: the items themselves, instead of the shuffle ----------
const vt = TYPES.vignettes, vs = memStore(), V = { store: vs, type: vt, study: { id: 'lsv', name: 'V', type: 'vignettes', codePrefix: 'LV' } };
const vc = C.defaultContent(vt);
assert(vc.design.sessions[0].items.length >= 2);
vc.design.randomize = true; vc.design.latinSquare = true;
assert.equal((await C.saveContent(vs, vt, vc, 'T', 0)).version, 1);
const n = vc.design.sessions[0].items.length, rowsV = LQ.williams(n), got = new Set();
for (let i = 0; i < rowsV.length; i++) {
  const [p] = (await E.createParticipants(V, 1, { gapDays: 0 })).created;
  await E.consent(V, p.code, true);
  await E.startSession(V, p.code);
  const saved = await vs.get(`plans/${p.code}/s1`), lat = saved.latin;
  assert.deepEqual(saved.trials.map(t => t.itemId), lat.sequence.map(x => vc.design.sessions[0].items[x - 1]), 'items in the square\'s order');
  got.add(lat.row);
}
assert.equal(got.size, rowsV.length, 'every row once for one participant per row');
console.log('vignettes: item order from the square (the shuffle is set aside)');
