# CCAIR Phase 1: Data Pipeline

Extract all hardcoded data from `ccair-pages.jsx` into standalone JSON files served from `/static/ccair/data/`, loaded at app mount via a React Context provider.

## Decisions

- **Storage**: Static JSON in `/static/ccair/data/` (matches main site pattern)
- **Scope**: CCAIR-only data, not shared with the main site's data pipeline
- **Enrichment**: Publications gain `doi`, `pdf`, `abstract`, `tier` fields (nullable)
- **Granularity**: One JSON file per data type (6 files)
- **Loading**: All files fetched in parallel on app mount; pages never render until data is ready
- **Architecture**: React Context provider (`DataProvider`) + `useData()` hook

## Data Files

### `/static/ccair/data/publications.json`

Array of 29 objects:

```json
[
  {
    "title": "string",
    "authors": "string",
    "venue": "string",
    "year": 2024,
    "type": "journal | conference | workshop",
    "doi": "string | null",
    "pdf": "string | null",
    "abstract": "string | null",
    "tier": "core | strategic | exploratory"
  }
]
```

### `/static/ccair/data/people.json`

```json
{
  "director": {
    "name": "string",
    "title": "string",
    "dept": "string",
    "university": "string",
    "areas": ["string"],
    "email": "string",
    "photo": "string | null"
  },
  "affiliates": [
    {
      "name": "string",
      "initials": "string",
      "dept": "string",
      "university": "string",
      "synergy": "string"
    }
  ]
}
```

### `/static/ccair/data/resources.json`

Array of resource objects across all categories:

```json
[
  {
    "title": "string",
    "description": "string",
    "category": "dataset | benchmark | tool",
    "status": "Released | In Development | Coming 2026 | Planning",
    "tags": ["string"],
    "icon": "string"
  }
]
```

### `/static/ccair/data/funding.json`

```json
{
  "timeline": [
    {
      "name": "string",
      "agency": "string",
      "deadline": "string",
      "amount": "string",
      "priority": "Maximum | High | Moderate",
      "details": "string"
    }
  ],
  "partners": {
    "federal": [{ "name": "string", "description": "string" }],
    "industry": [{ "name": "string", "description": "string" }]
  }
}
```

### `/static/ccair/data/courses.json`

```json
[
  {
    "code": "string",
    "title": "string",
    "level": "Undergraduate | Graduate",
    "description": "string",
    "rating": 4.8
  }
]
```

### `/static/ccair/data/news.json`

```json
[
  {
    "title": "string",
    "description": "string",
    "date": "2026-01-15",
    "tag": "string"
  }
]
```

## New Module: `ccair-data.jsx`

### DataProvider

- Wraps the app tree inside `TweakCtx.Provider`
- On mount, fetches all 6 JSON files in parallel via `Promise.all`
- Manages three states: `loading`, `error`, `data`
- While loading: renders CCAIR logo with pulse animation
- On error: renders error message with retry button (same styling as `ErrorBoundary`)
- On success: renders children with data available via context

### useData() hook

Returns the full data object:

```jsx
const { publications, people, resources, funding, courses, news } = useData();
```

Throws a clear error if called outside `DataProvider`.

## File Changes

### New files (8)

| File | Contents |
|------|----------|
| `static/ccair/data/publications.json` | 29 publications with enriched fields |
| `static/ccair/data/people.json` | Director + 3 faculty affiliates |
| `static/ccair/data/resources.json` | 4 datasets, 2 benchmarks, 3 tools |
| `static/ccair/data/funding.json` | 15 timeline items + 11 partners |
| `static/ccair/data/courses.json` | 5 courses |
| `static/ccair/data/news.json` | 4 news items |
| `static/ccair/ccair-data.jsx` | DataProvider component + useData hook |
| `static/ccair/dist/ccair-data.js` | Compiled output from ccair-data.jsx |

### Modified files (3)

| File | Change |
|------|--------|
| `static/ccair/ccair-pages.jsx` | Remove ~200 lines of hardcoded data arrays/objects. Add `useData()` call at top of each page component. |
| `static/ccair/ccair-app.jsx` | Wrap page tree in `<DataProvider>` inside `TweakCtx.Provider`. |
| `static/ccair/index.html` | Add `<script src="dist/ccair-data.js" defer>` between `tweaks-panel.js` and `ccair-components.js`. |

### Untouched files

| File | Reason |
|------|--------|
| `static/ccair/ccair-components.jsx` | No data dependencies — pure UI primitives |
| `static/ccair/tweaks-panel.jsx` | Independent system, no data coupling |

## Data that stays inline

The following content is structural/identity-defining and stays hardcoded in `ccair-pages.jsx`:

- Research portfolio tiers (Core, Strategic, Exploratory) with 9 research areas
- Research primitives (P1, P2, P3)
- Theoretical constructs (Signal Legibility, Intent Opacity, Human-AI Sensemaking)
- Center outputs (Adversarial Corpora, Benchmarks, CTI Systems, Frameworks)
- Talent pipeline steps (K-12, Undergraduate, Master's, Doctoral)
- Governance roles (Director, Advisory Board, Student Council, External Advisory)
- Strategic environment (neighboring GSU centers)
- Hero section stat labels and research thesis descriptions

## Page-to-data mapping

| Page | Data consumed from useData() |
|------|------------------------------|
| HomePage | `news`, `publications` (count), `people` (affiliates count), `courses` (count), `resources` (count) |
| ResearchPage | `publications` |
| PeoplePage | `people` |
| ResourcesPage | `resources` |
| AboutPage | `funding`, `courses` |

## Script loading order

```
react.production.min.js
react-dom.production.min.js
dist/tweaks-panel.js
dist/ccair-data.js        ← new
dist/ccair-components.js
dist/ccair-pages.js
dist/ccair-app.js
```

## Scope boundaries

**In scope**: Data extraction, JSON file creation, DataProvider, useData hook, page refactoring.

**Out of scope** (deferred to later phases):
- Publication search or advanced filtering (Phase 2)
- External API integrations (Phase 2)
- Events calendar, student spotlights (Phase 3)
- Application portal, open positions (Phase 4)
- Any changes to the main Hugo site
