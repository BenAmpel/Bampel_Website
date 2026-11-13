// Mounts the three.js "research constellation" into every [data-hero-field] band (home page, Research Explorer).
// The band shows a CSS poster first. The 3D bundle is fetched only after the page has loaded and the browser is idle,
// so it never competes with the page's own content; without WebGL the band is removed and nothing else changes.
(function () {
  const roots = Array.from(document.querySelectorAll("[data-hero-field]"));
  if (!roots.length) return;

  const PALETTE = ["#16a34a", "#0284c7", "#d97706", "#a855f7", "#e11d48", "#0d9488"];
  const isDark = () => document.body.classList.contains("dark");
  const themeNow = () => ({ dark: isDark(), palette: PALETTE, other: isDark() ? "#8b949e" : "#6e7781" });

  function webgl() {
    try {
      const c = document.createElement("canvas");
      const opts = { failIfMajorPerformanceCaveat: true };
      const gl = c.getContext("webgl2", opts) || c.getContext("webgl", opts);
      const lose = gl && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  // One load of the shared bundle per page, whoever asks first (the research dashboard waits on the same tag).
  function loadBundle(src) {
    if (window.Site3D) return Promise.resolve(window.Site3D);
    if (!window.__site3dLoad) {
      window.__site3dLoad = new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find((s) => s.src === src);
        const script = existing || document.createElement("script");
        script.addEventListener("load", () => resolve(window.Site3D), { once: true });
        script.addEventListener("error", reject, { once: true });
        if (!existing) {
          script.src = src;
          script.async = true;
          document.head.appendChild(script);
        }
      });
    }
    return window.__site3dLoad;
  }

  function whenIdle(cb) {
    const go = () => (window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 300));
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }

  function readConfig(root) {
    const el = root.querySelector("script[data-hero-config]");
    try {
      return el ? JSON.parse(el.textContent) : {};
    } catch (e) {
      return {};
    }
  }

  function mount(root) {
    const cfg = readConfig(root);
    const stageEl = root.querySelector("[data-hero-stage]");
    if (!stageEl || !cfg.bundle || !cfg.src) return;
    // Absolute, so it matches script.src when the research dashboard asks for the same bundle.
    const bundle = new URL(cfg.bundle, document.baseURI).href;
    if (!webgl()) {
      root.hidden = true;
      return;
    }
    Promise.all([loadBundle(bundle), fetch(cfg.src, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))])
      .then(([Site3D, pubs]) => {
        if (!Site3D || !Site3D.hero || !Site3D.supported()) {
          root.hidden = true;
          return;
        }
        const list = Array.isArray(pubs) ? pubs : pubs.publications || pubs.items || [];
        // Papers the Explorer lists under a thread keep that thread; the rest are sorted by keyword rules.
        const groups = cfg.groups || [];
        const assign = {};
        groups.forEach((g, i) => (g.papers || []).forEach((url) => (assign[url] = i)));
        const rules = (cfg.rules || []).map(([group, pattern]) => ({ group, re: new RegExp(pattern, "i") }));
        const data = Site3D.heroData.fromPublications(list, {
          rules,
          assign,
          defaultGroup: cfg.defaultGroup || 0,
          minShared: cfg.minShared || 2,
        });
        const ids = groups.map((g) => g.id);
        const follow = cfg.follow ? document.querySelector(cfg.follow) : null;
        const activeIndex = () => (follow && follow.dataset.activeTrack ? ids.indexOf(follow.dataset.activeTrack.replace(/^research-thread-/, "")) : -1);

        const view = Site3D.hero.create(stageEl, {
          data,
          groups: ids.length || undefined,
          theme: themeNow(),
          focus: activeIndex(),
          onReady: () => root.classList.add("is-live"),
          onLost: () => root.classList.remove("is-live"),
        });

        if (follow) {
          follow.addEventListener("research-explorer:track", () => view.focus(activeIndex()));
        }
        new MutationObserver(() => view.setTheme(themeNow())).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      })
      .catch(() => {
        root.hidden = true;
      });
  }

  whenIdle(() => roots.forEach(mount));
})();
