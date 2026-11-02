# Consolidated EGM review: audio-sealing.md (2026-11-01)

Target: [`docs/designs/audio-sealing.md`](../audio-sealing.md). Run unattended for Ben. Nothing is committed.

## How the review ran

| Stage | Reviewers | Report |
|---|---|---|
| Brainstorm | egm-design, egm-zoom-out | [concepts_brief.md](concepts_brief.md) |
| 5 Zoom out | egm-zoom-out | [zoom_out_report.md](zoom_out_report.md) |
| 6 Comprehension | egm-comprehension | [comprehension_report.md](comprehension_report.md) |
| 7 Critic | egm-design, egm-structural | [critic_report.md](critic_report.md) |
| 8 Intermediate zoom out | egm-zoom-out | [intermediate_zoom_out_report.md](intermediate_zoom_out_report.md) |
| 9 Implementation readiness | egm-implementation-readiness, egm-codebase-details | [implementation_readiness_report.md](implementation_readiness_report.md) |

**Departures from the full protocol, for cost (about $10):**
- There were 10 reviewer runs in total, on Sonnet rather than the session model.
- egm-style was left out of Stages 7 and 9.
- The brainstorm used 2 of the 6 lenses.
- Each stage ran once. There was no re-audit.
- Each reviewer got only the document, the persona and standard, and the code paths. They saw none of this conversation.

## Fixes applied (uncontroversial)

| Source | Fix |
|---|---|
| 7-design 1 | The additional data now binds the participant code (the storage key). Openers rebuild it from the storage key and never trust the manifest. The text says A1's binding is not checked at upload. There is a swap test. |
| 7-design 2, 9-ready 2 | A1 envelope checks are specified: a non-degenerate key, `looksLikeAudio` false after the header, and the mime allow-list. The Goals are reworded to "uploads from the lab's own page". |
| 7-design 4 | O1 exposure added to "What This Does Not Protect": a malicious deploy could copy the key while it is loaded, which exposes past data. |
| 7-design 6 | Known-answer vectors and cross tests added. The canary is A1-only and a launch-checklist item (8-zoom 2). |
| 7-design 7, 9-code 7 | Every reader of `heard` is listed, including `checkSummary`, the `checkWord` reply, and the typed path. |
| 7-design 8–10 | The CLI creates files with `wx`/0o600, sanitizes names, and rejects zero secrets. The 20-key limit is noted. The kid is called an identifier, not a fingerprint. |
| 6-comp 1–7 | Added an option legend, a definition of Option B, Ben = PI, and definitions of `kid`, `meta/seal` and `MAX_AUDIO_B64`. Line references were replaced with function names. "Both counts" was fixed. The D2 plaintext copy is now stated. |
| 7-struct 1–4, 8–9 | Added a Risks and Mitigations table and a design-forks table in Alternatives. Renamed Alt-1 to Alt-5. Promoted headings to H2 and fixed heading case. Open Questions now comes after the design. |
| 5-zoom 1, 8-zoom 4 | Decision 2 now says what the whole-call recording adds, that Study 2 has no spoken-answer items (checked: no `recordVoice` in `studies/`), and that A1's extra surface serves only between-turn audio. |
| 5-zoom 7–8, 10 | Line references removed. The no-op `router.mjs` entry removed. The mini-log check moved to Open Questions, to be done before deciding T1. |
| 8-zoom 1 | F1 trimmed to refusing writes plus a pre-launch error. The key-removal block is now an optional extra. |
| 8-zoom 8 | The `pull` command is marked as needed only if the hand-audit set is too large for the tab zip. |
| 9-ready 1, 3, 4, 5, 8, 9 | Added a "Rules settled in review" block: build phases and deploy order, a single mime normalizer, the reply-to-reason table and `_sealFailed` marker, F1 routes and codes, the `meta/seal` shape and `acceptsKid`, and parallel `sealBytes` signatures. |
| 9-ready 6 | The K2 key-wrapping format and tests are specified. |
| 9-ready 7, 11 | Missing test cases added. |
| 9-code 1–6, 8–11 | `recordingTag` goes through `engine.mjs` `publicPlan`, because `publicPlanExtras` cannot see the code. The key checks moved out of `validateContent`, which is synchronous and has no store. Credential headers and URLs corrected (`LAB_TOKEN` does not exist). The size check is defined. Imports are listed and `AUDIO_KEY_RE` is exported. Base64 is standard, not base64url. `bytes` under A1 is defined. The button is "Listen", and a per-row Download is new. |
| Author check | The draft said the participant page knows its study code from sign-in. It does not (`engine.mjs` sign-in returns only a token). The design now adds `recordingTag`. |

New decisions surfaced by review and added to "Decisions for Ben": **7 (F1 fail closed vs F2 warn)** and the **K1/K2** choice inside decision 5. The estimate moved to 3.6–6.25 days.

## Left for Ben (contested or a design choice)

| Finding | Why not applied |
|---|---|
| 5-zoom 2, 8-zoom 7: drop the 24-hour previous-key grace window | The reviewers disagree on its value. It is kept, and it is flagged in Open Questions as contested. Cutting it saves about 0.1 day. |
| 8-zoom 3: drop the A1 envelope heuristics | 7-design asked for them. They are kept, because they cost little under A1 and do not exist under A2. |
| 5-zoom 4: fold `pull` into `scripts/lab/seal.mjs` | This is a code-layout preference. It is better decided once the hand-audit size is known. |
| 5-zoom 5: build only one of O1/O2 | That is decision 4. The plan already builds one path, and O2 removes code. |
| 7-design 3 (full form) and 7-design 5 (offline or 2-of-3 custody) | These are offered as options F1 and K1/K2, not imposed. |
| 5-zoom 6, 8-zoom 6: code-level detail in the implementation plan | It was kept on purpose. Stage 9 asked for more precision, not less. |
| 7-design 6: per-record plaintext SHA-256 | A readable hash of the audio would let someone confirm a guessed recording. Left out. Known-answer vectors and the canary cover the same risk. |

## Not verified

- The mini's `ccair-whisper.log` contents (Open Questions).
- Safari `audio/mp4` round trip.
- The hand-audit set size.
- No code was run. This is a design only.
