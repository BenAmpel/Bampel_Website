# CCAIR Behavioral Lab

Browser-based behavioral studies at `bampel.com/lab/`. Everything here is static and needs no build step: Hugo copies `static/lab/` to the site as is. To run the lab on a laptop, see Quick start below.

```
static/lab/
  index.html                    lab landing page (lists studies from the registry)
  assets/study.css              plain, light styling for participant pages
  tracelab/tracelab.js          passive trace capture (no dependencies)
  engine/participant.js, .css   shared participant app (every server-backed study)
  engine/logic.js               survey display logic and piped text (browser copy of netlify/lib/lab/logic.mjs)
  engine/admin.js, .css         shared admin page and lab console
  engine/types/<type>.js        a study type's item screen
  engine/types/<type>-admin.js  a study type's content-editor tabs and report sections
  s/index.html                  participant page for /lab/s/<study>
  admin/index.html              admin page for /lab/admin/<study>; lab console (owner) and "My studies" (researcher) at /lab/admin/
  signin/, account/             researcher sign-in, invitation and reset links; account settings (engine/auth.js, signin.js, account.js)
  guide/, support/              researcher guide; support and FAQ (static pages)
  assets/contact.js             builds the mailto: contact links; assets/pages.css is the layout for the four pages above
  studies/demo-phishing/        demo study; data never leaves the browser
  studies/verification/         original URLs of the verification study (thin pages on the engine)
  templates/survey-template.csv the spreadsheet template for importing a survey
  CODEBOOK.md                   column definitions for the exports
```

## Quick start (one command)

```
npm run lab
```

Starts the whole lab on this computer (Node 20 or newer; no `npm install` needed), with studies and data kept in `.lab-data/` (gitignored), and opens the lab console signed in. The first run makes an owner key (`.lab-data/owner-key.txt`) and an example study, "Example: vishing training (5 arms)". On a Mac, `scripts/Start CCAIR Lab.command` does the same on a double-click. Optional settings go in `.env.lab` (gitignored): `ANTHROPIC_API_KEY` (the AI caller rephrases its scripted lines with Claude), `LAB_LLM_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` answers faster), `LAB_LLM_TIMEOUT_MS` (default 4000), `PORT` (default 8899; the next free port is used), `LAB_HOST`, `LAB_DATA`. Flags: `--no-open`, `--reset-example`.

| Piece | File |
|---|---|
| Launcher | `scripts/lab.mjs` |
| Local web server (static pages, API, netlify.toml rewrites, byte ranges) | `scripts/lab/server.mjs`, also used by `npm run lab:dev` (in-memory) |
| File-backed store with Blobs semantics (write-once via atomic `link`, compare-and-swap under a per-key lock) | `scripts/lab/filestore.mjs` |
| Sample stimuli for the templates | `static/lab/media/samples/`, rebuilt by `npm run lab:samples` (macOS `say`, ffmpeg, Chrome) |
| Brand assets (logo, icons, illustration; generated with ChatGPT in the lab's palette) | `static/lab/assets/brand/` |

## Templates, preview, and online panels

- **Templates** (`netlify/lib/lab/templates.mjs`, route `GET /api/lab/_lab/templates`): Survey, A/B or multi-arm experiment, Audio clip judgments, Conversation with an AI voice caller, Image and video ratings, Mouse-tracking decision task, Vishing training experiment (5 arms). `POST /api/lab/_lab/create` with `template` stores the template ID on the study; `registry.typeFor()` then uses the template's content as the study's defaults until the first save, like a built-in study's seed. `tests/lab/multimodal.test.mjs` checks that every template validates as created.
- **Preview as a participant** (route `POST /api/lab/<study>/admin/preview`, editors and up): one test participant with no gap between sessions, optionally in a chosen condition (a fixed condition is only ever given to test participants). It returns `/lab/s/<study>?code=...&preview=1`; the participant page signs in with the code, removes it from the address bar, and shows a "Preview" ribbon.
- **Online panels** (`enrollment.panel`: `enabled`, `param` such as `PROLIFIC_PID`): the participant page signs in with the ID in the link (`login` with `panelId`). The study ID is a keyed hash of the panel ID and the panel ID is kept only under `contact/{id}` (the extra-credit CSV gains a `panel_id` column).
- **Recruitment hand-off** (`netlify/lib/lab/recruit.mjs`; `enrollment.panel`: `preset` (`prolific`, `sona`, `mturk`, `cloudresearch`, `custom`), `studyParam`, `sessionParam`, `redirectUrl`, `completionCode`, `screenOutCode`, `returnCode`). A preset fills the link parameters and a redirect template; the template takes `{code}` and `{pid}` (URL-encoded), and SONA's credit link uses `survey_code={pid}`. The codes are never in the public content: participant route `handoff` returns `{ outcome, code, url, panel }` once the participant is `complete` (every session done), `screened_out` (`p.screenedOut`, also set by a full quota) or `returned`, and `withdraw` marks `participants/{id}.returnedAt` (status then reports `finished` and `returned`). The panel's study and session IDs from the link are kept on the participant as `panel: { study, sessions: [{ id, at }] }` (not identifying; in the JSON export and the wide CSV). A study with only the older `completionUrl` (or `screenOutUrl`) keeps working. The last page shows the code with a Copy button and a link back; there is no timed redirect. Tests: `tests/lab/recruit.test.mjs`.
- **Quotas** (`netlify/lib/lab/quota.mjs`; `enrollment.quota: { total, perCondition }`, Sign-up & consent). Counted from the `cond/{condition}/` assignment markers (real participants only; a deleted participant's marker goes with them). `pickCondition(S, test, rand, capped)` skips conditions at their cap and returns `null` when the study (or every condition) is full; `enroll` then stores the participant with `condition: null` and `screenedOut: { at, reason: 'quota_full' }` and writes no marker. Only self sign-ups (email domain or online panel) are capped; roster, pilot codes, previews, and test participants are not, though real ones count toward the caps. `status()` reports `finished` and `screenedOut`; the page shows the "study full" text (`full_title`, `full_body`; other screen-outs use `screenout_title`, `screenout_body`) and the `handoff` route gives the screened-out code with `reason`. Simultaneous arrivals can pass a cap by one or two (counts are read, then written). Tests: `tests/lab/quota.test.mjs`.
- **Study design files and Clone** (`netlify/lib/lab/studyfile.mjs`, `version.mjs`). `GET /api/lab/<study>/admin/design.json` (viewers) returns `{ format: 'ccair-lab-study', schemaVersion: 1, exportedAt, platform: { name, version, commit }, study: { id, name, type, description }, contentVersion, redacted, content, files, filesLeftOut }`: every saved content key (`content.contentKeysFor(type)`), normalized against the plain type so the file does not depend on a template, and no participant data. Uploaded files the content points at travel as base64 up to `MAX_FILE_BYTES` (3 MB, under the 4 MB request cap); larger ones are listed in `filesLeftOut`. Panel codes are blanked (`redacted: true`). `POST /api/lab/_lab/create` with `design`, `id`, `name` imports it: `checkDesign` refuses a wrong format, a newer schema, an unknown type, or content that fails `validateContent`, before any study is created; files are stored under their names and `/api/lab/<old>/file/` addresses are rewritten to the new study; blank codes in a redacted file are replaced (`newCodes` in the result). `POST /api/lab/_lab/clone` (`from`, `id`, `name`; owners) copies the full design with codes and every file. `platformInfo()` takes the commit from `LAB_COMMIT` or `COMMIT_REF`, else the local checkout, else `unknown`. Tests: `tests/lab/studyfile.test.mjs`.
- **Recording consent** (`consent.recording`: `enabled`, `label`, `required`): a second checkbox on the consent page. The answer is saved with the consent record and as `recordingConsent` on the participant; plans carry `recording`, and the server refuses audio uploads without it.

## Codebook and wide export

- **Per-study codebook** (`netlify/lib/lab/codebook.mjs`; admin routes `codebook.csv` and `codebook.md`, viewers). `buildCodebook(S, content)` returns one entry per column (`file`: `trials`, `surveys`, or `wide`; `column`, `kind`, `values`, `label`, `applies_to`, `source`, `required`). Survey and per-item questions come from the content (values with labels from the options or scale labels; applies-to from `conditions`, `sessions` through `itemsFor`, `showIf`, `displayIf`, `page`); engine columns and each type's measures come from dictionaries in the module (`TYPE_COLUMNS`), and alert-triage `dwell_{panel}_ms` columns from the alerts' panels. The CSV goes through `csvCell` (formulas neutralized). `tests/lab/codebook-wide.test.mjs` runs the self-test on a vignette, a multimodal (with a call), and the alert-triage study and checks that every column of the real CSVs is in the codebook, so a new measure without an entry fails the test.
- **Wide export** (`netlify/lib/lab/wide.mjs`; `admin/rows?kind=wide&codes=...` in batches for the admin page, `admin/export-wide.csv` in one request). One row per participant from `exportRecords`; trial measures are `trialRow` values named `s{n}_{item}_{measure}` by item ID, survey answers `s{n}_{pre|post}_{question}`. The codebook's `wide` rows are the column patterns, and the test checks every wide column against them.

## Preloading and stimulus timing

- **Preloading** (`environment.preload`, Study content → Devices & timing; off by default). After `session` returns the plan, `participant.js` finds every media address in it (same-site paths and https addresses ending in an audio, video, or image extension, and `/api/lab/<study>/file/...`), fetches them four at a time with a progress bar, and replaces each address in the plan with an in-memory `blob:` copy, so no item waits on the network. A file that fails or does not answer within 30 seconds stops the start with a "Try again" button; after one retry the participant may continue without it (`preloaded` = 0). Another site's images can only be warmed in the cache (no CORS); other cross-site media need CORS. With preloading off nothing is fetched early and sessions start as before.
- **Onset and frame timing** (every trial, every type). `runTrial` asks for an animation frame after the type has drawn the item and records its timestamp as the onset (`performance.now()` clock); a type that reveals the stimulus later calls `ctx.markOnset()`. The session's frame interval is the median of 60 frame gaps measured when the session starts. The trial sends `timing: { onsetMs, onsetDelayMs, frameMs, preloaded }`; `engine.cleanTiming` keeps it on the record for any type, and the trials CSV has `onset_ms`, `onset_delay_ms` (onset minus the start of the item screen: subtract it from `rt_ms` for a response time from onset), `frame_ms`, and `preloaded`. This is the browser's own estimate; validate a setup with a photodiode before claiming millisecond accuracy (see the timing self-check). Tests: `tests/lab/timing.test.mjs`.

## Setup checks, full screen, and language

Settings in `content.environment` (Study content → Devices & timing; `netlify/lib/lab/envcheck.mjs` on the server, `static/lab/engine/envcheck.js` in the browser, loaded only when a check is on). After `session` returns the plan, `participant.js` runs `runChecks(session)`: **device** (`desktopOnly`: no phones or tablets; `speechBrowser`: speech recognition in Chrome or Edge), which stops with the reason and saves nothing, so the participant can come back on the right device; **microphone** (`micCheck`): a `<meter>` level meter, passed after 500 ms above -45 dBFS within 20 s, two tries, and with `micRequired` a second failure screens out; **headphones** (`headphoneCheck`, session 1 only): the Huggins-pitch test of Milne et al. (2021): three 1-s noises per trial, one with the right ear's noise phase-inverted in 600 Hz ± 6% (made with an inverse FFT, random phase, flat magnitude, 20 ms ramps), 6 trials, passed at 5 correct; `headphoneFail: 'screen'` screens out, `'record'` continues. The results go once per session to participant route `checks` (`data/{id}/s{n}/checks`, write-once); the server decides any screen-out from the study's settings (`screenReason`), never from the browser. The `session` route says `checksDone` when they are already saved, so a reload goes straight on. **Full screen** (`fullscreen`): a button (browsers need a click; a request that is refused or never answered gives up after 2 s and the session goes on); each exit is noted and a bar offers the way back; each trial records `fullscreen` (on at onset), `fullscreen_exits`, and `fullscreen_exit_ms` (`engine.cleanFullscreen`). The wide CSV has `s{n}_check_device_*`, `_mic_*`, `_headphone_*`. **Language** (`language`, BCP 47 from `LANGUAGES`) sets `<html lang>` and `data-speech-lang`, which the call items' speech recognizer and voice choice follow (`types/multimodal.js`). Tests: `tests/lab/envcheck.test.mjs`.

## Data-quality flags (no CAPTCHA)

Attention checks alone no longer catch AI agents that take surveys (Westwood 2025, *PNAS*), so the participant page records what software does and people rarely do (`netlify/lib/lab/quality.mjs`; page code in `participant.js`, "data-quality signals"): a **honeypot** text box on every survey page (off screen, `aria-hidden`, out of the tab order, `autocomplete="off"`; people never reach it), **`navigator.webdriver`**, **pastes** into text boxes (count and characters), **injected text** (a text box that grew by more than the keys and pastes since its last change), and **key timing** (key presses under 30 ms after the previous one). Only counts and times are kept, never the text. Running totals go to participant route `dq` when a page or item is submitted (only when they changed) and are merged into `data/{id}/s{n}/dq` (true stays true, counts keep their highest, so a reload does not erase them). The wide CSV adds `dq_honeypot`, `dq_webdriver`, `dq_paste_count`, `dq_paste_chars`, `dq_injected_chars`, `dq_fast_keys_share`, `dq_fast_typing` (more than half of 20+ keys under 30 ms), `dq_fast_completion` (a session under a quarter of `minutesPerSession`), `dq_duplicate_panel` (one panel ID with several panel session IDs), and `dq_flags` (how many are raised). The pilot report has a Data quality table with the IDs to review. Flags are for review, not automatic exclusion; preregister how you use them. Tests: `tests/lab/quality-flags.test.mjs`.

## Multimodal studies (type `multimodal`)

Server `netlify/lib/lab/types/multimodal.mjs`, browser `static/lab/engine/types/multimodal.js` and `multimodal-admin.js`, voice caller `netlify/lib/lab/voicebot.mjs`, mouse-tracking measures `netlify/lib/lab/trajectory.mjs`.

- **Content:** `design.conditions` (1 to 12), `design.sessions[].blocks[]` (`title`, `items`, `randomize`), `items[]` of kind `text`, `image`, `audio`, `video`, or `call` (with `media`, `mediaAlt`, `transcript`, `mustFinish`, `maxPlays`, `autoplay`, `decide`, `decisionPrompt`, `decisionOptions`, `ask` = `all` / `none` / question IDs, `recordVoice`, `voicePrompt`, `variants` per condition), `decision` (`prompt`, 2 to 4 `options`, `mouseTracking`), `directory[]` (`name`, `number`, `greeting`), `questions`, and `practice`. Media addresses are `https://`, `/lab/...`, or files uploaded to the study (`/api/lab/<study>/file/f-<random>.<ext>`, served with byte ranges).
- **Calls:** `call` = `caller`, `number`, `callbackNumber` (the organization's real line, which resolves the truth on a callback), `intent` (`attack` or `benign`), `maxTurns`, `ringSeconds`, `persona`, `script` per state, optional `audio` per state (pre-recorded lines, played through a telephone-band filter), `llm: false` to forbid rephrasing. States: `opener → pretext → ask → pressure1 → pressure2`, `deflect` on a request to verify or call back, endings `closeComply`, `closeRefuse`, `close`. Participant words are classified by keyword rules (`classify`), never by a model, so transitions can be reproduced from the transcript; any run of 4+ digits (written or spoken) counts as compliance. The browser never receives the script or the intent: each line arrives from `POST /api/lab/<study>/call/turn` (`seq`, `kind` = `answer`, `say`, `hold`, `resume`, `hangup`, `decline`, `timeout`, `said`, `latencyMs`). Each turn is written once to `calls/{code}/s{n}/t{i}/{seq}` with the state it moved to, so retries get the same reply and the state is replayed from the log. When a call item's answer is saved, `saveTrialHook` replaces anything the browser sent as `callServer` with the server's summary. Callbacks: `POST .../call/callback` → `callbacks/...`.
- **AI phrasing:** with `ANTHROPIC_API_KEY`, `voicebot.phrase()` asks Claude (Messages API, plain `fetch`, `output_config.effort: low`, server-side fallbacks) to say the current state's scripted line in one or two spoken sentences that answer the participant, never adding requests or claims. On a timeout, an HTTP error, a refusal, or an empty reply, the scripted line is spoken; every turn records `source` (`script`, `llm`, `recorded`).
- **Participant audio:** `POST .../media/upload` (`kind` = `call` or `voice`, base64, at most about 2.7 MB, audio types only, recording consent required) → `audio/{code}/s{n}/t{i}-{kind}`, write-once. Admin routes: `recordings` and `recording?key=` (manager), `recordings-delete` (owner, confirm `DELETE`), `calls.csv` (viewer), `file-upload` (editor), `files` (viewer). `audio/` is never copied by the hourly backup; `calls/`, `callbacks/`, and `files/` are. Deleting a participant removes their calls, callbacks, and audio.
- **Privacy:** before a participant's words are stored, digit runs, spoken digit runs, email addresses, and street addresses are replaced (`redact`); the digit count is kept.
- **Browser:** a sound check before the first item with sound (microphone level meter when recording); a custom player (plays, furthest point heard, transcript use); the mouse-tracking layout (Start at the bottom, options in the top corners, path sampled on `pointermove` until the answer click; keyboard users get the buttons' centres); the softphone (generated ring tone, caller ID, Web Speech API recognition in Chrome and Edge with typing always available, speech synthesis, hold, hang up, captions, talking over the caller, the directory). Everything degrades to typing when there is no microphone or speech recognition.

## Study engine

Every server-backed study runs on one engine; a study is data (its content, edited on its admin page) plus a **study type** that defines its item screen. The engine provides, for every study: GSU-email sign-in (or pilot codes), consent, multi-session scheduling with gap days, balanced condition assignment, start- and end-of-session surveys, behavior traces, write-once storage, versioned content editing, team roles, the activity log, batched exports, hourly backups, the pilot report, and the live self-test.

| Layer | Files |
|---|---|
| HTTP | `netlify/functions/lab-api.mjs` → `netlify/lib/lab/router.mjs`: `/api/lab/<study>/*` (participant and admin routes), `/api/lab/_lab/*` (studies list, create, update), `/api/vc/*` (original verification URLs) |
| Registry | `netlify/lib/lab/registry.mjs`: built-in studies in code; studies created in the lab console are stored in the `lab-registry` Blobs store. Each study gets its own stores (`lab-<id>`, `lab-<id>-backup`). |
| Engine | `engine.mjs` (identity, sessions, plans, saving, exports, deletes), `content.mjs` (engine content, validation, versions), `logic.mjs` (display logic, piped text), `admin.mjs` (keys, roles, audit), `backup.mjs`, `selftest.mjs`, `store.mjs` |
| Survey import | `netlify/lib/lab/import/`: `index.mjs` (format detection, limits), `qsf.mjs`, `lss.mjs`, `redcap.mjs`, `sheet.mjs` (CSV and .xlsx), shared `common.mjs`, `expr.mjs`, `xml.mjs`, `csv.mjs`, `xlsx.mjs`. Route: `POST /api/lab/<study>/admin/import` (see "Importing a survey") |
| Study types | `netlify/lib/lab/types/<type>.mjs` (server) + `static/lab/engine/types/<type>.js` and `<type>-admin.js` (browser), registered in `types/index.mjs` |
| Backups | `netlify/functions/lab-backup.mjs`: hourly, every study in the registry |
| Tests | `npm run test:lab` (in-memory stores); `npm run lab:dev` runs the pages and API locally on in-memory stores at `http://localhost:8899/lab/admin/` (owner key `local-owner-key-0123456789`) |

Study types today:

- **`alert-triage`**: security alerts with click-to-reveal evidence and scheduled AI advice (AI-first, evidence-first, control). Used by the verification study.
- **`vignettes`** (general purpose): scenarios as plain text or emails (optionally with an image), each followed by configurable questions (rating scales, multiple choice, confidence line, text). Conditions are defined in the content, and each item can have different wording per condition, so manipulations need no code. Links written `[text](url)` are shown as links that do not open; pointing at one shows its address at the bottom of the screen, and hovers and clicks are recorded. Sessions without items make a survey-only (for example, longitudinal) study.
- **`multimodal`** (media, voice, and conversations): text, image, audio, video, and phone-call items in ordered or shuffled blocks, with per-condition versions, a mouse-tracked decision, questions, and spoken answers. See "Multimodal studies" above.
- **`game`** (economic games): configurable games (prisoner's dilemma, public goods, trust, ultimatum, dictator, or your own) with payoff formulas, treatments, live matching in real time or asynchronous play against stored decisions, and a payments export. See "Economic games" below.
- **Built-in `data-quality` study** (type `vignettes`, survey-only): the online-survey data-quality battery from SurveyItemsList.docx. Its starting content is code (`netlify/lib/lab/studies/data-quality.mjs`); the first save on its admin page takes over. Unlisted, closed to self sign-up, draft consent: turn those on in the admin page. Columns: CODEBOOK.

Question types for surveys and per-item questions: rating scale (2 to 11 points, optional `start` = the number of the first point, default 1, so a 0 to 10 scale is `n: 11, start: 0`; numbers must stay between -10 and 100), multiple choice, dropdown, text (single line, or multi-line with `long: true`), confidence line, typed number (optional `min` and `max` shown as a hint, never enforced), select-all, and **descriptive text** (`info`: text only, no answer, never required, no column in any export). Survey questions can carry a `page` number to split a long survey into pages. **Order randomization** (`netlify/lib/lab/order.mjs`): `shuffle: true` makes a question trade places at random with the other `shuffle` questions on its page (the rest keep their positions), `shuffleOptions: true` shows a choice, dropdown, or select-all question's options in a random order, and an option with `anchor: true` stays at the end in its listed order. The order is drawn in `buildPlan` from its own seed (participant, study, session), so a reload keeps it and the type's own draws are unchanged; it applies to start- and end-of-session surveys and to per-item questions. The order shown is stored with the answers (`record.shown`) and exported as `order_questions` and `order_{question}` (option values, `|` separated) in the surveys and trials CSVs and in the codebook. Validation refuses a shuffled question that uses display logic or piped text from its own page, or that a question on its page depends on. Survey logic (below) is available on both survey questions and per-item questions.

### Survey logic

Added so that an existing survey can be rebuilt as it was. All of it is validated when content is saved, enforced again by the server when answers are saved, and shown by the participant page as the participant answers.

- **`displayIf`** on a question: `{ "all": [...] }` or `{ "any": [...] }` of conditions, with one more level of all/any allowed inside. A condition is `{ "q": "<variable>", "op": ..., "value": ... }` (an answer to an earlier question), `{ "ed": "<name>", "op": ..., "value": ... }` (embedded data), or `{ "condition": "<id>", "op": "eq" | "neq" }` (the participant's condition). Operators: `eq`, `neq`, `in`, `notIn` (value is a list), `gt`, `gte`, `lt`, `lte` (numbers), `answered`, `notAnswered`. A select-all answer is a list: `eq` means "includes", `in` means "includes any of". An unanswered question makes `eq`, `in`, and the number tests false, and `neq`, `notIn`, and `notAnswered` true.
- **Order.** A rule may only refer to a question on an earlier page, or earlier on the same page, so there are no cycles. Pages are in ascending `page` order; a question without a page is on page 1. A rule cannot refer to descriptive text. An `eq` value must be one of the question's option values, or a point on its scale; the condition and embedded-data names must exist. The editor shows a rule in plain words and accepts it as JSON.
- **Hidden means gone.** A question whose rule is not met is not shown. If it was answered and then hidden, the participant page clears the answer. On saving, the server drops the answer to any hidden question whatever the browser sent, evaluating questions in page order, so a question that depends on a hidden question sees it as unanswered. A page whose questions are all hidden is skipped, and hidden questions are never "required".
- **The condition is not exposed.** Tests on the participant's condition are settled on the server before the plan is sent (`{ "const": true | false }`), so the browser never learns condition names from the logic.
- **Embedded data** (`embedded` in the content): `[{ "name": "prolific_pid", "source": "url", "param": "PROLIFIC_PID" }, { "name": "wave", "source": "value", "value": "2" }]`. A `url` field is read from the study link (`/lab/s/<study>?PROLIFIC_PID=...`) when a session starts, kept in the session's plan, and written to the surveys CSV as `ed_<name>`. A `value` field is a constant from the content. Only declared names are read; values are cleaned and capped at 200 characters; a constant cannot be changed from the browser. Embedded data never takes part in sign-in or in the study ID.
- **Piped text:** `{{q:<variable>}}` (the answer: an option's label, a scale point's label, or what was typed) and `{{ed:<name>}}` in question text, descriptive text, group headings, and option labels. The participant page fills these in with `textContent`, so an answer can never add markup. The variable must be an earlier question that has an answer; the name must be declared.
- **Groups:** optional `group` (an ID) and `groupText` on a question. Consecutive questions with the same `group` are shown under `groupText` once. The lab has no grid question ([B] below): an imported matrix is one question per row (`<base>_<row>`) under one heading.
- **`source`**: a free-text note on where an imported question came from (for example `QID12 (Q3)`); it is not shown to participants.

The same rules are written twice, in `netlify/lib/lab/logic.mjs` (server) and `static/lab/engine/logic.js` (browser, no modules); `tests/lab/display-logic.test.mjs` runs both on one table of cases.

## Importing a survey

Studies of the type "Vignettes and surveys" can start from an existing survey. On the study's admin page, Study content, **Import a survey**: choose a file, click Preview, read what was understood and what was not, then **Load into the editor as an unsaved draft** and click Save changes like any other edit (that makes a numbered version). The lab console (`/lab/admin/`) also has **Create a study from a survey file**, which creates the study and opens this page with the file already previewed. Editors and above can import; nothing is saved by the preview (`POST /api/lab/<study>/admin/import`, body `{ format?, filename, data, encoding? }`, returns `{ content, report }`; the activity log records "survey import previewed"). Loading replaces the survey questions, conditions and sessions, and embedded data in the draft; consent, sign-up, and screen text stay unless "replace the consent text too" is ticked (the imported consent is a marked DRAFT placeholder). If real participants have started, the page warns first.

Limits: files up to 5 MB (about 4.5 MB for an .xlsx, since it is sent as base64 and Netlify caps a request near 6 MB) and 500 questions. A file that cannot be read gives a plain message, never a stack trace. XML is read by a small built-in reader that refuses a DOCTYPE or entity declaration; HTML in question text is reduced to plain text (scripts and styles removed, line breaks kept).

Every import returns a report: `counts` (`questions`, `pages`, `conditions`, `embedded`), `mapped`, `approximated` (the lab does something close), `unsupported` (not reproduced; each entry has the source ID), `warnings`, and an `outline` of pages and questions with their display logic in words. Nothing that cannot be reproduced is dropped silently. A display rule the importer cannot express is left out, so that question is shown to everyone, and the report says so.

| Format | How it maps | Reported as unsupported |
|---|---|---|
| **Qualtrics `.qsf`** | Multiple choice (single answer, select-all, dropdown, Net Promoter) to choice, select, multi, an 11-point scale; recode values or export tags become option values. Matrix Likert to one scale (or choice) question per row under one heading. Text entry: single line, essay (`long`), form (several text questions), valid-number validation to number. Slider to a scale when it has up to 11 steps, otherwise a number with min and max. Descriptive text to `info`. Blocks and Page Breaks to pages. Randomizer (even presentation, subset) to conditions, one per block combination, up to 8. Embedded data (flow) to `embedded`. Branches, question and block display logic, and skip logic (to end of block, end of survey, or a later block) to `displayIf`. A choice with a text box gets a follow-up text question. Piped `${q://QID/ChoiceGroup/SelectedChoices}`, text-entry values, and `${e://Field/name}` to tokens. | Custom JavaScript (the question is imported without it), timing and meta-info questions (dropped), quotas, scoring, workflows, loop and merge, randomized question or choice order (the listed order is used), carry-forward choices, rank order, other question types, authenticators, redirects, contains/regex tests in logic, piped text other than the forms above, graphic-only descriptive blocks |
| **LimeSurvey `.lss`** | Groups to pages (group descriptions to descriptive text). Types L, ! (list, dropdown), O (list with comment), Y, G, 5, M and P (multiple choice), S, T, U (text), N (number with min/max), D (date as text), X (boilerplate to `info`), F, A, B, C, E, K, Q (arrays, one question per row). "Other" becomes an option plus a follow-up text question. Relevance equations of the form `Q1.NAOK == "A1"`, `>`, `>=`, `<`, `<=`, `!=`, joined by and/or with parentheses, on a question or a group, become `displayIf`. `{Q1}` piping becomes a token. | Ranking, equation, file upload, language switch, array of texts or numbers, quotas, assessments, answer or group randomization, array filters, answer-count limits, custom validation equations, relevance with functions or arithmetic, hidden questions |
| **REDCap data dictionary `.csv`** | Forms to pages (or, with the option, one session per form). radio, dropdown, checkbox (one select-all question), yesno, truefalse, text (integer and number validation to number with min and max), notes (long text), slider (a typed number 0 to 100), descriptive (`info`; section headers become descriptive text, or the heading of a matrix group). Matrix group names to groups. Branching logic such as `[sex] = '2'`, `[sx(1)] = '1'`, `<>`, `>`, `<`, `and`, `or`, parentheses becomes `displayIf`. `[field]` piping becomes a token. Fields marked **Identifier? = y** are listed in `report.identifiers` and in a warning: the lab stores their answers like any other answer. | Calculated fields, file upload, SQL fields, action tags such as `@HIDDEN`, branching with functions or smart variables, branching across forms when forms are sessions, date and email validation (a plain text box), REDCap's one-column-per-checkbox-option export |
| **Lab spreadsheet** (`.csv` or `.xlsx`, first sheet) | One row per question, see below. | Anything outside the columns; a bad row is reported with its row number and nothing is imported until the sheet is fixed |

### The spreadsheet template

`static/lab/templates/survey-template.csv` (also linked from the import page) has the header row, comment lines starting with `#`, and example rows. Save as CSV (comma or semicolon separated, quoted fields may hold commas and line breaks) or as .xlsx; only the first sheet is read. Columns:

- `page`: page number; blank repeats the previous row's page.
- `variable`: variable name (letters, digits, underscores; changed to fit the lab's rule if needed, and reported).
- `type`: `choice`, `select`, `multi`, `scale`, `text` (single line), `long` (multi-line), `number`, `slider`, `confidence`, `info` (descriptive text), or `embedded`.
- `text`: the question or the descriptive text; may use `{{q:variable}}` and `{{ed:name}}`. For `embedded`: `param:PROLIFIC_PID` (read from the link) or `value:something` (a constant).
- `options`: `value=label` pairs separated by a vertical bar, or just labels. If every option has an `=`, the left part is the saved value. A literal bar in a label is written `\|`.
- `required`: `yes`, `y`, `true`, `1`, or `x`.
- `scale_points`, `scale_start`, `low_label`, `high_label`, `labels`: a rating scale of 2 to 11 points. `scale_start` is the number of the first point (blank = 1; use 0 for a 0 to 10 scale); the numbers shown, stored, and exported follow it. `labels` is one label per point separated by a vertical bar (recommended: label every point).
- `min`, `max`: for `number`, a hint shown to participants. For `slider`, the range: up to 11 whole steps (or `scale_points`) gives a rating scale numbered from `min`, otherwise a number.
- `show_if`: `variable op value`, with `=`, `==`, `!=`, `<>`, `>`, `>=`, `<`, `<=`; or `variable in a|b` and `variable not in a|b` (values separated by a vertical bar); or `variable answered` and `variable not answered`; or `ed:name = x`; or `condition = c1`. Join tests with `and` or with `or`, not both in one cell. An option's label can stand for its value.
- `condition`: condition IDs (separated by a vertical bar, comma, or semicolon) in which the question appears; blank means all. The conditions listed here, and those used in `show_if`, become the study's conditions.

## Adding a study

**With an existing type (no code):** open `/lab/admin/` with the owner key, create the study (name, ID, type), then on its admin page edit the content (consent, items, questions, sessions), run the live self-test, and pilot. When the consent is IRB-approved and it is ready to recruit, click *List* in the lab console to show it on `/lab/`. Participants sign in at `/lab/s/<id>`.

**With a new type (code):** add three files and register the type in `netlify/lib/lab/types/index.mjs`.

- `netlify/lib/lab/types/<type>.mjs` exports `{ id, label, description, contentKeys, textFields, defaultContent(), normalize(c, defaults), validate(c, errors), conditionsOf(c), sessionCount(c), surveyRules, surveyRule?(rule, ctx), editorMeta?(), buildPlan(p, session, c, rand, helpers) → { trials, practice, ... }, publicTrial(t, plan), publicPlanExtras?(plan), cleanTrialData(data, t, plan), recordFields(t, plan), trialRow(record), simulate(trial, plan, rand), checkRow(row, sent), checkSession(rows, session, condition, c) }`. The browser never sees anything `publicTrial` leaves out (answer keys, internal IDs). `simulate`, `checkRow`, and `checkSession` make the live self-test work for the type.
- `static/lab/engine/types/<type>.js` calls `LabEngine.registerType('<type>', { instructions?(plan, ui) → html, runTrial(ctx, ui) })`. `runTrial` draws the item with `ui` (escaping, screen text, question components, focus handling) and calls `ctx.submit(fields, onError)`; the engine adds traces, raw events, viewport, and device, saves, and moves on. `ctx.record(name, value)` logs answer changes.
- `static/lab/engine/types/<type>-admin.js` calls `LabAdmin.registerType('<type>', { subtabs, render(sub, A), applyEdit?(el, A), click?(button, A), select?(el, A), conditions?(draft), report?(rows, content, R) → { html, table } })` for the content editor and pilot report. Survey, consent, and screen-text tabs come from the engine.

**Browser-only demo (no server):** copy `studies/demo-phishing/`, mark anything whose hover or click matters with `data-trace="name"`, and keep the `{ type: 'local' }` sink.

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

The study is the built-in `verification` entry in `netlify/lib/lab/registry.mjs` (type `alert-triage`, stores `verification-study` and `verification-backup`), served at its original URLs `/lab/studies/verification/` (participant), `/lab/studies/verification/admin.html` (admin), and `/api/vc/*`. Type code: `netlify/lib/lab/types/alert-triage.mjs` (default content in `alert-triage-alerts.mjs`, generated by `build_alert_triage_alerts.py`), `static/lab/engine/types/alert-triage.js` and `alert-triage-admin.js`.

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

### Admin page (`/lab/studies/verification/admin.html`, the same for every study at `/lab/admin/<study>`)

Set `LAB_ADMIN_KEY` (or the original `VC_ADMIN_KEY`; 16+ characters) in the Netlify environment variables; that is the lab owner key, valid for every study and the lab console. Team keys are per study. Researchers can also sign in with an account (see "Researcher accounts"). Tabs:

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
- **Local testing**: `npm run lab:dev` (pages and API on in-memory stores, nothing saved), then add test emails with gap days 0; `npm run test:lab` for the automated tests.

### Reusing this for a future study

Done: the generic parts now live in the engine (see "Study engine" above), and this study is one instance of the `alert-triage` type. A new alert-triage study (different alerts, sessions, or AI schedule) needs no code: create it in the lab console and edit its content.

## Researcher accounts

Researchers sign in with their own account instead of sharing keys. The owner key and the per-study team keys still work exactly as before; an account is one more way to reach the same admin routes. Code: `netlify/lib/lab/accounts.mjs` (accounts, passwords, authenticator, links, sessions, lockout), `admin.mjs` (`authAdmin` takes a resolved account), `router.mjs` (`/api/lab/_lab/auth/*`, `account/*`, `researchers/*`, `mystudies`, `study-summary`, `activity`). Pages: `/lab/signin/`, `/lab/account/`, `/lab/admin/` (console and My studies), `/lab/guide/`, `/lab/support/`. Tests: `tests/lab/accounts.test.mjs`, `pages-contact.test.mjs`.

### What an account is

`accounts/<sha256(lowercased email)>` in the `lab-registry` store: `{ email, name, pwHash, pwSalt, pwParams, totp?: { secret, enabledAt }, recovery: [sha256 of each unused-or-used code], studyRoles: { <studyId>: 'viewer' | 'editor' | 'manager' | 'owner' }, labOwner, disabled, createdAt, createdBy, tokenEpoch, passwordChangedAt }`. A lab owner account (`labOwner: true`) is owner of every study and of the console. Anyone else has the role listed for a study and no access to the others. The lab owner (owner key or lab owner account) creates studies and invites researchers; a study owner role manages that study only.

- **Passwords:** Node `crypto.scrypt`, N = 2^16, r = 8, p = 1, 64-byte output, a random 16-byte salt per account, the parameters stored with the hash, constant-time compare. One hash takes about 0.1 s on a laptop (the test asserts under 1 s); it uses 64 MiB of memory. At least 12 characters (200 at most); refused: the account's email or name (or the part of the email before the @), a very short list of common passwords, and passwords of one or two distinct characters. Passwords and hashes are never logged or returned (a test scans every response and the audit log).
- **Authenticator (optional):** TOTP, RFC 6238, SHA-1, 30 seconds, 6 digits, one step either side, implemented with `node:crypto` (tests use the RFC's vectors). Setup shows the base32 key and the `otpauth://` address as text (no QR code, no outside origin) and turns on only after a correct code. Each accepted 30-second step is written once (`totp-used/<id>/<step>`), so a code cannot be used twice. Eight recovery codes are shown once; only their hashes are stored; each use writes `recovery-used/<id>/<hash>` once, so a code works once even under simultaneous requests. The TOTP secret is stored in the account record in the clear (it must be, to check codes); like the participant pepper, anyone with Netlify access can read it.
- **Sign-in failures:** the same answer and about the same time for an unknown email, a disabled account, an account that has not accepted its invitation, and a wrong password (the unknown cases hash a dummy password). Failures are write-once keys `signin-fail/<sha256(email)>/<minute>-<rand>`; the tenth failure within 15 minutes writes `signin-lock/...` and the email is locked for 15 minutes (HTTP 429), whether or not the account exists. If the request carries `x-nf-client-connection-ip`, failures are also counted per address (`signin-fail-ip/`), with a higher limit (40) because a campus shares addresses; the address is stored only as a hash. Locked attempts are refused before any password work and are not counted again.

### Sessions

A session token is `s1.<payload>.<signature>`; the payload holds the account ID, `tokenEpoch`, issue and expiry times (8 hours), and a random ID. The signature is HMAC-SHA256 over `lab-session|<payload>` with a 32-byte secret in the registry store (`meta/session-secret`, created once with a write-once key on first use). **Anyone with Netlify site access can read that secret** (and so could mint sessions), exactly as they can read the participant pepper; the access list for Netlify is therefore part of the security model. The token travels in the `Authorization: Bearer` header and is kept in the tab's `sessionStorage` (`lab_session`); it is not a cookie, so no other site can make the browser send it.

Every request with a token checks the signature, the expiry, that the account exists, is not disabled, has the same `tokenEpoch`, and that `revoked/<tokenId>` does not exist. **Sign out** writes that write-once key. **Sign out everywhere**, a password change or reset, and disabling an account bump `tokenEpoch`, which ends every older token. The epoch is a field on the account record, written with the usual compare-and-swap. That is acceptable because the record changes rarely and only through the account's own actions or the owner's: two changes to one account in the same instant are very unlikely, and the one case that matters, a lost epoch bump, is handled by re-reading after the write and repeating until the new value is visible. A stolen token also expires on its own within 8 hours.

Researcher tokens and participant tokens are different formats signed with different secrets (the registry's session secret and a study's pepper). The participant routes never read the `Authorization` header and a researcher token fails their check; the admin routes refuse a participant token. Both directions are tested.

### Invitations and reset links

The owner invites a researcher in the console (Researchers): name, email, per-study roles, optional lab owner. The server creates the account (no password yet) and returns a one-time link `/lab/signin/#invite=<token>` valid 7 days; only `sha256(token)` is stored (`invites/<hash>`, write-once). Opening it asks for a name and a password twice, then signs the person in and offers the authenticator. A password-reset link (`#reset=<token>`, 24 hours) works the same way but signs nobody in, so an authenticator is still asked for at the next sign-in. A link is consumed by writing `invites-used/<hash>` once before anything changes; of two simultaneous redemptions only one creates the key, and the other is refused (tested with racing requests on fast and slow stores). A weak password is rejected before the link is consumed. The token is in the address fragment, which browsers do not send to servers or in referrers, and the page removes it from the address bar.

There is no email service. The console shows the link with a Copy button and an "Email this invitation" `mailto:` link addressed to the invitee, so the owner sends it from their own mail app. The same console section changes a researcher's study roles (effective on the next request), disables or enables, issues a reset link, signs the account out everywhere, removes its authenticator (for someone who lost the device and the codes), and removes the account. The owner cannot disable or remove their own account or take away their own lab owner access. All of this, and every sign-in, sign-out, password and authenticator change, goes to the registry audit log (`audit/` in `lab-registry`; Account activity in the console). Study-level actions by a researcher go to that study's audit log under the researcher's name and role, as before.

### My studies

`/lab/admin/` shows, for a researcher, the studies their account can open; for an owner, all studies. One request (`mystudies`) returns, per study, what is cheap: name, type, role, links, whether it is listed, the time of the last completed backup (one read of the backup store's state), and the last self-test (`meta/last-selftest` in the study's store, written when a self-test finishes; a study that never ran one shows "not run"). **Participant counts and last activity are loaded on request** ("Load counts" per study, `study-summary?id=`): they list the study's participants and their progress, which is too much work for every page load. Real and test participants are counted separately; "started" means consented or has progress, "completed" means all sessions done.

### Contact links

Every contact, request-access, and trouble-signing-in action is a `mailto:bampel@gsu.edu?subject=CCAIR%20Behavioral%20Lab&body=...` link with the body percent-encoded, so it opens the visitor's own email app. Nothing is submitted to a server and nothing is stored. `assets/contact.js` builds the links (the static pages carry the same links written out, and a test checks they match). The participant footer link ("Questions about this study? Contact the lab", on `/lab/s/<study>` and the original verification URLs) puts the study name in the body, and the study ID only when the participant is signed in (taken from the sign-in token); it never includes an email address. If the lab owner's address changes, change `TO` in `contact.js` and the links in the HTML pages (the test fails until they agree).

### Runbook

**First researcher.** With the owner key: `/lab/admin/` > use the owner key > Researchers > Invite a researcher. Tick "Lab owner" for a second owner, or choose a role for each study. Copy the link, or use "Email this invitation". The link works once for 7 days. The first thing to do is invite yourself as a lab owner account, so day-to-day work does not need the key.

**Locked out or lost a password.** The owner key always works, whatever the state of accounts: the key does not depend on any account record, the session secret, or the lockout. In the console choose "Reset password link" for the researcher and send it. A forgotten authenticator with no recovery codes: "Remove authenticator", then the researcher sets it up again. A locked email unlocks by itself after 15 minutes; to clear it now, delete the account's `signin-lock/<sha256(email)>/` keys from the `lab-registry` store (Netlify access needed).

**If the owner key itself is lost:** set a new `LAB_ADMIN_KEY` in Netlify (16+ characters) and redeploy. If a lab owner account is the only way in, the key is the fallback; keep it where you keep other secrets.

**Ending a researcher's access.** Disable the account (sessions stop at once), or remove it. A team key given earlier to the same person is separate: remove it on the study's Team tab.

**Rotating the session secret** (if it may have leaked): delete `meta/session-secret` in the `lab-registry` store. Every session ends and the next sign-in creates a new secret.

**Limits.** Sessions last 8 hours with no sliding renewal. There is no email verification beyond the invitation link, no self sign-up, and no single sign-on. The audit log lists attempts only for known accounts, so a flood against unknown addresses is visible only as `signin-fail/` keys.

## Economic games

The study type `game` runs economic experiments: prisoner's dilemma, public goods, trust, ultimatum, dictator, or a game you define yourself. It supports **live** play (participants are matched with each other in real time and decide round by round) and **asynchronous** play (each participant decides alone and is matched with stored decisions of earlier participants). Everything is content, edited on the admin page: a new game or treatment needs no code.

Files: server `netlify/lib/lab/types/game.mjs` and `netlify/lib/lab/game/` (`expr.mjs` formula evaluator, `model.mjs` content and validation, `rules.mjs` pure rules, `presets.mjs`, `live.mjs`, `async.mjs`, `shared.mjs` keys and caches, `export.mjs`, `selftest.mjs`, `sim.mjs` simulated participants, `purge.mjs`); browser `static/lab/engine/types/game.js`, `game.css`, `game-admin.js`. Export columns: `static/lab/CODEBOOK-GAMES.md`. Tests: `tests/lab/game-*.test.mjs`.

### What the editor defines

| Part | Meaning |
|---|---|
| `game` | `mode` (`live` or `async`), roles (`id`, label, number of players; group size is their sum, 1 to 12), `rounds` (1 to 50), `practiceRounds` (unpaid), `matching` (`partners`, `strangers`, `perfectStrangers`, `none`), `cohortGroups`, `decisionSeconds`, `readySeconds`, `waitMaxSeconds`, `waitFallback` (`fee` or `async`), `timeoutAction` (`default`, `random`, `repeatLast`), `dropAfterTimeouts`, `feedbackSeconds`, `pollSeconds`, and the `stages` of a round |
| stages | Ordered. A stage is owned by a role (or everyone) and has 1 to 6 decisions: a choice among options, or a number with a minimum, maximum, and step. Limits may be formulas, for example `multiplier * seen.send` (what the sender chose). Saving checks such a formula over the earlier decision's values and refuses one that can fail (for example `100 / seen.send`); at run time a failing limit falls back to the decision's static bounds and default, and the row is flagged `limit_fallback`. A stage marked "at the same time as the previous stage" is collected in the same step (simultaneous moves). `show` lists earlier decisions the player sees. `strategyMethod` makes a later mover state a response for every possible earlier move (`table`) or a minimum acceptable value (`threshold`) |
| `payoff` | One formula per role. Names: constants, `my.<decision>`, `role.<role>.<decision>` (a list if the role has several players), `others.<decision>` (list, for `sum`, `mean`, `count`), `other.<decision>` (two players), `n`, `round`. Operators `+ - * / ^ %`, comparisons, `and or not`, `cond ? a : b`; functions `min max abs round floor ceil sqrt sum mean count num`; text in quotes. Evaluated by a hand-written parser (`expr.mjs`); no `eval`, no `Function`, no access to globals or the prototype chain. Names are checked against the declared decisions when content is saved, and every formula is tried once with default decisions |
| `params`, `conditions` | Named constants; a condition overrides some of them (treatments). Conditions are balanced like in every study, and live groups form only within a condition |
| `feedback` | What a player sees after a round: own points, others' decisions, group total, a table of earlier rounds. It limits what is shown, not what is stored |
| `payment` | `method` (`randomRound`, `sum`, `mean`), currency per point, show-up fee, largest bonus (blank for none). Practice rounds are never paid |
| `instructions`, `comprehension` | General and per-role text (`{name}` inserts a constant, `{rounds}`, `{rounds_text}` ("1 round", "10 rounds"), `{practiceRounds}`, `{players}`); optional numeric understanding questions with answer keys that stay on the server |

A payoff table is added to the instructions for two-player games in which each player makes one choice. Presets (Presets tab, all editable afterwards): prisoner's dilemma (one round, ten rounds with the same partner), public goods, trust game (live, and asynchronous with the strategy method), ultimatum game (live, and asynchronous with a minimum acceptable offer), dictator game. Sources:

- Prisoner's dilemma: Rapoport, A., & Chammah, A. M. (1965), *Prisoner's Dilemma*, University of Michigan Press; payoff ordering T > R > P > S and 2R > T + S as in Axelrod, R. (1984), *The Evolution of Cooperation*, Basic Books. Shipped values T=5, R=3, P=1, S=0.
- Public goods: Isaac, R. M., & Walker, J. M. (1988), Group size effects in public goods provision, *Quarterly Journal of Economics* 103(1), 179-199. Four players, MPCR 0.4, endowment 20, ten rounds with strangers matching follows Fehr, E., & Gächter, S. (2000), Cooperation and punishment in public goods experiments, *American Economic Review* 90(4), 980-994 (without the punishment stage).
- Trust game: Berg, J., Dickhaut, J., & McCabe, K. (1995), Trust, reciprocity, and social history, *Games and Economic Behavior* 10(1), 122-142. Endowment 10, the amount sent is tripled.
- Ultimatum game: Güth, W., Schmittberger, R., & Schwarze, B. (1982), An experimental analysis of ultimatum bargaining, *Journal of Economic Behavior & Organization* 3(4), 367-388.
- Dictator game: Forsythe, R., Horowitz, J. L., Savin, N. E., & Sefton, M. (1994), Fairness in simple bargaining experiments, *Games and Economic Behavior* 6(3), 347-369.
- Strategy method: Selten, R. (1967), Die Strategiemethode zur Erforschung des eingeschränkt rationalen Verhaltens im Rahmen eines Oligopolexperiments, in H. Sauermann (Ed.), *Beiträge zur experimentellen Wirtschaftsforschung*; evidence on how it compares with direct response: Brandts, J., & Charness, G. (2011), The strategy versus the direct-response method: a first survey of experimental comparisons, *Experimental Economics* 14(3), 375-398. The two methods can give different behavior, so choose one per study and report it.

### How the engine's session maps onto a game

One session, one trial per round (practice rounds first). The engine's trial route confirms a round; for live play the round record is written by the server when the round is over, for asynchronous play the decisions are validated and stored by the trial route. Consent, surveys, versioned content, roles, the activity log, and the hourly backup work as in every study. Participant routes added by the type (all `POST`, same sign-in token as the engine's): `game/poll`, `game/move`, `game/ready`, `game/check` (understanding questions), `game/fallback`, `game/rejoin`, `game/summary`. Admin routes: `game-status`, `game-groups`, `groups.csv` (viewer); `payments`, `payments.csv`, `payments-prolific.csv`, `game-resolve`, `game-close` (manager and owner); `game-check` (viewer; checks a draft without saving). Small hooks were added to the shared engine and router (`saveTrialHook`, `exportTrials`, `purgeParticipant`, `backupExtras`, `routes`, `adminRoutes`, `runSelfTest`, an injectable clock, plugin tabs in `admin.js`, `ui.call` in `participant.js`); each is optional and used only by this type.

### Live play: how matching stays correct on a store without atomic updates

Netlify Blobs does not keep conditional (etag) writes atomic under concurrent requests, so nothing here reads, changes, and writes a shared record. Shared state is **write-once keys** (create only if absent); everything else is derived from which keys exist, by pure functions of the keys and the rules snapshot. Key layout is in the header of `game/shared.mjs`.

1. **Presence.** A waiting participant's browser polls `game/poll` every `pollSeconds` (default 2, 1 allowed). At most once per 5-second bucket the poll writes a heartbeat key `gh/s1/<bucket>/<condition>~<version>~<test>/<lobby entry>~<id>`. The lobby entry time is a write-once record made at the first poll. Test participants (pilots, self-tests) and participants on different content versions are never in the same pool.
2. **Slots.** Groups are formed per 5-second slot `u`, only from heartbeats of bucket `u-2` (ended 5 to 10 seconds ago), minus everyone placed in slots `u-3` to `u-1`. The candidates are sorted by (lobby entry, ID), split into cohorts of `players × cohortGroups` (a smaller cohort after half the longest wait for strangers matching), and each cohort's members are shuffled with a seed derived from the slot and the study; position in the shuffled list decides the role. The function is deterministic, so instances that see the same keys compute the same cohorts.
3. **One record per slot.** The result is a single write-once record `g/slot/<u>`. If two instances compute different results (for example because one listed a heartbeat the other did not see yet), whichever creates the key first wins, the other reads it back and adopts it, and then writes the same per-participant pointers (`g/p/<id>/member/<n>`) and cohort records. So there is no state in which a participant belongs to two groups; the worst case of a disagreement is a participant who waits one more slot. One waiting participant per slot wins a claim key and does the work; the claim only saves duplicate work (a stale claim does not block anyone).
4. **Chain.** The matcher for slot `u` first makes sure slots `u-3` to `u-1` exist (computing missing ones in order), so the exclusion above is the same wherever it runs.
5. **Confirm guard.** A matched participant sees the group and their role and presses "I am ready". The cohort's single `decision` record is written when everyone has confirmed (`go`) or when `readySeconds` have passed without that (`abandoned`, with the list of those who did confirm). Confirmed members return to the waiting room with their original entry time, so they are first in line for the next slot. An abandoned cohort never plays. Members who did not confirm are not placed again: they see "You were not in the group" with a button, and only pressing it (`game/rejoin`) puts them back, at the back of the line. People who took the fallback or finished asynchronously are never placed. Memberships are numbered without a limit.
6. **Moves.** `g/c/<cohort>/move/r<round>/s<step>/<id>` is write-once. A step starts when the previous one is complete (its `start` record is written by whichever poll first sees that; round starts wait for everyone to press Continue or for `feedbackSeconds`). The server validates every move against the stage's decision spec (kind, options, limits, step), the player's role, the round, and the step; it never takes a participant ID from the request body, only from the signed token.
7. **Timeouts.** A poll that finds a step past `decisionSeconds` plus 2.5 seconds writes the missing players' moves with `auto: true` using `timeoutAction`. The values are pure functions of group, round, player, and rules, so racing writers write the same thing. After `dropAfterTimeouts` timeouts in a row a `dropped` key is written; that player is played by the rule from then on, immediately, and the others see "A participant has left the game". A human move that arrives after the automatic one is acknowledged but does not replace it.
8. **Outcomes.** A round's payoffs are a pure function of the moves and the rules snapshot (the participant's plan holds a copy of the rules and the cohort holds the content version, so editing the study never changes a running group). When the last move of a round exists, whichever poll notices writes each member's round record (`data/<id>/s1/t<round>`, write-once, the same record the engine's exports read), including for members who are away. The paid round is drawn once per participant when their last round is recorded, with the engine's seeded generator seeded by the study's server-side secret (the pepper), the ID, and the study, and stored write-once, so nobody can work it out from public information before the end. A poll rewrites it (same value) if a server stopped between the round record and the pay record.
9. **Reloads.** A participant who reloads signs in again and the engine opens the first round without a record; the poll finds their group from the membership keys and the round state from the keys that exist.

Assumptions, stated plainly:

- Create-if-absent (`onlyIfNew`) is atomic. The whole engine relies on it. The live self-test checks it on the real store with 12 simultaneous writers. Records that different instances might compute differently (slots, cohorts, decisions, moves, starts) are also read back after creation.
- A key listing shows keys that are about 5 seconds old. The 10-second settle window (buckets `u-2` and older, matched at slot `u`) leaves a margin; the tests include a view of the listing 3 seconds behind (no effect) and 12 seconds behind (matching is delayed, still consistent).
- A request finishes within about 15 seconds. A request that stalls longer and then writes a slot could place someone twice; the confirm guard then abandons that group.
- Do not edit the study content while people are waiting. People on different versions are matched separately, so an edit splits the waiting room.

### Asynchronous play

Each participant gets a role (the role with the fewest participants per place so far, counted from write-once markers, within their condition) and answers every round alone. Decisions that depend on another player's earlier move must use the strategy method: a table with a response for every possible earlier value, or a threshold. The editor refuses a design that shows another player's move in asynchronous mode without it. On answering the last round the participant is matched: for every other place in the group, partners are drawn at random (seeded by participant and study) from participants of the complementary roles in the same condition who finished earlier, each round independently for `strangers`, the same partners for `partners`, and fresh partners where possible for `perfectStrangers`. The record `g/p/<id>/amatch` is written once and holds the partners' IDs and a copy of the decisions used, so later events cannot change it. Payoffs are computed from the participant's decisions and the copies.

The first participants find nobody and are **pending** (`g/apend/<id>`). Pending matches are resolved by the admin action "Resolve pending matches" (Game operations tab) and automatically at the start of every payments export, using everyone who has finished since. A role whose payoff depends on no one else (a dictator) is matched at once. Test participants have their own pool and never serve real participants. If the live waiting room is configured to fall back to asynchronous play, that participant needs stored asynchronous decisions to be matched with; run an asynchronous batch first or accept that the match stays pending.

### Exports, payments, and privacy

- **Trials CSV** (Participants tab, or `export.csv`): one row per participant, round, and stage, with group, role, decisions, whether the decision was automatic, others' decisions, payoff, cumulative payoff, whether the round is paid, condition, content version. **Groups CSV**: one row per cohort, round, and group. Columns: `CODEBOOK-GAMES.md`.
- **Payments CSV** (managers and owner): participant study ID, condition, external ID, completed (`yes`, `partial`, `dropped`), match status, paid round, points, bonus (capped at the largest bonus), show-up fee, total, currency. The show-up fee goes to everyone who started, including people who left or could not be matched. **Prolific bulk bonus CSV**: `participant_id,amount` for real participants with an external ID and a bonus above zero. Email addresses are never read or written by these exports.
- **External ID.** The game uses the engine's embedded data: the default content declares a field `prolific_pid` read from the URL parameter `PROLIFIC_PID`, which the engine captures when the session starts and keeps in the plan. Payments and the Prolific file read that field (and the trials CSV has it as `external_id`; the engine also exports it as `ed_prolific_pid` in the surveys CSV). Only letters, digits, underscore, and hyphen are accepted. Participants can type any ID into the address, so treat it as a payment reference, not an identity. Sign-in is still the engine's (email on an allowed domain, or an access code), so a Prolific study needs one of those. There is no separate game capture any more.
- Decisions of a deleted participant are removed from the group; round records of the people they played with keep the decisions as values without any ID. Asynchronous matches of other participants keep the copy of the decision they used. The complete backup includes the game state of each participant (matches, payment draws, external IDs) in `extras`.
- Behavior traces (mouse, keystrokes) are not stored for game rounds. Each decision records its response time and the time the tab was hidden.

### Participant UI

The same rules as the other types: plain language; labelled controls and 48 px targets; focus moves to each new screen's heading; one calm line showing the time left (nothing flashes or moves; reduced-motion is satisfied because nothing is animated); the same layout in every condition; honest progress ("Round k of N", "Practice round i of n"); tables with row and column headers; waiting counts in polite live regions. The waiting room says how many participants are present and for how long they have waited, and after the longest wait offers the configured fallback together with "Keep waiting". Polling slows to every 5 seconds while the tab is hidden and resumes at once on return. Choices follow the research notes above: decisions have no preselected value (defaults only apply when time runs out), and what is shown after a round follows the feedback settings.

### Limits

- Rounds only: no continuous-time markets, no real-time asks and bids. A round is as fast as the slowest participant plus up to one polling interval.
- Latency is up to one polling interval (2 seconds by default, 1 allowed) plus about half a second between one participant's decision and the other's screen (their poll must see it), and 10 to 15 seconds from arrival to a match (the settle window).
- Group size up to 12, rounds up to 50, up to 6 roles, 8 stages per round. Perfect strangers needs many groups per cohort (four players over five rounds needs five groups, 20 people at once); the editor says how many.
- A cohort of several groups needs all its members present and confirmed; one missing person sends everyone back to the waiting room.
- Roles are fixed for the whole game. A participant cannot join a game in progress.
- Participants must keep the page open. Closing it counts as not responding.

### Polling cost on Netlify

Every poll is one function invocation (`/api/lab/<study>/game/poll`), about once per `pollSeconds` (default 2) while the page is visible, every 5 seconds when hidden. Besides polls a participant sends roughly three requests per round (`view`, `move` per step, `trial`) and a few at the start and end.

| Situation | Invocations |
|---|---|
| Live, per participant-minute, `pollSeconds` 1 | about 60 polls + 5 others = 65 |
| Live, `pollSeconds` 2 (default) / 3 | about 35 / 25 |
| Live, tab hidden | about 12 |
| Asynchronous, per participant | about (rounds + 6) in total, no polling |
| Live study, 40 participants, 15 minutes each (3 waiting, 12 playing), `pollSeconds` 2 | about 40 × 15 × 35 = 21,000 (39,000 at 1 s) |
| Live study, 100 participants, 20 minutes each, `pollSeconds` 2 | about 70,000 (130,000 at 1 s) |

Storage operations per poll (counted in a test run, after the review fixes): in the waiting room about 3 reads per poll, plus a heartbeat write every 5 seconds (the server's own clock decides, not the browser's) and a claim check; the one participant who wins the claim does about 10 reads, 3 lists, and 2 to 3 writes for the slot and removes one old heartbeat bucket; in play about 6 to 10 reads (moves are read back after writing), 2 to 3 lists, and 1 to 2 writes per request on average. Empty matching slots are recorded once and not listed again, and cohorts are listed from a small index (`g/cidx/`), so exports and the status view do not scan every move.

### Operations runbook

**Before a session**

1. Create the study (lab console, type "Economic game"), apply a preset, edit it, and run "Check the design" (Payoffs tab). Save. Write the consent text and tick "IRB-approved" only when it is.
2. Run the self-test on the Participants tab (owner). It plays a whole simulated session on the real store, including a participant who stops responding and, where allowed, an asynchronous batch, checks groups, moves, payoffs, and exports, and deletes everything. Its time is simulated, so it does not test real waiting.
3. Pilot with test codes: create 2 to 12 codes marked "test" (Students tab), open `/lab/s/<study>` in as many browser tabs (each tab has its own sign-in) and sign in with one code each. Test participants only meet each other. Locally, `npm run lab:dev` runs pages and API on in-memory stores at `http://localhost:8899/lab/admin/` (owner key `local-owner-key-0123456789`); create the study again after every restart. Check the Pilot report (mean decisions, timeouts, waiting, match rate) and the Game operations tab, then "Delete all test participants".

**During a live session**

- Staff: one person on the Game operations tab with "Refresh every 5 seconds", one to answer participants. Tell participants to keep the tab open and visible.
- Have participants arrive inside a window of a few minutes. Groups form in multiples of the group size (or cohort size); the last few arrivals wait. Invite a few more than a multiple of the group size and let the fee fallback handle leftovers, or set the fallback to asynchronous play if stored decisions exist.
- Do not edit the study while anyone is waiting or playing.
- Watch "stalled" in the status table. Usually a group recovers on its own: a missing decision is filled in after `decisionSeconds`, and after `dropAfterTimeouts` timeouts the player is marked as having left and the game stops waiting for them.

**When a group stalls**

1. Check whether someone is still in the group (the status shows round, players, who left, last activity). If at least one human is still playing, wait: the server fills in missing moves when that person's page polls.
2. If everyone has left (a stalled group with no activity for several minutes), press "Close" (manager or owner). Every missing move is written with the timeout rule, flagged `auto_why = admin`, every round is recorded, and the participants can finish if they return. Closing twice does no harm.
3. If a group never started (status `confirming` for longer than `readySeconds`), the next poll of any member abandons it and the people who confirmed return to the waiting room. If nobody polls, it simply stays unconfirmed and never plays; nothing to do.
4. Decide with the IRB-approved plan whether to pay participants who were left in a stalled group; their rows in the payments file show `completed = dropped` or `partial`.

**After**

Download the trials CSV and groups CSV, then the payments CSV; preview totals first ("Preview totals"). Upload the Prolific CSV, if you recruit there, after checking the count of participants left out (no external ID, pending match, no bonus). Run "Resolve pending matches" for asynchronous studies and download payments again if anything was pending. Mark or delete test participants before analysis (`test` column).
