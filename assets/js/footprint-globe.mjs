// Research Footprint globe (three.js). Bundled by scripts/build-three.mjs into static/vendor/three/<version>/footprint-globe.min.js
// and loaded only when the dashboard opens and WebGL is available; otherwise the dashboard keeps its Leaflet map.
//
// Pieces: a dot-matrix land layer (static/data/globe_land.json, Natural Earth 110m), one glowing marker per place sized by
// paper count, great-circle arcs lifted off the surface for each trip, and a soft rim glow. Drag to turn it; it spins
// slowly until touched. Reduced motion: no spin, no travelling pulses, focus jumps instead of gliding.
//
// API: window.FootprintGlobe.create(container, { land, theme, reducedMotion, onSelect, onHover })
//   -> { setData(points, routes), setTheme(theme), setSpin(on), focus(point), select(point), dispose() }
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, SphereGeometry, MeshBasicMaterial, ShaderMaterial,
  BackSide, AdditiveBlending, NormalBlending, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, CanvasTexture,
  Vector3, Line, LineBasicMaterial, RingGeometry, DoubleSide, Raycaster, Vector2, Color, Sprite, SpriteMaterial,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const R = 1;
const blendOf = (theme) => (theme.additive ? AdditiveBlending : NormalBlending);

function toVec(lat, lng, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 32, 0, Math.PI * 2);
  g.fill();
  return new CanvasTexture(c);
}

// Great circle from a to b, lifted by a sine bump whose height grows with the distance.
function arcPoints(a, b, segments = 64) {
  const va = toVec(a.lat, a.lng).normalize();
  const vb = toVec(b.lat, b.lng).normalize();
  const angle = va.angleTo(vb);
  const lift = 0.06 + 0.32 * (angle / Math.PI);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s = Math.sin(angle) || 1;
    const v = angle < 1e-4
      ? va.clone()
      : va.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).add(vb.clone().multiplyScalar(Math.sin(t * angle) / s));
    pts.push(v.normalize().multiplyScalar(R + 0.004 + lift * Math.sin(Math.PI * t)));
  }
  return pts;
}

function create(container, opts) {
  const reduced = !!opts.reducedMotion;
  let theme = opts.theme;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'rf-globe-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.copy(toVec(30, -40, 3.4));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false; // the page scrolls with the wheel; the globe never traps it
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.35;

  const world = new Group();
  scene.add(world);

  const globeMat = new MeshBasicMaterial({ color: theme.globe });
  world.add(new Mesh(new SphereGeometry(R, 64, 48), globeMat));

  // Rim glow: brighter where the surface turns away from the camera.
  const glowMat = new ShaderMaterial({
    uniforms: { glowColor: { value: new Color(theme.glow) }, strength: { value: theme.glowStrength } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 glowColor; uniform float strength; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(glowColor, f*strength); }`,
    side: BackSide, blending: blendOf(theme), transparent: true, depthWrite: false,
  });
  scene.add(new Mesh(new SphereGeometry(R * 1.18, 64, 48), glowMat));

  const tex = dotTexture();
  const landPos = [];
  (opts.land || []).forEach(([la, ln]) => {
    const v = toVec(la / 10, ln / 10, R * 1.002);
    landPos.push(v.x, v.y, v.z);
  });
  const landGeo = new BufferGeometry();
  landGeo.setAttribute('position', new Float32BufferAttribute(landPos, 3));
  const landMat = new PointsMaterial({ color: theme.land, size: 0.038, map: tex, transparent: true, alphaTest: 0.2, depthWrite: false });
  world.add(new Points(landGeo, landMat));

  const markers = new Group();
  const arcs = new Group();
  world.add(arcs, markers);
  let placeMeshes = [];
  let pulses = [];
  let rings = [];
  let selected = null;
  let selectRing = null;

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
  }

  function setData(points, routes) {
    clearGroup(markers);
    clearGroup(arcs);
    placeMeshes = [];
    pulses = [];
    rings = [];
    selectRing = null;
    points.forEach((p) => {
      const color = theme.cat[p.cat] || theme.cat.Collaboration;
      const size = 0.014 + Math.min(0.018, 0.006 * Math.sqrt(p.weight || 1));
      const pos = toVec(p.lat, p.lng, R * 1.006);
      const core = new Mesh(new SphereGeometry(size, 16, 12), new MeshBasicMaterial({ color }));
      core.position.copy(pos);
      core.userData.point = p;
      markers.add(core);
      placeMeshes.push(core);
      const halo = new Sprite(new SpriteMaterial({ map: tex, color, transparent: true, opacity: theme.halo, depthWrite: false, blending: blendOf(theme) }));
      halo.position.copy(pos);
      halo.scale.setScalar(size * 5);
      markers.add(halo);
      const ring = new Mesh(new RingGeometry(size * 1.6, size * 2.1, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false }));
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      ring.userData.base = size;
      ring.userData.phase = Math.random();
      markers.add(ring);
      rings.push(ring);
      if (selected && selected.title === p.title) markSelected(core);
    });
    routes.forEach((r) => {
      const pts = arcPoints(r.from, r.to);
      const geo = new BufferGeometry().setFromPoints(pts);
      arcs.add(new Line(geo, new LineBasicMaterial({ color: theme.arc, transparent: true, opacity: theme.arcOpacity })));
      if (!reduced) {
        const dot = new Sprite(new SpriteMaterial({ map: tex, color: theme.pulse, transparent: true, depthWrite: false, blending: blendOf(theme) }));
        dot.scale.setScalar(0.05);
        dot.userData = { pts, t: Math.random() };
        arcs.add(dot);
        pulses.push(dot);
      }
    });
  }

  function markSelected(mesh) {
    if (selectRing) {
      markers.remove(selectRing);
      selectRing.geometry.dispose();
      selectRing.material.dispose();
      selectRing = null;
    }
    if (!mesh) return;
    const s = mesh.geometry.parameters.radius;
    selectRing = new Mesh(new RingGeometry(s * 2.6, s * 3.2, 48), new MeshBasicMaterial({ color: theme.select, side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    selectRing.position.copy(mesh.position);
    selectRing.lookAt(mesh.position.clone().multiplyScalar(2));
    markers.add(selectRing);
  }

  // Turn the camera to face a place: slerp around the globe at a fixed distance.
  let glide = null;
  function focus(point) {
    const dist = camera.position.length();
    const to = toVec(point.lat + 8, point.lng, dist);
    controls.autoRotate = false;
    if (reduced) {
      camera.position.copy(to);
      camera.lookAt(0, 0, 0);
      return;
    }
    glide = { from: camera.position.clone().normalize(), to: to.clone().normalize(), dist, t: 0 };
  }

  function select(point) {
    selected = point;
    const mesh = point && placeMeshes.find((m) => m.userData.point.title === point.title);
    markSelected(mesh || null);
    if (point) focus(point);
  }

  function setTheme(next) {
    theme = next;
    globeMat.color.set(theme.globe);
    landMat.color.set(theme.land);
    glowMat.uniforms.glowColor.value.set(theme.glow);
    glowMat.uniforms.strength.value = theme.glowStrength;
    glowMat.blending = blendOf(theme);
    glowMat.needsUpdate = true;
  }

  // Picking: hover shows the cursor and a label, a click selects.
  const ray = new Raycaster();
  const ndc = new Vector2();
  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.params.Points = { threshold: 0 };
    const hits = ray.intersectObjects(placeMeshes, false);
    if (!hits.length) return null;
    // Ignore markers on the far side of the globe.
    const p = hits[0].object.position.clone().applyMatrix4(world.matrixWorld);
    return p.dot(camera.position) > 0 ? hits[0].object.userData.point : null;
  }
  let downAt = null;
  const onMove = (ev) => {
    const p = pick(ev);
    renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    if (opts.onHover) opts.onHover(p, ev);
  };
  const onDown = (ev) => { downAt = [ev.clientX, ev.clientY]; controls.autoRotate = false; };
  const onUp = (ev) => {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
    downAt = null;
    if (moved > 5) return;
    const p = pick(ev);
    if (p && opts.onSelect) opts.onSelect(p);
  };
  const onLeave = () => opts.onHover && opts.onHover(null);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole globe in view on narrow screens.
    camera.position.setLength(w / h < 0.9 ? 5.4 : 4.3);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // Render only while the globe is on screen and the tab is visible.
  let visible = true;
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) loop(); });
  io.observe(container);
  let raf = 0;
  let last = performance.now();
  function loop() {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (glide) {
      glide.t = Math.min(1, glide.t + dt / 0.9);
      const e = 1 - Math.pow(1 - glide.t, 3);
      const v = glide.from.clone().lerp(glide.to, e).normalize().multiplyScalar(glide.dist);
      camera.position.copy(v);
      if (glide.t >= 1) glide = null;
    }
    if (!reduced) {
      rings.forEach((r) => {
        r.userData.phase = (r.userData.phase + dt * 0.5) % 1;
        const k = 1 + r.userData.phase * 1.6;
        r.scale.setScalar(k);
        r.material.opacity = 0.55 * (1 - r.userData.phase);
      });
      pulses.forEach((d) => {
        d.userData.t = (d.userData.t + dt * 0.28) % 1;
        const pts = d.userData.pts;
        const f = d.userData.t * (pts.length - 1);
        const i = Math.floor(f);
        d.position.copy(pts[i]).lerp(pts[Math.min(i + 1, pts.length - 1)], f - i);
        d.material.opacity = Math.sin(Math.PI * d.userData.t);
      });
    }
    controls.update();
    renderer.render(scene, camera);
  }
  const onVis = () => { if (!document.hidden) { last = performance.now(); loop(); } };
  document.addEventListener('visibilitychange', onVis);
  loop();

  return {
    setData,
    setTheme,
    focus,
    select,
    setSpin(on) { controls.autoRotate = !!on && !reduced; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls.dispose();
      clearGroup(markers);
      clearGroup(arcs);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function supported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

window.FootprintGlobe = { create, supported };
