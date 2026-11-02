# Stage 9: Implementation Readiness (egm-implementation-readiness + egm-codebase-details, Sonnet)

## Implementation readiness (verdict: not ready before fixes; no Blockers)
1. Major: no phases, checkpoints or deploy order (sealed-aware readers must ship before sealed writes).
2. Major: upload envelope checks under-specified (which key check, which signatures, which mime list).
3. Major: mime normalization undefined; a mismatch makes files unopenable.
4. Major: F1 has no routes, codes or messages; setSealKey not listed.
5. Major: acceptsKid depends on replacedAt and the meta/seal shape, not stated.
6. Major: K2 has no file entry, KDF or format.
7. Major: test plan misses F1/F2, recordingError cleaning, 409, D1/D2, admin rows, .sealed fallback, CLI safety, credential not printed.
8. Major: participant marker shape, reply-to-reason mapping and retry location unspecified.
9-11. Nits: sealBytes signatures differ; CLI manifest/extension map/route paths not inline; pilot "not sealed" listing and checkSummary have no entry.

## Codebase accuracy (no Blockers; most claims verified)
1. Major: publicPlanExtras(plan) cannot see the participant code (engine.mjs:299, plan built at :286); engine.mjs must change.
2. Major: validateContent(c, type) is synchronous and cannot see the study key (content.mjs:325).
3. Major: LAB_TOKEN does not exist; owner key uses x-admin-key, accounts use Authorization: Bearer; URL /api/lab/<study>/admin/<route>.
4. Major: size cap contradiction (MAX_AUDIO_B64 is checked on the base64 string at multimodal.mjs:447).
5. Major: sealerFor not imported in multimodal.mjs; AUDIO_KEY_RE not exported.
6-11. Minor: base64 variant (seal.js b64e is base64url; mediaUpload accepts standard only); checkWord typed path (:399); previous[-1] notation and key-off shape; bytes under A1; admin button is "Listen" with no per-row Download; scripts/lab/seal.mjs imports and argv handling.
Verified: MAX_TOKEN, INFO, MAX_BODY, MAX_AUDIO_B64, 40-file cap, looksLikeAudio, route roles, audit call, setSealKey slice(-20), backup prefixes, sealsOn/sealOut/checkSealing, LabSeal.loaded, npm scripts.
