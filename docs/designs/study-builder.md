# Study builder: drag-and-drop arms for multimodal studies

*   **Author:** Ben Ampel
*   **Status:** Design approved by Ben on 2026-11-24, section by section; revised after the EGM review on
    2026-11-25 (`study-builder-review/goldfish_review_report.md`); Ben settled the four review decisions (D1–D4)
    the same day. Nothing is built.
*   **Date:** 2026-11-24
*   **Code read:** `main` at `036c255`
*   **Inputs:** `study-builder/concepts_brief.md`, `study-builder/hypothesis.md`, `study-builder/prototype-v5.html`, `study-builder/sims/`

--------------------------------------------------------------------------------

## Overview

The CCAIR Behavioral Lab (`netlify/lib/lab`, `static/lab`) runs online studies. A study with treatment and control
arms is built today by filling in forms per condition and per item, in an editor that differs for each study type.
This design adds a single canvas for new `multimodal` studies. A question palette sits on the left. The researcher
drags questions onto lanes (one lane per session), adds an "Assign to arms" step, edits what differs per arm in place,
and everything below the arms is a shared section that every participant takes.

The canvas is a constrained editor over the content shape the engine already runs. It cannot draw a design the
engine cannot run. Arms are equal, and each participant gets the next arm from a permuted-block list, which
`multimodal` already supports. Only studies built on the canvas change: they get their arm when the assigning
session starts (session 1 unless the researcher moves the split later),
and the server, not the UI, freezes their structure once the first real participant signs up.

### Terms

*   **Arm**: one entry in `design.conditions`. This doc says "arm"; the engine says "condition".
*   **Block** (task): a group of task items in `design.sessions[n].blocks`. **Assignment block**: a run of slots in
    the block list. The two are unrelated.
*   **Item** and **item kind**: one task step (text, media, call) and its type.
*   **Study type**: the engine module a study runs on (`multimodal`, `smishing`, ...).
*   **Variant**: a per-arm value of one item field, stored in `items[].variants[arm]`.
*   **`conditions`** on a survey question: the arms that see it. No `conditions` means everyone.
*   **Block list / `allocate`**: `allocate(S, p, c)` claims the next free slot `alloc-arm/NNNNNN` with `setNew`, so
    two people never get the same slot, and returns that slot's arm. Test participants use `alloc-arm-test/`.
*   **Real** and **test participant**: a real participant's record has `test: false`. When assigned, a real
    participant writes a `cond/` marker and a test participant writes `cond-test/`.
*   **Deferred assignment**: the arm is chosen when a session starts (`assignAtSession > 1`, or a type whose
    `deferAssignment` says so), not at sign-up. Builder studies always defer, at least to the start of session 1.
*   **Builder study**: a `multimodal` study whose content has the `builder` key. Only these open on the canvas,
    defer assignment and can be locked.
*   **Lock**: the stamp `lock/structure` in the study's store, written once when the first real participant signs
    up. While it exists, saves that change the study's structure are refused. Only an owner reset removes it.
*   **`contentKeys`**: the type's list of top-level content keys that `saveContent` keeps; others are dropped.
*   **Finishers**: people who finish every session.
*   **Guess rate**: how often someone who knows all past assignments guesses the next arm correctly.
*   **Wrong turn**: an action the user undoes, or a drop the canvas refuses.

## The Problem

Ben's request: make it "much simpler for people to build surveys and see the data", "truly drag and drop", easy to
make treatment and control branches and bring them back together for a final survey everyone takes.

Three things make that hard today:

1. **The editor is built around the data, not the design.** A researcher thinks "half get the warning video, half get
   the plain text, then everyone does the same quiz". The lab asks them to open each item, find its per-condition
   variants, and type the condition ids. There is no picture of the study as a whole.
2. **The people who build studies are new to the lab.** Any authorized user can build one. Most have never seen the
   content JSON, the condition markers, or the difference between a session and a block.
3. **Mistakes are silent and arrive late.** A forgotten variant, a missing arm, or an arm-specific item placed before
   assignment shows up only after participants have been assigned. Some of these are caught at save time
   (`multimodal.mjs` validation); others, such as changing the arms after people have enrolled, are not blocked at all.

A first prototype (`prototype-v5.html`) solved the picture problem but promised designs the engine cannot run:
arms that see different blocks, splits partway through a session, arms that end early, and nested splits. The
review in `concepts_brief.md` cut those from v1.

What this design does **not** solve: uneven dropout between arms. The round-two simulation (`sims/assign-sim2.js`)
shows every assignment rule missing the target among finishers by about 10 points when treatment arms lose more
people. That stays an analysis concern.

## Goals

*   A first-time authorized user builds "two arms, a shared final survey, two sessions" on the canvas with no help in
    10 minutes or less, with at most one wrong turn (see Terms). How this is tested is in the Verification Plan.
*   The study JSON that build compiles to equals the reference fixture, apart from the seed.
*   Every design the canvas accepts passes `multimodal` validation and runs in the engine with the changes listed in
    the Technical Plan. A drop
    the engine cannot run is refused on the spot with a one-line reason.
*   Arms are equal. Every builder study compiles to `design.randomization = { method: 'blocks', blockSize, seed }`.
*   Assignment is exactly equal at every full block, including when several people start session 1 at the same
    moment.
*   After the first real participant signs up, the server refuses any save or restore that changes the arms, the
    sessions, the task blocks and the items in each block, the arm-only survey questions, the block size and seed, and
    whether the study is a builder study.
    Wording, media and shared survey questions stay editable, and each such edit is logged with a date.
*   Studies not built on the canvas assign and save exactly as they do today.
*   Save, export, import and clone give back the same canvas (the canvas is rebuilt from the content and the
    `builder` key, checked by golden-file tests).

## Non-Goals

*   Arms that see different items or blocks, rather than different wording or media of the same item.
*   A split partway through a session.
*   Arms that end the study early.
*   Nested splits drawn as a tree.
*   Opening existing studies, or any custom study type (game, alert-triage, smishing, quiz, reaction, vignettes), in
    the new builder.
*   A Data view that computes its own numbers. v1 links to the Analyze tab and the existing participant list.
*   Unequal shares (for example 50/25/25). v1.1 adds an optional `design.randomization.ratio` to `allocationList`
    (see Alternative M).
*   Fixing session-1 block lists for studies not built on the canvas. They keep today's minimization, a known limit
    written up in the README.
*   Weighted minimization or any other change to `pickCondition`.
*   Balancing finishers rather than people assigned.

## Open Questions

*   **Four or more sessions**: do lanes stay readable at four or more sessions, where tabs would win on screen
    space? Test it during the novice test (phase 1).

## Critical User Journeys (CUJs)

### CUJ 1: Build a two-arm study with a shared final survey

*   **Given**: An authorized user is signed in to the lab admin and creates a new `multimodal` study. The canvas shows
    one empty session lane and the palette.
*   **When**: They drag an intro text and two questions into the lane, drag "Assign to arms" below them,
    name the arms "Warning video" and "Plain text", open the stimulus item and set different media for each arm, then
    drag a three-question quiz below the arms.
*   **Then**: The quiz sits in the shared "Everyone, after the arms" section without any connecting step. Save passes
    validation. The compiled content has two `design.conditions`, one item with two `variants`, and the quiz items
    with no variants. The participant preview shows each arm's path.

### CUJ 2: Edit a study after it has started

*   **Given**: A builder study with at least one real participant signed up.
*   **When**: The user tries to add an arm, change the block size, add a session, move a task item to another block,
    or restore an older version with different arms.
*   **Then**: The canvas shows the structure as read-only with "Clone to change the design". If the request reaches the
    server anyway, `saveContent` refuses it with a named error. Fixing a typo in an item's wording still saves, and
    the change is logged with its date for an IRB amendment.

### CUJ 3: Move a design between studies

*   **Given**: A study built on the canvas.
*   **When**: The user downloads the design file, then imports it into a new study (or clones the study).
*   **Then**: The new study opens on the canvas with the same lanes, arms, block size, items and per-arm variants. Test
    participants in the source study do not carry over or lock the copy.

### CUJ 4: A participant takes the study

*   **Given**: A builder study with two equal arms and blocks of 4.
*   **When**: Eight participants sign up and start session 1, five of them within the same second.
*   **Then**: Each gets the next slot of the block list when they start session 1, so after every full block the
    arms are exactly equal. People who sign up and never start hold no arm and use no slot. Each participant sees their arm's wording or media and then the shared section. Nothing they see differs
    from a study built in the current editor.

## Technical Plan (Architecture)

### What reading the code changed

Three facts found while drafting this section change the brief:

1. **Survey questions can already belong to one arm.** `itemsFor` (`content.mjs:144`) filters every start- and
   end-of-session survey question by `it.sessions` and `it.conditions`. So "T1 answers a manipulation check that
   Control does not" compiles today, as long as the question is in a survey and not in the task. The brief's
   non-goal "arms that see different items" is therefore narrower than it reads: it applies only to **task items**
   (the text, media and call items in blocks). v1 allows arm-only survey questions.
2. **A block list set for session 1 is ignored.** `enroll` (`engine.mjs:455–470`) picks the arm with
   `pickCondition` and never calls `S.type.allocate`; only the deferred path (`startSession` → `assignNow`) does. So a
   study that assigns at enrollment ignores its block list. This is from reading the code; the first new test
   confirms it in the engine. Builder studies avoid it by always deferring to the start of session 1, where
   `assignNow` already calls `allocate` before the session's plan is built.
3. **Import and clone always create a new study** (`router.mjs:372–381`, `studyfile.mjs:73–93`). Neither writes
   into a study that already has participants. So the lock only has to guard `saveContent` and `restoreContent`
   (which calls `saveContent`). The brief's "same check on import and clone-into" is not needed.

### The shape of a session, and how the canvas maps onto it

The engine runs every `multimodal` session in a fixed order (`engine.mjs:284`):

```text
 session n:   start survey (survey.pre)  ->  task (design.sessions[n].blocks -> items)  ->  end survey (survey.post)
              filtered by sessions/conditions    same blocks for every arm;                   filtered by sessions/conditions
                                                 item wording/media vary by arm
```

The canvas draws each session as one lane with those three zones stacked top to bottom. The arm split is a band
across all lanes from the session where the arm is assigned (`design.assignAtSession`, default 1):

```text
 +-- Session 1 ------------------------------------------------------------+
 | Start survey   [Age] [Prior training]                (Everyone)          |
 | ==== Assign to arms:  Warning video 1  |  Plain text 1  ====             |
 | Task           [Phishing email #1]  -> wording/media per arm             |
 |                [Phishing email #2]  -> same for every arm                |
 | End survey     | [Saw the video?] |                  (Warning video only)|
 |                [Trust scale] [Quiz Q1..Q3]           (Everyone)          |
 +-- Session 2 ------------------------------------------------------------+
 | Task           [Follow-up email]                                         |
 | End survey     [Quiz Q4..Q6]                         (Everyone)          |
 +-------------------------------------------------------------------------+
```

- A question dropped into an arm's column gets `conditions: [arm]`. A question dropped in a full-width row gets no
  `conditions` (everyone). Shared rows always follow the arm columns visually within a zone. That is the "rejoin",
  and it needs no connecting step.
- A task item appears once, full width. Its "Differs by arm" panel edits `variants[arm]` for the fields in
  `ITEM_FIELDS`. The canvas never shows a task item inside one arm's column, because the engine cannot hide it.
- Moving the "Assign to arms" band to a later lane sets `assignAtSession`. Above the band, arm columns are not
  available. This is the existing rule at `multimodal.mjs:692–696`, shown as a drop target that refuses.
- The palette lists the `multimodal` item kinds and the survey question types the engine validates (including
  `slider`, `rank` and `matrix` from `questiontypes.mjs`). Nothing else.

### Components

`static/lab/engine/canvas.js` (`LabCanvas`, the survey-question designer) edits one questionnaire. It has no arms,
sessions or zones, so the builder does not reuse its model or rendering. It does reuse its patterns: `builder.js`
is lazy-loaded the way `mountDesigner` loads `canvas.js` (`admin.js:882–897`), `builder.css` uses the same tokens
as `canvas.css`, and the model's test runs under `vm` as `canvas.test.mjs` does.

```text
 browser (admin)                                            server (Netlify functions)
 ---------------                                            --------------------------
 builder.js  (canvas UI, palette, drag/drop)                router.mjs  POST content  -> saveContent()
     |  edits                                                                              |  validateContent()
     v                                                                                     |  NEW lock check
 builder-model.js  (pure: compile / decompile / check)  ---- same module, imported by --->  |  tests/lab/*.test.mjs
     |  compile(canvas) -> content                                                         v
     v                                                                             content/current + content/history
 multimodal-admin.js  save path (unchanged API: body.content, baseVersion)
                                                                       engine.mjs  deferred(): builder studies assign at session-1 start
```

1. **`builder-model.js`: a pure module with no DOM access.** It holds three functions:
   - `decompile(content) -> canvas`
   - `compile(canvas, content) -> content`
   - `check(canvas) -> [reasons]`

   `compile` touches only the keys the canvas owns:
   - `design.conditions`, `design.assignAtSession`, `design.randomization`, `design.sessions[].blocks`;
   - `items[].variants`;
   - `survey.pre` and `survey.post` with their `sessions` and `conditions`;
   - `builder`.

   Every other content key passes through untouched. The browser and the node tests load the same file, so the
   round-trip test checks the code that runs.
2. **The canvas is derived from the content.** Everything the canvas shows can be rebuilt from content: arms,
   order, zones, `conditions`, variants and the block size. The only thing stored is a small new content key,
   `builder: { v: 1 }`. It does two jobs: it marks the study as built on the canvas, and it selects the assignment
   path (builder studies defer to session 1). Because of the second job, adding or removing `builder` is a change of
   structure and is locked like one (item 6). See Alternative L. `builder` is added to the type's `contentKeys` so
   `saveContent` keeps it, and validation checks it. The form editor saves a deep clone of the whole content (`admin.js:616`), so it keeps `builder` too, and a
   test confirms it.
3. **A study opens on the canvas only when it round-trips.** The rule is that `builder` is present and
   `compile(decompile(c), c)` equals `c`. Otherwise it opens in today's `multimodal-admin.js` editor, with a note
   saying why. New studies created from the "Two arms, shared final survey (builder)" template start with `builder` set.
4. **Equal arms in permuted blocks.** Every builder study uses `design.randomization = { method: 'blocks',
   blockSize, seed }`. The block size defaults to the number of arms × 2 (4 for two arms, 6 for three); the
   researcher may raise it in multiples of the arm count. The seed is generated once when the study is created. The
   seed and the block list are shown only to lab owners (`labOwner`), who download them as `allocation.csv` for a
   preregistration; researchers see the counts per arm. How often someone could guess the next arm with two equal
   arms in blocks of 4 has not been measured; the sims ran the 50/25/25 case only.
5. **Builder studies defer assignment to session 1.** Today `deferAssignment` is a fixed property of a type. It
   becomes either a boolean or a function of the content, and `multimodal` sets it to `c => !!c.builder`. `deferred()`
   (`engine.mjs:494`) calls it when it is a function. For a builder study, `enroll` then writes the participant with
   no arm, and `startSession` calls `assignNow` before the session-1 plan is built, which calls `allocate` first.
   This gives three properties without new assignment code:
   - The participant record exists before a slot is claimed, so a repeated id never burns a slot.
   - `assignNow` runs only while the participant has no arm, so a repeated start is safe.
   - Arm-only start-survey questions in session 1 work, because the arm is set before the plan is built.

   Two limits:
   - `allocate` ignores quotas, so validation refuses `enrollment.quota` on builder studies.
   - The participant list shows no arm until someone starts session 1.

   Studies without `builder` do not change: they keep today's enroll-time minimization.
6. **The server lock.** A new optional type hook, `structureOf(content)`, returns a fingerprint, or `null` for a
   study that cannot be locked. `multimodal` returns `null` unless `builder` is set; for a builder study it returns:
   - `builder.v` (so removing `builder` changes the fingerprint);
   - the arm ids in order and `assignAtSession`;
   - the session count, and per session the task block ids and the item ids in each block;
   - the arm-only survey question ids with their `conditions`;
   - the randomization method, block size and seed.

   **When it locks.** When `enroll` creates a real participant record, or `setTest` turns a test participant into a
   real one, and `structureOf(c)` is not `null`, it writes `lock/structure` with `setNew` (the first write wins;
   later ones are no-ops). These are the only two places a real participant record is created
   (`createTestParticipant` makes test records only). The lock therefore starts at the
   first real sign-up, before anyone has an arm or a slot. Deleting that participant, or `setTest`, never removes it.

   **The check.** `saveContent` computes the fingerprint when either the current or the next content has `builder`
   (so neither adding nor removing the key slips through). If the two fingerprints differ (compared as
   `JSON.stringify`) and `lock/structure` exists, the save is refused with `{ error: 'structure_locked', status: 409 }`.
   Saves that pass while locked are stamped `afterLock: true` in `content/history`, and `contentHistory` returns the
   stamp, so the IRB amendment list is a filter over history. A save that adds `builder` to a study that has none is
   refused if the study has any real participant record, because it would switch a running study's assignment path;
   this is the only case that lists `participants/`, and only a hand-edited save can reach it.

   **The reset.** A new owner-only route, `structure-reset`, removes `lock/structure` and every `alloc-arm/` and
   `alloc-arm-test/` key. It is refused while any real participant record remains, so it only helps a study whose
   real sign-ups were all mistakes and have been deleted.

   **Cost.** One `get('lock/structure')` per save and one `setNew` per real sign-up. There is no listing.
   **Window.** A sign-up that writes the stamp between the save's `get` and its write is not caught by that save;
   the next save is checked normally.
7. **Studies not built on the canvas do not change.** Their assignment, their saves and their admin editor stay as
   they are. There is no rollout switch: the template is the gate, because only a study created from the builder
   template carries `builder` (Alternative P).

### Data flow on save

```text
 user drop -> check(canvas) --refuse--> inline reason, nothing changes
                  | ok
                  v
           compile(canvas, content) -> next content
                  |
                  v
 POST content (baseVersion) -> saveContent: normalize -> validateContent -> lock check -> history (+afterLock) -> current
                  |                                    any error -> errors shown on the canvas next to the item
                  v
           decompile(saved) must equal the canvas the user sees; if not, the study reopens in the form editor
```

If the saved content does not decompile to the canvas the user sees, the page reopens the study in the form editor
with the note "This study opened in the form editor because the canvas cannot show it exactly." and writes the
differing paths to the browser console. "Equal" means deep-equal after sorting object keys; array order counts.

## Alternatives Considered

Alternatives A–K come from the brief's "Alternatives Weighed" (`concepts_brief.md`). L is the brief's decision 4,
which this design revises. M–P come from the 2026-11-25 review. Grouped by problem:

*   **Canvas UI:** A, B, C, J, K.
*   **Assignment:** D, E, F, G, M, N.
*   **Scope:** H, P.
*   **Lock and storage:** I, L, O.

Sim numbers are from `sims/assign-sim2.js` (Control 50%, T1 25%, T2 25%, 4,000 runs per cell); they describe that
unequal case, not two equal arms. Keystroke numbers are from `sims/klm.js`, which is a model with hand-written
operator strings, not a test with people.

### Alternative A: Sessions as tabs

*   **Pros**: Familiar from survey tools. Each tab is short, and one session is easy to focus on.
*   **Cons**: An arm's path across sessions is invisible: the user has to flip tabs to see that T1 gets the video in
    session 1 and the follow-up in session 2. A rough keystroke model, not a test with people, puts tabs at 30.2 s
    against 22.5 s for lanes for a two-session study; that model was set up so tabs would lose, so the number is weak
    evidence.
*   **Reason for Rejection**: The lab's multi-session studies are about what one arm sees over time, and tabs hide
    exactly that. Whether lanes stay readable at four or more sessions is an Open Question.

### Alternative B: Share sliders always shown

*   **Pros**: Unequal shares are visible and one drag away.
*   **Cons**: Most studies use equal arms. Sliders invite 34/33/33-style entries that do not reduce to a block. They
    also put a decision in front of every user that few need. The prototype showed them this way, and its own
    defaults were 34/33/33.
*   **Reason for Rejection**: v1 has equal arms only (Alternative M). When v1.1 adds unequal shares, they are entered
    as a ratio (2 : 1 : 1), which always reduces to a block, behind a control that is off by default.

### Alternative C: Drag each arm to a merge bar (prototype v5)

*   **Pros**: The rejoin is explicit and visible, and it would allow an arm to skip the shared section.
*   **Cons**: Forgetting to connect one arm is a silent error, three chances of it in a three-arm study. Skipping the
    shared section means an arm that ends early, which the engine has no meaning for (`screenOut` hands out the
    screen-out panel code).
*   **Reason for Rejection**: In v1 every arm rejoins, so the connection carries no information. Shared rows below
    the arm columns are the rejoin.

### Alternative D: Weighted random (an independent weighted coin for each person)

*   **Pros**: Least predictable (50%, the chance level). Simple to explain and to preregister.
*   **Cons**: Misses the target shares by 8.6 points on average at N = 40, and by 30 points in the worst run. At
    N = 20 the average miss is 12.0 points.
*   **Reason for Rejection**: The lab's studies are small. A 30-point miss can leave an arm too small to analyse.

### Alternative E: Weighted minimization (change `pickCondition` to the smallest `(count + 1) / weight`)

*   **Pros**: Exact when people sign up one at a time. One function to change.
*   **Cons**:
    *   Needs an engine change to every study type's assignment.
    *   Drifts 4.3 points at N = 40 when five people sign up at once, because `cond/` markers are written after the
        pick.
    *   The most predictable method in the 50/25/25 sim (71% against a 50% baseline).
    *   It would sit beside the type's `allocate` and today's equal minimization as a third assignment rule.
*   **Reason for Rejection**: Blocks are already in `multimodal`, are race-free, and can be preregistered as a list.

### Alternative F: Duplicate Control as two leaves (no engine change)

*   **Pros**: Works on today's engine: four equal leaves under minimization give 50/25/25.
*   **Cons**: Drifts 4.6 points at N = 40 under bursts of five. The duplicate leaves ("Control A", "Control B") leak
    into exports, the Analyze tab's ANOVA on the condition column, quotas and the 12-condition cap, unless every one
    of those is taught to merge them.
*   **Reason for Rejection**: It moves the complexity into analysis, where a mistake is harder to see. With equal
    arms in v1 it is not needed, and v1.1 uses `ratio` instead (Alternative M).

### Alternative G: Permuted blocks (chosen)

*   **Pros**: Already implemented (`allocationList` and `allocate` in `types/multimodal-study.mjs`). Race-free through
    `setNew` slots. Exactly equal at every full block, under bursts too. The list can be printed for a
    preregistration.
*   **Cons**: Works only on the deferred path today (see "What reading the code changed", item 2). Ignores quotas.
    The list is finite (200 blocks), after which it falls back to minimization. Someone who knows the past
    assignments can guess the last arm of each block.
*   **Reason for Selection**: Builder studies defer to session 1, where `allocate` already runs. Validation refuses
    quotas on builder studies. Only lab owners see the list. After 200 blocks (800 people with two arms in blocks of
    4) assignment falls back to minimization, which is beyond the lab's study sizes.

### Alternative H: Nested splits in v1

*   **Pros**: Matches how researchers describe some designs ("half get a warning; of those, half get it as video").
*   **Cons**: The engine has only a flat list of conditions. Flattening loses the tree unless a full canvas model is
    stored. The analysis cannot see the top-level split without new export columns (`arm_top`, `arm_leaf`). Nested
    targets are unequal, so they need unequal shares, which v1 does not have.
*   **Reason for Rejection**: Deferred to after v1.1. Three flat arms with a 2 : 1 : 1 ratio (v1.1) give the same
    assignment; only the labels and the export columns are lost.

### Alternative I: A lock that lives only in the UI

*   **Pros**: No server change. Fast to build.
*   **Cons**: `saveContent` is reached by the canvas, the old editor, `restoreContent` and any script with a session
    cookie. A UI lock stops none of the last three.
*   **Reason for Rejection**: Changing the arms after people are assigned breaks the study's randomization. That has
    to be refused where the data is written.

### Alternative J: Open every existing multimodal study in the new builder

*   **Pros**: One editor for everyone sooner. Nobody has to learn which studies open where.
*   **Cons**: There is no proof that every existing study round-trips. Studies with task items that vary in ways the
    canvas does not show, with custom block pools, or with clip libraries would open with something missing. A
    silent loss on save is worse than a second editor. Opening one would also make it a builder study, which
    changes how it assigns.
*   **Reason for Rejection**: v1 opens a study on the canvas only when `builder` is set and the round-trip check
    passes. Existing studies stay in today's editor until a later phase proves round-trip over all of them.

### Alternative K: A separate Data view with live counts per arm

*   **Pros**: Answers "see the data" on the same page. Counts are cheap from `cond/` and `done/` keys.
*   **Cons**: "Dropped" has no definition in the engine. A second set of numbers can disagree with the Analyze tab
    and the participant list. Listing keys gets slow at scale.
*   **Reason for Rejection**: v1 links to the existing participant list (assigned per arm, from `quotaState`) and the
    Analyze tab. A Data view comes back once "dropped" is defined.

### Alternative L: Store the full canvas model next to the content (the brief's decision 4)

*   **Pros**: Any layout choice survives: positions, collapsed lanes, notes. Decompiling never has to guess.
*   **Cons**: Two copies of the same design can drift apart. A history restore, the old editor or an import of an
    older file changes the content and leaves the stored canvas stale. Something then has to decide which copy
    wins, and the wrong answer is a study that runs differently from what the canvas shows.
*   **Reason for Rejection**: Replaced by a derived canvas plus a small `builder` key. Content stays the single
    source of truth, and the round-trip check catches any study the canvas cannot show exactly.

### Alternative M: Unequal shares in v1 with `randomization.ratio`

*   **Pros**: Meets the brief's "unequal shares are possible" now. About ten backward-compatible lines in
    `allocationList` (a ratio repeats each arm in the block), and the 50/25/25 sim results apply to it directly.
*   **Cons**: A second engine change in v1, plus the block-size rules that come with it (the size must be a multiple
    of the ratio's sum), the shares UI, its validation and its fixtures. `allocationList` today can only build equal
    blocks (`blockSize % arms === 0`), so nothing simpler exists.
*   **Reason for Deferral**: Ben chose equal arms for v1 on 2026-11-25. v1.1 adds `ratio` as its own change, with
    CUJ, fixtures and tests of its own.

### Alternative N: Call `allocate` in `enroll` for every study (the original enroll fix)

*   **Pros**: Fixes the ignored session-1 block list for every study, not only builder studies. People get their arm
    at sign-up, so the participant list shows it at once.
*   **Cons**: Adds a second `allocate` call site. The arm is picked before the participant record exists, so a
    repeated id burns a slot. It bypasses quotas for every study that has them. It switches running studies to
    their block list mid-study, which needed a production audit (the old "Step 0"), and a rollback waits for the
    next 06:00 or 17:00 ET build.
*   **Reason for Rejection**: Ben chose on 2026-11-25 to limit the change to builder studies through the deferred
    path, which already orders things correctly. Non-builder studies keep their known limit.

### Alternative O: Lock as a derived check rather than a stored stamp

*   **Pros**: No new key. The lock can never be out of step with the participants that exist.
*   **Cons**: It has to list `cond/`, `alloc-arm/` or `participants/` on every save, which is O(N). A derived lock
    reopens when the participants that triggered it are deleted or marked as tests, while the used slots stay, so the
    slot counter points into the middle of a different list.
*   **Reason for Rejection**: A write-once stamp costs one read per save and cannot be undone by a delete. The owner
    reset covers the rare study whose only real sign-ups were mistakes.

### Alternative P: A lab-wide rollout switch for the canvas

*   **Pros**: The canvas can be hidden without a build.
*   **Cons**: Once the engine changes apply only to builder studies, the switch guards only the UI. It needs a route,
    an owner role to flip it, tests of its off state, and a rule for builder studies that already exist.
*   **Reason for Rejection**: Ben dropped it on 2026-11-25. Only a study created from the builder template carries
    `builder`, so removing the template stops new builder studies; existing ones still run, because their content is
    ordinary `multimodal` content.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The assignment change alters how running studies assign arms. | It applies only to studies with `builder`, and none exist before launch. Studies without it keep enroll-time minimization. Rollback is a code revert, live at the next 06:00 or 17:00 ET build. |
| Adding `builder` to a running study, or removing it from a builder study, switches its assignment path. | `builder.v` is part of the fingerprint, so removing it from a locked study is refused. Adding it to a study with any real participant is refused. A test covers both directions. |
| A participant id seen twice claims a second block slot. | Builder studies claim a slot in `startSession`, after the participant record exists, and only while the record has no arm. |
| Self sign-ups get past `enrollment.quota`, since `allocate` ignores quotas. | Validation refuses quotas on builder studies. |
| Structure changes after real participants have signed up. | The `lock/structure` stamp, written at the first real sign-up, and the check in `saveContent`. Every route that saves (save, restore) goes through it; import and clone make new studies. |
| Deleting participants reopens a locked study while used slots remain. | A delete or `setTest` never removes the stamp. Only the owner-only reset does, and it is refused while any real participant record remains; it clears the slots at the same time. |
| A sign-up lands between a save's lock read and its write. | That save goes through; the next save is checked. The window is one request long and saves are rare. |
| Anyone who sees the seed and block list can predict the next arm. | For builder studies only lab owners can download `allocation.csv`. Researchers see the counts per arm. |
| The canvas cannot represent a study and corrupts it on save. | A study opens on the canvas only when `compile(decompile(c), c)` deep-equals `c`; otherwise it opens in the form editor. |
| The form editor drops the `builder` key. | It edits a deep clone of the whole content (`admin.js:616`) and posts it back (`admin.js:648`); a test confirms `builder` survives a form-editor save. |
| New callers can change participants or locks. | `deleteParticipant` and `setTest` keep their current access levels. The one new write route, `structure-reset`, needs the study's owner role and is audited like the other owner routes. |

## Detailed Implementation Plan

Eight phases, in order. Each phase is its own small change with its own tests and a gate that must pass before the
next phase starts. Phases 2–5 touch server code that running studies use, but every change in them is keyed on
`builder`, which no running study has. The plan names functions rather than line numbers; the line numbers
elsewhere in this doc are from `036c255`.

### Phase 1: Novice test on the prototype

*   **Files:** `study-builder/prototype-v5.html`, revised to the v1 scope (equal arms, arm-only survey questions,
    shared task items, no switch).
*   **Work:** three first-time users build "two arms, shared final survey, two sessions" with no help.
*   **Gate:** Verification check 6. A fail sends the canvas back to design; it does not block phases 2–5, which stand
    on their own. The testers are three of Ben's PhD students who have not seen the builder or its prototype; Ben
    runs the test.

### Phase 2: Record the session-1 block bug

*   **Files:** new `tests/lab/enroll-blocks.test.mjs`. It copies the `call()` harness, `memBlobs` and `parseCsv` from
    `vishing-study2.test.mjs`.
*   **Work:** a case that enrolls participants into a `multimodal` study with blocks at session 1 and **no**
    `builder`, and asserts that their arms follow `allocationList`. On today's code this fails, which records the bug.
    The case is then kept with its assertion flipped (the arms follow minimization), so it pins that non-builder
    studies are unchanged by later phases.
*   **Gate:** the failing run is recorded in the PR; the flipped case passes.

### Phase 3: Keep `builder`, and defer builder studies to session 1

*   **Files:** `types/multimodal.mjs` (`contentKeys`, `deferAssignment`), `engine.mjs` (`deferred`).
*   **Work:**
    *   Add `builder` to `contentKeys`, so `saveContent` keeps it and export, import and clone carry it.
    *   Let `deferAssignment` be a function of the content; `deferred()` calls it when it is one. `multimodal` sets
        `deferAssignment: c => !!c.builder`. `smishing` keeps its boolean. `deferred()` is the only reader of
        `deferAssignment` in `netlify/lib/lab`, `static/lab` and `tests/lab`, so a function value reaches no `if`
        that would treat it as true.
    *   Refuse, in `saveContent`, a save that adds `builder` to a study with any real participant record. This ships
        in phase 3, not with the lock, because from this phase on `builder` changes how a study assigns.
*   **Tests:** in `enroll-blocks.test.mjs`, a builder study (content saved through `saveContent`): enroll 8 ids; check
    no one has an arm; record consent and call `startSession` for each in order; check that their arms equal slots
    0–7 of `allocationList`. Then the concurrency case and the start-survey case (Verification checks 1–2). In
    `multimodal.test.mjs`, `builder` survives a save, export, import, clone and a form-editor save.
*   **Gate:** the new cases pass; `vishing-study2.test.mjs` and `smishing.test.mjs` pass unedited.

### Phase 4: Fingerprint, lock and reset

*   **Files:** `types/multimodal.mjs` (`structureOf`, `allocation.csv`), `engine.mjs` (`enroll`), `content.mjs`
    (`saveContent`, `contentHistory`), `router.mjs` (`structure-reset`, `locked` on the content read).
*   **Work:**
    *   `structureOf` as described in the Technical Plan, item 6; `null` without `builder`.
    *   `enroll` and `setTest` write `lock/structure` with `setNew` when a real participant record appears and
        `structureOf(c)` is not `null`.
    *   `saveContent` refuses a changed fingerprint while `lock/structure` exists, with
        `{ error: 'structure_locked', status: 409, fields: [...], hint: 'Arms, sessions, task blocks and arm-only
        questions are locked because real participants have signed up. Wording, media and shared questions can still
        change.' }`. `reply` already passes
        `status`, `fields` and `hint` through, and the admin's error mapper shows `hint`. `conflict` is also a 409, so
        callers tell the two apart by `error`. Passing saves while locked get `afterLock: true`, and `contentHistory`
        returns it.
    *   `structure-reset` (study owner, POST, audited): refused while any non-test participant record remains;
        otherwise deletes `lock/structure`, `alloc-arm/` and `alloc-arm-test/`.
    *   The content read returns `locked: true` when the stamp exists, for the admin banner.
    *   `allocation.csv`: for builder studies the handler refuses any caller whose account is not a lab owner
        (`labOwner`); other studies keep `need: 'viewer'`. The handler receives `who`; this phase confirms it can
        reach the account's `labOwner` flag, and otherwise moves the check into the router.
*   **Tests:** new `tests/lab/lock.test.mjs`:
    *   one real sign-up locks; test sign-ups alone do not; `setTest(false)` on a test participant locks;
    *   after the lock, a change to arms, sessions, task blocks, block items, arm-only questions or block size is
        refused; a wording change passes and is marked `afterLock`;
    *   removing `builder` from a locked study is refused, and so is adding it to a non-builder study that has a
        real participant;
    *   restoring an old version with different arms is refused;
    *   `deleteParticipant` and `setTest` on the only real participant leave the study locked;
    *   `structure-reset` is refused while a real participant remains, and clears the stamp and slots once none do;
    *   a non-builder study never locks.
*   **Gate:** the new cases pass; Verification check 3.

### Phase 5: Validation and template

*   **Files:** `types/multimodal.mjs` (validation), `templates.mjs`, `registry.mjs` (`createStudy`), new fixture
    `tests/lab/fixtures/builder/two-arm.json`.
*   **Work:** when `builder` is set, validation adds four rules, each refused with a sentence a researcher can read:
    *   `design.randomization.method` is `'blocks'`: "Builder studies assign arms in blocks."
    *   `design.randomization.blockSize` is a multiple of the arm count and at least twice it: "The block size must
        be a multiple of the number of arms, at least twice it."
    *   `enrollment.quota` is absent: "Builder studies cannot cap sign-ups yet; remove the quota."
    *   `builder` is exactly `{ v: 1 }`: "This study was saved by a newer builder; open it in the form editor."

    One template, "Two arms, shared final survey (builder)", key `multimodal-builder`, whose content is the fixture:
    two equal arms, blocks of 4, two sessions, one start survey question, one task block, one shared end survey
    question, and `builder: { v: 1 }`. `createStudy` replaces `design.randomization.seed` with a fresh random one
    when the template is `multimodal-builder`, so no two builder studies share a list. Fixture comparisons
    (`builder-model.test.mjs`, Verification check 4) leave out `design.randomization.seed`.
*   **Tests:** `multimodal.test.mjs` gains the four refusals, a case for the template, and a check that two studies
    created from it get different seeds (next to the existing
    `templates` then `create` assertion).
*   **Gate:** `npm run test:lab` passes.

### Phase 6: Builder model

*   **Files:** new `static/lab/engine/builder-model.js`, new `tests/lab/builder-model.test.mjs`, fixtures in
    `tests/lab/fixtures/builder/`.
*   **Work:** three functions, no DOM, no network.
    *   `decompile(content) -> Canvas`, where
        `Canvas = { arms: [{id, label}], blockSize, sessions: [{ n, zones: { start: [qid], task: [blockId], end: [qid] } }],
        armOnly: { [qid]: [armId] }, variants: { [itemId]: { [field]: { [armId]: value } } } }`.
    *   `compile(canvas, base) -> content`. It replaces only `design.conditions`, `design.assignAtSession`,
        `design.randomization`, `design.sessions[].blocks`, the `sessions` and `conditions` of survey questions, item
        `variants`, and `builder`. It removes `conditions` entries that name a deleted arm. Every other key of `base`
        passes through untouched.
    *   `check(canvas) -> [{ code, message }]`, where `code` is one of `arm_limit`, `variant_field`,
        `task_item_arm_only`, `block_size` or `quota_with_blocks`, and `message` is one plain sentence.
    *   The "Differs by arm" panel exposes only `prompt`, `body`, `media` and `caption`. `check` refuses a variant on
        any other `ITEM_FIELDS` entry (such as `kind` or `recordVoice`) with `variant_field`.
*   **Tests:** fixtures for two equal arms, three equal arms, assignment at session 2, per-arm survey questions, and
    variants on wording and media. For each, `compile(decompile(c), c)` equals `c`, and the compiled JSON equals
    `<name>.expected.json`. `check` refuses each design v1 cannot run, with the expected code. The file loads under
    `vm` with no DOM, as `canvas.test.mjs` does for `canvas.js`.
*   **Gate:** Verification check 4.

### Phase 7: Canvas UI and admin hook

*   **Files:** new `static/lab/engine/builder.js` and `builder.css`; edits to `types/multimodal-admin.js` and
    `admin.js`.
*   **Work:**
    *   `builder.js`: the palette (only item and question types `multimodal` runs), the three zones per session, the
        "Assign to arms" band with a block-size control, the per-item "Differs by arm" panel, the glossary, and the
        lock banner. Saves go through the existing admin save path. Every rule about what compiles lives in
        `builder-model.js`.
    *   `builder.css`: canvas layout, zone and arm colours, and the phone-width layout (arms stack, palette becomes a
        sheet), with the same tokens as `canvas.css`.
    *   Five admin edits:
        1.  In `multimodal-admin.js`, turn the static `subtabs` array into a function of the content that puts
            "Builder" first when the round-trip check passes (`builder` present and `compile(decompile(c), c)`
            deep-equal to `c`).
        2.  In `admin.js`, let `subs()` and the default `sub` accept that function as well as an array.
        3.  Lazy-load `builder.js` and `builder.css` when the Builder subtab opens, the way `mountDesigner` loads
            `canvas.js`.
        4.  Show the lock banner when the content read returns `locked: true`.
        5.  When the round-trip check fails, open the form editor with the note described in Data flow on save.
*   **Gate:** Verification check 5.

### Phase 8: Docs

*   **`static/lab/README.md`:** the builder; that builder studies assign at the start of session 1; the lock, what
    it freezes and the owner reset; who can see `allocation.csv`; and the known limit that non-builder studies with
    blocks at session 1 get minimization.
*   **The admin guide (`static/lab/guide`):** one page for researchers, in plain words, with the glossary.

### Verification Plan

Every check below has a command or a pass rule someone else can apply. The phase each one gates is named.

1.  **Assignment order (phase 3).** In `enroll-blocks.test.mjs`, a builder study with seed `"t1"`, two arms and
    blocks of 4. Eight ids are enrolled, consent is recorded, and `startSession` is called for each, one at a time.
    Pass: the arms in their `cond/` markers, in session-start order, equal slots 0–7 of `allocationList` for that
    seed. A second case pins the order inside `startSession`: an arm-only start-survey question in session 1 is in
    that arm's session-1 plan.
2.  **Concurrency (phase 3).** Five `startSession` calls started together (`Promise.all`) against
    `memStore({ lossyCas: true })` (as in `tests/lab/audit.test.mjs`). Pass: no `alloc-arm/` slot is claimed twice,
    and the count per arm equals the count in the block list's first five slots.
3.  **Gate (every server phase).** `npm run test:lab` passes twice in a row. `run.mjs` counts test files, not test
    cases, so record the file count before phase 2; after phase 6 it must equal that count plus the three new test
    files.
4.  **Fixtures (phase 6).** Each design in `tests/lab/fixtures/builder/` has `<name>.json` (the content) and
    `<name>.expected.json` (the compiled reference). `builder-model.test.mjs` fails on any difference.
5.  **Manual check in `npm run lab` (phase 7).** Build CUJ 1 in the builder, then save, export, import into a new
    study and reopen it. Pass: the canvas shows the same arms, zones and item order, and the reopened study opened on
    the canvas, not in the form editor. Then sign up a test participant and a real one through the participant
    link. Pass: the lock banner shows, a save that changes the arms shows the lock message, and a wording change
    still saves.
6.  **Novice test (phase 1).** Three of Ben's PhD students who have not seen the builder or its prototype build "two arms, shared final survey, two sessions" with no
    help. Pass: each finishes in 10 minutes or less, with at most one wrong turn (see Terms), and the design each one
    built matches the reference design (same arms, zones and item order), checked by hand against `two-arm.json`,
    because the prototype does not compile. The compiled JSON is checked against the fixture by check 4 (phase 6).
    Ben runs the sessions. The students already know the lab platform, so a pass shows the canvas is learnable by
    people used to the lab, not by outside researchers.
7.  **After launch.** Once the first builder study has 20 real participants who started session 1, a lab owner
    downloads its `allocation.csv`. Pass: every used slot's arm matches the arm of the participant who holds it.

## Appendix: Changes from the concepts brief

Reading the code during drafting changed four points in `concepts_brief.md`. Ben chose the draft's version on
2026-11-24, and the 2026-11-25 review changed items 3 and 4 again, with Ben's agreement.

1.  **Canvas model.** The brief (decision 4) stored a full canvas model and moved `schemaVersion` to 2. This design
    instead derives the canvas from the content and stores only `builder: { v: 1 }`. `schemaVersion` stays at 1, so
    no migration is needed.
2.  **Per-arm survey questions.** The brief (decision 1) said "An arm cannot add or remove items in v1." Start and
    end survey questions can now be limited to one arm, because the engine already filters them by `conditions`
    (`content.mjs:144`). Task items and blocks are still shared by every arm.
3.  **Equal arms only, in blocks.** Builder studies use permuted blocks of equal arms (block size = number of arms ×
    2 by default). Unequal shares, which the brief kept in v1, move to v1.1 (Alternative M).
4.  **Scope of the engine changes.** The assignment change and the lock apply only to builder studies, not to every
    `multimodal` study: builder studies defer assignment to the start of session 1, and only they can be locked.
    There is no lock check on import or clone, because both always create a new study. There is no rollout switch.
