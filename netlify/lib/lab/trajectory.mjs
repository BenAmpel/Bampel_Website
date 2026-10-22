// CCAIR Behavioral Lab: mouse-tracking measures for a decision made by moving from a start button to one of
// several response buttons (the MouseTracker paradigm: Freeman & Ambady 2010; Kieslich et al. 2019).
// The browser sends the raw path; the measures are computed here, on the server, so every study and every
// export uses one definition.
//
// points: [[x, y, t], ...] in CSS pixels (y grows downward) and ms. The first point is where the start button
// was clicked, the last is where the response was clicked.
//   mad      maximum absolute deviation from the straight start-to-response line, divided by that line's length.
//            Positive when the path bowed toward the other option(s), negative when it bowed away.
//   auc      signed area between the path and the straight line, divided by the line's length squared.
//   xFlips   reversals of horizontal direction (moves under 3 px are ignored).
//   initMs   time from the start click to the first move of more than 4 px.
//   moveMs   time from that first move to the response click.
//   totalMs  time from the start click to the response click.

const MAX_POINTS = 1500;

export function cleanPoints(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  // Over the cap, keep the first points and always the last one (the answer click).
  const pts = raw.length > MAX_POINTS ? raw.slice(0, MAX_POINTS - 1).concat([raw[raw.length - 1]]) : raw;
  for (const p of pts) {
    if (!Array.isArray(p) || p.length < 3) continue;
    const [x, y, t] = p.map(Number);
    if (![x, y, t].every(Number.isFinite) || Math.abs(x) > 20000 || Math.abs(y) > 20000 || t < 0 || t > 864e5) continue;
    if (out.length && t < out[out.length - 1][2]) continue;   // time never runs backward
    out.push([Math.round(x), Math.round(y), Math.round(t)]);
  }
  return out;
}

export function trajectoryMetrics(raw) {
  const P = cleanPoints(raw);
  if (P.length < 2) return null;
  const [x0, y0, t0] = P[0], [x1, y1, t1] = P[P.length - 1];
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const side = dx >= 0 ? 1 : -1;   // flip so "toward the other option" is positive whichever side was chosen
  let mad = 0, auc = 0, prevU = 0, prevW = 0, flips = 0, dir = 0, acc = 0, initT = null;
  P.forEach(([x, y, t], i) => {
    const rx = x - x0, ry = y - y0;
    const u = (rx * dx + ry * dy) / len;                 // distance along the straight line
    const w = side * (rx * dy - ry * dx) / len;          // signed distance from it
    if (Math.abs(w) > Math.abs(mad)) mad = w;
    if (i) auc += (u - prevU) * (w + prevW) / 2;
    prevU = u; prevW = w;
    if (initT == null && Math.hypot(rx, ry) > 4) initT = t;
    if (i) {
      acc += x - P[i - 1][0];
      if (Math.abs(acc) >= 3) { const d = Math.sign(acc); if (dir && d !== dir) flips++; dir = d; acc = 0; }
    }
  });
  const r = v => Math.round(v * 10000) / 10000;
  return { mad: r(mad / len), madPx: Math.round(mad), auc: r(auc / (len * len)), xFlips: flips,
    initMs: initT == null ? t1 - t0 : initT - t0, moveMs: initT == null ? 0 : t1 - initT, totalMs: t1 - t0, samples: P.length };
}
