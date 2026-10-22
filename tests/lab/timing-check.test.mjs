// The timing self-check: the researcher page (/lab/timing/) follows the lab's page rules and uses only this site's
// scripts; the frame statistics are right; a study's per-session display check is cleaned, stored with the session's
// checks, and appears in the wide CSV and the codebook.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as EV from '../../netlify/lib/lab/envcheck.mjs';
import { wideRows } from '../../netlify/lib/lab/wide.mjs';
import { buildCodebook } from '../../netlify/lib/lab/codebook.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { memStore } from './memstore.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const L = createRequire(import.meta.url)(here('../../static/lab/engine/envcheck.js'));

const html = readFileSync(here('../../static/lab/timing/index.html'), 'utf8');
assert(/<html lang="en">/.test(html) && /<meta name="viewport"/.test(html) && /<title>Timing self-check[^<]*<\/title>/.test(html) && /<main/.test(html));
assert(!/—/.test(html), 'no em dashes');
assert(!/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(html), 'no other origins');
assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['/lab/engine/envcheck.js', '/lab/timing/timing.js'], 'only this site\'s scripts, no inline code');
assert(/Bridges et al\. \(2020/.test(html) && /Anwyl-Irvine et al\. \(2021/.test(html), 'points to hardware validation');
const st = L.stats([16.6, 16.7, 16.7, 16.8, 33.4]);
assert.equal(st.median, 16.7); assert.equal(st.n, 5); assert.equal(Math.round(st.mean * 100) / 100, 20.04);
assert.equal(typeof L.timingProbe, 'function'); assert.equal(typeof L.micRoundTrip, 'function');

// a study's display check: cleaned, stored, exported, documented
const type = TYPES.vignettes, store = memStore(), S = { store, type, study: { id: 'tc', name: 'T', type: 'vignettes', codePrefix: 'TC' } };
const c = C.defaultContent(type); c.environment = { ...c.environment, timingCheck: true };
assert.equal((await C.saveContent(store, type, c, 'T', 0)).version, 1);
const [p] = (await E.createParticipants(S, 1, { gapDays: 0 })).created;
await E.consent(S, p.code, true);
const timing = { refreshHz: 59.88, frameMsMedian: 16.7, frameMsSd: 1.14, jitterP95Ms: 2, droppedFrames: 0, timerLagMs: 0.3, audioBaseLatencyMs: 5.33, audioOutputLatencyMs: 0, junk: 'x' };
assert.deepEqual(await EV.saveChecks(S, E, p.code, 1, { device: { mobile: false, browser: 'chrome' }, timing }, (await C.getContent(store, type)).environment), { ok: true });
const saved = (await store.get(`data/${p.code}/s1/checks`)).data.timing;
assert.equal(saved.refreshHz, 59.88); assert(!('junk' in saved));
const w = wideRows(S, await E.exportRecords(S, [p.code]), c)[0];
assert.deepEqual([w.s1_check_timing_refresh_hz, w.s1_check_timing_frame_ms, w.s1_check_timing_dropped_frames, w.s1_check_timing_jitter_p95_ms], [59.88, 16.7, 0, 2]);
assert(buildCodebook(S, c).some(x => x.column === 's{n}_check_{name}' && /timing_refresh_hz/.test(x.label)));
const src = readFileSync(here('../../static/lab/engine/participant.js'), 'utf8');
assert(/if \(e\.timingCheck\) steps\.push/.test(src) && /L\.timingProbe\(120\)/.test(src), 'the study check measures 120 frames');
console.log('timing self-check: page rules, frame statistics, per-session display check stored and exported');
