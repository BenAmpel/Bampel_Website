# bampel.com

Benjamin M. Ampel’s academic website and the public pages for the Center for CyberAI Research (CCAIR). The site is a
Hugo static build based on Wowchemy, deployed on Netlify. The repository also contains the CCAIR Behavioral Lab and
the Cyber Career Pathway Finder.

## Local setup

Requirements: Node.js 22, Python 3, Hugo Extended 0.168.0, Dart Sass 1.106.1, and the Python packages PyYAML and
ReportLab. Netlify downloads the pinned Sass release and checks it against the SHA-256 value in `netlify.toml`.

```sh
npm ci
python -m pip install PyYAML reportlab
npm run build:ccair
./scripts/hugo.sh server
```

`scripts/hugo.sh` refreshes the publication index and research summary PDF before starting Hugo. The production build
is defined in `netlify.toml`; it runs the CCAIR generators, builds Hugo once to collect CSS usage, then builds with
PurgeCSS and fingerprints the CCAIR assets.

## Where to edit

- `content/`: biography, publications, teaching, research, CV, and other Hugo pages.
- `static/data/`: public data files used by the website. Most have a corresponding generator in `scripts/`.
- `static/ccair/data/`: public CCAIR page data. Edit `data/ccair/materials-source.json` for research materials;
  `npm run build:ccair` creates the cleaned, ignored `materials.json`.
- `layouts/`, `assets/`, and `config/`: Hugo templates, styles, scripts, and configuration.
- `static/lab/` and `scripts/lab/`: the browser-based behavioral research lab and its local server.

## Data refreshes

The scheduled Scholar Metrics workflow refreshes publications, metrics, awards, grants, and related research data. The
Pathway Finder workflow opens a pull request for labor-market data changes. Review generated changes before merging;
the scheduled Netlify build publishes merged updates later.

For the CCAIR student guide, use `npm run guide:freshness -- --out /tmp/guide-freshness.md` to check source links and
verification dates. The detailed maintenance steps are in `CLAUDE.md`.

## Checks

GitHub Actions builds the production site, runs the lab and publication/pathway checks, checks internal links, and
checks the Font Awesome subset. Locally, `npm run test:lab` runs the behavioral lab test suite. The CI workflow in
`.github/workflows/ci.yml` is the authoritative list of build checks.

To run the lab locally, use `npm run lab`. Its study data and owner key are stored in `.lab-data/`, which is ignored
by Git. Read `static/lab/README.md` before using the lab for a real study.
