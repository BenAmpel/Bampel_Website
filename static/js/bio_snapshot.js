(function () {
  const root = document.getElementById('bio-snapshot');
  if (!root) return;

  const pubsEl = document.getElementById('bio-metric-pubs');
  const citesEl = document.getElementById('bio-metric-cites');
  const hIndexEl = document.getElementById('bio-metric-hindex');
  const i10El = document.getElementById('bio-metric-i10');
  const yearsEl = document.getElementById('bio-metric-years');
  const yearsRangeEl = document.getElementById('bio-metric-years-range');
  const velocityEl = document.getElementById('bio-metric-velocity');
  const topVenueEl = document.getElementById('bio-metric-top-venue');
  const updatedEl = document.getElementById('bio-metric-updated');
  const metaEl = document.getElementById('bio-snapshot-meta');

  const safeFetch = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const formatNumber = (value) => (value === null || value === undefined ? '-' : value);

  Promise.all([
    safeFetch('/data/publications.json'),
    safeFetch('/data/scholar-metrics.json'),
  ]).then(([pubData, scholarData]) => {
    const pubs = Array.isArray(pubData) ? pubData : (pubData && pubData.publications) || [];
    const metrics = (scholarData && scholarData.metrics) || {};

    const pubCount = Number.isFinite(Number(metrics.publications)) ? Number(metrics.publications) : pubs.length;
    const citations = Number.isFinite(Number(metrics.citations)) ? Number(metrics.citations) : null;
    const hIndex = Number.isFinite(Number(metrics.hIndex)) ? Number(metrics.hIndex) : null;
    const i10Index = Number.isFinite(Number(metrics.i10Index)) ? Number(metrics.i10Index) : null;
    const velocity = Number.isFinite(Number(metrics.citationVelocity)) ? Number(metrics.citationVelocity) : null;

    pubsEl.textContent = formatNumber(pubCount);
    citesEl.textContent = formatNumber(citations);
    hIndexEl.textContent = formatNumber(hIndex);
    i10El.textContent = formatNumber(i10Index);
    velocityEl.textContent = formatNumber(velocity);

    if (scholarData && scholarData.lastUpdated) {
      updatedEl.textContent = `Updated ${scholarData.lastUpdated}`;
      metaEl.textContent = `Google Scholar • ${scholarData.lastUpdated}`;
    }

    const years = pubs
      .map((item) => Number(item.year))
      .filter((year) => Number.isFinite(year));

    if (years.length) {
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      const yearsActive = Math.max(maxYear - minYear + 1, 1);
      yearsEl.textContent = yearsActive;
      yearsRangeEl.textContent = `${minYear}–${maxYear}`;
    }

    if (pubs.length) {
      const venueCounts = new Map();
      pubs.forEach((pub) => {
        const venue = pub.venue || pub.publication || '';
        if (!venue) return;
        venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
      });
      const sortedVenues = Array.from(venueCounts.entries()).sort((a, b) => b[1] - a[1]);
      if (sortedVenues.length) {
        topVenueEl.textContent = `Top venue: ${sortedVenues[0][0]}`;
      }
    }
  });
})();
