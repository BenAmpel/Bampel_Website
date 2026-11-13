// A small 3D graph view shared by the Impact Map, the Collaboration Network, the Research Explorer thread and the CCAIR
// research map. Callers describe the scene in plain data (nodes in world units, sizes in CSS pixels, colours, fades)
// and call setGraph again whenever their state changes; the view eases nodes to their new places.
//
// Cost: one instanced mesh for every node, one line object for every edge and guide, one point cloud for halos,
// beads and comets: four draw calls whatever the data size. Frames are capped at 30 a second while anything moves and
// stop entirely when nothing does (reduced motion, off screen, closed section, background tab).
//
// Honesty: the scene stays nearly face-on (a few degrees of sway; a drag tilts it and it springs back), the field of
// view is narrow so depth barely changes apparent size, and no data value is mapped to depth.
import {
  Scene, PerspectiveCamera, Group, InstancedMesh, IcosahedronGeometry, ShaderMaterial, InstancedBufferAttribute,
  BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, Matrix4, Vector3, Quaternion, Color,
  AdditiveBlending, NormalBlending,
} from 'three';
import { createStage, glowPoints, labelLayer, easeOut, whenVisible, prefersReducedMotion } from './core.mjs';

const FOV = 28;
const SEG = 14; // segments per curved edge

const nodeVert = `
  attribute float aFade;
  varying vec3 vN; varying vec3 vC; varying float vF; varying vec3 vV;
  void main(){
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vC = instanceColor; vF = aFade; vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const nodeFrag = `
  uniform vec3 uBg; uniform float uRim; uniform float uAmb;
  varying vec3 vN; varying vec3 vC; varying float vF; varying vec3 vV;
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
    float d = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 28.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    vec3 c = vC * (uAmb + 0.62 * d) + vec3(spec * 0.38) + vC * rim * uRim;
    gl_FragColor = vec4(mix(uBg, c, vF), 1.0);
    #include <colorspace_fragment>
  }`;

function bezier(a, c, b, t, out) {
  const u = 1 - t;
  out[0] = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0];
  out[1] = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
  out[2] = u * u * a[2] + 2 * u * t * c[2] + t * t * b[2];
  return out;
}

// Control point: the midpoint pulled toward the origin by `inward` (0..1) and lifted toward the viewer by `lift`
// (a fraction of the edge length), so arcs read as arcs from the front and as bows when tilted.
function control(a, b, inward, lift) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const k = 1 - (inward || 0);
  return [((a[0] + b[0]) / 2) * k, ((a[1] + b[1]) / 2) * k, ((a[2] + b[2]) / 2) * k + len * (lift || 0)];
}

export function create(container, opts = {}) {
  const reduced = opts.reducedMotion != null ? opts.reducedMotion : prefersReducedMotion();
  let spec = null;
  let view = null; // built lazily
  let disposed = false;
  const cancelWait = whenVisible(container, () => {
    if (disposed) return;
    try {
      view = build();
      if (spec) view.apply(spec, true);
    } catch (e) {
      if (opts.onFail) opts.onFail(e);
    }
  });

  function build() {
    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
    const pivot = new Group();
    scene.add(pivot);
    const fitDist = { d: 10 };
    let ready = false; // the stage reports its first size while it is being built, before the rest exists
    let linesDirty = true;

    const stage = createStage(container, {
      onFrame: frame,
      onResize: (w, h) => { camera.aspect = w / h; if (ready) { fit(); sizeNodes(); linesDirty = true; } },
      onLost: () => { if (opts.onFail) opts.onFail(new Error('context lost')); },
    });
    stage.canvas.style.touchAction = 'pan-y';

    // ---- nodes
    let cap = 0;
    let mesh = null;
    const sphere = new IcosahedronGeometry(1, 2);
    const nodeMat = new ShaderMaterial({
      uniforms: { uBg: { value: new Color('#0d1117') }, uRim: { value: 0.55 }, uAmb: { value: 0.45 } },
      vertexShader: nodeVert, fragmentShader: nodeFrag,
    });
    function ensureMesh(n) {
      if (n <= cap && mesh) return;
      if (mesh) { pivot.remove(mesh); mesh.dispose(); }
      cap = Math.max(16, Math.ceil(n * 1.25));
      mesh = new InstancedMesh(sphere, nodeMat, cap);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      sphere.setAttribute('aFade', new InstancedBufferAttribute(new Float32Array(cap), 1));
      mesh.frustumCulled = false;
      pivot.add(mesh);
    }

    // ---- lines (edges + guides), vec4 colours
    let lineCap = 0;
    let linePos = null;
    let lineCol = null;
    const lineGeo = new BufferGeometry();
    const lineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    const lines = new LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    pivot.add(lines);
    function ensureLines(verts) {
      if (verts <= lineCap) return;
      lineCap = Math.ceil(verts * 1.3);
      linePos = new Float32Array(lineCap * 3);
      lineCol = new Float32Array(lineCap * 4);
      lineGeo.setAttribute('position', new BufferAttribute(linePos, 3));
      lineGeo.setAttribute('color', new BufferAttribute(lineCol, 4));
    }

    // ---- glow: halos, beads along focus edges, comets
    const glow = glowPoints(1400, { additive: true, core: 0.55 });
    pivot.add(glow.points);
    const labels = labelLayer(container);

    // ---- state
    let nodes = []; // {id, from, to, cur, size, color, fade, glow, focus, label, labelPos}
    let byId = new Map();
    let edges = [];
    let guides = [];
    let extraLabels = [];
    let tween = 1;
    let theme = { dark: true, bg: '#0d1117', focus: '#00e5ff' };
    let tilt = [0, 0];
    let sway = 3;
    const drag = { on: false, x: 0, y: 0, yaw: 0, pitch: 0, moved: 0, release: 0 };
    let comets = [];
    const tmp = [0, 0, 0];
    const col = new Color();
    const m4 = new Matrix4();
    const q = new Quaternion();
    const v3 = new Vector3();
    const s3 = new Vector3();
    let worldPerPx = 0.01;

    function fit() {
      const b = (spec && spec.bounds) || { cx: 0, cy: 0, w: 2, h: 2 };
      const tan = Math.tan((FOV * Math.PI) / 360);
      const d = Math.max(b.h / 2 / tan, b.w / 2 / (tan * camera.aspect)) * (b.pad || 1.06);
      fitDist.d = d;
      camera.position.set(0, 0, d);
      camera.lookAt(0, 0, 0);
      camera.near = d / 20;
      camera.far = d * 4;
      camera.updateProjectionMatrix();
      pivot.position.set(-b.cx, -b.cy, 0);
      // World units per CSS pixel at the focal plane.
      worldPerPx = (2 * d * tan) / Math.max(1, stage.height);
      glow.setScale(stage.pixelHeight(), FOV);
    }
    // The pivot rotates about the bounds centre, not the origin.
    function placePivot() {
      const b = (spec && spec.bounds) || { cx: 0, cy: 0 };
      const ry = ((tilt[1] + drag.yaw + swayYaw) * Math.PI) / 180;
      const rx = ((tilt[0] + drag.pitch + swayPitch) * Math.PI) / 180;
      pivot.rotation.set(rx, ry, 0);
      pivot.updateMatrix();
      v3.set(-b.cx, -b.cy, 0).applyEuler(pivot.rotation);
      pivot.position.copy(v3);
    }
    let swayYaw = 0;
    let swayPitch = 0;

    function sizeNodes() {
      if (!mesh) return;
      nodes.forEach((n, i) => {
        const r = (n.size / 2) * worldPerPx;
        s3.set(r, r, r);
        v3.set(n.cur[0], n.cur[1], n.cur[2]);
        m4.compose(v3, q, s3);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    function apply(next, first) {
      spec = next;
      theme = { dark: next.dark !== false, bg: next.bg || '#0d1117', focus: next.focusColor || '#00e5ff' };
      tilt = next.tilt || [0, 0];
      sway = reduced ? 0 : next.sway != null ? next.sway : 3;
      nodeMat.uniforms.uBg.value.set(theme.bg);
      nodeMat.uniforms.uRim.value = theme.dark ? 0.6 : 0.25;
      nodeMat.uniforms.uAmb.value = theme.dark ? 0.55 : 0.68;
      lineMat.blending = theme.dark ? AdditiveBlending : NormalBlending;
      lineMat.needsUpdate = true;
      glow.setAdditive(theme.dark);

      const old = byId;
      nodes = next.nodes.map((n) => {
        const prev = old.get(n.id);
        const cur = prev && !first && !reduced ? prev.cur.slice() : n.p.slice();
        return Object.assign({}, n, { from: cur.slice(), to: n.p.slice(), cur, fade: n.alpha != null ? n.alpha : 1 });
      });
      byId = new Map(nodes.map((n) => [n.id, n]));
      edges = next.edges || [];
      guides = next.guides || [];
      extraLabels = next.labels || [];
      ensureMesh(nodes.length);
      mesh.count = nodes.length;
      const fade = sphere.getAttribute('aFade');
      nodes.forEach((n, i) => {
        col.set(n.color);
        mesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
        fade.setX(i, n.fade);
      });
      mesh.instanceColor.needsUpdate = true;
      fade.needsUpdate = true;
      tween = first || reduced ? 1 : 0;
      // Comets ride the edges marked `flow`, a few per edge, phase-shifted.
      comets = [];
      if (!reduced) {
        const flowing = edges.filter((e) => e.flow);
        const per = flowing.length > 8 ? 1 : 2;
        flowing.slice(0, stage.low ? 10 : 24).forEach((e, k) => {
          for (let j = 0; j < per; j += 1) comets.push({ e, t: (k * 0.37 + j / per) % 1, speed: 0.22 + ((k * 7) % 5) * 0.03 });
        });
      }
      linesDirty = true;
      fit();
      sizeNodes();
      setLabels();
      stage.setAnimating(!reduced && (sway > 0 || comets.length > 0));
      stage.invalidate();
    }

    function setLabels() {
      const list = extraLabels.map((l) => ({ key: `x:${l.key}`, text: l.text, p: l.p, cls: l.cls, dy: l.dy }));
      nodes.forEach((n) => {
        if (!n.label) return;
        const r = n.size / 2 + 6;
        const pos = n.labelPos || 'above';
        list.push({ key: `n:${n.id}`, text: n.label, p: n.cur, cls: `is-${pos} ${n.labelCls || ''}`, dy: pos === 'above' ? -r : pos === 'below' ? r : 0, node: n });
      });
      labels.set(list);
    }

    function writeLines() {
      let verts = 0;
      guides.forEach((g) => { verts += (g.points.length - (g.closed ? 0 : 1)) * 2; });
      verts += edges.length * SEG * 2;
      ensureLines(verts);
      let i = 0;
      const push = (p, c, a) => {
        linePos[i * 3] = p[0]; linePos[i * 3 + 1] = p[1]; linePos[i * 3 + 2] = p[2];
        lineCol[i * 4] = c.r; lineCol[i * 4 + 1] = c.g; lineCol[i * 4 + 2] = c.b; lineCol[i * 4 + 3] = a;
        i += 1;
      };
      guides.forEach((g) => {
        col.set(g.color);
        const n = g.points.length;
        const segs = g.closed ? n : n - 1;
        for (let k = 0; k < segs; k += 1) {
          if (g.dashed && k % 2) continue;
          push(g.points[k], col, g.alpha);
          push(g.points[(k + 1) % n], col, g.alpha);
        }
      });
      const p0 = [0, 0, 0];
      const p1 = [0, 0, 0];
      edges.forEach((e) => {
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) return;
        const c = control(a.cur, b.cur, e.inward, e.lift);
        col.set(e.color);
        for (let k = 0; k < SEG; k += 1) {
          bezier(a.cur, c, b.cur, k / SEG, p0);
          bezier(a.cur, c, b.cur, (k + 1) / SEG, p1);
          push(p0, col, e.alpha);
          push(p1, col, e.alpha);
        }
      });
      lineGeo.setDrawRange(0, i);
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.attributes.color.needsUpdate = true;
    }

    function writeGlow(time) {
      let i = 0;
      const max = glow.max;
      const haloScale = theme.dark ? 1 : 0.6;
      nodes.forEach((n) => {
        if (i >= max || !(n.glow > 0) || n.fade < 0.3) return;
        const d = n.size * worldPerPx * (n.focus ? 3.2 : 2.6);
        glow.set(i++, n.cur[0], n.cur[1], n.cur[2], n.focus ? theme.focus : n.color, d, Math.min(1, n.glow * n.fade * haloScale * (n.focus ? 0.9 : 0.45)));
      });
      // Beads: small lights along the edges that touch the selection.
      edges.forEach((e) => {
        if (!e.beads) return;
        const a = byId.get(e.a);
        const b = byId.get(e.b);
        if (!a || !b) return;
        const c = control(a.cur, b.cur, e.inward, e.lift);
        const count = 10;
        for (let k = 1; k < count && i < max; k += 1) {
          bezier(a.cur, c, b.cur, k / count, tmp);
          glow.set(i++, tmp[0], tmp[1], tmp[2], e.color, 5 * worldPerPx, (theme.dark ? 0.55 : 0.4) * e.alpha);
        }
      });
      comets.forEach((cm) => {
        const a = byId.get(cm.e.a);
        const b = byId.get(cm.e.b);
        if (!a || !b || i >= max - 4) return;
        const c = control(a.cur, b.cur, cm.e.inward, cm.e.lift);
        const t0 = (cm.t + time * cm.speed) % 1;
        for (let k = 0; k < 4; k += 1) {
          const t = t0 - k * 0.018;
          if (t < 0) continue;
          bezier(a.cur, c, b.cur, t, tmp);
          glow.set(i++, tmp[0], tmp[1], tmp[2], cm.e.cometColor || cm.e.color, (9 - k * 1.6) * worldPerPx, (theme.dark ? 0.95 : 0.7) * (1 - k * 0.22));
        }
      });
      glow.commit(i);
    }

    function frame(dt, time) {
      let more = false;
      if (tween < 1) {
        tween = Math.min(1, tween + dt / 0.6);
        const k = easeOut(tween);
        nodes.forEach((n) => {
          for (let j = 0; j < 3; j += 1) n.cur[j] = n.from[j] + (n.to[j] - n.from[j]) * k;
        });
        sizeNodes();
        linesDirty = true;
        more = tween < 1;
      }
      // Drag springs back to the resting angle 2.5 s after release.
      if (!drag.on && (drag.yaw || drag.pitch) && performance.now() - drag.release > 2500) {
        const k = Math.min(1, dt * 4);
        drag.yaw -= drag.yaw * k;
        drag.pitch -= drag.pitch * k;
        if (Math.abs(drag.yaw) < 0.05 && Math.abs(drag.pitch) < 0.05) { drag.yaw = 0; drag.pitch = 0; }
        more = true;
      } else if (!drag.on && (drag.yaw || drag.pitch)) more = true;
      swayYaw = sway ? Math.sin(time * 0.21) * sway : 0;
      swayPitch = sway ? Math.cos(time * 0.17) * sway * 0.45 : 0;
      placePivot();
      if (linesDirty) {
        writeLines();
        linesDirty = false;
      }
      writeGlow(time);
      stage.renderer.render(scene, camera);
      scene.updateMatrixWorld();
      labels.place(project);
      return more;
    }

    // World point (pivot space) -> CSS pixels.
    function project(p) {
      v3.set(p[0], p[1], p[2]).applyMatrix4(pivot.matrixWorld).project(camera);
      return [(v3.x * 0.5 + 0.5) * stage.width, (-v3.y * 0.5 + 0.5) * stage.height, v3.z < 1];
    }

    function pick(x, y) {
      let best = null;
      let bestD = Infinity;
      nodes.forEach((n) => {
        if (n.pickable === false || n.fade < 0.15) return;
        const [sx, sy] = project(n.cur);
        const d = Math.hypot(sx - x, sy - y);
        const reach = n.size / 2 + 6;
        if (d < reach && d < bestD) { best = n; bestD = d; }
      });
      return best;
    }

    const local = (e) => {
      const r = stage.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    let hoverId = null;
    function onMove(e) {
      if (drag.on) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.moved > 4) {
          drag.yaw = Math.max(-35, Math.min(35, drag.yaw + dx * 0.25));
          if (e.pointerType !== 'touch') drag.pitch = Math.max(-25, Math.min(25, drag.pitch + dy * 0.2));
          stage.invalidate();
          if (opts.onHover) opts.onHover(null);
          return;
        }
      }
      const [x, y] = local(e);
      const hit = pick(x, y);
      const id = hit ? hit.id : null;
      stage.canvas.style.cursor = hit ? 'pointer' : drag.on ? 'grabbing' : 'grab';
      if (opts.onHover) {
        if (id) {
          const [sx, sy] = project(hit.cur);
          opts.onHover(id, sx, sy - hit.size / 2);
        } else if (hoverId) opts.onHover(null);
      }
      hoverId = id;
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
      if (drag.moved <= 4) {
        const [x, y] = local(e);
        const hit = pick(x, y);
        if (opts.onSelect) opts.onSelect(hit ? hit.id : null);
      }
      stage.invalidate();
    }
    function onLeave() {
      if (hoverId && opts.onHover) opts.onHover(null);
      hoverId = null;
    }
    stage.canvas.addEventListener('pointermove', onMove);
    stage.canvas.addEventListener('pointerdown', onDown);
    stage.canvas.addEventListener('pointerup', onUp);
    stage.canvas.addEventListener('pointercancel', () => { drag.on = false; drag.release = performance.now(); });
    stage.canvas.addEventListener('pointerleave', onLeave);

    ready = true;
    return {
      apply,
      project,
      dispose() {
        stage.dispose();
        labels.dispose();
        glow.dispose();
        sphere.dispose();
        nodeMat.dispose();
        lineGeo.dispose();
        lineMat.dispose();
        if (mesh) mesh.dispose();
      },
    };
  }

  return {
    setGraph(next) {
      spec = next;
      if (view) view.apply(next, false);
    },
    // CSS-pixel position of a node, for tooltips driven from the keyboard.
    locate(id) {
      if (!view || !spec) return null;
      const n = spec.nodes.find((x) => x.id === id);
      return n ? view.project(n.p) : null;
    },
    get ready() { return !!view; },
    dispose() {
      disposed = true;
      cancelWait();
      if (view) view.dispose();
      view = null;
    },
  };
}
