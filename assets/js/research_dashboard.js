(() => {
  const IDS = {
    WRAPPER: "dashboard-wrapper",
    LINE: "dashboard-timeline",
    MAP: "dashboard-impact-map",
    COLLAB: "dashboard-collab-network",
    FOOTPRINT: "dashboard-footprint-map",
    TOPICS: "dashboard-topics",
    CENTRALITY_LIST: "centrality-list",
    CENTRALITY_DENSITY: "centrality-density",
    CENTRALITY_PATH: "centrality-path",
    CENTRALITY_CLUSTER: "centrality-cluster",
    CENTRALITY_RADAR: "centrality-radar",
    CENTRALITY_NOTE: "centrality-note",
    FOCUS: "dash-metric-focus",
    TREND: "dash-metric-trend",
    CITES: "dash-metric-cites",
    HINDEX: "dash-metric-hindex",
    VISIT_TOTAL: "dash-visit-total",
    VISIT_MONTH: "dash-visit-month",
    VISIT_TREND: "dash-visit-trend",
    VISIT_MOMENTUM: "dash-visit-momentum",
    VISIT_GEO: "dash-visit-geo",
    VISIT_MINIMAP: "dash-visit-minimap",
    VISIT_REGION: "dash-visit-region",
    VISIT_LOCATIONS: "dash-visit-locations",
    VISIT_SPARK: "dash-geo-spark",
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
      visitTrend: null,
      centralityRadar: null,
    },
    maps: {
      footprint: null,
      mini: null,
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

  const topicPalette = ["#00ff41", "#00e5ff", "#e040fb", "#ffd166", "#ff6b35", "#7c4dff", "#4dd0e1", "#80cbc4"];
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
        loadScriptOnce(buildUrl("vendor/echarts/echarts.min.js"), () => window.echarts),
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
    return "#00ff41";
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

  function renderTopics(topics) {
    const el = document.getElementById(IDS.TOPICS);
    if (!el) return;
    if (!Array.isArray(topics) || !topics.length) {
      el.innerHTML = '<div style="opacity:0.6; font-size:0.7rem;">Topic model unavailable.</div>';
      return;
    }
    const top = topics.slice(0, 6);
    const maxWeight = Math.max(...top.map((topic) => topic.weight || 0), 1);
    el.innerHTML = top
      .map((topic) => {
        const pct = Math.max(8, Math.round(((topic.weight || 0) / maxWeight) * 100));
        const keywords = Array.isArray(topic.keywords) ? topic.keywords.slice(0, 5).join(", ") : "";
        return `<div class="profile-topic-card">
          <div class="profile-topic-header">
            <div class="profile-topic-title">${escapeHtml(topic.label || "Topic")}</div>
            <div class="profile-topic-weight">${Math.round((topic.weight || 0) * 100)}%</div>
          </div>
          <div class="profile-topic-bar"><span style="width:${pct}%"></span></div>
          <div class="profile-topic-terms">${escapeHtml(keywords)}</div>
        </div>`;
      })
      .join("");
  }

  function renderMetricSummary(payload) {
    updateText(IDS.FOCUS, payload.metrics.primaryFocus || "Cybersecurity");
    updateText(IDS.TREND, payload.metrics.emergingFocus || "AI / Deep Learning");
    updateText(IDS.CITES, String((payload.scholar.metrics && payload.scholar.metrics.citations) || 0));
    updateText(IDS.HINDEX, String((payload.scholar.metrics && payload.scholar.metrics.hIndex) || 0));
  }

  function renderLine(history) {
    const dom = document.getElementById(IDS.LINE);
    if (!dom || !history || !history.length) return;
    if (dashboardState.charts.line) dashboardState.charts.line.dispose();
    const chart = window.echarts.init(dom);
    dashboardState.charts.line = chart;
    const isDark = document.body.classList.contains("dark");
    chart.setOption(
      withReducedMotion({
        tooltip: { trigger: "axis", formatter: "{b}: {c} Citations" },
        aria: { enabled: true, description: "Citation velocity by year." },
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
    const chart = window.echarts.init(dom);
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
          aria: { enabled: true, description: "Impact map linking publications by topic, venue, and co-authorship." },
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

  function renderCentrality(centrality) {
    if (!centrality || !Array.isArray(centrality.papers)) return;
    updateText(IDS.CENTRALITY_DENSITY, (centrality.metrics && centrality.metrics.density) || "--");
    updateText(IDS.CENTRALITY_PATH, (centrality.metrics && centrality.metrics.avgPath) || "--");
    updateText(IDS.CENTRALITY_CLUSTER, (centrality.metrics && centrality.metrics.clustering) || "--");

    const listEl = document.getElementById(IDS.CENTRALITY_LIST);
    if (!listEl) return;

    const metricKey = dashboardState.centrality.metric;
    const labelMap = { eigen: "Influence", between: "Bridge", degree: "Hub" };
    const sorted = centrality.papers
      .slice()
      .sort((left, right) => (right[metricKey] || 0) - (left[metricKey] || 0))
      .slice(0, 8);
    const maxValue = Math.max(...sorted.map((item) => item[metricKey] || 0), 1);

    listEl.innerHTML = sorted
      .map((item, index) => {
        const pct = Math.max(8, Math.round(((item[metricKey] || 0) / maxValue) * 100));
        const pills = [];
        if ((item.citations || 0) >= (centrality.thresholds && centrality.thresholds.citation || 0)) pills.push("High impact");
        if ((item.topicLinks || 0) >= (centrality.thresholds && centrality.thresholds.topic || 0)) pills.push("Topic dense");
        if ((item.authorLinks || 0) >= (centrality.thresholds && centrality.thresholds.author || 0)) pills.push("Coauthor bridge");
        return `<div class="centrality-item" tabindex="0" data-centrality-index="${item.index}">
          <div class="centrality-bar" style="width:${pct}%"></div>
          <div class="centrality-item-header">
            <div class="centrality-rank">${index + 1}</div>
            <div class="centrality-main">
              <div class="centrality-title">${escapeHtml(item.title || "Untitled")}</div>
              <div class="centrality-meta">
                <span>${escapeHtml(item.year || "—")}</span>
                <span>${escapeHtml(item.venue || "—")}</span>
                <span>${labelMap[metricKey]} ${Number(item[metricKey] || 0).toFixed(2)}</span>
              </div>
              <div class="centrality-pills">${pills.map((pill) => `<span class="centrality-pill">${escapeHtml(pill)}</span>`).join("")}</div>
            </div>
          </div>
        </div>`;
      })
      .join("");

    const radarEl = document.getElementById(IDS.CENTRALITY_RADAR);
    if (radarEl && dashboardState.charts.centralityRadar) {
      dashboardState.charts.centralityRadar.dispose();
      dashboardState.charts.centralityRadar = null;
    }

    const noteEl = document.getElementById(IDS.CENTRALITY_NOTE);
    const renderRadar = (paper) => {
      if (!paper || !radarEl) return;
      if (!dashboardState.charts.centralityRadar) {
        dashboardState.charts.centralityRadar = window.echarts.init(radarEl);
      }
      const chart = dashboardState.charts.centralityRadar;
      const maxTopic = (centrality.maxLinks && centrality.maxLinks.topic) || 1;
      const maxVenue = (centrality.maxLinks && centrality.maxLinks.venue) || 1;
      const maxAuthor = (centrality.maxLinks && centrality.maxLinks.author) || 1;
      chart.setOption(
        withReducedMotion({
          radar: {
            indicator: [
              { name: "Topics", max: maxTopic },
              { name: "Venues", max: maxVenue },
              { name: "Authors", max: maxAuthor },
            ],
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
            axisLine: { lineStyle: { color: "rgba(255,255,255,0.2)" } },
            axisName: { color: "#bde8ff", fontSize: 10 },
          },
          series: [
            {
              type: "radar",
              data: [
                {
                  value: [paper.topicLinks || 0, paper.venueLinks || 0, paper.authorLinks || 0],
                  areaStyle: { color: "rgba(0,229,255,0.18)" },
                  lineStyle: { color: "#00e5ff" },
                  itemStyle: { color: "#00e5ff" },
                },
              ],
            },
          ],
        })
      );
      if (noteEl) {
        noteEl.textContent = `${paper.title} | topic links ${paper.topicLinks || 0}, venue links ${paper.venueLinks || 0}, author links ${paper.authorLinks || 0}`;
      }
    };

    listEl.querySelectorAll(".centrality-item").forEach((itemEl) => {
      const targetIndex = Number(itemEl.getAttribute("data-centrality-index"));
      const paper = centrality.papers.find((entry) => entry.index === targetIndex);
      const activate = () => renderRadar(paper);
      itemEl.addEventListener("mouseenter", activate);
      itemEl.addEventListener("focusin", activate);
    });

    renderRadar(sorted[0]);

    document.querySelectorAll(".centrality-tab").forEach((tab) => {
      if (tab.dataset.bound) return;
      tab.dataset.bound = "true";
      tab.addEventListener("click", () => {
        dashboardState.centrality.metric = tab.getAttribute("data-centrality-tab");
        document.querySelectorAll(".centrality-tab").forEach((other) => {
          const active = other === tab;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-selected", active ? "true" : "false");
        });
        renderCentrality(centrality);
      });
    });
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
    const chart = window.echarts.init(dom);
    dashboardState.charts.collab = chart;

    const rangeData = collaboration.ranges[dashboardState.collab.range] || collaboration.ranges.all || { nodes: [], links: [], authorMeta: {} };
    const nodeCounts = new Map((rangeData.nodes || []).map((node) => [node.id, node.count || 0]));
    const metaMap = rangeData.authorMeta || {};
    const maxCount = Math.max(...(rangeData.nodes || []).filter((node) => node.id !== "Benjamin Ampel").map((node) => node.count || 0), 1);

    const myName = "Benjamin Ampel";
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
          aria: { enabled: true, description: "Collaboration network showing co-authorship connections." },
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
    state.lightTiles = window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 18,
    });
    state.darkTiles = window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 18 });
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
      labelEl.textContent = `Up to ${state.year}`;
      if (!rangeEl.dataset.bound) {
        rangeEl.dataset.bound = "true";
        rangeEl.addEventListener("input", () => {
          state.year = Number(rangeEl.value);
          labelEl.textContent = `Up to ${state.year}`;
          window.requestAnimationFrame(applyFilters);
        });
      }
    }

    const legendEl = document.getElementById("footprint-legend");
    if (legendEl) {
      legendEl.innerHTML = [
        `<div class="legend-row"><span class="footprint-legend-dot" style="--legend-color:#00ff41;"></span><span>Conference</span></div>`,
        `<div class="legend-row"><span class="footprint-legend-dot" style="--legend-color:#00bfff;"></span><span>Collaboration</span></div>`,
        `<div class="legend-row"><span class="footprint-legend-dot" style="--legend-color:#ff6b35;"></span><span>Institution</span></div>`,
      ].join("");
    }

    function createIcon(category) {
      const lower = String(category || "Collaboration").toLowerCase();
      const color = category === "Conference" ? "#00ff41" : category === "Institution" ? "#ff6b35" : "#00bfff";
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

  function renderVisitorStats(visitor) {
    if (!visitor) return;
    updateText(IDS.VISIT_TOTAL, String(visitor.lifetimeTotal || 0));
    updateText(IDS.VISIT_MONTH, String(visitor.totalLast30Days || 0));

    const domTrend = document.getElementById(IDS.VISIT_TREND);
    if (domTrend && Array.isArray(visitor.monthlyTrend) && visitor.monthlyTrend.length) {
      if (dashboardState.charts.visitTrend) dashboardState.charts.visitTrend.dispose();
      const chart = window.echarts.init(domTrend);
      dashboardState.charts.visitTrend = chart;
      const months = visitor.monthlyTrend.map((item) => item.month);
      const visitors = visitor.monthlyTrend.map((item) => item.visitors);
      const maxVal = Math.max(...visitors, 0);

      const formatMonth = (value) => {
        const str = String(value || "");
        if (str.length === 6) {
          const year = Number(str.slice(0, 4));
          const month = Number(str.slice(4)) - 1;
          return new Date(year, month, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
        }
        return str;
      };

      chart.setOption(
        withReducedMotion({
          tooltip: {
            trigger: "axis",
            formatter: (params) => {
              const point = params.find((item) => item.seriesType === "bar") || params[0];
              const value = point.data && point.data.value !== undefined ? point.data.value : point.data;
              return `${point.axisValueLabel}: ${value} visitors`;
            },
          },
          aria: { enabled: true, description: "Traffic trend showing visitors per month." },
          grid: { top: 10, right: 10, bottom: 20, left: 10, containLabel: false },
          xAxis: { show: false, data: months.map(formatMonth) },
          yAxis: { show: false, type: "value" },
          series: [
            {
              type: "bar",
              data: visitors.map((value) => ({
                value,
                itemStyle: { color: value === maxVal ? "#00ff41" : "#00c853" },
              })),
              itemStyle: { borderRadius: [2, 2, 0, 0] },
              barWidth: "60%",
            },
            {
              type: "line",
              data: visitors,
              smooth: true,
              symbol: "circle",
              symbolSize: 4,
              lineStyle: { color: "#00e5ff", width: 2 },
              itemStyle: { color: "#00e5ff" },
              areaStyle: { color: "rgba(0,229,255,0.15)" },
            },
          ],
        })
      );

      const momentumEl = document.getElementById(IDS.VISIT_MOMENTUM);
      if (momentumEl) {
        const sorted = visitor.monthlyTrend.slice().sort((left, right) => String(left.month).localeCompare(String(right.month)));
        let valueText = "—";
        let className = "dash-momentum is-flat";
        if (sorted.length >= 2) {
          const last = sorted[sorted.length - 1].visitors || 0;
          const previous = sorted[sorted.length - 2].visitors || 0;
          if (previous === 0 && last > 0) {
            valueText = "+100%";
            className = "dash-momentum is-up";
          } else if (previous > 0) {
            const change = ((last - previous) / previous) * 100;
            valueText = `${change > 0 ? "+" : ""}${change.toFixed(0)}%`;
            className = change > 1 ? "dash-momentum is-up" : change < -1 ? "dash-momentum is-down" : "dash-momentum is-flat";
          } else {
            valueText = "0%";
          }
        }
        momentumEl.className = className;
        momentumEl.innerHTML = `<span>${valueText}</span><span>vs last month</span>`;
      }
    }

    const geoEl = document.getElementById(IDS.VISIT_GEO);
    const regionEl = document.getElementById(IDS.VISIT_REGION);
    const locsEl = document.getElementById(IDS.VISIT_LOCATIONS);
    const sparkEl = document.getElementById(IDS.VISIT_SPARK);
    const miniMapEl = document.getElementById(IDS.VISIT_MINIMAP);
    const geoTabs = document.querySelectorAll(".dash-geo-tab");

    const buildSparkline = (values, highlightCount) => {
      if (!sparkEl || !values.length) return;
      const width = 180;
      const height = 28;
      const maxValue = Math.max(...values, 1);
      const points = values.map((value, index) => {
        const x = (index / (values.length - 1 || 1)) * (width - 8) + 4;
        const y = height - 4 - (value / maxValue) * (height - 8);
        return `${x},${y}`;
      });
      const highlightPoints = points.slice(Math.max(0, values.length - highlightCount)).join(" ");
      sparkEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <polyline points="${points.join(" ")}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"></polyline>
        <polyline points="${highlightPoints}" fill="none" stroke="#00e5ff" stroke-width="2.5"></polyline>
      </svg>`;
    };

    function updateMiniMap(items) {
      if (!miniMapEl || !window.L) return;
      const top3 = items.slice(0, 3).filter((item) => typeof item.lat === "number" && typeof item.lng === "number");
      if (!top3.length) {
        miniMapEl.classList.remove("is-ready");
        return;
      }

      const mapInner = miniMapEl.querySelector(".dash-mini-map-inner") || miniMapEl;
      if (!dashboardState.maps.mini) {
        dashboardState.maps.mini = window.L.map(mapInner, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false,
        });
        const tiles = document.body.classList.contains("dark")
          ? window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd" })
          : window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd" });
        tiles.addTo(dashboardState.maps.mini);
      }

      if (miniMapEl._markers) {
        dashboardState.maps.mini.removeLayer(miniMapEl._markers);
      }
      const group = window.L.featureGroup();
      top3.forEach((item) => {
        window.L.circleMarker([item.lat, item.lng], {
          radius: 5,
          color: "#e040fb",
          fillColor: "#e040fb",
          fillOpacity: 0.85,
          weight: 0,
        }).addTo(group);
      });
      group.addTo(dashboardState.maps.mini);
      miniMapEl._markers = group;
      dashboardState.maps.mini.fitBounds(group.getBounds().pad(0.4));
      miniMapEl.classList.add("is-ready");
    }

    function updateGeo(rangeKey) {
      const data = (visitor.ranges && visitor.ranges[rangeKey]) || { locations: [], usPct: 0, intlPct: 0, topRegion: "—" };
      const topList = (data.locations || []).slice(0, 6);

      if (locsEl) {
        locsEl.innerHTML = topList.length
          ? topList
              .map((item) => `<div class="dash-location-chip">${escapeHtml(item.display)} <span>${item.visitors}</span></div>`)
              .join("")
          : '<span style="opacity:0.5">No location data</span>';
      }

      if (geoEl) {
        geoEl.innerHTML = `
          <div class="dash-geo-labels"><span>US ${data.usPct || 0}%</span><span>International ${data.intlPct || 0}%</span></div>
          <div class="dash-geo-bar">
            <span class="dash-geo-us" style="width:${data.usPct || 0}%"></span>
            <span class="dash-geo-intl" style="width:${data.intlPct || 0}%"></span>
          </div>
        `;
      }

      if (regionEl) {
        regionEl.textContent = `Top Region: ${data.topRegion || "—"}`;
      }

      if (Array.isArray(visitor.monthlyTrend) && visitor.monthlyTrend.length) {
        const values = visitor.monthlyTrend.slice(-12).map((item) => item.visitors || 0);
        const highlightCount = rangeKey === "30" ? 1 : rangeKey === "90" ? 3 : values.length;
        buildSparkline(values, Math.min(values.length, highlightCount));
      }

      updateMiniMap(data.topThreeWithCoords || []);
    }

    geoTabs.forEach((tab) => {
      if (tab.dataset.bound) return;
      tab.dataset.bound = "true";
      tab.addEventListener("click", () => {
        geoTabs.forEach((other) => {
          const active = other === tab;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-selected", active ? "true" : "false");
        });
        updateGeo(tab.getAttribute("data-geo-range"));
      });
    });

    updateGeo("30");
  }

  function refreshLayout() {
    const charts = dashboardState.charts;
    Object.values(charts).forEach((chart) => {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
    if (dashboardState.maps.footprint) dashboardState.maps.footprint.invalidateSize();
    if (dashboardState.maps.mini) dashboardState.maps.mini.invalidateSize();
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
          renderTopics(payload.topics || []);
          renderImpactMap(payload.impactGraph || {});
          renderCentrality(payload.network && payload.network.centrality);
          renderCollabNetwork(payload.network && payload.network.collaboration);
          renderFootprintMap(payload.footprint || {});
          renderVisitorStats(payload.visitor || {});
          refreshLayout();
        });
      })
      .catch((error) => console.error("Dashboard Error:", error));
  }

  const dashboardDetails = wrapper.closest("details");
  if (dashboardDetails) {
    dashboardDetails.addEventListener("toggle", () => {
      if (dashboardDetails.open) initDashboard();
    });
    if (dashboardDetails.open) initDashboard();
  } else if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        initDashboard();
        observer.disconnect();
      }
    });
    observer.observe(wrapper);
  } else {
    initDashboard();
  }
})();
