# Stage 5: Initial Zoom Out Review

**Target:** `docs/media-tracker/design.md` (full file, first draft, 2026-11-02)
**Reviewer:** `egm-zoom-out` (fresh context), standard `zoom-out-standard.md`
**Status:** completed. 0 Blockers, 6 Majors, 4 Nits. Line numbers refer to the first draft.

The reviewer judged the context sufficient and the objective clear. Changes A and S fix the root problem by deleting
the data source that is not permitted, rather than relabelling it, and they reuse existing patterns:

* `data/*.yaml`, as `grants.yaml` and `extension.yaml` already do
* jsdom, which is already installed
* the `version-watch.yml` and `pathways-refresh.yml` workflows

Most of the document's weight sits in Change B stage 2, which is specified far beyond what an unproven trial needs.

## Findings

### Z1. A goal and a planned test conflict with existing code (Major)
**Where:** Goals; item 11; Verification Plan.

The goal "Nothing in the repository ... sends a browser User-Agent it is not" is already false. So is the planned
test that fails on any `Mozilla/5.0` under `scripts/`.

**Why:** `scripts/self-host-google-fonts.mjs:14` sets a Chrome User-Agent on purpose, so that Google Fonts serves
woff2 files. The design never mentions that script. As written, the new CI test fails the day it lands. (The
Elephant checked this line and it holds.)

**Recommendation:** Narrow the goal and the check to Altmetric and to robots-disallowed pages, or say what happens to
the font script.

### Z2. Stage 2 is fully designed before stage 1 has shown any gap (Major)
**Where:** Overview; Change B stage 2; items 19-24; Q3, Q4, Q5, Q8.

The brainstorm and the brief both say to build a collector only if the baseline measurably misses coverage. This
design starts the trial as soon as Ben approves it, and spends about 40% of its length on it.

**Why:** The trial's own kill rule compares the collector against the baseline. That comparison needs the baseline to
have run first.

**Recommendation:** Ship A, S and stage 1 now. Write a short separate stage-2 design after about a quarter, once a
missed item is on record. Failing that, cut stage 2 to one delivery and a flat output.

### Z3. Three delivery options are specified down to the workflow level (Major)
**Where:** "Delivery and state storage (Q4)"; items 23 and 24.

Two of the three options add parts the trial does not need:

* **Option II** puts tracker state under `data/`, which is Hugo's site-data folder. CI fails on any Hugo `WARN`
  (`ci.yml:62-64`).
* **Option III** brings back `actions/cache`, which the brief rejected because of the 7-day eviction. It also adds a
  Python helper and refactors `expand_stub_authors.py` so that a Node script can send mail.

**Recommendation:** Pick one delivery, Option I (rolling issue). It writes nothing to the repository, needs no new
runtime and no refactor, and follows `version-watch.yml`. Reduce the others to one-line rejected alternatives.

### Z4. A weighted rules engine for about 5 items a week (Major)
**Where:** "Rules file"; `applyRules`; item 20; Q5.

The plan has regex rules, positive weights, ranking and a collapsed block. Q5's "no rules" option still builds all of
that machinery.

**Why:** The fixture has 5 items, and the name clash is already handled in the query.

**Recommendation:** Output a flat list, with at most a hard-coded set of negative labels. Revisit only if noise
proves to be a real cost.

### Z5. Architecture text drops into implementation detail (Major)
**Where:** Technical Plan, Change B; items 19 and 23.

The plan fixes the exact key normalization, regexes, retry timings, a 2,000-key state cap, exit codes, function
signatures and cache-key strings.

**Why:** These choices are locked in before anyone has seen how the feed behaves. The cap will never be reached:
12 × 5 × 10 is about 600 keys. The consecutive-failure marker is stored three different ways, and "fail the run when
every query fails" gives the same signal.

**Recommendation:** Keep the components, the data flow, the dedupe principle and the failure policy. Drop the cap and
the consecutive-failure marker.

### Z6. A permanent CI test guards a one-time deletion (Major)
**Where:** Items 11-12; Verification Plan.

A test that scans the whole tree for patterns is brittle, as Z1 shows, and it repeats the one-off greps already in the
Verification Plan.

**Recommendation:** Drop `tests/attention-panel.test.mjs` and its CI step, and keep the greps as one-time checks. If a
guard is wanted, use a narrow check that the `attention.yaml` wording avoids "score" and "total".

### Z7. Item 7 contradicts itself (Nit)
Under P1 the block is removed, yet the same item says to rename it "either way". Limit the rename to P2 and P3.

### Z8. The reason for choosing Node is partly inaccurate (Nit)
CI already runs Python (`ci.yml:85-86`, `subset_fontawesome.py`). The real reason is that tests run under
`node --test` and jsdom is already installed. Restate it that way.

### Z9. The shortcode wrapper should cite its precedent (Nit)
`layouts/shortcodes/altmetric.html` already wraps a partial in the same way. Cite it, and trim the PurgeCSS note.

### Z10. "CV gap report" repeats the purpose of `in_cv` (Nit)
Drop the future item, or keep it only if `academic-updates` cannot read `media.json` itself.

## Strengths to keep

* Deleting the scraper rather than relabelling it.
* One partial with one display rule and no threshold.
* Rendering the Spotlight with DOM methods.
* Promotion stays a human edit.
* A, S and B are independently revertible.
