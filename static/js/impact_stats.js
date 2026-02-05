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

  const cleanVenueName = (value) => {
    if (!value) return '';
    let v = value.split(',')[0].trim();
    v = v.replace(/\s+forthcoming$/i, '').trim();
    v = v.replace(/\s+in press$/i, '').trim();
    v = v.replace(/\s+\d+(\s*\(\d+\))?.*$/i, '').trim();
    return v;
  };

  const toKey = (value) =>
    normalize(cleanVenueName(value)).replace(/[^a-z0-9]+/g, ' ').trim();

  const unique = (items) => Array.from(new Set(items));

  const flattenJournalList = (list) => {
    if (!list) return [];
    const entries = Array.isArray(list) ? list : list.journals || [];
    return entries.flatMap((item) => {
      if (typeof item === 'string') return [item];
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      return [item.name, ...aliases].filter(Boolean);
    });
  };

  const matchesList = (venue, list) => {
    const venueKey = toKey(venue);
    if (!venueKey) return false;
    return list.some((alias) => {
      const aliasKey = toKey(alias);
      return aliasKey && (venueKey === aliasKey || venueKey.includes(aliasKey));
    });
  };

  const countByType = (pubs, type) =>
    pubs.filter((pub) => normalize(pub.type) === type).length;

  const countByVenue = (pubs, list) => {
    const matches = pubs.filter(
      (pub) =>
        normalize(pub.type) === 'journal' &&
        matchesList(pub.venue || pub.publication || '', list)
    );
    return {
      count: matches.length,
      venues: unique(
        matches
          .map((pub) => cleanVenueName(pub.venue || pub.publication || ''))
          .filter(Boolean)
      )
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
    safeFetch('/data/scholar-metrics.json'),
    safeFetch('/data/journal_lists/q1.json'),
    safeFetch('/data/journal_lists/ft50.json'),
    safeFetch('/data/journal_lists/utd24.json')
  ]).then(([pubData, awardsData, scholarData, q1ListRaw, ft50ListRaw, utd24ListRaw]) => {
    const pubs = Array.isArray(pubData) ? pubData : (pubData && pubData.publications) || [];
    const awards = Array.isArray(awardsData) ? awardsData : [];
    const scholarPubs = (scholarData && scholarData.individualPublications) || [];

    const q1List = flattenJournalList(q1ListRaw);
    const ft50List = flattenJournalList(ft50ListRaw);
    const utd24List = flattenJournalList(utd24ListRaw);
    const combinedTopList = unique([...q1List, ...ft50List, ...utd24List]).filter(Boolean);

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

    const topListPubs = (() => {
      const seen = new Set();
      const merged = [];
      const add = (pub) => {
        const titleKey = normalize(pub.title).replace(/[^a-z0-9]+/g, '');
        if (!titleKey || seen.has(titleKey)) return;
        seen.add(titleKey);
        merged.push(pub);
      };

      pubs.forEach(add);
      scholarPubs.forEach((pub) => {
        if (!matchesList(pub.venue || '', combinedTopList)) return;
        add({ title: pub.title || '', venue: pub.venue || '', type: 'journal' });
      });

      return merged;
    })();

    const q1 = countByVenue(topListPubs, q1List);
    const ft50 = countByVenue(topListPubs, ft50List);
    const utd24 = countByVenue(topListPubs, utd24List);

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
