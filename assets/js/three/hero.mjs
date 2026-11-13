// Ambient "research constellation" hero (three.js). Data-agnostic: give it nodes ({group, weight, year}) and links
// ([i, j]) and it lays each group out as a cluster on a slow-turning ring, with the newest papers nearest each
// cluster's core. Decorative: the canvas is aria-hidden and the page states in text what a point means.
//
// Cost: three draw calls (stars, nodes plus comets, lines). Lines are rewritten only during the intro or while a
// focus change fades groups; after the intro it runs at 20 fps (30 while something is moving), stops off screen and
// in background tabs, and under reduced motion draws one still frame.
import { Scene, PerspectiveCamera, Group, BufferGeometry, LineSegments, LineBasicMaterial } from 'three';
import { createStage, glowPoints, vertexBuffers, blendOf, easeOut, whenVisible, prefersReducedMotion } from './core.mjs';

const FOV = 38;
const R = 112; // ring radius
const C = 64; // cluster radius
const SPAN = R + C;
const ELEV = 0.46;
const TAU = Math.PI * 2;
const MAXN = 160;
const STARS = 320;
const COMETS = 9;
const INTRO = 2.4;
const FLIGHT = 1.3;
const DIM = 0.2;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function create(container, opts = {}) {
  const reduced = opts.reducedMotion != null ? opts.reducedMotion : prefersReducedMotion();
  let theme = { dark: true, palette: ['#16a34a', '#0284c7', '#d97706', '#a855f7'], other: '#8b949e', ...(opts.theme || {}) };
  let data = opts.data || null;
  let focusG = opts.focus != null && opts.focus >= 0 ? opts.focus : null;
  let view = null;
  let disposed = false;
  const cancel = whenVisible(container, () => {
    if (!disposed) view = build();
  });

  return {
    setData(d) { data = d; if (view) view.layout(); },
    setTheme(t) { theme = { ...theme, ...t }; if (view) view.recolor(); },
    focus(g) { focusG = g == null || g < 0 ? null : g; if (view) view.refocus(); },
    dispose() { disposed = true; cancel(); if (view) view.dispose(); },
  };

  function build() {
    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 1, 4000);
    const outer = new Group();
    const world = new Group();
    const sky = new Group();
    outer.add(world);
    scene.add(sky, outer);

    const stars = glowPoints(STARS, { additive: theme.dark, core: 0.25 });
    const glow = glowPoints(MAXN + COMETS, { additive: theme.dark, core: 0.75 });
    const lineGeo = new BufferGeometry();
    const lineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: blendOf(theme.dark) });
    const lines = new LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    const lineBuf = vertexBuffers(lineGeo);
    sky.add(stars.points);
    world.add(lines, glow.points);

    // Layout state
    let N = 0;
    let G = 1;
    let tx = new Float32Array(0); let ty = tx; let tz = tx;
    let group = new Int16Array(0);
    let size = tx; let delay = tx; let phase = tx; let spin = tx;
    let edges = []; // [i, j, cross]
    let groupAngle = [];
    let dimCur = []; let dimTo = [];
    const comets = [];

    // Motion state
    let intro = reduced ? INTRO : 0;
    let yaw = 0.0; let yawTo = 0.0;
    let distBase = 400; let dist = 400; let distTo = 400;
    let aim = 0; // 0 aims at the ring's centre, 1 at the front cluster when a thread is in focus
    let px = 0; let py = 0; let pxTo = 0; let pyTo = 0;
    let linesDirty = true;
    let firstFrame = true;
    let stage = null;

    function color(g) { return theme.palette[g % theme.palette.length]; }

    function layout() {
      const nodes = (data && data.nodes) || [];
      N = Math.min(nodes.length, MAXN);
      G = Math.max(1, opts.groups || 0, ...nodes.slice(0, N).map((n) => n.group + 1));
      const rand = seeded(opts.seed || 7);
      tx = new Float32Array(N); ty = new Float32Array(N); tz = new Float32Array(N);
      size = new Float32Array(N); delay = new Float32Array(N); phase = new Float32Array(N); spin = new Float32Array(N);
      group = new Int16Array(N);
      groupAngle = [];
      for (let g = 0; g < G; g += 1) groupAngle.push((TAU * g) / G + 0.35);
      const byGroup = Array.from({ length: G }, () => []);
      for (let i = 0; i < N; i += 1) { group[i] = nodes[i].group; byGroup[nodes[i].group].push(i); }
      byGroup.forEach((list, g) => {
        list.sort((a, b) => (nodes[b].year || 0) - (nodes[a].year || 0));
        const a = groupAngle[g];
        const cx = R * Math.cos(a); const cz = R * Math.sin(a); const cy = g % 2 ? 10 : -10;
        list.forEach((i, k) => {
          // Newest papers sit nearest the core; older work drifts outward.
          const r = C * (0.16 + 0.84 * Math.sqrt((k + 0.5) / list.length));
          const u = rand() * 2 - 1; const th = rand() * TAU; const s = Math.sqrt(1 - u * u);
          tx[i] = cx + r * s * Math.cos(th);
          ty[i] = cy + r * u * 0.7;
          tz[i] = cz + r * s * Math.sin(th);
          size[i] = 15 + 12 * (nodes[i].weight || 0.5);
          delay[i] = rand() * (INTRO - FLIGHT);
          phase[i] = rand() * TAU;
          spin[i] = 0.8 + rand() * 0.8;
        });
      });
      // Two nearest neighbours inside each group, then shared co-author links.
      const seen = new Set();
      edges = [];
      const add = (i, j) => {
        const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (i === j || seen.has(k)) return;
        seen.add(k);
        edges.push([i, j, group[i] !== group[j]]);
      };
      byGroup.forEach((list) => {
        list.forEach((i) => {
          const near = list.filter((j) => j !== i)
            .map((j) => [j, (tx[i] - tx[j]) ** 2 + (ty[i] - ty[j]) ** 2 + (tz[i] - tz[j]) ** 2])
            .sort((a, b) => a[1] - b[1]).slice(0, 2);
          near.forEach(([j]) => add(i, j));
        });
      });
      // Strongest co-author ties only: the list comes sorted by shared authors, and too many long chords read as noise.
      ((data && data.links) || []).slice(0, 48).forEach(([i, j]) => { if (i < N && j < N) add(i, j); });
      dimCur = Array.from({ length: G }, (_, g) => (focusG == null || focusG === g ? 1 : DIM));
      dimTo = dimCur.slice();
      comets.length = 0;
      for (let c = 0; c < COMETS; c += 1) comets.push({ e: -1, t: 1, speed: 0 });
      linesDirty = true;
      writeStars();
      refocus(true);
      if (stage) stage.invalidate();
    }

    function writeStars() {
      const rand = seeded(91);
      const count = stage && stage.low ? 120 : STARS;
      for (let i = 0; i < count; i += 1) {
        const x = (rand() * 2 - 1) * 1300;
        const y = (rand() * 2 - 1) * 520;
        const z = -180 - rand() * 900;
        const a = (theme.dark ? 0.22 : 0.18) + rand() * (theme.dark ? 0.45 : 0.22);
        stars.set(i, x, y, z, theme.other, 5 + rand() * 7, a);
      }
      stars.commit(count);
    }

    function nearestYaw(target) {
      return target + Math.round((yaw - target) / TAU) * TAU;
    }

    function refocus(snap) {
      for (let g = 0; g < G; g += 1) dimTo[g] = focusG == null || focusG === g ? 1 : DIM;
      if (focusG != null && focusG < G) yawTo = nearestYaw(groupAngle[focusG] - Math.PI / 2);
      distTo = focusG != null ? distBase * 0.84 : distBase;
      if (snap || reduced) {
        dimCur = dimTo.slice();
        yaw = yawTo;
        dist = distTo;
      }
      linesDirty = true;
      if (stage) stage.invalidate();
    }

    function recolor() {
      glow.setAdditive(theme.dark);
      stars.setAdditive(theme.dark);
      lineMat.blending = blendOf(theme.dark);
      lineMat.needsUpdate = true;
      writeStars();
      linesDirty = true;
      if (stage) stage.invalidate();
    }

    function resize(w, h) {
      const aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const sx = Math.max(1, Math.min(2.4, aspect / 1.6));
      outer.scale.x = sx;
      const tanV = Math.tan((FOV * Math.PI) / 360);
      const tanH = tanV * aspect;
      const fitW = (SPAN * sx) / (tanH * 0.9);
      const fitH = (C * 0.7 + 12 + SPAN * Math.sin(ELEV)) / (tanV * 0.94);
      distBase = Math.max(SPAN * 1.7, fitW, fitH);
      distTo = focusG != null ? distBase * 0.84 : distBase;
      if (reduced || firstFrame) dist = distTo;
      const ph = stage ? stage.pixelHeight() : h * Math.min(window.devicePixelRatio || 1, 1.5);
      glow.setScale(ph, FOV);
      stars.setScale(ph, FOV);
    }

    function nodePos(i, out) {
      if (intro >= INTRO) { out[0] = tx[i]; out[1] = ty[i]; out[2] = tz[i]; return 1; }
      const t = Math.max(0, Math.min(1, (intro - delay[i]) / FLIGHT));
      const e = easeOut(t);
      // Fly out from the centre on a short spiral.
      const turn = (1 - e) * 1.1;
      const c = Math.cos(turn); const s = Math.sin(turn);
      const x = tx[i] * e; const z = tz[i] * e;
      out[0] = x * c - z * s; out[1] = ty[i] * e; out[2] = x * s + z * c;
      return t;
    }

    const P = [0, 0, 0];
    const Q = [0, 0, 0];

    function writeLines() {
      lineBuf.reset(edges.length * 2);
      const intraA = theme.dark ? 0.3 : 0.42;
      const crossA = theme.dark ? 0.07 : 0.11;
      edges.forEach(([i, j, cross]) => {
        const ti = nodePos(i, P);
        const tj = nodePos(j, Q);
        const grow = Math.min(ti, tj);
        if (grow <= 0) return;
        const d = Math.min(dimCur[group[i]], dimCur[group[j]]);
        const css = cross ? theme.other : color(group[i]);
        const a = (cross ? crossA : intraA) * d * grow;
        lineBuf.push(P[0], P[1], P[2], css, a);
        lineBuf.push(Q[0], Q[1], Q[2], css, a);
      });
      lineBuf.commit();
    }

    function writeNodes(time) {
      const core = theme.dark ? 0.92 : 0.95;
      for (let i = 0; i < N; i += 1) {
        const t = nodePos(i, P);
        const tw = reduced ? 1 : 0.84 + 0.16 * Math.sin(time * spin[i] + phase[i]);
        glow.set(i, P[0], P[1], P[2], color(group[i]), size[i], core * tw * dimCur[group[i]] * Math.min(1, t * 1.4));
      }
      let n = N;
      if (!reduced && intro >= INTRO && edges.length) {
        const active = stage.low ? 4 : COMETS;
        for (let c = 0; c < active; c += 1, n += 1) {
          const cm = comets[c];
          if (cm.t >= 1) { cm.e = Math.floor(Math.random() * edges.length); cm.t = -Math.random() * 1.5; cm.speed = 1 / (2.5 + Math.random() * 2); }
          const [i, j] = edges[cm.e];
          const u = Math.max(0, cm.t);
          const a = Math.sin(Math.PI * u) * 0.95 * Math.min(dimCur[group[i]], dimCur[group[j]]);
          glow.set(n, tx[i] + (tx[j] - tx[i]) * u, ty[i] + (ty[j] - ty[i]) * u, tz[i] + (tz[j] - tz[i]) * u,
            theme.dark ? '#e6fff0' : color(group[i]), 3.4, cm.t < 0 ? 0 : a);
        }
      }
      glow.commit(n);
    }

    function advanceComets(dt) {
      comets.forEach((cm) => { cm.t += dt * (cm.t < 0 ? 1 : cm.speed); });
    }

    function frame(dt, time) {
      let busy = false;
      if (intro < INTRO) { intro = Math.min(INTRO, intro + dt); busy = true; linesDirty = true; }
      if (!reduced) {
        yawTo += (focusG == null ? 0.045 : 0.012) * dt;
        const k = 1 - Math.exp(-dt * 2.2);
        yaw += (yawTo - yaw) * k;
        if (Math.abs(yawTo - yaw) > 0.01) busy = true;
        dist += (distTo - dist) * k;
        const aimTo = focusG != null ? 1 : 0;
        aim += (aimTo - aim) * k;
        if (Math.abs(aimTo - aim) > 0.005) busy = true;
        if (Math.abs(distTo - dist) > 0.5) busy = true;
        for (let g = 0; g < G; g += 1) {
          const d = dimTo[g] - dimCur[g];
          if (Math.abs(d) > 0.004) { dimCur[g] += d * (1 - Math.exp(-dt * 4)); busy = true; linesDirty = true; } else dimCur[g] = dimTo[g];
        }
        const kp = 1 - Math.exp(-dt * 3);
        px += (pxTo - px) * kp; py += (pyTo - py) * kp;
        if (Math.abs(pxTo - px) + Math.abs(pyTo - py) > 0.002) busy = true;
        advanceComets(dt);
      }
      world.rotation.y = yaw + px * 0.12;
      sky.rotation.y = px * 0.04;
      sky.rotation.x = py * 0.025;
      const e = ELEV + py * 0.08;
      camera.position.set(0, dist * Math.sin(e), dist * Math.cos(e));
      if (reduced) aim = focusG != null ? 1 : 0;
      // The focused cluster turns to the front of the ring; aiming at it keeps it centred in a short band.
      camera.lookAt(0, -14 + aim * 8, aim * R * 0.8);
      writeNodes(time);
      if (linesDirty) { writeLines(); linesDirty = intro < INTRO; }
      stage.fps = Math.min(busy ? 30 : 20, stage.low ? 24 : 30);
      stage.renderer.render(scene, camera);
      if (firstFrame) { firstFrame = false; if (opts.onReady) opts.onReady(); }
      return busy;
    }

    const onMove = (ev) => {
      const r = container.getBoundingClientRect();
      if (!r.width) return;
      pxTo = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
      pyTo = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height) * 2 - 1));
    };
    const onLeave = () => { pxTo = 0; pyTo = 0; };

    try {
      stage = createStage(container, {
        className: 't3-canvas hero-canvas',
        fps: 30,
        onFrame: frame,
        onResize: resize,
        onLost: () => { if (opts.onLost) opts.onLost(); },
      });
    } catch (err) {
      if (opts.onLost) opts.onLost();
      return null;
    }
    layout();
    if (!reduced) {
      container.addEventListener('pointermove', onMove, { passive: true });
      container.addEventListener('pointerleave', onLeave, { passive: true });
      stage.setAnimating(true);
    }
    stage.invalidate();

    return {
      layout,
      recolor,
      refocus: () => refocus(false),
      dispose() {
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerleave', onLeave);
        stage.dispose();
        stars.dispose(); glow.dispose(); lineGeo.dispose(); lineMat.dispose();
      },
    };
  }
}
