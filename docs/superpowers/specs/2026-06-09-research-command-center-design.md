# Research Command Center — Design Spec

**Date:** 2026-06-09
**Surface:** Main site (bampel.com), "Research Intelligence" section of `content/_index.md`
**Status:** Approved design, ready for implementation planning

## Summary

Replace the eight separate collapsible "Research Intelligence" spoilers with a
single, unified, filterable feed — the **Research Command Center**. It merges
all existing intelligence sources (arXiv, NSF, Semantic Scholar, OpenAlex,
OpenCitations, GitHub, Grants.gov, Hacker News) into one normalized stream that
visitors can search, filter, and sort, so "what's new and relevant in Ben's
world right now" is answerable at a glance instead of by opening eight boxes.

This is the first build of a larger four-feature roadmap (Explorer, Demo,
Learning tool, Dashboard); the Command Center is the Dashboard piece and is the
lowest-risk because it reorganizes data and widgets that already exist.

## Goals

- One place to see everything new across all intelligence sources.
- Faceted filtering, full-text search, and sorting over a unified stream.
- 100% client-side; no backend, no new data pipeline.
- Resilient: a single stale or failed feed never blanks the panel.
- Matches the site's cyberpunk/terminal aesthetic and meets WCAG AA.

## Non-Goals (YAGNI)

- No backend or serverless functions.
- No new Python data scripts — rides on the existing metrics workflow output.
- No user accounts, saved searches, notifications, or charts.
- Not a replacement for individual publication pages or the main publications list.

## Decisions

- **Replace** the 8 existing spoilers entirely (single unified section; cleaner UX).
- **Client-side only** compute. Only network calls are the same ones the current
  widgets already make (static JSON fetches + the live HN Algolia call).
- **Four lenses** (Papers / Citing my work / Funding / Community) are the filter
  facets, not the raw 8 sources — simpler mental model; the source badge on each
  card still identifies the exact origin.
- **Keep the now-unused individual feed shortcodes** (`arxiv_radar.html`, etc.) in
  the repo rather than deleting them. They are unwired from `_index.md` but
  retained for reuse by the future Explorer feature. Zero runtime cost (not
  referenced). The metrics workflow and its data scripts are untouched.

## Architecture

One new self-contained shortcode, `layouts/shortcodes/research_command_center.html`
(HTML + embedded CSS + JS, following the existing `research_storylines` pattern).
Optionally split logic into `/static/js/command-center.js` if the JS grows large.

In `content/_index.md`, the 8 `{{< spoiler >}}` intelligence blocks (wrapping
`arxiv_radar`, `nsf_grants`, `semantic_scholar`, `openalex`, `opencitations`,
`github_research`, `grants_gov`, `hacker_news`) are removed and replaced with a
single `{{< research_command_center >}}`.

### Data flow (client-side)

1. On load, fetch the existing `/static/data/*.json` feeds in parallel with
   `Promise.allSettled`. Hacker News remains a live Algolia fetch reusing the
   existing 15-minute `sessionStorage` cache.
2. A normalization layer maps each feed's items into one common schema.
3. State = `{ activeLenses:Set, query, sort }`. Filtering/sorting is pure
   in-memory over the normalized array; search is debounced; no re-fetch on filter.
4. Render a responsive card grid from the filtered list, with per-source
   freshness derived from each feed's `refresh_date`.

### Module breakdown (each independently testable)

| Unit | Responsibility | Input -> Output |
|---|---|---|
| `loadFeeds()` | Fetch all feeds via `Promise.allSettled` + live HN | — -> `{source: {items, refreshDate, ok}}` |
| `normalize(source, raw)` | Map one feed to common item schema | raw feed -> `Item[]` |
| `applyState(items, state)` | Filter (lenses + query) + sort | `Item[]`, state -> `Item[]` |
| `render(items)` | Build card DOM, source badges, meta | `Item[]` -> DOM |
| `controls` | Wire chips, debounced search, sort, refresh | events -> state changes |

The normalization layer is the one unit doing real work and is independently
testable (feed JSON in -> normalized items out). Rendering and filtering are thin
consumers of it.

### Common item schema

```
{ id, lens, source, sourceLabel, title, summary, url, dateISO,
  metaPrimary, metaSecondary, score, topics[] }
```

### Four lenses (grouping the 8 raw sources)

- **Papers** — arXiv, OpenAlex
- **Citing my work** — Semantic Scholar, OpenCitations
- **Funding** — NSF awards, Grants.gov opportunities
- **Community** — GitHub repos, Hacker News

### Normalization map (per source)

- **arXiv** (`arxiv_papers.json` -> `papers[]`): lens *Papers*; date = `published`;
  metaPrimary = first author; metaSecondary = primary category (`cats`).
- **OpenAlex** (`openalex.json` -> `papers[]`): lens *Papers*; date = `year`;
  metaPrimary = `venue`; score = `cited_by_count`; topics = `topics`.
- **Semantic Scholar** (`semantic_scholar.json` -> `citations[]`): lens
  *Citing my work*; date = `year`; metaPrimary = `venue`; metaSecondary =
  "cites *{cited_paper}*".
- **OpenCitations** (`opencitations.json` -> `citations[]`): lens *Citing my work*;
  date = `year`; metaPrimary = `venue`; metaSecondary = "cites *{cites_paper}*".
- **NSF** (`nsf_grants.json` -> `grants[]`): lens *Funding*; date = `startDate`;
  metaPrimary = formatted `estimatedTotalAmt` (e.g. "$1.2M"); metaSecondary =
  `piName`.
- **Grants.gov** (`grants_gov.json` -> `opportunities[]`): lens *Funding*;
  date = `openDate`; metaPrimary = `agency`; metaSecondary = `closeDate` with a
  "closes in N days" urgency indicator.
- **GitHub** (`github_research.json` -> `repos[]`): lens *Community*; metaPrimary =
  "⭐ {stars}"; metaSecondary = `language`; score = `stars`; topics = `topics`.
- **Hacker News** (live Algolia): lens *Community*; date = created; metaPrimary =
  points; metaSecondary = comment count.

## UX & interactions

- **Top bar:** global "last synced" line, labeled search input, sort selector.
- **Lens chips:** multi-select toggle buttons, default all on, with per-lens result counts.
- **Sort:** Newest (default) / Most relevant (by query match) / Most cited-or-starred (`score`).
- **Card stream:** source badge, title (links out), one-line summary, date,
  source-specific meta. Responsive grid: 1 col mobile -> 3–4 desktop.
- **Refresh:** manual refresh control for the live HN source.
- **Deep-linkable state** via URL hash (e.g. `#intel=funding` links straight to
  open funding opportunities).

## States & resilience

- Skeleton loaders while fetching.
- Per-source failure shows a "couldn't load / last good copy" chip; other sources
  still render (`Promise.allSettled`).
- Empty-state message when active filters match nothing.
- `prefers-reduced-motion` respected (no shimmer/animation when set).

## Accessibility & theme

- Lens chips are real `<button aria-pressed>`; search is a labeled
  `<input role="searchbox">`; the card stream is an ARIA list.
- WCAG AA contrast reusing the site's neon CSS tokens (`--clr-green`, `--clr-cyan`,
  `--clr-magenta`, `--clr-text`).
- Fully keyboard-navigable; visible focus states.

## Verification plan

- Unit-test `normalize()` and `applyState()` against fixture JSON (pure functions,
  no DOM).
- Build with Hugo 0.148.2 (Netlify-pinned version; requires Go + the 0.148.2
  extended binary locally — system Hugo 0.163 is incompatible with the theme).
- Preview-verify: all four lenses render; filtering, search, and sort work;
  a simulated feed failure degrades gracefully; mobile and reduced-motion checks;
  confirm the 8 old spoilers are removed with no dead references or orphaned
  shortcode dependencies.

## Risks / open considerations

- Field availability varies by feed refresh; normalization must tolerate missing
  optional fields (defensive defaults).
- The individual feed shortcodes become unused (unwired) but are retained per the
  decision above; ensure nothing else in the codebase still references them before
  considering future cleanup.
