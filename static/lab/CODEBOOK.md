# Verification study: export codebook

Trials CSV: one row per alert answered. Surveys CSV: one row per survey submitted. Times are ISO 8601 UTC; durations are milliseconds. Empty cells mean "not applicable" (for example, AI columns in sessions without the AI).

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
| `dwell_{panel}_ms` | Total time that panel was on screen, excluding time the browser tab was hidden |

## Behavior and context

| Column | Meaning |
|---|---|
| `trial_ms` | Trial duration from TraceLab |
| `mouse_path_px`, `idle_ms` | Pointer path length; time with the pointer still for >500 ms (pointer stillness only, not reading time) |
| `hidden_ms` | Time the tab was hidden during the trial |
| `views` | Times the trial screen was shown (more than 1 means the page was reloaded mid-trial) |
| `viewport_w`, `viewport_h` | Browser window size at submission |
| `received_at` | Server time the answer arrived |
| `session_started_at`, `session_completed_at` | Session start and completion (server time) |
| `days_since_prev_session` | Days between finishing the previous session and starting this one |

Device details (touch, screen size, user agent) are in the full JSON export, on the first trial of each session (`records[].data.device`). Session start/completion times and per-trial view counts are on each participant (`participants[].sessions.{n}`).

## Surveys CSV

`code`, `condition`, `test`, `label`, `self_signup`, `session`, `survey` (`pre` = start of session, `post` = end of session), `content_version`, `received_at`, then one column per question variable name. Scale answers are the point number (1 = left/first). A question variable that would collide with one of these columns is exported as `q_{name}`. Blank = skipped (survey questions are not forced unless marked required).
