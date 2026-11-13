/* Authorship: first-author rate per year as "n of m" bars, and co-authors by the year of their first paper with
   Dr. Ampel, coloured and filterable by relationship (mentor, peer, student). */
(() => {
  const barsEl    = document.getElementById('cae-bars');
  const collabEl  = document.getElementById('cae-collab');
  const insightEl = document.getElementById('cae-insight');
  const filterEl  = document.getElementById('cae-filter');
  const statusEl  = document.getElementById('cae-status');
  if (!barsEl || !collabEl) return;

  const MENTORS = ['chen','samtani','nunamaker'];
  const PEERS   = ['hashim'];
  const MENTEES = ['otto','marx','gao','wagner','zhang','dacosta','reyes','vahedi','yang','hu'];
  const REL_LABEL = { mentor:'Mentor', peer:'Peer', mentee:'Student' };

  const matchTerm = (text, term) => new RegExp('\\b' + term + '\\b').test(text);
  const classifyAuthor = name => {
    const nl = name.toLowerCase();
    if (nl.includes('ampel')) return 'self';
    if (MENTEES.some(m => matchTerm(nl, m))) return 'mentee';
    if (PEERS.some(m => matchTerm(nl, m))) return 'peer';
    if (MENTORS.some(m => matchTerm(nl, m))) return 'mentor';
    return 'peer';
  };

  // Normalize name to "First Last" for deduplication (strip middle initials and suffixes)
  const normalizeName = name => {
    const parts = name.trim().split(/\s+/).filter(p => !/^[A-Z]\.$/.test(p) && !/^(Jr|Sr|II|III)\.?$/i.test(p));
    return parts.length >= 2 ? (parts[0] + ' ' + parts[parts.length - 1]).toLowerCase() : name.toLowerCase();
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  loadPublications()
    .then(pubs => {
      const byYear = {};
      pubs.forEach(p => {
        const yr = String(p.year);
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(p);
      });
      const years = Object.keys(byYear).sort();

      const firstRates = {};
      let bars = '';
      years.forEach(yr => {
        const yrPubs = byYear[yr];
        const firstCount = yrPubs.filter(p => {
          const auths = p.authors || [];
          return auths.length > 0 && auths[0].toLowerCase().includes('ampel');
        }).length;
        const rate = Math.round((firstCount / yrPubs.length) * 100);
        firstRates[yr] = rate;
        const thin = yrPubs.length <= 2 ? ' is-thin' : '';
        bars += `<div class="cae-yr">${yr}</div>`
          + `<div class="cae-track${thin}" role="img" aria-label="${yr}: first author on ${firstCount} of ${yrPubs.length} papers, ${rate}%"><span class="cae-fill" style="--w:${rate}%"></span></div>`
          + `<div class="cae-val" aria-hidden="true">${rate}% <span>${firstCount} of ${yrPubs.length}</span></div>`;
      });
      barsEl.innerHTML = bars;

      const seenCollabs = new Set();
      const relCount = { mentor:0, peer:0, mentee:0 };
      let rows = '';
      years.forEach(yr => {
        const newThisYear = [];
        byYear[yr].forEach(p => {
          (p.authors || []).forEach(a => {
            if (a.toLowerCase().includes('ampel')) return;
            const key = normalizeName(a);
            if (!seenCollabs.has(key)) {
              seenCollabs.add(key);
              newThisYear.push(a);
            }
          });
        });
        if (!newThisYear.length) return;

        const chips = newThisYear.map(name => {
          const rel = classifyAuthor(name);
          if (rel === 'self') return '';
          relCount[rel] += 1;
          // Display last name, skipping "Jr." suffix
          const parts = name.trim().split(/\s+/).filter(p => !/^(Jr|Sr|II|III)\.?$/i.test(p));
          return `<span class="cae-chip cae-${rel}" data-rel="${rel}" title="${esc(name)} (${REL_LABEL[rel]})">${esc(parts[parts.length - 1])}</span>`;
        }).join('');
        rows += `<div class="cae-year"><div class="cae-year-lbl">${yr}<span>${newThisYear.length} new</span></div><div class="cae-chips">${chips}</div></div>`;
      });
      collabEl.innerHTML = rows;

      const total = relCount.mentor + relCount.peer + relCount.mentee;
      const FILTERS = [['all', 'All', total], ['mentor', 'Mentors', relCount.mentor], ['peer', 'Peers', relCount.peer], ['mentee', 'Students', relCount.mentee]];
      filterEl.innerHTML = FILTERS.map(([k, l, n]) => `<button class="rdm-btn" type="button" data-cae-rel="${k}" aria-pressed="${k === 'all'}">${k === 'all' ? '' : `<span class="im-swatch cae-${k}"></span>`}${l}<span class="rdm-count">${n}</span></button>`).join('');
      filterEl.hidden = false;
      filterEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-cae-rel]');
        if (!btn) return;
        const k = btn.dataset.caeRel;
        filterEl.querySelectorAll('[data-cae-rel]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        let shown = 0;
        collabEl.querySelectorAll('.cae-year').forEach(row => {
          let inRow = 0;
          row.querySelectorAll('.cae-chip').forEach(chip => {
            const on = k === 'all' || chip.dataset.rel === k;
            chip.hidden = !on;
            if (on) inRow += 1;
          });
          row.hidden = inRow === 0;
          shown += inRow;
        });
        statusEl.textContent = k === 'all' ? '' : `Showing ${shown} ${FILTERS.find(f => f[0] === k)[1].toLowerCase()}`;
      });

      const early  = years.filter(y => y <= '2021');
      const recent = years.filter(y => y >= '2024');
      const avg = yrs => Math.round(yrs.reduce((s, y) => s + (firstRates[y] || 0), 0) / (yrs.length || 1));
      const menteeCount = [...seenCollabs].filter(n => MENTEES.some(m => n.includes(m))).length;
      insightEl.textContent = 'First-author rate: ' + avg(early) + '% (2019–21) → ' + avg(recent) + '% (2024–26). ' + menteeCount + ' PhD students joined the collaboration network since 2021.';
    })
    .catch(() => { barsEl.innerHTML = '<p class="rdm-loading">Could not load the publication list.</p>'; });
})();
