# Stage 6: Comprehension Test

**Target:** `docs/media-tracker/design.md`. FeatureRange: lines 1-490. DetailedRange: lines 491-787 (first draft).
**Reviewer:** `egm-comprehension` (fresh context, no document standard).
**Status:** completed. 0 Blockers, 7 Majors, 9 Nits.

## What this proposes

The design proposes three changes. Each can be approved or reverted independently.

* **Change A** deletes a weekly script that scrapes Altmetric pages while posing as a browser, and the summed "Total
  Score" panel that script feeds. The official per-paper Altmetric badges stay. If Ben wants it, a hand-edited
  `data/attention.yaml` drives a dated "Research attention" note. The note is rendered at build time and follows the
  same rule on the CV and publications pages.
* **Change S** makes the Media Spotlight build its cards safely with DOM methods. A title becomes a link only when the
  item has a real `https` publisher URL. It also adds an `in_cv` flag to each `media.json` entry and fixes a wrong
  cron comment.
* **Change B** first sets up a written, no-code discovery routine: a Google Alert, a quarterly checklist and a draft
  request to the press offices. If Ben approves, a Node collector then runs weekly for 10 weeks. It queries Google
  News RSS for his name forms and journal paper titles, drops items already seen and known false positives, and posts
  new candidates to a queue (an issue, a PR or an email). After the trial, Ben keeps or kills the collector against a
  written rule.

Nothing the collector finds is published without Ben.

## How the existing system works, per this document

* bampel.com is a Hugo site. It builds at 06:00 and 17:00 ET, or sooner when a commit carries `[deploy now]`.
* A Monday GitHub Actions job (`update-scholar-metrics.yml`; its comment wrongly says monthly) runs
  `update_altmetric.py`. That script fetches the Altmetric `/details/` pages for 23 DOIs with a fake Chrome
  User-Agent and writes summed totals to `static/data/altmetric.json`. When a fetch fails, it writes zeros.
* Two JS widgets show these totals. The CV-page widget always shows them. The publications-page widget shows them
  only above a threshold.
* Paper pages embed Altmetric's official badge separately.
* The Media Spotlight is a JS widget that reads 3 items from `media.json`. It drops their URLs and writes their text
  unescaped into `innerHTML`.
* The CV is a Word document, edited by hand through an `academic-updates` skill.
* Ben has no routine for finding coverage. Every known item came from a press office or an interview.

## Findings

| # | Severity | Lines | Finding |
| --- | --- | --- | --- |
| C1 | Major | 127, 464-465 | The build schedule and `[deploy now]` are never explained. A reader cannot tell what the tag does or why commits should leave it out. |
| C2 | Major | 69, 128, 244, 487 | `academic-updates` is undefined. The document does not say what it is, who runs it, or that the CV master is a Word file in OneDrive. It also does not say whether setting `in_cv` is existing behaviour or a change this design asks for. |
| C3 | Major | 152 vs 330 | The rules for an all-feed failure seem to contradict each other inside FeatureRange. The collector exits 2 on any run where every feed failed, yet the job fails only after two such runs in a row. The marker that tracks this appears only at lines 740-744. |
| C4 | Major | 352-367 | Delivery II's branch mechanics are unclear. The text says both "append" and "force-push", but not which base each run starts from. "contents: write (the branch only)" reads like a GitHub permission scope, which does not exist. The text also does not say what happens to the branch after a merge. |
| C5 | Major | 310 | "The 2010 and 2024 items (F1)" are not identified. F1 dates only the 2010 item. |
| C6 | Major | 543 | Under P1 the block is removed, so "rename it either way" has nothing to rename. |
| C7 | Major | 667, 723, 779 | The meaning of `--state -` (stdin, or no state?) is undefined, and so is the behaviour when the state file is missing. |
| C8 | Nit | 414 | "The seed's weekly job" is undefined, and `concept_seed.md` is missing from Additional Resources. |
| C9 | Nit | 3, 101, 475 | "EGM", "EGM draft step 6" and "six-lens brainstorm" are unexplained jargon. |
| C10 | Nit | 47, 72 | Some facts make sense only with the brief open (for example, F15). Add one-clause summaries. |
| C11 | Nit | 376-377 | Delivery III points to CUJ 4 for an SMTP failure, but CUJ 4 covers feed failure. |
| C12 | Nit | 151, 284, 557 | Wording: "failed feed's items are not added" (a failed feed returns no items); "unflagged-or-flagged" just means "any"; "the partial must check" (a template cannot check anything). |
| C13 | Nit | 311-316 | The weight of negative rules is never stated. |
| C14 | Nit | 158, 782 | "Real item" in the kill rule is not defined. |
| C15 | Nit | 646, 776 | The text does not say which `media.json` item has a URL (the Eller story). |
| C16 | Nit | 674, 681 | `selectNew` is said to return `{fresh, nextState}`, but the text also says it returns `baseline: true`. Where that flag lives is not stated. |

## Overall

Both ranges can be paraphrased, and the parts connect, so there is no Blocker. The Major findings are:

* undefined deployment and CV-workflow terms
* a contradiction about failure exit codes
* unclear Delivery II branch mechanics
* a few gaps in DetailedRange
