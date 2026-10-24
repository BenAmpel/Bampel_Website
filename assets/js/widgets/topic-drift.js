/* Moved out of layouts/shortcodes/topic_drift.html so the site CSP can drop script-src 'unsafe-inline'. */
(() => {
  const root  = document.getElementById('topic-drift-root');
  const hdr   = document.getElementById('tdrift-phases-hdr');
  const table = document.getElementById('tdrift-table');
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
    { label:'Foundations', sub:'2019 – 2021', min:2019, max:2021 },
    { label:'Diversification', sub:'2022 – 2023', min:2022, max:2023 },
    { label:'AI-Centric', sub:'2024 – 2026', min:2024, max:2099 },
  ];

  loadPublications()
    .then(pubs => {
      // Group pubs by phase
      const phPubs = PHASES.map(ph => pubs.filter(p => p.year >= ph.min && p.year <= ph.max));

      // Count term hits per phase (title + abstract)
      const counts = TERMS.map(([lbl, rx]) =>
        phPubs.map(pp => {
          const total = pp.length || 1;
          const hits  = pp.filter(p => rx.test((p.title||'') + ' ' + (p.abstract||''))).length;
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

      // Filter: only show terms that appear in at least one phase with freq >= 0.05
      const visible = TERMS
        .map((t, i) => ({ term:t[0], trend:trend(i), vals:counts[i], i }))
        .filter(r => r.vals.some(v => v >= 0.05))
        .sort((a, b) => {
          // Rising terms first, then falling, then stable; within group sort by phase2 desc
          const order = { rise:0, fall:1, stable:2 };
          if (order[a.trend] !== order[b.trend]) return order[a.trend] - order[b.trend];
          return b.vals[2] - a.vals[2];
        });

      const maxVal = Math.max(...visible.flatMap(r => r.vals));

      // Build phase header
      hdr.innerHTML = '<div></div>';
      PHASES.forEach(ph => {
        const d = document.createElement('div');
        d.className = 'tdrift-ph-lbl';
        d.innerHTML = `${ph.label}<span>${ph.sub}</span>`;
        hdr.appendChild(d);
      });

      // Build rows
      table.innerHTML = '';
      visible.forEach(r => {
        const row = document.createElement('div');
        row.className = 'tdrift-row';

        const termEl = document.createElement('div');
        termEl.className = 'tdrift-term';
        termEl.textContent = r.term;
        row.appendChild(termEl);

        r.vals.forEach((v, pi) => {
          const cell = document.createElement('div');
          cell.className = 'tdrift-cell';
          if (v < 0.01) {
            cell.innerHTML = `<div class="tdrift-bar tdrift-empty" style="width:100%"></div>`;
          } else {
            const pct = Math.round((v / maxVal) * 100);
            const cls = pi === 0 && r.trend === 'fall' ? 'tdrift-fall'
                      : pi === 2 && r.trend === 'rise' ? 'tdrift-rise'
                      : r.trend === 'stable' ? 'tdrift-stable'
                      : 'tdrift-stable';
            const label = Math.round(v * 100) + '%';
            cell.innerHTML = `<div class="tdrift-bar ${cls}" style="width:${pct}%" title="${Math.round(v*100)}% of papers in this phase">${label}</div>`;
          }
          row.appendChild(cell);
        });

        table.appendChild(row);
      });
    })
    .catch(() => { table.innerHTML = '<div class="tdrift-loading">Could not load data.</div>'; });
})();
