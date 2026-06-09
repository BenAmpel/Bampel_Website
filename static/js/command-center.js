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
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
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
