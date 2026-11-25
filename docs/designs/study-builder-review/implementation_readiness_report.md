# Stage 9: Implementation Readiness Test

*   **Target:** `docs/designs/study-builder.md`, DetailedRange 405..555 (`main` at `036c255`; HEAD unchanged, so no cited line has moved)
*   **Reviewers:** three Goldfish reviewers ran in parallel, each with no conversation context:
    *   `implementation_readiness` (IR), which read the doc and the lab source;
    *   `codebase_details` (CB), which checked every file, function and line the plan cites;
    *   `style` (ST9), which read only the doc and applied the zero-decision rule.
*   **Date:** 2026-11-25
*   **Result after merging:** 6 Blockers, 13 Major, 14 Nits. **The verdict is "not implementable cold".** A fresh engineer would have to make design decisions in the enroll change, the lock, the switch and the builder API.

## Elephant notes (checked against the code before filing)

*   **The enroll change is specified against a guard that does not exist** (CB-B1 = IR-B2 = DC-1-5). `enroll` (`engine.mjs:455–470`) picks the arm, then calls `setNew`, and only on failure reads the existing record. `allocate`'s real signature is `allocate(S, p, c)`, and it claims `alloc-arm/NNNNNN` with `{code: p.code}`. The doc says "code and test flag".
*   **Quotas are enforced in `pickCondition`, not in `allocate`.** I confirmed this at `engine.mjs:445–449`: `capped && !test` filters arms through `quotaState`, and `null` means the study is full. That makes CB-M2 real. Moving session-1 assignment to `allocate` would stop both `enrollment.quota.total` and `perCondition` from capping self sign-ups. The doc refuses only per-arm quotas.
*   **The rollout switch can be bypassed** (CB-B3, confirmed). `createStudy` (`registry.mjs:60–64`) accepts any key in `TEMPLATES` directly, so hiding the template from the list does not stop a `create` POST. There are also two `templates` routes, at `router.mjs:371` (owners) and `router.mjs:410` (researchers). If Ben drops the switch (ZO2-5), this whole Blocker goes away.
*   **`order.test.mjs` is the wrong file** (CB-M1, confirmed). It tests question and option shuffling and never touches enrollment. The tests that do touch the block list are `vishing-study2.test.mjs` (`allocationList`, `allocate`, `allocation.csv`) and `smishing.test.mjs`.
*   **The lock error would show as "Request failed (409)"** (CB-M3, confirmed). The error mapper at `static/lab/engine/admin.js:32–41` has no entry for `structure_locked`, and `conflict` is also a 409. The simplest fix is to return a `hint` from the server, which the mapper already shows.
*   **"Stopped at the first key" is false** (CB-N5, confirmed). `blobsStore.list` (`store.mjs:17`) pages through every key. A per-save cost of O(N) markers needs either a new store method or a different lock trigger. ZO2-4's trigger (any `alloc-arm/` slot, or a study flag) avoids the listing.
*   **The style reviewer's suggested Step 0 is wrong.** ST9-M8 proposes `method = 'minimize'` as the default. `'minimize'` is invalid (E2). The real way to pin a study to minimization is to remove `design.randomization`.
*   **Several findings disappear if Ben accepts the Stage 8 decisions:**
    *   *Equal arms only (ZO2-1):* IR-B1 and the share-validation half of ST9-M5.
    *   *Gate on `builder` and use the deferred route (ZO2-2):* IR-B2, CB-B1, CB-B2 and IR-B3 (Step 0), because `assignNow` already runs `allocate` after the record exists and keeps the quota fallback (`engine.mjs:498`).
    *   *Drop the switch (ZO2-5):* CB-B3, IR-M2, ST9-M7 and CB-M7.

    So the Blocker count below overstates the work if those decisions go the reviewers' way.

## Findings

### Blockers

| ID | Lines | Finding | Suggested change | Moot if |
|---|---|---|---|---|
| IR-B1 | 425–436, 451–461 | No step changes `allocationList`, so the 2:1:1 test cannot pass (= E1, DC-1-1). | Add a numbered step for `randomization.ratio`, or cut unequal shares. | v1 has equal arms only |
| CB-B1 / IR-B2 | 427–431 | The enroll change cites a non-existent existence check and the wrong `allocate` signature. A repeat id burns a slot (= DC-1-5). | Read `pKey` first, or claim the slot after `setNew`. Pass `{code: id, test}` as `p`. | deferred route is used |
| CB-B2 | 427–431 | The plan doesn't say that the `fixed` branch (previews, `createTestParticipant`) skips `allocate`. The quota check in `pickCondition` (`engine.mjs:449`) is bypassed for both `total` and `perCondition`. | State both. Keep `fixed` as it is. Either refuse `enrollment.quota` entirely for builder studies, or fall back to `pickCondition` when the study is capped. | deferred route is used |
| IR-B3 | 411–423 | Step 0 has no script, no output table, no merge gate, and uses `'minimize'` (= E2). | Write the script's contract and output. Use "remove `randomization`". | fix is gated on `builder` |
| CB-B3 | 463–467, 476–483 | The switch can't be enforced as written. A direct `create` bypasses the hidden template, there are two `templates` routes, and `builder-flag` has no home. | Check in `createStudy`, filter both routes, and add `builder-flag` to `labRoute` behind `isOwner`. | switch is dropped |
| IR-M6 / ST9-M1 | 407–409, whole range | Only Step 0 is numbered, and steps aren't split at PR boundaries. "Order matters" can't be followed. Promoted to Blocker because two reviewers independently said an implementer can't tell where one change ends. | Number the phases, each with its files, tests and stop gate. Suggested: 0 audit · 1 shares (if kept) · 2 enroll fix · 3 `structureOf` + lock · 4 content key, validation, template · 5 flag (if kept) · 6 model · 7 UI + admin hook · 8 docs. | — |

### Major

| ID | Lines | Finding | Suggested change |
|---|---|---|---|
| IR-M1 / ST9-M3 | 438–449 | The lock is underspecified: "fingerprint" is undefined (make it `JSON.stringify(structureOf(content))`); its place in `saveContent` (after validation, before history); `fields` is undefined; how `afterLock` surfaces; restoring version 0; and the lock applies to running vishing. | Number the sub-steps as ST9-M3 does. Decide the scope (ZO2-4: builder only). |
| CB-M3 | 440, 509–513 | `structure_locked` isn't mapped in `admin.js:34–41`, so the user sees "Request failed (409)". The save path is `admin.js:648–651`, not `multimodal-admin.js`. | Return a `hint` from the server, or add a branch to the mapper. Add `admin.js` to the files to change. |
| CB-M6 / DC-1-4 | 442–444, 528–529 | `setTest` (`engine.mjs:734–740`) and `deleteParticipant` leave `alloc-arm/` slots in place. The lock unlocks while the slot counter stays. | Say that slots are never released and deletes never unlock (ZO2-4), or say how slots are cleared. |
| IR-M2 / ST9-M6 / ST9-M7 | 463–485 | The flag route has no method, body or response. The study-scoped switch can't reach `lab-registry`. "Switch" means two things (`content.builder` and `settings/builder`). Line 510 never reads the rollout switch, which contradicts line 481. No audit. | Drop the switch (ZO2-5). If it is kept, give the route contract and the stored shape `{on: boolean}`, and name the two mechanisms separately. |
| CB-M7 | 466 | `multimodal.test.mjs:158` asserts the templates list, and the filter has no test. | Test the template list with the switch on and off, plus a refused direct `create`, if the switch is kept. |
| IR-M3 | 469–474 | The template has no literal content, key or blurb. `templates.test.mjs` doesn't exist and hasn't been verified. One template is called by two names (lines 466 and 471). | Write the template JSON in the doc, or point to a fixture. Use one name. |
| IR-M4 / ST9-M9 | 489–506 | `compile`, `decompile` and `check` have no signatures or return shapes, and the reasons aren't an enum. Builder-owned fields aren't listed. How `builder.js` is loaded is unspecified. No UI tests. | Put the canvas shape in a code fence. List the fields `compile` may replace. Define `check` as returning `[{code, message}]`. |
| CB-M5 / ZO2-8 | 489–506 | `mountDesigner` (`admin.js:882–897`) already lazy-loads `canvas.js` and `canvas.css`. `canvas.test.mjs` already runs a browser module under `vm` with no DOM. | Follow both patterns, and say how `builder.js` relates to `LabCanvas`. |
| CB-M4 / IR-M5 / ST9-M10 | 507–513 | "One hook" is really several changes: the subtabs are a static array (`multimodal-admin.js:261`), and the default subtab logic is at `admin.js:247`. The round-trip check is used before it is defined (line 519). The note text isn't given. | List the edits. Define the round-trip check where it is first used. Reuse `A.started` for the lock banner. |
| CB-M1 / ST9-M11 | 515–533 | `order.test.mjs` is the wrong file. The new enroll test should copy the harness from `vishing-study2.test.mjs`. The path of the reference fixture is missing. The list of "designs v1 cannot run" isn't given. "Write first" comes after the code. | Name `vishing-study2.test.mjs` and `smishing.test.mjs`. Give `tests/lab/fixtures/builder/…`. List unsupported designs in a table. |
| IR-M7 / ST9-M12 | 541–555 | The verification steps aren't runnable. Item 1 has no assertion or seed. `run.mjs` counts per file, not per test, so the baseline count is undefined. Manual steps are subjective. The novice test has no owner. Post-launch "watch" has no command. No concurrency method (memstore has `lossyCas`). | Label each item with its phase and pass criterion. Use `allocation.csv` (`multimodal.mjs:575–581`) for the post-launch check. Name the novice-test owner. |
| ST9-M2 / ST9-M4 / ST9-M5 | 427–461 | Claims are stated without sources: "saves are rare"; "import and clone never meet the lock". Validation bundles three checks with no field paths or error text. "The rule in the Technical Plan" is a bare cross-reference. | Give field paths, the exact error text, and a code reference for each claim. |
| ST9-M8 | 411–423 | Step 0 doesn't say who gets the report, the default if Ben doesn't answer, or where the decision is recorded. | Covered by IR-B3. Note that the reviewer's suggested default (`'minimize'`) is invalid. |

### Nits

| ID | Finding |
|---|---|
| CB-N1 | Round-trip and clone tests belong in `studyfile.test.mjs`. `studyfile.mjs:37` uses `contentKeysFor`, so no `studyfile.mjs` change is needed. |
| CB-N2 | Use the existing `allocation.csv` route instead of a bespoke allocation table (Step 0, verification 5). |
| CB-N3 | `tests/lab/fixtures/builder/` is a new directory. Today `fixtures/` holds only `import/`. |
| CB-N4 / ST9-N10 | The admin guide is `static/lab/guide/index.html`. Name the section. |
| CB-N5 | `list` paginates fully, so "stop at the first key" needs a new store method, or drop the wording (see Elephant notes). |
| CB-N6 | Step 0: study `type` comes from `registry.list('studies/')`, and content is at `content/current`. |
| IR-N1 / ST9-N3 | Cite function names, not line numbers (enroll is actually about 455–472). |
| IR-N2 / ST9-N5 | Write the `allocate` audit result into the plan: only `multimodal` and `smishing` export it (confirmed by CB). Drop "the one engine change". |
| IR-N3 | The quota refusal isn't defined in validation. |
| IR-N4 | The docs step has no outline. |
| IR-N5 | Stray `tests/lab/export-speed.test 2.mjs`. Unrelated to this design, but it will run under `run.mjs`. |
| ST9-N1 / N2 | Term drift: rollout switch / builder marker, form / existing / current editor, real / non-test, marker / `cond/` key. "Type" is used for both study type and item kind. |
| ST9-N4 / N11 / N12 / N13 / N15 | Structure: the switch is used before it is defined; heading levels are uneven; a passive voice approval line; whether the quoted UI strings are exact; Rationale sub-bullets break the scan path. |
| ST9-N6 / N7 / N8 / N9 / N14 | Wording: "never learns what an arm is"; "runs in node" is unverified; "colours"; "green"; "under bursts". |

## Confirmed correct by `codebase_details`

The reviewer confirmed these citations:

*   `enroll` and `assignNow`; `saveContent` at `content.mjs:366`, and `restoreContent` (394) calling it.
*   `contentKeys` at `multimodal.mjs:592` and validation at 688–691. `structureOf` does not exist yet.
*   `router.mjs` `reply` already passes `status` and `fields` through, so that step is a no-op.
*   Only `multimodal` and `smishing` export `allocate`.
*   `settings/` is unused, and `lab-registry` is the right store. `labOwner` exists.
*   The `alloc-arm/` prefixes, the `npm run test:lab` runner, and the `memStore` and `memBlobs` exports.
*   There are no name collisions for `builder*`, `structure_locked` or `afterLock`.

## Overlap with earlier stages

*   IR-B1 = E1 = DC-1-1 = ZO2-1.
*   CB-B1 / IR-B2 = DC-1-5 (slot burn). CB-B2 extends DC-1-5 (quota bypass), now confirmed in code.
*   IR-B3 = E2 = Stage 6 finding 6.
*   CB-B3 / IR-M2 / ST9-M7 = Stage 5 finding 1, Stage 6 findings 4 and 14, ZO2-5, DC-1-14.
*   IR-M6 / ST9-M1 = ZO2-6 and Stage 5 finding 7 (order).
*   IR-M1 = DC-1-3, DC-1-9, DC-1-10, Stage 6 finding 7.
*   CB-M6 = DC-1-4 = ZO2-4.
*   CB-M5 = ZO2-8 = Stage 5 finding 3.
*   ST9-N1 = SY-1 term drift.

**New in this stage:**

*   CB-B2's quota bypass, now confirmed in code.
*   CB-B3: the `createStudy` bypass and the two routes.
*   CB-M3: the unmapped 409 in `admin.js`.
*   CB-M1: the wrong test file.
*   CB-M4: the subtab wiring.
*   CB-N5: `list` doesn't stop at the first key.
*   IR-M3: the template has no content.
*   IR-M7: the verification plan isn't runnable.

## What would make the plan implementable cold

1.  Ben answers the four Stage 8 decisions. Each answer removes or narrows Blockers, as listed above.
2.  Rewrite 405..555 as numbered phases with files, tests and gates.
3.  Specify the enroll change, the lock and the builder API exactly, using the signatures and paths confirmed here.
