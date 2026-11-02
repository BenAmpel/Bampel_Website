# Public-mention tracking and a clearer attention panel

*   **Author:** Claude, for Ben Ampel (unattended design run; nothing built)
*   **Status:** Proposed, revision 6. On 2026-11-02 Ben chose P1 + P4 for Q2. P4 was then re-reviewed at Stage 9
    and its findings were applied. The design is awaiting Ben's go-ahead to build Changes A, S and B stage 1.
*   **Date:** 2026-11-02
*   **Predecessor:** [concepts_brief.md](./concepts_brief.md). Fact numbers F1-F19 refer to that brief. Each one is
    summarised where it is used.

--------------------------------------------------------------------------------

## Overview

This design covers three separate changes to bampel.com and its repository.

*   **Change A, attention panel.** The "Cumulative Research Attention" box gets its numbers from a script that fetches
    Altmetric pages closed to bots while sending a fake browser identity. It then shows the sum of the per-paper scores
    as one "Total Score". Change A removes the script and the summed number. It keeps Altmetric's official per-paper
    badges. Optionally, it adds a short, dated attention note that Ben writes by hand.
*   **Change S, small fixes.**
    *   The Media Spotlight links to coverage and shows its text exactly as written.
    *   Each coverage item records whether it is in the CV.
    *   A wrong comment in the weekly workflow is corrected.
*   **Change B, mention discovery.**
    *   **Stage 1** is a written routine that needs no code: a Google Alert, a quarterly checklist, a draft request to
        the press offices, and a log of every item found.
    *   **Stage 2** is a minimal collector, sketched here and specified in a follow-up design if it is ever needed. It
        runs weekly for a fixed 10-week trial and then stops by itself. It may start only after stage 1 has run for one
        quarter, a hand test shows that title queries find coverage stage 1 misses, and adding those searches to the
        checklist has not been enough. It reads Google News RSS for Ben's name and paper titles, drops items it has already shown,
        labels known false positives, and posts new candidates to a review queue. Ben then keeps or removes it
        against a written rule.

Nothing the collector finds reaches the site or the CV without Ben. Each change can be approved, built and reverted on
its own, and A and S do not depend on B.

## The Problem

**The panel overstates what it shows, and its data comes from a disallowed route.**

`scripts/update_altmetric.py` downloads `https://www.altmetric.com/details/doi/<doi>` for each of the 23 DOIs. It does
this with a hard-coded Chrome User-Agent (F5). Altmetric's robots.txt disallows `/details/` for every bot (F4). The
licensed route, the Details Page API, needs a key, and free keys exclude self-assessment (F6).

The script adds the per-paper scores together into `static/data/altmetric.json` (F11). The CV page shows that sum as
"Total Score 4", under the text "The Altmetric Attention Score" and a simplified weight table. Altmetric publishes no
such score for an author.

There are three further defects:

*   A failed fetch writes zeros, and they are published as fact (F11).
*   The publications page shows the same box only when the score, news count or Mendeley count passes a threshold
    (25, 3 or 150). So it appears only when the numbers are large (F12).
*   The Media Spotlight ignores the `url` field and inserts its text into the page without escaping it (F13).

**Coverage is found by chance.** Ben has no routine for finding public mentions. On 2026-11-02, Google News found
1 of the 3 items already listed in `media.json`. Four of its 5 results were about other people or were not coverage
(F1, F2). How much coverage is missed is unknown. Every known item came either from a press office Ben already works
with or from an interview he gave.

Some terms used below:

*   **Batched builds.** The site rebuilds only at 06:00 and 17:00 US Eastern. A commit whose message contains
    `[deploy now]` would trigger an immediate build, and Ben has asked that this tag not be used.
*   **`academic-updates`.** This is a Claude Code skill that Ben uses to edit his CV. The CV master is a Word file in
    OneDrive, outside this repository. The skill also re-exports `static/uploads/cv.pdf` (F17).

## Goals

*   No page on bampel.com shows a summed Altmetric number, a "Total Score", or the weight table.
*   Nothing in the repository fetches `altmetric.com/details/`. Nothing sends a browser User-Agent to Altmetric or to
    any page that its robots.txt disallows.
    *   Out of scope: `scripts/self-host-google-fonts.mjs` sends a Chrome User-Agent to Google Fonts, which needs it to
        serve woff2 files. That is a separate question.
*   Any attention figure on the site names its source and the date it was checked. The CV page and the publications
    page follow the same display rule.
*   Curated coverage is shown separately from Altmetric data, and is labelled as selected by Ben.
*   The Media Spotlight links each item that has an `https` publisher URL. It shows all text exactly as written.
*   `static/data/media.json` is the single list of coverage. Each item says whether the CV has it.
*   From approval on, a written discovery routine and a log of found items exist (stage 1).
*   If stage 2 runs:
    *   each new candidate reaches one queue, once;
    *   the trial stops by itself after 10 weeks;
    *   Ben records a keep-or-remove decision against the written rule.
*   No candidate reaches `media.json` or the CV without Ben's explicit approval.

## Non-Goals

*   Publishing any found mention automatically.
*   Monitoring social media.
*   Computing an attention score of our own.
*   Editing the Word CV from GitHub Actions. The CV stays a hand edit through `academic-updates`.
*   Buying an Altmetric licence, or applying for a research key for self-assessment.
*   Tracking patent citations through Lens (F9: one known patent, found on Altmetric).
*   Repairing the GitHub-issue path in `scripts/expand_stub_authors.py`. That path has never produced an issue,
    probably because the workflow grants no issue permission (F15). The fix is listed under Future Improvements.
*   Moving `media.json` to Hugo build-time data.

## Critical User Journeys (CUJs)

Each "Then" block uses numbered steps for sequences and bullets for alternative outcomes.

### CUJ 1: A visitor reads the attention section

*   **Given**: Change A is live with option P1 + P4. The Monday job wrote `data/dimensions.json` on 2026-11-02.
*   **When**: A hiring-committee member opens `/cv/` and expands "Research attention".
*   **Then**:
    1.  They see "322 citations across 23 papers with DOIs, counted by Dimensions (updated 2 November 2026)". The word
        Dimensions links to dimensions.ai.
    2.  A muted sentence says these are citation counts, not an Altmetric score, and that each paper page shows its
        own Altmetric and Dimensions badges.
    3.  The publications page shows the same note, rendered by the same partial.
    4.  If the file is more than 16 days old (two missed weekly runs), both pages hide the attention note, and the next push's CI
        run fails on the partial's warning.

### CUJ 2: Ben adds a coverage item to the site and the CV

*   **Given**: Ben learns of an article through the Google Alert, the checklist, a press office or the stage-2 queue.
*   **When**: He asks a Claude session to add it, or edits the file himself.
*   **Then**:
    1.  A new entry goes into `static/data/media.json`. It has the publisher's URL, `type`, `tags`, a one-line
        `summary`, and `"in_cv": false`.
    2.  A line goes into the found-items log in `docs/media-tracker/checklist.md`. It records the date, the title and
        the route that found the item.
    3.  The change is committed without `[deploy now]`, so it appears at the next 06:00 or 17:00 ET build.
    4.  The CV is updated through `academic-updates`. Then `in_cv` is set to `true` by hand, as an explicit step in
        the checklist.
    5.  The Spotlight shows the title as a link. Characters such as `<b>` appear as typed.

### CUJ 3: A stage-2 run finds a candidate (Delivery I shown)

*   **Given**: The trial is running, and the seen-list holds every item shown in earlier runs.
*   **When**: The Monday run sends its queries and gets back one item that is not in the seen-list.
*   **Then**:
    1.  The run saves the updated seen-list first.
    2.  It then adds one comment to the open "Media mentions: candidates" issue. The comment gives:
        *   the candidate's title, as escaped text
        *   the outlet and date
        *   the Google News link
        *   the queries that matched
        *   any false-positive labels
        *   a JSON-encoded `media.json` snippet with `url`, `type`, `tags` and `summary` set to `"TODO"`
    3.  The job summary lists each query's status.

### CUJ 4: A stage-2 run finds nothing, or Google fails

*   **Given**: The trial is running.
*   **When**: No new item comes back, or Google answers 429 or times out.
*   **Then**:
    *   If there is no new item, the run makes no comment, pull request or commit. The run still counts toward the
        trial.
    *   If some queries fail, the summary shows "failed (429)" for each one. The other queries still run, and the
        seen-list changes only for items that were returned. The run counts toward the trial if at least one query
        succeeded.
    *   If every query fails, the run fails, so GitHub sends Ben its standard failed-run email. The run does not count
        toward the trial.

### CUJ 5: The trial ends

*   **Given**: The `TRIAL_END` date fixed in the workflow (first run + 9 weeks) has passed.
*   **When**: The next scheduled run starts.
*   **Then**:
    1.  The run posts one note: "Trial ended on <date>. Count the green scheduled runs in the Actions tab and record a
        decision in checklist.md".
    2.  The run skips the query step. Every later run does the same, re-posting nothing, until Ben removes or extends
        the job.
    3.  Ben compares the found-items log with the rule under Technical Plan, Change B, and records keep or remove at
        the top of `checklist.md`.

## Technical Plan (Architecture)

### Change A: attention panel

Data flow today:

```text
update-scholar-metrics.yml (Mon 09:00 UTC)
  └─ scripts/update_altmetric.py ──GET /details/doi/<doi> (fake browser UA)──> altmetric.com
        └─ writes static/data/altmetric.json (sums; zeros on failure)
              ├─ CV page: partials/media/altmetric_summary.html + altmetric-summary-media.js (always shown)
              └─ Publications page: shortcodes/altmetric_summary.html + altmetric-summary.js (shown above threshold)
Paper pages: partials/media/altmetric_badge.html ──embed.js──> Altmetric (official, per paper)
```

After Change A:

```text
Paper pages: partials/media/altmetric_badge.html ──embed.js──> Altmetric (unchanged)
CV page (blocks/media_engagement.html) ───────────┐
Publications page (shortcode attention_note) ─────┴─> partials/media/attention_note.html <── data/dimensions.json
                                                       (P4, the chosen option; rendered at build time)
update-scholar-metrics.yml (Mon) └─ scripts/fetch_dimensions_metrics.py ──GET, 1 req/s──> metrics-api.dimensions.ai
                                      └─ writes data/dimensions.json (keeps last good values; never zeros)
```

**What is removed under every option:**

*   the scraper
*   its workflow step, and its entry in the workflow's `git add` line
*   `static/data/altmetric.json`
*   both summary templates and both summary scripts
*   the publications page's `{{< altmetric_summary >}}` call

The JSON and the panel go together, so stale numbers do not linger. A search of `scripts/`, `assets/`, `layouts/`,
`content/`, `static/`, `tests/` and `.github/` finds no other reader of `altmetric.json`.

**Owner options (Q2). These are not ranked.**

*   **P1, badges only.**
    *   Mechanism: The attention section is removed. Each paper page keeps its official Altmetric badge.
    *   Trade-offs: Nothing to maintain, and within Altmetric's terms. The site loses its at-a-glance summary and
        the Mendeley count.
    *   Fails when: Ben wants attention evidence on the CV page itself.
*   **P1 + P2, dated counts note.**
    *   Mechanism: `data/attention.yaml` holds an `as_of` date and a few lines. Each line has text and an optional
        link. A partial renders the file at build time, with no JavaScript, as one "Research attention" section on
        both pages.
    *   Updating: Ben refreshes the counts each quarter by opening the per-paper Altmetric pages in his own browser.
        No script or agent fetches them. The partial stops rendering the note once `as_of` is more than 200 days
        old. The check runs on every Netlify build, so a stale note disappears from the site instead of staying up.
    *   Trade-offs: The note is specific and dated. Updating it costs about 20 minutes a quarter.
    *   Fails when: Ben stops refreshing it. The note then disappears after 200 days, and the CV page loses the section
        until he refreshes it.
*   **P1 + P3, one factual line.**
    *   Mechanism: The same file and partial as P2, with one line: "Cited in Chinese patent CN-114328707-A (Hyperledger
        Sawtooth paper, IEEE ISI 2019)". The line links to the patent record. Its `as_of` is left empty, because it
        records a fixed fact, so the staleness test does not apply.
    *   Trade-offs: Specific and checkable. It changes only if a new citation appears. It covers one fact.
    *   Fails when: New attention arrives and nobody adds a line.

*   **P1 + P4, weekly Dimensions citations line** (chosen by Ben on 2026-11-02; see
    [attention-sources.md](./attention-sources.md); re-reviewed at Stage 9).
    *   Mechanism:
        *   A new step in the Monday metrics job calls `metrics-api.dimensions.ai/doi/<doi>` for each DOI, dropping an arXiv DOI only when a published
            version of the same paper is also listed.
            This API needs no key.
        *   It writes a JSON file with `times_cited` per DOI, the sum, and the date.
        *   The same partial shows one line, for example "322 citations across 23 papers with DOIs (Dimensions,
            updated 2 November 2026)", with a link to dimensions.ai.
    *   Terms:
        *   Dimensions allows showing metrics for work Ben authored, at no more than 1 request per second.
        *   The page must attribute Dimensions.
        *   Only the latest metrics may be shown. The weekly refresh meets this.
    *   Trade-offs:
        *   This is the only automated figure with a source that permits it. Unlike the Altmetric sum, a sum of
            citations has a plain meaning.
        *   It measures citations, not public attention.
    *   Fails when:
        *   The API is down or changes. The step then keeps the last good file and never writes zeros.
        *   The file is more than 16 days old. The partial then hides the attention note.
    *   Can be combined with P2 or P3.

**Display rule.** Under the chosen option, P4, the section renders exactly when `data/dimensions.json` exists and was
generated no more than 16 days before the build. Under P2 or P3, the section would render whenever
`data/attention.yaml` has at least one line. In neither case does the size of the numbers play a part. Both pages call the same partial; the publications page reaches it through a one-line
shortcode, because a content page can call only shortcodes. This follows `layouts/shortcodes/altmetric.html`, which
wraps `partials/media/altmetric_badge.html` in the same way.

**Wording rules for `attention.yaml` lines (P2 or P3; not chosen):**

*   Name the source.
*   Use plain nouns ("post on X", "Mendeley readers", "patent citation").
*   Never use "impact", "score" or "total".
*   Never add counts from different sources together.
*   Do not repeat items already in the Media Spotlight.
*   Note that a Mendeley total across papers can count one reader more than once.

The first P2 values must be read by hand from the pages. They must not be copied from `altmetric.json`, whose figures
the scraper produced.

The Spotlight's subtitle becomes "Coverage and interviews selected by Ben Ampel". This separates it from Altmetric's
counts.

### Change S: small fixes

*   **Media Spotlight rendering** (`assets/js/site/media_spotlight.js`).
    *   Cards, tags and filter buttons are built with DOM methods (`textContent`, `createElement`) instead of
        template strings in `innerHTML`.
    *   A `url` is kept only if two conditions hold:
        *   after trimming, it starts with `https://`
        *   its host is not exactly `news.google.com`, `www.google.com` or `consent.google.com`
    *   A kept `url` turns the title into a link with `rel="noopener"` and `target="_blank"`.
    *   Filtering, sorting and the summary line behave as they do now.
    *   Today only the Eller 2020 item has a `url`.
*   **`media.json` schema.** Each item has these fields:
    *   `title`, `outlet`, `date` (YYYY-MM-DD), `type`, `tags`, `summary` (all existing)
    *   `url` (optional): the publisher's https URL, never a Google redirect
    *   `in_cv` (boolean): set to `true` by hand once the item is in the CV

    Nothing on the site reads `in_cv`. It is a reminder used when the CV is synced.
*   **Workflow comment.** `.github/workflows/update-scholar-metrics.yml` says "1st of every month" above a cron that
    runs every Monday. The comment becomes "Every Monday at 09:00 UTC". The schedule itself does not change.

### Change B: mention discovery

**Stage 1 (no code)** is the file `docs/media-tracker/checklist.md`. It contains these sections:

1.  **Decision log.**
2.  **Found-items log.** One row per real item, whatever route found it. Columns:
    *   date found
    *   title
    *   outlet
    *   first route: Alert, checklist, press office, collector or other
    *   also found by: any later routes
    *   whether it went into `media.json`

    A **real item** is one that Ben adds to `media.json`. The route "known before tracking" is used only for the
    3 starting rows.
3.  **Google Alert setup.** Three alerts, set to "All results" and delivered to Ben's inbox:
    *   `"Benjamin Ampel" -psychology -Albany`
    *   `"Ben Ampel" -psychology -Albany`
    *   `"Benjamin M. Ampel"`
4.  **Quarterly search routine** (about 15 minutes):
    *   the GSU and Eller newsrooms
    *   Google News for the three names
    *   Google Scholar "cited by" for the journal papers
    *   each journal paper's Altmetric page, viewed in Ben's browser
    *   Ben's LinkedIn mentions
5.  **Draft request to the GSU and Eller communications offices,** asking them to copy Ben on coverage. It is marked
    "Draft, not sent". Ben sends it if he chooses (Q7).
6.  **Steps for adding an item** (CUJ 2), including setting `in_cv`, and the `media.json` schema.

**Gate before stage 2.** Stage 2 may start only when all of the following hold:

*   stage 1 has run for one full quarter, and the found-items log has its rows;
*   a hand test has run all title queries (journal and conference titles) on Google News;
*   that hand test found at least one real item that the Alert did not.

Outcomes of the gate:

*   **The hand test finds nothing.** Stage 2 is not built.
*   **It finds something.** The first step is to add those title searches to the quarterly routine, which builds
    nothing. Stage 2 goes ahead only if Ben then wants the searches automated.

Either way, the found-items log is the evidence.

**Stage 2 (trial collector): architecture sketch.** Stage 2 runs only if three things happen in order:

1.  Ben allows it (Q3).
2.  The gate is met.
3.  Title searches were added to the quarterly checklist, and Ben still wants them automated.

The full implementation spec is written as a follow-up design at that point. The hand test that the gate requires
will show which queries and which delivery work, so a spec written now would probably be rewritten. This sketch fixes
the shape and the rules that the follow-up must keep.

```text
media-mentions.yml (weekly + manual run; one run at a time; never pushes to main; TRIAL_END fixed in the file)
  └─ if today > TRIAL_END: post one "trial ended" note and stop
  └─ collector (Node, tested with node --test)
        ├─ queries: 3 name forms + the journal and conference titles that the hand test showed were useful
        ├─ Google News RSS search, one query at a time, honest User-Agent that names a contact
        ├─ drop items already shown; merge one article found by several queries
        ├─ label known false positives (labels only; nothing is hidden or ranked)
        └─ candidates + per-query status table
  └─ delivery (Q4): save the seen-list, then post candidates if there are any
```

*   **Source.** Google News RSS search only. Its robots.txt disallows `/rss/` for crawlers (F3). It is admitted only
    under the Q1 source rule. Google's terms for this feed are unchecked, and Ben checks them before approving
    stage 2.
*   **Queries.**
    *   Name forms:
        *   `"Benjamin Ampel" -psychology -Albany`
        *   `"Ben Ampel" -psychology -Albany`
        *   `"Benjamin M. Ampel"`
    *   Titles: one quoted query per title that the hand test kept.
*   **Seen-list.** The seen-list is the set of items already shown. An item is identified by its Google News article
    ID, or by its title plus outlet. It is marked seen when it is first shown. No delivery records Ben's decisions,
    and the queue keeps everything shown.
*   **Missing seen-list** (first run, or after a reset). The run records every item as seen. It shows only items
    published in the last 14 days, and posts one note saying it took a baseline. This keeps old items out of the
    queue: the 2010 "College notes" page and the two 2024 "Grad Ads" pages in F1.
*   **False-positive labels.** These are fixed patterns, for example "photo credit", "graduation ad", "alumni notes"
    and "possibly Benjamin C. Ampel (SUNY Albany)". Labelled items are still shown, after the others. No pattern
    matches on "Ampel" alone. Q5 decides whether labels are used at all.
*   **Failure rule.**
    *   A failed query does not stop the others.
    *   A run where every query fails ends red (failed), so GitHub emails Ben.
    *   A green run counts toward the trial; a red run does not. Ben counts green scheduled runs in the Actions tab,
        so no counter is stored.
*   **Trial limit.** `TRIAL_END` is a fixed date in the workflow file. It is set in the commit that turns the trial on,
    to first run + 9 weeks. A reset of the seen-list cannot move it.
*   **Text safety.** Feed text is always escaped in issue and pull-request text. Nothing from the feed reaches
    bampel.com except through Ben's hand edit.

**Keep-or-remove rule.** At the end of the trial, Ben keeps the job only if both of these hold:

*   **A collector-only find.** At least one real item in the found-items log has "collector" as its first route, and
    the Alert and checklist did not also find it during the trial window. The log has an "also found by" column for
    this check.
*   **Enough working runs.** At least 7 of the 10 scheduled runs were green.

If fewer than 7 were green, Google blocked the job too often, and it is removed. A quiet 10-week trial is weak
evidence, because real items arrive at a rate of a few a year. So removing the job after a quiet trial is a cost
decision, not a finding that no coverage exists. The decision goes in the checklist's decision log.

**Delivery and seen-list storage (Q4). These options are not ranked.**

*   **I. Rolling issue** (the `version-watch.yml` pattern).
    *   **Mechanism:** One open issue, "Media mentions: candidates". The seen-list is kept as short hashes in the issue
        body: a trial's few hundred keys fit well under GitHub's 65,536-character limit. Each run saves the
        seen-list first, then adds a comment.
    *   **Permissions:** `issues: write`, plus read access to contents.
    *   **Costs:**
        *   The issue is public, because the repository is public and Issues are enabled.
        *   Closing the issue, or editing the hash block, triggers a baseline run.
        *   It works only if Ben reads GitHub notifications.
*   **II. Rolling pull request** (adapted from `pathways-refresh.yml`).
    *   **Mechanism:** Candidates and the seen-list live in `.github/media-tracker/` on a branch. Ben adds approved items
        to `media.json` in the pull request and merges it.
    *   **Permissions:** `contents: write` for the whole repository.
    *   **Costs:**
        *   It needs new branch handling that `pathways-refresh.yml` does not have. That pattern force-pushes, which
            would erase Ben's edits.
        *   Every merge puts bot-written files on `main`, the cost that B5 rejects for a queue file.
    *   **Rule:** If Ben picks II, the follow-up design specifies the branch handling.

## Alternatives Considered

This section is derived from the brief's "Alternatives Weighed". B4 and S1 are new in this design.

### Alternative A1: Relabel the summed score and keep the scraper

*   **Pros**: Least work. Keeps the CV-page panel.
*   **Cons**: It still fetches pages that robots.txt disallows, with a fake User-Agent (F4, F5). Failed fetches still
    publish zeros (F11). A sum of per-paper scores has no defined meaning.
*   **Reason for Rejection**: It fixes the label, not the data source.

### Alternative A2: Official API counts, a browser-side sum of embed badges, or a Mendeley-only figure

*   **Pros**: Real per-paper data.
*   **Cons**:
    *   The free API key excludes self-assessment (F6), and a paid key is out of scope.
    *   Summing badge data in the browser uses the embed for something it was not built for, and gives the same
        misleading total.
    *   A Mendeley-only figure has no permitted source once the scraper is gone.
*   **Reason for Rejection**: None of these has a permitted source for this use.

### Alternative A3: "N of M papers have Altmetric records"

*   **Pros**: A summary signal with no composite score.
*   **Cons**: N has no permitted source once the scraper is gone.
*   **Reason for Rejection**: No source.

### Alternative S1: A sanitiser library, or Hugo build-time rendering, for the Spotlight

*   **Pros**:
    *   A library such as DOMPurify allows rich text.
    *   Build-time rendering works without JavaScript and is covered by the link checker.
*   **Cons**:
    *   The library adds a dependency for plain-text fields.
    *   Build-time rendering means rewriting the renderer and its filters.
*   **Reason for Rejection**: DOM methods fix the escaping with no new dependency. Build-time rendering stays a future
    improvement.

### Alternative B1: The seed's weekly job (a new issue each week; GDELT, Wikipedia, Lens and Gmail sources)

*   **Pros**: The widest automated search.
*   **Cons**:
    *   GDELT returned 429 on the first call (F7).
    *   Wikipedia had 0 hits for 23 DOIs (F8).
    *   Lens needs a token, and its terms were not checked (F9).
    *   Gmail would put a mailbox OAuth secret in the repository.
    *   Crossref Event Data has shut down (F6).
    *   A new issue every week would mostly hold no relevant items.
*   **Reason for Rejection**: It adds cost and noise with no evidence of extra yield.

### Alternative B2: Do nothing

*   **Pros**: No effort.
*   **Cons**: It misses any coverage Ben did not take part in, and keeps no record.
*   **Reason for Rejection**: Stage 1 costs about an hour a quarter and creates the record that any later decision
    needs.

### Alternative B3: Google Alerts delivered as RSS, polled by the job

*   **Pros**: The Alert reports only new items, so no seen-list is needed.
*   **Cons**:
    *   `www.google.com/robots.txt` disallows `/alerts/` (F3).
    *   RSS delivery was not checked as still available.
    *   Alerts do not search paper titles.
*   **Reason for Rejection**: It adds nothing over the emailed Alert in stage 1, apart from automation of the same
    queries.

### Alternative B4: Email digest with `actions/cache` as the seen-list (the first draft's Delivery III)

*   **Pros**: Needs no new GitHub permissions. It reaches Ben where he reads.
*   **Cons**:
    *   The brief rejected `actions/cache` because entries are evicted after 7 days without use, and a weekly run
        sits at that limit.
    *   It needs an SMTP helper that a Node script and a Python script share.
    *   The existing helper skips silently when secrets are missing, and the SMTP secrets have never been seen to work
        (F15).
*   **Reason for Rejection**: It reopens a decision the brief settled, and it depends on an unverified secret.

### Alternative B5: Other queues and seen-list stores

| Option | Reason for Rejection |
| --- | --- |
| A Markdown queue file committed to `main` | No notification, and bot commits on `main`. |
| A workflow that turns ticked issue checkboxes into `media.json` entries | Needs write access from an issue event, plus a guard so only the owner can trigger it. The bot still cannot write `summary`. |
| Seen-list under `static/data/` or `data/` | `static/` is published on bampel.com. `data/` is loaded by the Hugo build. |
| A step inside `update-scholar-metrics.yml` | A failed query would block the whole metrics commit, because no step there sets `continue-on-error`. Its `git add -u` misses new files. |
| A local script that Ben runs by hand | It relies on Ben remembering. A scheduled trial measures more evenly. |

### Alternative B6: A Python collector, like the other `scripts/*.py`

*   **Pros**: Matches the metrics scripts.
*   **Cons**:
    *   CI runs its tests with `node --test`.
    *   jsdom, which can parse RSS, is already installed.
    *   A Python parser and test step would be new.
*   **Reason for Rejection**: Node fits the existing test setup with no new dependency.

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Change A is partly reverted (for example, the workflow step restored without the script, or the templates restored without the JSON) | The Monday job fails, or the page shows an empty box | Revert A as one commit. A full revert restores the scraper and its Monday run; that is the known effect, accepted only if Ben chooses to go back. |
| The Dimensions fetch fails or the API changes | Missing or outdated citation figures | The script keeps the last good values and never writes zeros. It updates `generated_at` only when at least half the DOIs succeed. The partial hides the attention note once the file is more than 16 days old (one missed weekly run is tolerated). It also warns, so CI fails on the next push. That failure is the intended signal. Recovery: run "Update Scholar Metrics" by hand. If Dimensions is still down, delete `data/dimensions.json`, which hides the note without a warning, until it recovers. A DOI whose fetch failed keeps its last value for up to 14 days, so a single figure can be up to 14 days older than the "updated" date. |
| Dimensions changes its terms or adds a key | The keyless route closes | The partial hides the line after 14 days. Switching to Scopus cited-by counts (free Elsevier key) is the documented fallback (`attention-sources.md`). |
| Google blocks requests from GitHub Actions (429, CAPTCHA) | Runs find nothing, or every query fails | A run in which every query fails ends red and does not count. The trial needs 7 green runs out of 10. If it gets fewer, it is removed. |
| Google's terms forbid automated use of the feed | Stage 2 breaks the source rule | Ben checks the terms before approving stage 2 (Q1). |
| The seen-list is reset (issue closed, block edited, branch lost) | Old items reappear, or new items are lost | Baseline runs still show the last 14 days of items, and post a note. |
| The trial is never reviewed | The job runs on indefinitely | The script stops querying after the end date and posts one reminder. |
| Feed text contains markup or `@name` | Unwanted links, mentions or injected markup | Text is escaped in issue and pull-request text. The Spotlight uses DOM text. Promotion stays a hand edit. |
| `in_cv` drifts from the CV | The site and the CV disagree | Setting `in_cv` is a numbered step in the checklist's adding-an-item steps. |

## Non-Functional Requirements

*   **Security & Privacy.**
    *   One standard applies: text from feeds may appear in this repository's issues or pull requests, which are public
        and are already public headlines, but never on bampel.com except through Ben's hand edit.
    *   No new secrets are needed.
*   **Cost.**
    *   Stage 2 sends about 40 requests a week and uses a few runner-minutes.
    *   Change A removes 23 requests a week to Altmetric.
*   **Rollout.**
    *   A, S and B ship as separate commits or pull requests, each without `[deploy now]`. Each appears at the next
        06:00 or 17:00 ET build.
    *   Rolling back B means deleting its workflow.

## Open Questions

Every item is Ben's decision. Each answer changes only the parts it names.

*   **Q1, source rule.** Accept this rule?

    > A source is acceptable if it is an official API used within its published terms, or a feed published for feed
    > readers, fetched at most once a day per URL with an honest User-Agent that names the site and a contact.
    > Fetching HTML pages that robots.txt disallows, or sending a fake browser User-Agent, is not acceptable.

    Google's robots.txt disallows `/rss/` on news.google.com (F3). Google's terms for the feed were not checked. If
    Ben applies robots.txt strictly to feeds too, or if the terms forbid this use, stage 2 is cancelled.
*   **Q2, attention note. Decided 2026-11-02: P1 + P4** (badges plus a weekly Dimensions citations line). P2 and P3
    stay in the Technical Plan for the record but are not built.
*   **Q3, stage 2.** Allow stage 2 at all, subject to the gate?
*   **Q4, queue (stage 2 only).** Delivery I (rolling issue) or II (rolling pull request)?
*   **Q5, false-positive labels (stage 2 only).** Show labels, or a flat list with no labels?
*   **Q6, `in_cv` values. Answered from the CV.** `static/uploads/cv.pdf` (checked 2026-11-02) lists all 3 items under
    "PUBLIC ENGAGEMENT AND MEDIA COVERAGE", so each item gets `in_cv: true`.
*   **Q7, press-office request.** Send the drafted request to the GSU and Eller communications offices? Nothing is sent
    without Ben.
*   **Q8, trial trigger.** Weekly schedule (this design) or manual runs only (the brief)? A manual-only trial depends
    on someone starting each run.

### Deviations from the brief

*   **Trial trigger.** The brief says the trial is "run by `workflow_dispatch` for 8-12 weeks". This design uses a weekly
    schedule that stops itself after 10 weeks (Q8).
*   **Gate.** This design adds the gate before stage 2: one quarter of stage 1, plus a hand test of the title queries.
    Its first outcome is adding title searches to the checklist.
*   **Stage 2 depth.** The brief staged the trial for drafting. This design keeps stage 2 as an architecture sketch
    and leaves its implementation spec to a follow-up design, written once the gate is met.
*   **Delivery III.** The first draft used `actions/cache`, which the brief rejected. That option is removed
    (Alternative B4).
*   **New decisions the brief did not raise:**
    *   The attention note renders at build time from a data file (`data/dimensions.json` under P4).
    *   The collector is written in Node.
    *   Items are marked seen when first shown.
    *   Conference titles are queried as well as journal titles.

## Additional Resources

*   [concepts_brief.md](./concepts_brief.md): facts F1-F19 and the alternatives.
*   [concept_seed.md](./concept_seed.md): the first concept, as the brainstorm reviewers saw it.
*   [brainstorm_goldfish_analysis.md](./brainstorm_goldfish_analysis.md): the brainstorm review by six independent
    reviewers.
*   Review reports for this document, in this folder:
    *   [zoom_out_report.md](./zoom_out_report.md)
    *   [comprehension_report.md](./comprehension_report.md)
    *   [critic_report.md](./critic_report.md)
    *   [intermediate_zoom_out_report.md](./intermediate_zoom_out_report.md)
    *   [implementation_readiness_report.md](./implementation_readiness_report.md)
    *   [consolidated_review_report.md](./consolidated_review_report.md), with the decisions for Ben
*   [attention-sources.md](./attention-sources.md): programmatic Altmetric and other sources, tested 2026-11-02.
    *   [goldfish_review_report.md](./goldfish_review_report.md)
*   Patterns in this repository:
    *   `.github/workflows/version-watch.yml`
    *   `.github/workflows/pathways-refresh.yml`
    *   `tests/publications-filter.test.mjs`
    *   `layouts/shortcodes/altmetric.html`

## Future Improvements

*   **Junk DOI key in `load_doi_map`.** `scripts/fetch_opencitations.py` turns `doi: ''` into the key `'`, so
    OpenCitations checks 24 "DOIs" instead of 23. P4 filters the key out. A separate small fix would also correct
    `opencitations.json`.
*   **Issue permission for stub authors.** Add `issues: write` to `update-scholar-metrics.yml`, and make
    `expand_stub_authors.py` fail visibly when it cannot open its issue (F15).
*   **GDELT as a second source,** if the trial shows that Google News misses items. Use backoff, and query it once a
    week.
*   **Build-time Spotlight.** Render `media.json` with Hugo, so it works without JavaScript and is covered by
    `scripts/check-links.mjs`.
*   **`academic-updates` reads `in_cv`.** Change the skill, which lives outside this repository, so that it lists
    `media.json` items with `in_cv: false`.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Paths are relative to the repository root. Change A, Change S and Change B stage 1 are each delivered as one pull
request, merged without `[deploy now]`.

### Target Files to Create/Modify

#### Change A

##### 1. `scripts/update_altmetric.py` (Delete)

*   **Type / Scope**: Python script.
*   **Proposed Changes**: Delete the script. It is the only code that fetches `/details/` and writes `altmetric.json`.

##### 2. `static/data/altmetric.json` (Delete)

*   **Type / Scope**: Published data.
*   **Proposed Changes**: Delete the file, so no stale totals stay public.

##### 3. `.github/workflows/update-scholar-metrics.yml` (Modify)

*   **Type / Scope**: GitHub Actions workflow.
*   **Proposed Changes**:
    *   Remove the "Update Altmetric Stats" step (lines 59-62), together with its `ALTMETRIC_API_KEY` env.
    *   Remove `static/data/altmetric.json` from the first `git add` line (line 116).
    *   Change the comment above the cron (line 5) to "Every Monday at 09:00 UTC".
    *   Change the commit message (line 128) from "chore: Update metrics (Scholar, Visitor, Altmetric)" to
        "chore: Update metrics (Scholar, Visitor)".

##### 4. `layouts/partials/media/altmetric_summary.html` and `layouts/shortcodes/altmetric_summary.html` (Delete)

*   **Type / Scope**: Hugo templates.
*   **Proposed Changes**: Delete both.

##### 5. `assets/js/widgets/altmetric-summary.js` and `assets/js/widgets/altmetric-summary-media.js` (Delete)

*   **Type / Scope**: Front-end scripts.
*   **Proposed Changes**: Delete both.

##### 6. `content/publications/_index.md` (Modify)

*   **Type / Scope**: Page content.
*   **Proposed Changes**: Replace the line `{{< altmetric_summary >}}` with `{{< attention_note >}}`.

##### 7. `layouts/partials/blocks/media_engagement.html` (Modify)

*   **Type / Scope**: Hugo block template (CV page).
*   **Proposed Changes**: Replace the `<details>` block whose summary is "Cumulative Research Attention" with
    `{{ partial "media/attention_note.html" (dict "wrap" true) }}`. The partial decides whether anything renders.
    When it does render, it emits the `<details class="spoiler">` block with the summary "Research attention", so a
    hidden note never leaves an empty block.

##### 8. `scripts/fetch_dimensions_metrics.py` (Create)

*   **Type / Scope**: Python 3.11 script that uses only the standard library, like `scripts/fetch_opencitations.py`. The
    Monday metrics workflow runs it.
*   **Inputs**: `load_doi_map()`, imported with `from fetch_opencitations import load_doi_map`.
    *   This works when the workflow runs `python scripts/...`, because Python puts the script's folder on the path.
    *   Today `load_doi_map()` returns 24 keys, not 23. The `doi: ''` lines become a junk key `'`, a bug that
        `static/data/opencitations.json` also shows (`"total_dois_checked": 24`). `select_dois` therefore validates
        every key.
*   **`select_dois(doi_map) -> list[str]`**:
    1.  Strip whitespace and quotes from each key.
    2.  Keep it only if it matches `^10\.\d{4,9}/\S+$`.
    3.  Lower-case it and drop duplicates.
    4.  If an arXiv DOI (prefix `10.48550/`) has the same normalized title as a DOI with another prefix, drop the
        arXiv DOI. A normalized title is lower-case, with every run of non-alphanumerics collapsed to one space.
    5.  Keep both DOIs when two non-arXiv DOIs share a title.

    As of 2026-11-02 this returns the 23 real DOIs. No arXiv DOI has a published twin, so all 23 count.
*   **Empty selection**: if `select_dois` returns an empty list, the script prints an error and exits 1 without
    writing anything. That can only happen when the content folders are missing or unreadable, and the other
    metrics steps would break in the same case.
*   **Fetch**:
    *   One `GET https://metrics-api.dimensions.ai/doi/<lower-case doi>` per DOI. All 23 lower-case requests answered
        on 2026-11-02.
    *   User-Agent `bampel.com-metrics/1 (+https://bampel.com; bampel@gsu.edu)`, with a 20-second timeout.
    *   1.1 seconds between requests. Dimensions allows at most 1 request per second (`attention-sources.md`).
    *   A DOI succeeds when the response is HTTP 200, the body is JSON, and `times_cited` is an integer. Anything else,
        including `null`, is a failure for that DOI.
*   **`merge(previous: dict, selected: list[str], results: dict[str, int | None], now: datetime) -> dict | None`**:
    1.  `per_doi` holds only DOIs in `selected`. Previous entries for DOIs that are no longer selected are dropped.
    2.  A succeeded DOI gets `{times_cited, fetched_at: now}`.
    3.  A failed DOI keeps its previous entry if that entry's `fetched_at` is no more than 14 days old. Otherwise it
        is left out. A failed fetch is never written as 0.
    4.  `papers_with_doi = len(selected)`. `papers_counted = len(per_doi)`. `citations_sum` is the sum over `per_doi`.
    5.  If fewer than half of `selected` succeeded in this run, `merge` returns `None`, and the script leaves the
        existing file untouched. `generated_at` therefore moves only after a mostly successful run.
    6.  Timestamps are UTC, written as `now.strftime("%Y-%m-%dT%H:%M:%SZ")`.
*   **Output**: `data/dimensions.json`. Hugo reads this data file at build time and does not publish it.

    ```json
    {
      "generated_at": "2026-11-02T09:05:00Z",
      "source": "Dimensions Metrics API",
      "papers_with_doi": 23,
      "papers_counted": 23,
      "citations_sum": 322,
      "per_doi": {"10.1109/isi.2019.8823238": {"times_cited": 97, "fetched_at": "2026-11-02T09:05:00Z"}}
    }
    ```

*   **Exit codes**: 0 after any network outcome, so a Dimensions outage never blocks the metrics commit. The workflow
    has no `continue-on-error`. Exit 1 only for an empty selection or a local error, such as an unwritable `data/`.

##### 9. `tests/test_fetch_dimensions_metrics.py` (Create)

*   **Type / Scope**: Python `unittest`. No network access.
*   **Import**: the file starts with
    `sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))` and then
    `import fetch_dimensions_metrics as fdm`. This is needed because `python3 -m unittest` puts the repository root on
    the path, not `scripts/`.
*   **`select_dois` cases**:
    1.  Keys `"'"`, `'"'`, `""` and `"not-a-doi"` are dropped.
    2.  `"10.1109/ISI.2019.8823238"` and `" 10.1109/isi.2019.8823238 "` become one lower-case DOI.
    3.  An arXiv DOI whose title matches a published DOI's title is dropped, and the published DOI is kept.
    4.  An arXiv DOI with no twin is kept.
    5.  Two non-arXiv DOIs with the same title are both kept.
*   **`merge` cases**:
    1.  All results present: correct sum, count and `papers_with_doi`.
    2.  One `None` with a previous entry 3 days old: the previous value and its `fetched_at` are kept.
    3.  One `None` with a previous entry 15 days old: the DOI is left out, and `papers_counted` is one less than
        `papers_with_doi`.
    4.  A previous entry for a DOI that is no longer selected: it is dropped.
    5.  Fewer than half succeeded: returns `None`.
    6.  No failed DOI ever appears with `times_cited` 0.
    7.  `generated_at` matches `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$`.
*   **Main**: calling `main()` with `load_doi_map` patched to return `{}` exits 1 and writes nothing. It uses a
    temporary output path.

##### 10. `.github/workflows/update-scholar-metrics.yml` (Modify, in addition to item 3)

*   **Type / Scope**: GitHub Actions workflow.
*   **Proposed Changes**:
    *   Directly after the step "Fetch OpenCitations Data", add the step "Fetch Dimensions Citation Metrics", which
        runs `python scripts/fetch_dimensions_metrics.py`.
    *   Add `data/dimensions.json` to the first `git add` line. `git add -u` would miss the file on its first run,
        because it is not yet tracked.

##### 11. `.github/workflows/ci.yml` (Modify)

*   **Type / Scope**: CI workflow.
*   **Proposed Changes**: Add a step named "Dimensions metrics test" directly after "Publications filter test". It runs
    `python3 -m unittest tests/test_fetch_dimensions_metrics.py`. The runner already has Python 3, which the icon-font
    step uses.

##### 12. `layouts/partials/media/attention_note.html` (Create)

*   **Type / Scope**: Hugo partial. No JavaScript. The context is a dict with `wrap` (bool).
*   **Structure**:

    ```go-html-template
    {{ $wrap := .wrap }}
    {{ with hugo.Data.dimensions }}{{ if gt (.papers_counted | default 0) 0 }}
      {{ $h := (now.Sub (time.AsTime .generated_at)).Hours }}
      {{ if gt $h 384.0 }}
        {{ warnf "dimensions.json is %d days old; run Update Scholar Metrics or see Risks in docs/media-tracker/design.md" (int (div $h 24)) }}
      {{ else }}
        … attention note markup, below, using $wrap …
      {{ end }}
    {{ end }}{{ end }}
    ```

    *   Rendering nothing with no warning when the file is missing or `papers_counted` is 0 is normal before the first
        run.
    *   The threshold is 384 hours (16 days). A weekly job can then miss one run without hiding the note.
*   **Attention note markup**:
    *   `<div class="attention-note">`. When `$wrap` is true, it is wrapped in
        `<details class="spoiler"><summary>Research attention</summary><div class="spoiler-content">…</div></details>`.
        When it is false (the publications page), the div starts with `<h3>Research attention</h3>`.
    *   First paragraph:
        `<p>{{ .citations_sum | lang.FormatNumber 0 }} citations across {{ .papers_counted }} papers with DOIs, counted by <a href="https://www.dimensions.ai/" rel="noopener">Dimensions</a> (updated {{ (time.AsTime .generated_at).Format "2 January 2006" }}).</p>`
        *   The Dimensions link is the attribution the Dimensions terms require (`attention-sources.md`).
        *   When `papers_counted` is less than `papers_with_doi`, the phrase "across {{ .papers_counted }} papers with
            DOIs" becomes "across {{ .papers_counted }} of {{ .papers_with_doi }} papers with DOIs".
    *   Second paragraph:
        `<p class="attention-note-source">These are citation counts, not an Altmetric score. Paper pages show Altmetric and Dimensions badges where those services have data.</p>`
*   **Styling**: a `<style>` block in the partial, following `layouts/partials/media/altmetric_badge.html`:
    *   `.attention-note-source`: `#57606a`, which is 6.4:1 on white, the light theme's page background.
    *   `.dark .attention-note-source`: `#8b949e`, which is 6.2:1 on `#0d1117` and 5.6:1 on `#161b22`. Those are the
        two dark backgrounds in `CLAUDE.md`'s colour rules.
    *   Links get no new rule. They inherit the site's link colour.

##### 13. `layouts/shortcodes/attention_note.html` (Create)

*   **Type / Scope**: Hugo shortcode.
*   **Proposed Changes**: One line, `{{ partial "media/attention_note.html" (dict "wrap" false) }}`. This is the same
    pattern as `layouts/shortcodes/altmetric.html`.

#### Change S

##### 14. `assets/js/site/media_spotlight.js` (Modify)

*   **Type / Scope**: Front-end script.
*   **Proposed Changes**:
    *   **URL check.** `normalize()` returns `url`, computed as follows:
        1.  Trim the value.
        2.  Keep it if it starts with `https://` (lowercase match, after trimming).
        3.  Inside `try { … } catch { return '' }`, keep it only if `new URL(value).hostname` is none of
            `news.google.com`, `www.google.com` or `consent.google.com`.
        4.  Otherwise return `''`.

        A malformed URL therefore never throws.
    *   **Rendering.** In `render()`, build every card with `document.createElement` and `textContent`:
        *   The title element keeps its class: `div.media-featured-title` in the featured card, `div.media-card-title`
            in list cards.
        *   When `url` is non-empty, the div holds a child `<a class="media-title-link" href=url rel="noopener"
            target="_blank">` whose `textContent` is the title. Otherwise the div's `textContent` is the title.
    *   **Empty states.** The two in `render()` ("No coverage matches those filters." and "Additional coverage coming
        soon.") become a `div.media-empty` built with `createElement` and `textContent`. The existing
        "No media coverage available." line already uses `textContent` and does not change.
    *   **Filter buttons.** Build the year and type buttons with `createElement`, set `textContent`, and set
        `button.dataset.year` or `button.dataset.type`. The type slug class stays.
    *   **CSS.** In `assets/scss/custom.scss`, next to `.media-card-title` (around line 4474), add:

        ```scss
        .media-title-link { color: inherit; text-decoration: none; }
        .media-title-link:hover { text-decoration: underline; }
        ```

        `postcss.config.js` already safelists the `media-` prefix.

##### 15. `layouts/partials/media/media_spotlight.html` and `layouts/shortcodes/media_spotlight.html` (Modify)

*   **Type / Scope**: Hugo templates.
*   **Proposed Changes**: Change the subtitle "Coverage, interviews, and public engagement" to "Coverage and interviews
    selected by Ben Ampel".

##### 16. `tests/media-spotlight.test.mjs` (Create)

*   **Type / Scope**: Node test with jsdom, following `tests/publications-filter.test.mjs`.
*   **Setup**:
    *   Paste the static HTML from lines 1-15 of `layouts/shortcodes/media_spotlight.html` into a `PAGE` constant.
        Leave out the Hugo `partial` line.
    *   Before `window.eval(SCRIPT)`, set
        `window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(FIXTURE) })`.
    *   Wait one macrotask before asserting.
*   **Fixture** (`TRICKY` = `` Quote " amp & <b>bold</b> it's ``):

    | # | date | type | title | url |
    | --- | --- | --- | --- | --- |
    | 1 | 2025-03-01 | `Press Release` | `Title ${TRICKY}`; outlet, summary and both tags also contain `TRICKY` | `"  https://example.org/a?x=1&y=2  "` |
    | 2 | 2025-02-01 | `` `Type ${TRICKY}` `` | `Script link` | `javascript:alert(1)` |
    | 3 | 2025-01-01 | `Press Release` | `Plain http` | `http://example.org` |
    | 4 | 2023-06-01 | `Press Release` | `Google wrapper` | `https://news.google.com/rss/articles/X` |
    | 5 | 2023-05-01 | `Press Release` | `Google redirect` | `https://www.google.com/url?q=x` |
    | 6 | 2023-04-01 | `Press Release` | `Consent page` | `https://consent.google.com/x` |
    | 7 | 2023-03-01 | `Press Release` | `Broken url` | `https://` |
    | 8 | 2024-07-01 | `TV Segment` | `Only 2024 item` | none |

*   **Assertions**:
    *   The page has no `<b>` element anywhere.
    *   Item 1's title `textContent` equals `Title ${TRICKY}`.
    *   Exactly one `a.media-title-link` exists. It belongs to item 1, its `href` is the trimmed URL, and it has
        `rel="noopener"` and `target="_blank"`.
    *   Items 2-7 render their titles as plain text, and the script does not throw.
    *   A type button's `textContent` and `dataset.type` both equal `` `Type ${TRICKY}` ``.
    *   Clicking the 2024 year button leaves "Only 2024 item" in `#media-featured`, and `#media-list` shows
        "Additional coverage coming soon.".

##### 17. `.github/workflows/ci.yml` (Modify)

*   **Type / Scope**: CI workflow.
*   **Proposed Changes**: Add a step "Media Spotlight test" that runs `node --test tests/media-spotlight.test.mjs`. It goes
    directly after "Dimensions metrics test" if Change A has merged, and otherwise directly after "Publications
    filter test". The final order is the one in the Verification Plan.

##### 18. `static/data/media.json` (Modify)

*   **Type / Scope**: Published data.
*   **Proposed Changes**:
    *   Add `"in_cv": true` to each of the 3 items (Q6, from the CV PDF).
    *   Do not invent URLs for the two items that have none.

#### Change B

##### 19. `docs/media-tracker/checklist.md` (Create; stage 1)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: The six sections listed under Technical Plan, Change B, stage 1.
    *   The found-items log starts with the 3 current `media.json` items, each with the route "known before
        tracking".
    *   The Google Alert section gives the three queries and their settings as steps for Ben. Ben creates the alerts
        in his own Google account; the implementer does not.
    *   The request to the press offices is marked "Draft, not sent". Its text is:

        > "Could you copy me (bampel@gsu.edu) when a story, interview or newsletter item mentions my research? I keep
        > a list of coverage on my website and CV, and I sometimes miss items that do not reach me directly. Thank
        > you."

        Ben edits and sends it himself if he chooses (Q7).

##### 20. `docs/media-tracker/README.md` (Create)

*   **Type / Scope**: Documentation index.
*   **Proposed Changes**: A file list (the brief, the design, the review reports and the checklist), and one line per
    change (A, S, B stage 1) saying whether it is live, with the date it was merged. The README is updated when
    stage 2 starts, if it ever does.

##### Stage 2 files

Stage 2 files are not specified here. The follow-up design that the stage-2 sketch calls for lists them. That design
must keep:

*   the source rule;
*   the fixed `TRIAL_END`;
*   the failure rule;
*   the 14-day baseline window;
*   text safety;
*   the keep-or-remove rule.

It must also reuse the 5 Google News items recorded on 2026-11-02 (F1) as a test fixture.

### Verification Plan

*   **CI** (`.github/workflows/ci.yml`) passes for each pull request. Its steps run in this order:
    1.  The two Hugo passes with PurgeCSS. Any Hugo WARN fails the run.
    2.  Lab tests.
    3.  Publications filter test.
    4.  Dimensions metrics test (new; Python `unittest`).
    5.  Media Spotlight test (new; Node).
    6.  The existing Pathway Finder tests.
    7.  Internal links.
    8.  Icon fonts.
*   **Dimensions script, run locally before the Change A pull request.**
    *   Run `python3 scripts/fetch_dimensions_metrics.py`. It sends 23 requests and takes about 26 seconds.
    *   Check that `data/dimensions.json` has `papers_with_doi` 23, `papers_counted` 23, and a `citations_sum` equal to
        the sum of the per-DOI values.
    *   Commit that file in the Change A pull request, so the attention note appears at the first build after the
        merge.
*   **After merge.**
    *   Start "Update Scholar Metrics" with `workflow_dispatch`.
    *   Check that the run's log shows the "Fetch Dimensions Citation Metrics" step.
    *   Check that the bot's commit includes `data/dimensions.json`, or that the step reports no change.
*   **Attention note, checked locally with `hugo server`.**
    *   With a `data/dimensions.json` generated within 16 days:
        *   `/cv/` shows the collapsed "Research attention" block.
        *   `/publications/` shows the "Research attention" heading with the note.
        *   On both pages, "Dimensions" is a link.
    *   Deleting one `per_doi` entry and lowering `papers_counted` by one changes the wording to "across 22 of 23
        papers with DOIs".
    *   Setting `generated_at` to 17 days ago hides the note and prints the `dimensions.json is 17 days old` WARN.
    *   Setting `papers_counted` to 0, or deleting the file, hides the note with no WARN.
*   **One-time checks for Change A.**
    *   `grep -rn "Total Score" layouts assets content` returns nothing.
    *   `grep -rn "altmetric.com/details" scripts .github` returns nothing.
    *   `grep -rn "altmetric.json" --exclude-dir={node_modules,docs,public,resources,.git} .` returns nothing.
*   **Manual checks.**
    1.  Run `hugo server`.
    2.  Confirm that both pages show the Dimensions attention note, as described above.
    3.  Confirm that `/conference_publication/sawtooth-19-isi/` still shows its Altmetric and Dimensions badges.
    4.  Confirm that the Eller 2020 item in the Spotlight is a link.
    5.  Confirm that `.attention-note-source` and `.media-title-link` reach at least 4.5:1 contrast in both themes.
*   **Stage 2**: verified under its follow-up design.
*   **Trial metric**: the found-items log in `checklist.md`, read against the keep-or-remove rule.

--------------------------------------------------------------------------------

*Drafted with EGM*
