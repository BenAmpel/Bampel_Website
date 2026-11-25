# Stage 6: Comprehension Test

*   **Target:** `docs/designs/study-builder.md` (FeatureRange 1..404, DetailedRange 405..555)
*   **Reviewer:** one Goldfish reviewer using the `comprehension.md` persona, with no document standard. It read only the doc.
*   **Date:** 2026-11-25
*   **Result:** the reviewer found no Blockers, 14 Major and 5 Nits. While checking finding 6 against the code, the Elephant found **one Blocker that no reviewer saw** (E1 below).

## What this proposes

(The reviewer's paraphrase.) A drag-and-drop canvas editor for new `multimodal` studies in the CCAIR Behavioral Lab. Researchers drop questions onto lanes, one per session, and add an "Assign to arms" step. Within a session, what differs by arm is limited to the wording or media of the same task item, plus survey questions that only some arms see. Everything below the arms is shared, which is how the arms "rejoin". Unequal shares compile to a permuted-block list. Two server-side fixes ship with it. First, `enroll` starts using the type's `allocate` at session 1. Second, `saveContent` refuses changes to arms, shares, sessions or blocks once a real participant has enrolled. The canvas is not stored; it is rebuilt from the content plus a small `builder: {v, shares}` key. A lab-wide switch hides the canvas but not the two fixes.

## How the existing system works, per this document

(The reviewer's paraphrase.) A study is a JSON "content" object that the engine runs. Each `multimodal` session runs a start survey, then a task made of blocks of items, then an end survey. Arms are `design.conditions`. Survey questions can be limited to some arms through `conditions`. Task items are shared, with per-arm `variants` on some fields. Assignment uses `pickCondition` (minimization) unless it is deferred to a later session. The type's `allocate` function (permuted blocks) is called only on the deferred path, so a block list is ignored at session 1. Participants leave `cond/` markers (real) or `cond-test/` markers (test). `saveContent` validates and writes history, and there is no lock today.

**Does the paraphrase match the intent?** Yes, apart from one gap. The paraphrase says unequal shares "compile to a permuted-block list". The engine cannot do that today; see E1.

## Elephant finding (checked against the code)

### E1. Blocker: the engine's block list cannot produce unequal shares

*   **Where:** the doc says this throughout: Goals, CUJ 2, Technical Plan item 4, Alternative G, and the statement that the enroll fix is "the one engine change". `concepts_brief.md` decision 2 says the same.
*   **Code:** `netlify/lib/lab/types/multimodal-study.mjs:22–27` (`allocationList`). Each block holds "every arm blockSize / arms times" (`per = round(blockSize / arms.length)`). Validation at `types/multimodal.mjs:690` also requires `blockSize % conditions.length === 0`.
*   **Effect:** a 2:1:1 design over three arms with a block of 8 fails validation, because 8 is not divisible by 3. A block of 12 gives 4/4/4, which is equal shares. There is no way to repeat one arm inside a block. The brief's "repeated arms in the list" does not exist in the engine.
*   **What it changes:** unequal shares need a second engine change. The smallest version is:
    *   an optional `ratio` (one whole number per arm) in `design.randomization`;
    *   `allocationList` fills each block with `ratio[i] × k` copies of arm i;
    *   validation checks `blockSize % sum(ratio) === 0` instead of `% arms`.
    
    With no `ratio`, the list is the same as today, so existing studies do not change. The fallback is Alternative F (duplicate Control as two conditions), which needs no engine change but drifts under bursts and puts duplicate arms in exports.
*   **Also:** `builder.shares` then repeats `randomization.ratio`. Store the ratio once, in `randomization` where the engine reads it, and drop `shares` from the `builder` key.

### E2. Major: `'minimize'` is not a valid method (confirms reviewer finding 6)

`types/multimodal.mjs:690` accepts only `method: 'blocks'`. To keep a running study on minimization, Step 0 has to remove `design.randomization` altogether, not set `method` to `'minimize'`. Removing it also removes the study's block list from the admin's allocation table.

## Findings

| # | Severity | Lines | Finding | Suggested change |
|---|---|---|---|---|
| E1 | **Blocker** | Goals, CUJ 2, 231–235, Alt G, 425–436 | The block list cannot hold unequal shares (see above). | Add `randomization.ratio` as a second, backward-compatible engine change, or fall back to Alternative F. |
| 1 | Major | 87–91, 149–152, 543–544 | The session-1 bug is described three ways: "seems", "confirmed by reading", and "still lacks confirmation". The Open Question says "one engine change or none", while the Goals assume the fix. | Use one status throughout: "confirmed by reading the code; the first test confirms it in the engine". |
| 2 | Major | 5, 85–91, 247–265 | The status line says "approved", but the lock trigger is still an Open Question, and the body silently answers it (`cond/` marker). | Close the Open Question with the answer the body uses, or reopen the body. |
| 3 | Major | 71 | The Goals line says "stored canvas model". This is the same as Stage 5 finding 6. | Rewrite it. |
| 4 | Major | 228–229, 266–269, 473–483, 509–511 | The rule for opening the builder appears in three places, and they disagree. Turning the switch off, then on again, has no stated effect on existing builder studies. The admin hook does not mention the switch. | Give one rule in one place. Links to Stage 5 finding 1 (drop the switch). |
| 5 | Major | 236–241, 354, 527 | `allocate`, its slots, `setNew` and the separate test list are used without explanation. | Add three sentences on how `allocate` works. |
| 6 | Major | 244–246, 413–423 | `'minimize'` is not a valid value (confirmed, see E2). Line 245 promises a list of affected studies that the doc does not contain. | Remove `randomization` instead. Say that the list comes from the Step 0 script. |
| 7 | Major | 15, 247–265 | The lock applies to every `multimodal` study, including ones running now that have no `builder` key. Those studies will start refusing saves that change arms, and the doc does not list this effect next to the enroll-fix effect. | List the running studies the lock will affect in Step 0, and state what `structureOf` compares when there is no `builder` key. |
| 8 | Major | 283 | "Logs it" names no destination, and nothing says what the user is told. This is the same as Stage 5 finding 3. | Name the destination and the message, or drop the check. |
| 9 | Major | 111–112, 231–235, 347, 356 | Four limits are never reconciled: the 100-slot cap, "8 or more", the 200-block list and the 12-arm cap. CUJ 2 says size 4, but the plan says 8. | Give one rule with its limits. This changes anyway under E1. |
| 10 | Major | 164–188, 44 | Engine terms are used without definition: `ITEM_FIELDS`, `variants`, `conditions`, `screenOut`, `deferAssignment`, `contentKeys`, block, item, clip library. | Add a short glossary of engine terms near the top. |
| 11 | Major | 19–31, 270–273 | The Overview does not say that the lock affects studies already running. | Merge with finding 7. |
| 12 | Major | 302–319, 338, 357 | "Guess rate" and "predictability" are never defined. | Define them once, where the sim is first cited. |
| 13 | Major | 358 | Alternative G's heading says "Reason for Rejection: Not rejected". The doc also never says what happens after 200 blocks, when assignment falls back to minimization. | Change the heading to "Reason for Selection" and state the 200-block limit (for blocks of 8, that is 1,600 people). |
| 14 | Major | 79, 266, 385–393, 467, 481 | The doc does not say which mechanism enforces "no new builder studies while the switch is off" on the server. | Name the template filter on the server as the enforcement, or drop the switch (see Stage 5 finding 1). |
| 15 | Nit | 7 | The Inputs paths have no parent path. | Make them relative to `docs/designs/`. |
| 16 | Nit | 288 | "The first eleven come from the brief, the last from reading the code", but L is the brief's decision 4. | Reword. |
| 17 | Nit | 56 | "Finishers" is not defined. | Add "people who finish every session". |
| 18 | Nit | 122–123, 257–258 | No UI is listed for the `afterLock` IRB log. | Name where it shows, for example the history list in the admin. |
| 19 | Nit | 502–506 | The glossary's contents are not given. | List the five terms. |

## Overlap with Stage 5

Findings 3, 8, 13 and 14 repeat Stage 5 findings 6, 3, 9 and 1. The consolidated report will merge them.
