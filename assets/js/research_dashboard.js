(() => {
  const IDS = {
    WRAPPER: "dashboard-wrapper",
    LINE: "dashboard-timeline",
    MAP: "dashboard-impact-map",
    COLLAB: "dashboard-collab-network",
    FOOTPRINT: "dashboard-footprint-map",
    FOCUS: "dash-metric-focus",
    TREND: "dash-metric-trend",
    CITES: "dash-metric-cites",
    HINDEX: "dash-metric-hindex",
    FOOTPRINT_YEAR: "footprint-year-range",
    FOOTPRINT_YEAR_LABEL: "footprint-year-label",
  };

  const wrapper = document.getElementById(IDS.WRAPPER);
  if (!wrapper) return;

  const normalizeBaseUrl = (url) => {
    if (!url || url === "/") return "";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  };

  const baseUrl = normalizeBaseUrl(wrapper.getAttribute("data-baseurl"));
  const buildUrl = (path) => {
    const clean = String(path || "").replace(/^\/+/, "");
    return baseUrl ? `${baseUrl}/${clean}` : `/${clean}`;
  };

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const withReducedMotion = (option) => {
    if (!prefersReducedMotion) return option;
    return Object.assign({}, option, {
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
    });
  };

  const dashboardState = {
    initialized: false,
    payload: null,
    charts: {
      line: null,
      impact: null,
      collab: null,
    },
    maps: {
      footprint: null,
      footprintObserver: null,
    },
    globe: null,
    impact: {
      view: "timeline",
      colorMode: "topic",
      linkTypes: { topic: true, venue: true, author: true },
      focusId: null,
      hiddenTopics: new Set(),
      api: null,
    },
    collab: {
      range: "all",
      focusId: null,
      api: null,
    },
    centrality: {
      metric: "eigen",
      hoveredIndex: null,
    },
    footprint: {
      categories: { Conference: true, Collaboration: true, Institution: true },
      layers: { routes: true, clusters: true, spin: true },
      year: null,
      markerLayer: null,
      clusterLayer: null,
      arcLayer: null,
      lightTiles: null,
      darkTiles: null,
    },
  };

  // Fixed topic order and hues (validated for color-vision deficiency and 3:1 contrast on both the dark #0d1117 and
  // light #ffffff surfaces). "Other" has no hue: it takes the theme's neutral gray at render time.
  const topicPalette = ["#16a34a", "#0284c7", "#d97706", "#a855f7", "#e11d48", "#0d9488"];
  const topicColors = {};
  [
    "AI / Deep Learning",
    "Cybersecurity",
    "LLMs & NLP",
    "Hacker Communities",
    "Design Science",
    "Behavioral",
    "Other",
  ].forEach((topic, index) => {
    topicColors[topic] = topicPalette[index] || "#8b949e";
  });

  const safeFetch = (url) =>
    fetch(url, { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

  function loadStyleOnce(href) {
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) => link.href === href);
    if (exists) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Failed to load ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadScriptOnce(src, testFn) {
    if (testFn && testFn()) return Promise.resolve();
    // Another script (the hero) may have added the same tag and still be loading it: wait for that load, not a no-op.
    const abs = new URL(src, document.baseURI).href;
    const existing = Array.from(document.scripts).find((script) => script.src === abs);
    if (existing) {
      if (!testFn) return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  // The site's 3D bundle (window.Site3D: globe, graph, fan). Resolves to null when WebGL is missing, too slow (software
  // rendering) or the bundle fails, and the caller keeps its ECharts chart. Loaded once, only when a map is drawn.
  let site3dPromise = null;
  let site3dReady = null;
  function load3D() {
    if (!supportsWebGL()) return Promise.resolve(null);
    if (!site3dPromise) {
      site3dPromise = loadScriptOnce(buildUrl("vendor/three/0.170.0/site-3d.min.js"), () => window.Site3D)
        .then(() => (window.Site3D && window.Site3D.supported() ? window.Site3D : null))
        .catch(() => null)
        .then((Site3D) => (site3dReady = Site3D));
    }
    return site3dPromise;
  }

  // Places a 3D view's tooltip above its point (below it near the top edge), kept inside the box.
  function placeTip(tip, dom, html, x, y) {
    if (!html) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(6, Math.min(x - w / 2, dom.clientWidth - w - 6));
    const top = y - h - 10 < 6 ? y + 26 : y - h - 10;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  // A 3D graph in `dom` with a hover tooltip. Returns { view, shim } where shim stands in for an ECharts instance in
  // dashboardState.charts (resize and dispose), or null if the view could not be made.
  function mountGraph3D(dom, Site3D, { tipHtml, onSelect, onFail }) {
    const tip = document.createElement("div");
    tip.className = "t3-tip";
    tip.hidden = true;
    let view = null;
    try {
      view = Site3D.graph.create(dom, {
        reducedMotion: prefersReducedMotion,
        onSelect,
        onFail,
        onHover: (id, x, y) => placeTip(tip, dom, id ? tipHtml(id) : "", x, y),
      });
    } catch (err) {
      return null;
    }
    dom.classList.add("is-3d");
    dom.appendChild(tip);
    return {
      view,
      shim: {
        resize() {},
        dispose() {
          view.dispose();
          tip.remove();
          dom.classList.remove("is-3d");
        },
      },
    };
  }

  // ECharts loads with the dashboard. The Footprint loads its own renderer: the three.js globe when WebGL works, otherwise
  // Leaflet (loadLeafletAssets), so most visitors never download Leaflet.
  function loadDashboardAssets() {
    if (window.__dashboardAssetsPromise) return window.__dashboardAssetsPromise;
    window.__dashboardAssetsPromise = loadScriptOnce(
      buildUrl("vendor/echarts/6.1.0/echarts.custom.min.js"), // trimmed build: scripts/build-echarts.mjs
      () => window.echarts
    );
    return window.__dashboardAssetsPromise;
  }

  function loadLeafletAssets() {
    if (window.__leafletAssetsPromise) return window.__leafletAssetsPromise;
    window.__leafletAssetsPromise = Promise.all([
      loadStyleOnce(buildUrl("vendor/leaflet/leaflet.css")),
      loadStyleOnce(buildUrl("vendor/leaflet-markercluster/MarkerCluster.css")),
      loadStyleOnce(buildUrl("vendor/leaflet-markercluster/MarkerCluster.Default.css")),
    ])
      .then(() => loadScriptOnce(buildUrl("vendor/leaflet/leaflet.js"), () => window.L))
      .then(() =>
        loadScriptOnce(
          buildUrl("vendor/leaflet-markercluster/leaflet.markercluster.js"),
          () => window.L && window.L.markerClusterGroup
        )
      );
    return window.__leafletAssetsPromise;
  }

  function updateText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function buildCitationButtons(meta) {
    if (!window.buildCitationFormats) return "";
    const citations = window.buildCitationFormats({
      title: meta.name,
      authors: meta.authors,
      year: meta.year,
      venue: meta.venue,
      type: meta.type,
    });
    return [
      { label: "APA", text: citations.apa },
      { label: "Chicago", text: citations.chicago },
      { label: "BibTeX", text: citations.bibtex },
    ]
      .filter((item) => item.text)
      .map((item) => {
        const encoded = encodeURIComponent(item.text);
        return `<button class="cite-tooltip-btn" type="button" data-copy-text="${encoded}" data-copy-label="${item.label}">Copy ${item.label}</button>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMetricSummary(payload) {
    updateText(IDS.FOCUS, payload.metrics.primaryFocus || "Cybersecurity");
    updateText(IDS.TREND, payload.metrics.emergingFocus || "AI / Deep Learning");
    updateText(IDS.CITES, String((payload.scholar.metrics && payload.scholar.metrics.citations) || 0));
    updateText(IDS.HINDEX, String((payload.scholar.metrics && payload.scholar.metrics.hIndex) || 0));
  }

  // Screen-reader descriptions for the two network charts (ECharts writes them to the chart's aria-label): what the
  // graph holds and its largest groups, from the same data the chart draws.
  function describeImpact(nodes, links) {
    const topics = new Map();
    nodes.forEach((n) => topics.set(n.topic || "Other", (topics.get(n.topic || "Other") || 0) + 1));
    const top = [...topics].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t} (${c})`).join(", ");
    return `Impact map of ${nodes.length} publications with ${links.length} connections by shared topic, venue or co-author. Most common topics: ${top}.`;
  }

  function describeCollab(nodes, self) {
    const others = nodes.filter((n) => n.id !== self).sort((a, b) => (b.value || 0) - (a.value || 0));
    const top = others.slice(0, 3).map((n) => `${n.name || n.id} (${n.value} papers)`).join(", ");
    return `Co-authorship network with ${others.length} co-authors. Most frequent: ${top}.`;
  }

  // Citations per year: one series in the site accent, text in text tokens, the current year drawn lighter and labelled
  // "so far" because it is still counting. The tooltip adds the change on the year before.
  // When static/data/citation_projection.json is present (scripts/citation_projection.py), the next years are drawn as
  // a peer-based projection: a dashed median line from this year's full-year estimate and a hollow 50% range. They are
  // never solid bars, so they cannot be read as data. The 80% range lives in the tooltip and the note.
  function projectionFor(history, proj) {
    if (!proj || !Array.isArray(proj.years) || !proj.anchor || !history.length) return null;
    const last = history[history.length - 1];
    if (String(last.year) !== String(proj.anchor.year)) return null;
    // A newer Scholar count than the one the projection was built on scales the estimate, never below the count.
    const scale = proj.anchor.soFar ? last.citations / proj.anchor.soFar : 1;
    const base = Math.max(last.citations, Math.round(proj.anchor.fullYear * scale));
    const years = proj.years
      .filter((y) => Number(y.year) > Number(last.year))
      .map((y) => ({
        year: String(y.year),
        mid: Math.round(base * y.mid),
        innerLow: Math.round(base * y.innerLow),
        innerHigh: Math.round(base * y.innerHigh),
        low: Math.round(base * y.low),
        high: Math.round(base * y.high),
      }));
    return years.length ? { base, years, meta: proj } : null;
  }

  function renderLine(history, projection) {
    const dom = document.getElementById(IDS.LINE);
    if (!dom || !history || !history.length) return;
    dashboardState.lineHistory = history;
    if (projection !== undefined) dashboardState.lineProjection = projection;
    const proj = projectionFor(history, dashboardState.lineProjection);
    if (dashboardState.charts.line) dashboardState.charts.line.dispose();
    dashboardState.charts.line = null;
    const token = (dashboardState.lineToken = (dashboardState.lineToken || 0) + 1);
    const t = mapTheme();
    const thisYear = String(new Date().getFullYear());
    const partial = (year) => String(year) === thisYear;
    const n = history.length;
    const years = history.map((item) => item.year).concat(proj ? proj.years.map((y) => y.year) : []);
    const pad = (arr) => arr.concat(proj ? proj.years.map(() => null) : []);
    const note = document.getElementById("dashboard-timeline-note");
    const held = proj ? Object.values(proj.meta.backtest.outer || {}) : [];
    const heldIn10 = held.length ? Math.round((held.reduce((a, b) => a + b, 0) / held.length) * 10) : 8;
    const setNote = (fan) => {
      if (!note) return;
      const parts = [];
      if (history.some((item) => partial(item.year))) parts.push(`${thisYear} is the year so far.`);
      if (proj && fan) {
        const m = proj.meta;
        parts.push(`Starred years are a projection from the ${m.cohort.neighbours} most similar of ${m.cohort.eligible} researchers in security, IS and AI, matched on citations by years since first publication. Each faint line is one of them, scaled to meet this year; the bands hold their middle half and 80% of them, a range that held for peers about ${heldIn10} times in 10. Drag to tilt the lines apart.`);
      } else if (proj) {
        const m = proj.meta;
        parts.push(`Dashed years are a projection from the ${m.cohort.neighbours} most similar of ${m.cohort.eligible} researchers in security, IS and AI, matched on citations by years since first publication. The shaded box is their middle half; the 80% range, in the tooltip, held for peers about ${heldIn10} times in 10.`);
      } else {
        parts.push("Hover a bar for the change on the year before.");
      }
      note.textContent = parts.join(" ");
    };
    // Tooltip text for column i, shared by the ECharts chart and the 3D fan.
    const tipFor = (i) => {
      if (i >= n && proj) {
        const y = proj.years[i - n];
        return `<div style="font-weight:700">${escapeHtml(y.year)} (projected)</div><div>Median ${y.mid} citations</div>` +
          `<div style="color:${t.muted}">Middle half ${y.innerLow} to ${y.innerHigh}</div>` +
          `<div style="color:${t.muted}">80% range ${y.low} to ${y.high}</div>`;
      }
      const cur = history[i].citations;
      const prev = i > 0 ? history[i - 1].citations : null;
      let change = "";
      if (prev) {
        const pct = Math.round(((cur - prev) / prev) * 100);
        change = `<div style="color:${t.muted}">${pct >= 0 ? "+" : ""}${pct}% on ${history[i - 1].year}</div>`;
      }
      const est = proj && i === n - 1 && proj.base > cur ? `<div style="color:${t.muted}">About ${proj.base} expected for the full year</div>` : "";
      const label = partial(history[i].year) ? `${history[i].year} (so far)` : history[i].year;
      return `<div style="font-weight:700">${escapeHtml(label)}</div><div>${cur} citations</div>${change}${est}`;
    };
    // The description carries the numbers, since a screen reader cannot see the bars.
    const description = `Citations by year: ${history.map((item) => `${item.year}, ${item.citations}${partial(item.year) ? " so far" : ""}`).join("; ")}.` +
      (proj ? ` Projected from peer researchers: ${proj.years.map((y) => `${y.year}, median ${y.mid}, 80% range ${y.low} to ${y.high}`).join("; ")}.` : "");

    const useECharts = () => {
      setNote(false);
      const chart = window.echarts.init(dom, 'v5');
      dashboardState.charts.line = chart;
      const accentSoft = t.dark ? "rgba(74,222,128,0.16)" : "rgba(21,128,61,0.12)";
      const series = [
        {
          name: "Citations",
          type: "bar",
          barMaxWidth: 36,
          barGap: "-100%",
          data: pad(history.map((item) => ({
            value: item.citations,
            itemStyle: { color: t.accent, opacity: partial(item.year) ? 0.45 : 1, borderRadius: [4, 4, 0, 0] },
          }))),
          label: {
            show: true,
            position: "top",
            color: t.body,
            fontSize: 11,
            fontFamily: "Fira Code, monospace",
            formatter: (p) => (p.dataIndex === n - 1 || p.dataIndex === 0 ? String(p.value) : ""),
          },
          emphasis: { itemStyle: { opacity: 1 } },
        },
      ];
      if (proj) {
        const lead = history.map(() => null);
        series.push(
          { name: "rangeBase", type: "bar", stack: "proj", barMaxWidth: 36, barGap: "-100%", silent: true,
            itemStyle: { color: "transparent" }, data: lead.concat(proj.years.map((y) => y.innerLow)) },
          { name: "Projected middle half", type: "bar", stack: "proj", barMaxWidth: 36, barGap: "-100%",
            itemStyle: { color: accentSoft, borderColor: t.accent, borderWidth: 1, borderType: "dashed", borderRadius: 4 },
            data: lead.concat(proj.years.map((y) => y.innerHigh - y.innerLow)) },
          { name: "Projected median", type: "line", z: 5,
            lineStyle: { color: t.accent, width: 2, type: "dashed" },
            itemStyle: { color: t.surface, borderColor: t.accent, borderWidth: 2 },
            symbol: "circle", symbolSize: 8,
            // Starts at this year's full-year estimate so the line joins the real bars.
            data: history.map((item, i) => (i === n - 1 ? proj.base : null)).concat(proj.years.map((y) => y.mid)),
            label: { show: true, position: "top", distance: 8, color: t.muted, fontSize: 11, fontFamily: "Fira Code, monospace",
              formatter: (p) => (p.dataIndex === years.length - 1 ? `~${p.value}` : "") } }
        );
      }
      chart.setOption(
        withReducedMotion({
          tooltip: Object.assign(mapTooltip(t), {
            trigger: "axis",
            axisPointer: { type: "shadow", shadowStyle: { color: t.dark ? "rgba(139,148,158,0.12)" : "rgba(89,99,110,0.08)" } },
            formatter: (params) => tipFor(params[0].dataIndex),
          }),
          aria: { enabled: true, description },
          grid: { top: 22, right: 8, bottom: 4, left: 4, containLabel: true },
          xAxis: {
            type: "category",
            data: years,
            axisLine: { lineStyle: { color: t.grid } },
            axisTick: { show: false },
            axisLabel: { color: t.muted, fontSize: 11, fontFamily: "Fira Code, monospace",
              formatter: (v, i) => (i >= n ? `${v}*` : v) },
          },
          yAxis: {
            type: "value",
            splitNumber: 3,
            splitLine: { lineStyle: { color: t.grid } },
            axisLabel: { color: t.muted, fontSize: 11, fontFamily: "Fira Code, monospace" },
          },
          series,
        })
      );
    };

    // The peer paths fan: the same numbers, plus each matched peer's own path. Needs the projection and WebGL.
    const use3D = (Site3D) => {
      if (!Site3D.fan) return false;
      const peers = proj.meta.peerPaths;
      const fromIndex = peers && Array.isArray(peers.paths) && peers.paths.length
        ? history.findIndex((item) => String(item.year) === String(peers.fromYear)) : -1;
      const tip = document.createElement("div");
      tip.className = "t3-tip";
      tip.hidden = true;
      let view = null;
      const fallback = () => {
        if (token !== dashboardState.lineToken) return;
        if (dashboardState.charts.line) dashboardState.charts.line.dispose();
        useECharts();
      };
      try {
        view = Site3D.fan.create(dom, {
          reducedMotion: prefersReducedMotion,
          onFail: fallback,
          onHover: (i, x, y) => {
            if (i == null) {
              tip.hidden = true;
              return;
            }
            placeTip(tip, dom, tipFor(i), x, y);
          },
        });
      } catch (err) {
        return false;
      }
      dom.classList.add("is-3d");
      dom.appendChild(tip);
      dom.setAttribute("aria-label", description);
      view.setData({
        years,
        actual: history.map((item) => ({ value: item.citations, partial: partial(item.year) })),
        base: proj.base,
        proj: proj.years,
        peers: fromIndex >= 0 ? { fromIndex, paths: peers.paths } : null,
        theme: { dark: t.dark, accent: t.accent, peer: t.other, muted: t.muted, grid: t.grid, focus: t.focus },
      });
      setNote(true);
      dashboardState.charts.line = {
        resize() {},
        dispose() {
          view.dispose();
          tip.remove();
          dom.classList.remove("is-3d");
          dom.setAttribute("aria-label", "Citations per year");
        },
      };
      return true;
    };

    if (!proj) {
      useECharts();
      return;
    }
    // Theme changes redraw at once with the bundle already loaded; the first draw shows ECharts until it arrives.
    if (site3dReady) {
      if (!use3D(site3dReady)) useECharts();
      return;
    }
    useECharts();
    load3D().then((Site3D) => {
      if (!Site3D || token !== dashboardState.lineToken) return;
      dashboardState.charts.line.dispose();
      if (!use3D(Site3D)) useECharts();
    });
  }

  // ---- Shared theme for the two network maps ---------------------------------------------------------------------
  // Text wears text tokens; series colors appear only on marks. Light and dark each get their own values (the topic
  // palette passes the CVD and 3:1 checks on both #0d1117 and #ffffff, so it is shared).
  function mapTheme() {
    const dark = document.body.classList.contains("dark");
    return dark
      ? {
          dark, text: "#e6edf3", body: "#c9d1d9", muted: "#8b949e", grid: "rgba(139,148,158,0.22)",
          ring: "rgba(139,148,158,0.45)", surface: "#0d1117", other: "#8b949e", focus: "#00e5ff",
          accent: "#4ade80", tipBg: "#161b22", tipBorder: "#30363d", self: "#e6edf3",
          recency: ["#4ade80", "#16a34a", "#6e7681"],
        }
      : {
          dark, text: "#1f2328", body: "#3d444d", muted: "#59636e", grid: "rgba(89,99,110,0.2)",
          ring: "rgba(89,99,110,0.45)", surface: "#ffffff", other: "#6e7681", focus: "#0077b6",
          accent: "#15803d", tipBg: "#ffffff", tipBorder: "#d1d9e0", self: "#1f2328",
          recency: ["#166534", "#22a355", "#8c959f"],
        };
  }

  function mapTooltip(t) {
    return {
      trigger: "item",
      confine: true,
      backgroundColor: t.tipBg,
      borderColor: t.tipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.text, fontSize: 12, fontFamily: "Lato, sans-serif" },
      extraCssText: "border-radius:8px; max-width:300px; white-space:normal; box-shadow:0 6px 20px rgba(0,0,0,0.25);",
    };
  }

  const truncate = (text, max) => {
    const value = String(text || "");
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
  };

  const SELF_RE = /^Benjamin (M\. )?Ampel$/;
  const TOPIC_SHORT = {
    "AI / Deep Learning": "AI / DL",
    Cybersecurity: "Security",
    "LLMs & NLP": "LLMs",
    "Hacker Communities": "Hackers",
    "Design Science": "Design sci.",
    Behavioral: "Behavioral",
    Other: "Other",
  };
  const TYPE_ORDER = ["journal", "conference", "workshop"];
  const TYPE_COLORS = { journal: "#0284c7", conference: "#16a34a", workshop: "#d97706" };
  const TYPE_LABELS = { journal: "Journal", conference: "Conference", workshop: "Workshop" };

  // ---- Impact Map ------------------------------------------------------------------------------------------------
  // Two deterministic views of the same papers, so the map always fits its box (the old force layout scattered
  // nodes outside the visible area and the map often looked empty):
  //   Timeline: x = year, row = topic, size = citations. Links appear for the selected paper only.
  //   Network:  papers on a circle grouped by topic, every shared-topic / venue / co-author link drawn faintly.
  function renderImpactMap(graphData) {
    const dom = document.getElementById(IDS.MAP);
    if (!dom || !graphData || !Array.isArray(graphData.nodes) || !graphData.nodes.length) return;
    if (dashboardState.charts.impact) dashboardState.charts.impact.dispose();
    dashboardState.charts.impact = null;
    // Drawn in 3D when the bundle loads and WebGL works (see load3D); otherwise ECharts. Both read the same state.
    let chart = null;
    let g3 = null;

    const state = dashboardState.impact;
    const renderToken = {};
    state.renderToken = renderToken;
    const section = dom.closest(".rd-impact") || dom.parentElement;
    const panel = document.getElementById("impact-map-inspector");
    const legendEl = document.getElementById("impact-map-legend");
    const searchEl = document.getElementById("impact-search");
    const searchStatus = document.getElementById("impact-search-status");
    const datalist = document.getElementById("impact-paper-list");

    const topicList = Object.keys(topicColors);
    const papers = graphData.nodes.map((node) => ({
      id: String(node.id),
      name: node.name || "Untitled",
      value: Number(node.value) || 0,
      year: Number(node.year) || null,
      venue: node.venue || "",
      type: String(node.type || "").toLowerCase(),
      authors: Array.isArray(node.authors) ? node.authors : [],
      topic: topicList.includes(node.topic) ? node.topic : "Other",
    }));
    const byId = new Map(papers.map((paper) => [paper.id, paper]));
    const allLinks = (graphData.links || [])
      .map((link) => ({
        source: String(link.source),
        target: String(link.target),
        value: Number(link.value) || 1,
        reason: link.reason || "",
        types: link.types || {},
      }))
      .filter((link) => byId.has(link.source) && byId.has(link.target));

    const maxCites = Math.max(1, ...papers.map((paper) => paper.value));
    const sizeFor = (paper) => Math.round(9 + 25 * Math.sqrt(paper.value / maxCites));
    const topicCount = (topic) => papers.filter((paper) => paper.topic === topic).length;
    const rows = topicList.filter((topic) => topic !== "Other" && topicCount(topic) > 0).sort((a, b) => topicCount(b) - topicCount(a));
    if (topicCount("Other") > 0) rows.push("Other");
    const yearsPresent = papers.map((paper) => paper.year).filter(Boolean);
    const minYear = Math.min(...yearsPresent);
    const maxYear = Math.max(...yearsPresent);

    // Timeline positions: papers sharing a year and topic sit on a small grid inside their cell, most cited first.
    const timelinePos = new Map();
    const cells = new Map();
    papers.forEach((paper) => {
      const key = `${paper.year || minYear}|${paper.topic}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(paper);
    });
    cells.forEach((list) => {
      list.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
      const count = list.length;
      const cols = Math.min(count, Math.ceil(Math.sqrt(count * 2)));
      const rowCount = Math.ceil(count / cols);
      list.forEach((paper, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const dx = cols > 1 ? (col - (cols - 1) / 2) * (0.74 / cols) : 0;
        const dy = rowCount > 1 ? (row - (rowCount - 1) / 2) * (0.6 / rowCount) : 0;
        timelinePos.set(paper.id, [(paper.year || minYear) + dx, rows.indexOf(paper.topic) + dy]);
      });
    });

    // Network order: grouped by topic, then by year, so each topic forms an arc of the circle.
    const circleOrder = papers.slice().sort((a, b) => rows.indexOf(a.topic) - rows.indexOf(b.topic) || (a.year || 0) - (b.year || 0));

    const colorFor = (paper, t) => {
      if (state.colorMode === "type") return TYPE_COLORS[paper.type] || t.other;
      return paper.topic === "Other" ? t.other : topicColors[paper.topic];
    };
    const activeLinks = () =>
      allLinks.filter((link) => Object.keys(state.linkTypes).some((type) => state.linkTypes[type] && link.types[type]));
    const linksOf = (id) =>
      activeLinks()
        .filter((link) => link.source === id || link.target === id)
        .map((link) => ({ link, other: byId.get(link.source === id ? link.target : link.source) }))
        .sort((a, b) => b.link.value - a.link.value || b.other.value - a.other.value);

    function paperTip(id) {
      const paper = byId.get(id);
      if (!paper) return "";
      const typeLabel = TYPE_LABELS[paper.type] || paper.type;
      return `<strong>${escapeHtml(paper.name)}</strong><br>${escapeHtml(paper.venue)} · ${paper.year || "—"} · ${escapeHtml(typeLabel)}<br>${paper.value} citations · ${escapeHtml(paper.topic)}`;
    }

    // The 3D scene, laid out in CSS pixels around the box centre (1 world unit = 1 px at rest), so it lines up with
    // the 2D chart it replaces. Depth carries no data: guides and axis labels sit a little behind the papers, and
    // links bow toward the viewer, which only shows when the reader drags the map to tilt it.
    function buildSpec() {
      const t = mapTheme();
      const W = dom.clientWidth || 640;
      const H = dom.clientHeight || 440;
      const narrow = W < 560;
      const isTimeline = state.view === "timeline";
      const focus = state.focusId && byId.has(state.focusId) ? state.focusId : null;
      const links = activeLinks();
      const neighbors = new Set();
      if (focus) {
        links.forEach((link) => {
          if (link.source === focus) neighbors.add(link.target);
          if (link.target === focus) neighbors.add(link.source);
        });
      }
      const hidden = (paper) => state.hiddenTopics.has(paper.topic);
      const focusColor = focus ? colorFor(byId.get(focus), t) : t.accent;
      const at = (x, y, z) => [x - W / 2, H / 2 - y, z || 0];
      const back = -36;
      const guides = [];
      const labels = [];
      const pos = new Map();

      if (isTimeline) {
        const left = narrow ? 84 : 156;
        const right = 18;
        const top = 16;
        const bottom = 30;
        const plotW = W - left - right;
        const plotH = H - top - bottom;
        const span = maxYear - minYear + 1;
        const X = (year) => left + ((year - (minYear - 0.5)) / span) * plotW;
        const Y = (row) => top + ((row + 0.5) / rows.length) * plotH;
        papers.forEach((paper) => {
          const [year, row] = timelinePos.get(paper.id);
          pos.set(paper.id, at(X(year), Y(row)));
        });
        for (let row = 0; row < rows.length - 1; row += 1) {
          guides.push({ points: [at(left, Y(row + 0.5), back), at(W - right, Y(row + 0.5), back)], color: t.grid, alpha: 1 });
        }
        guides.push({ points: [at(left, top + plotH, back), at(W - right, top + plotH, back)], color: t.grid, alpha: 1 });
        for (let year = minYear; year < maxYear; year += 1) {
          const x = X(year + 0.5);
          const pts = [];
          for (let k = 0; k <= 40; k += 1) pts.push(at(x, top + (plotH * k) / 40, back));
          guides.push({ points: pts, color: t.grid, alpha: 0.8, dashed: true });
        }
        rows.forEach((topic, row) => {
          labels.push({ key: `row:${topic}`, text: narrow ? TOPIC_SHORT[topic] || topic : topic, p: at(left - 12, Y(row), back), cls: "t3-axis is-left" });
        });
        for (let year = minYear; year <= maxYear; year += 1) {
          if (narrow && year % 2 === 0) continue;
          labels.push({ key: `year:${year}`, text: String(year), p: at(X(year), top + plotH + 14, back), cls: "t3-axis t3-axis-num" });
        }
      } else {
        const radius = Math.max(60, Math.min(W, H) / 2 - (narrow ? 34 : 54));
        circleOrder.forEach((paper, index) => {
          const angle = Math.PI / 2 - (index / circleOrder.length) * Math.PI * 2;
          pos.set(paper.id, [radius * Math.cos(angle), radius * Math.sin(angle), 0]);
        });
        const ring = [];
        for (let k = 0; k < 96; k += 1) {
          const angle = (k / 96) * Math.PI * 2;
          ring.push([radius * Math.cos(angle), radius * Math.sin(angle), back]);
        }
        guides.push({ points: ring, color: t.grid, alpha: 0.9, closed: true });
      }

      const nodes = papers.map((paper) => {
        const isFocus = paper.id === focus;
        const lit = !focus || isFocus || neighbors.has(paper.id);
        const gone = hidden(paper);
        return {
          id: paper.id,
          p: pos.get(paper.id),
          size: sizeFor(paper) + (isFocus ? 4 : 0),
          color: colorFor(paper, t),
          alpha: gone ? 0.08 : lit ? 1 : 0.2,
          focus: isFocus,
          glow: gone ? 0 : isFocus ? 1 : focus ? (neighbors.has(paper.id) ? 0.8 : 0) : 0.5,
          pickable: !gone,
          label: isFocus ? truncate(paper.name, narrow ? 28 : 44) : null,
          labelCls: "is-pill",
        };
      });

      const edges = links
        .filter((link) => !hidden(byId.get(link.source)) && !hidden(byId.get(link.target)))
        .filter((link) => !isTimeline || (focus && (link.source === focus || link.target === focus)))
        .map((link) => {
          const touches = focus && (link.source === focus || link.target === focus);
          return {
            a: link.source,
            b: link.target,
            color: touches ? focusColor : colorFor(byId.get(link.source), t),
            alpha: touches ? 0.85 : focus ? 0.05 : 0.2,
            lift: isTimeline ? 0.22 : 0.12,
            inward: isTimeline ? 0 : 0.5,
            beads: !!touches,
            flow: !!touches,
          };
        });

      return { nodes, edges, guides, labels, bounds: { cx: 0, cy: 0, w: W, h: H, pad: 1 }, bg: t.surface, dark: t.dark, focusColor: t.focus, sway: 2 };
    }

    function buildOption() {
      const t = mapTheme();
      const isTimeline = state.view === "timeline";
      const narrow = dom.clientWidth < 560;
      const focus = state.focusId && byId.has(state.focusId) ? state.focusId : null;
      const links = activeLinks();
      const neighbors = new Set();
      if (focus) {
        links.forEach((link) => {
          if (link.source === focus) neighbors.add(link.target);
          if (link.target === focus) neighbors.add(link.source);
        });
      }
      const hidden = (paper) => state.hiddenTopics.has(paper.topic);
      const focusColor = focus ? colorFor(byId.get(focus), t) : t.accent;

      const nodes = (isTimeline ? papers : circleOrder).map((paper) => {
        const lit = !focus || paper.id === focus || neighbors.has(paper.id);
        const isFocus = paper.id === focus;
        return {
          id: paper.id,
          name: paper.name,
          value: isTimeline ? timelinePos.get(paper.id) : paper.value,
          symbolSize: sizeFor(paper) + (isFocus ? 4 : 0),
          itemStyle: {
            color: colorFor(paper, t),
            borderColor: isFocus ? t.focus : t.surface,
            borderWidth: isFocus ? 3 : 1.5,
            opacity: hidden(paper) ? 0.08 : lit ? 1 : 0.2,
          },
          label: { show: isFocus },
          z: isFocus ? 10 : neighbors.has(paper.id) ? 5 : 2,
        };
      });

      const edges = links
        .filter((link) => !hidden(byId.get(link.source)) && !hidden(byId.get(link.target)))
        .filter((link) => !isTimeline || (focus && (link.source === focus || link.target === focus)))
        .map((link) => {
          const touches = focus && (link.source === focus || link.target === focus);
          return {
            source: link.source,
            target: link.target,
            reason: link.reason,
            lineStyle: {
              color: touches ? focusColor : isTimeline ? t.muted : "source",
              width: touches ? Math.min(1 + link.value / 8, 3.5) : Math.min(0.6 + link.value / 20, 1.6),
              opacity: touches ? 0.75 : focus ? 0.04 : 0.16,
              curveness: isTimeline ? 0.3 : 0.25,
            },
          };
        });

      const graph = {
        id: "papers",
        type: "graph",
        data: nodes,
        links: edges,
        roam: !isTimeline,
        scaleLimit: { min: 0.6, max: 4 },
        draggable: false,
        symbol: "circle",
        animationDurationUpdate: 350,
        label: {
          position: "top",
          distance: 6,
          color: t.text,
          fontSize: 12,
          fontFamily: "Lato, sans-serif",
          backgroundColor: t.tipBg,
          borderColor: t.tipBorder,
          borderWidth: 1,
          borderRadius: 4,
          padding: [3, 6],
          formatter: (params) => truncate(params.data.name, narrow ? 28 : 44),
        },
        emphasis: { scale: 1.12, label: { show: true } },
        lineStyle: { curveness: 0.25 },
      };

      const option = {
        tooltip: Object.assign(mapTooltip(t), {
          formatter: (params) => {
            if (params.seriesId !== "papers") return "";
            if (params.dataType === "edge") {
              const a = byId.get(String(params.data.source));
              const b = byId.get(String(params.data.target));
              if (!a || !b) return "";
              return `<strong>${escapeHtml(params.data.reason || "Connected")}</strong><br>${escapeHtml(truncate(a.name, 60))}<br>${escapeHtml(truncate(b.name, 60))}`;
            }
            return paperTip(String(params.data.id));
          },
        }),
        aria: { enabled: true, label: { description: describeImpact(papers, allLinks) } },
      };

      if (isTimeline) {
        option.grid = { left: 8, right: 18, top: 14, bottom: 8, containLabel: true };
        option.xAxis = {
          type: "value",
          min: minYear - 0.5,
          max: maxYear + 0.5,
          interval: 1,
          axisLine: { lineStyle: { color: t.grid } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            // min/max sit on half-years so every column is centred on its year; customValues puts a label on each year.
            customValues: Array.from({ length: maxYear - minYear + 1 }, (_, k) => minYear + k),
            color: t.muted,
            fontSize: 11,
            fontFamily: "'Fira Code', monospace",
            formatter: (value) => (Number.isInteger(value) && (!narrow || value % 2 === 1) ? String(value) : ""),
          },
        };
        option.yAxis = {
          type: "value",
          inverse: true,
          min: -0.5,
          max: rows.length - 0.5,
          interval: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            customValues: rows.map((_, k) => k),
            color: t.body,
            fontSize: 12,
            fontFamily: "Lato, sans-serif",
            formatter: (value) => {
              const topic = rows[value];
              if (!topic) return "";
              return narrow ? TOPIC_SHORT[topic] || topic : topic;
            },
          },
        };
        // Row separators and year boundaries as quiet guide lines.
        const guides = [];
        for (let row = 0; row < rows.length - 1; row += 1) {
          guides.push([[minYear - 0.5, row + 0.5], [maxYear + 0.5, row + 0.5]]);
        }
        for (let year = minYear; year < maxYear; year += 1) {
          guides.push([[year + 0.5, -0.5], [year + 0.5, rows.length - 0.5]]);
        }
        option.series = [
          Object.assign(graph, { coordinateSystem: "cartesian2d", layout: "none" }),
          ...guides.map((data, index) => ({
            id: `guide-${index}`,
            type: "line",
            data,
            silent: true,
            symbol: "none",
            z: 0,
            animation: false,
            lineStyle: { color: t.grid, width: 1, type: index < rows.length - 1 ? "solid" : [2, 4] },
            tooltip: { show: false },
          })),
        ];
      } else {
        option.series = [
          Object.assign(graph, {
            layout: "circular",
            circular: { rotateLabel: false },
            left: narrow ? 24 : 60,
            right: narrow ? 24 : 60,
            top: 36,
            bottom: 36,
          }),
        ];
      }
      return withReducedMotion(option);
    }

    let lastView = null;
    function update() {
      if (g3) g3.view.setGraph(buildSpec());
      else if (chart) {
        chart.setOption(buildOption(), lastView !== state.view);
        lastView = state.view;
      }
      renderLegend();
    }

    function renderLegend() {
      if (!legendEl) return;
      const t = mapTheme();
      if (state.colorMode === "type") {
        const types = TYPE_ORDER.filter((type) => papers.some((paper) => paper.type === type));
        legendEl.innerHTML = types
          .map((type) => `<span class="im-legend-item"><span class="im-swatch" style="--swatch:${TYPE_COLORS[type]}"></span>${TYPE_LABELS[type]} <span class="im-legend-count">${papers.filter((p) => p.type === type).length}</span></span>`)
          .join("") + `<span class="im-legend-note">Size: citations</span>`;
        return;
      }
      legendEl.innerHTML = rows
        .map((topic) => {
          const shown = !state.hiddenTopics.has(topic);
          const color = topic === "Other" ? t.other : topicColors[topic];
          return `<button type="button" class="im-legend-btn" data-impact-topic="${escapeHtml(topic)}" aria-pressed="${shown}" title="${shown ? "Hide" : "Show"} ${escapeHtml(topic)}"><span class="im-swatch" style="--swatch:${color}"></span>${escapeHtml(topic)} <span class="im-legend-count">${topicCount(topic)}</span></button>`;
        })
        .join("") + `<span class="im-legend-note">Size: citations</span>`;
    }

    const itemHtml = (paper, sub) => {
      const t = mapTheme();
      return `<li><button type="button" class="im-item" data-impact-select="${paper.id}"><span class="im-swatch" style="--swatch:${colorFor(paper, t)}"></span><span class="im-item-text"><span class="im-item-title">${escapeHtml(truncate(paper.name, 90))}</span><span class="im-item-sub">${escapeHtml(sub || `${paper.year || "—"} · ${paper.value} citations`)}</span></span></button></li>`;
    };

    function renderPanel() {
      if (!panel) return;
      const paper = state.focusId && byId.get(state.focusId);
      if (!paper) {
        const top = papers.slice().sort((a, b) => b.value - a.value).slice(0, 6);
        panel.innerHTML = `
          <p class="im-kicker">Most cited</p>
          <ol class="im-list">${top.map((item) => itemHtml(item)).join("")}</ol>
          <p class="im-hint">Select a paper on the map, search by title, or pick one here to see what it connects to. Esc clears the selection.</p>`;
        return;
      }
      const t = mapTheme();
      const connections = linksOf(paper.id);
      const typeLabel = TYPE_LABELS[paper.type] || paper.type || "Paper";
      const authors = paper.authors.map((name) => (SELF_RE.test(name) ? `<strong>${escapeHtml(name)}</strong>` : escapeHtml(name))).join(", ");
      panel.innerHTML = `
        <div class="im-panel-head">
          <span class="im-swatch" style="--swatch:${colorFor(paper, t)}"></span>
          <span class="im-kicker">${escapeHtml(paper.topic)}</span>
          <button type="button" class="im-clear" data-impact-action="clear">Clear</button>
        </div>
        <h3 class="im-panel-title" tabindex="-1">${escapeHtml(paper.name)}</h3>
        <p class="im-meta">${escapeHtml(paper.venue)} · ${paper.year || "—"} · ${escapeHtml(typeLabel)}</p>
        <dl class="im-stats">
          <div><dt>Citations</dt><dd>${paper.value}</dd></div>
          <div><dt>Linked papers</dt><dd>${connections.length}</dd></div>
        </dl>
        ${authors ? `<p class="im-authors">${authors}</p>` : ""}
        <div class="im-cite">${buildCitationButtons(paper)}</div>
        <p class="im-kicker">${connections.length ? "Connected papers" : "No links with the current filters"}</p>
        <ol class="im-list">${connections.slice(0, 10).map((entry) => itemHtml(entry.other, entry.link.reason)).join("")}</ol>
        ${connections.length > 10 ? `<p class="im-hint">${connections.length - 10} more on the map.</p>` : ""}`;
    }

    function select(id, moveFocus) {
      const paper = id && byId.get(String(id));
      if (paper && state.hiddenTopics.has(paper.topic)) state.hiddenTopics.delete(paper.topic);
      state.focusId = paper ? paper.id : null;
      update();
      renderPanel();
      if (moveFocus && panel) {
        const heading = panel.querySelector(".im-panel-title");
        if (heading) heading.focus({ preventScroll: true });
      }
    }

    function setPressed(selector, attr, value) {
      section.querySelectorAll(selector).forEach((btn) => btn.setAttribute("aria-pressed", String(btn.getAttribute(attr) === value)));
    }

    function useECharts() {
      if (state.renderToken !== renderToken || chart) return;
      if (g3) {
        g3.shim.dispose();
        g3 = null;
      }
      chart = window.echarts.init(dom, "v5");
      dashboardState.charts.impact = chart;
      chart.on("click", (params) => {
        if (params.seriesId !== "papers" || params.dataType !== "node") return;
        select(state.focusId === String(params.data.id) ? null : params.data.id, false);
      });
      chart.getZr().on("click", (event) => {
        if (!event.target && state.focusId) select(null, false);
      });
      update();
    }

    function use3D(Site3D) {
      if (state.renderToken !== renderToken) return;
      if (!Site3D) {
        useECharts();
        return;
      }
      g3 = mountGraph3D(dom, Site3D, {
        tipHtml: paperTip,
        onSelect: (id) => {
          if (id) select(state.focusId === id ? null : id, false);
          else if (state.focusId) select(null, false);
        },
        onFail: () => useECharts(),
      });
      if (!g3) {
        useECharts();
        return;
      }
      dom.setAttribute("aria-label", describeImpact(papers, allLinks));
      dashboardState.charts.impact = g3.shim;
      update();
    }

    if (!section.dataset.mapBound) {
      section.dataset.mapBound = "1";
      section.addEventListener("click", (event) => {
        const api = dashboardState.impact.api;
        if (!api) return;
        const view = event.target.closest("[data-impact-view]");
        const color = event.target.closest("[data-impact-color]");
        const topic = event.target.closest("[data-impact-topic]");
        const pick = event.target.closest("[data-impact-select]");
        const clear = event.target.closest("[data-impact-action='clear']");
        if (view) api.setView(view.getAttribute("data-impact-view"));
        else if (color) api.setColor(color.getAttribute("data-impact-color"));
        else if (topic) api.toggleTopic(topic.getAttribute("data-impact-topic"));
        else if (pick) api.select(pick.getAttribute("data-impact-select"), true);
        else if (clear) api.select(null, false);
      });
      section.addEventListener("change", (event) => {
        const api = dashboardState.impact.api;
        const box = event.target.closest("[data-impact-link]");
        if (api && box) api.setLink(box.getAttribute("data-impact-link"), box.checked);
      });
      section.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && dashboardState.impact.focusId && dashboardState.impact.api) {
          dashboardState.impact.api.select(null, false);
          dom.focus({ preventScroll: true });
        }
      });
      if (searchEl) {
        const runSearch = () => {
          const api = dashboardState.impact.api;
          const query = searchEl.value.trim().toLowerCase();
          if (!api || !query) {
            if (searchStatus) searchStatus.textContent = "";
            return;
          }
          const hit = papers.find((paper) => paper.name.toLowerCase() === query) || papers.find((paper) => paper.name.toLowerCase().includes(query));
          if (searchStatus) searchStatus.textContent = hit ? "" : "No paper matches that title.";
          if (hit) api.select(hit.id, false);
        };
        searchEl.addEventListener("change", runSearch);
        searchEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            runSearch();
          }
        });
      }
    }

    if (datalist) {
      datalist.innerHTML = papers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((paper) => `<option value="${escapeHtml(paper.name)}"></option>`)
        .join("");
    }

    state.api = {
      select,
      update: () => {
        update();
        renderPanel();
      },
      setView(view) {
        if (view !== "timeline" && view !== "network") return;
        state.view = view;
        setPressed("[data-impact-view]", "data-impact-view", view);
        update();
      },
      setColor(mode) {
        if (mode !== "topic" && mode !== "type") return;
        state.colorMode = mode;
        setPressed("[data-impact-color]", "data-impact-color", mode);
        update();
        renderPanel();
      },
      toggleTopic(topic) {
        if (state.hiddenTopics.has(topic)) state.hiddenTopics.delete(topic);
        else state.hiddenTopics.add(topic);
        const focused = state.focusId && byId.get(state.focusId);
        if (focused && state.hiddenTopics.has(focused.topic)) state.focusId = null;
        update();
        renderPanel();
      },
      setLink(type, on) {
        if (!(type in state.linkTypes)) return;
        state.linkTypes[type] = on;
        update();
        renderPanel();
      },
    };

    setPressed("[data-impact-view]", "data-impact-view", state.view);
    setPressed("[data-impact-color]", "data-impact-color", state.colorMode);
    renderLegend();
    renderPanel();
    load3D().then(use3D);
  }

  function normalizeAuthor(nameMap, name) {
    const clean = (name || "").replace(/\s+/g, " ").trim();
    if (clean.includes(",")) {
      const parts = clean.split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return nameMap[`${parts[1]} ${parts[0]}`] || `${parts[1]} ${parts[0]}`;
      }
    }
    return nameMap[clean] || clean;
  }

  // ---- Collaboration Network -------------------------------------------------------------------------------------
  // An orbit chart with Ben at the center. Ring = how often we wrote together (5+ papers, 2-4, 1); position around
  // the ring = when we first wrote together, clockwise from the top; color = how recent the last shared paper is.
  // The side list ranks every collaborator and is the keyboard route into the chart.
  function renderCollabNetwork(collaboration) {
    const dom = document.getElementById(IDS.COLLAB);
    if (!dom || !collaboration || !collaboration.ranges) return;
    if (dashboardState.charts.collab) dashboardState.charts.collab.dispose();
    dashboardState.charts.collab = null;
    let chart = null;
    let g3 = null;

    const state = dashboardState.collab;
    const renderToken = {};
    state.renderToken = renderToken;
    const section = dom.closest(".rd-collab") || dom.parentElement;
    const spotEl = document.getElementById("collab-spotlight");
    const listEl = document.getElementById("collab-list");
    const filterEl = document.getElementById("collab-filter");
    const legendEl = document.getElementById("collab-legend");
    const currentYear = Number(collaboration.currentYear) || new Date().getFullYear();
    const papers = (dashboardState.payload && dashboardState.payload.impactGraph && dashboardState.payload.impactGraph.nodes) || [];
    const RADII = [0.36, 0.68, 1];
    const RING_LABELS = ["5+ papers", "2–4 papers", "1 paper"];

    const shortName = (name) => {
      const parts = String(name).split(" ").filter(Boolean);
      if (parts.length < 2) return name;
      return `${parts[0][0]}. ${parts[parts.length - 1]}`;
    };
    const recencyIndex = (last) => {
      if (!last) return 2;
      if (last >= currentYear - 1) return 0;
      if (last >= currentYear - 3) return 1;
      return 2;
    };
    const recencyLabels = [`${currentYear - 1}–${currentYear}`, `${currentYear - 3}–${currentYear - 2}`, `Before ${currentYear - 3}`];

    let model = null;
    function buildModel() {
      const rangeData = collaboration.ranges[state.range] || collaboration.ranges.all || { nodes: [], links: [], authorMeta: {} };
      const meta = rangeData.authorMeta || {};
      const rawNodes = rangeData.nodes || [];
      const self = (rawNodes.find((node) => SELF_RE.test(node.id)) || {}).id || "Benjamin M. Ampel";
      const nameMap = { "B Ampel": self, "BM Ampel": self, "B. Ampel": self, admin: self };
      const people = rawNodes
        .filter((node) => node.id !== self)
        .map((node) => {
          const info = meta[node.id] || {};
          const years = (info.years || []).map(Number).filter(Boolean).sort((a, b) => a - b);
          const count = node.count || info.count || 0;
          return {
            id: node.id,
            count,
            first: years[0] || null,
            last: years[years.length - 1] || null,
            info,
            ring: count >= 5 ? 0 : count >= 2 ? 1 : 2,
          };
        });
      [0, 1, 2].forEach((ring) => {
        const members = people
          .filter((person) => person.ring === ring)
          .sort((a, b) => (a.first || 0) - (b.first || 0) || b.count - a.count || a.id.localeCompare(b.id));
        const offset = ring === 1 ? Math.PI / Math.max(members.length, 1) : 0;
        members.forEach((person, index) => {
          const angle = -Math.PI / 2 + offset + (index / Math.max(members.length, 1)) * Math.PI * 2;
          person.angle = angle;
          person.x = Math.cos(angle) * RADII[ring];
          person.y = Math.sin(angle) * RADII[ring];
        });
      });
      const byId = new Map(people.map((person) => [person.id, person]));
      const links = (rangeData.links || []).filter((link) => (link.source === self || byId.has(link.source)) && (link.target === self || byId.has(link.target)));
      const maxCount = Math.max(1, ...people.map((person) => person.count));
      return { self, people, byId, links, maxCount, nameMap };
    }

    const sizeFor = (count) => Math.round(8 + 28 * Math.sqrt(Math.max(count - 1, 0) / Math.max(model.maxCount - 1, 1)));
    const labelPosition = (angle) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      if (cos > 0.35) return "right";
      if (cos < -0.35) return "left";
      return sin < 0 ? "top" : "bottom";
    };

    function personTip(id) {
      if (!id || id.startsWith("__ring")) return "";
      if (id === model.self) return `<strong>Ben Ampel</strong><br>${model.people.length} co-authors in this range`;
      const person = model.byId.get(id);
      if (!person) return "";
      const years = person.first ? (person.first === person.last ? `${person.first}` : `${person.first}–${person.last}`) : "—";
      return `<strong>${escapeHtml(id)}</strong><br>${person.count} paper${person.count === 1 ? "" : "s"} together · ${years}`;
    }

    // The same rings in three.js: people are glowing spheres, Ben glows at the centre, spokes and shared-paper arcs
    // are lines. Depth carries no data; the scene only sways a few degrees and tilts while dragged.
    function buildSpec() {
      const t = mapTheme();
      const W = dom.clientWidth || 640;
      const H = dom.clientHeight || 440;
      const narrow = W < 560;
      const R = Math.max(70, Math.min(W - (narrow ? 96 : 150), H - 80) / 2);
      const back = -30;
      const focus = state.focusId && model.byId.has(state.focusId) ? state.focusId : null;
      const neighbors = new Set();
      if (focus) {
        model.links.forEach((link) => {
          if (link.source === focus) neighbors.add(link.target);
          if (link.target === focus) neighbors.add(link.source);
        });
      }
      const guides = RADII.map((radius) => {
        const pts = [];
        for (let k = 0; k < 120; k += 1) {
          const angle = (k / 120) * Math.PI * 2;
          pts.push([Math.cos(angle) * radius * R, Math.sin(angle) * radius * R, back]);
        }
        return { points: pts, color: t.grid, alpha: 0.9, closed: true, dashed: true };
      });
      const nodes = [
        {
          id: model.self,
          p: [0, 0, 0],
          size: 34,
          color: t.self,
          alpha: focus ? 0.9 : 1,
          glow: 1,
          pickable: true,
          label: "Ben Ampel",
          labelPos: "below",
        },
      ];
      model.people.forEach((person) => {
        const isFocus = person.id === focus;
        const lit = !focus || isFocus || neighbors.has(person.id);
        const showLabel = isFocus || (lit && (person.ring === 0 || (focus && neighbors.has(person.id)) || (!narrow && !focus && person.ring === 1)));
        const side = labelPosition(person.angle);
        nodes.push({
          id: person.id,
          p: [person.x * R, -person.y * R, 0],
          size: sizeFor(person.count) + (isFocus ? 4 : 0),
          color: t.recency[recencyIndex(person.last)],
          alpha: lit ? 1 : 0.2,
          focus: isFocus,
          glow: isFocus ? 1 : focus ? (neighbors.has(person.id) ? 0.7 : 0) : person.ring === 0 ? 0.6 : 0.35,
          pickable: true,
          label: showLabel ? (isFocus ? person.id : shortName(person.id)) : null,
          labelPos: side === "top" ? "above" : side === "bottom" ? "below" : side,
          labelCls: isFocus ? "is-pill" : person.ring === 0 ? "is-strong" : "",
        });
      });
      const edges = model.links.map((link) => {
        const spoke = link.source === model.self || link.target === model.self;
        const touches = focus && (link.source === focus || link.target === focus);
        const other = model.byId.get(link.source === model.self ? link.target : link.source);
        return {
          a: link.source,
          b: link.target,
          color: touches ? t.accent : spoke && other ? t.recency[recencyIndex(other.last)] : t.muted,
          alpha: touches ? 0.85 : focus ? 0.04 : spoke ? 0.3 : 0.14,
          lift: spoke ? 0.04 : 0.14,
          inward: spoke ? 0 : 0.35,
          beads: !!touches,
          flow: !!touches || (!focus && spoke && other && other.ring === 0),
        };
      });
      return { nodes, edges, guides, labels: [], bounds: { cx: 0, cy: 0, w: W, h: H, pad: 1 }, bg: t.surface, dark: t.dark, focusColor: t.focus, sway: 3 };
    }

    function buildOption() {
      const t = mapTheme();
      const focus = state.focusId && model.byId.has(state.focusId) ? state.focusId : null;
      const neighbors = new Set();
      if (focus) {
        model.links.forEach((link) => {
          if (link.source === focus) neighbors.add(link.target);
          if (link.target === focus) neighbors.add(link.source);
        });
      }
      const nodes = [];
      // Dotted ring guides: tiny fixed points, no tooltip or hover.
      RADII.forEach((radius, ring) => {
        const dots = ring === 0 ? 60 : ring === 1 ? 96 : 132;
        for (let k = 0; k < dots; k += 1) {
          const angle = (k / dots) * Math.PI * 2;
          nodes.push({
            id: `__ring${ring}_${k}`,
            name: "",
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            symbolSize: 1.6,
            itemStyle: { color: t.ring, borderWidth: 0 },
            label: { show: false },
            emphasis: { disabled: true },
            tooltip: { show: false },
            silent: true,
            z: 0,
          });
        }
      });
      nodes.push({
        id: model.self,
        name: "Ben Ampel",
        x: 0,
        y: 0,
        symbolSize: 40,
        itemStyle: { color: t.self, borderColor: t.surface, borderWidth: 2, opacity: focus ? 0.9 : 1 },
        label: { show: true, position: "bottom", formatter: "Ben Ampel", color: t.text, fontWeight: 700 },
        z: 6,
      });
      model.people.forEach((person) => {
        const isFocus = person.id === focus;
        const lit = !focus || isFocus || neighbors.has(person.id);
        const showLabel = isFocus || (lit && (person.ring < 2 || (focus && neighbors.has(person.id))));
        nodes.push({
          id: person.id,
          name: person.id,
          x: person.x,
          y: person.y,
          symbolSize: sizeFor(person.count) + (isFocus ? 4 : 0),
          itemStyle: {
            color: t.recency[recencyIndex(person.last)],
            borderColor: isFocus ? t.focus : t.surface,
            borderWidth: isFocus ? 3 : 1.5,
            opacity: lit ? 1 : 0.22,
          },
          label: {
            show: showLabel,
            position: labelPosition(person.angle),
            formatter: shortName(person.id),
            color: lit ? t.text : t.muted,
            fontWeight: isFocus || person.ring === 0 ? 700 : 400,
          },
          z: isFocus ? 10 : lit ? 5 : 2,
        });
      });

      const edges = model.links.map((link) => {
        const spoke = link.source === model.self || link.target === model.self;
        const touches = focus && (link.source === focus || link.target === focus);
        const count = Number(link.count) || 1;
        return {
          source: link.source,
          target: link.target,
          count,
          lineStyle: {
            color: touches ? t.accent : t.muted,
            width: touches ? Math.min(1.2 + Math.sqrt(count), 5) : Math.min(0.5 + Math.sqrt(count) * 0.4, 2.4),
            opacity: touches ? 0.85 : focus ? 0.04 : spoke ? 0.22 : 0.14,
            curveness: spoke ? 0 : 0.22,
          },
        };
      });

      return withReducedMotion({
        tooltip: Object.assign(mapTooltip(t), {
          formatter: (params) => {
            if (params.dataType === "edge") {
              const a = String(params.data.source);
              const b = String(params.data.target);
              const label = (name) => (name === model.self ? "Ben Ampel" : name);
              return `${escapeHtml(label(a))} and ${escapeHtml(label(b))}<br><strong>${params.data.count}</strong> paper${params.data.count === 1 ? "" : "s"} together`;
            }
            return personTip(String(params.data.id || ""));
          },
        }),
        aria: { enabled: true, label: { description: describeCollab(model.people.map((p) => ({ id: p.id, name: p.id, value: p.count })), model.self) } },
        series: [
          {
            id: "collab",
            type: "graph",
            layout: "none",
            data: nodes,
            links: edges,
            roam: false,
            draggable: false,
            symbol: "circle",
            left: 64,
            right: 64,
            top: 36,
            bottom: 40,
            animationDurationUpdate: 350,
            label: { color: t.text, fontSize: 11, fontFamily: "Lato, sans-serif", distance: 5 },
            emphasis: { scale: 1.12, label: { show: true } },
          },
        ],
      });
    }

    function renderLegend() {
      if (!legendEl) return;
      const t = mapTheme();
      legendEl.innerHTML =
        `<span class="cn-legend-group"><span class="cn-legend-title">Last paper together</span>${recencyLabels
          .map((label, index) => `<span class="im-legend-item"><span class="im-swatch" style="--swatch:${t.recency[index]}"></span>${label}</span>`)
          .join("")}</span>` +
        `<span class="cn-legend-group"><span class="cn-legend-title">Rings, inside out</span><span class="im-legend-item">${RING_LABELS.join(" · ")}</span></span>` +
        `<span class="cn-legend-group"><span class="im-legend-note">Clockwise from the top: first paper together, earliest first. Size: papers together.</span></span>`;
    }

    function renderSpotlight() {
      if (!spotEl) return;
      const person = state.focusId && model.byId.get(state.focusId);
      if (!person) {
        const core = model.people.filter((p) => p.ring === 0).length;
        const recent = model.people.filter((p) => recencyIndex(p.last) === 0).length;
        spotEl.innerHTML = `
          <p class="im-kicker">Collaborators</p>
          <dl class="im-stats">
            <div><dt>Co-authors</dt><dd>${model.people.length}</dd></div>
            <div><dt>5+ papers</dt><dd>${core}</dd></div>
            <div><dt>Since ${currentYear - 1}</dt><dd>${recent}</dd></div>
          </dl>
          <p class="im-hint">Pick a name below or a dot on the chart to see shared papers, venues and mutual co-authors.</p>`;
        return;
      }
      const t = mapTheme();
      const years = person.first ? (person.first === person.last ? `${person.first}` : `${person.first}–${person.last}`) : "—";
      const venues = Object.entries(person.info.venues || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([venue, count]) => `${escapeHtml(venue)} (${count})`)
        .join(", ");
      const mutual = Object.entries(person.info.coauthors || {})
        .map(([name, count]) => [normalizeAuthor(model.nameMap, name), count])
        .filter(([name]) => name !== model.self && name !== person.id)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      const shared = papers
        .filter((paper) => Array.isArray(paper.authors) && paper.authors.includes(person.id))
        .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.value || 0) - (a.value || 0));
      spotEl.innerHTML = `
        <div class="im-panel-head">
          <span class="im-swatch" style="--swatch:${t.recency[recencyIndex(person.last)]}"></span>
          <span class="im-kicker">${RING_LABELS[person.ring]}</span>
          <button type="button" class="im-clear" data-collab-action="clear">Clear</button>
        </div>
        <h3 class="im-panel-title" tabindex="-1">${escapeHtml(person.id)}</h3>
        <dl class="im-stats">
          <div><dt>Papers together</dt><dd>${person.count}</dd></div>
          <div><dt>Years</dt><dd>${years}</dd></div>
        </dl>
        ${venues ? `<p class="im-meta"><span class="im-kicker-inline">Top venues</span> ${venues}</p>` : ""}
        ${mutual.length ? `<p class="im-kicker">Also wrote with</p><div class="cn-mutual">${mutual
          .map(([name, count]) =>
            model.byId.has(name)
              ? `<button type="button" class="cn-mutual-btn" data-collab-select="${escapeHtml(name)}">${escapeHtml(shortName(name))} <span class="im-legend-count">${count}</span></button>`
              : `<span class="cn-mutual-btn is-static">${escapeHtml(shortName(name))} <span class="im-legend-count">${count}</span></span>`)
          .join("")}</div>` : ""}
        ${shared.length ? `<p class="im-kicker">Shared papers</p><ul class="cn-papers">${shared
          .slice(0, 5)
          .map((paper) => `<li><span class="cn-paper-year">${paper.year || "—"}</span> ${escapeHtml(truncate(paper.name, 96))}</li>`)
          .join("")}</ul>${shared.length > 5 ? `<p class="im-hint">${shared.length - 5} more.</p>` : ""}` : ""}`;
    }

    function renderList() {
      if (!listEl) return;
      const t = mapTheme();
      const query = filterEl ? filterEl.value.trim().toLowerCase() : "";
      const rows = model.people
        .slice()
        .sort((a, b) => b.count - a.count || (b.last || 0) - (a.last || 0) || a.id.localeCompare(b.id))
        .filter((person) => !query || person.id.toLowerCase().includes(query));
      if (!rows.length) {
        listEl.innerHTML = `<li class="im-hint">No collaborator matches.</li>`;
        return;
      }
      listEl.innerHTML = rows
        .map((person) => {
          const width = Math.max(4, Math.round((person.count / model.maxCount) * 100));
          const years = person.first ? (person.first === person.last ? `${person.first}` : `${person.first}–${String(person.last).slice(2)}`) : "";
          return `<li><button type="button" class="cn-item" data-collab-select="${escapeHtml(person.id)}" aria-pressed="${person.id === state.focusId}">
            <span class="im-swatch" style="--swatch:${t.recency[recencyIndex(person.last)]}"></span>
            <span class="cn-name"><span class="cn-name-text">${escapeHtml(person.id)}</span><span class="cn-years">${years}</span></span>
            <span class="cn-bar" aria-hidden="true"><span style="--w:${width}%; --swatch:${t.recency[recencyIndex(person.last)]}"></span></span>
            <span class="cn-count">${person.count}</span>
          </button></li>`;
        })
        .join("");
    }

    function update() {
      if (g3) g3.view.setGraph(buildSpec());
      else if (chart) chart.setOption(buildOption());
      renderLegend();
    }

    function select(id, moveFocus) {
      state.focusId = id && model.byId.has(id) ? id : null;
      update();
      renderSpotlight();
      renderList();
      if (moveFocus && spotEl) {
        const heading = spotEl.querySelector(".im-panel-title");
        if (heading) heading.focus({ preventScroll: true });
      }
    }

    function useECharts() {
      if (state.renderToken !== renderToken || chart) return;
      if (g3) {
        g3.shim.dispose();
        g3 = null;
      }
      chart = window.echarts.init(dom, "v5");
      dashboardState.charts.collab = chart;
      chart.on("click", (params) => {
        if (params.dataType !== "node") return;
        const id = String(params.data.id || "");
        if (id.startsWith("__ring") || id === model.self) {
          select(null, false);
          return;
        }
        select(state.focusId === id ? null : id, false);
      });
      chart.getZr().on("click", (event) => {
        if (!event.target && state.focusId) select(null, false);
      });
      update();
    }

    function use3D(Site3D) {
      if (state.renderToken !== renderToken) return;
      if (Site3D) {
        g3 = mountGraph3D(dom, Site3D, {
          tipHtml: personTip,
          onSelect: (id) => {
            if (!id || id === model.self) {
              if (state.focusId) select(null, false);
            } else select(state.focusId === id ? null : id, false);
          },
          onFail: () => useECharts(),
        });
      }
      if (!g3) {
        useECharts();
        return;
      }
      dom.setAttribute("aria-label", describeCollab(model.people.map((p) => ({ id: p.id, name: p.id, value: p.count })), model.self));
      dashboardState.charts.collab = g3.shim;
      update();
    }

    if (!section.dataset.mapBound) {
      section.dataset.mapBound = "1";
      section.addEventListener("click", (event) => {
        const api = dashboardState.collab.api;
        if (!api) return;
        const range = event.target.closest("[data-collab-range]");
        const pick = event.target.closest("[data-collab-select]");
        const clear = event.target.closest("[data-collab-action='clear']");
        if (range) api.setRange(range.getAttribute("data-collab-range"));
        else if (pick) api.select(pick.getAttribute("data-collab-select"), true);
        else if (clear) api.select(null, false);
      });
      section.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && dashboardState.collab.focusId && dashboardState.collab.api) {
          dashboardState.collab.api.select(null, false);
        }
      });
      if (filterEl) filterEl.addEventListener("input", () => dashboardState.collab.api && dashboardState.collab.api.renderList());
    }

    const setRangePressed = () =>
      section.querySelectorAll("[data-collab-range]").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.getAttribute("data-collab-range") === state.range)));

    state.api = {
      select,
      renderList,
      update: () => {
        update();
        renderSpotlight();
        renderList();
      },
      setRange(range) {
        if (!collaboration.ranges[range]) return;
        state.range = range;
        model = buildModel();
        if (state.focusId && !model.byId.has(state.focusId)) state.focusId = null;
        setRangePressed();
        update();
        renderSpotlight();
        renderList();
      },
    };

    model = buildModel();
    setRangePressed();
    state.api.update();
    load3D().then(use3D);
  }

  // Theme switches (body.dark toggled by the site's theme button) repaint both maps with their own light/dark values.
  let mapThemeObserver = null;
  function watchMapTheme() {
    if (mapThemeObserver || !("MutationObserver" in window)) return;
    let wasDark = document.body.classList.contains("dark");
    mapThemeObserver = new MutationObserver(() => {
      const isDark = document.body.classList.contains("dark");
      if (isDark === wasDark) return;
      wasDark = isDark;
      ["impact", "collab"].forEach((key) => {
        const api = dashboardState[key] && dashboardState[key].api;
        if (api) api.update();
      });
      if (dashboardState.lineHistory) renderLine(dashboardState.lineHistory);
      if (dashboardState.footprint.applyGlobe) dashboardState.footprint.applyGlobe();
    });
    mapThemeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  function createArc(start, end) {
    const lat1 = start.lat;
    const lng1 = start.lng;
    const lat2 = end.lat;
    const lng2 = end.lng;
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    const norm = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = Math.min(12, norm * 0.25);
    const ctrlLat = midLat + (-dx / norm) * offset;
    const ctrlLng = midLng + (dy / norm) * offset;
    const coords = [];
    for (let t = 0; t <= 1.001; t += 0.06) {
      const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * ctrlLat + t * t * lat2;
      const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * ctrlLng + t * t * lng2;
      coords.push([lat, lng]);
    }
    return coords;
  }

  function renderFootprintLeaflet(footprint) {
    const container = document.getElementById(IDS.FOOTPRINT);
    if (!container || !window.L) return;

    if (dashboardState.maps.footprint) {
      dashboardState.maps.footprint.remove();
      dashboardState.maps.footprint = null;
    }

    const map = window.L.map(IDS.FOOTPRINT).setView([30, -20], 2);
    dashboardState.maps.footprint = map;
    const state = dashboardState.footprint;
    state.lightTiles = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
      maxZoom: 16,
    });
    state.darkTiles = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors", maxZoom: 16 });
    if (document.body.classList.contains("dark")) {
      state.darkTiles.addTo(map);
    } else {
      state.lightTiles.addTo(map);
    }

    state.markerLayer = window.L.layerGroup();
    state.arcLayer = window.L.layerGroup().addTo(map);
    state.clusterLayer = window.L.markerClusterGroup
      ? window.L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 })
      : null;

    const points = Array.isArray(footprint.points) ? footprint.points : [];
    const routes = Array.isArray(footprint.routes) ? footprint.routes : [];
    state.year = state.year || footprint.maxYear || new Date().getFullYear();

    const rangeEl = document.getElementById(IDS.FOOTPRINT_YEAR);
    const labelEl = document.getElementById(IDS.FOOTPRINT_YEAR_LABEL);
    if (rangeEl && labelEl) {
      rangeEl.min = String(footprint.minYear || state.year);
      rangeEl.max = String(footprint.maxYear || state.year);
      rangeEl.value = String(state.year);
      labelEl.textContent = String(state.year); // the label already reads "Through …"
      if (!rangeEl.dataset.bound) {
        rangeEl.dataset.bound = "true";
        rangeEl.addEventListener("input", () => {
          state.year = Number(rangeEl.value);
          labelEl.textContent = String(state.year); // the label already reads "Through …"
          window.requestAnimationFrame(applyFilters);
        });
      }
    }

    renderFootprintLegend();

    function createIcon(category) {
      const lower = String(category || "Collaboration").toLowerCase();
      const color = footprintPalette().cat[category] || footprintPalette().cat.Collaboration;
      return window.L.divIcon({
        className: "",
        html: `<div class="footprint-marker ${lower}" style="color:${color}"><span class="ring"></span><span class="dot"></span></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
    }

    function withinYear(point) {
      if (!point.minYear) return true;
      return point.minYear <= state.year;
    }

    function buildMarkers(list) {
      state.markerLayer.clearLayers();
      if (state.clusterLayer) state.clusterLayer.clearLayers();
      list.forEach((point) => {
        const marker = window.L.marker([point.lat, point.lng], { icon: createIcon(point.cat) }).bindPopup(
          `<div><strong>${escapeHtml(point.title)}</strong><br><span style="font-size:0.8em">${escapeHtml(point.location || "")}</span><br><span style="font-size:0.8em;opacity:0.7">${escapeHtml(point.cat || "")}</span></div>`
        );
        if (state.layers.clusters && state.clusterLayer) {
          state.clusterLayer.addLayer(marker);
        } else {
          state.markerLayer.addLayer(marker);
        }
      });
      if (state.layers.clusters && state.clusterLayer) {
        if (!map.hasLayer(state.clusterLayer)) map.addLayer(state.clusterLayer);
        if (map.hasLayer(state.markerLayer)) map.removeLayer(state.markerLayer);
      } else {
        if (!map.hasLayer(state.markerLayer)) map.addLayer(state.markerLayer);
        if (state.clusterLayer && map.hasLayer(state.clusterLayer)) map.removeLayer(state.clusterLayer);
      }
    }

    function buildArcs() {
      state.arcLayer.clearLayers();
      if (!state.layers.routes) return;
      routes
        .filter((route) => !route.year || route.year <= state.year)
        .forEach((route) => {
        const coords = createArc(route.from, route.to);
        state.arcLayer.addLayer(window.L.polyline(coords, { className: "footprint-arc" }));
        });
    }

    function applyFilters() {
      const filtered = points.filter((point) => state.categories[point.cat] && withinYear(point));
      buildMarkers(filtered);
      buildArcs();
    }

    document.querySelectorAll("input[data-footprint-cat]").forEach((input) => {
      if (input.dataset.bound) return;
      input.dataset.bound = "true";
      input.addEventListener("change", () => {
        state.categories[input.getAttribute("data-footprint-cat")] = input.checked;
        applyFilters();
      });
    });
    document.querySelectorAll("input[data-footprint-layer]").forEach((input) => {
      if (input.dataset.bound) return;
      input.dataset.bound = "true";
      input.addEventListener("change", () => {
        state.layers[input.getAttribute("data-footprint-layer")] = input.checked;
        applyFilters();
      });
    });

    if (dashboardState.maps.footprintObserver) {
      dashboardState.maps.footprintObserver.disconnect();
    }
    dashboardState.maps.footprintObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName !== "class") return;
        const isDark = document.body.classList.contains("dark");
        if (isDark) {
          if (map.hasLayer(state.lightTiles)) map.removeLayer(state.lightTiles);
          if (!map.hasLayer(state.darkTiles)) state.darkTiles.addTo(map);
        } else {
          if (map.hasLayer(state.darkTiles)) map.removeLayer(state.darkTiles);
          if (!map.hasLayer(state.lightTiles)) state.lightTiles.addTo(map);
        }
      });
    });
    dashboardState.maps.footprintObserver.observe(document.body, { attributes: true });

    applyFilters();
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ---- Research Footprint (redesign 2026-11-12) ---------------------------------------------------------------------
  // A three.js globe (assets/js/footprint-globe.mjs, bundled by scripts/build-three.mjs) with the place list and the
  // selected place in a side panel. Without WebGL, or if the globe fails to load, the Leaflet map above takes over with
  // the same filters.
  const FOOTPRINT_CATS = ["Conference", "Collaboration", "Institution"];

  function footprintPalette() {
    const dark = document.body.classList.contains("dark");
    return dark
      ? {
          dark, additive: true, globe: "#0f1620", land: "#4f6d8c", glow: "#38bdf8", glowStrength: 0.55,
          arc: "#7dd3fc", arcOpacity: 0.5, pulse: "#e0f2fe", halo: 0.4, select: "#ffffff",
          cat: { Conference: "#4ade80", Collaboration: "#38bdf8", Institution: "#fb923c" },
        }
      : {
          dark, additive: false, globe: "#f3f6f9", land: "#9fb0c2", glow: "#0369a1", glowStrength: 0.18,
          arc: "#0369a1", arcOpacity: 0.55, pulse: "#0369a1", halo: 0.22, select: "#1f2328",
          cat: { Conference: "#15803d", Collaboration: "#0369a1", Institution: "#c2410c" },
        };
  }

  function renderFootprintLegend() {
    const legendEl = document.getElementById("footprint-legend");
    if (!legendEl || legendEl.dataset.built) return;
    legendEl.dataset.built = "true";
    legendEl.innerHTML = FOOTPRINT_CATS.map(
      (cat) => `<div class="legend-row"><span class="footprint-legend-dot is-${cat.toLowerCase()}"></span><span>${cat}</span></div>`
    ).join("");
  }

  function footprintPapers(point) {
    const match = /^(\d+)\s+paper/.exec(point.desc || "");
    return match ? Number(match[1]) : 1;
  }

  function supportsWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch (error) {
      return false;
    }
  }

  function showFootprintMode(mode) {
    const section = document.querySelector(".rd-footprint");
    if (section) section.dataset.mode = mode;
    document.querySelectorAll("[data-footprint-mode]").forEach((el) => {
      el.hidden = el.getAttribute("data-footprint-mode") !== mode;
    });
  }

  function renderFootprintMap(footprint) {
    const container = document.getElementById(IDS.FOOTPRINT);
    if (!container) return;
    const fallback = (error) => {
      if (error) console.warn("Footprint globe unavailable, using the flat map:", error);
      if (dashboardState.globe) {
        dashboardState.globe.dispose();
        dashboardState.globe = null;
      }
      showFootprintMode("map");
      loadLeafletAssets()
        .then(() => renderFootprintLeaflet(footprint))
        .catch((err) => console.error("Footprint map failed:", err));
    };
    if (!supportsWebGL()) {
      fallback();
      return;
    }
    Promise.all([
      load3D(),
      safeFetch(buildUrl("data/globe_land.json")),
    ])
      .then(([, land]) => {
        if (!window.FootprintGlobe || !land) throw new Error("globe assets missing");
        renderFootprintGlobe(footprint, land.dots || []);
      })
      .catch(fallback);
  }

  function renderFootprintGlobe(footprint, land) {
    const container = document.getElementById(IDS.FOOTPRINT);
    const state = dashboardState.footprint;
    const points = (Array.isArray(footprint.points) ? footprint.points : []).map((point) => ({
      ...point,
      weight: footprintPapers(point),
    }));
    const routes = Array.isArray(footprint.routes) ? footprint.routes : [];
    state.year = state.year || footprint.maxYear || new Date().getFullYear();
    showFootprintMode("globe");
    renderFootprintLegend();
    container.removeAttribute("role");
    container.removeAttribute("tabindex");
    container.setAttribute("aria-hidden", "true");

    const tip = document.createElement("div");
    tip.className = "rf-tip";
    tip.hidden = true;
    container.appendChild(tip);
    const listEl = document.getElementById("footprint-places");
    const detailEl = document.getElementById("footprint-detail");
    const countEl = document.getElementById("footprint-count");

    let selected = null;
    const globe = window.FootprintGlobe.create(container, {
      land,
      theme: footprintPalette(),
      reducedMotion: prefersReducedMotion,
      onSelect: (point) => select(point, false),
      onHover: (point, event) => {
        if (!point || !event) {
          tip.hidden = true;
          return;
        }
        const rect = container.getBoundingClientRect();
        tip.textContent = `${point.title} · ${point.location || ""}`;
        tip.hidden = false;
        const x = Math.min(event.clientX - rect.left + 14, rect.width - tip.offsetWidth - 8);
        tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, event.clientY - rect.top - 34)}px)`;
      },
    });
    dashboardState.globe = globe;
    globe.setSpin(state.layers.spin !== false && !prefersReducedMotion);

    function visiblePoints() {
      return points.filter((point) => state.categories[point.cat] && (!point.minYear || point.minYear <= state.year));
    }

    function renderDetail() {
      if (!detailEl) return;
      if (!selected) {
        detailEl.innerHTML = `<p class="rf-detail-empty">Choose a place on the globe or in the list to see what was presented or written there.</p>`;
        return;
      }
      const papers = String(selected.desc || "").replace(/^\d+\s+papers?:\s*/, "");
      const years = Array.isArray(selected.years) && selected.years.length ? selected.years.join(", ") : "";
      detailEl.innerHTML = `
        <p class="rf-detail-kicker"><span class="footprint-legend-dot is-${String(selected.cat).toLowerCase()}"></span>${escapeHtml(selected.cat || "")}${years ? ` · ${escapeHtml(years)}` : ""}</p>
        <h3 class="rf-detail-title">${escapeHtml(selected.title)}</h3>
        <p class="rf-detail-place">${escapeHtml(selected.location || "")}</p>
        <p class="rf-detail-count">${selected.weight} ${selected.weight === 1 ? "paper" : "papers"}</p>
        ${papers ? `<ul class="rf-detail-papers">${papers.split(/;\s*/).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}`;
    }

    function renderList(list) {
      if (countEl) countEl.textContent = `${list.length} ${list.length === 1 ? "place" : "places"} through ${state.year}`;
      if (!listEl) return;
      const sorted = list.slice().sort((a, b) => (b.maxYear || 0) - (a.maxYear || 0) || a.title.localeCompare(b.title));
      listEl.innerHTML = sorted
        .map(
          (point) => `<li><button type="button" class="rf-place${selected && selected.title === point.title ? " is-on" : ""}" data-title="${escapeHtml(point.title)}" aria-pressed="${selected && selected.title === point.title ? "true" : "false"}">
            <span class="footprint-legend-dot is-${String(point.cat).toLowerCase()}"></span>
            <span class="rf-place-name">${escapeHtml(point.title)}</span>
            <span class="rf-place-meta">${escapeHtml(point.location || "")}</span></button></li>`
        )
        .join("");
    }

    function select(point, fromList) {
      selected = point && selected && selected.title === point.title && fromList ? null : point;
      globe.select(selected);
      renderDetail();
      renderList(visiblePoints());
      if (!fromList && selected && listEl) {
        const btn = Array.from(listEl.querySelectorAll(".rf-place")).find((el) => el.dataset.title === selected.title);
        if (btn) btn.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
      }
    }

    function applyFilters() {
      const list = visiblePoints();
      const visibleTitles = new Set(list.map((p) => p.title));
      if (selected && !visibleTitles.has(selected.title)) selected = null;
      const arcs = state.layers.routes
        ? routes.filter((r) => (!r.year || r.year <= state.year) && visibleTitles.has(r.from.title) && visibleTitles.has(r.to.title))
        : [];
      globe.setData(list, arcs);
      globe.select(selected);
      renderList(list);
      renderDetail();
    }
    state.applyGlobe = () => {
      globe.setTheme(footprintPalette());
      applyFilters();
    };

    if (listEl && !listEl.dataset.bound) {
      listEl.dataset.bound = "true";
      listEl.addEventListener("click", (event) => {
        const btn = event.target.closest(".rf-place");
        if (!btn) return;
        const point = points.find((p) => p.title === btn.dataset.title);
        if (point) select(point, true);
        const again = Array.from(listEl.querySelectorAll(".rf-place")).find((el) => el.dataset.title === btn.dataset.title);
        if (again) again.focus();
      });
    }

    const rangeEl = document.getElementById(IDS.FOOTPRINT_YEAR);
    const labelEl = document.getElementById(IDS.FOOTPRINT_YEAR_LABEL);
    if (rangeEl && labelEl) {
      rangeEl.min = String(footprint.minYear || state.year);
      rangeEl.max = String(footprint.maxYear || state.year);
      rangeEl.value = String(state.year);
      labelEl.textContent = String(state.year);
      if (!rangeEl.dataset.bound) {
        rangeEl.dataset.bound = "true";
        rangeEl.addEventListener("input", () => {
          state.year = Number(rangeEl.value);
          labelEl.textContent = String(state.year);
          window.requestAnimationFrame(applyFilters);
        });
      }
    }
    document.querySelectorAll("input[data-footprint-cat]").forEach((input) => {
      if (input.dataset.bound) return;
      input.dataset.bound = "true";
      input.addEventListener("change", () => {
        state.categories[input.getAttribute("data-footprint-cat")] = input.checked;
        applyFilters();
      });
    });
    document.querySelectorAll("input[data-footprint-layer]").forEach((input) => {
      if (input.dataset.bound) return;
      input.dataset.bound = "true";
      const layer = input.getAttribute("data-footprint-layer");
      if (layer === "spin" && prefersReducedMotion) {
        input.checked = false;
        input.closest("label").hidden = true;
      }
      input.addEventListener("change", () => {
        state.layers[layer] = input.checked;
        if (layer === "spin") globe.setSpin(input.checked);
        else applyFilters();
      });
    });

    applyFilters();
  }

  function refreshLayout() {
    const charts = dashboardState.charts;
    Object.values(charts).forEach((chart) => {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
    if (dashboardState.maps.footprint) dashboardState.maps.footprint.invalidateSize();
    // Axis labels shorten and label budgets change below 560 px, so the maps rebuild their options after a resize.
    if (dashboardState.impact.api) dashboardState.impact.api.update();
    if (dashboardState.collab.api) dashboardState.collab.api.update();
  }

  let resizeFrame = null;
  window.addEventListener("resize", () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      refreshLayout();
    });
  });

  function scheduleWork(callback) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(callback, { timeout: 1200 });
      return;
    }
    setTimeout(callback, 0);
  }

  function initDashboard() {
    if (dashboardState.initialized) return;
    dashboardState.initialized = true;

    loadDashboardAssets()
      .then(() => Promise.all([
        safeFetch(buildUrl("data/dashboard_payload.json")),
        safeFetch(buildUrl("data/citation_projection.json")),
      ]))
      .then(([payload, projection]) => {
        if (!payload) return;
        dashboardState.payload = payload;
        renderMetricSummary(payload);
        scheduleWork(() => {
          renderLine((payload.scholar && payload.scholar.citationsByYear) || [], projection);
          renderImpactMap(payload.impactGraph || {});
          renderCollabNetwork(payload.network && payload.network.collaboration);
          renderFootprintMap(payload.footprint || {});
          watchMapTheme();
          refreshLayout();
        });
      })
      .catch((error) => console.error("Dashboard Error:", error));
  }

  // ECharts, Leaflet and the payload load only when the dashboard is about to be seen: on opening its section, or, when
  // the section starts open, once the dashboard comes within 300 px of the viewport (it sits below the funding table).
  function whenNearViewport(callback) {
    if (!("IntersectionObserver" in window)) { callback(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(wrapper);
  }
  const dashboardDetails = wrapper.closest("details");
  if (dashboardDetails) {
    dashboardDetails.addEventListener("toggle", () => {
      if (dashboardDetails.open) initDashboard();
    });
    if (dashboardDetails.open) whenNearViewport(initDashboard);
  } else {
    whenNearViewport(initDashboard);
  }
})();
