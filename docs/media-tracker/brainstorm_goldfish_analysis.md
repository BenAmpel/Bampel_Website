# Brainstorm Goldfish analysis: weekly mention tracker and honest attention panel

* **Target:** `docs/media-tracker/concept_seed.md` (the FeatureConcept)
* **Mode:** BRAINSTORM
* **Date:** 2026-11-02
* **Compiled by:** EGM Synthesizer, from six fresh Goldfish reviewers. None of them saw the conversation that wrote the seed.
* **Status:** Input for the author's concept brief. Nothing has been decided or built. Ben makes every decision listed at the end.

## Reviewer status

| Reviewer | Role title | Status |
| --- | --- | --- |
| `egm-design` | Skeptical Architect Brainstormer | completed |
| `egm-codebase-details` | Codebase Accuracy Brainstormer | completed |
| `egm-zoom-out` | Simplicity and Scope Brainstormer | completed |
| `egm-comprehension` | Naive Reader and Site Visitor Brainstormer | completed |
| `egm-implementation-readiness` | Implementation Readiness Brainstormer | completed |
| `egm-structural` | Document Structure Brainstormer | completed |

Severity counts after removing duplicates: **5 Blocker, 21 Major, 7 Nit.**

### What I checked myself

Several reviewers made the same claims about the code. I checked these against the working tree, and all of them hold:

* `static/data/media.json` has 3 items, and item 3 (Eller 2020) has a `url` at line 23.
* `.github/workflows/update-scholar-metrics.yml` lines 12-13 grant only `contents: write`. Line 5 says "1st of every month", but line 6's cron is `0 9 * * 1`. No step sets `continue-on-error`.
* `assets/js/widgets/altmetric-summary.js` lines 11-14 hide the panel unless score >= 25, news >= 3 or Mendeley >= 150.
* `assets/js/site/media_spotlight.js` lines 28-37 (`normalize`) drop `url`.

One reviewer wrote that a failing step in the Monday workflow "doesn't stop the metrics push". The workflow file shows the opposite: a failed step ends the job before the commit step at line 110. I used the majority reading.

## Bottom line (every reviewer agreed)

1. **The seed holds two concepts, and they should be split.** One is the attention-panel honesty fix plus the scraper decision. The other is the mention tracker. The panel problem is live on the site today and is mostly a deletion. The tracker is an optional feature of doubtful value. All six reviewers said to do the panel first, as its own change.
2. **The Altmetric scraper should go.** The scraper sends a fake Chrome User-Agent to `/details/`, a path that robots.txt disallows. Altmetric's free key excludes self-assessment. So neither route is permitted, and relabelling the panel does not change where its data comes from.
3. **Do not build the weekly tracker yet.** All six reviewers preferred a no-code baseline (a Google Alert, a manual checklist, or asking the press offices) to building now. Only a measured gap in that baseline should justify a job.
4. **Two small fixes are worth doing whatever happens to the tracker:**
   * Media Spotlight should render `url` and escape its text.
   * The misleading cron comment should be corrected.

---

## Theme 1: Should the tracker exist at all?

### 1.1 Measured recall and yield do not justify a weekly job (Blocker, design; Major from zoom-out, readiness and structural)

* **What the numbers show:**
  * `media.json` already lists three real items: the GSU SIGMIS release (2025), The National Desk TV segment (2024) and the Eller best-paper story (2020).
  * The seed's own Google News test found only the GSU release. Measured recall against known coverage is therefore about 1 in 3.
  * The 5 results cover about 15 years and include one real item. That suggests a few real items a year at most, not "1 per several weeks".
* **Who wrote the coverage:** every real item so far came from a press office Ben already works with (GSU, Eller) or from an interview he gave. So the job's yield of coverage he does not already know about is near zero (zoom-out, structural).
* **The risk:** a weekly job that misses most coverage invites false comfort ("the tracker found nothing").
* **Requirement:**
  * Before any build, test each candidate source against the three known items and write down what it catches.
  * Set a success criterion and a kill criterion. Structural's example: "at least one real item a quarter that the Google Alert missed, or the job is turned off."

### 1.2 Alert fatigue is the real running cost (Major, design and comprehension)

* **Problem:**
  * A weekly issue that is about 80% false positives, and empty most weeks, teaches Ben to ignore it.
  * Acting on a real hit still takes several manual steps: unwrap a redirect, write `type`, `tags` and `summary` by hand, then wait for the 06:00 or 17:00 ET deploy batch.
  * The compute cost is negligible: about 15 HTTP requests and one runner-minute a week.
* **Requirement, if anything is built:**
  * Post nothing when there are no new candidates that are not already tagged as noise.
  * Keep one long-running issue, or one rolling PR, instead of a new one each week.
  * Write a retirement rule, for example: off after two quarters with nothing new.

### 1.3 The seed has no problem statement, goals, non-goals, success criteria or alternatives (Blocker, structural)

* **Problem:**
  * The seed never says what is going wrong today. It shows no missed item.
  * It has no non-goals. Candidates:
    * no automatic publishing
    * no social-media monitoring
    * no in-house attention score
    * no edits to the Word CV from the Action
  * It has no success, kill or rollback criteria.
  * It has no "Alternatives considered" section, and the feature-spec standard fails a spec without one.
* **Requirement:** use this outline for each brief:
  1. Problem
  2. Goals
  3. Non-goals
  4. Numbered facts
  5. Options with trade-offs
  6. Recommendation
  7. Risks
  8. Success and kill criteria
  9. Decisions for Ben

### Alternatives proposed for discovery (all reviewers)

| # | Alternative | Proposed by | For | Against |
| --- | --- | --- | --- | --- |
| D1 | **Do nothing**; add coverage when Ben hears of it | zoom-out | Costs nothing | Misses coverage Ben did not take part in, which is rare |
| D2 | **Google Alert** on "Benjamin Ampel" / "Ben Ampel", optionally with `-psychology -Albany` and "All results" so web pages are covered too | design, zoom-out, comprehension, readiness, structural, codebase | No code, no secrets, no repo noise; only reports new items, so no seen-list is needed | Same false positives; adds to Gmail; no dedupe or audit trail; coverage is uneven. Zoom-out's claim that it "uses the same index" as Google News RSS is unverified |
| D2a | Google Alert **delivered as RSS**, which a later Action polls without Gmail OAuth | design | Removes the need for Gmail credentials if automation is wanted later | Unverified that Alerts still offer RSS delivery |
| D3 | **Quarterly or monthly manual search** from a written checklist (GSU and Eller newsrooms, name queries, paper titles, Scholar "cited by", per-paper Altmetric pages), using `media.json` itself as the seen-list | design, zoom-out, comprehension, structural | About 10-20 minutes per period; better judgement than any filter | Relies on Ben, or a reminder, to do it |
| D4 | **Ask the GSU / Eller communications offices** to forward or cc coverage | zoom-out, structural | One email; aimed at the source of every real hit so far | Depends on another office |
| D5 | **Local script, run by hand** (monthly), printing new Google News items against a local seen file | readiness | No Actions, permissions or push races | Relies on Ben remembering |
| D6 | **Collector run only by `workflow_dispatch` for an 8-12 week trial**, with a cron added only if the trial beats D2 | structural | Measures precision and recall before committing to a schedule | Still needs most of the build |
| D7 | **Weekly or monthly collector, minimal form**: Google News only, never pushes, posts only when an unflagged candidate exists | zoom-out, readiness, comprehension | Low noise | Approval stays manual; needs `issues: write` |
| D8 | **The seed's weekly job as proposed** | the seed | Automated discovery | All the costs in Themes 2-5 |

Recommended order: D2 + D3 (or D4) now, with D6 only if the baseline misses something.

---

## Theme 2: Source choice

### 2.1 "Keyless" is not the same as "permitted", and the seed applies its robots.txt test unevenly (Major, design and zoom-out)

* **Problem:**
  * The seed questions Altmetric because of robots.txt.
  * It never checked Google News's robots.txt or terms. That RSS endpoint is not a documented API.
  * Shared GitHub Actions IP addresses are the kind that get 429 responses, as GDELT already did.
* **Requirement:** write one rule and apply it to every source. Each source must be an official API or documented feed, used within its terms, with an honest, descriptive User-Agent and no spoofing. Check Google News terms and robots.txt before adopting it. Wikimedia's API policy also requires an honest User-Agent (codebase).

### 2.2 Drop every source but Google News RSS (Major, zoom-out; Nit, readiness; agreed by design and structural)

The seed's own facts rule the others out:

| Source | Status in the seed's facts |
| --- | --- |
| GDELT | 429 on the first call |
| Wikipedia | 0 hits for 23 DOIs and 0 hits for the name, yet step 1 still includes it (structural flags this as a trace gap) |
| Lens | Terms unchecked |
| Gmail / Scholar Alerts | Need a long-lived mailbox OAuth secret in the repo |
| Crossref Event Data | Shut down |

Add any source later only with a written note on its terms.

### 2.3 Paper-title queries are doubtful (Major, zoom-out; Nit, structural)

* **Problem:** news stories rarely quote paper titles.
* **Disagreement:**
  * Codebase thinks title queries are the only thing a job adds over a Google Alert.
  * Zoom-out says start with name queries only, and add titles only if a missed item proves their value.
* **Requirement, if titles are used:** generate them from front matter or `static/data/publications.json` (45 papers), not a hard-coded list (structural, codebase).

### 2.4 Google News links are redirect wrappers (Blocker, readiness; Major, design)

* **Problem:**
  * Recent `news.google.com/rss/articles/...` IDs cannot be decoded offline.
  * A plain GET often lands on a consent page or a JS page instead of a redirect.
  * One syndicated story produces several wrapper links.
* **Options (readiness):**
  * **(a)** Key on the wrapper ID plus a normalized title, and accept occasional repeats.
  * **(b)** Resolve to the publisher URL with a timeout, falling back to (a).
* **Requirements:**
  * Whichever option is chosen, resolve the publisher URL by hand at approval. Never store a wrapper in `media.json`.
  * Spell out the URL normalization rules, with tests:
    * lowercase the host
    * drop `utm_*`, `fbclid` and fragments
    * drop `amp/` paths and trailing slashes

---

## Theme 3: False-positive handling

### 3.1 The seed's rules are not implementable, and keyword-only tagging is too weak (Major, design and readiness)

* **Problem:** "photo credit pattern, Grad Ads, psychology keywords" is not a specification. The psychology keywords catch Benjamin C. Ampel only when an article happens to mention psychology.
* **Requirement (readiness):**
  * Write each rule as a pattern on a named field, plus the label it adds. Example: `Ampel\s*/\s*Getty` on title or description adds `fp:photo-credit`.
  * Turn the five 2026-11-02 results into a stored test fixture with the expected labels: 1 shown, 4 flagged.
  * The repo's CI runs only Node tests (`.github/workflows/ci.yml`, `tests/*.mjs`). So either add pytest to CI or write the collector in Node.

### Alternatives proposed for false positives

| # | Alternative | Proposed by | For | Against |
| --- | --- | --- | --- | --- |
| F1 | **Two-way scoring** with reasons shown. Points toward Ben: Georgia State, GSU, Robinson, Arizona, Eller, cybersecurity, phishing, hacker, AI, co-author names, paper titles. Points away: `/ Getty`, "Grad Ads", "College notes", Albany, SUNY, psychology, middle initial "C.". Strongest matches first, the rest collapsed | design | Catches Ben's real items, not just the other person's; shows its reasons | More rules to maintain |
| F2 | **The seed's tag-and-collapse**, with exclusion patterns kept in a data file rather than code, a minimum date window, a Benjamin C. Ampel co-author and topic list, and precision measured during a trial | structural | Keeps everything visible; patterns can change without code edits | Still a heuristic tuned to a 5-item sample |
| F3 | **No tagger.** Show a flat list, handle the clash in the query (`-psychology`, `-Albany`), and leave the rest to Ben | zoom-out | Nothing to go stale; at about 5 items a week, collapsing saves nothing | Ben sees every photo credit and grad ad once |
| F4 | **Rejections feed a block-list**, so a rejected link or pattern never returns | comprehension | The system learns | Needs a read-back of Ben's decision (see 4.2) |

The reviewers agree on these points:

* Never match on "Ampel" alone. In German it means "traffic light" (design).
* "Ben Ampel" alone will match other people (comprehension).
* Seed the seen-list from the first run's results so the 2010 and 2024 items never appear (zoom-out, readiness, comprehension).

---

## Theme 4: Review queue and state

### 4.1 The issue-creation precedent the seed relies on probably fails silently (Major, every codebase-reading lens)

* **Problem:**
  * `.github/workflows/update-scholar-metrics.yml:12-13` grants only `contents: write`. Once a `permissions:` block exists, every scope it does not list gets no access.
  * So the `POST` in `scripts/expand_stub_authors.py:284-299` most likely gets a 403. Both the label attempt and the retry fail.
  * The exception is printed and swallowed (line 299), and the job still reports success.
  * The script also opens a new issue on every run, with no de-duplication.
* **Requirement:**
  * Check past run logs for any `needs-review` issue.
  * Add `issues: write` wherever an issue is opened, and make a failure fail the step.
  * The same fix is a standalone repair for the stub-author path.
* **Better templates already in the repo (codebase, readiness):**
  * `.github/workflows/version-watch.yml:11-13,36-40` uses `contents: read, issues: write` and `gh issue create`, and skips creating an issue when one with the same title is already open.
  * `.github/workflows/pathways-refresh.yml:13-16,56-76` keeps one rolling branch, uses a concurrency group, never pushes to `main`, builds the PR body from a summary file, and writes `$GITHUB_STEP_SUMMARY`.

### 4.2 "Approved" has no mechanism (Blocker, comprehension and readiness)

* **Problem:**
  * Ticking a checkbox in an issue changes nothing. Nothing listens for `issues: edited` or `issues: closed`.
  * Step 4 says the approved items are copied by hand, so as specified the checkboxes are decoration.
  * The collector also does not produce the `type`, `tags` and `summary` fields that `media.json` needs.
* **Requirement:** define approval as one concrete action with a visible result, or state plainly that the queue is a reading list and promotion is fully manual.

### 4.3 The seen-list is undefined: storage, key, when items are added, first run (Blocker, readiness; Major, comprehension, structural and design)

* **Open questions:**
  * Where it lives.
  * The dedupe key (see 2.4).
  * Whether an item counts as seen when it is shown or when Ben decides.
  * Whether rejected items are kept for good.
  * How the first run seeds the list.
* **Trap (design):** the Actions cache is evicted after 7 days without access. A weekly job sits right on that edge, so one eviction resurfaces everything.
* **Privacy point (codebase):** do not store it under `static/data/`. Everything there is published, so rejected hits naming other people would be published too.
* **Stored fields (readiness):** key, first_seen, decision, issue number.

| # | Storage option | Proposed by | For | Against |
| --- | --- | --- | --- | --- |
| S1 | **Derive it from earlier tracker issues** (comments or a hidden JSON block) | design, codebase, readiness | No repo writes, no push race, nothing extra published | Breaks if issues are edited; awkward to parse |
| S2 | **Committed file outside published folders**, e.g. `scripts/state/media_seen.json` or `data/media_seen.json`, with a capped history | codebase, readiness, structural | Easy to audit and read | Bot pushes to `main` and can race the Monday job; `git add -u` misses new files |
| S3 | **`actions/cache`** | (rejected by design and codebase) | Simplest | Eviction silently resurfaces old hits |
| S4 | **State on a rolling PR branch** (pathways-refresh pattern) | readiness | Git holds the state; never touches `main` | More workflow code |
| S5 | **None needed**: a Google Alert or manual checklist, with `media.json` as the record | zoom-out, comprehension | No state at all | Only works with D2 or D3 |

**Disagreement on timing:**

* Structural says mark an item seen when it is first shown, so no approval state is needed and rejections never return.
* Comprehension points out that a week Ben ignores then loses its items for good.

The brief must choose.

### 4.4 Queue choice

| # | Queue | Proposed or ranked by | For | Against |
| --- | --- | --- | --- | --- |
| Q1 | **One long-running GitHub issue**, with a comment per batch and posting only when there is a real candidate | design (recommended) | Notifies Ben; closing records the review; matches version-watch | Checkboxes do nothing; needs `issues: write`; works only if Ben reads GitHub notifications |
| Q2 | **Weekly new issue (the seed)** | the seed | Simple | Alert fatigue; duplicate issues |
| Q3 | **Email digest** through the existing `_try_send_email` (`scripts/expand_stub_authors.py:234-264`) | zoom-out (recommended), structural (recommended if built) | Already written; no new permissions; reaches Ben where he reads; with seen-at-showing, no approval state needed | No audit trail or approval record |
| Q4 | **PR that adds candidates to `media.json`**, or to a staging file the site does not read; Ben deletes rejects and merges | readiness (cleanest route), comprehension, structural, codebase | "Approved" means "merged"; the seen state can travel in the same merge; uses the existing trust model | Most code; the bot cannot honestly write `summary`, `tags` and `type`, so a bulk merge could publish drafts (design); awkward on a phone; branch cleanup; needs `pull-requests: write` |
| Q5 | **`issues: edited` workflow** that writes ticked items into `media.json` | readiness | Checkboxes become real | Needs `contents: write` from an issue event and a guard against edits by anyone but the owner; messy |
| Q6 | **Markdown queue file in the repo** | rejected by all | Diffable | No notification; bot noise on `main` |

Codebase's ranking at the seed's own yield: Google Alert plus a monthly check, then a monthly issue, then a weekly issue.

### 4.5 Workflow placement and the Monday race (Major, codebase, readiness, comprehension, structural; Nit, design and zoom-out)

* **Do not add a step to `update-scholar-metrics.yml`:**
  * No step there sets `continue-on-error`, so a flaky feed would block the whole weekly metrics commit.
  * Its `git add -u` (line 123) misses new untracked files.
* **If a new workflow pushes to `main`:**
  * Running on Monday 09:00 UTC alongside the metrics job's `pull --rebase --autostash` and `push` (lines 130-132) risks a non-fast-forward or a rebase conflict.
  * Every bot commit also triggers CI.
* **Requirement:** a separate workflow with:
  * minimum `permissions:`
  * its own `concurrency:` group
  * a different day and time
  * an honest User-Agent
  * a backoff limit on 429, for example one retry after 30 seconds and then skip
  * a per-source status table in `$GITHUB_STEP_SUMMARY` and in the queue, so "rate-limited" never looks like "quiet week"
  * a loud failure after repeated source errors

---

## Theme 5: How approved items reach `media.json` and the CV

### 5.1 The seed's `media.json` facts are out of date (Blocker, codebase; Major, every other code-reading lens)

* **Problem:**
  * The working tree has 3 items, and the Eller 2020 item already has `url` at line 23. The change is uncommitted.
  * The real gap is the renderer. `normalize()` in `assets/js/site/media_spotlight.js:28-37` drops `url`, so no link can show.
* **Requirement:**
  * Restate the facts against the working tree.
  * Treat "render `url`" as its own small change, needed with or without a tracker.
  * Items without a `url` render as plain text, as they do now.

### 5.2 Media Spotlight inserts text into the page unescaped (Major from five lenses; Nit, zoom-out)

* **Problem:**
  * `media_spotlight.js` (about lines 94-135) puts `title`, `outlet`, `summary`, `tags` and `type` into `innerHTML` without escaping.
  * That is latent while entries are typed by hand. It becomes a real injection or breakage path once feed titles are copied in. The CSP blocks inline script but not injected markup.
* **Requirement:**
  * Use `textContent` or escape every field.
  * Render `url` only if it starts with `https:`, and never if it is a `news.google.com` wrapper.
  * Add `rel="noopener"`.
  * Acceptance test: an item containing `<b>&"` displays literally.
* **Who reads `media.json`:** only `media_spotlight.js:45`, loaded by both `layouts/partials/media/media_spotlight.html:16` and `layouts/shortcodes/media_spotlight.html:16`. New `media-*` classes survive the CSS purge (`postcss.config.js:41`).

### 5.3 Two lists of coverage will drift (Major, design, readiness, structural; Nit, codebase and zoom-out)

* **Problem:** the CV master is a Word file in OneDrive, so the CV step stays manual. The seed never says which list is canonical.
* **Requirement:**
  * Make `media.json` the single source of truth.
  * Add a per-item `in_cv` or `cv_synced` date, so `academic-updates` can list site items the CV lacks.
  * The tracker's responsibility ends at `media.json`.
* **Optional checks:**
  * Compare `media.json` titles with text extracted from `static/uploads/cv.pdf`. That PDF is read by `scripts/build_cv_topics.py:12` and must be re-exported when the CV changes (codebase).
  * `academic-updates` lives outside the repo and was not verified.

### 5.4 Promotion is a hand edit (consensus)

* **Steps:**
  1. Ben, or a Claude session at his request, writes a hand-checked entry.
  2. Resolve the publisher URL.
  3. Write `type`, `tags` and `summary`.
  4. Escape the text (5.2).
  5. Commit without `[deploy now]`. The item appears at the next 06:00 or 17:00 ET batch (`netlify.toml:2-5`).
  6. Update the CV through `academic-updates`.
* **Comprehension adds:** if a queue exists, it should pre-fill a ready-to-paste `media.json` snippet and tell Ben when the item will go live.

### Alternative for rendering

* **R1. Move the curated list to `data/media.yaml`**, rendered by Hugo at build time like `data/grants.yaml` (codebase).
  * For: works without JavaScript; visible to crawlers and to `scripts/check-links.mjs` in CI.
  * Against: the renderer has to be rewritten.

---

## Theme 6: The Altmetric scraper and the attention panel

### 6.1 Any plan that keeps the scraper is blocked (Blocker, design, zoom-out, readiness)

* **Problem:**
  * `scripts/update_altmetric.py:18-21` hard-codes a Chrome 91 User-Agent.
  * Line 52 fetches `/details/`, which robots.txt disallows.
  * Lines 144-146 are the path that actually runs.
  * Because of the cron and comment mismatch, it runs weekly, not monthly.
  * The API-key branch (lines 123-142) is not a fix, because the free key excludes self-assessment.
* **Requirement:**
  * Delete the scraper.
  * Remove the "Update Altmetric Stats" step (workflow lines 59-62).
  * Remove `static/data/altmetric.json` from the `git add` at line 116.
  * Remove the panel and the file together, so stale numbers do not linger.
* **What remains allowed:**
  * The official per-paper embed badges (`layouts/partials/media/altmetric_badge.html`) are Altmetric's sanctioned display route.
  * Linking a human to `/details/` is fine, because robots.txt governs crawlers.
* **What is not allowed:** do not rebuild a total in the browser from the badges' keyless calls (design, zoom-out).

### 6.2 The scraper fails silently and can publish zeros (Blocker, readiness; Major, design, codebase, comprehension, structural)

* **Problem:**
  * `scrape_public_page` returns all zeros on a 404, any other non-200 response or any exception (lines 63-69 and 111-113).
  * `main()` then overwrites `altmetric.json` without checks (lines 170-171).
  * One blocked week publishes "0", and the commit still reads "Update metrics".
  * It also makes the seed's "N papers with records out of M" impossible, because "no record" and "fetch failed" look the same.
* **Also (codebase):**
  * The regex `score=(\d+)` (line 74) keeps only the whole-number part of each score.
  * The file has no per-paper rows, no timestamp and no fetch method.
  * "4.0 = 3 + 1" is an inference the repo cannot confirm.
* **Requirement:** this is moot if 6.1 is adopted. If any automated fetch survives, `altmetric.json` needs:
  * per-DOI status
  * `generated_at`
  * `method`
  * a rule that a failed run keeps the last good file

### 6.3 The two panels are not "near-copies" in behaviour, and one uses a flattery threshold (Major, every lens)

* **Problem:**
  * `layouts/shortcodes/altmetric_summary.html` (publications page) loads `assets/js/widgets/altmetric-summary.js`. Lines 11-14 show the box only if score >= 25, news >= 3 or Mendeley >= 150, so it is hidden today.
  * `layouts/partials/media/altmetric_summary.html` (CV page, via `layouts/partials/blocks/media_engagement.html:12-17`) loads `assets/js/widgets/altmetric-summary-media.js`, which always shows it.
  * So "Total Score 4" appears only on the CV page.
* **Why it matters:** showing a number only when it flatters is selective reporting, the same honesty problem the seed is trying to fix, and the seed does not mention it.
* **Requirement:** one display rule for both pages, with no threshold. Merge the two templates and two scripts into one, for example with the shortcode calling the partial.

### 6.4 The current panel overclaims, and the seed's relabel is accurate but still not understandable (Major, comprehension, readiness, design, structural)

* **How a hiring-committee reader sees it:**
  * "Cumulative Research Attention / Aggregated impact": attention is not impact.
  * "Total Score" next to "The Altmetric Attention Score" reads as Altmetric's own number for Ben. Altmetric publishes no such number for an author.
* **Inaccuracies in the panel:**
  * The weight table (News 8 / Policy 3 / Patents 3 / Social 1) leaves out blogs, Wikipedia and Altmetric's modifiers, so the 4.0 matches it only by coincidence. Structural believes the base weight for X posts is below 1; this is unverified.
  * "Social Mentions" counts X only (`update_altmetric.py:105`). With an API key it would be a count of accounts instead (line 133).
  * Summed Mendeley readers and summed news counts can count the same person or story more than once.
  * Mendeley appears under an "impact" heading while the panel says it carries 0 weight.
* **The seed's label:** "Sum of per-paper Altmetric scores (N of M)" is accurate jargon. A visitor still cannot tell what a record is or whether 4 is good, and it keeps a composite number as the headline.
* **Definitions, if counts survive:**
  * "record" = a non-404 Altmetric page
  * M = papers with a DOI (23 of 45 publications; 3 of the 23 are arXiv `10.48550` DOIs that may duplicate a published version)
* **Requirement:**
  * No composite number as the headline.
  * Plain-language source names.
  * Say what the counts cover and give a "checked on" date.
  * Link to Altmetric's own explanation instead of copying the weights.
  * Label curated `media.json` items "selected by Ben" and keep them separate from Altmetric's "News", so a story is not counted twice.

### 6.5 Decide the data source before the wording (Major, comprehension, structural)

* **Problem:** in the seed, "decide what to do about the scraper" is the last clause of the last step. Yet if the scraper goes, the relabelled panel has no data.
* **Requirement:** the panel brief opens with this decision.

### Alternatives proposed for the panel

| # | Alternative | Proposed by | For | Against |
| --- | --- | --- | --- | --- |
| P1 | **Delete the aggregate panel**; keep the per-paper official badges, and optionally show "N curated media items" from `media.json` | zoom-out (recommended), design, readiness, comprehension, codebase | Within Altmetric's terms; nothing to explain or maintain; today's numbers do not flatter anyway; mostly deletion | Loses the at-a-glance summary and the Mendeley count |
| P2 | **Hand-updated, dated, counts-only line or panel**, e.g. "As of 2026-11-02, from Altmetric's per-paper pages: 1 patent citation, 1 X post, 109 Mendeley readers across 23 DOIs", with no total and no weight table, refreshed quarterly by viewing the pages in a browser | design, readiness, comprehension | Honest and specific; no scraping | Manual; goes stale |
| P3 | **One hand-written factual line**, e.g. "Cited in patent CN-114328707-A (Hyperledger Sawtooth, ISI 2019)", in Media Spotlight or the CV | zoom-out | Concrete and checkable | Covers one fact only |
| P4 | **Badges plus "N of M papers have Altmetric records"**, or a list of papers that have records, each with its badge | structural, codebase | Keeps a summary signal | N still needs a data source; unclear how without the scraper or the API |
| P5 | **The seed's relabel**, "Sum of per-paper Altmetric scores (not an Altmetric score), N of M" | the seed, structural (only if an aggregate is kept) | Least work | Keeps the scraper or needs the API; the sum has no defined meaning; silent zeros |
| P6 | **Counts-only from the official API** | codebase option 1 | Real data | The free key excludes self-assessment; a paid or institutional key is the only route (structural option d) |
| P7 | **Sum the badge data client-side** | rejected by design, zoom-out | No server scraping | Uses the embed beyond its purpose; same terms problem; fragile; equally misleading |
| P8 | **Keep only the Mendeley count** | rejected by zoom-out | It is the only sizeable number | No legitimate source once the scraper goes |

Majority view: P1, optionally with P2 or P3.

---

## Theme 7: Smaller seed accuracy and wording issues

| Severity | Issue | Lens |
| --- | --- | --- |
| Nit | The cron comment says "1st of every month" but the cron runs every Monday (workflow lines 5-6). Fix it in the panel change, since the panel's freshness claim depends on it | all |
| Nit | The seed omits the `[deploy now]` exception to batched deploys (`netlify.toml:2-5`) | codebase, readiness |
| Nit | DOI extraction exists twice with different regexes: `update_altmetric.py:23-46` (a set) and `scripts/fetch_opencitations.py:41-67` (`{doi: title}`). Share one helper rather than write a third | codebase |
| Nit | "The panel" means the website widget in step 5 but the review panel in "Open questions for the panel". Rename one | comprehension |
| Nit | "5-10 distinctive paper titles", the "psychology keywords" and the exact queries are unspecified. List them | comprehension, structural |
| Nit | Facts do not trace to decisions. Number them F1...Fn and cite them; facts with no decision (Wikipedia 0 hits, GDELT 429, Lens patent, Scholar Alerts) are either acted on or marked context only | structural |
| Major | The open-questions list leaves out the name clash, the seen-list, redirect dedupe, CV sync, the template merge, the display threshold and the renderer escaping. Move every decision into "Decisions for Ben", with options and a default | structural |

---

## Acceptance criteria proposed (readiness, with additions from comprehension and structural)

**Seen-list and runs**

* A second run with no new items creates no issue, PR, email or commit.
* The first run seeds the seen-list from all current results and posts nothing, or posts one baseline note.

**Filtering**

* Fixture test: the five 2026-11-02 Google News items yield exactly one normal candidate (the SIGMIS release) and four labelled false positives. The test runs in CI.
* Dedupe: an article found by both a name query and a title query appears once and lists both queries.

**Failures**

* A 429 or timeout shows as "failed (429)".
* It does not stop the other sources.
* It does not change the seen-list for that source.

**Workflow**

* The `permissions:` block is the minimum needed.
* The job never pushes to `main`, or it shares rebase-and-retry logic with the Monday job and never runs in the same hour.
* At most one open queue issue or PR exists at a time.

**Rendering**

* An item containing `<b>&"` displays literally.
* An `https` `url` renders as a link.
* A non-https `url` and a `news.google.com` wrapper are ignored.

**Altmetric**

* No page shows a single "Total Score" or the weights table.
* Nothing fetches `/details/` or sends a fake browser header.
* A failed fetch cannot overwrite stored values with zeros.
* Both pages follow one display rule.

**CV**

* Each promoted item records whether it is in the CV.

---

## Suggested split and sequence (consensus)

1. **Brief A: Honest attention panel** (do first; independent of the tracker)
   * Scraper decision (6.1, 6.5)
   * Panel option (P1-P8)
   * One display rule and one template (6.3)
   * Cron comment fix
2. **Small standalone fixes** (independent)
   * Media Spotlight renders `url` and escapes text (5.1, 5.2)
   * Add an `in_cv` field (5.3)
   * Add `issues: write`, plus loud failure, for `expand_stub_authors.py` (4.1)
3. **Brief B: Mention discovery** (go or no-go)
   * Start with the D2 baseline, plus D3 or D4.
   * Write success and kill criteria.
   * Build D6 and then D7 only if the baseline measurably misses coverage.

## Decisions for Ben

1. Split the seed into Brief A and Brief B? (All reviewers: yes.)
2. Remove the Altmetric scraper? (All reviewers who addressed it: yes.)
3. Which panel option: P1, P2, P3, P4, or keep an aggregate (P5/P6)?
4. One display rule for both pages: always show, or never show the aggregate?
5. Is `media.json` the canonical coverage list, with an `in_cv` flag?
6. Discovery: Google Alert / checklist / press-office ask now, with a build only on measured misses? Or build now?
7. If built: source set (Google News only?), queue (Q1 issue, Q3 email or Q4 PR), seen-list storage (S1, S2 or S4), when an item counts as seen (shown or decided), and false-positive approach (F1, F2 or F3).
8. Has the `needs-review` issue path ever worked? (Check the Actions logs.)
