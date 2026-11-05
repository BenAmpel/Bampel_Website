(function () {
  const root = document.querySelector("[data-research-explorer]");
  if (!root) return;

  const nav = root.querySelector("[data-research-tabs]");
  const tabs = Array.from(root.querySelectorAll("[data-research-tab]"));
  const panels = Array.from(root.querySelectorAll("[data-research-panel]"));
  const status = root.querySelector("[data-research-status]");
  if (!nav || !tabs.length || tabs.length !== panels.length) return;

  const panelById = new Map(panels.map((panel) => [panel.id, panel]));
  const tabPanel = tabs.map((tab) => panelById.get(tab.hash.slice(1)));
  if (tabPanel.some((panel) => !panel)) return;

  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Research themes");
  tabs.forEach((tab, index) => {
    const panel = tabPanel[index];
    tab.id = `research-tab-${panel.id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.setAttribute("tabindex", "0");
  });

  root.dataset.enhanced = "true";

  const initialPanelId = window.location.hash.slice(1);
  const initialIndex = tabs.findIndex((tab) => tab.hash.slice(1) === initialPanelId);

  const activate = (index, { focus = false, updateHash = true } = {}) => {
    const activeTab = tabs[index];
    const activePanel = tabPanel[index];
    if (!activeTab || !activePanel) return;

    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    tabPanel.forEach((panel, panelIndex) => {
      const selected = panelIndex === index;
      panel.hidden = !selected;
      panel.classList.toggle("is-active", selected);
    });

    root.dataset.activeTrack = activePanel.id;
    if (status) {
      const title = activePanel.querySelector("h3")?.textContent.trim() || "Research theme";
      const paperCount = activePanel.querySelectorAll(".research-explorer-papers > li").length;
      status.textContent = `${title}. ${paperCount} selected papers.`;
    }

    if (updateHash && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", `#${activePanel.id}`);
    }
    if (focus) activeTab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      activate(index);
    });

    tab.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        activate(index);
        return;
      }
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;

      event.preventDefault();
      activate(nextIndex, { focus: true });
    });
  });

  activate(initialIndex >= 0 ? initialIndex : 0, { updateHash: false });
})();
