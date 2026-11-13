/* Topic Evolution: for each research term, the share of papers per career phase whose title or abstract matches it.
   A trend compares the first and last phase (more than 5 points apart). Selecting a term lists its papers by phase. */
(() => {
  const root = document.getElementById('topic-drift-root');
  const table = document.getElementById('tdrift-table');
  const panel = document.getElementById('td-panel');
  const filter = document.getElementById('td-filter');
  if (!root || !table) return;

  // Research terms: [label, regex]
  const TERMS = [
    ['LLM / GenAI',        /large language model|\bllm\b|llms\b|foundation model|generative ai|gpt/i],
    ['Multi-Agent',        /multi.agent|agentic|multi-agent/i],
    ['Deep Learning',      /deep learning|deep transfer|deep neural|cnn|convolutional/i],
    ['Phishing',           /phishing|vishing|voice phish/i],
    ['Threat Intel',       /threat intelligence|\bcti\b|proactive cyber/i],
    ['Hacker / Dark Web',  /hacker|dark web|darknet|hacker forum|underground/i],
    ['Exploit Analysis',   /exploit|malware|ransomware|paste site/i],
    ['Graph Embedding',    /graph embedding|graph neural|graph learning|graph-based/i],
    ['Transformers/BERT',  /transformer|\bbert\b|self-distillation|knowledge distill/i],
    ['Vulnerability',      /vulnerabilit|cvss|cve\b|cyberinfrastructure/i],
    ['ATT&CK / MITRE',     /att.ck|mitre|attacker technique|tactic/i],
    ['Adversarial / RL',   /adversarial|reinforcement learning|\brl\b|red team|evasion/i],
    ['Blockchain',         /blockchain|bitcoin|ethereum|consensus algorithm/i],
    ['Deepfake / Audio',   /deepfake|synthetic media|audio model|vishing\b/i],
  ];

  const PHASES = [
    { label:'Foundations', head:'Foun&shy;dations', sub:'2019 – 2021', min:2019, max:2021 },
    { label:'Diversification', head:'Diversi&shy;fication', sub:'2022 – 2023', min:2022, max:2023 },
    { label:'AI-Centric', sub:'2024 – 2026', min:2024, max:2099 },
  ];
  const TREND_WORD = { rise:'Growing', fall:'Past focus', stable:'Steady' };
  const FILTERS = [['all', 'All'], ['rise', 'Growing'], ['fall', 'Past'], ['stable', 'Steady']];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => Math.round(v * 100);
  const defaultPanel = () => {
    panel.innerHTML = `<p class="im-kicker">Reading the bars</p>
      <p class="im-hint">Each bar is the share of that phase's papers that mention the topic, so phases with fewer papers compare fairly. Growing and past focus compare the first and last phase.</p>
      <p class="im-hint">Select a topic to list its papers here.</p>`;
  };

  loadPublications()
    .then(pubs => {
      // Group pubs by phase
      const phPubs = PHASES.map(ph => pubs.filter(p => p.year >= ph.min && p.year <= ph.max));
      const text = p => (p.title || '') + ' ' + (p.abstract || '');

      // Count term hits per phase (title + abstract)
      const counts = TERMS.map(([, rx]) =>
        phPubs.map(pp => {
          const total = pp.length || 1;
          const hits = pp.filter(p => rx.test(text(p))).length;
          return hits / total; // normalized frequency
        })
      );

      // Classify trend: compare phase[0] vs phase[2]
      const trend = idx => {
        const [a,,c] = counts[idx];
        if (c > a + 0.05) return 'rise';
        if (a > c + 0.05) return 'fall';
        return 'stable';
      };

      // Only terms that reach 5% in at least one phase; growing first, then past, then steady, each by latest phase.
      const visible = TERMS
        .map((t, i) => ({ term:t[0], rx:t[1], trend:trend(i), vals:counts[i], i }))
        .filter(r => r.vals.some(v => v >= 0.05))
        .sort((a, b) => {
          const order = { rise:0, fall:1, stable:2 };
          if (order[a.trend] !== order[b.trend]) return order[a.trend] - order[b.trend];
          return b.vals[2] - a.vals[2];
        });

      const maxVal = Math.max(...visible.flatMap(r => r.vals));

      let html = '<div class="td-head">Topic</div>';
      PHASES.forEach(ph => { html += `<div class="td-head">${ph.head || ph.label}<span>${ph.sub}</span></div>`; });
      html += '<div class="td-head td-head-trend">Trend</div>';
      visible.forEach((r, k) => {
        const desc = PHASES.map((ph, pi) => `${ph.label} ${pct(r.vals[pi])}%`).join(', ');
        html += `<div class="td-row" data-trend="${r.trend}">
          <button class="td-term" type="button" data-k="${k}" aria-pressed="false" aria-label="${esc(r.term)}: ${desc}. ${TREND_WORD[r.trend]}.">${esc(r.term).replace(/\//g, '/<wbr>')}</button>
          ${r.vals.map(v => `<div class="td-cell" aria-hidden="true"><span class="td-track"><span class="td-fill" style="--w:${v < 0.01 ? 0 : Math.round((v / maxVal) * 100)}%"></span></span><span class="td-val${v < 0.01 ? ' is-zero' : ''}">${v < 0.01 ? '0' : pct(v) + '%'}</span></div>`).join('')}
          <span class="td-trend td-${r.trend}" aria-hidden="true">${TREND_WORD[r.trend]}</span>
        </div>`;
      });
      table.innerHTML = html;

      // Trend filter with counts.
      const n = { all: visible.length, rise: 0, fall: 0, stable: 0 };
      visible.forEach(r => { n[r.trend] += 1; });
      filter.innerHTML = FILTERS.map(([k, l]) => `<button class="rdm-btn" type="button" data-td-filter="${k}" aria-pressed="${k === 'all'}">${l}<span class="rdm-count">${n[k]}</span></button>`).join('');
      filter.hidden = false;
      filter.addEventListener('click', e => {
        const btn = e.target.closest('[data-td-filter]');
        if (!btn) return;
        const k = btn.dataset.tdFilter;
        filter.querySelectorAll('[data-td-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        table.querySelectorAll('.td-row').forEach(row => { row.hidden = k !== 'all' && row.dataset.trend !== k; });
      });

      // Selecting a term lists its papers per phase.
      let pinned = null;
      const clear = () => { if (pinned) pinned.setAttribute('aria-pressed', 'false'); pinned = null; defaultPanel(); };
      table.addEventListener('click', e => {
        const btn = e.target.closest('.td-term');
        if (!btn) return;
        if (pinned === btn) { clear(); return; }
        if (pinned) pinned.setAttribute('aria-pressed', 'false');
        pinned = btn;
        btn.setAttribute('aria-pressed', 'true');
        const r = visible[Number(btn.dataset.k)];
        const sections = PHASES.map((ph, pi) => {
          const hits = phPubs[pi].filter(p => r.rx.test(text(p))).sort((a, b) => String(b.year).localeCompare(String(a.year)));
          const items = hits.map(p => `<li><span class="td-yr">${esc(p.year)}</span>${p.url ? `<a href="${esc(p.url)}">${esc(p.title)}</a>` : esc(p.title)}</li>`).join('');
          return `<p class="im-kicker">${ph.label} · ${hits.length} of ${phPubs[pi].length}</p>${hits.length ? `<ul class="td-papers">${items}</ul>` : '<p class="im-hint">None in this phase.</p>'}`;
        }).join('');
        panel.innerHTML = `<div class="im-panel-head"><p class="im-kicker">${TREND_WORD[r.trend]}</p><button class="im-clear" type="button" data-td-clear>Clear</button></div>
          <h4 class="im-panel-title">${esc(r.term)}</h4>${sections}`;
      });
      panel.addEventListener('click', e => {
        if (!e.target.closest('[data-td-clear]')) return;
        const was = pinned;
        clear();
        if (was) was.focus();
      });
      defaultPanel();
    })
    .catch(() => { table.innerHTML = '<p class="rdm-loading">Could not load the publication list.</p>'; });
})();
