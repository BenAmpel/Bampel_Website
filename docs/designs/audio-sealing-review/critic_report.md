# Stage 7: Critic Review (egm-design + egm-structural, Sonnet) on audio-sealing.md lines 1-430

## Design critic (security and correctness)
1. Major: AAD lacks the participant code, so two participants' files for the same item can be swapped and still open; the manifest AAD must not be trusted by open-audio; under A1 the server cannot check the AAD.
2. Major: A1 sealed uploads skip looksLikeAudio, so a client can store plaintext flagged as sealed; check the ephemeral key and reject audio signatures; reword the goal to "conforming clients".
3. Major: fail-open when no key is set, and key removal silently returns to plaintext; refuse recording writes without a key unless an audited owner override.
4. Major: under O1 the private key is loaded into JavaScript Netlify serves; a malicious deploy could steal it and expose past data. "What this does not protect" understates this.
5. Major: key file is a plaintext JWK; second copy on synced OneDrive; passphrase-wrap, offline second copy, re-test before close.
6. Major: browser sealing bugs show only at the hand audit; add known-answer vectors, cross tests, a weekly canary, per-record plaintext hash.
7. Major: T1 consumer list incomplete (checkSummary/checkStatus return heard; checkWord returns raw text to the browser).
8. Nit: CLI file creation with 'wx' 0o600; sanitize filenames; reject all-zero shared secrets.
9. Nit: setSealKey keeps only 20 previous keys.
10. Nit: the 16-hex kid is an identifier, not a fingerprint for detecting substitution.

## Structural
1. Major: no Risks & Mitigations section.
2. Major: the real forks (A1/A2, T1/T2, O1/O2) are not in Alternatives Considered.
3. Major: label collisions (Alternative A/B vs Option B vs A1/A2); Option B undefined at first use.
4. Major: Additional Resources and Future Improvements are H3 without an H2 parent.
5-10. Nits: Alternative E asymmetric; line references without file; "Both counts" has no antecedent; heading case; Open Questions placement; horizontal rules.
