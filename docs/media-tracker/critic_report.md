# Stage 7: Critic Review

**Target:** `docs/media-tracker/design.md`, FeatureRange lines 1-490 (first draft).
**Reviewers** (fresh contexts, run in parallel):
* `egm-design` and `egm-structural`, both against `feature-spec-standard.md`
* `egm-style`

## Reviewer status

| Reviewer | Status | Blocker | Major | Nit |
| --- | --- | --- | --- | --- |
| `egm-design` | completed | 0 | 13 | 8 |
| `egm-structural` | completed | 1 | 5 | 9 |
| `egm-style` | completed | 0 | 6 | 11 |

Duplicates are merged below. Source IDs: D = design, T = structural, Y = style. C = the Stage 6 comprehension findings.

## Blocker

### R1. No Risks & Mitigations section (T1; also D12)

The standard requires the spec to name its failure modes and how each is handled. Here the risks are scattered across
"Fails when" bullets and the NFR section. Several of them have no mitigation at all:

* P2 counts going stale
* Google blocking requests that come from GitHub Actions IP addresses
* a trial too short to show anything
* baseline resets losing items

**Recommendation:** add `## Risks & Mitigations`, with one row per risk giving the risk, its impact and the mitigation.

## Major

| ID | Sources | Lines | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| R2 | D1, Y1, C14 | 154-159, 379-385 | The trial cannot evaluate its own keep-or-kill rule. Nothing records what the Alert or the checklist found. "Real" is undefined. Runs where every query failed still count toward the 10. At a few real items a year, finding nothing in 10 weeks is the likely result and proves little. | Log every item found by any route, with its date, in `checklist.md`. Define "real" as "Ben adds it to `media.json`". Require one checklist pass during the trial. Count only runs in which at least one query succeeded. Say that "nothing found" is weak evidence. |
| R3 | D2 | 22, 276, 289-293 | The trial's premise, that title queries add recall, was never tested. Only journal titles become queries, yet the known Eller 2020 story concerns an IEEE ISI conference paper. | Before stage 2, run the title queries by hand against the known items. Include conference titles, or explain why they are left out. |
| R4 | D3 | 97-99, 379-385 | Nothing ends the trial. The cron has no run limit, so if nobody acts, the trial becomes a permanent weekly job. | Put the end date in the script. After it passes, post one "trial ended" note and do nothing more. |
| R5 | D4, Y4 | 202-203 | The doc lets "a Claude session" read Altmetric pages, which breaks its own source rule. Calling that "human viewing" is wrong, because an agent is automated. | Limit the refresh to Ben in a browser. |
| R6 | D5 | 328, 339-342 | Delivery I's state will outgrow the 65,536-character limit on an issue body at about 150-250 entries. The comment is posted before the state is saved, so a failed save makes the next run post the same items again. | Store short hashed keys. Save the state before posting the comment. Fail visibly if the state overflows. |
| R7 | D6 | 308-310, 343, 348-349 | Any reset (closed issue, unparseable state, missing branch, evicted cache) starts a baseline run that silently drops new items. Only Delivery III admits this. | In baseline runs, still show items published in the last 14 days. List the risk under each delivery. |
| R8 | D7, C4 | 350-367 | Delivery II force-pushes the branch that Ben is told to edit, which would wipe his edits. "contents: write (the branch only)" is not a real permission scope. | Commit on top of the branch tip without force. Correct the permission text and name the real guard. |
| R9 | D8, T2 | 101-106, 368-377 | Delivery III brings back `actions/cache`, which the brief rejected, yet the reconciliation note says Q8 is "the only contradiction". The SMTP helper's language is unspecified. The existing `_try_send_email` silently skips when the secrets are missing, and the SMTP secrets may never have worked (F15). | List the cache contradiction, or drop Delivery III. |
| R10 | D9, T5, Y2, C3 | 152 vs 328-330 | CUJ 4 fails the job after "2 runs in a row", but the collector exits 2 after one run, and the state has no counter of failed runs. | Choose one rule and state it in both places. |
| R11 | D10 | 80-85, 277-278 | Only robots.txt was checked, not Google's terms. Shared Actions IP addresses often get 429 responses or CAPTCHAs. The User-Agent text "contact via site" names no contact. | Flag the terms as unchecked in Q1. Set a minimum number of successful runs for the trial to count. Put a real contact in the User-Agent. |
| R12 | D11 | 438-439, 454-459, 136-140 | The privacy standard is inconsistent: headlines are kept out of `static/` but put into a public issue. Unescaped headlines in issue comments can @-mention people or render links. | Use one privacy standard. Escape titles and JSON-encode the snippets. |
| R13 | D13, C2 | 58, 69, 128, 241-244 | `in_cv` depends on the `academic-updates` skill, which is outside the repository, unverified, and not defined in the doc. | Make setting `in_cv` an explicit manual promotion step, and define the skill in one sentence. |
| R14 | T3 | 389, 444-448 | The section says it is "Copied from the brief", but that is untrue: B4 is new and P8 was dropped. | Fix the provenance line and fold P8 into A3. |
| R15 | T4 | 228-246 | Change S has no alternatives. | Add a short S1 alternative. |
| R16 | T6 | 470-487 | Additional Resources and Future Improvements are H3s nested under the NFR section. | Make them H2s. |
| R17 | Y5, D nit | 466-467 | The rollback rationale does not follow. | Treat a full revert and a partial revert separately, and name the harmful partial state. |
| R18 | Y6 | 14, 30, 395 | "Not permitted" is stated without naming the rule, so it seems to contradict Q1. | Name the specific violations (F4, F5, F6). |
| R19 | Y3 | across stage 2 | "feed", "query" and "source" are all used for the same unit. | Use "query" for a request and "source" for the provider. |

## Nits (grouped)

* **Structure** (T7-T15):
  * B3 does not follow the format of the other alternatives.
  * B2 sits in Alternatives Considered but is not rejected.
  * The P2 and Delivery III bullets are uneven.
  * The CUJs use mixed list styles.
  * Open Questions refers forward, and the process note sits inside the spec.
  * The trial dates are placeholders.
  * "12 requests" in one place, "3 + N" in another.
  * "unflagged-or-flagged".
  * Horizontal rules are used inconsistently.
* **Style** (Y-N1 to Y-N11):
  * Value words: "honest", "flatters", "faults".
  * Vague quantifiers.
  * Informal terms: "kill", "flood", "alert fatigue".
  * Process jargon: "EGM", "draft step 6".
  * "seen-list" and "state" are both used for the same thing.
  * The query list leaves out "Benjamin M. Ampel".
  * The search claim at line 189 is narrower than it says.
  * Undefined references: "promotion steps", "the 2010 and 2024 items".
  * B4's cons are phrased as facts.
* **Design** (D nits):
  * The publications page needs the shortcode wrapper, which the diagram omits.
  * CUJ 1 promises more links than the schema allows.
  * The CUJ 1 example numbers are the scraped values. P2 must be re-read by hand.
  * D2a (Google Alerts as RSS) and D5 (a local script) are missing from the alternatives.
  * The search claim omits the workflow's `git add` line.
  * The URL filter should require an exact host match, and also reject `www.google.com/url` and `consent.google.com`.
  * "Issues enabled" should be a precondition for Delivery I. The Elephant checked: Issues are enabled, and the
    repository is public.
