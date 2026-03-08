(function () {
  const root = document.querySelector("[data-impact-stats]");
  if (!root) return;

  const cards = Array.from(root.querySelectorAll(".impact-card"));
  const updatedEl = root.querySelector("[data-impact-updated]");
  const latestYearEl = root.querySelector("[data-impact-latest-year]");
  const latestYearFilterEl = root.querySelector("[data-impact-latest-filter]");
  const latestYearCountEl = root.querySelector("[data-impact-latest-count]");
  const baseUrl = root.getAttribute("data-baseurl") || "/";
  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const normalizeBase = (value) => {
    if (!value) return "/";
    return value.endsWith("/") ? value : `${value}/`;
  };

  const base = normalizeBase(baseUrl);

  const safeFetch = (url) =>
    fetch(url, { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

  const animateValue = (el, value) => {
    if (prefersReducedMotion) {
      el.textContent = String(value);
      return;
    }

    const duration = 900;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = String(Math.round(value * progress));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const setProgress = (card, value, total) => {
    const bar = card.querySelector("[data-progress]");
    if (!bar) return;
    const ratio = total > 0 ? Math.min(value / total, 1) : 0;
    bar.style.transform = `scaleX(${ratio})`;
  };

  const triggerFilter = (detail) => {
    if (!detail) return;
    const publications = document.getElementById("publications");
    if (publications) {
      publications.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
    window.dispatchEvent(new CustomEvent("pub-filter:apply", { detail }));
  };

  const updateCard = (metricKey, metric) => {
    const card = cards.find((item) => item.dataset.metric === metricKey);
    if (!card || !metric) return;

    const valueEl = card.querySelector("[data-value]");
    const metaEl = card.querySelector("[data-meta]");
    if (valueEl && !card.dataset.animated) {
      animateValue(valueEl, metric.value || 0);
      card.dataset.animated = "true";
    }
    if (metaEl) metaEl.textContent = metric.meta || "";
    if (metric.tooltip) card.dataset.tooltip = metric.tooltip;
    setProgress(card, metric.value || 0, metric.base || 1);
  };

  cards.forEach((card) => {
    const filterType = card.dataset.filterType;
    const labelText = card.querySelector(".impact-label")
      ? card.querySelector(".impact-label").textContent.trim()
      : "Impact metric";
    const tooltip = card.dataset.tooltip;
    const actionHint = filterType ? "Press Enter to filter publications." : "";
    card.setAttribute("aria-label", [labelText, tooltip, actionHint].filter(Boolean).join(" "));

    if (!filterType) {
      card.setAttribute("role", "group");
      return;
    }

    card.setAttribute("role", "button");
    card.addEventListener("click", () => triggerFilter({ type: filterType }));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        triggerFilter({ type: filterType });
      }
    });
  });

  safeFetch(`${base}data/dashboard_payload.json`).then((payload) => {
    if (!payload || !payload.impactStats) return;

    const stats = payload.impactStats;
    if (updatedEl) updatedEl.textContent = `Updated ${stats.updatedLabel || "Recent"}`;
    if (latestYearEl) latestYearEl.textContent = stats.latestYear ? String(stats.latestYear) : "--";

    if (latestYearCountEl) {
      if (stats.latestYearCount) {
        latestYearCountEl.hidden = false;
        latestYearCountEl.textContent = `${stats.latestYearCount} paper${stats.latestYearCount === 1 ? "" : "s"}`;
      } else {
        latestYearCountEl.hidden = true;
      }
    }

    if (latestYearFilterEl) {
      if (stats.latestYear) {
        latestYearFilterEl.disabled = false;
        latestYearFilterEl.setAttribute("aria-disabled", "false");
        latestYearFilterEl.title = `Filter publications to ${stats.latestYear}`;
        latestYearFilterEl.addEventListener("click", () => {
          triggerFilter({ year: Number(stats.latestYear) });
        });
      } else {
        latestYearFilterEl.disabled = true;
        latestYearFilterEl.setAttribute("aria-disabled", "true");
      }
    }

    [
      "journals",
      "conferences",
      "workshops",
      "best-paper",
      "q1",
      "ft50",
      "utd24",
    ].forEach((metricKey) => updateCard(metricKey, stats[metricKey]));
  });
})();
