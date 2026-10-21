// Shared helpers for the economic-game tests: a study set up from a preset, simulated server instances (each with
// its own caches, jitter, and optionally a lagging view of key listings), and a driver that runs simulated
// participants against them.
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { presetContent } from '../../netlify/lib/lab/game/presets.mjs';
import { SimClient } from '../../netlify/lib/lab/game/sim.mjs';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import { GRACE_MS } from '../../netlify/lib/lab/game/shared.mjs';
import { memStore } from './memstore.mjs';

export const type = TYPES.game;
export const study = { id: 'game-test', name: 'Game test', type: 'game', codePrefix: 'GT', seedId: 'game-test-v1' };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function rng(seed) { let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A study in a fresh store from a preset, with optional edits to the content (edit(c) mutates it).
export async function setup(preset, edit, { base = memStore() } = {}) {
  const S = { store: base, type, study };
  const c = C.normalize(C.defaultContent(type), type);
  const p = presetContent(preset);
  Object.assign(c, p);
  if (edit) edit(c);
  C.normalize(c, type);
  const r = await C.saveContent(base, type, c, 'Tester', 0);
  if (r.error) throw new Error('content did not save: ' + JSON.stringify(r));
  C.clearContentCache(base);
  return { S, base, content: await C.getContent(base, type), spec: R.gameOf(await C.getContent(base, type)) };
}

// Another "server instance" over the same data: its own caches, random delays, and (optionally) a listing that
// lags: keys written less than lagMs (of the shared clock) ago are not listed.
export function instance(base, { rand = Math.random, jitter = 0, lagMs = 0, clock = () => 0 } = {}) {
  if (lagMs && !base.__written) {
    base.__written = new Map();
    const set = base.set, setIf = base.setIf;
    base.set = async (k, v) => { await set(k, v); base.__written.set(k, base.__clock()); };
    base.setIf = async (k, v, c) => { const ok = await setIf(k, v, c); if (ok) base.__written.set(k, base.__clock()); return ok; };
  }
  base.__clock = clock;
  const d = () => (jitter ? sleep(rand() * jitter) : Promise.resolve());
  const s = {
    name: base.name,
    get: async k => { await d(); return base.get(k); },
    set: async (k, v) => { await d(); return base.set(k, v); },
    delete: async k => { await d(); return base.delete(k); },
    list: async p => { await d(); const keys = await base.list(p); return lagMs ? keys.filter(k => clock() - (base.__written.get(k) ?? -Infinity) >= lagMs) : keys; },
    getMeta: async k => { await d(); return base.getMeta(k); },
    setIf: async (k, v, c) => { await d(); return base.setIf(k, v, c); }
  };
  return { S: { store: s, type, study }, store: s };
}

// Pilot-code participants who have consented and opened their session.
export async function participants(S, n, now, { test = false, cond } = {}) {
  const made = (await E.createParticipants(S, n, { gapDays: 0, test, label: 'tester' }, now)).created;
  for (const p of made) { await E.login(S, { code: p.code }, now); await E.consent(S, p.code, true, now); const plan = await E.startSession(S, p.code, now); if (plan.error) throw new Error(JSON.stringify(plan)); }
  return made.map(p => p.code);
}

// Simulated browsers that each talk to a randomly chosen server instance on every call.
export function clients(codes, instances, { seed = 1, now }) {
  const rand = rng('clients|' + seed), pick = () => instances[Math.floor(rand() * instances.length)];
  return codes.map(code => new SimClient(code, {
    rand: rng(`dec|${seed}|${code}`),
    call: (route, body) => type.routes[route](pick().S, code, body, now.v),
    save: (round, values) => E.saveTrial(pick().S, code, 1, round, values ? { values, rtMs: 500 } : {}, now.v)
  }));
}

// Runs the simulated session in virtual time until every non-stopped client finishes. `onTick(i, clients, now)` may stop clients.
export async function drive(cls, now, spec, { maxTicks = 8000, onTick, idleJump = true } = {}) {
  for (let i = 0; i < maxTicks; i++) {
    const states = await Promise.all(cls.map(c => c.tick(now.v)));
    if (onTick) onTick(i, cls, now.v);
    const active = cls.filter(c => !c.stopped && !c.finished);
    if (!active.length) return i;
    let jump = 1000;
    const waiting = active.filter(c => c.last && ['lobby', 'wait'].includes(c.last.phase));
    if (idleJump && waiting.length === active.length) {
      const dls = active.map(c => (c.last.deadlineAt ? c.last.deadlineAt - now.v + GRACE_MS + 1 : null)).filter(x => x != null && x > 0);
      if (active.every(c => c.last.phase === 'lobby')) jump = R.SLOT_MS;
      else if (dls.length) jump = Math.max(1000, Math.min(...dls));
      else if (active.some(c => ['arrivals', 'previous'].includes(c.last.reason))) jump = Math.max(1000, spec.feedbackSeconds * 1000);
    }
    now.v += jump;
  }
  throw new Error('the simulated session did not finish');
}
