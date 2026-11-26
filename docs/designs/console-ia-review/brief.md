# Study admin console: reorganize the tabs

* **Author:** Ben Ampel
* **Date:** 2026-11-25
* **Status:** brainstorm brief, approved by Ben 2026-11-25. Superseded by ../console-ia.md.

## Overview

The lab hosts survey and experiment studies for any researcher: faculty, PhD students, and collaborators from other schools. A researcher who opens a study's admin page cannot tell how to edit it. The chat study shows 12 top tabs in one row. The editor is the 7th, under the noun "Study content", and the page opens on Participants. Inside the editor are 8 to 11 sub-tabs, and they are not in the order a participant meets them. Rare owner tools (backups, self-test, delete test participants, versions, design file, reproducibility bundle) sit at the bottom of busy tabs. Full inventory: `console-ia-review/current-map.md`.

The goal: a researcher who has never seen the console can find where to edit the study, and the order of what they edit, without reading the guide.

## Analysis (six independent reviews)

**What the reviewers objected to, worst first.**

1. **The "draft vs live" landing rule needs data the page does not have when it loads.** At start-up the console calls only `me`, which has no participant count. The count comes later, from a fetch of every participant. Two definitions of "real" exist today: the editor's lock uses "not a test and consented or finished a session", while the Participants filter uses "not a test". A study changing its landing tab with no visible reason reads as a bug. Three of six reviewers recommended dropping the rule; Ben chose to keep it. The fix is to compute it on the server, show it, and limit it to editors (see Decisions).
2. **Hiding everything rare under "More" also hides things researchers need at set moments.** Students holds the pilot access codes and roster used to recruit. Self-test and "delete test participants" are steps on the guide's launch checklist (guide lines 87, 151, 247), so they belong near piloting, not under "Maintenance".
3. **Moving Versions out of the editor creates a real bug risk.** Restore reads the editor's unsaved changes and reloads it. On a separate page it could throw away unsaved edits. Versions stays with the editor.
4. **"Results" is a confusing box.** A first-timer reads it as "my data", but the data table and downloads stay under Participants. Results needs a pointer to downloads, and each view needs a one-line purpose.
5. **The participant-order side list cannot place plugin sections today.** Plugins return bare `[id, label]` pairs. Conditions, Arms & blocks and the Builder canvas are design, not screens. "Import a survey" is a one-time action. The order needs an optional group hint from plugins, defaulting to "task".
6. **The labels "Maintenance" and "Settings" are too vague.** Devices & timing and Block order have little in common, and Block order is a design decision (counterbalancing).
7. **Renaming "Study content" has ripple costs.** It appears in about 15 places: the guide (lines 85, 99, 121, 145, 168, 178, 185, 225), the README, server messages in `selftest.mjs`, `game/selftest.mjs` and `import/qsf.mjs`, the participant and envcheck pages, `alert-triage-admin.js`, and two tests. A missed one points a researcher to a tab that no longer exists.
8. **The code selects tabs by hard-coded id with side effects.** `showTab` is an if-chain on literal ids, each with its own loader. `aria-current="true"` is relied on by `admin.css:36` and `vignettes-admin.js:92`, and plugins call `A.goto('items')` and `A.goto('pre')`. Renaming ids would break all of this, so only labels change.

**What Qualtrics, REDCap and Gorilla do.** All three open on the editor ("Survey", "Online Designer", "Design") or on a home page that lists the entry points. All three name the first tab with a verb or the thing you build. None hides everyday tools behind a menu; REDCap and Gorilla keep rare tools in a visible side list. This supports putting "Edit study" first.

## Goals vs. Non-Goals

**In scope**
- "Edit study" becomes the first tab and is styled as the main one. The Preview button sits next to it.
- A short top bar, a "More" menu for rare tools, and an editor side list grouped in the order a participant meets things.
- A status line under the title: "Draft: no real sign-ups yet" or "Live: 12 real participants".
- The draft/live landing rule, for editors only.
- Docs, server messages and tests updated in the same change, plus a test that fails if "Study content" survives in user-facing text.

**Out of scope**
- Removing any tool, or changing who can see what. Every role gate stays as it is.
- Changing tab ids, the plugin interface (beyond one optional field), or how content is saved.
- A setup checklist or wizard (listed as a possible follow-up).
- Rewriting the plugins.

## Proposed layout

**Top bar** (labels only change; ids stay the same):

| Position | Label | Holds | Who sees it |
|---|---|---|---|
| 1 | **Edit study** (main style) | the editor, save bar, Versions | everyone (viewers read only) |
| 2 | Participants | counts, Download menu, table, and a folded "Testing tools" box (self-test, delete test participants) | viewer; the testing tools for owners |
| 3 | Results | three views: Pilot report, Figures, Analyze, each with a one-line purpose and a "Download data is under Participants" link | viewer |
| 4 | Students | pilot access codes, roster, extra credit | manager |
| 5+ | study-type tabs | e.g. Compare, Conversations, Recordings & calls, Game operations, in plugin order | each tab's own role |
| last | More ▾ | Data quality (Integrity), Team, Encryption, Activity, Backups & sharing | each item's own role; the menu is hidden when empty |

**"Backups & sharing"** (new page, in More, owner) holds backups, the study design file and the reproducibility bundle. It reuses the existing loaders and markup.

**Inside Edit study**, a side list in groups:
- **Before the task:** Sign-up & consent, Start-of-session survey
- **The study:** the type's own sections, in the plugin's order (Builder or Chatbot first), plus Import a survey where the type has it
- **After the task:** End-of-session survey
- **Throughout:** Screen text (buttons and messages)
- **Delivery:** Devices & timing, Block order (counterbalancing)

The editor still opens on the first section of "The study", so builder studies still open on the Builder canvas. On screens narrower than 760px the side list sits above the editor as a wrapping row of buttons with small group labels.

## Alternatives Weighed

- **Rename and reorder only.** Rename "Study content" to "Edit study", move it first, fold the testing tools, and change nothing else. This fixes most of the stated problem for about a fifth of the work and breaks nothing. The zoom-out reviewer recommended shipping this first and building the rest only if people still get lost. It is kept below as Stage 1.
- **A fixed landing tab for everyone** (always Edit study). Simpler and predictable, and it is what Qualtrics and Gorilla do. Ben chose the draft/live rule instead.
- **A setup checklist on top** (Sign-up → Surveys → Tasks → Preview → Launch) that links into existing sections. It teaches the flow without moving tabs. Deferred as a follow-up.
- **An explicit Build / Run switch.** Clear, but it adds a mode the researcher has to manage. Rejected.
- **Grouping fully declared by plugins.** Plugins would disagree on the frame, and the shared surveys would land in different places per type. Rejected: core owns the frame, and plugins give an optional hint.

## Key Decisions & Staging for Next Steps

1. **Tab ids never change; only labels do.** Stored tabs, `#import`, plugin `goto` calls and `aria-current` keep working. Stored ids for views inside Results (`report`, `figures`, `analyze`) open Results on that view. `#import` is handled before the landing rule.
2. **Landing rule.** The `me` response gains one field, `realSignups`, computed on the server with the same filter the editor lock uses (not a test, and consented or finished a session). Editors on a study with 0 real sign-ups land on Edit study, and everyone else lands on Participants. A tab remembered in this browser session wins. If the field is missing, the page lands on Participants. The status line shows the state, so the switch is never silent.
3. **One optional plugin field.** A third element on a sub-tab, `group` (`'task'` by default, or `'delivery'`), plus `placement: 'more'` on a top tab. Existing plugins need no edits.
4. **Labels live in one constant**, which is used by the console and checked by a test.
5. **The More menu** reuses the existing `<details class="pt-menu">` pattern (Escape, click-away). The "More" button shows as current when one of its pages is open.
6. **Staging.** **Stage 1:** rename, move Edit study first, add the status line and the landing rule, fold the testing tools, and update docs and tests. **Stage 2:** Results grouping, the More menu, Backups & sharing, and the grouped editor side list. Each stage is its own PR.

**After Ben approves:** a formal design draft (egm-draft), a review of that draft, then the build in worktree `lab/console-ia`.
