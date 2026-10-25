"""CCAIR Behavioral Lab: analysis starter (Python)

Reads the two downloads from your study's admin page (Participants tab):
  "Download trials CSV"   one row per trial          ->  <study>_trials_<date>.csv
  "Download wide CSV"     one row per participant    ->  <study>_wide_<date>.csv
Column definitions: the study's codebook (same page) and https://bampel.com/lab/CODEBOOK.md

Run it:  python starter.py <study>_trials_<date>.csv <study>_wide_<date>.csv
Needs:   pandas; the mixed model needs statsmodels  (pip install pandas statsmodels)

This is a starting point, not an analysis plan. Decide (and preregister) your exclusions, outcome, and model.
The R version (starter.R) also fits a logistic mixed model for 0/1 outcomes; statsmodels has no frequentist
equivalent with crossed random effects, so for accuracy use R (lme4::glmer) or a Bayesian model.
"""
import sys

import numpy as np
import pandas as pd

trials_file = sys.argv[1] if len(sys.argv) > 1 else "my-study_trials_2026-10-24.csv"
wide_file = sys.argv[2] if len(sys.argv) > 2 else "my-study_wide_2026-10-24.csv"
include_test = False  # True keeps test and pilot participants (for trying this script on pilot data)
max_dq_flags = 1      # leave out participants with more data-quality flags than this (dq_flags in the wide CSV)

trials = pd.read_csv(trials_file, keep_default_na=False, na_values=[""], low_memory=False)
wide = pd.read_csv(wide_file, keep_default_na=False, na_values=[""], low_memory=False)
print(f"Read {len(trials)} trials and {len(wide)} participants")

# ---- 1. Who is in the analysis ---------------------------------------------------------------
# Test and pilot participants (test = 1) are never real data. Data-quality flags are reasons to look, not proof:
# check flagged participants (the admin's Replay shows what they did) before excluding them.
if not include_test:
    trials = trials[trials["test"] == 0]
    wide = wide[wide["test"] == 0]
if "dq_flags" in wide:
    flagged = wide.loc[wide["dq_flags"].fillna(0) > max_dq_flags, "code"]
    print(f"Participants over {max_dq_flags} data-quality flag(s): {len(flagged)}")
    if len(flagged):
        print(wide.loc[wide["code"].isin(flagged), ["code"] + [c for c in wide if c.startswith("dq_")]].to_string(index=False))
    trials = trials[~trials["code"].isin(flagged)]
if "practice" in trials:  # reaction-time practice trials
    trials = trials[trials["practice"].fillna(0) == 0]
print(f"Analysing {len(trials)} trials from {trials['code'].nunique()} participants")
if trials.empty:
    sys.exit("No trials left. For pilot data, set include_test = True.")
print(trials["condition"].value_counts().to_string())

# ---- 2. Which TraceLab version recorded the behavior measures --------------------------------
# 0.1.0 (before October 2026) counted leaving a form field as a window blur, counted skipped seconds of a clip as
# heard, and timed taps on release; those columns are blank for 0.1.0 rows. Model or filter by version if a study
# spans the change.
if "trace_version" in trials:
    print(trials["trace_version"].value_counts(dropna=False).to_string())

# ---- 3. Outcome and item ---------------------------------------------------------------------
# The response-time column depends on the study type: rt_ms (vignettes, multimodal, reaction), final_rt_ms
# (alert triage), otherwise the time on the trial screen.
outcome = next(c for c in ["rt_ms", "final_rt_ms", "trial_ms"] if c in trials)
item = next((c for c in ["item_id", "alert_id", "target"] if c in trials), None)
print(f"Response time: {outcome}  Item: {item or '(none)'}")
trials = trials.assign(rt=pd.to_numeric(trials[outcome], errors="coerce"))
trials = trials[trials["rt"] > 0].copy()
trials["log_rt"] = np.log(trials["rt"])

# Response times are right-skewed: describe with medians, model on the log scale.
print("\nMedian response time (ms) by condition:")
print(trials.groupby("condition")["rt"].median().to_string())
print("\nTrials per participant:")
print(trials.groupby("code").size().describe().to_string())

# ---- 4. Mixed model: condition, with participants and items as random effects -----------------
# Each participant answers several items, and each item is seen by several participants, so neither trials nor
# participants are independent (Baayen, Davidson & Bates 2008). statsmodels fits crossed random effects as variance
# components inside one all-encompassing group.
if trials["condition"].nunique() < 2:
    print("\nOnly one condition in the data: no condition model.")
else:
    try:
        import statsmodels.formula.api as smf
    except ImportError:
        sys.exit("\nInstall statsmodels for the mixed model: pip install statsmodels")
    trials["all"] = 1
    vc = {"code": "0 + C(code)"}
    if item and trials[item].nunique() > 1:
        vc["item"] = f"0 + C({item})"
    fit = lambda formula: smf.mixedlm(formula, trials, groups="all", vc_formula=vc, re_formula="0").fit(reml=False)
    m = fit("log_rt ~ C(condition)")
    print("\nModel: log(rt) ~ condition + participant + item (random)")
    print(m.summary().tables[1].to_string())
    effects = {k: round(float(np.exp(v)), 3) for k, v in m.fe_params.items() if k != "Intercept"}
    print("Condition effects as ratios of response time:", effects)
    m0 = fit("log_rt ~ 1")
    lr = 2 * (m.llf - m0.llf)
    from scipy.stats import chi2
    df = len(m.fe_params) - len(m0.fe_params)
    print(f"Likelihood-ratio test for condition: chi2({df}) = {lr:.2f}, p = {chi2.sf(lr, df):.4f}")

# ---- 5. Where to go next ---------------------------------------------------------------------
# - Type-specific measures are in the trials CSV (see the codebook): a_<question> answers, decision and mouse
#   tracking (mt_*), evidence inspection (dwell_*_ms, panels_opened_unique), and the behavior traces
#   (first_interaction_ms, no_input_ms, clicks, keystrokes, scroll_px, hidden_ms).
# - Survey answers: "Download surveys CSV"; session-level answers are also in the wide CSV as s<n>_pre_<id>.
# - Every raw event, one row each: "Raw events as CSV" (t_ms from the start of each trial).
