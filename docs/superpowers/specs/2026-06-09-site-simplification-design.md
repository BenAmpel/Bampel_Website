# Site Simplification — Design Spec

**Date:** 2026-06-09
**Surface:** Main site (bampel.com)
**Status:** Approved design, ready for implementation planning

## Summary

Convert the single dense one-page scroll into **five focused pages** so content is
easy to navigate and scan. Keep the existing cyberpunk/neon visual identity and
keep (almost) all existing widgets — the simplification comes from **redistributing
content across pages and giving each piece breathing room**, not from deleting
features. The overwhelming ~14-widget "Research Impact" accordion stack is broken
up: its essentials become a calm Home page, and the rest move to a spaced-out
Research page.

## Goals

- Easy navigation: real top-nav pages (not `#anchor` jumps on one long page).
- Easy to see/scan content: each content type on its own short page; heavy widgets
  un-stacked into visible, spaced, headed sections.
- More breathing room / less density per page.
- Preserve the neon visual identity and the restored global layer (animations,
  effects) — visual effects are NOT being toned down.
- Keep almost all existing widgets/shortcodes; redistribute rather than remove.

## Non-Goals (YAGNI)

- No visual redesign of the theme, colors, or animations.
- No deletion of working widgets/shortcodes (they move; a few may become unwired
  but stay in the repo).
- No changes to the CCAIR app, publication detail pages, or the data pipeline.
- No new data sources or backend.

## Decisions

- **Five pages + CCAIR** in the nav: Home / Research / Publications / Teaching / CV / CCAIR.
- **Keep most widgets, reorganize** (do not aggressively prune). Simplify via
  distribution + spacing.
- Each page is a Wowchemy **`landing`** page using the existing `sections:`-of-blocks
  mechanism (same as today's `_index.md`).

## Information Architecture

### Navigation (`config/_default/menus.yaml`)

Replace the current anchor-based menu with page links, in order:

| Label | URL |
|---|---|
| Home | `/` |
| Research | `/research/` |
| Publications | `/publications/` |
| Teaching | `/teaching/` |
| CV | `/cv/` |
| CCAIR | `/ccair/` |

Active-page highlighting is automatic for real URLs. Remove the old
`#stats`, `#publications`, `#teaching`, `#talks`, `#awards`, `#service`, `#media`
anchor entries.

### Page → content distribution

All content below already exists in `content/_index.md`; it is moved (cut/paste of
the relevant `sections:` blocks) into the new page files unless noted as NEW.

**Home — `content/_index.md`** (stays `type: landing`)
- `about.biography` block (hero: photo, name, title, bio) — unchanged.
- NEW compact **highlights** block — a dedicated `markdown` block (NOT the dense
  `research_impact_overview` block, which is being broken up): a one-line key-metrics
  strip (papers, citations, awards), 3 featured/recent publications, a 2–3 sentence
  research-focus blurb, and primary call-to-action buttons (Download CV, Google
  Scholar, CCAIR, Research page). No widget stacks. Metrics may be sourced from the
  existing `/static/data/scholar-metrics.json` if a lightweight display shortcode is
  warranted; otherwise hard-coded current values are acceptable for v1.
- Remove all other blocks from Home (they move to the pages below).

**Research — `content/research/_index.md`** (NEW, `type: landing`)
- Section "Live Research Intelligence": `{{< research_command_center >}}` and
  `{{< grant_experience >}}`.
- Section "Research Analytics": `{{< research_dashboard >}}`,
  `{{< research_storylines >}}`, `{{< pub_ladder >}}`, `{{< topic_drift >}}`,
  `{{< coauthor_evolution >}}`.
- Presentation change: instead of one stacked column of `{{< spoiler >}}`
  accordions, render these as separated blocks each with its own heading and
  generous vertical spacing. Spoilers may be kept for the very largest widgets,
  but the default is visible, headed, spaced sections.

**Publications — `content/publications/_index.md`** (NEW, `type: landing`)
- `{{< publications_filter >}}`
- `{{< paper_diff >}}` (moved from the current Publications section).

**Teaching — `content/teaching/_index.md`** (NEW, `type: landing`)
- `{{< teaching_outcomes >}}`
- The two course tables (Georgia State; University of Arizona), moved verbatim.

**CV — `content/cv/_index.md`** (NEW, `type: landing`)
- Top: prominent "Download full CV (PDF)" button linking `/uploads/cv.pdf`.
- "Invited Talks & Presentations": `{{< talks_showcase >}}`.
- "Honors & Awards": `{{< awards_timeline >}}`.
- "Professional Service": the `service_engagement` block.
- "Public Engagement & Media": the `media_engagement` block.
- "Contact": the `contact` block (email/address/coordinates), moved verbatim.

### What is removed from Home

The `research_impact_overview` (`#stats`), `publications`, `teaching`, `talks`,
`awards`, `service`, `media`, and `contact` blocks are cut from `content/_index.md`
and relocated per the table above. Home keeps only the biography hero + the new
highlights block.

## Layout & spacing principles

- One clear page title (H1) per page; section H2s with consistent styling
  (reuse the existing section-header treatment).
- Generous vertical spacing between sections (the restored layer already styles
  section headers; rely on it + block spacing).
- On Research, prefer visible headed sections over collapsed spoilers so widgets
  are "seen, not hunted."
- Keep the neon theme, animated background, and effects unchanged.

## Implementation approach

- Wowchemy `landing` pages work at any path; each new `content/<page>/_index.md`
  uses `type: landing` with `sections:` blocks. This reuses every existing block
  and shortcode with zero new component code (except the small Home highlights
  block, assembled from markdown + existing shortcodes/partials).
- Update `config/_default/menus.yaml` to the page-based nav above.
- Verify the navbar's active-link logic and any homepage-only assumptions still
  hold for multi-page (the baseof uses `.IsHome` for a few behaviors; confirm
  non-home landing pages render the navbar and header correctly).

## Verification plan

- Build with Hugo 0.148.2 (Netlify-pinned; needs Go + the 0.148.2 extended binary
  locally — system Hugo 0.163 is incompatible). The local dev *server* may hang on
  file-watch over the OneDrive-synced directory; use the to-disk build
  (`hugo --gc`) for verification and inspect `public/` output.
- Confirm each new page renders at its URL with its intended blocks
  (`public/research/index.html`, `public/publications/index.html`,
  `public/teaching/index.html`, `public/cv/index.html`, `public/index.html`).
- Confirm the nav shows the six links and each resolves.
- Confirm no content was lost: every shortcode that was on the old `_index.md`
  appears on exactly one new page (grep the built output).
- Confirm the academic SEO / citation tags on publication detail pages are
  unaffected.
- Confirm Home is short (only hero + highlights) and the heavy widgets are on
  Research.

## Risks / considerations

- Wowchemy landing pages sometimes assume home context. Verify the navbar,
  header, footer, and the restored custom layer (`custom_head.html` →
  `head-end.html`) load on all pages, not just `/`.
- The new highlights block must not silently duplicate the full impact dashboard;
  keep it compact (metrics + 3 papers + blurb + buttons).
- Internal links/anchors elsewhere that point to `#publications` etc. must be
  updated to the new page URLs.
- SEO: each new page should get a sensible title/description (the theme's
  `seo_tags` derives these); set per-page `title`/`summary` in front matter.
