# Summarizes validation runs of analyze_study2.R on simulated exports (simulate_export.R):
#   planted-*_results.csv  recovery: mean estimate against the planted population-averaged value, 90% CI coverage,
#                          and how often each test was supported
#   null-*_results.csv     false positives: how often a test was supported when no arm differs
#
#   Rscript summarize_validation.R <folder>
args <- commandArgs(trailingOnly = TRUE); dir <- if (length(args)) args[1] else "."
# Planted values on the probability scale (approximate population averages of simulate_export.R's main scenario;
# NA where the estimand is on the latent scale or not planted).
truth <- c(
  "H1a cue training lowers false alarms" = -0.075, "H2 template beats instruction" = -0.075,
  "H1b cue training raises calm completion" = 0.05, "H3a structural beats cue training on calm attacks" = -0.082,
  "H4a structural training raises looked-up callbacks" = 0.15, "H3b cue training no better than placebo on calm attacks" = -0.03,
  "H4b structural training does not lower legitimate completion" = 0.10, "S1 outage removes structural training's protection" = 0.04,
  "S2 locking shrinks cue training's false-alarm reduction" = 0.05, "S3a template training's reduction is larger on calm legitimate clips" = 0,
  "S3b template training raises disclosure to calm attackers" = 0.05, "S4a cue training raises the surface weight" = 0,
  "S4b template training lowers the surface weight" = 0, "S4c structural training raises the structure weight" = NA, "S5 complacency (two-sided)" = NA)
read_all <- function(prefix) {
  f <- list.files(dir, pattern = paste0("^", prefix, "-.*_results\\.csv$"), full.names = TRUE)
  if (!length(f)) return(NULL)
  do.call(rbind, lapply(f, read.csv))
}
pl <- read_all("planted"); nu <- read_all("null")
if (!is.null(pl)) {
  s <- do.call(rbind, lapply(split(pl, factor(pl$test, levels = unique(pl$test))), function(x) {
    t <- truth[x$test[1]]
    data.frame(test = x$test[1], runs = nrow(x), planted = t, mean_est = mean(x$estimate), sd_est = sd(x$estimate),
               ci90_covers = if (is.na(t)) NA else mean(x$ci90_lo <= t & t <= x$ci90_hi), supported = mean(x$supported))
  }))
  cat("Recovery (planted effects)\n"); print(transform(s, mean_est = round(mean_est, 3), sd_est = round(sd_est, 3)), row.names = FALSE)
}
if (!is.null(nu)) {
  n <- do.call(rbind, lapply(split(nu, factor(nu$test, levels = unique(nu$test))), function(x)
    data.frame(test = x$test[1], family = x$family[1], runs = nrow(x), supported = mean(x$supported), mean_est = round(mean(x$estimate), 3))))
  cat("\nFalse positives (no effects; S5's selection effect is expected to stay)\n"); print(n, row.names = FALSE)
}
