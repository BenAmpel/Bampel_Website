# CLAUDE.md — Project Guidelines for bampel.com

## Design Context

See `.impeccable.md` for the full design specification. Summary:

### Brand Personality
**Rigorous · Cutting-edge · Bold** — a security researcher's portfolio that signals serious, high-output scholarship through a deliberate cyberpunk neon aesthetic.

### Color Palette (Dark-only — no light mode goal)
- Background: `#0a0a0a`
- Primary accent (green): `#00ff41` — CTAs, active states, progress
- Secondary accent (cyan): `#00e5ff` — navigation, tabs, info
- Tertiary accent (magenta): `#e040fb` — premium tiers, contrast signals
- Text: `#c9d1d9`

### Typography
- `'Fira Code', 'Roboto Mono', monospace` — headings, labels, data
- `'Merriweather'` — long-form prose
- `'Playfair Display'` — hero/display moments

### Design Principles
1. **Data is the hero** — visuals exist to surface research signal, not decorate
2. **Hierarchy over noise** — use accent colors sparingly; green=primary, cyan=secondary, magenta=contrast
3. **Earned boldness** — cyberpunk aesthetic is domain-intentional; maintain it consistently
4. **Respect the reader's intelligence** — visitors are researchers; density and terseness are fine
5. **WCAG AA contrast on neon** — all readable text must meet 4.5:1; test labels, tooltips, chart text

### Technical Architecture
- Hugo + Wowchemy, Netlify deployment
- Shortcodes: self-contained HTML + `<style>` + `<script>` in `/layouts/shortcodes/`
- Dark mode: `body.dark` selector; light: `body:not(.dark)`
- Data: static JSON in `/static/data/` fetched client-side
- Charts: ECharts; Maps: Leaflet
