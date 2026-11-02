# Stage 8: Intermediate Zoom Out Review

**Target:** `docs/media-tracker/design.md`, full file, revision 2.
**Reviewer:** `egm-zoom-out`, fresh context, `zoom-out-standard.md`. It was given the Stage 5 report and the
Stage 5-7 resolution record.
**Status:** completed. 0 Blockers, 5 Majors, 3 Nits.

## What the revision got right

* Delivery III removed.
* Weighted rules engine replaced by fixed labels.
* Repo-wide CI test dropped.
* One stateless failure rule.
* A gate added before stage 2.

## Findings

### I1. The attention-note test blocks nothing (Major)

The design says a stale note "blocks the build" and that a `TODO` file is "not rendered". Neither is true:

* `ci.yml` runs only on push and pull request.
* Its header says "Netlify still deploys on its own schedule; this only reports".
* So a `TODO` file would go live at the next batched build.

The design also adds a test, a hand-written YAML reader and a CI step for a guarantee they cannot give.

**Recommendation:** Do the checks in `attention_note.html` instead:

* render nothing when `as_of` is more than 200 days old;
* skip lines that contain `TODO`;
* `warnf` on banned words, which CI already fails on (any Hugo WARN).

Drop items 11 and 12.

*(The Elephant checked `ci.yml` lines 3 and 6-10: the claim holds.)*

### I2. Resetting the seen-list restarts the trial clock (Major)

`trial_end` and `ended_note` live in the same state as the seen-list. The design expects that state to be lost
sometimes, for example when the issue is closed. Each loss pushes the end date back.

**Recommendation:** Put a fixed `TRIAL_END` date in the workflow file, and skip the query step after that date.

### I3. Nothing counts "counted runs" (Major)

The CUJ 5 note and the "7 of 10" rule both need a counter, and none exists.

**Recommendation:** Use the run result. A green run counts and a red run does not. Ben counts green runs in the
Actions tab.

### I4. Stage 2 is still fully specified behind a gate that may never open (Major; carries over Z2/E2)

The hand test that the gate requires will produce the evidence that should shape stage 2, so a spec written now will
likely be rewritten. Passing the gate shows that title queries are useful. It does not show they need automating. The
cheapest response is to add title searches to the quarterly checklist.

**Recommendation:**

* Keep the gate. Its first outcome is "add title searches to the checklist".
* Move the stage-2 detail (Technical Plan stage 2 and items 20-23) into a follow-up design, written once the gate is
  met.

### I5. Delivery II has grown past the pattern it reuses, and contradicts B5 (Major; relates to E1)

It now differs from `pathways-refresh.yml` in several ways:

* no force-push;
* it stacks commits on the branch tip;
* it retries with a rebase;
* the branch survives a closed pull request;
* Ben clears `candidates.md` by hand.

Each merge also puts bot state on `main`, which is the cost B5 rejects. It needs repo-wide `contents: write` for a
10-week trial.

**Recommendation:** Get Q4 answered first. Until then, keep Delivery II to a few lines and list its costs.

### I6. The keep-or-remove rule needs a fact the log cannot hold (Nit)

The log records one route per row, so "the Alert did not find it" cannot be shown.

**Recommendation:** Log the first route, plus "also found by".

### I7. Two Risks rows are not risks of this change (Nit)

* "Badge script unavailable" describes today's behaviour.
* "Trial too short" repeats the gate.

**Recommendation:** Drop both.

### I8. Hashing and escaping detail remains in the Technical Plan (Nit)

**Recommendation:** Keep the architecture-level wording. Leave the details to the implementation spec.

## Handling

EGM gives Stage 8 no resolve step. Its options are to proceed, or for the author to update the document and re-run.

The Elephant acted as author in this unattended run:

* It applied all eight findings as revision 3, before Stage 9.
* `goldfish_review_report.md` records how each one was handled.
* Stage 8 was not re-run, and the re-audit cap was not used.
