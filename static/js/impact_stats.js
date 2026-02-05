(function () {
  const root = document.querySelector('[data-impact-stats]');
  if (!root) return;

  const cards = Array.from(root.querySelectorAll('.impact-card'));
  const updatedEl = root.querySelector('[data-impact-updated]');

  const safeFetch = (url) =>
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const normalize = (value) => (value || '').toString().toLowerCase();

  const matchVenue = (venue, patterns) => {
    const v = normalize(venue);
    return patterns.some((pattern) => pattern.test(v));
  };

  const unique = (items) => Array.from(new Set(items));

  const countByType = (pubs, type) =>
    pubs.filter((pub) => normalize(pub.type) === type).length;

  const countByVenue = (pubs, patterns) => {
    const matches = pubs.filter(
      (pub) =>
        normalize(pub.type) === 'journal' &&
        matchVenue(pub.venue || pub.publication || '', patterns)
    );
    return {
      count: matches.length,
      venues: unique(matches.map((pub) => pub.venue || pub.publication || '').filter(Boolean))
    };
  };

  const animateValue = (el, value) => {
    const duration = 900;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const current = Math.round(value * progress);
      el.textContent = current.toString();
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  };

  const setProgress = (card, value, base) => {
    const bar = card.querySelector('[data-progress]');
    if (!bar) return;
    const ratio = base > 0 ? Math.min(value / base, 1) : 0;
    bar.style.transform = `scaleX(${ratio})`;
  };

  const updateCard = (metric, data) => {
    const card = cards.find((item) => item.dataset.metric === metric);
    if (!card) return;

    const valueEl = card.querySelector('[data-value]');
    const metaEl = card.querySelector('[data-meta]');
    if (valueEl && !card.dataset.animated) {
      animateValue(valueEl, data.value);
      card.dataset.animated = 'true';
    }
    if (metaEl) metaEl.textContent = data.meta || '';
    if (data.tooltip) card.dataset.tooltip = data.tooltip;
    setProgress(card, data.value, data.base || 1);
  };

  Promise.all([
    safeFetch('/data/publications.json'),
    safeFetch('/data/awards.json'),
    safeFetch('/data/scholar-metrics.json')
  ]).then(([pubData, awardsData, scholarData]) => {
    const pubs = Array.isArray(pubData) ? pubData : (pubData && pubData.publications) || [];
    const awards = Array.isArray(awardsData) ? awardsData : [];

    const journals = countByType(pubs, 'journal');
    const conferences = countByType(pubs, 'conference');
    const workshops = countByType(pubs, 'workshop');
    const total = journals + conferences + workshops || pubs.length;

    const bestPaperAwards = awards.filter((award) => /best paper/i.test(award.title || '')).length;
    const bestPaperYears = unique(
      awards
        .filter((award) => /best paper/i.test(award.title || ''))
        .map((award) => award.year)
        .filter(Boolean)
    ).sort((a, b) => a - b);

    const q1Patterns = [
      /mis quarterly/, 
      /journal of management information systems/, 
      /acm tmis/, 
      /transactions on management information systems/, 
      /information systems frontiers/
    ];
    const ft50Patterns = [/mis quarterly/, /journal of management information systems/];
    const utd24Patterns = [/mis quarterly/, /journal of management information systems/];

    const q1 = countByVenue(pubs, q1Patterns);
    const ft50 = countByVenue(pubs, ft50Patterns);
    const utd24 = countByVenue(pubs, utd24Patterns);

    const awardTotal = awards.length || 1;

    if (updatedEl) {
      const updatedLabel = (scholarData && scholarData.lastUpdated) ? scholarData.lastUpdated : 'Recent';
      updatedEl.textContent = `Updated ${updatedLabel}`;
    }

    updateCard('journals', {
      value: journals,
      base: total,
      meta: total ? `${journals} of ${total} total publications` : '',
      tooltip: 'Peer-reviewed journal articles.'
    });

    updateCard('conferences', {
      value: conferences,
      base: total,
      meta: total ? `${conferences} of ${total} total publications` : '',
      tooltip: 'Conference papers and proceedings.'
    });

    updateCard('workshops', {
      value: workshops,
      base: total,
      meta: total ? `${workshops} of ${total} total publications` : '',
      tooltip: 'Workshop and pre-conference papers.'
    });

    updateCard('best-paper', {
      value: bestPaperAwards,
      base: awardTotal,
      meta: awardTotal ? `${bestPaperAwards} of ${awardTotal} awards` : '',
      tooltip: bestPaperYears.length
        ? `Best Paper Awards in ${bestPaperYears.join(', ')}`
        : 'Best Paper Awards'
    });

    updateCard('q1', {
      value: q1.count,
      base: Math.max(journals, 1),
      meta: journals ? `${q1.count} of ${journals} journal pubs` : '',
      tooltip: q1.venues.length ? `Q1 venues: ${q1.venues.join(', ')}` : 'Q1 journal venues'
    });

    updateCard('ft50', {
      value: ft50.count,
      base: Math.max(journals, 1),
      meta: journals ? `${ft50.count} of ${journals} journal pubs` : '',
      tooltip: ft50.venues.length ? `FT50 venues: ${ft50.venues.join(', ')}` : 'FT50 journal venues'
    });

    updateCard('utd24', {
      value: utd24.count,
      base: Math.max(journals, 1),
      meta: journals ? `${utd24.count} of ${journals} journal pubs` : '',
      tooltip: utd24.venues.length ? `UTD24 venues: ${utd24.venues.join(', ')}` : 'UTD24 journal venues'
    });
  });
})();
