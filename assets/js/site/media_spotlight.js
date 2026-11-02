(function () {
  const root = document.getElementById('media-spotlight');
  if (!root) return;

  const summaryEl = document.getElementById('media-summary');
  const yearsEl = document.getElementById('media-years');
  const typesEl = document.getElementById('media-types');
  const featuredEl = document.getElementById('media-featured');
  const listEl = document.getElementById('media-list');

  const safeFetch = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // Text from media.json is set with textContent, never as markup. A url becomes a link only if it is https and not a
  // Google redirect or consent page (docs/media-tracker/design.md, Change S).
  const blockedHosts = ['news.google.com', 'www.google.com', 'consent.google.com'];
  const safeUrl = (value) => {
    const url = String(value || '').trim();
    if (!url.toLowerCase().startsWith('https://')) return '';
    try {
      return blockedHosts.includes(new URL(url).hostname) ? '' : url;
    } catch (e) {
      return '';
    }
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const normalize = (item) => {
    const rawDate = String(item.date || '');
    let dateObj = null;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    }

    // A YYYY-MM-DD date parses as UTC midnight; read it back in UTC so 1 January does not become December of the
    // year before in American time zones.
    const year = dateObj ? dateObj.getUTCFullYear() : null;
    const month = dateObj ? dateObj.getUTCMonth() : null;
    const dateLabel = dateObj ? `${monthNames[month]} ${year}` : '';

    return {
      title: item.title || '',
      outlet: item.outlet || '',
      type: item.type || 'Coverage',
      tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
      summary: item.summary || '',
      url: safeUrl(item.url),
      dateObj,
      year,
      dateLabel
    };
  };

  const slugify = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  safeFetch('/data/media.json').then((raw) => {
    const items = Array.isArray(raw) ? raw.map(normalize) : [];
    if (!items.length) {
      listEl.textContent = 'No media coverage available.';
      return;
    }

    items.sort((a, b) => (b.dateObj ? b.dateObj.getTime() : 0) - (a.dateObj ? a.dateObj.getTime() : 0));

    const outlets = new Set(items.map((item) => item.outlet).filter(Boolean));
    const years = Array.from(new Set(items.map((item) => item.year).filter((y) => Number.isFinite(y)))).sort((a, b) => b - a);
    const types = Array.from(new Set(items.map((item) => item.type)));

    summaryEl.textContent = `${items.length} mentions • ${outlets.size} outlets`;

    let activeYear = 'All';
    let activeType = 'All';

    const setActiveYear = (year) => {
      activeYear = year;
      yearsEl.querySelectorAll('.media-year').forEach((button) => {
        button.classList.toggle('active', button.dataset.year === String(year));
        button.setAttribute('aria-selected', button.dataset.year === String(year) ? 'true' : 'false');
      });
      render();
    };

    const setActiveType = (type) => {
      activeType = type;
      typesEl.querySelectorAll('.media-type').forEach((button) => {
        button.classList.toggle('active', button.dataset.type === type);
        button.setAttribute('aria-selected', button.dataset.type === type ? 'true' : 'false');
      });
      render();
    };

    const titleNode = (item, className) => {
      const node = el('div', className);
      if (item.url) {
        const link = el('a', 'media-title-link', item.title);
        link.href = item.url;
        link.rel = 'noopener';
        link.target = '_blank';
        node.appendChild(link);
      } else {
        node.textContent = item.title;
      }
      return node;
    };

    const tagsNode = (tags, className) => {
      const node = el('div', className);
      tags.forEach((tag) => node.appendChild(el('span', 'media-tag', String(tag))));
      return node;
    };

    const empty = (text) => {
      featuredEl.replaceChildren();
      listEl.replaceChildren(el('div', 'media-empty', text));
    };

    const render = () => {
      const filtered = items.filter((item) => (
        (activeYear === 'All' || String(item.year) === String(activeYear)) &&
        (activeType === 'All' || item.type === activeType)
      ));

      if (!filtered.length) {
        empty('No coverage matches those filters.');
        return;
      }

      const featured = filtered[0];
      const featuredMeta = [featured.outlet, featured.dateLabel, featured.type].filter(Boolean).join(' • ');
      const featuredNodes = [
        el('div', 'media-featured-label', 'Featured'),
        titleNode(featured, 'media-featured-title'),
        el('div', 'media-featured-meta', featuredMeta)
      ];
      if (featured.summary) featuredNodes.push(el('div', 'media-featured-summary', featured.summary));
      if (featured.tags.length) featuredNodes.push(tagsNode(featured.tags, 'media-featured-tags'));
      featuredEl.replaceChildren(...featuredNodes);

      const remaining = filtered.slice(1);
      if (!remaining.length) {
        listEl.replaceChildren(el('div', 'media-empty', 'Additional coverage coming soon.'));
        return;
      }

      listEl.replaceChildren(...remaining.map((item) => {
        const card = el('div', 'media-card');
        card.appendChild(titleNode(item, 'media-card-title'));
        card.appendChild(el('div', 'media-card-meta', [item.outlet, item.dateLabel, item.type].filter(Boolean).join(' • ')));
        if (item.summary) card.appendChild(el('div', 'media-card-summary', item.summary));
        if (item.tags.length) card.appendChild(tagsNode(item.tags, 'media-card-tags'));
        return card;
      }));
    };

    yearsEl.replaceChildren(...['All', ...years].map((year) => {
      const button = el('button', 'media-year', String(year));
      button.type = 'button';
      button.dataset.year = String(year);
      button.setAttribute('aria-selected', 'false');
      button.addEventListener('click', () => setActiveYear(button.dataset.year));
      return button;
    }));

    typesEl.replaceChildren(...['All', ...types].map((type) => {
      const button = el('button', 'media-type', type);
      const typeClass = slugify(type);
      if (typeClass) button.classList.add(typeClass);
      button.type = 'button';
      button.dataset.type = type;
      button.setAttribute('aria-selected', 'false');
      button.addEventListener('click', () => setActiveType(button.dataset.type));
      return button;
    }));

    setActiveYear('All');
    setActiveType('All');
  });
})();
