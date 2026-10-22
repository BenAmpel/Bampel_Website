// CCAIR Behavioral Lab: Latin-square counterbalancing of the order of a session's blocks (multimodal studies) or
// items (vignette studies). design.latinSquare = true turns it on for every session with 2 or more units.
// Sequences come from a balanced Williams design: for an even number of units each unit appears once in every
// position and follows every other unit exactly once; for an odd number the square and its mirror image (2n
// sequences) together achieve that. Each participant gets the sequence used least so far in their condition
// (markers lsq/{test?}/s{n}/{condition}/{row}/{id}), and the plan keeps { row, sequence } so exports show it.

// The rows of a Williams design for n units (0-based unit indices).
export function williams(n) {
  if (n < 2) return [[0].slice(0, n)];
  const first = [0];
  for (let k = 1; first.length < n; k++) { first.push(k); if (first.length < n) first.push(n - k); }
  const rows = Array.from({ length: n }, (_, r) => first.map(x => (x + r) % n));
  return n % 2 ? rows.concat(rows.map(r => r.slice().reverse())) : rows;
}

// The units of one session spec: blocks when the type has them, else items.
export function unitsOf(spec) { return Array.isArray(spec && spec.blocks) ? 'blocks' : Array.isArray(spec && spec.items) ? 'items' : null; }
const markerPrefix = (p, n) => `lsq${p.test ? '-test' : ''}/s${n}/${p.condition || 'none'}/`;

// The least-used row for this participant's condition and session (null when counterbalancing is off or not needed).
export async function chooseRow(S, p, n, c) {
  const spec = c.design && c.design.latinSquare === true ? (c.design.sessions || [])[n - 1] : null, kind = unitsOf(spec);
  if (!kind || spec[kind].length < 2) return null;
  const rows = williams(spec[kind].length).length, pre = markerPrefix(p, n);
  const counts = new Array(rows).fill(0);
  for (const k of await S.store.list(pre)) { const r = Number(k.slice(pre.length).split('/')[0]); if (r >= 0 && r < rows) counts[r]++; }
  return counts.indexOf(Math.min(...counts));
}
export const markerKey = (p, n, row) => `${markerPrefix(p, n)}${row}/${p.code}`;

// The content as this participant's session should see it: that session's blocks (or items) in the row's order.
// For vignette items the type's own shuffle is turned off, since the square sets the order.
export function applyRow(c, n, row) {
  const spec = c.design.sessions[n - 1], kind = unitsOf(spec), seq = williams(spec[kind].length)[row];
  const sessions = c.design.sessions.slice();
  sessions[n - 1] = { ...spec, [kind]: seq.map(i => spec[kind][i]) };
  return { content: { ...c, design: { ...c.design, sessions, ...(kind === 'items' ? { randomize: false } : {}) } },
    latin: { row, units: kind, sequence: seq.map(i => i + 1) } };
}

export function validateLatin(c, e) {
  const on = c.design && c.design.latinSquare;
  if (on != null && typeof on !== 'boolean') e.push('Latin-square counterbalancing must be on or off.');
  if (on === true && !(c.design.sessions || []).some(s => unitsOf(s))) e.push('Latin-square counterbalancing needs sessions made of blocks or items.');
}

// Trial columns: which row the participant got and the order of the units (their original positions, 1-based).
export function latinColumns(l) { return l ? { cb_row: l.row + 1, cb_sequence: l.sequence.join('>') } : {}; }
