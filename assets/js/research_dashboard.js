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
      layers: { routes: true, clusters: true },
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
    const exists = Array.from(document.scripts).some((script) => script.src === src);
    if (exists) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function loadDashboardAssets() {
    if (window.__dashboardAssetsPromise) return window.__dashboardAssetsPromise;
    window.__dashboardAssetsPromise = Promise.all([
      loadStyleOnce(buildUrl("vendor/leaflet/leaflet.css")),
      loadStyleOnce(buildUrl("vendor/leaflet-markercluster/MarkerCluster.css")),
      loadStyleOnce(buildUrl("vendor/leaflet-markercluster/MarkerCluster.Default.css")),
    ]).then(() =>
      Promise.all([
        loadScriptOnce(buildUrl("vendor/echarts/6.1.0/echarts.custom.min.js"), () => window.echarts), // trimmed build: scripts/build-echarts.mjs
        loadScriptOnce(buildUrl("vendor/leaflet/leaflet.js"), () => window.L),
      ]).then(() =>
        loadScriptOnce(
          buildUrl("vendor/leaflet-markercluster/leaflet.markercluster.js"),
          () => window.L && window.L.markerClusterGroup
        )
      )
    );
    return window.__dashboardAssetsPromise;
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

  function renderLine(history) {
    const dom = document.getElementById(IDS.LINE);
    if (!dom || !history || !history.length) return;
    if (dashboardState.charts.line) dashboardState.charts.line.dispose();
    const chart = window.echarts.init(dom, 'v5');
    dashboardState.charts.line = chart;
    const isDark = document.body.classList.contains("dark");
    chart.setOption(
      withReducedMotion({
        tooltip: { trigger: "axis", formatter: "{b}: {c} Citations" },
        // The description carries the numbers, since a screen reader cannot see the bars.
        aria: { enabled: true, description: `Citations by year: ${history.map((item) => `${item.year}, ${item.citations}`).join("; ")}.` },
        grid: { top: 10, right: 10, bottom: 20, left: 30, containLabel: true },
        xAxis: {
          type: "category",
          data: history.map((item) => item.year),
          axisLine: { show: false },
          axisLabel: { color: isDark ? "#888" : "#666", fontSize: 9 },
        },
        yAxis: {
          type: "value",
          splitLine: { show: false },
          axisLabel: { color: isDark ? "#888" : "#666", fontSize: 9 },
        },
        series: [
          {
            type: "bar",
            data: history.map((item) => item.citations),
            itemStyle: {
              color: isDark ? "#00e5ff" : "#1a0dab",
              borderRadius: [2, 2, 0, 0],
            },
            barWidth: "40%",
          },
        ],
      })
    );
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
    const chart = window.echarts.init(dom, "v5");
    dashboardState.charts.impact = chart;

    const state = dashboardState.impact;
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
            const paper = byId.get(String(params.data.id));
            if (!paper) return "";
            const typeLabel = TYPE_LABELS[paper.type] || paper.type;
            return `<strong>${escapeHtml(paper.name)}</strong><br>${escapeHtml(paper.venue)} · ${paper.year || "—"} · ${escapeHtml(typeLabel)}<br>${paper.value} citations · ${escapeHtml(paper.topic)}`;
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
      const option = buildOption();
      chart.setOption(option, lastView !== state.view);
      lastView = state.view;
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

    chart.on("click", (params) => {
      if (params.seriesId !== "papers" || params.dataType !== "node") return;
      select(state.focusId === String(params.data.id) ? null : params.data.id, false);
    });
    chart.getZr().on("click", (event) => {
      if (!event.target && state.focusId) select(null, false);
    });

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
    update();
    renderPanel();
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
    const chart = window.echarts.init(dom, "v5");
    dashboardState.charts.collab = chart;

    const state = dashboardState.collab;
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
            const id = String(params.data.id || "");
            if (!id || id.startsWith("__ring")) return "";
            if (id === model.self) return `<strong>Ben Ampel</strong><br>${model.people.length} co-authors in this range`;
            const person = model.byId.get(id);
            if (!person) return "";
            const years = person.first ? (person.first === person.last ? `${person.first}` : `${person.first}–${person.last}`) : "—";
            return `<strong>${escapeHtml(id)}</strong><br>${person.count} paper${person.count === 1 ? "" : "s"} together · ${years}`;
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
      chart.setOption(buildOption());
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

  function renderFootprintMap(footprint) {
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

    const legendEl = document.getElementById("footprint-legend");
    if (legendEl) {
      legendEl.innerHTML = [
        `<div class="legend-row"><span class="footprint-legend-dot" style="--legend-color:#4ade80;"></span><span>Conference</span></div>`,
        `<div class="legend-row"><span class="footprint-legend-dot" style="--legend-color:#00bfff;"></span><span>Collaboration</span></div>`,
        `<div class="legend-row"><span class="footprint-legend-dot" style="--legend-color:#ff6b35;"></span><span>Institution</span></div>`,
      ].join("");
    }

    function createIcon(category) {
      const lower = String(category || "Collaboration").toLowerCase();
      const color = category === "Conference" ? "#4ade80" : category === "Institution" ? "#ff6b35" : "#00bfff";
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
      .then(() => safeFetch(buildUrl("data/dashboard_payload.json")))
      .then((payload) => {
        if (!payload) return;
        dashboardState.payload = payload;
        renderMetricSummary(payload);
        scheduleWork(() => {
          renderLine((payload.scholar && payload.scholar.citationsByYear) || []);
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
