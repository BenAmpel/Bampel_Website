# Media discovery checklist (stage 1)

This is the no-code routine for finding public mentions of Ben's work (see [design.md](./design.md), Change B).
Stage 2, an automated collector, is built only if this routine shows that it misses coverage.

## 1. Decision log

| Date | Decision |
| --- | --- |
| 2026-11-02 | Stage 1 adopted. Attention panel set to Altmetric badges plus a weekly Dimensions citations line (P1 + P4). |

## 2. Found-items log

Add one row for every real item, however it was found. A **real item** is one that Ben adds to `static/data/media.json`.

* **First route**: Alert, checklist, press office, collector, or other. The 3 starting rows use "known before
  tracking".
* **Also found by**: any later route that also found the item.

| Date found | Title | Outlet | First route | Also found by | In media.json |
| --- | --- | --- | --- | --- | --- |
| (before 2026-11-02) | Benjamin Ampel Receives ACM SIGMIS Doctoral Dissertation Award | Georgia State University | known before tracking | Google News (2026-11-02 search) | yes |
| (before 2026-11-02) | More Older Americans Being Scammed; Is Technology a Factor? | The National Desk | known before tracking | | yes |
| (before 2026-11-02) | MIS PhD Student Ben Ampel Receives Best Paper Award at IEEE ISI Conference | Eller College of Management | known before tracking | | yes |

## 3. Google Alerts (Ben sets these up once, in his own Google account)

1. Go to google.com/alerts.
2. Create one alert for each of these queries:
   * `"Benjamin Ampel" -psychology -Albany`
   * `"Ben Ampel" -psychology -Albany`
   * `"Benjamin M. Ampel"`
3. Under "Show options", set:
   * How often: "At most once a day"
   * Sources: "Automatic"
   * How many: "All results"
   * Deliver to: Ben's inbox

The `-psychology -Albany` terms exclude Benjamin C. Ampel (SUNY Albany, psychology). Some false positives will still
come through, such as graduation ads, photo credits and alumni notes.

## 4. Quarterly search (about 15 minutes; January, April, July, October)

Check `static/data/media.json` first, so you know what is already logged. Then work through these sources:

1. The GSU news and Robinson College news pages: search for "Ampel".
2. The Eller College news site: search for "Ampel".
3. Google News: search each of the three names from section 3.
4. Google News: search the quoted full title of each recent journal paper. This is the hand test of title queries.
   Note any hit that the Alerts missed.
5. Google Scholar: open the "cited by" list for each journal paper and look for policy reports and press pieces.
6. Altmetric: open each journal paper's details page in your own browser, using the "View details" link under the
   paper's badge.
7. LinkedIn: check notifications that mention Ben.

Add each real item to the found-items log, then follow section 6.

## 5. Request to the press offices (Draft, not sent)

Ben decides whether to send this (design Q7):

> Could you copy me (bampel@gsu.edu) when a story, interview or newsletter item mentions my research? I keep a list
> of coverage on my website and CV, and I sometimes miss items that do not reach me directly. Thank you.

## 6. Adding an item to the site and the CV

1. Add an entry to `static/data/media.json` with these fields:
   * `title`
   * `outlet`
   * `date` (YYYY-MM-DD)
   * `type`, for example "Press Release", "News Story" or "TV Segment"
   * `tags`
   * `summary`: one line
   * `url`: the publisher's https link, never a Google News link
   * `in_cv`: `false`
2. Add a row to the found-items log (section 2).
3. Commit without `[deploy now]`. The item goes live at the next 06:00 or 17:00 ET build.
4. Update the CV's "PUBLIC ENGAGEMENT AND MEDIA COVERAGE" section through `academic-updates`, then set
   `"in_cv": true`.

## 7. Stage 2 gate

Stage 2 (see the design) can start only when all of these are true:

* this routine has run for one full quarter;
* the step 4 title search found at least one real item that the Alerts missed;
* adding title searches to this checklist was not enough.

Record the outcome in the decision log.
