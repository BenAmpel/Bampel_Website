# Sealing Vishing Study 2 recordings and transcripts

* **Author:** Claude (EGM brainstorm, unattended run for Ben Ampel)
* **Date:** 2026-11-01

## Overview

The GSU storage request draft (`Vishing Training - MISQ/GSU data storage request DRAFT 2026-11-01.md`, §4 items 3 and 4) lists two weak points: participant voice recordings are stored unsealed, and transcripts are stored unsealed. Anyone with access to the Netlify site, its Blobs store, or its backup store can play or read them. The lab already seals identifiers and free text with a study public key (`netlify/lib/lab/seal.mjs`, `static/lab/engine/seal.js`). This brief asks how to extend that to audio and transcripts, and what it honestly does and does not protect.

## Analysis

Two Goldfish lenses (design critic, contrarian/YAGNI) reviewed the concept against the code. Their findings, merged:

1. **The boundary is "encrypted at rest", not "the platform never hears the audio".** Each spoken turn is a separate WAV that `callTurn` forwards, readable, through the Netlify function to the lab Mac mini for speech recognition, and the server classifies the raw words for scoring. Nothing in this design changes that, and nothing should: scoring depends on it. Anyone who can change the deployed code can capture live speech. Both reviewers insist the IRB and GSU text say "encrypted at rest with a key the platform does not hold", never "the platform cannot access recordings".
2. **The existing token format cannot carry audio.** `seal.mjs` encrypts `JSON.stringify(value)` and caps a token at 24,000 characters. A 2.7 MB recording needs a binary envelope (same X25519 + HKDF + AES-GCM, raw bytes in, raw bytes out) in both the Node and browser copies.
3. **Browser-side sealing of recordings costs server-side validation.** `mediaUpload` checks the first bytes look like audio (`looksLikeAudio`). Ciphertext cannot be checked. The size cap, per-participant count cap and consent check remain.
4. **Browser-side versus server-side sealing of recordings is a real choice.** The contrarian lens notes that the speech in a whole-call recording has already passed through the server turn by turn, so sealing in the browser adds protection only for speech that is never sent as a turn (off-turn audio: muttering, other people in the room) and for spoken-answer items. Server-side sealing at upload reuses tested code paths and keeps validation, at about half the effort. The design critic accepts browser-side sealing as low risk.
5. **Transcripts are created on the server, so they can only be sealed there.** The reviewers disagree on whether to do it. Sealing `heard` at write closes the backup and viewer-export exposure but breaks three readers: `calls.csv` (becomes tokens, opened by the existing export path), the participant debrief (re-reads `heard`), and LLM phrasing history (re-reads `heard`; Study 2 runs scripted lines only, `llm: false`). The alternative is to leave them unsealed and raise `calls.csv` to manager.
6. **Key loss is the largest new risk.** Once transcripts are sealed, the retained research record (the IRB protocol keeps "the redacted transcript plus the derived measures") is readable only with the key file. Losing it loses the record. Two offline copies and a decrypt test before launch are needed.
7. **Key rotation can orphan an upload.** A participant tab holding the old public key will have its upload refused after a key change. Accept the immediately previous key for a short window.
8. **Bulk retrieval is unsolved today.** The admin tab zips recordings in browser memory. At study scale (up to ~860 × 11 call recordings, ~2 MB each) that will not fit. The hand audit needs only disclosure calls, so a filtered command-line pull is the practical path.

## Goals vs. Non-Goals

* **In-Scope Goals:** sealed storage of whole-call and spoken-answer recordings; a decision on transcripts; admin and command-line opening with the PI's key; failure behaviour; honest IRB and GSU wording; an effort estimate.
* **Out-of-Scope Non-Goals:** keeping per-turn audio from the server or the Mac mini; browser-side speech recognition; re-encrypting data already stored; protecting against a malicious code deploy; moving storage to OneDrive (fallback C, separate design).

## Alternatives Weighed

* **B, provider encryption plus access control and shorter retention only.** Rejected as the whole answer: the lab's own `seal.mjs` header says provider disk encryption "does not protect against someone with access to the site". Kept as a complement (short retention applies either way).
* **C, daily move to GSU OneDrive.** Needs an export-and-delete job that does not exist, and Netlify still holds up to a day of readable audio. Kept as the fallback if GSU insists on OneDrive.
* **Browser-side speech recognition (WASM whisper).** Would keep audio off the server entirely. Rejected: heavy download, lower accuracy, slower turns, and participants could forge their transcript.
* **Browser sends turns straight to the Mac mini.** Removes Netlify from the audio path, but the mini's shared token would have to reach every browser (or be replaced by signed per-participant tokens), and the server would need a signed transcript back. Rejected for this launch as too much new surface.
* **Encrypt LLM history to a Netlify environment secret.** Rejected: an operator-readable key defeats sealing.

## Key Decisions & Staging for Next Steps

Carried to the draft as decisions for Ben (not settled here):
1. Build before launch, or launch on B wording.
2. Recordings sealed in the browser, or on the server at upload.
3. Transcripts sealed at write, or left unsealed with the export raised to manager.
4. Where recordings are opened: the admin tab with the key loaded, or only the command line on the PI's GSU laptop.
5. Key custody: how many copies, and where.
6. Debrief: drop the participant's own lines, or show them from the browser's copy.
