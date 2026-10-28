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

  // Titles, URLs, awards and names come from JSON; escape them so a quote or ampersand cannot break the markup.
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const normalizeTypeLabel = (value) => {
    const map = { journal: 'Journal', conference: 'Conference', workshop: 'Workshop' };
    return map[value] || value;
  };

  const buildCheckbox = (value, label, group) => {
    const id = `pub-filter-${group}-${String(value).replace(/[^a-z0-9]+/gi, '-')}`;
    return `
      <label for="${id}" class="pub-filter-option">
        <input type="checkbox" id="${id}" data-group="${group}" data-value="${esc(value)}">
        <span>${esc(label)}</span>
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
      ? chips.map((chip) => `<span class="pub-filter-chip">${esc(chip)}</span>`).join('')
      : '<span class="pub-filter-empty">No filters applied</span>';
  };

  const renderList = (items, total) => {
    const sorted = items.slice().sort((a, b) => {
      const yearDiff = (b.year || 0) - (a.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return String(a.title).localeCompare(String(b.title));
    });

    const PRESTIGE_VENUES = {
      'MIS Quarterly': ['FT50', 'UTD24'],
      'Journal of Management Information Systems': ['FT50'],
    };
    const badgesFor = (pub) => {
      const chips = (PRESTIGE_VENUES[pub.venue] || []).map(
        (b) => `<span class="pub-badge pub-badge--${b.toLowerCase()}" title="${b === 'FT50' ? 'Financial Times Top 50 journal' : 'UT Dallas Top 24 journal'}">${b}</span>`
      );
      if (pub.award) {
        chips.push(`<span class="pub-badge pub-badge--award" title="${esc(pub.award)}"><i class="fas fa-trophy" aria-hidden="true"></i> ${esc(pub.award)}</span>`);
      }
      return chips.length ? `<span class="pub-badges">${chips.join('')}</span>` : '';
    };

    listEl.innerHTML = sorted.map((pub) => {
      const authors = Array.isArray(pub.authors) ? esc(pub.authors.join(', ')) : '';
      const typeLabel = normalizeTypeLabel(pub.type || '');
      const meta = esc([pub.year, pub.venue, typeLabel].filter(Boolean).join(' · '));
      const title = pub.url
        ? `<a href="${esc(pub.url)}" class="pub-title">${esc(pub.title)}</a>`
        : `<span class="pub-title">${esc(pub.title)}</span>`;
      return `
        <div class="pub-item">
          ${title}${badgesFor(pub)}
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
    writeUrl();
  };

  // Filter state lives in the query string (?type=journal&year=2024&year=2023&venue=...&author=...) so a filtered list
  // can be reloaded or shared. Only these keys are touched; other parameters and the hash are kept.
  const GROUPS = ['type', 'year', 'venue', 'author'];

  const writeUrl = () => {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    let url;
    try {
      url = new URL(window.location.href);
    } catch (e) {
      return;
    }
    GROUPS.forEach((group) => url.searchParams.delete(group));
    // Checked boxes in page order, so the same selection always gives the same URL.
    root.querySelectorAll('input[type="checkbox"][data-group]:checked').forEach((input) => {
      if (GROUPS.includes(input.dataset.group)) url.searchParams.append(input.dataset.group, input.dataset.value);
    });
    const query = url.searchParams.toString();
    const next = url.pathname + (query ? `?${query}` : '') + url.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      try {
        window.history.replaceState(window.history.state, '', next);
      } catch (e) {
        /* ignore: some embedded or sandboxed contexts refuse history updates */
      }
    }
  };

  // Check the boxes named in the query string. Values that match no option are ignored.
  const readUrl = () => {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (e) {
      return false;
    }
    let restored = false;
    GROUPS.forEach((group) => {
      const wanted = new Set(params.getAll(group).map((v) => v.trim()).filter(Boolean));
      if (!wanted.size) return;
      root.querySelectorAll(`input[type="checkbox"][data-group="${group}"]`).forEach((input) => {
        if (!wanted.has(input.dataset.value)) return;
        input.checked = true;
        state[group].add(group === 'year' ? Number(input.dataset.value) : input.dataset.value);
        restored = true;
        // Show the option in a collapsed group (Venue, Co-author) so the restored choice is visible.
        const groupDetails = input.closest('details.pub-filter-group');
        if (groupDetails) groupDetails.open = true;
      });
    });
    if (restored) {
      const details = root.closest('details');
      if (details) details.open = true;
    }
    return restored;
  };

  (typeof loadPublications === 'function' ? loadPublications() : safeFetch('/data/publications.json')).then((raw) => {
    const items = Array.isArray(raw) ? raw : (raw && raw.publications) || [];
    if (!items.length) {
      // Keep the list rendered at build time if the catalog could not be fetched.
      if (!listEl.querySelector('.pub-item')) listEl.textContent = 'No publications available.';
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

    const clearState = () => {
      root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = false;
      });
      Object.keys(state).forEach((key) => state[key].clear());
    };

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        clearState();
        applyFilters(items);
      });
    }

    const applyExternalFilters = (detail) => {
      const payload = detail || {};
      if (!payload.type && !payload.year) return;

      // Ensure the wrapping <details> spoiler is open so results are visible
      const details = root.closest('details');
      if (details) details.open = true;

      clearState();

      if (payload.type) {
        const typeTarget = root.querySelector(`input[data-group=\"type\"][data-value=\"${payload.type}\"]`);
        if (typeTarget) {
          typeTarget.checked = true;
          state.type.add(payload.type);
        }
      }

      if (payload.year !== undefined && payload.year !== null) {
        const yearValue = Number(payload.year);
        const yearTarget = root.querySelector(`input[data-group=\"year\"][data-value=\"${yearValue}\"]`);
        if (yearTarget) {
          yearTarget.checked = true;
          state.year.add(yearValue);
        }
      }

      applyFilters(items);
    };

    window.addEventListener('pub-filter:apply', (event) => {
      applyExternalFilters(event.detail || {});
    });

    // Box states can survive a reload through the browser's form restore; start from the URL alone.
    clearState();
    readUrl();
    applyFilters(items);
  });
})();
