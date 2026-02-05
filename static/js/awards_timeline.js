(function () {
  const nodesEl = document.getElementById('awards-nodes');
  const detailEl = document.getElementById('awards-detail');
  if (!nodesEl || !detailEl) return;

  const safeFetch = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const toLabel = (item) => {
    if (item.endYear && Number.isFinite(Number(item.endYear))) {
      return `${item.year}-${item.endYear}`;
    }
    return `${item.year}`;
  };

  const normalize = (item) => ({
    year: Number(item.year),
    endYear: item.endYear ? Number(item.endYear) : null,
    title: item.title || '',
    category: (item.category || 'Recognition').toLowerCase(),
    detail: item.detail || ''
  });

  safeFetch('/data/awards.json').then((raw) => {
    const items = Array.isArray(raw) ? raw.map(normalize).filter((x) => Number.isFinite(x.year)) : [];
    if (!items.length) {
      detailEl.textContent = 'No awards data available.';
      return;
    }

    const grouped = new Map();
    items.forEach((item) => {
      const year = item.year;
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year).push(item);
    });

    const years = Array.from(grouped.keys()).sort((a, b) => a - b);

    const renderDetail = (year) => {
      const list = grouped.get(year) || [];
      const label = toLabel(list[0]);
      detailEl.innerHTML = `
        <div class="awards-detail-year">${label}</div>
        <div class="awards-detail-list">
          ${list.map((item) => `
            <div class="awards-detail-item">
              <span class="awards-badge ${item.category}">${item.category}</span>
              <div>
                <div class="awards-detail-title">${item.title}</div>
                ${item.detail ? `<div class="awards-detail-meta">${item.detail}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    };

    const setActive = (year) => {
      nodesEl.querySelectorAll('.awards-node').forEach((node) => {
        node.classList.toggle('active', Number(node.dataset.year) === year);
      });
      renderDetail(year);
    };

    years.forEach((year) => {
      const list = grouped.get(year) || [];
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'awards-node';
      node.dataset.year = String(year);
      node.innerHTML = `
        <span class="year">${toLabel(list[0])}</span>
        <span class="count">${list.length} item${list.length === 1 ? '' : 's'}</span>
      `;
      node.addEventListener('click', () => setActive(year));
      nodesEl.appendChild(node);
    });

    const lastYear = years[years.length - 1];
    setActive(lastYear);
    requestAnimationFrame(() => {
      nodesEl.scrollLeft = nodesEl.scrollWidth;
    });
  });
})();
