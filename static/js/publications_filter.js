(function () {
  const root = document.getElementById('pub-filter');
  if (!root) return;

  const typeEl = document.getElementById('pub-filter-type');
  const yearEl = document.getElementById('pub-filter-year');
  const venueEl = document.getElementById('pub-filter-venue');
  const authorEl = document.getElementById('pub-filter-author');
  const countEl = document.getElementById('pub-filter-count');
  const summaryEl = document.getElementById('pub-filter-summary');
  const listEl = document.getElementById('pub-filter-list');
  const resetButton = root.querySelector('.pub-filter-reset');

  const state = {
    type: new Set(),
    year: new Set(),
    venue: new Set(),
    author: new Set()
  };

  const safeFetch = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const normalizeTypeLabel = (value) => {
    const map = { journal: 'Journal', conference: 'Conference', workshop: 'Workshop' };
    return map[value] || value;
  };

  const buildCheckbox = (value, label, group) => {
    const id = `pub-filter-${group}-${String(value).replace(/[^a-z0-9]+/gi, '-')}`;
    return `
      <label for="${id}" class="pub-filter-option">
        <input type="checkbox" id="${id}" data-group="${group}" data-value="${value}">
        <span>${label}</span>
      </label>
    `;
  };

  const updateSummary = () => {
    const chips = [];
    state.type.forEach((val) => chips.push(`Type: ${normalizeTypeLabel(val)}`));
    state.year.forEach((val) => chips.push(`Year: ${val}`));
    state.venue.forEach((val) => chips.push(`Venue: ${val}`));
    state.author.forEach((val) => chips.push(`Co-author: ${val}`));
    summaryEl.innerHTML = chips.length
      ? chips.map((chip) => `<span class="pub-filter-chip">${chip}</span>`).join('')
      : '<span class="pub-filter-empty">No filters applied</span>';
  };

  const renderList = (items, total) => {
    const sorted = items.slice().sort((a, b) => {
      const yearDiff = (b.year || 0) - (a.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return String(a.title).localeCompare(String(b.title));
    });

    listEl.innerHTML = sorted.map((pub) => {
      const authors = Array.isArray(pub.authors) ? pub.authors.join(', ') : '';
      const typeLabel = normalizeTypeLabel(pub.type || '');
      const meta = [pub.year, pub.venue, typeLabel].filter(Boolean).join(' · ');
      const title = pub.url
        ? `<a href="${pub.url}" class="pub-title">${pub.title}</a>`
        : `<span class="pub-title">${pub.title}</span>`;
      return `
        <div class="pub-item">
          ${title}
          <div class="pub-meta">${meta}</div>
          <div class="pub-authors">${authors}</div>
        </div>
      `;
    }).join('');

    countEl.textContent = `${items.length} of ${total}`;
  };

  const applyFilters = (items) => {
    const filtered = items.filter((pub) => {
      if (state.type.size && !state.type.has(pub.type)) return false;
      if (state.year.size && !state.year.has(pub.year)) return false;
      if (state.venue.size && !state.venue.has(pub.venue)) return false;
      if (state.author.size) {
        const authors = Array.isArray(pub.authors) ? pub.authors : [];
        const hasAuthor = authors.some((a) => state.author.has(a));
        if (!hasAuthor) return false;
      }
      return true;
    });
    updateSummary();
    renderList(filtered, items.length);
  };

  safeFetch('/data/publications.json').then((raw) => {
    const items = Array.isArray(raw) ? raw : (raw && raw.publications) || [];
    if (!items.length) {
      listEl.textContent = 'No publications available.';
      return;
    }

    const types = Array.from(new Set(items.map((p) => p.type).filter(Boolean)));
    const years = Array.from(new Set(items.map((p) => p.year).filter(Boolean))).sort((a, b) => b - a);
    const venues = Array.from(new Set(items.map((p) => p.venue).filter(Boolean))).sort();
    const authors = Array.from(new Set(items.flatMap((p) => p.authors || [])))
      .filter((name) => !/ampel/i.test(name))
      .sort();

    typeEl.innerHTML = types.map((val) => buildCheckbox(val, normalizeTypeLabel(val), 'type')).join('');
    yearEl.innerHTML = years.map((val) => buildCheckbox(val, val, 'year')).join('');
    venueEl.innerHTML = venues.map((val) => buildCheckbox(val, val, 'venue')).join('');
    authorEl.innerHTML = authors.map((val) => buildCheckbox(val, val, 'author')).join('');

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const group = target.dataset.group;
      const value = target.dataset.value;
      if (!group || value === undefined) return;
      const set = state[group];
      if (!set) return;
      const parsedValue = group === 'year' ? Number(value) : value;
      if (target.checked) {
        set.add(parsedValue);
      } else {
        set.delete(parsedValue);
      }
      applyFilters(items);
    });

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.checked = false;
        });
        Object.keys(state).forEach((key) => state[key].clear());
        applyFilters(items);
      });
    }

    applyFilters(items);
  });
})();
