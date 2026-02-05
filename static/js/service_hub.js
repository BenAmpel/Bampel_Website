(function () {
  const root = document.getElementById('service-hub');
  if (!root) return;

  const spanEl = document.getElementById('service-span');
  const totalEl = document.getElementById('service-total');
  const totalMetaEl = document.getElementById('service-total-meta');
  const activeEl = document.getElementById('service-active');
  const activeMetaEl = document.getElementById('service-active-meta');
  const editorialEl = document.getElementById('service-editorial');
  const editorialMetaEl = document.getElementById('service-editorial-meta');
  const communityEl = document.getElementById('service-community');
  const categoriesEl = document.getElementById('service-categories');
  const gridEl = document.getElementById('service-grid');
  const toggleEl = document.getElementById('service-toggle');

  const safeFetch = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const normalize = (item) => ({
    category: item.category || 'Other',
    role: item.role || 'Contributor',
    venue: item.venue || '',
    institution: item.institution || '',
    startYear: Number.isFinite(Number(item.startYear)) ? Number(item.startYear) : null,
    endYear: Number.isFinite(Number(item.endYear)) ? Number(item.endYear) : null
  });

  const formatSpan = (item) => {
    if (item.startYear && item.endYear) {
      return item.startYear === item.endYear ? `${item.startYear}` : `${item.startYear}-${item.endYear}`;
    }
    if (item.startYear && !item.endYear) {
      return `${item.startYear}-Present`;
    }
    if (!item.startYear && item.endYear) {
      return `${item.endYear}`;
    }
    return 'Ongoing';
  };

  const isActive = (item, currentYear) => {
    if (!item.startYear && !item.endYear) return true;
    if (!item.endYear) return true;
    return item.endYear >= currentYear;
  };

  safeFetch('/data/service.json').then((raw) => {
    const items = Array.isArray(raw) ? raw.map(normalize) : [];
    if (!items.length) {
      gridEl.textContent = 'No service data available.';
      return;
    }

    const currentYear = new Date().getFullYear();
    const categories = Array.from(new Set(items.map((item) => item.category)));
    const categoryCounts = new Map();
    categories.forEach((category) => {
      categoryCounts.set(category, items.filter((item) => item.category === category).length);
    });

    const total = items.length;
    const active = items.filter((item) => isActive(item, currentYear)).length;
    const editorialCount = items.filter((item) => item.category === 'Editorial').length;
    const communityCount = items.filter((item) => item.category === 'Program Committee' || item.category === 'Reviewing').length;

    const years = items
      .map((item) => item.startYear)
      .filter((year) => Number.isFinite(year));
    const minYear = years.length ? Math.min(...years) : null;

    totalEl.textContent = total;
    totalMetaEl.textContent = `${categories.length} categories`;
    activeEl.textContent = active;
    activeMetaEl.textContent = `${active} active roles`;
    editorialEl.textContent = editorialCount;
    editorialMetaEl.textContent = `${editorialCount} appointments`;
    communityEl.textContent = communityCount;

    if (minYear) {
      spanEl.textContent = `Service span: ${minYear}-${currentYear}`;
    }

    let activeCategory = categories[0];
    let activeOnly = false;

    const renderGrid = () => {
      const filtered = items.filter((item) => item.category === activeCategory)
        .filter((item) => (activeOnly ? isActive(item, currentYear) : true))
        .sort((a, b) => {
          const aKey = a.startYear || a.endYear || 0;
          const bKey = b.startYear || b.endYear || 0;
          return bKey - aKey;
        });

      if (!filtered.length) {
        gridEl.innerHTML = `<div class="service-empty">No active roles in ${activeCategory}.</div>`;
        return;
      }

      gridEl.innerHTML = filtered.map((item) => {
        const span = formatSpan(item);
        const activeLabel = isActive(item, currentYear) ? '<span class="service-pill active">Active</span>' : '';
        const metaBits = [item.venue, item.institution].filter(Boolean).join(' • ');
        return `
          <div class="service-item">
            <div class="service-item-header">
              <div>
                <div class="service-role">${item.role}</div>
                <div class="service-venue">${metaBits}</div>
              </div>
              <div class="service-meta">
                <span class="service-pill">${span}</span>
                ${activeLabel}
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const setActiveCategory = (category) => {
      activeCategory = category;
      categoriesEl.querySelectorAll('.service-category').forEach((button) => {
        button.classList.toggle('active', button.dataset.category === category);
        button.setAttribute('aria-selected', button.dataset.category === category ? 'true' : 'false');
      });
      renderGrid();
    };

    categoriesEl.innerHTML = categories.map((category) => {
      const count = categoryCounts.get(category) || 0;
      return `
        <button class="service-category" type="button" data-category="${category}" aria-selected="false">
          <span>${category}</span>
          <span class="count">${count}</span>
        </button>
      `;
    }).join('');

    categoriesEl.querySelectorAll('.service-category').forEach((button) => {
      button.addEventListener('click', () => setActiveCategory(button.dataset.category));
    });

    toggleEl.addEventListener('click', () => {
      activeOnly = !activeOnly;
      toggleEl.classList.toggle('active', activeOnly);
      toggleEl.setAttribute('aria-pressed', activeOnly ? 'true' : 'false');
      toggleEl.textContent = activeOnly ? 'Showing active only' : 'Show active only';
      renderGrid();
    });

    setActiveCategory(activeCategory);
  });
})();
