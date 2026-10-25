# Lab export codebook

**Each study also has its own generated codebook** (Participants tab: *Download this study's codebook*, as CSV or Markdown; routes `admin/codebook.csv` and `admin/codebook.md`). It lists every column of that study's trials and surveys CSVs with its kind, allowed values and labels, question text, and the conditions, sessions, and display rules it applies to, plus the column patterns of the wide CSV. This file gives the general definitions.

**Wide CSV** (one row per participant; `admin/export-wide.csv`, or *Download wide CSV* on the Participants tab, built in batches): `code`, `condition`, `test`, `label`, `self_signup`, `consented`, `sessions_completed`, `total_sessions`, `finished`, `screened_out` (reason), `returned` (chose to stop), `panel_study`, `panel_sessions` (distinct panel session IDs; more than 1 = opened the study more than once), `s{n}_started_at`, `s{n}_completed_at`, `s{n}_minutes`, `ed_{name}`, `s{n}_{pre|post}_{question}`, and `s{n}_{item}_{measure}` for every trial measure below, named by the item ID (`t{index}` without one). Identifiers and timestamps that repeat on every trial row are left out. Economic games keep their rounds in their own long export.

Economic games (study type `game`) have their own export columns in [CODEBOOK-GAMES.md](CODEBOOK-GAMES.md). Applies to every study on the lab engine. "Identifiers and design" (first rows), "Behavior and context", and "Surveys CSV" are the same for every study; the alert sections are specific to `alert-triage` studies (the verification study), and "Vignettes studies" lists the columns of `vignettes` studies.

Trials CSV: one row per item (alert, scenario) answered. Surveys CSV: one row per survey submitted. Times are ISO 8601 UTC; durations are milliseconds. Empty cells mean "not applicable" (for example, AI columns in sessions without the AI).

## Identifiers and design

| Column | Meaning |
|---|---|
| `code` | Study ID (`P-…` for email sign-in, `VC-…` for pilot codes). Not the email. |
| `condition` | `ai_first`, `evidence_first`, or `control` |
| `test` | 1 = test or pilot participant (exclude from analysis) |
| `label` | Enrollment label (class, pilot, `self-signup`, `self-test`) |
| `self_signup` | 1 = signed up themselves with an allowed email domain |
| `session`, `trial_index` | Session number; position of the alert within the session (0 = first shown) |
| `alert_id`, `family`, `truth` | Alert, its type, and its correct answer as scored |
| `mode` | What the participant saw: `ai_first`, `evidence_first`, or `none` (no AI on this trial) |
| `content_version` | Version of the study content the session plan was built from |
| `panel_order` | Order of the evidence tabs on screen for this participant (`>`-separated keys) |
| `answer_order` | Order of the answer buttons for this participant |

## AI advice

| Column | Meaning |
|---|---|
| `ai_type` | `accurate`, `uncertain_correct`, `incorrect`, `uncertain_incorrect`, `manipulated`, or empty |
| `ai_verdict`, `ai_confidence` | What the AI said and the confidence shown (%) |
| `ai_shown_at_ms` | Time from trial start to the AI appearing (0 in AI-first; after the initial answer in evidence-first) |

## Answers and reliance

| Column | Meaning |
|---|---|
| `initial_judgment`, `initial_confidence`, `initial_rt_ms` | Evidence-first only: answer and confidence (0–100) before the AI appeared, and when it was locked in |
| `final_judgment`, `final_confidence`, `final_rt_ms` | Final answer, confidence (0–100), and time from trial start to submission |
| `correct` | 1 if the final answer matches `truth` |
| `agree_ai` | 1 if the final answer matches the AI's verdict |
| `changed_initial_to_final` | Evidence-first: 1 if the final answer differs from the initial one |
| `switched_to_ai` | Evidence-first: 1 if the initial answer disagreed with the AI and the final answer agrees |
| `influential_panels` | What the participant said most influenced them (`|`-separated panel keys, `summary`, `ai`) |

## Verification (evidence inspection)

| Column | Meaning |
|---|---|
| `panels_opened_unique` | Number of different evidence panels opened |
| `panel_opens_total` | Number of times any panel was opened |
| `evidence_breadth` | `panels_opened_unique` ÷ number of panels on the alert |
| `revisits` | `panel_opens_total` − `panels_opened_unique` |
| `opens_after_ai` | Panel openings that started after the AI appeared. In AI-first this equals all openings (the AI is visible from the start). |
| `first_panel`, `first_panel_position` | First panel opened and its position on screen (1 = leftmost) |
| `panel_sequence` | All openings in order |
| `misleading_inspected` | 1 if any panel marked misleading was opened |
| `contradicts_ai_inspected` | 1 if any panel pointing against the AI's verdict was opened (any time) |
| `contradicts_ai_inspected_after_ai` | 1 if such a panel was on screen at any point after the AI appeared (opened after, or still open when it appeared) |
| `dwell_{panel}_ms` | Total time that panel was open, excluding time the browser tab was hidden. It includes time the open panel sat scrolled out of view, for example while the participant answered below |
| `seen_{panel}_ms` | Total time that panel was open and in view: half of it, or half the window's height of it, on screen, with the tab visible. Blank for trials recorded before October 2026 |

## Behavior and context

| Column | Meaning |
|---|---|
| `trial_ms` | Trial duration from TraceLab |
| `mouse_path_px`, `idle_ms` | Pointer path length; time with the pointer still for >500 ms (pointer stillness only, not reading time) |
| `hidden_ms` | Time the tab was hidden during the trial |
| `first_interaction_ms` | Time from the item appearing to the first input of any kind |
| `no_input_ms`, `longest_no_input_ms` | Total and longest stretch of 2 s or more with no input at all (pointer, key, scroll, typing), counting the start and end of the item. Unlike `idle_ms`, a participant who types without moving the pointer is not idle |
| `clicks`, `pointer_type` | Clicks or taps; the pointer used for most presses (`mouse`, `touch`, `pen`) |
| `scroll_px` | Distance scrolled on the page and in scrollable panels together (TraceLab 0.1.0 counted the page only) |
| `window_blurs` | Times the browser window lost focus. Blank for TraceLab 0.1.0 records, which also counted every time the participant left a form field |
| `keystrokes`, `deletions`, `paste_count` | Keys pressed, Backspace/Delete presses, paste actions. Which keys were pressed is never recorded |
| `key_interval_cv` | Variation of between-key times (standard deviation / mean). People type unevenly; near 0 means software typing at a fixed rate |
| `scripted_events` | Input events made by a script during the trial: pointer, key or typing events the browser marks untrusted, and clicks with no real press or key in the second before. The lab's own pages never create these. Blank before TraceLab 0.3.0 |
| `key_interval_ms`, `key_hold_ms`, `typing_pauses` | Median time between typing keys (pauses of 2 s or more left out), median time a key was held, and the number of such pauses |
| `trace_version` | TraceLab version that recorded the measures; `0.1.0` = before the October 2026 revision; `0.3.0` added `scripted_events` and `key_interval_cv`; `0.3.1` added `save_retries` |
| `save_retries` | Times saving the trial failed and was tried again; the trial went on with everything recorded. Blank before TraceLab 0.3.1 |
| `raw_events`, `raw_events_sent` | Raw events stored and sent. A very long log keeps every event but thins pointer moves; 0 stored means the log was too large to keep |
| `views` | Times the trial screen was shown (more than 1 means the page was reloaded mid-trial) |
| `viewport_w`, `viewport_h` | Browser window size at submission |
| `received_at` | Server time the answer arrived |
| `session_started_at`, `session_completed_at` | Session start and completion (server time) |
| `days_since_prev_session` | Days between finishing the previous session and starting this one |

Device details (touch, screen size, user agent) are in the full JSON export, on the first trial of each session (`records[].data.device`). Session start/completion times and per-trial view counts are on each participant (`participants[].sessions.{n}`).

## Surveys CSV

`code`, `condition`, `test`, `label`, `self_signup`, `session`, `survey` (`pre` = start of session, `post` = end of session), `content_version`, `received_at`, then one column per question variable name. Scale answers are the point number as shown (the first point is the question's `start`, 1 unless set, for example 0 for a 0 to 10 scale). A question variable that would collide with one of these columns is exported as `q_{name}`. Blank = skipped (survey questions are not forced unless marked required).

- `ed_{name}`: embedded data captured when the session started, one column per field the study declares (a URL parameter such as `PROLIFIC_PID` gives `ed_prolific_pid`; a constant gives its value). Blank = the parameter was not in the link.
- Descriptive text questions (`info`) have no answer and no column.
- Blank also means the question was hidden by its display logic for that participant (the server drops answers to hidden questions). A blank cannot tell "hidden" from "skipped" by itself; the rule is in the study content (`displayIf`).
- Select-all (`multi`) answers list the ticked option values joined with `|`. A question imported from another system keeps that system's option codes (Qualtrics recode values, REDCap and LimeSurvey codes) as the values. A rating scale is numbered from its `start` (1 unless the question sets another first number; an imported 0 to 10 scale exports as 0 to 10).
- Imported matrix questions are one column per row, named `<base>_<row>`.

## Vignettes studies

Trials CSV columns after `trial_index` (the generic identifier, behavior, and context columns above also apply):

| Column | Meaning |
|---|---|
| `item_id`, `item_title` | Item as defined on the admin page (Items tab) |
| `item_kind` | `text` or `email` |
| `item_variant` | Condition whose wording was shown; blank = the base wording |
| `rt_ms` | Time from the item appearing to submitting |
| `first_answer_ms`, `answer_changes` | Time to the first answer; number of answer changes (from TraceLab) |
| `link_hovers`, `link_hover_ms`, `link_clicks` | Pointer hovers over links in the item, total hover time, and clicks or Enter presses (links do not open). On touch screens a tap also counts as a hover |
| `link_focus` | Keyboard visits to links, the keyboard user's hover (blank before TraceLab 0.2.0) |
| `a_{question}` | Answer to each item question (scale point, option value, 0–100 confidence, or text) |

Per-link detail (`link:<url>` targets) is in the full JSON export under `records[].data.traces.hovers` and `clickTargets`.

## Multimodal studies (media, voice, and conversations)

Trials CSV columns after `trial_index` (the generic identifier, behavior, and context columns above also apply). Blank means "does not apply to this item".

| Column | Meaning |
|---|---|
| `item_id`, `item_title`, `item_kind` | Item as defined on the admin page; kind is `text`, `image`, `audio`, `video`, or `call` |
| `item_variant` | Arm whose version of the item was shown; blank = the base version |
| `block` | Block number within the session (blocks run in order; items may be shuffled within a block) |
| `call_intent` | For calls: `attack` or `benign` (set by the researcher; never shown to participants) |
| `rt_ms`, `first_answer_ms`, `answer_changes` | Time on the item; time to the first answer; number of answer changes |
| `decision`, `decision_ms` | The decision (option value) and the time from the item appearing to the decision |
| `decision_changes` | Times the decision was changed (plain layout only; with mouse tracking the first answer is final) |
| `mt_mad`, `mt_auc` | Mouse tracking: maximum deviation from the straight start-to-answer line, and the area between the path and that line, both scaled by the line's length (positive = pulled toward the other answers) |
| `mt_xflips`, `mt_init_ms`, `mt_move_ms` | Horizontal direction changes; time from Start to the first movement; time from that movement to the answer |
| `media_plays`, `media_heard_pct`, `media_first_play_ms`, `media_transcript` | Clip plays, furthest point heard (%), time to the first play, and whether the transcript was opened (1/0) |
| `mt_input` | How the mouse-tracked answer was given: `mouse`, `pen`, `touch` or `keyboard`. The `mt_` measures are blank for keyboard and touch answers, which have no pointer path (before October 2026 they read as perfectly straight paths) |
| `media_pauses`, `media_ended_ms`, `media_error` | Pauses before the clip's end; time from the item appearing to the clip ending; 1 if the clip could not load or play (the participant could still answer) |
| `call_ring_ms` | Time the phone rang before it was answered or declined |
| `live_final_ms`, `live_final_clip_ms` | Live clips: time of the final answer (the last change) from the item start, and the clip position then. On live clips `decision_ms` is the first answer; the other `live_*` columns are in the study's codebook |
| `call_answered`, `call_outcome`, `call_final_state` | Whether the call was answered; how it ended (`disclosed` digits to an attacker, `complied`, `completed` a legitimate request, `verified` by insisting on calling back, `refused`, `resisted`, `not_completed`, `declined`, `missed`, `hung_up`, `max_turns`); the caller's last step |
| `call_turns`, `call_digits_disclosed`, `call_verifies`, `call_refusals` | Participant turns; the longest run of digits said; requests to verify or call back; refusals |
| `call_callbacks`, `call_callback_resolved` | Calls made from the directory after the call; whether one reached the organization's real number (1/0) |
| `call_duration_ms`, `call_hold_ms`, `call_median_latency_ms` | Call length, time on hold, and the median time from the participant's turn to the caller starting to speak |
| `call_llm_turns`, `call_typed_turns`, `call_interruptions`, `call_captions`, `call_directory_opened` | Caller lines rephrased by the AI; participant turns typed rather than spoken; times the participant talked over the caller; captions turned on (1/0); directory opened (1/0) |
| `voice_recorded`, `voice_ms`, `voice_typed` | Spoken answer recorded (1/0), its length, or the typed answer when not recorded |
| `a_{question}` | Answer to each item question asked about this item |

The full mouse path (`[x, y, ms]` points) is in the full JSON export under `records[].data.trajectory`.

**Call transcripts CSV** (Recordings & calls tab): one row per turn: `code`, `session`, `trial_index`, `turn`, `event` (`answer`, `say`, `hold`, `resume`, `hangup`, `decline`, `timeout`), `participant_said` (numbers, emails, and street addresses replaced before saving), `participant_intent` (`comply`, `verify`, `refuse`, `question`, `hold`, `other`, `silence`), `digits_said`, `caller_state`, `caller_said`, `caller_source` (`script`, `llm`, or `recorded`), `llm_error`, `server_ms`, `latency_ms`, `asr` (1 = spoken, 0 = typed), `call_done`, `call_outcome`, `at`.

**Recordings** (managers and owners): one audio file per call or spoken answer, named `<code>_s<session>_<item>_<call|voice>`. Recorded only with the participant's recording consent; never copied to the backup store.

## Raw events CSV (one row per event)

From the admin's **Raw events as CSV**. Every TraceLab event of every trial, in order.

| Column | Meaning |
|---|---|
| `code`, `session`, `trial_index` | Participant and trial |
| `t_ms` | Time from the start of the trial (its `item_begin` event), in ms |
| `type` | The event: `move`, `down`, `click`, `hover_in`, `hover_out`, `scroll`, `wheel`, `key_down`, `key_up`, `input`, `focus_in`, `focus_out`, `paste`, `copy`, `cut`, `hidden`, `visible`, `window_blur`, `window_focus`, `resize`, `media_*`, `answer`, `scripted`, `item_begin`, `item_end`, `item_reopen` |
| `target` | What the event was on: a `data-trace` name (`link:<url>`, a panel, a question) or an element id |
| `x`, `y` | Pointer position in the participant's window (CSS pixels) |
| `pointer` | `mouse`, `touch` or `pen` |
| `key` | Key category only (`char`, `space`, `backspace`, `delete`, `enter`, `arrow`, `modifier`, `tab`, `other`); never the key |
| `field`, `value` | For `answer` events: the answer and its value at that moment |
| `ms` | A duration the event carries: hover dwell, key hold, or time in a form field |
| `details` | Anything else the event carries, as JSON (for example the scroll position, the media position, the device at `start`) |

## Reaction-time studies (Stroop, flanker)

| Column | Meaning |
|---|---|
| `paradigm`, `practice`, `target`, `distractor`, `congruent` | The task and the trial's stimulus |
| `response`, `response_key`, `response_via` | The answer, the key pressed (blank for a tap), and `key` or `tap` |
| `correct`, `rt_ms`, `timed_out` | Scored answer; time from the stimulus's first display frame to the key press or the finger landing on the button. Do not subtract `onset_delay_ms`: `rt_ms` already starts at the stimulus frame |
| `early_presses` | Answer keys pressed or buttons touched during the fixation cross (anticipations) |
| `other_keys` | Keys pressed after the stimulus that are not answer keys |
| `hidden_at_stimulus` | 1 if the tab was hidden when the stimulus was due. A hidden tab draws no frames, so the trial times out; exclude these rather than treating them as slow answers |

Taps were timed on release (`click`) before October 2026 and on touch-down since, so tap times from before then run longer by the time the finger stayed down; `trace_version` 0.1.0 marks those records.

## Question types and survey pages (all studies)

| Type | Participant sees | Saved in the CSV cell |
|---|---|---|
| `scale` | Rating points, each labeled | The point number (1 is the first label) |
| `choice`, `select` | One option | The option's saved value |
| `multi` | Checkboxes, "select all that apply" | Ticked options' saved values joined with `\|`; empty if none |
| `number` | A box for a typed number | The number exactly as entered (commas removed), with no range check, so an impossible age is still recorded |
| `confidence` | A 0 to 100 line | 0 to 100 |
| `text` | A text box | The text |
| `slider` | A line over any range with no starting handle | The number chosen (on the step grid); empty if never touched |
| `rank` | Options put in order with Up and Down buttons | Every option's saved value in rank order, joined with `\|` (first = ranked highest); empty if never ordered or confirmed |
| `matrix` | Several statements with the same answer options | One column per statement (its own variable name): the option's saved value |

A survey question can have a `page` number: questions with the same number appear together, pages in ascending order (blank = page 1). Answers are saved when the last page is finished; reloading the tab keeps earlier pages' answers on that device.

## Data-quality survey (study `data-quality`)

One session, one start-of-session survey, no items. The surveys CSV has a `pre` row with every answer below and an empty `post` row (filter on `survey == pre`). Source list: SurveyItemsList.docx, from Douglas, Ewell, and Brauer (2023), Brotherton, French, and Pickering (2013), and Chmielewski and Kucker (2020). Every question is optional.

| Columns | Meaning |
|---|---|
| `se_week`, `se_year` | Surveys taken in the past 7 days and past year (typed numbers) |
| `age`, `birth_year` | Age (page 1) and birth year (page 8); compare for the response-inconsistency check |
| `bf_{n,e,o,a,c}_{p,n}{1-5}` | Big Five, 5-point agree scale (1 strongly disagree, 5 strongly agree). Trait: n neuroticism, e extraversion, o openness, a agreeableness, c conscientiousness. After the trait, `p` = positively worded, `n` = negatively worded (reverse-score: 6 minus the answer) |
| `ac_agree` | Attention check inside the personality items: correct answer is 5 (strongly agree) |
| `ac_math` | Attention check "What is 3 x 4?": correct answer is 12 |
| `ac_color` | Attention check on the consent form: correct answer is `Teal` (the consent text must keep the sentence "the color of this study is teal") |
| `test_retest_1`, `test_retest_2` | "The government should invest in green energy", asked 21 questions apart; compare for test-retest reliability |
| `gcb_1` to `gcb_15` | Generic Conspiracist Beliefs, 5-point scale (1 definitely not true, 5 definitely true) |
| `gender`, `transgender`, `ethnicity` (select all), `sexual_orientation`, `income`, `education` | Demographics |
| `political_affiliation` (1 strong Republican to 7 strong Democrat), `party`, `political_social`, `political_economic` (1 very conservative to 5 very liberal) | Political items |
| `dq_low_quality` | Self-reported data quality: `Yes` = "my data should be considered low quality" |
| `final_comments` | Open-ended bot check |
