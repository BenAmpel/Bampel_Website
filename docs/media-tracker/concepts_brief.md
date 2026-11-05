# Public-mention tracking and an honest attention panel

* **Author:** Claude (EGM brainstorm, unattended run for Ben Ampel)
* **Date:** 2026-11-02
* **Status:** Concept brief. Not approved. Nothing is built. Inputs: `concept_seed.md` and
  `brainstorm_goldfish_analysis.md` (six Goldfish reviewers: 5 Blockers, 21 Majors, 7 Nits).
* **Run note:** EGM's brainstorm asks the owner to confirm a working hypothesis before the review, and to pick a
  next step afterwards. This run was unattended, so those gates were not held. Every decision they would have
  settled is listed under "Decisions for Ben" below.

## Overview

The request was a weekly automated job that finds media and public mentions of Ben Ampel and his papers, queues them
for his approval, and feeds approved items to the Media Spotlight (`static/data/media.json`) and the CV. A second
request was to make the website's "Cumulative Research Attention" panel honest.

The brainstorm review splits these into two pieces of work with very different value:

* **A. Attention panel.** It is live today, overstates what it shows, and gets its numbers by fetching pages that
  Altmetric's robots.txt closes to bots. Fixing it is mostly deletion and costs little. Do it first.
* **B. Mention discovery.** The job is cheap to run, but measured recall is about 1 in 3 against coverage already
  known (F2). Every real item so far came from a press office Ben already works with. The design therefore starts
  with a no-code baseline and a short trial of a minimal collector, with a kill rule, before any standing weekly job.

## Facts (numbered; checked 2026-11-02 unless noted)

* **F1** Google News RSS for `"Benjamin Ampel"` returns 5 items: the GSU SIGMIS award release (real), two Atlanta
  Jewish Times "Grad Ads" pages, a MadameNoire listicle with the photo credit "Benjamin Ampel / Getty", and a 2010
  Times Herald-Record "College notes" item. The links are `news.google.com/rss/articles/...` wrappers, and old
  items are mixed with new ones.
* **F2** `media.json` has 3 real items: the GSU SIGMIS release (2025), The National Desk segment (2024) and the Eller
  best-paper story (2020). The F1 query finds only the first, so recall against known coverage is 1 of 3.
* **F3** `https://news.google.com/robots.txt` is `User-agent: *` / `Disallow: /`, with Allow lines for `/`, `/home`,
  `/topics/`, `/stories/` and similar, and none for `/rss/`. `https://www.google.com/robots.txt` disallows
  `/alerts/` (so Google Alerts' RSS feeds too). Both are feeds that Google publishes for feed readers.
* **F4** `https://www.altmetric.com/robots.txt`: `User-agent: *` / `Disallow: /details/`.
* **F5** `scripts/update_altmetric.py` fetches `https://www.altmetric.com/details/doi/<doi>` with a hard-coded Chrome 91
  User-Agent string (lines 18-21, 52). It does this whenever `ALTMETRIC_API_KEY` is unset or the API call fails.
* **F6** The Altmetric Details Page API has needed a key since 2025-11-10. Free keys are for scientometric research
  and not for self-assessment. Crossref Event Data closed on 2026-04-23.
* **F7** GDELT DOC 2.0 answered HTTP 429 on the first call.
* **F8** The Wikipedia search API (`insource:"<doi>"`) finds no page for any of the 23 DOIs in the publication front
  matter, and no page for "Benjamin Ampel".
* **F9** Lens.org shows patent CN-114328707-A citing the 2019 Hyperledger Sawtooth paper (DOI
  10.1109/ISI.2019.8823238). The Lens API needs a token; its terms were not checked.
* **F10** `.github/workflows/update-scholar-metrics.yml` runs every Monday at 09:00 UTC (`0 9 * * 1`), although its
  comment says "1st of every month". It grants only `contents: write`, has no `continue-on-error` steps, and pushes
  to `main`.
* **F11** `static/data/altmetric.json` is `{"score": 4.0, "news": 0, "policy": 0, "twitter": 1, "patents": 1,
  "mendeley": 109}`: totals over all DOIs, with no per-paper rows, no date and no record of how they were fetched.
  On a failed fetch the scraper returns zeros, and `main()` overwrites the file without checks.
* **F12** The CV page (`layouts/partials/media/altmetric_summary.html` + `assets/js/widgets/altmetric-summary-media.js`)
  always shows the panel. The publications page (`layouts/shortcodes/altmetric_summary.html` +
  `assets/js/widgets/altmetric-summary.js`) shows it only if score >= 25, news >= 3 or Mendeley >= 150, so it is
  hidden today. Both say "Total Score" and "The Altmetric Attention Score" and list fixed weights.
* **F13** `assets/js/site/media_spotlight.js` drops `url` in `normalize()` and writes `title`, `outlet`, `summary`, `tags`
  and `type` into `innerHTML` without escaping.
* **F14** Official per-paper Altmetric embed badges already exist (`layouts/partials/media/altmetric_badge.html`), hidden
  until a badge has a score.
* **F15** The repository has never had a GitHub issue (`gh issue list --state all` returns 0). The issue path in
  `scripts/expand_stub_authors.py` has either never fired or has failed silently. The token's `contents: write`-only
  scope makes failure likely.
* **F16** `.github/workflows/version-watch.yml` (`issues: write`, `gh issue create`, skips a duplicate open issue) and
  `.github/workflows/pathways-refresh.yml` (rolling branch, concurrency group, never pushes to `main`) are working
  templates in this repo.
* **F17** The CV master is `Bampel Academic CV.docx` in OneDrive, outside the repo; the `academic-updates` skill edits it
  and re-exports `static/uploads/cv.pdf`. The site builds only at 06:00 and 17:00 ET (`netlify.toml`).
* **F18** CI runs Node tests only (`.github/workflows/ci.yml`, `tests/**/*.mjs`).
* **F19** Name clash: Benjamin C. Ampel (SUNY Albany, psychology). Ben's forms: "Benjamin Ampel", "Ben Ampel",
  "Benjamin M. Ampel".

## Analysis

**The scraper is the root problem in A.** F4 and F5 together show that every number in the panel comes from pages
closed to bots, fetched while posing as a browser. F6 removes the licensed route for this use. Relabelling the panel
does not change where its data comes from. F11 adds a second fault: one blocked week publishes zeros as fact. F12
adds a third: one page hides the panel unless it flatters, and the other always shows it. That is selective
reporting. The honest fix removes the scraper and the summed number. It keeps the official per-paper badges (F14),
which are Altmetric's sanctioned display route.

**A consistent source rule matters more than any one source.** The seed questioned Altmetric over robots.txt but did
not check Google (F3). A rule that rejects Altmetric's HTML pages but accepts Google's feeds needs to be stated, not
assumed. The brief proposes this rule:

> A source is acceptable if it is either an official API used within its published terms, or a feed published for
> feed readers, fetched no more than once a day per URL with an honest User-Agent that names the site and a contact.
> Fetching HTML pages that robots.txt disallows, or spoofing a browser User-Agent, is not acceptable.

Under this rule, Google News RSS and Google Alerts RSS pass as feeds. The Altmetric scraper fails on both counts.
Wikipedia's API passes, but it found nothing (F8), so it is not worth adding. Ben may reject the rule. If he
applies robots.txt strictly to feeds as well, no automated discovery source is left, and B becomes the no-code
baseline only.

**B's value is unproven.** At 1-in-3 recall (F2) and about 1 real item in 5 hits (F1), a standing weekly job mostly
produces noise, and it can create false comfort ("the tracker found nothing"). The cheap baseline is the right first
step: a Google Alert delivered to Ben's inbox, plus a quarterly 15-minute checklist. A collector is worth building
only if it finds items that the baseline misses. Two things could make it find more: queries on paper titles, which a
name alert does not cover, and a single place that keeps a record of decisions.

**Approval must be a real action.** A checkbox in an issue changes nothing. Approval also needs human writing
(publisher URL, `type`, `tags`, `summary`), so a bot cannot honestly do the promotion. The design keeps promotion
manual and makes the queue a reading list with ready-to-paste snippets, or uses a PR in which "approved" means
"merged".

**Two small fixes stand alone.** The Media Spotlight should render `url` and escape its text (F13). The cron
comment should be corrected (F10). Both are worth doing with or without B.

## Goals vs. Non-Goals

* **In-scope goals**
  * The attention panel shows only numbers with a permitted source, labelled in plain language and dated, with no
    composite "Total Score", under one display rule on every page.
  * Nothing in the repository fetches `altmetric.com/details/` or sends a fake browser User-Agent.
  * Curated media (`media.json`) is shown apart from Altmetric data and labelled as selected by Ben.
  * The Media Spotlight links to coverage when an item has an `https` URL and shows feed text literally.
  * A discovery process exists: a baseline from week one, plus a trial collector with written success and kill
    criteria.
  * No candidate mention reaches the site or the CV without Ben's explicit approval.
  * `media.json` is the single list of coverage; each item records whether it is in the CV.
* **Out-of-scope non-goals**
  * Automatic publishing of any found mention.
  * Monitoring social media (X, LinkedIn, Bluesky, Reddit).
  * Computing a home-made attention score of any kind.
  * Editing the Word CV from GitHub Actions.
  * Buying an Altmetric licence or applying for a research key for this purpose.
  * Patent-citation tracking through Lens (F9): one known patent, so a hand-written line covers it.

## Alternatives Weighed

| Area | Option | Outcome and reason |
| --- | --- | --- |
| Panel | Relabel the summed score, keep the scraper (seed P5) | Rejected: the data source stays impermissible (F4-F6) and silent zeros remain (F11). |
| Panel | Official API counts (P6) | Rejected: the free key excludes self-assessment (F6); a paid key is out of scope. |
| Panel | Sum the embed badges' data in the browser (P7) | Rejected: uses the embed beyond its purpose, and the sum is just as misleading. |
| Panel | Keep only the Mendeley count (P8) | Rejected: no permitted source once the scraper goes. |
| Panel | Delete the aggregate, keep the per-paper badges (P1) | Carried forward as an option. |
| Panel | Hand-updated dated counts line (P2) or a single factual line (P3) | Carried forward as add-ons to P1. |
| Panel | "N of M papers have records" (P4) | Rejected: N has no permitted data source. |
| Sources | GDELT | Rejected for v1: 429 on the first call (F7); can be added later with backoff if a trial shows a gap. |
| Sources | Wikipedia DOI search | Rejected: 0 hits for 23 DOIs (F8). |
| Sources | Lens patents | Rejected for v1: token needed, terms unchecked, one known hit (F9). |
| Sources | Gmail Scholar Alerts read by the Action | Rejected: would put a long-lived mailbox OAuth secret in the repo. Ben reads those alerts directly. |
| Sources | Crossref Event Data | Rejected: shut down (F6). |
| Discovery | Do nothing | Rejected: misses coverage Ben did not take part in, and costs only slightly less than the baseline. |
| Discovery | Ask the GSU and Eller press offices to cc Ben | Kept as a no-code add-on to the baseline. |
| Discovery | Seed's weekly job as written (new issue every week, several sources) | Rejected: alert fatigue, and no evidence it beats the baseline. |
| Queue | Weekly new issue | Rejected: duplicate issues and noise. |
| Queue | Markdown queue file on `main` | Rejected: no notification; adds bot commits on `main`. |
| Queue | `issues: edited` workflow that writes ticked items | Rejected: needs write access from an issue event and an owner guard; the bot still cannot write `summary`. |
| Seen-list | `actions/cache` | Rejected: 7-day eviction on a weekly job resurfaces old hits. |
| Seen-list | Under `static/data/` | Rejected: published, so rejected hits about other people would go public. |
| Rendering | Move `media.json` to Hugo `data/media.yaml` | Deferred: works without JavaScript, but rewrites the renderer for no current need. |

## Key Decisions & Staging for Next Steps

Carried into `/egm-draft` as the working assumptions. All of them are listed again under "Decisions for Ben".

1. Ship three separate changes, in order: (A) attention panel, (S) small standalone fixes, (B) mention discovery.
2. A removes the scraper, the workflow step and `altmetric.json`, and adopts panel option P1 with an optional P2 or
   P3 line. The draft presents P1, P1+P2 and P1+P3 as owner choices.
3. One display rule on every page, with no threshold.
4. B stage 1 (week one, no code): a Google Alert, a quarterly checklist, and the press-office request.
5. B stage 2 (only if Ben approves): a minimal collector run by `workflow_dispatch` for 8-12 weeks, Google News RSS only,
   name queries plus title queries, then a go or no-go call against written criteria. The queue, seen-list storage
   and false-positive approach are owner choices in the draft.
6. `media.json` is canonical, gains `url` and `in_cv`, and promotion stays a hand edit.

## Decisions for Ben

1. Accept the split into A, S and B, done in that order?
2. Accept the source rule (official API within terms, or a feed for feed readers, with an honest User-Agent), or apply
   robots.txt strictly to feeds too, which leaves B as the baseline only?
3. Remove the Altmetric scraper and `altmetric.json`?
4. Panel: P1 alone, P1 + P2 (dated counts, refreshed by hand), or P1 + P3 (one factual patent line)?
5. Make `media.json` the canonical coverage list, with an `in_cv` field?
6. B: approve the baseline now, and decide whether the stage-2 trial runs at all.
7. If the trial runs: queue (one rolling issue, an email digest, or a rolling PR), seen-list storage and false-positive
   approach (the draft lays out the options).
