# Stage 7: Critic Review

*   **Target:** `docs/designs/study-builder.md`, FeatureRange 1..404 (`main` at `036c255`)
*   **Reviewers:** three Goldfish reviewers ran in parallel, each with no conversation context:
    *   `design_critic`, using `feature-spec-standard.md`. It read the lab source.
    *   `structural`, using `feature-spec-standard.md`. It read only the doc.
    *   `style`. It read only the doc.
*   **Date:** 2026-11-25
*   **Result:** 3 Blockers, 18 Major and 30 Nits after merging (design critic: 2 / 6 / 13; structural: 1 / 7 / 5; style: 0 / 5 / 22). One design-critic Blocker is downgraded to Major below (DC-1-2), so the doc has **2 Blockers**: E1 (unequal shares) and the missing Risks section.

## Elephant notes (checked against the code before filing)

*   **The design critic found E1 on its own.** DC-1-1 reads `allocationList` and the `blockSize % conditions.length` check at `multimodal.mjs:689–691` and reaches the same conclusion as Stage 6 E1: a 2:1:1 block cannot be built. It adds one point that E1 missed. The sim modelled a block list the engine cannot generate, so the sim supports a ratio-aware `allocationList`, not the shipped code. The fix stays as E1 proposes: an optional `randomization.ratio`, or Alternative F.
*   **DC-1-2 is downgraded from Blocker to Major.** The Detailed plan already adds `builder` to `contentKeys` (doc line 452, `multimodal.mjs:592`). The reviewer did not see it because it read only lines 1..404. What remains true is that lines 1..404 call the enroll fix "the only engine change" and never mention the `contentKeys` change or validation of `builder`. Its second point also stands and is open: if `multimodal-admin.js` saves content without `builder`, a canvas study is quietly demoted to the old editor. The doc must say the old editor keeps the key.
*   **DC-1-4 is confirmed.** `deleteParticipant` (`engine.mjs:714–722`) deletes `cond/` and `cond-test/` markers but never `alloc-arm/` slots. An unlock followed by a change of arms or block size leaves the slot counter pointing into the middle of a different list.
*   **DC-1-5 ordering is confirmed.** In `enroll` (`engine.mjs:455–470`), the arm is chosen before `setNew(pKey)`. With `allocate` in that place, a repeated id claims a slot and then finds the participant already exists, so the slot is burnt. The doc's "after the `pKey` existence check" names a check that does not exist. The quota point (allocate ignores quotas) is plausible; I found no quota handling in `multimodal-study.mjs`, but did not trace `allocate` fully.
*   **DC-1-5 "no kill switch" restates Stage 5 finding 2** (gate the enroll fix on `builder`) from the rollback side. With deploys batched at 06:00 and 17:00 ET, a bad enroll fix stays live for up to 11 hours.
*   **DC-1-6 (seed shown to the user) is new and real.** The doc rejects weighted minimization for being predictable, then prints the seed, which reveals the whole sequence to anyone who controls sign-up order.
*   **The structural Blocker (ST-1-1, no Risks & Mitigations) is a placement problem.** The risk material exists in Technical Plan items 4–7 and the Alternatives. Fixing it means a new section that gathers it, plus the security points the critic raised: who may call `deleteParticipant` and `setTest`, who can see the seed, and who can flip the rollout switch.
*   **Not checked:** DC-1-8 (arm-only start questions under deferred assignment) needs a trace of `assignNow` at `engine.mjs:319` against plan building. It is filed as Major and still needs that trace.

## Findings

### Blockers

| ID | Lines | Finding | Suggested change |
|---|---|---|---|
| DC-1-1 | 31, 65–66, 106–112, 231–235, 351–359 | Unequal shares cannot be built by `allocationList`; the sim modelled an impossible list. Same as Stage 6 E1. | Add `randomization.ratio` (second engine change) or fall back to Alternative F and cut CUJ 2. |
| ST-1-1 | whole range | No Risks & Mitigations section. Risks are scattered; security is not covered. | Add the section: enroll-fix effect on running studies, lock holes (DC-1-3, DC-1-4), unlock via delete, seed exposure, switch governance, block-list limits. |

### Major

| ID | Lines | Finding | Suggested change |
|---|---|---|---|
| DC-1-2 | 15, 222–230, 236 | (Downgraded, see notes.) The design sections omit the `contentKeys` change and `builder` validation. The old editor may drop `builder` on save. | Name both changes in the Technical Plan. State that `multimodal-admin.js` keeps `builder`. |
| DC-1-3 | 69–70, 247–252 | `structureOf` omits blocks, the item set and arm-limited questions, so an arm's content can still change after lock. | Decide which of these are structure, and say so. |
| DC-1-4 | 264–265 | Unlocking through `deleteParticipant` or `setTest` leaves `alloc-arm/` slots in place, so the counter points into a different list. | Clear `alloc-arm/` when structure changes while unlocked, or lock on `alloc-arm/` too. |
| DC-1-5 | 236–246, 266–269 | The enroll fix burns slots on repeated ids, bypasses quotas, and switches running studies with no off switch. | Fix the order (read first, or record the slot on the participant). Apply the new path only to studies with no real participants, or gate it on `builder`. |
| DC-1-6 | 234–236, 338–339, 358 | Showing the seed reveals the whole sequence. Predictability for two arms in blocks of 4 was never measured. | Say who can see the seed. Run the two-arm case in the sim. |
| DC-1-7 | 75, 187–188 | `ITEM_FIELDS` includes `kind`, `recordVoice` and others, so the "Differs by arm" panel can break the wording-or-media non-goal. | Whitelist the fields the canvas exposes and enforce it in `check()`. |
| DC-1-8 | 144–148, 171–177, 189 | Unchecked: arm-only start questions may vanish for deferred studies if the arm is not set before the start survey is built. | Trace or test the order. |
| ST-1-2 | 85–91, 149–152 | Open Questions 1 and 2 are answered by the body. "Confirmed" overstates an unrun check. | Close them; use one status wording. Same as Stage 6 findings 1 and 2. |
| ST-1-3 | 71 | Goals still say "stored canvas model". Also raised as DC nit and style 3. Same as Stage 5 finding 6. | Rewrite. |
| ST-1-4 | 66–70, 112–113, 134, 234–235 | CUJ 2 says size 4, the plan says 8. The 100-slot bound is not in the plan. CUJ 5's ten participants is not a full block. | One block-size rule; make CUJ 5 use a multiple of the block. |
| ST-1-5 | 60–64 | The first Goal mixes a usability target, a JSON check and a test plan. The testers are still undecided. | Split it. Put the test under Verification. |
| ST-1-6 | 11–18, 138 | "Changes from the concepts brief" sits before the Overview and assumes the brief. | Move it after Alternatives or into an appendix. |
| ST-1-7 | 286–291, 351–359 | The provenance count of alternatives is wrong; Alternative G says "Not rejected"; alternatives are not grouped by problem. Also raised by style 4 and a DC nit. | Fix the count, use "Reason for Selection", and group them (UI, assignment, scope, lock). |
| ST-1-8 | 138–284 | No alternative weighs how the lock works (study flag, `participants/`-based) or how the switch works. | Add both, with verdicts. |
| SY-1-1 | 15, 227, 395–403 | Decision 4 is retold three times in three vocabularies. | Keep it in the Changes section and Alternative L; point to L from line 227. |
| SY-1-2 | 60–62 | "Wrong turn" is not defined. | Define it as an observable event (an undo or a refused drop). |
| SY-1-3 | 297–301 | Alternative A cites a model the doc calls rigged, and puts a test plan in its rejection reason. Also raised as a DC nit and Stage 5 finding 12. | Label the number as weak and move the four-session test to Open Questions. |
| SY-1-4 | 64, 225–226 | "Runs in the current engine unchanged" and "cannot drift apart" both overclaim. | "Runs with the enroll fix" and "drift is limited to `builder.shares`, which the round-trip check catches". |

### Nits

| ID | Lines | Finding |
|---|---|---|
| DC-1-9 | 254 | Listing every `cond/` key on each save (and `alloc-arm/` on each enroll) is O(N), which Alternative K treats as too slow elsewhere. Use a probe of one key. |
| DC-1-10 | 254–256 | An enrollment between the `cond/` listing and the history write defeats the lock. Acknowledge the window. |
| DC-1-11 | 122–123, 257 | The `afterLock` stamp records no diff, and `contentHistory` does not expose it. Same as Stage 6 finding 18. |
| DC-1-12 | 283 | Where the round-trip failure logs, and what "equals" means (key order, defaults, ids). Same as Stage 5 finding 3. |
| DC-1-13 | 187–190 | Deleting or renaming an arm before lock leaves orphan `conditions` on questions. `compile` should clean or refuse. |
| DC-1-14 | 266–269 | Nothing says who can flip the switch or whether it is audited. |
| DC-1-15 | 150 | Path should be `types/multimodal-study.mjs`. |
| ST-1-9 | 266, 476 | Cross-reference the switch in Components with the Detailed plan's switch section. |
| ST-1-10 | 171–182, 196–207, 220 | The ASCII mock-up's labels are misaligned; the diagram's arrows cross; line 220 may render as a new paragraph. |
| ST-1-11 | 34–56 | No usage numbers back the motivation (studies per year, number of builders). |
| ST-1-12 | 6–7, 53, 87, 149 | Inputs omit `design_draft.md`; path styles and anchors differ for the same code. Same as Stage 6 finding 15. |
| ST-1-13 | 4 | "Approved" sits beside open questions. |
| SY-1-5 to SY-1-26 | various | Wording: subjective problem statements (36–47); one term for the shared section and for layout regions (25–31, 102, 167–171); three versus four changes (142 vs 13); meta-commentary (146–148); vague "drop target that refuses" (189); fragment "Nothing else." (192); "mostly derived" (222); "drifted" with no amount (231); "every … every" (258); "always reduce" (310); unclear parenthetical (323); the 80/20 bullet under the wrong alternative (337); subjective phrases (349, 382); "user" versus "researcher" (116, 120); term drift for arm/condition and test/real participant; duplicate date (4–5). |

## Overlap with earlier stages

*   DC-1-1 = Stage 6 E1.
*   ST-1-2 = Stage 5 finding 2 (status part) and Stage 6 findings 1–2.
*   ST-1-3 = Stage 5 finding 6 and Stage 6 finding 3.
*   ST-1-4 = Stage 5 finding 8 and Stage 6 finding 9.
*   ST-1-7 (G heading) = Stage 5 finding 9 and Stage 6 findings 13 and 16.
*   DC-1-5 (off switch) extends Stage 5 finding 2.
*   DC-1-12 = Stage 5 finding 3 and Stage 6 finding 8.
*   SY-1-3 = Stage 5 finding 12.

New in this stage: ST-1-1, DC-1-3, DC-1-4, DC-1-5 (slot burn, quota bypass), DC-1-6, DC-1-7, DC-1-8, ST-1-8.
