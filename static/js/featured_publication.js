(function () {
  const root = document.querySelector('[data-featured-publication]');
  if (!root) return;

  const titleEl = root.querySelector('[data-featured-title]');
  const abstractEl = root.querySelector('[data-featured-abstract]');
  const metaEl = root.querySelector('[data-featured-meta]');
  const linkEl = root.querySelector('[data-featured-link]');
  const updatedEl = root.querySelector('[data-featured-updated]');

  const baseUrl = root.getAttribute('data-baseurl') || '/';
  const normalizeBase = (value) => (value.endsWith('/') ? value : `${value}/`);
  const base = normalizeBase(baseUrl);

  const safeFetch = (url) =>
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const toDate = (item) => {
    if (item.date) return new Date(item.date);
    if (item.year) return new Date(`${item.year}-12-31`);
    return new Date(0);
  };

  const toSummary = (text) => {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    const sentence = clean.split('. ').find(Boolean) || clean;
    const clipped = sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;
    return clipped.endsWith('.') ? clipped : `${clipped}.`;
  };

  safeFetch(`${base}data/publications.json`).then((raw) => {
    const items = Array.isArray(raw) ? raw : (raw && raw.publications) || [];
    if (!items.length) return;

    const latest = items
      .slice()
      .sort((a, b) => toDate(b) - toDate(a))
      [0];

    if (!latest) return;

    if (titleEl) titleEl.textContent = latest.title || 'Latest publication';
    if (abstractEl) abstractEl.textContent = toSummary(latest.abstract || latest.summary || '');
    if (metaEl) {
      const meta = [latest.venue, latest.year].filter(Boolean).join(' • ');
      metaEl.textContent = meta;
    }
    if (linkEl && latest.url) {
      linkEl.href = latest.url;
    }
    if (updatedEl) {
      const updated = new Date();
      updatedEl.textContent = `Updated ${updated.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    }
  });
})();
