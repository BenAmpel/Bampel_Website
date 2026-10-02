# CARE Behavioral Lab

Browser-based behavioral studies at `bampel.com/lab/`. Everything here is static and needs no build step: Hugo copies `static/lab/` to the site as is.

```
static/lab/
  index.html                    lab landing page
  assets/study.css              plain, light styling for participant pages
  tracelab/tracelab.js          passive trace capture (no dependencies)
  studies/demo-phishing/        demo study; data never leaves the browser
  studies/verification/         multi-week alert triage study (access codes, server storage)
```

## Adding a study

1. Copy `studies/demo-phishing/` to `studies/<study-id>/`.
2. Replace the consent text with the IRB-approved wording, and the items with your stimuli. Use fictional organizations for phishing stimuli.
3. Mark anything whose hover or click matters with `data-trace="name"` (links, email headers, answer options).
4. Choose a sink (below). Keep `{ type: 'local' }` until the protocol and storage are approved.
5. Add a card for the study on `index.html`.

## TraceLab API

```js
const lab = TraceLab.create({ study: 'my-study', version: '1.0.0', sink: { type: 'local' } });
lab.start();                          // after consent only
lab.beginItem('q1', rootEl);          // one item per screen or question
lab.recordAnswer('judgment', value);  // on every answer change
lab.endItem({ judgment: 'phishing' });
lab.finish({ responses }).then(p => { /* p.items[].features, p.events */ });
```

The participant ID comes from `?pid=`, `?PROLIFIC_PID=`, or `?participant=` in the URL, and falls back to a random ID.

### Sinks

| Sink | Behavior |
|---|---|
| `{ type: 'local' }` | Nothing is sent. Use `TraceLab.download(payload)` to save JSON. |
| `{ type: 'post', url }` | POSTs the JSON payload to an approved endpoint. |
| `{ type: 'jatos' }` | Calls `jatos.submitResultData` when the study runs inside JATOS. |

### Per-item features

`durationMs`, `firstInteractionMs`, `firstAnswerMs`, `lastAnswerMs`, `answerEvents`, `answerChanges`, `mousePathPx`, `mouseSamples`, `mouseMeanSpeed`, `mouseMaxSpeed` (px/ms), `mouseXFlips`, `idleGaps` and `idleMs` (pointer still for more than 500 ms), `clicks`, `clickTargets`, `hovers` (count and dwell per `data-trace` target), `scrollPx`, `wheelPx`, `keystrokes`, `charsTyped`, `deletions`, `pastes`, `pasteChars`, `copies`, `hiddenMs`, `windowBlurs`, `media` (plays, seeks, first play delay, share heard).

### Raw events

Each event has `t` (ms since start), `type`, and `item`. Types: `move`, `down`, `click`, `hover_in`, `hover_out`, `scroll`, `wheel`, `key_down`, `key_up`, `input`, `paste`, `copy`, `cut`, `hidden`, `visible`, `window_blur`, `window_focus`, `resize`, `media_*`, `answer`, `item_begin`, `item_end`, `start`, `finish`. Key events carry a category (`char`, `space`, `backspace`, `delete`, `enter`, `arrow`, `modifier`, `tab`, `other`), never the key.

## Before running a live study

- IRB approval, with the consent text describing passive trace capture.
- An approved storage location for the `post` or `jatos` sink. Do not point a live study at storage that GSU has not approved for human-subjects data.
- Test on desktop and mobile; pointer features mean little on touch devices.

## Verification study (multi-week, server-backed)

`studies/verification/` runs four weekly sessions of eight alert-triage trials each, with three between-subjects conditions (AI-first, evidence-first, control). The design follows Clark, *Preserving Human Verification in AI-Augmented Decision Making* (Section 4): accurate AI in session 1, mostly accurate in session 2, incorrect, uncertain, and manipulated AI in session 3, and no AI in session 4.

- **Sign-in**: students sign in with their email and a 4-digit PIN they create the first time. By default anyone with a @gsu.edu or @student.gsu.edu address can sign up on first sign-in (Study content → Sign-up & consent sets the domains, gap days, and label, or turns it off); emails added on the Students tab can always sign in. There is no verification email, so the first person to use an address owns it; a PIN reset hands it back. Emails are never stored: a student's study ID is a keyed hash of the email (key in `meta/pepper` in the store), so exports are de-identified. Five wrong PINs lock the account for 15 minutes, and the admin page can reset a PIN without losing progress. Sign-in returns a 12-hour token that every other route requires. Pilot access codes (`VC-XXXX-XXXX`) still work for team testing.
- **Credit**: the admin page's completion check takes pasted emails and shows sessions completed for each, with a CSV download.
- **Server**: `netlify/functions/vc-api.mjs` at `/api/vc/*`, logic in `netlify/lib/vc-core.mjs`, data in the Netlify Blobs store `verification-study`. Ground truth and AI schedules stay on the server.
- **Admin**: `/lab/studies/verification/admin.html`. Set `VC_ADMIN_KEY` (16+ characters) in the Netlify environment variables first; that is the owner key. Tabs:
  - *Participants*: progress, downloads (trials CSV, surveys CSV, full JSON), and delete (one participant, or all test participants). Deletes are permanent and logged.
  - *Students*: add roster emails, check completion by email, reset PINs, create pilot codes.
  - *Study content*: everything participants see and the session design, editable without code. *Sessions & AI*: number of sessions, which alerts each shows, the practice alert, and for the AI groups how many alerts get each AI behavior (right/wrong, high/low confidence, manipulated) plus the confidence ranges. *Alerts*: add, duplicate, or delete alerts; edit text, answer key, alert type, and 1–6 evidence panels (each with its own CSV variable name). *Surveys*: start- and end-of-session questions, per-session and with/without-AI rules. *Consent* and *Screen text* (every label, button, and instruction). Every save is a numbered version that can be restored. A session in progress keeps the plan it started with (alerts, order, AI behaviors); edits apply from each participant's next session. Each trial stores the alert and answer key as scored, and records its content version. Logic in `netlify/lib/vc-content.mjs`; defaults are in code.
  - *Team* (owner): give collaborators their own keys. Viewer = see progress and download data; editor = also edit content; manager = also manage students. Only key hashes are stored. Logic in `netlify/lib/vc-admin.mjs`.
  - *Activity* (owner): log of content changes, student changes, deletions, and team changes.
- **Stimuli defaults**: edit `netlify/lib/vc_build_alerts.py` and rerun it to change the built-in alerts; the admin editor overrides them once saved.
- **Local testing**: `VC_ADMIN_KEY=<key> netlify dev --dir static --offline`, then add test emails or codes with gap days 0.
- **Before live participants**: replace the draft consent on the Study content tab and tick "IRB-approved", replace the draft survey items, and confirm GSU allows Netlify Blobs for this data or switch storage.
