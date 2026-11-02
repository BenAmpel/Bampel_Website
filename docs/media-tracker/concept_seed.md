# Concept seed: weekly public-mention tracker and honest attention panel

* **Author:** Claude (EGM brainstorm, unattended run for Ben Ampel)
* **Date:** 2026-11-02
* **Status:** Seed for Goldfish brainstorm review. Not approved. Nothing is built.
* **Superseded by:** `concepts_brief.md` (same folder). Kept as the input the brainstorm reviewers saw. Two facts
  below are stale: `media.json` has 3 items, one with a `url` (commit 5e37e06), and the panel scripts differ in
  behaviour (see the brief, F12-F13).

## Anchored hypothesis

A weekly GitHub Actions job in this repository searches a small set of keyless public sources for mentions of
Ben Ampel and his papers, drops anything already seen, and posts the new candidates to a review queue. Ben approves
or rejects each candidate; only approved items reach `static/data/media.json` (the site's Media Spotlight) and,
by hand, the CV's "PUBLIC ENGAGEMENT AND MEDIA COVERAGE" section. Separately, the website's "Cumulative Research
Attention" panel is rewritten so that it does not present a sum of per-paper Altmetric scores as if it were one
score.

## Facts checked on 2026-11-02

Source availability:

* **Google News RSS** (`https://news.google.com/rss/search?q="Benjamin Ampel"`) works without a key. The query
  returned 5 items: the GSU SIGMIS award press release (true hit), two Atlanta Jewish Times "Grad Ads" pages (a
  graduation ad, not coverage), a MadameNoire listicle where "Benjamin Ampel / Getty" is a photo credit (a different
  person), and a 2010 Times Herald-Record "College notes" item (unclear). So 1 of 5 hits is real coverage. Item links
  are `news.google.com/rss/articles/...` redirect wrappers, not publisher URLs. Old items (2010, 2024) are returned
  alongside new ones, so "new this week" must come from a seen-list, not from the feed.
* **GDELT DOC 2.0 API** answered HTTP 429 (rate-limited) on the first call.
* **Altmetric Details Page API** has required a key since 2025-11-10. Free keys are for scientometric research and
  explicitly not for self-assessment.
* **Altmetric public pages**: `https://www.altmetric.com/robots.txt` contains `User-agent: *` /
  `Disallow: /details/`. The existing `scripts/update_altmetric.py` fetches `https://www.altmetric.com/details/doi/<doi>`
  with a spoofed Chrome User-Agent string when no API key is set, which is the case in practice.
* **Crossref Event Data** was shut down on 2026-04-23.
* **Wikipedia search API** (`action=query&list=search&srsearch=insource:"<doi>"`), run for all 23 DOIs in the repo's
  publication pages: 0 hits. A search for "Benjamin Ampel": 0 hits.
* **Lens.org**: Altmetric shows that patent CN-114328707-A cites the 2019 Hyperledger Sawtooth paper
  (DOI 10.1109/ISI.2019.8823238). Lens's API needs an access token; its terms were not checked.
* **Google Scholar Alerts** arrive as Gmail messages to Ben. Reading them from a GitHub Action would need Gmail OAuth
  credentials stored as repository secrets.

Repository facts:

* `.github/workflows/update-scholar-metrics.yml` runs `scripts/update_altmetric.py` among ~20 steps. Its cron is
  `0 9 * * 1` (every Monday 09:00 UTC) even though its comment says "1st of every month". It commits and pushes to
  `main` as `github-actions[bot]`.
* `static/data/altmetric.json` today: `{"score": 4.0, "news": 0, "policy": 0, "twitter": 1, "patents": 1,
  "mendeley": 109}`. The 4.0 is the sum of per-paper scores (1 patent x 3 + 1 X post x 1).
* The panel is `layouts/partials/media/altmetric_summary.html` (CV page, via
  `layouts/partials/blocks/media_engagement.html`) and a near-copy `layouts/shortcodes/altmetric_summary.html`
  (publications page, via `content/publications/_index.md`). Both label the number "Total Score", describe it as "The
  Altmetric Attention Score", and list fixed weights (News 8, Policy 3, Patents 3, Social 1).
* Per-paper official Altmetric embed badges already exist: `layouts/partials/media/altmetric_badge.html`, hidden
  until the badge has a score.
* `static/data/media.json` has 2 items with fields `title, outlet, date, type, tags, summary`. There is no `url`
  field, so the Media Spotlight cannot link to the coverage. `assets/js/site/media_spotlight.js` renders it.
* `static/data/publications.json` has 45 entries with titles and no DOI field. DOIs live in front matter under
  `content/{journal,conference,workshop}_publication/*/index.md` (23 unique).
* `scripts/expand_stub_authors.py` already opens a GitHub issue (label `needs-review`) through the REST API with
  `GITHUB_TOKEN`, and has an SMTP email path.
* The CV master is a Word file in OneDrive (`Bampel Academic CV.docx`), outside the repo. A GitHub Action cannot
  edit it. The `academic-updates` skill is the existing route for CV edits.
* The site deploys in batches at 06:00 and 17:00 ET; a push to `main` does not build by itself.

Name clash: Benjamin C. Ampel (SUNY Albany, psychology) publishes under a near-identical name. Ben's own name forms are
"Benjamin Ampel", "Ben Ampel", "Benjamin M. Ampel".

## Proposed shape

1. **Collector** (`scripts/find_media_mentions.py`, weekly workflow): queries Google News RSS for the three name
   forms and for 5-10 distinctive paper titles; optionally GDELT with backoff; Wikipedia DOI search. Normalizes each
   hit to `{source, query, title, outlet, date, link}`.
2. **Filter**: drops links already in a seen-list; tags likely false positives (photo credit pattern, "Grad Ads",
   psychology keywords for Benjamin C. Ampel) but still shows them, collapsed.
3. **Queue**: one GitHub issue per week with a checkbox per candidate. No hit reaches the site without Ben.
4. **Promotion**: Ben (or a Claude session at his request) copies approved items into `static/data/media.json`
   with a new `url` field, and into the CV through `academic-updates`.
5. **Attention panel**: relabel as "Sum of per-paper Altmetric scores (N papers with records out of M)", show each
   source count with its source name, show curated media from `media.json` as a separate count, drop the weight
   table or link to Altmetric's own explanation, and decide what to do about the scraper.

## Open questions for the panel

* Is scraping `/details/` acceptable given robots.txt, or should the site rely only on official embed badges?
* Is a GitHub issue the right queue, or a markdown file, or a PR?
* Is the expected yield (roughly 1 real hit per several weeks) worth a scheduled job at all, compared with a monthly
  manual search or a Google Alert emailed to Ben?
