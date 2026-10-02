# CARE Behavioral Lab

Browser-based behavioral studies at `bampel.com/lab/`. Everything here is static and needs no build step: Hugo copies `static/lab/` to the site as is.

```
static/lab/
  index.html                    lab landing page
  assets/study.css              plain, light styling for participant pages
  tracelab/tracelab.js          passive trace capture (no dependencies)
  studies/demo-phishing/        demo study; data never leaves the browser
  studies/verification/         multi-week alert triage study (GSU email sign-in, server storage)
  CODEBOOK.md                   column definitions for the verification study exports
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

`studies/verification/` runs repeated alert-triage sessions (default: four weekly sessions of eight alerts) with three between-subjects conditions (AI-first, evidence-first, control). The default design follows Clark, *Preserving Human Verification in AI-Augmented Decision Making* (Section 4): accurate AI in session 1, mostly accurate in session 2, incorrect, uncertain, and manipulated AI in session 3, and no AI in session 4. Everything participants see, and the session design, is editable on the admin page.

### Files

| Path | Role |
|---|---|
| `netlify/functions/vc-api.mjs` | HTTP routes at `/api/vc/*`, request size cap, admin roles, Netlify Blobs adapter (`verification-study` store) |
| `netlify/lib/vc-core.mjs` | sign-in, tokens, session plans, saving and validating answers, exports, deletes |
| `netlify/lib/vc-content.mjs` | editable content (consent, sessions & AI, alerts, surveys, screen text), validation, versions |
| `netlify/lib/vc-admin.mjs` | owner and team keys, activity log |
| `netlify/lib/vc-selftest.mjs` | resumable live self-test (owner button on the admin page) |
| `netlify/lib/vc-backup.mjs`, `netlify/functions/vc-backup.mjs` | hourly scheduled mirror into the `verification-backup` store; purge on withdrawal |
| `netlify/lib/vc_build_alerts.py` → `vc-alerts.mjs` | built-in default alerts |
| `static/lab/studies/verification/` | `index.html` + `app.js` (participant app), `admin.html` (admin app) |
| `tests/lab/` | `npm run test:lab`: design, audit regressions, content/admin, sign-in, self-test (in-memory store; the audit test also runs on a store whose conditional writes are not atomic, like live Blobs) |

### Sign-in and privacy model

- Students type their GSU email each week (domains are set under Study content → Sign-up & consent); no password. The first sign-in asks them to confirm the address so a typo doesn't split their sessions. Pilot access codes (`VC-XXXX-XXXX`) also work.
- Study ID = HMAC(pepper, email). The pepper is stored in the same Blobs store (`meta/pepper`), so **anyone with access to the Netlify site can re-identify participants**; treat Netlify access as access to identifiable data.
- The email is stored once, under `contact/{id}`, for extra credit. It never appears in the trial, survey, JSON, or raw-trace exports. Only managers and the owner can download the extra-credit list.
- There is no verification email: anyone who knows a classmate's GSU address could sign in as them. This was a deliberate trade-off for ease of use; if it matters for a future study, add an emailed one-time code at first sign-in.
- Tokens are HMAC-signed, expire after 12 hours, and are kept in the tab's sessionStorage.
- The browser never receives alert IDs, answer keys, or which panels are misleading.

### Data integrity

- **Progress comes from write-once records, not a shared counter.** Each answer is its own key, written only if it doesn't exist yet; whether an alert, survey, or session is done is read back from which keys exist. This matters because the live self-test showed that Netlify Blobs does not keep conditional (etag) writes atomic when requests arrive at the same moment, so a shared progress record could lose updates. With write-once keys, double clicks, two open tabs, and retries can't lose or overwrite an answer (the first answer wins; repeats are acknowledged).
- Plans (`plans/{id}/s{n}`) are written once when a session starts, so later content edits never change a session in progress. Each participant keeps the number of sessions in place when they started session 1 (cutting sessions shortens it; adding sessions does not lengthen it).
- Conditions are assigned by minimization: each new participant joins the condition with the fewest participants so far (ties at random), counted from write-once marker keys. Real and test participants are balanced separately. Simultaneous sign-ups can briefly tie; later sign-ups even it out.
- The participant record itself only holds rarely-changed fields (condition, flags, consent time, last seen).
- The server validates what the browser sends: unknown survey variables and out-of-range values are dropped, trial fields are type-checked and capped, request bodies over 4 MB are refused.
- Each trial stores a copy of its alert and answer key as scored, plus the content version.
- CSV cells that a spreadsheet would run as a formula are prefixed with `'`.

Key schema: `participants/{id}`, `consent/{id}`, `plans/{id}/s{n}`, `started/{id}/s{n}-{time}`, `done/{id}/s{n}-{time}`, `views/{id}/s{n}/t{i}/{time}`, `data/{id}/s{n}/t{i}` (trial, no raw events), `raw/{id}/s{n}/t{i}` (raw TraceLab events), `data/{id}/s{n}/practice|survey-pre|survey-post`, `contact/{id}`, `cond/{condition}/{id}` and `cond-test/…` (assignment counts), `meta/pepper`, `content/current`, `content/history/v{n}`, `admins/{sha256(key)}`, `audit/{time}`, `selftest/{id}`.

### Admin page (`/lab/studies/verification/admin.html`)

Set `VC_ADMIN_KEY` (16+ characters) in the Netlify environment variables; that is the owner key. Tabs:

- *Participants*: progress; the live self-test (also checks the storage itself); trials CSV, surveys CSV, full JSON, and raw-trace JSONL downloads (assembled in the browser in batches of participants, so they work at any study size; optionally real participants only); mark test/real; delete one or all test participants; the live self-test.
- *Pilot report*: per-alert accuracy without the AI (flags alerts that are too easy or too hard), accuracy when the AI is right vs wrong, agreement and evidence checking by AI behavior, accuracy by condition and session, session length vs the promised minutes, and drop-off by session. Filter by label to look at one pilot batch; download the per-alert table as CSV.
- *Students*: pre-enroll emails (optional while self sign-up is on), check completion, extra-credit list, pilot codes.
- *Study content*: Sessions & AI (session count, alerts per session, practice alert, counterbalancing, AI behavior mix and confidence ranges), Alerts (add/duplicate/delete, 1–6 evidence panels with CSV variable names), start- and end-of-session surveys, Sign-up & consent, Screen text. Every save is a numbered version that can be restored.
- *Team* (owner): viewer / editor / manager keys; only hashes are stored. *Activity* (owner): audit log.

### Participant UI and the research behind it

Choices that change measured behavior are marked [B]; keep them identical across conditions and decide them before data collection.

- [B] Confidence is a click-anywhere 0–100 line with **no starting handle**; the number appears once the participant chooses (default handle positions anchor answers: Liu & Conrad 2019; sliders with handles perform worse than click-to-place scales: Funke 2016; Angelike & Reips 2026). Keyboard users can use the arrow keys (starting at 50), and no dragging is required (WCAG 2.5.7).
- [B] Malicious/Benign button order is fixed for each participant and counterbalanced across participants, in the same neutral style (Tourangeau, Couper & Conrad 2004, 2007). Setting: Sessions & AI.
- [B] Evidence is revealed by click only, one panel at a time, in an order fixed for each participant and rotated across participants (reading order drives acquisition order: Willemsen & Johnson 2011; Lohse & Johnson 1996). The CSV records `panel_order` and `first_panel_position`.
- [B] AI advice uses the same neutral box, wording, and position in both AI conditions; only its timing differs. Evidence-first locks the initial answer before the AI appears (Buçinca et al. 2021; Fogliato et al. 2022).
- [B] Rating scales label every point in words; options are laid out in one row on wide screens and stacked on phones; one question per row, no grids (Krosnick & Presser 2010; Couper et al. 2013; Roßmann et al. 2018; Antoun et al. 2018). The default end-of-session effort item is the 9-point Paas scale with its verbal labels.
- Short lists use radio buttons, not dropdowns (Couper et al. 2004). Survey questions get one gentle reminder if skipped instead of being forced; trial answers stay required (de Leeuw et al. 2016; Sischka et al. 2022; Décieux et al. 2015).
- Honest progress only: "Alert k of N" and one dot per session; no progress bar tricks (Villar, Callegaro & Yang 2013; Conrad et al. 2010).
- No attention checks among the trials (instructed checks change how carefully people work: Hauser & Schwarz 2015); careless responding is judged afterwards from timing traces.
- Accessibility (WCAG 2.2): focus moves to each new screen's heading, questions are fieldsets with legends, evidence uses the tabs pattern with arrow keys, 48 px tap targets, 3:1 control contrast, visible focus, reduced-motion support, errors announced and explained.
- Retention: the end screen offers an add-to-calendar file for the next session (Dillman, Smyth & Christian 2014). Reminder emails are not built in.

### Operations runbook

- **Pilot**: enroll 10–15 students under their own label (for example `pilot-oct`), let them complete at least session 1 (session 4 too, if the timeline allows, since it has no AI for anyone), then open *Pilot report*, filter by that label, and retune alerts flagged too easy or too hard under Study content → Alerts. Aim for roughly 60–80% accuracy without the AI, so that both following a wrong AI and catching it are possible. Check the median session length against the minutes in the consent text. Mark pilot participants as test (or delete them) before the main study if their data shouldn't count.
- **Backups**: the hourly mirror runs automatically (Participants tab → Backups shows the last run; "Run backup now" forces one). Weekly, the owner downloads the complete backup (.json.gz) and saves it to GSU-approved storage; it contains student emails. Restoring is a manual operation from either copy; deleting a participant removes them from the mirror but not from earlier downloaded files, so note withdrawals so they can be removed from saved copies too.
- **Before live participants**: IRB-approved consent pasted in and "IRB-approved" ticked; survey items finalized; GSU sign-off on storing study data and student emails in Netlify Blobs; run the live self-test; delete all test participants.
- **During the study**: Participants tab for progress; Students → extra-credit list for credit; withdrawals: delete the participant (removes answers, traces, plans, and email).
- **Exports**: trials CSV and surveys CSV for analysis (definitions in `static/lab/CODEBOOK.md`); full JSON for archiving; raw traces JSONL only if you need event-level data.
- **Local testing**: `VC_ADMIN_KEY=<key> netlify dev --dir static --offline`, then add test emails with gap days 0; `npm run test:lab` for the automated tests.

### Reusing this for a future study

Generic today, reusable as is: sign-in and tokens, session scheduling and gaps, content versioning, admin roles and audit log, batched exports and safe CSV, the conditional-write store adapter, the self-test pattern, and the participant survey components (labeled scales, confidence line, soft reminders, focus handling). Study-specific: the alert-triage trial (`runTrial` in `app.js`, `buildPlan` / `trialRow` / `cleanTrialData` in `vc-core.mjs`, the Alerts and Sessions & AI editor tabs).

Planned refactor when a second server-backed study starts: move the generic parts to `netlify/lib/study-engine/` (store, identity, sessions, content, admin, exports, selftest) and `static/lab/engine/` (participant shell and survey components), and give each study a plugin `{ id, conditions, defaultContent, validateContent, buildPlan, publicTrial, cleanTrialData, trialRow, simulate }` plus a client `runTrial(ctx) → data`. One function, `/api/study/:studyId/*`, would serve every study with its own Blobs store.
