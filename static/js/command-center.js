// Research Command Center — pure logic + browser mount.
// Side-effect-free on import; call mountCommandCenter(root) in the browser.

export function formatAmount(n) {
  const v = Number(n);
  if (!v || Number.isNaN(v)) return '';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
  return '$' + v;
}

export function relativeTime(iso, now = new Date()) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

function yearToISO(y) {
  if (!y) return '';
  const s = String(y);
  return /^\d{4}$/.test(s) ? `${s}-01-01` : s;
}
function commaNum(n) { return Number(n || 0).toLocaleString('en-US'); }

// Each source maps one raw feed item to the common item schema.
export const SOURCES = {
  arxiv: { file: '/data/arxiv_papers.json', key: 'papers', label: 'arXiv',
    map: (r) => ({ lens: 'papers', title: r.title, summary: r.summary,
      url: r.link, dateISO: r.published || '',
      metaPrimary: (r.authors && r.authors[0]) || '',
      metaSecondary: (r.cats && r.cats[0]) || '', score: 0,
      topics: r.cats || [] }) },
  openalex: { file: '/data/openalex.json', key: 'papers', label: 'OpenAlex',
    map: (r) => ({ lens: 'papers', title: r.title, summary: '',
      url: r.doi ? `https://doi.org/${r.doi}` : r.id, dateISO: yearToISO(r.year),
      metaPrimary: r.venue || '', metaSecondary: `${r.cited_by_count || 0} citations`,
      score: r.cited_by_count || 0,
      topics: (r.topics || []).map((t) => (typeof t === 'string' ? t : t.display_name)).filter(Boolean) }) },
  semantic_scholar: { file: '/data/semantic_scholar.json', key: 'citations', label: 'Semantic Scholar',
    map: (r) => ({ lens: 'citing', title: r.title, summary: '',
      url: r.url, dateISO: yearToISO(r.year), metaPrimary: r.venue || '',
      metaSecondary: r.cited_paper ? `cites: ${r.cited_paper}` : '', score: 0, topics: [] }) },
  opencitations: { file: '/data/opencitations.json', key: 'citations', label: 'OpenCitations',
    map: (r) => ({ lens: 'citing', title: r.title, summary: '',
      url: r.url || (r.doi ? `https://doi.org/${r.doi}` : ''), dateISO: yearToISO(r.year),
      metaPrimary: r.venue || '', metaSecondary: r.cites_paper ? `cites: ${r.cites_paper}` : '',
      score: 0, topics: [] }) },
  nsf: { file: '/data/nsf_grants.json', key: 'grants', label: 'NSF',
    map: (r) => ({ lens: 'funding', title: r.title, summary: r.abstractText || '',
      url: r.awardId ? `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${r.awardId}` : '',
      dateISO: r.startDate || '', metaPrimary: formatAmount(r.estimatedTotalAmt),
      metaSecondary: r.piName || '', score: Number(r.estimatedTotalAmt) || 0, topics: [] }) },
  grants_gov: { file: '/data/grants_gov.json', key: 'opportunities', label: 'Grants.gov',
    map: (r) => ({ lens: 'funding', title: r.title, summary: '',
      url: r.url || '', dateISO: r.openDate || '', metaPrimary: r.agency || '',
      metaSecondary: r.closeDate ? `closes ${r.closeDate}` : '', score: 0, topics: [] }) },
  github: { file: '/data/github_research.json', key: 'repos', label: 'GitHub',
    map: (r) => ({ lens: 'community', title: r.full_name || r.name, summary: r.description || '',
      url: r.url, dateISO: '', metaPrimary: `⭐ ${commaNum(r.stars)}`,
      metaSecondary: r.language || '', score: Number(r.stars) || 0, topics: r.topics || [] }) },
  hackernews: { live: true, label: 'Hacker News',
    map: (r) => ({ lens: 'community', title: r.title, summary: '',
      url: r.url || `https://news.ycombinator.com/item?id=${r.objectID}`,
      dateISO: r.created_at || '', metaPrimary: `${r.points || 0} points`,
      metaSecondary: `${r.num_comments || 0} comments`, score: r.points || 0, topics: [] }) },
};

export const LENSES = [
  { id: 'papers', label: 'Papers', icon: '📄' },
  { id: 'citing', label: 'Citing my work', icon: '🔗' },
  { id: 'funding', label: 'Funding', icon: '💰' },
  { id: 'community', label: 'Community', icon: '💻' },
];

let __id = 0;
export function normalize(sourceKey, raw) {
  const cfg = SOURCES[sourceKey];
  if (!cfg) throw new Error(`Unknown source: ${sourceKey}`);
  const base = cfg.map(raw);
  return {
    id: `${sourceKey}-${__id++}`,
    source: sourceKey,
    sourceLabel: cfg.label,
    title: base.title || '(untitled)',
    summary: base.summary || '',
    url: base.url || '',
    dateISO: base.dateISO || '',
    metaPrimary: base.metaPrimary || '',
    metaSecondary: base.metaSecondary || '',
    score: base.score || 0,
    topics: base.topics || [],
    lens: base.lens,
  };
}

export function applyState(items, state) {
  const { activeLenses, query, sort } = state;
  const q = (query || '').trim().toLowerCase();
  let out = items.filter((it) => activeLenses.has(it.lens));
  if (q) {
    out = out.filter((it) => {
      const hay = `${it.title} ${it.summary} ${(it.topics || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }
  const byDateDesc = (a, b) => (b.dateISO || '').localeCompare(a.dateISO || '');
  if (sort === 'score') {
    out = out.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || byDateDesc(a, b));
  } else if (sort === 'relevance' && q) {
    const rank = (it) => (it.title.toLowerCase().includes(q) ? 2 : 0)
      + ((it.topics || []).join(' ').toLowerCase().includes(q) ? 1 : 0);
    out = out.slice().sort((a, b) => rank(b) - rank(a) || byDateDesc(a, b));
  } else {
    out = out.slice().sort(byDateDesc);
  }
  return out;
}

// ─── Browser-side: feed loading ──────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fetchHackerNews() {
  const KEY = 'cc-hn-cache';
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (cached && Date.now() - cached.t < 15 * 60 * 1000) return cached.hits;
  } catch (_) { /* ignore */ }
  const data = await fetchJSON('https://hn.algolia.com/api/v1/search?query=cybersecurity%20AI&tags=story&hitsPerPage=15');
  const hits = data.hits || [];
  try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), hits })); } catch (_) { /* ignore */ }
  return hits;
}

// Returns { items: Item[], status: {sourceKey: {ok, refreshDate}} }
export async function loadFeeds() {
  const status = {};
  const items = [];
  const keys = Object.keys(SOURCES);
  const results = await Promise.allSettled(keys.map(async (key) => {
    const cfg = SOURCES[key];
    if (cfg.live) {
      const hits = await fetchHackerNews();
      return { key, rows: hits, refreshDate: '' };
    }
    const data = await fetchJSON(cfg.file);
    return { key, rows: data[cfg.key] || [], refreshDate: data.refresh_date || data.refreshed || '' };
  }));
  results.forEach((r, i) => {
    const key = keys[i];
    if (r.status === 'fulfilled') {
      status[key] = { ok: true, refreshDate: r.value.refreshDate };
      r.value.rows.forEach((row) => { try { items.push(normalize(key, row)); } catch (_) { /* skip bad row */ } });
    } else {
      status[key] = { ok: false, refreshDate: '' };
    }
  });
  return { items, status };
}

// ─── Browser-side: rendering + mount ─────────────────────────────────────────

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function safeURL(u) {
  if (!u) return '';
  try {
    const p = new URL(u, 'https://bampel.com/');
    return /^https?:$/.test(p.protocol) ? u : '';
  } catch (_) {
    return '';
  }
}

function cardHTML(it) {
  const date = relativeTime(it.dateISO);
  const meta = [it.metaPrimary, it.metaSecondary].filter(Boolean).map(esc).join(' · ');
  const href = safeURL(it.url);
  const titleHTML = href
    ? `<a class="cc-title" href="${esc(href)}" target="_blank" rel="noopener">${esc(it.title)}</a>`
    : `<span class="cc-title">${esc(it.title)}</span>`;
  return `<li class="cc-card" data-lens="${it.lens}">
    <div class="cc-card-head"><span class="cc-badge">${esc(it.sourceLabel)}</span>${date ? `<span class="cc-date">${esc(date)}</span>` : ''}</div>
    ${titleHTML}
    ${it.summary ? `<p class="cc-summary">${esc(it.summary.slice(0, 180))}</p>` : ''}
    ${meta ? `<div class="cc-meta">${meta}</div>` : ''}
  </li>`;
}

export function mountCommandCenter(root) {
  if (!root) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) root.classList.add('cc-reduced');

  const state = {
    activeLenses: new Set(LENSES.map((l) => l.id)),
    query: '',
    sort: 'newest',
  };
  // Deep link: #intel=funding
  const hash = (location.hash.match(/intel=([a-z,]+)/) || [])[1];
  if (hash) {
    const wanted = hash.split(',').filter((x) => LENSES.some((l) => l.id === x));
    if (wanted.length) state.activeLenses = new Set(wanted);
  }

  root.innerHTML = `
    <div class="cc-bar">
      <div class="cc-status" id="cc-status" aria-live="polite">Syncing intelligence feeds…</div>
      <div class="cc-controls">
        <input id="cc-search" class="cc-search" type="search" role="searchbox" aria-label="Search all research intelligence" placeholder="Search everything…">
        <select id="cc-sort" class="cc-sort" aria-label="Sort results">
          <option value="newest">Newest</option>
          <option value="relevance">Most relevant</option>
          <option value="score">Most cited / starred</option>
        </select>
        <button id="cc-refresh" class="cc-refresh" type="button" title="Refresh live feeds">↻</button>
      </div>
    </div>
    <div class="cc-lenses" role="group" aria-label="Filter by category">
      ${LENSES.map((l) => `<button class="cc-chip" type="button" data-lens="${l.id}" aria-pressed="true">${l.icon} ${l.label} <span class="cc-count" data-count="${l.id}">0</span></button>`).join('')}
    </div>
    <ul class="cc-stream" id="cc-stream">
      ${Array.from({ length: 6 }).map(() => '<li class="cc-skeleton"></li>').join('')}
    </ul>`;

  const streamEl = root.querySelector('#cc-stream');
  const statusEl = root.querySelector('#cc-status');
  const searchEl = root.querySelector('#cc-search');
  const sortEl = root.querySelector('#cc-sort');
  let allItems = [];
  let feedStatus = {};

  function rerender() {
    const filtered = applyState(allItems, state);
    streamEl.innerHTML = filtered.length
      ? filtered.map(cardHTML).join('')
      : '<li class="cc-empty">No items match your filters.</li>';
    LENSES.forEach((l) => {
      const c = applyState(allItems, { ...state, activeLenses: new Set([l.id]) }).length;
      const el = root.querySelector(`[data-count="${l.id}"]`);
      if (el) el.textContent = c;
    });
  }

  function renderStatus() {
    const failed = Object.entries(feedStatus).filter(([, v]) => !v.ok).map(([k]) => SOURCES[k].label);
    statusEl.textContent = `${allItems.length} items across ${LENSES.length} lenses`
      + (failed.length ? ` · ${failed.length} feed(s) unavailable: ${failed.join(', ')}` : '');
  }

  root.querySelectorAll('.cc-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const lens = chip.dataset.lens;
      if (state.activeLenses.has(lens)) state.activeLenses.delete(lens); else state.activeLenses.add(lens);
      chip.setAttribute('aria-pressed', state.activeLenses.has(lens) ? 'true' : 'false');
      rerender();
    });
  });
  let t;
  searchEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.query = searchEl.value; rerender(); }, 180); });
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; rerender(); });

  async function load() {
    const { items, status } = await loadFeeds();
    allItems = items; feedStatus = status;
    renderStatus(); rerender();
  }
  root.querySelector('#cc-refresh').addEventListener('click', () => {
    try { sessionStorage.removeItem('cc-hn-cache'); } catch (_) { /* ignore */ }
    load();
  });
  load();
}
