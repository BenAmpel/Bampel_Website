# Research Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight separate "Research Intelligence" spoilers on the main site with a single client-side, filterable Research Command Center that merges all intelligence feeds into one searchable stream.

**Architecture:** Pure-logic JS module (`static/js/command-center.js`) exporting side-effect-free functions (`normalize`, `applyState`, helpers) plus a browser `mountCommandCenter(root)`. A self-contained Hugo shortcode (`research_command_center.html`) provides the accessible HTML shell + CSS and bootstraps the module. Data comes from the existing `/data/*.json` feeds (built by the current metrics workflow) fetched with `Promise.allSettled`; Hacker News is a live Algolia fetch. No backend, no new data pipeline.

**Tech Stack:** Hugo 0.148.2 (Netlify-pinned; requires Go + the 0.148.2 extended binary locally — system Hugo 0.163 is incompatible with the theme), vanilla ES modules, Node's built-in `node --test` runner (no new dependencies).

---

## File Structure

- **Create** `static/js/command-center.js` — pure logic (`LENSES`, `SOURCES` config with per-source mappers, `normalize`, `applyState`, `formatAmount`, `relativeTime`) + browser `mountCommandCenter(root)` and `loadFeeds()`. Side-effect-free on import (no auto-run).
- **Create** `tests/command-center.test.mjs` — `node --test` unit tests for the pure functions, with inline fixtures.
- **Create** `layouts/shortcodes/research_command_center.html` — accessible HTML shell, embedded `<style>`, and a `<script type="module">` bootstrap that calls `mountCommandCenter`.
- **Modify** `content/_index.md:19-55` — replace the 8 feed spoilers with `{{< research_command_center >}}`; keep the `grant_experience` spoiler.

Data source filenames (served from `static/` at site root, i.e. `/data/<file>`):
`arxiv_papers.json` (`.papers`), `openalex.json` (`.papers`), `semantic_scholar.json` (`.citations`), `opencitations.json` (`.citations`), `nsf_grants.json` (`.grants`), `grants_gov.json` (`.opportunities`), `github_research.json` (`.repos`). Hacker News: live `https://hn.algolia.com/api/v1/search`.

Common item schema produced by `normalize`:
```
{ id, lens, source, sourceLabel, title, summary, url, dateISO,
  metaPrimary, metaSecondary, score, topics }
```
Lenses: `papers`, `citing`, `funding`, `community`.

---

## Task 1: Scaffold module with helpers (formatAmount, relativeTime)

**Files:**
- Create: `static/js/command-center.js`
- Test: `tests/command-center.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/command-center.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, relativeTime } from '../static/js/command-center.js';

test('formatAmount abbreviates millions and thousands', () => {
  assert.equal(formatAmount(1200000), '$1.2M');
  assert.equal(formatAmount(450000), '$450K');
  assert.equal(formatAmount(0), '');
  assert.equal(formatAmount(null), '');
});

test('relativeTime returns human strings from an ISO date', () => {
  const now = new Date('2026-06-09T00:00:00Z');
  assert.equal(relativeTime('2026-06-08T00:00:00Z', now), '1 day ago');
  assert.equal(relativeTime('2026-06-09T00:00:00Z', now), 'today');
  assert.equal(relativeTime(null, now), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/command-center.test.mjs`
Expected: FAIL — cannot find module `../static/js/command-center.js` (or export missing).

- [ ] **Step 3: Write minimal implementation**

Create `static/js/command-center.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/command-center.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add static/js/command-center.js tests/command-center.test.mjs
git commit -m "feat(command-center): add formatAmount and relativeTime helpers"
```

---

## Task 2: Source config + normalize()

**Files:**
- Modify: `static/js/command-center.js`
- Test: `tests/command-center.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/command-center.test.mjs`:
```js
import { normalize } from '../static/js/command-center.js';

test('normalize maps an arXiv paper to a Papers item', () => {
  const raw = { title: 'A', summary: 'B', published: '2026-05-01T00:00:00Z',
    link: 'http://x', authors: ['Ben Ampel', 'Co'], cats: ['cs.CR'] };
  const item = normalize('arxiv', raw);
  assert.equal(item.lens, 'papers');
  assert.equal(item.source, 'arxiv');
  assert.equal(item.title, 'A');
  assert.equal(item.url, 'http://x');
  assert.equal(item.dateISO, '2026-05-01T00:00:00Z');
  assert.equal(item.metaPrimary, 'Ben Ampel');
  assert.equal(item.metaSecondary, 'cs.CR');
});

test('normalize maps an NSF grant to a Funding item with formatted amount', () => {
  const raw = { title: 'Grant', awardId: '99', piName: 'PI Name',
    estimatedTotalAmt: 1200000, startDate: '2026-01-01', abstractText: 'x' };
  const item = normalize('nsf', raw);
  assert.equal(item.lens, 'funding');
  assert.equal(item.metaPrimary, '$1.2M');
  assert.equal(item.metaSecondary, 'PI Name');
  assert.equal(item.dateISO, '2026-01-01');
});

test('normalize maps a GitHub repo to a Community item with star score', () => {
  const raw = { name: 'tool', full_name: 'org/tool', description: 'd',
    stars: 1234, forks: 5, language: 'Python', topics: ['security'], url: 'http://g' };
  const item = normalize('github', raw);
  assert.equal(item.lens, 'community');
  assert.equal(item.score, 1234);
  assert.equal(item.metaPrimary, '⭐ 1,234');
  assert.equal(item.metaSecondary, 'Python');
  assert.deepEqual(item.topics, ['security']);
});

test('normalize maps an OpenCitations item to a Citing item', () => {
  const raw = { title: 'Citing paper', authors: 'Someone', year: 2025,
    venue: 'Journal X', doi: '10.1/x', url: 'http://c', cites_paper: 'My Paper' };
  const item = normalize('opencitations', raw);
  assert.equal(item.lens, 'citing');
  assert.equal(item.metaPrimary, 'Journal X');
  assert.match(item.metaSecondary, /My Paper/);
  assert.equal(item.dateISO, '2025-01-01');
});

test('normalize tolerates missing optional fields', () => {
  const item = normalize('github', { name: 'x', url: 'http://g' });
  assert.equal(item.score, 0);
  assert.equal(item.metaPrimary, '⭐ 0');
  assert.deepEqual(item.topics, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/command-center.test.mjs`
Expected: FAIL — `normalize` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `static/js/command-center.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/command-center.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add static/js/command-center.js tests/command-center.test.mjs
git commit -m "feat(command-center): add source config and normalize()"
```

---

## Task 3: applyState() — filter + search + sort

**Files:**
- Modify: `static/js/command-center.js`
- Test: `tests/command-center.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/command-center.test.mjs`:
```js
import { applyState } from '../static/js/command-center.js';

const ITEMS = [
  { id: '1', lens: 'papers', title: 'LLM phishing', summary: 'about phishing', topics: ['nlp'], dateISO: '2026-01-01', score: 5 },
  { id: '2', lens: 'funding', title: 'NSF grant', summary: '', topics: [], dateISO: '2026-05-01', score: 1000 },
  { id: '3', lens: 'community', title: 'repo', summary: 'security tool', topics: ['security'], dateISO: '2026-03-01', score: 900 },
];

test('applyState filters by active lenses', () => {
  const out = applyState(ITEMS, { activeLenses: new Set(['funding']), query: '', sort: 'newest' });
  assert.deepEqual(out.map((i) => i.id), ['2']);
});

test('applyState searches title, summary, and topics (case-insensitive)', () => {
  const out = applyState(ITEMS, { activeLenses: new Set(['papers', 'funding', 'community']), query: 'PHISHING', sort: 'newest' });
  assert.deepEqual(out.map((i) => i.id), ['1']);
});

test('applyState sorts by newest date by default', () => {
  const out = applyState(ITEMS, { activeLenses: new Set(['papers', 'funding', 'community']), query: '', sort: 'newest' });
  assert.deepEqual(out.map((i) => i.id), ['2', '3', '1']);
});

test('applyState sort=score orders by descending score', () => {
  const out = applyState(ITEMS, { activeLenses: new Set(['papers', 'funding', 'community']), query: '', sort: 'score' });
  assert.deepEqual(out.map((i) => i.id), ['2', '3', '1']);
});

test('applyState with empty lens set returns nothing', () => {
  const out = applyState(ITEMS, { activeLenses: new Set(), query: '', sort: 'newest' });
  assert.deepEqual(out, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/command-center.test.mjs`
Expected: FAIL — `applyState` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `static/js/command-center.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/command-center.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add static/js/command-center.js tests/command-center.test.mjs
git commit -m "feat(command-center): add applyState filter/search/sort"
```

---

## Task 4: Browser loadFeeds() + mountCommandCenter()

**Files:**
- Modify: `static/js/command-center.js`

No unit test (DOM + network); verified via preview in Task 7. Keep the module import-safe by guarding all DOM/fetch code inside functions (never at top level).

- [ ] **Step 1: Add loadFeeds()**

Append to `static/js/command-center.js`:
```js
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
```

- [ ] **Step 2: Add rendering + mount**

Append to `static/js/command-center.js`:
```js
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function cardHTML(it) {
  const date = relativeTime(it.dateISO);
  const meta = [it.metaPrimary, it.metaSecondary].filter(Boolean).map(esc).join(' · ');
  return `<li class="cc-card" data-lens="${it.lens}">
    <div class="cc-card-head"><span class="cc-badge">${esc(it.sourceLabel)}</span>${date ? `<span class="cc-date">${esc(date)}</span>` : ''}</div>
    <a class="cc-title" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
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
      <div class="cc-status" id="cc-status">Syncing intelligence feeds…</div>
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
    <ul class="cc-stream" id="cc-stream" aria-live="polite">
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
```

- [ ] **Step 3: Verify the module still imports cleanly in Node (no top-level side effects)**

Run: `node --test tests/command-center.test.mjs`
Expected: PASS (unchanged) — confirms the new browser code did not break import or add top-level `window`/`fetch` references.

- [ ] **Step 4: Commit**

```bash
git add static/js/command-center.js
git commit -m "feat(command-center): add loadFeeds and mountCommandCenter (browser)"
```

---

## Task 5: Shortcode shell + CSS + bootstrap

**Files:**
- Create: `layouts/shortcodes/research_command_center.html`

- [ ] **Step 1: Create the shortcode**

Create `layouts/shortcodes/research_command_center.html`:
```html
{{/* Research Command Center: unified, filterable intelligence feed.
     Logic lives in /static/js/command-center.js (ES module, unit-tested). */}}
<div id="research-command-center" class="cc-root" data-cc></div>

<style>
.cc-root { margin: 1rem 0; font-family: 'Fira Code', 'Roboto Mono', monospace; }
.cc-bar { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:12px; }
.cc-status { font-size:0.78rem; color: var(--clr-cyan, #00e5ff); opacity:0.9; }
.cc-controls { display:flex; gap:8px; flex-wrap:wrap; }
.cc-search { background: rgba(0,0,0,0.5); border:1px solid rgba(0,229,255,0.35); color: var(--clr-text, #c9d1d9); border-radius:999px; padding:6px 14px; font:inherit; font-size:0.8rem; min-width:200px; }
.cc-sort, .cc-refresh { background: rgba(0,0,0,0.5); border:1px solid rgba(0,255,65,0.35); color: var(--clr-green, #00ff41); border-radius:999px; padding:6px 12px; font:inherit; font-size:0.78rem; cursor:pointer; }
.cc-lenses { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
.cc-chip { background: rgba(0,229,255,0.08); border:1px solid rgba(0,229,255,0.3); color:#bde8ff; border-radius:999px; padding:6px 12px; font:inherit; font-size:0.74rem; cursor:pointer; transition: background .15s, border-color .15s; }
.cc-chip[aria-pressed="false"] { opacity:0.45; background:transparent; }
.cc-chip:focus-visible { outline:2px solid var(--clr-cyan,#00e5ff); outline-offset:2px; }
.cc-count { opacity:0.7; margin-left:4px; }
.cc-stream { list-style:none; padding:0; margin:0; display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:14px; }
.cc-card { border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px; background: rgba(0,0,0,0.28); display:flex; flex-direction:column; gap:6px; transition: transform .2s, border-color .2s; }
.cc-card:hover { transform: translateY(-3px); border-color: rgba(0,255,65,0.4); }
.cc-card-head { display:flex; justify-content:space-between; align-items:center; }
.cc-badge { font-size:0.62rem; text-transform:uppercase; letter-spacing:0.08em; color: var(--clr-green,#00ff41); border:1px solid rgba(0,255,65,0.3); border-radius:999px; padding:2px 8px; }
.cc-date { font-size:0.68rem; opacity:0.6; color: var(--clr-text,#c9d1d9); }
.cc-title { color: var(--clr-cyan,#00e5ff); text-decoration:none; font-size:0.9rem; line-height:1.35; }
.cc-title:hover { text-decoration:underline; }
.cc-summary { font-size:0.76rem; line-height:1.45; color: var(--clr-text,#c9d1d9); opacity:0.85; margin:0; }
.cc-meta { font-size:0.72rem; color: var(--clr-text,#c9d1d9); opacity:0.7; margin-top:auto; }
.cc-empty { grid-column:1/-1; text-align:center; opacity:0.6; padding:24px; font-size:0.8rem; }
.cc-skeleton { height:120px; border-radius:12px; background: linear-gradient(100deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04)); background-size:200% 100%; animation: cc-shimmer 1.4s infinite; }
@keyframes cc-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.cc-reduced .cc-skeleton { animation:none; }
.cc-reduced .cc-card { transition:none; }
body:not(.dark) .cc-card { background: rgba(255,255,255,0.92); border-color:#e2e8f0; }
body:not(.dark) .cc-title { color:#0b6b80; }
body:not(.dark) .cc-summary, body:not(.dark) .cc-date, body:not(.dark) .cc-meta { color:#1a2a33; }
@media (max-width:600px){ .cc-stream { grid-template-columns:1fr; } .cc-controls { width:100%; } .cc-search { flex:1; } }
</style>

<script type="module">
  import { mountCommandCenter } from '/js/command-center.js';
  mountCommandCenter(document.getElementById('research-command-center'));
</script>
```

- [ ] **Step 2: Commit**

```bash
git add layouts/shortcodes/research_command_center.html
git commit -m "feat(command-center): add research_command_center shortcode shell + styles"
```

---

## Task 6: Wire into the page (replace the 8 feed spoilers)

**Files:**
- Modify: `content/_index.md:19-55`

- [ ] **Step 1: Replace the feed spoilers, keep grant_experience**

In `content/_index.md`, the `intelligence: |` block currently contains 9 spoilers. Replace the block's content (lines ~20-55) so it keeps ONLY the `grant_experience` spoiler and adds the command center. The result must be exactly:

```yaml
      intelligence: |
        {{< research_command_center >}}

        {{< spoiler text="💼 Grant Experience" >}}
        {{< grant_experience >}}

        {{< /spoiler >}}
```

Remove the spoilers wrapping `arxiv_radar`, `nsf_grants`, `semantic_scholar`, `openalex`, `hacker_news`, `grants_gov`, `opencitations`, and `github_research`. Do NOT remove `grant_experience`. Do NOT touch the `body:` block below it.

- [ ] **Step 2: Confirm no feed shortcodes remain referenced in _index.md**

Run:
```bash
grep -nE 'arxiv_radar|nsf_grants|semantic_scholar|openalex|hacker_news|grants_gov|opencitations|github_research' content/_index.md
```
Expected: no output (exit 1). If any line prints, remove that spoiler.

- [ ] **Step 3: Commit**

```bash
git add content/_index.md
git commit -m "feat(command-center): replace 8 intelligence spoilers with command center"
```

---

## Task 7: Build + preview verification

**Files:** none (verification only). Requires the Hugo 0.148.2 extended binary and Go installed (see Tech Stack).

- [ ] **Step 1: Run the unit tests one final time**

Run: `node --test tests/command-center.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 2: Build the site**

Run: `PATH="$PATH:$(dirname $(command -v go))" /tmp/hugobin/hugo --gc`
Expected: build completes with no template errors; `public/` regenerated. (If `/tmp/hugobin/hugo` is absent, download the 0.148.2 extended binary first — see Tech Stack.)

- [ ] **Step 3: Confirm the module and shortcode shipped, and old spoilers are gone**

Run:
```bash
test -f public/js/command-center.js && echo "module OK"
grep -c "research-command-center" public/index.html
grep -cE 'arxiv-research-radar|spoiler.*OpenAlex' public/index.html || true
```
Expected: "module OK"; the command-center div count ≥ 1.

- [ ] **Step 4: Start the dev server and verify interactively**

Start the server (background) and use the preview tooling to confirm:
```bash
PATH="$PATH:$(dirname $(command -v go))" /tmp/hugobin/hugo server --port 1313 --bind 127.0.0.1 --renderToMemory
```
Then verify on `http://127.0.0.1:1313/#stats` (Research Impact section):
- The Command Center renders a card stream after the skeleton loaders.
- All four lens chips show non-zero counts (Papers, Citing my work, Funding, Community).
- Clicking a chip toggles its `aria-pressed` and filters the stream; counts update.
- Typing in the search box filters across sources (e.g. "phishing").
- Changing the sort reorders cards.
- Check the browser console for errors (expect none beyond any pre-existing site warnings).

- [ ] **Step 5: Verify resilience, deep-link, responsive, reduced-motion**

- Deep link: load `http://127.0.0.1:1313/#intel=funding` and confirm only the Funding lens is active on mount.
- Simulated feed failure: temporarily rename one data file (e.g. `mv static/data/openalex.json static/data/openalex.json.bak`), reload, confirm the panel still renders other sources and the status line notes "OpenAlex unavailable". Restore: `mv static/data/openalex.json.bak static/data/openalex.json`.
- Resize to mobile (375px): stream collapses to one column, controls wrap.
- Emulate `prefers-reduced-motion: reduce`: skeletons don't shimmer, cards don't animate.

- [ ] **Step 6: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix(command-center): address verification findings"
```

---

## Notes for the implementer

- The module must stay **side-effect-free on import** — all `window`/`document`/`fetch`/`sessionStorage` use lives inside functions, never at top level. This is what lets `node --test` import it without a DOM.
- Hacker News is the only live network call; everything else reads pre-built `/data/*.json`. Do not add new Python scripts or backend code.
- The unused individual feed shortcodes (`arxiv_radar.html`, etc.) are intentionally left in the repo per the spec decision (retained for the future Explorer feature). Do not delete them.
- Follow the existing neon CSS variables (`--clr-green`, `--clr-cyan`, `--clr-text`); do not hard-code new brand colors.
