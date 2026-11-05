# Consolidated review: public-mention tracking and a clearer attention panel

* **Date:** 2026-11-02
* **Design:** [design.md](./design.md), revision 4
* **Status:** The review is complete and the design is waiting for Ben's approval. Nothing has been built, committed,
  pushed or sent.

## How the review ran

This was an unattended run of EGM, the Elephant-Goldfish Model. The process has four steps: brainstorm, then draft,
then review, then resolve. The review step itself has five stages, numbered 5 to 9:

1. Initial zoom-out (Stage 5).
2. Comprehension (Stage 6).
3. Critics (Stage 7).
4. Intermediate zoom-out (Stage 8).
5. Implementation readiness (Stage 9).

The stages ran in order. Every reviewer was a fresh "goldfish" subagent: it saw only the document and the repository,
never the conversation that wrote the design. Because no one was present to choose at the human checkpoints, the
author took the "auto accept" path at each one:

* every finding classed as PROPOSE FIX was applied;
* every architecture choice was left to Ben.

| Stage | Report | Blocker | Major | Nit | Result |
| --- | --- | --- | --- | --- | --- |
| Brainstorm (6 lenses) | [brainstorm_goldfish_analysis.md](./brainstorm_goldfish_analysis.md) | 5 | 21 | 7 | The work was split into A, S and B, and the brief was written: [concepts_brief.md](./concepts_brief.md) |
| 5 Initial zoom-out | [zoom_out_report.md](./zoom_out_report.md) | 0 | 6 | 4 | Resolved at Stage 7 |
| 6 Comprehension | [comprehension_report.md](./comprehension_report.md) | 0 | 7 | 9 | Resolved at Stage 7 |
| 7 Critics (design, structural, style) | [critic_report.md](./critic_report.md) | 1 | 18 | ~28 | Revision 2 ([goldfish_review_report.md](./goldfish_review_report.md)) |
| 8 Intermediate zoom-out | [intermediate_zoom_out_report.md](./intermediate_zoom_out_report.md) | 0 | 5 | 3 | Revision 3 |
| 9 Implementation readiness (3 lenses) | [implementation_readiness_report.md](./implementation_readiness_report.md) | 0 | 8 merged | ~26 | Revision 4 |

No Blocker remains open. Stages 8 and 9 were not re-run after their fixes, so the one re-audit each stage allows was
not used. If Ben wants an independent check of revision 4, he can re-run Stage 9.

## What changed between the first draft and revision 4

* **Change A (attention panel).** The design deletes the Altmetric scraper, `altmetric.json` and both summary panels.
  It keeps the official per-paper badges. It also offers an optional dated note, written by hand.
  * The note's checks run inside the Hugo partial, so every Netlify build enforces them. This matters because CI
    only reports and does not block deploys:
    * it hides lines that still say `TODO`;
    * it hides the whole note 200 days after its date;
    * it warns on the words "score", "impact" and "total";
    * it renders links safely.
* **Change S (small fixes).** The Media Spotlight is rendered with DOM methods, and it links only `https` publisher
  URLs, never Google redirects. Two smaller fixes come with it: a new `in_cv` field, and a corrected comment on the
  workflow's cron line.
* **Change B (mention discovery).** Stage 1 needs no code. It consists of:
  * Google Alerts;
  * a quarterly checklist;
  * a found-items log;
  * a draft request to the GSU and Eller press offices, not sent.

  Stage 2, an automated collector, is now only an architecture sketch, gated on evidence. The reviewers found two
  problems with specifying it fully now: the trial as first designed could not answer its own keep-or-remove
  question, and a full spec would probably be rewritten once the gate's hand test is done. The sketch fixes these
  rules for any later design:
  * one source (Google News RSS);
  * a fixed `TRIAL_END` date in the workflow file;
  * green runs count toward the trial, red runs do not;
  * a 14-day window for baseline runs;
  * escaped text;
  * a written keep-or-remove rule.

## Decisions for Ben

Q2 and Q6 are settled. Building Changes A, S and B stage 1 now needs only Ben's go-ahead. The other questions matter only if stage 2 goes ahead.

| # | Decision | Needed for |
| --- | --- | --- |
| Q2 | **Decided 2026-11-02: P1 + P4.** Badges, plus a weekly Dimensions citations line. Stage 9 was re-run on P4; see the end of [implementation_readiness_report.md](./implementation_readiness_report.md). | Change A |
| Q6 | **Answered from `cv.pdf`.** All 3 items are in the CV, so `in_cv: true` is set for each. | Change S |
| Q7 | Send the drafted request to the GSU and Eller communications offices? | Stage 1 (optional) |
| Q1 | Accept the source rule, which allows feeds that Google's robots.txt disallows for crawlers? Check Google's terms first | Stage 2 only |
| Q3 | Allow stage 2 at all, subject to the gate? | Stage 2 only |
| Q4 | Delivery: a rolling issue or a rolling pull request? (Escalation E1) | Stage 2 only |
| Q5 | False-positive labels, or a flat list? | Stage 2 only |
| Q8 | Trial runs on a weekly schedule, or by hand only? | Stage 2 only |

## Facts found during this run that go beyond the original brief

* **Altmetric's robots.txt** disallows `/details/` for every bot. The current scraper fetches those pages while
  sending a Chrome User-Agent string, so it identifies itself as a browser.
* **Google's robots.txt** disallows Google News `/rss/` and `/alerts/` for crawlers.
* **Wikipedia:** none of the 23 DOIs in the publication front matter matched any page.
* **The metrics workflow** runs every Monday, although its comment says monthly.
* **`media.json`** gained its third item, with a `url`, in commit 5e37e06, during this session.
* **The repository** is public, has Issues enabled, and has never had an issue. That makes it likely that the
  `needs-review` path in `expand_stub_authors.py` has never worked, because the workflow grants no `issues: write`
  permission. This is listed as a separate future fix.
* **The CV-page panel** is always visible. The publications-page panel shows only when the score is at least 25,
  there are at least 3 news mentions, or there are at least 150 Mendeley readers.
