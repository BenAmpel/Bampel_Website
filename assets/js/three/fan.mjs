// Citation projection as a "peer paths fan" (three.js).
//
// What it shows: the subject's citations per year (bars, with a bright path along their tops), the anonymous
// trajectories of the matched peers rescaled to the subject's current year (faint lines that all pass through this
// year and fan out after it), and the projected 50% and 80% ranges with a dashed median.
//
// Honesty: at rest the scene is exactly face-on and every mark sits on the chart plane, so it reads as a flat chart
// with true positions. Peers only spread into depth while the reader tilts it (drag) or during the opening reveal, and
// the depth of a peer line is its list position, never a value. Hover gives the numbers for a year.
//
// Cost: four draw calls (fills, ribbons, lines, glow). Lines are rewritten only while the spread changes; comets run at
// most 30 fps and stop off screen, in a closed section, in a background tab and under reduced motion.
import {
  Scene, PerspectiveCamera, Group, BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, LineSegments,
  LineBasicMaterial, Color, Vector3, AdditiveBlending, NormalBlending, DoubleSide,
} from 'three';
import { createStage, glowPoints, labelLayer, vertexBuffers as buffers, easeOut, whenVisible, prefersReducedMotion } from './core.mjs';

const FOV = 28;
const DEPTH = 220; // CSS px of depth the peers spread over when fully tilted

function niceMax(v) {
  if (!(v > 0)) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function create(container, opts = {}) {
  const reduced = opts.reducedMotion != null ? opts.reducedMotion : prefersReducedMotion();
  let data = null;
  let view = null;
  let disposed = false;
  const cancelWait = whenVisible(container, () => {
    if (disposed) return;
    try {
      view = build();
      if (data) view.apply(data);
    } catch (e) {
      if (opts.onFail) opts.onFail(e);
    }
  });

  function build() {
    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 1, 10000);
    const pivot = new Group();
    scene.add(pivot);
    let ready = false;

    const stage = createStage(container, {
      onFrame: frame,
      onResize: (w, h) => { camera.aspect = w / h; if (ready) layout(); },
      onLost: () => { if (opts.onFail) opts.onFail(new Error('context lost')); },
    });

    const fillGeo = new BufferGeometry();
    const fillMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
    const fills = new Mesh(fillGeo, fillMat);
    fills.frustumCulled = false;
    const ribbonGeo = new BufferGeometry();
    const ribbonMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
    const ribbons = new Mesh(ribbonGeo, ribbonMat);
    ribbons.frustumCulled = false;
    ribbons.renderOrder = 2;
    const lineGeo = new BufferGeometry();
    const lineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    const lines = new LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    const glow = glowPoints(160, { additive: true, core: 0.7 });
    glow.points.renderOrder = 3;
    pivot.add(fills, lines, ribbons, glow.points);
    const fillBuf = buffers(fillGeo);
    const ribbonBuf = buffers(ribbonGeo);
    const lineBuf = buffers(lineGeo);
    const labels = labelLayer(container);

    // Layout in CSS pixels, y up, origin at the box centre. Filled by layout().
    let L = null;
    let theme = null;
    // Opening reveal: peers draw left to right while the chart turns face-on. Skipped under reduced motion.
    let reveal = reduced ? 1 : 0;
    let spread = 0;
    const drag = { on: false, x: 0, y: 0, yaw: 0, pitch: 0, moved: 0, release: 0 };
    let hoverCol = -1;
    let comets = [];
    const v3 = new Vector3();

    function layout() {
      if (!data || !stage.width) return;
      const W = stage.width;
      const H = stage.height;
      const narrow = W < 480;
      const left = narrow ? 36 : 46;
      const right = 12;
      const top = 22;
      const bottom = 24;
      const cols = data.years.length;
      const plotW = W - left - right;
      const plotH = H - top - bottom;
      const bw = plotW / cols;
      const peak = Math.max(
        data.base || 0,
        ...data.actual.map((a) => a.value || 0),
        ...data.proj.map((p) => p.high || 0)
      );
      const yMax = niceMax(peak * 1.06);
      const X = (i) => left + (i + 0.5) * bw - W / 2;
      const Y = (v) => H / 2 - (top + plotH * (1 - Math.min(v, yMax) / yMax));
      L = { W, H, narrow, left, right, top, bottom, plotW, plotH, bw, yMax, X, Y, x0: left - W / 2, x1: W / 2 - right, base: Y(0) };
      const tan = Math.tan((FOV * Math.PI) / 360);
      const d = H / 2 / tan;
      L.dist = d;
      camera.position.set(0, 0, d);
      camera.near = d / 10;
      camera.far = d * 4;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      glow.setScale(stage.pixelHeight(), FOV);
      writeStatic();
      writeLines();
      writeLabels();
      if (!comets.length && !reduced) seedComets();
      stage.invalidate();
    }

    // Bars, ranges, own path, median: the parts that never move in depth.
    function writeStatic() {
      const { X, Y, bw } = L;
      const n = data.actual.length;
      const half = Math.min(18, bw * 0.28);
      const t = theme;
      fillBuf.reset(n * 6 + data.proj.length * 12 + 12);
      const quad = (x0, y0, x1, y1, color, a, z = 0) => {
        fillBuf.push(x0, y0, z, color, a); fillBuf.push(x1, y0, z, color, a); fillBuf.push(x1, y1, z, color, a);
        fillBuf.push(x0, y0, z, color, a); fillBuf.push(x1, y1, z, color, a); fillBuf.push(x0, y1, z, color, a);
      };
      data.actual.forEach((a, i) => {
        quad(X(i) - half, L.base, X(i) + half, Y(a.value), t.accent, (a.partial ? 0.14 : 0.3) * (t.dark ? 1 : 0.85));
      });
      // Ranges: from the anchor point (this year's full-year estimate) out to each projected year.
      const band = (lowKey, highKey, a) => {
        let px = X(n - 1);
        let pl = Y(data.base);
        let ph = pl;
        data.proj.forEach((p, k) => {
          const x = X(n + k);
          const l = Y(p[lowKey]);
          const h = Y(p[highKey]);
          fillBuf.push(px, pl, -1, t.accent, a); fillBuf.push(x, l, -1, t.accent, a); fillBuf.push(x, h, -1, t.accent, a);
          fillBuf.push(px, pl, -1, t.accent, a); fillBuf.push(x, h, -1, t.accent, a); fillBuf.push(px, ph, -1, t.accent, a);
          px = x; pl = l; ph = h;
        });
      };
      band('low', 'high', t.dark ? 0.07 : 0.07);
      band('innerLow', 'innerHigh', t.dark ? 0.14 : 0.13);
      fillBuf.commit();

      // Ribbons: thick lines as quads (WebGL lines are one pixel wide).
      const pathPts = data.actual.map((a, i) => [X(i), Y(i === n - 1 ? data.base : a.value)]);
      const medPts = [[X(n - 1), Y(data.base)]].concat(data.proj.map((p, k) => [X(n + k), Y(p.mid)]));
      ribbonBuf.reset((pathPts.length + medPts.length * 6) * 6 + 12);
      const seg = (a, b, w, color, alpha) => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * w / 2;
        const ny = (dx / len) * w / 2;
        ribbonBuf.push(a[0] + nx, a[1] + ny, 0.5, color, alpha); ribbonBuf.push(b[0] + nx, b[1] + ny, 0.5, color, alpha); ribbonBuf.push(b[0] - nx, b[1] - ny, 0.5, color, alpha);
        ribbonBuf.push(a[0] + nx, a[1] + ny, 0.5, color, alpha); ribbonBuf.push(b[0] - nx, b[1] - ny, 0.5, color, alpha); ribbonBuf.push(a[0] - nx, a[1] - ny, 0.5, color, alpha);
      };
      for (let i = 0; i < pathPts.length - 1; i += 1) seg(pathPts[i], pathPts[i + 1], 2.5, t.accent, 1);
      // Dashed median: 6 px dash, 5 px gap.
      for (let i = 0; i < medPts.length - 1; i += 1) {
        const a = medPts[i];
        const b = medPts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0; s < len; s += 11) {
          const u0 = s / len;
          const u1 = Math.min(1, (s + 6) / len);
          seg([a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1], 2, t.accent, 0.95);
        }
      }
      ribbonBuf.commit();
      L.pathPts = pathPts;
      L.medPts = medPts;
    }

    // Grid, peer paths and the hover column. Peers move in depth with the spread, so these are rewritten while it changes.
    function writeLines() {
      const { X, Y, x0, x1, yMax } = L;
      const t = theme;
      const paths = data.peers ? data.peers.paths : [];
      const from = data.peers ? data.peers.fromIndex : 0;
      const steps = paths.length ? Math.min(paths[0].length - 1, data.years.length - 1 - from) : 0;
      lineBuf.reset(16 + paths.length * steps * 2 + 4);
      L.ticks = [0, yMax / 3, (2 * yMax) / 3, yMax].map((v) => Math.round(v));
      L.ticks.forEach((v) => {
        lineBuf.push(x0, Y(v), -2, t.grid, 1);
        lineBuf.push(x1, Y(v), -2, t.grid, 1);
      });
      if (hoverCol >= 0) {
        const x = X(hoverCol);
        lineBuf.push(x, L.base, -2, t.muted, 0.5);
        lineBuf.push(x, Y(yMax), -2, t.muted, 0.5);
      }
      const shown = reveal * steps;
      const anchor = data.actual.length - 1 - from; // step index where every peer equals the subject's year
      paths.forEach((path, i) => {
        // Depth by list position (a fixed shuffle), never by value.
        const z = -DEPTH * spread * (((i * 37) % paths.length) / Math.max(1, paths.length - 1));
        for (let k = 0; k < steps; k += 1) {
          if (k >= shown) break;
          const u = Math.min(1, shown - k);
          const v0 = path[k] * data.base;
          const v1 = path[k + 1] * data.base;
          if (v0 > yMax) break; // clipped at the top of the chart
          const xa = X(from + k);
          const xb = X(from + k + 1);
          let xe = xa + (xb - xa) * u;
          let ve = v0 + (v1 - v0) * u;
          if (ve > yMax) {
            const cut = (yMax - v0) / (ve - v0);
            xe = xa + (xe - xa) * cut;
            ve = yMax;
          }
          const future = k >= anchor;
          const color = future ? t.accent : t.peer;
          const a = t.dark ? (future ? 0.28 : 0.2) : (future ? 0.26 : 0.18);
          lineBuf.push(xa, Y(v0), z, color, a);
          lineBuf.push(xe, Y(ve), z, color, a);
        }
      });
      lineBuf.commit();
      L.spreadWritten = spread;
      L.revealWritten = reveal;
    }

    function writeLabels() {
      const { X, Y, narrow } = L;
      const n = data.actual.length;
      const list = [];
      L.ticks.forEach((v) => list.push({ key: `y${v}`, text: String(v), p: [L.x0 - 6, Y(v), 0], cls: 't3-axis t3-axis-num is-left' }));
      data.years.forEach((year, i) => {
        if (narrow && i % 2 && i !== n - 1) return;
        list.push({ key: `x${year}`, text: i >= n ? `${year}*` : String(year), p: [X(i), L.base - 12, 0], cls: 't3-axis t3-axis-num' });
      });
      list.push({ key: 'first', text: String(data.actual[0].value), p: [X(0), Y(data.actual[0].value) + 4, 0], cls: 't3-axis t3-axis-num is-above' });
      // Left of this year's bar, clear of the knot where every peer path meets it.
      list.push({ key: 'last', text: String(data.actual[n - 1].value), p: [X(n - 1) - Math.min(18, L.bw * 0.28) - 4, Y(data.actual[n - 1].value), 0], cls: 't3-axis t3-axis-num is-left' });
      const end = data.proj[data.proj.length - 1];
      if (end) list.push({ key: 'mid', text: `~${end.mid}`, p: [X(data.years.length - 1), Y(end.mid) + 8, 0], cls: 't3-axis t3-axis-num is-above' });
      labels.set(list);
    }

    function seedComets() {
      const paths = data.peers ? data.peers.paths : [];
      comets = [];
      const count = Math.min(paths.length, stage.low ? 4 : 9);
      for (let c = 0; c < count; c += 1) comets.push({ i: (c * 29 + 7) % paths.length, t: c / count, speed: 0.07 + ((c * 13) % 5) * 0.012 });
    }

    function writeGlow(time) {
      const { X, Y } = L;
      const t = theme;
      let i = 0;
      const n = data.actual.length;
      // Own path: a soft halo on each year, a brighter one on this year's estimate.
      L.pathPts.forEach((p, k) => {
        const last = k === n - 1;
        glow.set(i++, p[0], p[1], 1, t.accent, last ? 26 : 16, (t.dark ? 0.7 : 0.45) * (last ? 1 : 0.75));
      });
      L.medPts.slice(1).forEach((p) => { glow.set(i++, p[0], p[1], 1, t.accent, 14, t.dark ? 0.45 : 0.3); });
      if (hoverCol >= 0) {
        const v = hoverCol < n ? (hoverCol === n - 1 ? data.base : data.actual[hoverCol].value) : data.proj[hoverCol - n].mid;
        glow.set(i++, X(hoverCol), Y(v), 2, t.focus, 30, 0.9);
      }
      // Comets travel the future part of a few peer paths, from this year outwards.
      if (!reduced && data.peers && reveal >= 1) {
        const from = data.peers.fromIndex;
        const anchor = n - 1 - from;
        const paths = data.peers.paths;
        const steps = Math.min(paths[0].length - 1, data.years.length - 1 - from);
        const span = steps - anchor;
        comets.forEach((c) => {
          const path = paths[c.i];
          const z = -DEPTH * spread * (((c.i * 37) % paths.length) / Math.max(1, paths.length - 1));
          const pos = ((c.t + time * c.speed) % 1) * span;
          const k = Math.min(steps - 1, anchor + Math.floor(pos));
          const u = pos - Math.floor(pos);
          const v = (path[k] + (path[k + 1] - path[k]) * u) * data.base;
          if (v > L.yMax) return;
          const x = X(from + k) + (X(from + k + 1) - X(from + k)) * u;
          const fade = Math.sin(Math.PI * Math.min(1, pos / span)); // in at this year, out at the edge
          glow.set(i++, x, Y(v), z, t.accent, 9, (t.dark ? 0.9 : 0.6) * fade);
        });
      }
      glow.commit(i);
    }

    function frame(dt, time) {
      if (!L) return false;
      let more = !reduced && comets.length > 0;
      if (reveal < 1) {
        reveal = Math.min(1, reveal + dt / 1.8);
        more = true;
      }
      // Spring back to face-on 2.5 s after a drag.
      if (!drag.on && (drag.yaw || drag.pitch) && performance.now() - drag.release > 2500) {
        const k = Math.min(1, dt * 4);
        drag.yaw -= drag.yaw * k;
        drag.pitch -= drag.pitch * k;
        if (Math.abs(drag.yaw) < 0.05 && Math.abs(drag.pitch) < 0.05) { drag.yaw = 0; drag.pitch = 0; }
        more = true;
      } else if (!drag.on && (drag.yaw || drag.pitch)) more = true;
      // The reveal opens tilted and turns face-on as the peers finish drawing.
      const intro = reduced ? 0 : 1 - easeOut(reveal);
      const yaw = drag.yaw + intro * 22;
      const pitch = drag.pitch - intro * 12;
      pivot.rotation.set((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0);
      spread = Math.min(1, Math.max(Math.abs(yaw) / 18, Math.abs(pitch) / 12));
      // Step back while turned so the near edge of a wide chart stays in the box.
      camera.position.z = L.dist * (1 + 0.35 * spread);
      if (Math.abs(spread - L.spreadWritten) > 0.004 || reveal !== L.revealWritten) writeLines();
      writeGlow(time);
      stage.renderer.render(scene, camera);
      pivot.updateMatrixWorld();
      labels.place(project);
      // At rest and tilted the labels belong to the flat chart; hide them while it is turned so they do not float.
      labels.root.style.opacity = spread > 0.25 ? '0' : '1';
      return more;
    }

    function project(p) {
      v3.set(p[0], p[1], p[2]).applyMatrix4(pivot.matrixWorld).project(camera);
      return [(v3.x * 0.5 + 0.5) * stage.width, (-v3.y * 0.5 + 0.5) * stage.height, v3.z < 1];
    }

    function colAt(x) {
      if (!L) return -1;
      const i = Math.floor((x - L.left) / L.bw);
      return i >= 0 && i < data.years.length ? i : -1;
    }
    const local = (e) => {
      const r = stage.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    function setHover(i) {
      if (i === hoverCol) return;
      hoverCol = i;
      writeLines();
      stage.invalidate();
      if (!opts.onHover) return;
      if (i < 0) { opts.onHover(null); return; }
      const n = data.actual.length;
      const v = i < n ? data.actual[i].value : data.proj[i - n].high;
      const [sx, sy] = project([L.X(i), L.Y(v), 0]);
      opts.onHover(i, sx, sy - 8);
    }
    function onMove(e) {
      if (drag.on) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.moved > 4) {
          drag.yaw = Math.max(-30, Math.min(30, drag.yaw + dx * 0.25));
          if (e.pointerType !== 'touch') drag.pitch = Math.max(-20, Math.min(20, drag.pitch + dy * 0.2));
          setHover(-1);
          stage.invalidate();
          return;
        }
      }
      if (spread > 0.25) { setHover(-1); return; }
      setHover(colAt(local(e)[0]));
    }
    function onDown(e) {
      drag.on = true;
      drag.moved = 0;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (e.pointerType !== 'touch') stage.canvas.setPointerCapture(e.pointerId);
    }
    function onUp(e) {
      if (!drag.on) return;
      drag.on = false;
      drag.release = performance.now();
      if (drag.moved <= 4) setHover(colAt(local(e)[0]));
      stage.invalidate();
    }
    stage.canvas.addEventListener('pointermove', onMove);
    stage.canvas.addEventListener('pointerdown', onDown);
    stage.canvas.addEventListener('pointerup', onUp);
    stage.canvas.addEventListener('pointercancel', () => { drag.on = false; drag.release = performance.now(); });
    stage.canvas.addEventListener('pointerleave', () => { if (!drag.on) setHover(-1); });

    function apply(next) {
      data = next;
      theme = next.theme;
      const blend = theme.dark ? AdditiveBlending : NormalBlending;
      lineMat.blending = blend;
      lineMat.needsUpdate = true;
      glow.setAdditive(theme.dark);
      comets = [];
      layout();
    }

    ready = true;
    return {
      apply,
      dispose() {
        stage.dispose();
        labels.dispose();
        glow.dispose();
        [fillGeo, ribbonGeo, lineGeo, fillMat, ribbonMat, lineMat].forEach((x) => x.dispose());
      },
    };
  }

  return {
    // data: { years: [label], actual: [{value, partial}], base, proj: [{mid, innerLow, innerHigh, low, high}],
    //         peers: { fromIndex, paths: [[ratio to base]] } | null, theme: {dark, accent, peer, muted, grid, focus} }
    setData(next) {
      data = next;
      if (view) view.apply(next);
    },
    dispose() {
      disposed = true;
      cancelWait();
      if (view) view.dispose();
      view = null;
    },
  };
}
