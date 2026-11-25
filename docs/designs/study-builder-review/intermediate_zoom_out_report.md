# Stage 8: Intermediate Zoom Out Review

*   **Target:** `docs/designs/study-builder.md`, the whole file (lines 1..555; the doc has not changed since Stage 5)
*   **Reviewer:** one Goldfish reviewer with no conversation context, using the `zoom_out.md` persona and `zoom-out-standard.md`. It also read the Stage 5, 6 and 7 reports and the lab source.
*   **Date:** 2026-11-25
*   **Result:** 3 Blockers, 6 Major, 6 Nits. The reviewer's verdict is that v1 still holds together but should be cut down, not that it should be abandoned.

## The reviewer's recommendation, in short

1.  **v1 ships equal arms only.** Unequal shares move to a v1.1 that adds `randomization.ratio` as its own engine change. This removes E1 from v1, along with CUJ 2, `builder.shares`, the 2:1:1 fixtures and the block-size conflicts.
2.  **The enroll fix and the lock apply only to studies with `content.builder`.** The reviewer's preferred mechanism is to send builder studies through the existing deferred assignment path rather than add a second `allocate` call in `enroll`. Running studies then do not change at all, and Step 0 goes away.
3.  **Drop the rollout switch.** Once the engine changes are gated on `builder`, the switch protects only the canvas UI, and the template already does that.
4.  **New order:** run the enroll test against today's code, then the novice test on the prototype, then the gated engine changes, then the builder.
5.  **Add the Risks & Mitigations section.** With 1–3 done, it is short.

## Elephant notes (checked against the code)

*   **The deferred-path route (B2) is real and is the simpler fix.** `engine.mjs:490–494`: the comment on `deferAssignment` reads "the arm is chosen when session 1 starts". `assignNow` (`engine.mjs:495–497`) already calls `S.type.allocate` first and falls back to `pickCondition`, and `engine.mjs:318–319` runs it only when `!p.condition`, so repeat calls are safe. That removes DC-1-5's burnt-slot problem, since the participant record exists before a slot is claimed.
    *   **The catch:** today `deferAssignment` is a fixed property of the type, not something read from the content. Making it depend on `content.builder` is a small change to `deferred()`, but it is still an engine change. The doc would describe it as "the enroll fix, done by deferring", not "no engine change".
    *   **A side effect:** the arm is chosen at the start of session 1, not at sign-up. People who sign up and never start hold no arm and claim no slot. That is better for balance, but the participant list shows no arm until they start. The lock trigger then has to include non-test `participants/` records, as lines 262–263 already describe for deferred studies.
    *   **DC-1-8 is likely settled by the same code.** At `engine.mjs:314–319` the gate check reads the plan, then `assignNow` runs, before the session's plan is created. So the arm exists when the start survey is filtered. This is still to be confirmed by a test.
*   **Two recommendations reopen decisions Ben made on 2026-11-24.**
    *   Gating the fix on `builder` reverses decision 4, "the lock and the enroll fix apply to every `multimodal` study".
    *   Equal arms only for v1 narrows the brief's goal, "unequal shares are possible".
    *   Neither can be applied as an edit without Ben's answer. Both are listed as decisions below.
*   **The templates hold no `randomization`.** The reviewer's grep found none, and so did mine. So Step 0 may find no running blocks studies at all, but the live studies are in the store, not in templates, so this does not prove it.
*   **M1's lock proposal ("lock on any `alloc-arm/` slot or non-test participant; never unlock on delete") fixes DC-1-4 and the O(N) listing (DC-1-9) together.** It replaces the doc's rule of unlocking when the last `cond/` marker is deleted with an owner-only "reset study".

## Findings

### Blockers

| ID | Lines | Finding | Suggested change |
|---|---|---|---|
| ZO2-1 | 31, 65–66, 106–112, 231–235, 351–359 | Unequal shares are the cause of the second engine change, E1, DC-1-6 and the block-limit findings. Yet the doc itself says most studies use equal arms (line 305). | v1 ships equal arms only, and `randomization.ratio` goes to v1.1. If Ben wants unequal shares in v1, take `ratio` (about 10 lines, backward compatible) rather than Alternative F. **Needs Ben's decision.** |
| ZO2-2 | 236–246, 266–269, 411–436 | The enroll fix adds a second `allocate` call site in the wrong place, applies to every running study, and cannot be rolled back quickly. | Make `deferred()` true for builder studies with blocks and reuse `assignNow`. At the least, gate on `content.builder`. That removes Step 0 and E2. **Reverses decision 4; needs Ben's decision.** |
| ZO2-3 | whole doc | No Risks & Mitigations section (= ST-1-1). | Add it: the enroll gate and rollback, lock holes, seed exposure, who may delete or move participants, who may flip the switch. |

### Major

| ID | Lines | Finding | Suggested change |
|---|---|---|---|
| ZO2-4 | 69–70, 247–265, 438–449 | The lock does not deliver "frozen after the first real participant" (DC-1-3, DC-1-4, DC-1-10). | Lock on one `alloc-arm/` slot or one non-test participant. Never unlock on delete; add an owner-only reset. Apply it only to builder studies. |
| ZO2-5 | 266–269, 476–485 | With the engine changes gated, the switch guards only the UI. Strengthens Stage 5 finding 1. | Drop it, or state and test the off state. |
| ZO2-6 | 62, 407, 550–553 | The order of work contradicts itself, and the cheapest evidence (the novice test) comes after engine work. | Enroll test on today's code, then the novice test, then the gated engine changes, then the builder. Choose the testers before the novice test. |
| ZO2-7 | 222–230, 452, 509–511 | The old editor may strip `builder` (= DC-1-2). | Say it keeps the key, and test it. |
| ZO2-8 | whole doc | `canvas.js` (867 lines) is not mentioned (= Stage 5 finding 3). | Say what is reused or why nothing is. |
| ZO2-9 | 234–236 | The seed is shown to the researcher (= DC-1-6). This holds even with equal arms. | Show the list and seed only to lab owners. |

### Nits

| ID | Lines | Finding |
|---|---|---|
| ZO2-10 | 133 | CUJ 5: ten participants is not a full block; use eight or twelve. |
| ZO2-11 | 231–235 | With equal arms only, the block rule becomes "arms × 2 at least"; drop the 100-slot and 8-or-more wording. |
| ZO2-12 | 87–91 | Close Open Questions 1 and 2, which the body already answers. |
| ZO2-13 | 358 | Rename Alternative G's "Reason for Rejection". |
| ZO2-14 | 15, 71 | "Stored canvas model" wording. |
| ZO2-15 | Alternatives | Add: reuse of the deferred path; lock as a study flag vs derived from records; no switch. |

## How Stages 6–7 change the urgency of earlier findings

*   **More urgent:**
    *   Stage 5 finding 2 (gate the fix): now ZO2-2.
    *   Stage 5 finding 4 (lock trigger).
    *   Stage 5 finding 7 (order).
    *   Stage 5 finding 6 (wording).
    *   Stage 6 E2 (`'minimize'`, which would break Step 0 as written).
    *   DC-1-4 and DC-1-5.
*   **Moot if v1 is equal arms only:**
    *   Stage 6 finding 9 (four block limits).
    *   Stage 5 finding 8 (CUJ 2).
    *   ST-1-4.
    *   The predictability half of DC-1-6.
*   **Unchanged:** Stage 5 findings 5 and 9–12.

## Decisions this stage puts to Ben

1.  Should v1 offer equal arms only, with unequal shares in v1.1 (`randomization.ratio`)? Or should v1 add `ratio` now?
2.  Should the enroll fix and the lock apply only to builder studies (reversing decision 4)? If so, should the fix route through the deferred path or add a gated call in `enroll`?
3.  Should the rollout switch be dropped?
4.  Lock rule: should the trigger be one slot or one real participant, and should a delete never unlock, with an owner-only reset instead?
