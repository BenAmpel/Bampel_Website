# Study admin console: reorganize the tabs

*   **Author:** Ben Ampel
*   **Status:** Proposed (design approved section by section; review resolved 2026-11-26)
*   **Date:** 2026-11-25
*   **Brief:** [console-ia-review/brief.md](console-ia-review/brief.md)

--------------------------------------------------------------------------------

## Overview

The lab at bampel.com/lab runs surveys and experiments for any researcher who has an account: faculty, PhD students, and collaborators from other schools. Each study has an admin page (`static/lab/engine/admin.js`). It is where the researcher edits the study, watches sign-ups, downloads data and manages the team.

This design reorganizes that page so a researcher who has never used it can find where to edit the study, and the order in which a participant meets each part, without reading the guide. It renames and reorders the tabs, adds a status line and a landing rule backed by one new server field, groups the editor's sections, and moves rare tools into a menu. It does not remove any tool, change who can see what, or change how content is saved.

## The Problem

A researcher opening the chat study's admin page sees 12 tabs in one row. The editor is the 7th, under the noun "Study content", and the page opens on Participants, which is empty for a new study. Ben could not tell how to edit a study from that screen.

Inside the editor are 8 to 11 sections, and they are not in the order a participant meets them: Sign-up & consent comes first for the participant but sits after both surveys. Rare owner tools (backups, the live self-test, delete test participants) and the sharing tools (the study design file, the reproducibility bundle) sit at the bottom of busy tabs, where they add length without being findable.

Qualtrics, REDCap and Gorilla open on the editor or on a home page that points to it.

## Approach

Two stages, each its own PR:

*   **Stage 1 [S1]:** rename "Study content" to "Edit study" and move it first. Add a status line that says whether the study is a draft or live. Open draft studies on Edit study for editors. Collapse the self-test and delete-test tools into a "Testing tools" box. Update the docs, server messages and tests that name the old tab.
*   **Stage 2 [S2]:** gather Pilot report, Figures and Analyze into one Results tab. Move occasional tools into a "More" menu, with a new "Backups & sharing" page. Group the editor's sections in the order a participant meets them.

Ben chose to build both stages. Stage 2 can still be dropped without undoing Stage 1.

## Glossary

*   **Study type (plugin):** the code for one kind of study (chatbot, Study Builder, vignettes, quiz, reaction, game, alert triage) under `static/lab/engine/types/` and `netlify/lib/lab/types/`. It adds its own top tabs and its own editor sections.
*   **Tab:** a button in the top row (`data-tab`). **Section:** a button in the editor's side list (`data-sub`).
*   **`A`:** the admin page's shared object that plugins receive (`A.goto`, `A.started`, `A.draft`). **`S`:** the server's study handle (store, type, id).
*   **Roles:** viewer < editor < manager < owner. Checks are ordered (`admin.js:11,14`), so "editor or higher" is what `can('editor')` means. In this doc "editor" always means that role; the tab is always "Edit study".
*   **Test participant:** made by preview, the self-test or "Add test participant"; marked `test`. **Real participant:** anyone else.

### Participant lifecycle

record created (access code, self sign-up or panel) → consented (`consentedAt`) → one or more sessions done (`done/<code>/…`) → finished.
The structure lock is set at the first step for any real record (`engine.mjs:516`). A **real sign-up** is a real participant at the second step or later.

## Goals

1.  [S1] "Edit study" is the first tab and is styled as the main one, with Preview next to it.
2.  [S1] An editor or higher who opens a draft study lands on Edit study. Anyone who opens a live study lands on Participants. A tab the user clicked earlier in the same browser session still wins.
3.  [S1] The status line under the title always says which of the two states the study is in, so the landing tab never changes without a visible reason.
4.  [S1] "Real sign-up" means not a test participant, and either consented or finished a session. The status line, the landing rule and the editor's started count share one predicate, `isRealSignup`. The structure lock and the Participants filter use the broader "not a test" rule on purpose (see Server).
5.  [S2] For an owner on the chat study, the row is Edit study, Participants, Results, Students, Compare, Conversations, More (7, down from 12). A viewer sees Edit study, Participants, Results, More (4).
6.  [S2] The editor's sections are drawn under Before the task, The study, After the task, Throughout, and Delivery. The editor still opens on the study type's first section, so Builder studies still open on the Builder canvas.
7.  [S1] No user-facing text, doc or server message names the tab "Study content" once Stage 1 ships, and a test fails if it comes back.
8.  [S1] Every existing deep link and saved state keeps working: the saved tab per study, `#import`, plugin `A.goto(...)` calls, and the `aria-current` styling.

**Done when:** on the chat and vignette studies, an editor lands on Edit study on a draft (tested); the chat row has at most 7 items for an owner (tested); and Ben can find where to edit a study without the guide (checked by hand before each merge).

## Non-Goals

*   Removing any tool or changing any role gate (viewer, editor, manager, owner).
*   Changing tab or section ids, the save format, or how versions are stored.
*   A setup checklist or wizard. It is a possible follow-up if researchers still get lost after Stage 2.
*   Changing any study-type plugin's behaviour. Plugins gain no new fields. The one plugin edit is text: `alert-triage-admin.js` names the old tab in a hint.
*   Changing the participant-facing pages, except for wording that names the old tab.

## Decisions (formerly open questions)

*   **Piloting with real people counts as live.** Classmates who consent through an access code during a pilot make the study live, because their data is real. Piloting with test participants does not.
*   **Viewers on a draft study land on Participants.** The status line tells them where the design is: "Draft: no real sign-ups yet. See Edit study for the design."

## Critical User Journeys (CUJs)

### CUJ 1 [S1]: A new researcher edits a fresh study

*   **Given**: a researcher with the editor role or higher opens a study that has no real sign-ups, in a new browser tab.
*   **When**: the admin page loads.
*   **Then**: the Edit study tab is selected and shows its first section. The status line reads "Draft: no real sign-ups yet". The Preview button is beside the Edit study tab.

### CUJ 2 [S1]: A researcher checks on a running study

*   **Given**: a researcher with any role opens a study with 12 real sign-ups.
*   **When**: the admin page loads.
*   **Then**: Participants is selected. The status line reads "Live: real participants have signed up" at first, then "Live: 12 real participants" once the participant list has loaded.

### CUJ 3 [S1]: Returning to the tab you were on

*   **Given**: a researcher clicked Students for a study, then reloaded the page in the same browser tab.
*   **When**: the page loads.
*   **Then**: Students is selected, whatever the landing rule would say. A tab the page picked by itself is not remembered (see Landing rule).

### CUJ 4 [S1]: Importing a survey (`#import`)

*   **Given**: a researcher creates a vignette study from a Qualtrics file, and the creator page sends them to the admin page with `#import`.
*   **When**: the page loads.
*   **Then**: Edit study opens on the Import section, before the saved tab or the landing rule is considered.

### CUJ 5 [S1]: An owner pilots and cleans up

*   **Given**: an owner wants to run the live self-test and then delete the test participants.
*   **When**: they open Participants.
*   **Then**: a collapsed "Testing tools" box holds both. It is closed by default and visible only to owners, as both tools are today.

### CUJ 6 [S1]: Someone registered but never consented

*   **Given**: a real person entered an access code (which locks the structure) but never consented, and no one else has signed up.
*   **When**: an editor opens the admin page.
*   **Then**: Edit study opens. The status line reads "Draft: no one has consented yet. The design is locked because a real person registered." The editor shows its existing lock notice.

### CUJ 7 [S2]: Finding a sharing or backup tool

*   **Given**: a researcher wants the reproducibility bundle, or an owner wants a backup.
*   **When**: they open More, then Backups & sharing.
*   **Then**: any role sees the study design file and the reproducibility bundle there; owners also see backups. The More button shows as current while the page is open.

### CUJ 8 [S2]: Editing in participant order

*   **Given**: a researcher is in Edit study for a vignette study.
*   **When**: they look at the side list.
*   **Then**: the sections appear under Before the task (Sign-up & consent, Start-of-session survey), The study (the vignette sections and Import), After the task (End-of-session survey), Throughout (Screen text) and Delivery (Devices & timing, Block order). Below 760px wide, the list becomes a wrapping row of buttons above the editor.

## Technical Plan (Architecture)

### What changes, in one picture

```text
 page load (admin.js start)
   │
   ├─ GET me ───────────────► router.mjs 'me' (study route)
   │                            + live = hasRealSignup(S): stops at the first
   │                              record where isRealSignup(p, doneCodes)
   │                            + locked: same check the content route uses
   │◄── { role, study, ..., live, locked } ─┘
   │
   ├─ draw status line from `live` (strings in the table below)
   ├─ build top bar from ONE label table (TABS + plugin tabs, filtered by role)
   │
   ├─ pick the first tab (not saved):
   │    1. #import in the URL          → content / section 'import'
   │    2. tab saved this browser session (lab_admin_tab_<id>), if still allowed
   │          ([S2] report|figures|analyze → Results on that view)
   │    3. can('editor') and live === false → content ("Edit study")
   │    4. otherwise                    → participants
   │
   └─ when the participant list loads (Participants tab): status line gains N,
      counted with the same isRealSignup rule
```

### Server: one new field on `me`

Only the study route's `me` (`netlify/lib/lab/router.mjs`) changes; the account route of the same name, used by My studies, does not. It gains `live`, a boolean, and `locked`, true when the study type has a structure and the structure lock is set (the same one-key check the `content` route already makes), so the status line can tell a locked draft apart before the editor loads.

There are three definitions of "real" in the code today:

| Where | Rule |
|---|---|
| Structure lock (`engine.mjs` `lockStructure`, `content.mjs` `hasRealParticipant`) | any participant record that is not a test |
| Editor's started count (`admin.js`, `A.started`) | not a test, and consented or finished a session |
| Participants table filter | not a test |

`live` uses the started-count rule through one new predicate, `isRealSignup(p, doneCodes)`, which matches how the participant list derives `completedSessions` (a `done/<code>/` key, or a non-empty `completed` array on records in the older single-record format): a person who was given an access code but never consented has not taken part. The lock is broader on purpose: it protects assignment from the first record, so it is set when any real record is created (`enroll`), before consent. A study can therefore be a draft with a locked structure (CUJ 6); the status line says so instead of implying the design is editable.

**Cost.** `hasRealSignup` lists `done/` codes, then scans participant records in batches of 40 and stops at the first real sign-up, the same pattern as `hasRealParticipant`. A live study usually stops in the first batch. The worst case is a draft whose real records all lack consent, where it reads every record once; that is rare and bounded by the participant count. The exact N is not computed in `me`: a live study lands on Participants, which already loads the full list, and the status line takes N from that load. If `me` fails or `live` is missing, the page lands on Participants and hides the status line, which is how it behaves today.

### Status line strings

| State | Text |
|---|---|
| `live === false`, structure not locked | Draft: no real sign-ups yet |
| `live === false`, structure locked | Draft: no one has consented yet. The design is locked because a real person registered. |
| `live === false`, not locked, role below editor | Draft: no real sign-ups yet. See Edit study for the design. |
| `live === false`, locked, role below editor | Draft: no one has consented yet. The design is locked because a real person registered. See Edit study for the design. |
| `live === true`, list not loaded, or loaded with N = 0 | Live: real participants have signed up |
| `live === true`, list loaded, N = 1 | Live: 1 real participant |
| `live === true`, list loaded, N ≥ 2 | Live: N real participants |
| `live` missing | hidden |

### Landing rule

The order is in the picture. The tab the page picks by itself is shown without being saved; only a click writes `lab_admin_tab_<id>`. Otherwise an automatic landing on Edit study would be remembered as the user's choice and outlive the study going live.

### Client: one label table, ids unchanged

All tab and section ids stay the same. Only labels, order and grouping change. That keeps working, with no migration:
*   the saved tab in sessionStorage (`lab_admin_tab_<studyId>`),
*   `#import`,
*   plugin calls such as `A.goto('items')` and `A.goto('pre')`,
*   `aria-current="true"`, which `admin.css` and `vignettes-admin.js` select on,
*   the tests that click `data-tab="content"`.

A new constant `LABELS` in `admin.js` holds every user-facing tab and section name ("Edit study", "Participants", "Results", "Testing tools", "More", group headings), so the code's labels live in one place. The text-check test catches the old name in docs and messages.

| id | Old label | Stage 1 label | Stage 2 place | Role |
|---|---|---|---|---|
| `content` | Study content | Edit study (first, main style) | row, first | viewer |
| `participants` | Participants | Participants | row | viewer |
| `report` | Pilot report | Pilot report | Results (button carries this id) | viewer |
| `figures` | Figures | Figures | Results view | viewer |
| `analyze` | Analyze | Analyze | Results view | viewer |
| `students` | Students | Students | row | manager |
| plugin tabs | (as defined) | (as defined) | row, after Students | (as defined) |
| `integrity` | Integrity | Integrity | More → Data quality | manager |
| `team` | Team | Team | More → Team | owner |
| `privacy` | Encryption | Encryption | More → Encryption | viewer |
| `activity` | Activity | Activity | More → Activity | owner |
| `sharing` | (new) | (none) | More → Backups & sharing | viewer; Backups block owner |

Editor section groups [S2]: `consent`, `pre` → Before the task; every study-type section → The study; `post` → After the task; `text` → Throughout; `environment`, `order` → Delivery.

### Stage 1 (first PR)

1.  **Order and label.** Edit study moves first and gets the main style; the existing Preview bar moves onto the same line, beside the tab row but outside it (tab handlers treat every button in the row as a tab), for editors or higher.
2.  **Status line.** A line under the title, filled from `live` as in the table. Hidden when the field is missing.
3.  **Landing rule.** As above; the automatic choice is not saved.
4.  **Testing tools.** The Live self-test block, which already contains Delete test participants and is already owner-only, moves inside a collapsed `<details>` titled "Testing tools". No gate changes. Backups stay where they are until Stage 2.
5.  **Words.** "Study content" changes to "Edit study" wherever it names the tab. The lowercase noun "study content" stays: it is used generically in code comments and in every exported file (codebook, bundle README, design file), so exports do not change. The file list is in Detailed Implementation, items 3, 5, 6 and 7. A test scans for the capitalized old name.

### Stage 2 (second PR)

1.  **Results.** One top tab, "Results", with a small view switch: Pilot report, Figures, Analyze. Each view has a one-line purpose and a line "To download the data, go to Participants → Download". The three ids keep their own loaders; the Results button carries `data-tab="report"` and the switch calls `showTab('figures')` and so on, so `showTab` and the saved-tab key keep working. The Results button shows as current for any of the three ids, so a test that reads the current tab from `data-tab` sees `report` while Figures or Analyze is shown. Results opens on the saved view, else Pilot report.
2.  **More menu.** The last item in the row is `<details class="pt-menu more-menu"><summary>More</summary>` holding Data quality (integrity), Team, Encryption, Activity and Backups & sharing, each filtered by role as today. Team, Encryption and Activity are owner or occasional tools; the everyday tabs stay in the row. The page's existing `pt-menu` handler, which already closes any open `pt-menu` on Escape or click-away and returns focus to its summary, covers it. The summary gets `aria-current="true"` when one of its pages is open. When a role sees none of the items, the menu is not drawn.
3.  **Backups & sharing.** A new section `id="sharing"` (viewer) holding the Backups block from Participants, which keeps its owner gate, and the Study design file and Reproducibility bundle blocks from Edit study, which keep theirs (none). The markup and loaders move as they are; Versions stays in Edit study, beside the save bar, because Restore reads unsaved edits.
4.  **Grouped side list.** The section list keeps its array order; groups change only how it is drawn. Core sections get fixed groups (table above); every study-type section goes under "The study". The side list draws group headings and keeps `#subtabs button[data-sub]` and `aria-current`. The default section stays the first in the list, which is the study type's first section (Builder for builder studies). Below 760px the list is a wrapping row with small group labels.

### Accessibility

What the tests assert: the tab row keeps its label "Study admin sections" [S1]; the side list's label becomes "Edit study sections" [S1]; the More summary and the Results button carry `aria-current` when one of their pages is shown [S2]; Escape closes More and returns focus to its summary [S2]. The More menu is a `<details>` with a real `<summary>`, so it opens from the keyboard.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The `live` scan slows `me` on large studies | Early exit at the first real sign-up; N comes from the Participants load, not `me`. A unit test checks that the scan stops early. |
| `me` fails because of the new scan | The scan is wrapped: on error it is logged and `live` is omitted, so the page loads as it does today. |
| A plugin or test depends on tab order or labels | Ids are unchanged; the a11y and builder UI tests run in both stages; plugins call `A.goto(id)`, never a position. |
| Returning researchers look for tabs where they were | The status line explains the landing; the saved tab still wins; More is labelled and current when open. |
| Stage 2 conflicts with Stage 1 after the squash merge | Rebase Stage 2 with `--onto` (see Detailed plan) before retargeting its PR. |
| Status line says Draft while the structure is locked | Its own text (table above) and CUJ 6. |

## Alternatives Considered

### Alternative A: Rename and reorder only

Rename "Study content" to "Edit study", move it first, collapse the testing tools, and stop there.

*   **Pros**: Touches no layout code beyond the tab order. Fixes the problem Ben reported (cannot find where to edit).
*   **Cons**: The chat study still shows 12 tabs, the editor sections stay out of participant order, and rare tools still lengthen the Participants and Edit study pages.
*   **Disposition**: Folded into Stage 1. Stage 1 is this alternative plus the status line, the landing rule and the server field behind them, which Ben chose so a draft study opens on the editor. The zoom-out reviewer recommended shipping a small first stage and building Stage 2 only if researchers still get lost. Ben chose to build both, and the stage split keeps the option to drop Stage 2.

### Alternative B: Always open on Edit study

Every user lands on Edit study, whatever the study's state.

*   **Pros**: Predictable. No server change.
*   **Cons**: A researcher checking a running study (the most common visit once data collection starts) has to click Participants every time, and viewers who cannot edit land on a read-only editor.
*   **Reason for Rejection**: Ben chose the draft/live rule. The status line answers its main risk (a landing tab that changes without a visible reason).

### Alternative C: Compute the state in the browser

Fetch `participants` at start-up, as the Participants tab already does, and decide draft or live in the page instead of adding a field to `me`.

*   **Pros**: No server change, so Stage 1 would be front-end only.
*   **Cons**: `participants` computes progress for every person, the slowest call on the page (`router.mjs` keeps it out of the per-load summary for that reason), and the landing tab would wait for it. Viewers who never open Participants would pay for it on every load.
*   **Reason for Rejection**: Slower first paint. The server check stops early and needs no progress computation.

### Alternative D: A setup checklist above the tabs

A strip such as Sign-up → Surveys → Task → Preview → Launch, each linking into an existing section, shown while the study is a draft.

*   **Pros**: Teaches the order without moving anything.
*   **Cons**: Adds a second navigation system on top of the tabs and must be kept in step with each study type's sections.
*   **Disposition**: Deferred. It is a follow-up if Stage 2 does not solve the problem.

### Alternative E: A Build / Run switch

Two modes, each with its own tab set.

*   **Pros**: Very short tab rows.
*   **Cons**: Adds a mode the researcher must notice and manage. Piloting needs tools from both modes at once (edit, preview, delete test participants).
*   **Reason for Rejection**: The extra mode costs more than the tabs it hides.

### Alternative F: Plugins declare the whole grouping

Each study type lists its sections with their groups, including the shared surveys.

*   **Pros**: Each type can place every section where it fits best.
*   **Cons**: The shared sections (consent, surveys, screen text) would sit in different places per type, so a researcher who learns one type relearns the next. Seven plugins would need edits.
*   **Reason for Rejection**: Core owns the frame; plugins need no edits.

### Alternative G: A stored live marker or counter

Write a marker (or increment a counter) when a real participant consents or finishes a session, and read it in `me`.

*   **Pros**: Constant cost per page load.
*   **Cons**: A second write path on consent, on session completion, on deleting participants and on making a test participant real; any missed path makes the marker wrong with no way to notice.
*   **Reason for Rejection**: The early-exit scan reads the source of truth and is cheap enough.

### Alternative H: Sub-tabs or a second row instead of More (Stage 2)

Keep every tab visible, either as a second row or as sub-tabs under a few group tabs.

*   **Pros**: Nothing is behind a menu.
*   **Cons**: A second row keeps the full width of tabs the problem complains about; group tabs add a click to everyday tools too.
*   **Reason for Rejection**: More hides only the occasional tools and leaves the everyday ones one click away.

### Alternative I: Reuse the structure lock's rule for `live`

Call the existing `hasRealParticipant` (any record that is not a test) instead of adding `isRealSignup`.

*   **Pros**: No new predicate or scan; the status line and the lock always agree.
*   **Cons**: A study where one real person entered an access code but never consented would read as live and open on an empty Participants tab for the researcher still building it. It would also disagree with the editor's started count, which already requires consent or a finished session.
*   **Reason for Rejection**: Ben chose the consent-based rule (review item E1, option b); the locked-draft status text (CUJ 6) covers the one case where the two rules differ.

## Non-Functional Requirements

*   **Security & Privacy**: `live` is a boolean, returned only to signed-in team members of that study (the same check every admin route already runs). The scan reads only the plaintext `test` and `consentedAt` fields and the `done/` keys; it decrypts nothing. No role gate changes.
*   **Performance**: one early-exit scan in `me` (see Cost). No change to any other call.
*   **Rollout & Rollback**: two PRs, each one squash commit, published in the next scheduled build (06:00 or 17:00 ET). Revert a commit to roll it back; if both have shipped, revert Stage 2 first. No stored data changes shape: the saved tab key and every id are the same, and `live` is an extra field older pages ignore.

## Future Improvements

*   **Setup checklist** (Alternative D) if researchers still get lost after Stage 2.
*   **One "real participant" rule in the Participants filter.** The filter still means "not a test". It could offer "real (consented)" to match the status line.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

All paths are relative to the repo root. Stage 1 line numbers are as of commit `ca19a10` on `lab/console-ia`. Stage 2 runs after Stage 1 has moved code around, so Stage 2 items name functions, selectors and markup instead of line numbers.

Terms used below: **tab** is a button in the top row (`#tabs button[data-tab]`) and **panel** is the `<section data-tab>` it shows; **section** is a button in the Edit study side list (`#subtabs button[data-sub]`); **editor pane** is the form area next to the side list (the word "editor" alone means the role). The old tab name to replace is the capitalized phrase `Study content`; the lowercase phrase "study content", used as an ordinary noun, stays.

**Branches and worktrees**

*   Stage 1: worktree `/private/tmp/bw-console-ia`, branch `lab/console-ia`.
*   Stage 2: worktree `/private/tmp/bw-console-ia-2`, branch `lab/console-ia-2`, created from `lab/console-ia` once Stage 1's PR is open.
*   After Stage 1 is squash-merged: `git fetch`, then `git rebase --onto origin/main lab/console-ia lab/console-ia-2`, push with `git push --force-with-lease`, then retarget the Stage 2 PR to `main`. `lab/console-ia` itself is never rewritten.
*   Commit messages never contain `[deploy now]`; the site publishes in the next scheduled build.

### Stage 1: target files

#### 1. `netlify/lib/lab/engine.mjs` (Modify)

*   **Scope**: server library.
*   **Changes**:
    *   Add the predicate, with a comment that names it as the started-count rule and says how it differs from the structure lock (any non-test record) and the Participants filter (not a test):
        ```js
        export const isRealSignup = (p, doneCodes) => !!p && !p.test &&
          (!!p.consentedAt || doneCodes.has(p.code) || (Array.isArray(p.completed) && p.completed.length > 0));
        ```
        The third term covers records in the older single-record format, which `progressOf` (line 126) reads the same way.
    *   Add `export async function hasRealSignup(S)`:
        1.  List `done/` and build a `Set` of codes from the second path segment (keys are `done/<code>/s<n>-<time>`).
        2.  List `participants/` and read records with `getMany` (`store.mjs`) in batches of 40.
        3.  Return `true` at the first record that passes `isRealSignup`; return `false` after the last batch.
        Modeled on `hasRealParticipant` (`content.mjs:413`). No progress computation.

#### 2. `netlify/lib/lab/router.mjs` (Modify)

*   **Scope**: admin API, study route only.
*   **Changes**: in the `me` case (line 145), add two fields:
    *   `locked`: `!!(type.structureOf && await S.store.get('lock/structure'))`, the same check as the `content` case (line 176).
    *   `live`: `await E.hasRealSignup(S)` inside `try/catch`. On error, `console.error` and leave `live` out, so `me` still succeeds.
    The account route's `me` (line 364) is unchanged.

#### 3. `static/lab/engine/admin.js` (Modify)

*   **Scope**: admin page.
*   **Changes**:
    1.  **Labels.** Add `var LABELS` near `TABS` (line 185) with one entry per tab id (`content: 'Edit study'`, `participants`, `report`, `figures`, `analyze`, `integrity`, `students`, `team`, `privacy`, `activity`) plus `testing: 'Testing tools'` (a block title, not a tab) and `state: { … }` holding the status-line strings. Stage 2 adds `results: 'Results'`, `more: 'More'`, `sharing: 'Backups & sharing'`, `groups: { before, study, after, throughout, delivery }`, and changes `integrity` to `'Data quality'` and `privacy` to `'Encryption'`. `TABS` reads its labels from `LABELS`, with `content` moved to the front.
    2.  **Main tab.** Where the tab buttons are built (line 235), give the `content` button the class `tab-main`.
    3.  **Preview beside the tabs.** In the markup (line 96), wrap `#tabs` in `<div class="tabrow">`. In `start()`, after `#tabs` is filled (line 235), move the preview bar node (markup at line 98; shown at lines 239–242) into `.tabrow` after `#tabs`, not inside it. Tab handlers keep selecting `#tabs button[data-tab]`. The bar is a card today (title, description, Arm select, Preview button, `#pvout`). Inline in `.tabrow` keep only the Arm select and the Preview button, labelled "Preview as participant"; the old description becomes the button's `title`; drop the card title; `#pvout` moves to just below `.tabrow`.
    4.  **Status line.** In the markup, add `<p id="studystate" class="muted" hidden></p>` right after `<h1 class="h-flush" id="title">` in the template at line 96. In `start()`, after `me` returns, call a new `drawState(me)`:
        *   `typeof me.live !== 'boolean'` → leave it hidden.
        *   Otherwise pick the row of the Status line strings table that matches `me.live`, `me.locked` and `can('editor')`, and use its text exactly. Keep the strings in `LABELS.state`.
    5.  **Count on list load.** In `load()` (line 335), after `rows` arrive, if `me.live === true` and N ≥ 1, set the status line to the matching "list loaded" row of the strings table, where N counts rows with `!p.test && (p.consented || p.completedSessions > 0)`. If N is 0 (for example, the list failed to load), leave the text as it is.
    6.  **Started count.** At `A.started` (line 630), add a comment that it applies `isRealSignup`'s rule to the list output.
    7.  **Saving the tab.** `showTab(name, opts)` (line 187) writes `tabKey` (line 192) only when `!(opts && opts.remember === false)`. Every click handler keeps calling `showTab(id)`.
    8.  **Landing rule.** Replace the first-tab choice in `start()` (lines 245–247) with this order:
        1.  `#import` in the URL, `can('editor')`, and the plugin has an `import` section (the guard at line 246 today) → set the side-list section to `import`, then `showTab('content', { remember: false })`. If either guard fails, fall through to step 2.
        2.  A tab saved in sessionStorage that the user's role can see → `showTab(saved, { remember: false })`.
        3.  `can('editor') && me.live === false` → `showTab('content', { remember: false })`.
        4.  Otherwise → `showTab('participants', { remember: false })`.
    9.  **Testing tools.** In the Participants panel markup (lines 130–132), wrap the owner-only Live self-test block, which contains the Delete all test participants button, in `<details class="testing-tools" data-role="owner"><summary>Testing tools</summary>…</details>`. Ids inside stay the same, so the handlers from line 433 on are unchanged. Check that the delete button's enable/disable logic still runs while the box is closed.
    10. **Old name.** Replace `Study content` with `Edit study` at lines 139, 149 (the side list's `aria-label` becomes "Edit study sections"), 549, 1172, 1180, 1184, 1370 and 1408. Lines 1172–1408 are on the My studies page and its "study is ready" cards.

#### 4. `static/lab/engine/admin.css` (Modify)

*   **Scope**: styles.
*   **Changes**:
    *   `.tabrow`: flex row, wraps, gap equal to the tab gap.
    *   `.tab-main`: `font-weight: 600` and a 2px accent bottom border, same height as other tabs.
    *   The preview bar inside `.tabrow`: inline, its button at the small button size.
    *   `#studystate`: one line, muted, margin matching the title.
    *   `.testing-tools > summary`: styled like an `h2` section heading with the default disclosure marker. Keep the spacing the self-test block had as a `.section`.

#### 5. `static/lab/engine/participant.js`, `static/lab/engine/envcheck.js`, `static/lab/engine/types/alert-triage-admin.js` (Modify)

*   **Scope**: text that names the tab; no behaviour change.
*   **Changes**: `participant.js:667` and `envcheck.js:2` (comments): "Study content → Devices & timing" becomes "Edit study → Devices & timing". `alert-triage-admin.js:168` (a hint shown to researchers): "Study content → Alerts" becomes "Edit study → Alerts".

#### 6. `netlify/lib/lab/selftest.mjs`, `netlify/lib/lab/game/selftest.mjs`, `netlify/lib/lab/import/qsf.mjs` (Modify)

*   **Scope**: server messages shown on the admin page.
*   **Changes**:
    *   `selftest.mjs:63` and `game/selftest.mjs:54`: "Study content changed during the self-test; run it again" becomes "The study changed during the self-test; run it again".
    *   `qsf.mjs:91`: the import note's `Study content` becomes `Edit study`.
    *   Update any test that matches these messages exactly.

#### 7. `static/lab/guide/index.html` and `static/lab/README.md` (Modify)

*   **Scope**: documentation.
*   **Changes**:
    *   Replace every case-sensitive `Study content` with `Edit study`. At `ca19a10` these are guide lines 85, 93, 99, 121, 131, 145, 168, 178, 185, 225 and README lines 68, 77, 83, 87, 134, 197, 287, 313, 334. Run `grep -n "Study content"` on both files at build time to catch any line that moved.
    *   Where the guide describes the self-test or deleting test participants (lines 87, 151, 208, 209, 247), say they are under Participants → Testing tools.
    *   Add one sentence where the guide describes the admin page: which tab it opens on and what the status line means.

#### 8. `tests/lab/admin-tabs-a11y.test.mjs` (Modify)

*   **Scope**: UI test. It runs the real `admin.js` in jsdom against a real `labServer` on `memBlobs`; there are no stubs.
*   **Setup**:
    *   A helper `openAdmin({ role, hash, savedTab })` builds a fresh JSDOM for the study page, the same way lines 33–55 do now. Each JSDOM has its own sessionStorage, so the helper always writes `lab_admin_key` (line 36) with the key for `role`, and, when `savedTab` is given, writes it under the page's `tabKey` (`lab_admin_tab_<study id>`). It resolves once `#tabs` has a current button. To read the tab a page saved, the test reads `tabKey` from that page's sessionStorage before opening the next one.
    *   Keys: the owner uses `LAB_ADMIN_KEY`. For the viewer, add a team member with role `viewer` through the same admin route the Team tab uses, and use the key it returns.
    *   Live study: enrol one real participant through the engine's `enroll` (as the participant route does), then write `consentedAt` on that record. Enrolling a real participant also writes `lock/structure` (`lockStructure`, `engine.mjs:498`, called at line 516).
    *   Locked draft: a builder study (from the `multimodal-builder` template) with one real participant enrolled through `enroll` and no `consentedAt`.
    *   Line 61 ("Participants is current at first") is replaced by case (b).
    *   Line 73 expects the side list's label "Edit study sections".
*   **Cases** (each status text is quoted from the Status line strings table):
    *   (a1) Owner, draft study: `content` is current.
    *   (a2) Owner, draft study: the status line reads "Draft: no real sign-ups yet".
    *   (b1) Owner, live study: `participants` is current.
    *   (b2) Owner, live study, after the list loads: the status line reads "Live: 1 real participant".
    *   (c1) Viewer, draft study: `participants` is current.
    *   (c2) Viewer, draft study: the `content` tab is visible.
    *   (c3) Viewer, draft study: the status line reads "Draft: no real sign-ups yet. See Edit study for the design."
    *   (d1) Owner, draft study, `me` reply with `live` removed (wrap `window.fetch` for this case only): `participants` is current.
    *   (d2) Same setup: the status line is hidden.
    *   (e) Owner, draft study, `savedTab: 'students'`: `students` is current.
    *   (f1) Owner, draft study, `hash: '#import'`, `savedTab: 'students'`: `content` is current.
    *   (f2) Same setup: the current side-list section is `import`.
    *   (g) Owner, draft study, opened once (lands on `content`): the page's `tabKey` entry is empty, because the automatic landing is not saved.
    *   (h) Owner, locked builder draft: the status line reads "Draft: no one has consented yet. The design is locked because a real person registered."
    *   Keep the existing checks: click every tab, exactly one current button per group, and focus moves to the rebuilt current section. The first button in `#tabs` is `content`.

#### 9. `tests/lab/builder-ui.test.mjs` (Modify)

*   **Scope**: UI test.
*   **Changes**: update the comment at line 31 to "Edit study". The `data-tab="content"` clicks stay. Builder is still the first and current section.

#### 10. `tests/lab/real-signups.test.mjs` (Create)

*   **Scope**: server unit test on `memStore`, with `S = { store, type }` built as the other engine tests build it.
*   **Fixtures** (expected `isRealSignup` result in brackets):
    *   T: a test participant with `consentedAt` [false].
    *   R0: a real participant with only a record [false].
    *   RC: a real participant with `consentedAt` [true].
    *   RD: a real participant with a `done/<code>/s1-<time>` key and no `consentedAt` [true].
    *   RL: a real participant in the older format, with `completed: [{ session: 1, completedAt }]` [true].
*   **Cases**:
    *   `hasRealSignup` is `false` with only T and R0, and `true` once RC is added.
    *   For each fixture, `isRealSignup` agrees with the page's rule applied to that participant's `listParticipants` row.
    *   Fixtures are written straight into the store, so they do not lock anything. For the `locked` case, enrol RC through `enroll` on a builder study (which writes `lock/structure`), then write `consentedAt`: the router's `me` returns `live: true` and `locked: true`.
    *   A builder study with only T and R0 written straight into the store: `me` returns `locked: false`.
    *   With a store whose `list('participants/')` throws, `me` still returns 200 with no `live` field.
    *   With 200 consented real participants, `hasRealSignup` makes at most 40 `store.get` calls (count them on a wrapped `memStore`).
*   The runner (`tests/lab/run.mjs`) picks up any `*.test.mjs` file by itself.

#### 11. `tests/lab/no-old-labels.test.mjs` (Create)

*   **Scope**: text check.
*   **Changes**: read every file under `static/lab` (`.js`, `.html`, `.md`, `.css`) and `netlify/lib/lab` (`.mjs`), but not `docs/designs/`. Fail on the case-sensitive phrase `Study content` and print each file and line, except lines that carry the marker `former name: Study content`. The lowercase noun is allowed.
*   Before committing, check that the test can fail: put the phrase back in one file, confirm the test fails, then restore the file.

### Stage 2: target files

#### 12. `static/lab/engine/admin.js` (Modify)

*   **Scope**: admin page.
*   **Changes**:
    1.  **Placement map.** Add `var PLACE = { report: 'results', figures: 'results', analyze: 'results', integrity: 'more', team: 'more', privacy: 'more', activity: 'more', sharing: 'more' }`. Any tab id not in `PLACE`, including plugin tabs, is a row tab. Add the Stage 2 `LABELS` entries listed in item 3.1.
    2.  **Results tab.** The tab row draws one button `data-tab="report"` labelled `LABELS.results` in place of the three Results tabs. One shared bar `<div id="resultsbar">` sits above the panels, outside every `<section data-tab>` (because `mountTool` rewrites the `figures` and `analyze` panels' `innerHTML`). It is shown when the current tab's `PLACE` is `results` and holds:
        *   a view switch of three buttons (`aria-pressed`) that call `showTab('report' | 'figures' | 'analyze')`;
        *   a one-line purpose for the current view;
        *   "To download the data, go to Participants → Download", with a button that calls `showTab('participants')`.
    3.  **Marking the current tab.** Add `markCurrent(id)`, called at the end of `showTab`. It clears `aria-current` in `#tabs`, then sets it on:
        *   the Results button when `PLACE[id]` is `results`;
        *   the More `<summary>` when `PLACE[id]` is `more`;
        *   otherwise, the row button whose `data-tab` is `id`.
        `showTab`'s saving and panel visibility are unchanged.
    4.  **More menu.** More is the last child of `#tabs`: `<details class="pt-menu more-menu"><summary>More</summary><div class="pt-pop" role="group" aria-label="More sections">`. Its items are `button[data-tab]` inside `.pt-pop`, one per id with `PLACE` `more`, in the order `integrity` ("Data quality"), `team`, `privacy` ("Encryption"), `activity`, `sharing`, each filtered by `can()` as its tab was. Clicking an item calls `showTab(id)`; the existing document-wide `pt-menu` handler (`admin.js:386-393`) already closes the menu on an item click, on Escape (returning focus to the summary) and on a click elsewhere, so More adds no close code. The tab-row click handler and the "one current button" logic skip buttons inside `.pt-pop`; `markCurrent` handles them.
    5.  **Backups & sharing panel.**
        *   Add a `TABS` entry `['sharing', LABELS.sharing, 'viewer']` and a `<section data-tab="sharing">` panel.
        *   Move the Backups block from the Participants panel into it, keeping `data-role="owner"`.
        *   Move the Study design file and Reproducibility bundle blocks from the Edit study panel into it, with no `data-role`.
        *   Move the `loadBackup()` call from `showTab`'s `participants` branch to a new `sharing` branch, still guarded by `can('owner')`.
        *   The design-file and bundle blocks load nothing on show; their click handlers stay bound by id.
        *   Versions stays in Edit study.
    6.  **Grouped side list.** `subs()` keeps returning `[id, label]`.
        *   A map `GROUP = { consent: 'before', pre: 'before', post: 'after', text: 'throughout', environment: 'delivery', order: 'delivery' }` places the core sections; every other id goes in `study`.
        *   Draw the groups in the order before, study, after, throughout, delivery, each under a heading from `LABELS.groups`: "Before the task", "The study", "After the task", "Throughout", "Delivery".
        *   Within "Before the task", `consent` comes before `pre`. Within every other group, keep `subs()` order.
        *   Buttons keep `data-sub` and `aria-current`.
        *   The default section is the first button drawn, which is `subs()[0][0]` unless that id is in `before`; on builder studies it stays `builder`.
    7.  **Editor layout markup.** In the Edit study panel, wrap `#subtabs` and the editor pane in `<div class="editgrid">`: `#subtabs` is the first child (a `<nav>` holding a group heading `<h3>` and its buttons per group), and the editor pane is the second child.

#### 13. `static/lab/engine/admin.css` (Modify)

*   **Scope**: styles.
*   **Changes**:
    *   `#tabs .more-menu` sits at the right end of `#tabs` (`#tabs` is a flex row; `.more-menu { margin-left: auto }`).
    *   `#tabs .pt-pop button` resets the row-tab styles, at higher specificity than `nav.tabs button`, so menu items look like menu rows.
    *   `.editgrid`: `display: grid; grid-template-columns: 220px 1fr; gap` equal to the section gap.
    *   `.editgrid #subtabs`: a vertical list. Buttons are full width and left-aligned, the pill borders are removed, and the current one gets the accent left border.
    *   Under `@media (max-width: 760px)`, `.editgrid` is one column and `#subtabs` is a wrapping row above the editor pane, with group headings in small caps.
    *   `#resultsbar`'s view switch is styled as a segmented control.
    *   The selector `#subtabs button[aria-current="true"]` must keep matching, because `static/lab/engine/types/vignettes-admin.js:92` depends on it.

#### 14. `static/lab/guide/index.html` and `static/lab/README.md` (Modify)

*   **Scope**: documentation.
*   **Changes**: find each place with `grep -n` at build time.
    *   Pilot report, Figures and Analyze as tab names become "Results → Pilot report" and so on (at `ca19a10`: README 13, 14, 311, 530; guide 216).
    *   Team, Encryption, Activity and Integrity as tab names become "More → Team" and so on, and Integrity becomes "More → Data quality" (README 273, 377, 395, 406, 418, 419, 425).
    *   The design file, the reproducibility bundle and backups as locations become "More → Backups & sharing" (README 68; guide 93, 225; these lines already say "Edit study" after item 7).

#### 15. `tests/lab/admin-tabs-a11y.test.mjs` (Modify)

*   **Scope**: UI test, using the `openAdmin` helper from item 8. To reach a More item, open the More `<details>`, then click the item.
*   **Existing loop**: the click loop at lines 65–69 now covers the row tabs only (`content`, `report`, `students`). A new loop covers `activity`: open More, click Activity, expect the More summary to carry `aria-current` and the `activity` panel to be shown.
*   **New cases**:
    *   The chat-study row for an owner is exactly: Edit study, Participants, Results, Students, Compare, Conversations, More.
    *   The chat-study row for a viewer is exactly: Edit study, Participants, Results, More.
    *   The More summary carries `aria-current` while Team is open.
    *   Clicking a More item closes the menu.
    *   Escape closes More.
    *   After Escape, focus is on the More summary.
    *   With `figures` shown, `current()` returns `['report']`.
    *   With `figures` shown, `#resultsbar` is visible and its Figures button has `aria-pressed="true"`.
    *   `savedTab: 'analyze'` opens with the `analyze` panel shown.
    *   A viewer sees the Backups & sharing panel's design-file block.
    *   A viewer does not see its Backups block.
    *   On the vignette study, the side-list group headings appear in the order before, study, after, throughout, delivery.
    *   On the vignette study, the first section drawn is current.
    *   On any study, Sign-up & consent is drawn before the pre-survey.

#### 16. `tests/lab/builder-ui.test.mjs` (Modify)

*   **Scope**: UI test.
*   **Changes**: Builder is still the first and current section, now under "The study". On a study made from a form template (one without `content.builder`), its first own section is current.

### Verification Plan

*   **Tests**: if `node_modules` is missing, run `npm ci` once. Then run `npm run test:lab` twice; both runs must be green with the same list of PASS files. Record that list before Stage 1 and after each stage. Files may be added, never lost.
*   **Text check**: `grep -rn "Study content" static/lab netlify/lib/lab` (case-sensitive) returns only lines marked `former name: Study content`.
*   **Browser check**: run `npm run lab:dev` and use the browser pane, at desktop width and at 375px.
    *   Setup:
        1.  Create a fresh study (a draft).
        2.  Run the self-test with "Keep the test participants" (still a draft).
        3.  Consent once on the participant page with an access code (now live).
    *   Checks, Stage 1:
        *   As editor, the draft opens on Edit study with "Draft: no real sign-ups yet".
        *   The live study opens on Participants with "Live: real participants have signed up", then "Live: 1 real participant".
        *   A reload keeps a clicked tab.
        *   `#import` opens the Import section.
        *   As owner, Testing tools is closed and opens. Nothing destructive is run.
        *   No console errors.
    *   Checks, Stage 2:
        *   The chat study's row has at most 7 items.
        *   More opens, and closes with Escape.
        *   Backups & sharing loads.
        *   The vignette side list shows the five groups in order.
*   **Screenshots**: one per check, at half scale, for the PR body.

--------------------------------------------------------------------------------

*Drafted with EGM*
