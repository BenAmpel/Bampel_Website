# Stage 6: Comprehension Test (egm-comprehension, Sonnet) on audio-sealing.md

## What this proposes
Encrypt ("seal") participant audio and optionally call transcripts before they sit in Netlify storage, so nobody with Netlify access can read them without the study private key held by the PI. Recordings use a new binary envelope mirroring the text-token scheme, sealed in the browser (A1) or on the server at upload (A2); transcripts sealed by the server (T1) or left readable with tighter access (T2); the PI opens recordings in the admin tab (O1) or only by CLI on a laptop (O2). Ben chooses before launch, and the IRB and GSU text change to match.

## How the existing system works, per this document
The platform already seals identifiers and free text to a per-study public key (seal.mjs). Recordings are plain base64 under audio/; redacted transcripts (heard) are plain under calls/, exported to viewers in calls.csv and copied hourly to the backup (audio is not). Each spoken turn goes browser -> Netlify function -> lab Mac mini for transcription and scoring, readable by design.

## Findings
1. Major: option labels (A1/A2, T1/T2, O1/O2, D1/D2, Option B) used before definition; Option B defined only in the IRB protocol. Add a legend.
2. Major: undefined terms (Mac mini/whisper/Funnel, requireBrowser, LabSeal, hand-audit set, disclosure calls, shift call, Prolific ID, role order, "storage request §4 item 3"). Add a glossary.
3. Major: what a whole-call recording contains beyond per-turn audio is not stated.
4. Major: meta/seal, previous, replacedAt, kid not introduced; grace rule ambiguous about which previous key.
5. Major: line references into code give no file and collide with this document's line numbers.
6. Major: "Both counts appear as sealedHere" undefined; D2 plaintext copy in the browser not reconciled with T1; sessionStorage key format inconsistent.
7. Major: AAD index/session fields not explained; MAX_AUDIO_B64 used before its definition.
8. Nit: effort totals consistent.
9. Nit: say Ben is the PI.
10. Nit: router.mjs entry is a non-change.
11. Nit: relative links to the brief and report not checked.
