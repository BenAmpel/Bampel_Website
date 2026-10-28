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
      colorMode: "topic",
      linkTypes: { topic: true, venue: true, author: true },
      focusId: null,
      pinned: new Set(),
      renderedNodes: [],
      renderedLinks: [],
    },
    collab: {
      range: "all",
      focusId: null,
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

  const topicPalette = ["#4ade80", "#00e5ff", "#e040fb", "#ffd166", "#ff6b35", "#7c4dff", "#4dd0e1", "#80cbc4"];
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
    topicColors[topic] = topicPalette[index % topicPalette.length];
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

  function getColorByYear(year) {
    const value = Number(year || 0);
    if (value <= 2019) return "#4dd0e1";
    if (value <= 2022) return "#00e5ff";
    return "#4ade80";
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

  function renderImpactMap(graphData) {
    const dom = document.getElementById(IDS.MAP);
    if (!dom || !graphData || !Array.isArray(graphData.nodes)) return;
    if (dashboardState.charts.impact) dashboardState.charts.impact.dispose();
    const chart = window.echarts.init(dom, 'v5');
    dashboardState.charts.impact = chart;

    const baseNodes = graphData.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      value: node.value || 0,
      year: node.year,
      authors: node.authors,
      venue: node.venue,
      type: node.type,
      topic: node.topic || "Other",
      symbolSize: node.symbolSize || 14,
      topicColor: topicColors[node.topic] || topicColors.Other,
      yearColor: getColorByYear(node.year),
    }));
    const baseLinks = Array.isArray(graphData.links) ? graphData.links : [];
    dashboardState.impact.renderedNodes = baseNodes;
    dashboardState.impact.renderedLinks = baseLinks;
    dashboardState.impact.pinned = new Set(
      Array.from(dashboardState.impact.pinned).filter((id) => baseNodes.some((node) => node.id === id))
    );

    const legendEl = document.getElementById("impact-map-legend");
    const inspectorEl = document.getElementById("impact-map-inspector");
    const inspectorBody = inspectorEl ? inspectorEl.querySelector(".impact-inspector-body") : null;
    const inspectorPin = inspectorEl ? inspectorEl.querySelector('[data-impact-action="pin"]') : null;
    const inspectorClear = inspectorEl ? inspectorEl.querySelector('[data-impact-action="clear"]') : null;
    const pinsEl = document.getElementById("impact-map-pins");

    function renderLegend() {
      if (!legendEl) return;
      if (dashboardState.impact.colorMode === "topic") {
        const usedTopics = Array.from(new Set(baseNodes.map((node) => node.topic)));
        legendEl.innerHTML = usedTopics
          .map(
            (topic) =>
              `<div class="legend-row"><span class="impact-legend-dot" style="--legend-color:${topicColors[topic] || topicColors.Other};"></span><span>${escapeHtml(topic)}</span></div>`
          )
          .join("");
        return;
      }
      legendEl.innerHTML = [
        `<div class="legend-row"><span class="impact-legend-dot" style="--legend-color:${getColorByYear(2018)};"></span><span>2019 &amp; earlier</span></div>`,
        `<div class="legend-row"><span class="impact-legend-dot" style="--legend-color:${getColorByYear(2021)};"></span><span>2020 - 2022</span></div>`,
        `<div class="legend-row"><span class="impact-legend-dot" style="--legend-color:${getColorByYear(2024)};"></span><span>2023 - present</span></div>`,
      ].join("");
    }

    function renderPins() {
      if (!pinsEl) return;
      if (!dashboardState.impact.pinned.size) {
        pinsEl.innerHTML = "";
        return;
      }
      pinsEl.innerHTML = Array.from(dashboardState.impact.pinned)
        .map((id) => {
          const node = baseNodes.find((item) => item.id === id);
          const label = node ? node.name.slice(0, 26) + (node.name.length > 26 ? "..." : "") : "Pinned";
          return `<div class="impact-pin"><span>${escapeHtml(label)}</span><button type="button" data-pin-remove="${id}">x</button></div>`;
        })
        .join("");
    }

    function setInspector(node) {
      if (!inspectorBody || !inspectorPin || !inspectorClear) return;
      if (!node) {
        inspectorBody.textContent = "Click a node to reveal context, then pin highlights you want to keep.";
        inspectorPin.disabled = true;
        inspectorClear.disabled = true;
        return;
      }
      inspectorBody.innerHTML = `<strong>${escapeHtml(node.name)}</strong><br>
        <span style="opacity:0.8">Topic: ${escapeHtml(node.topic || "Other")}</span><br>
        <span style="opacity:0.8">Venue: ${escapeHtml(node.venue || "—")}</span><br>
        <span style="opacity:0.8">Year: ${escapeHtml(node.year || "—")} · Citations: ${node.value}</span>`;
      inspectorPin.disabled = false;
      inspectorClear.disabled = false;
    }

    function getFilteredLinks() {
      const types = dashboardState.impact.linkTypes;
      return baseLinks.filter(
        (link) =>
          (types.topic && link.types && link.types.topic) ||
          (types.venue && link.types && link.types.venue) ||
          (types.author && link.types && link.types.author)
      );
    }

    function updateImpactGraph() {
      const activeLinks = getFilteredLinks();
      const neighborMap = new Map();
      activeLinks.forEach((link) => {
        if (!neighborMap.has(link.source)) neighborMap.set(link.source, new Set());
        if (!neighborMap.has(link.target)) neighborMap.set(link.target, new Set());
        neighborMap.get(link.source).add(link.target);
        neighborMap.get(link.target).add(link.source);
      });

      const highlight = new Set(dashboardState.impact.pinned);
      const focusId = dashboardState.impact.focusId;
      if (focusId !== null && focusId !== undefined) {
        highlight.add(focusId);
        const neighbors = neighborMap.get(focusId);
        if (neighbors) neighbors.forEach((value) => highlight.add(value));
      }

      const isDark = document.body.classList.contains("dark");
      const styledNodes = baseNodes.map((node) => {
        const isFocus = node.id === focusId;
        const isPinned = dashboardState.impact.pinned.has(node.id);
        const isHighlighted = !highlight.size || highlight.has(node.id);
        const baseColor = dashboardState.impact.colorMode === "topic" ? node.topicColor : node.yearColor;
        return Object.assign({}, node, {
          itemStyle: {
            color: baseColor,
            opacity: highlight.size ? (isHighlighted ? 1 : 0.08) : 1,
            borderColor: isFocus ? "#fff" : isPinned ? "#00e5ff" : "transparent",
            borderWidth: isFocus ? 2 : isPinned ? 1 : 0,
          },
          label: {
            show: isFocus || isPinned,
            color: isDark ? "#eee" : "#222",
            position: "right",
            formatter: (params) => (params.name.length > 18 ? `${params.name.slice(0, 18)}...` : params.name),
          },
        });
      });

      const styledLinks = activeLinks.map((link) => {
        const active = !highlight.size || (highlight.has(link.source) && highlight.has(link.target));
        return Object.assign({}, link, {
          lineStyle: Object.assign({}, link.lineStyle || {}, {
            opacity: highlight.size ? (active ? Math.min(0.65, (link.lineStyle?.opacity || 0.25) + 0.15) : 0.03) : Math.min(0.25, link.lineStyle?.opacity || 0.25),
            color: isDark ? "#aaa" : "#666",
          }),
        });
      });

      chart.setOption(
        withReducedMotion({
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item",
            enterable: true,
            confine: true,
            extraCssText: "pointer-events:auto; max-width:340px;",
            formatter: (params) => {
              if (params.dataType === "edge") {
                return `<div style="max-width:200px; white-space:normal;"><strong>Connection</strong><br>Strength: ${Math.floor(params.value)}<br>${escapeHtml(params.data.reason || "")}</div>`;
              }
              return `<div style="max-width:260px; white-space:normal; word-wrap:break-word;">
                <strong>${escapeHtml(params.name)}</strong><br>
                <span style="opacity:0.8">Topic: ${escapeHtml(params.data.topic || "Other")}</span><br>
                <span style="opacity:0.8">Venue: ${escapeHtml(params.data.venue || "—")}</span><br>
                <span style="opacity:0.8">Year: ${escapeHtml(params.data.year || "—")} · Citations: ${params.value}</span>
                <div class="cite-tooltip-actions">${buildCitationButtons(params.data || {})}</div>
              </div>`;
            },
          },
          aria: { enabled: true, description: describeImpact(baseNodes, activeLinks) },
          series: [
            {
              type: "graph",
              layout: "force",
              roam: true,
              zoom: 0.75,
              data: styledNodes,
              links: styledLinks,
              force: { repulsion: 500, gravity: 0.1, edgeLength: [50, 300] },
              lineStyle: { color: isDark ? "#aaa" : "#666" },
            },
          ],
        }),
        false
      );
    }

    const controls = document.querySelector(".impact-map-controls");
    if (controls && !controls.dataset.bound) {
      controls.dataset.bound = "true";
      controls.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-impact-color]");
        if (!button) return;
        dashboardState.impact.colorMode = button.getAttribute("data-impact-color");
        controls.querySelectorAll(".impact-toggle").forEach((toggle) => {
          toggle.classList.toggle("is-active", toggle === button);
        });
        renderLegend();
        updateImpactGraph();
      });
      controls.querySelectorAll("input[data-impact-link]").forEach((input) => {
        input.addEventListener("change", () => {
          dashboardState.impact.linkTypes[input.getAttribute("data-impact-link")] = input.checked;
          updateImpactGraph();
        });
      });
    }

    if (inspectorEl && !inspectorEl.dataset.bound) {
      inspectorEl.dataset.bound = "true";
      inspectorEl.addEventListener("click", (event) => {
        const action = event.target.closest("[data-impact-action]");
        if (action) {
          const type = action.getAttribute("data-impact-action");
          if (type === "pin" && dashboardState.impact.focusId !== null) {
            dashboardState.impact.pinned.add(dashboardState.impact.focusId);
            renderPins();
            updateImpactGraph();
          }
          if (type === "clear") {
            dashboardState.impact.focusId = null;
            setInspector(null);
            updateImpactGraph();
          }
        }
        const remove = event.target.closest("[data-pin-remove]");
        if (remove) {
          dashboardState.impact.pinned.delete(Number(remove.getAttribute("data-pin-remove")));
          renderPins();
          updateImpactGraph();
        }
      });
    }

    chart.off("click");
    chart.on("click", (params) => {
      if (params.dataType !== "node") return;
      if (dashboardState.impact.focusId === params.data.id) {
        dashboardState.impact.focusId = null;
        setInspector(null);
      } else {
        dashboardState.impact.focusId = params.data.id;
        setInspector(params.data);
      }
      updateImpactGraph();
    });

    renderLegend();
    renderPins();
    setInspector(null);
    updateImpactGraph();
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

  function renderCollabNetwork(collaboration) {
    const dom = document.getElementById(IDS.COLLAB);
    if (!dom || !collaboration || !collaboration.ranges) return;
    if (dashboardState.charts.collab) dashboardState.charts.collab.dispose();
    const chart = window.echarts.init(dom, 'v5');
    dashboardState.charts.collab = chart;

    const rangeData = collaboration.ranges[dashboardState.collab.range] || collaboration.ranges.all || { nodes: [], links: [], authorMeta: {} };
    const nodeCounts = new Map((rangeData.nodes || []).map((node) => [node.id, node.count || 0]));
    const metaMap = rangeData.authorMeta || {};
    // Ben's node, whichever form of the name the data uses ("Benjamin M. Ampel" in the payload). A fixed "Benjamin Ampel"
    // never matched, so his node was not centered or drawn in white, and the color scale ran up to his own paper count.
    const myName = ((rangeData.nodes || []).find((node) => /^Benjamin (M\. )?Ampel$/.test(node.id)) || {}).id || "Benjamin M. Ampel";
    const maxCount = Math.max(...(rangeData.nodes || []).filter((node) => node.id !== myName).map((node) => node.count || 0), 1);

    const nameMap = {
      "B Ampel": myName,
      "BM Ampel": myName,
      "B. Ampel": myName,
      admin: myName,
    };

    const nodes = (rangeData.nodes || []).map((node) => ({
      id: node.id,
      name: node.id,
      value: node.count || 0,
      symbolSize: node.id === myName ? 60 : Math.max(18, Math.min(52, (node.count || 0) * 7)),
      fixed: node.id === myName,
      x: node.id === myName ? dom.clientWidth / 2 : null,
      y: node.id === myName ? dom.clientHeight / 2 : null,
    }));

    const links = (rangeData.links || []).map((link) => ({
      source: link.source,
      target: link.target,
      value: link.count,
      lineStyle: {
        width: Math.min(1.5 + (link.count * 0.8), 6),
        opacity: 0.6,
      },
    }));

    const spotlight = document.getElementById("collab-spotlight-meta");
    const spotlightBody = document.querySelector(".collab-spotlight-body");
    const spotlightTitle = document.querySelector(".collab-spotlight-title");

    function setSpotlight(name) {
      if (!spotlight || !spotlightBody || !spotlightTitle) return;
      if (!name || !metaMap[name]) {
        spotlightTitle.textContent = "Collaborator spotlight";
        spotlightBody.textContent = "Select a node to see their co-authorship footprint, top venues, and key connections.";
        spotlight.innerHTML = "";
        return;
      }
      const meta = metaMap[name];
      const years = Array.isArray(meta.years) ? meta.years.slice().sort() : [];
      const yearRange = years.length ? `${years[0]} - ${years[years.length - 1]}` : "—";
      const topVenues = Object.entries(meta.venues || {})
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map((entry) => entry[0])
        .join(", ") || "—";
      const topCoauthors = Object.entries(meta.coauthors || {})
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map((entry) => `${normalizeAuthor(nameMap, entry[0])} (${entry[1]})`)
        .join(", ") || "—";

      spotlightTitle.textContent = name;
      spotlightBody.textContent = `${meta.count || 0} co-authored papers`;
      spotlight.innerHTML = `
        <div class="collab-meta-row"><span>Active years</span><strong>${escapeHtml(yearRange)}</strong></div>
        <div class="collab-meta-row"><span>Top venues</span><strong>${escapeHtml(topVenues)}</strong></div>
        <div class="collab-meta-row"><span>Key co-authors</span><strong>${escapeHtml(topCoauthors)}</strong></div>
      `;
    }

    function getCollabColor(value, maxValue, isDark) {
      const ratio = Math.min(Math.max(((value || 0) - 1) / ((maxValue || 1) - 1 || 1), 0), 1);
      const hue = (1 - ratio) * 120;
      return isDark ? `hsl(${hue}, 90%, 60%)` : `hsl(${hue}, 80%, 40%)`;
    }

    function updateChart() {
      const isDark = document.body.classList.contains("dark");
      const neighborMap = new Map();
      links.forEach((link) => {
        if (!neighborMap.has(link.source)) neighborMap.set(link.source, new Set());
        if (!neighborMap.has(link.target)) neighborMap.set(link.target, new Set());
        neighborMap.get(link.source).add(link.target);
        neighborMap.get(link.target).add(link.source);
      });

      const highlight = new Set();
      if (dashboardState.collab.focusId) {
        highlight.add(dashboardState.collab.focusId);
        const neighbors = neighborMap.get(dashboardState.collab.focusId);
        if (neighbors) neighbors.forEach((value) => highlight.add(value));
      }

      const styledNodes = nodes.map((node) => {
        const active = !highlight.size || highlight.has(node.id);
        const isFocus = dashboardState.collab.focusId === node.id;
        const color = node.id === myName ? (isDark ? "#fff" : "#000") : getCollabColor(node.value, maxCount, isDark);
        return Object.assign({}, node, {
          itemStyle: {
            color,
            opacity: highlight.size ? (active ? 1 : 0.08) : 1,
            borderColor: isFocus ? "#00e5ff" : node.id === myName ? (isDark ? "#000" : "#fff") : "transparent",
            borderWidth: isFocus ? 2 : node.id === myName ? 2 : 0,
          },
          label: { show: node.value > 1 || node.id === myName || active, color: isDark ? "#eee" : "#333" },
        });
      });

      const styledLinks = links.map((link) => {
        const active = !highlight.size || (highlight.has(link.source) && highlight.has(link.target));
        return Object.assign({}, link, {
          lineStyle: Object.assign({}, link.lineStyle, {
            color: getCollabColor(link.value, maxCount, isDark),
            opacity: highlight.size ? (active ? 0.8 : 0.05) : link.lineStyle.opacity,
          }),
        });
      });

      chart.setOption(
        withReducedMotion({
          backgroundColor: "transparent",
          tooltip: {
            formatter: (params) =>
              params.dataType === "edge"
                ? `${escapeHtml(params.data.source)} & ${escapeHtml(params.data.target)}<br>${params.value} Papers`
                : `${escapeHtml(params.name)}: ${params.value} Papers`,
          },
          aria: { enabled: true, description: describeCollab(nodes, myName) },
          series: [
            {
              type: "graph",
              layout: "force",
              roam: true,
              zoom: 0.6,
              data: styledNodes,
              links: styledLinks,
              force: { repulsion: 800, gravity: 0.1, edgeLength: [30, 150] },
              lineStyle: { curveness: 0.2 },
            },
          ],
        }),
        false
      );
    }

    const chipRow = document.querySelector(".collab-chip-row");
    if (chipRow && !chipRow.dataset.bound) {
      chipRow.dataset.bound = "true";
      chipRow.querySelectorAll(".collab-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          dashboardState.collab.range = chip.getAttribute("data-collab-range");
          dashboardState.collab.focusId = null;
          chipRow.querySelectorAll(".collab-chip").forEach((other) => other.classList.toggle("is-active", other === chip));
          renderCollabNetwork(collaboration);
        });
      });
    }
    if (chipRow) {
      chipRow.querySelectorAll(".collab-chip").forEach((chip) => {
        chip.classList.toggle("is-active", chip.getAttribute("data-collab-range") === dashboardState.collab.range);
      });
    }

    chart.off("click");
    chart.on("click", (params) => {
      if (params.dataType !== "node") return;
      dashboardState.collab.focusId = dashboardState.collab.focusId === params.data.id ? null : params.data.id;
      setSpotlight(dashboardState.collab.focusId);
      updateChart();
    });

    setSpotlight(dashboardState.collab.focusId);
    updateChart();
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
