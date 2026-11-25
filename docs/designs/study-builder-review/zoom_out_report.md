# Stage 5: Initial Zoom Out Review

*   **Target:** `docs/designs/study-builder.md` (lines 1..555, `main` at `036c255`)
*   **Reviewer:** one Goldfish reviewer with no conversation context, using the `zoom_out.md` persona and the `zoom-out-standard.md` standard. It had read access to the brief, the sims and the lab source.
*   **Date:** 2026-11-25
*   **Result:** no Blockers, 8 Major, 4 Nits. The reviewer checked the doc's claims against the code. It confirmed them: `enroll` skips `allocate`, `assignNow` calls it only on the deferred path, `allocate` needs only `code` and `test`, and `labOwner` exists.

## Elephant notes (checked against the doc before filing)

*   **Finding 5 (altitude) is right only for lines 1..404.** EGM's draft format requires a Detailed Implementation Plan. File and line references belong in lines 405..555, and Stage 9 reviews that range. The valid part is that the Technical Plan (lines 231–235) carries sim percentages and a formula that the Detailed plan could hold instead.
*   **Finding 8 is confirmed.** Line 110 (CUJ 2) says "a permuted-block list of size 4 ... or a multiple of it". Line 231 then sets the default to 8 (4 × 2). The CUJ should say 8.
*   **Finding 6 is confirmed.** Line 71 still says "a stored canvas model". Ben rejected that model on 2026-11-24 (decision 1 at the top of the doc).
*   **Finding 2 reopens a decision Ben made.** Ben chose to apply the enroll fix to every `multimodal` study (decision 4). The reviewer's narrower option is to gate the fix on `content.builder`. That is a real alternative the doc never weighs, so the doc should either record why it was rejected or put the question to Ben again.

## Findings

| # | Severity | Lines | Finding | Suggested change |
|---|---|---|---|---|
| 1 | Major | 266–269, 476–485 | The rollout switch (`settings/builder`, `builder-flag` route, template filter) duplicates the gate the `builder` key already gives each study. It also creates an untested state: builder studies exist while the switch is off. | Drop the switch and let the template be the gate, or state the failure the switch protects against and test the off state. |
| 2 | Major | 87, 149–150, 244–246, 411–423 | The enroll fix changes live assignment for every existing `multimodal` blocks study. Gating it on `content.builder` would avoid Step 0 and the decision per study, and the doc does not weigh that option. Its status is also inconsistent: an Open Question at line 87, a confirmed fact at line 149, and a test still to run in Verification step 1. | Add the narrower option as an alternative with a verdict. Use one status wording: "confirmed by reading, not yet by a test". |
| 3 | Major | 222–230, 283 | The round-trip check becomes the contract for every future canvas feature. Line 283 says a failed check "logs it", but names no destination. The doc never mentions the existing `static/lab/engine/canvas.js` survey designer (867 lines, with drag-to-reorder). | Name where the log goes, or drop the logging. Say what the builder reuses from `canvas.js`, or why it reuses nothing. |
| 4 | Major | 70, 88, 247–265 | The lock trigger is still an Open Question. Deferred studies have a second trigger (any non-test participant record), so a screened-out participant locks the study without the researcher seeing why. The study unlocks when someone deletes the last marker, which is weak protection for structure that matters to the IRB. | Choose one trigger now. Decide whether deleting participants may unlock the study. |
| 5 | Major (partly rejected, see notes) | 231–235, 425–533 | Implementation detail appears at design altitude, and code line numbers will go stale. | Move the sim figures and the formula detail from the Technical Plan into the Detailed plan. Keep the line references in the Detailed plan only. |
| 6 | Major | 71 | The Goals bullet still says "a stored canvas model", which contradicts the derived-canvas design. | Change it to "the canvas is rebuilt from the content plus the `builder` key, checked by golden-file tests". |
| 7 | Major | 60–62, 407, 550–553 | The order is unclear. The novice test is "before engine work" (line 62), but line 407 says the enroll fix and the lock go first. | State one order. For example: enroll fix and lock (they stand alone), then the novice test on the prototype, then the builder. |
| 8 | Major | 110, 231 | CUJ 2 says a block of size 4. The Technical Plan sets the default to 8. | Make CUJ 2 say 8 (C, C, T1, T2, twice). |
| 9 | Nit | 288, Alt G | Alternative G is chosen but sits under the heading "Reason for Rejection: Not rejected". | Change the heading to "Reason for Selection". |
| 10 | Nit | 54–56, 83 | Uneven dropout is covered twice, once as a problem and once as a non-goal. | Optional: cut one. |
| 11 | Nit | 6 | Line references depend on `036c255`. | Check them again before the change lands. |
| 12 | Nit | 297–298 | The keystroke model is described as rigged in favour of lanes, yet its numbers are still used as evidence. | Drop the numbers or drop the caveat. |

## Raw reviewer report

The reviewer's report is reproduced in full below, so the table can be traced back to it.

> **Overall (reviewer's words, summarized):** the design is sound in direction, and there are no Blockers. Before approval, it needs: gate the enroll fix on `builder` or justify not doing so (2); drop or justify the rollout switch (1); make the Goals text match the derived-canvas design (6); settle the lock trigger and the unlock rule (4); mention `canvas.js` (3); and cut the file- and line-level detail in the design sections down to interfaces (5).
