// CCAIR Behavioral Lab, economic games: a simulated participant's browser.
// It talks to the game the way static/lab/engine/types/game.js does: poll, confirm readiness, send decisions, confirm
// the round. The live self-test and the tests use it to run groups of simulated participants through the same code
// paths as real ones. `call(route, body)` is supplied by the caller (direct module calls, or HTTP through the router),
// so the same driver exercises both.

// Random valid answers for what a poll asked for.
export function decide(entries, rand) {
  const values = {}, pick = a => a[Math.floor(rand() * a.length)];
  const num = spec => spec.min + Math.floor(rand() * (Math.floor((spec.max - spec.min) / spec.step + 1e-9) + 1)) * spec.step;
  const one = spec => (spec.kind === 'choice' ? pick(spec.options).value : num(spec));
  for (const e of entries) {
    if (e.strategy) {
      const d = e.decisions[0];
      if (e.strategy.form === 'threshold') values[d.id] = { threshold: e.strategy.min + Math.floor(rand() * (Math.round((e.strategy.max + e.strategy.step - e.strategy.min) / e.strategy.step) + 1)) * e.strategy.step };
      else { const table = {}; for (const row of e.strategy.rows) table[String(row.observed)] = one(row.spec); values[d.id] = { table }; }
    } else for (const d of e.decisions) values[d.id] = one(d);
  }
  return values;
}

export class SimClient {
  // call(route, body) -> response JSON; save(round) -> the engine's trial route result for that round
  constructor(pid, { call, save, rand, label = pid, maxRound = Infinity }) { Object.assign(this, { pid, call, save, rand, label, round: 0, hb: null, last: null, stopped: false, finished: false, maxRound, moves: 0, polls: 0 }); }
  stop() { this.stopped = true; }
  // One poll and whatever follows from it. Returns the poll state.
  async tick(now) {
    if (this.stopped || this.finished) return null;
    this.polls++;
    const s = await this.call('game/poll', { round: this.round, hb: this.hb });
    this.last = s;
    if (s.error) return s;
    if (s.phase === 'lobby') this.hb = s.hb;
    else this.hb = null;
    if (s.phase === 'ready' && !s.iAmReady && this.confirm !== false) await this.call('game/ready', { cid: s.cid });
    else if (s.phase === 'play' && this.act !== false) { const r = await this.call('game/move', { cid: s.cid, round: s.round, step: s.step, values: decide(s.entries, this.rand), rtMs: 800 }); if (r.ok) this.moves++; else this.lastError = r; }
    else if (s.phase === 'feedback' || s.phase === 'saved') {
      const r = await this.save(this.round);
      if (r && r.ok) { if (s.last) this.finished = true; else this.round++; }
    } else if (s.phase === 'async') {
      const r = await this.save(this.round, decide(s.entries, this.rand));
      if (r && r.ok) { if (s.last) this.finished = true; else this.round++; }
    } else if (s.phase === 'fee') this.finished = true;
    return s;
  }
}
