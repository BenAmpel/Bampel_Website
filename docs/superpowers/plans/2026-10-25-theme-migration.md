# Theme migration plan (bampel.com)

October 25, 2026. Measured on `main` at `27f830e` with Hugo 0.168.0.

## Recommendation

Do not move to HugoBlox. Take ownership of the theme instead, in two stages:

1. **Own the theme (small, low risk).** Copy the Wowchemy templates and helper functions the site still uses, plus
   the stylesheet chain, into the repository, and remove the Wowchemy module dependency. The site renders the same
   (checked page by page), but nothing is fetched from a theme that stopped development in 2023, and Hugo upgrades
   stop depending on someone else's module.
2. **Drop Bootstrap 4 and jQuery (gradual).** Replace the few Bootstrap components the site uses (the navbar's
   collapse and dropdown, the grid on a handful of templates) with small CSS and plain JavaScript, one template at a
   time. When nothing uses them, remove Bootstrap 4.6.1 (end of life January 2023) and jQuery 3.6.4, which make up
   most of the 176 KB vendor script bundle.

Each stage ships as ordinary branches through the twice-daily builds; at every step the site keeps working.

## Where the site stands

The site already does most of its own rendering. A build with `--templateMetrics` executes 113 templates:

| Source | Templates | What they are |
|---|---|---|
| The site's own `layouts/` | 65 | Base page, head, scripts, navbar, page header, landing page (the `sections:` of blocks every page uses), 25 shortcodes, the research-impact, media and service blocks, the about block, list pages |
| The site's `modules/wowchemy-seo` | 12 | SEO and structured data (already in the repository) |
| Wowchemy v5 (pinned Aug 2023 commit) | 27 | `single.html`, `index.html`, `404.html`, `section/post.html`, `section/event.html`; publication list views (`views/compact`, `list`, `card`, `citation`); page metadata, authors, links, author card, tags, related pages, pagination, edit link, comments; the site footer and its license line; the `markdown` and `contact` landing blocks; the link render hook |
| Wowchemy core module | 6 | Small helpers: hooks, featured image, icons, page title, logo URL, author name |

Styles: the site's `custom.scss` (5,627 lines) sits on top of Wowchemy's `main.scss`, which imports Bootstrap 4.6.1
and the Wowchemy styles. Scripts: the theme's vendor bundle (jQuery 3.6.4, Bootstrap 4.6.1, instant.page, headroom,
medium-zoom) and `wowchemy.js`. The site's own scripts do not use jQuery.

Content does not depend on Wowchemy-specific shortcodes: all 21 shortcodes used in content are the site's own
(`spoiler` included; it is overridden in `layouts/shortcodes`). The 45 publication pages use standard front matter
(`title`, `authors`, `date`, `publication_types`, `doi`, `url_pdf`, ...). Comments are off (no provider is set in
`config/_default/params.yaml`), so `partials/comments.html` renders nothing on its 47 pages.

## Options considered

### A. Keep the pinned Wowchemy module as it is

Works today on Hugo 0.168 after this month's port. Costs nothing now. But every Hugo upgrade risks breaking a
template we do not own (this month's port already needed fixes for removed Hugo features), the module is fetched
from GitHub at build time, and Bootstrap 4 and jQuery stay on the page indefinitely. Acceptable as a holding
position, not as the plan.

### B. Migrate to HugoBlox (Wowchemy's successor)

Not recommended:

- **Hugo version cap.** HugoBlox v0.12.0 (April 2, 2026) requires Hugo v0.158 to v0.159. The site runs 0.168, so
  moving would mean downgrading Hugo and then waiting on HugoBlox before each upgrade.
- **Churn.** v0.11.0 (January 2, 2026) was announced as a clean break needing a full migration (module renamed from
  `blox-tailwind` to `blox`, settings moved under a `hugoblox` namespace, author profiles moved from
  `content/authors/` to `data/authors/`); v0.12.0 renamed fields again (`hide_date` to `show_date`).
- **No path from Wowchemy v5.** Neither release describes migrating a Bootstrap-era Wowchemy site; it would be a
  rebuild on Tailwind, and the 5,627 lines of custom styles and most overridden templates would be redone.
- **Direction.** Development is moving toward a hosted editor (HugoBlox Studio) and premium templates; the site's
  value is in its custom research pages, which HugoBlox would not provide.

### C. Own the theme, then remove Bootstrap and jQuery (recommended)

Stage 1 is mostly copying files the site already uses into the repository; stage 2 replaces a small set of
Bootstrap features the site's own templates rely on. Neither changes content.

## Stage 1: own the theme

Goal: the build uses no Wowchemy module; the rendered site is the same.

1. Copy the Wowchemy templates and core helpers listed above into `layouts/` (same paths), with a header comment
   naming the source module and commit (Wowchemy v5 `59b6487`, MIT license; keep the license notice in
   `LICENSE.md`). Leave out `partials/comments.html` and its call: comments are off.
2. Copy what the copied templates need from the module: `assets/scss` (Bootstrap 4.6.1 sources and Wowchemy styles),
   `assets/js` (`wowchemy.js` and the vendor scripts), `i18n` strings, and `data` (fonts, themes, page sharer, icons).
   Only files the build reads; find them by removing the module and adding back what the build reports missing.
3. Remove the Wowchemy requirements from `go.mod` and `config/_default/module.yaml` (keep `modules/wowchemy-seo`,
   which is already ours, and the Netlify plugin only if it is still used).
4. Check: the two-pass Netlify build, `check-links`, the lab and CI tests, and a page-by-page HTML comparison of the
   built site before and after (`sitediff.py` from this month's upgrade work). Expected differences: none, apart from
   asset fingerprints and the empty comments markup.

Effort: one working session. Risk: low; the comparison shows any page that changed.

## Stage 2: remove Bootstrap 4 and jQuery

Goal: no Bootstrap or jQuery on the page; the same look.

1. **Inventory.** List every Bootstrap class and data attribute the built pages use (`hugo_stats.json`, which the
   PurgeCSS pass already writes, lists the classes in the built HTML) and every place `wowchemy.js` is relied on
   (navbar collapse, dropdowns, the publication filter, search).
2. **Replace, one area at a time,** each on its own branch with a before/after screenshot check:
   - Navbar: collapse and dropdown in plain JavaScript (about 40 lines) with the same markup and keyboard behavior.
   - Grid and spacing utilities: CSS grid and a small set of utility classes in `custom.scss`, keeping class names
     where content uses them.
   - Cards, buttons, badges, forms: move the styles the site uses into `custom.scss`.
   - Publication list and filter, search: rewrite the parts of `wowchemy.js` the site uses without jQuery
     (search already uses Fuse, which does not need jQuery).
3. **Remove** the Bootstrap sources, jQuery and `wowchemy.js` from the bundle once nothing uses them.

Effort: three to five working sessions, spread out. Risk: medium (visual regressions), contained by doing one
component per branch with screenshots in light and dark mode at phone and desktop widths.

Expected gain: roughly 150 KB less JavaScript and a smaller stylesheet, no end-of-life libraries, and templates that
follow Hugo releases without a theme in between.

## Decisions for Ben

- Approve stage 1 (recommended now), or keep the pinned module for the time being.
- Stage 2 timing: start after stage 1 lands, or leave Bootstrap in place until a redesign.

## Sources

- HugoBlox v0.12.0 release notes: https://github.com/HugoBlox/kit/discussions/3313
- HugoBlox v0.11.0 release notes: https://github.com/HugoBlox/kit/discussions/3294
- HugoBlox releases: https://github.com/HugoBlox/hugo-blox-builder/releases
- Measurements: `hugo --templateMetrics` on `27f830e`; module versions from `hugo config mounts`.
