/* Moved out of layouts/shortcodes/pub_ladder.html so the site CSP can drop script-src 'unsafe-inline'. */
(() => {
  const root = document.getElementById('pub-ladder-root');
  const body = document.getElementById('pll-body');
  const tip  = document.getElementById('pll-tip');
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

  const TIER_LABEL = ['','Workshop','Conference','Journal','Premier'];
  const TIER_DOT   = ['','pll-d1','pll-d2','pll-d3','pll-d4'];
  const TIER_HEAD  = ['','pll-h1','pll-h2','pll-h3','pll-h4'];

  const moveTip = e => {
    const rect = root.getBoundingClientRect();
    let x = e.clientX - rect.left + 14;
    let y = e.clientY - rect.top  - 44;
    if (x + 300 > rect.width) x = e.clientX - rect.left - 300;
    if (y < 0) y = 0;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  };
  root.addEventListener('mousemove', moveTip);

  loadPublications()
    .then(pubs => {
      const byYear = {};
      pubs.forEach(p => {
        const yr = String(p.year);
        const t  = TIER(p.venue);
        if (!byYear[yr]) byYear[yr] = {1:[],2:[],3:[],4:[]};
        byYear[yr][t].push(p);
      });

      const years = Object.keys(byYear).sort();
      const grid  = document.createElement('div');
      grid.className = 'pll-grid';

      // Header row
      const blank = document.createElement('div');
      blank.className = 'pll-cell-head';
      grid.appendChild(blank);
      for (let t = 1; t <= 4; t++) {
        const h = document.createElement('div');
        h.className = `pll-cell-head ${TIER_HEAD[t]}`;
        h.textContent = TIER_LABEL[t];
        grid.appendChild(h);
      }

      // Year rows
      years.forEach(yr => {
        const yrEl = document.createElement('div');
        yrEl.className = 'pll-cell-yr';
        yrEl.textContent = yr;
        grid.appendChild(yrEl);

        for (let t = 1; t <= 4; t++) {
          const cell = document.createElement('div');
          cell.className = 'pll-cell-dots';
          (byYear[yr][t] || []).forEach(p => {
            const dot = document.createElement('span');
            dot.className = `pll-dot ${TIER_DOT[t]}`;
            dot.setAttribute('role', 'button');
            dot.setAttribute('tabindex', '0');
            dot.setAttribute('aria-label', `${p.title} · ${p.venue} · ${p.year}`);
            const showTip = () => {
              tip.innerHTML = `<strong>${p.title}</strong><br><span style="opacity:0.65">${p.venue} · ${p.year}</span>`;
              tip.style.display = 'block';
            };
            const hideTip = () => { tip.style.display = 'none'; };
            dot.addEventListener('mouseenter', showTip);
            dot.addEventListener('mouseleave', hideTip);
            dot.addEventListener('focus', showTip);
            dot.addEventListener('blur', hideTip);
            dot.addEventListener('keydown', e => {
              if (e.key === 'Enter' || e.key === ' ') { showTip(); e.preventDefault(); }
              if (e.key === 'Escape') { hideTip(); }
            });
            cell.appendChild(dot);
          });
          grid.appendChild(cell);
        }
      });

      body.innerHTML = '';
      body.appendChild(grid);

      // Derive insight: journal/premier share early vs recent
      const share = yrs => {
        const total = yrs.reduce((s,y) => s + Object.values(byYear[y]||{}).flat().length, 0);
        const jCount = yrs.reduce((s,y) => s + ((byYear[y]||{})[3]||[]).length + ((byYear[y]||{})[4]||[]).length, 0);
        return total ? Math.round((jCount / total) * 100) : 0;
      };
      const earlyYrs  = years.filter(y => y <= '2021');
      const recentYrs = years.filter(y => y >= '2024');
      if (earlyYrs.length && recentYrs.length) {
        const ep = share(earlyYrs);
        const rp = share(recentYrs);
        insight.textContent = `Journal & premier publications: ${ep}% in 2019–21 → ${rp}% in 2024–26`;
      }
    })
    .catch(() => { body.innerHTML = '<div class="pll-loader">Could not load data.</div>'; });
})();
