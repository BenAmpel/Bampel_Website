# Sealing participant audio and transcripts (Vishing Study 2)

*   **Author:** Claude, for Ben Ampel (EGM unattended run)
*   **Status:** Decisions recorded by Ben on 2026-11-01. Built on branch `lab/audio-sealing` on 2026-11-01; see [Build notes](#build-notes).
*   **Date:** 2026-11-01
*   **Code read:** `main` at `354bfaf`

--------------------------------------------------------------------------------

## Decisions for Ben

**Decided 2026-11-01 (Ben, in session):**

| # | Decision | Choice |
|---|---|---|
| 1 | Build before launch | **Yes, before launch** |
| 2 | Where recordings are sealed | **A1, in the browser** |
| 3 | Transcripts | **T2, readable; `calls.csv` raised to manager** |
| 4 | Where recordings are opened | **O1, the admin tab (key loaded) and the CLI** |
| 5 | Key custody | **K1 and K2: the laptop, an offline drive, and a passphrase-wrapped copy on GSU OneDrive** |
| 6 | Debrief | Not applicable (T2): the debrief is unchanged |
| 7 | No study key | **F1 plus the key-removal block (owner confirmation, audited)** |
| Contested | 24-hour previous-key window | **Kept** |

**Estimate for this configuration:** about 6.35 working days. That is A1 + T2 (5.35), K2 (0.5), and F1 with the block (0.5). It does not include the IRB and GSU text edits.

**What the choices remove from the plan below:**
*   Every T1 item: transcript sealing, debrief D1/D2, the LLM-history change, and the `checkWord`/`checkSummary` sealing.
*   The O2 branch.

### Build notes

Where the build differs from the plan below, and why:

1.  **F1 refuses recording uploads only.**
    *   It does not refuse call turns or `checkWord`.
    *   Under T2, turns are not sealed, so refusing them would stop calls without protecting anything.
2.  **The Recordings list does not show each row's sealed state.**
    *   The store's `list` returns keys only. Reading every multi-MB record to show its state would not scale.
    *   A row shows "sealed with key …", or "(not sealed)" for a pilot recording, when it is fetched (Listen or Download). The tab's header line shows the study key.
3.  **K2 uses PBKDF2-SHA256 (600,000 iterations), not scrypt.**
    *   WebCrypto has no scrypt, and the Encryption tab must open the wrapped copy too.
    *   The format is `ccair-lab-key-wrapped-v1`.
4.  **The A1 envelope check uses long container signatures only:** WebM, Ogg, RIFF, `ftyp` and ID3, at the start and after the 44-byte header.
    *   `looksLikeAudio` also matches the 2-byte MP3 frame sync. Random sealed bytes match that about once in 2,048 uploads, so it would have refused real recordings.
5.  **`recordingTag` reaches the type through the `state` argument.**
    *   `publicPlan` passes `state` (now with `code`) to `publicPlanExtras(plan, state)`. No other type uses it.
6.  **Added the export column `recording_error`,** so missing recordings can be counted from the data, and documented it in the codebook.
7.  **Tests:**
    *   70 lab test files pass, including the new `recordings-cli.test.mjs`.
    *   The in-app browser (WebKit) sealed a recording that the server accepted. `pull` plus `open-audio` returned it byte for byte. A readable upload was refused (`seal_required`).
    *   The Recordings tab showed the sealed message without the key, and played the recording after the key file was loaded through the Encryption tab's file input.
    *   **Not yet checked:** a real microphone recording on Chrome, Firefox and Safari, and the mini's whisper log.

The options as they were presented follow.

Each decision lists its options without a ranking. The effort figures come from the [estimate](#effort-estimate). Ben is the PI throughout.

**Option labels.**

| Label | Meaning |
|---|---|
| A1, A2 | Where recordings are sealed: in the browser, or on the server at upload. |
| T1, T2 | Transcripts sealed on the server, or left readable. |
| O1, O2 | Where recordings are opened: the admin tab, or only the laptop command line. |
| D1, D2 | What the participant's debrief shows under T1. |
| Option B | The IRB protocol's name (§9.3) for not sealing: provider disk encryption and access control only. |

1.  **Build before launch?**
    *   **Yes.** 3.6 to 6.25 working days, depending on decisions 2 and 3.
    *   **No.** Launch with Option B wording in the IRB protocol (§9.3): "protected by the provider's disk encryption and access control only", with short audio retention. The GSU security office will probably still raise storage request §4 item 3, which reads "Recordings are not sealed."
2.  **Where are recordings sealed?** (whole-call recordings and spoken answers)
    *   **A1, in the participant's browser.** The server never receives a readable recording file. The server can no longer check that the upload is audio. About 5.25 days.
    *   **A2, on the server at upload.** The function sees the readable file for one request, then stores only ciphertext. Today's checks on the audio stay. About 3.5 days.
    *   Either way, each spoken turn still passes readable through the server to the Mac mini (see [What This Does Not Protect](#what-this-does-not-protect)).
    *   The whole-call recording runs for the whole call (`multimodal.js` starts it when the call screen opens). Each turn clip covers only one "Tap to talk" reply.
    *   So A1 adds protection only for audio that is never sent as a turn: speech or background sound between turns, and spoken-answer items.
    *   Study 2 has no spoken-answer items in its current design. That leaves only between-turn audio.
    *   A1 also brings extra surface: a `recordingTag` field in the plan, envelope checks at upload, and a weekly canary during collection. All of it serves only that between-turn audio.
3.  **Transcripts.**
    *   **T1, seal them on the server when each turn is written.** Viewers and the backup store hold only tokens. A lost key also loses the transcripts, which are the research record the IRB protocol keeps. Adds 1 day.
    *   **T2, leave them unsealed.** Raise `calls.csv` from viewer to manager and state that the backup holds redacted transcripts. About 0.1 day.
4.  **Where are recordings opened?**
    *   **O1, in the admin tab.** This works once the key file is loaded on the Encryption tab, which is how sealed exports open today.
    *   **O2, only from the command line on the PI's encrypted GSU laptop.** The admin tab then plays nothing and saves sealed files.
    *   The participant's browser never holds a private key under either option.
5.  **Key custody.**
    *   How many copies of the study's private key file exist, and where?
    *   One copy means a lost laptop loses every sealed recording, transcript (T1) and Prolific ID (the participant's ID on the Prolific recruiting panel).
    *   Today `keygen` writes the private key as a plain JSON file.
    *   Options for the second copy:
        *   **K1:** a plain copy on offline media (a USB drive kept locked).
        *   **K2:** a passphrase-protected copy, which can then sit on GSU OneDrive. This adds passphrase wrapping to `keygen` and the openers, about 0.5 day.
    *   Either way, test a decrypt from each copy before launch and again before data collection closes.
6.  **Debrief transcript** (T1 only)
    *   **D1, drop the participant's own lines** from the end-of-study debrief and keep the caller's lines and the outcome.
    *   **D2, show them from the copy the participant's browser already received** during the call (kept in `sessionStorage`).
        *   A reload in a new tab loses them.
        *   This is a readable copy of the participant's own words on their own device, held until the tab closes.
7.  **What happens when recording is on but the study has no key?**
    *   **F1, fail closed.**
        *   Recording uploads and turn writes are refused while recording consent is on and no key is set.
        *   The Encryption and Recordings tabs show it as an error before launch.
        *   About 0.25 day.
        *   Optional extra: block removing the key while recording is on, unless the owner confirms, with the confirmation audited.
    *   **F2, warn only.** Show a warning on the Encryption and Recordings tabs, and store plaintext as today.
    *   F2 keeps other lab studies that record without a key working unchanged. F1 makes sealing impossible to switch off by accident during Study 2.

## Overview

The CCAIR Behavioral Lab already encrypts identifiers and free-text answers to a study public key before storing them ("sealed fields", `netlify/lib/lab/seal.mjs`). Participant voice recordings and call transcripts are stored readable.

This design extends sealing to:
*   whole-call recordings and spoken answers;
*   optionally, the stored transcripts.

It uses the same study key and the same opening tools. It is written so Ben can decide whether to build it before Vishing Study 2 launches, and so the IRB protocol (§9.3) and the GSU storage request (§3 and §4) can describe the result accurately.

## The Problem

*   **Recordings.** `mediaUpload` (`netlify/lib/lab/types/multimodal.mjs`) stores each recording as plain base64 under `audio/<code>/s<n>/<item>-<kind>`.
*   **Transcripts.** `callTurn` stores each redacted transcript as plain text in `heard` under `calls/…`.
    *   `calls.csv` exports `heard` to the viewer role.
    *   The hourly backup copies `calls/` to `lab-<id>-backup`. Audio is excluded from the backup.
*   **Who can read them.** Anyone who can read the Blobs stores can play or read both, whatever their study role. That includes a Netlify account member, a leaked Netlify token, or Netlify itself.
*   **Why provider encryption is not enough.** Netlify's disk encryption does not help here. The `seal.mjs` header says so: it "does not protect against someone with access to the site".
*   **Who will notice.** The GSU storage request draft lists both gaps (§4 items 3 and 4). The IRB protocol leaves the choice open (§9.3, §16 item 9).

## Goals

*   No readable participant audio at rest in any Netlify Blobs store once the study key is set, for uploads from the lab's own participant page. This covers whole-call recordings and spoken answers.
    *   Under A1, a participant who tampers with their page could still store their own audio unsealed in a record marked sealed.
    *   The server rejects the obvious cases (see [Recording upload](#recording-upload)).
*   If T1 is chosen, no readable participant transcript at rest either, in the study store, the backup store, or the viewer export.
*   The study public key is the only key the server and the participant's browser ever hold. The private key stays with the PI.
*   The PI can open:
    *   a single recording to listen to it;
    *   the hand-audit set in bulk, on the GSU laptop.
*   Each failure is recorded and visible to the researcher, and never stores plaintext silently:
    *   a browser that cannot seal;
    *   a failed upload;
    *   a wrong or rotated key;
    *   a lost key.
*   The IRB and GSU text can state exactly what is and is not protected.

## Non-Goals

*   Keeping per-turn audio away from the server or the Mac mini. Live scoring needs the words.
*   Speech recognition in the browser.
*   Protection against someone who can deploy code to the site or change its environment. Such a person can capture live audio or swap the public key for future uploads.
*   Re-encrypting values stored before the key was set or rotated. The server cannot read sealed values, and plain pilot data should be deleted instead.
*   Moving storage to GSU OneDrive (storage request fallback 2). That is a separate design.
*   Chunked or streaming uploads. See [Upload size and streaming](#upload-size-and-streaming).
*   Sealing the caller's synthetic voice files (`files/`). They are not participant data.

## What This Does Not Protect

These limits must appear in the IRB and GSU text.

1.  **Per-turn audio and raw words.** Each spoken turn (a WAV of up to about 1.5 MB) goes readable from the browser through the Netlify function to the lab Mac mini, over Tailscale Funnel with TLS and a shared token.
    *   The server classifies the raw words to score disclosure.
    *   Neither the server nor the lab's code on the mini stores this audio.
    *   It is visible in memory to anyone who controls the running code.
2.  **The deployed code and the public key.** Someone who can deploy code, or write `meta/seal` (the stored record of the study's public key and its earlier keys), can capture new audio or point future uploads at their own key.
    *   Under O1, they could also change the admin page to copy the private key the next time the PI loads it on the Encryption tab. That would expose everything sealed in the past.
    *   Under O2, the key is never loaded into a page Netlify serves, so past data stays protected.
    *   The same risk applies today to the existing sealed fields whenever the key is loaded in the admin tab.
    *   To detect a swapped public key, the Encryption tab shows the key ID (`kid`: the first 16 hex digits of the SHA-256 of the public key). The kid is an identifier, not a full fingerprint. To check for a substituted key, compare the full public key with the one recorded in the IRB protocol.
3.  **Metadata.** These stay readable:
    *   recording length, byte size, format, time and participant study code;
    *   call outcomes, intent labels and the count of disclosed digits.
4.  **Decrypted copies.** Once the PI opens files for the hand audit, they are as protected as the place they are saved: the GSU laptop or GSU OneDrive.
5.  **Netlify request logs.** These may hold IP addresses (storage request §4 item 6).

## Critical User Journeys (CUJs)

### CUJ 1: A participant's call is recorded and stored sealed

*   **Given:** the study has a key and `requireBrowser` on; the participant gave recording consent; they are on a supported browser (Chrome 133+, Edge 133+, Firefox 130+, Safari 17+).
*   **When:** they finish a call, and the page uploads the call recording.
*   **Then:**
    *   **A1:** the page seals the bytes before sending. The server checks the envelope (key ID, size) and stores it.
    *   **A2:** the server checks the audio, seals it, and stores only ciphertext.
    *   **Both:** the stored record says it is sealed, with which key ID and by which side. There is no readable copy in any store.

### CUJ 2: The PI listens to one recording

*   **Given:** the PI is signed in as manager or owner, and has the study's key file.
*   **When:** they open "Recordings & calls" and click Listen on a row.
*   **Then:**
    *   **O1:** with the key loaded on the Encryption tab, the tab decrypts the file in memory and plays it.
    *   **O1 without the key:** the row says "Load the study key on the Encryption tab to play".
    *   **O2:** the row offers only "Download sealed file".
    *   **All cases:** the download is written to the audit log (`recording.download`), as today.

### CUJ 3: The hand audit of disclosure calls

*   **Given:** data collection is closed, and the PI has the research export, which flags disclosure calls.
*   **When:** on the GSU laptop, they run `node scripts/lab/recordings.mjs pull`. They give it the site, the study, a list of recording keys made from the export, and an output folder. Then they run `node scripts/lab/seal.mjs open-audio <key.json> <folder> <out>`.
*   **Then:**
    *   The sealed files and a manifest are downloaded (each download logged).
    *   The opened audio is written with mode 600.
    *   The tool reports each file that failed to open, and why.
    *   The private key never leaves the laptop.

### CUJ 4: A browser cannot seal

*   **Given:** `requireBrowser` is on, and the participant's browser has no WebCrypto X25519.
*   **When:** they open the study link.
*   **Then:** they are turned away before consent with "Please use a newer browser". This check already exists (`participant.js` `checkSealing`). No audio is collected.

### CUJ 5: Sealing or upload fails mid-study

*   **Given:** a supported browser.
*   **When:** sealing throws (for example, out of memory), or the upload fails after its retry, or the server refuses the key ID.
*   **Then:**
    *   The participant continues.
    *   The trial is saved with `voice.recorded = false` and `voice.recordingError` set to `seal_failed`, `upload_failed`, `wrong_key` or `seal_required`.
    *   The Recordings tab counts missing recordings by reason.
    *   Plain audio is never sent as a fallback.

## Technical Plan (Architecture)

### Data flow after the change

```text
participant browser                         Netlify function                         lab Mac mini
-------------------                         ----------------                         ------------
spoken turn (WAV) ---- TLS, readable ---->  callTurn: transcribe() -- Funnel+token -> whisper.cpp
                                            classify raw words (scoring)       <---- text (not stored)
                                            heard = redact(text)
                                            T1: heard = seal(heard)  -> calls/<tag>/<seq>
                                            T2: heard stored readable
whole call (webm/ogg/mp4)
  A1: sealBytes(pub) --- TLS, sealed ---->  mediaUpload: check envelope -> audio/<tag>-call  {sealed}
  A2: ------------------ TLS, readable -->  mediaUpload: check audio, sealBytes(pub) -> audio/<tag>-call {sealed}

PI (admin tab, key in tab memory: O1) <---- recording route returns the sealed envelope
PI (GSU laptop CLI)                   <---- recordings.mjs pull -> seal.mjs open-audio
```

### Binary sealed envelope

The text tokens cannot carry audio:
*   `seal.mjs` encrypts `JSON.stringify(value)` and caps a token at 24,000 characters (`MAX_TOKEN`).
*   A recording is up to 2.7 MB.
*   Base64 inside JSON inside base64 would grow it by about 78% and break the 4,000,000-character request cap (`router.mjs` `MAX_BODY`).

So a second, binary form is added beside the text form. It uses the same key pair and the same construction:

| Part | Value |
|---|---|
| Key agreement | A fresh X25519 key pair per file. Shared secret with the study public key. |
| Key derivation | HKDF-SHA256. `salt` = ephemeral public key ‖ study public key. `info` = `ccair-lab-seal-bin-v1`, which differs from the text form's `ccair-lab-seal-v1` so the two forms can never open each other. 32 bytes. |
| Cipher | AES-256-GCM, 12-byte random IV, 16-byte tag. |
| Additional data | UTF-8 of `sealedbin:v1:<kid>:<code>/s<session>/<index>-<kind>:<mime>`, where `<code>/s<session>/<index>-<kind>` is exactly the storage key after `audio/`. Here `<code>` is the participant's random study code, `<index>` is `practice` or `t<n>` (the item's position in the session), and `<kind>` is `call` or `voice`. For example `sealedbin:v1:3f…:k7q2…/s1/t4-call:audio/webm`. A file moved to another participant or item fails to open. |
| Envelope bytes | ephemeral public key (32) ‖ IV (12) ‖ ciphertext ‖ tag (16). That is 60 bytes over the plaintext. |
| On the wire and at rest | base64 of the envelope, in the `data` field the record already has. |

The stored record under `audio/<tag>-<kind>` becomes:

```text
{ at, mime, bytes /* plaintext length */, durationMs,
  sealed: { v: 1, kid, by: 'browser' | 'server' },
  data: base64(envelope) }
```

A record without `sealed` is a legacy plain recording, read as today.

**Where the additional data comes from.**
*   **Openers** (the admin tab and `open-audio`) rebuild the additional data from the storage key and the stored `mime`. They never take it from a manifest or from the server's reply, so a tampered manifest cannot change it.
*   **Under A1**, the browser needs its own study code to build the additional data. Sign-in returns only a token today, so the plan's public extras (`publicPlanExtras`) add `recordingTag`, the `<code>/s<session>` prefix.
    *   This shows the participant their own random study code. That code is their pseudonym, not a secret from them.
    *   The server does not check the additional data at upload: it cannot, without the key. A wrong value shows up only when the file is opened, which is why the [tests](#verification-plan) include known-answer vectors and a canary.

`MAX_AUDIO_B64` (`multimodal.mjs`) is the upload cap in base64 characters: 3,600,000, about 2.7 MB of audio.

### Recording upload

*   **A1 (browser).**
    *   `participant.js` `sealOut` adds the route `media/upload`.
    *   When the study has a key and the browser supports X25519, it decodes `data`, seals the bytes with `LabSeal.sealBytes`, and sends `{ …, sealed: { v: 1, kid }, data: base64(envelope) }`.
    *   `mediaUpload` then accepts the upload only if all of these hold:
        *   the key ID is the current key, or the key it replaced less than 24 hours ago (`meta/seal.previous`);
        *   the decoded length is at least 61 bytes and at most `MAX_AUDIO_B64 × 0.75 + 60`;
        *   the declared `mime` is on the allow-list;
        *   consent, the count cap and write-once rules hold as today.
    *   The server cannot run `looksLikeAudio` (the check that the first bytes are a browser audio container) on ciphertext. Two checks replace it:
        *   the first 32 bytes must be a valid X25519 public key;
        *   the bytes after the 44-byte header must not start with an audio container signature, which catches plain audio flagged as sealed.
    *   The remaining cost is that a participant could store up to 40 junk files of their own. The hand audit would see them, and they affect no score.
*   **A1 fallback.** A plain upload to a study with a key is handled two ways:
    *   if `requireBrowser` is on, the server refuses it (`seal_required`, 400);
    *   otherwise, the server seals it itself (`by: 'server'`).
    *   This mirrors how free text is handled today.
*   **A2 (server).** The browser sends plain audio, as today. `mediaUpload` keeps every current check, then seals with `sealBytes` from `seal.mjs` before `setNew`.
*   **No key.** This follows decision 7.
    *   **F1:** refused.
    *   **F2:** stored plain, as today, with a warning on the Encryption and Recordings tabs: "This study records voices but has no study key: recordings will be stored readable."

### Transcripts (T1 only)

*   **Where they are sealed.**
    *   In `callTurn`, `heard` is sealed with `sealerFor(S)` after classification and redaction. The labels stay readable: `heardIntent`, `digits` and `disclosed`.
    *   In `checkWord`, the stored `heard` is sealed the same way.
    *   The sealer counts the values it seals itself (`sealedHere`), so both transcript paths show up as server-sealed. They are server-sealed by construction, and the docs must not call them end-to-end.
*   **Every reader of `heard`** and how each is handled:
    *   **`callTurn` turn record:** sealed at write.
    *   **`callTurn` LLM history:** see below.
    *   **`debrief`:** see below.
    *   **`calls.csv`:** see below.
    *   **`checkWord` record:** sealed at write.
    *   **`checkSummary`:** copies `heard` from the check records into the trial's server record, so it carries tokens.
    *   **`checkWord`'s reply to the browser:** sends the unredacted text back to the participant who just spoke it, over TLS. Nothing stores it, so it is unchanged.
*   **The LLM phrasing history** (in `callTurn`) can no longer read earlier participant lines. When `heard` is sealed:
    *   the history keeps the caller's lines and the current redacted utterance from memory;
    *   Study 2 is unaffected, because every call has `llm: false`;
    *   a study that uses LLM phrasing gets a slightly different stimulus, so it must re-pilot.
*   **The debrief** (the `debrief` route in `multimodal.mjs`) follows decision 6:
    *   **D1:** the route leaves out the participant's own lines whose `heard` is sealed.
    *   **D2:** in addition, the participant page keeps the `heard` text returned with each turn in `sessionStorage`, keyed by tag and turn number, and the debrief screen fills in the "You:" lines from there.
*   **`calls.csv`** keeps viewer access.
    *   The `participant_said` column becomes tokens.
    *   The admin page already opens tokens in CSV downloads when the key is loaded (`admin.js` `saveFile`).
    *   `scripts/lab/seal.mjs open` opens them on the command line.

### Opening recordings

*   **The browser opener.** `seal.js` gains `openBytes(envelope, aad)`, which returns an `ArrayBuffer`. This can only run where a private key file was loaded: the admin tab.
*   **The Recordings tab (O1).** The existing "Listen" button, and a new per-row "Download" button:
    *   decrypt in memory when `LabSeal.loaded()` matches the record's key ID;
    *   otherwise they say how to load the key, and "Download" saves `<name>.<ext>.sealed`.
*   **"Download all (.zip)"** stays for small sets. It saves sealed files plus `manifest.json` when no key is loaded. At study scale, the CLI is the supported path, because the zip is built in tab memory.
*   **O2.** The tab never decrypts audio. "Listen" is hidden, and Download always saves sealed files.

### Command line

*   **`node scripts/lab/recordings.mjs pull`** is a new script. It downloads sealed recordings into a folder, with a `manifest.json`.
    *   It is needed only if the hand-audit set is too large for the admin tab's zip (Open Questions). If the set is small, it can be left out and built later.
    *   Its options are `--site`, `--study`, `--keys <file>` (one recording key per line, optional; all if omitted) and `--out <dir>`.
    *   Each manifest entry holds the key, mime, byte count, sealed key ID and the additional-data string.
    *   It authenticates with an owner or manager credential. It reads `LAB_ADMIN_KEY` or an account token from the environment, and never prints it.
    *   Each download is audited by the existing route.
*   **`node scripts/lab/seal.mjs open-audio <key.json> <dir> [out]`** is a new subcommand.
    *   It opens every `.sealed` file in the manifest and writes the audio. Each file is created exclusively (`open` with flag `wx`, mode 0o600), so it never overwrites and there is no permissions race.
    *   Output names come only from storage keys that match the recording-key pattern (`AUDIO_KEY_RE`), so a manifest cannot write outside the output folder.
    *   Both openers reject an all-zero X25519 shared secret.
    *   It reports each failure: wrong key ID, a changed file (GCM tag), or a missing manifest entry.

### What the Mac mini needs

*   **Live calls: nothing changes.**
    *   The mini receives each turn's WAV through the gateway, transcribes it, and returns text, as today.
    *   It never receives a sealed file or any private key.
*   **Re-transcribing the hand-audit set** with a larger model is done on the PI's GSU laptop, on the opened files.
    *   If Ben wants it on the mini instead, the opened audio would be stored on the mini.
    *   That makes the mini a storage location for identifiable audio, which the GSU request would have to name.

### Upload size and streaming

*   **Size.**
    *   MediaRecorder records at 24 kbps, so a 10-turn call of 2 to 4 minutes is roughly 0.4 to 0.7 MB.
    *   The cap (`MAX_AUDIO_B64` = 3.6 million base64 characters, about 2.7 MB) allows about 15 minutes.
    *   The envelope adds 60 bytes, so the cap does not change.
*   **Memory.** WebCrypto AES-GCM encrypts a whole buffer in one call. Encrypting 2.7 MB holds about three copies of the file in memory, under 10 MB, which is fine on a phone.
*   **No streaming.** Streaming encryption is not needed at these sizes.
*   **Longer recordings later.** A future study that records longer than about 15 minutes needs both a chunked envelope and a multi-part upload ([Future Improvements](#future-improvements)).

### Key handling

*   **One key pair per study,** as today.
    *   Generate it with `node scripts/lab/seal.mjs keygen` on the PI's GSU laptop.
    *   Paste the public key on the Encryption tab, and turn on `requireBrowser`.
    *   The private key file has mode 600 and is never uploaded.
    *   The admin page can also generate keys, but the laptop route keeps the private key out of any browser.
*   **Custody** follows decision 5. Before launch:
    1.  Make the second copy.
    2.  Seal a test recording from a test participant.
    3.  Open it from each copy.
    4.  Record the key ID in the IRB protocol.
*   **Rotation.**
    *   `setSealKey` keeps earlier keys in `previous`.
    *   New uploads accept the old key ID for 24 hours, so open participant tabs do not lose recordings.
    *   Every old private key file must be kept until the study's data is destroyed. Values are never re-encrypted.
    *   `setSealKey` keeps only the last 20 earlier keys, so the PI's own record of key IDs, not the server, is the full list.
    *   Rotate only between recruiting batches.
*   **Compromise of the private key** exposes everything sealed to it, including Prolific IDs. Rotating stops further exposure only.

### Failure and recovery

| Failure | What happens | Recovery |
|---|---|---|
| Browser has no X25519, `requireBrowser` on | Turned away before consent (exists today) | Participant uses another browser |
| `sealBytes` throws (A1) | No upload. `voice.recordingError = 'seal_failed'` | None for that file. The count shows on the Recordings tab |
| Upload fails after one retry | `voice.recordingError = 'upload_failed'` (today it is silently `recorded = false`) | None for that file |
| Server refuses the key ID (rotation older than 24 hours) | 409 `wrong_key`, recorded as `wrong_key` | Avoid by rotating between batches |
| Plain upload with `requireBrowser` on (A1) | 400 `seal_required` | None. This means a tampered or very old page |
| Mini down during a call | Unchanged: the turn fails with `asr_unavailable` | Unchanged |
| A file fails to open (GCM tag or AAD mismatch) | CLI and tab report it per file | Treat it as altered storage. Check the audit log |
| Private key lost, no second copy | Sealed audio, transcripts (T1) and Prolific IDs are unreadable for good | None. Prevented by decision 5 |
| Private key leaked | Everything sealed to it is readable by the holder | Rotate. Report under the IRB's breach process |
| Plain pilot recordings from before the key | Listed with "not sealed" | Owner deletes them before launch ("Delete all recordings") |

### Export

*   **Research export and wide CSV.** No audio or transcripts, so no change.
*   **`calls.csv`.** T1 gives tokens, opened by the existing export path with the key. T2 gives readable text, manager only.
*   **Recordings.** These are sealed files plus a manifest, from the tab (small sets) or the CLI (study scale).
*   **Backup store.** `audio/` stays excluded. Under T1, `calls/` copies hold tokens.
*   **Deletion** (`recordings-delete`, `purgeParticipant`) works on sealed records unchanged.

### Effort estimate

| Work | A1 (days) | A2 (days) |
|---|---|---|
| Binary envelope in `seal.mjs`, plus cross tests | 0.5 | 0.5 |
| Binary envelope in `seal.js` (seal and open), plus cross tests against Node | 0.5 | 0.25 (open only) |
| Upload path: `participant.js`, `multimodal.mjs` `mediaUpload`, error reasons | 1.0 | 0.25 |
| Recordings tab: play and download decrypt, sealed zip | 0.5 | 0.5 |
| CLI: `recordings.mjs pull`, `seal.mjs open-audio` | 1.0 | 1.0 |
| No-key warning on the tabs, README, CODEBOOK | 0.5 | 0.25 |
| End-to-end check: three browsers, the mini, a 10-minute call, rotation | 1.0 | 0.5 |
| Known-answer vectors (A1 adds the canary procedure to the launch checklist) | 0.25 | 0.25 |
| **Subtotal** | **5.25** | **3.5** |
| T1: transcript sealing, debrief (D1 or D2), LLM history, tests | +1.0 | +1.0 |
| T2: `calls.csv` to manager, plus test | +0.1 | +0.1 |

The totals by combination:

| Combination | Days |
|---|---|
| A1 + T1 | 6.25 |
| A1 + T2 | 5.35 |
| A2 + T1 | 4.5 |
| A2 + T2 | 3.6 |

These are working days of build and test. Add 0.25 day for F1 (decision 7) and 0.5 day for K2 (decision 5). They do not include the IRB and GSU text edits listed below.

## What Changes in the IRB and GSU Answers

If built, these are the replacement statements. If it is not built, the current Option B text stands.

*   **IRB §9.1 table, voice recordings row.**
    *   "Sealed: encrypted to the study key in the participant's browser before upload (A1)" or "…on the server when uploaded (A2)".
    *   Add: "The platform stores no readable copy."
*   **IRB §9.1, transcripts row.**
    *   T1: "Redacted, then sealed on the server when written."
    *   T2: "Redacted; readable to the manager role only."
*   **IRB §9.3.**
    *   Replace the "Gap" bullet and Options A/B with a description of the sealing as built.
    *   Add a sentence on what is not covered: "Each spoken turn is sent, encrypted in transit, through the platform to the lab speech server to be transcribed and scored, and is not stored there."
    *   Add the study key ID and the custody arrangement (decision 5).
    *   Close §16 item 9.
*   **IRB consent.**
    *   "Your recordings are encrypted so that only the research team's key can open them."
    *   Do not say the platform cannot hear the call.
*   **GSU request §3, attachment table.** Same changes as IRB §9.1.
*   **GSU request §3, "Fallbacks offered".** Remove item 1. Under T2, keep item 3.
*   **GSU request §4.**
    *   Item 3 is resolved, with the per-turn limit stated.
    *   Item 4: under T1, resolved for storage and exports; under T2, reduced to manager access.
*   **GSU request §2 email.** Change "I can also seal the recordings in the participant's browser before upload" to a statement that they are sealed. Under A2, say "sealed by the platform when uploaded, with a key it does not hold".

## Risks and Mitigations

| Risk | Mitigation | What remains |
|---|---|---|
| The private key is lost | Two copies (decision 5); test decrypts before launch and before close | None if custody holds; otherwise permanent loss |
| The private key leaks | Opened only on the laptop (O2) or only while loaded in the tab (O1); passphrase copy (K2) | Everything sealed to that key is exposed; rotate and report |
| A malicious code deploy | Out of scope (Non-Goals); a swapped key is detected by comparing the full public key | Live audio and, under O1, the key the next time it is loaded |
| A browser sealing bug (A1) | Known-answer vectors, cross tests, a weekly canary participant (A1 only) | A bug between canaries loses that week's recordings |
| A participant stores plain or junk audio marked sealed (A1) | Envelope checks at upload; the 40-file cap | Their own data only |
| Sealing switched off by accident | F1 (decision 7) | Under F2, plaintext until noticed |
| Hand-audit volume is too large for the admin tab | Command-line pull filtered to disclosure calls | None |
| Transcripts readable on the mini | Check `ccair-whisper.log` (Open Questions) | Unknown until checked |

## Open Questions

*   **Mini logs.** IRB protocol §9.4 still has a `[VERIFY]`: does `~/Library/Logs/ccair-whisper.log` hold transcribed text? If it does, transcripts exist readable on the mini whatever T1 or T2 decides. Check this before deciding T1; it is one command on the mini.
*   **Recording format on Safari.** On Safari, MediaRecorder produces `audio/mp4`. Opening a sealed recording gives back the exact bytes, so this is not a sealing question. It is still worth one manual check that a sealed and reopened Safari recording plays.
*   **Hand-audit size.** The number of disclosure calls is not known until pilot data exists. If it is a few dozen, the admin tab's zip is enough and the `pull` command can wait.
*   **Key grace window (contested in review).** The zoom-out review suggests dropping the 24-hour window for the previous key and relying on "never rotate while recruiting". This draft keeps it; Ben can cut it (it saves about 0.1 day).

## Alternatives Considered

### The design forks (decisions 2 to 4)

| Fork | Option | For | Against |
|---|---|---|---|
| Where recordings are sealed | A1, browser | The server never holds a readable recording file, including between-turn audio | More code in two places; no audio check on upload; needs `recordingTag` in the plan |
| | A2, server | Reuses the server's checks; one implementation | The function sees each recording readable for one request |
| Transcripts | T1, sealed | Nothing readable in storage, backup or viewer export | Key loss loses the research record; debrief and LLM history change |
| | T2, readable to managers | No new failure mode | Readable to anyone with store access, and in the backup |
| Opening recordings | O1, admin tab | Listen in one click | The key is loaded into a page Netlify serves |
| | O2, laptop only | The key never meets a served page | Every listen goes through the command line |

### Alt-1: Provider encryption and access control only (Option B)

*   **Pros:** no build; honest if worded as such.
*   **Cons:** anyone with site or store access can play recordings; the security office has already been told this is a gap.
*   **Reason for rejection:** it does not close storage request §4 item 3. Short retention is kept in every option.

### Alt-2: Daily move to GSU OneDrive, then delete from Netlify

*   **Pros:** the data ends on GSU-approved Sensitive-tier storage.
*   **Cons:** needs a scheduled export-and-delete job that does not exist; up to a day of readable audio on Netlify; OneDrive credentials in an automated job.
*   **Reason for rejection:** more work than sealing and still leaves a readable window. It stays the fallback if GSU requires OneDrive. It can be combined with sealing later, by moving sealed files.

### Alt-3: Speech recognition in the browser

*   **Pros:** no audio leaves the device.
*   **Cons:** a large model download; lower accuracy; slower turns; the participant's page would report its own transcript, which they could forge to change their score.
*   **Reason for rejection:** it harms the experiment's validity and the participant experience.

### Alt-4: The browser sends turns directly to the Mac mini

*   **Pros:** Netlify never relays audio.
*   **Cons:**
    *   It needs per-participant signed tokens at the mini's public gateway, CORS and abuse limits there, and a signed transcript returned for the server to trust.
    *   It exposes the mini to every participant's browser.
*   **Reason for rejection:** this is new attack surface on a machine whose ownership and patching GSU has not yet reviewed (storage request §4 item 5). It is listed as a future improvement.

### Alt-5: Seal LLM history with a server-held secret

*   **Pros:** LLM phrasing keeps the full conversation under T1.
*   **Cons:** the key would sit in Netlify's environment.
*   **Reason for rejection:** a key held by Netlify defeats the purpose of sealing.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security & privacy:** see [What This Does Not Protect](#what-this-does-not-protect) and [Key handling](#key-handling).
    *   The private key is never sent to the server and never stored by a page.
    *   Opened files are written with mode 600.
*   **Performance:** sealing adds about 50 ms in the browser for a 2.7 MB file. It runs after the call ends, so it does not affect turn latency.
*   **Rollout and rollback:**
    *   Sealing applies only when the study has a key.
    *   Readers accept both sealed and legacy plain records, so turning sealing off (removing the key) breaks nothing. Under F1 it is blocked while recording is on, unless the owner confirms.
    *   Records sealed before that stay sealed.

--------------------------------------------------------------------------------

## Additional Resources

*   [Brainstorm brief](audio-sealing-review/concepts_brief.md) and [review report](audio-sealing-review/consolidated_review_report.md)
*   `netlify/lib/lab/seal.mjs`, `static/lab/engine/seal.js`, `scripts/lab/seal.mjs`
*   `netlify/lib/lab/types/multimodal.mjs` (`callTurn`, `checkWord`, `mediaUpload`, `debrief`, admin routes)
*   `static/lab/engine/participant.js` (`sealOut`, `checkSealing`), `static/lab/engine/types/multimodal.js` (`recorder`, `upload`), `static/lab/engine/types/multimodal-admin.js` (`recordingsTab`)
*   `netlify/lib/lab/asr.mjs`, `netlify/lib/lab/backup.mjs`, `scripts/vishing-study2/mini/gateway.py`
*   OneDrive: `Research/1. In Progress/Phishing Research/Vishing Training - MISQ/IRB Study 2 protocol DRAFT 2026-10-31.md` (§9.1–9.4, §16) and `GSU data storage request DRAFT 2026-11-01.md`

## Future Improvements

*   **Chunked envelope and multi-part upload** for recordings longer than about 15 minutes.
*   **Direct browser-to-mini turns** (Alt-4), if GSU approves the mini as an endpoint.
*   **Offline re-sealing** to a new key after a suspected compromise: download, open on the laptop, seal to the new key, re-upload.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

The file list was written for **A1 + T1 + O1 + D2**, the widest combination. **The chosen configuration is A1 + T2 + O1 + K1/K2 + F1 with the key-removal block.** So skip every T1, D1/D2 and O2 item, and build the T2, K2 and F1 items, including the `seal-set` key-removal block in `router.mjs`.

### Rules settled in review

These apply across the file entries below.

*   **Build order.** Each phase leaves `npm run test:lab` passing and plain uploads working until phase 3.
    1.  Phase 1: the `seal.mjs` and `seal.js` binary primitives, with known-answer vectors.
    2.  Phase 2: the server readers. The admin `recording`/`recordings` routes and the openers accept both sealed and plain records. Deploy this before any sealed write, because the old admin code cannot read sealed records.
    3.  Phase 3: sealed writes: `mediaUpload`, plus transcripts under T1.
    4.  Phase 4: the participant page under A1.
    5.  Phase 5: the admin tab.
    6.  Phase 6: the command line.
    7.  Phase 7: the docs.
*   **Mime normalization.**
    *   One function, `audioMime(m)`, in `seal.mjs` and copied in `seal.js`. It lowercases, cuts at the first `;`, and trims.
    *   The browser applies it before sealing, and the server applies it before storing `mime`. Both openers use the stored value.
    *   A test checks that `audio/webm;codecs=opus` and `audio/webm` give the same additional data.
*   **Base64.** `data` is standard padded base64 (what `mediaUpload` accepts today), not the base64url that `seal.js` `b64e` produces for text tokens.
*   **Size.** For a sealed upload, the base64 length check becomes `MAX_AUDIO_B64 + 80` in place of `MAX_AUDIO_B64`. The stored `bytes` for a sealed record is the decoded length minus 60.
*   **Envelope checks** (A1, in `mediaUpload`):
    *   the first 32 bytes are not all zero, and not one of the X25519 low-order points;
    *   `looksLikeAudio` is false on the bytes from offset 44 on;
    *   the mime passes the existing `AUDIO_TYPES` allow-list.
*   **`meta/seal` shape.**
    *   It is `{ publicKey, kid, setAt, setBy, requireBrowser, previous: [{ kid, publicKey, setAt, replacedAt }] }`, or `{ previous }` when sealing is off.
    *   `acceptsKid(meta, kid, now)` accepts the current kid. It also accepts the last entry of `previous` if `now − replacedAt < 24 h`.
    *   With no current key, it accepts nothing.
*   **Reply to reason** (participant page, A1):

    | Server reply | `recordingError` |
    |---|---|
    | 409 `wrong_key` | `wrong_key` |
    | 400 `seal_required` | `seal_required` |
    | No reply after the existing single retry in `apiRaw` | `upload_failed` |
    | Sealing threw | `seal_failed` |

    `sealOut` resolves to `{ _sealFailed: true }` when sealing throws. `api()` then returns `{ error: 'seal_failed' }` without sending.
*   **The participant code under A1.**
    *   `publicPlanExtras(plan)` cannot see the code, so `engine.mjs` `publicPlan` passes `p.code` to it as a second argument.
    *   Only `multimodal.mjs` uses that argument, to return `recordingTag` (`<code>/s<session>`).
*   **The key-aware checks.** `validateContent(c, type)` is synchronous and cannot read the store, so:
    *   **F2:** the warning comes from the admin `seal` route's reply (`sealInfo`), shown on the Encryption and Recordings tabs.
    *   **F1:**
        *   `mediaUpload`, `callTurn` and `checkWord` refuse with 409 `no_study_key` when the plan records and `sealerFor(S)` is null.
        *   The optional key-removal block lives in the router's `seal-set` case.
*   **Imports.**
    *   `multimodal.mjs` imports `sealerFor`, `sealBytes`, `acceptsKid` and `audioMime` from `../seal.mjs`.
    *   `AUDIO_KEY_RE` moves to `seal.mjs` as an export, so the CLI can use it.
*   **Command-line credentials.**
    *   The owner key goes in header `x-admin-key` (from `LAB_ADMIN_KEY`).
    *   An account session goes in `Authorization: Bearer <token>` (from `LAB_BEARER`).
    *   Routes are `GET <site>/api/lab/<study>/admin/recordings` and `…/admin/recording?key=<key>`.
*   **`checkWord`** has two write paths: typed (test participants) and recognized. Under T1, both are sealed.
*   **`checkSummary`** needs no code change. It copies whatever `heard` holds. A test covers it.
*   **K2** (if chosen):
    *   `keygen --passphrase` wraps the key file with scrypt (N = 2^17, r = 8, p = 1) and AES-256-GCM, in the form `{ format: 'ccair-lab-key-wrapped-v1', kid, salt, iv, ct }`.
    *   `scripts/lab/seal.mjs` and the Encryption tab loader prompt for the passphrase.
    *   Tests: a round trip, and a wrong passphrase.

### Target Files to Create/Modify

#### 1. `netlify/lib/lab/seal.mjs` (Modify)

*   **Type / Scope:** Node crypto module.
*   **Proposed Changes:**
    *   Add `INFO_BIN = 'ccair-lab-seal-bin-v1'`.
    *   Add `binAad({ kid, tag, mime })`, which returns the `sealedbin:v1:…` string. `tag` is the storage key after `audio/`.
    *   Add `sealBytes(pub, bytes, aad)`, which returns a `Buffer` envelope.
    *   Add `openBytes(envelope, priv, aad)`, which returns a `Buffer` and throws on a wrong key or a changed envelope.
    *   Add `acceptsKid(meta, kid, now)`: true for the current key, or for the last entry of `previous` if its `replacedAt` is less than 24 hours ago.
    *   No change to the text tokens.

#### 2. `static/lab/engine/seal.js` (Modify)

*   **Type / Scope:** browser WebCrypto module.
*   **Proposed Changes:**
    *   Add `sealBytes(publicKey, bytes, aad)`, where `publicKey` is the base64url study key as in `LabSeal.seal`, which resolves to a `Uint8Array` envelope (the key ID is already in `aad`). Node's `sealBytes(pub, bytes, aad)` takes the same arguments.
    *   Add `openBytes(Uint8Array, aad)`, which resolves to an `ArrayBuffer` (key loaded only).
    *   Export both on `window.LabSeal`.
    *   Under A2, only `openBytes`.

#### 3. `static/lab/engine/participant.js` (Modify; A1 only)

*   **Type / Scope:** participant page.
*   **Proposed Changes:**
    *   `sealsOn` adds `'media/upload'`.
    *   `sealOut` for that route decodes `body.data`, builds the AAD from the plan's `recordingTag`, the item index (`practice` or `t<n>`), `kind` and the mime without parameters, seals, and sets `body.sealed = { v: 1, kid }` and `body.data = base64(envelope)`.
    *   If sealing throws, it resolves to a marker so the caller records `seal_failed` and does not send.

#### 4. `static/lab/engine/types/multimodal.js` (Modify)

*   **Type / Scope:** participant call and voice UI.
*   **Proposed Changes:**
    *   `upload` returns a reason as well as success.
    *   The trial's `voice` object gains `recordingError` (`seal_failed` | `upload_failed` | `wrong_key` | `seal_required`).
    *   `upload`'s caller in the call and voice screens sets it.
    *   **D2:** store `r.heard` per turn in `sessionStorage` under `lab-heard:<study>:<tag>:<seq>`. The debrief screen fills "You:" lines from it when the server sends `sealed: true` for a line.

#### 5. `netlify/lib/lab/types/multimodal.mjs` (Modify)

*   **Type / Scope:** server type module.
*   **Proposed Changes:**
    *   **`mediaUpload`:**
        *   If `body.sealed` is present: require a study key, check `acceptsKid` (else 409 `wrong_key`), check the length bounds, check that the first 32 bytes are a valid X25519 key, and reject a body whose bytes after the header start with an audio signature (in place of `looksLikeAudio`).
        *   If it is absent and the study has a key: with `requireBrowser`, return 400 `seal_required` (A1). Otherwise, check the audio as today, then `sealBytes` with `by: 'server'`.
        *   Store `{ at, mime, bytes, durationMs, sealed, data }`.
    *   **`callTurn` (T1):** `heard: seal ? seal(bot.redact(said)) : bot.redact(said)`. The LLM history skips sealed `heard` and uses `bot.redact(said)` for the current turn.
    *   **`checkWord` (T1):** seal the stored `heard`.
    *   **`debrief` (T1):** a line whose `heard` is sealed becomes `{ who: 'you', sealed: true, seq }` (D2), or is left out (D1).
    *   **Admin `recordings`:** add `sealed` and `kid` to each row (one record read per key; acceptable at the tab's page size).
    *   **Admin `recording`:** return `sealed` and `aad` with `data`.
    *   **`cleanTrialData`** (the `voice` field): accept `recordingError` from the allowed list.
    *   **`publicPlanExtras` (A1):** add `recordingTag` (`<code>/s<session>`).
    *   **No-key checks:** see "The key-aware checks" under Rules settled in review.
    *   **T2 instead:** change `'calls.csv'` `need` to `'manager'`, and skip the T1 items.

#### 6. `static/lab/engine/types/multimodal-admin.js` (Modify)

*   **Type / Scope:** admin Recordings tab.
*   **Proposed Changes:**
    *   Add a "Sealed" column showing the key ID.
    *   **Listen, and a new per-row Download:** when a row is sealed and `LabSeal.loaded().kid` matches, `openBytes`, then show the result in an object URL (O1). Otherwise show the "load the key" message and save `.sealed`.
    *   **The zip** saves sealed files plus `manifest.json` when no key is loaded.
    *   **O2:** remove the decrypt branch.
    *   Add a line: "Missing recordings: N (seal_failed a, upload_failed b, …)", from the trial data.

#### 7. `scripts/lab/seal.mjs` (Modify)

*   **Type / Scope:** CLI.
*   **Proposed Changes:**
    *   Add the subcommand `open-audio <key.json> <dir> [out]`. It reads `manifest.json`, opens each entry with `openBytes`, and writes `<code>_s<n>_<item>-<kind>.<ext>` with mode 600.
    *   It refuses to overwrite and prints per-file failures.

#### 8. `scripts/lab/recordings.mjs` (Create)

*   **Type / Scope:** CLI.
*   **Proposed Changes:**
    *   `pull --site <url> --study <id> [--keys <file>] --out <dir>`.
    *   Reads the credential from `LAB_ADMIN_KEY` (header `x-admin-key`) or `LAB_BEARER` (`Authorization: Bearer`) and never prints it.
    *   Calls `recordings`, then `recording?key=` for each key, three at a time.
    *   Writes `<name>.sealed` and `manifest.json`.
    *   Refuses an existing non-empty `--out`.

#### 9. Tests (Create/Modify)

*   **`tests/lab/seal.test.mjs` (Modify):**
    *   Node `sealBytes`/`openBytes` round trip.
    *   A wrong AAD fails; a wrong key fails; a text token cannot open as binary and the reverse.
    *   Cross-implementation: a browser-sealed fixture made with `seal.js` under the Node WebCrypto global opens in Node, and the reverse.
    *   Known-answer vectors: fixed key, ephemeral key and IV give a fixed envelope in both implementations.
    *   Swapping two participants' files for the same item fails to open.
    *   A manifest with a changed additional-data string has no effect, because the opener rebuilds it.
    *   An all-zero shared secret is rejected.
*   **`tests/lab/multimodal.test.mjs` (Modify):**
    *   A sealed upload is accepted with the current key, and with the previous key under 24 hours.
    *   It is refused at over 24 hours, refused when oversized, and refused with no key.
    *   A plain upload with `requireBrowser` gives `seal_required`.
    *   A plain upload without `requireBrowser` is stored sealed with `by: 'server'`.
    *   T1: `heard` is stored as a token; `calls.csv` contains tokens; the debrief marks sealed lines; the LLM history excludes sealed lines.
    *   T2: a viewer gets 403 on `calls.csv`.
*   **Also in `tests/lab/multimodal.test.mjs`:**
    *   F1 refuses with 409 `no_study_key`; F2 stores plain.
    *   `cleanTrialData` keeps an allowed `recordingError` and drops any other value.
    *   The admin `recordings` rows carry `sealed` and `kid`, and the `recording` reply carries `sealed`.
    *   Plain pilot records list as not sealed.
    *   D1 leaves sealed lines out; D2 marks them.
    *   `checkSummary` carries tokens.
*   **Admin tab (manual, in the verification run):** with no key loaded, Download saves `.sealed` and Listen shows the "load the key" message.
*   **`tests/lab/recordings-cli.test.mjs` (Create):** in addition, `open-audio` refuses to overwrite, writes mode 0o600, and skips a manifest entry that does not match `AUDIO_KEY_RE`; `pull` refuses a non-empty `--out` and never writes the credential to stdout or stderr.
*   **`tests/lab/recordings-cli.test.mjs` (Create):** `pull` against a local `npm run lab` server with seeded sealed recordings, then `open-audio`; the output bytes equal the input.

#### 10. Documentation (Modify)

*   **`static/lab/README.md`:** in the sealed-fields section, describe the binary form, the AAD, the 24-hour key grace, the recording error reasons, and the two CLI commands. State the per-turn limit.
*   **`static/lab/CODEBOOK.md`:** add `voice.recordingError`. Under T1, describe the `participant_said` column as sealed.

### Verification Plan

*   **Unit and integration:** `npm run test:lab`, all files passing, including the new cases above.
*   **Cross-implementation:** browser-sealed fixtures open in Node, and Node-sealed ones open in the browser test.
*   **Manual, local** (`npm run lab` with `LAB_ASR_URL` pointed at the mini):
    *   Chrome, Firefox and Safari each complete the practice call and one shift call.
    *   The stored records are sealed.
    *   Play works in the Recordings tab with the key and fails without it.
    *   `pull` plus `open-audio` give playable files.
*   **Size:** a 10-minute recorded voice answer uploads and opens.
*   **Rotation:** change the key mid-session. An upload with the old key within 24 hours is accepted and opens with the old key file.
*   **Before launch:** open a test recording from both copies of the key file. Record the full public key and the key ID in the IRB protocol.
*   **During collection (A1 only, launch checklist):** a test participant on each browser family records a call weekly, and the PI opens it (the canary).

--------------------------------------------------------------------------------

*Drafted with EGM*
