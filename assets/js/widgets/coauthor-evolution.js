/* Moved out of layouts/shortcodes/coauthor_evolution.html so the site CSP can drop script-src 'unsafe-inline'. */
(() => {
  const barsEl    = document.getElementById('cae-bars');
  const collabEl  = document.getElementById('cae-collab');
  const insightEl = document.getElementById('cae-insight');
  if (!barsEl || !collabEl) return;

  const MENTORS = ['chen','samtani','nunamaker'];
  const PEERS   = ['hashim'];
  const MENTEES = ['otto','marx','gao','wagner','zhang','dacosta','reyes','vahedi','yang','hu'];

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

  loadPublications()
    .then(pubs => {
      const byYear = {};
      pubs.forEach(p => {
        const yr = String(p.year);
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(p);
      });
      const years = Object.keys(byYear).sort();

      barsEl.innerHTML = '';
      const firstRates = {};
      years.forEach(yr => {
        const yrPubs = byYear[yr];
        const firstCount = yrPubs.filter(p => {
          const auths = p.authors || [];
          return auths.length > 0 && auths[0].toLowerCase().includes('ampel');
        }).length;
        const rate = Math.round((firstCount / yrPubs.length) * 100);
        firstRates[yr] = rate;

        const row = document.createElement('div');
        row.className = 'cae-bar-row';
        row.innerHTML = '<div class="cae-bar-yr">' + yr + '</div>'
          + '<div class="cae-bar-track"><div class="cae-bar-fill" style="width:' + rate + '%"></div></div>'
          + '<div class="cae-bar-pct">' + rate + '%</div>';
        barsEl.appendChild(row);
      });

      collabEl.innerHTML = '';
      const seenCollabs = new Set();

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

        const row = document.createElement('div');
        row.className = 'cae-collab-yr';
        const lbl = document.createElement('div');
        lbl.className = 'cae-collab-yr-lbl';
        lbl.textContent = yr;
        row.appendChild(lbl);

        const chips = document.createElement('div');
        chips.className = 'cae-chips';
        newThisYear.forEach(name => {
          const rel = classifyAuthor(name);
          if (rel === 'self') return;
          const chip = document.createElement('span');
          chip.className = 'cae-chip cae-' + rel;
          // Display last name, skipping "Jr." suffix
          const parts = name.trim().split(/\s+/).filter(p => !/^(Jr|Sr|II|III)\.?$/i.test(p));
          chip.textContent = parts[parts.length - 1];
          chip.title = name;
          chips.appendChild(chip);
        });
        row.appendChild(chips);
        collabEl.appendChild(row);
      });

      const early  = years.filter(y => y <= '2021');
      const recent = years.filter(y => y >= '2024');
      const avg = yrs => Math.round(yrs.reduce((s, y) => s + (firstRates[y] || 0), 0) / (yrs.length || 1));
      const menteeCount = [...seenCollabs].filter(n => MENTEES.some(m => n.includes(m))).length;
      insightEl.textContent = 'First-author rate: ' + avg(early) + '% (2019–21) → ' + avg(recent) + '% (2024–26). ' + menteeCount + ' PhD students joined the collaboration network since 2021.';
    })
    .catch(() => { barsEl.innerHTML = '<div class="cae-loading">Could not load data.</div>'; });
})();
