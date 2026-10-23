# Official lockup slot (empty on purpose)

Georgia State University's brand rules (Communications ToolKit, commkit.gsu.edu, read 2026-10-23) say:

- No academic or administrative unit, department, **center**, institute, program, initiative or grant may create its own logo.
- A center uses its college's sub-brand lockup (here: J. Mack Robinson College of Business) with a unit wordmark.
  Those files come from Public Relations & Marketing Communications (PRMC) or the college's director of communications.
- Never create your own lockup, never manipulate or recolor the logo, and never use generative AI to reproduce or recreate it.
- All Georgia State web sites display an approved university logo.

Until PRMC supplies the files, every CCAIR page (center site, Pathway Finder, Student Guide) shows a plain-text wordmark,
"Center for CyberAI Research" over "Georgia State University · J. Mack Robinson College of Business", in Lato, with no
symbol or graphic mark. The favicon is a plain Georgia State Blue rounded square (`../favicon.svg`, `../favicon-64.png`,
`../apple-touch-icon.png`), not a logo.

## When the files arrive

1. Put the supplied files in this folder **unaltered** (no recoloring, cropping, re-drawing or re-exporting):
   - `ccair-lockup.svg` (full-color, for white or light backgrounds) and/or `ccair-lockup.png` (at least 2x the display height)
   - `ccair-lockup-reversed.svg` / `.png` (white/reversed version, for the Blue Steel footer and the dark scheme)
   - optionally the official flame favicon set from PRMC, to replace the neutral one in `../`
2. Edit `lockup.json`: set `"enabled": true`, `files.light` and `files.reversed` to the file names, and `width`/`height`
   to the artwork's intrinsic size (used to reserve space). Keep `alt` as the full unit name.
3. Run `npm run build:ccair`. The React site (`OfficialLockup` in `static/ccair/ccair-components.jsx`) reads this file at
   run time; the static pages (`scripts/ccair-static.mjs`) read it at build time. With `"enabled": false` the slot renders nothing.
4. Respect the lockup's clear space (half the flame height on every side) and minimum size from the PRMC files; the CSS
   gives the header slot a 40 px height and the footer the same, with no other element inside that margin.

## Removed under this policy (2026-10-23)

The custom CCAIR mark (a shield around a speech bubble with sound waves and a cursor, made with ChatGPT) was a
unit-made logo, which GSU does not allow. These files were deleted from the repository (`git rm`) and every reference
to them removed (headers, home-page hero, footer, favicons, apple-touch-icon, loading screen, Student Guide sharing
images, the guide's Atom feed icon):

- `static/ccair/uploads/ccair-logo.png`
- `static/ccair/uploads/brand/logo-mark-32.png`, `logo-mark-64.png`, `logo-mark-128.png`, `logo-mark-512.png`
- `static/ccair/uploads/brand/apple-touch-icon.png`

The JSON-LD `"logo"` property on the center's ResearchOrganization node was removed as well; add it back pointing at the
official lockup once it is here. The Behavioral Lab keeps its own copies under `static/lab/assets/brand/`, which are
handled separately.
