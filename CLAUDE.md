# CLAUDE.md — Project Guidelines for bampel.com

## Design Context

See `.impeccable.md` for the full design specification. Summary:

### Design direction (pending Ben's review, branch design/restyle-b, 2026-10-28)
A senior security researcher's site, not a hacker terminal: the dark background stays, and green and cyan are accents
only. This replaces the earlier note that called the cyberpunk neon look deliberate; until Ben approves the branch,
`main` still has the old look.

- **Colour:** background `#0a0a0a` to `#161b22`; text `#c9d1d9`; headings and the site title `#e6edf3`.
  Green `#00ff41` marks links, the active nav item, the thin rule under the header and small details (tags, metric
  numbers, disclosure markers). Cyan `#00e5ff` is the link hover colour, icon colour and the focus ring
  (`2px solid #00e5ff`).
- **Type:** Lato (CCAIR's self-hosted copy in `static/ccair/assets/fonts/`, preloaded in `hooks/head-end.html`) for
  body text, nav, headings and the site title. A monospace face (Fira Code) only for small labels: dates, venue tags,
  metric numbers and code.
- **No** text glow, glitch effects, uppercase or wide tracking on running text, taglines, job titles, bio or headings.
  Uppercase is fine on small labels and chips. At most one or two subtle decorative glows on non-text elements.
- **No emoji** in UI copy or CTAs; use Font Awesome icons or plain words.

### Design Principles
1. **Data is the hero**: visuals exist to surface research signal, not decorate
2. **Hierarchy over noise**: accents are sparse; neutral text carries the page
3. **Restraint**: calm, plain and specific; nothing that reads as a costume
4. **Respect the reader's intelligence**: visitors are researchers; density and terseness are fine
5. **WCAG AA contrast**: all readable text must meet 4.5:1 (UI parts 3:1); test labels, tooltips, chart text

### Technical Architecture
- Hugo + Wowchemy, Netlify deployment
- Shortcodes: self-contained HTML + `<style>` + `<script>` in `/layouts/shortcodes/`
- Dark mode: `body.dark` selector; light: `body:not(.dark)`
- Data: static JSON in `/static/data/` fetched client-side
- CCAIR data: `static/ccair/data/*.json`, except research materials: edit `data/ccair/materials-source.json` (unpublished; may hold placeholders and notes). `npm run build:ccair` writes the cleaned, gitignored `static/ccair/data/materials.json`
- Charts: ECharts; Maps: Leaflet
