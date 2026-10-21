# CCAIR Behavioral Lab

Browser-based behavioral studies at `bampel.com/lab/`. Everything here is static and needs no build step: Hugo copies `static/lab/` to the site as is.

```
static/lab/
  index.html                    lab landing page (lists studies from the registry)
  assets/study.css              plain, light styling for participant pages
  tracelab/tracelab.js          passive trace capture (no dependencies)
  engine/participant.js, .css   shared participant app (every server-backed study)
  engine/admin.js, .css         shared admin page and lab console
  engine/types/<type>.js        a study type's item screen
  engine/types/<type>-admin.js  a study type's content-editor tabs and report sections
  s/index.html                  participant page for /lab/s/<study>
  admin/index.html              admin page for /lab/admin/<study>; lab console at /lab/admin/
  studies/demo-phishing/        demo study; data never leaves the browser
  studies/verification/         original URLs of the verification study (thin pages on the engine)
  CODEBOOK.md                   column definitions for the exports
```

## Study engine

Every server-backed study runs on one engine; a study is data (its content, edited on its admin page) plus a **study type** that defines its item screen. The engine provides, for every study: GSU-email sign-in (or pilot codes), consent, multi-session scheduling with gap days, balanced condition assignment, start- and end-of-session surveys, behavior traces, write-once storage, versioned content editing, team roles, the activity log, batched exports, hourly backups, the pilot report, and the live self-test.

| Layer | Files |
|---|---|
| HTTP | `netlify/functions/lab-api.mjs` → `netlify/lib/lab/router.mjs`: `/api/lab/<study>/*` (participant and admin routes), `/api/lab/_lab/*` (studies list, create, update), `/api/vc/*` (original verification URLs) |
| Registry | `netlify/lib/lab/registry.mjs`: built-in studies in code; studies created in the lab console are stored in the `lab-registry` Blobs store. Each study gets its own stores (`lab-<id>`, `lab-<id>-backup`). |
| Engine | `engine.mjs` (identity, sessions, plans, saving, exports, deletes), `content.mjs` (engine content, validation, versions), `admin.mjs` (keys, roles, audit), `backup.mjs`, `selftest.mjs`, `store.mjs` |
| Study types | `netlify/lib/lab/types/<type>.mjs` (server) + `static/lab/engine/types/<type>.js` and `<type>-admin.js` (browser), registered in `types/index.mjs` |
| Backups | `netlify/functions/lab-backup.mjs`: hourly, every study in the registry |
| Tests | `npm run test:lab` (in-memory stores); `npm run lab:dev` runs the pages and API locally on in-memory stores at `http://localhost:8899/lab/admin/` (owner key `local-owner-key-0123456789`) |

Study types today:

- **`alert-triage`**: security alerts with click-to-reveal evidence and scheduled AI advice (AI-first, evidence-first, control). Used by the verification study.
- **`vignettes`** (general purpose): scenarios as plain text or emails (optionally with an image), each followed by configurable questions (rating scales, multiple choice, confidence line, text). Conditions are defined in the content, and each item can have different wording per condition, so manipulations need no code. Links written `[text](url)` are shown as links that do not open; pointing at one shows its address at the bottom of the screen, and hovers and clicks are recorded. Sessions without items make a survey-only (for example, longitudinal) study.
- **`game`** (economic games): configurable games (prisoner's dilemma, public goods, trust, ultimatum, dictator, or your own) with payoff formulas, treatments, live matching in real time or asynchronous play against stored decisions, and a payments export. See "Economic games" below.
- **Built-in `data-quality` study** (type `vignettes`, survey-only): the online-survey data-quality battery from SurveyItemsList.docx. Its starting content is code (`netlify/lib/lab/studies/data-quality.mjs`); the first save on its admin page takes over. Unlisted, closed to self sign-up, draft consent: turn those on in the admin page. Columns: CODEBOOK.

Question types for surveys and per-item questions: rating scale, multiple choice, dropdown, text, confidence line, typed number, and select-all. Survey questions can carry a `page` number to split a long survey into pages.

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

Set `LAB_ADMIN_KEY` (or the original `VC_ADMIN_KEY`; 16+ characters) in the Netlify environment variables; that is the lab owner key, valid for every study and the lab console. Team keys are per study. Tabs:

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

## Economic games

The study type `game` runs economic experiments: prisoner's dilemma, public goods, trust, ultimatum, dictator, or a game you define yourself. It supports **live** play (participants are matched with each other in real time and decide round by round) and **asynchronous** play (each participant decides alone and is matched with stored decisions of earlier participants). Everything is content, edited on the admin page: a new game or treatment needs no code.

Files: server `netlify/lib/lab/types/game.mjs` and `netlify/lib/lab/game/` (`expr.mjs` formula evaluator, `model.mjs` content and validation, `rules.mjs` pure rules, `presets.mjs`, `live.mjs`, `async.mjs`, `shared.mjs` keys and caches, `export.mjs`, `selftest.mjs`, `sim.mjs` simulated participants, `purge.mjs`); browser `static/lab/engine/types/game.js`, `game.css`, `game-admin.js`. Export columns: `static/lab/CODEBOOK-GAMES.md`. Tests: `tests/lab/game-*.test.mjs`.

### What the editor defines

| Part | Meaning |
|---|---|
| `game` | `mode` (`live` or `async`), roles (`id`, label, number of players; group size is their sum, 1 to 12), `rounds` (1 to 50), `practiceRounds` (unpaid), `matching` (`partners`, `strangers`, `perfectStrangers`, `none`), `cohortGroups`, `decisionSeconds`, `readySeconds`, `waitMaxSeconds`, `waitFallback` (`fee` or `async`), `timeoutAction` (`default`, `random`, `repeatLast`), `dropAfterTimeouts`, `feedbackSeconds`, `pollSeconds`, and the `stages` of a round |
| stages | Ordered. A stage is owned by a role (or everyone) and has 1 to 6 decisions: a choice among options, or a number with a minimum, maximum, and step. Limits may be formulas, for example `multiplier * seen.send` (what the sender chose). A stage marked "at the same time as the previous stage" is collected in the same step (simultaneous moves). `show` lists earlier decisions the player sees. `strategyMethod` makes a later mover state a response for every possible earlier move (`table`) or a minimum acceptable value (`threshold`) |
| `payoff` | One formula per role. Names: constants, `my.<decision>`, `role.<role>.<decision>` (a list if the role has several players), `others.<decision>` (list, for `sum`, `mean`, `count`), `other.<decision>` (two players), `n`, `round`. Operators `+ - * / ^ %`, comparisons, `and or not`, `cond ? a : b`; functions `min max abs round floor ceil sqrt sum mean count num`; text in quotes. Evaluated by a hand-written parser (`expr.mjs`); no `eval`, no `Function`, no access to globals or the prototype chain. Names are checked against the declared decisions when content is saved, and every formula is tried once with default decisions |
| `params`, `conditions` | Named constants; a condition overrides some of them (treatments). Conditions are balanced like in every study, and live groups form only within a condition |
| `feedback` | What a player sees after a round: own points, others' decisions, group total, a table of earlier rounds. It limits what is shown, not what is stored |
| `payment` | `method` (`randomRound`, `sum`, `mean`), currency per point, show-up fee, largest bonus (blank for none). Practice rounds are never paid |
| `instructions`, `comprehension` | General and per-role text (`{name}` inserts a constant, `{rounds}`, `{practiceRounds}`, `{players}`); optional numeric understanding questions with answer keys that stay on the server |

A payoff table is added to the instructions for two-player games in which each player makes one choice. Presets (Presets tab, all editable afterwards): prisoner's dilemma (one round, ten rounds with the same partner), public goods, trust game (live, and asynchronous with the strategy method), ultimatum game (live, and asynchronous with a minimum acceptable offer), dictator game. Sources:

- Prisoner's dilemma: Rapoport, A., & Chammah, A. M. (1965), *Prisoner's Dilemma*, University of Michigan Press; payoff ordering T > R > P > S and 2R > T + S as in Axelrod, R. (1984), *The Evolution of Cooperation*, Basic Books. Shipped values T=5, R=3, P=1, S=0.
- Public goods: Isaac, R. M., & Walker, J. M. (1988), Group size effects in public goods provision, *Quarterly Journal of Economics* 103(1), 179-199. Four players, MPCR 0.4, endowment 20, ten rounds with strangers matching follows Fehr, E., & Gächter, S. (2000), Cooperation and punishment in public goods experiments, *American Economic Review* 90(4), 980-994 (without the punishment stage).
- Trust game: Berg, J., Dickhaut, J., & McCabe, K. (1995), Trust, reciprocity, and social history, *Games and Economic Behavior* 10(1), 122-142. Endowment 10, the amount sent is tripled.
- Ultimatum game: Güth, W., Schmittberger, R., & Schwarze, B. (1982), An experimental analysis of ultimatum bargaining, *Journal of Economic Behavior & Organization* 3(4), 367-388.
- Dictator game: Forsythe, R., Horowitz, J. L., Savin, N. E., & Sefton, M. (1994), Fairness in simple bargaining experiments, *Games and Economic Behavior* 6(3), 347-369.
- Strategy method: Selten, R. (1967), Die Strategiemethode zur Erforschung des eingeschränkt rationalen Verhaltens im Rahmen eines Oligopolexperiments, in H. Sauermann (Ed.), *Beiträge zur experimentellen Wirtschaftsforschung*; evidence on how it compares with direct response: Brandts, J., & Charness, G. (2011), The strategy versus the direct-response method: a first survey of experimental comparisons, *Experimental Economics* 14(3), 375-398. The two methods can give different behavior, so choose one per study and report it.

### How the engine's session maps onto a game

One session, one trial per round (practice rounds first). The engine's trial route confirms a round; for live play the round record is written by the server when the round is over, for asynchronous play the decisions are validated and stored by the trial route. Consent, surveys, versioned content, roles, the activity log, and the hourly backup work as in every study. Participant routes added by the type (all `POST`, same sign-in token as the engine's): `game/poll`, `game/move`, `game/ready`, `game/check` (understanding questions), `game/fallback`, `game/ext`, `game/summary`. Admin routes: `game-status`, `game-groups`, `groups.csv` (viewer); `payments`, `payments.csv`, `payments-prolific.csv`, `game-resolve`, `game-close` (manager and owner); `game-check` (viewer; checks a draft without saving). Small hooks were added to the shared engine and router (`saveTrialHook`, `exportTrials`, `purgeParticipant`, `backupExtras`, `routes`, `adminRoutes`, `runSelfTest`, an injectable clock, plugin tabs in `admin.js`, `ui.call` in `participant.js`); each is optional and used only by this type.

### Live play: how matching stays correct on a store without atomic updates

Netlify Blobs does not keep conditional (etag) writes atomic under concurrent requests, so nothing here reads, changes, and writes a shared record. Shared state is **write-once keys** (create only if absent); everything else is derived from which keys exist, by pure functions of the keys and the rules snapshot. Key layout is in the header of `game/shared.mjs`.

1. **Presence.** A waiting participant's browser polls `game/poll` about once a second. At most once per 5-second bucket the poll writes a heartbeat key `gh/s1/<bucket>/<condition>~<version>~<test>/<lobby entry>~<id>`. The lobby entry time is a write-once record made at the first poll. Test participants (pilots, self-tests) and participants on different content versions are never in the same pool.
2. **Slots.** Groups are formed per 5-second slot `u`, only from heartbeats of bucket `u-2` (ended 5 to 10 seconds ago), minus everyone placed in slots `u-3` to `u-1`. The candidates are sorted by (lobby entry, ID), split into cohorts of `players × cohortGroups` (a smaller cohort after half the longest wait for strangers matching), and each cohort's members are shuffled with a seed derived from the slot and the study; position in the shuffled list decides the role. The function is deterministic, so instances that see the same keys compute the same cohorts.
3. **One record per slot.** The result is a single write-once record `g/slot/<u>`. If two instances compute different results (for example because one listed a heartbeat the other did not see yet), whichever creates the key first wins, the other reads it back and adopts it, and then writes the same per-participant pointers (`g/p/<id>/member/<n>`) and cohort records. So there is no state in which a participant belongs to two groups; the worst case of a disagreement is a participant who waits one more slot. One waiting participant per slot wins a claim key and does the work; the claim only saves duplicate work (a stale claim does not block anyone).
4. **Chain.** The matcher for slot `u` first makes sure slots `u-3` to `u-1` exist (computing missing ones in order), so the exclusion above is the same wherever it runs.
5. **Confirm guard.** A matched participant sees the group and their role and presses "I am ready". The cohort's single `decision` record is written when everyone has confirmed (`go`) or when `readySeconds` have passed without that (`abandoned`, with the list of those who did confirm). Confirmed members return to the waiting room with their original entry time, so they are first in line for the next slot. An abandoned cohort never plays.
6. **Moves.** `g/c/<cohort>/move/r<round>/s<step>/<id>` is write-once. A step starts when the previous one is complete (its `start` record is written by whichever poll first sees that; round starts wait for everyone to press Continue or for `feedbackSeconds`). The server validates every move against the stage's decision spec (kind, options, limits, step), the player's role, the round, and the step; it never takes a participant ID from the request body, only from the signed token.
7. **Timeouts.** A poll that finds a step past `decisionSeconds` plus 2.5 seconds writes the missing players' moves with `auto: true` using `timeoutAction`. The values are pure functions of group, round, player, and rules, so racing writers write the same thing. After `dropAfterTimeouts` timeouts in a row a `dropped` key is written; that player is played by the rule from then on, immediately, and the others see "A participant has left the game". A human move that arrives after the automatic one is acknowledged but does not replace it.
8. **Outcomes.** A round's payoffs are a pure function of the moves and the rules snapshot (the participant's plan holds a copy of the rules and the cohort holds the content version, so editing the study never changes a running group). When the last move of a round exists, whichever poll notices writes each member's round record (`data/<id>/s1/t<round>`, write-once, the same record the engine's exports read), including for members who are away. The paid round is drawn once per participant with the engine's seeded generator (`seeded(id|study|paidround)`) and stored write-once.
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
- **External ID.** The engine has no general field for it yet. The game screen reads `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID` from the address once and stores them with `game/ext` under `g/p/<id>/ext` (only letters, digits, underscore, and hyphen are accepted). Participants can type any ID into the address, so treat it as a payment reference, not an identity. Sign-in is still the engine's (email on an allowed domain, or an access code), so a Prolific study needs one of those; the other branch may add a general embedded-data feature to replace this key.
- Decisions of a deleted participant are removed from the group; round records of the people they played with keep the decisions as values without any ID. Asynchronous matches of other participants keep the copy of the decision they used. The complete backup includes the game state of each participant (matches, payment draws, external IDs) in `extras`.
- Behavior traces (mouse, keystrokes) are not stored for game rounds. Each decision records its response time and the time the tab was hidden.

### Participant UI

The same rules as the other types: plain language; labelled controls and 48 px targets; focus moves to each new screen's heading; one calm line showing the time left (nothing flashes or moves; reduced-motion is satisfied because nothing is animated); the same layout in every condition; honest progress ("Round k of N", "Practice round i of n"); tables with row and column headers; waiting counts in polite live regions. The waiting room says how many participants are present and for how long they have waited, and after the longest wait offers the configured fallback together with "Keep waiting". Polling slows to every 5 seconds while the tab is hidden and resumes at once on return. Choices follow the research notes above: decisions have no preselected value (defaults only apply when time runs out), and what is shown after a round follows the feedback settings.

### Limits

- Rounds only: no continuous-time markets, no real-time asks and bids. A round is as fast as the slowest participant plus up to one polling interval.
- Latency is about 1 to 2 seconds between one participant's decision and the other's screen (their poll must see it), and 10 to 15 seconds from arrival to a match (the settle window).
- Group size up to 12, rounds up to 50, up to 6 roles, 8 stages per round. Perfect strangers needs many groups per cohort (four players over five rounds needs five groups, 20 people at once); the editor says how many.
- A cohort of several groups needs all its members present and confirmed; one missing person sends everyone back to the waiting room.
- Roles are fixed for the whole game. A participant cannot join a game in progress.
- Participants must keep the page open. Closing it counts as not responding.

### Polling cost on Netlify

Every poll is one function invocation (`/api/lab/<study>/game/poll`), about once per `pollSeconds` (default 1) while the page is visible, every 5 seconds when hidden. Besides polls a participant sends roughly three requests per round (`view`, `move` per step, `trial`) and a few at the start and end.

| Situation | Invocations |
|---|---|
| Live, per participant-minute, `pollSeconds` 1 | about 60 polls + 5 others = 65 |
| Live, `pollSeconds` 2 / 3 | about 35 / 25 |
| Live, tab hidden | about 12 |
| Asynchronous, per participant | about (rounds + 6) in total, no polling |
| Live study, 40 participants, 15 minutes each (3 waiting, 12 playing), `pollSeconds` 1 | about 40 × 15 × 65 = 39,000 |
| Live study, 100 participants, 20 minutes each | about 130,000 |

Storage operations per poll (counted in a test run): in the waiting room 2 reads per poll, plus a heartbeat write and a claim check every 5 seconds, and for the one participant who wins the claim about 10 reads, 3 lists, and 2 writes for the slot; in play about 5 to 8 reads, 2 list calls, and 1 write on average. At roughly 20 to 60 ms per storage call a poll runs about 0.1 to 0.4 seconds, so 39,000 polls are about 1 to 4 hours of function time. Netlify's free tier has allowed 125,000 function invocations and 100 hours of function time a month; check the current limits for the site's plan, since they change, and remember the rest of the site shares them. To spend less: set `pollSeconds` to 2 or 3 (every decision then reaches the others up to that much later), keep waiting rooms short (schedule participants into a window, use the fee fallback after a short wait), prefer asynchronous play when the question allows it, and run sessions in bursts instead of leaving a waiting room open for hours.

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
