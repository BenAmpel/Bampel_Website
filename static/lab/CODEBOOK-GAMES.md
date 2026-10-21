# Codebook: economic games (study type `game`)

Exports of studies of type `game`. Identifiers, test marking, and surveys follow `CODEBOOK.md` ("Identifiers and design", "Surveys CSV"). Times are ISO 8601 UTC, durations are milliseconds, points are the units of the payoff formulas. An empty cell means "not applicable". The CSV cells that a spreadsheet could run as a formula are prefixed with an apostrophe.

## Trials CSV (`export.csv`, or Participants tab)

One row per participant x round x stage. Practice rounds are included (`practice = 1`). A participant who never played (no group formed, failed the understanding check) has one row per round with `played = 0` and no stage.

| Column | Meaning |
|---|---|
| `code`, `condition`, `test`, `label`, `self_signup`, `session` | As in `CODEBOOK.md`. `session` is always 1 |
| `trial_index` | Round position, 0 = first round shown (practice rounds first) |
| `round` | Round number within its kind: 1 to N for paid rounds, 1 to n for practice rounds |
| `practice` | 1 = practice round (never paid) |
| `mode` | `live` or `async`: how this participant played. A live study's participant who took the asynchronous fallback is `async` |
| `played` | 1 = the participant played the round; 0 = not played (see `not_played_reason`) |
| `not_played_reason` | `no_match` (left with the show-up fee after the longest wait) or `comprehension` (failed the understanding check) |
| `role` | The role id (from the game's roles) |
| `cohort`, `group`, `group_id` | Live only. `cohort` is the matching cohort. `group` is the group's index within the cohort in this round (groups are re-formed each round with strangers matching). `group_id` = `<cohort>.r<trial_index>.g<group>`; the same value in the rows of everyone who played together in that round |
| `group_size` | Players in the group |
| `stage`, `step` | The stage id and the step it was collected in (stages marked "at the same time" share a step) |
| `acting` | 1 = this participant makes a decision in this stage. Stages the role does not decide in still have a row, so every participant has the same number of rows per round |
| `d_<decision>` | One column per decision id in the game. The participant's decision in this stage; blank where they did not decide. For a decision stated with the strategy method this is the concrete value that resulted from the earlier move |
| `strategy` | The strategy method's statement: `observed:response` pairs joined with `\|` for a table, `>=t` for a threshold |
| `o_<decision>` | What the others decided in this round for that decision (all stages), values joined with `\|` in group order. For asynchronous play: the partners' concrete decisions. Blank for a decision nobody else makes |
| `auto` | 1 = the decision was made by the server, not the participant (time ran out, the participant had left, or an administrator closed the group). Blank when `acting = 0` |
| `auto_why` | `timeout`, `dropped` (the participant had already been marked as having left), or `admin` |
| `limit_fallback` | 1 = a decision limit formula could not be evaluated for this decision, so the static bounds and default applied (should not happen for saved studies) |
| `rt_ms`, `hidden_ms` | Time from the decision screen appearing to sending, and the time the tab was hidden in between. Blank for automatic decisions |
| `payoff` | The participant's points for the round (same on every stage row of the round). Asynchronous play: blank until the participant has been matched |
| `group_total` | The group's points for the round |
| `in_payment` | 1 = the round counts toward payment: the drawn round with `randomRound`, every non-practice round with `sum` or `mean`; 0 otherwise |
| `cum_payoff` | Cumulative points over non-practice rounds up to and including this round |
| `wait_ms` | Live: time from entering the waiting room to the group being formed (or to the fallback). Repeated on every row of the participant |
| `dropped` | 1 = the participant was marked as having left the game |
| `fallback` | `fee` or `async` if the participant took the waiting-room fallback |
| `external_id` | The embedded-data field `prolific_pid` (URL parameter `PROLIFIC_PID`), if present and well formed |
| `received_at` | When the round record was written by the server |
| `content_version` | Version of the study content the participant's game rules came from |

## Groups CSV (`groups.csv`)

One row per cohort x round x group. A cohort that never started has one row with its status.

| Column | Meaning |
|---|---|
| `cohort`, `slot`, `created_at` | Cohort ID, the matching slot (5-second window), and when it was formed |
| `condition`, `content_version`, `matching`, `groups_in_cohort` | Treatment, rules version, matching rule, and the number of groups in the cohort |
| `status` | `waiting_to_start` (nobody has confirmed all yet), `started`, `abandoned` (not everyone confirmed in time), `closed_before_start` |
| `started_at`, `dropped` | When the game started, and the number of participants marked as having left |
| `round`, `practice`, `trial_index`, `group`, `group_id` | As in the trials CSV |
| `members`, `roles` | The participants' study IDs and their roles, in the same order, joined with `\|` |
| `completed` | 1 = every member's record for the round exists |
| `auto_moves` | Decisions made by the server in the round |
| `group_total`, `payoffs` | The group's points, and each member's points in the order of `members` |
| `closed_by_admin` | 1 = the group was closed by an administrator |

## Payments CSV (`payments.csv`, managers and owner)

One row per participant who consented and started the session. Never contains an email address. Asynchronous matches that are pending are resolved first. Test participants are included with `test = 1`.

| Column | Meaning |
|---|---|
| `participant_id` | Study ID (not the email) |
| `condition`, `test`, `label`, `external_id`, `mode` | As above |
| `completed` | `yes` = played every round and finished the session; `dropped` = marked as having left; `partial` = anything else (no group, failed the understanding check, did not finish, no partners yet) |
| `match_status` | `matched`, `pending` (asynchronous, no partners yet), `no_match` (took the fee fallback), `not_matched` (live, never placed in a group), `not_finished` |
| `paid_round` | The drawn round (1 = first paid round) when the payment method is a random round |
| `points` | The points that count: the paid round's, or the sum or mean of the non-practice rounds. Blank until known |
| `bonus` | `points` x currency per point, never below 0, capped at the study's largest bonus. Rounded to 2 decimals. Blank until known |
| `capped` | 1 = the cap reduced the bonus |
| `show_up_fee`, `total`, `currency`, `payment_method` | The fee, `bonus` + `show_up_fee`, the currency, and the method |

## Prolific bonus CSV (`payments-prolific.csv`)

`participant_id,amount` for Prolific's bulk bonus upload: the external ID (as `participant_id`) and the bonus with two decimals. Included: real participants (`test = 0`) with an external ID and a bonus above zero. Left out: test participants, participants without an external ID, pending matches, and zero bonuses. The Game operations tab shows how many were left out and why before you upload.
