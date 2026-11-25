# Goldfish Annotated Review Report

**Status:** resolved — 2026-11-25. Ben chose "auto accept" for every PROPOSE FIX, then "take your recommendations" for D1–D4: D1(a) equal arms only in v1, `ratio` in v1.1; D2(a) builder studies only, through deferred assignment at session 1; D3(a) no rollout switch; D4 a write-once `lock/structure` stamp at the first real sign-up, never removed by a delete, cleared only by an owner reset. E-1 confirmed with no change. Issues 17, 22 and 23 (held parts) and 24 are applied. E-2 answered the same day: the testers are three of Ben's PhD students and Ben runs the test (Phase 1 and Verification check 6). Nothing remains open.

**Target:** `docs/designs/study-builder.md` (full file, 1..555)

**Inputs:** Stage 5 `zoom_out_report.md`, Stage 6 `comprehension_report.md`, Stage 7 `critic_report.md`, Stage 8 `intermediate_zoom_out_report.md`, Stage 9 `implementation_readiness_report.md`. Findings that the earlier reports' overlap lists already linked are merged into one issue, and each issue lists its member IDs. Severity is the reviewers' own: Blocker = High, Major = Medium, Nit = Low. Two Elephant re-gradings in the stage reports are undone here:
*   DC-1-2 is listed as the reviewer's Blocker and split into a CONTEST half and a FIX half.
*   IR-M6 / ST9-M1 is listed as Major.

> **Read this first (now settled; see Status).** Issues D1–D4 were **ESCALATE**. They reopen decisions Ben made on 2026-11-24, so only Ben can settle them. Issues marked **HELD (Dn)** depend on those answers. Their edits are sketched as one line per branch, and the exact text is drafted after Ben answers. **"Auto accept" applies only the PROPOSE FIX issues not marked HELD.**

## Escalated decisions (need Ben)

### [D1] [`zoom_out`, `design_critic`, Elephant, `implementation_readiness`] - Severity: High
*   **Members:** E1, DC-1-1, ZO2-1, IR-B1. Dependent issues: ST-1-4, Stage 6 #9, ZO2-11, Stage 5 #8, half of DC-1-6, IR-M3 (shares), half of ST9-M5.
*   **Affected Scope:** [Lines 65-66](../study-builder.md#L65-L66) (Goals), [106-112](../study-builder.md#L106-L112) (CUJ 2), [231-235](../study-builder.md#L231-L235) (Technical Plan 4), [351-359](../study-builder.md#L351-L359) (Alt G)
*   **Discrepancy Description:** `allocationList` (`multimodal-study.mjs:22–27`) puts the same number of copies of every arm in each block. Validation (`multimodal.mjs:689–691`) requires `blockSize % arms === 0`. So a 2:1:1 block cannot be built, and the 2:1:1 test cannot pass.
*   **Rationale:** The goal "unequal shares are possible" cannot be met by the plan as written.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** The finding is correct. The fix is a scope decision for Ben, not a text change:
    *   **(a) Equal arms only in v1.** `ratio` moves to v1.1.
    *   **(b) Add `randomization.ratio` now.** This is the second engine change: about 10 lines in `allocationList` and validation, backward compatible.

    The doc's Overview says most studies use equal arms (line 305).
*   ***Proposed Edit (after the answer):***
    *   **(a)** Cut CUJ 2 and `builder.shares` (the `builder` key becomes `{v: 1}`). Rewrite Goals bullet 3 to "Arms are equal; unequal shares are planned for v1.1 (`randomization.ratio`)". Alt G becomes "Permuted blocks (chosen)". Block rule: `arms × 2`.
    *   **(b)** Add a numbered phase "`randomization.ratio`" with the `allocationList` and validation change and its test. Drop `builder.shares` and read shares from `ratio`. Fix CUJ 2 to block 8.

### [D2] [`zoom_out`, `design_critic`, `implementation_readiness`, `codebase_details`, Elephant] - Severity: High
*   **Members:** ZO2-2, Stage 5 #2, DC-1-5, CB-B1, IR-B2, CB-B2, IR-B3, E2, Stage 6 #6, #7, #11. Its rollback half is DC-1-5 "no off switch".
*   **Affected Scope:** [Lines 18](../study-builder.md#L18), [236-246](../study-builder.md#L236-L246), [411-436](../study-builder.md#L411-L436)
*   **Discrepancy Description:** The enroll fix calls `allocate` before `setNew`, which burns a slot when an id repeats. It bypasses `enrollment.quota` (both `total` and `perCondition`, which are enforced only in `pickCondition`, `engine.mjs:449`). It ignores the `fixed` test branch. It changes every running `multimodal` blocks study and needs Step 0, whose `'minimize'` value is invalid. It cannot be rolled back faster than the 06:00 and 17:00 ET builds.
*   **Rationale:** As written, the fix changes how live studies assign arms, with no off switch.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Decision 4 ("the lock and the enroll fix apply to every `multimodal` study") is Ben's call. The reviewers' option is real and simpler. Make `deferred()` true for builder studies, so assignment runs through `assignNow` (`engine.mjs:318`). `assignNow` runs after the participant record exists, keeps the quota fallback (`engine.mjs:498`), and skips the `fixed` branch. Running studies don't change, and Step 0 goes away. Side effect: the arm is chosen when session 1 starts, not at sign-up.
*   ***Proposed Edit (after the answer):***
    *   **(a) Gate on `builder` and use the deferred route.** Rewrite Technical Plan 5 as "builder studies defer assignment to the start of session 1, so `assignNow` calls `allocate`". The engine change becomes a small edit to `deferred(S, c)`. Delete Step 0 and E2. Revise decision 4 in the Changes list.
    *   **(b) Gate on `builder` and keep a call in `enroll`.** Specify `get(pKey)` before the call, `allocate(S, {code: id, test}, c)`, the `fixed` branch untouched, and a fall back to `pickCondition` for capped studies. Delete Step 0.
    *   **(c) Keep decision 4.** Do all of (b) for every study. Rewrite Step 0 with a script contract, an output table and "remove `design.randomization`" in place of `'minimize'`.

### [D3] [`zoom_out`, `comprehension`, `codebase_details`, `implementation_readiness`, `style`] - Severity: High (CB-B3); otherwise Medium
*   **Members:** Stage 5 #1, Stage 6 #4, #14, ZO2-5, CB-B3, IR-M2, ST9-M6 (route part), ST9-M7, CB-M7, DC-1-14, ST-1-9.
*   **Affected Scope:** [Lines 266-269](../study-builder.md#L266-L269), [463-485](../study-builder.md#L463-L485), [509-511](../study-builder.md#L509-L511)
*   **Discrepancy Description:** The rollout switch can't be enforced as written:
    *   `createStudy` (`registry.mjs:60–64`) accepts any template key, so hiding the template from the list does not stop a direct `create`.
    *   There are two `templates` routes (`router.mjs:371` and `router.mjs:410`).
    *   The route contract is missing.
    *   Line 510 never reads the switch.
    *   "Switch" names two different mechanisms.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Ben approved the switch. Dropping it removes CB-B3 and five Majors. With D2(a), the switch would guard only the UI, and the template already does that.
*   ***Proposed Edit (after the answer):***
    *   **(a) Drop it.** Delete Technical Plan 7, "The rollout switch" section, the `builder-flag` route and the template filter. The template is the gate.
    *   **(b) Keep it.** Check `settings/builder` in `createStudy`, filter both `templates` routes, add `builder-flag` (GET/POST `{on: boolean}`) to `labRoute` behind `isOwner`, and make `multimodal-admin.js` read it. Name the two mechanisms "rollout switch" and "builder marker". Add the CB-M7 tests.

### [D4] [`zoom_out`, `design_critic`, `codebase_details`, `implementation_readiness`, `style`] - Severity: Medium
*   **Resolution (2026-11-25):** a stored stamp, not a lock derived from participant data. `enroll` and `setTest(false)` write `lock/structure` with `setNew` at the first real participant; deletes never remove it; the owner-only `structure-reset` clears it (with `alloc-arm/` and `alloc-arm-test/`) only when no real participant remains. See Technical Plan item 6 and Alternative O.
*   **Members:** Stage 5 #4, Stage 6 #2 (lock part), DC-1-3, DC-1-4, DC-1-9, DC-1-10, DC-1-11, ZO2-4, CB-M6, CB-N5, IR-M1, ST9-M3, Stage 6 #18. Lock scope on running studies is also part of D2.
*   **Affected Scope:** [Lines 69-70](../study-builder.md#L69-L70), [88](../study-builder.md#L88), [247-265](../study-builder.md#L247-L265), [438-449](../study-builder.md#L438-L449)
*   **Discrepancy Description:** Four problems with the lock as written:
    *   `structureOf` omits blocks, the item set and arm-only questions.
    *   Deleting the last `cond/` marker unlocks the study while the `alloc-arm/` slots stay.
    *   `list` pages through every key (`store.mjs:17`), so "stopped at the first key" is false and each save costs O(N).
    *   "Fingerprint", `fields` and `afterLock` are not defined.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Ben chose "lock as written", and the reviewers propose a different rule. My recommended text: "Locked = any `alloc-arm/` slot or any non-test `participants/` record exists. A delete never unlocks. An owner-only 'Reset study' clears slots and markers." It needs Ben's yes.
*   ***Proposed Edit (after the answer):***
    *   Close Open Question 2 with the chosen trigger.
    *   Number the lock as sub-steps, as in ST9-M3:
        *   `fingerprint = JSON.stringify(type.structureOf(content))`;
        *   `isLocked`;
        *   a 409 with `error: 'structure_locked'` and `hint`;
        *   `afterLock` on the history entry, shown in the history list.
    *   Add blocks, item ids and arm-only question ids to `structureOf`. Fix the cost line.

### [E-1] [`zoom_out`] - Severity: Medium
*   **Members:** Stage 5 #5 (altitude: implementation detail at design level).
*   **Affected Scope:** [Lines 231-235](../study-builder.md#L231-L235), [425-533](../study-builder.md#L425-L533)
*   ***AI Suggestion:*** ESCALATE (partial)
*   ***Justification:*** The EGM draft format, which the reviewer could not read, requires file and line detail in the Detailed Implementation Plan. So that part of the finding does not apply. The valid half, moving the sim percentages out of Technical Plan item 4, is folded into D1's edit.
*   ***Proposed Edit:*** None beyond D1. Confirm.

### [E-2] [`implementation_readiness`, `structural`] - Severity: Medium
*   **Members:** IR-M7 (novice-test owner), ST-1-5 (testers undecided), Open Question 3.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Who the three first-time testers are, and who runs the test, is a fact only Ben has.
*   ***Proposed Edit:*** Fill in Ben's answer in Open Question 3 and Verification step 4.
*   **Resolution (2026-11-25):** three of Ben's PhD students who have not seen the builder; Ben runs the test. The Open Question is removed.

## Proposed fixes not held by a decision

### [Issue 1] [`structural`] - Severity: High
*   **Members:** ST-1-1, ZO2-3. Security parts: DC-1-6, ZO2-9, DC-1-14.
*   **Affected Scope:** whole doc. Insert a new `## Risks & Mitigations` after Alternatives ([line 404](../study-builder.md#L404)).
*   **Discrepancy Description:** There is no Risks & Mitigations section. Risks are scattered across Technical Plan 4–7 and the Alternatives, and security is not covered.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** A required section is missing, and a human reader needs it.
*   ***Proposed Edit:*** Insert:
    ```markdown
    ## Risks & Mitigations

    | Risk | Mitigation |
    |---|---|
    | The assignment change alters how running studies assign arms. | Scope set by decision D2. Rollback is a code revert, live at the next 06:00 or 17:00 ET build. |
    | A participant id seen twice claims a second block slot. | Assignment claims a slot only after the participant record exists (D2). |
    | Self sign-ups pass `enrollment.quota` when `allocate` assigns. | Builder studies refuse quotas in validation, or fall back to `pickCondition` when capped (D2). |
    | Structure changes after real participants have started. | The server lock in `saveContent` (D4). Every route that saves (save, restore) goes through it; import and clone make new studies. |
    | Deleting participants reopens a locked study while used slots remain. | Rule set by D4. |
    | Anyone who sees the seed and block list can predict the next arm. | Only lab owners see the seed and the allocation list (`allocation.csv`). Researchers see shares and counts. |
    | The canvas cannot represent a study and corrupts it on save. | The round-trip check: a study opens on the canvas only when `compile(decompile(c), c)` deep-equals `c`; otherwise it opens in the form editor. |
    | The form editor drops the `builder` key. | It edits a deep clone of the whole content (`admin.js:616`) and posts it back; a test confirms `builder` survives a form-editor save. |
    | Who can change participants. | `deleteParticipant` and `setTest` keep their current access levels; this design adds no new caller. |
    ```

### [Issue 2] [`design_critic`] - Severity: High (reviewer), split
*   **Members:** DC-1-2 (part 1: "the `builder` key is discarded on save").
*   **Affected Scope:** [Line 452](../study-builder.md#L452)
*   ***AI Suggestion:*** CONTEST
*   ***Justification:*** The Detailed plan adds `builder` to `contentKeys` at `multimodal.mjs:592` (doc line 452). `saveContent` keeps `ENGINE_KEYS.concat(type.contentKeys)` (`content.mjs:366`). The reviewer read only lines 1..404.
*   ***Proposed Edit:*** None. The valid remainder is Issue 6.

### [Issue 3] [`design_critic`] - Severity: Medium
*   **Members:** DC-1-8 (arm-only start questions may vanish under deferred assignment).
*   **Affected Scope:** [Lines 144-148](../study-builder.md#L144-L148)
*   ***AI Suggestion:*** CONTEST
*   ***Justification:*** In `startSession`, `assignNow` runs at `engine.mjs:318` before `buildPlan` at `engine.mjs:331`, and the plan is built from the updated `p`. So the arm is set before the start survey is filtered.
*   ***Proposed Edit:*** None. Issue 12 adds a test case that pins this order anyway.

### [Issue 4] [`style`] - Severity: Medium
*   **Members:** ST9-M8 (Step 0 ownership). The `'minimize'` default in its suggested rewrite is wrong.
*   ***AI Suggestion:*** CONTEST (the suggested default only)
*   ***Justification:*** `multimodal.mjs:690` accepts only `method: 'blocks'`. The rest of ST9-M8 depends on D2(c).
*   ***Proposed Edit:*** None now.

### [Issue 5] [`zoom_out`, `comprehension`, `structural`] - Severity: Medium
*   **Members:** Stage 5 #6, Stage 6 #3, ST-1-3, ZO2-14.
*   **Affected Scope:** [Line 71](../study-builder.md#L71) (Goals)
*   **Discrepancy Description:** "a stored canvas model" contradicts the derived canvas.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Location: line 71.
    *   Change: replace "(a stored canvas model, checked by golden-file tests)" with "(the canvas is rebuilt from the content and the `builder` key, checked by golden-file tests)".

### [Issue 6] [`design_critic`, `zoom_out`, `style`] - Severity: Medium
*   **Members:** DC-1-2 (part 2), ZO2-7, SY-1-4.
*   **Affected Scope:** [Lines 64](../study-builder.md#L64), [225-226](../study-builder.md#L225-L226), [236](../study-builder.md#L236)
*   **Discrepancy Description:**
    *   The design sections never mention the `contentKeys` change or the validation of `builder`.
    *   Nothing says the old editor keeps `builder`.
    *   "Runs in the current engine unchanged" overclaims, and so does "cannot drift apart".
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Line 64: replace "runs in the current engine unchanged" with "runs in the engine with the changes listed in the Technical Plan".
    *   Lines 225–226: replace "Keeping the stored part small means the canvas and the content cannot drift apart." with "Keeping the stored part small limits drift to what `builder` holds, and the round-trip check catches it. `builder` is added to the type's `contentKeys` so `saveContent` keeps it. The form editor saves a deep clone of the whole content (`admin.js:616`), so it keeps `builder` too, and a test confirms it."
    *   Line 236: drop "(the only engine change)". D2 sets the final wording.

### [Issue 7] [`comprehension`, `structural`, `zoom_out`] - Severity: Medium
*   **Members:** Stage 6 #1, ST-1-2 (Q1), Stage 5 #2 (status half), ZO2-12 (Q1).
*   **Affected Scope:** [Lines 87-89](../study-builder.md#L87-L89), [149-152](../study-builder.md#L149-L152)
*   **Discrepancy Description:** The session-1 bug is described three ways: "seems", "confirmed", and "still lacks confirmation".
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Delete the "Session-1 blocks" Open Question.
    *   Line 149: replace the heading sentence with "**The session-1 block bug is confirmed by reading the code; the first new test confirms it in the engine.**"
    *   Line 152: delete "This has not been run against a live store yet."
    *   Use the same wording in Verification step 1.
    *   Open Question 2 (the lock trigger) closes under D4.

### [Issue 8] [`comprehension`, `zoom_out`, `structural`] - Severity: Medium
*   **Members:** Stage 6 #13, Stage 5 #9, ST-1-7 (heading and count), ZO2-13, Stage 6 #16.
*   **Affected Scope:** [Lines 288-289](../study-builder.md#L288-L289), [358-359](../study-builder.md#L358-L359)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Line 358: replace "**Reason for Rejection**: Not rejected." with "**Reason for Selection**:". Add the sentence "After 200 blocks (1,600 people with blocks of 8), assignment falls back to minimization."
    *   Line 288: replace "The first eleven alternatives come from the brief's 'Alternatives Weighed' (`concepts_brief.md`). The last one comes from reading the code while drafting." with "Alternatives A–K come from the brief's 'Alternatives Weighed' (`concepts_brief.md`). Alternative L is the brief's decision 4, kept here because this design revises it."
    *   Grouping the Alternatives, and adding the lock, switch and deferred-route alternatives (ST-1-8, ZO2-15), waits for D2–D4.

### [Issue 9] [`comprehension`, `design_critic`, `style`] - Severity: Medium
*   **Members:** Stage 6 #5, #10, #12, #17, #19; ST9-N1, ST9-N2; Stage 9 term drift.
*   **Affected Scope:** insert after the Overview ([line 33](../study-builder.md#L33)).
*   **Discrepancy Description:** Engine and doc terms are used without definition. Terms also drift: arm and condition, real and non-test participant, marker and `cond/` key.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Insert a `### Terms` list:
    *   **arm** (= `design.conditions` entry)
    *   **block** (a group of task items) vs **assignment block** (a run of slots in the block list)
    *   **item** and **item kind**
    *   **study type** (`multimodal`, `smishing`)
    *   **variant** (a per-arm value of an item field)
    *   **`conditions`** on a question (the arms that see it)
    *   **block list** / `allocate` (`allocate(S, p, c)` claims the next free slot `alloc-arm/NNNNNN` with `setNew`, so two people never get the same slot; test participants use `alloc-arm-test/`)
    *   **real** vs **test** participant (`cond/` vs `cond-test/` marker)
    *   **deferred assignment**
    *   **`contentKeys`**
    *   **finishers** (people who finish every session)
    *   **guess rate** (how often someone who knows the past assignments guesses the next arm correctly)
    *   **wrong turn** (an action the user undoes, or a drop the canvas refuses)

    After that, use "arm" and "real participant" throughout.

### [Issue 10] [`codebase_details`, `implementation_readiness`, `style`] - Severity: Medium
*   **Members:** CB-M1, the `order.test.mjs` part of ST9-M11, IR-N (conditional instruction).
*   **Affected Scope:** [Lines 532-533](../study-builder.md#L532-L533)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** `tests/lab/order.test.mjs` tests question and option shuffling and never calls `enroll`.
*   ***Proposed Edit:*** Replace the bullet with "**Run `tests/lab/vishing-study2.test.mjs` and `tests/lab/smishing.test.mjs`** (the existing block-list tests; smishing defers assignment). Both must pass unchanged. The new `enroll-blocks.test.mjs` copies the `call()` / `memBlobs` harness and `parseCsv` from `vishing-study2.test.mjs`."

### [Issue 11] [`codebase_details`] - Severity: Medium
*   **Members:** CB-M3.
*   **Affected Scope:** [Line 440](../study-builder.md#L440), [509-513](../study-builder.md#L509-L513)
*   **Discrepancy Description:** `structure_locked` is not mapped in `admin.js:32–41`, so the user would see "Request failed (409)". `conflict` is also a 409.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** In the lock response, add `hint: 'Arms, sessions and the block list are locked because real participants have started. Wording and media can still change.'`. The existing mapper shows `j.hint`, so `admin.js` needs no change. Add: "Callers tell it apart from `conflict` by `error`, not by status."

### [Issue 12] [`implementation_readiness`, `style`, `codebase_details`] - Severity: Medium
*   **Members:** IR-M7, ST9-M12, CB-N2, Stage 5 #7 / ZO2-6 (order part), ST9-M11 (fixtures).
*   **Affected Scope:** [Lines 515-555](../study-builder.md#L515-L555)
*   **Discrepancy Description:** The tests and the Verification Plan aren't runnable:
    *   no assertion, seed or fixture path;
    *   `run.mjs` counts per file, not per test;
    *   the manual checks are subjective;
    *   post-launch "watch" has no command;
    *   there's no concurrency method.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Rewrite Verification as items labelled by phase:
    *   **Phase 1 gate:** `enroll-blocks.test.mjs` uses seed `"t1"`, two arms and block 4. Enroll 8 ids, and assert the `cond/` arm order equals `allocationList(seed)` slots 0–7. Run it once on today's code (it must fail), then after the fix (it must pass). Add a case for arm-only start questions (Issue 3).
    *   **Concurrency:** 5 parallel `enroll` calls on `memStore({lossyCas: true})`. No slot is used twice, and every arm count equals the block list's count.
    *   **Gate:** `npm run test:lab` passes twice. Record the file count before Phase 1, and after the last phase it must be that count plus the new files.
    *   **Fixtures:** `tests/lab/fixtures/builder/<name>.json` and `<name>.expected.json`.
    *   **Manual:** build CUJ 1, then save, export, import and reopen. The canvas must show the same arms, zones and item order.
    *   **Post-launch:** the owner downloads `allocation.csv` for the first builder study after 20 real participants. Pass if every used slot's arm matches the participant's arm.

    The order of phases follows D2.

### [Issue 13] [`implementation_readiness`, `style`, `design_critic`] - Severity: Medium
*   **Members:** IR-M4, ST9-M9, DC-1-7, DC-1-13.
*   **Affected Scope:** [Lines 209-221](../study-builder.md#L209-L221), [489-506](../study-builder.md#L489-L506)
*   **Discrepancy Description:**
    *   `compile`, `decompile` and `check` have no signatures or return shapes.
    *   The fields the builder owns are not listed.
    *   `ITEM_FIELDS` includes `kind` and `recordVoice`, so the "Differs by arm" panel could break the "wording or media only" non-goal.
    *   Deleting an arm leaves orphan `conditions`.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Add to the `builder-model.js` entry:
    *   `decompile(content) -> Canvas`, where `Canvas = {arms:[{id,label}], sessions:[{n, zones:{start:[qid], task:[blockId], end:[qid]}}], armOnly:{[qid]:[armId]}, variants:{[itemId]:{[field]:{[armId]:value}}}}`
    *   `compile(canvas, base) -> content`. It replaces only `design.conditions`, `design.randomization`, `sessions`, question `sessions` and `conditions`, item `variants`, and `builder`. It removes `conditions` entries that name deleted arms.
    *   `check(canvas) -> [{code, message}]`, where `code` ∈ `arm_limit`, `variant_field`, `task_item_arm_only`, `block_size`, `quota_with_blocks`.
    *   The variant panel exposes only the text and media fields: `prompt`, `body`, `media`, `caption`. `check` refuses the others with `variant_field`.

### [Issue 14] [`codebase_details`, `zoom_out`, `implementation_readiness`] - Severity: Medium
*   **Members:** CB-M5, ZO2-8, Stage 5 #3 (`canvas.js` part).
*   **Affected Scope:** [Lines 194-221](../study-builder.md#L194-L221), [489-506](../study-builder.md#L489-L506)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Add to Components: "`static/lab/engine/canvas.js` (the survey-question designer, `LabCanvas`) edits one questionnaire; it has no arms, sessions or zones, so the builder does not reuse its model or rendering. It reuses its patterns: `builder.js` is lazy-loaded the way `mountDesigner` loads `canvas.js` (`admin.js:882–897`, `loadScript`), `builder.css` uses the same tokens as `canvas.css`, and `builder-model.test.mjs` loads the module under `vm` with no DOM, as `canvas.test.mjs` does."

### [Issue 15] [`zoom_out`, `comprehension`, `design_critic`] - Severity: Medium
*   **Members:** Stage 5 #3 (log part), Stage 6 #8, DC-1-12.
*   **Affected Scope:** [Line 283](../study-builder.md#L283)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Replace "the page reloads in the old editor and logs it" with "the page reopens in the form editor with the note 'This study opened in the form editor because the canvas cannot show it exactly.' and writes the differing paths to the browser console. 'Equal' means deep-equal after sorting object keys; array order counts."

### [Issue 16] [`codebase_details`, `implementation_readiness`, `style`] - Severity: Medium
*   **Members:** CB-M4, IR-M5, ST9-M10.
*   **Affected Scope:** [Lines 408-409](../study-builder.md#L408-L409), [507-513](../study-builder.md#L507-L513)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Replace "one hook in the existing admin script" with a numbered list:
    1.  In `multimodal-admin.js`, make `subtabs` (line 261) a function of the content that puts "Builder" first when the round-trip check passes.
    2.  In `admin.js` `subs()` (line 602) and the default `sub` (line 247), accept that function.
    3.  Lazy-load `builder.js` (Issue 14).
    4.  Show the lock banner using `A.started` (`admin.js:621`).
    5.  Show the Issue 15 note when the round trip fails.

    Define the round-trip check here, where it is first used.

### [Issue 17] [`implementation_readiness`] - Severity: Medium
*   **Members:** IR-M3 (template).
*   **Affected Scope:** [Lines 466](../study-builder.md#L466), [469-474](../study-builder.md#L469-L474)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Use one name, "Two arms, shared final survey (builder)", with key `multimodal-builder`. The literal content is `tests/lab/fixtures/builder/two-arm.json`: two arms, two sessions, one shared end survey and `builder: {v: 1}`. `templates.mjs` imports the fixture's shape. Change "`templates.test.mjs`" to the existing `multimodal.test.mjs:158` template assertion. Share fields follow D1.

### [Issue 18] [`design_critic`, `zoom_out`] - Severity: Medium
*   **Members:** DC-1-6, ZO2-9 (the seed is shown to the researcher).
*   **Affected Scope:** [Lines 234-236](../study-builder.md#L234-L236)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Replace the sentence that shows the seed with "The seed and block list are shown only to lab owners (`labOwner`), who download them as `allocation.csv` for a preregistration. Researchers see the shares and the counts per arm." The two-arm guess-rate sim run is noted as optional future work.

### [Issue 19] [`structural`, `style`] - Severity: Medium
*   **Members:** ST-1-5, SY-1-2.
*   **Affected Scope:** [Lines 60-62](../study-builder.md#L60-L62)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Split Goal 1 into two bullets:
    *   "A first-time authorized user builds 'two arms, a shared final survey, two sessions' on the canvas with no help in 10 minutes or less, with at most one wrong turn (see Terms)."
    *   "The compiled JSON equals the reference fixture."

    Move "Tested with three real first-time users…" to Verification (Issue 12 and E-2).

### [Issue 20] [`structural`, `style`] - Severity: Medium
*   **Members:** ST-1-6, SY-1-1.
*   **Affected Scope:** [Lines 11-18](../study-builder.md#L11-L18), [227](../study-builder.md#L227), [395-403](../study-builder.md#L395-L403)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Move "Changes from the concepts brief" to an appendix at the end. In Technical Plan item 2 (line 227), replace the retelling of decision 4 with "See Alternative L." Rewrite the Changes list after D1–D4, because two of its items change.

### [Issue 21] [`style`, `zoom_out`] - Severity: Medium
*   **Members:** SY-1-3, Stage 5 #12.
*   **Affected Scope:** [Lines 297-301](../study-builder.md#L297-L301)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** Prefix the keystroke number with "A rough model, not a test with people, gives…". Move the four-session test to Open Questions as "Test lanes against tabs with four sessions during the novice test."

### [Issue 22] [`implementation_readiness`, `style`] - Severity: Medium (reviewer's Major)
*   **Members:** IR-M6, ST9-M1, ST9-N4, ST9-N11, IR-N1, ST9-N15.
*   **Affected Scope:** [Lines 405-555](../study-builder.md#L405-L555)
*   **Discrepancy Description:** Only Step 0 is numbered, and the phases aren't split at PR boundaries.
*   ***AI Suggestion:*** PROPOSE FIX — **HELD (D1–D3)** for the exact phase list.
*   ***Proposed Edit:*** Renumber as "Phase N: title". Each phase lists Files, Tests and a Gate, and cites function names rather than line numbers. Rationale moves to one line per phase. Draft order: novice test on the prototype → enroll test on today's code → assignment change (D2) → `structureOf` and lock (D4) → content key, validation and template → [`ratio`, if D1(b)] → [switch, if D3(b)] → model → UI and admin hook → docs.

### [Issue 23] [`style`, `implementation_readiness`] - Severity: Medium
*   **Members:** ST9-M2, ST9-M4, ST9-M5, ST9-M6 (router part), IR-N2, ST9-N5.
*   **Affected Scope:** [Lines 427-468](../study-builder.md#L427-L468)
*   ***AI Suggestion:*** PROPOSE FIX (the parts that don't depend on D1 or D2)
*   ***Proposed Edit:***
    *   **Line 441 (import and clone):** add `(router.mjs:372–381, studyfile.mjs:73–93)`.
    *   **Router "confirm the status is kept":** replace with "No change: `reply` (`router.mjs:33`) already passes `status`, `fields` and `hint`."
    *   **Line 434:** replace "the change lists every type that exports `allocate`" with "Only `multimodal` and `smishing` export `allocate`; smishing defers assignment (`smishing.mjs:180`), so it is unaffected."
    *   **Validation:** split into one bullet per rule. Each gives the field path (`design.randomization.blockSize`, `enrollment.quota.total`, `enrollment.quota.perCondition`) and the exact error text. The share rules follow D1.

### [Issue 24] [`structural`] - Severity: Medium
*   **Members:** ST-1-8, ZO2-15 (missing alternatives).
*   ***AI Suggestion:*** PROPOSE FIX — **HELD (D2–D4)**
*   ***Proposed Edit:***
    *   Add Alternatives for the deferred route vs a call in `enroll` (D2), the lock as a study flag vs derived from records (D4), and no switch (D3), each with the verdict Ben chooses.
    *   Group the Alternatives under UI, Assignment, Scope and Lock.

## Declined (Nits)

These are recorded but not fixed unless Ben asks:

| ID | Reason |
|---|---|
| Stage 5 #10 | Dropout appears as a problem and a non-goal. Harmless. |
| Stage 5 #11, IR-N1 (line refs) | HEAD is still `036c255` (CB confirmed). Issue 22 moves to function names anyway. |
| Stage 6 #15, ST-1-12 | Path style of the Inputs. |
| ZO2-10 | CUJ 5: ten participants. **Cheap: will fix (8 participants) with the batch.** |
| DC-1-15 | Path `types/multimodal-study.mjs`. **Cheap: will fix with the batch.** |
| ST-1-10 | ASCII mock-up alignment. |
| ST-1-11 | No usage numbers. Ben's data; not needed for the design. |
| ST-1-13 | "Approved" beside open questions. **Will fix:** the status becomes "Design approved 2026-11-24; revised after EGM review 2026-11-25." |
| SY-1-5 to SY-1-26 | Wording nits; partly covered by Issue 9. |
| CB-N1, CB-N3, CB-N4, CB-N6, ST9-N6 to N10, N12 to N14 | Detailed-plan wording; folded into Issue 22's rewrite where it touches the same text. |
| IR-N3, IR-N4 | Covered by Issue 23 and Issue 22. |
| IR-N5 | Stray `tests/lab/export-speed.test 2.mjs`. Unrelated to this design: mentioned, not touched. |

## Counts

*   **ESCALATE:** 6 (D1–D4, E-1, E-2).
*   **CONTEST:** 3 (Issues 2, 3 and 4).
*   **PROPOSE FIX:** 20 (Issues 1 and 5–23), plus 3 cheap nits. Of these, Issue 22 is **HELD** and Issues 17 and 23 are partly held.
*   **HELD:** 1 (Issue 24). Issue 22 is also held, as noted above.
*   **DECLINE:** 12 groups of nits.
