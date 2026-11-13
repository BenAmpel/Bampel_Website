/* Publication Trajectory: year rows by venue-tier columns. A dot pins its paper in the side panel; the tier legend
   hides or shows a column. Tiers come from the venue name (TIER below). */
(() => {
  const root = document.getElementById('pub-ladder-root');
  const body = document.getElementById('pll-body');
  const panel = document.getElementById('pll-panel');
  const legend = document.getElementById('pll-legend');
  const insight = document.getElementById('pll-insight');
  if (!root || !body) return;

  const TIER = v => {
    if (!v) return 1;
    const vl = v.toLowerCase();
    if (/mis quarterly|^misq$/.test(vl)) return 4;
    if (/journal of management information systems|^jmis$/.test(vl)) return 4;
    if (/transactions on management information systems|tmis/.test(vl)) return 3;
    if (/information systems frontiers|^isf$/.test(vl)) return 3;
    if (/digital threats|^dtrap$/.test(vl)) return 3;
    if (/information systems education|^jise$/.test(vl)) return 3;
    if (/replication research|^trr$/.test(vl)) return 3;
    if (/ieee isi|hicss|icis\b|acm kdd|^kdd$|amcis|ieee spw/.test(vl)) return 2;
    return 1;
  };

  const TIER_LABEL = ['', 'Workshop', 'Conference', 'Journal', 'Premier'];
  const TIER_NOTE = ['',
    'Workshops and other venues',
    'Peer-reviewed IS and computing conferences (HICSS, ICIS, AMCIS, IEEE ISI, KDD)',
    'Field journals (TMIS, DTRAP, ISF, JISE, TRR)',
    'Premier IS journals (MIS Quarterly, JMIS)'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const off = new Set();
  let pinned = null;

  const defaultPanel = () => {
    panel.innerHTML = `<p class="im-kicker">How tiers are set</p>
      <ul class="pll-panel-tiers">${[4, 3, 2, 1].map(t => `<li class="pll-t${t}"><span class="im-swatch"></span><span><strong>${TIER_LABEL[t]}</strong><br><span>${esc(TIER_NOTE[t])}</span></span></li>`).join('')}</ul>
      <p class="im-hint">Select a dot to see the paper here.</p>`;
  };

  const showPaper = (p, t) => {
    const authors = Array.isArray(p.authors) ? p.authors.join(', ') : (p.authors || '');
    panel.innerHTML = `<div class="im-panel-head"><p class="im-kicker pll-t${t}"><span class="im-swatch"></span> ${TIER_LABEL[t]}</p>
      <button class="im-clear" type="button" data-pll-clear>Clear</button></div>
      <h4 class="im-panel-title">${esc(p.title)}</h4>
      <p class="im-meta">${esc(p.venue)} · ${esc(p.year)}</p>
      ${authors ? `<p class="im-authors">${esc(authors)}</p>` : ''}
      ${p.url ? `<a class="rdm-link" href="${esc(p.url)}">Read the paper</a>` : ''}`;
  };

  const select = (dot, p, t) => {
    if (pinned) pinned.setAttribute('aria-pressed', 'false');
    if (pinned === dot) { pinned = null; defaultPanel(); return; }
    pinned = dot;
    dot.setAttribute('aria-pressed', 'true');
    showPaper(p, t);
  };

  panel.addEventListener('click', e => {
    if (!e.target.closest('[data-pll-clear]')) return;
    const was = pinned;
    if (pinned) pinned.setAttribute('aria-pressed', 'false');
    pinned = null;
    defaultPanel();
    if (was) was.focus();
  });

  defaultPanel();

  loadPublications()
    .then(pubs => {
      const byYear = {};
      const tierCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
      pubs.forEach(p => {
        const yr = String(p.year);
        const t = TIER(p.venue);
        if (!byYear[yr]) byYear[yr] = { 1: [], 2: [], 3: [], 4: [] };
        byYear[yr][t].push(p);
        tierCount[t] += 1;
      });

      const years = Object.keys(byYear).sort();
      const grid = document.createElement('div');
      grid.className = 'pll-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', 'Papers by year and venue tier');
      let html = '<div class="pll-col-head" aria-hidden="true"></div>';
      for (let t = 1; t <= 4; t++) html += `<div class="pll-col-head" aria-hidden="true">${TIER_LABEL[t]}</div>`;
      html += '<div class="pll-col-head is-total" aria-hidden="true">All</div>';
      grid.innerHTML = html;

      years.forEach(yr => {
        const yrEl = document.createElement('div');
        yrEl.className = 'pll-yr';
        yrEl.textContent = yr;
        grid.appendChild(yrEl);
        let total = 0;
        for (let t = 1; t <= 4; t++) {
          const cell = document.createElement('div');
          cell.className = `pll-cell pll-t${t}`;
          (byYear[yr][t] || []).forEach(p => {
            total += 1;
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'pll-dot';
            dot.setAttribute('aria-pressed', 'false');
            dot.setAttribute('aria-label', `${p.title}. ${p.venue}, ${p.year}. ${TIER_LABEL[t]}.`);
            dot.title = p.title;
            dot.addEventListener('click', () => select(dot, p, t));
            cell.appendChild(dot);
          });
          grid.appendChild(cell);
        }
        const tot = document.createElement('div');
        tot.className = 'pll-total';
        tot.textContent = total;
        grid.appendChild(tot);
      });

      body.innerHTML = '';
      body.appendChild(grid);

      legend.innerHTML = [4, 3, 2, 1].map(t => `<button class="im-legend-btn pll-legend-btn pll-t${t}" type="button" data-tier="${t}" aria-pressed="true"><span class="im-swatch"></span>${TIER_LABEL[t]}<span class="rdm-count">${tierCount[t]}</span></button>`).join('');
      legend.addEventListener('click', e => {
        const btn = e.target.closest('[data-tier]');
        if (!btn) return;
        const t = btn.dataset.tier;
        if (off.has(t)) off.delete(t); else off.add(t);
        btn.setAttribute('aria-pressed', String(!off.has(t)));
        root.dataset.off = Array.from(off).join(' ');
        grid.querySelectorAll(`.pll-t${t} .pll-dot`).forEach(d => { d.tabIndex = off.has(t) ? -1 : 0; });
      });

      // Insight: journal and premier share, early years against recent years.
      const share = yrs => {
        const total = yrs.reduce((s, y) => s + Object.values(byYear[y] || {}).flat().length, 0);
        const jCount = yrs.reduce((s, y) => s + ((byYear[y] || {})[3] || []).length + ((byYear[y] || {})[4] || []).length, 0);
        return total ? Math.round((jCount / total) * 100) : 0;
      };
      const earlyYrs = years.filter(y => y <= '2021');
      const recentYrs = years.filter(y => y >= '2024');
      if (earlyYrs.length && recentYrs.length) {
        const ep = share(earlyYrs);
        const rp = share(recentYrs);
        insight.textContent = `Journal & premier publications: ${ep}% in 2019–21 → ${rp}% in 2024–26`;
      }
    })
    .catch(() => { body.innerHTML = '<p class="rdm-loading">Could not load the publication list.</p>'; });
})();
