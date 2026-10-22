// Multimodal study machinery for experiments built on personas, clip libraries and scored phone shifts (first used by
// the vishing Study 2 template). Imported by types/multimodal.mjs; everything here is driven by study content, so
// another study can reuse it without code changes.
//
//   persona       a role card with per-participant values: "{{d6}}" six digits, "{{word}}" a common word. Rows marked
//                 secret ("password", "account", ...) are disclosure targets in calls.
//   clipLibrary   { clips: [{ id, media, transcript, meta }], lists: [{ pre: [ids], post: [ids] }], template: item fields }
//                 Blocks with pool "clips:pre" / "clips:post" take this participant's list (assigned with the arm,
//                 balanced within arm).
//   shift         { forms: { A: [item ids], B: [...] } } Blocks with pool "shift" take this participant's form.
//   payoff        { benignComplete, disclose, callback, centsPerPoint } scored per call item marked scored: true.
//   pilot         { scriptedShare } share of participants whose AI callers use only the scripted lines.
//   design.sliderBlock  "clips:pre" or "clips:post": half of each arm rates suspicion continuously in that block.
import { digitsIn } from '../voicebot.mjs';

const WORDS = ['maple', 'harbor', 'cedar', 'river', 'copper', 'meadow', 'falcon', 'summit', 'willow', 'granite', 'orchid', 'lantern', 'pepper', 'canyon', 'violet', 'thunder'];

// ---------- persona ----------
export function personaFor(persona, rand) {
  if (!persona || !Array.isArray(persona.rows)) return null;
  const fill = s => String(s || '').replace(/\{\{(d(\d{1,2})|word)\}\}/g, (m, k, n) => k === 'word' ? WORDS[Math.floor(rand() * WORDS.length)]
    : Array.from({ length: Number(n) }, (_, i) => String(i === 0 && Number(n) > 1 ? 1 + Math.floor(rand() * 9) : Math.floor(rand() * 10))).join(''));
  const rows = persona.rows.map(r => ({ label: r.label, value: fill(r.value), note: r.note || '', ...(r.secret ? { secret: r.secret } : {}) }));
  return { title: persona.title || 'Your info', intro: persona.intro || '', rows };
}
export const publicPersona = p => p ? { title: p.title, intro: p.intro, rows: p.rows.map(r => ({ label: r.label, value: r.value, note: r.note })) } : null;
export const codeFor = rand => String(1 + Math.floor(rand() * 9)) + Array.from({ length: 5 }, () => Math.floor(rand() * 10)).join('');

// ---------- disclosure (checked on the raw words, before redaction) ----------
// Which of this call's secrets the participant said: the one-time code sent during this call, and the persona's
// secret rows. Digits count written or spoken ("four one two"); a password counts when all its words are said.
const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 2, thirty: 3, forty: 4, fifty: 5, sixty: 6, seventy: 7, eighty: 8, ninety: 9 };
// "four one five", "forty seven", "nineteen" and written digits all become digit strings; other words break the run.
const spokenDigits = text => {
  const ws = String(text || '').toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let out = '';
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (/^\d+$/.test(w)) out += w;
    else if (Object.hasOwn(TENS, w)) { const n = ws[i + 1]; if (n && Object.hasOwn(ONES, n) && ONES[n] > 0) { out += TENS[w] + String(ONES[n]); i++; } else out += TENS[w] + '0'; }
    else if (Object.hasOwn(TEENS, w)) out += String(TEENS[w]);
    else if (Object.hasOwn(ONES, w)) out += String(ONES[w]);
    else out += ' ';
  }
  return out;
};
export function disclosures(said, { code, persona }) {
  const out = [], digits = spokenDigits(said).replace(/\s/g, ''), words = String(said || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  if (code && digits.includes(code)) out.push('code');
  for (const r of (persona && persona.rows) || []) {
    if (!r.secret) continue;
    const v = String(r.value);
    if (/^[\d\s-]+$/.test(v)) { const d = v.replace(/\D/g, ''); if (d.length >= 4 && digits.includes(d.slice(-Math.min(d.length, 6)))) out.push(r.secret); }
    else { const parts = v.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); if (parts.length && parts.every(p => words.includes(p) || digits.includes(p))) out.push(r.secret); }
  }
  return [...new Set(out)];
}
export const digitCount = said => digitsIn(said);

// ---------- counterbalancing assigned with the arm ----------
// Each choice is balanced within the arm: the option with the fewest participants so far (ties broken at random),
// counted from write-once marker keys, like the arm assignment itself.
async function fewest(S, prefix, options, code, rand = Math.random) {
  const counts = await Promise.all(options.map(o => S.store.list(`${prefix}/${o}/`).then(k => k.length)));
  const min = Math.min(...counts), pick = options.filter((o, i) => counts[i] === min);
  const choice = pick[Math.floor(rand() * pick.length)];
  await S.store.set(`${prefix}/${choice}/${code}`, { at: Date.now() });
  return choice;
}
export async function assignFlags(S, p, c) {
  const arm = p.condition, flags = {}, test = p.test ? 'alloc-test' : 'alloc';
  const lists = c.clipLibrary?.lists || [];
  if (lists.length) flags.clipList = Number(await fewest(S, `${test}/clips/${arm}`, lists.map((_, i) => String(i)), p.code));
  const forms = Object.keys(c.shift?.forms || {});
  if (forms.length) flags.shiftForm = await fewest(S, `${test}/shift/${arm}`, forms, p.code);
  if (c.design?.sliderBlock) flags.slider = (await fewest(S, `${test}/slider/${arm}`, ['0', '1'], p.code)) === '1';
  const share = Number(c.pilot?.scriptedShare) || 0;
  if (share > 0) {
    const [yes, no] = await Promise.all(['1', '0'].map(o => S.store.list(`${test}/scripted/${o}/`).then(k => k.length)));
    const scripted = yes < share * (yes + no + 1);
    await S.store.set(`${test}/scripted/${scripted ? '1' : '0'}/${p.code}`, { at: Date.now() });
    flags.scripted = scripted;
  }
  return flags;
}

// ---------- pools: the items a block takes for this participant ----------
// Returns [{ it, meta }] for a pool block, or null when the block is an ordinary list of items.
export function poolItems(block, c, p, byId) {
  if (!block.pool) return null;
  const f = p.flags || {};
  if (block.pool === 'clips:pre' || block.pool === 'clips:post') {
    const lib = c.clipLibrary, list = lib && lib.lists[f.clipList ?? 0];
    if (!list) return [];
    const phase = block.pool.slice(6), clips = new Map(lib.clips.map(x => [x.id, x]));
    return list[phase].map(id => clips.get(id)).filter(Boolean).map(clip => ({
      it: { ...(lib.template || {}), id: `clip-${clip.id}`, kind: 'audio', title: (lib.template && lib.template.title) || 'Recorded call', media: clip.media, transcript: clip.transcript || '', variants: {} },
      meta: { ...(clip.meta || {}), clipId: clip.id, phase, clipList: f.clipList ?? 0, slider: !!(f.slider && c.design.sliderBlock === block.pool) }
    }));
  }
  if (block.pool === 'shift') {
    const ids = (c.shift && c.shift.forms[f.shiftForm || Object.keys(c.shift.forms)[0]]) || [];
    return ids.map(id => byId.get(id)).filter(Boolean).map(it => ({ it, meta: { ...(it.meta || {}), shiftForm: f.shiftForm || '' } }));
  }
  return [];
}
export const POOLS = ['clips:pre', 'clips:post', 'shift'];

// ---------- payoff ----------
// Points for one scored call: an attack where any secret was disclosed loses `disclose`; a legitimate request
// completed (on the call, or by calling the organization's real number back) earns `benignComplete`; each
// callback costs `callback`. Reporting or refusing earns nothing either way.
export function pointsFor(intent, s, payoff) {
  if (!payoff) return null;
  let pts = 0;
  if (intent === 'attack' && s.disclosed && s.disclosed.length) pts += Number(payoff.disclose) || 0;
  if (intent === 'benign' && (s.outcome === 'completed' || s.callbackResolved)) pts += Number(payoff.benignComplete) || 0;
  pts += (Number(payoff.callback) || 0) * (s.callbacks || 0);
  return pts;
}

// ---------- live passive decision (answer while the clip plays) ----------
export function cleanLive(d, num, options) {
  if (!d || typeof d !== 'object') return null;
  const ok = v => options.some(o => o.value === v);
  const changes = Array.isArray(d.changes) ? d.changes.slice(0, 200).filter(x => x && ok(x.value)).map(x => ({ ms: num(x.ms, 0, 6e5), clipMs: num(x.clipMs, 0, 6e5), value: x.value })) : [];
  return { startMs: num(d.startMs, 0, 6e5), changes, decidedMs: num(d.decidedMs, 0, 6e5), decidedClipMs: num(d.decidedClipMs, 0, 6e5),
    final: ok(d.final) ? d.final : null, late: d.late === true, clipMs: num(d.clipMs, 0, 6e5) };
}
export function cleanSlider(s, num) {
  return Array.isArray(s) ? s.slice(0, 3000).filter(x => Array.isArray(x)).map(x => [num(x[0], 0, 6e5), num(x[1], 0, 100)]) : null;
}
