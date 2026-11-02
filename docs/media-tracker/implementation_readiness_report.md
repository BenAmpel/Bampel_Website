# Stage 9: Implementation Readiness Test

**Target:** `docs/media-tracker/design.md`, DetailedRange lines 587-794 (revision 3).

**Reviewers** (fresh contexts, run in parallel):
* `egm-implementation-readiness` and `egm-codebase-details`, both reviewing against
  `implementation-readiness-standard.md`
* `egm-style`

The stage-2 files are deliberately left to a follow-up design. The reviewers judged Changes A and S and stage 1 of
Change B.

## Reviewer status

| Reviewer | Status | Blocker | Major | Nit |
| --- | --- | --- | --- | --- |
| `egm-implementation-readiness` | completed | 0 | 6 | 8 |
| `egm-codebase-details` | completed | 0 | 5 | 6 |
| `egm-style` | completed | 0 | 5 | 12 |

## What the codebase reviewer confirmed

* Every Change A path exists.
* Nothing else reads `altmetric.json`.
* These references are accurate:
  * the workflow's line numbers (step at 59-62, `git add` at 116, cron at 5)
  * `ci.yml` line 3 (CI reports only) and lines 62-64 (the build fails on WARN)
  * the `hugo.Data` usage
  * the CSP allows inline `<style>`
  * both spotlight subtitles
  * the `media-` safelist (`postcss.config.js:41`)
  * jsdom 29.1.1
  * `media.json`'s 3 items, 2 of them without a `url`

## Merged findings

Sources: R = readiness, B = codebase, S = style.

### Major

| ID | Sources | Finding | Recommendation |
| --- | --- | --- | --- |
| M1 | R1, B1, S1 | `#8b949e` fails the plan's own 4.5:1 rule in light mode (about 3.1:1 on white). | Name a colour for each theme, with its measured ratio. |
| M2 | R2 | How a line's link is rendered is unspecified. Building it with `replace` and `safeHTML` would publish a `javascript:` link, because the https check only warns. | Split the line into three escaped parts and build the anchor in attribute context. Render plain text when any condition fails. |
| M3 | R3, B6 | The markup with `wrap: true` is ambiguous. With `wrap: false` the publications page gets no heading. | Always render the div. `wrap` only adds the `<details>` element. Add an `<h3>` when `wrap` is false. |
| M4 | R4, B2, B9 | The P2 starter lines are unspecified. The Mendeley caveat invites the word "total", which the WARN check would flag. | Give the exact YAML, with no banned words. |
| M5 | R5, B3, B4, S3 | Spotlight: it is unclear whether the anchor replaces the title div or sits inside it. `new URL()` can throw and blank the list. The instruction for empty states does not match the code. | Put the anchor inside the div. Wrap the URL check in try/catch. Build `div.media-empty` explicitly. |
| M6 | R6, B5, S4 | The fixture's dates and types are open, so the 2024 filter assertion may fail. Untested: the `data-type` injection path, the blocked hosts, whitespace in URLs and malformed URLs. The fetch stub and the markup loading are unspecified. | Give a complete fixture table and explicit assertions. Specify the fetch stub and inline the markup. |
| M7 | S2 | Under P3, the fixed source sentence ("counts…") is false. | Make the source sentence a `source_note` YAML field, left empty for P3. |
| M8 | S5 | The `altmetric.json` grep would match `public/`, `resources/` and `.git`. | Give the exact command with `--exclude-dir`. |

### Nits

* **`warnf` ordering:** the checks must run before the hiding rule. Otherwise a stale file with a banned word passes
  (B7).
* **200-day hiding:** it relies on builds continuing to run (B8).
* **Commit message:** the workflow's commit message still says "Altmetric" (B10, R-nit6).
* **Unnamed locations:** the stylesheet (`assets/scss/custom.scss`) and the position of the CI step (B11, R-nit5,
  S-nit11).
* **P3 patent URL:** not written out (R-nit1).
* **`warnf` text:** not given (R-nit2).
* **Checklist** (R-nit7):
  * "known before tracking" is missing from the route list
  * one list item is broken
  * the draft text is missing
  * nobody is named to create the alerts
* **Style** (S-nits):
  * the P1/P2/P3 names do not match Q2
  * the unit of delivery is ambiguous
  * an optional secret-deletion line
  * the 200-day rule is phrased three different ways
  * line references will drift
  * "should" is used where "must" is meant
  * the CI order is misstated
  * the paper page is not named, and "new text" is vague

## Handling

The Elephant applied every Major and every Nit as revision 4. The table at the end of `goldfish_review_report.md`
records each change. Stage 9 was not re-run, so the one re-audit allowed per stage was not used.

---

# Stage 9 re-run for option P4 (Dimensions citations), 2026-11-02

Ben chose option P1 + P4 for Q2. The P4 implementation items (Change A items 6-13) and the Verification Plan were
reviewed again by three fresh reviewers: `egm-implementation-readiness`, `egm-codebase-details` and `egm-style`.

| Reviewer | Blocker | Major | Nit |
| --- | --- | --- | --- |
| `egm-implementation-readiness` | 0 | 3 | 8 |
| `egm-codebase-details` | 1 | 6 | 2 |
| `egm-style` | 0 | 4 | 9 |

## Merged findings and fixes (revision 6)

| ID | Severity | Finding | Fix applied |
| --- | --- | --- | --- |
| P1 | Blocker | `load_doi_map()` returns 24 keys, including a junk `'` from `doi: ''`. That would make the page say "23 of 24 papers" (confirmed by the Elephant). | `select_dois` strips each key and validates it against `^10\.\d{4,9}/\S+$`, with tests. The verification step checks `papers_with_doi == 23`. The root bug is listed under Future Improvements. |
| P2 | Major | An empty DOI selection would wipe good data with no warning, and `merge` kept removed DOIs. | An empty selection exits 1 without writing. `per_doi` is limited to the DOIs selected in the current run. Tests cover both. |
| P3 | Major | The unittest could not import the script. | The test inserts `scripts/` at the start of `sys.path`. |
| P4 | Major | The partial's data binding, `$wrap`, and the float passed to `warnf %d` were unspecified. | The full template structure is given, with `int (div $h 24)`. |
| P5 | Major | The Verification Plan was missing the Python test, did not check the real workflow run, did not say whether to commit the file, and still used the stale "chosen option" wording. | The full CI order is listed, a `workflow_dispatch` check is added, the file is committed from the local run, and the checks are concrete. |
| P6 | Major | A Dimensions outage longer than 14 days would turn every PR red, with no recovery step. | The threshold is now 16 days, so one missed run is tolerated. A recovery note is added to Risks: the failure is the intended signal, and deleting the file hides the note. |
| P7 | Major | "Only the non-arXiv DOI (`10.48550/`) is kept" read as the opposite of what was meant. Line 234 contradicted item 8. | Reworded: "drop the arXiv DOI only when a published twin is listed". |
| P8 | Major | One element had five names (note, line, section, block). | The element is called "attention note" throughout. "Block" is used only for the `<details>`. |
| Nits | Nit | Fallback values could be 28 days old under a fresher date. Uppercase DOI requests were untested. Two CI steps had the same anchor. Timestamp format was unspecified. Sources for terms were missing. Badge copy was too strong. "N of M" was not tied to fields. The P4 label said "not yet reviewed". | Fallback is now 14 days, and this is accepted in Risks. Lowercase requests were verified live on 2026-11-02. CI order is fixed. Timestamps are `strftime(...Z)`. Sources link to `attention-sources.md`. The copy now says "where those services have data". Field names are used. The label is updated. |

No finding was contested or escalated. The re-run was not itself re-audited.
