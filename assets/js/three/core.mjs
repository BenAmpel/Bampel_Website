// Shared, low-cost three.js plumbing for the site's 3D views (globe, impact map, collaboration network, projection fan,
// home hero). Every view gets a Stage that:
//   - renders only when something changed, or at most `fps` times a second while an animation runs (30 by default);
//   - stops completely while off screen, inside a closed <details>, or in a background tab;
//   - caps the pixel ratio at 1.5 and, if frames keep arriving late, drops to 1x and then flags `low` so views can thin
//     their effects. The motion stays; only the cost goes down.
import { WebGLRenderer, ShaderMaterial, AdditiveBlending, NormalBlending, BufferGeometry, BufferAttribute, Points, Color } from 'three';

// Checked once per page. failIfMajorPerformanceCaveat turns away software-only GL (a slideshow, not an animation),
// so those devices keep the 2D charts.
let support = null;
export function supported() {
  if (support !== null) return support;
  try {
    const c = document.createElement('canvas');
    const opts = { failIfMajorPerformanceCaveat: true };
    const gl = window.WebGLRenderingContext && (c.getContext('webgl2', opts) || c.getContext('webgl', opts));
    support = !!gl;
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch (e) {
    support = false;
  }
  return support;
}

// Sets a three.js Color from any CSS colour and returns its alpha: Color.set ignores the alpha of rgba() (with a
// warning), and the site's grid tokens are rgba, so the alpha is carried into the line or point opacity instead.
const RGBA = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i;
export function setColor(color, css) {
  const m = RGBA.exec(String(css).trim());
  if (!m) { color.set(css); return 1; }
  color.setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255, 'srgb');
  return +m[4];
}

export const blendOf = (additive) => (additive ? AdditiveBlending : NormalBlending);

// Throws if no context can be made; callers fall back to their 2D view. onLost runs if the GPU drops the context later.
export function createStage(container, { className = 't3-canvas', fps = 30, onFrame, onResize, onLost } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', stencil: false, failIfMajorPerformanceCaveat: true });
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const stage = { renderer, canvas, low: false, width: 0, height: 0, fps };
  let visible = false;
  let animating = false;
  let looping = false; // animating, or a tween asked for another frame: either way the fps cap applies
  let raf = 0;
  let last = 0;
  let late = 0;
  let disposed = false;

  function tick(now) {
    raf = 0;
    if (disposed || !visible || document.hidden || !stage.width) return;
    const minGap = 1000 / stage.fps;
    if (looping && last && now - last < minGap - 4) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const gap = last ? now - last : minGap;
    const dt = Math.min(0.1, gap / 1000);
    last = now;
    // Adaptive quality: a run of late frames while animating first lowers the pixel ratio, then thins effects.
    if (looping) {
      late = gap > minGap * 1.7 ? late + 1 : Math.max(0, late - 1);
      if (late > 24) {
        late = 0;
        if (dpr > 1) {
          dpr = 1;
          renderer.setPixelRatio(1);
          renderer.setSize(stage.width, stage.height, false);
          if (onResize) onResize(stage.width, stage.height);
        } else if (!stage.low) {
          stage.low = true;
          stage.fps = Math.min(stage.fps, 24);
        }
      }
    }
    const more = onFrame ? onFrame(dt, now / 1000) : false;
    looping = animating || !!more;
    if (looping) raf = requestAnimationFrame(tick);
    else last = 0;
  }
  function request() {
    if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  stage.invalidate = request;
  stage.setAnimating = (on) => {
    animating = !!on;
    if (animating) request();
  };
  stage.pixelHeight = () => stage.height * renderer.getPixelRatio();

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return; // collapsed <details>: keep the old size, nothing renders while hidden anyway
    stage.width = w;
    stage.height = h;
    renderer.setSize(w, h, false);
    if (onResize) onResize(w, h);
    request();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) { last = 0; request(); }
  }, { rootMargin: '80px 0px' });
  io.observe(container);
  const lost = (e) => { e.preventDefault(); disposed = true; if (onLost) onLost(); };
  canvas.addEventListener('webglcontextlost', lost);
  const onVis = () => { if (!document.hidden) { last = 0; request(); } };
  document.addEventListener('visibilitychange', onVis);
  resize();

  stage.dispose = () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    renderer.dispose();
    canvas.remove();
  };
  return stage;
}

// Soft round glow sprites in one draw call: per-point colour, size (world units) and alpha. No texture.
const glowVert = `
  attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
  uniform float uScale; varying vec3 vColor; varying float vAlpha;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z));
    vColor = aColor; vAlpha = aAlpha;
    gl_Position = projectionMatrix * mv;
  }`;
const glowFrag = `
  uniform float uCore; varying vec3 vColor; varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.0, d);
    a = a * a + uCore * smoothstep(0.32, 0.12, d);
    gl_FragColor = vec4(vColor, min(1.0, a) * vAlpha);
    #include <colorspace_fragment>
  }`;

export function glowPoints(max, { additive = true, core = 0.6 } = {}) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new BufferAttribute(col, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new BufferAttribute(alpha, 1));
  geo.setDrawRange(0, 0);
  const mat = new ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uCore: { value: core } },
    vertexShader: glowVert, fragmentShader: glowFrag,
    transparent: true, depthWrite: false, blending: blendOf(additive),
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  const tmp = new Color();
  return {
    points, max,
    set(i, x, y, z, color, s, a) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      a *= setColor(tmp, color);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      size[i] = s; alpha[i] = a;
    },
    setPos(i, x, y, z) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; },
    setAlpha(i, a) { alpha[i] = a; },
    commit(count) {
      geo.setDrawRange(0, count);
      for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[k].needsUpdate = true;
    },
    // uScale turns a world size into pixels: viewport height in device pixels / (2 tan(fov/2)).
    setScale(pixelHeight, fovDeg) { mat.uniforms.uScale.value = pixelHeight / (2 * Math.tan((fovDeg * Math.PI) / 360)); },
    setAdditive(on) { mat.blending = blendOf(on); mat.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// HTML labels pinned to 3D points. Reuses elements by key; only the few labels a view asks for exist at once.
export function labelLayer(container, className = 't3-labels') {
  const root = document.createElement('div');
  root.className = className;
  root.setAttribute('aria-hidden', 'true');
  container.appendChild(root);
  let items = new Map();
  return {
    root,
    set(list) {
      const next = new Map();
      list.forEach((item) => {
        let el = items.get(item.key);
        if (el) items.delete(item.key);
        else {
          el = document.createElement('span');
          root.appendChild(el);
        }
        if (el.textContent !== item.text) el.textContent = item.text;
        const cls = `t3-label ${item.cls || ''}`;
        if (el.className !== cls) el.className = cls;
        el._p = item.p;
        el._dy = item.dy || 0;
        el._dx = item.dx || 0;
        next.set(item.key, el);
      });
      items.forEach((el) => el.remove());
      items = next;
    },
    // project(p) -> [x, y, visible] in CSS pixels
    place(project) {
      items.forEach((el) => {
        const [x, y, ok] = project(el._p);
        // The stylesheet's --lx/--ly anchor the label (above, left, right of its point); _dy clears the mark's radius.
        el.style.transform = `translate(${(x + el._dx).toFixed(1)}px, ${(y + el._dy).toFixed(1)}px) translate(var(--lx, -50%), var(--ly, -50%))`;
        el.style.visibility = ok ? 'visible' : 'hidden';
      });
    },
    dispose() { root.remove(); items = new Map(); },
  };
}

export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Builds a view only once its box is on (or near) screen and has a size, so a page with several 3D views opens one
// GPU context at a time as the reader scrolls, and none for a view inside a closed <details>.
export function whenVisible(el, cb) {
  let seen = false;
  let done = false;
  const go = () => {
    if (done || !seen || !el.clientWidth || !el.clientHeight) return;
    done = true;
    io.disconnect();
    ro.disconnect();
    cb();
  };
  const io = new IntersectionObserver((entries) => { seen = entries[entries.length - 1].isIntersecting; go(); }, { rootMargin: '200px 0px' });
  const ro = new ResizeObserver(go);
  io.observe(el);
  ro.observe(el);
  return () => { done = true; io.disconnect(); ro.disconnect(); };
}

export function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
