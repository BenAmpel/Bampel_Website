# CCAIR Behavioral Lab: analysis starter (R)
#
# Reads the two downloads from your study's admin page (Participants tab):
#   "Download trials CSV"   one row per trial          ->  <study>_trials_<date>.csv
#   "Download wide CSV"     one row per participant    ->  <study>_wide_<date>.csv
# Column definitions: the study's codebook (same page) and https://bampel.com/lab/CODEBOOK.md
#
# Run it:  Rscript starter.R <study>_trials_<date>.csv <study>_wide_<date>.csv
#     or:  set the two file names below and source("starter.R") in RStudio.
# Needs:   base R; the mixed models need lme4 (install.packages("lme4")).
#
# This is a starting point, not an analysis plan. Decide (and preregister) your exclusions, outcome, and model.

args <- commandArgs(trailingOnly = TRUE)
trials_file <- if (length(args) >= 1) args[1] else "my-study_trials_2026-10-24.csv"
wide_file   <- if (length(args) >= 2) args[2] else "my-study_wide_2026-10-24.csv"
include_test <- FALSE        # TRUE keeps test and pilot participants (for trying this script on pilot data)
max_dq_flags <- 1            # leave out participants with more data-quality flags than this (dq_flags in the wide CSV)

trials <- read.csv(trials_file, stringsAsFactors = FALSE, na.strings = c("", "NA"))
wide   <- read.csv(wide_file,   stringsAsFactors = FALSE, na.strings = c("", "NA"))
cat("Read", nrow(trials), "trials and", nrow(wide), "participants\n")

# ---- 1. Who is in the analysis ---------------------------------------------------------------
# Test and pilot participants (test = 1) are never real data. Data-quality flags are reasons to look, not proof:
# check flagged participants (the admin's Replay shows what they did) before excluding them.
if (!include_test) {
  trials <- trials[trials$test == 0, ]
  wide   <- wide[wide$test == 0, ]
}
if ("dq_flags" %in% names(wide)) {
  flagged <- wide$code[!is.na(wide$dq_flags) & wide$dq_flags > max_dq_flags]
  cat("Participants over", max_dq_flags, "data-quality flag(s):", length(flagged), "\n")
  if (length(flagged)) print(wide[wide$code %in% flagged, c("code", grep("^dq_", names(wide), value = TRUE))])
  trials <- trials[!trials$code %in% flagged, ]
}
if ("practice" %in% names(trials)) trials <- trials[is.na(trials$practice) | trials$practice == 0, ]   # reaction-time practice
cat("Analysing", nrow(trials), "trials from", length(unique(trials$code)), "participants\n")
if (!nrow(trials)) stop("No trials left. For pilot data, set include_test <- TRUE.")
print(table(condition = trials$condition))

# ---- 2. Which TraceLab version recorded the behavior measures --------------------------------
# 0.1.0 (before October 2026) counted leaving a form field as a window blur, counted skipped seconds of a clip as
# heard, and timed taps on release; those columns are blank for 0.1.0 rows. Model or filter by version if a study
# spans the change.
if ("trace_version" %in% names(trials)) print(table(trace_version = trials$trace_version, useNA = "ifany"))

# ---- 3. Outcome and item ---------------------------------------------------------------------
# The response-time column depends on the study type: rt_ms (vignettes, multimodal, reaction), final_rt_ms
# (alert triage), otherwise the time on the trial screen.
outcome <- intersect(c("rt_ms", "final_rt_ms", "trial_ms"), names(trials))[1]
item    <- intersect(c("item_id", "alert_id", "target"), names(trials))[1]
cat("Response time:", outcome, " Item:", if (is.na(item)) "(none)" else item, "\n")
trials$rt <- as.numeric(trials[[outcome]])
trials <- trials[!is.na(trials$rt) & trials$rt > 0, ]

# Response times are right-skewed: describe with medians, model on the log scale.
cat("\nMedian response time (ms) by condition:\n")
print(aggregate(rt ~ condition, data = trials, FUN = median))
cat("\nTrials per participant:\n"); print(summary(as.vector(table(trials$code))))

# ---- 4. Mixed model: condition, with participants and items as random effects -----------------
# Each participant answers several items, and each item is seen by several participants, so neither trials nor
# participants are independent. (1 | code) and (1 | item) model that (Baayen, Davidson & Bates 2008).
conditions <- unique(trials$condition)
if (length(conditions) < 2) {
  cat("\nOnly one condition in the data: no condition model.\n")
} else if (!requireNamespace("lme4", quietly = TRUE)) {
  cat("\nInstall lme4 for the mixed models: install.packages(\"lme4\")\n")
} else {
  trials$condition <- factor(trials$condition)
  re <- if (!is.na(item) && length(unique(trials[[item]])) > 1) paste0(" + (1 | code) + (1 | ", item, ")") else " + (1 | code)"
  f <- as.formula(paste0("log(rt) ~ condition", re))
  m <- lme4::lmer(f, data = trials, REML = FALSE)
  cat("\nModel:", deparse(f), "\n"); print(summary(m)$coefficients)
  cat("Condition effects as ratios of response time:\n"); print(round(exp(lme4::fixef(m)[-1]), 3))
  m0 <- lme4::lmer(update(f, . ~ . - condition), data = trials, REML = FALSE)
  print(anova(m0, m))   # likelihood-ratio test for condition

  # A 0/1 outcome (for example correct in a reaction-time task): logistic mixed model.
  if ("correct" %in% names(trials) && all(trials$correct %in% c(0, 1, NA)) && length(unique(na.omit(trials$correct))) == 2) {
    g <- lme4::glmer(as.formula(paste0("correct ~ condition", re)), data = trials, family = binomial)
    cat("\nAccuracy model (odds ratios):\n"); print(round(exp(lme4::fixef(g)), 3))
  }
}

# ---- 5. Where to go next ---------------------------------------------------------------------
# - Type-specific measures are in the trials CSV (see the codebook): a_<question> answers, decision and mouse
#   tracking (mt_*), evidence inspection (dwell_*_ms, panels_opened_unique), and the behavior traces
#   (first_interaction_ms, no_input_ms, clicks, keystrokes, scroll_px, hidden_ms).
# - Survey answers: "Download surveys CSV"; session-level answers are also in the wide CSV as s<n>_pre_<id>.
# - Every raw event, one row each: "Raw events as CSV" (t_ms from the start of each trial).
