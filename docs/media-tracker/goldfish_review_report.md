# Goldfish Annotated Review Report (Stages 5-7 resolution)

Status: resolved (unattended run; see note)

**Target:** `docs/media-tracker/design.md`, full file. The revision covers both FeatureRange and the parts of
DetailedRange that the findings reach.
**Inputs:**
* [zoom_out_report.md](./zoom_out_report.md): Z1-Z10
* [comprehension_report.md](./comprehension_report.md): C1-C16
* [critic_report.md](./critic_report.md): R1-R19 and the grouped Nits

**Note on the resolution gate.** EGM's resolve step normally waits for the owner to say "auto accept", "continue" or
"interactive breakdown". This run was unattended, so the Elephant took the "auto accept" path:
* every PROPOSE FIX was applied to `design.md` (revision 2);
* nothing marked CONTEST or ESCALATE was changed.

Revision 1 was never committed, so no copy of it is kept. The three stage reports describe it and quote its line
numbers. Ben can reverse any applied fix.

## Counts

| Category | Count |
| --- | --- |
| PROPOSE FIX (applied) | 41 |
| ESCALATE (Ben decides) | 2 |
| CONTEST | 1 |
| DECLINE | 1 |

## ESCALATE (needs Ben's knowledge or decision)

### E1. [`egm-zoom-out` Z3] Pick one delivery, rolling issue. Severity: Major
* **AI Suggestion:** ESCALATE, partly fixed.
* **Justification:** The reviewer is right that three fully specified deliveries is too much, and Delivery III was
  removed (see R9). Choosing between I and II is an architecture decision with two defensible answers. EGM's draft
  rules leave that choice to the owner, so the Elephant did not choose. Both remaining options are now described at
  the same depth, with their failure modes. Q4 asks Ben to pick.

### E2. [`egm-zoom-out` Z2] Move stage 2 into a separate later design. Severity: Major
* **AI Suggestion:** ESCALATE, partly fixed.
* **Justification:** Stage 2 was part of the original request: "design a weekly automated tracker". So the Elephant
  kept it in this document, and added the gate the reviewer asked for: one quarter of stage 1, plus a hand test of
  the title queries, before any build. Stage 2's implementation items are grouped under "build only after Q3 approval
  and the gate". If Ben prefers a separate stage-2 document, items 20-23 and the stage-2 parts of the Technical Plan
  move out as one block.

## CONTEST

### K1. [`egm-style` Y-N1] Remove "honest" from the title. Severity: Nit
* **AI Suggestion:** CONTEST, then adjusted anyway.
* **Justification:** "Honest presentation" is Ben's own framing in the task, recorded in the brief's Overview, so it
  is not an ungrounded value word. The title now says "clearer attention panel" because that phrase describes the
  change itself. "Flatters" and "faults" were replaced, as the reviewer asked.

## DECLINE

### X1. [`egm-structural` T15] Horizontal rules are used unevenly. Severity: Nit
* **AI Suggestion:** DECLINE.
* **Justification:** The rules follow the EGM template, which places them around the metadata, before the NFR
  section and before the implementation plan.

## PROPOSE FIX (applied in revision 2)

| Finding(s) | Severity | Fix applied |
| --- | --- | --- |
| R1, D12 | Blocker | Added `## Risks & Mitigations`, with 10 rows covering each risk, its impact and its mitigation. |
| Z1 | Major | The goal is narrowed to Altmetric and robots-disallowed pages. `self-host-google-fonts.mjs` is named as out of scope. |
| Z4 | Major | The weighted rules engine is gone. Labels come from a fixed pattern list, nothing is ranked or hidden, and Q5 is now "labels or a flat list". |
| Z5 | Major | Architecture text is trimmed to components, data flow, dedupe, the failure policy and the trial limit. Signatures, hashes and timings moved to items 20-23. The 2,000-key cap was dropped. |
| Z6 | Major | Dropped the repo-wide `attention-panel` test. The one-off greps stay in the Verification Plan. A narrow `attention-note.test.mjs` (wording, links, `as_of` age) applies under P2 or P3 only. |
| R2, D1, Y1, C14 | Major | Added a found-items log to stage 1. "Real item" is defined as one Ben adds to `media.json`. The keep-or-remove rule now needs both a collector-only real item and at least 7 counted runs. The doc says that a quiet trial is weak evidence. |
| R3, D2 | Major | Added a gate before stage 2: one quarter of stage 1, plus a hand test of the title queries. Conference titles are now queried. |
| R4, D3 | Major | The trial end date is stored in the script's state. After that date the job posts one note and stops querying (CUJ 5). |
| R5, D4, Y4 | Major | P2 is refreshed only by Ben in his own browser, and the "human viewing" sentence is gone. A CI test fails on an `as_of` date older than 200 days. |
| R6, D5 | Major | State is stored as 12-hex hashed keys, about 25 characters each. The state is saved before posting. |
| R7, D6 | Major | Baseline runs still show items published in the last 14 days. This applies to every delivery. |
| R8, D7, C4 | Major | Delivery II no longer force-pushes: the bot adds commits on top of the branch tip. The permission text is corrected, and the guard that stops pushes to `main` is named. State moved to `.github/media-tracker/`, outside Hugo's `data/` (also Z3). |
| R9, D8, T2 | Major | Delivery III was removed and became Alternative B4. The cache contradiction with the brief is listed in "Deviations from the brief". |
| R10, D9, T5, Y2, C3 | Major | One failure rule: a run in which every query fails exits 1 and does not count. No state is needed to track it. |
| R11, D10 | Major | Q1 says Google's terms are unchecked and must be checked before stage 2. The User-Agent now names `bampel@gsu.edu`. A minimum of 7 counted runs is required. |
| R12, D11 | Major | There is now one privacy standard (public issues and PRs may hold headlines that are already public; bampel.com never shows them without a hand edit). Titles go in code spans and snippets are JSON-encoded. A test covers `@`, links and tags. |
| R13, D13, C2 | Major | `academic-updates` is defined in The Problem. Setting `in_cv` is now an explicit step in the checklist. A skill change was added as a future improvement. |
| R14, T3 | Major | The provenance line now reads "derived from", and B4 and S1 are marked as new. P8 (Mendeley only) is folded into A2. |
| R15, T4 | Major | Added Alternative S1 (a sanitiser library, or build-time rendering). |
| R16, T6 | Major | Additional Resources and Future Improvements are now H2 headings. |
| R17, Y5 | Major | The rollback text moved to Risks: revert A as one commit. It names the harmful partial states and the expected effect of a full revert. |
| R18, Y6 | Major | The Problem now names the specific violations (F4, F5, F6) instead of saying "not permitted". |
| R19, Y3 | Major | "Query" is used for a request and "source" for the provider, throughout stage 2. |
| C1 | Major | The batched builds and `[deploy now]` are defined in The Problem. |
| C5, Y-N10 | Major | The F1 items are named: the 2010 "College notes" page and the two 2024 "Grad Ads" pages. |
| C6, Z7 | Major | Item 7 no longer renames anything under P1. |
| C7, C16 | Major | `--state <path>` now means: if the file is missing or unparseable, the run takes a baseline. `selectNew` returns `{show, nextState, baseline}`. |
| C8 | Nit | `concept_seed.md` is added to Additional Resources. "Seed" now appears only in B1, which is titled by its source. |
| C9, Y-N5, T11 | Nit | Process jargon is removed from the spec. Open Questions moved after the Alternatives, and the reconciliation note became "Deviations from the brief". |
| C10 | Nit | F-numbers now carry one-clause summaries where they are used. |
| C11 | Nit | Removed along with Delivery III. |
| C12, Y-N2, T14 | Nit | "Unflagged-or-flagged", "the failed feed's items" and "the partial must check" are reworded. |
| C13 | Nit | Weights were removed (Z4). |
| C15 | Nit | The doc now says the Eller 2020 item is the only one with a `url`. |
| Z8, B6 | Nit | The reason for choosing Node is restated: CI tests run under `node --test`, and jsdom is already installed. |
| Z9 | Nit | The doc cites `layouts/shortcodes/altmetric.html` as the pattern for the wrapper. The PurgeCSS note is trimmed. |
| Z10 | Nit | The "CV gap report" item is replaced by the specific skill change. |
| T7, T8 | Nit | B3 is now a table of rejected options (B5). B2 is now "Do nothing" only. |
| T9 | Nit | The P2 refresh is folded into a labelled "Updating" bullet. Delivery III was removed. |
| T10 | Nit | CUJs use numbered steps for sequences and bullets for alternative outcomes, as stated at the top of the section. |
| T12, T13 | Nit | The trial end is computed (first run + 9 weeks). Query counts read "3 + N (3 + 37 today)". |
| Y-N3, Y-N4, Y-N6 to Y-N9, Y-N11 | Nit | Vague and informal terms are replaced. "Seen-list" is defined once. All three name queries are listed. The search claim is widened to 7 folders. B6's cons are rephrased. |
| D nits | Nit | Added the shortcode to the diagram. Line-level links are allowed only for single-item lines. The first P2 values must be read by hand. Added Alternatives B3 (Alerts RSS) and B5 (local script). The workflow `git add` line is named. The URL filter now requires an exact host match and rejects three Google hosts. Issues are confirmed enabled and the repo public. |

---

# Stage 8 handling (revision 3)

Source: [intermediate_zoom_out_report.md](./intermediate_zoom_out_report.md). Stage 8 has no resolve step in
EGM; the author-update path was taken. All eight findings were applied before Stage 9.

| Finding | Severity | Applied fix |
| --- | --- | --- |
| I1 | Major | Dropped the attention-note test, its CI step and the hand-written YAML reader. The checks moved into the Hugo partial, so they run on every Netlify build: `TODO` lines are skipped, the note is hidden after 200 days, and banned words or non-https links trigger a `warnf`, which CI already fails on. The partial also emits the `<details>` wrapper, so no empty block is left behind. |
| I2 | Major | `TRIAL_END` is now a fixed date in the workflow file. A reset of the seen-list cannot move it. |
| I3 | Major | Removed the run counter. A green run counts and a red run does not. Ben counts green runs in the Actions tab. |
| I4, Z2, E2 | Major | The gate's first outcome is now "add the title searches to the quarterly checklist". Stage 2 is cut to an architecture sketch, and its implementation spec is deferred to a follow-up design. This closes E2. |
| I5, E1 | Major | Delivery II is cut to a few lines that state its costs: new branch handling, bot files on `main`, and repo-wide `contents: write`. Q4 still asks Ben to choose. E1 stays open. |
| I6 | Nit | The found-items log now has "first route" and "also found by" columns. |
| I7 | Nit | Dropped the "badge script unavailable" and "trial too short" rows from Risks. |
| I8 | Nit | Moved the hashing and escaping detail out of the Technical Plan. |

---

# Stage 9 resolution (revision 4)

Source: [implementation_readiness_report.md](./implementation_readiness_report.md). All findings were PROPOSE FIX
and were applied. None were contested or escalated.

| Finding | Applied fix (item in design.md) |
| --- | --- |
| M1 | Item 8 sets the source line's colour per theme: `#57606a` in light mode (6.4:1 on white) and `#8b949e` in dark mode (6.2:1 on `#0d1117`, 5.6:1 on `#161b22`). The Elephant computed these ratios. |
| M2 | Item 8 renders a link from three escaped parts, split at the first match, and never uses `safeHTML`. When any condition fails, the line is plain text. |
| M3 | Item 8 always renders `div.attention-note`. `wrap` adds only `<details>`. When `wrap` is false, the div starts with an `<h3>`. |
| M4, B9 | Item 10 gives the exact YAML for P1 + P2 and for P1 + P3. The Mendeley caveat no longer uses "total". |
| M5 | Item 11 puts the anchor inside the existing title div. The URL check runs in `try`/`catch`. `div.media-empty` is built explicitly, and the CSS is given. |
| M6 | Item 13 has a complete 8-row fixture, the fetch stub, inline markup and explicit assertions, including `data-type` and the malformed URL. |
| M7 | Item 10 adds a `source_note` field. Under P3 it is empty. |
| M8 | The Verification Plan gives the exact `grep --exclude-dir` command. |
| Nits | `warnf` checks run before the hiding rule. The build cadence is stated. The workflow commit message is changed. `custom.scss` and the CI step position are named. The P3 URL is written out, with a `TODO` until Ben confirms it. The `warnf` format is given. The checklist list is fixed and has a route value, draft text, and a note that Ben creates the alerts. The option names now match Q2. Each change is one pull request. The secret-deletion line is removed. The 200-day rule is stated once. Line references were replaced with step names where those will change. "Should" became "must". The CI order is corrected. The Sawtooth page and the two classes are named. |

## Final counts across Stages 5-9

| Category | Count |
| --- | --- |
| PROPOSE FIX applied | 41 (Stages 5-7) + 8 (Stage 8) + 8 Majors and all Nits (Stage 9) |
| ESCALATE still open | E1 (pick Delivery I or II), which is Q4 in the design |
| CONTEST | 1 (K1, wording only) |
| DECLINE | 1 (X1) |
