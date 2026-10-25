// Speed checks that a busy machine does not break. A fixed wall-clock limit failed whenever something else was running
// (another project's test runner, a browser, a build), though nothing was wrong. fastEnough() instead:
//  - times a small fixed piece of CPU work just before and after the code, and loosens the limit by how much slower than
//    an idle laptop the machine is at that moment (never tightens it);
//  - tries up to 3 times and passes on the first try under its limit.
// What these checks exist to catch, an accidentally quadratic loop or a regular expression that backtracks, is 10x
// or more and still fails every try.
import assert from 'node:assert/strict';

export const CALIBRATION_IDLE_MS = 20;   // calibrate() on an idle 2024 laptop

export function calibrate() {
  const t = performance.now();
  let n = 0;
  for (let i = 0; i < 20000; i++) {
    const s = JSON.stringify({ a: i, b: 'x'.repeat(20), c: [i, i + 1], d: { e: 'y' + i } });
    n += JSON.parse(s).a + s.replace(/x/g, 'z').length;
  }
  return n > 0 ? performance.now() - t : 0;
}

// How many times slower than idle the machine is right now (at least 1): the middle of three calibrations.
export function slowdown() {
  const c = [calibrate(), calibrate(), calibrate()].sort((a, b) => a - b)[1];
  return Math.max(1, c / CALIBRATION_IDLE_MS);
}

export async function fastEnough(label, limitMs, fn, tries = 3) {
  const seen = [];
  for (let i = 0; i < tries; i++) {
    const before = slowdown(), t = performance.now();
    await fn();
    const ms = performance.now() - t, limit = limitMs * Math.max(before, slowdown());
    seen.push(`${Math.round(ms)} ms (limit ${Math.round(limit)} ms)`);
    if (ms < limit) return ms;
  }
  assert.fail(`${label}: too slow on every try: ${seen.join(', ')}`);
}
